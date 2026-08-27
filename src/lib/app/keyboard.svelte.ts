/**
 * App Layer - Keyboard
 * Maps key combinations to commands, per UI context.
 *
 * This layer knows two things and nothing else: which context the user is in
 * (search input / edit mode / note content / list), and which command each key
 * runs there. The commands themselves live in `commands.svelte.ts` and read
 * their own state, so no snapshot of app state is threaded through dispatch.
 */

import type { ConfigManager } from '../core/configManager.svelte'
import type { EditorManager } from '../core/editorManager.svelte'
import type { FocusManager } from '../core/focusManager.svelte'
import type { SearchManager } from '../core/searchManager.svelte'
import type { ShortcutsConfig } from '../types/config'
import type { Commands } from './commands.svelte'

/**
 * Commands a key can run: those callable with no arguments. Anything needing a
 * parameter (`loadNoteContent`) is unreachable from a keymap, and the compiler
 * enforces that.
 */
export type KeyCommand = {
  [K in keyof Commands]: Commands[K] extends () => unknown ? K : never
}[keyof Commands]

export type KeyMappings = Record<string, KeyCommand>

/** The four contexts, in the order they are tested. */
export type KeyContext = 'searchInput' | 'editMode' | 'noteContent' | 'default'

export interface KeyboardDeps {
  commands: Commands
  configManager: Pick<ConfigManager, 'shortcuts' | 'isVisible'>
  focusManager: Pick<
    FocusManager,
    'isSearchInputFocused' | 'isNoteContentFocused'
  >
  editorManager: Pick<EditorManager, 'isEditMode'>
  searchManager: Pick<SearchManager, 'filteredNotes'>
  /** True while any modal owns the keyboard. */
  isAnyDialogOpen(): boolean
}

export interface KeyboardHandler {
  readonly keyMappings: () => Record<KeyContext, KeyMappings>
  handleKeydown(event: KeyboardEvent): Promise<void>
}

export function formatKeyCombo(event: KeyboardEvent): string {
  const modifiers: string[] = []
  if (event.ctrlKey) modifiers.push('Ctrl')
  if (event.altKey) modifiers.push('Alt')
  if (event.shiftKey) modifiers.push('Shift')
  if (event.metaKey) modifiers.push('Meta')

  return modifiers.length > 0
    ? `${modifiers.join('+')}+${event.key}`
    : event.key
}

function searchInputMappings(shortcuts: ShortcutsConfig): KeyMappings {
  return {
    [shortcuts.edit_note]: 'enterEditMode',
    [shortcuts.create_note]: 'promptCreateNote',
    [shortcuts.rename_note]: 'promptRenameNote',
    [shortcuts.open_external]: 'openNoteExternally',
    [shortcuts.open_folder]: 'openNoteFolder',
    [shortcuts.refresh_cache]: 'refreshCache',
    [shortcuts.delete_note]: 'promptDeleteNote',
    [shortcuts.scroll_up]: 'scrollUpBy',
    [shortcuts.scroll_down]: 'scrollDownBy',
    ArrowUp: 'moveUp',
    ArrowDown: 'moveDown',
    [shortcuts.up]: 'moveUp',
    [shortcuts.down]: 'moveDown',
    [shortcuts.navigate_previous]: 'navigatePrevious',
    [shortcuts.navigate_next]: 'navigateNext',
    [shortcuts.navigate_code_previous]: 'navigateCodePrevious',
    [shortcuts.navigate_code_next]: 'navigateCodeNext',
    [shortcuts.navigate_link_previous]: 'navigateLinkPrevious',
    [shortcuts.navigate_link_next]: 'navigateLinkNext',
    [shortcuts.copy_current_section]: 'copyCurrentSection',
    Escape: 'handleEscape',
    Tab: 'handleTab',
    [shortcuts.open_settings]: 'openSettings',
    [shortcuts.version_explorer]: 'openVersionExplorer',
    [shortcuts.recently_deleted]: 'openRecentlyDeleted',
  }
}

function editModeMappings(shortcuts: ShortcutsConfig): KeyMappings {
  return {
    Escape: 'smartExitEditMode',
    [shortcuts.save_and_exit]: 'saveAndExitNote',
    [shortcuts.open_settings]: 'openSettings',
    [shortcuts.version_explorer]: 'openVersionExplorer',
    [shortcuts.recently_deleted]: 'openRecentlyDeleted',
  }
}

function noteContentMappings(shortcuts: ShortcutsConfig): KeyMappings {
  return {
    Escape: 'focusSearch',
    [shortcuts.navigate_previous]: 'navigatePrevious',
    [shortcuts.navigate_next]: 'navigateNext',
    [shortcuts.navigate_code_previous]: 'navigateCodePrevious',
    [shortcuts.navigate_code_next]: 'navigateCodeNext',
    [shortcuts.navigate_link_previous]: 'navigateLinkPrevious',
    [shortcuts.navigate_link_next]: 'navigateLinkNext',
    [shortcuts.copy_current_section]: 'copyCurrentSection',
    [shortcuts.version_explorer]: 'openVersionExplorer',
    [shortcuts.recently_deleted]: 'openRecentlyDeleted',
  }
}

function defaultMappings(shortcuts: ShortcutsConfig): KeyMappings {
  return {
    ArrowUp: 'moveUp',
    ArrowDown: 'moveDown',
    Enter: 'enterEditMode',
    [shortcuts.create_note]: 'promptCreateNote',
    [shortcuts.delete_note]: 'promptDeleteNote',
    Escape: 'focusSearch',
    [shortcuts.open_settings]: 'openSettings',
    [shortcuts.recently_deleted]: 'openRecentlyDeleted',
  }
}

export function createKeyboardHandler(deps: KeyboardDeps): KeyboardHandler {
  function getKeyMappings(): Record<KeyContext, KeyMappings> {
    const shortcuts = deps.configManager.shortcuts

    return {
      searchInput: searchInputMappings(shortcuts),
      editMode: editModeMappings(shortcuts),
      noteContent: noteContentMappings(shortcuts),
      default: defaultMappings(shortcuts),
    }
  }

  /** The context whose keymap applies, or null when the keyboard is not ours. */
  function activeContext(): KeyContext | null {
    if (deps.configManager.isVisible || deps.isAnyDialogOpen()) return null
    if (deps.focusManager.isSearchInputFocused) return 'searchInput'
    if (deps.editorManager.isEditMode) return 'editMode'
    if (deps.focusManager.isNoteContentFocused) return 'noteContent'
    if (deps.searchManager.filteredNotes.length > 0) return 'default'
    return null
  }

  async function handleKeydown(event: KeyboardEvent): Promise<void> {
    // Settings and dialogs handle their own keys; swallow nothing else.
    if (deps.configManager.isVisible || deps.isAnyDialogOpen()) return

    // Platform convention, deliberately outside the keymaps.
    if (event.metaKey && event.key === ',') {
      event.preventDefault()
      await deps.commands.openSettings()
      return
    }

    const context = activeContext()
    if (!context) return

    const commandName = getKeyMappings()[context][formatKeyCombo(event)]
    if (!commandName) return

    event.preventDefault()
    await (deps.commands[commandName] as () => void | Promise<void>)()
  }

  return {
    keyMappings: getKeyMappings,
    handleKeydown,
  }
}
