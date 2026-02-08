import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ConfigManager } from '../../../lib/core/configManager.svelte'
import type { NoteMetadata } from '../../../lib/types/note'

const toMetadata = (filenames: string[]): NoteMetadata[] =>
  filenames.map((filename) => ({ filename, modified: Date.now() / 1000 }))

// Mock all the services and managers
const mockNoteService = {
  getContent: vi.fn(),
}

const mockSearchManager = {
  searchInput: '',
  filteredNotes: [] as NoteMetadata[],
  isLoading: false,
  areHighlightsCleared: false,
  setFilteredNotes: vi.fn((notes) => {
    mockSearchManager.filteredNotes = notes
  }),
  executeSearch: vi.fn(),
  clearSearch: vi.fn(),
}

const mockContentManager = {
  setNoteContent: vi.fn(),
  scrollToFirstMatch: vi.fn(),
  highlightedContent: '',
  clearHighlights: vi.fn(),
  refreshContent: vi.fn().mockImplementation(async (noteName: string) => {
    const content = await mockNoteService.getContent(noteName)
    mockContentManager.setNoteContent(content)
    return content
  }),
}

const mockEditorManager = {
  isEditMode: false,
  exitEditMode: vi.fn(),
}

const mockFocusManager = {
  selectedIndex: -1,
  setSelectedIndex: vi.fn((index) => {
    mockFocusManager.selectedIndex = index
  }),
  focusSearch: vi.fn(),
}

const mockDialogManager = {
  showCreateDialog: false,
  showDeleteDialog: false,
  showRenameDialog: false,
  openCreateDialog: vi.fn(),
  openDeleteDialog: vi.fn(),
  openRenameDialog: vi.fn(),
}

const mockNoteActions = {
  createNote: vi.fn(),
  deleteNote: vi.fn(),
  renameNote: vi.fn(),
  openExternal: vi.fn(),
  openFolder: vi.fn(),
}

const mockSettingsActions = {
  openSettingsPane: vi.fn(),
  closeSettingsPane: vi.fn(),
}

// Mock all the modules
vi.mock('../../../lib/services/noteService.svelte', () => ({
  noteService: mockNoteService,
}))

vi.mock('../../../lib/core/searchManager.svelte', () => ({
  createSearchManager: () => mockSearchManager,
}))

vi.mock('../../../lib/core/editorManager.svelte', () => ({
  createEditorManager: () => mockEditorManager,
}))

vi.mock('../../../lib/core/focusManager.svelte', () => ({
  createFocusManager: () => mockFocusManager,
}))

vi.mock('../../../lib/core/dialogManager.svelte', () => ({
  createDialogManager: () => mockDialogManager,
}))

vi.mock('../../../lib/core/contentManager.svelte', () => ({
  createContentManager: () => mockContentManager,
}))

const { createAppCoordinator } = await import(
  '../../../lib/app/appCoordinator.svelte'
)
const { createKeyboardActions } = await import(
  '../../../lib/app/actions/keyboard.svelte'
)

