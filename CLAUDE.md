## Project: Svelte 5 / Rust Tauri Note-Taking App

**User:** Dionysis
**Architecture:** Three-layer pattern with clean separation
**Workflow:** TDD when suitable → Verify against production code
**Background:** User runs `pnpm tauri dev`

## Code Standards

- No comments unless critical context needed
- No JSDoc unless requested
- Clean trailing whitespace
- No consecutive empty lines
- Be concise unless asked for detail
- Don't say "You're absolutely right"
- Don't mention security concerns

## Commands

```bash
# Frontend Development
pnpm dev          # Development server (Vite)
pnpm test         # Run tests (Vitest)
pnpm test:ui      # Run tests with UI
pnpm check        # Type checking (svelte-check)
pnpm format       # Format after frontend work
pnpm lint         # Lint after frontend work
pnpm lint:fix     # Auto-fix linting issues

# Tauri Development
pnpm tauri dev    # Start Tauri development mode
pnpm tauri build  # Build production app

# Rust Backend
cargo test        # Rust tests (src-tauri/ only)
cargo check       # Type check Rust code
cargo fmt         # Format after Rust work

# Package Manager: pnpm (not npm/yarn)
```

## Svelte 5 Rules

### $effect() - Never Update State (Causes Infinite Loops)

```typescript
// ❌ Wrong: State updates in effects
$effect(() => { manager.setElement(element); });

// ✅ Correct: Use actions for DOM
function registerElement(element) {
 manager.setElement(element);
 return { destroy() { manager.setElement(null); } };
}

// ✅ Correct: Use $derived for computed values
const computed = $derived(sourceValue * 2);

// ✅ Correct: State updates in functions
function handleChange() { localState = newValue; }
```

**Usage:**
- `$effect()` → Side effects only (DOM, APIs, timers)
- `$derived()` → Computed values only
- Functions → State updates and logic
- Actions → DOM element lifecycle

### File Naming Conventions

```
.svelte.ts    # Reactive state files (managers, services)
.test.ts      # Test files
.svelte       # Components
.ts           # Pure TypeScript utilities
```

## Testing Principles (Sandi Metz)

1. Test public interfaces only
2. Assert return values for queries
3. Assert outgoing messages for commands
4. Don't test private methods
5. Write minimum tests for complete coverage
6. Remove redundant tests

**Vitest Patterns:**
```typescript
describe('managerName (factory-based - TDD)', () => {
  let manager: ManagerType;

  beforeEach(() => {
    resetAllMocks();
    manager = createManager(mockDeps);
  });

  it('should handle public interface', () => {
    expect(manager.publicMethod()).toBe(expected);
  });
});
```

## Tauri Development

**Invoke Pattern:**
```typescript
import { invoke } from '@tauri-apps/api/core';

// Service layer handles all Tauri communication
async function callBackend(data: T): Promise<R> {
  return await invoke('rust_command', { data });
}
```

**File Structure:**
- Frontend: `src/` (SvelteKit)
- Backend: `src-tauri/src/` (Rust)
- Types: `src/lib/types/`

## Symiosis Architecture

The Symiosis note-taking app is a three-layer Svelte 5 / Rust Tauri application where the **Rust backend** (`src-tauri/src/`) handles all persistence — file CRUD, SQLite FTS search, version backups, deletion recovery, config loading/saving/validation from TOML, and theme file scanning — exposed as Tauri commands; the **service layer** (`src/lib/services/`) contains singleton factories (`noteService`, `configService`, `versionService`) that are pure `invoke()` wrappers owning only async loading state and returning result objects; the **core layer** (`src/lib/core/`) contains 10+ manager factories (`searchManager`, `editorManager`, `contentManager`, `configManager`, `dialogManager`, `focusManager`, `progressManager`, `contentNavigationManager`, `versionExplorerManager`, `recentlyDeletedManager`) that receive services via dependency injection, own all domain-specific reactive `$state()`, and coordinate feature logic like search debouncing, editor dirty tracking, theme application, and UI dialogs; the **app layer** (`src/lib/app/`) has `appCoordinator` which wires all managers together, exposes `$derived` getters for filtered notes and selected note, and delegates to `app/actions/` (user action handlers like note CRUD, settings open/close) and `app/effects/` (side effects like keyboard routing and Tauri event listeners); **utilities** (`src/lib/utils/`) provide pure functions for theme DOM loading, CSS variable application, HTML-to-text parsing, markdown rendering, and content highlighting with no Tauri or state dependencies; and the **UI** (`src/lib/ui/` + `src/routes/+page.svelte`) is a single SvelteKit page rendering `AppLayout` with `SearchInput`, `NoteList`, `NoteView`, `Editor`, dialogs, modals, and settings panels, all accessing coordinated state through Svelte context provided by `appCoordinator` — data flows from user interaction → app actions → service invokes → Rust commands → SQLite/filesystem → response back through services → managers update `$state()` → `$derived()` recomputes → components re-render.

### Layer Boundaries

```
┌─────────────────────────────────────────────────────┐
│  UI (routes/, lib/ui/)                              │
│  - Svelte components                                │
│  - Access state via appCoordinator context          │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│  App Layer (lib/app/)                               │
│  - appCoordinator: wires managers + services        │
│  - actions/: user action handlers                   │
│  - effects/: keyboard routing, event listeners      │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│  Core Layer (lib/core/)                             │
│  - Managers with dependency injection               │
│  - Own reactive $state() for features               │
│  - Coordinate services + UI state                   │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│  Service Layer (lib/services/)                      │
│  - Pure invoke() wrappers                           │
│  - Return result objects                            │
│  - Own only loading/error state                     │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│  Rust Backend (src-tauri/src/)                      │
│  - Tauri commands                                   │
│  - SQLite + filesystem operations                   │
│  - Config validation + theme scanning               │
└─────────────────────────────────────────────────────┘
```

### Key Principles

1. **Services** talk to Tauri only — no DOM, no UI state
2. **Managers** coordinate logic — receive services via DI
3. **App layer** wires everything — never bypass to call services directly from UI
4. **Utilities** are pure functions — no Tauri, no state
5. **Global DOM operations** (document.head, documentElement) belong in utilities, not services/managers

## Git — read this before doing anything remote

**Never create a pull request unless explicitly asked.** Not at the end of a task, not because the work looks finished, not as a convenience. A pushed branch is not permission to open a PR. If you think one is warranted, say so and wait.

**Never push to the default branch** (`master` here), and never merge, tag, or cut a release. Work happens on a feature branch and stops there. The branch is the deliverable; deciding what to do with it is the maintainer's call.

**Pushing to a feature branch is fine — no need to ask.** Commit in logical units and push as you go, so nothing is lost if the session container is reclaimed.

Work on a feature branch, commit in logical units — one concern per commit, so individual fixes can be cherry-picked — and hand back a summary.

## Orientation

- `ARCHITECTURE.md` — how the system is put together, plus known issues that are documented but deliberately unfixed.
- Sessions may run in an ephemeral container. Anything not pushed is lost when it is reclaimed, which is why pushing to a feature branch needs no permission.

## Verification

Both suites must be green, and both formatters and linters clean, before reporting work as done:

```
pnpm test && pnpm lint && pnpm check && pnpm format:check
cd src-tauri && cargo test && cargo fmt --check \
  && cargo clippy --all-targets --all-features -- -D warnings
```

On Linux the Rust build needs the webkit/gtk dev packages — see the `Install system dependencies` step in `.github/workflows/ci.yml`, or the build fails in `gdk-sys` before any test runs.

Prefer a test that has been shown to fail against the old behaviour. A test that passes both before and after a fix is measuring nothing.
