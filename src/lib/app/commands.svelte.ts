/**
 * App Layer - Commands
 * The single surface for every user-triggerable operation. Keyboard shortcuts,
 * dialogs and buttons all dispatch through here.
 *
 * Commands are built once with their dependencies, so they read current state
 * from the managers themselves rather than being handed a snapshot per call.
 * That is what removes the parallel dispatch table the keyboard layer used to
 * carry, and the currying layer the coordinator used to inject the selection.
 *
 * Naming: `prompt*` opens a dialog, the bare verb performs the operation.
 * Previously both were called e.g. `deleteNote` at different layers.
 */

import { tick } from 'svelte'
import type { NoteMetadata } from '../types/note'

/** Delay in ms before navigating to header after exiting edit mode */
const HEADER_NAVIGATION_DELAY_MS = 100

export interface CommandDeps {
  noteService: {
    create(
      name: string
    ): Promise<{ success: boolean; noteName?: string; error?: string }>
    delete(name: string): Promise<{ success: boolean; error?: string }>
    rename(
      oldName: string,
      newName: string
    ): Promise<{ success: boolean; newName?: string; error?: string }>
    openInEditor(name: string): Promise<void>
    openFolder(name: string): Promise<void>
  }
  searchManager: {
    readonly searchInput: string
    readonly filteredNotes: NoteMetadata[]
    executeSearch(query: string): Promise<NoteMetadata[]>
    setFilteredNotes(notes: NoteMetadata[]): void
    clearSearch(): void
  }
  focusManager: {
    readonly selectedIndex: number
    readonly noteContentElement: HTMLElement | null
    setSelectedIndex(index: number): void
    focusSearch(): void
  }
  editorManager: {
    readonly isDirty: boolean
    readonly editingNoteName: string | null
    enterEditMode(noteName: string, fallbackHtml?: string): Promise<void>
    exitEditMode(): string
    saveNote(): Promise<{ success: boolean; error?: string }>
    captureExitPosition(
      onHeader?: ((headerText: string) => void) | null,
      onCursor?: ((line: number, column: number) => void) | null
    ): void
    setExitHeaderText(headerText: string): void
  }
  contentManager: {
    readonly noteContent: string
    refreshAfterSave(
      noteName: string,
      searchInput: string
    ): Promise<{ searchResults: NoteMetadata[]; content: string }>
  }
  contentNavigationManager: {
    readonly isNavigatingLinks: boolean
    navigateNext(): void
    navigatePrevious(): void
    navigateCodeNext(): void
    navigateCodePrevious(): void
    navigateLinkNext(): void
    navigateLinkPrevious(): void
    openCurrentLink(): void
    copyCurrentSection(): Promise<boolean>
    navigateToHeader(headerText: string): boolean
    handleEscape():
      | 'navigation_cleared'
      | 'highlights_cleared'
      | 'search_cleared'
      | 'focus_search'
  }
  contentLoadingManager: {
    loadNoteContent(note: string): Promise<void>
    refreshCacheAndUI(): Promise<void>
  }
  dialogManager: {
    readonly newNoteName: string
    readonly newNoteNameForRename: string
    openCreateDialog(query?: string, highlightedContent?: string): void
    closeCreateDialog(): void
    openRenameDialog(selectedNote?: string): void
    closeRenameDialog(): void
    openDeleteDialog(): void
    closeDeleteDialog(): void
    openUnsavedChangesDialog(): void
  }
  configManager: {
    readonly general: { scroll_amount: number }
    openPane(): Promise<void>
    closePane(): void
    saveConfig(): Promise<{ success: boolean; error?: string }>
  }
  versionExplorerManager: {
    openVersionExplorer(noteName: string): Promise<void>
  }
  recentlyDeletedManager: {
    openDialog(): Promise<void>
  }
  /** The note currently selected in the list; derived by the coordinator. */
  getSelectedNote: () => string | null
}

export interface Commands {
  // Selection and content
  loadNoteContent(note: string): Promise<void>
  moveUp(): void
  moveDown(): void
  focusSearch(): void
  handleTab(): void

  // In-note navigation
  navigateNext(): void
  navigatePrevious(): void
  navigateCodeNext(): void
  navigateCodePrevious(): void
  navigateLinkNext(): void
  navigateLinkPrevious(): void
  openCurrentLink(): void
  copyCurrentSection(): Promise<void>
  handleEscape(): void

  // Scrolling
  scrollUpBy(): void
  scrollDownBy(): void

