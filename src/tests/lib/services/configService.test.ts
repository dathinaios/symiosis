import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockInvoke, resetAllMocks } from '../../test-utils'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}))

import { configService } from '../../../lib/services/configService.svelte'

describe('configService', () => {
  beforeEach(() => {
    resetAllMocks()
    configService.clearError()
  })

  describe('utility methods', () => {
    it('should check if config exists', async () => {
      mockInvoke.mockResolvedValueOnce(true)

      const exists = await configService.exists()

      expect(mockInvoke).toHaveBeenCalledWith('config_exists')
      expect(exists).toBe(true)
    })

    it('should handle errors when checking config existence', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Access denied'))

      const exists = await configService.exists()

      expect(exists).toBe(false)
    })

    it('should refresh cache manually', async () => {
      mockInvoke.mockResolvedValueOnce(undefined)

      await configService.refreshCache()

      expect(mockInvoke).toHaveBeenCalledWith('refresh_cache')
    })

    it('should handle refresh cache errors', async () => {
      const error = new Error('Cache refresh failed')
      mockInvoke.mockRejectedValueOnce(error)

      await expect(configService.refreshCache()).rejects.toThrow(error)
    })
  })

  describe('error handling', () => {
    it('should clear errors', () => {
      configService.clearError()
      expect(configService.error).toBeNull()
    })
  })

  describe('loadCustomThemeFile', () => {
    it('should load custom theme file', async () => {
      const cssContent = '.custom { color: red; }'
      mockInvoke.mockResolvedValueOnce(cssContent)

      const result =
        await configService.loadCustomThemeFile('/path/to/theme.css')

      expect(mockInvoke).toHaveBeenCalledWith('load_custom_theme_file', {
        path: '/path/to/theme.css',
      })
      expect(result).toBe(cssContent)
    })
  })
})
