/**
 * App Coordinator Tests
 * The coordinator is a composition root, so what is worth pinning here is what
 * only it can get wrong: the cross-manager `selectedNote` derivation, that the
 * wiring it performs is complete, and that `initialize()` does not register
 * reactive effects (which would throw `effect_orphan`).
 *
 * Command bodies belong to `commands.test.ts`, dispatch to `keyboard.test.ts`,
 * and startup/teardown to `lifecycle.test.ts`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockInvoke, resetAllMocks } from '../../test-utils'
import type { NoteMetadata } from '../../../lib/types/note'

const FIXED_MODIFIED = 1_700_000_000

const toMetadata = (filenames: string[]): NoteMetadata[] =>
  filenames.map((filename) => ({ filename, modified: FIXED_MODIFIED }))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}))

vi.mock('svelte', () => ({
  tick: vi.fn(() => Promise.resolve()),
}))

// NOTE: `setupAppEffects` is deliberately NOT mocked. It calls `$effect`, which
// throws `effect_orphan` outside of component initialisation — mocking it here
// previously hid the fact that `initialize()` was calling it after `await`s.

const mockNoteService = {
  getContent: vi.fn().mockResolvedValue(''),
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
const { searchManager, focusManager } = appCoordinator.managers

describe('appCoordinator', () => {
  beforeEach(() => {
    resetAllMocks()
    vi.clearAllMocks()
    mockNoteService.getContent.mockReset()
    mockNoteService.getContent.mockResolvedValue('')
    mockNoteService.getRawContent.mockReset()
    mockNoteService.save.mockReset()
    mockNoteService.search.mockReset()
    mockNoteService.initializeDatabase.mockReset()
    mockConfigService.exists.mockReset()

    searchManager.searchInput = ''
    searchManager.setFilteredNotes([])
    focusManager.setSelectedIndex(-1)
  })

  describe('selectedNote', () => {
    // The one piece of state the coordinator owns: neither searchManager nor
    // focusManager can derive it alone.
    it('is null with no notes listed', () => {
      expect(appCoordinator.selectedNote).toBe(null)
    })

    it('follows the selected index into the result list', () => {
      searchManager.setFilteredNotes(toMetadata(['a.md', 'b.md', 'c.md']))
      focusManager.setSelectedIndex(1)

      expect(appCoordinator.selectedNote).toBe('b.md')
    })

    it('falls back to the first note when nothing is selected yet', () => {
      searchManager.setFilteredNotes(toMetadata(['a.md', 'b.md']))
      focusManager.setSelectedIndex(-1)

      expect(appCoordinator.selectedNote).toBe('a.md')
    })

    it('falls back to the first note when the index outruns a shrunken list', () => {
      searchManager.setFilteredNotes(toMetadata(['a.md', 'b.md', 'c.md']))
      focusManager.setSelectedIndex(2)
      expect(appCoordinator.selectedNote).toBe('c.md')

      searchManager.setFilteredNotes(toMetadata(['a.md']))

      expect(appCoordinator.selectedNote).toBe('a.md')
    })

    it('goes back to null when the results empty out', () => {
      searchManager.setFilteredNotes(toMetadata(['a.md', 'b.md']))
      focusManager.setSelectedIndex(1)
      expect(appCoordinator.selectedNote).toBe('b.md')

      searchManager.setFilteredNotes([])

      expect(appCoordinator.selectedNote).toBe(null)
    })
  })

  describe('composition', () => {
    it('exposes every manager the UI reads through context', () => {
      expect(Object.keys(appCoordinator.managers).sort()).toEqual([
        'configManager',
        'contentLoadingManager',
        'contentManager',
        'contentNavigationManager',
        'dialogManager',
        'editorManager',
        'focusManager',
        'progressManager',
        'recentlyDeletedManager',
        'searchManager',
        'versionExplorerManager',
      ])
    })

    it('exposes the command surface', () => {
      // Spot-check across the groups; `commands.test.ts` covers the bodies.
      expect(typeof appCoordinator.commands.createNote).toBe('function')
      expect(typeof appCoordinator.commands.promptCreateNote).toBe('function')
      expect(typeof appCoordinator.commands.saveAndExitNote).toBe('function')
      expect(typeof appCoordinator.commands.openSettings).toBe('function')
    })

    it('exposes a keyboard handler taking one event', () => {
      expect(typeof appCoordinator.keyboardActions).toBe('function')
      expect(appCoordinator.keyboardActions.length).toBe(1)
    })

    it('wires the search-complete callback so a search selects its first hit', async () => {
      mockNoteService.search.mockResolvedValue(toMetadata(['found.md']))

      await searchManager.executeSearch('found')

      expect(focusManager.selectedIndex).toBe(0)
      expect(appCoordinator.selectedNote).toBe('found.md')
    })
  })

  describe('initialization', () => {
    it('returns a cleanup function', async () => {
      const cleanup = await appCoordinator.initialize()
      expect(typeof cleanup).toBe('function')
      cleanup()
    })

    it('does not register reactive effects from initialize()', async () => {
      // `initialize()` runs after `await`s inside onMount, where there is no
      // active effect context. Registering `$effect` there throws
      // `effect_orphan` and aborts before the cleanup function is returned.
      await expect(appCoordinator.initialize()).resolves.toBeInstanceOf(
        Function
      )
    })

    it('populates the note list when a config exists', async () => {
      const notes = ['note1.md', 'note2.md', 'note3.md']
      mockConfigService.exists.mockResolvedValue(true)
      mockNoteService.initializeDatabase.mockResolvedValue({ success: true })
      mockNoteService.search.mockResolvedValue(notes)

      expect(searchManager.filteredNotes).toEqual([])

      const cleanup = await appCoordinator.initialize()

      expect(searchManager.filteredNotes).toEqual(notes)
      expect(mockNoteService.initializeDatabase).toHaveBeenCalled()
      expect(mockNoteService.search).toHaveBeenCalledWith('')

      cleanup()
    })

    it('leaves the note list alone when no config exists', async () => {
      mockConfigService.exists.mockResolvedValue(false)

      const cleanup = await appCoordinator.initialize()

      expect(searchManager.filteredNotes).toEqual([])
      expect(mockNoteService.search).not.toHaveBeenCalled()

      cleanup()
    })
  })
})
