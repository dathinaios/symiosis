import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockInvoke, resetAllMocks } from '../../test-utils'
import type { EditorManager } from '../../../lib/core/editorManager.svelte'
import { createEditorManager } from '../../../lib/core/editorManager.svelte'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}))

// Create a fresh instance for each test
let editorManager: EditorManager
let mockNoteService: {
  getRawContent: ReturnType<typeof vi.fn>
  save: ReturnType<typeof vi.fn>
}

describe('editorManager', () => {
  let mockContentNavigationManager: {
    getCurrentHeaderText: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    resetAllMocks()
    // Create fresh editor manager instance with mock dependencies
    mockNoteService = {
      getRawContent: vi.fn(),
      save: vi.fn(),
    }

    mockContentNavigationManager = {
      getCurrentHeaderText: vi.fn().mockReturnValue(''),
    }

    editorManager = createEditorManager({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      noteService: mockNoteService as any,
      contentNavigationManager: mockContentNavigationManager,
    })
  })

  describe('state getters', () => {
    it('should initialize with default state', () => {
      expect(editorManager.isEditMode).toBe(false)
      expect(editorManager.editContent).toBe('')
      expect(editorManager.isDirty).toBe(false)
      expect(editorManager.nearestHeaderText).toBe('')
    })
  })

  describe('enterEditMode', () => {
    it('should enter edit mode with raw content from API', async () => {
      const mockRawContent = '# Test Note\n\nThis is raw content'
      mockNoteService.getRawContent.mockResolvedValue(mockRawContent)

      await editorManager.enterEditMode('test-note.md')

      expect(mockNoteService.getRawContent).toHaveBeenCalledWith('test-note.md')
      expect(editorManager.isEditMode).toBe(true)
      expect(editorManager.editContent).toBe(mockRawContent)
      expect(editorManager.isDirty).toBe(false)
    })

    it('should fallback to HTML content extraction if API fails', async () => {
      const mockHtmlContent = '<h1>Test Note</h1><p>This is HTML content</p>'
      mockNoteService.getRawContent.mockRejectedValue(new Error('API failed'))

      await editorManager.enterEditMode('test-note.md', mockHtmlContent)

      expect(editorManager.isEditMode).toBe(true)
      expect(editorManager.editContent).toBe(
        'Test Note\n\nThis is HTML content'
      )
    })

    it('should detect nearest header text when entering edit mode', async () => {
      const mockRawContent =
        '# Header 1\n\nSome content\n\n## Header 2\n\nMore content'
      mockNoteService.getRawContent.mockResolvedValue(mockRawContent)
      mockContentNavigationManager.getCurrentHeaderText.mockReturnValue(
        'Header 2'
      )

      await editorManager.enterEditMode('test-note.md')

      expect(
        mockContentNavigationManager.getCurrentHeaderText
      ).toHaveBeenCalled()
      expect(editorManager.nearestHeaderText).toBe('Header 2')
    })

    it('should handle missing note name', async () => {
      await editorManager.enterEditMode('')

      expect(editorManager.isEditMode).toBe(false)
      expect(mockNoteService.getRawContent).not.toHaveBeenCalled()
    })
  })

  describe('exitEditMode', () => {
    it('should exit edit mode and clear state', async () => {
      // First enter edit mode
      mockNoteService.getRawContent.mockResolvedValue('test content')
      await editorManager.enterEditMode('test-note.md')

      // Then exit
      editorManager.exitEditMode()

      expect(editorManager.isEditMode).toBe(false)
      expect(editorManager.editContent).toBe('')
      expect(editorManager.isDirty).toBe(false)
      expect(editorManager.nearestHeaderText).toBe('')
    })
  })

  describe('updateContent', () => {
    beforeEach(async () => {
      mockNoteService.getRawContent.mockResolvedValue('original content')
      await editorManager.enterEditMode('test-note.md')
    })

    it('should update content and mark as dirty', () => {
      editorManager.updateContent('modified content')

      expect(editorManager.editContent).toBe('modified content')
      expect(editorManager.isDirty).toBe(true)
    })

    it('should not mark as dirty if content matches original', () => {
      editorManager.updateContent('original content')

      expect(editorManager.editContent).toBe('original content')
      expect(editorManager.isDirty).toBe(false)
    })
  })

  describe('saveNote', () => {
    const mockNoteName = 'test-note.md'

    it('should save note content via API', async () => {
      mockNoteService.getRawContent.mockResolvedValue('original content')
      await editorManager.enterEditMode(mockNoteName)
      editorManager.updateContent('modified content')

      mockNoteService.save.mockResolvedValue(undefined)

      const result = await editorManager.saveNote()

      expect(mockNoteService.save).toHaveBeenCalledWith(
        mockNoteName,
        'modified content',
        'original content'
      )
      expect(result.success).toBe(true)
      expect(editorManager.isDirty).toBe(false)
    })

    it('should return error if save fails', async () => {
      mockNoteService.getRawContent.mockResolvedValue('original content')
      await editorManager.enterEditMode(mockNoteName)
      editorManager.updateContent('modified content')

      const error = new Error('Save failed')
      mockNoteService.save.mockRejectedValue(error)

      const result = await editorManager.saveNote()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Save failed')
      expect(editorManager.isDirty).toBe(true) // Should remain dirty on failure
    })

    it('keeps the backend reason when the save rejects with a string', async () => {
      mockNoteService.getRawContent.mockResolvedValue('original content')
      await editorManager.enterEditMode(mockNoteName)
      mockNoteService.save.mockRejectedValue('Permission denied')

      const result = await editorManager.saveNote()

      expect(result.error).toBe('Permission denied')
    })

    it('passes on a warning from a save that reached disk', async () => {
      mockNoteService.getRawContent.mockResolvedValue('original content')
      await editorManager.enterEditMode(mockNoteName)
      mockNoteService.save.mockResolvedValue('index rebuild failed')

      const result = await editorManager.saveNote()

      expect(result).toEqual({
        success: true,
        indexWarning: 'index rebuild failed',
      })
    })

    it('should handle no note being edited', async () => {
      const result = await editorManager.saveNote()

      expect(result.success).toBe(false)
      expect(result.error).toBe('No note being edited')
      expect(mockNoteService.save).not.toHaveBeenCalled()
    })

    it('should handle empty content', async () => {
      mockNoteService.getRawContent.mockResolvedValue('original content')
      await editorManager.enterEditMode(mockNoteName)
      editorManager.updateContent('')

      mockNoteService.save.mockResolvedValue(undefined)
      const result = await editorManager.saveNote()

      expect(mockNoteService.save).toHaveBeenCalledWith(
        mockNoteName,
        '',
        'original content'
      )
      expect(result.success).toBe(true)
    })
  })

  describe('openUnsavedChangesDialog integration', () => {
    it('should work with dirty state', async () => {
      mockNoteService.getRawContent.mockResolvedValue('content')
      await editorManager.enterEditMode('test.md')
      editorManager.updateContent('modified')

      expect(editorManager.isDirty).toBe(true)
      expect(editorManager.isEditMode).toBe(true)
    })
  })
})
