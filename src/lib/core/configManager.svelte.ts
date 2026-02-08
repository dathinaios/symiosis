import { listen } from '@tauri-apps/api/event'
import type {
  AppConfig,
  GeneralConfig,
  InterfaceConfig,
  EditorConfig,
  ShortcutsConfig,
  PreferencesConfig,
} from '../types/config'
import {
  loadUITheme,
  loadMarkdownTheme as loadMarkdownThemeUtil,
  loadHighlightJSTheme as loadHighlightJSThemeUtil,
  removeAllThemes,
} from '../utils/themeLoader'
import { applyInterfaceConfig } from '../utils/cssVariables'

export interface ConfigManagerDeps {
  configService: {
    refreshCache(): Promise<void>
    getGeneralConfig(): Promise<GeneralConfig>
    getInterfaceConfig(): Promise<InterfaceConfig>
    getEditorConfig(): Promise<EditorConfig>
    getShortcutsConfig(): Promise<ShortcutsConfig>
    getPreferencesConfig(): Promise<PreferencesConfig>
    getAvailableThemes(): Promise<{
      ui_themes: string[]
      markdown_themes: string[]
    }>
    loadCustomThemeFile(path: string): Promise<string>
    getConfigContent(): Promise<string>
    saveConfigContent(content: string): Promise<void>
    initDefaults(): Promise<void>
  }
}

interface ConfigState {
  notesDirectory: string
  globalShortcut: string
  general: GeneralConfig
  interface: InterfaceConfig
  editor: EditorConfig
  shortcuts: ShortcutsConfig
  preferences: PreferencesConfig
  isLoading: boolean
  error: string | null
  isInitialized: boolean
  isThemeInitialized: boolean
  isVisible: boolean
  content: string
  lastSaved: number
}

export interface ConfigManager {
  readonly notesDirectory: string
  readonly globalShortcut: string
  readonly general: GeneralConfig
  readonly interface: InterfaceConfig
  readonly editor: EditorConfig
  readonly shortcuts: ShortcutsConfig
  readonly preferences: PreferencesConfig
  readonly isLoading: boolean
  readonly error: string | null
  readonly isInitialized: boolean
  readonly isThemeInitialized: boolean
  readonly currentUITheme: string
  readonly currentMarkdownTheme: string
  readonly currentCodeTheme: string
  readonly isVisible: boolean
  content: string
  readonly lastSaved: number
  initialize(): Promise<void>
  cleanup(): void
  forceRefresh(): Promise<void>
  loadTheme(theme: string, customPath?: string): Promise<void>
  loadMarkdownTheme(theme: string, customPath?: string): Promise<void>
  loadHighlightJSTheme(theme: string): Promise<void>
  openPane(): Promise<void>
  closePane(): void
  updateContent(content: string): void
  saveConfig(): Promise<{ success: boolean; error?: string }>
}

