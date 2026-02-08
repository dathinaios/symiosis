function removeExistingThemeElements(attribute: string): void {
  const existingLink = document.head.querySelector(`link[${attribute}]`)
  const existingStyle = document.head.querySelector(`style[${attribute}]`)
  if (existingLink) {
    existingLink.remove()
  }
  if (existingStyle) {
    existingStyle.remove()
  }
}

async function appendLinkElement(
  attribute: string,
  value: string,
  href: string,
  onError?: (theme: string) => void
): Promise<void> {
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  link.setAttribute(attribute, value)

  document.head.appendChild(link)

  await new Promise<void>((resolve) => {
    link.onload = () => resolve()
    link.onerror = () => {
      if (onError) {
        onError(value)
      }
      resolve()
    }
  })
}

function appendStyleElement(
  attribute: string,
  value: string,
  css: string
): void {
  const style = document.createElement('style')
  style.textContent = css
  style.setAttribute(attribute, value)
  document.head.appendChild(style)
}

function getHighlightThemePath(themeName: string): string {
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

export async function loadUITheme(
  theme: string,
  validUIThemes: string[],
  customCssContent?: string
): Promise<void> {
  try {
    removeExistingThemeElements('data-ui-theme')

    if (customCssContent) {
      try {
        appendStyleElement('data-ui-theme', 'custom', customCssContent)
        return
      } catch (error) {
        console.error('Failed to load custom UI theme:', error)
      }
    }

    if (validUIThemes.length > 0 && !validUIThemes.includes(theme)) {
      console.warn(`Unknown UI theme: ${theme}. Using gruvbox-dark as default.`)
      theme = 'gruvbox-dark'
    }

    await appendLinkElement(
      'data-ui-theme',
      theme,
      `/css/ui-themes/${theme}.css`
    )
  } catch (e) {
    console.error('Failed to load UI theme:', e)
  }
}

export async function loadMarkdownTheme(
  theme: string,
  customCssContent?: string
): Promise<void> {
  try {
    removeExistingThemeElements('data-markdown-theme')

    if (customCssContent) {
      try {
        appendStyleElement('data-markdown-theme', 'custom', customCssContent)
        return
      } catch (error) {
        console.error('Failed to load custom markdown theme:', error)
      }
    }

    await appendLinkElement(
      'data-markdown-theme',
      theme,
      `/css/md_render_themes/${theme}.css`
    )
  } catch (e) {
    console.error('Failed to load markdown theme:', e)
  }
}

export async function loadHighlightJSTheme(theme: string): Promise<void> {
  try {
    removeExistingThemeElements('data-highlight-theme')

    await appendLinkElement(
      'data-highlight-theme',
      theme,
      `/highlight-js-themes/${getHighlightThemePath(theme)}`,
      (failedTheme) =>
        console.warn(`Failed to load highlight.js theme: ${failedTheme}`)
    )
  } catch (e) {
    console.error('Failed to load highlight.js theme:', e)
  }
}

export function removeAllThemes(): void {
  removeExistingThemeElements('data-ui-theme')
  removeExistingThemeElements('data-markdown-theme')
  removeExistingThemeElements('data-highlight-theme')
}
