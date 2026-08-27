/**
 * Keyboard Tests
 * The keyboard layer's whole job is: pick a context, look up a command, run it.
 * These tests pin exactly that — which context wins, which key maps to which
 * command, and when the app declines the keystroke. What each command *does*
 * is `commands.test.ts`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createKeyboardHandler,
  formatKeyCombo,
  type KeyboardDeps,
  type KeyCommand,
} from '../../../lib/app/keyboard.svelte'
import type { Commands } from '../../../lib/app/commands.svelte'
import type { NoteMetadata } from '../../../lib/types/note'
import type { ShortcutsConfig } from '../../../lib/types/config'
import { resetAllMocks } from '../../test-utils'

const FIXED_MODIFIED = 1_700_000_000

const toMetadata = (filenames: string[]): NoteMetadata[] =>
  filenames.map((filename) => ({ filename, modified: FIXED_MODIFIED }))

/** Every command a keymap may name. Keeping this explicit is the point: an
 * added command has to be listed here before a key can reach it. */
const COMMAND_NAMES = [
  'loadNoteContent',
  'moveUp',
  'moveDown',
  'focusSearch',
  'handleTab',
  'navigateNext',
  'navigatePrevious',
  'navigateCodeNext',
  'navigateCodePrevious',
  'navigateLinkNext',
  'navigateLinkPrevious',
  'openCurrentLink',
  'copyCurrentSection',
  'handleEscape',
  'scrollUpBy',
  'scrollDownBy',
  'createNote',
  'renameNote',
  'deleteNote',
  'saveNote',
  'openNoteExternally',
  'openNoteFolder',
  'refreshCache',
  'promptCreateNote',
  'promptRenameNote',
  'promptDeleteNote',
  'enterEditMode',
  'exitEditMode',
  'smartExitEditMode',
  'saveAndExitNote',
  'openSettings',
  'closeSettings',
  'saveConfigAndRefresh',
  'openVersionExplorer',
  'openRecentlyDeleted',
] as const satisfies readonly (keyof Commands)[]

type CommandsMock = Record<keyof Commands, ReturnType<typeof vi.fn>>

function createCommandsMock(): CommandsMock {
  return Object.fromEntries(
    COMMAND_NAMES.map((name) => [name, vi.fn()])
  ) as CommandsMock
}

const SHORTCUTS: ShortcutsConfig = {
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
  navigate_link_previous: 'Ctrl+Shift+k',
  navigate_link_next: 'Ctrl+Shift+j',
  copy_current_section: 'Ctrl+Shift+c',
  open_settings: 'Meta+,',
  version_explorer: 'Ctrl+/',
  recently_deleted: 'Ctrl+Shift+d',
}

interface MockState {
  isSettingsOpen: boolean
  isAnyDialogOpen: boolean
  isSearchInputFocused: boolean
  isNoteContentFocused: boolean
  isEditMode: boolean
  filteredNotes: NoteMetadata[]
}

