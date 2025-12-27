use crate::logging::log;
use crate::utilities::paths::get_default_notes_dir;
use crate::utilities::validation::{
    validate_basic_shortcut_format, validate_font_size, validate_notes_directory,
    validate_shortcut_format,
};
use std::path::PathBuf;
use tauri_plugin_global_shortcut::Shortcut;

use crate::config::{
    AppConfig, EditorConfig, GeneralConfig, InterfaceConfig, PreferencesConfig, ShortcutsConfig,
};
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
    let toml_value = match toml::from_str::<toml::Value>(content) {
        Ok(value) => value,
        Err(e) => {
            log(
                "CONFIG_PARSE",
                "Failed to parse config TOML. Using defaults.",
                Some(&e.to_string()),
            );
            return AppConfig::default();
        }
    };

    let notes_directory = extract_notes_directory(&toml_value);
    let global_shortcut = extract_global_shortcut(&toml_value);
    let general = extract_general_config(&toml_value);
    let interface = extract_interface_config(&toml_value);
    let editor = extract_editor_config(&toml_value);
    let shortcuts = extract_shortcuts_config(&toml_value);
    let preferences = extract_preferences_config(&toml_value);

    AppConfig {
        notes_directory,
        global_shortcut,
        general,
        interface,
        editor,
        shortcuts,
        preferences,
    }
}

fn extract_notes_directory(value: &toml::Value) -> String {
    match value.get("notes_directory").and_then(|v| v.as_str()) {
        Some(dir) => {
            if let Err(e) = validate_notes_directory(dir) {
                log(
                    "CONFIG_VALIDATION",
                    &format!(
                        "Warning: Invalid notes_directory '{}': {}. Using default.",
                        dir, e
                    ),
                    None,
                );
                get_default_notes_dir()
            } else {
                dir.to_string()
            }
        }
        None => get_default_notes_dir(),
    }
}

fn extract_global_shortcut(value: &toml::Value) -> String {
    match value.get("global_shortcut").and_then(|v| v.as_str()) {
        Some(shortcut) => {
            if let Err(e) = validate_shortcut_format(shortcut) {
                log(
                    "CONFIG_VALIDATION",
                    &format!(
                        "Warning: Invalid global_shortcut '{}': {}. Using default.",
                        shortcut, e
                    ),
                    None,
                );
                default_global_shortcut()
            } else {
                shortcut.to_string()
            }
        }
        None => default_global_shortcut(),
    }
}

fn extract_general_config(value: &toml::Value) -> GeneralConfig {
    let general_section = value.get("general");
    let mut config = GeneralConfig::default();

    if let Some(section) = general_section {
        if let Some(scroll_amount) = section.get("scroll_amount") {
            if let Some(amount) = scroll_amount.as_float() {
                config.scroll_amount = amount;
            }
        }
    }

    config
}

fn extract_interface_config(value: &toml::Value) -> InterfaceConfig {
    let interface_section = value.get("interface");
    let mut config = InterfaceConfig::default();

    if let Some(section) = interface_section {
        extract_theme_configuration(section, &mut config);
        extract_font_configuration(section, &mut config);
        extract_window_configuration(section, &mut config);
    }

    config
}

fn extract_theme_configuration(section: &toml::Value, config: &mut InterfaceConfig) {
    if let Some(theme) = section.get("ui_theme").and_then(|v| v.as_str()) {
        let valid_themes = get_available_ui_themes();
        if valid_themes.contains(&theme) {
            config.ui_theme = theme.to_string();
        } else {
            log(
                "CONFIG_VALIDATION",
                &format!(
                    "Warning: Invalid ui_theme '{}'. Using default '{}'.",
                    theme, config.ui_theme
                ),
                None,
            );
        }
    }

    if let Some(theme) = section
        .get("markdown_render_theme")
        .and_then(|v| v.as_str())
    {
        let valid_themes = get_available_markdown_themes();
        if valid_themes.contains(&theme) {
            config.markdown_render_theme = theme.to_string();
        } else {
            log(
                "CONFIG_VALIDATION",
                &format!(
                    "Invalid markdown_render_theme '{}'. Using default '{}'.",
                    theme, config.markdown_render_theme
                ),
                None,
            );
        }
    }

    if let Some(theme) = section.get("md_render_code_theme").and_then(|v| v.as_str()) {
        let valid_themes = get_available_code_themes();
        if valid_themes.contains(&theme) {
            config.md_render_code_theme = theme.to_string();
        } else {
            log(
                "CONFIG_VALIDATION",
                &format!(
                    "Invalid md_render_code_theme '{}'. Using default '{}'.",
                    theme, config.md_render_code_theme
                ),
                None,
            );
        }
    }
}

fn extract_font_configuration(section: &toml::Value, config: &mut InterfaceConfig) {
    if let Some(font) = section.get("font_family").and_then(|v| v.as_str()) {
        config.font_family = font.to_string();
    }

    if let Some(size) = section.get("font_size").and_then(|v| v.as_integer()) {
        let size = size as u16;
        if validate_font_size(size, "UI font size").is_ok() {
            config.font_size = size;
        } else {
            log(
                "CONFIG_VALIDATION",
                &format!(
                    "Warning: Invalid font_size {}. Using default {}.",
                    size, config.font_size
                ),
                None,
            );
        }
    }

    if let Some(font) = section.get("editor_font_family").and_then(|v| v.as_str()) {
        config.editor_font_family = font.to_string();
    }

    if let Some(size) = section.get("editor_font_size").and_then(|v| v.as_integer()) {
        let size = size as u16;
        if validate_font_size(size, "Editor font size").is_ok() {
            config.editor_font_size = size;
        } else {
            log(
                "CONFIG_VALIDATION",
                &format!(
                    "Warning: Invalid editor_font_size {}. Using default {}.",
                    size, config.editor_font_size
                ),
                None,
            );
        }
    }
}

