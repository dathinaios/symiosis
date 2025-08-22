/**
 * App Layer - Application Coordinator
 * Central coordinator for app-wide state, actions, and effects.
 * Maintains separation of concerns across the application architecture.
 */

import { tick } from 'svelte'
import { listen } from '@tauri-apps/api/event'
import { createDialogManager } from '../core/dialogManager.svelte'
import { createContentManager } from '../core/contentManager.svelte'
import { createConfigStateManager } from '../core/configStateManager.svelte'
import { createContentNavigationManager } from '../core/contentNavigationManager.svelte'
import { createProgressManager } from '../core/progressManager.svelte'
import { noteService } from '../services/noteService.svelte'
import { configService } from '../services/configService.svelte'
import { createNoteActions } from './actions/note.svelte'
import { createSearchActions } from './actions/search.svelte'
import { createSettingsActions } from './actions/settings.svelte'
import { createKeyboardActions } from './actions/keyboard.svelte'
import { setupAppEffects } from './effects/app.svelte'

interface AppCoordinatorDeps {
  searchManager: ReturnType<
    typeof import('../core/searchManager.svelte').createSearchManager
  >
  editorManager: ReturnType<
    typeof import('../core/editorManager.svelte').createEditorManager
  >
  focusManager: ReturnType<
    typeof import('../core/focusManager.svelte').createFocusManager
  >
}

export interface AppState {
  readonly query: string
  readonly isLoading: boolean
  readonly areHighlightsCleared: boolean
  readonly filteredNotes: string[]
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
  configStateManager: ReturnType<
    typeof import('../core/configStateManager.svelte').createConfigStateManager
  >
  contentNavigationManager: ReturnType<
    typeof import('../core/contentNavigationManager.svelte').createContentNavigationManager
  >
  progressManager: ReturnType<
    typeof import('../core/progressManager.svelte').createProgressManager
  >
}

export interface AppCoordinator {
  readonly query: string
  readonly isLoading: boolean
  readonly areHighlightsCleared: boolean
  readonly filteredNotes: string[]
  readonly selectedNote: string | null
  readonly keyboardActions: (event: KeyboardEvent) => Promise<void>
  readonly managers: AppManagers
  readonly state: AppState
  readonly actions: AppActions
  setupReactiveEffects(): () => void
  updateFilteredNotes(notes: string[]): void
  initialize(): Promise<() => void>
}

