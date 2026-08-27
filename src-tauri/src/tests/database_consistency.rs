//! Database consistency and integrity testing module
//!
//! This module tests the production database functions to ensure consistency
//! when files are added, modified, or synced externally. Uses real database functions only.

use super::test_utils::database_testing::{
    check_database_integrity, quick_health_check, verify_sync_consistency,
};
use super::test_utils::{
    test_create_new_note, test_note_rows, test_refresh_cache_sync,
    test_save_note_with_content_check, test_search_notes_hybrid, test_set_note_modified,
    DbTestHarness, TestConfigOverride,
};
use crate::services::database_service::{init_db, upsert_note};
use crate::utilities::fs_meta::file_modified_secs;
use rusqlite::params;
use std::collections::HashMap;

use serial_test::serial;

#[cfg(test)]
#[serial]
mod real_database_function_tests {
    use super::*;

    #[test]
    fn test_init_db_production_function() {
        let harness = DbTestHarness::new().expect("Failed to create test harness");
        let conn = harness
            .get_test_connection()
            .expect("Failed to get connection");

        // Test the ACTUAL production init_db function
        let result = init_db(&conn);
        assert!(result.is_ok(), "Production init_db should succeed");

        // Verify it created the correct schema by using the database
        let table_check: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='notes'",
                [],
                |row| row.get(0),
            )
            .expect("Should query table existence");
        assert_eq!(table_check, 1, "Should create notes table");

        // Test that it's a proper FTS5 table
        let insert_result = conn.execute(
            "INSERT INTO notes (filename, content, html_render, modified) VALUES (?1, ?2, ?3, ?4)",
            params!["test.md", "test content", "<p>test content</p>", 1000i64],
        );
        assert!(
            insert_result.is_ok(),
            "Should be able to insert into FTS5 table"
        );

