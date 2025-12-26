export interface GeneralConfig {
  scroll_amount: number
  [key: string]: unknown
}

export interface InterfaceConfig {
  ui_theme: string
  font_family: string
  font_size: number
  editor_font_family: string
  editor_font_size: number
  markdown_render_theme: string
  md_render_code_theme: string
  always_on_top: boolean
  window_decorations: boolean
  restore_previous_focus: boolean
  custom_ui_theme_path?: string
  custom_markdown_theme_path?: string
}

export interface EditorConfig {
  mode: string
  theme: string
  word_wrap: boolean
  tab_size: number
  expand_tabs: boolean
  show_line_numbers: boolean
}

export interface ShortcutsConfig {
  create_note: string
  rename_note: string
  delete_note: string
  edit_note: string
  save_and_exit: string
  open_external: string
  open_folder: string
  refresh_cache: string
  scroll_up: string
  scroll_down: string
  up: string
  down: string
  navigate_previous: string
  navigate_next: string
  navigate_code_previous: string
  navigate_code_next: string
  navigate_link_previous: string
  navigate_link_next: string
  copy_current_section: string
  open_settings: string
  version_explorer: string
  recently_deleted: string
}

export interface PreferencesConfig {
  max_search_results: number
}
