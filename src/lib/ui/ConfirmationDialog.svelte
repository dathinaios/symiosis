<!--
UI Layer - Confirmation Dialog
Generic confirmation modal for yes/no decisions.
Used for exit-edit-with-unsaved-changes confirmations.
-->

<script lang="ts">
  interface Props {
    show: boolean
    title?: string
    message: string
    confirmText?: string
    cancelText?: string
    variant?: 'default' | 'danger'
    onConfirm?: () => void
    onCancel?: () => void
  }

  const {
    show,
    title = 'Confirm',
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'default',
    onConfirm,
    onCancel,
  }: Props = $props()

  let dialogElement = $state<HTMLElement | undefined>(undefined)

  function handleConfirm(): void {
    onConfirm?.()
  }

  function handleCancel(): void {
    onCancel?.()
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      handleCancel()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      handleConfirm()
    }
  }

  function handleOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
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
      class="dialog"
      bind:this={dialogElement}
      tabindex="0"
      onkeydown={handleKeydown}
      onclick={(e) => e.stopPropagation()}
    >
      <h3>{title}</h3>
      <p class="dialog-message">{message}</p>
      <div class="dialog-buttons">
        <button class="cancel-btn" onclick={handleCancel}>
          {cancelText} (Esc)
        </button>
        <button
          class="confirm-btn {variant === 'danger' ? 'danger' : ''}"
          onclick={handleConfirm}
        >
          {confirmText} (Enter)
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  @import '/css/dialog.css';

  .dialog-message {
    margin: 0 0 12px 0;
    color: var(--theme-text-secondary);
    line-height: 1.5;
  }

  .cancel-btn {
    background-color: var(--theme-bg-tertiary);
    color: var(--theme-text-primary);
  }

  .cancel-btn:hover {
    background-color: var(--theme-border);
  }

  .confirm-btn {
    background-color: var(--theme-success);
    color: var(--theme-bg-primary);
  }

  .confirm-btn:hover {
    background-color: var(--theme-accent);
    filter: brightness(1.1);
  }

  .confirm-btn.danger {
    background-color: var(--theme-warning);
    color: var(--theme-bg-primary);
  }

  .confirm-btn.danger:hover {
    background-color: var(--theme-warning);
    filter: brightness(1.1);
  }
</style>
