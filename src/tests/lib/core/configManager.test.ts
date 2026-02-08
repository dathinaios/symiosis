import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { createConfigManager } from '$lib/core/configManager.svelte'

// Mock Tauri APIs
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}))

const mockDefaultConfig = {
  notes_directory: '/default/notes',
  global_shortcut: 'Ctrl+Shift+N',
  general: { scroll_amount: 0.4 },
  interface: {
    ui_theme: 'gruvbox-dark',
    font_family: 'Inter, sans-serif',
    font_size: 14,
    editor_font_family: 'JetBrains Mono, Consolas, monospace',
    editor_font_size: 14,
    markdown_render_theme: 'modern-dark',
    md_render_code_theme: 'gruvbox-dark-medium',
    always_on_top: false,
    window_decorations: true,
  },
  editor: {
    mode: 'basic',
    theme: 'gruvbox-dark',
    word_wrap: true,
    tab_size: 2,
    expand_tabs: true,
    show_line_numbers: true,
  },
  shortcuts: {
    create_note: 'Ctrl+Enter',
    rename_note: 'Ctrl+m',
    delete_note: 'Ctrl+x',
    edit_note: 'Enter',
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
    navigate_code_previous: 'Ctrl+Alt+h',
    navigate_code_next: 'Ctrl+Alt+l',
    navigate_link_previous: 'Ctrl+h',
    navigate_link_next: 'Ctrl+l',
    copy_current_section: 'Ctrl+y',
    open_settings: 'Meta+,',
    version_explorer: 'Ctrl+/',
    recently_deleted: 'Ctrl+.',
  },
  preferences: { max_search_results: 100 },
}

