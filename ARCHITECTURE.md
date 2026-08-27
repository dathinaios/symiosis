# Symiosis Architecture

How the app is put together, and the decisions behind it that the code cannot state for itself. Deliberately excludes anything transient: fixed defects live in the commit history, open ones in the maintainer's notes.

---

## Shape of the system

Symiosis is a Tauri 2 desktop app. Rust owns the filesystem and the search index; a SvelteKit frontend (Svelte 5 runes, static adapter, no SSR) owns the UI.

**Notes are files. The database is a cache.** Everything downstream of that follows from it: the index can always be rebuilt by rescanning the notes directory, so recovery from a corrupt or inconsistent index is a rescan rather than a repair.

```
┌─ Frontend (src/) ──────────────────────────────────────────┐
│  routes/+page.svelte      composition + Svelte context     │
│  lib/ui/                  presentation only                │
│  lib/app/                 coordinator, commands, keyboard, │
│                           lifecycle, effects               │
│  lib/core/                11 stateful managers             │
│  lib/services/            typed invoke() wrappers          │
└────────────────────────────────┬───────────────────────────┘
                                 │ Tauri IPC (28 commands)
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

`core/` also imports nothing from `@tauri-apps`. Platform capabilities reach it as injected dependencies (`LinkOpener`, `notifyError`, `configService.onConfigUpdated`), so a manager can be tested without mocking a Tauri module.

### State

`AppState` is the single shared backend value, cloned into every command through Tauri's managed state:

| Field                                           | Purpose                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| `config: Arc<RwLock<AppConfig>>`                | The running configuration — **the** source of truth for the notes directory    |
| `database_manager: Arc<Mutex<DatabaseManager>>` | The one SQLite connection                                                      |
| `database_rebuild_lock: Arc<RwLock<()>>`        | Read-held for normal queries, write-held for a full rebuild                    |
| `self_writes: Arc<SelfWriteRegistry>`           | Filesystem changes the app made itself, so the watcher can ignore its own echo |
| `was_first_run: Arc<AtomicBool>`                | Whether `config.toml` was absent at startup                                    |

On the frontend the equivalent is `createAppCoordinator()`, which instantiates the eleven managers, wires their dependencies explicitly, and publishes `managers` and `commands` through Svelte context. Managers are closures over `$state` returning getter objects — no classes, no global stores. That factory shape is load-bearing rather than stylistic: every manager test constructs a fresh instance with hand-built dependencies, which module-level singleton state would make impossible.

Manager dependencies are declared as `Pick<SearchManager, 'searchInput' | 'executeSearch'>` rather than as restated structural types, so each consumer still names only the slice it uses but cannot drift from the real interface.

### The app layer

Four files, each with one job:

| File                       | Owns                                                                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `appCoordinator.svelte.ts` | Composition root. Builds the managers, derives `selectedNote` (the one value spanning two managers), wires the rest together.                                          |
| `commands.svelte.ts`       | Every user-triggerable operation, as one surface. Built once with its dependencies; commands read current state from the managers rather than being handed a snapshot. |
| `keyboard.svelte.ts`       | Three per-context keymaps (search input / edit mode / list) resolving a key to a command. Nothing else.                                                                |
| `lifecycle.svelte.ts`      | Startup and teardown: config init, the seven Tauri subscriptions, first load, and unwinding all of it.                                                                 |

`prompt*` commands open a dialog; the bare verb performs the operation — `promptDeleteNote` opens the confirmation, `deleteNote` is what the confirmation calls. Reactive effects are deliberately _not_ registered in `lifecycle`: `$effect` throws `effect_orphan` outside component initialisation, so `+page.svelte` registers them via `setupReactiveEffects()`.

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

**Search.** FTS5 supplies prefix-matched candidates — `max(500, max_search_results)` of them, so the pool is never smaller than the number of results asked for — which are then re-scored in Rust. Every term is quoted before it reaches `MATCH`, because FTS5 reads `-` as an operator and an unquoted hyphenated term fails the whole query.

Ranking is by match type first, so any title match outranks every content match: exact title, prefix title, word-prefix, then `nucleo` fuzzy, then content. Titles carry a larger boost than filenames. Matching is case-insensitive throughout, and word-prefix matching splits on `_-.,+=;:` so `plan` matches `roadmap-planning`. Ties break by score, then by recency, then alphabetically by title. An empty query lists notes by recency.

**External change.** `notify` events are debounced 500ms per path, filtered to `.md`/`.txt`/`.markdown`, and checked against `SelfWriteRegistry`. Anything genuinely external gets an `external_change` backup (if the content differs from the index) and an index update, then the frontend is told to refresh.

**Recovery.** Any database error during a note operation triggers `handle_database_recovery` → `DROP TABLE` → rescan. Startup additionally content-checks the 100 most recently modified files and rebuilds on mismatch.

---

## Decisions worth knowing

Not a backlog — these are choices the code cannot explain about itself, kept so
the next reader does not redo the reasoning. Open defects live in the
maintainer's notes, not here.

**`contentNavigationManager.svelte.ts` is deliberately not split** (~1000 lines): four navigation modes, accordion styling and clipboard handling. It sits behind one stable interface and causes no threading pain, so splitting it was deferred until a feature actually touches it.

**The frontend config state is initialised with placeholder values, on purpose.** `configManager` declares a 40-line object of empty strings and zeros until the real config loads. Making it `AppConfig | null` was considered and rejected: it would push a null-guard to 42 read sites (21 in `HintsPanel` alone, inside `$derived` blocks that evaluate before config loads), which is worse code than the initialiser it removes. The alternative — real default values in TypeScript — would create a second source of truth for defaults that Rust already owns. A better fix is to gate the config-dependent components on `configManager.isInitialized` and render nothing until then; that changes mount behaviour, so it wants a manual smoke test.

**IPC errors are strings.** All 28 commands return `Result<_, String>` — consistent, but lossy: the frontend cannot distinguish a missing file from a permission error without matching on message text. Structuring them is a wide change for a benefit no current caller needs.

---

## Working on this codebase

```
pnpm install
pnpm tauri dev          # run the app

pnpm test               # 540 frontend tests
pnpm lint               # eslint
pnpm check              # svelte-check
pnpm format:check       # prettier

cd src-tauri
cargo test              # 132 unit tests + the cleanup integration runner
cargo clippy --all-targets --all-features -- -D warnings
cargo fmt --check
```

CI runs all of the above. On Linux the Rust build needs the webkit/gtk stack — see the `Install system dependencies` step in `.github/workflows/ci.yml`; without it the build fails in `gdk-sys` before any test runs.

Two conventions worth keeping:

- **Backend tests use `TestConfigOverride`**, which points the whole app at a temp directory and refuses to run if the resulting path is not clearly temporary. Tests that assert on the _real_ config or notes paths must be marked `#[serial]` so they cannot observe another test's override.
- **Prefer a test that fails against the old behaviour.** Every fix in this pass was verified by restoring the bug and watching the new test go red. Several of these defects survived because a test mocked the seam that was broken.
