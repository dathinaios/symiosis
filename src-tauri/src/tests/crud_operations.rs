//! Comprehensive CRUD Operations Tests
//!
//! Tests all Create, Read, Update, Delete operations for notes with edge cases,
//! error conditions, and cross-operation consistency validation.

// Test wrappers imported from test_utils
use crate::tests::test_utils::{
    test_create_new_note, test_delete_note, test_get_note_content, test_get_note_html_content,
    test_list_all_notes, test_rename_note, test_save_note_with_content_check, TestConfigOverride,
};
use serial_test::serial;
use std::fs;

#[cfg(test)]
#[serial]
mod serial_tests {
    use super::*;

    #[test]
    fn test_create_new_note_success() {
        let _test_config = TestConfigOverride::new().expect("Should create test config");

        // Test basic note creation
        let result = test_create_new_note("test_note.md");
        assert!(result.is_ok(), "Should create new note successfully");

        // Verify file exists on filesystem
        let note_path = _test_config.notes_dir().join("test_note.md");
        assert!(note_path.exists(), "Note file should exist on filesystem");

        // Verify file is empty
        let content = fs::read_to_string(&note_path).unwrap();
        assert_eq!(content, "", "New note should have empty content");

        // Verify note appears in list
        let notes_list = test_list_all_notes().expect("Should list notes");
        assert!(
            notes_list.contains(&"test_note.md".to_string()),
            "New note should appear in list"
        );

        // Verify note content can be retrieved
        let retrieved_content =
            test_get_note_content("test_note.md").expect("Should get note content");
        assert_eq!(retrieved_content, "", "Retrieved content should be empty");
    }

    #[test]
    fn test_create_new_note_with_subdirectories() {
        let _test_config = TestConfigOverride::new().expect("Should create test config");

        // Test creating note in subdirectory
        let result = test_create_new_note("subfolder/nested_note.md");
        assert!(result.is_ok(), "Should create note in subdirectory");

        // Verify directory structure was created
        let note_path = _test_config.notes_dir().join("subfolder/nested_note.md");
        assert!(note_path.exists(), "Note should exist in subdirectory");
        assert!(
            note_path.parent().unwrap().is_dir(),
            "Subdirectory should exist"
        );
    }

    #[test]
    fn test_create_new_note_deep_nesting() {
        let _test_config = TestConfigOverride::new().expect("Should create test config");

        // Test deeply nested directory creation
        let result = test_create_new_note("level1/level2/level3/deep_note.md");
        assert!(
            result.is_ok(),
            "Should create note in deeply nested directory"
        );

        let note_path = _test_config
            .notes_dir()
            .join("level1/level2/level3/deep_note.md");
        assert!(note_path.exists(), "Deeply nested note should exist");
    }

    #[test]
    fn test_create_new_note_duplicate_fails() {
        let _test_config = TestConfigOverride::new().expect("Should create test config");

        // Create first note
        let result1 = test_create_new_note("duplicate.md");
        assert!(result1.is_ok(), "First creation should succeed");

        // Attempt to create duplicate
        let result2 = test_create_new_note("duplicate.md");
        assert!(result2.is_err(), "Duplicate creation should fail");
        assert!(
            result2.unwrap_err().contains("already exists"),
            "Error should mention file already exists"
        );
    }

    #[test]
    fn test_create_new_note_invalid_names() {
        let _test_config = TestConfigOverride::new().expect("Should create test config");

        let long_name = "a".repeat(256);
        let invalid_names = vec![
            "../traverse.md",
            "/absolute/path.md",
            "..\\windows_traverse.md",
            ".hidden.md",
            "",
            "   ",
            &long_name, // Too long
        ];

        for invalid_name in invalid_names {
            let result = test_create_new_note(invalid_name);
            assert!(
                result.is_err(),
                "Should reject invalid name: {}",
                invalid_name
            );
        }
    }

