/**
 * Commands Tests
 * The command surface is where every user-triggerable operation lives, so this
 * covers the operation bodies themselves: what each one calls, and — more
 * usefully — what it declines to do when there is no selection, no result, or
 * a failure underneath.
 *
 * Absorbs the former `actions/note.test.ts`, `actions/search.test.ts`,
 * `actions/settings.test.ts` and the action-registry half of the old
 * `actions/keyboard.test.ts`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createCommands,
  type CommandDeps,
  type Commands,
} from '../../../lib/app/commands.svelte'
import type { NoteMetadata } from '../../../lib/types/note'
import { resetAllMocks } from '../../test-utils'

const notificationSuccess = vi.fn().mockResolvedValue(undefined)
const notificationError = vi.fn().mockResolvedValue(undefined)

vi.mock('../../../lib/utils/notification', () => ({
  notification: {
    success: (...args: unknown[]) => notificationSuccess(...args),
    error: (...args: unknown[]) => notificationError(...args),
  },
}))

vi.mock('svelte', () => ({
  tick: vi.fn(() => Promise.resolve()),
}))

const FIXED_MODIFIED = 1_700_000_000

const toMetadata = (filenames: string[]): NoteMetadata[] =>
  filenames.map((filename) => ({ filename, modified: FIXED_MODIFIED }))

const NOTES = toMetadata(['note1.md', 'note2.md', 'note3.md'])

/**
 * Mutable stand-ins for the reactive state the real managers expose as getters.
 * Tests set these directly rather than re-building deps per case.
 */
interface MockState {
  selectedIndex: number
  filteredNotes: NoteMetadata[]
  searchInput: string
  selectedNote: string | null
  noteContentElement: HTMLElement | null
  isDirty: boolean
  editingNoteName: string | null
  isNavigatingLinks: boolean
  noteContent: string
  newNoteName: string
  newNoteNameForRename: string
  scrollAmount: number
}

