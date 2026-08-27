//! Concurrency Unit Tests
//!
//! Tests for concurrent access patterns and multi-user scenarios.

use crate::config::*;
use crate::utilities::note_renderer::render_note;
use crate::utilities::paths::get_database_path_for_notes_dir;
use crate::utilities::paths::{get_config_path, get_default_notes_dir};
use crate::utilities::validation::{validate_config, validate_note_name, validate_shortcut_format};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

#[test]
fn test_concurrent_config_access() {
    // Test that multiple threads can safely access configuration
    let handles: Vec<_> = (0..5)
        .map(|i| {
            thread::spawn(move || {
                // Each thread loads config independently
                let config = load_config();

                // All threads should get consistent config values
                assert!(!config.notes_directory.is_empty());
                assert!(config.preferences.max_search_results > 0);
                assert!(!config.global_shortcut.is_empty());

                // Simulate some work
                thread::sleep(Duration::from_millis(10));

                i // Return thread ID for verification
            })
        })
        .collect();

    // Wait for all threads and verify they completed
    let results: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
    assert_eq!(results, vec![0, 1, 2, 3, 4]);
}

#[test]
fn test_concurrent_validation() {
    // Test that validation functions are thread-safe
    let test_configs = Arc::new(vec![
        AppConfig {
            notes_directory: "/tmp/test1".to_string(),
            preferences: PreferencesConfig {
                max_search_results: 100,
            },
            global_shortcut: "Ctrl+Shift+N".to_string(),
            editor: EditorConfig {
                mode: "basic".to_string(),
                ..EditorConfig::default()
            },
            interface: InterfaceConfig {
                markdown_render_theme: "modern-dark".to_string(),
                ..InterfaceConfig::default()
            },
            ..AppConfig::default()
        },
        AppConfig {
            notes_directory: "/tmp/test2".to_string(),
            preferences: PreferencesConfig {
                max_search_results: 50,
            },
            global_shortcut: "Alt+Space".to_string(),
            editor: EditorConfig {
                mode: "vim".to_string(),
                ..EditorConfig::default()
            },
            interface: InterfaceConfig {
                markdown_render_theme: "gruvbox-dark".to_string(),
                ..InterfaceConfig::default()
            },
            ..AppConfig::default()
        },
        AppConfig {
            notes_directory: "/invalid".to_string(),
            preferences: PreferencesConfig {
                max_search_results: 0, // Invalid
            },
            global_shortcut: "InvalidShortcut".to_string(),
            editor: EditorConfig {
                mode: "invalid_mode".to_string(),
                ..EditorConfig::default()
            },
            interface: InterfaceConfig {
                markdown_render_theme: "invalid_theme".to_string(),
                ..InterfaceConfig::default()
            },
            ..AppConfig::default()
        },
    ]);

    let results = Arc::new(Mutex::new(Vec::new()));

    let handles: Vec<_> = (0..3)
        .map(|i| {
            let configs = Arc::clone(&test_configs);
            let results = Arc::clone(&results);
            thread::spawn(move || {
                let config = &configs[i];
                let validation_result = validate_config(config);

                let mut results = results.lock().unwrap();
                results.push((i, validation_result.is_ok()));
            })
        })
        .collect();

    // Wait for all validation threads
    for handle in handles {
        handle.join().unwrap();
    }

    // Check results
    let results = results.lock().unwrap();
    assert_eq!(results.len(), 3);

    // First two configs should be valid, third should be invalid
    let mut sorted_results = results.clone();
    sorted_results.sort_by_key(|&(i, _)| i);
    assert_eq!(sorted_results[0], (0, true)); // Valid config
    assert_eq!(sorted_results[1], (1, true)); // Valid config
    assert_eq!(sorted_results[2], (2, false)); // Invalid config
}

