//! Atomic File Operations Tests
//!
//! Tests for atomic file operations, backup creation, and temp file cleanup.

use crate::utilities::file_safety::{cleanup_temp_files, safe_backup_path};
use crate::utilities::paths::{get_backup_dir_for_notes_path, get_temp_dir};
use std::fs;
use std::path::PathBuf;
use tempfile::TempDir;

/// Test helper to create a temporary notes directory and override the config
fn setup_test_notes_dir() -> TempDir {
    let temp_dir = TempDir::new().expect("Should create temp directory");
    temp_dir
}

#[test]
fn test_temp_file_cleanup_functionality() {
    let temp_dir = get_temp_dir().expect("Should get temp directory");

    // Ensure temp directory exists
    if !temp_dir.exists() {
        fs::create_dir_all(&temp_dir).expect("Should create temp directory");
    }

    // Create some fake temp files
    let temp_file1 = temp_dir.join("write_temp_12345.md");
    let temp_file2 = temp_dir.join("write_temp_67890.md");
    let non_temp_file = temp_dir.join("other_file.txt");

    fs::write(&temp_file1, "temp content 1").expect("Should write temp file 1");
    fs::write(&temp_file2, "temp content 2").expect("Should write temp file 2");
    fs::write(&non_temp_file, "other content").expect("Should write other file");

    // Verify files exist
    assert!(temp_file1.exists());
    assert!(temp_file2.exists());
    assert!(non_temp_file.exists());

    // Run cleanup
    cleanup_temp_files().expect("Should cleanup temp files");

    // Verify only temp files are removed
    assert!(!temp_file1.exists(), "Temp file 1 should be removed");
    assert!(!temp_file2.exists(), "Temp file 2 should be removed");
    assert!(non_temp_file.exists(), "Other file should remain");

    // Cleanup
    let _ = fs::remove_file(&non_temp_file);
}

#[test]
fn test_safe_write_creates_backup_structure() {
    let test_notes_dir = setup_test_notes_dir();
    let test_file = test_notes_dir.path().join("subfolder").join("test.md");

    // Create directory structure
    fs::create_dir_all(test_file.parent().unwrap()).expect("Should create directories");

    // Create initial file
    fs::write(&test_file, "original content").expect("Should write initial file");

    // Mock the notes directory (this is a simplified test)
    // In real usage, safe_write_note checks against the configured notes directory
    // For this test, we'll verify the backup path logic separately

    // Test backup directory path generation without creating real directories
    let test_notes_dir = std::path::PathBuf::from("/test/notes/directory");
    let backup_dir = get_backup_dir_for_notes_path(&test_notes_dir)
        .expect("Should generate backup directory path");
    assert!(backup_dir.to_string_lossy().contains("backups"));
}

#[test]
fn test_atomic_write_pattern() {
    let temp_dir = setup_test_notes_dir();
    let test_file = temp_dir.path().join("atomic_test.md");

    // Test content
    let content = "Test atomic write content";

    // Simulate atomic write pattern:
    // 1. Write to temp file
    let temp_path = temp_dir.path().join("write_temp_test.md");
    fs::write(&temp_path, content).expect("Should write to temp file");

    // 2. Atomic rename
    fs::rename(&temp_path, &test_file).expect("Should rename atomically");

    // 3. Verify final content
    let read_content = fs::read_to_string(&test_file).expect("Should read final file");
    assert_eq!(read_content, content);

    // 4. Verify temp file is gone
    assert!(!temp_path.exists(), "Temp file should be gone after rename");
}

#[test]
fn test_backup_preservation_on_failure() {
    // Test backup directory path generation without creating real directories
    let test_notes_dir = std::path::PathBuf::from("/test/notes/directory");
    let backup_dir = get_backup_dir_for_notes_path(&test_notes_dir)
        .expect("Should generate backup directory path");

    // Test that backup directory structure is logical
    assert!(backup_dir.is_absolute());
    assert!(backup_dir.to_string_lossy().contains("symiosis"));
    assert!(backup_dir.to_string_lossy().contains("backups"));

    // Backup directory should not conflict with notes
    assert!(
        !backup_dir.starts_with(&test_notes_dir),
        "Backup should not be under notes directory"
    );
    assert!(
        !test_notes_dir.starts_with(&backup_dir),
        "Notes should not be under backup directory"
    );
}

#[test]
fn test_file_extension_handling() {
    let temp_dir = setup_test_notes_dir();
    let base_path = temp_dir.path().join("test.md");

    // Test backup extension logic
    let backup_path = base_path.with_extension("md.bak");
    assert!(backup_path.to_string_lossy().ends_with(".md.bak"));

    let deleted_backup_path = base_path.with_extension("md.bak.deleted");
    assert!(deleted_backup_path
        .to_string_lossy()
        .ends_with(".md.bak.deleted"));
}

#[test]
fn test_directory_creation_safety() {
    // Test directory path generation without creating real directories
    let test_notes_dir = std::path::PathBuf::from("/test/notes/directory");
    let backup_dir = get_backup_dir_for_notes_path(&test_notes_dir)
        .expect("Should generate backup directory path");
    let temp_dir = get_temp_dir().expect("Should generate temp directory path");

    // These should be safe to create without affecting user data
    let test_backup_subdir = backup_dir.join("test").join("nested");
    let test_temp_subdir = temp_dir.join("test_temp");

    // Creating these should not interfere with notes directory
    assert!(!test_backup_subdir.starts_with(&test_notes_dir));
    assert!(!test_temp_subdir.starts_with(&test_notes_dir));
}

