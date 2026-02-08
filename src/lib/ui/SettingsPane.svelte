<!--
UI Layer - Settings Pane
Configuration panel for editing application settings in TOML format.
Uses Editor component for syntax highlighting of configuration files.
-->

<script lang="ts">
  import Editor from './Editor.svelte'
  import { configService } from '../services/configService.svelte'
  import { getContext } from 'svelte'
  import type { AppActions } from '../app/appCoordinator.svelte'

  interface Props {
    show: boolean
    onClose: () => void
  }

  const { show, onClose }: Props = $props()
  const actions = getContext<AppActions>('actions')

  let dialogElement = $state<HTMLElement | undefined>(undefined)
  let savedCursorPosition = $state<[number, number] | null>(null)

  async function handleSave(): Promise<void> {
    await actions.saveConfigAndRefresh()
  }

  function handleCancel(): void {
    configService.close()
    onClose()
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      handleCancel()
    } else if (event.ctrlKey && event.key === 's') {
      event.preventDefault()
      handleSaveAndClose()
    }
  }

  async function handleSaveAndClose(): Promise<void> {
    await actions.saveConfigAndRefresh()
    onClose()
  }

  function handleOverlayClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) {
      handleCancel()
    }
  }

  $effect(() => {
    if (show && dialogElement) {
      setTimeout(() => dialogElement!.focus(), 10)
    }
  })
</script>

{#if show}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="dialog-overlay" onclick={handleOverlayClick}>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="dialog settings-pane"
      bind:this={dialogElement}
      tabindex="0"
      onkeydown={handleKeydown}
      onclick={(e) => e.stopPropagation()}
    >
      <h3>Settings</h3>
      <div class="settings-editor-container">
        <Editor
          bind:value={configService.content}
          filename="config.toml"
          onSave={handleSave}
          onContentChange={(newValue) => (configService.content = newValue)}
          onExitCursorCapture={(line, column) =>
            (savedCursorPosition = [line, column])}
          initialCursor={savedCursorPosition}
        />
      </div>
      <div class="keyboard-hint">
        <p>
          Press <kbd>Ctrl+S</kbd> to save, <kbd>Esc</kbd> in normal mode to close
        </p>
      </div>
      <div class="settings-buttons">
        <button class="btn-primary" onclick={handleSave}>Save</button>
        <button class="btn-cancel" onclick={handleCancel}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  @import '/css/dialog.css';

  .settings-pane h3 {
    margin: 0 0 8px 0;
    font-size: 1.1em;
  }

  .settings-pane {
    min-width: unset;
    max-width: unset;
    width: 95vw;
    height: 92vh;
    display: flex;
    flex-direction: column;
  }

  .settings-editor-container {
    width: 100%;
    margin: 8px 0;
    border: 1px solid var(--theme-border);
    border-radius: 6px;
    overflow: hidden;
    background-color: var(--theme-bg-primary);
    flex: 1;
    min-height: 0;
  }

  .settings-buttons {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
    margin-top: 8px;
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
  }

  .settings-buttons button {
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
