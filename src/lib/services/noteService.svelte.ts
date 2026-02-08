/**
 * Service Layer - Note Service
 * Reactive CRUD operations for notes with loading state management.
 * Handles API calls to Rust backend for note creation, deletion, and renaming.
 */

import { invoke } from '@tauri-apps/api/core'
import { notification } from '../utils/notification'
import type { NoteMetadata } from '../core/searchManager.svelte'

export function createNoteService() {
  const state = $state({
    isLoading: false,
    error: null as string | null,
    lastOperation: null as 'create' | 'delete' | 'rename' | null,
  })

  function clearError(): void {
    state.error = null
  }

  async function create(
    noteName: string
  ): Promise<{ success: boolean; noteName?: string; error?: string }> {
    if (!noteName.trim())
      return { success: false, error: 'Note name cannot be empty' }

    state.isLoading = true
    state.error = null
    state.lastOperation = 'create'

    try {
      const finalNoteName = noteName.includes('.') ? noteName : `${noteName}.md`
      await invoke<void>('create_new_note', { noteName: finalNoteName })
      return { success: true, noteName: finalNoteName }
    } catch (e) {
      const error = `Failed to create note: ${e}`
      state.error = error
      console.error('Failed to create note:', e)
      notification.error(`Create failed: ${e}`)
      return { success: false, error }
    } finally {
      state.isLoading = false
    }
  }

  async function deleteNote(
    noteName: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!noteName) return { success: false, error: 'Note name cannot be empty' }

    state.isLoading = true
    state.error = null
    state.lastOperation = 'delete'

    try {
      await invoke<void>('delete_note', { noteName })
      return { success: true }
    } catch (e) {
      const error = `Failed to delete note: ${e}`
      state.error = error
      console.error('Failed to delete note:', e)
      notification.error(`Delete failed: ${e}`)
      return { success: false, error }
    } finally {
      state.isLoading = false
    }
  }

  async function rename(
    oldName: string,
    newName: string
  ): Promise<{ success: boolean; newName?: string; error?: string }> {
    if (!newName.trim() || !oldName)
      return { success: false, error: 'Both old and new names are required' }

    state.isLoading = true
    state.error = null
    state.lastOperation = 'rename'

    try {
      const finalNewName = newName.includes('.') ? newName : `${newName}.md`
      await invoke<void>('rename_note', { oldName, newName: finalNewName })
      return { success: true, newName: finalNewName }
    } catch (e) {
      const error = `Failed to rename note: ${e}`
      state.error = error
      console.error('Failed to rename note:', e)
      notification.error(`Rename failed: ${e}`)
      return { success: false, error }
    } finally {
      state.isLoading = false
    }
  }

  async function getContent(noteName: string): Promise<string> {
    try {
      return await invoke<string>('get_note_html_content', { noteName })
    } catch (e) {
      console.error('Failed to get note HTML content:', e)
      throw e
    }
  }

  async function getRawContent(noteName: string): Promise<string> {
    try {
      return await invoke<string>('get_note_content', { noteName })
    } catch (e) {
      console.error('Failed to get raw note content:', e)
      throw e
    }
  }

  async function save(
    noteName: string,
    content: string,
    originalContent: string
  ): Promise<void> {
    try {
      await invoke<void>('save_note_with_content_check', {
        noteName,
        content,
        originalContent,
      })
    } catch (e) {
      console.error('Failed to save note with content check:', e)
      throw e
    }
  }

  async function openInEditor(noteName: string): Promise<void> {
    try {
      await invoke('open_note_in_editor', { noteName })
    } catch (e) {
      console.error('Failed to open note in editor:', e)
      throw e
    }
  }

  async function openFolder(noteName: string): Promise<void> {
    try {
      await invoke('open_note_folder', { noteName })
    } catch (e) {
      console.error('Failed to open note folder:', e)
      throw e
    }
  }

  async function search(query: string): Promise<NoteMetadata[]> {
    try {
      return await invoke<NoteMetadata[]>('search_notes', { query })
    } catch (e) {
      console.error('Failed to search notes:', e)
      throw e
    }
  }

  async function initializeDatabase(): Promise<{
    success: boolean
    error?: string
  }> {
    state.isLoading = true
    state.error = null

    try {
      await invoke<void>('initialize_notes_with_progress')
      return { success: true }
    } catch (e) {
      const error = `Failed to initialize notes database: ${e}`
      state.error = error
      console.error('Failed to initialize notes database:', e)
      return { success: false, error }
    } finally {
      state.isLoading = false
    }
  }

  return {
    create,
    delete: deleteNote,
    rename,

    getContent,
    getRawContent,
    save,

    search,

    openInEditor,
    openFolder,
    initializeDatabase,

    clearError,

    get isLoading() {
      return state.isLoading
    },
    get error() {
      return state.error
    },
    get lastOperation() {
      return state.lastOperation
    },
  }
}

export const noteService = createNoteService()
