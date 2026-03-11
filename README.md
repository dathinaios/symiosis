# Symiosis <a href="http://fasmatwist.com"><img src="https://user-images.githubusercontent.com/481589/216767388-d94cdd88-dc8f-4f95-9d87-1275583fb73b.jpg" alt="FasmaTwist" width="130px" height="38px" align="right"></a>

Symiosis is a keyboard-driven desktop note-taking app inspired by Notational Velocity. It combines instant search with in-place markdown rendering and includes a code editor with vim, emacs, and basic modes.

![](resources/symiosis.gif)

---

## Status

**Early Release (α)**

- Functional but evolving — some features may not work perfectly yet.
- Primarily tested on macOS with initial Windows & Linux testing. Cross-platform contributions welcome.

> [!WARNING]
> Note versions are kept and care has been taken to avoid data loss, but since this is a new project, regular backups are recommended.

---

## Features

*   **Instant Search:** Fuzzy matching across titles and contents.
*   **Markdown Rendering:** Notes display as styled markdown with syntax-highlighted code blocks.
*   **Code Editor:** Switch between reading and editing with vim, emacs, or basic mode.
*   **Keyboard-Driven:** Full navigation and note management via customizable shortcuts.

---

## Usage

Defaults are Vim-centric but fully customizable. Standard keys (arrows, etc.) also work.

### Global Shortcuts

*   **`Ctrl + Shift + N`:** Toggle Symiosis window visibility (works system-wide).

### General Navigation

*   **Type to Search:** Start typing to filter notes.
*   **`Ctrl + J` / `Ctrl + K`:** Navigate through search results.
*   **`Ctrl + U` / `Ctrl + D`:** Scroll selected note up/down.
*   **`Ctrl + P` / `Ctrl + N`:** Navigate search highlights or markdown headers. Non-targeted headers collapse to create an outline view.
*   **`Ctrl + H` / `Ctrl + L`:** Navigate links in selected note.
*   **`Ctrl + Alt + H` / `Ctrl + Alt + L`:** Navigate code blocks in selected note.
*   **`Enter`:** Open selected link in default browser (when navigating links), otherwise enter edit mode.
*   **`Escape`:** Exit navigation mode or clear search highlights. If nothing active, clears search text.
*   **`Ctrl + Y`:** Copy current markdown section or code block to clipboard.

### Note Management

*   **`Ctrl + Enter`:** Create a new note.
*   **`Ctrl + M`:** Rename selected note.
*   **`Ctrl + O`:** Open selected note in system default editor.
*   **`Ctrl + X`:** Delete selected note (confirmation required).

### Special Panels

*   **`Meta + ,` (Cmd + , on Mac):** Open settings.
*   **`Ctrl + /`:** Open version explorer for selected note.
*   **`Ctrl + .`:** Open recently deleted notes.

---

## Configuration

Symiosis uses a TOML configuration file located at:
- **Linux/macOS**: `~/.config/symiosis/config.toml`
- **Windows**: `%APPDATA%\symiosis\config.toml`

A default config is created on first run.

### Configuration Options

<details>
<summary>Top-Level Settings</summary>

- `notes_directory` - Directory where notes are stored (default: `~/Documents/Notes`)
- `global_shortcut` - Global keyboard shortcut to toggle app visibility (default: `"Ctrl+Shift+N"`)

</details>

<details>
<summary>General [general]</summary>

- `scroll_amount` - Scroll amount as a fraction of viewport height (default: `0.4`, which equals 40% of the visible area)

</details>

<details>
<summary>Interface [interface]</summary>

- `ui_theme` - Application UI theme (default: `"gruvbox-dark"`)
- `font_family` - UI font family (default: `"Inter, sans-serif"`)
- `font_size` - UI font size in pixels (default: `14`)
- `editor_font_family` - Editor font family (default: `"JetBrains Mono, Consolas, monospace"`)
- `editor_font_size` - Editor font size in pixels (default: `14`)
- `markdown_render_theme` - Theme for rendered markdown content (default: `"modern-dark"`)
- `md_render_code_theme` - Syntax highlighting theme for code blocks (default: `"gruvbox-dark-medium"`)

##### Available UI Themes
`gruvbox-dark` &nbsp; `article` &nbsp; `modern-dark`

##### Available Markdown Render Themes
`modern-dark` &nbsp; `article` &nbsp; `gruvbox-dark`

##### Available Code Highlighting Themes


| Gruvbox | Dark | Light |
|---|---|---|
| `gruvbox-dark-hard` | `atom-one-dark` | `atom-one-light` |
| `gruvbox-dark-medium` | `dracula` | `github` |
| `gruvbox-dark-soft` | `nord` | `vs` |
| `gruvbox-light-hard` | `monokai` | `xcode` |
| `gruvbox-light-medium` | `github-dark` | `tokyo-night-light` |
|  | `vs2015` |  |
|  | `night-owl` |  |
|  | `tokyo-night-dark` |  |


