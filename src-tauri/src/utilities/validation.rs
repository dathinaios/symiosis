use crate::config::{
    get_available_code_themes, get_available_editor_modes, get_available_editor_themes,
    get_available_markdown_themes, get_available_ui_themes, parse_shortcut, AppConfig,
    EditorConfig, GeneralConfig, InterfaceConfig, PreferencesConfig, ShortcutsConfig,
};
use crate::core::{AppError, AppResult};
use crate::logging::log;

pub fn validate_config(config: &AppConfig) -> AppResult<()> {
    validate_notes_directory(&config.notes_directory)?;
    validate_shortcut_format(&config.global_shortcut)?;
    validate_general_config(&config.general)?;
    validate_interface_config(&config.interface)?;
    validate_editor_config(&config.editor)?;
    validate_shortcuts_config(&config.shortcuts)?;
    validate_preferences_config(&config.preferences)?;
    Ok(())
}

pub fn validate_general_config(_general: &GeneralConfig) -> AppResult<()> {
    Ok(())
}

pub fn validate_interface_config(interface: &InterfaceConfig) -> AppResult<()> {
    let valid_themes = get_available_ui_themes();
    if !valid_themes.contains(&interface.ui_theme.as_str()) {
        return Err(AppError::ConfigLoad(format!(
            "Invalid UI theme '{}'. Valid themes: {}",
            interface.ui_theme,
            valid_themes.join(", ")
        )));
    }

    validate_font_size(interface.font_size, "UI font size")?;
    validate_font_size(interface.editor_font_size, "Editor font size")?;

    let valid_markdown_render_themes = get_available_markdown_themes();
    if !valid_markdown_render_themes.contains(&interface.markdown_render_theme.as_str()) {
        return Err(AppError::ConfigLoad(format!(
            "Invalid markdown render theme '{}'. Valid themes: {}",
            interface.markdown_render_theme,
            valid_markdown_render_themes.join(", ")
        )));
    }

    let valid_md_code_themes = get_available_code_themes();
    if !valid_md_code_themes.contains(&interface.md_render_code_theme.as_str()) {
        return Err(AppError::ConfigLoad(format!(
            "Invalid markdown code theme '{}'. Valid themes: {}",
            interface.md_render_code_theme,
            valid_md_code_themes.join(", ")
        )));
    }

    Ok(())
}

pub fn validate_font_size(size: u16, context: &str) -> AppResult<()> {
    if size < 8 || size > 72 {
        return Err(AppError::ConfigLoad(format!(
            "{} must be between 8 and 72 pixels",
            context
        )));
    }
    Ok(())
}

pub fn validate_shortcuts_config(shortcuts: &ShortcutsConfig) -> AppResult<()> {
    validate_basic_shortcut_format(&shortcuts.create_note)?;
    validate_basic_shortcut_format(&shortcuts.rename_note)?;
    validate_basic_shortcut_format(&shortcuts.delete_note)?;
    validate_basic_shortcut_format(&shortcuts.edit_note)?;
    validate_basic_shortcut_format(&shortcuts.save_and_exit)?;
    validate_basic_shortcut_format(&shortcuts.open_external)?;
    validate_basic_shortcut_format(&shortcuts.open_folder)?;
    validate_basic_shortcut_format(&shortcuts.refresh_cache)?;
    validate_basic_shortcut_format(&shortcuts.scroll_up)?;
    validate_basic_shortcut_format(&shortcuts.scroll_down)?;
    validate_basic_shortcut_format(&shortcuts.up)?;
    validate_basic_shortcut_format(&shortcuts.down)?;
    validate_basic_shortcut_format(&shortcuts.navigate_previous)?;
    validate_basic_shortcut_format(&shortcuts.navigate_next)?;
    validate_basic_shortcut_format(&shortcuts.navigate_code_previous)?;
    validate_basic_shortcut_format(&shortcuts.navigate_code_next)?;
    validate_basic_shortcut_format(&shortcuts.navigate_link_previous)?;
    validate_basic_shortcut_format(&shortcuts.navigate_link_next)?;
    validate_basic_shortcut_format(&shortcuts.copy_current_section)?;
    validate_basic_shortcut_format(&shortcuts.open_settings)?;
    validate_basic_shortcut_format(&shortcuts.version_explorer)?;
    validate_basic_shortcut_format(&shortcuts.recently_deleted)?;

    Ok(())
}

