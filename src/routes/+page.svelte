<!--
Route Layer - Main Page
Root application component that initializes managers, context, and handles app lifecycle.
Composes all UI components and provides keyboard event handling for the entire app.
-->

<script lang="ts">
  import { onMount, setContext } from 'svelte'
  import AppLayout from '../lib/ui/AppLayout.svelte'
  import SearchInput from '../lib/ui/SearchInput.svelte'
  import NoteList from '../lib/ui/NoteList.svelte'
  import NoteView from '../lib/ui/NoteView.svelte'
  import ConfirmationDialog from '../lib/ui/ConfirmationDialog.svelte'
  import InputDialog from '../lib/ui/InputDialog.svelte'
  import DeleteDialog from '../lib/ui/DeleteDialog.svelte'
  import SettingsPane from '../lib/ui/SettingsPane.svelte'
  import VersionExplorer from '../lib/ui/VersionExplorer.svelte'
  import RecentlyDeleted from '../lib/ui/RecentlyDeleted.svelte'
  import ProgressOverlay from '../lib/ui/ProgressOverlay.svelte'
  import SubtleProgressIndicator from '../lib/ui/SubtleProgressIndicator.svelte'
  import HintsPanel from '../lib/ui/HintsPanel.svelte'
  import Notification from '../lib/ui/Notification.svelte'
  import { createAppCoordinator } from '../lib/app/appCoordinator.svelte'

  const appCoordinator = createAppCoordinator({})

  setContext('managers', {
    ...appCoordinator.managers,
    appCoordinator,
  })

  setContext('state', appCoordinator.state)
  setContext('actions', appCoordinator.actions)

  const {
    dialogManager,
    progressManager,
    versionExplorerManager,
    recentlyDeletedManager,
    configManager,
  } = appCoordinator.managers
  const appState = appCoordinator.state
  const actions = appCoordinator.actions

  const handleKeydown = appCoordinator.keyboardActions

  appCoordinator.setupReactiveEffects()

  onMount(() => {
    let cleanup: (() => void) | undefined
    ;(async () => {
      cleanup = await appCoordinator.initialize()
    })()
    return () => cleanup?.()
  })
</script>

<svelte:window onkeydown={handleKeydown} />

<AppLayout>
  <SearchInput slot="search" />
  <NoteList slot="list" />
  <NoteView slot="view" />

  <div slot="modals">
    <SettingsPane
      show={configManager.isVisible}
      onClose={() => appCoordinator.handleSettingsClose()}
    />

    <VersionExplorer
      show={versionExplorerManager.isVisible}
      onClose={() => versionExplorerManager.closeVersionExplorer()}
    />

    <RecentlyDeleted
      show={recentlyDeletedManager.isVisible}
      files={recentlyDeletedManager.files}
      selectedIndex={recentlyDeletedManager.selectedIndex}
      onClose={() => recentlyDeletedManager.closeDialog()}
      onRecover={(filename) => recentlyDeletedManager.recoverFile(filename)}
      onSelectFile={(index) => recentlyDeletedManager.selectFile(index)}
      onNavigateUp={() => recentlyDeletedManager.navigateUp()}
      onNavigateDown={() => recentlyDeletedManager.navigateDown()}
    />

    <DeleteDialog
      show={dialogManager.showDeleteDialog}
      noteName={appState.selectedNote || ''}
      deleteKeyPressCount={dialogManager.deleteKeyPressCount}
      onConfirm={actions.deleteNote}
      onCancel={dialogManager.closeDeleteDialog}
      onKeyPress={() =>
        dialogManager.handleDeleteKeyPress(() => actions.deleteNote())}
    />

    <InputDialog
      show={dialogManager.showCreateDialog}
      title="Create New Note"
      value={dialogManager.newNoteName}
      placeholder="Enter note name (extension will be .md)"
      confirmText="Create"
      cancelText="Cancel"
      autoSelect={true}
      onConfirm={(value) => actions.createNote(value)}
      onCancel={dialogManager.closeCreateDialog}
      onInput={(value) => (dialogManager.newNoteName = value)}
    />

    <InputDialog
      show={dialogManager.showRenameDialog}
      title="Rename Note"
      value={dialogManager.newNoteNameForRename}
      placeholder="Enter new note name"
      confirmText="Rename"
      cancelText="Cancel"
      autoSelect={true}
      onConfirm={(value) => actions.renameNote(value)}
      onCancel={dialogManager.closeRenameDialog}
      onInput={(value) => (dialogManager.newNoteNameForRename = value)}
    />

    <ConfirmationDialog
      show={dialogManager.showUnsavedChangesDialog}
      title="Unsaved Changes"
      message="You have unsaved changes. What would you like to do?"
      confirmText="Save and Exit"
      cancelText="Discard Changes"
      variant="default"
      onConfirm={() => dialogManager.handleSaveAndExit(actions.saveAndExitNote)}
      onCancel={() => dialogManager.handleDiscardAndExit(actions.exitEditMode)}
    />

    <ProgressOverlay
      show={progressManager.showModal}
      message={progressManager.message}
      error={progressManager.error}
    />
  </div>
</AppLayout>

<SubtleProgressIndicator
  show={progressManager.showSubtle}
  message={progressManager.message}
/>

<HintsPanel />
<Notification />
