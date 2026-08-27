/**
 * App Layer - Lifecycle
 * Owns application startup and teardown: config initialisation, the Tauri
 * event subscriptions, first-load of notes, and unwinding all of it.
 *
 * Extracted from appCoordinator so composition and lifecycle are separate
 * concerns. Note that reactive effects are deliberately NOT registered here —
 * `$effect` throws `effect_orphan` outside component initialisation, and
 * `start()` runs after `await`s inside `onMount`.
 */

import { tick } from 'svelte'
import { listen } from '@tauri-apps/api/event'
import type { NoteMetadata } from '../types/note'

export interface AppLifecycleDeps {
  configManager: {
    initialize(): Promise<void>
    cleanup(): void
  }
  configService: {
    exists(): Promise<boolean>
  }
  noteService: {
    initializeDatabase(): Promise<{ success: boolean; error?: string }>
  }
  searchManager: {
    executeSearch(query: string): Promise<NoteMetadata[]>
    abort(): void
  }
  focusManager: {
    focusSearch(): void
    setSelectedIndex(index: number): void
  }
  progressManager: {
    start(message: string): void
    updateProgress(message: string): void
    complete(): void
    setError(errorMessage: string): void
  }
  contentLoadingManager: {
    loadNoteContent(note: string): Promise<void>
    refreshUI(): Promise<void>
    abort(): void
  }
  openSettingsPane(): Promise<void>
  /** Called when the backend reports this is the user's first run. */
  onFirstRunDetected(): void
}

export interface AppLifecycle {
  /** Boot the app; resolves to the teardown function. */
  start(): Promise<() => void>
}

export function createAppLifecycle(deps: AppLifecycleDeps): AppLifecycle {
  async function registerEventListeners(): Promise<Array<() => void>> {
    return Promise.all([
      listen('open-preferences', async () => {
        await deps.openSettingsPane()
      }),
      listen('cache-refreshed', async () => {
        await deps.contentLoadingManager.refreshUI()
      }),
      listen('first-run-detected', () => {
        deps.onFirstRunDetected()
      }),
      listen<string>('db-loading-start', (event) => {
        deps.progressManager.start(event.payload)
      }),
      listen<string>('db-loading-progress', (event) => {
        deps.progressManager.updateProgress(event.payload)
      }),
      listen('db-loading-complete', () => {
        deps.progressManager.complete()
      }),
      listen<string>('db-loading-error', (event) => {
        deps.progressManager.setError(event.payload)
      }),
    ])
  }

  async function initializeNotesAndUI(): Promise<void> {
    const { notification } = await import('../utils/notification')

    let configExists: boolean
    try {
      configExists = await deps.configService.exists()
    } catch (e) {
      console.error('Failed to check config existence:', e)
      await notification.error(
        'Failed to load configuration. Please restart the app.'
      )
      return
    }

    if (!configExists) {
      await deps.openSettingsPane()
      return
    }

    const result = await deps.noteService.initializeDatabase()
    if (!result.success) {
      console.error('Failed to initialize notes:', result.error)
      await notification.error(
        'Failed to initialize notes database. Some notes may be unavailable.'
      )
    }

    deps.focusManager.focusSearch()
    const notes = await deps.searchManager.executeSearch('')
    if (notes.length > 0) {
      deps.focusManager.setSelectedIndex(0)
      await deps.contentLoadingManager.loadNoteContent(notes[0].filename)
    }
  }

  function createTeardown(unlisteners: Array<() => void>): () => void {
    return () => {
      deps.searchManager.abort()
      deps.contentLoadingManager.abort()
      unlisteners.forEach((unlisten) => unlisten())
      deps.configManager.cleanup()
    }
  }

  return {
    async start(): Promise<() => void> {
      await tick()
      await deps.configManager.initialize()

      const unlisteners = await registerEventListeners()
      await initializeNotesAndUI()

      return createTeardown(unlisteners)
    },
  }
}
