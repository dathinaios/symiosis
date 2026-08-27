/**
 * App Layer - Application Coordinator
 * Central coordinator for app-wide state, actions, and effects.
 */

/** Delay in ms before navigating to header after exiting edit mode */
const HEADER_NAVIGATION_DELAY_MS = 100

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
import { createNoteActions } from './actions/note.svelte'
import { createSearchActions } from './actions/search.svelte'
import { createSettingsActions } from './actions/settings.svelte'
import { createKeyboardActions } from './actions/keyboard.svelte'
import { setupAppEffects } from './effects/app.svelte'
import { createAppLifecycle } from './lifecycle.svelte'
import type { NoteMetadata } from '../types/note'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface AppCoordinatorDeps {}

export interface AppState {
  readonly query: string
  readonly isLoading: boolean
  readonly filteredNotes: NoteMetadata[]
  readonly selectedNote: string | null
}

export interface AppActions {
  loadNoteContent: (note: string) => Promise<void>
  deleteNote: () => Promise<void>
  createNote: (noteName?: string) => Promise<void>
  renameNote: (newName?: string) => Promise<void>
  saveNote: () => Promise<void>
  saveAndExitNote: () => Promise<void>
  enterEditMode: () => Promise<void>
  exitEditMode: () => void
  refreshCacheAndUI: () => Promise<void>
  saveConfigAndRefresh: () => Promise<{ success: boolean; error?: string }>
}

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
  readonly query: string
  readonly isLoading: boolean
  readonly filteredNotes: NoteMetadata[]
  readonly selectedNote: string | null
  readonly keyboardActions: (event: KeyboardEvent) => Promise<void>
  readonly managers: AppManagers
  readonly state: AppState
  readonly actions: AppActions
  setupReactiveEffects(): () => void
  updateFilteredNotes(notes: NoteMetadata[]): void
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

  const isLoading = $derived(searchManager.isLoading)
  const filteredNotes = $derived(searchManager.filteredNotes)
  const query = $derived(searchManager.searchInput)

  const selectedNote = $derived.by(() => {
    const notes = filteredNotes
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

  const versionExplorerManager = createVersionExplorerManager({
    focusSearch: () => focusManager.focusSearch(),
    versionService,
    loadNoteContent: contentLoadingManager.loadNoteContent,
  })

  const recentlyDeletedManager = createRecentlyDeletedManager({
    focusSearch: () => focusManager.focusSearch(),
    refreshCacheAndUI: contentLoadingManager.refreshCacheAndUI,
    versionService,
  })

  let isFirstRun = false

  const noteActions = createNoteActions({
    noteService,
    searchManager,
    dialogManager,
    focusManager,
    editorManager,
    contentManager,
  })

  const searchActions = createSearchActions({
    searchManager,
    contentManager,
    focusManager,
    editorManager,
    contentNavigationManager,
  })

  const settingsActions = createSettingsActions({
    configManager,
    focusManager,
  })

  function exitEditMode(): void {
    const exitHeaderText = editorManager.exitEditMode()
    if (exitHeaderText) {
      setTimeout(() => {
        contentNavigationManager.navigateToHeader(exitHeaderText)
      }, HEADER_NAVIGATION_DELAY_MS)
    }
    focusManager.focusSearch()
  }

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

  async function saveAndExitNote(): Promise<void> {
    await noteActions.saveNote()
    exitEditMode()
    // An empty search shows notes in order
    // of most recent and we just saved it.
    focusManager.setSelectedIndex(0)
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
    openSettingsPane: () => settingsActions.openSettingsPane(),
    onFirstRunDetected: () => {
      isFirstRun = true
    },
  })

  async function saveConfigAndRefresh(): Promise<{
    success: boolean
    error?: string
  }> {
    const result = await configManager.saveConfig()

    if (result.success) {
      await searchManager.executeSearch('')
      focusManager.focusSearch()
    }

    return result
  }

  const keyboardActions = createKeyboardActions({
    focusManager,
    contentNavigationManager,
    configManager,
    searchManager,
    contentManager,
    dialogManager,
    versionExplorerManager,
    recentlyDeletedManager,
    editorManager,
    noteActions,
    settingsActions,
    noteService,
    appCoordinator: {
      loadNoteContent: contentLoadingManager.loadNoteContent,
      exitEditMode,
      saveAndExitNote,
      refreshCacheAndUI: contentLoadingManager.refreshCacheAndUI,
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

    get query(): string {
      return query
    },
    get isLoading(): boolean {
      return isLoading
    },
    get filteredNotes(): NoteMetadata[] {
      return filteredNotes
    },
    get selectedNote(): string | null {
      return selectedNote
    },

    updateFilteredNotes: searchActions.updateFilteredNotes,

    get keyboardActions() {
      return keyboardActions.createKeyboardHandler(() => ({
        isSearchInputFocused: focusManager.isSearchInputFocused,
        isEditMode: editorManager.isEditMode,
        isNoteContentFocused: focusManager.isNoteContentFocused,
        filteredNotes: filteredNotes,
        selectedNote: selectedNote,
        noteContentElement: focusManager.noteContentElement,
        hideHighlights: contentNavigationManager.hideHighlights,
        isEditorDirty: editorManager.isDirty,
        query: query,
        isSettingsOpen: configManager.isVisible,
        isAnyDialogOpen:
          dialogManager.showCreateDialog ||
          dialogManager.showRenameDialog ||
          dialogManager.showDeleteDialog ||
          dialogManager.showUnsavedChangesDialog ||
          versionExplorerManager.isVisible ||
          recentlyDeletedManager.isVisible,
      }))
    },

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

    get state() {
      return {
        get query() {
          return query
        },
        get isLoading() {
          return isLoading
        },
        get filteredNotes() {
          return filteredNotes
        },
        get selectedNote() {
          return selectedNote
        },
      }
    },

    get actions() {
      return {
        loadNoteContent: contentLoadingManager.loadNoteContent,
        deleteNote: () => noteActions.deleteNote(selectedNote),
        createNote: noteActions.createNote,
        renameNote: (newName?: string) =>
          noteActions.renameNote(selectedNote, newName),
        saveNote: () => noteActions.saveNote(),
        saveAndExitNote,
        enterEditMode: () =>
          selectedNote
            ? noteActions.enterEditMode(selectedNote)
            : Promise.resolve(),
        exitEditMode,
        refreshCacheAndUI: contentLoadingManager.refreshCacheAndUI,
        saveConfigAndRefresh,
      }
    },

    // Reactive effects are registered by the caller during component
    // initialisation; registering them here would throw `effect_orphan`.
    initialize: () => appLifecycle.start(),
  }
}
