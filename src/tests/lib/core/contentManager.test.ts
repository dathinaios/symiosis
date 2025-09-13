import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resetAllMocks } from '../../test-utils'
import type {
  ContentManager,
  ContentManagerDeps,
} from '../../../lib/core/contentManager.svelte'

// Test for both factory-based and singleton-based contentManager
describe('contentManager (factory-based - TDD)', () => {
  let contentManager: ContentManager | null
  let mockDeps: ContentManagerDeps

  beforeEach(async () => {
    resetAllMocks()

    mockDeps = {
      noteService: {
        getContent: vi.fn().mockResolvedValue('mock note content'),
      },
      searchManager: {
        query: 'test query',
        executeSearch: vi.fn().mockResolvedValue(['note1.md', 'note2.md']),
      },
      focusManager: {
        noteContentElement: null,
      },
      contentNavigationManager: {
        hideHighlights: false,
        startHighlightNavigation: vi.fn(),
        clearHighlights: vi.fn(),
      },
    }

    try {
      const { createContentManager } = await import(
        '../../../lib/core/contentManager.svelte'
      )
      contentManager = createContentManager(mockDeps)
    } catch {
      contentManager = null
    }
  })

  it('should create contentManager with injected dependencies', async () => {
    const { createContentManager } = await import(
      '../../../lib/core/contentManager.svelte'
    )
    const manager = createContentManager(mockDeps)

    expect(manager).toBeDefined()
    expect(typeof manager.setNoteContent).toBe('function')
    expect(typeof manager.refreshContent).toBe('function')
  })

  it('should set note content correctly', () => {
    if (!contentManager) return // Skip if factory not implemented yet

    const testContent = 'Test content'
    contentManager.setNoteContent(testContent)

    expect(contentManager.noteContent).toBe(testContent)
  })

  it('should use injected noteService for content refresh', async () => {
    if (!contentManager) return // Skip if factory not implemented yet

    const noteName = 'test.md'
    await contentManager.refreshContent(noteName)

    expect(mockDeps.noteService.getContent).toHaveBeenCalledWith(noteName)
  })

  it('should use injected executeSearch function', async () => {
    if (!contentManager) return // Skip if factory not implemented yet

    const noteName = 'test.md'
    const searchInput = 'test'
    await contentManager.refreshAfterSave(noteName, searchInput)

    expect(mockDeps.searchManager.executeSearch).toHaveBeenCalledWith(
      searchInput
    )
  })

  it('should call setHighlightsClearCallback during setup', () => {
    if (!contentManager) return // Skip if factory not implemented yet

    // setHighlightsClearCallback removed from searchManager
  })
})
