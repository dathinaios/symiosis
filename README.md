
<div align="center">
  <img src="https://github.com/user-attachments/assets/aac06ba3-0a2f-443b-991e-d9d54b0a9ba2" width="20%" height="20%" alt="app-icon" />
</div>

# Symiosis

> [!Warning]
> This app is in a very early alpha state. Please back up your notes regularly. Use at your own risk.

> [!Note]
> Only tested on Mac for now. Feel free to try on Windows & Linux and report (or fix!) issues.

Symiosis is a desktop note-taking application inspired by Notational Velocity.

## Features

*   **Instant Search:** Search title and contents with fuzzy matching.
*   **Markdown Support:** Write notes using Markdown for rich formatting.
*   **Syntax Highlighting:** Beautiful syntax highlighting for code blocks in your Markdown notes.
*   **Quick Editing:** Seamlessly switch between viewing and editing modes.
*   **Keyboard-Driven Workflow:** Navigate and manage notes entirely with keyboard shortcuts.


## Usage

Symiosis is designed for a keyboard-driven workflow.

### General Navigation

*   **Type to Search:** Start typing to filter notes (automatically focuses search bar).
*   **`↓` / `↑` or `Ctrl + J` / `Ctrl + K`:** Navigate through the search results (notes list).
*   **`Enter`:** When a note is selected, enter edit mode for that note.
*   **`Escape`:** Return focus to the search bar.

### Note Management

*   **`Ctrl + N` or `Ctrl + Enter`:** Create a new note.
*   **`Ctrl + M`:** Rename the currently selected note.
*   **`Ctrl + O`:** Open the currently selected note in the system default editor.
*   **`Ctrl + X`:** Delete the currently selected note (requires confirmation).

### Editing Notes

*   **`Ctrl + S`:** Save changes to the current note while in edit mode.
*   **`Escape`:** Exit edit mode without saving changes and return to search bar.

### Scrolling Note Content

When viewing a note (not in edit mode):
*   **`Ctrl + D`:** Scroll down half a page.
*   **`Ctrl + U`:** Scroll up half a page.

### Search Highlights

*   **`Escape`:** Clear search highlights in the current note, or clear search input if highlights are already cleared.

### Global Shortcuts

*   **`Ctrl + Shift + N`:** Toggle Symiosis window visibility (works system-wide).

## Configuration

Symiosis uses a TOML configuration file located at `~/.symiosis/config.toml`. On first run, a default configuration file is created automatically with sensible defaults.

### Configuration Options

#### Top-Level Settings

- `notes_directory` - Directory where notes are stored (default: `~/Documents/Notes`)
- `global_shortcut` - Global keyboard shortcut to toggle app visibility (default: `"Ctrl+Shift+N"`)

#### Interface Configuration (`[interface]`)

- `ui_theme` - Application UI theme (default: `"gruvbox-dark"`)
- `font_family` - UI font family (default: `"Inter, sans-serif"`)
- `font_size` - UI font size in pixels (default: `14`)
- `editor_font_family` - Editor font family (default: `"JetBrains Mono, Consolas, monospace"`)
- `editor_font_size` - Editor font size in pixels (default: `14`)
- `markdown_render_theme` - Theme for rendered markdown content (default: `"dark_dimmed"`)
- `md_render_code_theme` - Syntax highlighting theme for code blocks (default: `"gruvbox-dark-medium"`)

**Available Code Highlighting Themes:**

*Gruvbox Variants:*
`gruvbox-dark-hard`, `gruvbox-dark-medium`, `gruvbox-dark-soft`, `gruvbox-light-hard`, `gruvbox-light-medium`

*Popular Dark Themes:*
`atom-one-dark`, `dracula`, `nord`, `monokai`, `github-dark`, `vs2015`, `night-owl`, `tokyo-night-dark`

*Popular Light Themes:*
`atom-one-light`, `github`, `vs`, `xcode`, `tokyo-night-light`

*Base16 Classics:*
`base16-tomorrow-night`, `base16-ocean`, `base16-solarized-dark`, `base16-solarized-light`, `base16-monokai`, `base16-dracula`

**Window Settings:**
- `always_on_top` - Keep window always on top (default: `false`) *(requires restart)*
- `window_decorations` - Show window title bar and borders (default: `true`) *(requires restart)* **[Linux only - not yet implemented on macOS/Windows]**

#### Editor Configuration (`[editor]`)

- `mode` - Editor mode: `"basic"`, `"vim"`, or `"emacs"` (default: `"basic"`)
- `theme` - Editor color theme (default: `"gruvbox-dark"`)
- `word_wrap` - Enable word wrapping (default: `true`)
- `tab_size` - Tab size in spaces (default: `2`)
- `expand_tabs` - Convert tabs to spaces (default: `true`)
- `show_line_numbers` - Show line numbers in editor (default: `true`)

#### Keyboard Shortcuts (`[shortcuts]`)

All keyboard shortcuts are configurable:
- `create_note` - Create new note (default: `"Ctrl+Enter"`)
- `rename_note` - Rename selected note (default: `"Ctrl+m"`)
- `delete_note` - Delete selected note (default: `"Ctrl+x"`)
- `save_and_exit` - Save and exit edit mode (default: `"Ctrl+s"`)
- `open_external` - Open note in external editor (default: `"Ctrl+o"`)
- `open_folder` - Open notes folder (default: `"Ctrl+f"`)
- `refresh_cache` - Refresh syntax highlighting cache (default: `"Ctrl+r"`)
- `scroll_up` - Scroll up in note view (default: `"Ctrl+u"`)
- `scroll_down` - Scroll down in note view (default: `"Ctrl+d"`)
- `up` - Navigate up (vim-style) (default: `"Ctrl+k"`)
- `down` - Navigate down (vim-style) (default: `"Ctrl+j"`)
- `navigate_previous` - Navigate to previous note (default: `"Ctrl+p"`)
- `navigate_next` - Navigate to next note (default: `"Ctrl+n"`)
- `open_settings` - Open settings panel (default: `"Meta+,"`)

#### Preferences (`[preferences]`)

- `max_search_results` - Maximum number of search results to display (default: `100`)

### Example Configuration

The app creates a minimal default configuration like this:

```toml
notes_directory = "/Users/username/Documents/Notes"
global_shortcut = "Ctrl+Shift+N"

[general]

[interface]
ui_theme = "gruvbox-dark"
font_family = "Inter, sans-serif"
font_size = 14
editor_font_family = "JetBrains Mono, Consolas, monospace"
editor_font_size = 14
markdown_render_theme = "dark_dimmed"
md_render_code_theme = "gruvbox-dark-medium"
always_on_top = false
window_decorations = true

[editor]
mode = "basic"
theme = "gruvbox-dark"
word_wrap = true
tab_size = 2
expand_tabs = true
show_line_numbers = true

[shortcuts]
create_note = "Ctrl+Enter"
rename_note = "Ctrl+m"
delete_note = "Ctrl+x"
save_and_exit = "Ctrl+s"
open_external = "Ctrl+o"
open_folder = "Ctrl+f"
refresh_cache = "Ctrl+r"
scroll_up = "Ctrl+u"
scroll_down = "Ctrl+d"
up = "Ctrl+k"
down = "Ctrl+j"
navigate_previous = "Ctrl+p"
navigate_next = "Ctrl+n"
open_settings = "Meta+,"

[preferences]
max_search_results = 100
```

Simply edit the configuration file to customize Symiosis to your preferences.

Have fun 🙂

---

<sub>Markdown themes based on GitHub's markdown CSS (modified and optimized)</sub>
