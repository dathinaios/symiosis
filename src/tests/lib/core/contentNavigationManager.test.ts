/**
 * Tests for Content Navigation Manager
 * Verifies navigation between search highlights and markdown headers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createContentNavigationManager } from '../../../lib/core/contentNavigationManager.svelte'

describe('ContentNavigationManager', () => {
  let mockNoteContentElement: HTMLElement
  let mockDeps: {
    focusManager: {
      noteContentElement: HTMLElement | null
    }
    searchManager: {
      query: string
      searchInput: string
      clearSearch(): void
    }
    linkOpener: {
      openPath: ReturnType<typeof vi.fn>
      openUrl: ReturnType<typeof vi.fn>
    }
    notifyError: ReturnType<typeof vi.fn>
  }
  let navigationManager: ReturnType<typeof createContentNavigationManager>

  beforeEach(() => {
    // Create a mock DOM element
    mockNoteContentElement = document.createElement('div')
    mockNoteContentElement.innerHTML = `
      <h1>First Header</h1>
      <p>Some content with <mark class="highlight">search</mark> term</p>
      <h2>Second Header</h2>
      <p>More content with another <mark class="highlight">search</mark> result</p>
      <h3>Third Header</h3>
      <p>Final content</p>
    `

    // Mock scroll methods
    mockNoteContentElement.scrollTo = vi.fn()
    Object.defineProperty(mockNoteContentElement, 'clientHeight', {
      value: 500,
      configurable: true,
    })
    mockNoteContentElement.getBoundingClientRect = vi.fn(() => ({
      top: 0,
      left: 0,
      bottom: 500,
      right: 800,
      width: 800,
      height: 500,
      x: 0,
      y: 0,
      toJSON: vi.fn(),
    }))

    // Mock element methods
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      top: 100,
      left: 0,
      bottom: 120,
      right: 100,
      width: 100,
      height: 20,
      x: 0,
      y: 100,
      toJSON: vi.fn(),
    }))
    Element.prototype.scrollIntoView = vi.fn()

    mockDeps = {
      focusManager: {
        noteContentElement: mockNoteContentElement,
      },
      searchManager: {
        query: '',
        searchInput: '',
        clearSearch: vi.fn(),
      },
      linkOpener: {
        openPath: vi.fn().mockResolvedValue(undefined),
        openUrl: vi.fn().mockResolvedValue(undefined),
      },
      notifyError: vi.fn(),
    }

    navigationManager = createContentNavigationManager(mockDeps)
  })

  describe('highlight navigation functionality', () => {
    beforeEach(() => {
      mockDeps.searchManager.query = 'search'
    })

    it('should apply highlight-current class to first highlight on navigateNext', () => {
      navigationManager.navigateNext()

      const highlights =
        mockNoteContentElement.querySelectorAll('mark.highlight')
      expect(highlights[0].classList.contains('highlight-current')).toBe(true)
      expect(highlights[1].classList.contains('highlight-current')).toBe(false)
    })

    it('should move to second highlight on consecutive navigateNext calls', () => {
      navigationManager.navigateNext()
      navigationManager.navigateNext()

      const highlights =
        mockNoteContentElement.querySelectorAll('mark.highlight')
      expect(highlights[0].classList.contains('highlight-current')).toBe(false)
      expect(highlights[1].classList.contains('highlight-current')).toBe(true)
    })

    it('should stay at last highlight when navigating beyond bounds', () => {
      navigationManager.navigateNext()
      navigationManager.navigateNext()
      navigationManager.navigateNext() // Should stay at second highlight

      const highlights =
        mockNoteContentElement.querySelectorAll('mark.highlight')
      expect(highlights[1].classList.contains('highlight-current')).toBe(true)
    })

    it('should navigate backwards with navigatePrevious', () => {
      navigationManager.navigateNext()
      navigationManager.navigateNext()
      navigationManager.navigatePrevious()

      const highlights =
        mockNoteContentElement.querySelectorAll('mark.highlight')
      expect(highlights[0].classList.contains('highlight-current')).toBe(true)
      expect(highlights[1].classList.contains('highlight-current')).toBe(false)
    })
  })

  describe('header navigation functionality', () => {
    beforeEach(() => {
      mockDeps.searchManager.query = '' // No search query = header mode
    })

    it('should apply header-current class to first header on navigateNext', () => {
      navigationManager.navigateNext()

      const headers = mockNoteContentElement.querySelectorAll(
        'h1, h2, h3, h4, h5, h6'
      )
      expect(headers[0].classList.contains('header-current')).toBe(true)
      expect(headers[1].classList.contains('header-current')).toBe(false)
    })

    it('should navigate through all headers sequentially', () => {
      navigationManager.navigateNext()
      navigationManager.navigateNext()
      navigationManager.navigateNext()

      const headers = mockNoteContentElement.querySelectorAll(
        'h1, h2, h3, h4, h5, h6'
      )
      expect(headers[0].classList.contains('header-current')).toBe(false)
      expect(headers[1].classList.contains('header-current')).toBe(false)
      expect(headers[2].classList.contains('header-current')).toBe(true)
    })

    it('should navigate backwards through headers', () => {
      navigationManager.navigateNext()
      navigationManager.navigateNext()
      navigationManager.navigatePrevious()

      const headers = mockNoteContentElement.querySelectorAll(
        'h1, h2, h3, h4, h5, h6'
      )
      expect(headers[0].classList.contains('header-current')).toBe(true)
      expect(headers[1].classList.contains('header-current')).toBe(false)
    })
  })

  describe('mode switching behavior', () => {
    it('should switch to header navigation when highlights are hidden', () => {
      mockDeps.searchManager.query = 'search'
      navigationManager.clearHighlights()

      navigationManager.navigateNext()

      const headers = mockNoteContentElement.querySelectorAll(
        'h1, h2, h3, h4, h5, h6'
      )
      const highlights =
        mockNoteContentElement.querySelectorAll('mark.highlight')

      expect(headers[0].classList.contains('header-current')).toBe(true)
      expect(highlights[0].classList.contains('highlight-current')).toBe(false)
    })

    it('should use highlight navigation when query present and highlights visible', () => {
      mockDeps.searchManager.query = 'search'
      // Highlights visible by default

      navigationManager.navigateNext()

      const headers = mockNoteContentElement.querySelectorAll(
        'h1, h2, h3, h4, h5, h6'
      )
      const highlights =
        mockNoteContentElement.querySelectorAll('mark.highlight')

      expect(highlights[0].classList.contains('highlight-current')).toBe(true)
      expect(headers[0].classList.contains('header-current')).toBe(false)
    })
  })

  describe('state management', () => {
    it('should handle missing noteContentElement gracefully', () => {
      mockDeps.focusManager.noteContentElement = null

      expect(() => {
        navigationManager.navigateNext()
        navigationManager.navigatePrevious()
      }).not.toThrow()
    })

    it('should handle empty content gracefully', () => {
      mockNoteContentElement.innerHTML = ''

      expect(() => {
        navigationManager.navigateNext()
        navigationManager.navigatePrevious()
      }).not.toThrow()
    })

    it('should reset navigation state properly', () => {
      mockDeps.searchManager.query = 'search'
      navigationManager.navigateNext()

      const highlights =
        mockNoteContentElement.querySelectorAll('mark.highlight')
      expect(highlights[0].classList.contains('highlight-current')).toBe(true)

      navigationManager.resetNavigation()
      expect(highlights[0].classList.contains('highlight-current')).toBe(false)
    })

    it('should clear current styles with clearCurrentStyles', () => {
      navigationManager.navigateNext()
      const headers = mockNoteContentElement.querySelectorAll(
        'h1, h2, h3, h4, h5, h6'
      )
      expect(headers[0].classList.contains('header-current')).toBe(true)

      navigationManager.clearCurrentStyles()
      expect(headers[0].classList.contains('header-current')).toBe(false)
    })

    it('should report correct hide highlights state', () => {
      expect(navigationManager.hideHighlights).toBe(false)

      navigationManager.clearHighlights()
      expect(navigationManager.hideHighlights).toBe(true)

      navigationManager.showHighlights()
      expect(navigationManager.hideHighlights).toBe(false)
    })
  })

  describe('handleEscape functionality', () => {
    it('should clear search when search input has less than 3 characters but query is empty', () => {
      mockDeps.searchManager.searchInput = 'ab'
      mockDeps.searchManager.query = ''

      const result = navigationManager.handleEscape()

      expect(result).toBe('search_cleared')
      expect(mockDeps.searchManager.clearSearch).toHaveBeenCalled()
    })

    it('should focus search when no search input and no query', () => {
      mockDeps.searchManager.searchInput = ''
      mockDeps.searchManager.query = ''

      const result = navigationManager.handleEscape()

      expect(result).toBe('focus_search')
      expect(mockDeps.searchManager.clearSearch).not.toHaveBeenCalled()
    })

    it('should focus search when search input is 3 or more characters (committed query)', () => {
      mockDeps.searchManager.searchInput = 'abcd'
      mockDeps.searchManager.query = 'abcd'

      const result = navigationManager.handleEscape()

      expect(result).toBe('highlights_cleared')
      expect(mockDeps.searchManager.clearSearch).not.toHaveBeenCalled()
    })

    it('should not clear search when searchInput is 3 or more characters but query is empty (edge case)', () => {
      // This shouldn't happen in normal flow, but test the edge case
      mockDeps.searchManager.searchInput = 'abcd'
      mockDeps.searchManager.query = ''

      const result = navigationManager.handleEscape()

      expect(result).toBe('focus_search')
      expect(mockDeps.searchManager.clearSearch).not.toHaveBeenCalled()
    })
  })

  describe('following links', () => {
    /** Puts the manager into link-navigation mode on a single link. */
    function navigateToLink(href: string): void {
      mockNoteContentElement.innerHTML = `<p><a href="${href}">link</a></p>`
      navigationManager.navigateLinkNext()
    }

    it('opens an http URL through the injected opener', () => {
      navigateToLink('https://example.com/page')

      navigationManager.openCurrentLink()

      expect(mockDeps.linkOpener.openUrl).toHaveBeenCalledWith(
        'https://example.com/page'
      )
      expect(mockDeps.linkOpener.openPath).not.toHaveBeenCalled()
    })

    it('opens a file path through the injected opener', () => {
      navigateToLink('/home/user/notes/other.md')

      navigationManager.openCurrentLink()

      expect(mockDeps.linkOpener.openPath).toHaveBeenCalledWith(
        '/home/user/notes/other.md'
      )
      expect(mockDeps.linkOpener.openUrl).not.toHaveBeenCalled()
    })

    it('reports a link with no destination instead of opening anything', () => {
      // Only an empty `href` reaches this branch — the link collector selects
      // `a[href]`, so an anchor without the attribute is never navigable.
      navigateToLink('')

      navigationManager.openCurrentLink()

      expect(mockDeps.notifyError).toHaveBeenCalledWith('Link has no URL')
      expect(mockDeps.linkOpener.openUrl).not.toHaveBeenCalled()
      expect(mockDeps.linkOpener.openPath).not.toHaveBeenCalled()
    })

    it('reports a failure to open rather than throwing', async () => {
      mockDeps.linkOpener.openUrl.mockRejectedValue(new Error('no handler'))
      navigateToLink('https://example.com/page')

      navigationManager.openCurrentLink()
      await vi.waitFor(() =>
        expect(mockDeps.notifyError).toHaveBeenCalledWith(
          'Failed to open link: https://example.com/page'
        )
      )
    })
  })
})
