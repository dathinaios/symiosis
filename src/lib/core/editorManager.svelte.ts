/**
 * Core Layer - Editor Manager
 * Note editing state including edit mode, content changes, and save operations.
 * Handles raw content loading, dirty state tracking, and nearest header detection.
 */

import type { createNoteService } from '../services/noteService.svelte'
import type { EditorView } from 'codemirror'
import { convertHtmlToText } from '../utils/htmlParser'

interface EditorState {
  isEditMode: boolean
  editContent: string
  originalContent: string
  nearestHeaderText: string
  editingNoteName: string | null
  exitHeaderText: string
  exitCaptured: boolean
  editorView: EditorView | null
}

interface SaveResult {
  success: boolean
  error?: string
}

interface EditorManagerDeps {
  noteService: ReturnType<typeof createNoteService>
  contentNavigationManager: {
    getCurrentHeaderText(): string
  }
}

export interface EditorManager {
  readonly isEditMode: boolean
  readonly editContent: string
  readonly isDirty: boolean
  readonly nearestHeaderText: string
  readonly editingNoteName: string | null
  enterEditMode(noteName: string, fallbackHtmlContent?: string): Promise<void>
  exitEditMode(): string
  updateContent(newContent: string): void
  saveNote(): Promise<SaveResult>
  setExitHeaderText(headerText: string): void
  setEditorView(editorView: EditorView | null): void
  captureExitPosition(
    onExitHeaderCapture?: ((headerText: string) => void) | null,
    onExitCursorCapture?: ((line: number, column: number) => void) | null
  ): void
}

export function createEditorManager(deps: EditorManagerDeps): EditorManager {
  const state = $state<EditorState>({
    isEditMode: false,
    editContent: '',
    originalContent: '',
    nearestHeaderText: '',
    editingNoteName: null,
    exitHeaderText: '',
    exitCaptured: false,
    editorView: null,
  })

  async function enterEditMode(
    noteName: string,
    fallbackHtmlContent?: string
  ): Promise<void> {
    if (!validateNoteNameForEdit(noteName)) {
      return
    }

    prepareEditModeState()
    await loadEditContent(noteName, fallbackHtmlContent)
  }

  function validateNoteNameForEdit(noteName: string): boolean {
    return Boolean(noteName)
  }

  function prepareEditModeState(): void {
    state.nearestHeaderText =
      deps.contentNavigationManager.getCurrentHeaderText()
  }

  async function loadEditContent(
    noteName: string,
    fallbackHtmlContent?: string
  ): Promise<void> {
    try {
      await loadRawContentForEdit(noteName)
    } catch (e) {
      console.error('Failed to load raw note content:', e)
      handleRawContentLoadFailure(noteName, fallbackHtmlContent)
    }
  }

  async function loadRawContentForEdit(noteName: string): Promise<void> {
    const rawContent = await deps.noteService.getRawContent(noteName)
    setEditState(rawContent, noteName)
  }

  function handleRawContentLoadFailure(
    noteName: string,
    fallbackHtmlContent?: string
  ): void {
    if (fallbackHtmlContent) {
      const extractedContent = convertHtmlToText(fallbackHtmlContent)
      setEditState(extractedContent, noteName)
    }
  }

  function setEditState(content: string, noteName: string): void {
    state.isEditMode = true
    state.editContent = content
    state.originalContent = content
    state.editingNoteName = noteName
  }

  function exitEditMode(): string {
    const exitHeader = state.exitHeaderText
    state.isEditMode = false
    state.editContent = ''
    state.originalContent = ''
    state.nearestHeaderText = ''
    state.editingNoteName = null
    state.exitHeaderText = ''
    state.exitCaptured = false
    state.editorView = null
    return exitHeader
  }

  function setExitHeaderText(headerText: string): void {
    state.exitHeaderText = headerText
  }

  function updateContent(newContent: string): void {
    state.editContent = newContent
  }

  function setEditorView(editorView: EditorView | null): void {
    state.editorView = editorView
  }

  function findNearestHeaderAtCursor(): string {
    if (!state.editorView) return ''

    const cursorInfo = getCursorInformation()
    return findHeaderAboveCursor(cursorInfo.lines, cursorInfo.cursorLine)
  }

  function getCursorInformation(): { lines: string[]; cursorLine: number } {
    const doc = state.editorView!.state.doc
    const cursorPos = state.editorView!.state.selection.main.head
    const fullText = doc.toString()
    const lines = fullText.split('\n')
    const cursorLine = calculateCursorLine(lines, cursorPos)

    return { lines, cursorLine }
  }

  function calculateCursorLine(lines: string[], cursorPos: number): number {
    let charCount = 0

    for (let i = 0; i < lines.length; i++) {
      if (charCount + lines[i].length >= cursorPos) {
        return i
      }
      charCount += lines[i].length + 1
    }

    return 0
  }

  function findHeaderAboveCursor(lines: string[], cursorLine: number): string {
    for (let i = cursorLine; i >= 0; i--) {
      const line = lines[i].trim()
      if (isHeaderLine(line)) {
        return line
      }
    }

    return ''
  }

  function isHeaderLine(line: string): boolean {
    return line.match(/^#{1,6}\s+/) !== null
  }

  function captureExitPosition(
    onExitHeaderCapture?: ((headerText: string) => void) | null,
    onExitCursorCapture?: ((line: number, column: number) => void) | null
  ): void {
    if (state.editorView && !state.exitCaptured) {
      state.exitCaptured = true
      if (onExitHeaderCapture) {
        try {
          const headerText = findNearestHeaderAtCursor()
          onExitHeaderCapture(headerText)
        } catch (error) {
          console.warn('Error in onExitHeaderCapture callback:', error)
        }
      }

      if (onExitCursorCapture) {
        try {
          const pos = state.editorView.state.selection.main.head
          const line = state.editorView.state.doc.lineAt(pos)
          const lineNumber = line.number
          const column = pos - line.from + 1
          onExitCursorCapture(lineNumber, column)
        } catch (error) {
          console.warn('Error in onExitCursorCapture callback:', error)
        }
      }
    }
  }

  async function saveNote(): Promise<SaveResult> {
    if (!state.editingNoteName) {
      return {
        success: false,
        error: 'No note being edited',
      }
    }

    try {
      await deps.noteService.save(
        state.editingNoteName,
        state.editContent,
        state.originalContent
      )

      state.originalContent = state.editContent

      return { success: true }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Save failed'
      console.error('Failed to save note:', e)

      return {
        success: false,
        error: errorMessage,
      }
    }
  }

  return {
    get isEditMode() {
      return state.isEditMode
    },

    get editContent() {
      return state.editContent
    },

    get isDirty() {
      return state.editContent !== state.originalContent
    },

    get nearestHeaderText() {
      return state.nearestHeaderText
    },

    get editingNoteName() {
      return state.editingNoteName
    },

    enterEditMode,
    exitEditMode,
    updateContent,
    saveNote,
    setExitHeaderText,
    setEditorView,
    captureExitPosition,
  }
}
