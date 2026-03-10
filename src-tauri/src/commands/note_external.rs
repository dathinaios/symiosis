use crate::{
    core::{AppError, AppResult},
    utilities::validation::validate_note_name,
};

#[tauri::command]
pub fn open_note_in_editor(
    note_name: &str,
    app_state: tauri::State<crate::core::state::AppState>,
) -> Result<(), String> {
    validate_note_name(note_name)
        .and_then(|_| {
            let config = app_state.config.read().unwrap_or_else(|e| e.into_inner());
            let note_path = std::path::PathBuf::from(&config.notes_directory).join(note_name);
            if !note_path.exists() {
                return Err(AppError::FileNotFound(format!(
                    "Note not found: {}",
                    note_name
                )));
            }

            #[cfg(target_os = "macos")]
            std::process::Command::new("open")
                .arg(&note_path)
                .status()
                .map_err(AppError::from)?;

            #[cfg(target_os = "windows")]
            std::process::Command::new("explorer")
                .arg(&note_path)
                .status()
                .map_err(AppError::from)?;

            #[cfg(target_os = "linux")]
            std::process::Command::new("xdg-open")
                .arg(&note_path)
                .status()
                .map_err(AppError::from)?;

            Ok(())
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_note_folder(
    note_name: &str,
    app_state: tauri::State<crate::core::state::AppState>,
) -> Result<(), String> {
    let result = || -> AppResult<()> {
        validate_note_name(note_name)?;
        let config = app_state.config.read().unwrap_or_else(|e| e.into_inner());
        let note_path = std::path::PathBuf::from(&config.notes_directory).join(note_name);
        if !note_path.exists() {
            return Err(AppError::FileNotFound(format!(
                "Note not found: {}",
                note_name
            )));
        }

        #[cfg(target_os = "macos")]
        std::process::Command::new("open")
            .arg("-R")
            .arg(note_path)
            .status()
            .map_err(AppError::from)?;

        #[cfg(target_os = "windows")]
        {
            let path_str = note_path
                .to_str()
                .ok_or_else(|| AppError::InvalidPath("Invalid path encoding".to_string()))?;
            std::process::Command::new("explorer")
                .arg(format!("/select,\"{}\"", path_str))
                .status()
                .map_err(AppError::from)?;
        }

        #[cfg(target_os = "linux")]
        {
            let folder_path = note_path
                .parent()
                .ok_or_else(|| AppError::InvalidPath("Unable to determine folder".to_string()))?;
            std::process::Command::new("xdg-open")
                .arg(folder_path)
                .status()
                .map_err(AppError::from)?;
        }

        Ok(())
    }();
    result.map_err(|e| e.to_string())
}
