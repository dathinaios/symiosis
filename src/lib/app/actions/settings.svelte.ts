/**
 * App Layer - Settings Actions
 * Configuration panel operations and settings management workflow.
 * Coordinates between UI state and configuration service operations.
 */

interface SettingsActionDeps {
  configManager: {
    openPane: () => Promise<void>
    closePane: () => void
  }
  focusManager: {
    focusSearch: () => void
  }
}

interface SettingsActions {
  openSettingsPane(): Promise<void>
  closeSettingsPane(): void
}

export function createSettingsActions(
  deps: SettingsActionDeps
): SettingsActions {
  const { configManager, focusManager } = deps

  async function openSettingsPane(): Promise<void> {
    await configManager.openPane()
    focusManager.focusSearch()
  }

  function closeSettingsPane(): void {
    configManager.closePane()
    focusManager.focusSearch()
  }

  return {
    openSettingsPane,
    closeSettingsPane,
  }
}
