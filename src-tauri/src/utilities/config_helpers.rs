use crate::logging::log;
use crate::utilities::validation::{
    validate_basic_shortcut_format, validate_font_size, validate_notes_directory,
    validate_shortcut_format,
};
use std::path::PathBuf;
use tauri_plugin_global_shortcut::Shortcut;

use crate::config::{AppConfig, EditorConfig, InterfaceConfig, PreferencesConfig, ShortcutsConfig};
extern crate toml;

pub fn default_max_results() -> usize {
    100
}

pub fn default_global_shortcut() -> String {
    "Ctrl+Shift+N".to_string()
}

pub fn default_window_decorations() -> bool {
    true
}

pub fn get_available_ui_themes() -> Vec<&'static str> {
    vec!["gruvbox-dark", "article", "modern-dark"]
}

pub fn get_available_markdown_themes() -> Vec<&'static str> {
    vec!["modern-dark", "article", "gruvbox-dark"]
}

pub fn parse_shortcut(shortcut_str: &str) -> Option<Shortcut> {
    shortcut_str.parse().ok()
}

pub fn get_config_notes_dir_from_config(notes_directory: &str) -> PathBuf {
    PathBuf::from(notes_directory)
}

pub fn get_available_editor_modes() -> Vec<&'static str> {
    vec!["basic", "vim", "emacs"]
}

pub fn get_available_editor_themes() -> Vec<&'static str> {
    vec![
        "abcdef",
        "abyss",
        "android-studio",
        "andromeda",
        "basic-dark",
        "basic-light",
        "forest",
        "github-dark",
        "github-light",
        "gruvbox-dark",
        "gruvbox-light",
        "material-dark",
        "material-light",
        "monokai",
        "nord",
        "palenight",
        "solarized-dark",
        "solarized-light",
        "tokyo-night-day",
        "tokyo-night-storm",
        "volcano",
        "vscode-dark",
        "vscode-light",
    ]
}

pub fn get_available_code_themes() -> Vec<&'static str> {
    vec![
        "gruvbox-dark-hard",
        "gruvbox-dark-medium",
        "gruvbox-dark-soft",
        "gruvbox-light-hard",
        "gruvbox-light-medium",
        "atom-one-dark",
        "dracula",
        "nord",
        "monokai",
        "github-dark",
        "vs2015",
        "night-owl",
        "tokyo-night-dark",
        "atom-one-light",
        "github",
        "vs",
        "xcode",
        "tokyo-night-light",
    ]
}

pub fn load_config_from_content(content: &str) -> AppConfig {
    match toml::from_str::<AppConfig>(content) {
        Ok(mut config) => {
            sanitize_config(&mut config);
            config
        }
        Err(e) => {
            log(
                "CONFIG_PARSE",
                "Failed to parse config TOML. Using defaults.",
                Some(&e.to_string()),
            );
            AppConfig::default()
        }
    }
}

fn sanitize_config(config: &mut AppConfig) {
    let defaults = AppConfig::default();

    if validate_notes_directory(&config.notes_directory).is_err() {
        log(
            "CONFIG_VALIDATION",
            &format!(
                "Invalid notes_directory '{}'. Using default.",
                config.notes_directory
            ),
            None,
        );
        config.notes_directory = defaults.notes_directory;
    }

    if validate_shortcut_format(&config.global_shortcut).is_err() {
        log(
            "CONFIG_VALIDATION",
            &format!(
                "Invalid global_shortcut '{}'. Using default.",
                config.global_shortcut
            ),
            None,
        );
        config.global_shortcut = defaults.global_shortcut;
    }

    sanitize_interface_config(&mut config.interface, &defaults.interface);
    sanitize_editor_config(&mut config.editor, &defaults.editor);
    sanitize_shortcuts_config(&mut config.shortcuts, &defaults.shortcuts);
    sanitize_preferences_config(&mut config.preferences, &defaults.preferences);
}

