//! Config Unit Tests
//!
//! Tests config loading, parsing, and validation functionality.
//! These tests access internal/private functions and test the actual production behavior.

use crate::config::{load_config, load_config_from_content, parse_shortcut, AppConfig};
use crate::utilities::paths::{get_config_path, get_default_notes_dir};

#[test]
fn test_default_config_values() {
    let config = AppConfig::default();

    assert_eq!(config.preferences.max_search_results, 100);
    assert_eq!(config.global_shortcut, "Ctrl+Shift+N");
    assert_eq!(config.editor.mode, "basic");
    assert_eq!(config.interface.markdown_render_theme, "modern_dark");
    // notes_directory should be ~/Documents/Notes or ./notes fallback
    assert!(config.notes_directory.contains("Notes") || config.notes_directory == "./notes");
}

#[test]
fn test_get_default_notes_dir() {
    let notes_dir = get_default_notes_dir();
    // Should be either ~/Documents/Notes or ./notes fallback
    assert!(notes_dir.contains("Documents") || notes_dir == "./notes");
    assert!(!notes_dir.is_empty());
}

#[test]
fn test_get_config_path() {
    let config_path = get_config_path();
    // Should be ~/.symiosis/config.toml or .symiosis/config.toml
    let path_str = config_path.to_string_lossy();
    assert!(path_str.contains(".symiosis"));
    assert!(path_str.ends_with("config.toml"));
}

#[test]
fn test_config_toml_serialization_roundtrip() {
    let config = AppConfig::default();
    let toml_str = toml::to_string(&config).expect("Config serialization should work");
    let deserialized: AppConfig =
        toml::from_str(&toml_str).expect("Config deserialization should work");

    assert_eq!(
        config.preferences.max_search_results,
        deserialized.preferences.max_search_results
    );
    assert_eq!(config.notes_directory, deserialized.notes_directory);
    assert_eq!(config.global_shortcut, deserialized.global_shortcut);
    assert_eq!(config.editor.mode, deserialized.editor.mode);
    assert_eq!(
        config.interface.markdown_render_theme,
        deserialized.interface.markdown_render_theme
    );
}

#[test]
fn test_config_toml_serde_defaults() {
    // Test that missing fields use serde defaults
    let minimal_toml = r#"
notes_directory = "/tmp/test"
"#;

    let config: AppConfig = toml::from_str(minimal_toml).expect("Should deserialize with defaults");

    // Specified field
    assert_eq!(config.notes_directory, "/tmp/test");
    // Missing fields should use defaults
    assert_eq!(config.preferences.max_search_results, 100);
    assert_eq!(config.global_shortcut, "Ctrl+Shift+N");
    assert_eq!(config.editor.mode, "basic");
    assert_eq!(config.interface.markdown_render_theme, "modern_dark");
}

#[test]
fn test_config_toml_partial_config() {
    let partial_toml = r#"
notes_directory = "/custom/notes"
global_shortcut = "Alt+Space"

[preferences]
max_search_results = 50
"#;

    let config: AppConfig =
        toml::from_str(partial_toml).expect("Should deserialize partial config");

    // Specified fields
    assert_eq!(config.notes_directory, "/custom/notes");
    assert_eq!(config.preferences.max_search_results, 50);
    assert_eq!(config.global_shortcut, "Alt+Space");
    // Missing fields should use defaults
    assert_eq!(config.editor.mode, "basic");
    assert_eq!(config.interface.markdown_render_theme, "modern_dark");
}

#[test]
fn test_shortcut_parsing() {
    // Valid shortcuts
    assert!(parse_shortcut("Ctrl+Shift+N").is_some());
    assert!(parse_shortcut("Alt+Space").is_some());
    assert!(parse_shortcut("Cmd+F1").is_some());

    // Invalid shortcuts
    assert!(parse_shortcut("invalid").is_none());
    assert!(parse_shortcut("").is_none());
    assert!(parse_shortcut("Not+A+Real+Shortcut").is_none());
}

#[test]
fn test_load_config_behavior() {
    // load_config() reads from fixed path ~/.symiosis/config.toml
    // If file doesn't exist or parsing fails, it returns defaults
    // We can't easily test file reading without affecting the actual config,
    // but we can test that it doesn't crash and returns reasonable values
    let config = load_config();

    // Should have reasonable values (either from file or defaults)
    assert!(config.preferences.max_search_results > 0);
    assert!(!config.global_shortcut.is_empty());
    assert!(!config.editor.mode.is_empty());
    assert!(!config.interface.markdown_render_theme.is_empty());
    assert!(!config.notes_directory.is_empty());
}

