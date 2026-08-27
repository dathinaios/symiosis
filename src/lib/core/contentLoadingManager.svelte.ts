/**
 * Core Layer - Content Loading Manager
 * Owns the lifecycle of "which note's content is on screen": request
 * sequencing, cancellation of stale loads, and the refresh flows that
 * re-run search and reload the selected note.
 *
 * Extracted from appCoordinator so the coordinator stays a composition
 * root; the abort/sequence machinery is a responsibility of its own.
 */

import type { ContentManager } from './contentManager.svelte'
import type { ContentNavigationManager } from './contentNavigationManager.svelte'
import type { FocusManager } from './focusManager.svelte'
import type { SearchManager } from './searchManager.svelte'

export interface ContentLoadingManagerDeps {
  contentManager: Pick<
    ContentManager,
    'setNoteContent' | 'scrollToFirstMatch' | 'refreshContent'
  >
  contentNavigationManager: Pick<ContentNavigationManager, 'resetNavigation'>
  searchManager: Pick<
    SearchManager,
    'searchInput' | 'filteredNotes' | 'executeSearch'
  >
  focusManager: Pick<FocusManager, 'setSelectedIndex'>
  configService: {
    refreshCache(): Promise<void>
  }
  /** Lazily reads the current selection (derived in the coordinator). */
  getSelectedNote: () => string | null
}

export interface ContentLoadingManager {
  loadNoteContent(note: string): Promise<void>
  refreshUI(): Promise<void>
  refreshCacheAndUI(): Promise<void>
  /** Cancel any in-flight load; called from app teardown. */
  abort(): void
}

export function createContentLoadingManager(
  deps: ContentLoadingManagerDeps
): ContentLoadingManager {
  let contentRequestController: AbortController | null = null
  let contentRequestSequence = 0
  let currentLoadedNote: string | null = null

  function abortPreviousContentRequest(): void {
    if (contentRequestController) {
      contentRequestController.abort()
    }
  }

  function handleEmptyNote(currentSequence: number): void {
    if (currentSequence === contentRequestSequence) {
      deps.contentManager.setNoteContent('')
    }
  }

  function setupNewContentRequest(): AbortController {
    const controller = new AbortController()
    contentRequestController = controller
    return controller
  }

  function isRequestStillValid(
    controller: AbortController,
    currentSequence: number
  ): boolean {
    return (
      !controller.signal.aborted && currentSequence === contentRequestSequence
    )
  }

  function scheduleScrollToFirstMatch(currentSequence: number): void {
    requestAnimationFrame(() => {
      if (currentSequence === contentRequestSequence) {
        deps.contentManager.scrollToFirstMatch()
      }
    })
  }

  async function handleContentLoadError(
    error: unknown,
    controller: AbortController,
    currentSequence: number
  ): Promise<void> {
    if (!isRequestStillValid(controller, currentSequence)) {
      return
    }

    console.error('Failed to load note content:', error)
    const errorMessage = String(error)
    deps.contentManager.setNoteContent(`Error loading note: ${errorMessage}`)

    if (errorMessage.includes('Note not found')) {
      try {
        await refreshCacheAndUI()
      } catch (refreshError) {
        console.error('Auto-refresh failed:', refreshError)
      }
    }
  }

  async function loadNoteContent(note: string): Promise<void> {
    abortPreviousContentRequest()

    const currentSequence = ++contentRequestSequence

    // Only reset navigation when switching to a different note
    const isNoteSwitching = currentLoadedNote !== note
    if (isNoteSwitching) {
      deps.contentNavigationManager.resetNavigation()
    }

    if (!note) {
      currentLoadedNote = null
      handleEmptyNote(currentSequence)
      return
    }

    currentLoadedNote = note
    const controller = setupNewContentRequest()

    try {
      await deps.contentManager.refreshContent(note)

      if (isRequestStillValid(controller, currentSequence)) {
        scheduleScrollToFirstMatch(currentSequence)
      }
    } catch (e) {
      await handleContentLoadError(e, controller, currentSequence)
    }
  }

  async function refreshUI(): Promise<void> {
    const previousQuery = deps.searchManager.searchInput
    const previousNote = deps.getSelectedNote()

    await deps.searchManager.executeSearch(previousQuery)

    if (previousNote) {
      const idx = deps.searchManager.filteredNotes.findIndex(
        (n) => n.filename === previousNote
      )
      if (idx >= 0) {
        deps.focusManager.setSelectedIndex(idx)
        await loadNoteContent(previousNote)
      }
    }
  }

  async function refreshCacheAndUI(): Promise<void> {
    await deps.configService.refreshCache()
    await refreshUI()
  }

  function abort(): void {
    if (contentRequestController) {
      contentRequestController.abort()
      contentRequestController = null
    }
  }

  return {
    loadNoteContent,
    refreshUI,
    refreshCacheAndUI,
    abort,
  }
}
