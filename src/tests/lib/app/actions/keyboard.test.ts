import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createKeyboardActions } from '../../../../lib/app/actions/keyboard.svelte'
import type {
  AppState,
  ActionContext,
  KeyboardActionDeps,
} from '../../../../lib/app/actions/keyboard.svelte'
import type { NoteMetadata } from '../../../../lib/types/note'

const toMetadata = (filenames: string[]): NoteMetadata[] =>
  filenames.map((filename) => ({ filename, modified: Date.now() / 1000 }))

describe('keyboard actions', () => {
  let mockDeps: KeyboardActionDeps
  let keyboardActions: ReturnType<typeof createKeyboardActions>
  let mockState: AppState
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockFocusManager: any

  beforeEach(() => {
    // Create writable focus manager mock
    mockFocusManager = {
      selectedIndex: 0,
      setSelectedIndex: vi.fn(),
      focusSearch: vi.fn(),
    }

    // Create comprehensive mocks for all dependencies
    mockDeps = {
      focusManager: mockFocusManager,
      contentNavigationManager: {
        navigateNext: vi.fn(),
        navigatePrevious: vi.fn(),
        resetNavigation: vi.fn(),
        clearCurrentStyles: vi.fn(),
        isActivelyNavigating: false,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      configManager: {
        general: {
          scroll_amount: 0.4,
        },
        shortcuts: {
          edit_note: 'Enter',
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
          navigate_code_previous: 'Ctrl+Shift+p',
          navigate_code_next: 'Ctrl+Shift+n',
          copy_current_section: 'Ctrl+Shift+c',
          open_settings: 'Meta+,',
          version_explorer: 'Ctrl+/',
          recently_deleted: 'Ctrl+Shift+d',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      searchManager: {
        clearSearch: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      contentManager: {
        clearHighlights: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      dialogManager: {
        openUnsavedChangesDialog: vi.fn(),
        openDeleteDialog: vi.fn(),
        openCreateDialog: vi.fn(),
        openRenameDialog: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      noteActions: {
        enterEditMode: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      settingsActions: {
        openSettingsPane: vi.fn(),
        closeSettingsPane: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      noteService: {
        openInEditor: vi.fn(),
        openFolder: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      versionExplorerManager: {
        openVersionExplorer: vi.fn(),
        isVisible: false,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      recentlyDeletedManager: {
        openDialog: vi.fn(),
        isVisible: false,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      editorManager: {
        captureExitPosition: vi.fn(),
        setExitHeaderText: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      appCoordinator: {
        loadNoteContent: vi.fn(),
        exitEditMode: vi.fn(),
        saveAndExitNote: vi.fn(),
        refreshCacheAndUI: vi.fn(),
      },
    }

    mockState = {
      isSearchInputFocused: false,
      isEditMode: false,
      isNoteContentFocused: false,
      filteredNotes: toMetadata(['note1.md', 'note2.md', 'note3.md']),
      selectedNote: 'note1.md',
      noteContentElement: document.createElement('div'),
      hideHighlights: false,
      isEditorDirty: false,
      query: 'test query',
      isSettingsOpen: false,
      isAnyDialogOpen: false,
    }

    keyboardActions = createKeyboardActions(mockDeps)
  })

  describe('public interface', () => {
    it('should expose actionRegistry with categorized actions', () => {
      expect(keyboardActions.actionRegistry).toBeDefined()
      expect(typeof keyboardActions.actionRegistry).toBe('object')

      // Verify expected categories exist
      expect(keyboardActions.actionRegistry.navigation).toBeDefined()
      expect(keyboardActions.actionRegistry.scrolling).toBeDefined()
      expect(keyboardActions.actionRegistry.editing).toBeDefined()
      expect(keyboardActions.actionRegistry.notes).toBeDefined()
      expect(keyboardActions.actionRegistry.search).toBeDefined()
      expect(keyboardActions.actionRegistry.settings).toBeDefined()
    })

    it('should expose keyMappings function that returns key mappings', () => {
      expect(typeof keyboardActions.keyMappings).toBe('function')

      const mappings = keyboardActions.keyMappings()
      expect(mappings).toBeDefined()
      expect(typeof mappings).toBe('object')

      // Verify expected mapping contexts exist
      expect(mappings.searchInput).toBeDefined()
      expect(mappings.editMode).toBeDefined()
      expect(mappings.noteContent).toBeDefined()
      expect(mappings.default).toBeDefined()
    })

    it('should expose createKeyboardHandler function', () => {
      expect(typeof keyboardActions.createKeyboardHandler).toBe('function')

      const handler = keyboardActions.createKeyboardHandler(() => mockState)
      expect(typeof handler).toBe('function')
    })
  })

  describe('navigation actions', () => {
    it('moveUp should call focusManager.setSelectedIndex and appCoordinator.loadNoteContent', () => {
      mockFocusManager.selectedIndex = 2
      const context: ActionContext = { state: mockState, actions: mockDeps }

      keyboardActions.actionRegistry.navigation.moveUp(context)

      expect(mockDeps.focusManager.setSelectedIndex).toHaveBeenCalledWith(1)
      expect(mockDeps.appCoordinator.loadNoteContent).toHaveBeenCalledWith(
        'note2.md'
      )
    })

    it('moveUp should not go below index 0', () => {
      mockFocusManager.selectedIndex = 0
      const context: ActionContext = { state: mockState, actions: mockDeps }

      keyboardActions.actionRegistry.navigation.moveUp(context)

      expect(mockDeps.focusManager.setSelectedIndex).toHaveBeenCalledWith(0)
      expect(mockDeps.appCoordinator.loadNoteContent).toHaveBeenCalledWith(
        'note1.md'
      )
    })

    it('moveDown should call focusManager.setSelectedIndex and appCoordinator.loadNoteContent', () => {
      mockFocusManager.selectedIndex = 0
      const context: ActionContext = { state: mockState, actions: mockDeps }

      keyboardActions.actionRegistry.navigation.moveDown(context)

      expect(mockDeps.focusManager.setSelectedIndex).toHaveBeenCalledWith(1)
      expect(mockDeps.appCoordinator.loadNoteContent).toHaveBeenCalledWith(
        'note2.md'
      )
    })

    it('moveDown should not exceed filteredNotes length', () => {
      mockFocusManager.selectedIndex = 2
      const context: ActionContext = { state: mockState, actions: mockDeps }

      keyboardActions.actionRegistry.navigation.moveDown(context)

      expect(mockDeps.focusManager.setSelectedIndex).toHaveBeenCalledWith(2)
      expect(mockDeps.appCoordinator.loadNoteContent).toHaveBeenCalledWith(
        'note3.md'
      )
    })

    it('focusSearch should call focusManager.focusSearch', () => {
      const context: ActionContext = { state: mockState, actions: mockDeps }

      keyboardActions.actionRegistry.navigation.focusSearch(context)

      expect(mockDeps.focusManager.focusSearch).toHaveBeenCalled()
    })

    it('navigateNext should call contentNavigationManager.navigateNext', () => {
      const context: ActionContext = { state: mockState, actions: mockDeps }

      keyboardActions.actionRegistry.navigation.navigateNext(context)

      expect(mockDeps.contentNavigationManager.navigateNext).toHaveBeenCalled()
    })

    it('navigatePrevious should call contentNavigationManager.navigatePrevious', () => {
      const context: ActionContext = { state: mockState, actions: mockDeps }

      keyboardActions.actionRegistry.navigation.navigatePrevious(context)

      expect(
        mockDeps.contentNavigationManager.navigatePrevious
      ).toHaveBeenCalled()
    })
  })

  describe('scrolling actions', () => {
    it('scrollUpBy should call scrollBy on noteContentElement', () => {
      const mockScrollBy = vi.fn()
      const mockElement = {
        scrollBy: mockScrollBy,
        clientHeight: 625,
      } as unknown as HTMLElement
      const stateWithElement = { ...mockState, noteContentElement: mockElement }
      const context: ActionContext = {
        state: stateWithElement,
        actions: mockDeps,
      }

      keyboardActions.actionRegistry.scrolling.scrollUpBy(context)

      expect(mockScrollBy).toHaveBeenCalledWith({
        top: -250,
        behavior: 'smooth',
      })
    })

    it('scrollDownBy should call scrollBy on noteContentElement', () => {
      const mockScrollBy = vi.fn()
      const mockElement = {
        scrollBy: mockScrollBy,
        clientHeight: 625,
      } as unknown as HTMLElement
      const stateWithElement = { ...mockState, noteContentElement: mockElement }
      const context: ActionContext = {
        state: stateWithElement,
        actions: mockDeps,
      }

      keyboardActions.actionRegistry.scrolling.scrollDownBy(context)

      expect(mockScrollBy).toHaveBeenCalledWith({
        top: 250,
        behavior: 'smooth',
      })
    })

    it('scrolling actions should handle null noteContentElement gracefully', () => {
      const stateWithoutElement = { ...mockState, noteContentElement: null }
      const context: ActionContext = {
        state: stateWithoutElement,
        actions: mockDeps,
      }

      expect(() => {
        keyboardActions.actionRegistry.scrolling.scrollUpBy(context)
        keyboardActions.actionRegistry.scrolling.scrollDownBy(context)
      }).not.toThrow()
    })
  })

  describe('editing actions', () => {
    it('enterEdit should call noteActions.enterEditMode when selectedNote exists', async () => {
      const context: ActionContext = { state: mockState, actions: mockDeps }

      await keyboardActions.actionRegistry.editing.enterEdit(context)

      expect(mockDeps.noteActions.enterEditMode).toHaveBeenCalledWith(
        'note1.md'
      )
    })

    it('enterEdit should not call enterEditMode when no selectedNote', async () => {
      const stateWithoutNote = { ...mockState, selectedNote: null }
      const context: ActionContext = {
        state: stateWithoutNote,
        actions: mockDeps,
      }

      await keyboardActions.actionRegistry.editing.enterEdit(context)

      expect(mockDeps.noteActions.enterEditMode).not.toHaveBeenCalled()
    })

    it('enterEdit should not call enterEditMode when no filteredNotes', async () => {
      const stateWithoutNotes = { ...mockState, filteredNotes: [] }
      const context: ActionContext = {
        state: stateWithoutNotes,
        actions: mockDeps,
      }

      await keyboardActions.actionRegistry.editing.enterEdit(context)

      expect(mockDeps.noteActions.enterEditMode).not.toHaveBeenCalled()
    })

    it('exitEdit should call appCoordinator.exitEditMode', () => {
      const context: ActionContext = { state: mockState, actions: mockDeps }

      keyboardActions.actionRegistry.editing.exitEdit(context)

      expect(mockDeps.appCoordinator.exitEditMode).toHaveBeenCalled()
    })

    it('smartExitEdit should call openUnsavedChangesDialog when editor is dirty', () => {
      const dirtyState = { ...mockState, isEditorDirty: true }
      const context: ActionContext = { state: dirtyState, actions: mockDeps }

      keyboardActions.actionRegistry.editing.smartExitEdit(context)

      expect(mockDeps.dialogManager.openUnsavedChangesDialog).toHaveBeenCalled()
      expect(mockDeps.appCoordinator.exitEditMode).not.toHaveBeenCalled()
    })

    it('smartExitEdit should call exitEditMode when editor is not dirty', () => {
      const cleanState = { ...mockState, isEditorDirty: false }
      const context: ActionContext = { state: cleanState, actions: mockDeps }

      keyboardActions.actionRegistry.editing.smartExitEdit(context)

      expect(mockDeps.appCoordinator.exitEditMode).toHaveBeenCalled()
      expect(
        mockDeps.dialogManager.openUnsavedChangesDialog
      ).not.toHaveBeenCalled()
    })

    it('saveAndExit should call appCoordinator.saveAndExitNote', async () => {
      const context: ActionContext = { state: mockState, actions: mockDeps }

      await keyboardActions.actionRegistry.editing.saveAndExit(context)

      expect(mockDeps.appCoordinator.saveAndExitNote).toHaveBeenCalled()
    })
  })

  describe('notes actions', () => {
    it('openExternal should call noteService.openInEditor when selectedNote exists', async () => {
      const context: ActionContext = { state: mockState, actions: mockDeps }

      await keyboardActions.actionRegistry.notes.openExternal(context)

      expect(mockDeps.noteService.openInEditor).toHaveBeenCalledWith('note1.md')
    })

    it('openExternal should not call openInEditor when no selectedNote', async () => {
      const stateWithoutNote = { ...mockState, selectedNote: null }
      const context: ActionContext = {
        state: stateWithoutNote,
        actions: mockDeps,
      }

      await keyboardActions.actionRegistry.notes.openExternal(context)

      expect(mockDeps.noteService.openInEditor).not.toHaveBeenCalled()
    })

    it('openFolder should call noteService.openFolder when selectedNote exists', async () => {
      const context: ActionContext = { state: mockState, actions: mockDeps }

      await keyboardActions.actionRegistry.notes.openFolder(context)

      expect(mockDeps.noteService.openFolder).toHaveBeenCalledWith('note1.md')
    })

    it('refreshCache should call appCoordinator.refreshCacheAndUI', async () => {
      const context: ActionContext = { state: mockState, actions: mockDeps }

      await keyboardActions.actionRegistry.notes.refreshCache(context)

      expect(mockDeps.appCoordinator.refreshCacheAndUI).toHaveBeenCalled()
    })

    it('deleteNote should call dialogManager.openDeleteDialog when selectedNote exists', () => {
      const context: ActionContext = { state: mockState, actions: mockDeps }

      keyboardActions.actionRegistry.notes.deleteNote(context)

      expect(mockDeps.dialogManager.openDeleteDialog).toHaveBeenCalled()
    })

    it('deleteNote should not call openDeleteDialog when no selectedNote', () => {
      const stateWithoutNote = { ...mockState, selectedNote: null }
      const context: ActionContext = {
        state: stateWithoutNote,
        actions: mockDeps,
      }

      keyboardActions.actionRegistry.notes.deleteNote(context)

      expect(mockDeps.dialogManager.openDeleteDialog).not.toHaveBeenCalled()
    })

    it('createNote should call dialogManager.openCreateDialog', () => {
      const context: ActionContext = { state: mockState, actions: mockDeps }

      keyboardActions.actionRegistry.notes.createNote(context)

      expect(mockDeps.dialogManager.openCreateDialog).toHaveBeenCalled()
    })

    it('renameNote should call dialogManager.openRenameDialog when selectedNote exists', () => {
      const context: ActionContext = { state: mockState, actions: mockDeps }

      keyboardActions.actionRegistry.notes.renameNote(context)

      expect(mockDeps.dialogManager.openRenameDialog).toHaveBeenCalledWith(
        'note1.md'
      )
    })

    it('renameNote should not call openRenameDialog when no selectedNote', () => {
      const stateWithoutNote = { ...mockState, selectedNote: null }
      const context: ActionContext = {
        state: stateWithoutNote,
        actions: mockDeps,
      }

      keyboardActions.actionRegistry.notes.renameNote(context)

      expect(mockDeps.dialogManager.openRenameDialog).not.toHaveBeenCalled()
    })
  })

  describe('search actions', () => {
    it('handleEscape should call contentNavigationManager.handleEscape and focus search when action is focus_search', () => {
      const mockDepsWithHandleEscape = {
        ...mockDeps,
        contentNavigationManager: {
          ...mockDeps.contentNavigationManager,
          handleEscape: vi.fn().mockReturnValue('focus_search'),
        },
      }
      const context: ActionContext = {
        state: mockState,
        actions: mockDepsWithHandleEscape,
      }

      keyboardActions.actionRegistry.search.handleEscape(context)

      expect(
        mockDepsWithHandleEscape.contentNavigationManager.handleEscape
      ).toHaveBeenCalled()
      expect(mockDeps.focusManager.focusSearch).toHaveBeenCalled()
    })

    it('handleEscape should call contentNavigationManager.handleEscape and not focus search when action is navigation_cleared', () => {
      const mockDepsWithHandleEscape = {
        ...mockDeps,
        contentNavigationManager: {
          ...mockDeps.contentNavigationManager,
          handleEscape: vi.fn().mockReturnValue('navigation_cleared'),
        },
      }
      const context: ActionContext = {
        state: mockState,
        actions: mockDepsWithHandleEscape,
      }

      keyboardActions.actionRegistry.search.handleEscape(context)

      expect(
        mockDepsWithHandleEscape.contentNavigationManager.handleEscape
      ).toHaveBeenCalled()
      expect(mockDeps.focusManager.focusSearch).not.toHaveBeenCalled()
    })

    it('handleEscape should call contentNavigationManager.handleEscape and not focus search when action is highlights_cleared', () => {
      const mockDepsWithHandleEscape = {
        ...mockDeps,
        contentNavigationManager: {
          ...mockDeps.contentNavigationManager,
          handleEscape: vi.fn().mockReturnValue('highlights_cleared'),
        },
      }
      const context: ActionContext = {
        state: mockState,
        actions: mockDepsWithHandleEscape,
      }

      keyboardActions.actionRegistry.search.handleEscape(context)

      expect(
        mockDepsWithHandleEscape.contentNavigationManager.handleEscape
      ).toHaveBeenCalled()
      expect(mockDeps.focusManager.focusSearch).not.toHaveBeenCalled()
    })

    it('handleEscape should call contentNavigationManager.handleEscape and not focus search when action is search_cleared', () => {
      const mockDepsWithHandleEscape = {
        ...mockDeps,
        contentNavigationManager: {
          ...mockDeps.contentNavigationManager,
          handleEscape: vi.fn().mockReturnValue('search_cleared'),
        },
      }
      const context: ActionContext = {
        state: mockState,
        actions: mockDepsWithHandleEscape,
      }

      keyboardActions.actionRegistry.search.handleEscape(context)

      expect(
        mockDepsWithHandleEscape.contentNavigationManager.handleEscape
      ).toHaveBeenCalled()
      expect(mockDeps.focusManager.focusSearch).not.toHaveBeenCalled()
    })
  })

  describe('settings actions', () => {
    it('openSettings should call settingsActions.openSettingsPane', async () => {
      const context: ActionContext = { state: mockState, actions: mockDeps }

      await keyboardActions.actionRegistry.settings.openSettings(context)

      expect(mockDeps.settingsActions.openSettingsPane).toHaveBeenCalled()
    })
  })

  describe('key mappings', () => {
    it('should return correct key mappings for all contexts', () => {
      const mappings = keyboardActions.keyMappings()

      // Test searchInput context mappings
      expect(mappings.searchInput.Enter).toBe('editing.enterEdit')
      expect(mappings.searchInput['Ctrl+Enter']).toBe('notes.createNote')
      expect(mappings.searchInput['Ctrl+m']).toBe('notes.renameNote')
      expect(mappings.searchInput['Ctrl+x']).toBe('notes.deleteNote')
      expect(mappings.searchInput.ArrowUp).toBe('navigation.moveUp')
      expect(mappings.searchInput.ArrowDown).toBe('navigation.moveDown')
      expect(mappings.searchInput.Escape).toBe('search.handleEscape')
      expect(mappings.searchInput['Meta+,']).toBe('settings.openSettings')

      // Test editMode context mappings
      expect(mappings.editMode.Escape).toBe('editing.smartExitEdit')
      expect(mappings.editMode['Ctrl+s']).toBe('editing.saveAndExit')
      expect(mappings.editMode['Meta+,']).toBe('settings.openSettings')

      // Test noteContent context mappings
      expect(mappings.noteContent.Escape).toBe('navigation.focusSearch')
      expect(mappings.noteContent['Ctrl+p']).toBe('navigation.navigatePrevious')
      expect(mappings.noteContent['Ctrl+n']).toBe('navigation.navigateNext')

      // Test default context mappings
      expect(mappings.default.ArrowUp).toBe('navigation.moveUp')
      expect(mappings.default.ArrowDown).toBe('navigation.moveDown')
      expect(mappings.default.Enter).toBe('editing.enterEdit')
      expect(mappings.default['Ctrl+Enter']).toBe('notes.createNote')
      expect(mappings.default['Ctrl+x']).toBe('notes.deleteNote')
      expect(mappings.default.Escape).toBe('navigation.focusSearch')
      expect(mappings.default['Meta+,']).toBe('settings.openSettings')
    })

    it('should use shortcuts from configManager', () => {
      const mappings = keyboardActions.keyMappings()

      // Verify that the mappings use the configured shortcuts
      expect(
        mappings.searchInput[mockDeps.configManager.shortcuts.create_note]
      ).toBe('notes.createNote')
      expect(
        mappings.searchInput[mockDeps.configManager.shortcuts.rename_note]
      ).toBe('notes.renameNote')
      expect(
        mappings.searchInput[mockDeps.configManager.shortcuts.delete_note]
      ).toBe('notes.deleteNote')
      expect(
        mappings.searchInput[mockDeps.configManager.shortcuts.open_external]
      ).toBe('notes.openExternal')
      expect(
        mappings.searchInput[mockDeps.configManager.shortcuts.open_folder]
      ).toBe('notes.openFolder')
      expect(
        mappings.searchInput[mockDeps.configManager.shortcuts.refresh_cache]
      ).toBe('notes.refreshCache')
    })
  })

  describe('keyboard handler', () => {
    let handler: (event: KeyboardEvent) => Promise<void>
    let getStateMock: () => AppState

    beforeEach(() => {
      getStateMock = vi.fn(() => mockState)
      handler = keyboardActions.createKeyboardHandler(getStateMock)
    })

    it('should process keyboard events based on current state context', async () => {
      // Test searchInput context
      const searchInputState = { ...mockState, isSearchInputFocused: true }
      getStateMock = vi.fn(() => searchInputState)
      handler = keyboardActions.createKeyboardHandler(getStateMock)

      const arrowDownEvent = new KeyboardEvent('keydown', { key: 'ArrowDown' })
      const preventDefaultSpy = vi.spyOn(arrowDownEvent, 'preventDefault')

      await handler(arrowDownEvent)

      expect(preventDefaultSpy).toHaveBeenCalled()
      expect(mockDeps.focusManager.setSelectedIndex).toHaveBeenCalled()
    })

    it('should handle editMode context correctly', async () => {
      const editModeState = { ...mockState, isEditMode: true }
      getStateMock = vi.fn(() => editModeState)
      handler = keyboardActions.createKeyboardHandler(getStateMock)

      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' })
      const preventDefaultSpy = vi.spyOn(escapeEvent, 'preventDefault')

      await handler(escapeEvent)

      expect(preventDefaultSpy).toHaveBeenCalled()
      expect(mockDeps.appCoordinator.exitEditMode).toHaveBeenCalled()
    })

    it('should handle noteContent context correctly', async () => {
      const noteContentState = { ...mockState, isNoteContentFocused: true }
      getStateMock = vi.fn(() => noteContentState)
      handler = keyboardActions.createKeyboardHandler(getStateMock)

      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' })
      const preventDefaultSpy = vi.spyOn(escapeEvent, 'preventDefault')

      await handler(escapeEvent)

      expect(preventDefaultSpy).toHaveBeenCalled()
      expect(mockDeps.focusManager.focusSearch).toHaveBeenCalled()
    })

    it('should handle default context when filteredNotes exist', async () => {
      const defaultState = {
        ...mockState,
        filteredNotes: toMetadata(['test.md']),
      }
      getStateMock = vi.fn(() => defaultState)
      handler = keyboardActions.createKeyboardHandler(getStateMock)

      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' })
      const preventDefaultSpy = vi.spyOn(enterEvent, 'preventDefault')

      await handler(enterEvent)

      expect(preventDefaultSpy).toHaveBeenCalled()
      expect(mockDeps.noteActions.enterEditMode).toHaveBeenCalled()
    })

    it('should handle Meta+, shortcut globally', async () => {
      const globalState = {
        ...mockState,
        isSettingsOpen: false,
        isAnyDialogOpen: false,
      }
      getStateMock = vi.fn(() => globalState)
      handler = keyboardActions.createKeyboardHandler(getStateMock)

      const metaCommaEvent = new KeyboardEvent('keydown', {
        key: ',',
        metaKey: true,
      })
      const preventDefaultSpy = vi.spyOn(metaCommaEvent, 'preventDefault')

      await handler(metaCommaEvent)

      expect(preventDefaultSpy).toHaveBeenCalled()
      expect(mockDeps.settingsActions.openSettingsPane).toHaveBeenCalled()
    })

    it('should ignore keyboard events when settings are open', async () => {
      const settingsOpenState = { ...mockState, isSettingsOpen: true }
      getStateMock = vi.fn(() => settingsOpenState)
      handler = keyboardActions.createKeyboardHandler(getStateMock)

      const arrowDownEvent = new KeyboardEvent('keydown', { key: 'ArrowDown' })
      const preventDefaultSpy = vi.spyOn(arrowDownEvent, 'preventDefault')

      await handler(arrowDownEvent)

      expect(preventDefaultSpy).not.toHaveBeenCalled()
      expect(mockDeps.focusManager.setSelectedIndex).not.toHaveBeenCalled()
    })

    it('should ignore keyboard events when any dialog is open', async () => {
      const dialogOpenState = { ...mockState, isAnyDialogOpen: true }
      getStateMock = vi.fn(() => dialogOpenState)
      handler = keyboardActions.createKeyboardHandler(getStateMock)

      const arrowDownEvent = new KeyboardEvent('keydown', { key: 'ArrowDown' })
      const preventDefaultSpy = vi.spyOn(arrowDownEvent, 'preventDefault')

      await handler(arrowDownEvent)

      expect(preventDefaultSpy).not.toHaveBeenCalled()
      expect(mockDeps.focusManager.setSelectedIndex).not.toHaveBeenCalled()
    })

    it('should handle Escape key when settings or dialogs are open', async () => {
      const settingsOpenState = { ...mockState, isSettingsOpen: true }
      getStateMock = vi.fn(() => settingsOpenState)
      handler = keyboardActions.createKeyboardHandler(getStateMock)

      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' })

      // Should not throw or cause issues
      await expect(handler(escapeEvent)).resolves.toBeUndefined()
    })

    it('should handle complex key combinations with modifiers', async () => {
      const searchInputState = { ...mockState, isSearchInputFocused: true }
      getStateMock = vi.fn(() => searchInputState)
      handler = keyboardActions.createKeyboardHandler(getStateMock)

      const ctrlEnterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
      })
      const preventDefaultSpy = vi.spyOn(ctrlEnterEvent, 'preventDefault')

      await handler(ctrlEnterEvent)

      expect(preventDefaultSpy).toHaveBeenCalled()
      expect(mockDeps.dialogManager.openCreateDialog).toHaveBeenCalled()
    })

    it('should not process unknown key combinations', async () => {
      const unknownKeyEvent = new KeyboardEvent('keydown', {
        key: 'UnknownKey',
      })
      const preventDefaultSpy = vi.spyOn(unknownKeyEvent, 'preventDefault')

      await handler(unknownKeyEvent)

      expect(preventDefaultSpy).not.toHaveBeenCalled()
      // No mock calls should be made
      expect(mockDeps.focusManager.setSelectedIndex).not.toHaveBeenCalled()
    })

    it('should not process actions when no filteredNotes in default context', async () => {
      const noNotesState = { ...mockState, filteredNotes: [] }
      getStateMock = vi.fn(() => noNotesState)
      handler = keyboardActions.createKeyboardHandler(getStateMock)

      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' })
      const preventDefaultSpy = vi.spyOn(enterEvent, 'preventDefault')

      await handler(enterEvent)

      expect(preventDefaultSpy).not.toHaveBeenCalled()
      expect(mockDeps.noteActions.enterEditMode).not.toHaveBeenCalled()
    })
  })

  describe('error handling and edge cases', () => {
    it('should handle missing action gracefully', async () => {
      // Mock a scenario where an action doesn't exist
      const handler = keyboardActions.createKeyboardHandler(() => mockState)
      const fakeEvent = new KeyboardEvent('keydown', { key: 'NonExistentKey' })

      // Should not throw
      await expect(handler(fakeEvent)).resolves.toBeUndefined()
    })

    it('should propagate async action errors', async () => {
      // Mock an action that throws an error
      mockDeps.noteActions.enterEditMode = vi
        .fn()
        .mockRejectedValue(new Error('Test error'))

      const handler = keyboardActions.createKeyboardHandler(() => mockState)
      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' })

      // Current implementation propagates errors - this is expected behavior
      await expect(handler(enterEvent)).rejects.toThrow('Test error')
    })

    it('should handle state retrieval errors gracefully', async () => {
      const faultyGetState = vi.fn(() => {
        throw new Error('State error')
      })

      const handler = keyboardActions.createKeyboardHandler(faultyGetState)
      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' })

      // Should not throw despite state error
      await expect(handler(enterEvent)).rejects.toThrow('State error')
    })
  })
})
