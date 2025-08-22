/**
 * Core Layer - Progress Manager
 * Manages database loading progress state and UI coordination.
 * Provides reactive state for loading indicators and progress messages.
 */

export interface ProgressManagerDeps {
  focusSearch: () => void
}

interface ProgressState {
  isLoading: boolean
  message: string
  error: string | null
}

interface ProgressManager {
  readonly isLoading: boolean
  readonly message: string
  readonly error: string | null
  readonly hasError: boolean
  start(message: string): void
  updateProgress(message: string): void
  complete(): void
  setError(errorMessage: string): void
  clearError(): void
}

// Manager factory function
export function createProgressManager(
  deps: ProgressManagerDeps
): ProgressManager {
  const state = $state<ProgressState>({
    isLoading: false,
    message: '',
    error: null,
  })

  return {
    // Getters
    get isLoading() {
      return state.isLoading
    },
    get message() {
      return state.message
    },
    get error() {
      return state.error
    },
    get hasError() {
      return state.error !== null
    },

    // State updates (called by event listeners in app coordinator)
    start(message: string) {
      state.isLoading = true
      state.message = message
      state.error = null
    },

    updateProgress(message: string) {
      if (state.isLoading) {
        state.message = message
      }
    },

    complete() {
      state.isLoading = false
      state.message = ''
      state.error = null
      deps.focusSearch()
    },

    setError(errorMessage: string) {
      state.isLoading = false
      state.message = ''
      state.error = errorMessage
    },

    // Clear error manually
    clearError() {
      state.error = null
    },
  }
}
