use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

use crate::{
    database::with_db,
    logging::log,
    services::note_service::update_note_in_database,
    utilities::file_safety::{create_versioned_backup, BackupType},
    utilities::fs_meta::file_modified_secs,
};
use std::sync::atomic::{AtomicU32, Ordering};

struct DebouncedWatcher {
    pending_events: Arc<Mutex<HashMap<PathBuf, Instant>>>,
    debounce_duration: Duration,
    cleanup_counter: AtomicU32,
}

impl DebouncedWatcher {
    fn new(debounce_ms: u64) -> Self {
        Self {
            pending_events: Arc::new(Mutex::new(HashMap::new())),
            debounce_duration: Duration::from_millis(debounce_ms),
            cleanup_counter: AtomicU32::new(0),
        }
    }

    fn should_process_event(&self, path: &PathBuf) -> bool {
        let now = Instant::now();
        let mut pending = match self.pending_events.lock() {
            Ok(pending) => pending,
            Err(e) => {
                log(
                    "WATCHER_ERROR",
                    "Watcher lock poisoned, recovering",
                    Some(&e.to_string()),
                );
                e.into_inner()
            }
        };

        if let Some(last_event) = pending.get(path) {
            if now.duration_since(*last_event) < self.debounce_duration {
                return false;
            }
        }

        pending.insert(path.clone(), now);
        true
    }

    fn cleanup_old_events(&self) {
        let now = Instant::now();
        let mut pending = match self.pending_events.lock() {
            Ok(pending) => pending,
            Err(e) => {
                log(
                    "WATCHER_ERROR",
                    "Watcher cleanup lock poisoned, recovering",
                    Some(&e.to_string()),
                );
                e.into_inner()
            }
        };

        let cleanup_threshold = self.debounce_duration * 10;
        pending.retain(|_, &mut last_event| now.duration_since(last_event) < cleanup_threshold);
    }
}

pub fn setup_notes_watcher(
    app_handle: AppHandle,
    app_state: Arc<crate::core::state::AppState>,
) -> Result<(), Box<dyn std::error::Error>> {
    let canonical_notes_dir = setup_canonical_notes_directory(&app_state.notes_dir())?;
    let debounced_watcher = Arc::new(DebouncedWatcher::new(500));
    let (mut watcher, rx) = create_watcher_and_channel()?;

    watcher.watch(&canonical_notes_dir, RecursiveMode::Recursive)?;
    log("WATCHER_SETUP", "File watcher started successfully", None);

    spawn_watcher_event_loop(
        app_handle,
        app_state,
        debounced_watcher,
        canonical_notes_dir,
        rx,
        watcher,
    );

    Ok(())
}

fn setup_canonical_notes_directory(
    notes_dir: &std::path::Path,
) -> Result<PathBuf, Box<dyn std::error::Error>> {
    std::fs::create_dir_all(notes_dir)?;

    let canonical_notes_dir = notes_dir.canonicalize().map_err(|e| {
        log(
            "WATCHER_ERROR",
            &format!("Failed to resolve notes directory symlinks: {}", e),
            Some(&notes_dir.display().to_string()),
        );
        e
    })?;

    if !canonical_notes_dir.exists() || !canonical_notes_dir.is_dir() {
        return Err(format!(
            "Canonical notes directory is invalid: {}",
            canonical_notes_dir.display()
        )
        .into());
    }

    log(
        "WATCHER_SETUP",
        &format!(
            "Setting up file watcher - Original: {}, Canonical: {}",
            notes_dir.display(),
            canonical_notes_dir.display()
        ),
        None,
    );

    Ok(canonical_notes_dir)
}

fn spawn_watcher_event_loop(
    app_handle: AppHandle,
    app_state: Arc<crate::core::state::AppState>,
    debounced_watcher: Arc<DebouncedWatcher>,
    canonical_notes_dir: PathBuf,
    rx: mpsc::Receiver<Event>,
    watcher: RecommendedWatcher,
) {
    let app_handle_clone = app_handle.clone();
    let debounced_watcher_clone = debounced_watcher.clone();
    let app_state_clone = app_state.clone();
    let canonical_notes_dir_for_processing = canonical_notes_dir.clone();

    thread::spawn(move || {
        let _watcher = watcher;

        for event in rx {
            match event.kind {
                EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
                    if involves_note_files(&event) =>
                {
                    handle_file_system_event(
                        &event,
                        &app_state_clone,
                        &debounced_watcher_clone,
                        &app_handle_clone,
                        &canonical_notes_dir_for_processing,
                    );
                }
                _ => {}
            }

            handle_periodic_cleanup(&debounced_watcher_clone);
        }
    });
}

fn handle_file_system_event(
    event: &Event,
    app_state: &Arc<crate::core::state::AppState>,
    debounced_watcher: &Arc<DebouncedWatcher>,
    app_handle: &AppHandle,
    canonical_notes_dir: &Path,
) {
    #[cfg(debug_assertions)]
    log(
        "WATCHER_EVENT",
        &format!("File event: {:?} | Paths: {:?}", event.kind, event.paths),
        None,
    );

    // Drop only the paths whose current on-disk state is exactly what this app
    // just wrote. Paths we did not touch are always processed, even while one of
    // our own writes is in flight.
    let external_paths: Vec<&PathBuf> = event
        .paths
        .iter()
        .filter(|path| !app_state.self_writes.is_own_write(path))
        .collect();

    #[cfg(debug_assertions)]
    if external_paths.len() < event.paths.len() {
        log(
            "WATCHER_EVENT",
            "⏸️  Skipping paths written by this app",
            None,
        );
    }

    if external_paths.is_empty() {
        return;
    }

    let should_process = external_paths
        .iter()
        .any(|path| debounced_watcher.should_process_event(path));

    #[cfg(debug_assertions)]
    log(
        "WATCHER_EVENT",
        if should_process {
            "✅ Processing event"
        } else {
            "⏭️  Skipping - debounced"
        },
        None,
    );

    if should_process {
        let paths: Vec<PathBuf> = external_paths.into_iter().cloned().collect();
        process_file_event_async(&paths, app_handle, app_state, canonical_notes_dir);
    }
}

