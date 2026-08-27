/**
 * Core Layer - Content Highlighting
 * Search term highlighting functionality with caching for performance.
 * Handles regex escaping, term extraction, and HTML content highlighting.
 */

interface CacheEntry {
  result: string
  timestamp: number
  accessCount: number
}

const MAX_CACHE_SIZE = 100
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const highlightCache = new Map<string, CacheEntry>()

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * FNV-1a over the whole string. Used for cache keys: a content prefix is not
 * enough, because two notes that share their opening markup would collide and
 * be served each other's highlighted body.
 */
function hashString(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `${text.length}:${hash.toString(36)}`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function cleanExpiredEntries(): void {
  const now = Date.now()
  for (const [key, entry] of highlightCache) {
    if (now - entry.timestamp > CACHE_TTL) {
      highlightCache.delete(key)
    }
  }
}

function evictLRUEntry(): void {
  let oldestKey: string | null = null
  let oldestAccess = Infinity

  for (const [key, entry] of highlightCache) {
    if (entry.accessCount < oldestAccess) {
      oldestAccess = entry.accessCount
      oldestKey = key
    }
  }

  if (oldestKey) {
    highlightCache.delete(oldestKey)
  }
}

/**
 * Wrap matches in `<mark>` without touching HTML markup.
 *
 * The content is rendered HTML, so a naive replace over the whole string also
 * matches inside tag names and attribute values — searching "http" would rewrite
 * an `href`, and searching "code" would destroy a `<pre><code>` block. Splitting
 * on tags first and rewriting only the text segments keeps the markup intact.
 */
function markTextOutsideTags(content: string, query: string): string {
  const regex = new RegExp(`(${escapeRegex(query)})`, 'gi')

  return content
    .split(/(<[^>]*>)/)
    .map((segment) =>
      segment.startsWith('<')
        ? segment
        : segment.replace(regex, '<mark class="highlight">$1</mark>')
    )
    .join('')
}

function highlightMatches(content: string, query: string): string {
  if (!query.trim()) {
    return content
  }

  const key = `${hashString(content)}:${query}`
  const cached = highlightCache.get(key)

  if (cached) {
    cached.accessCount++
    cached.timestamp = Date.now()
    return cached.result
  }

  cleanExpiredEntries()
  if (highlightCache.size >= MAX_CACHE_SIZE) {
    evictLRUEntry()
  }

  const result = markTextOutsideTags(content, query)

  highlightCache.set(key, {
    result,
    timestamp: Date.now(),
    accessCount: 1,
  })

  return result
}

export function getHighlightedContent(
  content: string,
  query: string,
  hideHighlights: boolean
): string {
  if (!query.trim() || hideHighlights) {
    return content
  }
  return highlightMatches(content, query)
}

export function getHighlightedTitle(
  title: string,
  query: string,
  hideHighlights: boolean = false
): string {
  const escaped = escapeHtml(title)
  if (!query.trim() || query.length < 3 || hideHighlights) {
    return escaped
  }
  return highlightMatches(escaped, query)
}

export function clearHighlightCache(): void {
  highlightCache.clear()
}

// Periodic cleanup every 30 seconds
if (typeof window !== 'undefined') {
  setInterval(cleanExpiredEntries, 30000)
}
