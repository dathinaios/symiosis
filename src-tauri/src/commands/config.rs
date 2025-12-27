use tauri::{AppHandle, Manager};

use crate::logging::log;

use crate::config::{
    get_available_markdown_themes, get_available_ui_themes, load_config_from_content, EditorConfig,
    GeneralConfig, InterfaceConfig, PreferencesConfig, ShortcutsConfig,
};
use crate::core::{AppError, AppResult};
use crate::utilities::paths::get_config_path;
use crate::utilities::validation::validate_config;
use std::fs;

#[tauri::command]
pub fn get_config_content() -> Result<String, String> {
    let config_path = get_config_path();

    match fs::read_to_string(&config_path) {
        Ok(content) => Ok(content),
        Err(_) => Ok(String::new()),
    }
}

#[tauri::command]
pub fn config_exists(app_state: tauri::State<crate::core::state::AppState>) -> bool {
    !app_state
        .was_first_run()
        .load(std::sync::atomic::Ordering::Relaxed)
}

#[tauri::command]
pub fn save_config_content(content: &str) -> Result<(), String> {
    let config_path = get_config_path();

    let config = load_config_from_content(content);

    validate_config(&config).map_err(|e| format!("Configuration validation failed: {}", e))?;

    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    std::fs::write(&config_path, content)
        .map_err(|e| format!("Failed to write config file: {}", e))?;

    log(
        "CONFIG",
        "Config content saved",
        Some(&config_path.display().to_string()),
    );
    Ok(())
}

#[tauri::command]
pub async fn scan_available_themes(app: AppHandle) -> Result<serde_json::Value, String> {
    let mut ui_themes = Vec::new();
    let mut markdown_themes = Vec::new();

    scan_resource_themes(&app, &mut ui_themes, &mut markdown_themes);
    scan_static_themes(&mut ui_themes, &mut markdown_themes);
    apply_theme_fallbacks(&mut ui_themes, &mut markdown_themes);

    ui_themes.sort();
    markdown_themes.sort();

    Ok(serde_json::json!({
        "ui_themes": ui_themes,
        "markdown_themes": markdown_themes
    }))
}

fn scan_resource_themes(
    app: &AppHandle,
    ui_themes: &mut Vec<String>,
    markdown_themes: &mut Vec<String>,
) {
    if let Some(resource_dir) = app.path().resource_dir().ok() {
        scan_ui_themes_in_directory(&resource_dir.join("css/ui-themes"), ui_themes);
        scan_markdown_themes_in_directory(
            &resource_dir.join("css/md_render_themes"),
            markdown_themes,
        );
    }
}

fn scan_static_themes(ui_themes: &mut Vec<String>, markdown_themes: &mut Vec<String>) {
    if ui_themes.is_empty() || markdown_themes.is_empty() {
        let static_ui_path = std::path::Path::new("./static/css/ui-themes");
        let static_md_path = std::path::Path::new("./static/css/md_render_themes");

        if ui_themes.is_empty() {
            scan_ui_themes_in_directory(static_ui_path, ui_themes);
        }

        if markdown_themes.is_empty() {
            scan_markdown_themes_in_directory(static_md_path, markdown_themes);
        }
    }
}

fn scan_ui_themes_in_directory(themes_path: &std::path::Path, ui_themes: &mut Vec<String>) {
    if themes_path.exists() {
        if let Ok(entries) = fs::read_dir(themes_path) {
            for entry in entries.filter_map(|e| e.ok()) {
                if let Some(filename) = entry.file_name().to_str() {
                    if filename.starts_with("ui-") && filename.ends_with(".css") {
                        let theme_name = filename
                            .strip_prefix("ui-")
                            .and_then(|s| s.strip_suffix(".css"))
                            .unwrap_or(filename);
                        ui_themes.push(theme_name.to_string());
                    }
                }
            }
        }
    }
}

fn scan_markdown_themes_in_directory(
    themes_path: &std::path::Path,
    markdown_themes: &mut Vec<String>,
) {
    if themes_path.exists() {
        if let Ok(entries) = fs::read_dir(themes_path) {
            for entry in entries.filter_map(|e| e.ok()) {
                if let Some(filename) = entry.file_name().to_str() {
                    if filename.ends_with(".css") {
                        let theme_name = filename.strip_suffix(".css").unwrap_or(filename);
                        markdown_themes.push(theme_name.to_string());
                    }
                }
            }
        }
    }
}

fn apply_theme_fallbacks(ui_themes: &mut Vec<String>, markdown_themes: &mut Vec<String>) {
    if ui_themes.is_empty() {
        *ui_themes = get_available_ui_themes()
            .iter()
            .map(|s| s.to_string())
            .collect();
    }
    if markdown_themes.is_empty() {
        *markdown_themes = get_available_markdown_themes()
            .iter()
            .map(|s| s.to_string())
            .collect();
    }
}

#[tauri::command]
pub fn get_general_config(app_state: tauri::State<crate::core::state::AppState>) -> GeneralConfig {
    let config = app_state.config.read().unwrap_or_else(|e| e.into_inner());
    config.general.clone()
}

#[tauri::command]
pub fn get_interface_config(
    app_state: tauri::State<crate::core::state::AppState>,
) -> InterfaceConfig {
    let config = app_state.config.read().unwrap_or_else(|e| e.into_inner());
    config.interface.clone()
}

#[tauri::command]
pub fn get_editor_config(app_state: tauri::State<crate::core::state::AppState>) -> EditorConfig {
    let config = app_state.config.read().unwrap_or_else(|e| e.into_inner());
    config.editor.clone()
}

#[tauri::command]
pub fn get_shortcuts_config(
    app_state: tauri::State<crate::core::state::AppState>,
) -> ShortcutsConfig {
    let config = app_state.config.read().unwrap_or_else(|e| e.into_inner());
    config.shortcuts.clone()
}

#[tauri::command]
pub fn get_preferences_config(
    app_state: tauri::State<crate::core::state::AppState>,
) -> PreferencesConfig {
    let config = app_state.config.read().unwrap_or_else(|e| e.into_inner());
    config.preferences.clone()
}

#[tauri::command]
pub fn load_custom_theme_file(path: String) -> AppResult<String> {
    let theme_path = std::path::Path::new(&path);

    if !theme_path.exists() {
        return Err(AppError::FileNotFound(path));
    }

    if !theme_path.is_file() {
        return Err(AppError::InvalidPath(format!(
            "Path is not a file: {}",
            path
        )));
    }

    match theme_path.extension().and_then(|ext| ext.to_str()) {
        Some("css") => {}
        _ => {
            return Err(AppError::InvalidPath(
                "Theme file must have .css extension".to_string(),
            ))
        }
    }

    fs::read_to_string(theme_path)
        .map_err(|e| AppError::FileRead(format!("Failed to read theme file: {}", e)))
}

#[tauri::command]
pub fn validate_theme_path(path: String) -> AppResult<bool> {
    let theme_path = std::path::Path::new(&path);

    if !theme_path.exists() {
        return Ok(false);
    }

    if !theme_path.is_file() {
        return Err(AppError::InvalidPath(
            "Path exists but is not a file".to_string(),
        ));
    }

    match theme_path.extension().and_then(|ext| ext.to_str()) {
        Some("css") => Ok(true),
        _ => Err(AppError::InvalidPath(
            "File must have .css extension".to_string(),
        )),
    }
}