fn process_file_event_async(
    paths: &[PathBuf],
    app_handle: &AppHandle,
    app_state: &Arc<crate::core::state::AppState>,
    canonical_notes_dir: &Path,
) {
    let app_handle_for_refresh = app_handle.clone();
    let paths_to_update = paths.to_vec();
    let app_state_for_task = app_state.clone();
    let canonical_dir = canonical_notes_dir.to_path_buf();

    tauri::async_runtime::spawn(async move {
        #[cfg(debug_assertions)]
        log(
            "WATCHER_PROCESS",
            &format!("🔄 Processing {} file paths", paths_to_update.len()),
            None,
        );

        process_file_paths(&paths_to_update, &canonical_dir, &app_state_for_task);
        emit_cache_refresh_notification(&app_handle_for_refresh);
    });
}

fn create_watcher_and_channel(
) -> Result<(RecommendedWatcher, mpsc::Receiver<Event>), Box<dyn std::error::Error>> {
    let (tx, rx) = mpsc::channel();

    let watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                let _ = tx.send(event);
            }
        },
        Config::default(),
    )?;

    Ok((watcher, rx))
}

fn involves_note_files(event: &Event) -> bool {
    event.paths.iter().any(|path| {
        path.extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| matches!(ext, "md" | "txt" | "markdown"))
            .unwrap_or(false)
    })
}

fn should_ignore_file(filename: &str) -> bool {
    filename.contains("/.") || filename.starts_with('.')
}

fn create_backup_if_content_changed(
    path: &Path,
    filename: &str,
    new_content: &str,
    app_state: &Arc<crate::core::state::AppState>,
) {
    with_db(app_state, |conn| {
        let mut stmt = conn.prepare("SELECT content FROM notes WHERE filename = ?1")?;
        if let Ok(old_content) =
            stmt.query_row(rusqlite::params![filename], |row| row.get::<_, String>(0))
        {
            if old_content != new_content {
                match create_versioned_backup(
                    &app_state.notes_dir(),
                    path,
                    BackupType::ExternalChange,
                    Some(&old_content),
                ) {
                    Ok(backup_path) => {
                        log(
                            "FILE_BACKUP",
                            "Created external change backup",
                            Some(&backup_path.display().to_string()),
                        );
                    }
                    Err(e) => {
                        log(
                            "FILE_BACKUP",
                            &format!("Failed to create external change backup for {}", filename),
                            Some(&e.to_string()),
                        );
                    }
                }
            }
        }
        Ok(())
    })
    .unwrap_or_else(|e| {
        log(
            "FILE_BACKUP",
            "Failed to check for existing content before external change backup",
            Some(&e.to_string()),
        );
    });
}

fn process_existing_file(
    path: &PathBuf,
    filename: &str,
    app_state: &Arc<crate::core::state::AppState>,
) {
    let modified = file_modified_secs(path);

    if let Ok(content) = std::fs::read_to_string(path) {
        create_backup_if_content_changed(path, filename, &content, app_state);

        if let Err(e) = update_note_in_database(app_state, filename, &content, modified) {
            log(
                "DATABASE_UPDATE",
                &format!("Failed to update note {}", filename),
                Some(&e.to_string()),
            );
        }
    }
}

fn process_deleted_file(filename: &str, app_state: &Arc<crate::core::state::AppState>) {
    if let Err(e) = crate::database::with_db(app_state, |conn| {
        conn.execute(
            "DELETE FROM notes WHERE filename = ?1",
            rusqlite::params![filename],
        )
        .map_err(|e| format!("Database error: {}", e))?;
        Ok(())
    }) {
        log(
            "DATABASE_DELETE",
            &format!("Failed to delete note {}", filename),
            Some(&e.to_string()),
        );
    }
}

fn emit_cache_refresh_notification(app_handle: &AppHandle) {
    if let Err(e) = app_handle.emit("cache-refreshed", ()) {
        log(
            "UI_EVENT",
            "Failed to emit cache-refreshed event",
            Some(&e.to_string()),
        );
    }
}

fn process_file_paths(
    paths: &[PathBuf],
    canonical_notes_dir: &Path,
    app_state: &Arc<crate::core::state::AppState>,
) {
    for path in paths {
        match path.strip_prefix(canonical_notes_dir) {
            Ok(relative) => {
                let filename = relative.to_string_lossy().to_string();

                if should_ignore_file(&filename) {
                    continue;
                }

                if path.exists() {
                    process_existing_file(path, &filename, app_state);
                } else {
                    process_deleted_file(&filename, app_state);
                }
            }
            Err(_) => {
                #[cfg(debug_assertions)]
                log(
                    "WATCHER_PATH",
                    &format!(
                        "Received event for path outside notes directory: {}",
                        path.display()
                    ),
                    None,
                );
            }
        }
    }
}

fn handle_periodic_cleanup(debounced_watcher: &Arc<DebouncedWatcher>) {
    let counter = debounced_watcher
        .cleanup_counter
        .fetch_add(1, Ordering::Relaxed);
    if counter >= 100 {
        debounced_watcher.cleanup_old_events();
        debounced_watcher
            .cleanup_counter
            .store(0, Ordering::Relaxed);
    }
}