##### Custom Theme Paths *(requires restart)*
- `custom_ui_theme_path` - Path to custom UI theme CSS file (optional)
- `custom_markdown_theme_path` - Path to custom markdown theme CSS file (optional)

Custom paths take precedence over theme names. If loading fails, the app falls back to the named theme.

```toml
[interface]
ui_theme = "gruvbox-dark"                              # Fallback theme
custom_ui_theme_path = "/Users/username/my-theme.css"  # Custom override
markdown_render_theme = "modern-dark"                  # Fallback theme
custom_markdown_theme_path = "/Users/username/my-md-theme.css"  # Custom override
```

> Custom theme files must be absolute paths and have a `.css` extension.

##### Window Settings
- `always_on_top` - Keep window always on top (default: `false`) *(requires restart)*
- `window_decorations` - Show window title bar and borders (default: `true`) *(requires restart)* **[Linux only - not yet implemented on macOS/Windows]**

</details>

<details>
<summary>Editor [editor]</summary>

- `mode` - Editor mode: `"basic"`, `"vim"`, or `"emacs"` (default: `"basic"`)
- `theme` - Editor color theme (default: `"gruvbox-dark"`)
- `word_wrap` - Enable word wrapping (default: `true`)
- `tab_size` - Tab size in spaces (default: `2`)
- `expand_tabs` - Convert tabs to spaces (default: `true`)
- `show_line_numbers` - Show line numbers in editor (default: `true`)

</details>

<details>
<summary>Keyboard Shortcuts [shortcuts]</summary>

All keyboard shortcuts are configurable.

- `create_note` - Create new note (default: `"Ctrl+Enter"`)
- `rename_note` - Rename selected note (default: `"Ctrl+m"`)
- `delete_note` - Delete selected note (default: `"Ctrl+x"`)
- `edit_note` - Enter edit mode for selected note (default: `"Enter"`)
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
- `navigate_code_previous` - Navigate to previous code block (default: `"Ctrl+Alt+h"`)
- `navigate_code_next` - Navigate to next code block (default: `"Ctrl+Alt+l"`)
- `navigate_link_previous` - Navigate to previous link (default: `"Ctrl+h"`)
- `navigate_link_next` - Navigate to next link (default: `"Ctrl+l"`)
- `copy_current_section` - Copy current section to clipboard (default: `"Ctrl+y"`)
- `open_settings` - Open settings panel (default: `"Meta+,"`)
- `version_explorer` - Open version explorer for selected note (default: `"Ctrl+/"`)
- `recently_deleted` - Open recently deleted notes dialog (default: `"Ctrl+."`)

</details>

<details>
<summary>Preferences [preferences]</summary>

- `max_search_results` - Maximum number of search results to display (default: `100`)

</details>

### Example Configuration

<details>
<summary>View default config.toml</summary>

```toml
notes_directory = "/Users/username/Documents/Notes"
global_shortcut = "Ctrl+Shift+N"

[general]
scroll_amount = 0.4

[interface]
ui_theme = "gruvbox-dark"
font_family = "Inter, sans-serif"
font_size = 14
editor_font_family = "JetBrains Mono, Consolas, monospace"
editor_font_size = 14
markdown_render_theme = "modern-dark"
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
edit_note = "Enter"
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
navigate_code_previous = "Ctrl+Alt+h"
navigate_code_next = "Ctrl+Alt+l"
navigate_link_previous = "Ctrl+h"
navigate_link_next = "Ctrl+l"
copy_current_section = "Ctrl+y"
open_settings = "Meta+,"
version_explorer = "Ctrl+/"
recently_deleted = "Ctrl+."

[preferences]
max_search_results = 100
```

</details>

---

## Development

### Development Mode

To keep development data separate from personal notes, create a dev config:

**Linux/macOS:**
```bash
mkdir -p ~/.config/symiosis-dev
cp ~/.config/symiosis/config.toml ~/.config/symiosis-dev/config.toml
```

**Windows:**
```cmd
mkdir "%APPDATA%\symiosis-dev"
copy "%APPDATA%\symiosis\config.toml" "%APPDATA%\symiosis-dev\config.toml"
```

Update `notes_directory` in the dev config to point to a separate directory. When running `pnpm tauri dev`, Symiosis automatically uses the dev config if present. Production builds always use the regular config.

To disable, delete the dev config file.

---

## License

This project is licensed under the GNU General Public License v2.0 (GPL-2.0).

See [LICENSE](https://www.gnu.org/licenses/old-licenses/gpl-2.0.en.html) for the full license text.
