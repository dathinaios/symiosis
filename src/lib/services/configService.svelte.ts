/**
 * Service Layer - Config Service
 * Application configuration settings and the settings pane state.
 * Handles configuration loading, saving, and reactive settings panel visibility.
 *
 * TODO: We are not really following the architecture as found in the other services
 * (noteService/versionService) as we are also handling:
 * 1. Settings panel UI state (should move to App layer)
 * 2. DOM theme loading (should move to Core layer)
 * Ok, for now.
 */

import { invoke } from '@tauri-apps/api/core'
import type {
  AppConfig,
  GeneralConfig,
  InterfaceConfig,
  EditorConfig,
  ShortcutsConfig,
  PreferencesConfig,
} from '../types/config'

interface ConfigServiceState {
  content: string
  isVisible: boolean
  isLoading: boolean
  error: string | null
  lastSaved: number // Timestamp to trigger reactive updates
}

export interface ConfigService {
  content: string
  readonly isVisible: boolean
  readonly isLoading: boolean
  readonly error: string | null
  readonly lastSaved: number
  open(): Promise<void>
  close(): void
  save(): Promise<{ success: boolean; error?: string }>
  updateContent(content: string): void
  exists(): Promise<boolean>
  refreshCache(): Promise<void>
  clearError(): void
  openPane(): Promise<void>
  closePane(): void
  getGeneralConfig(): Promise<GeneralConfig>
  getInterfaceConfig(): Promise<InterfaceConfig>
  getEditorConfig(): Promise<EditorConfig>
  getShortcutsConfig(): Promise<ShortcutsConfig>
  getPreferencesConfig(): Promise<PreferencesConfig>
  getAvailableThemes(): Promise<{
    ui_themes: string[]
    markdown_themes: string[]
  }>
  loadTheme(
    theme: string,
    validUIThemes?: string[],
    customPath?: string
  ): Promise<void>
  loadMarkdownTheme(theme: string, customPath?: string): Promise<void>
  loadHighlightJSTheme(theme: string): Promise<void>
  initDefaults(): Promise<void>
  getDefaultConfig(): AppConfig
}

