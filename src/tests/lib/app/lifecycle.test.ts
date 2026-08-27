/**
 * App Lifecycle Tests
 * Covers startup ordering and — importantly — that teardown releases every
 * Tauri subscription. Leaked listeners were the visible consequence of the
 * effect_orphan bug, so completeness of the unsubscribe is pinned here.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetAllMocks } from '../../test-utils'

/** One unlisten spy per `listen()` call, in registration order. */
const unlistenSpies: Array<ReturnType<typeof vi.fn>> = []
const listenedEvents: string[] = []
const listenHandlers = new Map<string, (event: { payload: unknown }) => void>()

const recordingListen = async (
  event: string,
  handler: (e: { payload: unknown }) => void
) => {
  listenedEvents.push(event)
  listenHandlers.set(event, handler)
  const unlisten = vi.fn()
  unlistenSpies.push(unlisten)
  return unlisten
}

const mockListen = vi.fn(recordingListen)

vi.mock('@tauri-apps/api/event', () => ({
  listen: mockListen,
}))

vi.mock('svelte', () => ({
  tick: vi.fn(() => Promise.resolve()),
}))

const { createAppLifecycle } = await import('../../../lib/app/lifecycle.svelte')
type Deps = Parameters<typeof createAppLifecycle>[0]

const FIXED_MODIFIED = 1_700_000_000

function createDeps(overrides: Partial<Deps> = {}): Deps {
  return {
    configManager: {
      initialize: vi.fn().mockResolvedValue(undefined),
      cleanup: vi.fn(),
    },
    configService: {
      exists: vi.fn().mockResolvedValue(true),
    },
    noteService: {
      initializeDatabase: vi.fn().mockResolvedValue({ success: true }),
    },
    searchManager: {
      executeSearch: vi.fn().mockResolvedValue([]),
      abort: vi.fn(),
    },
    focusManager: {
      focusSearch: vi.fn(),
      setSelectedIndex: vi.fn(),
    },
    progressManager: {
      start: vi.fn(),
      updateProgress: vi.fn(),
      complete: vi.fn(),
      setError: vi.fn(),
    },
    contentLoadingManager: {
      loadNoteContent: vi.fn().mockResolvedValue(undefined),
      refreshUI: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn(),
    },
    openSettingsPane: vi.fn().mockResolvedValue(undefined),
    onFirstRunDetected: vi.fn(),
    ...overrides,
  }
}

