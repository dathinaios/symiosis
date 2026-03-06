use crate::{
    config::get_config_notes_dir,
    core::{AppError, AppResult},
    logging::log,
    utilities::paths::{get_backup_dir_for_notes_path, get_temp_dir},
};
use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

// How many backup versions we keep
const MAX_BACKUPS: usize = 20;

#[derive(Debug, Clone)]
pub enum BackupType {
    Rollback,       // For safe_write_note rollback protection
    SaveFailure,    // For failed save operations
    Rename,         // For rename operation safety
    Delete,         // For delete operation recovery
    ExternalChange, // For watcher-detected external modifications
}

impl BackupType {
    fn suffix(&self) -> &'static str {
        match self {
            BackupType::Rollback => "rollback",
            BackupType::SaveFailure => "save_failure",
            BackupType::Rename => "rename_backup",
            BackupType::Delete => "delete_backup",
            BackupType::ExternalChange => "external_change",
        }
    }
}

pub fn create_versioned_backup(
    note_path: &PathBuf,
    backup_type: BackupType,
    content_override: Option<&str>,
) -> AppResult<PathBuf> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let note_filename = note_path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| AppError::InvalidPath("Invalid filename".to_string()))?;

    let backup_filename = generate_backup_filename(note_filename, &backup_type, timestamp);

    let mut backup_path = safe_backup_path(note_path)?;
    backup_path.set_file_name(&backup_filename);

    if let Some(backup_parent) = backup_path.parent() {
        fs::create_dir_all(backup_parent)?;
    }

    match content_override {
        Some(content) => {
            fs::write(&backup_path, content)?;
        }
        None => {
            // Copy from existing file - fs::copy is atomic and will fail if source doesn't exist
            // This maintains TOCTOU protection by doing check and action atomically
            fs::copy(note_path, &backup_path).map_err(|e| match e.kind() {
                std::io::ErrorKind::NotFound => AppError::FileNotFound(format!(
                    "Cannot create backup: source file '{}' does not exist",
                    note_path.display()
                )),
                std::io::ErrorKind::PermissionDenied => AppError::FilePermission(format!(
                    "Cannot create backup of '{}': permission denied",
                    note_path.display()
                )),
                _ => AppError::FileRead(format!(
                    "Failed to create backup of '{}': {}",
                    note_path.display(),
                    e
                )),
            })?;
        }
    }

    prune_old_backups(&backup_path, MAX_BACKUPS)?;

    Ok(backup_path)
}

pub fn safe_write_note(note_path: &PathBuf, content: &str) -> AppResult<()> {
    let rollback_backup_path = create_rollback_backup_if_exists(note_path)?;

    let temp_path = match create_temp_file_with_content(content) {
        Ok(path) => path,
        Err(e) => {
            create_save_failure_backup(note_path, content);
            return Err(e);
        }
    };

    perform_atomic_write_with_rollback(
        note_path,
        &temp_path,
        content,
        rollback_backup_path.as_ref(),
    )?;
    verify_written_content(note_path, content)?;
    Ok(())
}

pub fn safe_backup_path(note_path: &PathBuf) -> AppResult<PathBuf> {
    let notes_dir = get_config_notes_dir();
    let backup_dir = get_backup_dir_for_notes_path(&notes_dir)?;

    // Get relative path from notes directory to preserve folder structure
    let relative_path = note_path.strip_prefix(&notes_dir).map_err(|_| {
        AppError::InvalidPath(format!(
            "Note path '{}' is not within configured notes directory '{}'",
            note_path.display(),
            notes_dir.display()
        ))
    })?;

    Ok(backup_dir.join(relative_path))
}

pub fn cleanup_temp_files() -> AppResult<()> {
    let temp_dir = get_temp_dir()?;
    if temp_dir.exists() {
        if let Ok(entries) = fs::read_dir(&temp_dir) {
            for entry in entries.flatten() {
                if entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("write_temp_")
                {
                    if let Err(e) = fs::remove_file(entry.path()) {
                        log(
                            "TEMP_CLEANUP",
                            &format!("Failed to remove temp file: {:?}", entry.path()),
                            Some(&e.to_string()),
                        );
                    }
                }
            }
        }
    }
    Ok(())
}

fn prune_old_backups(latest_backup: &PathBuf, max_backups: usize) -> AppResult<()> {
    let parent = latest_backup.parent().ok_or_else(|| {
        AppError::InvalidPath("Failed to get backup parent directory".to_string())
    })?;

    let filename = latest_backup
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| AppError::InvalidPath("Invalid backup filename".to_string()))?;

    // Extract the base pattern: {base_name}.{suffix}.{timestamp}.md
    // Parse right-to-left so base_name can contain dots (e.g. "my.project.md")
    let without_ext = match filename.strip_suffix(".md") {
        Some(s) => s,
        None => return Ok(()),
    };
    let parts: Vec<&str> = without_ext.rsplitn(3, '.').collect();
    // parts[0] = timestamp, parts[1] = suffix, parts[2] = base_name
    if parts.len() < 3 {
        return Ok(()); // Invalid backup filename format, skip pruning
    }
    let pattern_prefix = format!("{}.{}", parts[2], parts[1]);

    let mut backups: Vec<_> = fs::read_dir(parent)?
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry
                .file_name()
                .to_str()
                .map(|f| f.starts_with(&pattern_prefix) && f.ends_with(".md"))
                .unwrap_or(false)
        })
        .collect();

    backups.sort_by_key(|e| e.file_name());

    if backups.len() > max_backups {
        for old in &backups[..backups.len() - max_backups] {
            if let Err(e) = fs::remove_file(old.path()) {
                log(
                    "BACKUP_CLEANUP",
                    &format!("Failed to remove old backup: {:?}", old.path()),
                    Some(&e.to_string()),
                );
            }
        }
    }

    Ok(())
}

