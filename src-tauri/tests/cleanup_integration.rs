//! Integration Test Runner with Deterministic Cleanup
//!
//! This test runner uses `harness = false` to provide deterministic test sequencing:
//! 1. Run all unit tests first
//! 2. Only after all tests pass, run cleanup
//! 3. Verify cleanup succeeded

use std::process::{Command, Stdio};

fn main() {
    println!("=== Integration Test Runner with Cleanup ===");

    // Step 1: Run all unit tests (excluding this integration test) with parallel execution
    println!("Running unit tests...");
    let unit_test_result = Command::new("cargo")
        .args(["test", "--lib"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .status()
        .expect("Failed to execute cargo test");

    if !unit_test_result.success() {
        eprintln!("Unit tests failed, skipping cleanup");
        std::process::exit(1);
    }

    println!("All unit tests passed!");

    // Step 2: Run cleanup after all tests complete
    println!("Running cleanup...");
    match cleanup_all_tmp_directories() {
        Ok(()) => println!("Cleanup completed successfully"),
        Err(e) => {
            eprintln!("Cleanup failed: {}", e);
            std::process::exit(1);
        }
    }

    // Step 3: Verify cleanup worked
    println!("Verifying cleanup...");
    match verify_no_tmp_directories_remain() {
        Ok(()) => println!("Verification passed - no temp directories remain"),
        Err(e) => {
            eprintln!("Verification failed: {}", e);
            std::process::exit(1);
        }
    }

    println!("=== Integration test runner completed successfully ===");
}

fn cleanup_all_tmp_directories() -> Result<(), Box<dyn std::error::Error>> {
    // Use the existing cleanup function from test_utils
    // Import the module's functions
    use std::fs;

    // Get the symiosis app support directory using the same method as production code
    let app_data_dir = get_data_dir().ok_or("Failed to get app data directory")?;
    let symiosis_dir = app_data_dir.join("symiosis");

    let mut cleaned_count = 0;

    // Clean up databases directory
    let databases_dir = symiosis_dir.join("databases");
    if databases_dir.exists() {
        if let Ok(entries) = fs::read_dir(&databases_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    if let Some(dir_name) = path.file_name().and_then(|n| n.to_str()) {
                        if dir_name.starts_with("_tmp") {
                            println!("  Removing database dir: {}", dir_name);
                            let _ = fs::remove_dir_all(&path);
                            cleaned_count += 1;
                        }
                    }
                }
            }
        }
    }

    // Clean up backups directory
    let backups_dir = symiosis_dir.join("backups");
    if backups_dir.exists() {
        if let Ok(entries) = fs::read_dir(&backups_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    if let Some(dir_name) = path.file_name().and_then(|n| n.to_str()) {
                        if dir_name.starts_with("_tmp") {
                            println!("  Removing backup dir: {}", dir_name);
                            let _ = fs::remove_dir_all(&path);
                            cleaned_count += 1;
                        }
                    }
                }
            }
        }
    }

    println!("Cleaned up {} temporary directories", cleaned_count);
    Ok(())
}

fn verify_no_tmp_directories_remain() -> Result<(), Box<dyn std::error::Error>> {
    let app_data_dir = get_data_dir().ok_or("Failed to get app data directory")?;
    let symiosis_dir = app_data_dir.join("symiosis");

    let mut found_tmp_dirs = Vec::new();

    // Check databases directory
    let databases_dir = symiosis_dir.join("databases");
    if databases_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&databases_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    if let Some(dir_name) = path.file_name().and_then(|n| n.to_str()) {
                        if dir_name.starts_with("_tmp") {
                            found_tmp_dirs.push(format!("databases/{}", dir_name));
                        }
                    }
                }
            }
        }
    }

    // Check backups directory
    let backups_dir = symiosis_dir.join("backups");
    if backups_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&backups_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    if let Some(dir_name) = path.file_name().and_then(|n| n.to_str()) {
                        if dir_name.starts_with("_tmp") {
                            found_tmp_dirs.push(format!("backups/{}", dir_name));
                        }
                    }
                }
            }
        }
    }

    if !found_tmp_dirs.is_empty() {
        return Err(format!(
            "Found {} remaining temporary directories: {}",
            found_tmp_dirs.len(),
            found_tmp_dirs.join(", ")
        )
        .into());
    }

    Ok(())
}

fn get_data_dir() -> Option<std::path::PathBuf> {
    if let Some(home_dir) = home::home_dir() {
        #[cfg(target_os = "macos")]
        return Some(home_dir.join("Library").join("Application Support"));

        #[cfg(target_os = "windows")]
        return std::env::var("APPDATA").ok().map(std::path::PathBuf::from);

        #[cfg(target_os = "linux")]
        return Some(home_dir.join(".local").join("share"));

        #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
        return Some(home_dir.join(".local").join("share"));
    }
    None
}