function createFixture(stateOverrides: Partial<MockState> = {}): {
  commands: Commands
  deps: CommandDeps
  state: MockState
} {
  const state: MockState = {
    selectedIndex: 0,
    filteredNotes: NOTES,
    searchInput: 'test query',
    selectedNote: 'note1.md',
    noteContentElement: null,
    isDirty: false,
    editingNoteName: 'note1.md',
    isNavigatingLinks: false,
    noteContent: '<p>rendered</p>',
    newNoteName: '',
    newNoteNameForRename: '',
    scrollAmount: 0.4,
    ...stateOverrides,
  }

  const deps: CommandDeps = {
    noteService: {
      create: vi.fn().mockResolvedValue({ success: true, noteName: 'new.md' }),
      delete: vi.fn().mockResolvedValue({ success: true }),
      rename: vi.fn().mockResolvedValue({ success: true, newName: 'note2.md' }),
      openInEditor: vi.fn().mockResolvedValue(undefined),
      openFolder: vi.fn().mockResolvedValue(undefined),
    },
    searchManager: {
      get searchInput() {
        return state.searchInput
      },
      get filteredNotes() {
        return state.filteredNotes
      },
      executeSearch: vi.fn().mockResolvedValue([]),
      setFilteredNotes: vi.fn(),
      clearSearch: vi.fn(),
    },
    focusManager: {
      get selectedIndex() {
        return state.selectedIndex
      },
      get noteContentElement() {
        return state.noteContentElement
      },
      setSelectedIndex: vi.fn(),
      focusSearch: vi.fn(),
    },
    editorManager: {
      get isDirty() {
        return state.isDirty
      },
      get editingNoteName() {
        return state.editingNoteName
      },
      enterEditMode: vi.fn().mockResolvedValue(undefined),
      exitEditMode: vi.fn().mockReturnValue(''),
      saveNote: vi.fn().mockResolvedValue({ success: true }),
      captureExitPosition: vi.fn(),
      setExitHeaderText: vi.fn(),
    },
    contentManager: {
      get noteContent() {
        return state.noteContent
      },
      refreshAfterSave: vi
        .fn()
        .mockResolvedValue({ searchResults: NOTES, content: 'saved' }),
    },
    contentNavigationManager: {
      get isNavigatingLinks() {
        return state.isNavigatingLinks
      },
      navigateNext: vi.fn(),
      navigatePrevious: vi.fn(),
      navigateCodeNext: vi.fn(),
      navigateCodePrevious: vi.fn(),
      navigateLinkNext: vi.fn(),
      navigateLinkPrevious: vi.fn(),
      openCurrentLink: vi.fn(),
      copyCurrentSection: vi.fn().mockResolvedValue(true),
      navigateToHeader: vi.fn().mockReturnValue(true),
      handleEscape: vi.fn().mockReturnValue('focus_search'),
    },
    contentLoadingManager: {
      loadNoteContent: vi.fn().mockResolvedValue(undefined),
      refreshCacheAndUI: vi.fn().mockResolvedValue(undefined),
    },
    dialogManager: {
      get newNoteName() {
        return state.newNoteName
      },
      get newNoteNameForRename() {
        return state.newNoteNameForRename
      },
      openCreateDialog: vi.fn(),
      closeCreateDialog: vi.fn(),
      openRenameDialog: vi.fn(),
      closeRenameDialog: vi.fn(),
      openDeleteDialog: vi.fn(),
      closeDeleteDialog: vi.fn(),
      openUnsavedChangesDialog: vi.fn(),
    },
    configManager: {
      get general() {
        return { scroll_amount: state.scrollAmount }
      },
      openPane: vi.fn().mockResolvedValue(undefined),
      closePane: vi.fn(),
      saveConfig: vi.fn().mockResolvedValue({ success: true }),
    },
    versionExplorerManager: {
      openVersionExplorer: vi.fn().mockResolvedValue(undefined),
    },
    recentlyDeletedManager: {
      openDialog: vi.fn().mockResolvedValue(undefined),
    },
    getSelectedNote: () => state.selectedNote,
  }

  return { commands: createCommands(deps), deps, state }
}