#[test]
fn test_concurrent_note_name_validation() {
    // Test concurrent validation of note names
    let test_names = vec![
        "valid_note.md".to_string(),
        "folder/valid_note.txt".to_string(),
        "../invalid_traversal.md".to_string(),
        ".hidden_file.md".to_string(),
        "/absolute/path.md".to_string(),
        "a".repeat(300), // Too long
        "".to_string(),  // Empty
        "normal_file.txt".to_string(),
    ];

    let results = Arc::new(Mutex::new(Vec::new()));

    let handles: Vec<_> = test_names
        .into_iter()
        .enumerate()
        .map(|(i, name)| {
            let results = Arc::clone(&results);
            thread::spawn(move || {
                let validation_result = validate_note_name(&name);

                let mut results = results.lock().unwrap();
                results.push((i, validation_result.is_ok()));

                // Simulate some processing time
                thread::sleep(Duration::from_millis(5));
            })
        })
        .collect();

    // Wait for all threads
    for handle in handles {
        handle.join().unwrap();
    }

    // Verify we got results from all threads
    let results = results.lock().unwrap();
    assert_eq!(results.len(), 8);

    // Check that validation behaved consistently
    let mut sorted_results = results.clone();
    sorted_results.sort_by_key(|&(i, _)| i);

    // Expected results based on validation rules
    let expected = vec![
        (0, true),  // valid_note.md - valid
        (1, true),  // folder/valid_note.txt - valid
        (2, false), // ../invalid_traversal.md - path traversal
        (3, false), // .hidden_file.md - starts with dot
        (4, false), // /absolute/path.md - absolute path
        (5, false), // long name - too long
        (6, false), // empty - empty name
        (7, true),  // normal_file.txt - valid
    ];

    assert_eq!(sorted_results, expected);
}

#[test]
fn test_concurrent_path_operations() {
    // Test that path-related functions are thread-safe
    let handles: Vec<_> = (0..10)
        .map(|_| {
            thread::spawn(|| {
                // These functions should be safe to call concurrently
                let config_path = get_config_path();
                let notes_dir = get_default_notes_dir();
                let db_path =
                    get_database_path_for_notes_dir(&crate::config::get_config_notes_dir())
                        .expect("Should get database path");

                // All should return consistent, valid paths
                let path_str = config_path.to_string_lossy();
                #[cfg(target_os = "windows")]
                assert!(
                    path_str.contains("symiosis")
                        && (path_str.contains("AppData")
                            || path_str.contains("symiosis/config.toml"))
                );
                #[cfg(not(target_os = "windows"))]
                assert!(path_str.contains(".config/symiosis"));
                assert!(notes_dir.contains("Notes") || notes_dir == "./notes");
                assert!(db_path.to_string_lossy().contains("symiosis"));

                // Paths should be absolute (except fallback cases)
                if !notes_dir.starts_with("./") {
                    assert!(std::path::Path::new(&notes_dir).is_absolute());
                }

                thread::sleep(Duration::from_millis(1));
            })
        })
        .collect();

    // All threads should complete successfully
    for handle in handles {
        handle.join().unwrap();
    }
}

#[test]
fn test_concurrent_render_operations() {
    // Test that note rendering is thread-safe
    let test_cases = vec![
        ("test.md", "# Hello World\n\nThis is **bold**."),
        ("test.txt", "Plain text with <script>alert('xss')</script>"),
        ("code.rs", "fn main() {\n    println!(\"Hello\");\n}"),
        ("readme.markdown", "## Section\n\n- Item 1\n- Item 2"),
    ];

    let handles: Vec<_> = test_cases
        .into_iter()
        .map(|(filename, content)| {
            thread::spawn(move || {
                let rendered = render_note(filename, content);

                // Verify basic rendering properties
                assert!(!rendered.is_empty());

                if filename.ends_with(".md") || filename.ends_with(".markdown") {
                    // Markdown files should be rendered as HTML
                    assert!(rendered.contains("<") && rendered.contains(">"));
                } else {
                    // Other files should be wrapped in <pre> tags
                    assert!(rendered.starts_with("<pre>"));
                    assert!(rendered.ends_with("</pre>"));
                    // XSS should be escaped
                    assert!(!rendered.contains("<script>"));
                }

                filename // Return filename for verification
            })
        })
        .collect();

    // Collect results and verify all threads completed
    let results: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
    assert_eq!(results.len(), 4);
    assert!(results.contains(&"test.md"));
    assert!(results.contains(&"test.txt"));
    assert!(results.contains(&"code.rs"));
    assert!(results.contains(&"readme.markdown"));
}