export function createConfigManager(deps: ConfigManagerDeps): ConfigManager {
  const state = $state<ConfigState>({
    notesDirectory: '',
    globalShortcut: '',
    general: { scroll_amount: 0 },
    interface: {
      ui_theme: '',
      font_family: '',
      font_size: 0,
      editor_font_family: '',
      editor_font_size: 0,
      markdown_render_theme: '',
      md_render_code_theme: '',
      always_on_top: false,
    },
    editor: {
      mode: '',
      theme: '',
      word_wrap: false,
      tab_size: 0,
      expand_tabs: false,
      show_line_numbers: false,
    },
    shortcuts: {
      create_note: '',
      rename_note: '',
      delete_note: '',
      edit_note: '',
      save_and_exit: '',
      open_external: '',
      open_folder: '',
      refresh_cache: '',
      scroll_up: '',
      scroll_down: '',
      up: '',
      down: '',
      navigate_previous: '',
      navigate_next: '',
      navigate_code_previous: '',
      navigate_code_next: '',
      navigate_link_previous: '',
      navigate_link_next: '',
      copy_current_section: '',
      open_settings: '',
      version_explorer: '',
      recently_deleted: '',
    },
    preferences: {
      max_search_results: 0,
    },
    isLoading: false,
    error: null,
    isInitialized: false,
    isThemeInitialized: false,
    isVisible: false,
    content: '',
    lastSaved: 0,
  })

  let unlistenConfigChanged: (() => void) | null = null

  let validUIThemes: string[] = []

  async function fetchAvailableThemes(): Promise<void> {
    try {
      const themes = await deps.configService.getAvailableThemes()
      validUIThemes = themes.ui_themes
    } catch (error) {
      console.warn('Failed to fetch available themes, using defaults:', error)
      validUIThemes = ['gruvbox-dark', 'article']
    }
  }

  async function loadCustomCss(path: string): Promise<string | undefined> {
    try {
      return await deps.configService.loadCustomThemeFile(path)
    } catch (error) {
      console.error('Failed to load custom theme:', error)
      return undefined
    }
  }

  function updateConfigState(config: AppConfig): void {
    const previousUITheme = state.interface.ui_theme
    const previousMarkdownTheme = state.interface.markdown_render_theme
    const previousCodeTheme = state.interface.md_render_code_theme

    state.notesDirectory = config.notes_directory
    state.globalShortcut = config.global_shortcut
    state.general = config.general
    state.interface = config.interface
    state.editor = config.editor
    state.shortcuts = config.shortcuts
    state.preferences = config.preferences

    // Apply interface config changes automatically when config updates
    if (state.isThemeInitialized) {
      // Always apply interface config (fonts, etc.) when config changes
      applyInterfaceConfig(config.interface)

      if (
        config.interface.ui_theme !== previousUITheme ||
        config.interface.custom_ui_theme_path !==
          state.interface.custom_ui_theme_path
      ) {
        ;(async () => {
          const customUiCss = config.interface.custom_ui_theme_path
            ? await loadCustomCss(config.interface.custom_ui_theme_path)
            : undefined
          await loadUITheme(
            config.interface.ui_theme,
            validUIThemes,
            customUiCss
          )
        })()
      }
      if (
        config.interface.markdown_render_theme !== previousMarkdownTheme ||
        config.interface.custom_markdown_theme_path !==
          state.interface.custom_markdown_theme_path
      ) {
        ;(async () => {
          const customMdCss = config.interface.custom_markdown_theme_path
            ? await loadCustomCss(config.interface.custom_markdown_theme_path)
            : undefined
          await loadMarkdownThemeUtil(
            config.interface.markdown_render_theme,
            customMdCss
          )
        })()
      }
      if (config.interface.md_render_code_theme !== previousCodeTheme) {
        loadHighlightJSThemeUtil(config.interface.md_render_code_theme)
      }
    }
  }

  async function loadAllConfigs(): Promise<{
    generalConfig: GeneralConfig
    interfaceConfig: InterfaceConfig
    editorConfig: EditorConfig
    shortcutsConfig: ShortcutsConfig
    preferencesConfig: PreferencesConfig
  }> {
    const [
      generalConfig,
      interfaceConfig,
      editorConfig,
      shortcutsConfig,
      preferencesConfig,
    ] = await Promise.all([
      deps.configService.getGeneralConfig(),
      deps.configService.getInterfaceConfig(),
      deps.configService.getEditorConfig(),
      deps.configService.getShortcutsConfig(),
      deps.configService.getPreferencesConfig(),
    ])

    return {
      generalConfig,
      interfaceConfig,
      editorConfig,
      shortcutsConfig,
      preferencesConfig,
    }
  }

  function updateStateWithConfigs(configs: {
    generalConfig: GeneralConfig
    interfaceConfig: InterfaceConfig
    editorConfig: EditorConfig
    shortcutsConfig: ShortcutsConfig
    preferencesConfig: PreferencesConfig
  }): void {
    state.general = configs.generalConfig
    state.interface = configs.interfaceConfig
    state.editor = configs.editorConfig
    state.shortcuts = configs.shortcutsConfig
    state.preferences = configs.preferencesConfig
  }

  async function setupThemes(interfaceConfig: InterfaceConfig): Promise<void> {
    applyInterfaceConfig(interfaceConfig)
    const customUiCss = interfaceConfig.custom_ui_theme_path
      ? await loadCustomCss(interfaceConfig.custom_ui_theme_path)
      : undefined
    await loadUITheme(interfaceConfig.ui_theme, validUIThemes, customUiCss)
    const customMdCss = interfaceConfig.custom_markdown_theme_path
      ? await loadCustomCss(interfaceConfig.custom_markdown_theme_path)
      : undefined
    await loadMarkdownThemeUtil(
      interfaceConfig.markdown_render_theme,
      customMdCss
    )
    await loadHighlightJSThemeUtil(interfaceConfig.md_render_code_theme)
    state.isThemeInitialized = true
  }

  async function setupConfigListener(): Promise<void> {
    unlistenConfigChanged = await listen<AppConfig>(
      'config-updated',
      (event) => {
        updateConfigState(event.payload)
      }
    )
  }

  async function initialize(): Promise<void> {
    if (state.isInitialized) {
      return
    }

    state.isLoading = true
    state.error = null

    try {
      await deps.configService.initDefaults()
      const configs = await loadAllConfigs()
      await fetchAvailableThemes()

      updateStateWithConfigs(configs)
      await setupThemes(configs.interfaceConfig)
      await setupConfigListener()

      state.isInitialized = true
    } catch (e) {
      const error = `Failed to initialize config state: ${e}`
      state.error = error
      console.error('Failed to initialize config state:', e)
    } finally {
      state.isLoading = false
    }
  }

  async function refreshConfigsAndThemes(): Promise<void> {
    await deps.configService.refreshCache()

    const configs = await loadAllConfigs()
    updateStateWithConfigs(configs)

    if (state.isThemeInitialized) {
      await setupThemes(configs.interfaceConfig)
    }
  }

  async function forceRefresh(): Promise<void> {
    state.isLoading = true
    state.error = null

    try {
      await refreshConfigsAndThemes()
    } catch (e) {
      const error = `Failed to refresh config: ${e}`
      state.error = error
      console.error('Failed to refresh config:', e)
    } finally {
      state.isLoading = false
    }
  }

  function cleanup(): void {
    if (unlistenConfigChanged) {
      unlistenConfigChanged()
      unlistenConfigChanged = null
    }

    removeAllThemes()

    state.isInitialized = false
    state.isThemeInitialized = false
  }

  async function openPane(): Promise<void> {
    state.isLoading = true
    state.error = null
    try {
      const content = await deps.configService.getConfigContent()
      state.content = content
      state.isVisible = true
    } catch (e) {
      state.error = `Failed to load config: ${e}`
      console.error('Failed to load config:', e)
    } finally {
      state.isLoading = false
    }
  }

  function closePane(): void {
    state.isVisible = false
    state.content = ''
    state.error = null
  }

  function updateContent(content: string): void {
    state.content = content
  }

  async function saveConfig(): Promise<{ success: boolean; error?: string }> {
    state.isLoading = true
    state.error = null
    try {
      await deps.configService.saveConfigContent(state.content)
      await deps.configService.refreshCache()
      state.lastSaved = Date.now()
      closePane()
      return { success: true }
    } catch (e) {
      const error = `Failed to save config: ${e}`
      state.error = error
      console.error('Failed to save config:', e)
      return { success: false, error }
    } finally {
      state.isLoading = false
    }
  }

  return {
    // Reactive getters following existing manager patterns
    get notesDirectory() {
      return state.notesDirectory
    },

    get globalShortcut() {
      return state.globalShortcut
    },

    get general() {
      return state.general
    },

    get interface() {
      return state.interface
    },

    get editor() {
      return state.editor
    },

    get shortcuts() {
      return state.shortcuts
    },

    get preferences() {
      return state.preferences
    },

    get isLoading() {
      return state.isLoading
    },

    get error() {
      return state.error
    },

    get isInitialized() {
      return state.isInitialized
    },

    get isThemeInitialized() {
      return state.isThemeInitialized
    },

    get currentUITheme() {
      return state.interface.ui_theme
    },

    get currentMarkdownTheme() {
      return state.interface.markdown_render_theme
    },

    get currentCodeTheme() {
      return state.interface.md_render_code_theme
    },

    get isVisible() {
      return state.isVisible
    },

    get content() {
      return state.content
    },

    set content(value: string) {
      state.content = value
    },

    get lastSaved() {
      return state.lastSaved
    },

    initialize,
    cleanup,
    forceRefresh,
    loadTheme: async (theme: string, customPath?: string) => {
      const customCss = customPath ? await loadCustomCss(customPath) : undefined
      await loadUITheme(theme, validUIThemes, customCss)
    },
    loadMarkdownTheme: async (theme: string, customPath?: string) => {
      const customCss = customPath ? await loadCustomCss(customPath) : undefined
      await loadMarkdownThemeUtil(theme, customCss)
    },
    loadHighlightJSTheme: loadHighlightJSThemeUtil,
    openPane,
    closePane,
    updateContent,
    saveConfig,
  }
}
