//! Search Unit Tests
//!
//! Tests for search functionality, FTS security, and performance.

use crate::tests::test_utils::{
    test_create_new_note, test_refresh_cache_sync, test_search_notes_hybrid, TestConfigOverride,
};
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

#[test]
fn test_build_fts_pattern_quotes_every_term() {
    use crate::search::build_fts_pattern;

    // Hyphens are FTS5 operators. Unquoted, `a-b*` parses as a column filter and
    // the query fails with "no such column", so search returns nothing at all.
    assert_eq!(
        build_fts_pattern("comprehensive-tips"),
        "\"comprehensive-tips\"*"
    );

    assert_eq!(build_fts_pattern("databases"), "\"databases\"*");
    assert_eq!(
        build_fts_pattern("comprehensive tips"),
        "\"comprehensive\"* OR \"tips\"*"
    );
    assert_eq!(build_fts_pattern("a-b c-d"), "\"a-b\"* OR \"c-d\"*");
}

#[test]
#[serial]
fn test_search_finds_a_hyphenated_filename() {
    let _test_config = TestConfigOverride::new().expect("Failed to setup test config");

    test_create_new_note("comprehensive-tips-to-databases.md").expect("note should be created");

    let results = test_search_notes_hybrid("comprehensive-tips-to-databases", 10)
        .expect("search must not error on a hyphenated query");

    assert!(
        results
            .iter()
            .any(|f| f == "comprehensive-tips-to-databases.md"),
        "hyphenated query returned {:?}",
        results
    );
}

#[test]
#[serial]
fn test_search_survives_every_prefix_typed_on_the_way() {
    let _test_config = TestConfigOverride::new().expect("Failed to setup test config");

    let note = "comprehensive-tips-to-databases.md";
    test_create_new_note(note).expect("note should be created");

    // Search runs on every keystroke, so each intermediate string is a real
    // query — including the ones ending on a hyphen. Unquoted, those parsed as
    // FTS5 operators and the whole query errored out.
    //
    // Failures are collected rather than asserted in the loop: panicking while
    // SQLite frames are still on the stack aborts instead of unwinding, which
    // loses the message that says which prefix broke.
    let target = "comprehensive-tips-to-databases";
    let mut failures: Vec<String> = Vec::new();

    for end in 1..=target.len() {
        let prefix = &target[..end];
        match test_search_notes_hybrid(prefix, 100) {
            Err(e) => failures.push(format!("{:?} errored: {}", prefix, e)),
            Ok(results) if !results.iter().any(|f| f == note) => {
                failures.push(format!("{:?} did not return the note it prefixes", prefix))
            }
            Ok(_) => {}
        }
    }

    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn test_candidate_limit_never_below_the_configured_result_count() {
    use crate::search::candidate_limit;

    // FTS5 only generates candidates; the ranking that decides what is shown
    // happens afterwards. Fetching fewer rows than the configured result count
    // means a note BM25 ranked low can never be scored, however well it would
    // have matched.
    assert_eq!(candidate_limit(10), 500);
    assert_eq!(candidate_limit(100), 500);
    assert_eq!(candidate_limit(500), 500);
    assert_eq!(candidate_limit(2000), 2000);
    assert_eq!(candidate_limit(10_000), 10_000);
}

#[test]
#[serial]
fn test_content_search_is_case_insensitive_including_greek() {
    let _test_config = TestConfigOverride::new().expect("Failed to setup test config");

    let note = "greek-street.md";
    let notes_dir = crate::config::get_config_notes_dir();
    std::fs::write(
        notes_dir.join(note),
        "Some text\n\n\u{39F}\u{394}\u{39F}\u{3A3} \u{395}\u{3A1}\u{39C}\u{39F}\u{3A5}\n",
    )
    .expect("note body should be writable");
    test_refresh_cache_sync().expect("index should pick the file up");

    // `str::to_lowercase` maps a final sigma to `\u{3C2}` while the per-character
    // mapping gives `\u{3C3}`, so lowercasing content one character at a time
    // stops it matching a query that was lowercased as a whole.
    for query in [
        "\u{39F}\u{394}\u{39F}\u{3A3}",
        "\u{3BF}\u{3B4}\u{3BF}\u{3C2}",
        "\u{395}\u{3A1}\u{39C}\u{39F}\u{3A5}",
        "text",
    ] {
        let results = test_search_notes_hybrid(query, 20)
            .unwrap_or_else(|e| panic!("query {:?} errored: {}", query, e));
        assert!(
            results.iter().any(|f| f == note),
            "query {:?} did not find the note: {:?}",
            query,
            results
        );
    }
}

#[test]
fn test_lowercase_ascii_into_matches_to_lowercase_exactly() {
    use crate::search::lowercase_ascii_into;

    // The query is lowercased with `to_lowercase`, so any divergence here stops
    // content matching a query that should find it.
    let mut corpus: Vec<String> = vec![
        String::new(),
        " ".to_string(),
        "Simple ASCII Text".to_string(),
        "MiXeD cAsE 123 !@#$%^&*()".to_string(),
    ];

    // Every ASCII byte on its own, and as part of a word.
    for byte in 0u8..=127 {
        let c = byte as char;
        corpus.push(c.to_string());
        corpus.push(format!("word{}word", c));
    }

    let mut buf = String::new();
    for text in &corpus {
        lowercase_ascii_into(&mut buf, text);
        assert_eq!(
            buf,
            text.to_lowercase(),
            "diverged for {:?} (bytes {:?})",
            text,
            text.as_bytes()
        );
    }
}

#[test]
fn test_lowercase_ascii_into_is_safe_to_reuse() {
    use crate::search::lowercase_ascii_into;

    // The buffer is reused across every candidate in a search, so a stale tail
    // left behind by a longer previous body would corrupt the next score.
    let mut buf = String::new();

    lowercase_ascii_into(&mut buf, "A VERY LONG PIECE OF ASCII CONTENT INDEED");
    assert_eq!(buf, "a very long piece of ascii content indeed");

    lowercase_ascii_into(&mut buf, "SHORT");
    assert_eq!(buf, "short");

    lowercase_ascii_into(&mut buf, "BACK TO ASCII");
    assert_eq!(buf, "back to ascii");

    lowercase_ascii_into(&mut buf, "");
    assert_eq!(buf, "");
}

#[test]
fn test_non_ascii_never_takes_the_ascii_path() {
    // These all lowercase differently under ASCII-only rules, so scoring must
    // route them to `to_lowercase`. Guards the `is_ascii` branch in
    // `score_content_match`, which is what keeps Greek matching itself.
    // Note ß is deliberately absent: it lowercases identically under both
    // paths, so it could not tell them apart.
    for text in [
        "\u{39F}\u{394}\u{39F}\u{3A3}", // ΟΔΟΣ, final sigma
        "\u{3A3}\u{3A3}\u{3A3}",        // ΣΣΣ
        "\u{130}stanbul",               // İ expands to two chars
        "\u{2126}",                     // Ohm sign
        "caf\u{c9}",                    // É
        "ascii then \u{3A3}",
    ] {
        assert!(!text.is_ascii(), "{:?} must not take the ASCII path", text);

        let mut ascii_style = text.to_string();
        ascii_style.make_ascii_lowercase();
        assert_ne!(
            ascii_style,
            text.to_lowercase(),
            "{:?} would be unchanged by the ASCII path, so it proves nothing",
            text
        );
    }
}
