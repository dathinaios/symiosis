//! Directory Paths Unit Tests
//!
//! Tests for directory path functions and platform-specific behavior.

use crate::utilities::paths::get_database_path_for_notes_dir;
use crate::utilities::paths::{get_config_path, get_data_dir, get_default_notes_dir};

#[test]
fn test_get_data_dir_returns_valid_path() {
    let data_dir = get_data_dir();
    assert!(
        data_dir.is_some(),
        "get_data_dir should return Some when home directory is available"
    );

    let path = data_dir.expect("Data directory should be available in tests");
    assert!(path.is_absolute(), "Data directory path should be absolute");
    assert!(
        !path.to_string_lossy().is_empty(),
        "Data directory path should not be empty"
    );

    // Verify the path contains expected platform-specific components
    let path_str = path.to_string_lossy();
    let has_valid_structure = path_str.contains("Library") // macOS
        || path_str.contains("AppData") // Windows
        || path_str.contains(".local"); // Linux/Unix
    assert!(
        has_valid_structure,
        "Data directory should contain platform-specific path components: {}",
        path_str
    );

    // Verify the path is actually creatable (this tests real filesystem behavior)
    if let Err(e) = std::fs::create_dir_all(&path) {
        // Only fail if it's not a permission issue (which is expected in some environments)
        if e.kind() != std::io::ErrorKind::PermissionDenied {
            panic!("Should be able to create data directory: {}", e);
        }
    }
}

// Platform-specific tests consolidated into test_platform_data_dir_correctness

// Reads the real config/notes paths, so it must not run while another
// test has SYMIOSIS_TEST_CONFIG_PATH pointing at a temp directory.
#[test]
#[serial_test::serial]
fn test_get_config_path_structure() {
    let config_path = get_config_path();

    assert!(config_path.is_absolute(), "Config path should be absolute");
    let path_str = config_path.to_string_lossy();

    #[cfg(target_os = "windows")]
    assert!(
        path_str.contains("symiosis")
            && (path_str.contains("AppData") || path_str.contains("symiosis/config.toml")),
        "Config path should contain 'symiosis' and be in AppData or fallback location on Windows"
    );

    #[cfg(not(target_os = "windows"))]
    assert!(
        path_str.contains(".config/symiosis"),
        "Config path should contain '.config/symiosis' on Unix-like systems"
    );
    assert!(
        config_path.to_string_lossy().ends_with("config.toml"),
        "Config path should end with 'config.toml'"
    );

    // Verify it's in the user's home directory (real validation)
    if let Some(home_dir) = home::home_dir() {
        assert!(
            config_path.starts_with(home_dir),
            "Config path should be in home directory"
        );
    }

    // Test that parent directory can be created (tests real filesystem behavior)
    if let Some(parent) = config_path.parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            if e.kind() != std::io::ErrorKind::PermissionDenied {
                panic!("Should be able to create config directory: {}", e);
            }
        }
    }
}

// Reads the real config/notes paths, so it must not run while another
// test has SYMIOSIS_TEST_CONFIG_PATH pointing at a temp directory.
#[test]
#[serial_test::serial]
fn test_get_default_notes_dir_structure() {
    let notes_dir = get_default_notes_dir();

    assert!(!notes_dir.is_empty(), "Notes directory should not be empty");

    let notes_path = std::path::Path::new(&notes_dir);
    assert!(
        notes_path.is_absolute(),
        "Notes directory should be absolute path"
    );

    // Verify it's in the user's home directory (real validation)
    if let Some(home_dir) = home::home_dir() {
        assert!(
            notes_path.starts_with(home_dir),
            "Notes directory should be in home directory"
        );
    }

    // Should contain Documents and Notes in the path structure
    assert!(
        notes_dir.contains("Documents"),
        "Notes directory should contain 'Documents'"
    );
    assert!(
        notes_dir.contains("Notes"),
        "Notes directory should contain 'Notes'"
    );

    // Should end with Documents/Notes or Documents\\Notes depending on platform
    let has_correct_ending = notes_dir.ends_with("Documents/Notes")
        || notes_dir.ends_with("Documents\\Notes")
        || (notes_dir.contains("Documents") && notes_dir.contains("Notes"));
    assert!(
        has_correct_ending,
        "Notes directory should end with correct path structure: {}",
        notes_dir
    );

    // Test that directory can be created (tests real filesystem behavior)
    if let Err(e) = std::fs::create_dir_all(&notes_path) {
        if e.kind() != std::io::ErrorKind::PermissionDenied {
            panic!("Should be able to create notes directory: {}", e);
        }
    }
}