pub fn validate_editor_config(editor: &EditorConfig) -> AppResult<()> {
    let valid_modes = get_available_editor_modes();
    if !valid_modes.contains(&editor.mode.as_str()) {
        return Err(AppError::ConfigLoad(format!(
            "Invalid editor mode '{}'. Valid modes: {}",
            editor.mode,
            valid_modes.join(", ")
        )));
    }

    let valid_themes = get_available_editor_themes();
    if !valid_themes.contains(&editor.theme.as_str()) {
        return Err(AppError::ConfigLoad(format!(
            "Invalid editor theme '{}'. Valid themes: {}",
            editor.theme,
            valid_themes.join(", ")
        )));
    }

    if editor.tab_size == 0 || editor.tab_size > 16 {
        return Err(AppError::ConfigLoad(
            "Tab size must be between 1 and 16".to_string(),
        ));
    }

    Ok(())
}

pub fn validate_preferences_config(preferences: &PreferencesConfig) -> AppResult<()> {
    if preferences.max_search_results == 0 {
        return Err(AppError::ConfigLoad(
            "Max search results must be greater than 0".to_string(),
        ));
    }
    if preferences.max_search_results > 10000 {
        return Err(AppError::ConfigLoad(
            "Max search results too large (max: 10000)".to_string(),
        ));
    }
    Ok(())
}

pub fn validate_shortcut_format(shortcut: &str) -> AppResult<()> {
    if shortcut.trim().is_empty() {
        return Err(AppError::ConfigLoad("Shortcut cannot be empty".to_string()));
    }

    if shortcut.contains("++") || shortcut.starts_with('+') || shortcut.ends_with('+') {
        return Err(AppError::ConfigLoad("Invalid shortcut format".to_string()));
    }

    match parse_shortcut(shortcut) {
        Some(_) => Ok(()),
        None => Err(AppError::ConfigLoad(format!(
            "Invalid global shortcut format: '{}'",
            shortcut
        ))),
    }
}

pub fn validate_basic_shortcut_format(shortcut: &str) -> AppResult<()> {
    if shortcut.trim().is_empty() {
        return Err(AppError::ConfigLoad("Shortcut cannot be empty".to_string()));
    }

    if shortcut.contains("++") || shortcut.starts_with('+') || shortcut.ends_with('+') {
        return Err(AppError::ConfigLoad("Invalid shortcut format".to_string()));
    }

    Ok(())
}

pub fn validate_notes_directory(dir: &str) -> AppResult<()> {
    if dir.trim().is_empty() {
        return Err(AppError::ConfigLoad(
            "Notes directory cannot be empty".to_string(),
        ));
    }

    let path = std::path::Path::new(dir);

    let dangerous_paths = [
        "/etc",
        "/root",
        "/sys",
        "/proc",
        "/dev",
        "C:\\Windows",
        "C:\\System32",
        "/System",
        "/Library/System",
    ];

    if dir == "/" || dir == "C:\\" {
        return Err(AppError::ConfigLoad(format!(
            "Cannot use filesystem root as notes directory: {}",
            dir
        )));
    }

    if dir == "/home" || dir == "/Users" || dir == "C:\\Users" {
        return Err(AppError::ConfigLoad(format!(
            "Cannot use broad user directory as notes directory: {}. Use a specific subdirectory instead.",
            dir
        )));
    }

    for dangerous in &dangerous_paths {
        if dir.starts_with(dangerous) {
            return Err(AppError::ConfigLoad(format!(
                "Cannot use system directory: {}",
                dir
            )));
        }
    }

    if !path.is_absolute() {
        log(
            "CONFIG_VALIDATION",
            &format!("Warning: Using relative notes directory: {}", dir),
            None,
        );
    }

    Ok(())
}

pub fn validate_note_name(note_name: &str) -> AppResult<()> {
    // Check for empty name
    if note_name.trim().is_empty() {
        return Err(AppError::InvalidNoteName(
            "Note name cannot be empty".to_string(),
        ));
    }
    // Prevent path traversal attacks
    if std::path::Path::new(note_name)
        .components()
        .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err(AppError::PathTraversal);
    }

    if note_name.contains('\\') {
        return Err(AppError::InvalidNoteName("Invalid note name".to_string()));
    }

    if std::path::Path::new(note_name).is_absolute() {
        return Err(AppError::InvalidNoteName(
            "Absolute paths not allowed".to_string(),
        ));
    }
    // Prevent hidden files and system files
    if note_name.starts_with('.') {
        return Err(AppError::InvalidNoteName(
            "Note name cannot start with a dot".to_string(),
        ));
    }
    // Prevent excessively long names
    if note_name.len() > 255 {
        return Err(AppError::InvalidNoteName("Note name too long".to_string()));
    }
    Ok(())
}