describe('keyboard', () => {
  let commands: CommandsMock
  let state: MockState
  let deps: KeyboardDeps
  let keyboard: ReturnType<typeof createKeyboardHandler>

  beforeEach(() => {
    resetAllMocks()
    commands = createCommandsMock()
    state = {
      isSettingsOpen: false,
      isAnyDialogOpen: false,
      isSearchInputFocused: false,
      isNoteContentFocused: false,
      isEditMode: false,
      filteredNotes: toMetadata(['note1.md', 'note2.md', 'note3.md']),
    }

    deps = {
      commands: commands as unknown as Commands,
      configManager: {
        shortcuts: SHORTCUTS,
        get isVisible() {
          return state.isSettingsOpen
        },
      },
      focusManager: {
        get isSearchInputFocused() {
          return state.isSearchInputFocused
        },
        get isNoteContentFocused() {
          return state.isNoteContentFocused
        },
      },
      editorManager: {
        get isEditMode() {
          return state.isEditMode
        },
      },
      searchManager: {
        get filteredNotes() {
          return state.filteredNotes
        },
      },
      isAnyDialogOpen: () => state.isAnyDialogOpen,
    }

    keyboard = createKeyboardHandler(deps)
  })

  /** Fires a key and reports whether the app claimed it. */
  async function press(
    key: string,
    modifiers: Partial<
      Record<'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey', boolean>
    > = {}
  ): Promise<boolean> {
    const event = new KeyboardEvent('keydown', { key, ...modifiers })
    const preventDefault = vi.spyOn(event, 'preventDefault')
    await keyboard.handleKeydown(event)
    return preventDefault.mock.calls.length > 0
  }

  describe('formatKeyCombo', () => {
    it('orders modifiers consistently', () => {
      const event = new KeyboardEvent('keydown', {
        key: 'n',
        ctrlKey: true,
        shiftKey: true,
      })
      expect(formatKeyCombo(event)).toBe('Ctrl+Shift+n')
    })

    it('returns the bare key when unmodified', () => {
      expect(
        formatKeyCombo(new KeyboardEvent('keydown', { key: 'Escape' }))
      ).toBe('Escape')
    })
  })

  describe('key mappings', () => {
    it('exposes a mapping table for every context', () => {
      const mappings = keyboard.keyMappings()

      expect(Object.keys(mappings).sort()).toEqual([
        'default',
        'editMode',
        'noteContent',
        'searchInput',
      ])
    })

    it('maps the search-input context to its commands', () => {
      const { searchInput } = keyboard.keyMappings()

      expect(searchInput.Enter).toBe('enterEditMode')
      expect(searchInput['Ctrl+Enter']).toBe('promptCreateNote')
      expect(searchInput['Ctrl+m']).toBe('promptRenameNote')
      expect(searchInput['Ctrl+x']).toBe('promptDeleteNote')
      expect(searchInput['Ctrl+o']).toBe('openNoteExternally')
      expect(searchInput['Ctrl+f']).toBe('openNoteFolder')
      expect(searchInput['Ctrl+r']).toBe('refreshCache')
      expect(searchInput.ArrowUp).toBe('moveUp')
      expect(searchInput.ArrowDown).toBe('moveDown')
      expect(searchInput.Escape).toBe('handleEscape')
      expect(searchInput.Tab).toBe('handleTab')
      expect(searchInput['Meta+,']).toBe('openSettings')
    })

    it('maps the edit-mode context to its commands', () => {
      const { editMode } = keyboard.keyMappings()

      expect(editMode.Escape).toBe('smartExitEditMode')
      expect(editMode['Ctrl+s']).toBe('saveAndExitNote')
      expect(editMode['Meta+,']).toBe('openSettings')
    })

    it('maps the note-content context to its commands', () => {
      const { noteContent } = keyboard.keyMappings()

      expect(noteContent.Escape).toBe('focusSearch')
      expect(noteContent['Ctrl+p']).toBe('navigatePrevious')
      expect(noteContent['Ctrl+n']).toBe('navigateNext')
      expect(noteContent['Ctrl+Shift+c']).toBe('copyCurrentSection')
    })

    it('maps the default context to its commands', () => {
      const { default: fallback } = keyboard.keyMappings()

      expect(fallback.ArrowUp).toBe('moveUp')
      expect(fallback.ArrowDown).toBe('moveDown')
      expect(fallback.Enter).toBe('enterEditMode')
      expect(fallback['Ctrl+Enter']).toBe('promptCreateNote')
      expect(fallback['Ctrl+x']).toBe('promptDeleteNote')
      expect(fallback.Escape).toBe('focusSearch')
    })

    it('names only commands that exist and take no arguments', () => {
      const mappings = keyboard.keyMappings()

      for (const [context, table] of Object.entries(mappings)) {
        for (const [key, commandName] of Object.entries(table)) {
          expect(
            commands[commandName as KeyCommand],
            `${context}:${key} names a missing command '${commandName}'`
          ).toBeDefined()
        }
      }
    })

    it('rebuilds from config so a changed shortcut takes effect', () => {
      const rebound = createKeyboardHandler({
        ...deps,
        configManager: {
          shortcuts: { ...SHORTCUTS, create_note: 'Ctrl+t' },
          isVisible: false,
        },
      })

      expect(rebound.keyMappings().searchInput['Ctrl+t']).toBe(
        'promptCreateNote'
      )
      expect(rebound.keyMappings().searchInput['Ctrl+Enter']).toBeUndefined()
    })
  })

  describe('context selection', () => {
    it('dispatches from the search-input keymap when the search box has focus', async () => {
      state.isSearchInputFocused = true

      expect(await press('ArrowDown')).toBe(true)
      expect(commands.moveDown).toHaveBeenCalled()
    })

    it('prefers the search input over edit mode when both are true', async () => {
      state.isSearchInputFocused = true
      state.isEditMode = true

      await press('Escape')

      expect(commands.handleEscape).toHaveBeenCalled()
      expect(commands.smartExitEditMode).not.toHaveBeenCalled()
    })

    it('dispatches from the edit-mode keymap while editing', async () => {
      state.isEditMode = true

      expect(await press('Escape')).toBe(true)
      expect(commands.smartExitEditMode).toHaveBeenCalled()
    })

    it('prefers edit mode over note content when both are true', async () => {
      state.isEditMode = true
      state.isNoteContentFocused = true

      await press('Escape')

      expect(commands.smartExitEditMode).toHaveBeenCalled()
      expect(commands.focusSearch).not.toHaveBeenCalled()
    })

    it('dispatches from the note-content keymap when the note has focus', async () => {
      state.isNoteContentFocused = true

      expect(await press('Escape')).toBe(true)
      expect(commands.focusSearch).toHaveBeenCalled()
    })

    it('falls back to the default keymap when notes are listed but nothing has focus', async () => {
      expect(await press('Enter')).toBe(true)
      expect(commands.enterEditMode).toHaveBeenCalled()
    })

    it('moves through the list from the default keymap', async () => {
      expect(await press('ArrowDown')).toBe(true)
      expect(commands.moveDown).toHaveBeenCalled()
    })

    it('dispatches nothing in the default context with no notes listed', async () => {
      state.filteredNotes = []

      expect(await press('Enter')).toBe(false)
      expect(commands.enterEditMode).not.toHaveBeenCalled()
    })
  })

  describe('declining keystrokes', () => {
    it('leaves the keyboard alone while settings are open', async () => {
      state.isSettingsOpen = true
      state.isSearchInputFocused = true

      expect(await press('ArrowDown')).toBe(false)
      expect(commands.moveDown).not.toHaveBeenCalled()
    })

    it('leaves the keyboard alone while a dialog is open', async () => {
      state.isAnyDialogOpen = true
      state.isSearchInputFocused = true

      expect(await press('ArrowDown')).toBe(false)
      expect(commands.moveDown).not.toHaveBeenCalled()
    })

    it('does not swallow Escape while settings are open', async () => {
      state.isSettingsOpen = true

      // The settings pane installs its own Escape handler; preventing the
      // default here would stop it from closing.
      expect(await press('Escape')).toBe(false)
    })

    it('ignores an unmapped key', async () => {
      state.isSearchInputFocused = true

      expect(await press('F13')).toBe(false)
      for (const command of Object.values(commands)) {
        expect(command).not.toHaveBeenCalled()
      }
    })
  })

  describe('modifier combinations', () => {
    it('resolves a modified combination to its command', async () => {
      state.isSearchInputFocused = true

      expect(await press('Enter', { ctrlKey: true })).toBe(true)
      expect(commands.promptCreateNote).toHaveBeenCalled()
      expect(commands.enterEditMode).not.toHaveBeenCalled()
    })

    it('opens settings on Meta+, from any context', async () => {
      expect(await press(',', { metaKey: true })).toBe(true)
      expect(commands.openSettings).toHaveBeenCalled()
    })

    it('opens settings on Meta+, even with no notes listed', async () => {
      state.filteredNotes = []

      expect(await press(',', { metaKey: true })).toBe(true)
      expect(commands.openSettings).toHaveBeenCalled()
    })

    it('does not open settings on Meta+, while a dialog is open', async () => {
      state.isAnyDialogOpen = true

      expect(await press(',', { metaKey: true })).toBe(false)
      expect(commands.openSettings).not.toHaveBeenCalled()
    })
  })

  describe('error propagation', () => {
    it('propagates a failing command to the caller', async () => {
      commands.enterEditMode.mockRejectedValue(new Error('Test error'))

      await expect(
        keyboard.handleKeydown(new KeyboardEvent('keydown', { key: 'Enter' }))
      ).rejects.toThrow('Test error')
    })

    it('awaits an async command before resolving', async () => {
      let resolveCommand: () => void = () => {}
      let finished = false
      commands.enterEditMode.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveCommand = () => {
              finished = true
              resolve()
            }
          })
      )

      const dispatched = keyboard.handleKeydown(
        new KeyboardEvent('keydown', { key: 'Enter' })
      )
      expect(finished).toBe(false)

      resolveCommand()
      await dispatched
      expect(finished).toBe(true)
    })
  })
})