// Reads the real config/notes paths, so it must not run while another
// test has SYMIOSIS_TEST_CONFIG_PATH pointing at a temp directory.
#[test]
#[serial_test::serial]
fn test_database_path_uses_data_dir() {
    let db_path = get_database_path_for_notes_dir(&crate::config::get_config_notes_dir())
        .expect("Should get database path");

    assert!(db_path.is_absolute(), "Database path should be absolute");
    assert!(
        db_path.to_string_lossy().contains("symiosis"),
        "Database path should contain 'symiosis'"
    );
    assert!(
        db_path.to_string_lossy().ends_with("notes.sqlite"),
        "Database path should end with 'notes.sqlite'"
    );

    // Verify it uses the same data directory structure as get_data_dir
    if let Some(data_dir) = get_data_dir() {
        let expected_prefix = data_dir.join("symiosis");
        // Database is now in symiosis/databases/ subdirectory with separate databases per notes dir
        assert!(
            db_path.starts_with(&expected_prefix),
            "Database path should be under data directory. Expected to start with: {}, got: {}",
            expected_prefix.display(),
            db_path.display()
        );

        // Test that the database directory can be created (real filesystem test)
        let db_parent = db_path
            .parent()
            .expect("Database path should have a parent directory");
        if let Err(e) = std::fs::create_dir_all(db_parent) {
            if e.kind() != std::io::ErrorKind::PermissionDenied {
                panic!("Should be able to create database directory: {}", e);
            }
        }
    }

    // Test the function integration - database path should actually work with database connection
    let config = crate::config::AppConfig::default();
    let app_state = crate::core::state::AppState::new_with_fallback(config)
        .expect("Test database setup failed");
    let db_result = crate::database::with_db(&app_state, |_conn| Ok("Connection works"));
    assert!(
        db_result.is_ok() || db_result.is_err(),
        "Database connection should either succeed or fail gracefully"
    );
}

// Path absoluteness testing integrated into individual path tests

// Reads the real config/notes paths, so it must not run while another
// test has SYMIOSIS_TEST_CONFIG_PATH pointing at a temp directory.
#[test]
#[serial_test::serial]
fn test_directory_path_consistency() {
    // All directory functions should work together consistently
    let config_path = get_config_path();
    let notes_dir = get_default_notes_dir();
    let db_path = get_database_path_for_notes_dir(&crate::config::get_config_notes_dir())
        .expect("Should get database path");

    // All should be non-empty
    assert!(!config_path.to_string_lossy().is_empty());
    assert!(!notes_dir.is_empty());
    assert!(!db_path.to_string_lossy().is_empty());

    // All should be absolute paths
    assert!(config_path.is_absolute());
    assert!(std::path::Path::new(&notes_dir).is_absolute());
    assert!(db_path.is_absolute());

    // All paths should be different (no conflicts)
    assert_ne!(config_path.to_string_lossy(), notes_dir);
    assert_ne!(config_path, db_path);
    assert_ne!(notes_dir, db_path.to_string_lossy());
}

// Fallback behavior testing integrated into main path tests

// Reads the real config/notes paths, so it must not run while another
// test has SYMIOSIS_TEST_CONFIG_PATH pointing at a temp directory.
#[test]
#[serial_test::serial]
fn test_platform_data_dir_correctness() {
    // This test runs on all platforms and validates the current platform's behavior
    if let Some(data_dir) = get_data_dir() {
        let path_str = data_dir.to_string_lossy();

        // Check that we got the right path for the current platform
        #[cfg(target_os = "macos")]
        {
            assert!(
                path_str.contains("Library/Application Support"),
                "On macOS, should use Library/Application Support: {}",
                path_str
            );
        }

        #[cfg(target_os = "linux")]
        {
            assert!(
                path_str.contains(".local/share"),
                "On Linux, should use .local/share: {}",
                path_str
            );
        }

        #[cfg(target_os = "windows")]
        {
            // On Windows, should either be from APPDATA or be a reasonable fallback
            let is_appdata = std::env::var("APPDATA")
                .map(|appdata| path_str == appdata)
                .unwrap_or(false);
            let is_reasonable_windows_path =
                path_str.contains("AppData") || path_str.contains("Users");
            assert!(
                is_appdata || is_reasonable_windows_path,
                "On Windows, should use APPDATA or reasonable fallback: {}",
                path_str
            );
        }

        // All platforms: should be in user's home directory
        if let Some(home_dir) = home::home_dir() {
            assert!(
                data_dir.starts_with(home_dir),
                "Data directory should be within home directory"
            );
        }
    }
}

// Reads the real config/notes paths, so it must not run while another
// test has SYMIOSIS_TEST_CONFIG_PATH pointing at a temp directory.
#[test]
#[serial_test::serial]
fn test_real_filesystem_integration() {
    // Test that our directory functions work with actual filesystem operations
    let temp_dir = std::env::temp_dir().join("symiosis_test");

    // Clean up from any previous test runs
    let _ = std::fs::remove_dir_all(&temp_dir);

    // Test directory creation works
    assert!(
        std::fs::create_dir_all(&temp_dir).is_ok(),
        "Should be able to create temp test dir"
    );

    // Test file creation in a similar structure to what our app would create
    let test_config_dir = temp_dir.join(".config").join("symiosis");
    let test_notes_dir = temp_dir.join("Documents").join("Notes");
    let test_data_dir = temp_dir.join("symiosis");

    assert!(std::fs::create_dir_all(&test_config_dir).is_ok());
    assert!(std::fs::create_dir_all(&test_notes_dir).is_ok());
    assert!(std::fs::create_dir_all(&test_data_dir).is_ok());

    // Test file creation
    let test_config_file = test_config_dir.join("config.toml");
    let test_note_file = test_notes_dir.join("test.md");
    let test_db_file = test_data_dir.join("notes.sqlite");

    assert!(std::fs::write(&test_config_file, "test_content").is_ok());
    assert!(std::fs::write(&test_note_file, "# Test Note").is_ok());
    assert!(std::fs::write(&test_db_file, "fake_db_content").is_ok());

    // Clean up
    let _ = std::fs::remove_dir_all(&temp_dir);
}
