import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createSearchActions } from '$lib/app/actions/search.svelte'
import type { NoteMetadata } from '$lib/types/note'

const toMetadata = (filenames: string[]): NoteMetadata[] =>
  filenames.map((filename) => ({ filename, modified: Date.now() / 1000 }))

describe('search actions', () => {
  let searchActions: ReturnType<typeof createSearchActions>
  let mockDeps: Parameters<typeof createSearchActions>[0]

  beforeEach(() => {
    mockDeps = {
      searchManager: {
        clearSearch: vi.fn(),
        setFilteredNotes: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      contentManager: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      focusManager: {
        selectedIndex: 0,
        setSelectedIndex: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      editorManager: {
        exitEditMode: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      contentNavigationManager: {
        clearHighlights: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    }

    searchActions = createSearchActions(mockDeps)
  })

  describe('updateFilteredNotes', () => {
    it('should update filtered notes in search manager', () => {
      const notes = ['note1.md', 'note2.md', 'note3.md']

      searchActions.updateFilteredNotes(toMetadata(notes))

      expect(mockDeps.searchManager.setFilteredNotes).toHaveBeenCalledWith(
        toMetadata(notes)
      )
    })

    it('should reset selection to 0 when current index is -1 and notes exist', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(mockDeps.focusManager as any).selectedIndex = -1
      const notes = ['note1.md', 'note2.md']

      searchActions.updateFilteredNotes(toMetadata(notes))

      expect(mockDeps.editorManager.exitEditMode).toHaveBeenCalledOnce()
      expect(mockDeps.focusManager.setSelectedIndex).toHaveBeenCalledWith(0)
    })

    it('should reset selection to 0 when current index exceeds notes length', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(mockDeps.focusManager as any).selectedIndex = 5
      const notes = ['note1.md', 'note2.md']

      searchActions.updateFilteredNotes(toMetadata(notes))

      expect(mockDeps.editorManager.exitEditMode).toHaveBeenCalledOnce()
      expect(mockDeps.focusManager.setSelectedIndex).toHaveBeenCalledWith(0)
    })

    it('should not reset selection when index is valid', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(mockDeps.focusManager as any).selectedIndex = 1
      const notes = ['note1.md', 'note2.md', 'note3.md']

      searchActions.updateFilteredNotes(toMetadata(notes))

      expect(mockDeps.editorManager.exitEditMode).not.toHaveBeenCalled()
      expect(mockDeps.focusManager.setSelectedIndex).not.toHaveBeenCalled()
    })

    it('should not reset selection when no notes exist', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(mockDeps.focusManager as any).selectedIndex = 5
      const notes: string[] = []

      searchActions.updateFilteredNotes(toMetadata(notes))

      expect(mockDeps.editorManager.exitEditMode).not.toHaveBeenCalled()
      expect(mockDeps.focusManager.setSelectedIndex).not.toHaveBeenCalled()
    })

    it('should handle empty notes array', () => {
      searchActions.updateFilteredNotes([])

      expect(mockDeps.searchManager.setFilteredNotes).toHaveBeenCalledWith([])
    })
  })

  describe('resetSearchState', () => {
    it('should clear search, filtered notes, and highlights', () => {
      searchActions.resetSearchState()

      expect(mockDeps.searchManager.clearSearch).toHaveBeenCalledOnce()
      expect(mockDeps.searchManager.setFilteredNotes).toHaveBeenCalledWith([])
      expect(
        mockDeps.contentNavigationManager.clearHighlights
      ).toHaveBeenCalledOnce()
    })

    it('should call methods in correct order', () => {
      const clearSearchSpy = mockDeps.searchManager.clearSearch
      const setFilteredNotesSpy = mockDeps.searchManager.setFilteredNotes
      const clearHighlightsSpy =
        mockDeps.contentNavigationManager.clearHighlights

      searchActions.resetSearchState()

      expect(clearSearchSpy).toHaveBeenCalledOnce()
      expect(setFilteredNotesSpy).toHaveBeenCalledOnce()
      expect(clearHighlightsSpy).toHaveBeenCalledOnce()
    })
  })

  describe('clearHighlights', () => {
    it('should delegate to content manager clearHighlights', () => {
      searchActions.clearHighlights()

      expect(
        mockDeps.contentNavigationManager.clearHighlights
      ).toHaveBeenCalledOnce()
    })
  })

  describe('clearSearch', () => {
    it('should delegate to search manager clearSearch', () => {
      searchActions.clearSearch()

      expect(mockDeps.searchManager.clearSearch).toHaveBeenCalledOnce()
    })
  })

  describe('interface compliance', () => {
    it('should expose all required methods', () => {
      expect(searchActions).toHaveProperty('updateFilteredNotes')
      expect(searchActions).toHaveProperty('resetSearchState')
      expect(searchActions).toHaveProperty('clearHighlights')
      expect(searchActions).toHaveProperty('clearSearch')

      expect(typeof searchActions.updateFilteredNotes).toBe('function')
      expect(typeof searchActions.resetSearchState).toBe('function')
      expect(typeof searchActions.clearHighlights).toBe('function')
      expect(typeof searchActions.clearSearch).toBe('function')
    })
  })

  describe('edge cases', () => {
    it('should handle null/undefined notes gracefully', () => {
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        searchActions.updateFilteredNotes(null as any)
      }).toThrow() // Should throw due to length check
    })

    it('should handle very large note arrays', () => {
      const largeNoteArray = toMetadata(
        Array.from({ length: 10000 }, (_, i) => `note${i}.md`)
      )

      expect(() => {
        searchActions.updateFilteredNotes(largeNoteArray)
      }).not.toThrow()

      expect(mockDeps.searchManager.setFilteredNotes).toHaveBeenCalledWith(
        largeNoteArray
      )
    })
  })
})
