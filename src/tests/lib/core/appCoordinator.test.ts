import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockInvoke, resetAllMocks } from '../../test-utils'
import type { NoteMetadata } from '../../../lib/types/note'

const toMetadata = (filenames: string[]): NoteMetadata[] =>
  filenames.map((filename) => ({ filename, modified: Date.now() / 1000 }))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}))

vi.mock('svelte', () => ({
  tick: vi.fn(() => Promise.resolve()),
}))

vi.mock('../../../lib/app/effects/app.svelte', () => ({
  setupAppEffects: vi.fn(() => vi.fn()), // Returns a mock cleanup function
}))

const mockNoteService = {
  getRawContent: vi.fn(),
  save: vi.fn(),
  search: vi.fn(),
  initializeDatabase: vi.fn(),
}

vi.mock('../../../lib/services/noteService.svelte', () => ({
  noteService: mockNoteService,
}))

const mockConfigService = {
  exists: vi.fn(),
}

vi.mock('../../../lib/services/configService.svelte', () => ({
  configService: mockConfigService,
}))

const { createAppCoordinator } = await import(
  '../../../lib/app/appCoordinator.svelte'
)
const appCoordinator = createAppCoordinator({})

describe('appCoordinator', () => {
  beforeEach(() => {
    resetAllMocks()
    // Reset mock services
    vi.clearAllMocks()
    mockNoteService.getRawContent.mockReset()
    mockNoteService.save.mockReset()
    mockNoteService.search.mockReset()
    mockNoteService.initializeDatabase.mockReset()
    mockConfigService.exists.mockReset()

    // Reset the appCoordinator state between tests using new pattern
    appCoordinator.managers.searchManager.searchInput = ''
    appCoordinator.managers.focusManager.setSelectedIndex(-1)
    appCoordinator.managers.searchManager.setFilteredNotes([])
    // areHighlightsCleared moved to contentNavigationManager
  })

  describe('state management', () => {
    it('should provide reactive getters for central state', () => {
      expect(appCoordinator.query).toBe('')
      expect(appCoordinator.isLoading).toBe(false)
      // areHighlightsCleared moved to contentNavigationManager
      expect(appCoordinator.filteredNotes).toEqual([])
      expect(appCoordinator.selectedNote).toBe(null)
      expect(appCoordinator.managers.focusManager.selectedIndex).toBe(-1)
    })

    it('should update selectedIndex state', () => {
      appCoordinator.managers.focusManager.setSelectedIndex(3)
      expect(appCoordinator.managers.focusManager.selectedIndex).toBe(3)
    })

    it('should handle loadNoteContent correctly', async () => {
      appCoordinator.managers.focusManager.setSelectedIndex(2)
      await appCoordinator.actions.loadNoteContent('note1.md')
      expect(appCoordinator.managers.focusManager.selectedIndex).toBe(2)
    })

    it('should not update selectedIndex if it is the same', async () => {
      appCoordinator.managers.focusManager.setSelectedIndex(5)
      await appCoordinator.actions.loadNoteContent('note.md')
      expect(appCoordinator.managers.focusManager.selectedIndex).toBe(5)
    })

    it('should auto-select first note when notes are loaded', () => {
      // Reset state to ensure clean start using new pattern
      appCoordinator.managers.searchManager.searchInput = ''
      appCoordinator.managers.focusManager.setSelectedIndex(-1)
      appCoordinator.managers.searchManager.setFilteredNotes([])
      // areHighlightsCleared moved to contentNavigationManager
      expect(appCoordinator.selectedNote).toBe(null)
      expect(appCoordinator.managers.focusManager.selectedIndex).toBe(-1)

      // Simulate notes being loaded via searchManager
      appCoordinator.managers.searchManager.setFilteredNotes([
        { filename: 'note1.md', modified: Date.now() / 1000 },
        { filename: 'note2.md', modified: Date.now() / 1000 },
        { filename: 'note3.md', modified: Date.now() / 1000 },
      ])

      // The derived selectedNote should return the first note
      expect(appCoordinator.selectedNote).toBe('note1.md')
      expect(typeof appCoordinator.selectedNote).toBe('string')

      // selectedIndex might not auto-update since effects aren't running in test
      // But the derived selectedNote should still work correctly
    })

    it('should handle selectedNote properly when no notes available', () => {
      // Reset state using new pattern
      appCoordinator.managers.searchManager.searchInput = ''
      appCoordinator.managers.focusManager.setSelectedIndex(-1)
      appCoordinator.managers.searchManager.setFilteredNotes([])
      // areHighlightsCleared moved to contentNavigationManager

      // Ensure no notes
      appCoordinator.managers.searchManager.setFilteredNotes([])

      // selectedNote should be null (not a function)
      expect(appCoordinator.selectedNote).toBe(null)
      expect(typeof appCoordinator.selectedNote).not.toBe('function')
      expect(appCoordinator.managers.focusManager.selectedIndex).toBe(-1)
    })

    it('should reset selection when notes become empty', () => {
      // Start with notes
      appCoordinator.managers.searchManager.setFilteredNotes([
        { filename: 'note1.md', modified: Date.now() / 1000 },
        { filename: 'note2.md', modified: Date.now() / 1000 },
      ])
      appCoordinator.managers.focusManager.setSelectedIndex(1)
      expect(appCoordinator.selectedNote).toBe('note2.md')

      // Clear notes
      appCoordinator.managers.searchManager.setFilteredNotes([])

      // Should reset selection (selectedNote should be null with empty notes)
      expect(appCoordinator.selectedNote).toBe(null)
      // selectedIndex won't auto-reset without effects running, but that's ok for this test
    })
  })

  describe('keyboard handler integration', () => {
    it('should provide keyboardActions handler', () => {
      const keyboardActions = appCoordinator.keyboardActions

      expect(typeof keyboardActions).toBe('function')
      expect(keyboardActions.length).toBe(1) // Should accept KeyboardEvent parameter
    })

    it('should provide keyboardActions as keyboard handler function', () => {
      const keyboardActions = appCoordinator.keyboardActions
      expect(typeof keyboardActions).toBe('function')
    })
  })

  describe('new architecture pattern', () => {
    it('should provide managers object with all required managers', () => {
      const managers = appCoordinator.managers

      expect(managers).toHaveProperty('searchManager')
      expect(managers).toHaveProperty('editorManager')
      expect(managers).toHaveProperty('focusManager')
      expect(managers).toHaveProperty('contentManager')
      expect(managers).toHaveProperty('dialogManager')
    })

    it('should provide state object with reactive state', () => {
      appCoordinator.managers.focusManager.setSelectedIndex(1)

      const state = appCoordinator.state

      expect(state).toHaveProperty('query')
      expect(state).toHaveProperty('isLoading')
      expect(state).toHaveProperty('filteredNotes')
      expect(state).toHaveProperty('selectedNote')
    })

    it('should provide actions object with all required actions', () => {
      const actions = appCoordinator.actions

      expect(actions).toHaveProperty('loadNoteContent')
      expect(actions).toHaveProperty('deleteNote')
      expect(actions).toHaveProperty('createNote')
      expect(actions).toHaveProperty('renameNote')
      expect(actions).toHaveProperty('saveNote')
      expect(actions).toHaveProperty('enterEditMode')
      expect(actions).toHaveProperty('exitEditMode')
      expect(actions).toHaveProperty('saveAndExitNote')
    })
  })

  describe('actions should be callable through new pattern', () => {
    it('should have deleteNote action that is callable', async () => {
      expect(typeof appCoordinator.actions.deleteNote).toBe('function')
      await expect(appCoordinator.actions.deleteNote()).resolves.toBeUndefined()
    })

    it('should have createNote action that is callable', async () => {
      expect(typeof appCoordinator.actions.createNote).toBe('function')
      await expect(appCoordinator.actions.createNote()).resolves.toBeUndefined()
    })

    it('should have renameNote action that is callable', async () => {
      expect(typeof appCoordinator.actions.renameNote).toBe('function')
      await expect(appCoordinator.actions.renameNote()).resolves.toBeUndefined()
    })

    it('should have saveNote action that is callable', async () => {
      expect(typeof appCoordinator.actions.saveNote).toBe('function')
      await expect(appCoordinator.actions.saveNote()).resolves.toBeUndefined()
    })

    it('should have enterEditMode action that is callable', async () => {
      expect(typeof appCoordinator.actions.enterEditMode).toBe('function')
      await expect(
        appCoordinator.actions.enterEditMode()
      ).resolves.toBeUndefined()
    })

    it('should have exitEditMode action that is callable', () => {
      expect(typeof appCoordinator.actions.exitEditMode).toBe('function')
      expect(() => appCoordinator.actions.exitEditMode()).not.toThrow()
    })
  })

  describe('initialization', () => {
    it('should provide initialize method that returns cleanup function', async () => {
      expect(typeof appCoordinator.initialize).toBe('function')
      const cleanup = await appCoordinator.initialize()
      expect(typeof cleanup).toBe('function')
    })

    it('should populate filteredNotes on initialization when config exists', async () => {
      const mockNotes = ['note1.md', 'note2.md', 'note3.md']

      // Mock config service to return true (config exists)
      mockConfigService.exists.mockResolvedValue(true)

      // Mock note service methods
      mockNoteService.initializeDatabase.mockResolvedValue({ success: true })
      mockNoteService.search.mockResolvedValue(mockNotes)

      // Before initialization, filteredNotes should be empty
      expect(appCoordinator.filteredNotes).toEqual([])

      // Initialize the manager
      const cleanup = await appCoordinator.initialize()

      // After initialization, filteredNotes should be populated
      // This should come from searchManager.filteredNotes via reactive effects
      expect(appCoordinator.filteredNotes).toEqual(mockNotes)
      expect(mockConfigService.exists).toHaveBeenCalled()
      expect(mockNoteService.initializeDatabase).toHaveBeenCalled()
      expect(mockNoteService.search).toHaveBeenCalledWith('')

      cleanup()
    })

    it('should provide reactive state that updates when state changes', async () => {
      let state = appCoordinator.state
      expect(state.filteredNotes).toEqual([])

      // Simulate state change (like what happens during initialization)
      const testNotes = toMetadata(['test1.md', 'test2.md'])
      appCoordinator.updateFilteredNotes(testNotes)

      state = appCoordinator.state
      expect(state.filteredNotes).toEqual(testNotes)
    })

    it('should not populate filteredNotes when config does not exist', async () => {
      // Mock config service to return false (config does not exist)
      mockConfigService.exists.mockResolvedValue(false)

      // Before initialization, filteredNotes should be empty
      expect(appCoordinator.filteredNotes).toEqual([])

      // Initialize the manager
      const cleanup = await appCoordinator.initialize()

      // After initialization, filteredNotes should still be empty since no config exists
      expect(appCoordinator.filteredNotes).toEqual([])
      expect(mockConfigService.exists).toHaveBeenCalled()
      expect(mockNoteService.search).not.toHaveBeenCalled()

      cleanup()
    })
  })
})