#[test]
fn test_toml_parsing_handles_malformed_input() {
    // Test that malformed TOML fails to parse (as expected by load_config fallback logic)
    let invalid_toml = r#"
notes_directory = "/path  # Missing closing quote
max_search_results = "not_a_number"
invalid_syntax =
"#;

    let result = toml::from_str::<AppConfig>(invalid_toml);
    assert!(result.is_err(), "Malformed TOML should fail to parse");

    // This demonstrates how load_config() behaves: falls back to defaults on parse error
}

#[test]
fn test_save_config_content_validates_toml() {
    // save_config_content validates TOML before saving
    // We test the validation logic without actually saving files

    // Valid TOML should parse successfully
    let valid_toml = r#"
notes_directory = "/valid/path"

[preferences]
max_search_results = 150

[editor]
mode = "vim"
theme = "gruvbox-dark"
word_wrap = true
tab_size = 2
expand_tabs = false
show_line_numbers = true
"#;
    let parse_result = toml::from_str::<AppConfig>(valid_toml);
    if let Err(e) = &parse_result {
        eprintln!("TOML parse error: {}", e);
    }
    assert!(parse_result.is_ok(), "Valid TOML should parse successfully");

    // Invalid TOML should fail (this is what save_config_content checks)
    let invalid_toml = r#"
notes_directory = "/path"

[preferences]
max_search_results = "not_a_number"
"#;
    let invalid_result = toml::from_str::<AppConfig>(invalid_toml);
    assert!(
        invalid_result.is_err(),
        "Invalid TOML should fail validation"
    );
}

// ============================================================================
// ROBUSTNESS TESTS - Testing the new permissive loading behavior
// ============================================================================

#[test]
fn test_load_config_single_field_only() {
    // Test that a config with just one field works
    let single_field_toml = r#"
notes_directory = "/custom/notes"
"#;

    let config = load_config_from_content(single_field_toml);

    // The specified field should be preserved
    assert_eq!(config.notes_directory, "/custom/notes");
    // All other fields should use defaults
    assert_eq!(config.global_shortcut, "Ctrl+Shift+N");
    assert_eq!(config.preferences.max_search_results, 100);
    assert_eq!(config.editor.mode, "basic");
    assert_eq!(config.interface.markdown_render_theme, "modern_dark");
}

#[test]
fn test_load_config_invalid_single_field_preserves_rest() {
    // Test that invalid individual fields don't break the entire config
    let mixed_valid_invalid_toml = r#"
notes_directory = "/valid/path"
global_shortcut = "Ctrl+Alt+N"

[interface]
ui_theme = "gruvbox-dark"
md_render_code_theme = "completely_invalid_theme"
font_size = 16

[editor]
mode = "vim"
theme = "invalid_editor_theme"
tab_size = 4

[preferences]
max_search_results = 200
"#;

    let config = load_config_from_content(mixed_valid_invalid_toml);

    // Valid fields should be preserved
    assert_eq!(config.notes_directory, "/valid/path");
    assert_eq!(config.global_shortcut, "Ctrl+Alt+N");
    assert_eq!(config.interface.ui_theme, "gruvbox-dark");
    assert_eq!(config.interface.font_size, 16);
    assert_eq!(config.editor.mode, "vim");
    assert_eq!(config.editor.tab_size, 4);
    assert_eq!(config.preferences.max_search_results, 200);

    // Invalid fields should fall back to defaults
    assert_eq!(config.interface.md_render_code_theme, "gruvbox-dark-medium"); // default
    assert_eq!(config.editor.theme, "gruvbox-dark"); // default
}

#[test]
fn test_load_config_invalid_font_sizes() {
    let invalid_font_sizes_toml = r#"
[interface]
font_size = 999
editor_font_size = 2
"#;

    let config = load_config_from_content(invalid_font_sizes_toml);

    // Invalid font sizes should fall back to defaults
    assert_eq!(config.interface.font_size, 14); // default
    assert_eq!(config.interface.editor_font_size, 14); // default
}

#[test]
fn test_load_config_invalid_shortcuts() {
    let invalid_shortcuts_toml = r#"
global_shortcut = "InvalidShortcut"

[shortcuts]
create_note = "Ctrl+Enter"
rename_note = "++Invalid++"
delete_note = ""
"#;

    let config = load_config_from_content(invalid_shortcuts_toml);

    // Valid shortcuts should be preserved
    assert_eq!(config.shortcuts.create_note, "Ctrl+Enter");

    // Invalid shortcuts should fall back to defaults
    assert_eq!(config.global_shortcut, "Ctrl+Shift+N"); // default
    assert_eq!(config.shortcuts.rename_note, "Ctrl+m"); // default
    assert_eq!(config.shortcuts.delete_note, "Ctrl+x"); // default
}

