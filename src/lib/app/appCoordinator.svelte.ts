/**
 * App Layer - Application Coordinator
 * Composition root: constructs the managers, derives the cross-manager state
 * they cannot own individually (the selected note), and wires the command
 * surface, the keyboard handler and the lifecycle onto them.
 */

/** Delay in ms before showing hints after settings close on first run */
const FIRST_RUN_HINTS_DELAY_MS = 300

import { createDialogManager } from '../core/dialogManager.svelte'
import { createContentManager } from '../core/contentManager.svelte'
import { createConfigManager as createConfigManager } from '../core/configManager.svelte'
import { createContentNavigationManager } from '../core/contentNavigationManager.svelte'
import { createProgressManager } from '../core/progressManager.svelte'
import { createSearchManager } from '../core/searchManager.svelte'
import { createEditorManager } from '../core/editorManager.svelte'
import { createFocusManager } from '../core/focusManager.svelte'
import { createVersionExplorerManager } from '../core/versionExplorerManager.svelte'
import { createRecentlyDeletedManager } from '../core/recentlyDeletedManager.svelte'
import { createContentLoadingManager } from '../core/contentLoadingManager.svelte'
import { noteService } from '../services/noteService.svelte'
import { configService } from '../services/configService.svelte'
import { versionService } from '../services/versionService.svelte'
import { linkOpener } from '../services/linkOpener.svelte'
import { notification } from '../utils/notification'
import { createCommands, type Commands } from './commands.svelte'
import { createKeyboardHandler } from './keyboard.svelte'
import { setupAppEffects } from './effects/app.svelte'
import { createAppLifecycle } from './lifecycle.svelte'
import type { NoteMetadata } from '../types/note'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface AppCoordinatorDeps {}

export interface AppManagers {
  searchManager: ReturnType<
    typeof import('../core/searchManager.svelte').createSearchManager
  >
  editorManager: ReturnType<
    typeof import('../core/editorManager.svelte').createEditorManager
  >
  focusManager: ReturnType<
    typeof import('../core/focusManager.svelte').createFocusManager
  >
  contentManager: ReturnType<
    typeof import('../core/contentManager.svelte').createContentManager
  >
  dialogManager: ReturnType<
    typeof import('../core/dialogManager.svelte').createDialogManager
  >
  configManager: ReturnType<
    typeof import('../core/configManager.svelte').createConfigManager
  >
  contentNavigationManager: ReturnType<
    typeof import('../core/contentNavigationManager.svelte').createContentNavigationManager
  >
  progressManager: ReturnType<
    typeof import('../core/progressManager.svelte').createProgressManager
  >
  versionExplorerManager: ReturnType<
    typeof import('../core/versionExplorerManager.svelte').createVersionExplorerManager
  >
  recentlyDeletedManager: ReturnType<
    typeof import('../core/recentlyDeletedManager.svelte').createRecentlyDeletedManager
  >
  contentLoadingManager: ReturnType<
    typeof import('../core/contentLoadingManager.svelte').createContentLoadingManager
  >
}

export interface AppCoordinator {
  /**
   * The note the list has selected. Derived across `searchManager` and
   * `focusManager`, so neither can own it — the only app state that lives here.
   */
  readonly selectedNote: string | null
  readonly keyboardActions: (event: KeyboardEvent) => Promise<void>
  readonly managers: AppManagers
  readonly commands: Commands
  setupReactiveEffects(): () => void
  initialize(): Promise<() => void>
  handleSettingsClose(): void
}

