import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  loadUITheme,
  loadMarkdownTheme,
  loadHighlightJSTheme,
  removeAllThemes,
} from '$lib/utils/themeLoader'

describe('themeLoader (TDD)', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
  })

  afterEach(() => {
    document.head.innerHTML = ''
  })

  describe('loadUITheme', () => {
    it('should create link element for valid theme', async () => {
      await loadUITheme('gruvbox-dark', ['gruvbox-dark', 'article'])

      const link = document.head.querySelector('link[data-ui-theme]')
      expect(link).toBeTruthy()
      expect(link?.getAttribute('data-ui-theme')).toBe('gruvbox-dark')
      expect(link?.getAttribute('href')).toBe('/css/ui-themes/gruvbox-dark.css')
    })

    it('should default to gruvbox-dark for unknown theme', async () => {
      await loadUITheme('unknown-theme', ['gruvbox-dark', 'article'])

      const link = document.head.querySelector('link[data-ui-theme]')
      expect(link?.getAttribute('data-ui-theme')).toBe('gruvbox-dark')
      expect(link?.getAttribute('href')).toBe('/css/ui-themes/gruvbox-dark.css')
    })

    it('should create style element for custom CSS', async () => {
      await loadUITheme('custom', [], '.custom { color: red; }')

      const style = document.head.querySelector('style[data-ui-theme]')
      expect(style).toBeTruthy()
      expect(style?.getAttribute('data-ui-theme')).toBe('custom')
      expect(style?.textContent).toBe('.custom { color: red; }')
    })

    it('should remove existing theme before loading new one', async () => {
      await loadUITheme('gruvbox-dark', ['gruvbox-dark'])
      await loadUITheme('article', ['article'])

      const links = document.head.querySelectorAll('link[data-ui-theme]')
      expect(links.length).toBe(1)
      expect(links[0]?.getAttribute('data-ui-theme')).toBe('article')
    })

    it('should remove existing style before loading new theme', async () => {
      await loadUITheme('custom', [], '.test { }')
      await loadUITheme('gruvbox-dark', ['gruvbox-dark'])

      const styles = document.head.querySelectorAll('style[data-ui-theme]')
      const links = document.head.querySelectorAll('link[data-ui-theme]')
      expect(styles.length).toBe(0)
      expect(links.length).toBe(1)
    })
  })

  describe('loadMarkdownTheme', () => {
    it('should create link element for theme', async () => {
      await loadMarkdownTheme('github')

      const link = document.head.querySelector('link[data-markdown-theme]')
      expect(link).toBeTruthy()
      expect(link?.getAttribute('data-markdown-theme')).toBe('github')
      expect(link?.getAttribute('href')).toBe(
        '/css/md_render_themes/github.css'
      )
    })

    it('should create style element for custom CSS', async () => {
      await loadMarkdownTheme('custom', '.markdown { color: blue; }')

      const style = document.head.querySelector('style[data-markdown-theme]')
      expect(style).toBeTruthy()
      expect(style?.getAttribute('data-markdown-theme')).toBe('custom')
      expect(style?.textContent).toBe('.markdown { color: blue; }')
    })

    it('should remove existing theme before loading new one', async () => {
      await loadMarkdownTheme('github')
      await loadMarkdownTheme('gruvbox')

      const links = document.head.querySelectorAll('link[data-markdown-theme]')
      expect(links.length).toBe(1)
      expect(links[0]?.getAttribute('data-markdown-theme')).toBe('gruvbox')
    })
  })

  describe('loadHighlightJSTheme', () => {
    it('should create link element for standard theme', async () => {
      await loadHighlightJSTheme('monokai')

      const link = document.head.querySelector('link[data-highlight-theme]')
      expect(link).toBeTruthy()
      expect(link?.getAttribute('data-highlight-theme')).toBe('monokai')
      expect(link?.getAttribute('href')).toBe(
        '/highlight-js-themes/monokai.css'
      )
    })

    it('should use base16 path for gruvbox themes', async () => {
      await loadHighlightJSTheme('gruvbox-dark-medium')

      const link = document.head.querySelector('link[data-highlight-theme]')
      expect(link?.getAttribute('href')).toBe(
        '/highlight-js-themes/base16/gruvbox-dark-medium.css'
      )
    })

    it('should remove existing theme before loading new one', async () => {
      await loadHighlightJSTheme('monokai')
      await loadHighlightJSTheme('github')

      const links = document.head.querySelectorAll('link[data-highlight-theme]')
      expect(links.length).toBe(1)
      expect(links[0]?.getAttribute('data-highlight-theme')).toBe('github')
    })
  })

  describe('removeAllThemes', () => {
    it('should remove all theme elements', async () => {
      await loadUITheme('gruvbox-dark', ['gruvbox-dark'])
      await loadMarkdownTheme('github')
      await loadHighlightJSTheme('monokai')

      removeAllThemes()

      expect(document.head.querySelector('link[data-ui-theme]')).toBeNull()
      expect(
        document.head.querySelector('link[data-markdown-theme]')
      ).toBeNull()
      expect(
        document.head.querySelector('link[data-highlight-theme]')
      ).toBeNull()
    })

    it('should handle case when no themes are loaded', () => {
      expect(() => removeAllThemes()).not.toThrow()
    })
  })
})
