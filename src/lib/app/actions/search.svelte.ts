/**
 * App Layer - Search Actions
 * Search-related operations including clearing search state
 * and managing filtered note results.
 */

import type { NoteMetadata } from '../../core/searchManager.svelte'

interface SearchActionDeps {
  searchManager: ReturnType<
    typeof import('../../core/searchManager.svelte').createSearchManager
  >
  contentManager: ReturnType<
    typeof import('../../core/contentManager.svelte').createContentManager
  >
  focusManager: ReturnType<
    typeof import('../../core/focusManager.svelte').createFocusManager
  >
  editorManager: ReturnType<
    typeof import('../../core/editorManager.svelte').createEditorManager
  >
  contentNavigationManager: ReturnType<
    typeof import('../../core/contentNavigationManager.svelte').createContentNavigationManager
  >
}

interface SearchActions {
  updateFilteredNotes(notes: NoteMetadata[]): void
  resetSearchState(): void
  clearHighlights(): void
  clearSearch(): void
}

export function createSearchActions(deps: SearchActionDeps): SearchActions {
  const {
    searchManager,
    focusManager,
    editorManager,
    contentNavigationManager,
  } = deps

  function updateFilteredNotes(notes: NoteMetadata[]): void {
    searchManager.setFilteredNotes(notes)

    // Handle selection normalization when filtered notes change
    const currentIndex = focusManager.selectedIndex

    if (
      notes.length > 0 &&
      (currentIndex === -1 || currentIndex >= notes.length)
    ) {
      editorManager.exitEditMode()
      focusManager.setSelectedIndex(0)
    }
  }

  function resetSearchState(): void {
    searchManager.clearSearch()
    searchManager.setFilteredNotes([])
    contentNavigationManager.clearHighlights()
  }

  return {
    updateFilteredNotes,
    resetSearchState,
    clearHighlights: contentNavigationManager.clearHighlights,
    clearSearch: searchManager.clearSearch,
  }
}
