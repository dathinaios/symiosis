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
  isLoading: boolean
  error: string | null
}

export interface ConfigService {
  readonly isLoading: boolean
  readonly error: string | null
  exists(): Promise<boolean>
  refreshCache(): Promise<void>
  clearError(): void
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
  getDefaultConfig(): AppConfig
}

export function createConfigService(): ConfigService {
  const state = $state<ConfigServiceState>({
    isLoading: false,
    error: null,
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

  async function exists(): Promise<boolean> {
    try {
      return await invoke<boolean>('config_exists')
    } catch (e) {
      console.error('Failed to check config existence:', e)
      return false
    }
  }

  async function getConfigContent(): Promise<string> {
    return await invoke<string>('get_config_content')
  }

  async function saveConfigContent(content: string): Promise<void> {
    await invoke<void>('save_config_content', { content })
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
    exists,
    refreshCache,
    clearError,
    initDefaults,
    getDefaultConfig,
    getGeneralConfig,
    getInterfaceConfig,
    getEditorConfig,
    getShortcutsConfig,
    getPreferencesConfig,
    getConfigContent,
    saveConfigContent,

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

    async loadCustomThemeFile(path: string): Promise<string> {
      return await invoke<string>('load_custom_theme_file', { path })
    },
  }
}

export const configService = createConfigService()
