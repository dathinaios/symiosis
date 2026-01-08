# ETC and DRY Analysis Report for Symiosis

**Date:** 2026-01-08
**Analyst:** Claude Code (Opus 4.5)
**Codebase:** Symiosis - Desktop Note-Taking Application

---

## Executive Summary

This report identifies **Easy To Change (ETC)** and **Don't Repeat Yourself (DRY)** violations in the Symiosis codebase. Triple-checked findings reveal **7 issues** (4 backend, 3 frontend) requiring attention, ranked by severity and impact.

---

# BACKEND ISSUES (Rust)

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

# FRONTEND ISSUES (TypeScript/Svelte)

---

## Issue #5: Duplicated Dialog CSS Styles (DRY - HIGH SEVERITY)

### Problem
The `.dialog-overlay` and `.dialog` CSS styles are **duplicated verbatim** across **6 Svelte components**, totaling ~150 lines of duplicated CSS.

### Evidence

| Component | Lines | Duplication |
|-----------|-------|-------------|
| `src/lib/ui/DeleteDialog.svelte` | 94-119 | `.dialog-overlay`, `.dialog`, `.dialog h3`, `.dialog p` |
| `src/lib/ui/ConfirmationDialog.svelte` | 92-117 | IDENTICAL styles |
| `src/lib/ui/InputDialog.svelte` | 128-161 | IDENTICAL styles |
| `src/lib/ui/VersionExplorer.svelte` | 255-280 | IDENTICAL styles |
| `src/lib/ui/RecentlyDeleted.svelte` | 182-207 | IDENTICAL styles |
| `src/lib/ui/SettingsPane.svelte` | 99-124 | IDENTICAL styles |

### Duplicated CSS Pattern (appears 6 times)
```css
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  /* ... ~25 more identical lines */
}
```

### Impact
- Adding a design change requires modifying **6 files**
- Inconsistencies can creep in (e.g., `rgba(0, 0, 0, 0.7)` vs `rgba(0, 0, 0, 0.5)` already differs between files)
- ~150 lines of unnecessary code bloat

### Recommendation
Create a shared CSS file or use Svelte's global styles:

**Option A: Global CSS file**
```css
/* src/lib/styles/dialog.css */
.dialog-overlay { /* shared styles */ }
.dialog { /* shared styles */ }
```

**Option B: Base Dialog Component**
```svelte
<!-- BaseDialog.svelte -->
<div class="dialog-overlay" onclick={onOverlayClick}>
  <div class="dialog">
    <slot />
  </div>
</div>

<style>
  /* Shared styles here */
</style>
```

---

## Issue #6: Duplicated Default Config Values (ETC - HIGH SEVERITY)

### Problem
Default configuration values are **duplicated across 3 locations** (1 backend, 2 frontend), creating a severe ETC violation.

### Evidence

**Location 1: Rust Backend** - `src-tauri/src/config.rs:137-152`
```rust
impl Default for InterfaceConfig {
    fn default() -> Self {
        Self {
            ui_theme: "gruvbox-dark".to_string(),
            font_family: "Inter, sans-serif".to_string(),
            font_size: 14,
            markdown_render_theme: "modern-dark".to_string(),
            md_render_code_theme: "gruvbox-dark-medium".to_string(),
            // ...
        }
    }
}
```

**Location 2: Frontend Service** - `src/lib/services/configService.svelte.ts:168-178`
```typescript
// Fallback defaults - DUPLICATED from backend
return {
  ui_theme: 'gruvbox-dark',
  font_family: 'Inter, sans-serif',
  font_size: 14,
  markdown_render_theme: 'modern-dark',
  md_render_code_theme: 'gruvbox-dark-medium',
  // ...
}
```

**Location 3: Frontend Manager** - `src/lib/core/configManager.svelte.ts:63-76`
```typescript
// SAME defaults duplicated again
interface: {
  ui_theme: 'gruvbox-dark',
  font_family: 'Inter, sans-serif',
  // ...
}
```

