import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { FocusManager } from '../../../lib/core/focusManager.svelte'
import { createFocusManager } from '../../../lib/core/focusManager.svelte'

// Mock DOM elements - using unknown then casting for maximum flexibility
function createMockHTMLInputElement() {
  return {
    focus: vi.fn(),
    scrollIntoView: vi.fn(),
  } as unknown as HTMLInputElement
}

function createMockHTMLElement() {
  return {
    focus: vi.fn(),
    scrollBy: vi.fn(),
    scrollIntoView: vi.fn(),
    children: [] as HTMLElement[],
    querySelector: vi.fn(),
  } as unknown as HTMLElement
}

// Create a fresh instance for each test
let focusManager: FocusManager

describe('focusManager', () => {
  let searchElement: HTMLInputElement
  let noteContentElement: HTMLElement
  let noteListElement: HTMLElement

  beforeEach(() => {
    // Create fresh manager instance
    focusManager = createFocusManager()

    // Create fresh mock elements
    searchElement = createMockHTMLInputElement()
    noteContentElement = createMockHTMLElement()
    noteListElement = createMockHTMLElement()

    // Reset focus manager state
    focusManager.setSearchInputFocused(false)
    focusManager.setSearchElement(null)
    focusManager.setNoteContentElement(null)
    focusManager.setNoteListElement(null)

    vi.clearAllMocks()
  })

  describe('state getters', () => {
    it('should initialize with default state', () => {
      expect(focusManager.isSearchInputFocused).toBe(false)
      expect(focusManager.searchElement).toBeNull()
      expect(focusManager.noteContentElement).toBeNull()
      expect(focusManager.noteListElement).toBeNull()
    })
  })

  describe('focus state management', () => {
    it('should update search input focus state', () => {
      focusManager.setSearchInputFocused(true)
      expect(focusManager.isSearchInputFocused).toBe(true)

      focusManager.setSearchInputFocused(false)
      expect(focusManager.isSearchInputFocused).toBe(false)
    })
  })

  describe('element management', () => {
    it('should set and get elements', () => {
      focusManager.setSearchElement(searchElement)
      focusManager.setNoteContentElement(noteContentElement)
      focusManager.setNoteListElement(noteListElement)

      expect(focusManager.searchElement).toStrictEqual(searchElement)
      expect(focusManager.noteContentElement).toStrictEqual(noteContentElement)
      expect(focusManager.noteListElement).toStrictEqual(noteListElement)
    })
  })

  describe('focus actions', () => {
    beforeEach(() => {
      focusManager.setSearchElement(searchElement)
      focusManager.setNoteContentElement(noteContentElement)
    })

    it('should focus search input', () => {
      focusManager.focusSearch()
      expect(searchElement.focus).toHaveBeenCalledOnce()
    })

    it('should handle null search element gracefully', () => {
      focusManager.setSearchElement(null)
      expect(() => focusManager.focusSearch()).not.toThrow()
    })
  })

  describe('scroll actions', () => {
    beforeEach(() => {
      focusManager.setNoteContentElement(noteContentElement)
      focusManager.setNoteListElement(noteListElement)
    })

    it('should scroll note content up', () => {
      focusManager.scrollNoteContentUp()
      expect(noteContentElement.scrollBy).toHaveBeenCalledWith({
        top: -50,
        behavior: 'smooth',
      })
    })

    it('should scroll note content down', () => {
      focusManager.scrollNoteContentDown()
      expect(noteContentElement.scrollBy).toHaveBeenCalledWith({
        top: 50,
        behavior: 'smooth',
      })
    })

    it('should scroll to selected item in list', () => {
      const mockButton = createMockHTMLElement()
      const mockLi = {
        querySelector: vi.fn().mockReturnValue(mockButton),
      } as unknown as HTMLElement

      // Properly mock the children array
      Object.defineProperty(noteListElement, 'children', {
        value: [mockLi],
        writable: true,
      })

      focusManager.scrollToSelectedInList(0)

      expect(mockLi.querySelector).toHaveBeenCalledWith('button')
      expect(mockButton.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'nearest',
      })
    })

    it('should handle null elements for scroll operations', () => {
      focusManager.setNoteContentElement(null)
      focusManager.setNoteListElement(null)

      expect(() => focusManager.scrollNoteContentUp()).not.toThrow()
      expect(() => focusManager.scrollToSelectedInList(0)).not.toThrow()
    })

    it('should scroll to selected item by index', () => {
      const mockButton = createMockHTMLElement()
      const mockLi = {
        querySelector: vi.fn().mockReturnValue(mockButton),
      } as unknown as HTMLElement

      // Properly mock the children array
      Object.defineProperty(noteListElement, 'children', {
        value: [mockLi],
        writable: true,
      })

      focusManager.scrollToSelectedInList(0)

      expect(mockLi.querySelector).toHaveBeenCalledWith('button')
      expect(mockButton.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'nearest',
      })
    })
  })
})
