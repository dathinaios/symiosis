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

function highlightMatches(content: string, query: string): string {
  if (!query.trim()) {
    return content
  }

  const key = `${content.substring(0, 100)}:${query}`
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

  const escapedQuery = escapeRegex(query)
  const regex = new RegExp(`(${escapedQuery})`, 'gi')
  const result = content.replace(regex, '<mark class="highlight">$1</mark>')

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
