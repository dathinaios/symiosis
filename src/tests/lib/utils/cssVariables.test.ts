import { describe, it, expect, beforeEach } from 'vitest'
import { applyInterfaceConfig } from '$lib/utils/cssVariables'
import type { InterfaceConfig } from '$lib/types/config'

describe('cssVariables (TDD)', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style')
  })

  describe('applyInterfaceConfig', () => {
    it('should set CSS variables from interface config', () => {
      const config: InterfaceConfig = {
        font_family: 'Arial',
        font_size: 14,
        editor_font_family: 'Courier New',
        editor_font_size: 12,
        ui_theme: 'gruvbox-dark',
        markdown_render_theme: 'github',
        md_render_code_theme: 'monokai',
        custom_ui_theme_path: '',
        custom_markdown_theme_path: '',
      }

      applyInterfaceConfig(config)

      const root = document.documentElement
      expect(root.style.getPropertyValue('--theme-font-family')).toBe('Arial')
      expect(root.style.getPropertyValue('--theme-font-size')).toBe('14px')
      expect(root.style.getPropertyValue('--theme-editor-font-family')).toBe(
        'Courier New'
      )
      expect(root.style.getPropertyValue('--theme-editor-font-size')).toBe(
        '12px'
      )
    })

    it('should update CSS variables when called multiple times', () => {
      const config1: InterfaceConfig = {
        font_family: 'Arial',
        font_size: 14,
        editor_font_family: 'Courier',
        editor_font_size: 12,
        ui_theme: 'gruvbox-dark',
        markdown_render_theme: 'github',
        md_render_code_theme: 'monokai',
        custom_ui_theme_path: '',
        custom_markdown_theme_path: '',
      }

      const config2: InterfaceConfig = {
        font_family: 'Helvetica',
        font_size: 16,
        editor_font_family: 'Monaco',
        editor_font_size: 14,
        ui_theme: 'article',
        markdown_render_theme: 'gruvbox',
        md_render_code_theme: 'github',
        custom_ui_theme_path: '',
        custom_markdown_theme_path: '',
      }

      applyInterfaceConfig(config1)
      applyInterfaceConfig(config2)

      const root = document.documentElement
      expect(root.style.getPropertyValue('--theme-font-family')).toBe(
        'Helvetica'
      )
      expect(root.style.getPropertyValue('--theme-font-size')).toBe('16px')
      expect(root.style.getPropertyValue('--theme-editor-font-family')).toBe(
        'Monaco'
      )
      expect(root.style.getPropertyValue('--theme-editor-font-size')).toBe(
        '14px'
      )
    })
  })
})