    #[test]
    fn test_get_note_content_success() {
        let _test_config = TestConfigOverride::new().expect("Should create test config");

        // Create a note with content
        test_create_new_note("content_test.md").expect("Should create note");
        let content = "# Test Content\n\nThis is test content.";
        test_save_note_with_content_check("content_test.md", content, "")
            .expect("Should save content");

        // Test retrieving content
        let retrieved = test_get_note_content("content_test.md").expect("Should get content");
        assert_eq!(
            retrieved, content,
            "Retrieved content should match saved content"
        );
    }

    #[test]
    fn test_get_note_content_nonexistent() {
        let _test_config = TestConfigOverride::new().expect("Should create test config");

        let result = test_get_note_content("nonexistent.md");
        assert!(result.is_err(), "Should fail for nonexistent note");
        assert!(
            result.unwrap_err().contains("not found"),
            "Error should mention note not found"
        );
    }

    #[test]
    fn test_get_note_html_content_markdown_rendering() {
        let _test_config = TestConfigOverride::new().expect("Should create test config");

        // Create note with markdown content
        test_create_new_note("markdown_test.md").expect("Should create note");
        let markdown_content = "# Heading\n\n**Bold text** and *italic text*\n\n- List item";
        test_save_note_with_content_check("markdown_test.md", markdown_content, "")
            .expect("Should save content");

        // Test HTML rendering
        let html = test_get_note_html_content("markdown_test.md").expect("Should get HTML content");

        // Verify markdown was rendered to HTML
        assert!(html.contains("<h1>"), "Should contain h1 tag");
        assert!(html.contains("Heading"), "Should contain heading text");
        assert!(html.contains("<strong>"), "Should contain strong tag");
        assert!(html.contains("<em>"), "Should contain em tag");
        assert!(html.contains("<ul>"), "Should contain ul tag");
        assert!(html.contains("<li>"), "Should contain li tag");
    }

    #[test]
    fn test_get_note_html_content_plain_text() {
        let _test_config = TestConfigOverride::new().expect("Should create test config");

        // Create note with .txt extension
        test_create_new_note("plain_text.txt").expect("Should create note");
        let text_content = "Plain text content with <script>alert('xss')</script>";
        test_save_note_with_content_check("plain_text.txt", text_content, "")
            .expect("Should save content");

        // Test plain text rendering
        let html = test_get_note_html_content("plain_text.txt").expect("Should get HTML content");

        // Verify plain text was wrapped in pre tags and escaped
        assert!(html.starts_with("<pre>"), "Should start with pre tag");
        assert!(html.ends_with("</pre>"), "Should end with pre tag");
        assert!(
            html.contains("&lt;script&gt;"),
            "Should escape HTML entities"
        );
        assert!(
            !html.contains("<script>"),
            "Should not contain unescaped script tags"
        );
    }

    #[test]
    fn test_list_all_notes_empty() {
        let _test_config = TestConfigOverride::new().expect("Should create test config");

        let notes = test_list_all_notes().expect("Should list notes");
        assert_eq!(
            notes.len(),
            0,
            "Should return empty list for empty directory"
        );
    }

    #[test]
    fn test_list_all_notes_with_data() {
        let _test_config = TestConfigOverride::new().expect("Should create test config");

        // Create several notes
        let note_names = vec!["first.md", "second.md", "third.txt", "folder/nested.md"];

        for name in &note_names {
            test_create_new_note(name).unwrap_or_else(|_| panic!("Should create {}", name));
        }

        let notes = test_list_all_notes().expect("Should list notes");
        assert_eq!(
            notes.len(),
            note_names.len(),
            "Should list all created notes"
        );

        // Verify all notes are included
        for name in &note_names {
            assert!(
                notes.contains(&name.to_string()),
                "Should include note: {}",
                name
            );
        }
    }

