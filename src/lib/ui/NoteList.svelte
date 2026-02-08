<!--
UI Layer - Note List
Displays filtered notes with virtualization and selection highlighting.
Handles note selection state and integrates with keyboard navigation.
-->

<script lang="ts">
  import { getContext } from 'svelte'
  import type {
    AppManagers,
    AppState,
    AppActions,
  } from '../app/appCoordinator.svelte'
  import { getHighlightedTitle } from '../utils/contentHighlighting.svelte'

  const { focusManager, contentNavigationManager, configManager } =
    getContext<AppManagers>('managers')
  const appState = getContext<AppState>('state')
  const actions = getContext<AppActions>('actions')
  const create_note_key = configManager.shortcuts.create_note

  let noteListElement = $state<HTMLElement | undefined>(undefined)

  $effect(() => {
    if (noteListElement) {
      focusManager.setNoteListElement(noteListElement)
    }
  })
</script>

<div class="notes-list-container">
  <div class="notes-list">
    {#if appState.isLoading && appState.filteredNotes.length === 0}
      <div class="loading">Loading...</div>
    {:else if appState.filteredNotes.length === 0}
      <div class="no-notes">Press {create_note_key} to create the note.</div>
    {:else}
      <ul bind:this={noteListElement} tabindex="-1">
        {#each appState.filteredNotes as note, index (note.filename)}
          <li>
            <button
              class:selected={index === focusManager.selectedIndex}
              tabindex="-1"
              onclick={() => {
                focusManager.setSelectedIndex(index)
                actions.loadNoteContent(note.filename)
              }}
            >
              <div class="note-title">
                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                {@html getHighlightedTitle(
                  note.filename,
                  appState.query,
                  contentNavigationManager.hideHighlights
                )}
              </div>
              <div class="note-date">
                {new Date(note.modified * 1000).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </div>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .notes-list-container {
    flex: 0.4;
    min-height: 0;
    border-bottom: 2px solid var(--theme-border);
  }
  .notes-list {
    height: 100%;
    overflow-y: auto;
    transform: translateZ(0);
    will-change: scroll-position;
    scroll-behavior: smooth;
  }
  .loading,
  .no-notes {
    padding: 2em;
    text-align: center;
    color: var(--theme-text-muted);
    font-style: italic;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
    contain: content;
  }
  li {
    margin: 0;
    margin-bottom: -5px;
    contain: layout;
  }
  button {
    width: 100%;
    height: calc(0.6em * 2 + 1em + 15px);
    padding: 0.6em 1em;
    cursor: pointer;
    border: none;
    border-bottom: 1px solid var(--theme-list-divider);
    background: none;
    color: var(--theme-text-primary);
    text-align: left;
    font-size: 0.95em;
    contain: layout;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .note-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .note-date {
    flex-shrink: 0;
    font-size: 0.85em;
    color: var(--theme-text-muted);
    opacity: 0.7;
  }
  .selected {
    background-color: var(--theme-bg-tertiary) !important;
    color: var(--theme-highlight);
  }
  .notes-list::-webkit-scrollbar {
    width: 8px;
  }
  .notes-list::-webkit-scrollbar-track {
    background: var(--theme-bg-primary);
  }
  .notes-list::-webkit-scrollbar-thumb {
    background: var(--theme-border);
    border-radius: 4px;
  }
  :global(.notes-list .highlight) {
    background-color: rgba(254, 145, 0, 0.75) !important;
    border-radius: 3px !important;
    padding: 0.1em 0.3em !important;
    font-weight: 500 !important;
    color: #f0f0f0 !important;
    display: inline !important;
  }
</style>
