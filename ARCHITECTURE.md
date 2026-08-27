# Symiosis Architecture

An assessment of the codebase as of v0.3.7, written before adding new features. It describes how the app is put together, the defects found and fixed during the audit, and the issues deliberately left open.

---

## Shape of the system

Symiosis is a Tauri 2 desktop app. Rust owns the filesystem and the search index; a SvelteKit frontend (Svelte 5 runes, static adapter, no SSR) owns the UI.

**Notes are files. The database is a cache.** Everything downstream of that follows from it: the index can always be rebuilt by rescanning the notes directory, so recovery from a corrupt or inconsistent index is a rescan rather than a repair.

```
┌─ Frontend (src/) ──────────────────────────────────────────┐
│  routes/+page.svelte      composition + Svelte context     │
│  lib/ui/                  presentation only                │
│  lib/app/                 coordinator, actions, effects    │
│  lib/core/                 10 stateful managers            │
│  lib/services/            typed invoke() wrappers          │
└────────────────────────────────┬───────────────────────────┘
                                 │ Tauri IPC (32 commands)
┌────────────────────────────────┴───────────────────────────┐
│  commands/     IPC surface; validates, then delegates      │
│  services/     database_service, note_service              │
│  core/         AppState, AppError, SelfWriteRegistry       │
│  utilities/    paths, file_safety, validation, rendering   │
│  search.rs     FTS5 candidates + fuzzy re-ranking          │
│  watcher.rs    notify-based external change detection      │
└────────────────────────────────────────────────────────────┘
```

Dependencies point one way in both halves: UI → app → core → services, and commands → services → utilities. Nothing in `core/` imports from `app/`; nothing in `utilities/` imports from `commands/`. That discipline is the codebase's main structural strength and is what made this audit tractable.

### State

`AppState` is the single shared backend value, cloned into every command through Tauri's managed state:

| Field                                           | Purpose                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| `config: Arc<RwLock<AppConfig>>`                | The running configuration — **the** source of truth for the notes directory    |
| `database_manager: Arc<Mutex<DatabaseManager>>` | The one SQLite connection                                                      |
| `database_rebuild_lock: Arc<RwLock<()>>`        | Read-held for normal queries, write-held for a full rebuild                    |
| `self_writes: Arc<SelfWriteRegistry>`           | Filesystem changes the app made itself, so the watcher can ignore its own echo |
| `was_first_run: Arc<AtomicBool>`                | Whether `config.toml` was absent at startup                                    |

On the frontend the equivalent is `createAppCoordinator()`, which instantiates the ten managers, wires their dependencies explicitly, and publishes `managers` / `state` / `actions` through Svelte context. Managers are closures over `$state` returning getter objects — no classes, no global stores.

### Storage layout

Both the index and the backups are keyed by a hash of the notes directory path, so pointing the app at a different directory gives it a different database and backup tree rather than mixing them:

```
$DATA_DIR/symiosis/
  databases/<notes-dir-name>-<hash>/notes.sqlite
  backups/<notes-dir-name>-<hash>/<mirrors the notes tree>
  temp/write_temp_<nanos>.md
  symiosis.log
```

`notes` is an FTS5 virtual table holding `filename`, `content`, `html_render`, plus unindexed `modified` and `is_indexed`. Markdown is rendered to HTML in Rust (`pulldown-cmark` → `ammonia` sanitize → linkify) and cached in the row. The 2000 most recently modified notes are rendered eagerly at startup; the rest are rendered on first view.

### The four paths worth knowing

**Save.** `save_note_with_content_check` re-reads the file and refuses if it no longer matches what the editor started from (writing a `save_failure` backup of the unsaved text first). Then `safe_write_note` takes a rollback backup, writes to a temp file, renames it into place, and verifies the bytes landed. Finally the row is upserted with the file's real mtime.

**Search.** FTS5 supplies up to 500 prefix-matched candidates, which are re-scored in Rust: exact title, prefix title, word-prefix, then `nucleo` fuzzy, with content matches ranked below all title matches. An empty query lists notes by recency.

**External change.** `notify` events are debounced 500ms per path, filtered to `.md`/`.txt`/`.markdown`, and checked against `SelfWriteRegistry`. Anything genuinely external gets an `external_change` backup (if the content differs from the index) and an index update, then the frontend is told to refresh.

**Recovery.** Any database error during a note operation triggers `handle_database_recovery` → `DROP TABLE` → rescan. Startup additionally content-checks the 100 most recently modified files and rebuilds on mismatch.