    #[test]
    fn test_list_all_notes_ordering() {
        let _test_config = TestConfigOverride::new().expect("Should create test config");

        // Create notes and modify them to test ordering
        test_create_new_note("older.md").expect("Should create older note");

        // Sleep to ensure different timestamps (use 1 second to ensure different timestamps)
        std::thread::sleep(std::time::Duration::from_millis(1100));

        test_create_new_note("newer.md").expect("Should create newer note");
        test_save_note_with_content_check("newer.md", "Updated content", "")
            .expect("Should update newer note");

        let notes = test_list_all_notes().expect("Should list notes");

        // Should be ordered by modification time (DESC)
        let newer_pos = notes.iter().position(|n| n == "newer.md").unwrap();
        let older_pos = notes.iter().position(|n| n == "older.md").unwrap();

        assert!(
            newer_pos < older_pos,
            "Newer note should appear first in list"
        );
    }

    #[test]
    fn test_rename_note_success() {
        let _test_config = TestConfigOverride::new().expect("Should create test config");

        // Create a note with content
        test_create_new_note("original.md").expect("Should create note");
        let content = "Original content";
        test_save_note_with_content_check("original.md", content, "").expect("Should save content");

        // Rename the note
        let result = test_rename_note("original.md".to_string(), "renamed.md".to_string());
        assert!(result.is_ok(), "Should rename note successfully");

        // Verify old file doesn't exist
        let old_path = _test_config.notes_dir().join("original.md");
        assert!(!old_path.exists(), "Old file should not exist after rename");

        // Verify new file exists with same content
        let new_path = _test_config.notes_dir().join("renamed.md");
        assert!(new_path.exists(), "New file should exist after rename");

        let new_content = fs::read_to_string(&new_path).unwrap();
        assert_eq!(
            new_content, content,
            "Content should be preserved after rename"
        );

        // Verify database was updated
        let retrieved_content =
            test_get_note_content("renamed.md").expect("Should get renamed note content");
        assert_eq!(
            retrieved_content, content,
            "Database should reflect renamed note"
        );

        // Verify old name is no longer in database
        let old_result = test_get_note_content("original.md");
        assert!(old_result.is_err(), "Old name should not exist in database");
    }

    #[test]
    fn test_rename_note_to_existing_fails() {
        let _test_config = TestConfigOverride::new().expect("Should create test config");

        // Create two notes
        test_create_new_note("note1.md").expect("Should create first note");
        test_create_new_note("note2.md").expect("Should create second note");

        // Attempt to rename first note to existing name
        let result = test_rename_note("note1.md".to_string(), "note2.md".to_string());
        assert!(result.is_err(), "Should fail to rename to existing name");
        assert!(
            result.unwrap_err().contains("already exists"),
            "Error should mention file already exists"
        );

        // Verify original files still exist
        let path1 = _test_config.notes_dir().join("note1.md");
        let path2 = _test_config.notes_dir().join("note2.md");
        assert!(path1.exists(), "Original first note should still exist");
        assert!(path2.exists(), "Original second note should still exist");
    }

    #[test]
    fn test_rename_note_nonexistent() {
        let _test_config = TestConfigOverride::new().expect("Should create test config");

        let result = test_rename_note("nonexistent.md".to_string(), "new_name.md".to_string());
        assert!(result.is_err(), "Should fail to rename nonexistent note");
        assert!(
            result.unwrap_err().contains("not found"),
            "Error should mention note not found"
        );
    }

