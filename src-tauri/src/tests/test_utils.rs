//! Test utilities module
//!
//! Contains test-only functions and structures that support testing
//! but are not part of the production codebase.

use crate::config::AppConfig;
use crate::core::state::AppState;
use crate::services::database_service::recreate_database;
use std::path::Path;
use std::sync::Mutex;
use tempfile::TempDir;
use toml;

// Global mutex to prevent race conditions when multiple tests override config
#[cfg(test)]
static CONFIG_TEST_LOCK: Mutex<()> = Mutex::new(());

/// CRITICAL SAFETY: Validate that a directory path is safe for test usage
/// This prevents accidental data loss by ensuring tests only use approved directories
#[cfg(test)]
fn validate_test_directory_safety(path: &Path) -> Result<(), String> {
    let path_str = path.to_string_lossy();

    // SAFETY: Only allow specific patterns that indicate test directories
    let is_safe_test_dir =
        // Temporary directories created by tempfile crate
        path_str.contains("/tmp/") ||
        path_str.contains("\\Temp\\") ||
        // Explicit test markers in path
        path_str.contains("_tmp") ||
        path_str.contains("test") ||
        path_str.contains("Test") ||
        // System temp directories
        path_str.starts_with("/var/folders/") ||  // macOS temp
        path_str.starts_with("/tmp/") ||           // Unix temp
        path_str.contains("/AppData/Local/Temp/") || // Windows temp
        // CI/CD environments
        std::env::var("CI").is_ok();

    if !is_safe_test_dir {
        return Err(format!(
            "CRITICAL SAFETY ERROR: Directory '{}' is not recognized as a safe test directory. \
             Tests can only use temporary directories or paths containing 'test'/'_tmp' markers. \
             This prevents accidental deletion of production data.",
            path_str
        ));
    }

    // Additional safety: Check for common production directory patterns
    let dangerous_patterns = [
        "Documents",
        "Desktop",
        "Downloads",
        "Pictures",
        "Videos",
        "Music",
        "notes",
        "Notes",
        "notebook",
        "Notebook",
        ".git",
        "src",
        "home",
        "Users",
        "user",
    ];

    // Only flag as dangerous if it's NOT in a temp directory
    if !path_str.contains("/tmp/")
        && !path_str.contains("\\Temp\\")
        && !path_str.starts_with("/var/folders/")
    {
        for pattern in &dangerous_patterns {
            if path_str.contains(pattern) {
                return Err(format!(
                    "CRITICAL SAFETY ERROR: Directory '{}' contains suspicious pattern '{}' \
                     and is not in a recognized temp location. This could indicate a production directory.",
                    path_str, pattern
                ));
            }
        }
    }

    Ok(())
}

#[cfg(test)]
pub mod database_testing;