---

## What the audit found

Every defect below was reproduced before being fixed, and each fix carries a regression test that was confirmed to fail against the old behaviour.

The starting point was not a codebase in trouble: 517 frontend tests, 119 Rust tests, eslint, svelte-check and `cargo fmt` were all green. Every defect lived in a gap _between_ what those suites covered — and two of them were invisible because the tests mocked the exact seam that broke.

### Duplicate rows in the notes index

`notes` is an FTS5 virtual table, so `filename` carries no uniqueness constraint and `INSERT OR REPLACE` never fires a conflict clause — it appends a second row. Reproduced directly against SQLite 3.45.1:

```
INSERT OR REPLACE ... ('a.md', 'v1', 100)
INSERT OR REPLACE ... ('a.md', 'v2', 200)
→ 2 rows for a.md
```

The trigger was a second bug: the `modified` column was written from `SystemTime::now()` rather than the file's mtime, so the two disagreed whenever a write straddled a second boundary. The next filesystem sync then saw an unchanged note as modified and re-inserted it.

The consequences cascaded. The note appeared twice in search; the duplicate check in `init_db` reported `SQLITE_CORRUPT` and forced a full `DROP TABLE` and re-render of every note. Worse — this surfaced while building the regression test — once a duplicate existed, the verification read in `update_note_in_database` picked up the _wrong_ row, so every subsequent save also failed verification and went through database recovery: another full rebuild, every time.

_Fixed:_ one `upsert_note` helper that deletes by filename before inserting, and `modified` read from the file's real mtime through a shared `fs_meta::file_modified_secs`.

### Search highlighting corrupted rendered HTML

Highlighting regex-replaced over raw HTML, matching inside tag names and attribute values:

```
query "http" → <a href="<mark class="highlight">http</mark>s://example.com/docs">
query "code" → <pre><<mark class="highlight">code</mark> class="language-rust">…
```

The second case destroys the code block. Searches are issued at three characters, so `http`, `code`, `div`, `class`, `span`, `pre` and `mark` were all live triggers.

_Fixed:_ split on tags and highlight only the text segments between them.

### Highlight cache collided across notes

The cache key was `content.substring(0, 100) + query`, so two notes sharing their opening markup — a very ordinary thing for notes to do — were served each other's rendered body.

_Fixed:_ key on a hash of the full content.

### `initialize()` threw on every startup

`+page.svelte` called `setupReactiveEffects()` during component initialisation (correct), and `appCoordinator.initialize()` called it _again_ after `await`s inside `onMount`. Svelte 5's `validate_effect` throws `effect_orphan` when there is no active effect context — in production builds too.

`initialize()` therefore aborted before returning its cleanup function, so the seven Tauri event listeners and `configManager.cleanup()` never unregistered, and every launch logged an unhandled rejection. The coordinator test could not see this: it mocked `setupAppEffects` outright.

_Fixed:_ effects are registered only during component initialisation, and the test no longer mocks them — with the old code restored, four tests now fail with `effect_orphan`.

### `bind:isDirty` threw a `TypeError` per keystroke

`NoteView` bound to `editorManager.isDirty`, a getter-only property. Compiling the component with the real Svelte compiler shows what `bind:` generates:

```js
get isDirty() { return editorManager.isDirty; },
set isDirty($$value) { editorManager.isDirty = $$value; }
```

`Editor`'s document-change handler invoked that setter on every keystroke, and assigning to a getter-only property in an ES module throws. It shipped because CodeMirror catches exceptions from update listeners and routes them to `logException` — so it was console noise, not a visible failure. The `onDirtyChange` callback the design wanted was already declared in `Props`, and never used.

_Fixed:_ dirty state flows through that callback; `editorManager.isDirty` stays the single derived source of truth.

### Two competing sources of truth for the notes directory

`AppState` held the config in an `RwLock`, but six call sites went around it and re-read `config.toml` from disk. Note paths were resolved from `AppState` while backup paths were resolved from the file, so editing the config without a refresh made every backup fail with _"Note path is not within configured notes directory"_ — silently, because the rename path maps that error to "no backup needed". A regression test reproduces exactly that.

There was a second smell in the same area: `load_config()` _wrote_ a default config file when the read failed, so a path lookup could write to disk.

_Fixed:_ the notes directory is passed explicitly, `AppState::notes_dir()` is the single accessor, and creating the config file is now an explicit startup step.

