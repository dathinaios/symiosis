<!--
UI Layer - Hints Panel
Keyboard shortcuts overlay panel for displaying current key bindings.
-->

<script lang="ts">
  import { getContext } from 'svelte'
  import type { createAppCoordinator } from '../app/appCoordinator.svelte'

  const { appCoordinator } = getContext<{
    appCoordinator: ReturnType<typeof createAppCoordinator>
  }>('managers')

  const { configManager, focusManager } = appCoordinator.managers

  let isVisible = $state(false)
  let isEnabled = $state(true)
  let overlayElement = $state<HTMLElement | undefined>(undefined)

  function togglePanel() {
    isVisible = !isVisible
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      isVisible = false
      focusManager.focusSearch()
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && isVisible) {
      event.preventDefault()
      event.stopPropagation()
      isVisible = false
      focusManager.focusSearch()
      return
    }

    if (isEnabled && event.ctrlKey && event.key === '?') {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      togglePanel()
    }
  }

  $effect(() => {
    if (isVisible && overlayElement) {
      setTimeout(() => overlayElement!.focus(), 10)
    }
  })

  const shortcutGroups = $derived([
    {
      title: 'Notes',
      shortcuts: [
        {
          key: configManager.shortcuts.create_note,
          description: 'Create new note',
        },
        {
          key: configManager.shortcuts.edit_note,
          description: 'Edit note',
        },
        {
          key: configManager.shortcuts.rename_note,
          description: 'Rename current note',
        },
        {
          key: configManager.shortcuts.delete_note,
          description: 'Delete current note',
        },
        {
          key: configManager.shortcuts.save_and_exit,
          description: 'Save and exit edit mode',
        },
      ],
    },
    {
      title: 'Navigation',
      shortcuts: [
        {
          key: configManager.shortcuts.up,
          description: 'Previous note',
        },
        {
          key: configManager.shortcuts.down,
          description: 'Next note',
        },
        {
          key: configManager.shortcuts.scroll_up,
          description: 'Scroll up content',
        },
        {
          key: configManager.shortcuts.scroll_down,
          description: 'Scroll down content',
        },
        {
          key: configManager.shortcuts.navigate_previous,
          description: 'Previous Markdown header or search term',
        },
        {
          key: configManager.shortcuts.navigate_next,
          description: 'Next Markdown header or search term',
        },
        {
          key: configManager.shortcuts.navigate_code_previous,
          description: 'Previous code block',
        },
        {
          key: configManager.shortcuts.navigate_code_next,
          description: 'Next code block',
        },
        {
          key: configManager.shortcuts.navigate_link_previous,
          description: 'Previous link',
        },
        {
          key: configManager.shortcuts.navigate_link_next,
          description: 'Next link',
        },
      ],
    },
    {
      title: 'System',
      shortcuts: [
        {
          key: configManager.shortcuts.open_external,
          description: 'Open in external editor',
        },
        {
          key: configManager.shortcuts.open_folder,
          description: 'Show in notes folder',
        },
        {
          key: configManager.shortcuts.refresh_cache,
          description: 'Refresh note cache',
        },
      ],
    },
    {
      title: 'Misc',
      shortcuts: [
        { key: 'Esc', description: 'Close dialogs/panels' },
        { key: 'Ctrl+?', description: 'Show this help panel' },
        {
          key: configManager.shortcuts.open_settings,
          description: 'Open settings',
        },
        {
          key: configManager.shortcuts.version_explorer,
          description: 'Explore versions of note',
        },
        {
          key: configManager.shortcuts.recently_deleted,
          description: 'Recover recently deleted files',
        },
        {
          key: configManager.shortcuts.copy_current_section,
          description: 'Copy current section to clipboard',
        },
        {
          key: 'Enter',
          description: 'Open current link (when navigating links)',
        },
      ],
    },
  ])
</script>

<!-- Global keyboard shortcut -->
<svelte:window onkeydown={handleKeydown} />