### Impact
- Changing a default value requires updates in **3 different files** across **2 languages**
- High risk of defaults becoming inconsistent
- Example: If you change the default theme to `"modern-dark"`, you must update:
  1. `src-tauri/src/config.rs`
  2. `src/lib/services/configService.svelte.ts`
  3. `src/lib/core/configManager.svelte.ts`

### Recommendation
1. **Remove frontend fallbacks** - Trust the backend as the single source of truth
2. **Or expose defaults via API** - Create a `get_default_config()` Tauri command

```typescript
// configService.svelte.ts - AFTER refactoring
async function getInterfaceConfig(): Promise<InterfaceConfig> {
  try {
    return await invoke<InterfaceConfig>('get_interface_config')
  } catch (e) {
    // Fetch defaults from backend instead of hardcoding
    return await invoke<InterfaceConfig>('get_default_interface_config')
  }
}
```

---

## Issue #7: Duplicated Gruvbox Theme List in Frontend (DRY - MEDIUM SEVERITY)

### Problem
The gruvbox theme list appears in `configService.svelte.ts` duplicating the backend list.

### Evidence

**Frontend** - `src/lib/services/configService.svelte.ts:413-420`
```typescript
const gruvboxThemes = [
  'gruvbox-dark-hard',
  'gruvbox-dark-medium',
  'gruvbox-dark-soft',
  'gruvbox-light-hard',
  'gruvbox-light-medium',
  'gruvbox-light-soft',
]
```

**Backend** - `src-tauri/src/utilities/config_helpers.rs:76-79`
```rust
vec![
    "gruvbox-dark-hard",
    "gruvbox-dark-medium",
    "gruvbox-dark-soft",
    // ... same list
]
```

### Impact
- Adding a new gruvbox variant requires frontend AND backend changes
- Related to Issue #1 (theme list duplication)

### Recommendation
Expose theme metadata from backend:

```typescript
// Use API instead of hardcoded list
const themeInfo = await invoke<ThemeMetadata>('get_theme_metadata', { theme })
if (themeInfo.category === 'gruvbox') {
  // Handle gruvbox path
}
```

---

# SUMMARY TABLES

## All Issues by Severity

| # | Issue | Layer | Type | Severity | Files Affected |
|---|-------|-------|------|----------|----------------|
| 1 | Theme Lists (Backend) | Rust | ETC | HIGH | 2 |
| 5 | Dialog CSS Styles | Svelte | DRY | HIGH | 6 |
| 6 | Default Config Values | Cross-layer | ETC | HIGH | 3 |
| 2 | Safety Check Pattern | Rust | DRY | MEDIUM | 1 |
| 3 | Lock Acquisition | Rust | DRY | MEDIUM | 2 |
| 7 | Gruvbox Theme List | TypeScript | DRY | MEDIUM | 2 |
| 4 | Cleanup Logic | Rust | DRY | LOW | 3 |

## Duplication Statistics

| Category | Duplicated Lines | Occurrences |
|----------|------------------|-------------|
| Dialog CSS | ~150 lines | 6 components |
| Theme Lists | ~60 lines | 4 locations |
| Config Defaults | ~40 lines | 3 locations |
| Safety Check | ~4 lines | 9 functions |
| Lock Pattern | ~6 lines | 5 functions |
| Cleanup Logic | ~15 lines | 6 locations |

---

## Recommendations Priority

### Immediate (High Impact)
1. **Issue #6** - Default Config Values (Cross-layer ETC) - Highest risk of bugs
2. **Issue #1** - Theme Lists Backend - Combine with Issue #7
3. **Issue #5** - Dialog CSS - Quick win, large reduction

### Short-term
4. **Issue #2** - Safety Check Pattern - Easy macro extraction
5. **Issue #7** - Frontend Theme List - Part of theme consolidation

### Medium-term
6. **Issue #3** - Lock Pattern - Improves consistency

### When Convenient
7. **Issue #4** - Cleanup Logic - Nice to have

---

## Verification Notes

All findings were **triple-checked** using:
- Direct file reads to verify exact line numbers
- Grep searches across both frontend and backend
- CSS class pattern matching to verify identical styles
- Cross-referencing config values between Rust and TypeScript
- Verification of actual code duplication (not just similar patterns)

**Report generated by Claude Code analysis on 2026-01-08**
