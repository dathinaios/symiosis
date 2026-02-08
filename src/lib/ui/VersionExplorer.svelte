<!--
UI Layer - Version Explorer
Modal dialog for exploring and recovering note version history.
Content preview, and keyboard navigation.
-->

<script lang="ts">
  import { getContext } from 'svelte'
  import type { VersionExplorerManager } from '../core/versionExplorerManager.svelte'
  import type { ConfigManager } from '../core/configManager.svelte'

  interface Props {
    show: boolean
    onClose: () => void
  }

  const { show, onClose }: Props = $props()

  const managers = getContext<{
    versionExplorerManager: VersionExplorerManager
    configManager: ConfigManager
  }>('managers')
  const versionExplorer = managers.versionExplorerManager
  const configManager = managers.configManager

  let dialogElement = $state<HTMLElement | undefined>(undefined)
  let versionListElement = $state<HTMLElement | undefined>(undefined)

  // Get configured font settings
  const editorFontFamily = $derived(
    configManager?.interface?.editor_font_family ||
      'JetBrains Mono, SF Mono, Monaco, Cascadia Code, Roboto Mono, Consolas, Courier New, monospace'
  )
  const editorFontSize = $derived(
    configManager?.interface?.editor_font_size || 13
  )

  // Backup type color and display configuration
  const backupTypeConfig = {
    external_change: { color: '#98971a', label: 'External' },
    save_failure: { color: '#d79921', label: 'Failed' },
    rollback: { color: '#458588', label: 'Backup' },
    rename_backup: { color: '#b16286', label: 'Rename' },
    delete_backup: { color: '#cc241d', label: 'Delete' },
  } as const

  function getBackupTypeStyle(backupType: string) {
    const config = backupTypeConfig[backupType as keyof typeof backupTypeConfig]
    return config || { color: '#928374', label: 'Unknown' }
  }

  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  async function handleRecover(): Promise<void> {
    await versionExplorer.recoverSelectedVersion()
    if (!versionExplorer.error) {
      onClose()
    }
  }

  function handleCancel(): void {
    versionExplorer.closeVersionExplorer()
    onClose()
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      handleCancel()
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
        versionExplorer.selectPreviousVersion()
      } else if (keyString === shortcuts.down || event.key === 'ArrowDown') {
        event.preventDefault()
        versionExplorer.selectNextVersion()
      }
    }
  }

  function handleOverlayClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) {
      handleCancel()
    }
  }

  function handleVersionClick(index: number): void {
    versionExplorer.selectVersion(index)
  }

  $effect(() => {
    if (show && dialogElement) {
      setTimeout(() => dialogElement!.focus(), 10)
    }
  })

  $effect(() => {
    const selectedIndex = versionExplorer.selectedVersionIndex
    if (versionListElement && selectedIndex >= 0) {
      requestAnimationFrame(() => {
        const selectedItem = versionListElement!.children[
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
      class="dialog version-explorer"
      bind:this={dialogElement}
      tabindex="0"
      onkeydown={handleKeydown}
      onclick={(e) => e.stopPropagation()}
      style="--editor-font-family: {editorFontFamily}; --editor-font-size: {editorFontSize}px;"
    >
      <h3>
        Version History - {versionExplorer.selectedNote || 'Unknown Note'}
      </h3>

      <div class="version-explorer-content">
        <!-- Left Panel: Version List -->
        <div class="version-list-panel">
          {#if versionExplorer.versions.length === 0}
            <div class="empty-state">
              <p>No version history found for this note.</p>
            </div>
          {:else}
            <div class="version-list" bind:this={versionListElement}>
              {#each versionExplorer.versions as version, index (version.filename)}
                {@const typeStyle = getBackupTypeStyle(version.backup_type)}
                <div
                  class="version-item {index ===
                  versionExplorer.selectedVersionIndex
                    ? 'selected'
                    : ''}"
                  onclick={() => handleVersionClick(index)}
                  role="button"
                  tabindex="-1"
                  onkeydown={(e) =>
                    e.key === 'Enter' && handleVersionClick(index)}
                >
                  <div class="version-info">
                    <div class="version-header">
                      <span
                        class="version-type"
                        style="color: {typeStyle.color}"
                      >
                        [{typeStyle.label}]
                      </span>
                      <span class="version-time">{version.formatted_time}</span>
                    </div>
                    <div class="version-details">
                      <span class="version-size"
                        >{formatFileSize(version.size)}</span
                      >
                      <span class="version-filename">{version.filename}</span>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Right Panel: Preview -->
        <div class="preview-panel">
          <div class="preview-header">
            <span>Preview</span>
            {#if versionExplorer.isLoadingPreview}
              <span class="loading-indicator">Loading...</span>
            {/if}
          </div>
          <div class="preview-content">
            {#if versionExplorer.previewContent}
              <div class="markdown-preview">
                <pre>{versionExplorer.previewContent}</pre>
              </div>
            {:else if versionExplorer.isLoadingPreview}
              <div class="preview-loading">Loading preview...</div>
            {:else}
              <div class="preview-empty">
                Select a version to preview its content
              </div>
            {/if}
          </div>
        </div>
      </div>

      {#if versionExplorer.error}
        <div class="error-message">
          <span class="error-icon">⚠️</span>
          {versionExplorer.error}
        </div>
      {/if}

      <div class="keyboard-hint">
        <p>
          {#if configManager?.shortcuts}
            <kbd>{configManager.shortcuts.up}</kbd><kbd
              >{configManager.shortcuts.down}</kbd
            > Navigate •
          {:else}
            <kbd>↑</kbd><kbd>↓</kbd> Navigate •
          {/if}
          <kbd>Enter</kbd> Recover • <kbd>Esc</kbd> Close
        </p>
      </div>

      <div class="version-explorer-buttons">
        <button
          class="btn-primary"
          onclick={handleRecover}
          disabled={versionExplorer.versions.length === 0}
        >
          Recover Version
        </button>
        <button class="btn-cancel" onclick={handleCancel}>Close</button>
      </div>
    </div>
  </div>
{/if}

<style>
  @import '/css/dialog.css';

  .version-explorer {
    min-width: unset;
    max-width: unset;
    width: 95vw;
    height: 92vh;
    display: flex;
    flex-direction: column;
  }

  .version-explorer-content {
    display: flex;
    gap: 12px;
    flex: 1;
    min-height: 0;
    margin: 8px 0;
  }

  /* Left Panel - Version List */
  .version-list-panel {
    width: 40%;
    border: 1px solid var(--theme-border);
    border-radius: 6px;
    background-color: var(--theme-bg-primary);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .version-list {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  .version-item {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--theme-bg-secondary);
    cursor: pointer;
    transition: background-color 0.15s ease;
  }

  .version-item:hover {
    background-color: var(--theme-bg-secondary);
  }

  .version-item.selected {
    background-color: var(--theme-bg-tertiary);
    border-left: 3px solid var(--theme-success);
  }

  .version-item:last-child {
    border-bottom: none;
  }

  .version-info {
    flex: 1;
    min-width: 0;
  }

  .version-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 2px;
  }

  .version-type {
    font-weight: 500;
    font-size: 14px;
  }

  .version-time {
    color: var(--theme-text-secondary);
    font-size: 13px;
  }

  .version-details {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--theme-text-muted);
    font-size: 12px;
  }

  .version-size {
    color: var(--theme-text-muted);
  }

  .version-filename {
    color: var(--theme-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Right Panel - Preview */
  .preview-panel {
    width: 60%;
    border: 1px solid var(--theme-border);
    border-radius: 6px;
    background-color: var(--theme-bg-primary);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .preview-header {
    padding: 12px 16px;
    background-color: var(--theme-bg-secondary);
    border-bottom: 1px solid var(--theme-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: var(--theme-text-primary);
    font-size: 14px;
    font-weight: 500;
  }

  .loading-indicator {
    color: var(--theme-highlight);
    font-size: 13px;
  }

  .preview-content {
    flex: 1;
    overflow: auto;
    min-height: 0;
  }

  .markdown-preview {
    padding: 16px;
    height: auto;
    overflow: visible; /* prevent double scrollbars */
  }

  .markdown-preview pre {
    margin: 0;
    padding: 0;
    background: transparent;
    border: none;
    font-family: var(--editor-font-family);
    font-size: var(--editor-font-size);
    line-height: 1.6;
    color: var(--theme-text-primary);
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  /* scroll bars */
  .version-list::-webkit-scrollbar,
  .preview-content::-webkit-scrollbar,
  .markdown-preview::-webkit-scrollbar {
    width: 10px;
  }

  .version-list::-webkit-scrollbar-track,
  .preview-content::-webkit-scrollbar-track,
  .markdown-preview::-webkit-scrollbar-track {
    background: var(--theme-bg-secondary);
  }

  .version-list::-webkit-scrollbar-thumb,
  .preview-content::-webkit-scrollbar-thumb,
  .markdown-preview::-webkit-scrollbar-thumb {
    background: var(--theme-bg-tertiary);
    border-radius: 5px;
  }

  .version-list::-webkit-scrollbar-thumb:hover,
  .preview-content::-webkit-scrollbar-thumb:hover,
  .markdown-preview::-webkit-scrollbar-thumb:hover {
    background: var(--theme-bg-tertiary);
  }

  /* Empty State */
  .empty-state {
    padding: 40px 20px;
    text-align: center;
    color: var(--theme-text-muted);
  }

  .empty-state p {
    margin: 0;
    font-style: italic;
  }

  /* Error Message */
  .error-message {
    margin: 6px 0;
    padding: 8px 12px;
    background-color: var(--theme-bg-tertiary);
    border: 1px solid var(--theme-warning);
    border-radius: 4px;
    color: var(--theme-warning);
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .error-icon {
    font-size: 14px;
  }

  /* Keyboard Hint */
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

  /* Buttons */
  .version-explorer-buttons {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
    margin-top: 8px;
  }

  .version-explorer-buttons button {
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
