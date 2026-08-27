/**
 * Core Layer - Progress Manager
 * Manages database loading progress state and UI coordination.
 * Provides reactive state for loading indicators and progress messages.
 */

interface ProgressState {
  isLoading: boolean
  message: string
  error: string | null
  type: 'subtle' | 'modal'
}

export interface ProgressManager {
  readonly isLoading: boolean
  readonly message: string
  readonly error: string | null
  readonly hasError: boolean
  readonly type: 'subtle' | 'modal'
  readonly showModal: boolean
  readonly showSubtle: boolean
  start(message: string, type?: 'subtle' | 'modal'): void
  updateProgress(message: string): void
  complete(): void
  setError(errorMessage: string): void
  clearError(): void
}

export function createProgressManager(): ProgressManager {
  const state = $state<ProgressState>({
    isLoading: false,
    message: '',
    error: null,
    type: 'modal',
  })

  return {
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
    get type() {
      return state.type
    },
    get showModal() {
      return state.isLoading && state.type === 'modal'
    },
    get showSubtle() {
      return state.isLoading && state.type === 'subtle'
    },

    start(message: string, type: 'subtle' | 'modal' = 'modal') {
      state.isLoading = true
      state.message = message
      state.error = null
      state.type = type
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
      state.type = 'modal' // Reset to default
    },

    setError(errorMessage: string) {
      state.isLoading = false
      state.message = ''
      state.error = errorMessage
      state.type = 'modal' // Errors always use modal for visibility
    },

    clearError() {
      state.error = null
    },
  }
}