fn sanitize_interface_config(config: &mut InterfaceConfig, defaults: &InterfaceConfig) {
    if !get_available_ui_themes().contains(&config.ui_theme.as_str()) {
        log(
            "CONFIG_VALIDATION",
            &format!("Invalid ui_theme '{}'. Using default.", config.ui_theme),
            None,
        );
        config.ui_theme = defaults.ui_theme.clone();
    }

    if !get_available_markdown_themes().contains(&config.markdown_render_theme.as_str()) {
        log(
            "CONFIG_VALIDATION",
            &format!(
                "Invalid markdown_render_theme '{}'. Using default.",
                config.markdown_render_theme
            ),
            None,
        );
        config.markdown_render_theme = defaults.markdown_render_theme.clone();
    }

    if !get_available_code_themes().contains(&config.md_render_code_theme.as_str()) {
        log(
            "CONFIG_VALIDATION",
            &format!(
                "Invalid md_render_code_theme '{}'. Using default.",
                config.md_render_code_theme
            ),
            None,
        );
        config.md_render_code_theme = defaults.md_render_code_theme.clone();
    }

    if validate_font_size(config.font_size, "UI font size").is_err() {
        log(
            "CONFIG_VALIDATION",
            &format!(
                "Invalid font_size {}. Using default {}.",
                config.font_size, defaults.font_size
            ),
            None,
        );
        config.font_size = defaults.font_size;
    }

    if validate_font_size(config.editor_font_size, "Editor font size").is_err() {
        log(
            "CONFIG_VALIDATION",
            &format!(
                "Invalid editor_font_size {}. Using default {}.",
                config.editor_font_size, defaults.editor_font_size
            ),
            None,
        );
        config.editor_font_size = defaults.editor_font_size;
    }
}

fn sanitize_editor_config(config: &mut EditorConfig, defaults: &EditorConfig) {
    if !get_available_editor_modes().contains(&config.mode.as_str()) {
        log(
            "CONFIG_VALIDATION",
            &format!("Invalid editor mode '{}'. Using default.", config.mode),
            None,
        );
        config.mode = defaults.mode.clone();
    }

    if !get_available_editor_themes().contains(&config.theme.as_str()) {
        log(
            "CONFIG_VALIDATION",
            &format!("Invalid editor theme '{}'. Using default.", config.theme),
            None,
        );
        config.theme = defaults.theme.clone();
    }

    if config.tab_size == 0 || config.tab_size > 16 {
        log(
            "CONFIG_VALIDATION",
            &format!(
                "Invalid tab_size {}. Using default {}.",
                config.tab_size, defaults.tab_size
            ),
            None,
        );
        config.tab_size = defaults.tab_size;
    }
}

fn sanitize_shortcuts_config(config: &mut ShortcutsConfig, defaults: &ShortcutsConfig) {
    macro_rules! sanitize_shortcut {
        ($field:ident) => {
            if validate_basic_shortcut_format(&config.$field).is_err() {
                log(
                    "CONFIG_VALIDATION",
                    &format!(
                        "Invalid shortcut '{}' for {}. Using default '{}'.",
                        config.$field,
                        stringify!($field),
                        defaults.$field
                    ),
                    None,
                );
                config.$field = defaults.$field.clone();
            }
        };
    }

    sanitize_shortcut!(create_note);
    sanitize_shortcut!(rename_note);
    sanitize_shortcut!(delete_note);
    sanitize_shortcut!(edit_note);
    sanitize_shortcut!(save_and_exit);
    sanitize_shortcut!(open_external);
    sanitize_shortcut!(open_folder);
    sanitize_shortcut!(refresh_cache);
    sanitize_shortcut!(scroll_up);
    sanitize_shortcut!(scroll_down);
    sanitize_shortcut!(up);
    sanitize_shortcut!(down);
    sanitize_shortcut!(navigate_previous);
    sanitize_shortcut!(navigate_next);
    sanitize_shortcut!(navigate_code_previous);
    sanitize_shortcut!(navigate_code_next);
    sanitize_shortcut!(navigate_link_previous);
    sanitize_shortcut!(navigate_link_next);
    sanitize_shortcut!(copy_current_section);
    sanitize_shortcut!(open_settings);
    sanitize_shortcut!(version_explorer);
    sanitize_shortcut!(recently_deleted);
}

fn sanitize_preferences_config(config: &mut PreferencesConfig, defaults: &PreferencesConfig) {
    if config.max_search_results == 0 || config.max_search_results > 10000 {
        log(
            "CONFIG_VALIDATION",
            &format!(
                "Invalid max_search_results {}. Using default {}.",
                config.max_search_results, defaults.max_search_results
            ),
            None,
        );
        config.max_search_results = defaults.max_search_results;
    }
}