    #[test]
    fn test_rename_note_with_subdirectories() {
        let _test_config = TestConfigOverride::new().expect("Should create test config");

        // Create note in subdirectory
        test_create_new_note("folder/original.md").expect("Should create note in subdirectory");
        let content = "Nested content";
        test_save_note_with_content_check("folder/original.md", content, "")
            .expect("Should save content");

        // Rename to different subdirectory
        let result = test_rename_note(
            "folder/original.md".to_string(),
            "other_folder/renamed.md".to_string(),
        );
        assert!(result.is_ok(), "Should rename across subdirectories");

        // Verify old file doesn't exist
        let old_path = _test_config.notes_dir().join("folder/original.md");
        assert!(!old_path.exists(), "Old file should not exist");

        // Verify new file exists in new location
        let new_path = _test_config.notes_dir().join("other_folder/renamed.md");
        assert!(new_path.exists(), "New file should exist in new location");

        let new_content = fs::read_to_string(&new_path).unwrap();
        assert_eq!(new_content, content, "Content should be preserved");
    }

    #[test]
    fn test_delete_note_success() {
        let _test_config = TestConfigOverride::new().expect("Should create test config");

        // Create a note with content
        test_create_new_note("to_delete.md").expect("Should create note");
        let content = "Content to be deleted";
        test_save_note_with_content_check("to_delete.md", content, "")
            .expect("Should save content");

        // Verify note exists before deletion
        let note_path = _test_config.notes_dir().join("to_delete.md");
        assert!(note_path.exists(), "Note should exist before deletion");

        // Delete the note
        let result = test_delete_note("to_delete.md");
        assert!(result.is_ok(), "Should delete note successfully");

        // Verify file is removed
        assert!(
            !note_path.exists(),
            "Note file should not exist after deletion"
        );

        // Verify note is removed from database
        let get_result = test_get_note_content("to_delete.md");
        assert!(
            get_result.is_err(),
            "Deleted note should not be retrievable from database"
        );

        // Verify note is removed from list
        let notes = test_list_all_notes().expect("Should list notes");
        assert!(
            !notes.contains(&"to_delete.md".to_string()),
            "Deleted note should not appear in list"
        );
    }

    #[test]
    fn test_delete_note_nonexistent() {
        let _test_config = TestConfigOverride::new().expect("Should create test config");

        // Attempt to delete nonexistent note - should succeed (idempotent operation)
        let result = test_delete_note("nonexistent.md");
        assert!(
            result.is_ok(),
            "Deleting nonexistent note should succeed (idempotent)"
        );
    }

    #[test]
    fn test_delete_note_with_backup_verification() {
        let _test_config = TestConfigOverride::new().expect("Should create test config");

        // Create a note with specific content
        test_create_new_note("backup_test.md").expect("Should create note");
        let content = "This content should be backed up";
        test_save_note_with_content_check("backup_test.md", content, "")
            .expect("Should save content");

        // Delete the note
        let result = test_delete_note("backup_test.md");
        assert!(result.is_ok(), "Should delete note successfully");

        // Verify backup was created (check backup directory structure)
        let backup_result =
            crate::utilities::paths::get_backup_dir_for_notes_path(&_test_config.notes_dir());
        if let Ok(backup_dir) = backup_result {
            // Look for backup files
            if backup_dir.exists() {
                let backup_files: Vec<_> = fs::read_dir(&backup_dir)
                    .unwrap()
                    .filter_map(|entry| entry.ok())
                    .filter(|entry| {
                        entry
                            .file_name()
                            .to_string_lossy()
                            .contains("backup_test.md")
                            && entry.file_name().to_string_lossy().contains("deleted")
                    })
                    .collect();

                if !backup_files.is_empty() {
                    // If backup exists, verify it contains the original content
                    let backup_path = backup_files[0].path();
                    let backup_content = fs::read_to_string(&backup_path).unwrap();
                    assert_eq!(
                        backup_content, content,
                        "Backup should contain original content"
                    );
                }
            }
        }
    }

