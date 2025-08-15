// External crates
use rusqlite::{params, Connection};
use std::collections::HashMap;
use std::path::PathBuf;

// Public API functions
pub fn get_db_connection() -> Result<Connection, String> {
    let db_path = get_database_path()?;
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create database directory: {}", e))?;
    }

    Connection::open(&db_path).map_err(|e| format!("Failed to open database: {}", e))
}

pub fn get_database_path() -> Result<PathBuf, String> {
    get_data_dir()
        .ok_or_else(|| "Failed to get data directory".to_string())
        .map(|path| path.join("symiosis").join("notes.sqlite"))
}

// Platform-specific utility functions
#[cfg(test)]
pub fn get_data_dir() -> Option<PathBuf> {
    get_data_dir_impl()
}

#[cfg(not(test))]
fn get_data_dir() -> Option<PathBuf> {
    get_data_dir_impl()
}

fn get_data_dir_impl() -> Option<PathBuf> {
    if let Some(home_dir) = home::home_dir() {
        #[cfg(target_os = "macos")]
        return Some(home_dir.join("Library").join("Application Support"));

        #[cfg(target_os = "windows")]
        return std::env::var("APPDATA").ok().map(PathBuf::from);

        #[cfg(target_os = "linux")]
        return Some(home_dir.join(".local").join("share"));

        #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
        return Some(home_dir.join(".local").join("share"));
    }
    None
}

// Database consistency detection utilities

/// Result of database integrity check
#[derive(Debug, Clone)]
pub struct IntegrityCheckResult {
    pub is_healthy: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
    pub stats: DatabaseStats,
}

/// Database statistics
#[derive(Debug, Clone)]
pub struct DatabaseStats {
    pub total_notes: i64,
    pub total_size_bytes: i64,
    pub largest_file_size: i64,
    pub avg_file_size: f64,
    pub files_with_issues: i64,
}

/// Comprehensive database integrity check
pub fn check_database_integrity(conn: &Connection) -> Result<IntegrityCheckResult, String> {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    // Run SQLite's built-in integrity check
    let sqlite_check = conn
        .query_row("PRAGMA integrity_check", [], |row| row.get::<_, String>(0))
        .map_err(|e| format!("Failed to run SQLite integrity check: {}", e))?;

    if sqlite_check != "ok" {
        errors.push(format!("SQLite integrity check failed: {}", sqlite_check));
    }

    // Check FTS5 table structure
    let fts_check = verify_fts_structure(conn)?;
    if let Some(error) = fts_check {
        errors.push(error);
    }

    // Gather database statistics
    let stats = gather_database_stats(conn)?;

    // Check for data anomalies
    let anomaly_warnings = detect_data_anomalies(conn, &stats)?;
    warnings.extend(anomaly_warnings);

    // Check for performance issues
    let perf_warnings = detect_performance_issues(conn, &stats)?;
    warnings.extend(perf_warnings);

    Ok(IntegrityCheckResult {
        is_healthy: errors.is_empty(),
        errors,
        warnings,
        stats,
    })
}

/// Verify FTS5 table structure is correct
fn verify_fts_structure(conn: &Connection) -> Result<Option<String>, String> {
    // Check if notes table exists
    let table_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='notes'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to check table existence: {}", e))?;

    if table_count == 0 {
        return Ok(Some("Notes table does not exist".to_string()));
    }

    // Check if it's an FTS5 table
    let table_sql: String = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE name='notes'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to get table definition: {}", e))?;

    if !table_sql.to_lowercase().contains("fts5") {
        return Ok(Some("Notes table is not an FTS5 virtual table".to_string()));
    }

    // Verify expected columns
    let expected_columns = ["filename", "content", "modified"];
    for column in &expected_columns {
        if !table_sql.to_lowercase().contains(&column.to_lowercase()) {
            return Ok(Some(format!("Missing expected column: {}", column)));
        }
    }

    Ok(None)
}

/// Gather comprehensive database statistics
fn gather_database_stats(conn: &Connection) -> Result<DatabaseStats, String> {
    // Total number of notes
    let total_notes: i64 = conn
        .query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))
        .map_err(|e| format!("Failed to count notes: {}", e))?;

    // Total size and file size statistics
    let size_stats: (i64, i64, f64) = conn
        .query_row(
            "SELECT SUM(LENGTH(content)), MAX(LENGTH(content)), AVG(LENGTH(content)) FROM notes",
            [],
            |row| {
                Ok((
                    row.get(0).unwrap_or(0),
                    row.get(1).unwrap_or(0),
                    row.get(2).unwrap_or(0.0),
                ))
            },
        )
        .map_err(|e| format!("Failed to get size statistics: {}", e))?;

    // Count files with potential issues
    let files_with_issues = count_problematic_files(conn)?;

    Ok(DatabaseStats {
        total_notes,
        total_size_bytes: size_stats.0,
        largest_file_size: size_stats.1,
        avg_file_size: size_stats.2,
        files_with_issues,
    })
}

/// Count files with potential data issues
fn count_problematic_files(conn: &Connection) -> Result<i64, String> {
    let mut count = 0i64;

    // Files with empty content
    let empty_files: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM notes WHERE LENGTH(TRIM(content)) = 0",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to count empty files: {}", e))?;
    count += empty_files;

    // Files with null bytes (potential corruption)
    let null_byte_files: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM notes WHERE content LIKE '%' || CHAR(0) || '%'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to count null byte files: {}", e))?;
    count += null_byte_files;

    // Extremely large files (potential issues)
    let large_files: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM notes WHERE LENGTH(content) > 100000000", // 100MB
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to count large files: {}", e))?;
    count += large_files;

    Ok(count)
}

