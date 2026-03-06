use crate::{
    config::get_config_notes_dir,
    core::{state::AppState, AppError, AppResult},
    database::with_db,
    logging::log,
};
use rusqlite::{params, Connection};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::PathBuf,
    time::UNIX_EPOCH,
};
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

// Number of most recent notes to get immediate HTML rendering during startup
// Remaining notes get metadata-only and are processed on demand
const IMMEDIATE_RENDER_COUNT: usize = 2000;

pub fn init_db(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch("CREATE VIRTUAL TABLE IF NOT EXISTS notes USING fts5(filename, content, html_render, modified UNINDEXED, is_indexed UNINDEXED);")?;

    let mut stmt = conn.prepare(
        "SELECT filename, COUNT(*) as count FROM notes GROUP BY filename HAVING count > 1",
    )?;
    let duplicate_rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)?))
    })?;

    let duplicates: Result<Vec<_>, _> = duplicate_rows.collect();
    if let Ok(dups) = duplicates {
        if !dups.is_empty() {
            return Err(rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CORRUPT),
                Some(format!(
                    "Database discrepancy detected: {} files have duplicate entries",
                    dups.len()
                )),
            ));
        }
    }

    Ok(())
}

pub fn load_all_notes_into_sqlite(
    app_state: &AppState,
    conn: &mut Connection,
) -> rusqlite::Result<()> {
    load_all_notes_into_sqlite_with_progress(app_state, conn, None)
}

fn ensure_notes_directory_exists() -> rusqlite::Result<()> {
    let notes_dir = get_config_notes_dir();
    if !notes_dir.exists() {
        if let Err(e) = fs::create_dir_all(&notes_dir) {
            log(
                "DIRECTORY_CREATION",
                "Failed to create notes directory",
                Some(&e.to_string()),
            );
            return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(
                std::io::Error::new(
                    std::io::ErrorKind::Other,
                    format!("Failed to create notes directory: {}", e),
                ),
            )));
        }
    }
    Ok(())
}

fn is_note_file(path: &std::path::Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| matches!(ext, "md" | "txt" | "markdown"))
        .unwrap_or(false)
}

fn scan_filesystem_for_notes() -> rusqlite::Result<Vec<(String, PathBuf, i64)>> {
    let notes_dir = get_config_notes_dir();
    let mut filesystem_files = Vec::new();

    for entry in WalkDir::new(&notes_dir).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            let path = entry.path();
            let relative = path.strip_prefix(&notes_dir).unwrap_or(path);
            let filename = relative.to_string_lossy().to_string();

            if filename.contains("/.") || filename.starts_with('.') {
                continue;
            }

            if !is_note_file(path) {
                continue;
            }

            let modified = entry
                .path()
                .metadata()
                .and_then(|m| m.modified())
                .map(|mtime| {
                    mtime
                        .duration_since(UNIX_EPOCH)
                        .map(|d| d.as_secs() as i64)
                        .unwrap_or(0)
                })
                .unwrap_or(0);

            filesystem_files.push((filename, path.to_path_buf(), modified));
        }
    }

    filesystem_files.sort_by(|a, b| b.2.cmp(&a.2));
    Ok(filesystem_files)
}

fn load_existing_database_files(
    conn: &Connection,
) -> rusqlite::Result<HashMap<String, (i64, bool)>> {
    let mut database_files = HashMap::new();
    let mut stmt = conn.prepare("SELECT filename, modified, is_indexed FROM notes")?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, bool>(2).unwrap_or(false),
        ))
    })?;

    for row in rows {
        let (filename, modified, is_indexed) = row?;
        database_files.insert(filename, (modified, is_indexed));
    }

    Ok(database_files)
}

fn sync_database_with_filesystem(
    conn: &mut Connection,
    filesystem_files: &[(String, PathBuf, i64)],
    database_files: &HashMap<String, (i64, bool)>,
    app_handle: Option<&AppHandle>,
) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;

    remove_deleted_files_from_database(&tx, filesystem_files, database_files)?;
    process_filesystem_files(&tx, filesystem_files, database_files, app_handle)?;

    tx.commit()
}

fn remove_deleted_files_from_database(
    tx: &rusqlite::Transaction,
    filesystem_files: &[(String, PathBuf, i64)],
    database_files: &HashMap<String, (i64, bool)>,
) -> rusqlite::Result<()> {
    let filesystem_filenames: HashSet<_> =
        filesystem_files.iter().map(|(name, _, _)| name).collect();

    for filename in database_files.keys() {
        if !filesystem_filenames.contains(filename) {
            tx.execute("DELETE FROM notes WHERE filename = ?1", params![filename])?;
        }
    }

    Ok(())
}