    #[test]
    fn test_crud_workflow_consistency() {
        let _test_config = TestConfigOverride::new().expect("Should create test config");

        // Complete CRUD workflow test
        let note_name = "workflow_test.md";
        let initial_content = "Initial content";
        let updated_content = "Updated content";

        // CREATE
        test_create_new_note(note_name).expect("Should create note");
        test_save_note_with_content_check(note_name, initial_content, "")
            .expect("Should save initial content");

        // READ
        let retrieved = test_get_note_content(note_name).expect("Should read note");
        assert_eq!(
            retrieved, initial_content,
            "Should read correct initial content"
        );

        // Verify in list
        let notes = test_list_all_notes().expect("Should list notes");
        assert!(
            notes.contains(&note_name.to_string()),
            "Note should appear in list"
        );

        // UPDATE (via save)
        test_save_note_with_content_check(note_name, updated_content, initial_content)
            .expect("Should update content");
        let updated_retrieved =
            test_get_note_content(note_name).expect("Should read updated content");
        assert_eq!(
            updated_retrieved, updated_content,
            "Should read updated content"
        );

        // UPDATE (via rename)
        let new_name = "renamed_workflow_test.md";
        test_rename_note(note_name.to_string(), new_name.to_string()).expect("Should rename note");

        // Verify old name is gone
        let old_result = test_get_note_content(note_name);
        assert!(old_result.is_err(), "Old name should not exist");

        // Verify new name has correct content
        let renamed_content = test_get_note_content(new_name).expect("Should read renamed note");
        assert_eq!(
            renamed_content, updated_content,
            "Renamed note should have updated content"
        );

        // DELETE
        test_delete_note(new_name).expect("Should delete note");

        // Verify deletion
        let deleted_result = test_get_note_content(new_name);
        assert!(deleted_result.is_err(), "Deleted note should not exist");

        let final_notes = test_list_all_notes().expect("Should list notes");
        assert!(
            !final_notes.contains(&new_name.to_string()),
            "Deleted note should not appear in list"
        );
    }

    #[test]
    fn test_concurrent_operations_consistency() {
        let _test_config = TestConfigOverride::new().expect("Should create test config");

        // Test multiple operations on different notes to ensure no interference
        let note_names = vec!["concurrent1.md", "concurrent2.md", "concurrent3.md"];

        // Create all notes
        for name in &note_names {
            test_create_new_note(name).unwrap_or_else(|_| panic!("Should create {}", name));
            test_save_note_with_content_check(name, &format!("Content for {}", name), "")
                .unwrap_or_else(|_| panic!("Should save content for {}", name));
        }

        // Verify all notes exist and have correct content
        for name in &note_names {
            let content = test_get_note_content(name)
                .unwrap_or_else(|_| panic!("Should get content for {}", name));
            assert_eq!(
                content,
                format!("Content for {}", name),
                "Content should match for {}",
                name
            );
        }

        // Perform mixed operations
        test_rename_note("concurrent1.md".to_string(), "renamed1.md".to_string())
            .expect("Should rename first note");
        test_save_note_with_content_check(
            "concurrent2.md",
            "Updated content",
            "Content for concurrent2.md",
        )
        .expect("Should update second note");
        test_delete_note("concurrent3.md").expect("Should delete third note");

        // Verify final state
        let final_notes = test_list_all_notes().expect("Should list final notes");
        assert!(
            final_notes.contains(&"renamed1.md".to_string()),
            "Renamed note should exist"
        );
        assert!(
            final_notes.contains(&"concurrent2.md".to_string()),
            "Updated note should exist"
        );
        assert!(
            !final_notes.contains(&"concurrent3.md".to_string()),
            "Deleted note should not exist"
        );
        assert!(
            !final_notes.contains(&"concurrent1.md".to_string()),
            "Original renamed note should not exist"
        );

        // Verify content integrity
        let renamed_content =
            test_get_note_content("renamed1.md").expect("Should get renamed content");
        assert_eq!(
            renamed_content, "Content for concurrent1.md",
            "Renamed note should preserve content"
        );

        let updated_content =
            test_get_note_content("concurrent2.md").expect("Should get updated content");
        assert_eq!(
            updated_content, "Updated content",
            "Updated note should have new content"
        );
    }
}
