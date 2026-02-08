use crate::core::{AppError, AppResult};
use crate::logging::log;
use crate::utilities::config_helpers::{default_global_shortcut, default_window_decorations};

pub use crate::utilities::config_helpers::{
    get_available_code_themes, get_available_editor_modes, get_available_editor_themes,
    get_available_markdown_themes, get_available_ui_themes, load_config_from_content,
    parse_shortcut,
};
use crate::utilities::paths::{get_config_path, get_default_notes_dir};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, PartialEq)]
pub enum ConfigReloadResult {
    Unchanged,
    NotesDirChanged,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    #[serde(default = "default_notes_directory")]
    pub notes_directory: String,
    #[serde(default = "default_global_shortcut")]
    pub global_shortcut: String,

    #[serde(default)]
    pub general: GeneralConfig,

    #[serde(default)]
    pub interface: InterfaceConfig,

    #[serde(default)]
    pub editor: EditorConfig,

    #[serde(default)]
    pub shortcuts: ShortcutsConfig,

    #[serde(default)]
    pub preferences: PreferencesConfig,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(default)]
pub struct GeneralConfig {
    #[serde(default = "default_scroll_amount")]
    pub scroll_amount: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(default)]
pub struct InterfaceConfig {
    pub ui_theme: String,
    pub font_family: String,
    pub font_size: u16,
    pub editor_font_family: String,
    pub editor_font_size: u16,
    pub markdown_render_theme: String,
    pub md_render_code_theme: String,
    pub always_on_top: bool,
    #[serde(default = "default_window_decorations")]
    pub window_decorations: bool,
    pub custom_ui_theme_path: Option<String>,
    pub custom_markdown_theme_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(default)]
pub struct ShortcutsConfig {
    pub create_note: String,
    pub rename_note: String,
    pub delete_note: String,
    pub edit_note: String,
    pub save_and_exit: String,
    pub open_external: String,
    pub open_folder: String,
    pub refresh_cache: String,
    pub scroll_up: String,
    pub scroll_down: String,
    pub up: String,
    pub down: String,
    pub navigate_previous: String,
    pub navigate_next: String,
    pub navigate_code_previous: String,
    pub navigate_code_next: String,
    pub navigate_link_previous: String,
    pub navigate_link_next: String,
    pub copy_current_section: String,
    pub open_settings: String,
    pub version_explorer: String,
    pub recently_deleted: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(default)]
pub struct PreferencesConfig {
    #[serde(default = "default_max_results")]
    pub max_search_results: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(default)]
pub struct EditorConfig {
    pub mode: String,
    pub theme: String,
    pub word_wrap: bool,
    pub tab_size: u16,
    pub expand_tabs: bool,
    pub show_line_numbers: bool,
}

fn default_notes_directory() -> String {
    get_default_notes_dir()
}

fn default_max_results() -> usize {
    crate::utilities::config_helpers::default_max_results()
}

fn default_scroll_amount() -> f64 {
    0.4
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            notes_directory: get_default_notes_dir(),
            global_shortcut: default_global_shortcut(),
            general: GeneralConfig::default(),
            interface: InterfaceConfig::default(),
            editor: EditorConfig::default(),
            shortcuts: ShortcutsConfig::default(),
            preferences: PreferencesConfig::default(),
        }
    }
}

impl Default for GeneralConfig {
    fn default() -> Self {
        Self {
            scroll_amount: default_scroll_amount(),
        }
    }
}

impl Default for InterfaceConfig {
    fn default() -> Self {
        Self {
            ui_theme: "gruvbox-dark".to_string(),
            font_family: "Inter, sans-serif".to_string(),
            font_size: 14,
            editor_font_family: "JetBrains Mono, Consolas, monospace".to_string(),
            editor_font_size: 14,
            markdown_render_theme: "modern-dark".to_string(),
            md_render_code_theme: "gruvbox-dark-medium".to_string(),
            always_on_top: false,
            window_decorations: default_window_decorations(),
            custom_ui_theme_path: None,
            custom_markdown_theme_path: None,
        }
    }
}

