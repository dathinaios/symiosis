/**
 * Recently Deleted Manager Tests (Factory-based - TDD)
 * Tests for recently deleted files modal state management and coordination.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createRecentlyDeletedManager,
  type RecentlyDeletedManagerDeps,
} from '../../../lib/core/recentlyDeletedManager.svelte'
import type { DeletedFile } from '../../../lib/types/note'
import { resetAllMocks } from '../../test-utils'

const mockDeps = {
  focusSearch: vi.fn(),
  refreshCacheAndUI: vi.fn(),
  versionService: {
    getDeletedFiles: vi.fn(),
    recoverDeletedFile: vi.fn(),
  },
} satisfies RecentlyDeletedManagerDeps

describe('recentlyDeletedManager (factory-based - TDD)', () => {
  let manager: ReturnType<typeof createRecentlyDeletedManager>

  beforeEach(() => {
    resetAllMocks()
    vi.clearAllMocks()
    vi.mocked(mockDeps.versionService.getDeletedFiles).mockReset()
    vi.mocked(mockDeps.versionService.recoverDeletedFile).mockReset()
    manager = createRecentlyDeletedManager(mockDeps)
  })

  describe('initial state', () => {
    it('should initialize with correct default state', () => {
      expect(manager.isVisible).toBe(false)
      expect(manager.files).toEqual([])
      expect(manager.selectedIndex).toBe(0)
      expect(manager.isLoading).toBe(false)
      expect(manager.error).toBeNull()
    })
  })

  describe('openDialog', () => {
    it('should open dialog and load deleted files', async () => {
      const mockFiles: DeletedFile[] = [
        {
          filename: 'deleted-note',
          backup_filename: 'deleted-note.backup',
          deleted_at: '2023-01-01',
          timestamp: 1234567890,
        },
      ]
      mockDeps.versionService.getDeletedFiles.mockResolvedValue({
        success: true,
        files: mockFiles,
      })

      await manager.openDialog()

      expect(manager.isVisible).toBe(true)
      expect(manager.selectedIndex).toBe(0)
      expect(manager.error).toBeNull()
      expect(manager.files).toEqual(mockFiles)
    })

    it('should handle no deleted files', async () => {
      mockDeps.versionService.getDeletedFiles.mockResolvedValue({
        success: true,
        files: [],
      })

      await manager.openDialog()

      expect(manager.isVisible).toBe(true)
      expect(manager.files).toEqual([])
    })

    it('should handle API errors', async () => {
      mockDeps.versionService.getDeletedFiles.mockResolvedValue({
        success: false,
        error: 'Database error',
      })

      await manager.openDialog()

      expect(manager.error).toBe('Database error')
      expect(manager.files).toEqual([])
    })

    it('should handle exceptions', async () => {
      mockDeps.versionService.getDeletedFiles.mockRejectedValue('Network error')

      await manager.openDialog()

      expect(manager.error).toContain('Failed to load deleted files')
      expect(manager.files).toEqual([])
    })
  })

  describe('closeDialog', () => {
    it('should close dialog and reset state', async () => {
      const mockFiles: DeletedFile[] = [
        {
          filename: 'deleted-note',
          backup_filename: 'deleted-note.backup',
          deleted_at: '2023-01-01',
          timestamp: 1234567890,
        },
      ]
      mockDeps.versionService.getDeletedFiles.mockResolvedValue({
        success: true,
        files: mockFiles,
      })

      await manager.openDialog()
      manager.selectFile(0)
      expect(manager.isVisible).toBe(true)
      expect(manager.files.length).toBeGreaterThan(0)

      manager.closeDialog()

      expect(manager.isVisible).toBe(false)
      expect(manager.files).toEqual([])
      expect(manager.selectedIndex).toBe(0)
      expect(manager.error).toBeNull()
      expect(mockDeps.focusSearch).toHaveBeenCalled()
    })
  })

  describe('selectFile', () => {
    beforeEach(async () => {
      const mockFiles: DeletedFile[] = [
        {
          filename: 'file1',
          backup_filename: 'file1.backup',
          deleted_at: '2023-01-01',
          timestamp: 1,
        },
        {
          filename: 'file2',
          backup_filename: 'file2.backup',
          deleted_at: '2023-01-02',
          timestamp: 2,
        },
        {
          filename: 'file3',
          backup_filename: 'file3.backup',
          deleted_at: '2023-01-03',
          timestamp: 3,
        },
      ]
      mockDeps.versionService.getDeletedFiles.mockResolvedValue({
        success: true,
        files: mockFiles,
      })
      await manager.openDialog()
    })

    it('should select valid file index', () => {
      manager.selectFile(1)
      expect(manager.selectedIndex).toBe(1)
    })

    it('should ignore negative index', () => {
      manager.selectFile(-1)
      expect(manager.selectedIndex).toBe(0) // Should remain unchanged
    })

    it('should ignore index out of bounds', () => {
      manager.selectFile(10)
      expect(manager.selectedIndex).toBe(0) // Should remain unchanged
    })
  })

  describe('navigation', () => {
    beforeEach(async () => {
      const mockFiles: DeletedFile[] = [
        {
          filename: 'file1',
          backup_filename: 'file1.backup',
          deleted_at: '2023-01-01',
          timestamp: 1,
        },
        {
          filename: 'file2',
          backup_filename: 'file2.backup',
          deleted_at: '2023-01-02',
          timestamp: 2,
        },
        {
          filename: 'file3',
          backup_filename: 'file3.backup',
          deleted_at: '2023-01-03',
          timestamp: 3,
        },
      ]
      mockDeps.versionService.getDeletedFiles.mockResolvedValue({
        success: true,
        files: mockFiles,
      })
      await manager.openDialog()
    })

    describe('navigateUp', () => {
      it('should move to previous file', () => {
        manager.selectFile(2)

        manager.navigateUp()

        expect(manager.selectedIndex).toBe(1)
      })

      it('should not move past first file', () => {
        manager.selectFile(0)

        manager.navigateUp()

        expect(manager.selectedIndex).toBe(0)
      })
    })

    describe('navigateDown', () => {
      it('should move to next file', () => {
        manager.selectFile(0)

        manager.navigateDown()

        expect(manager.selectedIndex).toBe(1)
      })

      it('should not move past last file', () => {
        manager.selectFile(2)

        manager.navigateDown()

        expect(manager.selectedIndex).toBe(2)
      })
    })
  })

  describe('recoverFile', () => {
    const mockFiles: DeletedFile[] = [
      {
        filename: 'deleted-note',
        backup_filename: 'deleted-note.backup',
        deleted_at: '2023-01-01',
        timestamp: 1234567890,
      },
      {
        filename: 'another-note',
        backup_filename: 'another-note.backup',
        deleted_at: '2023-01-02',
        timestamp: 1234567891,
      },
    ]

    beforeEach(async () => {
      mockDeps.versionService.getDeletedFiles.mockResolvedValue({
        success: true,
        files: mockFiles,
      })
      await manager.openDialog()
    })

    it('should recover file successfully and refresh UI', async () => {
      mockDeps.versionService.recoverDeletedFile.mockResolvedValue({
        success: true,
      })

      await manager.recoverFile('deleted-note')

      expect(mockDeps.versionService.recoverDeletedFile).toHaveBeenCalledWith(
        'deleted-note',
        'deleted-note.backup'
      )
      expect(mockDeps.refreshCacheAndUI).toHaveBeenCalled()
      expect(manager.files).toHaveLength(1) // File should be removed from list
      expect(manager.files[0].filename).toBe('another-note')
    })

    it('should adjust selected index when removing selected file', async () => {
      manager.selectFile(1) // Select second file
      mockDeps.versionService.recoverDeletedFile.mockResolvedValue({
        success: true,
      })

      await manager.recoverFile('another-note')

      expect(manager.selectedIndex).toBe(0) // Should adjust to valid index
    })

    it('should close dialog when no files remain', async () => {
      mockDeps.versionService.recoverDeletedFile.mockResolvedValue({
        success: true,
      })

      await manager.recoverFile('deleted-note')
      await manager.recoverFile('another-note')

      expect(manager.isVisible).toBe(false)
    })

    it('should handle file not found in list', async () => {
      await manager.recoverFile('non-existent-file')

      expect(manager.error).toContain('File not found in deleted files list')
      expect(mockDeps.versionService.recoverDeletedFile).not.toHaveBeenCalled()
    })

    it('should handle recovery API error', async () => {
      mockDeps.versionService.recoverDeletedFile.mockResolvedValue({
        success: false,
        error: 'Recovery failed',
      })

      await manager.recoverFile('deleted-note')

      expect(manager.error).toBe('Recovery failed')
      expect(manager.files).toHaveLength(2) // Files should remain unchanged
    })

    it('should handle recovery exception', async () => {
      mockDeps.versionService.recoverDeletedFile.mockRejectedValue(
        'Network error'
      )

      await manager.recoverFile('deleted-note')

      expect(manager.error).toContain('Failed to recover file')
    })
  })

  describe('loading states', () => {
    it('should show loading during file listing', async () => {
      let resolvePromise: (value: {
        success: boolean
        files: unknown[]
      }) => void
      const promise = new Promise((resolve) => {
        resolvePromise = resolve
      })
      mockDeps.versionService.getDeletedFiles.mockReturnValue(promise)

      const openPromise = manager.openDialog()
      expect(manager.isLoading).toBe(true)

      resolvePromise!({ success: true, files: [] })
      await openPromise
      expect(manager.isLoading).toBe(false)
    })

    it('should show loading during recovery', async () => {
      const mockFiles: DeletedFile[] = [
        {
          filename: 'deleted-note',
          backup_filename: 'deleted-note.backup',
          deleted_at: '2023-01-01',
          timestamp: 1234567890,
        },
      ]
      mockDeps.versionService.getDeletedFiles.mockResolvedValue({
        success: true,
        files: mockFiles,
      })
      await manager.openDialog()

      let resolveRecovery: (value: { success: boolean }) => void
      const recoveryPromise = new Promise((resolve) => {
        resolveRecovery = resolve
      })
      mockDeps.versionService.recoverDeletedFile.mockReturnValue(
        recoveryPromise
      )

      const recoverPromise = manager.recoverFile('deleted-note')
      expect(manager.isLoading).toBe(true)

      resolveRecovery!({ success: true })
      await recoverPromise
      expect(manager.isLoading).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('closeDialog() while isLoading is true should reset visible state but loading continues', async () => {
      const mockFiles: DeletedFile[] = [
        {
          filename: 'test-file',
          backup_filename: 'test-file.backup',
          deleted_at: '2023-01-01',
          timestamp: 1234567890,
        },
      ]

      // Start loading files
      let resolvePromise: (value: {
        success: boolean
        files: DeletedFile[]
      }) => void
      const promise = new Promise<{ success: boolean; files: DeletedFile[] }>(
        (resolve) => {
          resolvePromise = resolve
        }
      )
      mockDeps.versionService.getDeletedFiles.mockReturnValue(promise)

      // Start opening dialog - this will start loading
      const openPromise = manager.openDialog()
      expect(manager.isLoading).toBe(true)

      // Close while still loading
      manager.closeDialog()

      // Should reset visible state but loading continues
      expect(manager.isLoading).toBe(true) // Loading continues in background
      expect(manager.isVisible).toBe(false) // Dialog is hidden
      expect(manager.files).toEqual([]) // Files reset

      // Complete the promise
      resolvePromise!({ success: true, files: mockFiles })
      await openPromise

      // After completion, loading should be done
      expect(manager.isLoading).toBe(false)
    })

    it('recovering the last remaining file should close the dialog and reset selectedIndex to 0', async () => {
      const mockFiles: DeletedFile[] = [
        {
          filename: 'last-file',
          backup_filename: 'last-file.backup',
          deleted_at: '2023-01-01',
          timestamp: 1234567890,
        },
      ]

      mockDeps.versionService.getDeletedFiles.mockResolvedValue({
        success: true,
        files: mockFiles,
      })
      await manager.openDialog()
      mockDeps.versionService.recoverDeletedFile.mockResolvedValue({
        success: true,
      })

      await manager.recoverFile('last-file')

      expect(manager.isVisible).toBe(false)
      expect(manager.selectedIndex).toBe(0)
    })

    it('after recovering a file, calling navigateUp/navigateDown should keep selectedIndex valid', async () => {
      const mockFiles: DeletedFile[] = [
        {
          filename: 'file1',
          backup_filename: 'file1.backup',
          deleted_at: '2023-01-01',
          timestamp: 1,
        },
        {
          filename: 'file2',
          backup_filename: 'file2.backup',
          deleted_at: '2023-01-02',
          timestamp: 2,
        },
        {
          filename: 'file3',
          backup_filename: 'file3.backup',
          deleted_at: '2023-01-03',
          timestamp: 3,
        },
      ]

      mockDeps.versionService.getDeletedFiles.mockResolvedValue({
        success: true,
        files: mockFiles,
      })
      await manager.openDialog()

      manager.selectFile(2) // Select last file
      mockDeps.versionService.recoverDeletedFile.mockResolvedValue({
        success: true,
      })

      await manager.recoverFile('file3')

      // Should adjust index to valid range
      expect(manager.selectedIndex).toBe(1) // Last valid index after removal

      manager.navigateDown()
      expect(manager.selectedIndex).toBe(1) // Should not go beyond bounds

      manager.navigateUp()
      expect(manager.selectedIndex).toBe(0) // Should navigate up normally
    })

    it('repeated navigateUp at the first item should keep selectedIndex = 0', async () => {
      const mockFiles: DeletedFile[] = [
        {
          filename: 'file1',
          backup_filename: 'file1.backup',
          deleted_at: '2023-01-01',
          timestamp: 1,
        },
        {
          filename: 'file2',
          backup_filename: 'file2.backup',
          deleted_at: '2023-01-02',
          timestamp: 2,
        },
      ]

      mockDeps.versionService.getDeletedFiles.mockResolvedValue({
        success: true,
        files: mockFiles,
      })
      await manager.openDialog()

      manager.selectFile(0) // At first item

      manager.navigateUp()
      expect(manager.selectedIndex).toBe(0)

      manager.navigateUp()
      expect(manager.selectedIndex).toBe(0)

      manager.navigateUp()
      expect(manager.selectedIndex).toBe(0)
    })

    it('repeated navigateDown at the last item should keep selectedIndex = last', async () => {
      const mockFiles: DeletedFile[] = [
        {
          filename: 'file1',
          backup_filename: 'file1.backup',
          deleted_at: '2023-01-01',
          timestamp: 1,
        },
        {
          filename: 'file2',
          backup_filename: 'file2.backup',
          deleted_at: '2023-01-02',
          timestamp: 2,
        },
      ]

      mockDeps.versionService.getDeletedFiles.mockResolvedValue({
        success: true,
        files: mockFiles,
      })
      await manager.openDialog()

      manager.selectFile(1) // At last item

      manager.navigateDown()
      expect(manager.selectedIndex).toBe(1)

      manager.navigateDown()
      expect(manager.selectedIndex).toBe(1)

      manager.navigateDown()
      expect(manager.selectedIndex).toBe(1)
    })
  })
})
