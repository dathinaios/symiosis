import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/svelte'
import RecentlyDeleted from '../../../lib/ui/RecentlyDeleted.svelte'
import { resetAllMocks } from '../../test-utils'

const shortcuts = { up: 'Ctrl+k', down: 'Ctrl+j' }

function deletedFile(name: string) {
  return {
    filename: `${name}.md`,
    backup_filename: `${name}.delete_backup.1.md`,
    deleted_at: '2026-08-27',
    timestamp: 1,
  }
}

function renderDialog(files: ReturnType<typeof deletedFile>[]) {
  return render(RecentlyDeleted, {
    props: {
      show: true,
      files,
      selectedIndex: 0,
      onClose: vi.fn(),
      onRecover: vi.fn(),
      onSelectFile: vi.fn(),
      onNavigateUp: vi.fn(),
      onNavigateDown: vi.fn(),
    },
    context: new Map([['managers', { configManager: { shortcuts } }]]),
  })
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30))

describe('RecentlyDeleted focus retention', () => {
  beforeEach(() => {
    resetAllMocks()
  })

  it('takes focus back when a recovered row unmounts from under it', async () => {
    const files = [deletedFile('one'), deletedFile('two')]
    const { container, rerender } = renderDialog(files)
    await settle()

    const dialog = container.querySelector('.recently-deleted') as HTMLElement
    const rows = container.querySelectorAll('.file-item')
    expect(rows).toHaveLength(2)

    // Clicking a row focuses it — the row carries tabindex="-1".
    const recoveredRow = rows[0] as HTMLElement
    recoveredRow.focus()
    expect(document.activeElement).toBe(recoveredRow)

    // Recovering removes that row. Its unmount drops focus to <body>, which
    // leaves the dialog inert: its own keydown handler stops firing and the
    // global shortcuts are suppressed while a dialog is open.
    await rerender({ files: [files[1]] })
    await settle()

    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('leaves focus alone while it is still inside the dialog', async () => {
    const files = [deletedFile('one'), deletedFile('two')]
    const { container, rerender } = renderDialog(files)
    await settle()

    const button = container.querySelector('.btn-primary') as HTMLElement
    button.focus()
    expect(document.activeElement).toBe(button)

    await rerender({ files: [files[1]] })
    await settle()

    expect(document.activeElement).toBe(button)
  })
})
