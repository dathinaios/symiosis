import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  createConfigManager,
  type ConfigManagerDeps,
} from '$lib/core/configManager.svelte'

// Mock Tauri APIs
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}))

vi.mock('$lib/utils/themeLoader', () => ({
  loadUITheme: vi.fn().mockResolvedValue(undefined),
  loadMarkdownTheme: vi.fn().mockResolvedValue(undefined),
  loadHighlightJSTheme: vi.fn().mockResolvedValue(undefined),
  removeAllThemes: vi.fn(),
}))

vi.mock('$lib/utils/cssVariables', () => ({
  applyInterfaceConfig: vi.fn(),
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

describe('configManager', () => {
  let manager: ReturnType<typeof createConfigManager>
  let mockUnlisten: ReturnType<typeof vi.fn>
  let mockInvoke: ReturnType<typeof vi.fn>
  let mockListen: ReturnType<typeof vi.fn>
  let mockConfigService: ConfigManagerDeps['configService']

  beforeEach(async () => {
    vi.clearAllMocks()

    const { invoke } = await import('@tauri-apps/api/core')
    const { listen } = await import('@tauri-apps/api/event')
    mockInvoke = invoke as ReturnType<typeof vi.fn>
    mockListen = listen as ReturnType<typeof vi.fn>

    mockUnlisten = vi.fn()
    mockListen.mockResolvedValue(mockUnlisten)

    mockConfigService = {
      initDefaults: vi.fn().mockResolvedValue(undefined),
      getGeneralConfig: vi.fn().mockResolvedValue({ scroll_amount: 0.4 }),
      getInterfaceConfig: vi.fn().mockResolvedValue({
        ui_theme: 'gruvbox-dark',
        font_family: 'Inter, sans-serif',
        font_size: 14,
        editor_font_family: 'JetBrains Mono, Consolas, monospace',
        editor_font_size: 14,
        markdown_render_theme: 'modern-dark',
        md_render_code_theme: 'gruvbox-dark-medium',
        always_on_top: false,
      }),
      getEditorConfig: vi.fn().mockResolvedValue({
        mode: 'basic',
        theme: 'gruvbox-dark',
        word_wrap: true,
        tab_size: 2,
        expand_tabs: true,
        show_line_numbers: true,
      }),
      getShortcutsConfig: vi
        .fn()
        .mockResolvedValue(mockDefaultConfig.shortcuts),
      getPreferencesConfig: vi
        .fn()
        .mockResolvedValue({ max_search_results: 100 }),
      getAvailableThemes: vi.fn().mockResolvedValue({
        ui_themes: ['gruvbox-dark', 'article', 'modern-dark'],
        markdown_themes: ['modern-dark', 'article', 'gruvbox-dark'],
      }),
      loadCustomThemeFile: vi.fn().mockResolvedValue(''),
      getConfigContent: vi.fn().mockResolvedValue('notes_directory = "/test"'),
      saveConfigContent: vi.fn().mockResolvedValue(undefined),
      refreshCache: vi.fn().mockResolvedValue(undefined),
    }

    manager = createConfigManager({ configService: mockConfigService })
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
      vi.mocked(mockConfigService.getEditorConfig).mockResolvedValue({
        mode: 'vim',
        theme: 'gruvbox-dark',
        word_wrap: true,
        tab_size: 2,
        expand_tabs: true,
        show_line_numbers: true,
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
      vi.mocked(mockConfigService.getGeneralConfig).mockResolvedValue(
        mockDefaultConfig.general
      )
      vi.mocked(mockConfigService.getInterfaceConfig).mockResolvedValue(
        mockDefaultConfig.interface
      )
      vi.mocked(mockConfigService.getEditorConfig).mockResolvedValue(
        mockDefaultConfig.editor
      )
      vi.mocked(mockConfigService.getShortcutsConfig).mockResolvedValue(
        mockDefaultConfig.shortcuts
      )
      vi.mocked(mockConfigService.getPreferencesConfig).mockResolvedValue(
        mockDefaultConfig.preferences
      )

      await manager.initialize()

      expect(manager.editor.mode).toBe('basic')
      expect(manager.interface.markdown_render_theme).toBe('modern-dark')
      expect(manager.preferences.max_search_results).toBe(100)
      expect(manager.isInitialized).toBe(true)
    })

    it('should not re-initialize if already initialized', async () => {
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
      await manager.initialize()

      vi.mocked(mockConfigService.getInterfaceConfig).mockResolvedValue({
        ui_theme: 'article',
        font_family: 'Inter, sans-serif',
        font_size: 14,
        editor_font_family: 'JetBrains Mono, Consolas, monospace',
        editor_font_size: 14,
        markdown_render_theme: 'modern-dark',
        md_render_code_theme: 'gruvbox-dark-medium',
        always_on_top: false,
      })
      vi.mocked(mockConfigService.getEditorConfig).mockResolvedValue({
        mode: 'vim',
        theme: 'gruvbox-dark',
        word_wrap: true,
        tab_size: 2,
        expand_tabs: true,
        show_line_numbers: true,
      })

      await manager.forceRefresh()

      expect(manager.editor.mode).toBe('vim')
      expect(manager.interface.ui_theme).toBe('article')
      expect(manager.error).toBe(null)
    })

    it('should handle refresh errors', async () => {
      await manager.initialize()

      vi.mocked(mockConfigService.refreshCache).mockRejectedValue(
        new Error('Refresh failed')
      )

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
      vi.mocked(mockConfigService.getInterfaceConfig).mockResolvedValue({
        ui_theme: 'article',
        markdown_render_theme: 'modern-dark',
        md_render_code_theme: 'atom-one-dark',
        font_family: 'Inter, sans-serif',
        font_size: 14,
        editor_font_family: 'JetBrains Mono, Consolas, monospace',
        editor_font_size: 14,
        always_on_top: false,
      })

      await manager.initialize()

      expect(manager.currentUITheme).toBe('article')
      expect(manager.currentMarkdownTheme).toBe('modern-dark')
      expect(manager.currentCodeTheme).toBe('atom-one-dark')
    })

    it('should handle mixed success/failure during initialization', async () => {
      vi.mocked(mockConfigService.getEditorConfig).mockResolvedValue({
        mode: 'vim',
        theme: 'gruvbox-dark',
        word_wrap: true,
        tab_size: 2,
        expand_tabs: true,
        show_line_numbers: true,
      })
      vi.mocked(mockConfigService.getShortcutsConfig).mockResolvedValue(
        mockDefaultConfig.shortcuts
      )
      vi.mocked(mockConfigService.getPreferencesConfig).mockResolvedValue(
        mockDefaultConfig.preferences
      )

      await manager.initialize()

      expect(manager.editor.mode).toBe('vim')
      expect(manager.interface.markdown_render_theme).toBe('modern-dark')
    })
  })

  describe('settings pane', () => {
    beforeEach(async () => {
      await manager.initialize()
    })

    it('should open pane and load content', async () => {
      const configContent = 'notes_directory = "/custom"'
      vi.mocked(mockConfigService.getConfigContent).mockResolvedValue(
        configContent
      )

      await manager.openPane()

      expect(mockConfigService.getConfigContent).toHaveBeenCalled()
      expect(manager.content).toBe(configContent)
      expect(manager.isVisible).toBe(true)
      expect(manager.isLoading).toBe(false)
      expect(manager.error).toBeNull()
    })

    it('should close pane and reset content', async () => {
      await manager.openPane()
      expect(manager.isVisible).toBe(true)

      manager.closePane()

      expect(manager.isVisible).toBe(false)
      expect(manager.content).toBe('')
      expect(manager.error).toBeNull()
    })

    it('should update content', () => {
      manager.updateContent('new content')
      expect(manager.content).toBe('new content')
    })

    it('should support content getter/setter', () => {
      manager.content = 'test content'
      expect(manager.content).toBe('test content')
    })

    it('should save config and close pane', async () => {
      await manager.openPane()
      manager.content = 'updated content'

      const result = await manager.saveConfig()

      expect(result.success).toBe(true)
      expect(mockConfigService.saveConfigContent).toHaveBeenCalledWith(
        'updated content'
      )
      expect(mockConfigService.refreshCache).toHaveBeenCalled()
      expect(manager.isVisible).toBe(false)
      expect(manager.content).toBe('')
    })

    it('should handle save errors', async () => {
      await manager.openPane()
      manager.content = 'test content'
      vi.mocked(mockConfigService.saveConfigContent).mockRejectedValue(
        new Error('Save failed')
      )

      const result = await manager.saveConfig()

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to save config')
      expect(manager.error).toContain('Failed to save config')
    })

    it('should update lastSaved timestamp on successful save', async () => {
      const beforeSave = manager.lastSaved

      await manager.openPane()
      manager.content = 'test'

      await manager.saveConfig()

      expect(manager.lastSaved).toBeGreaterThan(beforeSave)
    })

    it('should handle openPane errors', async () => {
      vi.mocked(mockConfigService.getConfigContent).mockRejectedValue(
        new Error('Load failed')
      )

      await manager.openPane()

      expect(manager.error).toContain('Failed to load config')
      expect(manager.isVisible).toBe(false)
    })

    it('should keep pane open on save failure', async () => {
      await manager.openPane()
      manager.content = 'invalid content'
      vi.mocked(mockConfigService.saveConfigContent).mockRejectedValue(
        new Error('TOML syntax error')
      )

      const result = await manager.saveConfig()

      expect(result.success).toBe(false)
      expect(manager.error).toContain('Failed to save config')
      expect(manager.isVisible).toBe(true)
      expect(manager.content).toBe('invalid content')
    })

    it('should clear error on successful save', async () => {
      await manager.openPane()
      manager.content = 'invalid'
      vi.mocked(mockConfigService.saveConfigContent).mockRejectedValue(
        new Error('TOML error')
      )

      await manager.saveConfig()
      expect(manager.error).toBeTruthy()

      manager.content = 'valid content'
      vi.mocked(mockConfigService.saveConfigContent).mockResolvedValue(
        undefined
      )

      const result = await manager.saveConfig()

      expect(result.success).toBe(true)
      expect(manager.error).toBeNull()
    })
  })
})