fn process_filesystem_files(
    tx: &rusqlite::Transaction,
    filesystem_files: &[(String, PathBuf, i64)],
    database_files: &HashMap<String, (i64, bool)>,
    app_handle: Option<&AppHandle>,
) -> rusqlite::Result<()> {
    let total_files = filesystem_files.len();

    for (index, (filename, path, fs_modified)) in filesystem_files.iter().enumerate() {
        emit_progress_if_needed(app_handle, index, total_files)?;

        let (db_modified, is_indexed) = database_files.get(filename).copied().unwrap_or((0, false));

        if *fs_modified != db_modified {
            process_modified_file(tx, filename, path, *fs_modified, index)?;
        } else if !is_indexed && index < IMMEDIATE_RENDER_COUNT {
            update_unindexed_file(tx, filename, path)?;
        }
    }

    Ok(())
}

fn emit_progress_if_needed(
    app_handle: Option<&AppHandle>,
    index: usize,
    total_files: usize,
) -> rusqlite::Result<()> {
    if let Some(app) = app_handle {
        if index == 0 || (index + 1) % 10 == 0 || index == total_files - 1 {
            let progress_msg = format!("Loading {} of {} notes...", index + 1, total_files);
            if let Err(e) = app.emit("db-loading-progress", progress_msg) {
                log(
                    "UI_UPDATE",
                    "Failed to emit db-loading-progress event",
                    Some(&e.to_string()),
                );
            }
        }
    }
    Ok(())
}

fn process_modified_file(
    tx: &rusqlite::Transaction,
    filename: &str,
    path: &PathBuf,
    fs_modified: i64,
    index: usize,
) -> rusqlite::Result<()> {
    let Ok(content) = fs::read_to_string(path) else {
        return Ok(());
    };

    if index < IMMEDIATE_RENDER_COUNT {
        let html_render = crate::utilities::note_renderer::render_note(filename, &content);
        tx.execute(
            "INSERT OR REPLACE INTO notes (filename, content, html_render, modified, is_indexed) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![filename, content, html_render, fs_modified, true],
        )?;
    } else {
        tx.execute(
            "INSERT OR REPLACE INTO notes (filename, content, html_render, modified, is_indexed) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![filename, content, "", fs_modified, false],
        )?;
    }

    Ok(())
}

fn update_unindexed_file(
    tx: &rusqlite::Transaction,
    filename: &str,
    path: &PathBuf,
) -> rusqlite::Result<()> {
    let Ok(content) = fs::read_to_string(path) else {
        return Ok(());
    };
    let html_render = crate::utilities::note_renderer::render_note(filename, &content);
    tx.execute(
        "UPDATE notes SET html_render = ?2, is_indexed = ?3 WHERE filename = ?1",
        params![filename, html_render, true],
    )?;
    Ok(())
}

pub fn load_all_notes_into_sqlite_with_progress(
    _app_state: &AppState,
    conn: &mut Connection,
    app_handle: Option<&AppHandle>,
) -> rusqlite::Result<()> {
    ensure_notes_directory_exists()?;
    let filesystem_files = scan_filesystem_for_notes()?;
    let database_files = load_existing_database_files(conn)?;
    sync_database_with_filesystem(conn, &filesystem_files, &database_files, app_handle)
}

pub fn recreate_database(app_state: &AppState) -> AppResult<()> {
    log(
        "DATABASE_RECREATE",
        "Database discrepancy detected - recreating tables",
        None,
    );

    // Acquire exclusive write lock for entire rebuild operation
    let _rebuild_lock = app_state.database_rebuild_lock.write().map_err(|e| {
        AppError::DatabaseConnection(format!("Database rebuild lock poisoned: {}", e))
    })?;

    // Access database manager directly since we hold rebuild lock
    let mut manager = app_state.database_manager.lock().map_err(|e| {
        AppError::DatabaseConnection(format!("Database manager lock poisoned: {}", e))
    })?;

    manager.with_connection_mut(|conn| {
        conn.execute("DROP TABLE IF EXISTS notes", [])?;

        init_db(conn)?;

        load_all_notes_into_sqlite(app_state, conn)?;

        log(
            "DATABASE_RECREATE_SUCCESS",
            "Database recreated and synced from filesystem",
            None,
        );
        Ok(())
    })
}