#[test]
fn test_concurrent_shortcut_parsing() {
    // Test that shortcut parsing is thread-safe
    let shortcuts = vec![
        "Ctrl+Shift+N",
        "Alt+Space",
        "Cmd+F1",
        "Ctrl+C",
        "InvalidShortcut",
        "",
        "F12",
        "Shift+Tab",
    ];

    let results = Arc::new(Mutex::new(Vec::new()));

    let handles: Vec<_> = shortcuts
        .into_iter()
        .enumerate()
        .map(|(i, shortcut)| {
            let results = Arc::clone(&results);
            thread::spawn(move || {
                let parse_result = parse_shortcut(shortcut);
                let validation_result = validate_shortcut_format(shortcut);

                let mut results = results.lock().unwrap();
                results.push((i, parse_result.is_some(), validation_result.is_ok()));

                thread::sleep(Duration::from_millis(2));
            })
        })
        .collect();

    // Wait for all threads
    for handle in handles {
        handle.join().unwrap();
    }

    // Verify results
    let results = results.lock().unwrap();
    assert_eq!(results.len(), 8);

    // Check that parse and validation results are consistent
    for &(_, parse_ok, validation_ok) in results.iter() {
        if validation_ok {
            // If validation passes, parsing should also succeed
            assert!(parse_ok, "Validation passed but parsing failed");
        }
        // Note: parsing might succeed even if validation fails (legacy behavior)
    }
}

#[test]
fn test_stress_concurrent_operations() {
    // Stress test with many concurrent operations
    let num_threads = 20;
    let operations_per_thread = 10;

    let results = Arc::new(Mutex::new(Vec::new()));

    let handles: Vec<_> = (0..num_threads)
        .map(|thread_id| {
            let results = Arc::clone(&results);
            thread::spawn(move || {
                for op_id in 0..operations_per_thread {
                    // Mix of different operations
                    match op_id % 4 {
                        0 => {
                            // Config validation
                            let config = AppConfig::default();
                            let _ = validate_config(&config);
                        }
                        1 => {
                            // Note name validation
                            let name = format!("test_note_{}.md", thread_id);
                            let _ = validate_note_name(&name);
                        }
                        2 => {
                            // Path operations
                            let _ = get_config_path();
                            let _ = get_default_notes_dir();
                        }
                        3 => {
                            // Rendering
                            let content = format!("# Thread {} Operation {}", thread_id, op_id);
                            let _ = render_note("test.md", &content);
                        }
                        _ => unreachable!(),
                    }

                    // Small delay to increase chance of race conditions
                    thread::sleep(Duration::from_micros(100));
                }

                let mut results = results.lock().unwrap();
                results.push(thread_id);
            })
        })
        .collect();

    // Wait for all threads with timeout
    let start_time = std::time::Instant::now();
    for handle in handles {
        handle.join().unwrap();

        // Sanity check - operations shouldn't take too long even under stress
        assert!(
            start_time.elapsed() < Duration::from_secs(30),
            "Stress test taking too long - possible deadlock or performance issue"
        );
    }

    // Verify all threads completed
    let results = results.lock().unwrap();
    assert_eq!(results.len(), num_threads);

    // All thread IDs should be present
    let mut sorted_results = results.clone();
    sorted_results.sort();
    let expected: Vec<_> = (0..num_threads).collect();
    assert_eq!(sorted_results, expected);
}
