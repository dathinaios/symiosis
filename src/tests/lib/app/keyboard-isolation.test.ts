/**
 * Tests for keyboard shortcut isolation when dialogs or settings are open
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createKeyboardActions } from '../../../lib/app/actions/keyboard.svelte'
import type { AppState } from '../../../lib/app/actions/keyboard.svelte'
import type { ConfigManager } from '../../../lib/core/configManager.svelte'
import type { NoteMetadata } from '../../../lib/types/note'

const toMetadata = (filenames: string[]): NoteMetadata[] =>
  filenames.map((filename) => ({ filename, modified: Date.now() / 1000 }))

describe('Keyboard Shortcut Isolation', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockDeps: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let keyboardActions: any

  beforeEach(() => {
    mockDeps = {
      focusManager: {
        selectedIndex: 0,
        setSelectedIndex: vi.fn(),
      },
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
      searchManager: {
        clearSearch: vi.fn(),
      },
      contentManager: {
        clearHighlights: vi.fn(),
      },
      dialogManager: {
        openUnsavedChangesDialog: vi.fn(),
        openDeleteDialog: vi.fn(),
        openCreateDialog: vi.fn(),
        openRenameDialog: vi.fn(),
      },
      noteActions: {
        enterEditMode: vi.fn(),
      },
      settingsActions: {
        openSettingsPane: vi.fn(),
      },
      noteService: {
        openInEditor: vi.fn(),
        openFolder: vi.fn(),
      },
      appCoordinator: {
        loadNoteContent: vi.fn(),
        exitEditMode: vi.fn(),
        saveAndExitNote: vi.fn(),
        refreshCacheAndUI: vi.fn(),
      },
    }

    keyboardActions = createKeyboardActions(mockDeps)
  })

  describe('when settings pane is open', () => {
    it('should not process main UI shortcuts', async () => {
      const baseState: AppState = {
        isSearchInputFocused: false,
        isEditMode: false,
        isNoteContentFocused: false,
        filteredNotes: toMetadata(['note1.md', 'note2.md']),
        selectedNote: 'note1.md',
        noteContentElement: document.createElement('div'),
        hideHighlights: false,
        isEditorDirty: false,
        query: '',
        isSettingsOpen: true, // Settings is open
        isAnyDialogOpen: false,
      }

      const handler = keyboardActions.createKeyboardHandler(() => baseState)

      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' })
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault')

      await handler(event)

      // Should not process the arrow down shortcut
      expect(mockDeps.appCoordinator.loadNoteContent).not.toHaveBeenCalled()
      expect(preventDefaultSpy).not.toHaveBeenCalled()
    })

    it('should not process cmd+, when settings already open', async () => {
      const baseState: AppState = {
        isSearchInputFocused: false,
        isEditMode: false,
        isNoteContentFocused: false,
        filteredNotes: toMetadata(['note1.md']),
        selectedNote: 'note1.md',
        noteContentElement: document.createElement('div'),
        hideHighlights: false,
        isEditorDirty: false,
        query: '',
        isSettingsOpen: true,
        isAnyDialogOpen: false,
      }

      const handler = keyboardActions.createKeyboardHandler(() => baseState)

      const event = new KeyboardEvent('keydown', { key: ',', metaKey: true })
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault')

      await handler(event)

      // Should not call openSettingsPane again
      expect(mockDeps.settingsActions.openSettingsPane).not.toHaveBeenCalled()
      expect(preventDefaultSpy).not.toHaveBeenCalled()
    })
  })

  describe('when any dialog is open', () => {
    it('should not process main UI shortcuts when create dialog is open', async () => {
      const baseState: AppState = {
        isSearchInputFocused: false,
        isEditMode: false,
        isNoteContentFocused: false,
        filteredNotes: toMetadata(['note1.md', 'note2.md']),
        selectedNote: 'note1.md',
        noteContentElement: document.createElement('div'),
        hideHighlights: false,
        isEditorDirty: false,
        query: '',
        isSettingsOpen: false,
        isAnyDialogOpen: true, // Dialog is open
      }

      const handler = keyboardActions.createKeyboardHandler(() => baseState)

      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' })
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault')

      await handler(event)

      // Should not process the arrow down shortcut
      expect(mockDeps.appCoordinator.loadNoteContent).not.toHaveBeenCalled()
      expect(preventDefaultSpy).not.toHaveBeenCalled()
    })

    it('should not process cmd+, when dialog is open', async () => {
      const baseState: AppState = {
        isSearchInputFocused: false,
        isEditMode: false,
        isNoteContentFocused: false,
        filteredNotes: toMetadata(['note1.md']),
        selectedNote: 'note1.md',
        noteContentElement: document.createElement('div'),
        hideHighlights: false,
        isEditorDirty: false,
        query: '',
        isSettingsOpen: false,
        isAnyDialogOpen: true,
      }

      const handler = keyboardActions.createKeyboardHandler(() => baseState)

      const event = new KeyboardEvent('keydown', { key: ',', metaKey: true })
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault')

      await handler(event)

      // Should not call openSettingsPane
      expect(mockDeps.settingsActions.openSettingsPane).not.toHaveBeenCalled()
      expect(preventDefaultSpy).not.toHaveBeenCalled()
    })
  })

  describe('when no dialogs or settings are open', () => {
    it('should process shortcuts normally', async () => {
      const baseState: AppState = {
        isSearchInputFocused: false,
        isEditMode: false,
        isNoteContentFocused: false,
        filteredNotes: toMetadata(['note1.md', 'note2.md']),
        selectedNote: 'note1.md',
        noteContentElement: document.createElement('div'),
        hideHighlights: false,
        isEditorDirty: false,
        query: '',
        isSettingsOpen: false,
        isAnyDialogOpen: false,
      }

      const handler = keyboardActions.createKeyboardHandler(() => baseState)

      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' })
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault')

      await handler(event)

      // Should process the arrow down shortcut
      expect(mockDeps.appCoordinator.loadNoteContent).toHaveBeenCalled()
      expect(preventDefaultSpy).toHaveBeenCalled()
    })

    it('should process cmd+, to open settings', async () => {
      const baseState: AppState = {
        isSearchInputFocused: false,
        isEditMode: false,
        isNoteContentFocused: false,
        filteredNotes: toMetadata(['note1.md']),
        selectedNote: 'note1.md',
        noteContentElement: document.createElement('div'),
        hideHighlights: false,
        isEditorDirty: false,
        query: '',
        isSettingsOpen: false,
        isAnyDialogOpen: false,
      }

      const handler = keyboardActions.createKeyboardHandler(() => baseState)

      const event = new KeyboardEvent('keydown', { key: ',', metaKey: true })
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault')

      await handler(event)

      // Should call openSettingsPane
      expect(mockDeps.settingsActions.openSettingsPane).toHaveBeenCalled()
      expect(preventDefaultSpy).toHaveBeenCalled()
    })
  })
})