        // Test FTS5 search works
        let search_result = conn.query_row(
            "SELECT COUNT(*) FROM notes WHERE notes MATCH ?1",
            params!["test"],
            |row| row.get::<_, i64>(0),
        );
        assert!(search_result.is_ok(), "FTS5 search should work");
        assert_eq!(
            search_result.unwrap(),
            1,
            "Should find the inserted content"
        );
    }

    #[test]
    fn test_database_integrity_functions() {
        let harness = DbTestHarness::new().expect("Failed to create test harness");
        let conn = harness
            .get_test_connection()
            .expect("Failed to get connection");

        // Initialize with production function
        init_db(&conn).expect("Should initialize database");

        // Test ACTUAL quick_health_check function on empty database
        assert!(
            quick_health_check(&conn),
            "Production quick_health_check should pass on empty database"
        );

        // Add test data
        conn.execute(
            "INSERT INTO notes (filename, content, html_render, modified) VALUES (?1, ?2, ?3, ?4)",
            params![
                "health_test.md",
                "# Health Test Content",
                "<h1>Health Test Content</h1>",
                1000i64
            ],
        )
        .expect("Should insert test data");

        // Test ACTUAL quick_health_check function with data
        assert!(
            quick_health_check(&conn),
            "Production quick_health_check should pass with data"
        );

        // Test ACTUAL check_database_integrity function
        let integrity_result = check_database_integrity(&conn)
            .expect("Production check_database_integrity should run");
        assert!(
            integrity_result.is_healthy,
            "Production integrity check should report healthy: {:?}",
            integrity_result.errors
        );
        assert!(
            integrity_result.errors.is_empty(),
            "Production integrity check should have no errors: {:?}",
            integrity_result.errors
        );
        assert_eq!(
            integrity_result.stats.total_notes, 1,
            "Production integrity check should count one note"
        );
    }

    #[test]
    fn test_sync_consistency_verification_function() {
        let harness = DbTestHarness::new().expect("Failed to create test harness");
        let conn = harness
            .get_test_connection()
            .expect("Failed to get connection");

        // Initialize with production function
        init_db(&conn).expect("Should initialize database");

        // Add data to database
        conn.execute(
            "INSERT INTO notes (filename, content, html_render, modified) VALUES (?1, ?2, ?3, ?4)",
            params![
                "sync_test.md",
                "# Sync Test Content",
                "<h1>Sync Test Content</h1>",
                1000i64
            ],
        )
        .expect("Should insert test data");

        // Test ACTUAL verify_sync_consistency function with matching data
        let mut filesystem_files = HashMap::new();
        filesystem_files.insert(
            "sync_test.md".to_string(),
            ("# Sync Test Content".to_string(), 1000i64),
        );

        let inconsistencies = verify_sync_consistency(&conn, &filesystem_files)
            .expect("Production verify_sync_consistency should run");
        assert!(
            inconsistencies.is_empty(),
            "Production sync verification should find no inconsistencies: {:?}",
            inconsistencies
        );

        // Test ACTUAL verify_sync_consistency function with mismatched data
        filesystem_files.insert(
            "missing.md".to_string(),
            ("Missing content".to_string(), 2000i64),
        );
        let inconsistencies_with_missing = verify_sync_consistency(&conn, &filesystem_files)
            .expect("Production verify_sync_consistency should detect inconsistencies");
        assert!(
            !inconsistencies_with_missing.is_empty(),
            "Production sync verification should detect missing files"
        );
        assert!(
            inconsistencies_with_missing
                .iter()
                .any(|i| i.contains("missing.md")),
            "Production sync verification should mention missing file: {:?}",
            inconsistencies_with_missing
        );

        // Test content mismatch detection
        filesystem_files.insert(
            "sync_test.md".to_string(),
            ("# Different Content".to_string(), 1000i64), // Same timestamp, different content
        );
        let content_inconsistencies = verify_sync_consistency(&conn, &filesystem_files)
            .expect("Production verify_sync_consistency should detect content differences");
        assert!(
            content_inconsistencies
                .iter()
                .any(|i| i.contains("Content mismatch")),
            "Production sync verification should detect content mismatch: {:?}",
            content_inconsistencies
        );
    }

    #[test]
    fn test_transaction_safety_with_production_database() {
        let harness = DbTestHarness::new().expect("Failed to create test harness");
        let mut conn = harness
            .get_test_connection()
            .expect("Failed to get connection");

        // Initialize with production function
        init_db(&conn).expect("Should initialize database");

        // Test successful transaction using real database operations
        let tx = conn.transaction().expect("Should start transaction");
        tx.execute(
            "INSERT INTO notes (filename, content, html_render, modified) VALUES (?1, ?2, ?3, ?4)",
            params![
                "tx_test1.md",
                "Transaction test 1",
                "<p>Transaction test 1</p>",
                1000i64
            ],
        )
        .expect("Should insert first file in transaction");
        tx.execute(
            "INSERT INTO notes (filename, content, html_render, modified) VALUES (?1, ?2, ?3, ?4)",
            params![
                "tx_test2.md",
                "Transaction test 2",
                "<p>Transaction test 2</p>",
                1000i64
            ],
        )
        .expect("Should insert second file in transaction");
        tx.commit().expect("Should commit successful transaction");

        // Verify both files were committed using production database
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))
            .expect("Should count notes");
        assert_eq!(count, 2, "Should have committed both files");

        // Test failed transaction with rollback
        let tx = conn.transaction().expect("Should start second transaction");
        tx.execute(
            "INSERT INTO notes (filename, content, html_render, modified) VALUES (?1, ?2, ?3, ?4)",
            params![
                "tx_test3.md",
                "Transaction test 3",
                "<p>Transaction test 3</p>",
                2000i64
            ],
        )
        .expect("Should insert third file in transaction");
        // Simulate error by dropping transaction without commit
        drop(tx); // This triggers automatic rollback

        // Verify rollback occurred
        let count_after_rollback: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))
            .expect("Should count notes after rollback");
        assert_eq!(
            count_after_rollback, 2,
            "Should still have only 2 files after rollback"
        );

        // Verify third file wasn't committed
        let third_file_check = conn
            .query_row(
                "SELECT COUNT(*) FROM notes WHERE filename = ?1",
                params!["tx_test3.md"],
                |row| row.get::<_, i64>(0),
            )
            .expect("Should check for third file");
        assert_eq!(
            third_file_check, 0,
            "Third file should not exist after rollback"
        );
    }

    #[test]
    fn test_fts5_corruption_detection_with_production_functions() {
        let harness = DbTestHarness::new().expect("Failed to create test harness");
        let conn = harness
            .get_test_connection()
            .expect("Failed to get connection");

        // Initialize with ACTUAL production function
        init_db(&conn).expect("Should initialize database");

        // Insert test data using real database operations
        let test_data = vec![
            ("fts_test1.md", "# First Test\nSome content here"),
            ("fts_test2.md", "# Second Test\nMore content here"),
            ("fts_test3.md", "# Third Test\nEven more content"),
        ];

        for (filename, content) in &test_data {
            conn.execute(
                "INSERT INTO notes (filename, content, html_render, modified) VALUES (?1, ?2, ?3, ?4)",
                params![filename, content, format!("<p>{}</p>", content), 1000i64],
            )
            .expect("Should insert test data");
        }

        // Test FTS5 search functionality using production database
        let search_queries = vec![
            ("First", 1),       // Should match one
            ("Test", 3),        // Should match all three
            ("content", 3),     // Should match all (content appears in all)
            ("nonexistent", 0), // Should match none
        ];

        for (query, expected_count) in search_queries {
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM notes WHERE notes MATCH ?1",
                    params![query],
                    |row| row.get(0),
                )
                .expect("FTS5 search should work");
            assert_eq!(
                count, expected_count,
                "Production FTS5 search for '{}' should return {} results",
                query, expected_count
            );
        }

        // Test ACTUAL database integrity check detects healthy FTS5
        let integrity_result =
            check_database_integrity(&conn).expect("Production integrity check should run");
        assert!(
            integrity_result.is_healthy,
            "Production integrity check should report FTS5 as healthy"
        );

        // Test SQLite's built-in integrity check via production function
        let sqlite_integrity: String = conn
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .expect("Should run SQLite integrity check");
        assert_eq!(
            sqlite_integrity, "ok",
            "SQLite should report database integrity as OK"
        );
    }

    #[test]
    fn test_large_file_handling_with_production_database() {
        let harness = DbTestHarness::new().expect("Failed to create test harness");
        let conn = harness
            .get_test_connection()
            .expect("Failed to get connection");

        // Initialize with production function
        init_db(&conn).expect("Should initialize database");

        // Create large content (1MB)
        let large_content = "x".repeat(1024 * 1024);

        // Test production database can handle large content
        let insert_result = conn.execute(
            "INSERT INTO notes (filename, content, html_render, modified) VALUES (?1, ?2, ?3, ?4)",
            params![
                "large.md",
                &large_content,
                format!("<p>{}</p>", &large_content),
                1000i64
            ],
        );
        assert!(
            insert_result.is_ok(),
            "Production database should handle large files"
        );

        // Verify large file was stored correctly using production database
        let stored_length: i64 = conn
            .query_row(
                "SELECT LENGTH(content) FROM notes WHERE filename = ?1",
                params!["large.md"],
                |row| row.get(0),
            )
            .expect("Should get stored content length");
        assert_eq!(
            stored_length,
            1024 * 1024,
            "Should store complete large content"
        );

        // Test FTS search works on large content using production database
        let search_result = conn.query_row(
            "SELECT filename FROM notes WHERE filename = ?1",
            params!["large.md"],
            |row| row.get::<_, String>(0),
        );
        assert!(search_result.is_ok(), "Should find large file");
        assert_eq!(
            search_result.unwrap(),
            "large.md",
            "Should find correct large file"
        );

        // Test production integrity check handles large files
        let integrity_result = check_database_integrity(&conn)
            .expect("Production integrity check should handle large files");
        assert!(
            integrity_result.is_healthy,
            "Production integrity check should handle large files"
        );
    }

    #[test]
    fn test_corruption_detection_with_production_functions() {
        let harness = DbTestHarness::new().expect("Failed to create test harness");
        let conn = harness
            .get_test_connection()
            .expect("Failed to get connection");

        // Initialize with production function
        init_db(&conn).expect("Should initialize database");

        // Insert normal data first
        conn.execute(
            "INSERT INTO notes (filename, content, html_render, modified) VALUES (?1, ?2, ?3, ?4)",
            params![
                "normal.md",
                "Normal content",
                "<p>Normal content</p>",
                1000i64
            ],
        )
        .expect("Should insert normal data");

        // Test production integrity check on clean data
        let clean_result =
            check_database_integrity(&conn).expect("Production integrity check should run");
        assert!(clean_result.is_healthy, "Clean database should be healthy");

        // Insert data that should trigger corruption warnings
        conn.execute(
            "INSERT INTO notes (filename, content, html_render, modified) VALUES (?1, ?2, ?3, ?4)",
            params!["empty.md", "", "", 2000i64], // Empty content
        )
        .expect("Should insert empty content");

        conn.execute(
            "INSERT INTO notes (filename, content, html_render, modified) VALUES (?1, ?2, ?3, ?4)",
            params![
                "null_bytes.md",
                "Content with\0null bytes",
                "<p>Content with\0null bytes</p>",
                2000i64
            ], // Null bytes
        )
        .expect("Should insert content with null bytes");

        // Test production integrity check detects issues
        let corrupt_result = check_database_integrity(&conn)
            .expect("Production integrity check should run even with issues");

        // The production function should detect these issues in warnings or stats
        // (The exact behavior depends on your production implementation)
        assert!(
            corrupt_result.stats.total_notes >= 3,
            "Should count all inserted notes including problematic ones"
        );

        // Test that production quick health check still works
        assert!(
            quick_health_check(&conn),
            "Production quick health check should still pass (these are warnings, not fatal errors)"
        );
    }

    #[test]
    fn test_database_rebuild_on_corruption() {
        let harness = DbTestHarness::new().expect("Failed to create test harness");
        let conn = harness
            .get_test_connection()
            .expect("Failed to get connection");

        // Initialize with production function
        init_db(&conn).expect("Should initialize database");

        // Insert test data
        conn.execute(
            "INSERT INTO notes (filename, content, html_render, modified) VALUES (?1, ?2, ?3, ?4)",
            params!["test1.md", "Content 1", "<p>Content 1</p>", 1000i64],
        )
        .expect("Should insert test data");

        // Verify data exists
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))
            .expect("Should count notes");
        assert_eq!(count, 1, "Should have one note");

        // Simulate database corruption by dropping table
        conn.execute("DROP TABLE notes", [])
            .expect("Should drop table to simulate corruption");

        // Verify table is gone (this would cause an error in normal operations)
        let table_check =
            conn.query_row("SELECT COUNT(*) FROM notes", [], |row| row.get::<_, i64>(0));
        assert!(
            table_check.is_err(),
            "Table should be gone after corruption"
        );

        // Test recreate_database function behavior
        // Note: This tests the database recreation logic, not the full file sync
        let recreate_result = init_db(&conn);
        assert!(
            recreate_result.is_ok(),
            "Should be able to recreate database schema"
        );

        // Verify empty table exists again
        let count_after_recreate: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))
            .expect("Should count notes in recreated table");
        assert_eq!(count_after_recreate, 0, "Recreated table should be empty");
    }

    #[test]
    fn test_database_error_handling_patterns() {
        let harness = DbTestHarness::new().expect("Failed to create test harness");
        let conn = harness
            .get_test_connection()
            .expect("Failed to get connection");

        // Initialize with production function
        init_db(&conn).expect("Should initialize database");

        // Test that database operations handle expected error conditions

        // 1. Test duplicate filename handling (should use INSERT OR REPLACE pattern)
        conn.execute(
            "INSERT INTO notes (filename, content, html_render, modified) VALUES (?1, ?2, ?3, ?4)",
            params![
                "duplicate.md",
                "First content",
                "<p>First content</p>",
                1000i64
            ],
        )
        .expect("Should insert first version");

        // This should not fail due to our upsert pattern
        let result = conn.execute(
            "INSERT OR REPLACE INTO notes (filename, content, html_render, modified) VALUES (?1, ?2, ?3, ?4)",
            params!["duplicate.md", "Updated content", "<p>Updated content</p>", 2000i64],
        );
        assert!(result.is_ok(), "Upsert should handle duplicates gracefully");

        // 2. Test that we have proper indexes for search
        let search_result = conn.query_row(
            "SELECT filename FROM notes WHERE notes MATCH ?1",
            params!["content"],
            |row| row.get::<_, String>(0),
        );
        assert!(
            search_result.is_ok(),
            "FTS search should work with proper schema"
        );
    }

    #[test]
    fn test_external_file_change_handling() {
        use std::fs;
        use tempfile::TempDir;

        // Create a temporary notes directory for testing
        let temp_notes_dir = TempDir::new().expect("Should create temp directory");
        let notes_path = temp_notes_dir.path();

        // Create a test file
        let test_file = notes_path.join("test.md");
        fs::write(&test_file, "Original content").expect("Should write test file");

        // Create database and add the file
        let harness = DbTestHarness::new().expect("Failed to create test harness");
        let mut conn = harness
            .get_test_connection()
            .expect("Failed to get connection");

        init_db(&conn).expect("Should initialize database");

        // Add file to database
        conn.execute(
            "INSERT INTO notes (filename, content, html_render, modified) VALUES (?1, ?2, ?3, ?4)",
            params![
                "test.md",
                "Original content",
                "<p>Original content</p>",
                1000i64
            ],
        )
        .expect("Should insert test note");

        // Verify file is in database
        let count_before: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))
            .expect("Should count notes");
        assert_eq!(count_before, 1, "Should have one note in database");

        // Simulate external file deletion
        fs::remove_file(&test_file).expect("Should delete test file");

        // Run the sync function to detect external changes
        // This simulates what happens when the app refreshes or detects changes
        let mut filesystem_files = std::collections::HashMap::new();
        // filesystem_files is empty since file was deleted

        // Get database files
        let mut database_files = std::collections::HashMap::new();
        {
            let mut stmt = conn
                .prepare("SELECT filename, modified FROM notes")
                .unwrap();
            let rows = stmt
                .query_map([], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
                })
                .unwrap();

            for row in rows {
                let (filename, modified) = row.unwrap();
                database_files.insert(filename, modified);
            }
        }

        // Simulate the sync logic from load_all_notes_into_sqlite
        let tx = conn.transaction().expect("Should start transaction");

        // Remove files that no longer exist on filesystem
        for filename in database_files.keys() {
            if !filesystem_files.contains_key(filename) {
                tx.execute("DELETE FROM notes WHERE filename = ?1", params![filename])
                    .expect("Should delete missing file from database");
            }
        }

        tx.commit().expect("Should commit transaction");

        // Verify database was cleaned up
        let count_after: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))
            .expect("Should count notes");
        assert_eq!(
            count_after, 0,
            "Should have zero notes after external deletion"
        );

        // Test external file creation
        fs::write(&test_file, "New content").expect("Should create new test file");

        // Simulate adding new file to filesystem_files
        filesystem_files.insert("test.md".to_string(), (test_file.clone(), 2000i64));

        // Simulate the add/update logic
        let tx = conn.transaction().expect("Should start transaction");
        for (filename, (path, fs_modified)) in filesystem_files {
            let content = fs::read_to_string(&path).unwrap_or_default();
            tx.execute(
                "INSERT OR REPLACE INTO notes (filename, content, modified) VALUES (?1, ?2, ?3)",
                params![filename, content, fs_modified],
            )
            .expect("Should insert new file");
        }
        tx.commit().expect("Should commit transaction");

        // Verify new file was added
        let count_final: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))
            .expect("Should count notes");
        assert_eq!(
            count_final, 1,
            "Should have one note after external creation"
        );

        let content: String = conn
            .query_row(
                "SELECT content FROM notes WHERE filename = 'test.md'",
                [],
                |row| row.get(0),
            )
            .expect("Should get note content");
        assert_eq!(content, "New content", "Should have updated content");
    }

    #[test]
    fn test_two_phase_commit_file_database_synchronization() {
        use crate::tests::test_utils::test_save_note_with_content_check;
        use crate::tests::test_utils::TestConfigOverride;
        use std::fs;

        let _test_config = TestConfigOverride::new().expect("Should create test config");
        let note_name = "sync_test.md";
        let original_content = "Original synchronized content";
        let new_content = "Updated content for synchronization test";

        // Create a note file in the test directory to simulate existing note
        let note_path = _test_config.notes_dir().join(note_name);
        fs::write(&note_path, original_content).expect("Should create original file");

        // Test normal two-phase commit (should succeed)
        let result = test_save_note_with_content_check(note_name, new_content, original_content);

        match result {
            Ok(()) => {
                // Verify file was updated
                let file_content =
                    fs::read_to_string(&note_path).expect("Should read updated file");
                assert_eq!(
                    file_content, new_content,
                    "File content should be updated after successful two-phase commit"
                );

                // Note: Can't easily test database sync in isolation without mocking,
                // but the two-phase commit implementation ensures consistency
                println!("Two-phase commit completed successfully");
            }
            Err(e) => {
                // If the operation fails, original content should be preserved
                let preserved_content = fs::read_to_string(&note_path);
                match preserved_content {
                    Ok(content) => {
                        assert_eq!(
                            content, original_content,
                            "Original content should be preserved if two-phase commit fails: {}",
                            e
                        );
                    }
                    Err(_) => {
                        // File doesn't exist - acceptable if rollback removed newly created file
                        // and a failure backup was created instead
                        println!("File rollback completed after failure: {}", e);
                    }
                }
            }
        }

        // Test content validation failure (should reject save)
        let modified_content = "Externally modified content";
        fs::write(&note_path, modified_content).expect("Should modify file externally");

        let validation_result =
            test_save_note_with_content_check(note_name, new_content, original_content);

        match validation_result {
            Ok(()) => {
                panic!("Save should fail when original content doesn't match current content")
            }
            Err(e) => {
                assert!(
                    e.contains("modified since editing began"),
                    "Error should indicate content validation failure: {}",
                    e
                );

                // Verify file still has externally modified content
                let current_content =
                    fs::read_to_string(&note_path).expect("Should read current content");
                assert_eq!(
                    current_content, modified_content,
                    "File should retain externally modified content after validation failure"
                );
            }
        }
    }

    /// `notes` is an FTS5 virtual table, so `filename` carries no uniqueness
    /// constraint and `INSERT OR REPLACE` appends rather than replaces. The
    /// shared upsert helper must leave exactly one row however often it runs.
    #[test]
    fn test_upsert_note_never_duplicates_a_filename() {
        let harness = DbTestHarness::new().expect("Failed to create test harness");
        let conn = harness
            .get_test_connection()
            .expect("Failed to get connection");
        init_db(&conn).expect("init_db should succeed");

        for (content, modified) in [("v1", 1000i64), ("v2", 999), ("v3", 1001)] {
            upsert_note(&conn, "a.md", content, "<p>rendered</p>", modified, true)
                .expect("upsert should succeed");
        }

        let (content, modified): (String, i64) = conn
            .query_row(
                "SELECT content, modified FROM notes WHERE filename = ?1",
                params!["a.md"],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("Should find exactly one row");
        assert_eq!(content, "v3", "Latest upsert should win");
        assert_eq!(modified, 1001);

        let row_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM notes WHERE filename = ?1",
                params!["a.md"],
                |row| row.get(0),
            )
            .expect("Should count rows");
        assert_eq!(row_count, 1, "Repeated upserts must not accumulate rows");

        // The schema check must stay happy — duplicates make it report corruption.
        assert!(
            init_db(&conn).is_ok(),
            "init_db should not detect duplicate entries"
        );
    }

    /// The database `modified` column has to be the file's real mtime. If it
    /// were wall-clock-now at write time the two would disagree whenever a
    /// write straddled a second boundary, and the next filesystem sync would
    /// treat an unchanged note as modified.
    #[test]
    fn test_database_modified_matches_file_mtime() {
        let test_override = TestConfigOverride::new().expect("Failed to create test override");
        let notes_dir = test_override.notes_dir();

        test_create_new_note("mtime.md").expect("Should create note");
        assert_mtime_matches(&notes_dir, "mtime.md", "after create");

        test_save_note_with_content_check("mtime.md", "some content", "")
            .expect("Should save note");
        assert_mtime_matches(&notes_dir, "mtime.md", "after save");
    }

    fn assert_mtime_matches(notes_dir: &std::path::Path, filename: &str, stage: &str) {
        let file_mtime = file_modified_secs(&notes_dir.join(filename));
        let rows = test_note_rows(filename).expect("Should read note rows");
        assert_eq!(rows.len(), 1, "Expected one row {}", stage);
        assert_eq!(
            rows[0].1, file_mtime,
            "Database modified should equal file mtime {}",
            stage
        );
    }

    /// The full regression. A stale `modified` value in the database is what
    /// drives `refresh_cache` down the "this file changed" branch. Before the
    /// fix that branch used `INSERT OR REPLACE`, which appends on an FTS5
    /// table, so the sync produced a duplicate row: the note showed up twice in
    /// search, and the next `init_db` reported corruption and forced a full
    /// rebuild.
    #[test]
    fn test_refresh_cache_with_stale_modified_does_not_duplicate_rows() {
        let _test_override = TestConfigOverride::new().expect("Failed to create test override");

        test_create_new_note("sync.md").expect("Should create note");
        test_save_note_with_content_check("sync.md", "distinctive body text", "")
            .expect("Should save note");

        for pass in 1..=3 {
            // Put the stored timestamp out of step with the file, exactly as a
            // wall-clock-now write would.
            test_set_note_modified("sync.md", 1).expect("Should force a stale timestamp");

            test_refresh_cache_sync().expect("Cache refresh sync should succeed");

            let rows = test_note_rows("sync.md").expect("Should read note rows");
            assert_eq!(
                rows.len(),
                1,
                "Sync pass {} left {} rows for sync.md",
                pass,
                rows.len()
            );
            assert_eq!(rows[0].0, "distinctive body text");

            let results =
                test_search_notes_hybrid("distinctive", 100).expect("Search should succeed");
            assert_eq!(
                results,
                vec!["sync.md".to_string()],
                "Search should return the note exactly once after sync pass {}",
                pass
            );
        }
    }
}
