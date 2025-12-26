/**
 * Core Layer - Search Manager
 * Search input, debouncing, and filtered note results.
 * Handles hybrid search queries to Rust backend and search state management.
 */

import type { createNoteService } from '../services/noteService.svelte'

/** Minimum characters required before triggering a filtered search query */
const MIN_SEARCH_QUERY_LENGTH = 3

/** Debounce delay in ms before executing search after user stops typing */
const SEARCH_DEBOUNCE_MS = 100

interface SearchState {
  searchInput: string
  query: string
  searchTimeout: ReturnType<typeof setTimeout> | undefined
  requestController: AbortController | null
  filteredNotes: string[]
}

interface SearchManagerDeps {
  noteService: ReturnType<typeof createNoteService>
  progressManager: {
    readonly isLoading: boolean
    start(message: string, type?: 'subtle' | 'modal'): void
    complete(): void
    setError(errorMessage: string): void
  }
}

interface SearchManager {
  readonly isLoading: boolean
  readonly filteredNotes: string[]
  searchInput: string
  readonly query: string
  setSearchInput(value: string): void
  setFilteredNotes(notes: string[]): void
  clearSearch(): void
  executeSearch(query: string): Promise<string[]>
  setSearchCompleteCallback(callback: (notes: string[]) => void): void
  abort(): void
}

export function createSearchManager(deps: SearchManagerDeps): SearchManager {
  const state = $state<SearchState>({
    searchInput: '',
    query: '',
    searchTimeout: undefined,
    requestController: null,
    filteredNotes: [],
  })

  let onSearchCompleteCallback: ((notes: string[]) => void) | null = null
  async function performSearch(query: string): Promise<void> {
    const searchController = setupSearchRequest()

    try {
      await executeSearchRequest(query, searchController)
    } catch (e) {
      handleSearchError(e, searchController)
    }
  }

  function setupSearchRequest(): AbortController {
    if (state.requestController) {
      state.requestController.abort()
    }

    state.requestController = new AbortController()
    return state.requestController
  }

  async function executeSearchRequest(
    query: string,
    controller: AbortController
  ): Promise<void> {
    deps.progressManager.start('Searching notes...', 'subtle')
    const notes = await deps.noteService.search(query)

    if (controller.signal.aborted) {
      return
    }

    handleSuccessfulSearch(notes)
  }

  function handleSuccessfulSearch(notes: string[]): void {
    state.filteredNotes = notes
    onSearchCompleteCallback?.(notes)
    deps.progressManager.complete()
  }

  function handleSearchError(e: unknown, controller: AbortController): void {
    if (!controller.signal.aborted) {
      console.error('❌ Failed to load notes:', e)
      deps.progressManager.setError('Failed to search notes')
      handleFailedSearch()
    }
  }

  function handleFailedSearch(): void {
    state.filteredNotes = []
    onSearchCompleteCallback?.([])
  }

  function setSearchInput(value: string): void {
    if (value !== state.searchInput) {
      clearTimeout(state.searchTimeout)
      state.requestController?.abort()
      state.searchInput = value

      if (value.length < MIN_SEARCH_QUERY_LENGTH) {
        state.query = ''
        state.searchTimeout = setTimeout(async () => {
          await performSearch('')
        }, SEARCH_DEBOUNCE_MS)
      } else {
        state.searchTimeout = setTimeout(async () => {
          state.query = state.searchInput
          await performSearch(state.searchInput)
        }, SEARCH_DEBOUNCE_MS)
      }
    }
  }

  function setFilteredNotes(notes: string[]): void {
    state.filteredNotes = notes
  }

  function clearSearch(): void {
    setSearchInput('')
  }

  return {
    setSearchInput,
    setFilteredNotes,
    clearSearch,

    get isLoading(): boolean {
      return deps.progressManager.isLoading
    },
    get filteredNotes(): string[] {
      return state.filteredNotes
    },
    get searchInput(): string {
      return state.searchInput
    },
    set searchInput(value: string) {
      setSearchInput(value)
    },
    get query(): string {
      return state.query
    },

    setSearchCompleteCallback(callback: (notes: string[]) => void): void {
      onSearchCompleteCallback = callback
    },

    async executeSearch(query: string): Promise<string[]> {
      await performSearch(query)
      return state.filteredNotes
    },

    abort(): void {
      if (state.searchTimeout !== undefined) {
        clearTimeout(state.searchTimeout)
        state.searchTimeout = undefined
      }

      if (state.requestController) {
        state.requestController.abort()
        state.requestController = null
      }

      deps.progressManager.complete()
    },
  }
}