pub async fn recreate_database_with_progress(
    app_state: &AppState,
    app_handle: &AppHandle,
    reason: &str,
) -> AppResult<()> {
    // Acquire exclusive write lock for entire rebuild operation
    let _rebuild_lock = app_state.database_rebuild_lock.write().map_err(|e| {
        AppError::DatabaseConnection(format!("Database rebuild lock poisoned: {}", e))
    })?;
    log(
        "DATABASE_REBUILD_START",
        "Database rebuild started - all database operations blocked",
        None,
    );

    if let Err(e) = app_handle.emit("db-loading-progress", "Rebuilding notes database...") {
        log(
            "UI_UPDATE",
            "Failed to emit rebuild progress",
            Some(&e.to_string()),
        );
    }
    log("DATABASE_REBUILD_REASON", reason, None);

    // We need to access the database manager directly since we're already holding the rebuild lock
    let rebuild_result = {
        let mut manager = app_state.database_manager.lock().map_err(|e| {
            AppError::DatabaseConnection(format!("Database manager lock poisoned: {}", e))
        })?;

        manager.with_connection_mut(|conn| {
            conn.execute("DROP TABLE IF EXISTS notes", [])?;

            init_db(conn)?;

            if let Err(e) = app_handle.emit("db-loading-progress", "Rendering notes...") {
                log(
                    "UI_UPDATE",
                    "Failed to emit rendering progress",
                    Some(&e.to_string()),
                );
            }

            load_all_notes_into_sqlite(app_state, conn).map_err(|e| e.into())
        })
    };

    // Rebuild lock is automatically released when _rebuild_lock goes out of scope

    match rebuild_result {
        Ok(()) => {
            log(
                "DATABASE_REBUILD_SUCCESS",
                "Database rebuild completed successfully - database operations resumed",
                None,
            );
        }
        Err(ref e) => {
            log(
                "DATABASE_REBUILD_FAILURE",
                "Database rebuild failed - database operations resumed but may be inconsistent",
                Some(&e.to_string()),
            );
        }
    }

    if let Err(e) = app_handle.emit("db-loading-progress", "Notes database ready.") {
        log(
            "UI_UPDATE",
            "Failed to emit completion progress",
            Some(&e.to_string()),
        );
    }

    rebuild_result
}

pub fn quick_filesystem_sync_check(app_state: &AppState) -> AppResult<bool> {
    let notes_dir = get_config_notes_dir();

    if !notes_dir.exists() {
        return Ok(true);
    }

    with_db(app_state, |conn| {
        let mut files: Vec<_> = WalkDir::new(&notes_dir)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .filter(|e| {
                let path = e.path();
                let relative = path.strip_prefix(&notes_dir).unwrap_or(path);
                let filename = relative.to_string_lossy().to_string();

                // Skip hidden files/folders (same logic as main app)
                if filename.contains("/.") || filename.starts_with('.') {
                    return false;
                }

                is_note_file(path)
            })
            .collect();

        if files.is_empty() {
            return Ok(true);
        }

        files.sort_by_key(|e| std::cmp::Reverse(e.metadata().ok().and_then(|m| m.modified().ok())));
        files.truncate(100);

        for entry in files {
            let file_path = entry.path();
            let relative_path = file_path.strip_prefix(&notes_dir).map_err(|e| {
                AppError::InvalidPath(format!("Failed to get relative path: {}", e))
            })?;
            let filename = relative_path.to_string_lossy().to_string();

            let file_content = match std::fs::read_to_string(file_path) {
                Ok(content) => content,
                Err(_) => {
                    log(
                        "FILE_SYNC_CHECK",
                        &format!(
                            "Warning: Could not read file {} during sync check",
                            filename
                        ),
                        None,
                    );
                    continue;
                }
            };

            let file_modified = entry
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);

            let db_result: Result<(String, i64), rusqlite::Error> = conn.query_row(
                "SELECT content, modified FROM notes WHERE filename = ?1",
                params![filename],
                |row| Ok((row.get(0)?, row.get(1)?)),
            );

            match db_result {
                Ok((db_content, db_modified)) => {
                    if db_content != file_content {
                        return Ok(false);
                    }
                    if (db_modified - file_modified).abs() > 1 {
                        return Ok(false);
                    }
                }
                Err(_) => {
                    return Ok(false);
                }
            }
        }

        Ok(true)
    })
}

fn log_fatal_database_error(category: &str, operation: &str, error: &AppError) {
    log(
        category,
        &format!(
            "💥 FATAL: {}. Application will continue with limited functionality.",
            operation
        ),
        Some(&error.to_string()),
    );
}

fn log_database_success(category: &str, message: &str) {
    log(category, &format!("✅ {}", message), None);
}