export function createAppCoordinator(deps: AppCoordinatorDeps): AppCoordinator {
  const { searchManager, editorManager, focusManager } = deps

  const dialogManager = createDialogManager({
    focusSearch: () => focusManager.focusSearch(),
  })

  const contentManager = createContentManager({
    noteService,
    searchManager,
    focusManager,
  })

  const configStateManager = createConfigStateManager()

  const contentNavigationManager = createContentNavigationManager({
    focusManager,
    searchManager,
  })

  const progressManager = createProgressManager({
    focusSearch: () => focusManager.focusSearch(),
  })

  const isLoading = $derived(searchManager.isLoading)
  const areHighlightsCleared = $derived(searchManager.areHighlightsCleared)
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

    return notes[index] || null
  })

  let contentRequestController: AbortController | null = null

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
  })

  const settingsActions = createSettingsActions({
    configService,
    focusManager,
  })

  function exitEditMode(): void {
    editorManager.exitEditMode()
    focusManager.focusSearch()
  }

  async function loadNoteContent(note: string): Promise<void> {
    // Cancel previous content request
    if (contentRequestController) {
      contentRequestController.abort()
    }

    contentNavigationManager.resetNavigation()

    if (!note) {
      contentManager.setNoteContent('')
      return
    }

    const controller = new AbortController()
    contentRequestController = controller

    try {
      const content = await noteService.getContent(note)
      if (!controller.signal.aborted) {
        contentManager.setNoteContent(content)
        requestAnimationFrame(() => {
          contentManager.scrollToFirstMatch()
        })
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        console.error('Failed to load note content:', e)
        const errorMessage = String(e)
        contentManager.setNoteContent(`Error loading note: ${errorMessage}`)

        if (errorMessage.includes('Note not found')) {
          try {
            await refreshCacheAndUI()
          } catch (refreshError) {
            console.error('Auto-refresh failed:', refreshError)
          }
        }
      }
    }
  }

  async function saveAndExitNote(): Promise<void> {
    await noteActions.saveNote(selectedNote)
    exitEditMode()
    // An empty search shows notes in order
    // of most recent and we just saved it.
    focusManager.setSelectedIndex(0)
  }

  async function refreshCacheAndUI(): Promise<void> {
    await configService.refreshCache()
    await refreshUI()
  }

  async function refreshUI(): Promise<void> {
    const updatedNotes = await searchManager.searchImmediate('')
    searchManager.setFilteredNotes(updatedNotes)
    contentManager.setNoteContent('')
    focusManager.setSelectedIndex(0)
  }

  async function saveConfigAndRefresh(): Promise<{
    success: boolean
    error?: string
  }> {
    const result = await configService.save()

    if (result.success) {
      const notes = await searchManager.searchImmediate('')
      searchActions.updateFilteredNotes(notes)
      focusManager.focusSearch()
    }

    return result
  }

  const keyboardActions = createKeyboardActions({
    focusManager,
    contentNavigationManager,
    configStateManager,
    searchManager,
    contentManager,
    dialogManager,
    noteActions,
    settingsActions,
    noteService,
    appCoordinator: {
      loadNoteContent,
      exitEditMode,
      saveAndExitNote,
      refreshCacheAndUI,
    },
  })

  function setupReactiveEffects(): () => void {
    return setupAppEffects({
      getAreHighlightsCleared: () => areHighlightsCleared,
      focusManager,
      contentManager,
    })
  }

  return {
    setupReactiveEffects,

    get query(): string {
      return query
    },
    get isLoading(): boolean {
      return isLoading
    },
    get areHighlightsCleared(): boolean {
      return areHighlightsCleared
    },
    get filteredNotes(): string[] {
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
        areHighlightsCleared: areHighlightsCleared,
        isEditorDirty: editorManager.isDirty,
        query: query,
        isSettingsOpen: configService.isVisible,
        isAnyDialogOpen:
          dialogManager.showCreateDialog ||
          dialogManager.showRenameDialog ||
          dialogManager.showDeleteDialog ||
          dialogManager.showUnsavedChangesDialog,
      }))
    },

    get managers() {
      return {
        searchManager,
        editorManager,
        focusManager,
        contentManager,
        dialogManager,
        configStateManager,
        contentNavigationManager,
        progressManager,
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
        get areHighlightsCleared() {
          return areHighlightsCleared
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
        loadNoteContent,
        deleteNote: () => noteActions.deleteNote(selectedNote),
        createNote: noteActions.createNote,
        renameNote: (newName?: string) =>
          noteActions.renameNote(selectedNote, newName),
        saveNote: () => noteActions.saveNote(selectedNote),
        saveAndExitNote,
        enterEditMode: () => noteActions.enterEditMode(selectedNote!),
        exitEditMode,
        refreshCacheAndUI,
        saveConfigAndRefresh,
      }
    },

    async initialize(): Promise<() => void> {
      await tick()

      await configStateManager.initialize()

      // Set up search complete callback to load first note content
      searchManager.setSearchCompleteCallback(async (notes: string[]) => {
        if (notes.length > 0) {
          focusManager.setSelectedIndex(0)
          await loadNoteContent(notes[0])
        }
      })

      const unlisten = await listen('open-preferences', async () => {
        await settingsActions.openSettingsPane()
      })

      const unlistenCacheRefresh = await listen('cache-refreshed', async () => {
        await refreshUI()
      })

      // Database loading progress event listeners - MUST be set up before initialization
      const unlistenDbLoadingStart = await listen<string>(
        'db-loading-start',
        (event) => {
          progressManager.start(event.payload)
        }
      )

      const unlistenDbLoadingProgress = await listen<string>(
        'db-loading-progress',
        (event) => {
          progressManager.updateProgress(event.payload)
        }
      )

      const unlistenDbLoadingComplete = await listen(
        'db-loading-complete',
        () => {
          progressManager.complete()
        }
      )

      const unlistenDbLoadingError = await listen<string>(
        'db-loading-error',
        (event) => {
          progressManager.setError(event.payload)
        }
      )

      const configExists = await configService.exists()
      if (!configExists) {
        await settingsActions.openSettingsPane()
      } else {
        // Initialize notes database with progress
        const result = await noteService.initializeDatabase()
        if (!result.success) {
          console.error('Failed to initialize notes:', result.error)
        }

        focusManager.focusSearch()
        const notes = await searchManager.searchImmediate('')
        if (notes.length > 0) {
          focusManager.setSelectedIndex(0)
          await loadNoteContent(notes[0])
        }
      }

      const cleanupEffects = setupReactiveEffects()

      return () => {
        searchManager.abort()
        if (contentRequestController) {
          contentRequestController.abort()
          contentRequestController = null
        }
        cleanupEffects()
        unlisten()
        unlistenCacheRefresh()
        unlistenDbLoadingStart()
        unlistenDbLoadingProgress()
        unlistenDbLoadingComplete()
        unlistenDbLoadingError()
        configStateManager.cleanup()
      }
    },
  }
}
