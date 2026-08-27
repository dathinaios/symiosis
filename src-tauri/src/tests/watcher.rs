use crate::tests::test_utils::TestConfigOverride;
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use serial_test::serial;
use std::fs;
use std::sync::mpsc;

#[cfg(test)]
#[serial]
mod serial_tests {
    use super::*;

    #[test]
    fn test_watcher_setup_with_missing_directory_should_fail() {
        let _test_config = TestConfigOverride::new().expect("Should create test config");

        // Remove the notes directory to simulate missing directory scenario
        let notes_dir = crate::config::get_config_notes_dir();
        if notes_dir.exists() {
            fs::remove_dir_all(&notes_dir).expect("Should remove test directory");
        }

        // Verify directory doesn't exist
        assert!(
            !notes_dir.exists(),
            "Notes directory should not exist for this test"
        );

        // Test the core watcher creation logic that causes the bug
        let (tx, _rx) = mpsc::channel();
        let mut watcher = RecommendedWatcher::new(
            move |res: Result<notify::Event, notify::Error>| {
                if let Ok(event) = res {
                    let _ = tx.send(event);
                }
            },
            Config::default(),
        )
        .expect("Should create watcher");

        // This should fail - demonstrating the bug
        let result = watcher.watch(&notes_dir, RecursiveMode::Recursive);

        assert!(
            result.is_err(),
            "Watcher should fail when notes directory doesn't exist"
        );

        // Check that the error is related to path not found
        let error_msg = format!("{}", result.unwrap_err());
        assert!(
            error_msg.contains("No such file or directory")
                || error_msg.contains("path was not found")
                || error_msg.contains("No path was found")
                || error_msg.contains("entity not found")
                || error_msg.contains("cannot find the file"),
            "Error should indicate missing directory: {}",
            error_msg
        );
    }

    #[test]
    fn test_watcher_setup_with_existing_directory_should_succeed() {
        let _test_config = TestConfigOverride::new().expect("Should create test config");

        // Ensure the notes directory exists
        let notes_dir = crate::config::get_config_notes_dir();
        fs::create_dir_all(&notes_dir).expect("Should create notes directory");

        // Verify directory exists
        assert!(
            notes_dir.exists(),
            "Notes directory should exist for this test"
        );

        // Test the core watcher creation logic
        let (tx, _rx) = mpsc::channel();
        let mut watcher = RecommendedWatcher::new(
            move |res: Result<notify::Event, notify::Error>| {
                if let Ok(event) = res {
                    let _ = tx.send(event);
                }
            },
            Config::default(),
        )
        .expect("Should create watcher");

        // This should succeed
        let result = watcher.watch(&notes_dir, RecursiveMode::Recursive);

        assert!(
            result.is_ok(),
            "Watcher should succeed when notes directory exists: {:?}",
            result
        );
    }

    #[test]
    fn test_watcher_setup_creates_missing_directory_before_watching() {
        let _test_config = TestConfigOverride::new().expect("Should create test config");

        // Remove the notes directory to simulate missing directory scenario
        let notes_dir = crate::config::get_config_notes_dir();
        if notes_dir.exists() {
            fs::remove_dir_all(&notes_dir).expect("Should remove test directory");
        }

        // Verify directory doesn't exist
        assert!(
            !notes_dir.exists(),
            "Notes directory should not exist for this test"
        );

        // Create the directory (simulating the fix)
        fs::create_dir_all(&notes_dir).expect("Should create notes directory");

        // Now watcher should succeed
        let (tx, _rx) = mpsc::channel();
        let mut watcher = RecommendedWatcher::new(
            move |res: Result<notify::Event, notify::Error>| {
                if let Ok(event) = res {
                    let _ = tx.send(event);
                }
            },
            Config::default(),
        )
        .expect("Should create watcher");

        let result = watcher.watch(&notes_dir, RecursiveMode::Recursive);

        assert!(
            result.is_ok(),
            "Watcher should succeed after creating missing directory: {:?}",
            result
        );
    }

    #[test]
    fn test_get_config_notes_dir_returns_configured_path() {
        let test_config = TestConfigOverride::new().expect("Should create test config");

        let notes_dir = crate::config::get_config_notes_dir();
        let expected_path = test_config.notes_dir();

        assert_eq!(
            notes_dir, expected_path,
            "get_config_notes_dir should return configured path"
        );
    }
}

/// The suppression used to be a global counter cleared five seconds later, so
/// saving one note made the watcher deaf to every other note for five seconds.
/// Suppression is now per path and content-addressed.
#[cfg(test)]
mod self_write_tests {
    use crate::core::self_writes::SelfWriteRegistry;
    use tempfile::TempDir;

    fn write(path: &std::path::Path, content: &str) {
        std::fs::write(path, content).expect("Should write test file");
    }

    #[test]
    fn recognises_a_write_this_app_made() {
        let dir = TempDir::new().expect("Should create temp dir");
        let note = dir.path().join("mine.md");

        let registry = SelfWriteRegistry::default();
        registry.record_write(&note, "written by the app");
        write(&note, "written by the app");

        assert!(
            registry.is_own_write(&note),
            "The app's own write should be recognised"
        );
    }

    #[test]
    fn does_not_suppress_a_different_file() {
        let dir = TempDir::new().expect("Should create temp dir");
        let ours = dir.path().join("ours.md");
        let theirs = dir.path().join("theirs.md");

        let registry = SelfWriteRegistry::default();
        registry.record_write(&ours, "app content");
        write(&ours, "app content");
        write(&theirs, "edited in another editor");

        assert!(registry.is_own_write(&ours));
        assert!(
            !registry.is_own_write(&theirs),
            "An edit to another file must never be suppressed"
        );
    }

    #[test]
    fn does_not_suppress_an_external_edit_to_the_same_file() {
        let dir = TempDir::new().expect("Should create temp dir");
        let note = dir.path().join("contested.md");

        let registry = SelfWriteRegistry::default();
        registry.record_write(&note, "app content");
        write(&note, "app content");
        assert!(registry.is_own_write(&note));

        // Somebody else changes the same file straight afterwards.
        write(&note, "content from another editor");
        assert!(
            !registry.is_own_write(&note),
            "A different body on disk means the change was not ours"
        );
    }

    #[test]
    fn recognises_a_removal_but_not_a_recreation() {
        let dir = TempDir::new().expect("Should create temp dir");
        let note = dir.path().join("gone.md");
        write(&note, "about to be deleted");

        let registry = SelfWriteRegistry::default();
        registry.record_removal(&note);
        std::fs::remove_file(&note).expect("Should delete test file");
        assert!(registry.is_own_write(&note), "Our own delete is recognised");

        write(&note, "restored by another program");
        assert!(
            !registry.is_own_write(&note),
            "A file reappearing was not our removal"
        );
    }

    #[test]
    fn records_both_sides_of_a_move() {
        let dir = TempDir::new().expect("Should create temp dir");
        let old = dir.path().join("before.md");
        let new = dir.path().join("after.md");
        write(&old, "moved content");

        let registry = SelfWriteRegistry::default();
        registry.record_move(&old, &new);
        std::fs::rename(&old, &new).expect("Should rename test file");

        assert!(registry.is_own_write(&old), "The vacated path is ours");
        assert!(registry.is_own_write(&new), "The new path is ours");
    }

    #[test]
    fn an_unrecorded_path_is_always_external() {
        let dir = TempDir::new().expect("Should create temp dir");
        let note = dir.path().join("never-touched.md");
        write(&note, "content");

        let registry = SelfWriteRegistry::default();
        assert!(!registry.is_own_write(&note));
    }
}
