import { describe, it, expect } from 'vitest'
import { convertHtmlToText } from '$lib/utils/htmlParser'

describe('htmlParser (TDD)', () => {
  describe('convertHtmlToText', () => {
    it('should extract plain text from simple HTML', () => {
      const html = '<p>Hello world</p>'
      const result = convertHtmlToText(html)
      expect(result).toBe('Hello world')
    })

    it('should add newlines for block-level tags', () => {
      const html = '<p>First paragraph</p><p>Second paragraph</p>'
      const result = convertHtmlToText(html)
      expect(result).toBe('First paragraph\n\nSecond paragraph')
    })

    it('should handle multiple block-level tags', () => {
      const html = '<h1>Title</h1><div>Content</div><p>Paragraph</p>'
      const result = convertHtmlToText(html)
      expect(result).toBe('Title\n\nContent\n\nParagraph')
    })

    it('should handle br tags as newlines', () => {
      const html = '<p>Line one<br>Line two</p>'
      const result = convertHtmlToText(html)
      expect(result).toBe('Line one\n\nLine two')
    })

    it('should handle nested elements', () => {
      const html = '<div><p>Nested <strong>bold</strong> text</p></div>'
      const result = convertHtmlToText(html)
      expect(result).toBe('Nested bold text')
    })

    it('should collapse multiple consecutive newlines', () => {
      const html = '<p>One</p><div><p>Two</p></div>'
      const result = convertHtmlToText(html)
      expect(result).toBe('One\n\nTwo')
    })

    it('should trim leading and trailing whitespace', () => {
      const html = '  <p>Text</p>  '
      const result = convertHtmlToText(html)
      expect(result).toBe('Text')
    })

    it('should handle empty HTML', () => {
      const html = ''
      const result = convertHtmlToText(html)
      expect(result).toBe('')
    })

    it('should handle HTML with only whitespace', () => {
      const html = '<div>   </div>'
      const result = convertHtmlToText(html)
      expect(result).toBe('')
    })

    it('should handle all heading levels', () => {
      const html =
        '<h1>H1</h1><h2>H2</h2><h3>H3</h3><h4>H4</h4><h5>H5</h5><h6>H6</h6>'
      const result = convertHtmlToText(html)
      expect(result).toBe('H1\n\nH2\n\nH3\n\nH4\n\nH5\n\nH6')
    })

    it('should ignore inline elements for newlines', () => {
      const html =
        '<p>Text with <span>inline</span> and <em>emphasized</em> content</p>'
      const result = convertHtmlToText(html)
      expect(result).toBe('Text with inline and emphasized content')
    })
  })
})