function mockInvokeResponses(
  mockInvoke: ReturnType<typeof vi.fn>,
  overrides: Record<string, unknown> = {}
) {
  const responses: Record<string, unknown> = {
    get_default_config: mockDefaultConfig,
    get_general_config: { scroll_amount: 0.4 },
    get_interface_config: {
      ui_theme: 'gruvbox-dark',
      font_family: 'Inter, sans-serif',
      font_size: 14,
      editor_font_family: 'JetBrains Mono, Consolas, monospace',
      editor_font_size: 14,
      markdown_render_theme: 'modern-dark',
      md_render_code_theme: 'gruvbox-dark-medium',
      always_on_top: false,
    },
    get_editor_config: {
      mode: 'basic',
      theme: 'gruvbox-dark',
      word_wrap: true,
      tab_size: 2,
      expand_tabs: true,
      show_line_numbers: true,
    },
    get_shortcuts_config: mockDefaultConfig.shortcuts,
    get_preferences_config: { max_search_results: 100 },
    scan_available_themes: {
      ui_themes: ['gruvbox-dark', 'article', 'modern-dark'],
      markdown_themes: ['modern-dark', 'article', 'gruvbox-dark'],
    },
    ...overrides,
  }

  mockInvoke.mockImplementation((command: string) => {
    if (command in responses) {
      const value = responses[command]
      if (value instanceof Error) {
        return Promise.reject(value)
      }
      return Promise.resolve(value)
    }
    return Promise.resolve(undefined)
  })
}

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
    it('should have placeholder values before initialization', () => {
      expect(manager.notesDirectory).toBe('')
      expect(manager.preferences.max_search_results).toBe(0)
      expect(manager.globalShortcut).toBe('')
      expect(manager.editor.mode).toBe('')
      expect(manager.interface.markdown_render_theme).toBe('')
      expect(manager.isLoading).toBe(false)
      expect(manager.error).toBe(null)
      expect(manager.isInitialized).toBe(false)
      expect(manager.isThemeInitialized).toBe(false)
    })
  })

  describe('initialize', () => {
    it('should initialize successfully with config values', async () => {
      mockInvokeResponses(mockInvoke, {
        get_editor_config: {
          mode: 'vim',
          theme: 'gruvbox-dark',
          word_wrap: true,
          tab_size: 2,
          show_line_numbers: true,
        },
      })

      await manager.initialize()

      expect(manager.editor.mode).toBe('vim')
      expect(manager.interface.markdown_render_theme).toBe('modern-dark')
      expect(manager.isInitialized).toBe(true)
      expect(manager.isThemeInitialized).toBe(true)
      expect(manager.isLoading).toBe(false)
      expect(manager.error).toBe(null)
      expect(mockListen).toHaveBeenCalledWith(
        'config-updated',
        expect.any(Function)
      )
    })

    it('should fall back to defaults when config fetches fail', async () => {
      mockInvoke.mockRejectedValue(new Error('Config fetch failed'))

      await manager.initialize()

      expect(manager.editor.mode).toBe('basic')
      expect(manager.interface.markdown_render_theme).toBe('modern-dark')
      expect(manager.preferences.max_search_results).toBe(100)
      expect(manager.isInitialized).toBe(true)
    })

    it('should not re-initialize if already initialized', async () => {
      mockInvokeResponses(mockInvoke)

      await manager.initialize()
      expect(manager.isInitialized).toBe(true)

      vi.clearAllMocks()
      await manager.initialize()

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

      mockInvokeResponses(mockInvoke)

      await manager.initialize()

      const newConfig = {
        notes_directory: '/new/path',
        global_shortcut: 'Ctrl+Alt+N',
        general: { scroll_amount: 0.4 },
        interface: {
          ui_theme: 'article',
          font_family: 'Arial',
          font_size: 16,
          editor_font_family: 'Monaco',
          editor_font_size: 12,
          markdown_render_theme: 'modern-dark',
          md_render_code_theme: 'atom-one-dark',
          always_on_top: false,
        },
        editor: {
          mode: 'vim',
          theme: 'gruvbox-dark',
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
      expect(manager.interface.markdown_render_theme).toBe('modern-dark')
    })
  })

  describe('forceRefresh', () => {
    it('should refresh config from backend', async () => {
      mockInvokeResponses(mockInvoke)
      await manager.initialize()

      mockInvokeResponses(mockInvoke, {
        get_interface_config: {
          ui_theme: 'article',
          font_family: 'Inter, sans-serif',
          font_size: 14,
          editor_font_family: 'JetBrains Mono, Consolas, monospace',
          editor_font_size: 14,
          markdown_render_theme: 'modern-dark',
          md_render_code_theme: 'gruvbox-dark-medium',
          always_on_top: false,
        },
        get_editor_config: {
          mode: 'vim',
          theme: 'gruvbox-dark',
          word_wrap: true,
          tab_size: 2,
          show_line_numbers: true,
        },
      })

      await manager.forceRefresh()

      expect(manager.editor.mode).toBe('vim')
      expect(manager.interface.ui_theme).toBe('article')
      expect(manager.error).toBe(null)
    })

    it('should handle refresh errors', async () => {
      mockInvokeResponses(mockInvoke)
      await manager.initialize()

      mockInvoke.mockRejectedValue(new Error('Refresh failed'))

      await manager.forceRefresh()

      expect(manager.error).toContain('Failed to refresh config')
      expect(manager.isLoading).toBe(false)
    })
  })

  describe('cleanup', () => {
    it('should cleanup listeners and reset state', async () => {
      mockInvokeResponses(mockInvoke)

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
      mockInvokeResponses(mockInvoke, {
        get_interface_config: {
          ui_theme: 'article',
          markdown_render_theme: 'modern-dark',
          md_render_code_theme: 'atom-one-dark',
          font_family: 'Inter, sans-serif',
          font_size: 14,
          editor_font_family: 'JetBrains Mono, Consolas, monospace',
          editor_font_size: 14,
          always_on_top: false,
        },
      })

      await manager.initialize()

      expect(manager.currentUITheme).toBe('article')
      expect(manager.currentMarkdownTheme).toBe('modern-dark')
      expect(manager.currentCodeTheme).toBe('atom-one-dark')
    })

    it('should handle mixed success/failure during initialization', async () => {
      mockInvokeResponses(mockInvoke, {
        get_editor_config: {
          mode: 'vim',
          theme: 'gruvbox-dark',
          word_wrap: true,
          tab_size: 2,
          show_line_numbers: true,
        },
        get_shortcuts_config: new Error('Shortcut error'),
        get_preferences_config: new Error('Preferences error'),
      })

      await manager.initialize()

      expect(manager.editor.mode).toBe('vim')
      expect(manager.interface.markdown_render_theme).toBe('modern-dark')
    })
  })
})