  // Note operations
  createNote(name?: string): Promise<void>
  renameNote(newName?: string): Promise<void>
  deleteNote(): Promise<void>
  saveNote(): Promise<void>
  openNoteExternally(): Promise<void>
  openNoteFolder(): Promise<void>
  refreshCache(): Promise<void>

  // Dialogs
  promptCreateNote(): void
  promptRenameNote(): void
  promptDeleteNote(): void

  // Editing
  enterEditMode(): Promise<void>
  exitEditMode(): void
  smartExitEditMode(): void
  saveAndExitNote(): Promise<void>

  // Panels
  openSettings(): Promise<void>
  closeSettings(): void
  saveConfigAndRefresh(): Promise<{ success: boolean; error?: string }>
  openVersionExplorer(): Promise<void>
  openRecentlyDeleted(): Promise<void>
}

export function createCommands(deps: CommandDeps): Commands {
  async function notify(
    kind: 'success' | 'error',
    message: string
  ): Promise<void> {
    const { notification } = await import('../utils/notification')
    await notification[kind](message)
  }

  function selectAndLoad(index: number): void {
    const note = deps.searchManager.filteredNotes[index]
    if (!note) return
    deps.focusManager.setSelectedIndex(index)
    void deps.contentLoadingManager.loadNoteContent(note.filename)
  }

  async function refreshSearchAfterSave(): Promise<void> {
    const noteToRefresh = deps.editorManager.editingNoteName
    if (!noteToRefresh) return

    try {
      const result = await deps.contentManager.refreshAfterSave(
        noteToRefresh,
        deps.searchManager.searchInput
      )
      deps.searchManager.setFilteredNotes(result.searchResults)
    } catch (e) {
      console.error('Failed to refresh after save:', e)
    }
  }

  function exitEditMode(): void {
    const exitHeaderText = deps.editorManager.exitEditMode()
    if (exitHeaderText) {
      setTimeout(() => {
        deps.contentNavigationManager.navigateToHeader(exitHeaderText)
      }, HEADER_NAVIGATION_DELAY_MS)
    }
    deps.focusManager.focusSearch()
  }

  async function saveNote(): Promise<void> {
    const result = await deps.editorManager.saveNote()
    if (!result.success) {
      console.error('Failed to save note:', result.error)
      return
    }

    deps.searchManager.clearSearch()
    await refreshSearchAfterSave()
  }

  return {
    loadNoteContent: (note) => deps.contentLoadingManager.loadNoteContent(note),

    moveUp() {
      selectAndLoad(Math.max(0, deps.focusManager.selectedIndex - 1))
    },

    moveDown() {
      const maxIndex = deps.searchManager.filteredNotes.length - 1
      selectAndLoad(Math.min(maxIndex, deps.focusManager.selectedIndex + 1))
    },

    focusSearch: () => deps.focusManager.focusSearch(),
    handleTab: () => deps.focusManager.focusSearch(),

    navigateNext: () => deps.contentNavigationManager.navigateNext(),
    navigatePrevious: () => deps.contentNavigationManager.navigatePrevious(),
    navigateCodeNext: () => deps.contentNavigationManager.navigateCodeNext(),
    navigateCodePrevious: () =>
      deps.contentNavigationManager.navigateCodePrevious(),
    navigateLinkNext: () => deps.contentNavigationManager.navigateLinkNext(),
    navigateLinkPrevious: () =>
      deps.contentNavigationManager.navigateLinkPrevious(),
    openCurrentLink: () => deps.contentNavigationManager.openCurrentLink(),

    async copyCurrentSection() {
      const copied = await deps.contentNavigationManager.copyCurrentSection()
      await notify(
        copied ? 'success' : 'error',
        copied ? 'Copied to clipboard' : 'Nothing to copy'
      )
    },

    handleEscape() {
      // The navigation manager decides what one Escape should undo; only the
      // "nothing left to clear" outcome needs the caller to act.
      if (deps.contentNavigationManager.handleEscape() === 'focus_search') {
        deps.focusManager.focusSearch()
      }
    },

    scrollUpBy() {
      const element = deps.focusManager.noteContentElement
      element?.scrollBy({
        top: -(element.clientHeight * deps.configManager.general.scroll_amount),
        behavior: 'smooth',
      })
    },

    scrollDownBy() {
      const element = deps.focusManager.noteContentElement
      element?.scrollBy({
        top: element.clientHeight * deps.configManager.general.scroll_amount,
        behavior: 'smooth',
      })
    },

    async createNote(name) {
      const inputName = name || deps.dialogManager.newNoteName.trim()
      if (!inputName.trim()) return

      const result = await deps.noteService.create(inputName)
      if (!result.success) return

      await deps.searchManager.executeSearch('')

      const noteIndex = deps.searchManager.filteredNotes.findIndex(
        (note) => note.filename === result.noteName
      )
      if (noteIndex >= 0) {
        deps.focusManager.setSelectedIndex(noteIndex)
      }

      deps.dialogManager.closeCreateDialog()
      await tick()
      deps.focusManager.focusSearch()

      await deps.editorManager.enterEditMode(
        result.noteName!,
        deps.contentManager.noteContent
      )
    },

    async renameNote(newName) {
      const selectedNote = deps.getSelectedNote()
      const inputNewName =
        newName || deps.dialogManager.newNoteNameForRename.trim()
      if (!inputNewName.trim() || !selectedNote) return

      const result = await deps.noteService.rename(selectedNote, inputNewName)
      if (!result.success) return

      await deps.searchManager.executeSearch(deps.searchManager.searchInput)

      const noteIndex = deps.searchManager.filteredNotes.findIndex(
        (note) => note.filename === result.newName
      )
      if (noteIndex >= 0) {
        deps.focusManager.setSelectedIndex(noteIndex)
      }

      deps.dialogManager.closeRenameDialog()
    },

    async deleteNote() {
      const selectedNote = deps.getSelectedNote()
      if (!selectedNote) return

      const result = await deps.noteService.delete(selectedNote)
      if (!result.success) return

      await deps.searchManager.executeSearch(deps.searchManager.searchInput)
      deps.dialogManager.closeDeleteDialog()
      await tick()
      deps.focusManager.focusSearch()
    },

    saveNote,

    async openNoteExternally() {
      const selectedNote = deps.getSelectedNote()
      if (selectedNote) {
        await deps.noteService.openInEditor(selectedNote)
      }
    },

    async openNoteFolder() {
      const selectedNote = deps.getSelectedNote()
      if (selectedNote) {
        await deps.noteService.openFolder(selectedNote)
      }
    },

    refreshCache: () => deps.contentLoadingManager.refreshCacheAndUI(),

    promptCreateNote() {
      deps.dialogManager.openCreateDialog(deps.searchManager.searchInput)
    },

    promptRenameNote() {
      const selectedNote = deps.getSelectedNote()
      if (selectedNote) {
        deps.dialogManager.openRenameDialog(selectedNote)
      }
    },

    promptDeleteNote() {
      if (deps.getSelectedNote()) {
        deps.dialogManager.openDeleteDialog()
      }
    },

    async enterEditMode() {
      // While stepping through links, Enter follows the link instead.
      if (deps.contentNavigationManager.isNavigatingLinks) {
        deps.contentNavigationManager.openCurrentLink()
        return
      }

      const selectedNote = deps.getSelectedNote()
      if (selectedNote && deps.searchManager.filteredNotes.length > 0) {
        await deps.editorManager.enterEditMode(
          selectedNote,
          deps.contentManager.noteContent
        )
      }
    },

    exitEditMode,

    smartExitEditMode() {
      if (deps.editorManager.isDirty) {
        deps.dialogManager.openUnsavedChangesDialog()
      } else {
        exitEditMode()
      }
    },

    async saveAndExitNote() {
      deps.editorManager.captureExitPosition(
        deps.editorManager.setExitHeaderText
      )
      await saveNote()
      exitEditMode()
      // An empty search lists notes by recency, and we just saved this one.
      deps.focusManager.setSelectedIndex(0)
    },

    async openSettings() {
      await deps.configManager.openPane()
      deps.focusManager.focusSearch()
    },

    closeSettings() {
      deps.configManager.closePane()
      deps.focusManager.focusSearch()
    },

    async saveConfigAndRefresh() {
      const result = await deps.configManager.saveConfig()

      if (result.success) {
        await deps.searchManager.executeSearch('')
        deps.focusManager.focusSearch()
      }

      return result
    },

    async openVersionExplorer() {
      const selectedNote = deps.getSelectedNote()
      if (selectedNote) {
        await deps.versionExplorerManager.openVersionExplorer(selectedNote)
      }
    },

    openRecentlyDeleted: () => deps.recentlyDeletedManager.openDialog(),
  }
}