fn is_new_database() -> bool {
    let db_path = crate::utilities::paths::get_database_path().unwrap_or_default();
    !db_path.exists()
}

fn cleanup_database_if_no_config(app_state: &AppState) -> () {
    if !crate::utilities::paths::get_config_path().exists() {
        if let Err(e) = with_db(app_state, |conn| {
            conn.execute("DELETE FROM notes", []).map_err(|e| e.into())
        }) {
            log(
                "DATABASE_CLEANUP",
                "Failed to purge database. Continuing anyway.",
                Some(&e.to_string()),
            );
        }
    }
}

fn validate_and_sync_filesystem(app_state: &AppState) -> AppResult<()> {
    match quick_filesystem_sync_check(app_state) {
        Ok(true) => {}
        Ok(false) => {
            log(
                "DATABASE_SYNC",
                "🔄 Database-filesystem mismatch detected. Rebuilding database...",
                None,
            );
            if let Err(e) = recreate_database(app_state) {
                log_fatal_database_error("DATABASE_SYNC", "Database rebuild failed", &e);
                return Err(e);
            } else {
                log_database_success(
                    "DATABASE_SYNC",
                    "Database successfully rebuilt from filesystem!",
                );
            }
        }
        Err(e) => {
            log(
                "DATABASE_SYNC",
                "⚠️  Filesystem sync check failed. Continuing without rebuild.",
                Some(&e.to_string()),
            );
        }
    }
    Ok(())
}

fn handle_database_initialization_failure(
    app_state: &AppState,
    e: crate::core::AppError,
) -> AppResult<()> {
    let is_new_db = is_new_database();

    if is_new_db {
        log("DATABASE_INIT", "🔧 Creating new database...", None);
    } else {
        log(
            "DATABASE_INIT",
            "❌ CRITICAL: Database initialization failed",
            Some(&e.to_string()),
        );
        log(
            "DATABASE_RECOVERY",
            "🔄 Attempting automatic database recovery...",
            None,
        );
    }

    if let Err(recovery_error) = recreate_database(app_state) {
        if is_new_db {
            log_fatal_database_error(
                "DATABASE_INIT",
                "Failed to create new database",
                &recovery_error,
            );
        } else {
            log_fatal_database_error(
                "DATABASE_RECOVERY",
                "Database recovery failed",
                &recovery_error,
            );
        }
        return Err(recovery_error);
    } else {
        if is_new_db {
            log_database_success("DATABASE_INIT", "New database created successfully!");
        } else {
            log_database_success("DATABASE_RECOVERY", "Database successfully recovered!");
        }
    }
    Ok(())
}

fn initialize_database_schema(app_state: &AppState) -> AppResult<()> {
    with_db(app_state, |conn| init_db(conn).map_err(|e| e.into()))
}

fn prepare_database_environment() -> () {
    if let Ok(db_path) = crate::utilities::paths::get_database_path() {
        if let Some(parent) = db_path.parent() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                log(
                    "INIT_ERROR",
                    &format!("Failed to create database directory: {:?}", parent),
                    Some(&e.to_string()),
                );
            }
        }
    }

    if let Err(e) = crate::utilities::file_safety::cleanup_temp_files() {
        log(
            "INIT_CLEANUP",
            "Failed to clean up temp files during initialization",
            Some(&e.to_string()),
        );
    }
}

pub fn initialize_application_database(app_state: &AppState) -> AppResult<()> {
    prepare_database_environment();

    let init_result = initialize_database_schema(app_state);

    if let Err(e) = init_result {
        handle_database_initialization_failure(app_state, e)?;
    } else {
        validate_and_sync_filesystem(app_state)?;
    }

    cleanup_database_if_no_config(app_state);

    Ok(())
}

pub fn handle_database_recovery(
    app_state: &crate::core::state::AppState,
    operation_description: &str,
    original_error: &crate::core::AppError,
    success_message: &str,
    failure_message: &str,
) -> AppResult<()> {
    log(
        "DATABASE_RECOVERY",
        &format!(
            "Database operation failed for {}: {}. Rebuilding database...",
            operation_description, original_error
        ),
        None,
    );

    match recreate_database(app_state) {
        Ok(()) => {
            log(
                "DATABASE_RECOVERY",
                "Database successfully rebuilt from files.",
                None,
            );
            Ok(())
        }
        Err(rebuild_error) => {
            log(
                "DATABASE_RECOVERY",
                failure_message,
                Some(&rebuild_error.to_string()),
            );
            Err(AppError::DatabaseRebuild(format!(
                "{}: {}",
                success_message, rebuild_error
            )))
        }
    }
}
