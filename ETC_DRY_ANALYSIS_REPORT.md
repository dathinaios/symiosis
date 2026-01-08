# ETC and DRY Analysis Report for Symiosis

**Date:** 2026-01-08
**Analyst:** Claude Code (Opus 4.5)
**Codebase:** Symiosis - Desktop Note-Taking Application

---

## Executive Summary

This report identifies **Easy To Change (ETC)** and **Don't Repeat Yourself (DRY)** violations in the Symiosis codebase. Triple-checked findings reveal **4 major issues** requiring attention, ranked by severity and impact.

---

## Issue #1: Duplicated Theme Lists (ETC - HIGH SEVERITY)

### Problem
Theme validation lists are **duplicated** between `validation.rs` and `config_helpers.rs`, violating both DRY and ETC principles.

### Evidence

**Location 1:** `src-tauri/src/utilities/validation.rs:45-64`
```rust
let valid_md_code_themes = [
    "gruvbox-dark-hard",
    "gruvbox-dark-medium",
    "gruvbox-dark-soft",
    // ... 18 themes total
];
```

**Location 2:** `src-tauri/src/utilities/config_helpers.rs:75-96`
```rust
pub fn get_available_code_themes() -> Vec<&'static str> {
    vec![
        "gruvbox-dark-hard",
        "gruvbox-dark-medium",
        "gruvbox-dark-soft",
        // ... 18 themes total (SAME LIST)
    ]
}
```

**Similarly duplicated:**
| Theme Type | validation.rs (lines) | config_helpers.rs (lines) |
|------------|----------------------|--------------------------|
| Editor themes | 118-142 | 47-73 |
| Editor modes | 109 | 43-45 |
| Code themes | 45-64 | 75-96 |

### Impact
- **ETC Violation:** Adding a new theme requires changes in **2 locations**
- **Risk:** Theme lists can become out of sync, causing validation errors
- **Maintenance burden:** Developers must remember to update both files

### Recommendation
Centralize all theme/mode lists in `config_helpers.rs` and have `validation.rs` call those functions:

```rust
// validation.rs - AFTER refactoring
pub fn validate_interface_config(interface: &InterfaceConfig) -> AppResult<()> {
    let valid_md_code_themes = get_available_code_themes(); // Use existing function
    if !valid_md_code_themes.contains(&interface.md_render_code_theme.as_str()) {
        // ...
    }
}
```

---

## Issue #2: Repeated Safety Check Pattern in Test Utils (DRY - MEDIUM SEVERITY)

### Problem
The same safety check boilerplate is repeated **9 times** across test helper functions.

### Evidence

**Location:** `src-tauri/src/tests/test_utils.rs:323-436`

The following pattern appears in lines: 323, 340, 351, 362, 379, 395, 408, 419, 433

```rust
// SAFETY CHECK: Ensure we're in test mode before proceeding
if std::env::var("SYMIOSIS_TEST_MODE_ENABLED").is_err() {
    panic!("CRITICAL SAFETY ERROR: <function_name>() called outside of TestConfigOverride!");
}
```

### Affected Functions
1. `create_test_mock_app()` - line 323
2. `test_create_new_note()` - line 340
3. `test_get_note_content()` - line 351
4. `test_delete_note()` - line 362
5. `test_save_note_with_content_check()` - line 379
6. `test_rename_note()` - line 395
7. `test_list_all_notes()` - line 408
8. `test_get_note_html_content()` - line 419
9. `test_search_notes_hybrid()` - line 433

### Recommendation
Extract to a macro or helper function:

```rust
macro_rules! ensure_test_mode {
    ($func_name:literal) => {
        if std::env::var("SYMIOSIS_TEST_MODE_ENABLED").is_err() {
            panic!(
                "CRITICAL SAFETY ERROR: {}() called outside of TestConfigOverride!",
                $func_name
            );
        }
    };
}

// Usage:
pub fn test_create_new_note(note_name: &str) -> Result<(), String> {
    ensure_test_mode!("test_create_new_note");
    // ...
}
```

---

## Issue #3: Repeated Database Lock Acquisition Pattern (DRY - MEDIUM SEVERITY)

### Problem
Database lock acquisition code is duplicated across 3 functions in `database.rs` and 2 functions in `database_service.rs`.

### Evidence

