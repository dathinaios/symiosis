# Symiosis <a href="http://fasmatwist.com"><img src="https://user-images.githubusercontent.com/481589/216767388-d94cdd88-dc8f-4f95-9d87-1275583fb73b.jpg" alt="FasmaTwist" width="130px" height="38px" align="right"></a>

Symiosis is a desktop note-taking application inspired by Notational Velocity that combines instant search with beautiful markdown rendering. It's designed for a keyboard-driven workflow with Vim-centric defaults, but you can customize shortcuts to your taste. The built-in code editor supports vim, emacs, and basic editing modes so you can comfortably edit notes in place.

![](resources/symiosis.gif)

---

## Status

**Early Release (α)**

- The app is functional and ready to use, but things may change as improvements are made. Some features might not work perfectly yet.
- Currently tested officially on macOS. Contributions / feedback for Windows & Linux support are appreciated.

> [!WARNING]
> Note versions are kept and care has been taken to avoid data loss, but since this is a new project, regular backups are recommended.

---

## Features

*   **Instant Search:** Search title and contents with fuzzy matching.
*   **Markdown Render in Place:** Notes are explored and read as beautiful rendered markdown.
*   **Code Editor:** Seamlessly switch between viewing and editing modes.
*   **Keyboard-Driven Workflow:** Navigate and manage notes entirely with keyboard shortcuts.

---

## Usage

Symiosis is designed for a keyboard-driven workflow. Defaults are Vim-centric but you can customize to taste.
Usual keys like arrows etc. will also work.

### Global Shortcuts

*   **`Ctrl + Shift + N`:** Toggle Symiosis window visibility (works system-wide).

### General Navigation

*   **Type to Search:** Start typing to filter notes.
*   **`Ctrl + J` / `Ctrl + K`:** Navigate through the search results (notes list).
*   **`Enter`:** When a note is selected, enter edit mode for that note.
*   **`Ctrl + U` / `Ctrl + D`:** Scroll up or down currently selected note
*   **`Ctrl + P` / `Ctrl + N`:** Navigate search term highlights (if active) or Markdown headers in currently selected note. Other headers will collapse creating an outline for easy navigation.
*   **`Ctrl + H` / `Ctrl + L`:** Navigate links in currently selected note.
*   **`Ctrl + Alt + H` / `Ctrl + Alt + L`:** Navigate code blocks in currently selected note.
*   **`Escape`:** Exit current navigation mode (links, code blocks, headers) or clear search highlights. If no navigation is active, clear current search text.
*   **`Enter`:** When navigating links, opens the selected link in your default browser. Otherwise, enters edit mode for the selected note.
*   **`Ctrl + Y`:** Copy currently selected markdown section or code block to clipboard.

### Note Management

*   **`Ctrl + Enter`:** Create a new note.
*   **`Ctrl + M`:** Rename the currently selected note.
*   **`Ctrl + O`:** Open the currently selected note in the system default editor.
*   **`Ctrl + X`:** Delete the currently selected note (requires confirmation).

### Special Panels

*   **`Meta + ,` (Cmd + , on Mac):** Open settings panel.
*   **`Ctrl + /`:** Open version explorer for the currently selected note.
*   **`Ctrl + .`:** Open recently deleted notes dialog to restore deleted notes.

---

## Configuration

Symiosis uses a TOML configuration file located at:
- **Linux/macOS**: `~/.config/symiosis/config.toml`
- **Windows**: `%APPDATA%\symiosis\config.toml`

On first run, a default configuration file is created automatically with sensible defaults.

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

When custom theme paths are provided, they take precedence over the theme names. If a custom file fails to load, the app falls back to the specified theme name.

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

### Using Development Mode

If you're developing Symiosis and want to keep your development data separate from your personal notes, you can enable development mode:

1. **Create a development config file:**

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

2. **Update the development config** to use a separate notes directory:
   ```toml
   notes_directory = "/Users/username/Documents/Notes-dev"
   ```

3. **Development builds automatically detect the dev config:**
   - When running `pnpm tauri dev`, Symiosis will automatically use the platform-appropriate dev config if it exists:
     - **Linux/macOS**: `~/.config/symiosis-dev/config.toml`
     - **Windows**: `%APPDATA%\symiosis-dev\config.toml`
   - This separates your development data from your personal notes
   - Production builds ignore the dev config and always use the regular config location

4. **To disable development mode**, simply delete or rename the dev config file for your platform.

---

## License

This project is licensed under the GNU General Public License v2.0 (GPL-2.0).

See [LICENSE](https://www.gnu.org/licenses/old-licenses/gpl-2.0.en.html) for the full license text.