/// Detect data anomalies that might indicate corruption
fn detect_data_anomalies(conn: &Connection, stats: &DatabaseStats) -> Result<Vec<String>, String> {
    let mut warnings = Vec::new();

    // Check for unusual file size distribution
    if stats.largest_file_size > 1024 * 1024 * 100 {
        // 100MB
        warnings.push(format!(
            "Very large file detected: {} bytes",
            stats.largest_file_size
        ));
    }

    if stats.avg_file_size > 1024.0 * 1024.0 * 10.0 {
        // 10MB average
        warnings.push(format!(
            "Unusually large average file size: {:.1} bytes",
            stats.avg_file_size
        ));
    }

    // Check for files with suspicious content patterns
    let suspicious_patterns = vec![
        ("Files with null bytes", "SELECT COUNT(*) FROM notes WHERE content LIKE '%' || CHAR(0) || '%'"),
        ("Files with only whitespace", "SELECT COUNT(*) FROM notes WHERE LENGTH(TRIM(content)) = 0 AND LENGTH(content) > 0"),
        ("Files with very long lines", "SELECT COUNT(*) FROM notes WHERE content LIKE '%' || CHAR(10) || '%' = 0 AND LENGTH(content) > 10000"),
    ];

    for (description, query) in suspicious_patterns {
        let count: i64 = conn
            .query_row(query, [], |row| row.get(0))
            .map_err(|e| format!("Failed to check {}: {}", description, e))?;

        if count > 0 {
            warnings.push(format!("{}: {} files", description, count));
        }
    }

    // Check for timestamp anomalies
    let current_timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let timestamp_issues: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM notes WHERE modified < 0 OR modified > ?",
            params![current_timestamp + 86400], // Future timestamps (24h tolerance)
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to check timestamps: {}", e))?;

    if timestamp_issues > 0 {
        warnings.push(format!(
            "Files with invalid timestamps: {}",
            timestamp_issues
        ));
    }

    Ok(warnings)
}

/// Detect potential performance issues
fn detect_performance_issues(
    conn: &Connection,
    stats: &DatabaseStats,
) -> Result<Vec<String>, String> {
    let mut warnings = Vec::new();

    // Check if database is getting large
    if stats.total_notes > 10000 {
        warnings.push(format!(
            "Large number of notes ({}): consider optimization",
            stats.total_notes
        ));
    }

    if stats.total_size_bytes > 1024 * 1024 * 1024 {
        // 1GB
        warnings.push(format!(
            "Large database size ({} bytes): monitor performance",
            stats.total_size_bytes
        ));
    }

    // Test a simple search to check FTS5 performance
    let search_start = std::time::Instant::now();
    let search_result = conn.query_row(
        "SELECT COUNT(*) FROM notes WHERE notes MATCH 'test'",
        [],
        |row| row.get::<_, i64>(0),
    );
    let search_time = search_start.elapsed();

    match search_result {
        Ok(_) => {
            if search_time > std::time::Duration::from_millis(1000) {
                warnings.push(format!("Slow FTS5 search detected: {:?}", search_time));
            }
        }
        Err(e) => {
            warnings.push(format!("FTS5 search failed: {}", e));
        }
    }

    Ok(warnings)
}

/// Quick health check - returns true if database appears healthy
pub fn quick_health_check(conn: &Connection) -> bool {
    // Run basic checks that should always pass
    let basic_checks = vec![
        // Table exists
        (
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='notes'",
            1i64,
        ),
        // Can query the table
        ("SELECT COUNT(*) FROM notes LIMIT 1", -1i64), // Any result is fine
    ];

    for (query, expected_min) in basic_checks {
        match conn.query_row(query, [], |row| row.get::<_, i64>(0)) {
            Ok(result) => {
                if expected_min >= 0 && result < expected_min {
                    return false;
                }
            }
            Err(_) => return false,
        }
    }

    // Test FTS5 search
    if conn
        .query_row(
            "SELECT COUNT(*) FROM notes WHERE notes MATCH 'test'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .is_err()
    {
        return false;
    }

    true
}

/// Compare filesystem and database states to detect sync issues
pub fn verify_sync_consistency(
    conn: &Connection,
    filesystem_files: &HashMap<String, (String, i64)>, // filename -> (content, modified_time)
) -> Result<Vec<String>, String> {
    let mut inconsistencies = Vec::new();

    // Get database files
    let mut database_files = HashMap::new();
    let mut stmt = conn
        .prepare("SELECT filename, content, modified FROM notes")
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })
        .map_err(|e| format!("Failed to query database: {}", e))?;

    for row in rows {
        let (filename, content, modified) =
            row.map_err(|e| format!("Failed to read row: {}", e))?;
        database_files.insert(filename, (content, modified));
    }

    // Check for files in database but not filesystem
    for filename in database_files.keys() {
        if !filesystem_files.contains_key(filename) {
            inconsistencies.push(format!(
                "Database file '{}' not found in filesystem",
                filename
            ));
        }
    }

    // Check for files in filesystem but not database
    for filename in filesystem_files.keys() {
        if !database_files.contains_key(filename) {
            inconsistencies.push(format!(
                "Filesystem file '{}' not found in database",
                filename
            ));
        }
    }

    // Check for content differences
    for (filename, (fs_content, fs_modified)) in filesystem_files {
        if let Some((db_content, db_modified)) = database_files.get(filename) {
            if fs_content != db_content {
                inconsistencies.push(format!("Content mismatch for file '{}'", filename));
            }
            if fs_modified != db_modified {
                inconsistencies.push(format!(
                    "Timestamp mismatch for file '{}': fs={}, db={}",
                    filename, fs_modified, db_modified
                ));
            }
        }
    }

    Ok(inconsistencies)
}
