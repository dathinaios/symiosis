/**
 * Core Layer - Version Explorer Manager
 * Modal state for version history exploration and recovery functionality.
 * Handles dialog visibility, selection state, and coordinates with version service.
 */

import type { createVersionService } from '../services/versionService.svelte'
import type { NoteVersion } from '../types/note'

interface VersionExplorerState {
  isVisible: boolean
  selectedNote: string | null
  versions: NoteVersion[]
  selectedVersionIndex: number
  previewContent: string
  isLoadingPreview: boolean
  error: string | null
}

export interface VersionExplorerManagerDeps {
  focusSearch: () => void
  versionService: ReturnType<typeof createVersionService>
  loadNoteContent: (noteName: string) => Promise<void>
}

export interface VersionExplorerManager {
  readonly isVisible: boolean
  readonly selectedNote: string | null
  readonly versions: NoteVersion[]
  readonly selectedVersionIndex: number
  readonly previewContent: string
  readonly isLoadingPreview: boolean
  readonly error: string | null
  openVersionExplorer(noteName: string): Promise<void>
  closeVersionExplorer(): void
  selectVersion(index: number): Promise<void>
  selectPreviousVersion(): Promise<void>
  selectNextVersion(): Promise<void>
  recoverSelectedVersion(): Promise<void>
}

export function createVersionExplorerManager(
  deps: VersionExplorerManagerDeps
): VersionExplorerManager {
  const state = $state<VersionExplorerState>({
    isVisible: false,
    selectedNote: null,
    versions: [],
    selectedVersionIndex: 0,
    previewContent: '',
    isLoadingPreview: false,
    error: null,
  })
  async function openVersionExplorer(noteName: string): Promise<void> {
    state.selectedNote = noteName
    state.selectedVersionIndex = 0
    state.previewContent = ''
    state.error = null
    state.isVisible = true

    await loadVersions()
  }

  function closeVersionExplorer(): void {
    state.isVisible = false
    state.selectedNote = null
    state.versions = []
    state.selectedVersionIndex = 0
    state.previewContent = ''
    state.error = null
    deps.focusSearch()
  }

  async function loadVersions(): Promise<void> {
    if (!state.selectedNote) return

    deps.versionService.clearError()
    state.error = null

    try {
      const result = await deps.versionService.getVersions(state.selectedNote)

      if (result.success && result.versions) {
        state.versions = result.versions

        if (state.versions.length > 0) {
          state.selectedVersionIndex = 0
          await loadPreviewContent()
        }
      } else {
        state.error = result.error || 'Failed to load versions'
        state.versions = []
      }
    } catch (err) {
      state.error = `Failed to load versions: ${err}`
      state.versions = []
    }
  }

  async function loadPreviewContent(): Promise<void> {
    if (
      state.versions.length === 0 ||
      state.selectedVersionIndex < 0 ||
      state.selectedVersionIndex >= state.versions.length
    ) {
      state.previewContent = ''
      return
    }

    state.isLoadingPreview = true
    deps.versionService.clearError()
    state.error = null

    try {
      const selectedVersion = state.versions[state.selectedVersionIndex]
      const content = await deps.versionService.getVersionContent(
        selectedVersion.filename
      )
      state.previewContent = content || ''
    } catch (err) {
      state.error = `Failed to load preview: ${err}`
      state.previewContent = 'Error loading preview content'
    } finally {
      state.isLoadingPreview = false
    }
  }

  async function selectVersion(index: number): Promise<void> {
    if (index >= 0 && index < state.versions.length) {
      state.selectedVersionIndex = index
      await loadPreviewContent()
    }
  }

  async function selectPreviousVersion(): Promise<void> {
    if (state.selectedVersionIndex > 0) {
      await selectVersion(state.selectedVersionIndex - 1)
    }
  }

  async function selectNextVersion(): Promise<void> {
    if (state.selectedVersionIndex < state.versions.length - 1) {
      await selectVersion(state.selectedVersionIndex + 1)
    }
  }

  async function recoverSelectedVersion(): Promise<void> {
    if (
      !state.selectedNote ||
      state.versions.length === 0 ||
      state.selectedVersionIndex < 0 ||
      state.selectedVersionIndex >= state.versions.length
    ) {
      state.error = 'No version selected for recovery'
      return
    }

    deps.versionService.clearError()
    state.error = null

    try {
      const selectedVersion = state.versions[state.selectedVersionIndex]
      const result = await deps.versionService.recoverVersion(
        state.selectedNote,
        selectedVersion.filename
      )

      if (result.success) {
        await deps.loadNoteContent(state.selectedNote)
        closeVersionExplorer()
      } else {
        state.error = result.error || 'Failed to recover version'
      }
    } catch (err) {
      state.error = `Failed to recover version: ${err}`
    }
  }

  return {
    get isVisible() {
      return state.isVisible
    },
    get selectedNote() {
      return state.selectedNote
    },
    get versions() {
      return state.versions
    },
    get selectedVersionIndex() {
      return state.selectedVersionIndex
    },
    get previewContent() {
      return state.previewContent
    },
    get isLoadingPreview() {
      return state.isLoadingPreview
    },
    get error() {
      return state.error
    },
    openVersionExplorer,
    closeVersionExplorer,
    selectVersion,
    selectPreviousVersion,
    selectNextVersion,
    recoverSelectedVersion,
  }
}