export function createConfigService(): ConfigService {
  const state = $state<ConfigServiceState>({
    content: '',
    isVisible: false,
    isLoading: false,
    error: null,
    lastSaved: 0,
  })

  let defaults: AppConfig | null = null

  async function initDefaults(): Promise<void> {
    if (defaults) return
    defaults = await invoke<AppConfig>('get_default_config')
  }

  function getDefaultConfig(): AppConfig {
    if (!defaults) {
      throw new Error('Config defaults not loaded. Call initDefaults() first.')
    }
    return defaults
  }

  async function open(): Promise<void> {
    state.isLoading = true
    state.error = null

    try {
      const content = await invoke<string>('get_config_content')
      state.content = content
      state.isVisible = true
    } catch (e) {
      state.error = `Failed to load config: ${e}`
      console.error('Failed to load config:', e)
    } finally {
      state.isLoading = false
    }
  }

  function close(): void {
    state.isVisible = false
    state.content = ''
    state.error = null
  }

  async function save(): Promise<{ success: boolean; error?: string }> {
    state.isLoading = true
    state.error = null

    try {
      await invoke<void>('save_config_content', { content: state.content })
      await invoke<void>('refresh_cache')

      // Update timestamp to trigger reactive config reloads
      state.lastSaved = Date.now()

      close()

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

  function updateContent(content: string): void {
    state.content = content
  }

  async function exists(): Promise<boolean> {
    try {
      return await invoke<boolean>('config_exists')
    } catch (e) {
      console.error('Failed to check config existence:', e)
      return false
    }
  }

  async function refreshCache(): Promise<void> {
    try {
      await invoke<void>('refresh_cache')
    } catch (e) {
      console.error('Failed to refresh cache:', e)
      throw e
    }
  }

  function clearError(): void {
    state.error = null
  }

  async function openPane(): Promise<void> {
    await open()
  }

  function closePane(): void {
    close()
  }

  async function getGeneralConfig(): Promise<GeneralConfig> {
    try {
      return await invoke<GeneralConfig>('get_general_config')
    } catch (e) {
      console.error('Failed to get general config:', e)
      return getDefaultConfig().general
    }
  }

  async function getInterfaceConfig(): Promise<InterfaceConfig> {
    try {
      return await invoke<InterfaceConfig>('get_interface_config')
    } catch (e) {
      console.error('Failed to get interface config:', e)
      return getDefaultConfig().interface
    }
  }

  async function getEditorConfig(): Promise<EditorConfig> {
    try {
      return await invoke<EditorConfig>('get_editor_config')
    } catch (e) {
      console.error('Failed to get editor config:', e)
      return getDefaultConfig().editor
    }
  }

  async function getShortcutsConfig(): Promise<ShortcutsConfig> {
    try {
      return await invoke<ShortcutsConfig>('get_shortcuts_config')
    } catch (e) {
      console.error('Failed to get shortcuts config:', e)
      return getDefaultConfig().shortcuts
    }
  }

  async function getPreferencesConfig(): Promise<PreferencesConfig> {
    try {
      return await invoke<PreferencesConfig>('get_preferences_config')
    } catch (e) {
      console.error('Failed to get preferences config:', e)
      return getDefaultConfig().preferences
    }
  }

  return {
    open,
    close,
    save,
    updateContent,
    exists,
    refreshCache,
    clearError,
    openPane,
    closePane,
    initDefaults,
    getDefaultConfig,
    getGeneralConfig,
    getInterfaceConfig,
    getEditorConfig,
    getShortcutsConfig,
    getPreferencesConfig,

    get content(): string {
      return state.content
    },

    set content(value: string) {
      state.content = value
    },

    get isVisible(): boolean {
      return state.isVisible
    },

    get isLoading(): boolean {
      return state.isLoading
    },

    get error(): string | null {
      return state.error
    },

    async getAvailableThemes(): Promise<{
      ui_themes: string[]
      markdown_themes: string[]
    }> {
      try {
        const result = await invoke<{
          ui_themes: string[]
          markdown_themes: string[]
        }>('scan_available_themes')
        return result
      } catch (error) {
        console.error('Failed to scan available themes:', error)
        return {
          ui_themes: ['gruvbox-dark', 'article', 'modern-dark'],
          markdown_themes: ['modern-dark', 'article', 'gruvbox-dark'],
        }
      }
    },

    get lastSaved(): number {
      return state.lastSaved
    },

    async loadTheme(
      theme: string,
      validUIThemes: string[] = [],
      customPath?: string
    ): Promise<void> {
      try {
        const existingLink = document.head.querySelector('link[data-ui-theme]')
        const existingStyle = document.head.querySelector(
          'style[data-ui-theme]'
        )
        if (existingLink) {
          existingLink.remove()
        }
        if (existingStyle) {
          existingStyle.remove()
        }

        if (customPath) {
          try {
            const cssContent = await invoke<string>('load_custom_theme_file', {
              path: customPath,
            })
            const style = document.createElement('style')
            style.textContent = cssContent
            style.setAttribute('data-ui-theme', 'custom')
            document.head.appendChild(style)
            return
          } catch (error) {
            console.error('Failed to load custom UI theme:', error)
          }
        }

        if (validUIThemes.length > 0 && !validUIThemes.includes(theme)) {
          console.warn(
            `Unknown UI theme: ${theme}. Using gruvbox-dark as default.`
          )
          theme = 'gruvbox-dark'
        }

        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = `/css/ui-themes/${theme}.css`
        link.setAttribute('data-ui-theme', theme)

        document.head.appendChild(link)

        await new Promise<void>((resolve) => {
          link.onload = () => resolve()
          link.onerror = () => resolve()
        })
      } catch (e) {
        console.error('Failed to load UI theme:', e)
      }
    },

    async loadMarkdownTheme(theme: string, customPath?: string): Promise<void> {
      try {
        const existingLink = document.head.querySelector(
          'link[data-markdown-theme]'
        )
        const existingStyle = document.head.querySelector(
          'style[data-markdown-theme]'
        )
        if (existingLink) {
          existingLink.remove()
        }
        if (existingStyle) {
          existingStyle.remove()
        }

        if (customPath) {
          try {
            const cssContent = await invoke<string>('load_custom_theme_file', {
              path: customPath,
            })
            const style = document.createElement('style')
            style.textContent = cssContent
            style.setAttribute('data-markdown-theme', 'custom')
            document.head.appendChild(style)
            return
          } catch (error) {
            console.error('Failed to load custom markdown theme:', error)
          }
        }

        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = `/css/md_render_themes/${theme}.css`
        link.setAttribute('data-markdown-theme', theme)

        document.head.appendChild(link)

        await new Promise<void>((resolve) => {
          link.onload = () => resolve()
          link.onerror = () => resolve()
        })
      } catch (e) {
        console.error('Failed to load markdown theme:', e)
      }
    },

    async loadHighlightJSTheme(theme: string): Promise<void> {
      try {
        const existingLink = document.head.querySelector(
          'link[data-highlight-theme]'
        )
        if (existingLink) {
          existingLink.remove()
        }

        const getThemePath = (themeName: string): string => {
          const gruvboxThemes = [
            'gruvbox-dark-hard',
            'gruvbox-dark-medium',
            'gruvbox-dark-soft',
            'gruvbox-light-hard',
            'gruvbox-light-medium',
            'gruvbox-light-soft',
          ]
          const isGruvboxTheme = gruvboxThemes.includes(themeName)
          if (isGruvboxTheme) {
            return `base16/${themeName}.css`
          }
          return `${themeName}.css`
        }

        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = `/highlight-js-themes/${getThemePath(theme)}`
        link.setAttribute('data-highlight-theme', theme)

        document.head.appendChild(link)

        await new Promise<void>((resolve) => {
          link.onload = () => resolve()
          link.onerror = () => {
            console.warn(`Failed to load highlight.js theme: ${theme}`)
            resolve()
          }
        })
      } catch (e) {
        console.error('Failed to load highlight.js theme:', e)
      }
    },
  }
}

export const configService = createConfigService()