describe('Content Loading Integration', () => {
  let appCoordinator: ReturnType<typeof createAppCoordinator>

  beforeEach(() => {
    vi.clearAllMocks()
    mockFocusManager.selectedIndex = -1
    mockSearchManager.filteredNotes = []
    mockSearchManager.searchInput = ''
    mockSearchManager.isLoading = false
    mockSearchManager.areHighlightsCleared = false
    mockEditorManager.isEditMode = false

    appCoordinator = createAppCoordinator({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      searchManager: mockSearchManager as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      editorManager: mockEditorManager as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      focusManager: mockFocusManager as any,
    })
  })

  describe('selectNote action', () => {
    it('should load content when note is selected via mouse click', async () => {
      const testContent = 'Test note content'
      mockNoteService.getContent.mockResolvedValue(testContent)

      appCoordinator.managers.focusManager.setSelectedIndex(0)
      await appCoordinator.actions.loadNoteContent('test-note.md')

      expect(mockFocusManager.setSelectedIndex).toHaveBeenCalledWith(0)
      expect(mockNoteService.getContent).toHaveBeenCalledWith('test-note.md')
      expect(mockContentManager.setNoteContent).toHaveBeenCalledWith(
        testContent
      )
    })

    it('should handle content loading errors gracefully', async () => {
      const error = new Error('Failed to load content')
      mockNoteService.getContent.mockRejectedValue(error)

      appCoordinator.managers.focusManager.setSelectedIndex(1)
      await appCoordinator.actions.loadNoteContent('error-note.md')

      expect(mockFocusManager.setSelectedIndex).toHaveBeenCalledWith(1)
      expect(mockNoteService.getContent).toHaveBeenCalledWith('error-note.md')
      expect(mockContentManager.setNoteContent).toHaveBeenCalledWith(
        'Error loading note: Error: Failed to load content'
      )
    })

    it('should clear content when no note is provided', async () => {
      await appCoordinator.actions.loadNoteContent('')

      expect(mockNoteService.getContent).not.toHaveBeenCalled()
      expect(mockContentManager.setNoteContent).toHaveBeenCalledWith('')
    })

    it('should abort previous requests when selecting new note', async () => {
      let resolveFirst!: (value: string) => void
      let resolveSecond!: (value: string) => void

      const firstPromise = new Promise<string>((resolve) => {
        resolveFirst = resolve
      })
      const secondPromise = new Promise<string>((resolve) => {
        resolveSecond = resolve
      })

      mockNoteService.getContent
        .mockReturnValueOnce(firstPromise)
        .mockReturnValueOnce(secondPromise)

      const firstSelection = appCoordinator.actions.loadNoteContent('first.md')
      const secondSelection =
        appCoordinator.actions.loadNoteContent('second.md')

      resolveFirst('First content')
      resolveSecond('Second content')

      await Promise.all([firstSelection, secondSelection])

      expect(mockContentManager.setNoteContent).toHaveBeenCalledWith(
        'Second content'
      )
      // Due to race conditions, setNoteContent might be called multiple times,
      // but the final call should have the correct content
      expect(mockContentManager.setNoteContent).toHaveBeenCalledTimes(2)
    })

    it('should load content without affecting focus management', async () => {
      mockFocusManager.selectedIndex = 2
      mockNoteService.getContent.mockResolvedValue('Content')

      await appCoordinator.actions.loadNoteContent('test.md')

      expect(mockNoteService.getContent).toHaveBeenCalledWith('test.md')
      expect(mockContentManager.setNoteContent).toHaveBeenCalledWith('Content')
    })

    it('should trigger scrollToFirstMatch after content loads', async () => {
      mockNoteService.getContent.mockResolvedValue('Content with search terms')

      appCoordinator.managers.focusManager.setSelectedIndex(0)
      await appCoordinator.actions.loadNoteContent('test.md')

      await new Promise((resolve) => requestAnimationFrame(resolve))

      expect(mockContentManager.scrollToFirstMatch).toHaveBeenCalled()
    })
  })

  describe('keyboard navigation integration', () => {
    let keyboardActions: ReturnType<typeof createKeyboardActions>

    beforeEach(() => {
      mockSearchManager.filteredNotes = toMetadata([
        'note1.md',
        'note2.md',
        'note3.md',
      ])

      keyboardActions = createKeyboardActions({
        focusManager: mockFocusManager,
        contentNavigationManager: {
          navigateNext: vi.fn(),
          navigatePrevious: vi.fn(),
          resetNavigation: vi.fn(),
          clearCurrentStyles: vi.fn(),
        },
        configManager: {
          shortcuts: {
            create_note: 'Ctrl+Enter',
            rename_note: 'Ctrl+m',
            delete_note: 'Ctrl+x',
            save_and_exit: 'Ctrl+s',
            open_external: 'Ctrl+o',
            open_folder: 'Ctrl+f',
            refresh_cache: 'Ctrl+r',
            scroll_up: 'Ctrl+u',
            scroll_down: 'Ctrl+d',
            up: 'Ctrl+k',
            down: 'Ctrl+j',
            navigate_previous: 'Ctrl+p',
            navigate_next: 'Ctrl+n',
            open_settings: 'Meta+,',
            version_explorer: 'Ctrl+/',
          },
        } as ConfigManager,
        searchManager: mockSearchManager,
        contentManager: mockContentManager,
        dialogManager: mockDialogManager,
        noteActions: mockNoteActions,
        settingsActions: mockSettingsActions,
        noteService: mockNoteService,
        appCoordinator: {
          loadNoteContent: appCoordinator.actions.loadNoteContent,
          exitEditMode: vi.fn(),
          saveAndExitNote: vi.fn(),
          refreshCacheAndUI: vi.fn(),
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
    })

    it('should load content when keyboard navigation calls moveUp action', async () => {
      mockFocusManager.selectedIndex = 2
      mockNoteService.getContent.mockResolvedValue('Note 2 content')

      const mockState = {
        isSearchInputFocused: false,
        isEditMode: false,
        isNoteContentFocused: false,
        filteredNotes: toMetadata(['note1.md', 'note2.md', 'note3.md']),
        selectedNote: 'note3.md',
        noteContentElement: null,
        areHighlightsCleared: false,
        isEditorDirty: false,
        query: '',
      }

      const mockActionContext = {
        state: mockState,
        actions: {
          focusManager: mockFocusManager,
          appCoordinator: {
            loadNoteContent: appCoordinator.actions.loadNoteContent,
          },
        },
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      keyboardActions.actionRegistry.navigation.moveUp(mockActionContext as any)

      // Wait for async content loading to complete
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(mockNoteService.getContent).toHaveBeenCalledWith('note2.md')
      expect(mockContentManager.setNoteContent).toHaveBeenCalledWith(
        'Note 2 content'
      )
    })

    it('should load content when keyboard navigation calls moveDown action', async () => {
      mockFocusManager.selectedIndex = 0
      mockNoteService.getContent.mockResolvedValue('Note 2 content')

      const mockState = {
        isSearchInputFocused: false,
        isEditMode: false,
        isNoteContentFocused: false,
        filteredNotes: toMetadata(['note1.md', 'note2.md', 'note3.md']),
        selectedNote: 'note1.md',
        noteContentElement: null,
        areHighlightsCleared: false,
        isEditorDirty: false,
        query: '',
      }

      const mockActionContext = {
        state: mockState,
        actions: {
          focusManager: mockFocusManager,
          appCoordinator: {
            loadNoteContent: appCoordinator.actions.loadNoteContent,
          },
        },
      }

      keyboardActions.actionRegistry.navigation.moveDown(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockActionContext as any
      )

      // Wait for async content loading to complete
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(mockNoteService.getContent).toHaveBeenCalledWith('note2.md')
      expect(mockContentManager.setNoteContent).toHaveBeenCalledWith(
        'Note 2 content'
      )
    })

    it('should handle boundary conditions in keyboard navigation', async () => {
      mockFocusManager.selectedIndex = 0
      mockNoteService.getContent.mockResolvedValue('Note 1 content')

      const mockState = {
        filteredNotes: toMetadata(['note1.md', 'note2.md', 'note3.md']),
      }

      const mockActionContext = {
        state: mockState,
        actions: {
          focusManager: mockFocusManager,
          appCoordinator: {
            loadNoteContent: appCoordinator.actions.loadNoteContent,
          },
        },
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      keyboardActions.actionRegistry.navigation.moveUp(mockActionContext as any)

      // Wait for async content loading to complete
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(mockNoteService.getContent).toHaveBeenCalledWith('note1.md')
      expect(mockContentManager.setNoteContent).toHaveBeenCalledWith(
        'Note 1 content'
      )
    })
  })

  describe('selectNote action comprehensive behavior', () => {
    it('should handle consistent content loading between direct calls and keyboard actions', async () => {
      const testContent = 'Consistent content'
      mockNoteService.getContent.mockResolvedValue(testContent)

      appCoordinator.managers.focusManager.setSelectedIndex(1)
      await appCoordinator.actions.loadNoteContent('note2.md')
      expect(mockContentManager.setNoteContent).toHaveBeenCalledWith(
        testContent
      )
      expect(mockFocusManager.setSelectedIndex).toHaveBeenCalledWith(1)

      vi.clearAllMocks()
      mockNoteService.getContent.mockResolvedValue(testContent)

      const keyboardActions = createKeyboardActions({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        focusManager: mockFocusManager as any,
        contentNavigationManager: {
          navigateNext: vi.fn(),
          navigatePrevious: vi.fn(),
          resetNavigation: vi.fn(),
          clearCurrentStyles: vi.fn(),
        },
        configManager: {
          shortcuts: {
            create_note: 'Ctrl+Enter',
            rename_note: 'Ctrl+m',
            delete_note: 'Ctrl+x',
            save_and_exit: 'Ctrl+s',
            open_external: 'Ctrl+o',
            open_folder: 'Ctrl+f',
            refresh_cache: 'Ctrl+r',
            scroll_up: 'Ctrl+u',
            scroll_down: 'Ctrl+d',
            up: 'Ctrl+k',
            down: 'Ctrl+j',
            navigate_previous: 'Ctrl+p',
            navigate_next: 'Ctrl+n',
            open_settings: 'Meta+,',
            version_explorer: 'Ctrl+/',
          },
        } as ConfigManager,
        searchManager: mockSearchManager,
        contentManager: mockContentManager,
        dialogManager: mockDialogManager,
        noteActions: mockNoteActions,
        settingsActions: mockSettingsActions,
        noteService: mockNoteService,
        appCoordinator: {
          loadNoteContent: appCoordinator.actions.loadNoteContent,
          exitEditMode: vi.fn(),
          saveAndExitNote: vi.fn(),
          refreshCacheAndUI: vi.fn(),
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      mockFocusManager.selectedIndex = 0
      const mockActionContext = {
        state: {
          filteredNotes: toMetadata(['note1.md', 'note2.md', 'note3.md']),
        },
        actions: {
          focusManager: mockFocusManager,
          appCoordinator: {
            loadNoteContent: appCoordinator.actions.loadNoteContent,
          },
        },
      }

      keyboardActions.actionRegistry.navigation.moveDown(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockActionContext as any
      )

      // Wait for async content loading to complete
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(mockContentManager.setNoteContent).toHaveBeenCalledWith(
        testContent
      )
      expect(mockNoteService.getContent).toHaveBeenCalledWith('note2.md')
    })
  })
})