<!-- Hints panel overlay -->
{#if isVisible}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="hints-overlay" onclick={handleOverlayClick}>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="hints-panel"
      bind:this={overlayElement}
      tabindex="0"
      onkeydown={handleKeydown}
      onclick={(e) => e.stopPropagation()}
    >
      <div class="hints-header">
        <h2>
          ⌨️ Keyboard Shortcuts
          <span class="note">(basic keys like arrows etc. also work)</span>
        </h2>
        <button
          class="close-button"
          onclick={() => {
            isVisible = false
            focusManager.focusSearch()
          }}>×</button
        >
      </div>

      <div class="hints-content">
        {#each shortcutGroups as group (group.title)}
          <div class="shortcut-group">
            <h3>{group.title}</h3>
            <div class="shortcut-list">
              {#each group.shortcuts as shortcut (shortcut.key)}
                <div class="shortcut-item">
                  <kbd class="shortcut-key">{shortcut.key}</kbd>
                  <span class="shortcut-description"
                    >{shortcut.description}</span
                  >
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>

      <div class="hints-footer">
        <p>
          Press <kbd>Ctrl+?</kbd> to toggle this panel • Press <kbd>Esc</kbd> to
          close
        </p>
      </div>
    </div>
  </div>
{/if}

<style>
  .hints-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .hints-panel {
    background-color: var(--theme-bg-secondary);
    border: 1px solid var(--theme-border);
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    overflow: hidden;
    padding: 16px;
    width: 85vw;
    height: 82vh;
    display: flex;
    flex-direction: column;
    max-width: 1200px;
    max-height: 800px;
    font-family: var(--theme-font-family);
  }

  .hints-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--theme-border);
  }

  .hints-header h2 {
    margin: 0;
    color: var(--theme-text-primary);
    font-size: 1.2em;
    font-weight: 600;
  }

  .hints-header .note {
    font-weight: 400;
    font-size: 0.8em;
    color: var(--theme-text-secondary);
    margin-left: 0.5em;
    font-style: italic;
  }

  .close-button {
    background: var(--theme-bg-tertiary);
    border: 1px solid var(--theme-border);
    color: var(--theme-text-primary);
    font-size: 18px;
    cursor: pointer;
    padding: 8px 12px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  }

  .close-button:hover {
    background: var(--theme-border);
  }

  .hints-content {
    flex: 1;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: 16px;
  }

  .shortcut-group {
    background: var(--theme-bg-primary);
    border: 1px solid var(--theme-border);
    border-radius: 6px;
    padding: 12px;
  }

  .shortcut-group h3 {
    margin: 0 0 8px 0;
    color: var(--theme-text-primary);
    font-size: 1em;
    font-weight: 600;
    border-bottom: 1px solid var(--theme-border);
    padding-bottom: 6px;
  }

  .shortcut-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .shortcut-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 0;
  }

  .shortcut-key {
    background-color: var(--theme-bg-tertiary);
    color: var(--theme-text-primary);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-family: var(--editor-font-family);
    border: 1px solid var(--theme-border);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    min-width: 80px;
    text-align: center;
    flex-shrink: 0;
  }

  .shortcut-description {
    color: var(--theme-text-secondary);
    font-size: 14px;
    margin-left: 12px;
    flex: 1;
  }

  .hints-footer {
    margin-top: 16px;
    padding-top: 8px;
    border-top: 1px solid var(--theme-border);
    text-align: center;
  }

  .hints-footer p {
    margin: 0;
    font-size: 12px;
    color: var(--theme-text-muted);
  }

  .hints-footer kbd {
    background-color: var(--theme-bg-tertiary);
    color: var(--theme-text-primary);
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 12px;
    font-family: var(--editor-font-family);
    border: 1px solid var(--theme-border);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    margin: 0 2px;
  }

  /* scroll bars */
  .hints-content::-webkit-scrollbar {
    width: 10px;
  }

  .hints-content::-webkit-scrollbar-track {
    background: var(--theme-bg-secondary);
  }

  .hints-content::-webkit-scrollbar-thumb {
    background: var(--theme-bg-tertiary);
    border-radius: 5px;
  }

  .hints-content::-webkit-scrollbar-thumb:hover {
    background: var(--theme-bg-tertiary);
  }
</style>
