/**
 * Core Layer - Recently Deleted Manager
 * Modal state for recently deleted files functionality.
 * Handles dialog visibility, selection state, and coordinates with backend services.
 */

import type { DeletedFile } from '../services/versionService.svelte'

interface RecentlyDeletedState {
  isVisible: boolean
  files: DeletedFile[]
  selectedIndex: number
  isLoading: boolean
  error: string | null
}

export interface RecentlyDeletedManagerDeps {
  focusSearch: () => void
  refreshCacheAndUI: () => Promise<void>
  versionService: {
    getDeletedFiles(): Promise<{
      success: boolean
      files?: DeletedFile[]
      error?: string
    }>
    recoverDeletedFile(
      filename: string,
      backupFilename: string
    ): Promise<{ success: boolean; error?: string }>
  }
}

export interface RecentlyDeletedManager {
  readonly isVisible: boolean
  readonly files: DeletedFile[]
  readonly selectedIndex: number
  readonly isLoading: boolean
  readonly error: string | null
  openDialog(): Promise<void>
  closeDialog(): void
  selectFile(index: number): void
  navigateUp(): void
  navigateDown(): void
  recoverFile(filename: string): Promise<void>
}

export function createRecentlyDeletedManager(
  deps: RecentlyDeletedManagerDeps
): RecentlyDeletedManager {
  const state = $state<RecentlyDeletedState>({
    isVisible: false,
    files: [],
    selectedIndex: 0,
    isLoading: false,
    error: null,
  })
  async function openDialog(): Promise<void> {
    state.isVisible = true
    state.selectedIndex = 0
    state.error = null

    await loadDeletedFiles()
  }

  function closeDialog(): void {
    state.isVisible = false
    state.files = []
    state.selectedIndex = 0
    state.error = null
    deps.focusSearch()
  }

  async function loadDeletedFiles(): Promise<void> {
    state.isLoading = true
    state.error = null

    try {
      const result = await deps.versionService.getDeletedFiles()

      if (result.success && result.files) {
        state.files = result.files

        if (state.files.length > 0) {
          state.selectedIndex = 0
        }
      } else {
        state.error = result.error || 'Failed to load deleted files'
        state.files = []
      }
    } catch (err) {
      state.error = `Failed to load deleted files: ${err}`
      state.files = []
    } finally {
      state.isLoading = false
    }
  }

  function selectFile(index: number): void {
    if (index >= 0 && index < state.files.length) {
      state.selectedIndex = index
    }
  }

  function navigateUp(): void {
    if (state.selectedIndex > 0) {
      state.selectedIndex = state.selectedIndex - 1
    }
  }

  function navigateDown(): void {
    if (state.selectedIndex < state.files.length - 1) {
      state.selectedIndex = state.selectedIndex + 1
    }
  }

  async function recoverFile(filename: string): Promise<void> {
    state.isLoading = true
    state.error = null

    try {
      const deletedFile = state.files.find((f) => f.filename === filename)
      if (!deletedFile) {
        throw new Error(`File not found in deleted files list: ${filename}`)
      }

      const result = await deps.versionService.recoverDeletedFile(
        deletedFile.filename,
        deletedFile.backup_filename
      )

      if (result.success) {
        state.files = state.files.filter((f) => f.filename !== filename)

        if (state.selectedIndex >= state.files.length) {
          state.selectedIndex = Math.max(0, state.files.length - 1)
        }

        await deps.refreshCacheAndUI()

        if (state.files.length === 0) {
          closeDialog()
        }
      } else {
        state.error = result.error || 'Failed to recover file'
      }
    } catch (err) {
      state.error = `Failed to recover file: ${err}`
    } finally {
      state.isLoading = false
    }
  }

  return {
    get isVisible() {
      return state.isVisible
    },
    get files() {
      return state.files
    },
    get selectedIndex() {
      return state.selectedIndex
    },
    get isLoading() {
      return state.isLoading
    },
    get error() {
      return state.error
    },
    openDialog,
    closeDialog,
    selectFile,
    navigateUp,
    navigateDown,
    recoverFile,
  }
}
