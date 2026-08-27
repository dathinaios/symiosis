/**
 * Core Layer - Focus Manager
 * Keyboard focus state and DOM element focus operations.
 * Tracks focused elements and provides programmatic focus control.
 */

interface FocusState {
  isSearchInputFocused: boolean
  selectedIndex: number
  searchElement: HTMLInputElement | null
  noteContentElement: HTMLElement | null
  noteListElement: HTMLElement | null
}

export interface FocusManager {
  readonly isSearchInputFocused: boolean
  readonly selectedIndex: number
  readonly searchElement: HTMLInputElement | null
  readonly noteContentElement: HTMLElement | null
  readonly noteListElement: HTMLElement | null
  setSearchInputFocused(value: boolean): void
  setSelectedIndex(index: number): void
  setSearchElement(element: HTMLInputElement | null): void
  setNoteContentElement(element: HTMLElement | null): void
  setNoteListElement(element: HTMLElement | null): void
  focusSearch(): void
  scrollNoteContentUp(): void
  scrollNoteContentDown(): void
  scrollToSelectedInList(selectedIndex: number): void
}

export function createFocusManager(): FocusManager {
  const state = $state<FocusState>({
    isSearchInputFocused: false,
    selectedIndex: -1,
    searchElement: null,
    noteContentElement: null,
    noteListElement: null,
  })
  function scrollToSelectedInList(selectedIndex: number): void {
    if (state.noteListElement && selectedIndex >= 0) {
      const selectedButton =
        state.noteListElement.children[selectedIndex]?.querySelector('button')
      if (selectedButton) {
        selectedButton.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }

  return {
    get isSearchInputFocused(): boolean {
      return state.isSearchInputFocused
    },
    get selectedIndex(): number {
      return state.selectedIndex
    },
    get searchElement(): HTMLInputElement | null {
      return state.searchElement
    },
    get noteContentElement(): HTMLElement | null {
      return state.noteContentElement
    },
    get noteListElement(): HTMLElement | null {
      return state.noteListElement
    },

    setSearchInputFocused(value: boolean): void {
      state.isSearchInputFocused = value
    },
    setSelectedIndex(index: number): void {
      state.selectedIndex = index
    },

    setSearchElement(element: HTMLInputElement | null): void {
      state.searchElement = element
    },
    setNoteContentElement(element: HTMLElement | null): void {
      state.noteContentElement = element
    },
    setNoteListElement(element: HTMLElement | null): void {
      state.noteListElement = element
    },

    focusSearch(): void {
      state.searchElement?.focus()
    },

    scrollNoteContentUp(): void {
      state.noteContentElement?.scrollBy({
        top: -50,
        behavior: 'smooth',
      })
    },
    scrollNoteContentDown(): void {
      state.noteContentElement?.scrollBy({
        top: 50,
        behavior: 'smooth',
      })
    },
    scrollToSelectedInList,
  }
}
