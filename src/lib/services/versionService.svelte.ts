/**
 * Service Layer - Version Service
 * Reactive operations for note version management with loading state.
 * Handles API calls to Rust backend for version listing, content retrieval, and recovery.
 */

import { invoke } from '@tauri-apps/api/core'
import type { NoteVersion, DeletedFile } from '../types/note'

export function createVersionService() {
  const state = $state({
    isLoading: false,
    error: null as string | null,
    lastOperation: null as 'list' | 'recover' | null,
  })

  function clearError(): void {
    state.error = null
  }

  async function getVersions(
    noteName: string
  ): Promise<{ success: boolean; versions?: NoteVersion[]; error?: string }> {
    if (!noteName.trim()) {
      return { success: false, error: 'Note name cannot be empty' }
    }

    state.isLoading = true
    state.error = null
    state.lastOperation = 'list'

    try {
      const versions = await invoke<NoteVersion[]>('get_note_versions', {
        noteName,
      })
      return { success: true, versions: versions || [] }
    } catch (e) {
      const error = `Failed to load versions: ${e}`
      state.error = error
      console.error('Failed to load versions:', e)
      return { success: false, error }
    } finally {
      state.isLoading = false
    }
  }

  async function recoverVersion(
    noteName: string,
    versionFilename: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!noteName.trim() || !versionFilename.trim()) {
      return {
        success: false,
        error: 'Note name and version filename are required',
      }
    }

    state.isLoading = true
    state.error = null
    state.lastOperation = 'recover'

    try {
      await invoke<void>('recover_note_version', {
        noteName,
        versionFilename,
      })
      return { success: true }
    } catch (e) {
      const error = `Failed to recover version: ${e}`
      state.error = error
      console.error('Failed to recover version:', e)
      return { success: false, error }
    } finally {
      state.isLoading = false
    }
  }

  async function getVersionContent(versionFilename: string): Promise<string> {
    try {
      return await invoke<string>('get_version_content', { versionFilename })
    } catch (e) {
      console.error('Failed to get version content:', e)
      throw e
    }
  }

  async function getDeletedFiles(): Promise<{
    success: boolean
    files?: DeletedFile[]
    error?: string
  }> {
    state.isLoading = true
    state.error = null
    state.lastOperation = 'list'

    try {
      const files = await invoke<DeletedFile[]>('get_deleted_files')
      return { success: true, files: files || [] }
    } catch (e) {
      const error = `Failed to load deleted files: ${e}`
      state.error = error
      console.error('Failed to load deleted files:', e)
      return { success: false, error }
    } finally {
      state.isLoading = false
    }
  }

  async function recoverDeletedFile(
    originalFilename: string,
    backupFilename: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!originalFilename.trim() || !backupFilename.trim()) {
      return {
        success: false,
        error: 'Original filename and backup filename are required',
      }
    }

    state.isLoading = true
    state.error = null
    state.lastOperation = 'recover'

    try {
      await invoke<void>('recover_deleted_file', {
        originalFilename,
        backupFilename,
      })
      return { success: true }
    } catch (e) {
      const error = `Failed to recover deleted file: ${e}`
      state.error = error
      console.error('Failed to recover deleted file:', e)
      return { success: false, error }
    } finally {
      state.isLoading = false
    }
  }

  return {
    getVersions,
    getVersionContent,
    recoverVersion,

    getDeletedFiles,
    recoverDeletedFile,

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

export const versionService = createVersionService()
