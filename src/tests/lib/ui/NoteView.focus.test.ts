import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/svelte'
import NoteView from '../../../lib/ui/NoteView.svelte'
import { mockInvoke, resetAllMocks } from '../../test-utils'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}))

function renderNoteView() {
  const focusManager = {
    setNoteContentElement: vi.fn(),
  }

  const managers = {
    focusManager,
    contentManager: { highlightedContent: '<p>body</p>' },
    editorManager: { isEditMode: false },
    dialogManager: { openUnsavedChangesDialog: vi.fn() },
    appCoordinator: { selectedNote: 'note.md' },
    configManager: { isThemeInitialized: false, currentCodeTheme: null },
  }

  const result = render(NoteView, {
    context: new Map<string, unknown>([
      ['managers', managers],
      ['commands', { saveAndExitNote: vi.fn(), exitEditMode: vi.fn() }],
    ]),
  })

  return { ...result, focusManager }
}

describe('NoteView focus', () => {
  beforeEach(() => {
    resetAllMocks()
  })

  it('does not let a click park focus in the rendered note', () => {
    const { container } = renderNoteView()

    const content = container.querySelector('.note-content') as HTMLElement
    expect(content).not.toBeNull()

    // A tabindex here makes the div click-focusable, which strands focus in the
    // note: every search-context shortcut stops working until Escape. Asserted
    // on the attribute rather than by calling focus(), because happy-dom
    // focuses any element regardless of whether a browser would.
    expect(content.hasAttribute('tabindex')).toBe(false)
    expect(content.getAttribute('onfocus')).toBeNull()
  })

  it('still registers the element so scrolling can reach it', () => {
    const { focusManager } = renderNoteView()

    expect(focusManager.setNoteContentElement).toHaveBeenCalledWith(
      expect.any(HTMLElement)
    )
  })
})