describe('commands', () => {
  beforeEach(() => {
    resetAllMocks()
    notificationSuccess.mockClear()
    notificationError.mockClear()
    vi.useRealTimers()
  })

  describe('list navigation', () => {
    it('moves up and loads the newly selected note', () => {
      const { commands, deps } = createFixture({ selectedIndex: 2 })

      commands.moveUp()

      expect(deps.focusManager.setSelectedIndex).toHaveBeenCalledWith(1)
      expect(deps.contentLoadingManager.loadNoteContent).toHaveBeenCalledWith(
        'note2.md'
      )
    })

    it('stops at the top of the list', () => {
      const { commands, deps } = createFixture({ selectedIndex: 0 })

      commands.moveUp()

      expect(deps.focusManager.setSelectedIndex).toHaveBeenCalledWith(0)
      expect(deps.contentLoadingManager.loadNoteContent).toHaveBeenCalledWith(
        'note1.md'
      )
    })

    it('moves down and loads the newly selected note', () => {
      const { commands, deps } = createFixture({ selectedIndex: 0 })

      commands.moveDown()

      expect(deps.focusManager.setSelectedIndex).toHaveBeenCalledWith(1)
      expect(deps.contentLoadingManager.loadNoteContent).toHaveBeenCalledWith(
        'note2.md'
      )
    })

    it('stops at the bottom of the list', () => {
      const { commands, deps } = createFixture({ selectedIndex: 2 })

      commands.moveDown()

      expect(deps.focusManager.setSelectedIndex).toHaveBeenCalledWith(2)
      expect(deps.contentLoadingManager.loadNoteContent).toHaveBeenCalledWith(
        'note3.md'
      )
    })

    it('does nothing when the list is empty', () => {
      const { commands, deps } = createFixture({
        filteredNotes: [],
        selectedIndex: 0,
      })

      commands.moveUp()
      commands.moveDown()

      expect(deps.focusManager.setSelectedIndex).not.toHaveBeenCalled()
      expect(deps.contentLoadingManager.loadNoteContent).not.toHaveBeenCalled()
    })
  })

  describe('in-note navigation', () => {
    it('forwards each navigation command to the navigation manager', () => {
      const { commands, deps } = createFixture()

      commands.navigateNext()
      commands.navigatePrevious()
      commands.navigateCodeNext()
      commands.navigateCodePrevious()
      commands.navigateLinkNext()
      commands.navigateLinkPrevious()
      commands.openCurrentLink()

      const nav = deps.contentNavigationManager
      expect(nav.navigateNext).toHaveBeenCalled()
      expect(nav.navigatePrevious).toHaveBeenCalled()
      expect(nav.navigateCodeNext).toHaveBeenCalled()
      expect(nav.navigateCodePrevious).toHaveBeenCalled()
      expect(nav.navigateLinkNext).toHaveBeenCalled()
      expect(nav.navigateLinkPrevious).toHaveBeenCalled()
      expect(nav.openCurrentLink).toHaveBeenCalled()
    })

    it('reports a successful section copy', async () => {
      const { commands } = createFixture()

      await commands.copyCurrentSection()

      expect(notificationSuccess).toHaveBeenCalledWith('Copied to clipboard')
      expect(notificationError).not.toHaveBeenCalled()
    })

    it('reports when there is nothing to copy', async () => {
      const { commands, deps } = createFixture()
      vi.mocked(
        deps.contentNavigationManager.copyCurrentSection
      ).mockResolvedValue(false)

      await commands.copyCurrentSection()

      expect(notificationError).toHaveBeenCalledWith('Nothing to copy')
      expect(notificationSuccess).not.toHaveBeenCalled()
    })
  })

  describe('handleEscape', () => {
    it('focuses search only when nothing was left to clear', () => {
      const { commands, deps } = createFixture()

      commands.handleEscape()

      expect(deps.focusManager.focusSearch).toHaveBeenCalled()
    })

    it.each([
      'navigation_cleared',
      'highlights_cleared',
      'search_cleared',
    ] as const)('leaves focus alone after %s', (outcome) => {
      const { commands, deps } = createFixture()
      vi.mocked(deps.contentNavigationManager.handleEscape).mockReturnValue(
        outcome
      )

      commands.handleEscape()

      expect(deps.contentNavigationManager.handleEscape).toHaveBeenCalled()
      expect(deps.focusManager.focusSearch).not.toHaveBeenCalled()
    })
  })

  describe('scrolling', () => {
    function elementWith(scrollBy: ReturnType<typeof vi.fn>): HTMLElement {
      return { scrollBy, clientHeight: 625 } as unknown as HTMLElement
    }

    it('scrolls up by the configured fraction of the viewport', () => {
      const scrollBy = vi.fn()
      const { commands } = createFixture({
        noteContentElement: elementWith(scrollBy),
      })

      commands.scrollUpBy()

      expect(scrollBy).toHaveBeenCalledWith({ top: -250, behavior: 'smooth' })
    })

    it('scrolls down by the configured fraction of the viewport', () => {
      const scrollBy = vi.fn()
      const { commands } = createFixture({
        noteContentElement: elementWith(scrollBy),
      })

      commands.scrollDownBy()

      expect(scrollBy).toHaveBeenCalledWith({ top: 250, behavior: 'smooth' })
    })

    it('is a no-op with no note element mounted', () => {
      const { commands } = createFixture({ noteContentElement: null })

      expect(() => {
        commands.scrollUpBy()
        commands.scrollDownBy()
      }).not.toThrow()
    })

    it('scrolls instantly while the key repeats', () => {
      const scrollBy = vi.fn()
      const { commands } = createFixture({
        noteContentElement: elementWith(scrollBy),
      })
      const now = vi.spyOn(Date, 'now')

      now.mockReturnValue(1000)
      commands.scrollDownBy()

      // A held key repeats faster than the ~300ms animation, and each smooth
      // call restarts it from where the last had reached — so holding the key
      // scrolls no faster than tapping it.
      now.mockReturnValue(1050)
      commands.scrollDownBy()

      expect(scrollBy).toHaveBeenLastCalledWith({ top: 250, behavior: 'auto' })

      now.mockReturnValue(5000)
      commands.scrollDownBy()

      expect(scrollBy).toHaveBeenLastCalledWith({
        top: 250,
        behavior: 'smooth',
      })
      now.mockRestore()
    })
  })

  describe('createNote', () => {
    it('creates, reveals and opens the new note for editing', async () => {
      const { commands, deps, state } = createFixture()
      state.filteredNotes = toMetadata(['new.md', 'note1.md'])

      await commands.createNote('new')

      expect(deps.noteService.create).toHaveBeenCalledWith('new')
      expect(deps.searchManager.executeSearch).toHaveBeenCalledWith('')
      expect(deps.focusManager.setSelectedIndex).toHaveBeenCalledWith(0)
      expect(deps.dialogManager.closeCreateDialog).toHaveBeenCalled()
      expect(deps.focusManager.focusSearch).toHaveBeenCalled()
      expect(deps.editorManager.enterEditMode).toHaveBeenCalledWith(
        'new.md',
        '<p>rendered</p>'
      )
    })

    it('falls back to the dialog input when given no name', async () => {
      const { commands, deps } = createFixture({ newNoteName: '  typed  ' })

      await commands.createNote()

      expect(deps.noteService.create).toHaveBeenCalledWith('typed')
    })

    it('does nothing when no name is available', async () => {
      const { commands, deps } = createFixture({ newNoteName: '   ' })

      await commands.createNote()

      expect(deps.noteService.create).not.toHaveBeenCalled()
    })

    it('leaves the dialog open when creation fails', async () => {
      const { commands, deps } = createFixture()
      vi.mocked(deps.noteService.create).mockResolvedValue({
        success: false,
        error: 'exists',
      })

      await commands.createNote('dupe')

      expect(deps.dialogManager.closeCreateDialog).not.toHaveBeenCalled()
      expect(deps.editorManager.enterEditMode).not.toHaveBeenCalled()
    })
  })

  describe('renameNote', () => {
    it('renames the selection and re-selects it under its new name', async () => {
      const { commands, deps } = createFixture()

      await commands.renameNote('note2')

      expect(deps.noteService.rename).toHaveBeenCalledWith('note1.md', 'note2')
      expect(deps.searchManager.executeSearch).toHaveBeenCalledWith(
        'test query'
      )
      expect(deps.focusManager.setSelectedIndex).toHaveBeenCalledWith(1)
      expect(deps.dialogManager.closeRenameDialog).toHaveBeenCalled()
    })

    it('falls back to the dialog input when given no name', async () => {
      const { commands, deps } = createFixture({
        newNoteNameForRename: '  typed  ',
      })

      await commands.renameNote()

      expect(deps.noteService.rename).toHaveBeenCalledWith('note1.md', 'typed')
    })

    it('does nothing without a selection', async () => {
      const { commands, deps } = createFixture({ selectedNote: null })

      await commands.renameNote('whatever')

      expect(deps.noteService.rename).not.toHaveBeenCalled()
    })

    it('leaves the dialog open when the rename fails', async () => {
      const { commands, deps } = createFixture()
      vi.mocked(deps.noteService.rename).mockResolvedValue({
        success: false,
        error: 'in use',
      })

      await commands.renameNote('note2')

      expect(deps.dialogManager.closeRenameDialog).not.toHaveBeenCalled()
    })
  })

  describe('deleteNote', () => {
    it('deletes the selection, refreshes the list and returns focus', async () => {
      const { commands, deps } = createFixture()

      await commands.deleteNote()

      expect(deps.noteService.delete).toHaveBeenCalledWith('note1.md')
      expect(deps.searchManager.executeSearch).toHaveBeenCalledWith(
        'test query'
      )
      expect(deps.dialogManager.closeDeleteDialog).toHaveBeenCalled()
      expect(deps.focusManager.focusSearch).toHaveBeenCalled()
    })

    it('does nothing without a selection', async () => {
      const { commands, deps } = createFixture({ selectedNote: null })

      await commands.deleteNote()

      expect(deps.noteService.delete).not.toHaveBeenCalled()
    })

    it('leaves the dialog open when the delete fails', async () => {
      const { commands, deps } = createFixture()
      vi.mocked(deps.noteService.delete).mockResolvedValue({
        success: false,
        error: 'locked',
      })

      await commands.deleteNote()

      expect(deps.dialogManager.closeDeleteDialog).not.toHaveBeenCalled()
    })
  })

  describe('saveNote', () => {
    it('clears the search and refreshes the saved note', async () => {
      const { commands, deps } = createFixture()

      await commands.saveNote()

      expect(deps.editorManager.saveNote).toHaveBeenCalled()
      expect(deps.searchManager.clearSearch).toHaveBeenCalled()
      expect(deps.contentManager.refreshAfterSave).toHaveBeenCalledWith(
        'note1.md',
        'test query'
      )
      expect(deps.searchManager.setFilteredNotes).toHaveBeenCalledWith(NOTES)
    })

    it('does not touch the search when the save fails', async () => {
      const { commands, deps } = createFixture()
      vi.mocked(deps.editorManager.saveNote).mockResolvedValue({
        success: false,
        error: 'disk full',
      })

      await commands.saveNote()

      expect(deps.searchManager.clearSearch).not.toHaveBeenCalled()
      expect(deps.contentManager.refreshAfterSave).not.toHaveBeenCalled()
    })

    it('survives a failed post-save refresh', async () => {
      const { commands, deps } = createFixture()
      vi.mocked(deps.contentManager.refreshAfterSave).mockRejectedValue(
        new Error('index busy')
      )

      await expect(commands.saveNote()).resolves.toBeUndefined()
      expect(deps.searchManager.setFilteredNotes).not.toHaveBeenCalled()
    })
  })

  describe('opening a note elsewhere', () => {
    it('opens the selection in the external editor', async () => {
      const { commands, deps } = createFixture()

      await commands.openNoteExternally()

      expect(deps.noteService.openInEditor).toHaveBeenCalledWith('note1.md')
    })

    it('opens the selection’s folder', async () => {
      const { commands, deps } = createFixture()

      await commands.openNoteFolder()

      expect(deps.noteService.openFolder).toHaveBeenCalledWith('note1.md')
    })

    it('does nothing without a selection', async () => {
      const { commands, deps } = createFixture({ selectedNote: null })

      await commands.openNoteExternally()
      await commands.openNoteFolder()

      expect(deps.noteService.openInEditor).not.toHaveBeenCalled()
      expect(deps.noteService.openFolder).not.toHaveBeenCalled()
    })
  })

  describe('dialog prompts', () => {
    it('seeds the create dialog with the current query', () => {
      const { commands, deps } = createFixture()

      commands.promptCreateNote()

      expect(deps.dialogManager.openCreateDialog).toHaveBeenCalledWith(
        'test query'
      )
    })

    it('opens the rename dialog for the selection', () => {
      const { commands, deps } = createFixture()

      commands.promptRenameNote()

      expect(deps.dialogManager.openRenameDialog).toHaveBeenCalledWith(
        'note1.md'
      )
    })

    it('opens the delete dialog for the selection', () => {
      const { commands, deps } = createFixture()

      commands.promptDeleteNote()

      expect(deps.dialogManager.openDeleteDialog).toHaveBeenCalled()
    })

    it('opens neither rename nor delete without a selection', () => {
      const { commands, deps } = createFixture({ selectedNote: null })

      commands.promptRenameNote()
      commands.promptDeleteNote()

      expect(deps.dialogManager.openRenameDialog).not.toHaveBeenCalled()
      expect(deps.dialogManager.openDeleteDialog).not.toHaveBeenCalled()
    })

    it('prompts rather than performing — the dialog decides', () => {
      // The naming split that this surface exists to fix: `promptDeleteNote`
      // opens the confirmation, `deleteNote` is what the confirmation calls.
      const { commands, deps } = createFixture()

      commands.promptDeleteNote()

      expect(deps.noteService.delete).not.toHaveBeenCalled()
    })
  })

  describe('entering edit mode', () => {
    it('opens the selected note in the editor', async () => {
      const { commands, deps } = createFixture()

      await commands.enterEditMode()

      expect(deps.editorManager.enterEditMode).toHaveBeenCalledWith(
        'note1.md',
        '<p>rendered</p>'
      )
    })

    it('follows the current link instead while stepping through links', async () => {
      const { commands, deps } = createFixture({ isNavigatingLinks: true })

      await commands.enterEditMode()

      expect(deps.contentNavigationManager.openCurrentLink).toHaveBeenCalled()
      expect(deps.editorManager.enterEditMode).not.toHaveBeenCalled()
    })

    it('does nothing without a selection', async () => {
      const { commands, deps } = createFixture({ selectedNote: null })

      await commands.enterEditMode()

      expect(deps.editorManager.enterEditMode).not.toHaveBeenCalled()
    })

    it('does nothing with an empty list', async () => {
      const { commands, deps } = createFixture({ filteredNotes: [] })

      await commands.enterEditMode()

      expect(deps.editorManager.enterEditMode).not.toHaveBeenCalled()
    })
  })

  describe('exiting edit mode', () => {
    it('returns focus to search', () => {
      const { commands, deps } = createFixture()

      commands.exitEditMode()

      expect(deps.editorManager.exitEditMode).toHaveBeenCalled()
      expect(deps.focusManager.focusSearch).toHaveBeenCalled()
    })

    it('scrolls back to the header the cursor was under', () => {
      vi.useFakeTimers()
      const { commands, deps } = createFixture()
      vi.mocked(deps.editorManager.exitEditMode).mockReturnValue('## Section')

      commands.exitEditMode()
      expect(
        deps.contentNavigationManager.navigateToHeader
      ).not.toHaveBeenCalled()

      // Deferred until the rendered view has replaced the editor.
      vi.runAllTimers()
      expect(
        deps.contentNavigationManager.navigateToHeader
      ).toHaveBeenCalledWith('## Section')
    })

    it('does not schedule a scroll when no header was captured', () => {
      vi.useFakeTimers()
      const { commands, deps } = createFixture()

      commands.exitEditMode()
      vi.runAllTimers()

      expect(
        deps.contentNavigationManager.navigateToHeader
      ).not.toHaveBeenCalled()
    })

    it('asks before discarding unsaved changes', () => {
      const { commands, deps } = createFixture({ isDirty: true })

      commands.smartExitEditMode()

      expect(deps.dialogManager.openUnsavedChangesDialog).toHaveBeenCalled()
      expect(deps.editorManager.exitEditMode).not.toHaveBeenCalled()
    })

    it('exits straight away when there is nothing to lose', () => {
      const { commands, deps } = createFixture({ isDirty: false })

      commands.smartExitEditMode()

      expect(deps.editorManager.exitEditMode).toHaveBeenCalled()
      expect(deps.dialogManager.openUnsavedChangesDialog).not.toHaveBeenCalled()
    })
  })

  describe('saveAndExitNote', () => {
    it('captures position, saves, exits, then selects the most recent note', async () => {
      const order: string[] = []
      const { commands, deps } = createFixture()
      vi.mocked(deps.editorManager.captureExitPosition).mockImplementation(
        () => {
          order.push('capture')
        }
      )
      vi.mocked(deps.editorManager.saveNote).mockImplementation(async () => {
        order.push('save')
        return { success: true }
      })
      vi.mocked(deps.editorManager.exitEditMode).mockImplementation(() => {
        order.push('exit')
        return ''
      })

      await commands.saveAndExitNote()

      expect(order).toEqual(['capture', 'save', 'exit'])
      // An empty search lists by recency, so the note just saved is at the top.
      expect(deps.focusManager.setSelectedIndex).toHaveBeenCalledWith(0)
    })

    it('still exits when the save fails, leaving the note selected', async () => {
      const { commands, deps } = createFixture()
      vi.mocked(deps.editorManager.saveNote).mockResolvedValue({
        success: false,
        error: 'disk full',
      })

      await commands.saveAndExitNote()

      expect(deps.editorManager.exitEditMode).toHaveBeenCalled()
    })
  })

  describe('settings', () => {
    it('opens the pane and returns focus to search', async () => {
      const { commands, deps } = createFixture()

      await commands.openSettings()

      expect(deps.configManager.openPane).toHaveBeenCalled()
      expect(deps.focusManager.focusSearch).toHaveBeenCalled()
    })

    it('propagates a failure to open the pane', async () => {
      const { commands, deps } = createFixture()
      vi.mocked(deps.configManager.openPane).mockRejectedValue(
        new Error('no config dir')
      )

      await expect(commands.openSettings()).rejects.toThrow('no config dir')
      expect(deps.focusManager.focusSearch).not.toHaveBeenCalled()
    })

    it('closes the pane and returns focus to search', () => {
      const { commands, deps } = createFixture()

      commands.closeSettings()

      expect(deps.configManager.closePane).toHaveBeenCalled()
      expect(deps.focusManager.focusSearch).toHaveBeenCalled()
    })

    it('re-runs the search after a saved config', async () => {
      const { commands, deps } = createFixture()

      const result = await commands.saveConfigAndRefresh()

      expect(result).toEqual({ success: true })
      expect(deps.searchManager.executeSearch).toHaveBeenCalledWith('')
      expect(deps.focusManager.focusSearch).toHaveBeenCalled()
    })

    it('reports a rejected config without re-running the search', async () => {
      const { commands, deps } = createFixture()
      vi.mocked(deps.configManager.saveConfig).mockResolvedValue({
        success: false,
        error: 'invalid TOML',
      })

      const result = await commands.saveConfigAndRefresh()

      expect(result).toEqual({ success: false, error: 'invalid TOML' })
      expect(deps.searchManager.executeSearch).not.toHaveBeenCalled()
    })
  })

  describe('panels', () => {
    it('opens the version explorer for the selection', async () => {
      const { commands, deps } = createFixture()

      await commands.openVersionExplorer()

      expect(
        deps.versionExplorerManager.openVersionExplorer
      ).toHaveBeenCalledWith('note1.md')
    })

    it('does not open the version explorer without a selection', async () => {
      const { commands, deps } = createFixture({ selectedNote: null })

      await commands.openVersionExplorer()

      expect(
        deps.versionExplorerManager.openVersionExplorer
      ).not.toHaveBeenCalled()
    })

    it('opens recently deleted regardless of selection', async () => {
      const { commands, deps } = createFixture({ selectedNote: null })

      await commands.openRecentlyDeleted()

      expect(deps.recentlyDeletedManager.openDialog).toHaveBeenCalled()
    })
  })

  describe('cache and content', () => {
    it('delegates a cache refresh to the loading manager', async () => {
      const { commands, deps } = createFixture()

      await commands.refreshCache()

      expect(deps.contentLoadingManager.refreshCacheAndUI).toHaveBeenCalled()
    })

    it('delegates a content load to the loading manager', async () => {
      const { commands, deps } = createFixture()

      await commands.loadNoteContent('other.md')

      expect(deps.contentLoadingManager.loadNoteContent).toHaveBeenCalledWith(
        'other.md'
      )
    })
  })
})