fn generate_backup_filename(
    note_filename: &str,
    backup_type: &BackupType,
    timestamp: u64,
) -> String {
    let base_name = if let Some(stem) = std::path::Path::new(note_filename).file_stem() {
        stem.to_string_lossy()
    } else {
        std::borrow::Cow::from(note_filename)
    };

    format!("{}.{}.{}.md", base_name, backup_type.suffix(), timestamp)
}

fn create_rollback_backup_if_exists(note_path: &PathBuf) -> AppResult<Option<PathBuf>> {
    if note_path.exists() {
        Ok(Some(create_versioned_backup(
            note_path,
            BackupType::Rollback,
            None,
        )?))
    } else {
        Ok(None)
    }
}

fn create_temp_file_with_content(content: &str) -> AppResult<PathBuf> {
    let temp_dir = get_temp_dir()?;
    fs::create_dir_all(&temp_dir)?;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let temp_path = temp_dir.join(format!("write_temp_{}.md", timestamp));

    fs::write(&temp_path, content)
        .map_err(|e| AppError::FileWrite(format!("Failed to write temp file: {}", e)))?;

    Ok(temp_path)
}

fn perform_atomic_write_with_rollback(
    note_path: &PathBuf,
    temp_path: &PathBuf,
    content: &str,
    rollback_backup_path: Option<&PathBuf>,
) -> AppResult<()> {
    if let Err(rename_err) = fs::rename(temp_path, note_path) {
        // fs::rename fails across filesystems (EXDEV). Fall back to copy + delete.
        if fs::copy(temp_path, note_path).is_ok() {
            cleanup_temp_file(temp_path);
            log(
                "FILE_OPERATION",
                &format!(
                    "WRITE: {} | Size: {} bytes | COPY_FALLBACK | SUCCESS",
                    note_path.display(),
                    content.len()
                ),
                None,
            );
            return Ok(());
        }

        log(
            "ATOMIC_WRITE_FAILURE",
            &format!(
                "Rename operation failed: {:?} -> {:?}",
                temp_path, note_path
            ),
            Some(&rename_err.to_string()),
        );

        handle_rename_failure_with_rollback(temp_path, note_path, content, rollback_backup_path)?;
        return Err(AppError::FileWrite(format!(
            "Failed to write file (rollback completed): {}",
            rename_err
        )));
    }

    log(
        "FILE_OPERATION",
        &format!(
            "WRITE: {} | Size: {} bytes | SUCCESS",
            note_path.display(),
            content.len()
        ),
        None,
    );

    Ok(())
}

fn handle_rename_failure_with_rollback(
    temp_path: &PathBuf,
    note_path: &PathBuf,
    content: &str,
    rollback_backup_path: Option<&PathBuf>,
) -> AppResult<()> {
    if let Some(backup_path) = rollback_backup_path {
        match fs::copy(backup_path, note_path) {
            Ok(_bytes_copied) => {
                log(
                    "ROLLBACK_SUCCESS",
                    &format!(
                        "Successfully restored original file from backup: {:?}",
                        note_path
                    ),
                    None,
                );
            }
            Err(rollback_err) => {
                log(
                    "ROLLBACK_CRITICAL_FAILURE",
                    &format!(
                        "CRITICAL: Failed to restore backup after rename failure: {:?} -> {:?}",
                        backup_path, note_path
                    ),
                    Some(&rollback_err.to_string()),
                );
                create_save_failure_backup(note_path, content);
                cleanup_temp_file(temp_path);
                return Err(AppError::FileWrite(
                    "Critical failure: rename failed and rollback failed - original file may be lost".to_string()
                ));
            }
        }
    } else {
        create_save_failure_backup(note_path, content);
    }

    cleanup_temp_file(temp_path);
    Ok(())
}

fn verify_written_content(note_path: &PathBuf, expected_content: &str) -> AppResult<()> {
    let written_content = fs::read_to_string(note_path)
        .map_err(|e| AppError::FileWrite(format!("Failed to verify written content: {}", e)))?;

    if written_content != expected_content {
        let error_msg = format!(
            "Content verification failed for '{}': expected {} bytes, found {} bytes",
            note_path.display(),
            expected_content.len(),
            written_content.len()
        );
        log(
            "FILE_VERIFICATION",
            "Content verification failed",
            Some(&error_msg),
        );
        return Err(AppError::FileWrite(error_msg));
    }

    Ok(())
}

fn cleanup_temp_file(temp_path: &PathBuf) {
    if let Err(cleanup_err) = fs::remove_file(temp_path) {
        log(
            "TEMP_CLEANUP",
            &format!("Failed to remove temp file: {:?}", temp_path),
            Some(&cleanup_err.to_string()),
        );
    }
}

fn create_save_failure_backup(note_path: &PathBuf, content: &str) {
    match create_versioned_backup(note_path, BackupType::SaveFailure, Some(content)) {
        Ok(backup_path) => {
            log(
                "FILE_BACKUP",
                "Created save failure backup",
                Some(&backup_path.display().to_string()),
            );
        }
        Err(e) => {
            log(
                "FILE_BACKUP",
                &format!(
                    "Failed to create save failure backup for '{}'",
                    note_path.display()
                ),
                Some(&e.to_string()),
            );
        }
    }
}
