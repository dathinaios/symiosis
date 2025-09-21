import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { createConfigManager } from '$lib/core/configManager.svelte'

// Mock Tauri APIs
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}))

describe('configManager', () => {
  let manager: ReturnType<typeof createConfigManager>
  let mockUnlisten: ReturnType<typeof vi.fn>
  let mockInvoke: ReturnType<typeof vi.fn>
  let mockListen: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()

    const { invoke } = await import('@tauri-apps/api/core')
    const { listen } = await import('@tauri-apps/api/event')
    mockInvoke = invoke as ReturnType<typeof vi.fn>
    mockListen = listen as ReturnType<typeof vi.fn>

    mockUnlisten = vi.fn()
    mockListen.mockResolvedValue(mockUnlisten)
    manager = createConfigManager()
  })

  afterEach(() => {
    manager.cleanup()
  })

  describe('initial state', () => {
    it('should have default values before initialization', () => {
      expect(manager.notesDirectory).toBe('')
      expect(manager.preferences.max_search_results).toBe(100)
      expect(manager.globalShortcut).toBe('Ctrl+Shift+N')
      expect(manager.editor.mode).toBe('basic')
      expect(manager.interface.markdown_render_theme).toBe('modern_dark')
      expect(manager.isLoading).toBe(false)
      expect(manager.error).toBe(null)
      expect(manager.isInitialized).toBe(false)
      expect(manager.isThemeInitialized).toBe(false)
    })
  })

  describe('initialize', () => {
    it('should initialize successfully with config values', async () => {
      // Mock config service responses
      mockInvoke
        .mockResolvedValueOnce({ scroll_amount: 0.4 }) // getGeneralConfig
        .mockResolvedValueOnce({
          ui_theme: 'gruvbox-dark',
          font_family: 'Inter, sans-serif',
          font_size: 14,
          editor_font_family: 'JetBrains Mono, Consolas, monospace',
          editor_font_size: 14,
          markdown_render_theme: 'modern_dark',
          md_render_code_theme: 'gruvbox-dark-medium',
          always_on_top: false,
        }) // getInterfaceConfig
        .mockResolvedValueOnce({
          mode: 'vim',
          theme: 'gruvbox-dark',
          word_wrap: true,
          tab_size: 2,
          show_line_numbers: true,
        }) // getEditorConfig
        .mockResolvedValueOnce({}) // getShortcutsConfig
        .mockResolvedValueOnce({ max_search_results: 100 }) // getPreferencesConfig

      await manager.initialize()

      expect(manager.editor.mode).toBe('vim')
      expect(manager.interface.markdown_render_theme).toBe('modern_dark')
      expect(manager.isInitialized).toBe(true)
      expect(manager.isThemeInitialized).toBe(true)
      expect(manager.isLoading).toBe(false)
      expect(manager.error).toBe(null)
      expect(mockListen).toHaveBeenCalledWith(
        'config-updated',
        expect.any(Function)
      )
    })

    it('should handle initialization errors gracefully', async () => {
      const errorMessage = 'Config fetch failed'
      mockInvoke.mockRejectedValue(new Error(errorMessage))

      await manager.initialize()

      // Should have default values from configService
      expect(manager.editor.mode).toBe('basic')
      expect(manager.interface.markdown_render_theme).toBe('modern_dark')
    })

    it('should not re-initialize if already initialized', async () => {
      // First initialization
      mockInvoke
        .mockResolvedValueOnce({ scroll_amount: 0.4 }) // getGeneralConfig
        .mockResolvedValueOnce({ ui_theme: 'gruvbox-dark' }) // getInterfaceConfig
        .mockResolvedValueOnce({ mode: 'vim' }) // getEditorConfig
        .mockResolvedValueOnce({}) // getShortcutsConfig
        .mockResolvedValueOnce({}) // getPreferencesConfig

      await manager.initialize()
      expect(manager.isInitialized).toBe(true)

      // Clear mocks and try to initialize again
      vi.clearAllMocks()
      await manager.initialize()

      // Should not have called the config functions again
      expect(mockInvoke).not.toHaveBeenCalled()
    })
  })

  describe('config updates', () => {
    it('should handle config-updated events', async () => {
      let configChangeHandler: (event: { payload: unknown }) => void

      mockListen.mockImplementation((eventName, handler) => {
        if (eventName === 'config-updated') {
          configChangeHandler = handler
        }
        return Promise.resolve(mockUnlisten)
      })

      // Initialize manager
      mockInvoke
        .mockResolvedValueOnce({ scroll_amount: 0.4 }) // getGeneralConfig
        .mockResolvedValueOnce({ ui_theme: 'gruvbox-dark' }) // getInterfaceConfig
        .mockResolvedValueOnce({ mode: 'basic' }) // getEditorConfig
        .mockResolvedValueOnce({}) // getShortcutsConfig
        .mockResolvedValueOnce({}) // getPreferencesConfig

      await manager.initialize()

      // Simulate config change event
      const newConfig = {
        notes_directory: '/new/path',
        global_shortcut: 'Ctrl+Alt+N',
        general: { scroll_amount: 0.4 },
        interface: {
          ui_theme: 'one-dark',
          font_family: 'Arial',
          font_size: 16,
          editor_font_family: 'Monaco',
          editor_font_size: 12,
          markdown_render_theme: 'modern_dark',
          md_render_code_theme: 'atom-one-dark',
          always_on_top: false,
        },
        editor: {
          mode: 'vim',
          theme: 'one-dark',
          word_wrap: true,
          tab_size: 2,
          show_line_numbers: true,
        },
        shortcuts: {},
        preferences: { max_search_results: 50 },
      }

      configChangeHandler!({ payload: newConfig })

      expect(manager.notesDirectory).toBe('/new/path')
      expect(manager.preferences.max_search_results).toBe(50)
      expect(manager.globalShortcut).toBe('Ctrl+Alt+N')
      expect(manager.editor.mode).toBe('vim')
      expect(manager.interface.markdown_render_theme).toBe('modern_dark')
    })
  })

  describe('forceRefresh', () => {
    it('should refresh config from backend', async () => {
      // Initial setup
      await manager.initialize()

      // Mock refresh responses
      mockInvoke
        .mockResolvedValueOnce(undefined) // refresh_cache
        .mockResolvedValueOnce({ scroll_amount: 0.4 }) // getGeneralConfig
        .mockResolvedValueOnce({ ui_theme: 'one-dark' }) // getInterfaceConfig
        .mockResolvedValueOnce({ mode: 'vim' }) // getEditorConfig
        .mockResolvedValueOnce({}) // getShortcutsConfig
        .mockResolvedValueOnce({}) // getPreferencesConfig

      await manager.forceRefresh()

      expect(manager.editor.mode).toBe('vim')
      expect(manager.interface.ui_theme).toBe('one-dark')
      expect(manager.error).toBe(null)
    })

    it('should handle refresh errors', async () => {
      await manager.initialize()

      const errorMessage = 'Refresh failed'
      mockInvoke.mockRejectedValue(new Error(errorMessage))

      await manager.forceRefresh()

      expect(manager.error).toContain('Failed to refresh config')
      expect(manager.isLoading).toBe(false)
    })
  })

  describe('cleanup', () => {
    it('should cleanup listeners and reset state', async () => {
      await manager.initialize()

      expect(manager.isInitialized).toBe(true)

      manager.cleanup()

      expect(mockUnlisten).toHaveBeenCalled()
      expect(manager.isInitialized).toBe(false)
      expect(manager.isThemeInitialized).toBe(false)
    })
  })

  describe('theme management', () => {
    it('should provide current theme information', async () => {
      mockInvoke
        .mockResolvedValueOnce({ scroll_amount: 0.4 }) // getGeneralConfig
        .mockResolvedValueOnce({
          ui_theme: 'one-dark',
          markdown_render_theme: 'modern_dark',
          md_render_code_theme: 'atom-one-dark',
          font_family: 'Inter, sans-serif',
          font_size: 14,
          editor_font_family: 'JetBrains Mono, Consolas, monospace',
          editor_font_size: 14,
          always_on_top: false,
        }) // getInterfaceConfig
        .mockResolvedValueOnce({}) // getEditorConfig
        .mockResolvedValueOnce({}) // getShortcutsConfig
        .mockResolvedValueOnce({}) // getPreferencesConfig

      await manager.initialize()

      expect(manager.currentUITheme).toBe('one-dark')
      expect(manager.currentMarkdownTheme).toBe('modern_dark')
      expect(manager.currentCodeTheme).toBe('atom-one-dark')
    })

    it('should handle mixed success/failure during initialization', async () => {
      // Mock partial success - some calls succeed, others fail
      mockInvoke
        .mockResolvedValueOnce({ scroll_amount: 0.4 }) // getGeneralConfig succeeds
        .mockResolvedValueOnce({
          ui_theme: 'gruvbox-dark',
          markdown_render_theme: 'modern_dark',
          md_render_code_theme: 'gruvbox-dark-medium',
          font_family: 'Inter, sans-serif',
          font_size: 14,
          editor_font_family: 'JetBrains Mono, Consolas, monospace',
          editor_font_size: 14,
          always_on_top: false,
        }) // getInterfaceConfig succeeds
        .mockResolvedValueOnce({ mode: 'vim' }) // getEditorConfig succeeds
        .mockRejectedValueOnce(new Error('Shortcut error')) // getShortcutsConfig fails
        .mockRejectedValueOnce(new Error('Preferences error')) // getPreferencesConfig fails

      await manager.initialize()

      // Should have mix of actual and default values
      expect(manager.editor.mode).toBe('vim') // Successfully fetched
      expect(manager.interface.markdown_render_theme).toBe('modern_dark') // From successful getInterfaceConfig
    })
  })
})
