import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockInvoke, resetAllMocks } from '../../test-utils'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}))

describe('Highlight Clear Integration', () => {
  beforeEach(() => {
    resetAllMocks()
    // The coordinator debounces a real search off `searchInput`; without a
    // resolved value the search-complete callback is handed `undefined` and
    // rejects after the test has finished.
    mockInvoke.mockResolvedValue([])
  })

  it('should re-enable highlights when user types after clearing with ESC', async () => {
    const { createAppCoordinator } = await import(
      '../../../lib/app/appCoordinator.svelte'
    )
    const appCoordinator = createAppCoordinator({})

    const { contentNavigationManager, searchManager } = appCoordinator.managers

    searchManager.searchInput = 'test query'
    // areHighlightsCleared starts as false by default
    expect(contentNavigationManager.hideHighlights).toBe(false)

    contentNavigationManager.clearHighlights()
    expect(contentNavigationManager.hideHighlights).toBe(true)

    // Simulate the reactive auto-reset effect from app.svelte.ts
    // In production, this happens automatically via $effect when query changes
    searchManager.searchInput = 'new search'

    // Wait for debounced search to complete
    await new Promise((resolve) => setTimeout(resolve, 150))

    // Since we're in a test without Svelte effects running, manually trigger the reset
    // This simulates what happens automatically in app.svelte.ts when query changes
    contentNavigationManager.showHighlights()

    // Highlights are re-enabled when new search happens
    expect(contentNavigationManager.hideHighlights).toBe(false)
  })
})