export function createAppCoordinator(
  _deps: AppCoordinatorDeps
): AppCoordinator {
  const progressManager = createProgressManager()

  const searchManager = createSearchManager({
    noteService,
    progressManager,
  })

  const focusManager = createFocusManager()

  const contentNavigationManager = createContentNavigationManager({
    focusManager,
    searchManager,
    linkOpener,
    notifyError: (message: string) => {
      void notification.error(message)
    },
  })

  const editorManager = createEditorManager({
    noteService,
    contentNavigationManager,
  })

  const dialogManager = createDialogManager({
    focusSearch: () => focusManager.focusSearch(),
  })

  const configManager = createConfigManager({
    configService,
  })

  const contentManager = createContentManager({
    noteService,
    searchManager,
    focusManager,
    contentNavigationManager,
  })

  const selectedNote = $derived.by(() => {
    const notes = searchManager.filteredNotes
    let index = focusManager.selectedIndex

    if (notes.length === 0) {
      return null
    }

    if (index === -1 || index >= notes.length) {
      index = 0
    }

    return notes[index]?.filename || null
  })

  // Constructed after the derived selection because it reads it lazily;
  // everything below this point may reference contentLoadingManager without
  // relying on hoisting.
  const contentLoadingManager = createContentLoadingManager({
    contentManager,
    contentNavigationManager,
    searchManager,
    focusManager,
    configService,
    getSelectedNote: () => selectedNote,
  })

  // Closing a dialog opened from the editor must hand focus back to the editor.
  // Focusing search instead leaves the editor open while `activeContext()`
  // reports `searchInput`, so Escape no longer reaches the editor.
  function restoreFocus(): void {
    if (editorManager.isEditMode) {
      editorManager.focusEditor()
    } else {
      focusManager.focusSearch()
    }
  }

  const versionExplorerManager = createVersionExplorerManager({
    restoreFocus,
    versionService,
    loadNoteContent: contentLoadingManager.loadNoteContent,
  })

  const recentlyDeletedManager = createRecentlyDeletedManager({
    restoreFocus,
    refreshCacheAndUI: contentLoadingManager.refreshCacheAndUI,
    versionService,
  })

  let isFirstRun = false

  const commands = createCommands({
    noteService,
    searchManager,
    focusManager,
    editorManager,
    contentManager,
    contentNavigationManager,
    contentLoadingManager,
    dialogManager,
    configManager,
    versionExplorerManager,
    recentlyDeletedManager,
    getSelectedNote: () => selectedNote,
  })

  function isAnyDialogOpen(): boolean {
    return (
      dialogManager.showCreateDialog ||
      dialogManager.showRenameDialog ||
      dialogManager.showDeleteDialog ||
      dialogManager.showUnsavedChangesDialog ||
      versionExplorerManager.isVisible ||
      recentlyDeletedManager.isVisible
    )
  }

  const keyboard = createKeyboardHandler({
    commands,
    configManager,
    focusManager,
    editorManager,
    searchManager,
    isAnyDialogOpen,
  })

  function handleSettingsClose(): void {
    configManager.closePane()
    focusManager.focusSearch()

    if (isFirstRun) {
      // Delay to ensure settings dialog is fully closed
      setTimeout(() => {
        // Simulate Ctrl+? to show hints
        const event = new KeyboardEvent('keydown', {
          key: '?',
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        })
        document.dispatchEvent(event)
        isFirstRun = false
      }, FIRST_RUN_HINTS_DELAY_MS)
    }
  }

  // Cross-manager wiring: a completed search selects and loads its first hit.
  searchManager.setSearchCompleteCallback(async (notes: NoteMetadata[]) => {
    if (notes.length > 0) {
      focusManager.setSelectedIndex(0)
      await contentLoadingManager.loadNoteContent(notes[0].filename)
    }
  })

  const appLifecycle = createAppLifecycle({
    configManager,
    configService,
    noteService,
    searchManager,
    focusManager,
    progressManager,
    contentLoadingManager,
    openSettingsPane: () => commands.openSettings(),
    onFirstRunDetected: () => {
      isFirstRun = true
    },
  })

  /**
   * Must be called during component initialisation. `$effect` throws
   * `effect_orphan` when there is no active effect context, so this cannot be
   * called from `initialize()` — that runs after `await`s inside `onMount`.
   */
  function setupReactiveEffects(): () => void {
    return setupAppEffects({
      getHideHighlights: () => contentNavigationManager.hideHighlights,
      focusManager,
      contentManager,
      searchManager,
      contentNavigationManager,
    })
  }

  return {
    setupReactiveEffects,
    handleSettingsClose,
    commands,

    get selectedNote(): string | null {
      return selectedNote
    },

    keyboardActions: keyboard.handleKeydown,

    get managers() {
      return {
        searchManager,
        editorManager,
        focusManager,
        contentManager,
        dialogManager,
        configManager,
        contentNavigationManager,
        progressManager,
        versionExplorerManager,
        recentlyDeletedManager,
        contentLoadingManager,
      }
    },

    // Reactive effects are registered by the caller during component
    // initialisation; registering them here would throw `effect_orphan`.
    initialize: () => appLifecycle.start(),
  }
}