#[test]
fn test_load_config_invalid_editor_mode_and_theme() {
    let invalid_editor_toml = r#"
[editor]
mode = "nonexistent_mode"
theme = "nonexistent_theme"
tab_size = 0
word_wrap = true
show_line_numbers = false
"#;

    let config = load_config_from_content(invalid_editor_toml);

    // Valid fields should be preserved
    assert_eq!(config.editor.word_wrap, true);
    assert_eq!(config.editor.show_line_numbers, false);

    // Invalid fields should fall back to defaults
    assert_eq!(config.editor.mode, "basic"); // default
    assert_eq!(config.editor.theme, "gruvbox-dark"); // default
    assert_eq!(config.editor.tab_size, 2); // default
}

#[test]
fn test_load_config_invalid_preferences() {
    let invalid_preferences_toml = r#"
[preferences]
max_search_results = 0
"#;

    let config = load_config_from_content(invalid_preferences_toml);

    // Invalid max_search_results should fall back to default
    assert_eq!(config.preferences.max_search_results, 100); // default
}

#[test]
fn test_load_config_mixed_sections_some_empty() {
    let mixed_sections_toml = r#"
notes_directory = "/test/notes"

[interface]
ui_theme = "one-dark"

[editor]
# Editor section exists but is empty - should use all defaults

[preferences]
max_search_results = 50

[shortcuts]
create_note = "Alt+Enter"
"#;

    let config = load_config_from_content(mixed_sections_toml);

    // Specified values should be preserved
    assert_eq!(config.notes_directory, "/test/notes");
    assert_eq!(config.interface.ui_theme, "one-dark");
    assert_eq!(config.preferences.max_search_results, 50);
    assert_eq!(config.shortcuts.create_note, "Alt+Enter");

    // Empty sections should use defaults
    assert_eq!(config.editor.mode, "basic");
    assert_eq!(config.editor.theme, "gruvbox-dark");
    assert_eq!(config.editor.word_wrap, true);
    assert_eq!(config.editor.tab_size, 2);
    assert_eq!(config.editor.show_line_numbers, true);

    // Unspecified shortcuts should use defaults
    assert_eq!(config.shortcuts.rename_note, "Ctrl+m");
    assert_eq!(config.shortcuts.delete_note, "Ctrl+x");
}

#[test]
fn test_load_config_completely_invalid_toml_uses_defaults() {
    let invalid_toml = r#"
this is not valid toml at all
notes_directory = missing quotes
"#;

    let config = load_config_from_content(invalid_toml);

    // Should fall back to complete defaults when TOML parsing fails
    let default_config = AppConfig::default();
    assert_eq!(config.notes_directory, default_config.notes_directory);
    assert_eq!(config.global_shortcut, default_config.global_shortcut);
    assert_eq!(
        config.preferences.max_search_results,
        default_config.preferences.max_search_results
    );
}

#[test]
fn test_load_config_backward_compatibility() {
    // Test that existing valid configs still work exactly as before
    let valid_complete_toml = r#"
notes_directory = "/home/user/notes"
global_shortcut = "Ctrl+Space"

[general]

[interface]
ui_theme = "gruvbox-dark"
font_family = "Inter, sans-serif"
font_size = 16
editor_font_family = "JetBrains Mono"
editor_font_size = 15
markdown_render_theme = "modern_dark"
md_render_code_theme = "github-dark"
always_on_top = false

[editor]
mode = "vim"
theme = "nord"
word_wrap = false
tab_size = 4
show_line_numbers = true

[shortcuts]
create_note = "Ctrl+Enter"
rename_note = "Ctrl+r"
delete_note = "Ctrl+d"
save_and_exit = "Ctrl+s"
open_external = "Ctrl+o"
open_folder = "Ctrl+f"
refresh_cache = "F5"
scroll_up = "Ctrl+u"
scroll_down = "Ctrl+d"
up = "Ctrl+k"
down = "Ctrl+j"
navigate_previous = "Ctrl+p"
navigate_next = "Ctrl+n"
open_settings = "Meta+,"
version_explorer = "Ctrl+/"
recently_deleted = "Ctrl+."

[preferences]
max_search_results = 250
"#;

    let config = load_config_from_content(valid_complete_toml);

    // All specified values should be exactly preserved
    assert_eq!(config.notes_directory, "/home/user/notes");
    assert_eq!(config.global_shortcut, "Ctrl+Space");
    assert_eq!(config.interface.ui_theme, "gruvbox-dark");
    assert_eq!(config.interface.font_size, 16);
    assert_eq!(config.interface.editor_font_size, 15);
    assert_eq!(config.interface.markdown_render_theme, "modern_dark");
    assert_eq!(config.editor.mode, "vim");
    assert_eq!(config.editor.theme, "nord");
    assert_eq!(config.editor.word_wrap, false);
    assert_eq!(config.editor.tab_size, 4);
    assert_eq!(config.shortcuts.create_note, "Ctrl+Enter");
    assert_eq!(config.shortcuts.rename_note, "Ctrl+r");
    assert_eq!(config.shortcuts.refresh_cache, "F5");
    assert_eq!(config.preferences.max_search_results, 250);
}
