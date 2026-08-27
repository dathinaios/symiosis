//! Test cleanup utility
//!
//! Manual cleanup test for removing any leftover test directories.
//!
//! Note: Automatic cleanup is now handled by the integration test runner
//! (tests/cleanup_integration.rs) which runs after all unit tests complete.

use super::test_utils::cleanup_all_tmp_directories;

/// Manual cleanup test (can be run independently when needed)
///
/// Run with: `cargo test test_cleanup_all_tmp_directories -- --nocapture`
#[test]
fn test_cleanup_all_tmp_directories() {
    use crate::config::get_config_notes_dir;
    use crate::utilities::paths::get_data_dir;
    use std::fs;

    println!("=== Manual Cleanup Test ===");

    // SAFETY: Assert that we're running in a test environment before any destructive operations
    let notes_dir = get_config_notes_dir();
    let notes_path_str = notes_dir.to_string_lossy();

    if !notes_path_str.contains("/tmp/") && !notes_path_str.contains("tmp") {
        println!(
            "⚠️  SAFETY SKIP: Cleanup test detected non-tmp notes directory: {}",
            notes_path_str
        );
        println!("   This test only runs in test environments to prevent data loss.");
        println!("   To run this test, ensure TestConfigOverride is used or set test environment variables.");
        println!("   Manual cleanup completed (skipped for safety)!");
        return;
    }

    println!(
        "✓ Safety check passed: notes directory is in tmp ({})",
        notes_path_str
    );

    // Show what we're about to clean up
    if let Some(app_data_dir) = get_data_dir() {
        let databases_dir = app_data_dir.join("symiosis").join("databases");
        let backups_dir = app_data_dir.join("symiosis").join("backups");

        println!("Scanning for test directories to clean up...");

        let mut found_any = false;

        if databases_dir.exists() {
            if let Ok(entries) = fs::read_dir(&databases_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        if let Some(dir_name) = path.file_name().and_then(|n| n.to_str()) {
                            if dir_name.starts_with("_tmp") {
                                println!("  Found database dir: {}", dir_name);
                                found_any = true;
                            }
                        }
                    }
                }
            }
        }

        if backups_dir.exists() {
            if let Ok(entries) = fs::read_dir(&backups_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        if let Some(dir_name) = path.file_name().and_then(|n| n.to_str()) {
                            if dir_name.starts_with("_tmp") {
                                println!("  Found backup dir: {}", dir_name);
                                found_any = true;
                            }
                        }
                    }
                }
            }
        }

        if !found_any {
            println!("  No temp directories found - nothing to clean up!");
        }
    }

    // Run the cleanup function
    cleanup_all_tmp_directories().expect("Should cleanup all tmp directories");

    println!("Manual cleanup completed!");
}
