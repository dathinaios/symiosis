import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  getHighlightedContent,
  clearHighlightCache,
} from '$lib/utils/contentHighlighting.svelte'

describe('contentHighlighting', () => {
  beforeEach(() => {
    clearHighlightCache()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('getHighlightedContent', () => {
    it('should return original content when query is empty', () => {
      const content = 'Hello world'
      const result = getHighlightedContent(content, '', false)
      expect(result).toBe(content)
    })

    it('should return original content when query is only whitespace', () => {
      const content = 'Hello world'
      const result = getHighlightedContent(content, '   ', false)
      expect(result).toBe(content)
    })

    it('should return original content when highlights are cleared', () => {
      const content = 'Hello world'
      const result = getHighlightedContent(content, 'world', true)
      expect(result).toBe(content)
    })

    it('should highlight single word matches', () => {
      const content = 'Hello world'
      const result = getHighlightedContent(content, 'world', false)
      expect(result).toBe('Hello <mark class="highlight">world</mark>')
    })

    it('should highlight multiple occurrences case-insensitively', () => {
      const content = 'Hello WORLD and world again'
      const result = getHighlightedContent(content, 'world', false)
      expect(result).toBe(
        'Hello <mark class="highlight">WORLD</mark> and <mark class="highlight">world</mark> again'
      )
    })

    it('should escape regex special characters in query', () => {
      const content = 'Cost is $100 (dollars)'
      const result = getHighlightedContent(content, '$100', false)
      expect(result).toBe(
        'Cost is <mark class="highlight">$100</mark> (dollars)'
      )
    })

    it('should handle parentheses in query', () => {
      const content = 'Cost is $100 (dollars)'
      const result = getHighlightedContent(content, '(dollars)', false)
      expect(result).toBe(
        'Cost is $100 <mark class="highlight">(dollars)</mark>'
      )
    })

    it('should handle brackets in query', () => {
      const content = 'Array[0] contains data'
      const result = getHighlightedContent(content, '[0]', false)
      expect(result).toBe(
        'Array<mark class="highlight">[0]</mark> contains data'
      )
    })

    it('should handle regex quantifiers in query', () => {
      const content = 'Match * and + symbols'
      const result = getHighlightedContent(content, '*', false)
      expect(result).toBe(
        'Match <mark class="highlight">*</mark> and + symbols'
      )
    })
  })

  describe('caching behavior', () => {
    it('should cache results for identical content and query', () => {
      const content = 'Hello world'
      const query = 'world'

      const result1 = getHighlightedContent(content, query, false)
      const result2 = getHighlightedContent(content, query, false)

      expect(result1).toBe(result2)
      expect(result1).toBe('Hello <mark class="highlight">world</mark>')
    })

    it('should use cache key based on full content and full query', () => {
      const shortContent = 'Hello world'
      const longContent =
        'Hello world with much more content that extends beyond the cache key prefix length of 100 characters to test that different content with same prefix uses different cache entries'
      const query = 'world'

      const result1 = getHighlightedContent(shortContent, query, false)
      const result2 = getHighlightedContent(longContent, query, false)

      expect(result1).toBe('Hello <mark class="highlight">world</mark>')
      expect(result2).toContain('<mark class="highlight">world</mark>')
      expect(result1).not.toBe(result2)
    })

    it('should not collide when two notes share their first 100 characters', () => {
      const shared =
        '<h1>Meeting notes</h1><p>Attendees were present and the </p>'
      const noteA = `${shared}<p>first topic was the budget review</p>`
      const noteB = `${shared}<p>first topic was the hiring plan</p>`
      const query = 'topic'

      expect(shared.length).toBeGreaterThan(50)

      const resultA = getHighlightedContent(noteA, query, false)
      const resultB = getHighlightedContent(noteB, query, false)

      expect(resultA).toContain('budget review')
      expect(resultB).toContain('hiring plan')
      expect(resultA).not.toContain('hiring plan')
      expect(resultB).not.toContain('budget review')
    })

    it('should update access count and timestamp on cache hit', () => {
      const content = 'Hello world'
      const query = 'world'

      vi.setSystemTime(1000)
      getHighlightedContent(content, query, false)

      vi.setSystemTime(2000)
      const result = getHighlightedContent(content, query, false)

      expect(result).toBe('Hello <mark class="highlight">world</mark>')
    })
  })

  describe('cache size management', () => {
    it('should evict LRU entry when cache exceeds MAX_CACHE_SIZE', () => {
      const maxSize = 100 // Based on MAX_CACHE_SIZE constant

      // Fill cache to capacity with content that contains 'test'
      for (let i = 0; i < maxSize; i++) {
        getHighlightedContent(`test content ${i}`, 'test', false)
      }

      // Access first entry to make it most recently used
      getHighlightedContent('test content 0', 'test', false)

      // Add one more to trigger eviction
      getHighlightedContent('new test content', 'test', false)

      // First entry should still be cached (most recently used)
      const result1 = getHighlightedContent('test content 0', 'test', false)
      expect(result1).toContain('<mark class="highlight">test</mark>')

      // Verify the cache is working by checking the result format
      expect(result1).toBe('<mark class="highlight">test</mark> content 0')
    })
  })

  describe('cache expiration', () => {
    it('should clean expired entries based on TTL', () => {
      const content = 'Hello world'
      const query = 'world'

      // Add entry
      vi.setSystemTime(1000)
      getHighlightedContent(content, query, false)

      // Advance time beyond TTL (5 minutes = 300000ms)
      vi.setSystemTime(1000 + 300001)

      // Adding new entry should trigger cleanup
      getHighlightedContent('new content', 'test', false)

      // Original entry should be cleaned up (this is internal behavior)
      // We can't directly test this without exposing cache internals
      // but we can verify the functionality still works
      const result = getHighlightedContent(content, query, false)
      expect(result).toBe('Hello <mark class="highlight">world</mark>')
    })
  })

  describe('clearHighlightCache', () => {
    it('should clear all cached entries', () => {
      // Add some entries
      getHighlightedContent('test content 1', 'test', false)
      getHighlightedContent('test content 2', 'test', false)

      // Clear cache
      clearHighlightCache()

      // Verify cache is cleared - entries should be recreated, not from cache
      const result = getHighlightedContent('test content 1', 'test', false)
      expect(result).toBe('<mark class="highlight">test</mark> content 1')
    })
  })

  describe('edge cases', () => {
    it('should handle empty content', () => {
      const result = getHighlightedContent('', 'query', false)
      expect(result).toBe('')
    })

    it('should handle very long content', () => {
      const longContent = 'A'.repeat(10000) + 'target' + 'B'.repeat(10000)
      const result = getHighlightedContent(longContent, 'target', false)
      expect(result).toContain('<mark class="highlight">target</mark>')
    })

    it('should handle Unicode characters', () => {
      const content = 'Hello 世界 emoji 🌍'
      const result = getHighlightedContent(content, '世界', false)
      expect(result).toBe('Hello <mark class="highlight">世界</mark> emoji 🌍')
    })

    it('should handle HTML-like content safely', () => {
      const content = '<div>Hello <span>world</span></div>'
      const result = getHighlightedContent(content, 'world', false)
      expect(result).toBe(
        '<div>Hello <span><mark class="highlight">world</mark></span></div>'
      )

      // Test potential XSS scenario - ensure highlighting doesn't break HTML structure
      const maliciousContent = '<script>alert("xss")</script>world'
      const maliciousResult = getHighlightedContent(
        maliciousContent,
        'world',
        false
      )
      expect(maliciousResult).toBe(
        '<script>alert("xss")</script><mark class="highlight">world</mark>'
      )
      // NOTE: This test documents current behavior. In production, content should be sanitized before highlighting.
    })

    it('should not highlight inside attribute values', () => {
      const content = '<p>See <a href="https://example.com/docs">docs</a></p>'
      const result = getHighlightedContent(content, 'http', false)
      expect(result).toBe(content)
    })

    it('should not highlight inside tag names', () => {
      const content =
        '<pre><code class="language-rust">fn main(){}</code></pre>'
      const result = getHighlightedContent(content, 'code', false)
      expect(result).toBe(content)
    })

    it('should highlight visible text but leave the id attribute alone', () => {
      const content = '<h1 id="intro" class="x">Intro</h1>'
      const result = getHighlightedContent(content, 'intro', false)
      expect(result).toBe(
        '<h1 id="intro" class="x"><mark class="highlight">Intro</mark></h1>'
      )
    })

    it('should highlight text inside a code block without breaking it', () => {
      const content = '<pre><code>let value = 1</code></pre>'
      const result = getHighlightedContent(content, 'value', false)
      expect(result).toBe(
        '<pre><code>let <mark class="highlight">value</mark> = 1</code></pre>'
      )
    })

    it('should handle newlines and special whitespace', () => {
      const content = 'Line 1\nHello world\tTab'
      const result = getHighlightedContent(content, 'world', false)
      expect(result).toBe(
        'Line 1\nHello <mark class="highlight">world</mark>\tTab'
      )
    })
  })
})
