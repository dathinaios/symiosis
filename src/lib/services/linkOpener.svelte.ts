/**
 * Service Layer - Link Opener
 * The platform's "open this in whatever handles it" capability, behind an
 * interface so `core/` never imports a Tauri plugin directly.
 *
 * The import stays dynamic: the opener plugin is only needed when a user
 * actually follows a link, and loading it lazily keeps it out of the startup
 * bundle.
 */

import type { LinkOpener } from '../core/contentNavigationManager.svelte'

export const linkOpener: LinkOpener = {
  async openPath(path: string): Promise<void> {
    const { openPath } = await import('@tauri-apps/plugin-opener')
    await openPath(path)
  },

  async openUrl(url: string): Promise<void> {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
  },
}
