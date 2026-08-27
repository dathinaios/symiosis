/**
 * Content Loading Manager Tests
 * Covers request sequencing, stale-response guarding and the refresh flows
 * that were previously buried in appCoordinator and only tested indirectly.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createContentLoadingManager,
  type ContentLoadingManagerDeps,
} from '../../../lib/core/contentLoadingManager.svelte'
import type { NoteMetadata } from '../../../lib/types/note'
import { resetAllMocks } from '../../test-utils'

const FIXED_MODIFIED = 1_700_000_000

const toMetadata = (filenames: string[]): NoteMetadata[] =>
  filenames.map((filename) => ({ filename, modified: FIXED_MODIFIED }))

function createDeps(
  overrides: Partial<ContentLoadingManagerDeps> = {}
): ContentLoadingManagerDeps {
  return {
    contentManager: {
      setNoteContent: vi.fn(),
      scrollToFirstMatch: vi.fn(),
      refreshContent: vi.fn().mockResolvedValue('content'),
    },
    contentNavigationManager: {
      resetNavigation: vi.fn(),
    },
    searchManager: {
      searchInput: '',
      filteredNotes: [],
      executeSearch: vi.fn().mockResolvedValue([]),
    },
    focusManager: {
      setSelectedIndex: vi.fn(),
    },
    configService: {
      refreshCache: vi.fn().mockResolvedValue(undefined),
    },
    getSelectedNote: () => null,
    ...overrides,
  }
}

describe('contentLoadingManager', () => {
  beforeEach(() => {
    resetAllMocks()
    vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => {
      cb(0)
      return 0
    })
  })

  describe('loadNoteContent', () => {
    it('loads content for the requested note', async () => {
      const deps = createDeps()
      const manager = createContentLoadingManager(deps)

      await manager.loadNoteContent('note1.md')

      expect(deps.contentManager.refreshContent).toHaveBeenCalledWith(
        'note1.md'
      )
    })

    it('clears content when given an empty note name', async () => {
      const deps = createDeps()
      const manager = createContentLoadingManager(deps)

      await manager.loadNoteContent('')

      expect(deps.contentManager.setNoteContent).toHaveBeenCalledWith('')
      expect(deps.contentManager.refreshContent).not.toHaveBeenCalled()
    })

    it('resets navigation when switching notes but not when reloading the same one', async () => {
      const deps = createDeps()
      const manager = createContentLoadingManager(deps)

      await manager.loadNoteContent('note1.md')
      expect(
        deps.contentNavigationManager.resetNavigation
      ).toHaveBeenCalledTimes(1)

      await manager.loadNoteContent('note1.md')
      expect(
        deps.contentNavigationManager.resetNavigation
      ).toHaveBeenCalledTimes(1)

      await manager.loadNoteContent('note2.md')
      expect(
        deps.contentNavigationManager.resetNavigation
      ).toHaveBeenCalledTimes(2)
    })

    it('scrolls to the first match once a load completes', async () => {
      const deps = createDeps()
      const manager = createContentLoadingManager(deps)

      await manager.loadNoteContent('note1.md')

      expect(deps.contentManager.scrollToFirstMatch).toHaveBeenCalled()
    })
  })

  describe('stale request guarding', () => {
    it('does not scroll for a superseded request', async () => {
      // The slow first load resolves after a second load has already started.
      let resolveFirst: (value: string) => void = () => {}
      const refreshContent = vi
        .fn()
        .mockImplementationOnce(
          () => new Promise<string>((resolve) => (resolveFirst = resolve))
        )
        .mockResolvedValueOnce('second content')

      const deps = createDeps({
        contentManager: {
          setNoteContent: vi.fn(),
          scrollToFirstMatch: vi.fn(),
          refreshContent,
        },
      })
      const manager = createContentLoadingManager(deps)

      const first = manager.loadNoteContent('slow.md')
      await manager.loadNoteContent('fast.md')

      const scrollsAfterSecond = (
        deps.contentManager.scrollToFirstMatch as ReturnType<typeof vi.fn>
      ).mock.calls.length

      resolveFirst('slow content')
      await first

      expect(
        (deps.contentManager.scrollToFirstMatch as ReturnType<typeof vi.fn>)
          .mock.calls.length
      ).toBe(scrollsAfterSecond)
    })

    it('cancels a scheduled scroll when a newer load starts before the frame fires', async () => {
      // Pins the guard *inside* requestAnimationFrame specifically: the scroll
      // is scheduled while the request is still current, and only becomes
      // stale between scheduling and the frame running.
      const frames: ((time: number) => void)[] = []
      vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => {
        frames.push(cb)
        return frames.length
      })

      const deps = createDeps()
      const manager = createContentLoadingManager(deps)

      await manager.loadNoteContent('first.md')
      expect(frames).toHaveLength(1)
      expect(deps.contentManager.scrollToFirstMatch).not.toHaveBeenCalled()

      // A newer load supersedes it, then the pending frame finally runs.
      await manager.loadNoteContent('second.md')
      frames[0](0)

      expect(deps.contentManager.scrollToFirstMatch).not.toHaveBeenCalled()

      // The newer request's own frame still scrolls.
      frames[1](0)
      expect(deps.contentManager.scrollToFirstMatch).toHaveBeenCalledTimes(1)
    })

    it('does not report an error from a superseded request', async () => {
      let rejectFirst: (reason: unknown) => void = () => {}
      const refreshContent = vi
        .fn()
        .mockImplementationOnce(
          () => new Promise<string>((_, reject) => (rejectFirst = reject))
        )
        .mockResolvedValueOnce('second content')

      const deps = createDeps({
        contentManager: {
          setNoteContent: vi.fn(),
          scrollToFirstMatch: vi.fn(),
          refreshContent,
        },
      })
      const manager = createContentLoadingManager(deps)

      const first = manager.loadNoteContent('slow.md')
      await manager.loadNoteContent('fast.md')

      rejectFirst(new Error('stale failure'))
      await first

      const errorWrites = (
        deps.contentManager.setNoteContent as ReturnType<typeof vi.fn>
      ).mock.calls.filter(([content]) =>
        String(content).startsWith('Error loading note:')
      )
      expect(errorWrites).toHaveLength(0)
    })
  })

  describe('error handling', () => {
    it('surfaces load failures as note content', async () => {
      const deps = createDeps({
        contentManager: {
          setNoteContent: vi.fn(),
          scrollToFirstMatch: vi.fn(),
          refreshContent: vi.fn().mockRejectedValue(new Error('boom')),
        },
      })
      const manager = createContentLoadingManager(deps)

      await manager.loadNoteContent('note1.md')

      expect(deps.contentManager.setNoteContent).toHaveBeenCalledWith(
        expect.stringContaining('Error loading note:')
      )
    })

    it('rebuilds the cache when the note is missing from the index', async () => {
      const deps = createDeps({
        contentManager: {
          setNoteContent: vi.fn(),
          scrollToFirstMatch: vi.fn(),
          refreshContent: vi
            .fn()
            .mockRejectedValue(new Error('Note not found')),
        },
      })
      const manager = createContentLoadingManager(deps)

      await manager.loadNoteContent('ghost.md')

      expect(deps.configService.refreshCache).toHaveBeenCalled()
    })

    it('does not rebuild the cache for unrelated failures', async () => {
      const deps = createDeps({
        contentManager: {
          setNoteContent: vi.fn(),
          scrollToFirstMatch: vi.fn(),
          refreshContent: vi.fn().mockRejectedValue(new Error('disk on fire')),
        },
      })
      const manager = createContentLoadingManager(deps)

      await manager.loadNoteContent('note1.md')

      expect(deps.configService.refreshCache).not.toHaveBeenCalled()
    })
  })

  describe('refreshUI', () => {
    it('re-runs the current search and restores the selected note', async () => {
      const notes = toMetadata(['a.md', 'b.md', 'c.md'])
      const deps = createDeps({
        searchManager: {
          searchInput: 'query',
          filteredNotes: notes,
          executeSearch: vi.fn().mockResolvedValue(notes),
        },
        getSelectedNote: () => 'b.md',
      })
      const manager = createContentLoadingManager(deps)

      await manager.refreshUI()

      expect(deps.searchManager.executeSearch).toHaveBeenCalledWith('query')
      expect(deps.focusManager.setSelectedIndex).toHaveBeenCalledWith(1)
      expect(deps.contentManager.refreshContent).toHaveBeenCalledWith('b.md')
    })

    it('leaves selection alone when the note is gone after refresh', async () => {
      const notes = toMetadata(['a.md'])
      const deps = createDeps({
        searchManager: {
          searchInput: '',
          filteredNotes: notes,
          executeSearch: vi.fn().mockResolvedValue(notes),
        },
        getSelectedNote: () => 'deleted.md',
      })
      const manager = createContentLoadingManager(deps)

      await manager.refreshUI()

      expect(deps.focusManager.setSelectedIndex).not.toHaveBeenCalled()
      expect(deps.contentManager.refreshContent).not.toHaveBeenCalled()
    })
  })

  describe('refreshCacheAndUI', () => {
    it('refreshes the backend cache before the UI', async () => {
      const order: string[] = []
      const deps = createDeps({
        configService: {
          refreshCache: vi.fn().mockImplementation(async () => {
            order.push('cache')
          }),
        },
        searchManager: {
          searchInput: '',
          filteredNotes: [],
          executeSearch: vi.fn().mockImplementation(async () => {
            order.push('search')
            return []
          }),
        },
      })
      const manager = createContentLoadingManager(deps)

      await manager.refreshCacheAndUI()

      expect(order).toEqual(['cache', 'search'])
    })
  })

  describe('abort', () => {
    it('is safe to call when nothing is in flight', () => {
      const manager = createContentLoadingManager(createDeps())
      expect(() => manager.abort()).not.toThrow()
    })
  })
})
