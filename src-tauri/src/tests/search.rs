//! Search Unit Tests
//!
//! Tests for search functionality, FTS security, and performance.

use crate::tests::test_utils::{test_search_notes_hybrid, TestConfigOverride};
use serial_test::serial;
use std::time::Instant;

#[test]
#[serial]
fn test_fts_injection_attempts() {
    let _test_config = TestConfigOverride::new().expect("Failed to setup test config");

    let injection_attempts = vec![
        "test AND malicious",
        "test OR secret",
        "test NOT public",
        "test NEAR(password, 5)",
        "test) OR (notes MATCH 'secret'",
        "test) AND (filename:private",
        "filename:secret",
        "content:password",
        "* AND NOT filename:public",
        "NOT test",
        "***",
        "*test*",
        "\"test\" OR \"secret\"",
        "\"unclosed quote",
        "(test OR (secret AND password))",
        "test) UNION SELECT * FROM notes WHERE (1=1",
    ];

    for malicious_query in injection_attempts {
        let result = std::panic::catch_unwind(|| test_search_notes_hybrid(malicious_query, 10));

        assert!(
            result.is_ok(),
            "FTS injection query caused panic: {}",
            malicious_query
        );

        match result.expect("Search function should return a result") {
            Ok(_) => {}
            Err(error_msg) => {
                assert!(
                    !error_msg.to_string().contains("SQL"),
                    "Error message leaked SQL details: {}",
                    error_msg
                );
            }
        }
    }
}

#[test]
#[serial]
fn test_fts_query_sanitization() {
    let _test_config = TestConfigOverride::new().expect("Failed to setup test config");

    let special_chars = vec![
        "test\"quote",
        "test(paren",
        "test*wildcard",
        "test AND operator",
        "test: colon",
    ];

    for query in special_chars {
        let result = test_search_notes_hybrid(query, 10);

        match result {
            Ok(_) => {}
            Err(error) => {
                assert!(
                    !error.to_string().to_lowercase().contains("syntax error"),
                    "Query resulted in SQL syntax error: {} for input: {}",
                    error,
                    query
                );
            }
        }
    }
}

#[test]
#[serial]
fn test_fts_parameter_safety() {
    let _test_config = TestConfigOverride::new().expect("Failed to setup test config");

    let dangerous_inputs = vec![
        "'; DROP TABLE notes; --",
        "' UNION SELECT * FROM sqlite_master --",
        "\"; DELETE FROM notes; --",
        "test'; INSERT INTO notes VALUES ('hack'); --",
    ];

    for dangerous_input in dangerous_inputs {
        let result = test_search_notes_hybrid(dangerous_input, 10);

        match result {
            Ok(_) => {}
            Err(error) => {
                let error_lower = error.to_string().to_lowercase();
                assert!(
                    !error_lower.contains("table") || error_lower.contains("fts"),
                    "Unexpected error type: {}",
                    error
                );
            }
        }
    }
}

#[test]
#[serial]
fn test_search_performance_baseline() {
    let _test_config = TestConfigOverride::new().expect("Failed to setup test config");

    // Test that search operations complete within reasonable time
    let test_queries = vec!["test", "note", "content", "markdown", "file"];

    for query in test_queries {
        let start = Instant::now();
        let result = test_search_notes_hybrid(query, 100);
        let duration = start.elapsed();

        // Search should complete within 1 second for typical queries
        assert!(
            duration.as_millis() < 1000,
            "Search for '{}' took too long: {}ms",
            query,
            duration.as_millis()
        );

        // Should not panic or error for basic queries
        assert!(
            result.is_ok(),
            "Search for '{}' should not error: {:?}",
            query,
            result
        );
    }
}

#[test]
#[serial]
fn test_search_performance_with_limits() {
    let _test_config = TestConfigOverride::new().expect("Failed to setup test config");

    // Test that different result limits don't significantly impact performance
    let query = "test";
    let limits = vec![1, 10, 100, 1000];

    for limit in limits {
        let start = Instant::now();
        let result = test_search_notes_hybrid(query, limit);
        let duration = start.elapsed();

        // Performance should scale reasonably with result limits
        assert!(
            duration.as_millis() < 2000,
            "Search with limit {} took too long: {}ms",
            limit,
            duration.as_millis()
        );

        match result {
            Ok(results) => {
                // Should respect the limit
                assert!(
                    results.len() <= limit,
                    "Search returned more results ({}) than requested ({})",
                    results.len(),
                    limit
                );
            }
            Err(e) => {
                // Should not error for reasonable limits
                panic!("Search with limit {} failed: {}", limit, e);
            }
        }
    }
}

#[test]
#[serial]
fn test_search_performance_stress_queries() {
    let _test_config = TestConfigOverride::new().expect("Failed to setup test config");

    // Test performance with potentially expensive queries
    let stress_queries = vec![
        "a",             // Very short query (might match many results)
        "the",           // Common word
        "aaaaaa",        // Repeated characters
        "test AND note", // Complex FTS query
        "",              // Empty query
    ];

    for query in stress_queries {
        let start = Instant::now();
        let result = test_search_notes_hybrid(query, 50);
        let duration = start.elapsed();

        // Even stress queries should complete within reasonable time
        assert!(
            duration.as_millis() < 3000,
            "Stress query '{}' took too long: {}ms",
            query,
            duration.as_millis()
        );

        // Should handle all queries gracefully (either success or controlled error)
        match result {
            Ok(_) => {
                // Success is fine
            }
            Err(e) => {
                // Errors should be controlled and not indicate crashes
                let error_msg = e.to_string().to_lowercase();
                assert!(
                    !error_msg.contains("panic") && !error_msg.contains("crash"),
                    "Search error for '{}' indicates system failure: {}",
                    query,
                    e
                );
            }
        }
    }
}