/// Clean up all _tmp* directories (removes leftover test directories)
#[cfg(test)]
pub fn cleanup_all_tmp_directories() -> Result<(), Box<dyn std::error::Error>> {
    use crate::utilities::paths::get_data_dir;
    use std::fs;

    // Get the symiosis app support directory using the same method as production code
    if let Some(app_data_dir) = get_data_dir() {
        let symiosis_dir = app_data_dir.join("symiosis");

        // Clean up databases directory
        let databases_dir = symiosis_dir.join("databases");
        if databases_dir.exists() {
            // Remove all _tmp* directories
            if let Ok(entries) = fs::read_dir(&databases_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        if let Some(dir_name) = path.file_name().and_then(|n| n.to_str()) {
                            if dir_name.starts_with("_tmp") {
                                let _ = fs::remove_dir_all(&path);
                            }
                        }
                    }
                }
            }
        }

        // Clean up backups directory
        let backups_dir = symiosis_dir.join("backups");
        if backups_dir.exists() {
            // Remove all _tmp* directories
            if let Ok(entries) = fs::read_dir(&backups_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        if let Some(dir_name) = path.file_name().and_then(|n| n.to_str()) {
                            if dir_name.starts_with("_tmp") {
                                let _ = fs::remove_dir_all(&path);
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

/// Test utilities - provides isolated database connections for testing
pub struct DbTestHarness {
    _temp_dir: TempDir, // Keep alive for cleanup
    db_path: std::path::PathBuf,
}

impl DbTestHarness {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let temp_dir = TempDir::new()?;
        let db_path = temp_dir.path().join("test.sqlite");

        Ok(Self {
            _temp_dir: temp_dir,
            db_path,
        })
    }

    pub fn get_test_connection(&self) -> Result<rusqlite::Connection, String> {
        rusqlite::Connection::open(&self.db_path)
            .map_err(|e| format!("Failed to open test database: {}", e))
    }
}

/// Test configuration override utility
///
/// This struct temporarily overrides the global APP_CONFIG to use a test directory,
/// ensuring all production functions automatically work with isolated test data.
/// It tracks and cleans up database and backup directories created during tests.
#[cfg(test)]
pub struct TestConfigOverride {
    _temp_dir: TempDir,
    _lock: std::sync::MutexGuard<'static, ()>,
    // pub app_state: AppState,
}

#[cfg(test)]
impl TestConfigOverride {
    /// Create a new test config override with an isolated temporary directory
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        // Acquire lock to prevent race conditions between parallel tests
        // Handle poisoned lock by taking ownership of the guard
        let lock = match CONFIG_TEST_LOCK.lock() {
            Ok(guard) => guard,
            Err(poisoned) => {
                // Clear the poison and take the guard
                eprintln!("Warning: Test lock was poisoned, clearing and continuing");
                poisoned.into_inner()
            }
        };

        let temp_dir = TempDir::new()?;

        // CRITICAL SAFETY: Validate the temporary directory is safe for testing
        validate_test_directory_safety(temp_dir.path())
            .map_err(|e| format!("Test safety validation failed: {}", e))?;

        // Create a subdirectory for notes within the temp directory using _tmp prefix
        // This ensures the cleanup integration test will find and clean up associated directories
        let notes_dir = temp_dir.path().join("_tmp_notes");
        std::fs::create_dir_all(&notes_dir)
            .map_err(|e| format!("Failed to create notes directory: {}", e))?;
        let test_notes_path = notes_dir.to_string_lossy().to_string();

        // Create a new config with the test notes directory
        let mut test_config = AppConfig::default();
        test_config.notes_directory = test_notes_path.clone();

        // Create a separate directory for the config file (not in the notes directory)
        let config_dir = temp_dir.path().join("config");
        std::fs::create_dir_all(&config_dir)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;

        let config_file_path = config_dir.join("config.toml");
        let config_toml = toml::to_string(&test_config)
            .map_err(|e| format!("Failed to serialize test config: {}", e))?;
        std::fs::write(&config_file_path, config_toml)
            .map_err(|e| format!("Failed to write test config file: {}", e))?;

        // SAFETY VALIDATION: Ensure config file path is in temp directory
        let config_path_str = config_file_path.to_string_lossy();
        if !config_path_str.contains("/tmp/")
            && !config_path_str.contains("tmp")
            && !config_path_str.contains("/T/")
        {
            return Err(format!(
                "CRITICAL SAFETY ERROR: Test config path is not in temp directory!"
            )
            .into());
        }

        // SAFETY VALIDATION: Ensure notes directory is in temp directory
        if !test_notes_path.contains("/tmp/")
            && !test_notes_path.contains("tmp")
            && !test_notes_path.contains("/T/")
        {
            return Err(format!(
                "CRITICAL SAFETY ERROR: Test notes path is not in temp directory!"
            )
            .into());
        }

        // Use a unique test ID to avoid cross-test pollution
        let test_id = format!("test_{}", std::process::id());

        // Set environment variables so get_config_path() finds our test config
        std::env::set_var("SYMIOSIS_TEST_CONFIG_PATH", &config_file_path);
        std::env::set_var("SYMIOSIS_TEST_MODE_ENABLED", &test_id);

        // CRITICAL SAFETY CHECK: Verify we're actually using the test directory
        let actual_notes_dir = crate::config::get_config_notes_dir();
        let expected_notes_path = notes_dir.to_path_buf();

        if actual_notes_dir != expected_notes_path {
            // EMERGENCY ABORT: We're not using the test directory!
            std::env::remove_var("SYMIOSIS_TEST_CONFIG_PATH");
            std::env::remove_var("SYMIOSIS_TEST_MODE_ENABLED");
            panic!(
                "CRITICAL SAFETY ERROR: Test setup failed! Expected to use test directory '{}' but get_config_notes_dir() returned '{}'. This would cause data loss!",
                expected_notes_path.display(),
                actual_notes_dir.display()
            );
        }

        // Additional safety check: ensure the directory is actually temporary
        let actual_notes_str = actual_notes_dir.to_string_lossy();
        if !actual_notes_str.contains("/tmp/")
            && !actual_notes_str.contains("tmp")
            && !actual_notes_str.contains("/T/")
        {
            std::env::remove_var("SYMIOSIS_TEST_CONFIG_PATH");
            std::env::remove_var("SYMIOSIS_TEST_MODE_ENABLED");
            panic!(
                "CRITICAL SAFETY ERROR: get_config_notes_dir() returned '{}' which is not in a temp directory! This would cause data loss!",
                actual_notes_dir.display()
            );
        }

        println!(
            "✅ SAFETY CHECK PASSED: Using test directory: {}",
            actual_notes_dir.display()
        );

        // Create AppState with the test config
        let app_state =
            AppState::new_with_fallback(test_config).expect("Test database setup failed");

        // Initialize a clean database for the test directory
        // Use recreate_database to ensure we start with a fresh database state
        recreate_database(&app_state)
            .map_err(|e| format!("Failed to recreate test database: {}", e))?;

        Ok(Self {
            _temp_dir: temp_dir,
            _lock: lock,
            // app_state,
        })
    }

    /// Get the temporary notes directory path
    pub fn notes_dir(&self) -> std::path::PathBuf {
        self._temp_dir.path().join("_tmp_notes")
    }
}

#[cfg(test)]
impl Drop for TestConfigOverride {
    fn drop(&mut self) {
        // Clean up the test config environment variables
        std::env::remove_var("SYMIOSIS_TEST_CONFIG_PATH");
        std::env::remove_var("SYMIOSIS_TEST_MODE_ENABLED");
    }
}

/// Test wrapper functions using tauri::test::mock_app()
/// These use Tauri's official testing utilities to properly mock State
#[cfg(test)]
mod test_command_wrappers {
    use crate::core::state::AppState;
    use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};
    use tauri::{App, Manager};

    /// Create a mock Tauri app with test AppState
    fn create_test_mock_app() -> App<MockRuntime> {
        // SAFETY CHECK: Ensure we're in test mode before proceeding
        if std::env::var("SYMIOSIS_TEST_MODE_ENABLED").is_err() {
            panic!("CRITICAL SAFETY ERROR: create_test_mock_app() called outside of TestConfigOverride!");
        }

        // Use the actual loaded config (which should be the test config if TestConfigOverride is active)
        let config = crate::config::load_config();

        let app_state = AppState::new_with_fallback(config).expect("Test database setup failed");

        mock_builder()
            .manage(app_state)
            .build(mock_context(noop_assets()))
            .expect("Failed to build test app")
    }

    pub fn test_create_new_note(note_name: &str) -> Result<(), String> {
        // SAFETY CHECK: Ensure we're in test mode before proceeding
        if std::env::var("SYMIOSIS_TEST_MODE_ENABLED").is_err() {
            panic!("CRITICAL SAFETY ERROR: test_create_new_note() called outside of TestConfigOverride!");
        }

        let app = create_test_mock_app();
        let app_state = app.state::<AppState>();
        crate::commands::notes::create_new_note(note_name, app_state)
    }

    pub fn test_get_note_content(note_name: &str) -> Result<String, String> {
        // SAFETY CHECK: Ensure we're in test mode before proceeding
        if std::env::var("SYMIOSIS_TEST_MODE_ENABLED").is_err() {
            panic!("CRITICAL SAFETY ERROR: test_get_note_content() called outside of TestConfigOverride!");
        }

        let app = create_test_mock_app();
        let app_state = app.state::<AppState>();
        crate::commands::notes::get_note_content(note_name, app_state)
    }

    pub fn test_delete_note(note_name: &str) -> Result<(), String> {
        // SAFETY CHECK: Ensure we're in test mode before proceeding
        if std::env::var("SYMIOSIS_TEST_MODE_ENABLED").is_err() {
            panic!(
                "CRITICAL SAFETY ERROR: test_delete_note() called outside of TestConfigOverride!"
            );
        }

        let app = create_test_mock_app();
        let app_state = app.state::<AppState>();
        crate::commands::notes::delete_note(note_name, app_state)
    }

    pub fn test_save_note_with_content_check(
        note_name: &str,
        content: &str,
        original_content: &str,
    ) -> Result<(), String> {
        // SAFETY CHECK: Ensure we're in test mode before proceeding
        if std::env::var("SYMIOSIS_TEST_MODE_ENABLED").is_err() {
            panic!("CRITICAL SAFETY ERROR: test_save_note_with_content_check() called outside of TestConfigOverride!");
        }

        let app = create_test_mock_app();
        let app_state = app.state::<AppState>();
        crate::commands::notes::save_note_with_content_check(
            note_name,
            content,
            original_content,
            app_state,
        )
    }

    pub fn test_rename_note(old_name: String, new_name: String) -> Result<(), String> {
        // SAFETY CHECK: Ensure we're in test mode before proceeding
        if std::env::var("SYMIOSIS_TEST_MODE_ENABLED").is_err() {
            panic!(
                "CRITICAL SAFETY ERROR: test_rename_note() called outside of TestConfigOverride!"
            );
        }

        let app = create_test_mock_app();
        let app_state = app.state::<AppState>();
        crate::commands::notes::rename_note(old_name, new_name, app_state)
    }

    pub fn test_list_all_notes() -> Result<Vec<String>, String> {
        // SAFETY CHECK: Ensure we're in test mode before proceeding
        if std::env::var("SYMIOSIS_TEST_MODE_ENABLED").is_err() {
            panic!("CRITICAL SAFETY ERROR: test_list_all_notes() called outside of TestConfigOverride!");
        }

        let app = create_test_mock_app();
        let app_state = app.state::<AppState>();
        crate::commands::notes::list_all_notes(app_state)
    }

    pub fn test_get_note_html_content(note_name: &str) -> Result<String, String> {
        // SAFETY CHECK: Ensure we're in test mode before proceeding
        if std::env::var("SYMIOSIS_TEST_MODE_ENABLED").is_err() {
            panic!("CRITICAL SAFETY ERROR: test_get_note_html_content() called outside of TestConfigOverride!");
        }

        let app = create_test_mock_app();
        let app_state = app.state::<AppState>();
        crate::commands::notes::get_note_html_content(note_name, app_state)
    }

    pub fn test_search_notes_hybrid(
        query: &str,
        max_results: usize,
    ) -> crate::core::AppResult<Vec<String>> {
        // SAFETY CHECK: Ensure we're in test mode before proceeding
        if std::env::var("SYMIOSIS_TEST_MODE_ENABLED").is_err() {
            panic!("CRITICAL SAFETY ERROR: test_search_notes_hybrid() called outside of TestConfigOverride!");
        }

        let config = crate::config::load_config();
        let app_state = AppState::new_with_fallback(config).expect("Test database setup failed");
        crate::search::search_notes_hybrid(&app_state, query, max_results)
            .map(|notes| notes.into_iter().map(|n| n.filename).collect())
    }
}

#[cfg(test)]
pub use test_command_wrappers::*;
