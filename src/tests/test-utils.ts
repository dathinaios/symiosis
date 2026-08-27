import { vi } from 'vitest'

export const mockInvoke = vi.fn()

export const mockSearchManager = {
  setSearchCompleteCallback: vi.fn(),
  executeSearch: vi.fn().mockResolvedValue([]),
  setSearchInput: vi.fn(),
  setFilteredNotes: vi.fn(),
  areHighlightsCleared: false,
  clearHighlights: vi.fn(),
  setHighlightsClearCallback: vi.fn(),
  query: '',
}

export const mockDialogManager = {
  closeCreateDialog: vi.fn(),
  closeDeleteDialog: vi.fn(),
  closeRenameDialog: vi.fn(),
  newNoteName: 'test-note',
  newNoteNameForRename: 'renamed-note',
}

export const resetAllMocks = () => {
  vi.clearAllMocks()
  mockInvoke.mockClear()
  mockSearchManager.executeSearch.mockResolvedValue([])
}