impl Default for ShortcutsConfig {
    fn default() -> Self {
        Self {
            create_note: "Ctrl+Enter".to_string(),
            rename_note: "Ctrl+m".to_string(),
            delete_note: "Ctrl+x".to_string(),
            edit_note: "Enter".to_string(),
            save_and_exit: "Ctrl+s".to_string(),
            open_external: "Ctrl+o".to_string(),
            open_folder: "Ctrl+f".to_string(),
            refresh_cache: "Ctrl+r".to_string(),
            scroll_up: "Ctrl+u".to_string(),
            scroll_down: "Ctrl+d".to_string(),
            up: "Ctrl+k".to_string(),
            down: "Ctrl+j".to_string(),
            navigate_previous: "Ctrl+p".to_string(),
            navigate_next: "Ctrl+n".to_string(),
            navigate_code_previous: "Ctrl+Alt+h".to_string(),
            navigate_code_next: "Ctrl+Alt+l".to_string(),
            navigate_link_previous: "Ctrl+h".to_string(),
            navigate_link_next: "Ctrl+l".to_string(),
            copy_current_section: "Ctrl+y".to_string(),
            open_settings: "Meta+,".to_string(),
            version_explorer: "Ctrl+/".to_string(),
            recently_deleted: "Ctrl+.".to_string(),
        }
    }
}

impl Default for PreferencesConfig {
    fn default() -> Self {
        Self {
            max_search_results: default_max_results(),
        }
    }
}

impl Default for EditorConfig {
    fn default() -> Self {
        Self {
            mode: "basic".to_string(),
            theme: "gruvbox-dark".to_string(),
            word_wrap: true,
            tab_size: 2,
            expand_tabs: true,
            show_line_numbers: true,
        }
    }
}

pub fn get_config_notes_dir() -> PathBuf {
    let config = load_config();
    crate::utilities::config_helpers::get_config_notes_dir_from_config(&config.notes_directory)
}

pub fn get_config_notes_dir_from_config(config: &AppConfig) -> PathBuf {
    crate::utilities::config_helpers::get_config_notes_dir_from_config(&config.notes_directory)
}

pub fn load_config() -> AppConfig {
    let config_path = get_config_path();

    match fs::read_to_string(&config_path) {
        Ok(content) => load_config_from_content(&content),
        Err(_) => {
            let default_config = AppConfig::default();
            if let Err(e) = save_config(&default_config) {
                log(
                    "CONFIG_CREATION",
                    "Failed to create default config file",
                    Some(&e.to_string()),
                );
            }
            default_config
        }
    }
}

pub fn load_config_with_first_run_info() -> (AppConfig, bool) {
    let config_path = get_config_path();
    let was_first_run = !config_path.exists();

    let config = match fs::read_to_string(&config_path) {
        Ok(content) => load_config_from_content(&content),
        Err(_) => {
            let default_config = AppConfig::default();
            if let Err(e) = save_config(&default_config) {
                log(
                    "CONFIG_CREATION",
                    "Failed to create default config file",
                    Some(&e.to_string()),
                );
            }
            default_config
        }
    };

    (config, was_first_run)
}

pub fn save_config(config: &AppConfig) -> AppResult<()> {
    let config_path = get_config_path();

    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)?;
    }

    let mut toml_content = toml::to_string_pretty(config)
        .map_err(|e| AppError::ConfigSave(format!("Failed to serialize config: {}", e)))?;

    // Add commented examples for None values
    if config.interface.custom_ui_theme_path.is_none() {
        toml_content = toml_content.replace(
            "[interface]",
            "[interface]\n# custom_ui_theme_path = \"path/to/custom/ui_theme.css\"",
        );
    }
    if config.interface.custom_markdown_theme_path.is_none() {
        toml_content = toml_content.replace(
            "# custom_ui_theme_path = \"path/to/custom/ui_theme.css\"",
            "# custom_ui_theme_path = \"path/to/custom/ui_theme.css\"\n# custom_markdown_theme_path = \"path/to/custom/markdown_theme.css\""
        );
    }

    fs::write(&config_path, toml_content)?;

    log(
        "CONFIG",
        "Config saved",
        Some(&config_path.display().to_string()),
    );
    Ok(())
}

pub fn reload_config(
    app_config: &std::sync::RwLock<AppConfig>,
    app_handle: Option<AppHandle>,
) -> Result<ConfigReloadResult, String> {
    let new_config = load_config();

    let result = {
        let old_config = app_config
            .read()
            .map_err(|_| "Failed to acquire read lock on config".to_string())?;

        if get_config_notes_dir_from_config(&old_config)
            != get_config_notes_dir_from_config(&new_config)
        {
            ConfigReloadResult::NotesDirChanged
        } else {
            ConfigReloadResult::Unchanged
        }
    };

    let mut config = app_config
        .write()
        .map_err(|_| "Failed to acquire write lock on config".to_string())?;
    *config = new_config.clone();
    drop(config);

    if let Some(app) = app_handle {
        if let Err(e) = app.emit("config-updated", &new_config) {
            log(
                "CONFIG_EVENT",
                "Failed to emit config-updated event",
                Some(&e.to_string()),
            );
        }
    }
    Ok(result)
}