fn extract_window_configuration(section: &toml::Value, config: &mut InterfaceConfig) {
    if let Some(always_top) = section.get("always_on_top").and_then(|v| v.as_bool()) {
        config.always_on_top = always_top;
    }

    if let Some(decorations) = section.get("window_decorations").and_then(|v| v.as_bool()) {
        config.window_decorations = decorations;
    }

    if let Some(custom_ui_path) = section.get("custom_ui_theme_path").and_then(|v| v.as_str()) {
        config.custom_ui_theme_path = Some(custom_ui_path.to_string());
    }

    if let Some(custom_md_path) = section
        .get("custom_markdown_theme_path")
        .and_then(|v| v.as_str())
    {
        config.custom_markdown_theme_path = Some(custom_md_path.to_string());
    }
}

fn extract_editor_config(value: &toml::Value) -> EditorConfig {
    let editor_section = value.get("editor");
    let mut config = EditorConfig::default();

    if let Some(section) = editor_section {
        if let Some(mode) = section.get("mode").and_then(|v| v.as_str()) {
            let valid_modes = get_available_editor_modes();
            if valid_modes.contains(&mode) {
                config.mode = mode.to_string();
            } else {
                log(
                    "CONFIG_VALIDATION",
                    &format!(
                        "Invalid editor mode '{}'. Using default '{}'.",
                        mode, config.mode
                    ),
                    None,
                );
            }
        }

        if let Some(theme) = section.get("theme").and_then(|v| v.as_str()) {
            let valid_themes = get_available_editor_themes();
            if valid_themes.contains(&theme) {
                config.theme = theme.to_string();
            } else {
                log(
                    "CONFIG_VALIDATION",
                    &format!(
                        "Invalid editor theme '{}'. Using default '{}'.",
                        theme, config.theme
                    ),
                    None,
                );
            }
        }

        if let Some(wrap) = section.get("word_wrap").and_then(|v| v.as_bool()) {
            config.word_wrap = wrap;
        }

        if let Some(size) = section.get("tab_size").and_then(|v| v.as_integer()) {
            let size = size as u16;
            if size > 0 && size <= 16 {
                config.tab_size = size;
            } else {
                log(
                    "CONFIG_VALIDATION",
                    &format!(
                        "Invalid tab_size {}. Using default {}.",
                        size, config.tab_size
                    ),
                    None,
                );
            }
        }

        if let Some(expand) = section.get("expand_tabs").and_then(|v| v.as_bool()) {
            config.expand_tabs = expand;
        }

        if let Some(show_numbers) = section.get("show_line_numbers").and_then(|v| v.as_bool()) {
            config.show_line_numbers = show_numbers;
        }
    }

    config
}

fn extract_shortcuts_config(value: &toml::Value) -> ShortcutsConfig {
    let shortcuts_section = value.get("shortcuts");
    let mut config = ShortcutsConfig::default();

    if let Some(section) = shortcuts_section {
        macro_rules! extract_shortcut {
            ($field:ident, $key:literal) => {
                if let Some(shortcut) = section.get($key).and_then(|v| v.as_str()) {
                    if validate_basic_shortcut_format(shortcut).is_ok() {
                        config.$field = shortcut.to_string();
                    } else {
                        log(
                            "CONFIG_VALIDATION",
                            &format!(
                                "Warning: Invalid shortcut '{}' for {}. Using default '{}'.",
                                shortcut, $key, config.$field
                            ),
                            None,
                        );
                    }
                }
            };
        }

        extract_shortcut!(create_note, "create_note");
        extract_shortcut!(rename_note, "rename_note");
        extract_shortcut!(delete_note, "delete_note");
        extract_shortcut!(edit_note, "edit_note");
        extract_shortcut!(save_and_exit, "save_and_exit");
        extract_shortcut!(open_external, "open_external");
        extract_shortcut!(open_folder, "open_folder");
        extract_shortcut!(refresh_cache, "refresh_cache");
        extract_shortcut!(scroll_up, "scroll_up");
        extract_shortcut!(scroll_down, "scroll_down");
        extract_shortcut!(up, "up");
        extract_shortcut!(down, "down");
        extract_shortcut!(navigate_previous, "navigate_previous");
        extract_shortcut!(navigate_next, "navigate_next");
        extract_shortcut!(open_settings, "open_settings");
        extract_shortcut!(version_explorer, "version_explorer");
        extract_shortcut!(recently_deleted, "recently_deleted");
    }

    config
}

fn extract_preferences_config(value: &toml::Value) -> PreferencesConfig {
    let preferences_section = value.get("preferences");
    let mut config = PreferencesConfig::default();

    if let Some(section) = preferences_section {
        if let Some(max_results) = section
            .get("max_search_results")
            .and_then(|v| v.as_integer())
        {
            let max_results = max_results as usize;
            if max_results > 0 && max_results <= 10000 {
                config.max_search_results = max_results;
            } else {
                log(
                    "CONFIG_VALIDATION",
                    &format!(
                        "Invalid max_search_results {}. Using default {}.",
                        max_results, config.max_search_results
                    ),
                    None,
                );
            }
        }
    }

    config
}