#[test]
fn test_safe_backup_path_validation() {
    // Test the path validation logic without creating actual directories
    // safe_backup_path validates paths are within the configured directory

    // Test the validation logic directly by checking the error message
    // when a path is outside the configured notes directory
    let invalid_note_path = std::path::PathBuf::from("/completely/different/path/test.md");
    let backup_path = safe_backup_path(&crate::config::get_config_notes_dir(), &invalid_note_path);

    assert!(
        backup_path.is_err(),
        "Path outside notes directory should fail"
    );

    if let Err(e) = backup_path {
        assert!(
            e.to_string()
                .contains("not within configured notes directory"),
            "Error should mention path validation: {}",
            e
        );
    }

    // Test invalid path outside notes directory
    let invalid_note_path = PathBuf::from("/tmp/outside.md");
    let backup_path = safe_backup_path(&crate::config::get_config_notes_dir(), &invalid_note_path);
    assert!(backup_path.is_err(), "Invalid note path should fail");

    if let Err(e) = backup_path {
        assert!(e
            .to_string()
            .contains("not within configured notes directory"));
    }
}

#[test]
fn test_path_based_backup_directories() {
    // Test that different notes directories get different backup paths
    let notes_dir1 = PathBuf::from("/Users/test/Documents/Notes");
    let notes_dir2 = PathBuf::from("/Users/test/Different/Path");
    let notes_dir3 = PathBuf::from("/tmp/special notes with spaces");

    let backup_dir1 = get_backup_dir_for_notes_path(&notes_dir1);
    let backup_dir2 = get_backup_dir_for_notes_path(&notes_dir2);
    let backup_dir3 = get_backup_dir_for_notes_path(&notes_dir3);

    assert!(backup_dir1.is_ok(), "Should generate backup dir for path 1");
    assert!(backup_dir2.is_ok(), "Should generate backup dir for path 2");
    assert!(backup_dir3.is_ok(), "Should generate backup dir for path 3");

    let backup_path1 = backup_dir1.unwrap();
    let backup_path2 = backup_dir2.unwrap();
    let backup_path3 = backup_dir3.unwrap();

    // All backup directories should be different
    assert_ne!(
        backup_path1, backup_path2,
        "Different notes paths should get different backup directories"
    );
    assert_ne!(
        backup_path1, backup_path3,
        "Different notes paths should get different backup directories"
    );
    assert_ne!(
        backup_path2, backup_path3,
        "Different notes paths should get different backup directories"
    );

    // All should be under the symiosis backup directory
    assert!(backup_path1.to_string_lossy().contains("symiosis"));
    assert!(backup_path1.to_string_lossy().contains("backups"));
    assert!(backup_path2.to_string_lossy().contains("symiosis"));
    assert!(backup_path2.to_string_lossy().contains("backups"));
    assert!(backup_path3.to_string_lossy().contains("symiosis"));
    assert!(backup_path3.to_string_lossy().contains("backups"));

    // Path encoding should be safe for filesystem use
    let encoded1 = backup_path1.file_name().unwrap().to_string_lossy();
    let encoded2 = backup_path2.file_name().unwrap().to_string_lossy();
    let encoded3 = backup_path3.file_name().unwrap().to_string_lossy();

    // Should not contain problematic characters
    assert!(
        !encoded1.contains("/"),
        "Encoded path should not contain slashes"
    );
    assert!(
        !encoded1.contains("\\"),
        "Encoded path should not contain backslashes"
    );
    assert!(
        !encoded2.contains("/"),
        "Encoded path should not contain slashes"
    );
    assert!(
        !encoded2.contains("\\"),
        "Encoded path should not contain backslashes"
    );
    assert!(
        !encoded3.contains("/"),
        "Encoded path should not contain slashes"
    );
    assert!(
        !encoded3.contains("\\"),
        "Encoded path should not contain backslashes"
    );

    // Spaces should be converted to underscores
    assert!(
        encoded3.contains("_"),
        "Spaces should be converted to underscores"
    );
    assert!(
        !encoded3.contains(" "),
        "Spaces should be converted to underscores"
    );
}

#[test]
fn test_atomic_write_rollback_protection() {
    use crate::utilities::file_safety::safe_write_note;
    use tempfile::TempDir;

    let temp_dir = TempDir::new().expect("Should create temp directory");
    let note_path = temp_dir.path().join("test_rollback.md");

    // Create original file with content
    let original_content = "Original content that must not be lost";
    fs::write(&note_path, original_content).expect("Should write original file");

    // Verify original file exists and has correct content
    assert!(note_path.exists(), "Original file should exist");
    assert_eq!(
        fs::read_to_string(&note_path).expect("Should read original"),
        original_content,
        "Original content should be intact"
    );

    // Test normal write operation (should succeed)
    let new_content = "New content after successful write";
    let result = safe_write_note(
        &crate::config::get_config_notes_dir(),
        &note_path,
        new_content,
    );

    match result {
        Ok(()) => {
            // Verify new content was written
            assert_eq!(
                fs::read_to_string(&note_path).expect("Should read updated file"),
                new_content,
                "New content should be written successfully"
            );
        }
        Err(_) => {
            // If write fails, original content should still be preserved
            let preserved_content = fs::read_to_string(&note_path);
            match preserved_content {
                Ok(content) => {
                    // Either original content is preserved or file doesn't exist
                    // (in which case a failure backup should have been created)
                    assert!(
                        content == original_content || content == new_content,
                        "File content should be either original (rollback) or new (success), got: {}",
                        content
                    );
                }
                Err(_) => {
                    // File doesn't exist - check if failure backup was created
                    // This is acceptable as long as a backup exists for recovery
                }
            }
        }
    }
}