### The watcher went deaf for five seconds after every write

Every file operation incremented a global counter and spawned a detached thread that slept five seconds before decrementing it. The watcher skipped **all** filesystem events while that counter was non-zero.

So saving one note made the app blind to every other note for at least five seconds: an external edit in that window got no backup and no index update, leaving the database stale — which is precisely the staleness that fed the duplicate-row bug. Rapid saves extended the window indefinitely, and every operation leaked a thread.

_Fixed:_ `SelfWriteRegistry` records what the app expects a path to look like after its own write, and the watcher drops an event only when the state on disk is still exactly that. Events for other paths are never suppressed, and an external edit that changes the bytes is recognised as external even inside the window — the time limit now bounds staleness, not correctness.

### The tray's "Refresh Notes Cache" did nothing

`let _ = refresh_cache(app_handle, app_state)` on an `async fn` builds a future and drops it without ever polling it. Found by enabling clippy as an error.

_Fixed:_ the refresh body takes an `&AppState`, and the tray handler spawns it and logs failures.

### No CI ran the tests

`publish.yml` fires on version tags. Nothing ran the 517 frontend tests, 129 Rust tests, eslint, svelte-check, clippy or either formatter automatically.

_Fixed:_ `ci.yml` runs all of them on push and pull request, with clippy gating at `-D warnings`.

---

## Left open

These are real but were out of scope for this pass. Roughly in order of how much they will cost later.

**Two files are doing too much.** `appCoordinator.svelte.ts` (630 lines) combines state, actions, listener wiring and lifecycle. `contentNavigationManager.svelte.ts` (1007 lines) mixes four navigation modes, accordion styling and clipboard handling. Both are the natural first targets if the feature work touches them.

**Error types are inconsistent across the IPC boundary.** 30 of 32 commands return `Result<_, String>`; `load_custom_theme_file` and `validate_theme_path` return `AppResult<T>`, which serialises `AppError` as a structured object — so the frontend's `${e}` interpolation yields `[object Object]` for exactly those two. Worth settling on one shape before adding more commands.

**Unused IPC surface.** `list_all_notes`, `hide_main_window` and `validate_theme_path` are registered but never invoked from the frontend; the three `mac_focus` commands are only ever called from Rust and need not be IPC commands at all.

**Search has a hidden ceiling.** FTS5 candidates are capped at a hardcoded `LIMIT 500` before re-ranking, while `max_search_results` is configurable up to 10000 — so an exact title match ranked 501st by BM25 is dropped. Content scoring also lowercases each candidate's full body on every keystroke.

**No `~` expansion in `notes_directory`.** A hand-written `notes_directory = "~/Notes"` produces a literal `./~/Notes` directory; validation only logs a warning.

**Remote images in notes phone home.** The CSP allows `img-src … https: http:` and the sanitizer permits `<img src>`, so a note containing a remote image URL makes a network request when rendered. `script-src 'unsafe-inline'` is also enabled (CodeMirror needs it), which weakens the defence-in-depth behind the sanitizer.

**Startup reads up to 100 files.** `quick_filesystem_sync_check` reads full file contents to detect drift, and any single mismatch triggers a rebuild of the whole database.

**First-run event is a race.** `first-run-detected` is emitted from a thread after a fixed 1s sleep, with no guarantee the frontend has registered its listener.

---

## Working on this codebase

```
pnpm install
pnpm tauri dev          # run the app

pnpm test               # 524 frontend tests
pnpm lint               # eslint
pnpm check              # svelte-check
pnpm format:check       # prettier

cd src-tauri
cargo test              # 129 unit tests + the cleanup integration runner
cargo clippy --all-targets --all-features -- -D warnings
cargo fmt --check
```

CI runs all of the above. On Linux the Rust build needs the webkit/gtk stack — see the `Install system dependencies` step in `.github/workflows/ci.yml`; without it the build fails in `gdk-sys` before any test runs.

Two conventions worth keeping:

- **Backend tests use `TestConfigOverride`**, which points the whole app at a temp directory and refuses to run if the resulting path is not clearly temporary. Tests that assert on the _real_ config or notes paths must be marked `#[serial]` so they cannot observe another test's override.
- **Prefer a test that fails against the old behaviour.** Every fix in this pass was verified by restoring the bug and watching the new test go red. Several of these defects survived because a test mocked the seam that was broken.