describe('appLifecycle', () => {
  beforeEach(() => {
    resetAllMocks()
    unlistenSpies.length = 0
    listenedEvents.length = 0
    listenHandlers.clear()
    // Restore the recording implementation: clearAllMocks() resets calls but
    // leaves a mockImplementation() override in place for later tests.
    mockListen.mockReset()
    mockListen.mockImplementation(recordingListen)
  })

  describe('start', () => {
    it('initialises config before subscribing to backend events', async () => {
      const order: string[] = []
      const deps = createDeps({
        configManager: {
          initialize: vi.fn().mockImplementation(async () => {
            order.push('config')
          }),
          cleanup: vi.fn(),
        },
      })
      mockListen.mockImplementation(async (event, handler) => {
        order.push(`listen:${event}`)
        return recordingListen(event, handler)
      })

      await createAppLifecycle(deps).start()

      expect(order[0]).toBe('config')
      expect(order.slice(1).every((o) => o.startsWith('listen:'))).toBe(true)
    })

    it('subscribes to every backend event the app relies on', async () => {
      await createAppLifecycle(createDeps()).start()

      expect(listenedEvents).toEqual(
        expect.arrayContaining([
          'open-preferences',
          'cache-refreshed',
          'first-run-detected',
          'db-loading-start',
          'db-loading-progress',
          'db-loading-complete',
          'db-loading-error',
        ])
      )
    })

    it('opens settings and skips database init when no config exists', async () => {
      const deps = createDeps({
        configService: { exists: vi.fn().mockResolvedValue(false) },
      })

      await createAppLifecycle(deps).start()

      expect(deps.openSettingsPane).toHaveBeenCalled()
      expect(deps.noteService.initializeDatabase).not.toHaveBeenCalled()
      expect(deps.searchManager.executeSearch).not.toHaveBeenCalled()
    })

    it('loads the first note when config exists and notes are found', async () => {
      const notes = [{ filename: 'first.md', modified: FIXED_MODIFIED }]
      const deps = createDeps({
        searchManager: {
          executeSearch: vi.fn().mockResolvedValue(notes),
          abort: vi.fn(),
        },
      })

      await createAppLifecycle(deps).start()

      expect(deps.noteService.initializeDatabase).toHaveBeenCalled()
      expect(deps.focusManager.focusSearch).toHaveBeenCalled()
      expect(deps.focusManager.setSelectedIndex).toHaveBeenCalledWith(0)
      expect(deps.contentLoadingManager.loadNoteContent).toHaveBeenCalledWith(
        'first.md'
      )
    })

    it('still starts when the database fails to initialise', async () => {
      const deps = createDeps({
        noteService: {
          initializeDatabase: vi
            .fn()
            .mockResolvedValue({ success: false, error: 'locked' }),
        },
      })

      await expect(createAppLifecycle(deps).start()).resolves.toBeInstanceOf(
        Function
      )
      expect(deps.searchManager.executeSearch).toHaveBeenCalled()
    })

    it('aborts note initialisation when the config check throws', async () => {
      const deps = createDeps({
        configService: {
          exists: vi.fn().mockRejectedValue(new Error('no config dir')),
        },
      })

      await createAppLifecycle(deps).start()

      expect(deps.noteService.initializeDatabase).not.toHaveBeenCalled()
      expect(deps.openSettingsPane).not.toHaveBeenCalled()
    })
  })

  describe('event handling', () => {
    it('routes progress events to the progress manager', async () => {
      const deps = createDeps()
      await createAppLifecycle(deps).start()

      listenHandlers.get('db-loading-start')?.({ payload: 'Starting…' })
      listenHandlers.get('db-loading-progress')?.({ payload: 'Halfway' })
      listenHandlers.get('db-loading-complete')?.({ payload: undefined })
      listenHandlers.get('db-loading-error')?.({ payload: 'Broke' })

      expect(deps.progressManager.start).toHaveBeenCalledWith('Starting…')
      expect(deps.progressManager.updateProgress).toHaveBeenCalledWith(
        'Halfway'
      )
      expect(deps.progressManager.complete).toHaveBeenCalled()
      expect(deps.progressManager.setError).toHaveBeenCalledWith('Broke')
    })

    it('reports a detected first run', async () => {
      const deps = createDeps()
      await createAppLifecycle(deps).start()

      listenHandlers.get('first-run-detected')?.({ payload: undefined })

      expect(deps.onFirstRunDetected).toHaveBeenCalled()
    })

    it('refreshes the UI when the backend reports a cache refresh', async () => {
      const deps = createDeps()
      await createAppLifecycle(deps).start()

      await listenHandlers.get('cache-refreshed')?.({ payload: undefined })

      expect(deps.contentLoadingManager.refreshUI).toHaveBeenCalled()
    })
  })

  describe('teardown', () => {
    it('releases every subscription it created', async () => {
      const deps = createDeps()
      const teardown = await createAppLifecycle(deps).start()

      expect(unlistenSpies.length).toBeGreaterThan(0)
      const registered = unlistenSpies.length

      teardown()

      const released = unlistenSpies.filter(
        (spy) => spy.mock.calls.length > 0
      ).length
      expect(released).toBe(registered)
    })

    it('aborts in-flight work and cleans up config', async () => {
      const deps = createDeps()
      const teardown = await createAppLifecycle(deps).start()

      teardown()

      expect(deps.searchManager.abort).toHaveBeenCalled()
      expect(deps.contentLoadingManager.abort).toHaveBeenCalled()
      expect(deps.configManager.cleanup).toHaveBeenCalled()
    })
  })
})
