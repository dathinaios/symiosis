/**
 * App Coordinator Integration Tests
 * Runs commands through a *real* coordinator with the managers mocked, which
 * is the only place the wiring itself is under test: that `getSelectedNote` is
 * bound to the coordinator's derived selection, that commands reach the
 * services, and that a failing operation leaves the UI untouched.
 *
 * The command bodies are covered in isolation by `commands.test.ts`; this file
 * deliberately stays thin and only asserts things that would break if the
 * coordinator wired something to the wrong object.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NoteMetadata } from '../../../lib/types/note'

const FIXED_MODIFIED = 1_700_000_000

const toMetadata = (filenames: string[]): NoteMetadata[] =>
  filenames.map((filename) => ({ filename, modified: FIXED_MODIFIED }))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}))

const mockSearchManager = {
  setSearchCompleteCallback: vi.fn(),
  executeSearch: vi.fn(),
  setSearchInput: vi.fn(),
  setFilteredNotes: vi.fn(),
  searchInput: '',
  filteredNotes: toMetadata(['existing-note.md']),
  isLoading: false,
  clearSearch: vi.fn(),
  clearHighlights: vi.fn(),
  setHighlightsClearCallback: vi.fn(),
}

const mockDialogManager = {
  showCreateDialog: false,
  showDeleteDialog: false,
  showRenameDialog: false,
  showUnsavedChangesDialog: false,
  newNoteName: '',
  newNoteNameForRename: '',
  openCreateDialog: vi.fn(),
  closeCreateDialog: vi.fn(),
  openDeleteDialog: vi.fn(),
  closeDeleteDialog: vi.fn(),
  openRenameDialog: vi.fn(),
  closeRenameDialog: vi.fn(),
  openUnsavedChangesDialog: vi.fn(),
  handleDeleteKeyPress: vi.fn(),
}

const mockNoteService = {
  create: vi.fn(),
  delete: vi.fn(),
  rename: vi.fn(),
  openInEditor: vi.fn(),
  openFolder: vi.fn(),
}

const mockConfigService = {
  save: vi.fn(),
  openPane: vi.fn(),
  closePane: vi.fn(),
  isVisible: false,
  content: '',
  updateContent: vi.fn(),
}

const mockFocusManager = {
  focusSearch: vi.fn(),
  scrollToSelected: vi.fn(),
  selectedIndex: -1,
  setSelectedIndex: vi.fn((index: number) => {
    mockFocusManager.selectedIndex = index
  }),
  searchElement: null,
  setSearchElement: vi.fn(),
}

const mockEditorManager = {
  exitEditMode: vi.fn(() => ''),
  enterEditMode: vi.fn(),
  isDirty: false,
}

const mockContentManager = {
  setNoteContent: vi.fn(),
  scrollToFirstMatch: vi.fn(),
  noteContent: '<p>rendered</p>',
  refreshAfterSave: vi.fn(),
  refreshContent: vi.fn(),
}

vi.mock('../../../lib/core/searchManager.svelte', () => ({
  searchManager: mockSearchManager,
  createSearchManager: vi.fn(() => mockSearchManager),
}))

vi.mock('../../../lib/core/dialogManager.svelte', () => ({
  dialogManager: mockDialogManager,
  createDialogManager: vi.fn(() => mockDialogManager),
}))

vi.mock('../../../lib/services/noteService.svelte', () => ({
  noteService: mockNoteService,
}))

vi.mock('../../../lib/services/configService.svelte', () => ({
  configService: mockConfigService,
}))

vi.mock('../../../lib/core/focusManager.svelte', () => ({
  focusManager: mockFocusManager,
  createFocusManager: vi.fn(() => mockFocusManager),
}))

vi.mock('../../../lib/core/editorManager.svelte', () => ({
  editorManager: mockEditorManager,
  createEditorManager: vi.fn(() => mockEditorManager),
}))

vi.mock('../../../lib/core/contentManager.svelte', () => ({
  contentManager: mockContentManager,
  createContentManager: vi.fn(() => mockContentManager),
}))

vi.mock('../../../lib/utils/contentHighlighting.svelte', () => ({
  getHighlightedContent: vi.fn(() => 'mocked highlighted content'),
  clearHighlightCache: vi.fn(),
}))

describe('appCoordinator integration', () => {
  let appCoordinator: import('../../../lib/app/appCoordinator.svelte').AppCoordinator

  beforeEach(async () => {
    vi.clearAllMocks()

    mockDialogManager.newNoteName = ''
    mockDialogManager.newNoteNameForRename = ''
    mockSearchManager.searchInput = ''
    mockSearchManager.filteredNotes = toMetadata(['existing-note.md'])
    mockFocusManager.selectedIndex = -1
    mockContentManager.refreshAfterSave.mockResolvedValue({
      searchResults: [],
      content: '',
    })
    mockContentManager.refreshContent.mockResolvedValue('content')

    const { createAppCoordinator } = await import(
      '../../../lib/app/appCoordinator.svelte'
    )
    appCoordinator = createAppCoordinator({})
  })

  describe('selection wiring', () => {
    // `getSelectedNote` is a closure the coordinator hands to the commands.
    // If it were bound to a snapshot rather than the derived value, these
    // would go stale.
    it('passes the current selection to a note operation', async () => {
      mockNoteService.delete.mockResolvedValue({ success: true })
      mockSearchManager.executeSearch.mockResolvedValue([])
      mockFocusManager.setSelectedIndex(0)

      await appCoordinator.commands.deleteNote()

      expect(mockNoteService.delete).toHaveBeenCalledWith('existing-note.md')
    })

    it('follows the selection when the index moves', async () => {
      mockSearchManager.filteredNotes = toMetadata(['a.md', 'b.md'])
      mockFocusManager.setSelectedIndex(1)
      mockNoteService.openInEditor.mockResolvedValue(undefined)

      await appCoordinator.commands.openNoteExternally()

      expect(mockNoteService.openInEditor).toHaveBeenCalledWith('b.md')
    })

    it('declines a note operation when nothing is selected', async () => {
      mockSearchManager.filteredNotes = []
      expect(appCoordinator.selectedNote).toBe(null)

      await appCoordinator.commands.deleteNote()
      mockDialogManager.newNoteNameForRename = 'Valid Name'
      await appCoordinator.commands.renameNote()

      expect(mockNoteService.delete).not.toHaveBeenCalled()
      expect(mockNoteService.rename).not.toHaveBeenCalled()
    })
  })

  describe('note creation', () => {
    it('creates, refreshes, closes the dialog and opens the editor', async () => {
      const created = 'My New Note.md'
      mockNoteService.create.mockResolvedValue({
        success: true,
        noteName: created,
      })
      mockSearchManager.executeSearch.mockResolvedValue([])
      mockSearchManager.filteredNotes = toMetadata([
        'existing-note.md',
        created,
      ])
      mockDialogManager.newNoteName = 'My New Note'

      await appCoordinator.commands.createNote()

      expect(mockNoteService.create).toHaveBeenCalledWith('My New Note')
      expect(mockSearchManager.executeSearch).toHaveBeenCalledWith('')
      expect(mockDialogManager.closeCreateDialog).toHaveBeenCalled()
      expect(mockFocusManager.focusSearch).toHaveBeenCalled()
      expect(mockFocusManager.selectedIndex).toBe(1)
      expect(mockEditorManager.enterEditMode).toHaveBeenCalledWith(
        created,
        '<p>rendered</p>'
      )
    })

    it('leaves the UI untouched when creation fails', async () => {
      mockNoteService.create.mockResolvedValue({
        success: false,
        error: 'Creation failed',
      })
      mockDialogManager.newNoteName = 'Failed Note'

      await appCoordinator.commands.createNote()

      expect(mockNoteService.create).toHaveBeenCalledWith('Failed Note')
      expect(mockSearchManager.executeSearch).not.toHaveBeenCalled()
      expect(mockDialogManager.closeCreateDialog).not.toHaveBeenCalled()
      expect(mockFocusManager.focusSearch).not.toHaveBeenCalled()
    })
  })

  describe('note rename', () => {
    it('renames the selection and re-runs the current search', async () => {
      mockFocusManager.setSelectedIndex(0)
      mockSearchManager.searchInput = 'existing'
      mockNoteService.rename.mockResolvedValue({
        success: true,
        newName: 'Renamed Note.md',
      })
      mockSearchManager.executeSearch.mockResolvedValue([])

      mockDialogManager.newNoteNameForRename = 'Renamed Note'
      await appCoordinator.commands.renameNote()

      expect(mockNoteService.rename).toHaveBeenCalledWith(
        'existing-note.md',
        'Renamed Note'
      )
      expect(mockSearchManager.executeSearch).toHaveBeenCalledWith('existing')
      expect(mockDialogManager.closeRenameDialog).toHaveBeenCalled()
    })

    it('leaves the dialog open when the rename fails', async () => {
      mockFocusManager.setSelectedIndex(0)
      mockNoteService.rename.mockResolvedValue({
        success: false,
        error: 'Rename failed',
      })

      mockDialogManager.newNoteNameForRename = 'Failed Rename'
      await appCoordinator.commands.renameNote()

      expect(mockSearchManager.executeSearch).not.toHaveBeenCalled()
      expect(mockDialogManager.closeRenameDialog).not.toHaveBeenCalled()
    })
  })

  describe('keyboard reaches the same commands', () => {
    // The point of one command surface: a key and a button run the same code.
    // These use the keys the default keymap hardcodes, so they hold without a
    // loaded config (every shortcut is '' until `configManager.initialize()`).
    it('runs enterEditMode on Enter, against the current selection', async () => {
      mockFocusManager.setSelectedIndex(0)

      await appCoordinator.keyboardActions(
        new KeyboardEvent('keydown', { key: 'Enter' })
      )

      expect(mockEditorManager.enterEditMode).toHaveBeenCalledWith(
        'existing-note.md',
        '<p>rendered</p>'
      )
    })

    it('runs focusSearch on Escape', async () => {
      await appCoordinator.keyboardActions(
        new KeyboardEvent('keydown', { key: 'Escape' })
      )

      expect(mockFocusManager.focusSearch).toHaveBeenCalled()
    })

    it('declines every key while a dialog is open', async () => {
      mockDialogManager.showCreateDialog = true
      mockFocusManager.setSelectedIndex(0)

      await appCoordinator.keyboardActions(
        new KeyboardEvent('keydown', { key: 'Enter' })
      )

      expect(mockEditorManager.enterEditMode).not.toHaveBeenCalled()
      mockDialogManager.showCreateDialog = false
    })
  })

  describe('content loading chain', () => {
    // Moving through the list must reach the real contentLoadingManager the
    // coordinator built, not just call a stub. This is the one assembled path
    // no isolated unit test can see.
    it('loads the newly selected note when moving down the list', async () => {
      mockSearchManager.filteredNotes = toMetadata(['note1.md', 'note2.md'])
      mockFocusManager.setSelectedIndex(0)
      mockContentManager.refreshContent.mockResolvedValue('Note 2 content')

      appCoordinator.commands.moveDown()
      await vi.waitFor(() =>
        expect(mockContentManager.refreshContent).toHaveBeenCalledWith(
          'note2.md'
        )
      )

      expect(mockFocusManager.selectedIndex).toBe(1)
    })

    it('reports a load failure as note content', async () => {
      mockSearchManager.filteredNotes = toMetadata(['note1.md'])
      mockContentManager.refreshContent.mockRejectedValue(
        new Error('Failed to load content')
      )

      await appCoordinator.commands.loadNoteContent('note1.md')

      expect(mockContentManager.setNoteContent).toHaveBeenCalledWith(
        'Error loading note: Error: Failed to load content'
      )
    })
  })
})
