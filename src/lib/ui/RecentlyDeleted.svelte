<!--
UI Layer - Recently Deleted Files
Minimal dialog for listing and recovering recently deleted files.
Features simple file list, keyboard navigation, and recovery.
-->

<script lang="ts">
  import { getContext } from 'svelte'
  import type { ConfigManager } from '../core/configManager.svelte'

  interface DeletedFile {
    filename: string
    backup_filename: string
    deleted_at: string
    timestamp: number
  }

  interface Props {
    show: boolean
    files: DeletedFile[]
    selectedIndex: number
    onClose: () => void
    onRecover: (filename: string) => void
    onSelectFile: (index: number) => void
    onNavigateUp: () => void
    onNavigateDown: () => void
  }

  const {
    show,
    files,
    selectedIndex,
    onClose,
    onRecover,
    onSelectFile,
    onNavigateUp,
    onNavigateDown,
  }: Props = $props()

  const managers = getContext<{
    configManager: ConfigManager
  }>('managers')
  const configManager = managers.configManager

  let dialogElement = $state<HTMLElement | undefined>(undefined)
  let fileListElement = $state<HTMLElement | undefined>(undefined)

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      handleRecover()
    }

    // Check for configured vim shortcuts
    const keyString = [
      event.ctrlKey && 'Ctrl',
      event.altKey && 'Alt',
      event.shiftKey && 'Shift',
      event.metaKey && 'Meta',
      event.key,
    ]
      .filter(Boolean)
      .join('+')

    const shortcuts = configManager?.shortcuts
    if (shortcuts) {
      if (keyString === shortcuts.up || event.key === 'ArrowUp') {
        event.preventDefault()
        onNavigateUp()
      } else if (keyString === shortcuts.down || event.key === 'ArrowDown') {
        event.preventDefault()
        onNavigateDown()
      }
    }
  }

  function handleRecover(): void {
    if (
      files.length > 0 &&
      selectedIndex >= 0 &&
      selectedIndex < files.length
    ) {
      const file = files[selectedIndex]
      onRecover(file.filename)
    }
  }

  function handleOverlayClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  function handleFileClick(index: number): void {
    onSelectFile(index)
  }

  $effect(() => {
    if (show && dialogElement) {
      setTimeout(() => dialogElement!.focus(), 10)
    }
  })

  $effect(() => {
    if (fileListElement && selectedIndex >= 0 && files.length > 0) {
      requestAnimationFrame(() => {
        const selectedItem = fileListElement!.children[
          selectedIndex
        ] as HTMLElement
        if (selectedItem) {
          selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }
      })
    }
  })
</script>

{#if show}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="dialog-overlay" onclick={handleOverlayClick}>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="dialog recently-deleted"
      bind:this={dialogElement}
      tabindex="0"
      onkeydown={handleKeydown}
      onclick={(e) => e.stopPropagation()}
    >
      <h3>Recently Deleted Files</h3>

      <div class="file-list" bind:this={fileListElement}>
        {#if files.length === 0}
          <div class="empty-state">
            <p>No recently deleted files found.</p>
          </div>
        {:else}
          {#each files as file, index (file.backup_filename)}
            <div
              class="file-item {index === selectedIndex ? 'selected' : ''}"
              onclick={() => handleFileClick(index)}
              role="button"
              tabindex="-1"
              onkeydown={(e) => e.key === 'Enter' && handleFileClick(index)}
            >
              <div class="file-name">{file.filename}</div>
            </div>
          {/each}
        {/if}
      </div>

      <div class="keyboard-hint">
        <p>
          {#if configManager?.shortcuts}
            <kbd>{configManager.shortcuts.up}</kbd><kbd
              >{configManager.shortcuts.down}</kbd
            > Navigate •
          {:else}
            <kbd>↑</kbd><kbd>↓</kbd> Navigate •
          {/if}
          <kbd>Enter</kbd> Recover • <kbd>Esc</kbd> Cancel
        </p>
      </div>

      <div class="dialog-buttons">
        <button
          class="btn-primary"
          onclick={handleRecover}
          disabled={files.length === 0}
        >
          Recover
        </button>
        <button class="btn-cancel" onclick={onClose}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  @import '/css/dialog.css';

  .recently-deleted {
    min-width: unset;
    max-width: unset;
    width: 600px;
    height: 400px;
    display: flex;
    flex-direction: column;
  }

  .file-list {
    flex: 1;
    overflow-y: auto;
    border: 1px solid var(--theme-border);
    border-radius: 6px;
    background-color: var(--theme-bg-primary);
    margin: 8px 0;
  }

  .file-item {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--theme-bg-secondary);
    cursor: pointer;
    transition: background-color 0.15s ease;
  }

  .file-item:hover {
    background-color: var(--theme-bg-secondary);
  }

  .file-item.selected {
    background-color: var(--theme-bg-tertiary);
    border-left: 3px solid var(--theme-success);
  }

  .file-item:last-child {
    border-bottom: none;
  }

  .file-name {
    color: var(--theme-text-primary);
    font-size: 14px;
  }

  .empty-state {
    padding: 40px 20px;
    text-align: center;
    color: var(--theme-text-muted);
  }

  .empty-state p {
    margin: 0;
    font-style: italic;
  }

  .keyboard-hint {
    margin: 6px 0;
    padding: 6px 8px;
    background-color: var(--theme-bg-primary);
    border-radius: 4px;
    border-left: 2px solid var(--theme-accent);
  }

  .keyboard-hint p {
    margin: 2px 0;
    font-size: 11px;
    color: var(--theme-text-secondary);
  }

  kbd {
    background-color: var(--theme-bg-tertiary);
    color: var(--theme-text-primary);
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 12px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    border: 1px solid var(--theme-border);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    margin: 0 2px;
  }

  .dialog-buttons {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
    margin-top: 8px;
  }

  .dialog-buttons button {
    padding: 6px 12px;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    font-weight: 500;
  }

  .btn-cancel {
    background-color: var(--theme-bg-tertiary);
    color: var(--theme-text-primary);
  }

  .btn-cancel:hover {
    background-color: var(--theme-border);
  }

  .btn-primary {
    background-color: var(--theme-success);
    color: var(--theme-bg-primary);
  }

  .btn-primary:hover:not(:disabled) {
    background-color: var(--theme-accent);
    filter: brightness(1.1);
  }

  .btn-primary:disabled {
    background-color: var(--theme-bg-tertiary);
    color: var(--theme-text-muted);
    cursor: not-allowed;
  }
</style>