**Location 1:** `src-tauri/src/database.rs:66-74` (with_db)
```rust
let _rebuild_guard = app_state.database_rebuild_lock.read().map_err(|e| {
    AppError::DatabaseConnection(format!("Database rebuild lock poisoned: {}", e))
})?;
let manager = app_state.database_manager.lock().map_err(|e| {
    AppError::DatabaseConnection(format!("Database manager lock poisoned: {}", e))
})?;
```

**Location 2:** `src-tauri/src/database.rs:83-91` (with_db_mut)
```rust
// IDENTICAL pattern repeated
```

**Location 3:** `src-tauri/src/database.rs:97-105` (refresh_database_connection)
```rust
// IDENTICAL pattern repeated
```

**Location 4 & 5:** `src-tauri/src/services/database_service.rs:266-268, 312-314`
```rust
// Similar pattern for manager lock
```

### Recommendation
Create helper functions for lock acquisition:

```rust
fn acquire_db_read_locks(
    app_state: &AppState
) -> AppResult<(RwLockReadGuard<()>, MutexGuard<DatabaseManager>)> {
    let rebuild_guard = app_state.database_rebuild_lock.read()
        .map_err(|e| AppError::DatabaseConnection(
            format!("Database rebuild lock poisoned: {}", e)
        ))?;
    let manager = app_state.database_manager.lock()
        .map_err(|e| AppError::DatabaseConnection(
            format!("Database manager lock poisoned: {}", e)
        ))?;
    Ok((rebuild_guard, manager))
}
```

---

## Issue #4: Duplicated Temp Directory Cleanup Logic (DRY - LOW SEVERITY)

### Problem
The temporary directory cleanup pattern is duplicated in **3 files** with nearly identical code.

### Evidence

The same nested loop pattern for cleaning `_tmp*` directories appears in:

| File | Lines | Purpose |
|------|-------|---------|
| `src-tauri/src/tests/test_utils.rs` | 100-138 | `cleanup_all_tmp_directories()` |
| `src-tauri/src/tests/cleanup_test.rs` | 51-77 | Test verification |
| `src-tauri/tests/cleanup_integration.rs` | 66-99, 114-141 | Integration test cleanup |

### Pattern (repeated ~6 times across codebase)
```rust
if let Ok(entries) = fs::read_dir(&dir) {
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(dir_name) = path.file_name().and_then(|n| n.to_str()) {
                if dir_name.starts_with("_tmp") {
                    let _ = fs::remove_dir_all(&path);
                }
            }
        }
    }
}
```

### Recommendation
Create a shared utility function:

```rust
/// Removes all directories matching a prefix within a parent directory
pub fn remove_prefixed_dirs(parent: &Path, prefix: &str) -> Result<usize, std::io::Error> {
    let mut count = 0;
    if parent.exists() {
        for entry in fs::read_dir(parent)?.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name.starts_with(prefix) {
                        fs::remove_dir_all(&path)?;
                        count += 1;
                    }
                }
            }
        }
    }
    Ok(count)
}
```

---

## Summary Table

| Issue | Type | Severity | Files Affected | Duplication Count |
|-------|------|----------|----------------|-------------------|
| #1 Theme Lists | ETC | HIGH | 2 | 3 list types x 2 = 6 |
| #2 Safety Check | DRY | MEDIUM | 1 | 9 repetitions |
| #3 Lock Pattern | DRY | MEDIUM | 2 | 5 repetitions |
| #4 Cleanup Logic | DRY | LOW | 3 | ~6 repetitions |

---

## ETC Principle Reminder

The **Easy To Change** principle states:
> *"Good design is easier to change than bad design."*

The theme list duplication (Issue #1) is the most critical ETC violation because:
1. Adding a new theme requires changes in **multiple files**
2. The relationship between files is not obvious
3. Changes are error-prone (easy to miss one location)

---

## Recommendations Priority

1. **Immediate:** Fix Issue #1 (Theme Lists) - Highest impact on maintainability
2. **Short-term:** Fix Issue #2 (Safety Check) - Reduces code noise significantly
3. **Medium-term:** Fix Issue #3 (Lock Pattern) - Improves consistency
4. **When convenient:** Fix Issue #4 (Cleanup Logic) - Nice to have

---

## Verification Notes

All findings were **triple-checked** using:
- Direct file reads to verify exact line numbers
- Grep searches to count occurrences
- Cross-referencing between related files
- Verification of actual code duplication (not just similar patterns)

**Report generated by Claude Code analysis on 2026-01-08**
