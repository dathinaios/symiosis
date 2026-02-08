/**
 * Core Layer - Content Manager
 * Note content loading, caching, and display with search highlighting.
 * Coordinates between content fetching, highlighting service, and UI updates.
 */

import { getHighlightedContent } from '../utils/contentHighlighting.svelte'
import type { NoteMetadata } from './searchManager.svelte'

/** Delay in ms before starting highlight navigation to allow DOM to settle */
const HIGHLIGHT_NAVIGATION_DELAY_MS = 100

export interface ContentManagerDeps {
  noteService: {
    getContent: (noteName: string) => Promise<string>
  }
  searchManager: {
    readonly query: string
    executeSearch(query: string): Promise<NoteMetadata[]>
  }
  focusManager: {
    readonly noteContentElement: HTMLElement | null
  }
  contentNavigationManager: {
    readonly hideHighlights: boolean
    clearHighlights(): void
    startHighlightNavigation(): void
  }
}

interface ContentState {
  noteContent: string
}

interface RefreshAfterSaveResult {
  searchResults: NoteMetadata[]
  content: string
}

export interface ContentManager {
  readonly noteContent: string
  readonly highlightedContent: string
  setNoteContent(content: string): void
  scrollToFirstMatch(): void
  refreshContent(noteName: string): Promise<string>
  refreshAfterSave(
    noteName: string,
    searchInput: string
  ): Promise<RefreshAfterSaveResult>
}

export function createContentManager(deps: ContentManagerDeps): ContentManager {
  const state = $state<ContentState>({
    noteContent: '',
  })

  const highlightedContent = $derived(
    getHighlightedContent(
      state.noteContent,
      deps.searchManager.query,
      deps.contentNavigationManager.hideHighlights
    )
  )

  function setNoteContent(content: string): void {
    state.noteContent = content
  }

  function scrollToFirstMatch(): void {
    const noteContentElement = deps.focusManager.noteContentElement
    if (noteContentElement && !deps.contentNavigationManager.hideHighlights) {
      setTimeout(() => {
        deps.contentNavigationManager.startHighlightNavigation()
      }, HIGHLIGHT_NAVIGATION_DELAY_MS)
    }
  }

  async function refreshContent(noteName: string): Promise<string> {
    const content = await deps.noteService.getContent(noteName)
    setNoteContent(content)
    return content
  }

  async function refreshAfterSave(
    noteName: string,
    searchInput: string
  ): Promise<RefreshAfterSaveResult> {
    const searchResults = await deps.searchManager.executeSearch(searchInput)
    const content = await refreshContent(noteName)

    return {
      searchResults,
      content,
    }
  }

  return {
    get noteContent(): string {
      return state.noteContent
    },

    get highlightedContent(): string {
      return highlightedContent
    },

    setNoteContent,
    scrollToFirstMatch,
    refreshContent,
    refreshAfterSave,
  }
}
