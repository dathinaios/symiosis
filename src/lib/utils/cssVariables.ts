import type { InterfaceConfig } from '../types/config'

export function applyInterfaceConfig(interfaceConfig: InterfaceConfig): void {
  const root = document.documentElement
  root.style.setProperty('--theme-font-family', interfaceConfig.font_family)
  root.style.setProperty('--theme-font-size', `${interfaceConfig.font_size}px`)
  root.style.setProperty(
    '--theme-editor-font-family',
    interfaceConfig.editor_font_family
  )
  root.style.setProperty(
    '--theme-editor-font-size',
    `${interfaceConfig.editor_font_size}px`
  )
}
