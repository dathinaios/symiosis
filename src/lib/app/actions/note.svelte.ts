/**
 * App Layer - Note Actions
 * Note CRUD operations that coordinate between services and managers.
 * Handles business logic flow including UI state updates and focus management.
 */

import { tick } from 'svelte'

interface NoteActionDeps {
  noteService: typeof import('../../services/noteService.svelte').noteService
  searchManager: ReturnType<
    typeof import('../../core/searchManager.svelte').createSearchManager
  >
  dialogManager: ReturnType<
    typeof import('../../core/dialogManager.svelte').createDialogManager
  >
  focusManager: ReturnType<
    typeof import('../../core/focusManager.svelte').createFocusManager
  >
  editorManager: ReturnType<
    typeof import('../../core/editorManager.svelte').createEditorManager
  >
  contentManager: ReturnType<
    typeof import('../../core/contentManager.svelte').createContentManager
  >
}

interface NoteActions {
  createNote(noteNameParam?: string): Promise<void>
  deleteNote(selectedNote: string | null): Promise<void>
  renameNote(selectedNote: string | null, newNameParam?: string): Promise<void>
  enterEditMode(noteName: string): Promise<void>
  saveNote(): Promise<void>
}

export function createNoteActions(deps: NoteActionDeps): NoteActions {
  const {
    noteService,
    searchManager,
    dialogManager,
    focusManager,
    editorManager,
    contentManager,
  } = deps
  async function createNote(noteNameParam?: string): Promise<void> {
    const inputNoteName = noteNameParam || dialogManager.newNoteName.trim()
    if (!inputNoteName.trim()) return

    const result = await noteService.create(inputNoteName)

    if (result.success) {
      await searchManager.executeSearch('')

      const noteIndex = searchManager.filteredNotes.findIndex(
        (note: string) => note === result.noteName
      )
      if (noteIndex >= 0) {
        focusManager.setSelectedIndex(noteIndex)
      }

      dialogManager.closeCreateDialog()
      await tick()
      focusManager.focusSearch()

      await enterEditMode(result.noteName!)
    }
  }

  async function deleteNote(selectedNote: string | null): Promise<void> {
    if (!selectedNote) return

    const result = await noteService.delete(selectedNote)

    if (result.success) {
      await searchManager.executeSearch(searchManager.searchInput)
      dialogManager.closeDeleteDialog()
      await tick()
      focusManager.focusSearch()
    }
  }

  async function renameNote(
    selectedNote: string | null,
    newNameParam?: string
  ): Promise<void> {
    const inputNewName =
      newNameParam || dialogManager.newNoteNameForRename.trim()
    if (!inputNewName.trim() || !selectedNote) return

    const result = await noteService.rename(selectedNote, inputNewName)

    if (result.success) {
      await searchManager.executeSearch(searchManager.searchInput)

      const noteIndex = searchManager.filteredNotes.findIndex(
        (note: string) => note === result.newName
      )
      if (noteIndex >= 0) {
        focusManager.setSelectedIndex(noteIndex)
      }

      dialogManager.closeRenameDialog()
    }
  }

  async function enterEditMode(noteName: string): Promise<void> {
    await editorManager.enterEditMode(noteName, contentManager.noteContent)
  }

  async function saveNote(): Promise<void> {
    const result = await editorManager.saveNote()
    if (!result.success) {
      console.error('Failed to save note:', result.error)
      return
    }

    searchManager.clearSearch()
    await refreshSearchAfterSave()
  }

  async function refreshSearchAfterSave(): Promise<void> {
    const noteToRefresh = editorManager.editingNoteName
    if (!noteToRefresh) return

    try {
      const refreshResult = await contentManager.refreshAfterSave(
        noteToRefresh,
        searchManager.searchInput
      )
      searchManager.setFilteredNotes(refreshResult.searchResults)
    } catch (e) {
      console.error('Failed to refresh after save:', e)
    }
  }

  return {
    createNote,
    deleteNote,
    renameNote,
    enterEditMode,
    saveNote,
  }
}
