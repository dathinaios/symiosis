import { SvelteSet } from 'svelte/reactivity'
import { htmlToMarkdown, markdownToHtml } from '../utils/markdown'
import type { FocusManager } from './focusManager.svelte'
import type { SearchManager } from './searchManager.svelte'
import {
  getContentBetweenHeaders,
  getFormattedText,
  isUrl,
  isSection,
  isFilePath,
  getHeaderElements,
} from '../utils/navigation'

interface NavigationState {
  currentIndex: number
  navigationMode: 'inactive' | 'highlights' | 'headers' | 'links'
  highlightVisibility: 'visible' | 'hidden'
  currentElement: Element | null
  collapsedSections: SvelteSet<Element>
  currentSection: Element | null
  // Separate state for code block navigation
  codeBlockIndex: number
  codeBlockElement: Element | null
  // Separate state for link navigation
  linkIndex: number
  linkElement: Element | null
}

interface NavigationDeps {
  focusManager: Pick<FocusManager, 'noteContentElement'>
  searchManager: Pick<SearchManager, 'query' | 'searchInput' | 'clearSearch'>
}

export type EscapeAction =
  | 'navigation_cleared'
  | 'highlights_cleared'
  | 'search_cleared'
  | 'focus_search'

export interface ContentNavigationManager {
  navigateNext(): void
  navigatePrevious(): void
  navigateCodeNext(): void
  navigateCodePrevious(): void
  navigateLinkNext(): void
  navigateLinkPrevious(): void
  openCurrentLink(): void
  resetNavigation(): void
  clearCurrentStyles(): void
  clearHighlights(): void
  showHighlights(): void
  startHighlightNavigation(): void
  handleEscape(): EscapeAction
  copyCurrentSection(): Promise<boolean>
  getCurrentHeaderText(): string
  navigateToHeader(headerText: string): boolean
  readonly isActivelyNavigating: boolean
  readonly hideHighlights: boolean
  readonly isNavigatingLinks: boolean
}

export function createContentNavigationManager(
  deps: NavigationDeps
): ContentNavigationManager {
  const state = $state<NavigationState>({
    currentIndex: -1,
    navigationMode: 'inactive',
    highlightVisibility: 'visible',
    currentElement: null,
    collapsedSections: new SvelteSet<Element>(),
    currentSection: null,
    codeBlockIndex: -1,
    codeBlockElement: null,
    linkIndex: -1,
    linkElement: null,
  })

  function determineNavigationMode(): 'highlights' | 'headers' {
    const query = deps.searchManager.query
    const hasQuery = query.trim() !== ''

    // Use highlights if: query exists AND highlights are visible AND highlights exist in DOM
    if (hasQuery && state.highlightVisibility === 'visible') {
      const contentElement = deps.focusManager.noteContentElement
      if (contentElement) {
        const highlightElements =
          contentElement.querySelectorAll('mark.highlight')
        if (highlightElements.length > 0) {
          return 'highlights'
        }
      }
    }

    // Otherwise use headers
    return 'headers'
  }

  function getHighlightElementsWithFallback(): Element[] {
    const contentElement = deps.focusManager.noteContentElement
    if (!contentElement) return []
    return Array.from(contentElement.querySelectorAll('mark.highlight'))
  }

  function getHeaderElementsWithFallback(): Element[] {
    const contentElement = deps.focusManager.noteContentElement
    if (!contentElement) return []
    return getHeaderElements(contentElement)
  }

  function getCodeBlockElementsWithFallback(): Element[] {
    const contentElement = deps.focusManager.noteContentElement
    if (!contentElement) return []
    return Array.from(contentElement.querySelectorAll('pre > code'))
  }

  function getLinkElementsWithFallback(): Element[] {
    const contentElement = deps.focusManager.noteContentElement
    if (!contentElement) return []
    return Array.from(contentElement.querySelectorAll('a[href]'))
  }

  function getCurrentNavigationElements(): Element[] {
    const targetMode = determineNavigationMode()

    // If mode changed, reset navigation state
    if (
      state.navigationMode !== 'inactive' &&
      state.navigationMode !== targetMode
    ) {
      clearCurrentElementStyle()
      state.currentIndex = -1
    }

    return targetMode === 'highlights'
      ? getHighlightElementsWithFallback()
      : getHeaderElementsWithFallback()
  }

  function clearCurrentElementStyle(): void {
    if (state.currentElement) {
      if (state.navigationMode === 'highlights') {
        state.currentElement.classList.remove('highlight-current')
      } else {
        state.currentElement.classList.remove('header-current')
      }
      state.currentElement = null
    }

    if (state.codeBlockElement) {
      state.codeBlockElement.classList.remove('codeblock-current')
      state.codeBlockElement = null
    }

    if (state.linkElement) {
      state.linkElement.classList.remove('link-current')
      state.linkElement = null
    }

    // Reset navigation mode when clearing all styles
    if (state.navigationMode === 'links') {
      state.navigationMode = 'inactive'
    }
  }

  function clearAccordionStyling(
    allHeaders: Element[],
    contentElement: HTMLElement
  ): void {
    clearHeaderStyling(allHeaders)
    clearContentStyling(contentElement)
    state.collapsedSections.clear()
  }

  function clearHeaderStyling(allHeaders: Element[]): void {
    allHeaders.forEach((header) => {
      header.classList.remove('header-expanded', 'header-collapsed')
    })
  }

  function clearContentStyling(contentElement: HTMLElement): void {
    const allElements = Array.from(contentElement.querySelectorAll('*'))
    allElements.forEach((el) => {
      el.classList.remove('content-collapsed')
    })
  }

  function isHeaderInCurrentPath(
    header: Element,
    currentHeader: Element
  ): boolean {
    const content = getContentBetweenHeaders(header)

    // Check if this header or any of its descendants is the current header
    return (
      header === currentHeader ||
      content.some(
        (el) =>
          el === currentHeader ||
          (el.matches('h1, h2, h3, h4, h5, h6') &&
            isHeaderInPath(el, currentHeader))
      )
    )
  }

  function applyHeaderAccordionState(
    header: Element,
    isCurrentPath: boolean
  ): void {
    if (isCurrentPath) {
      expandHeaderInPath(header)
    } else {
      collapseHeaderOutsidePath(header)
    }
  }

  function expandHeaderInPath(header: Element): void {
    header.classList.add('header-expanded')
  }

  function collapseHeaderOutsidePath(header: Element): void {
    header.classList.add('header-collapsed')
    hideHeaderContent(header)
    state.collapsedSections.add(header)
  }

  function hideHeaderContent(header: Element): void {
    const content = getContentBetweenHeaders(header)
    content.forEach((el) => {
      if (!el.matches('h1, h2, h3, h4, h5, h6')) {
        el.classList.add('content-collapsed')
      }
    })
  }

  function shouldUpdateAccordion(): boolean {
    return state.navigationMode !== 'highlights'
  }

  function processHeaderAccordionStates(
    allHeaders: Element[],
    currentHeader: Element
  ): void {
    allHeaders.forEach((header) => {
      const isCurrentPath = isHeaderInCurrentPath(header, currentHeader)
      applyHeaderAccordionState(header, isCurrentPath)
    })
  }

  function updateAccordionState(currentHeader: Element): void {
    if (!shouldUpdateAccordion()) return

    const contentElement = deps.focusManager.noteContentElement
    if (!contentElement) return

    performAccordionUpdate(contentElement, currentHeader)
  }

  function performAccordionUpdate(
    contentElement: HTMLElement,
    currentHeader: Element
  ): void {
    const allHeaders = getHeaderElements(contentElement)
    clearAccordionStyling(allHeaders, contentElement)
    processHeaderAccordionStates(allHeaders, currentHeader)
  }

  function isHeaderInPath(header: Element, target: Element): boolean {
    const content = getContentBetweenHeaders(header)
    return (
      content.includes(target) ||
      content.some(
        (el) =>
          el.matches('h1, h2, h3, h4, h5, h6') && isHeaderInPath(el, target)
      )
    )
  }

  function setCurrentElementStyle(
    element: Element,
    mode: 'highlights' | 'headers'
  ): void {
    clearCurrentElementStyle()
    state.currentElement = element
    state.navigationMode = mode

    if (mode === 'highlights') {
      element.classList.add('highlight-current')
    } else {
      element.classList.add('header-current')
      updateAccordionState(element)
    }
  }

  function scrollToElement(element: Element): void {
    const mode = determineNavigationMode()
    setCurrentElementStyle(element, mode)
    performElementScroll(element)
  }

  function performElementScroll(element: Element): void {
    const contentElement = deps.focusManager.noteContentElement
    if (!contentElement) {
      scrollToElementFallback(element)
      return
    }

    scrollToElementWithinContainer(element, contentElement)
  }

  function scrollToElementFallback(element: Element): void {
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
      inline: 'nearest',
    })
  }

  function scrollToElementWithinContainer(
    element: Element,
    contentElement: HTMLElement
  ): void {
    const elementRect = element.getBoundingClientRect()
    const containerRect = contentElement.getBoundingClientRect()
    const containerHeight = contentElement.clientHeight
    const targetPosition = containerHeight * 0.25

    const scrollTop =
      contentElement.scrollTop +
      (elementRect.top - containerRect.top) -
      targetPosition

    contentElement.scrollTo({
      top: scrollTop,
      behavior: 'smooth',
    })
  }

  function scrollToCodeBlock(element: Element): void {
    updateCodeBlockElementState(element)
    performElementScroll(element)
  }

  function updateCodeBlockElementState(element: Element): void {
    if (state.codeBlockElement) {
      state.codeBlockElement.classList.remove('codeblock-current')
    }

    state.codeBlockElement = element
    element.classList.add('codeblock-current')
  }

  function navigateGeneric(
    getElements: () => Element[],
    getIndex: () => number,
    setIndex: (index: number) => void,
    scrollTo: (element: Element) => void,
    direction: 'next' | 'previous'
  ): void {
    const elements = getElements()
    if (elements.length === 0) return

    let index = getIndex()
    if (index === -1) {
      index = 0
    } else {
      index =
        direction === 'next'
          ? Math.min(index + 1, elements.length - 1)
          : Math.max(index - 1, 0)
    }

    setIndex(index)
    scrollTo(elements[index])
  }

  function navigateNext(): void {
    navigateGeneric(
      getCurrentNavigationElements,
      () => state.currentIndex,
      (index) => {
        state.currentIndex = index
      },
      scrollToElement,
      'next'
    )
  }

  function navigatePrevious(): void {
    navigateGeneric(
      getCurrentNavigationElements,
      () => state.currentIndex,
      (index) => {
        state.currentIndex = index
      },
      scrollToElement,
      'previous'
    )
  }

  function navigateCodeNext(): void {
    navigateGeneric(
      getCodeBlockElementsWithFallback,
      () => state.codeBlockIndex,
      (index) => {
        state.codeBlockIndex = index
      },
      scrollToCodeBlock,
      'next'
    )
  }

  function navigateCodePrevious(): void {
    navigateGeneric(
      getCodeBlockElementsWithFallback,
      () => state.codeBlockIndex,
      (index) => {
        state.codeBlockIndex = index
      },
      scrollToCodeBlock,
      'previous'
    )
  }

  function scrollToLink(element: Element): void {
    updateLinkElementState(element)
    performElementScroll(element)
  }

  function updateLinkElementState(element: Element): void {
    if (state.linkElement) {
      state.linkElement.classList.remove('link-current')
    }

    state.linkElement = element
    element.classList.add('link-current')
  }

  function navigateLinkNext(): void {
    if (state.navigationMode !== 'links') {
      resetNavigation()
    }
    state.navigationMode = 'links'

    navigateGeneric(
      getLinkElementsWithFallback,
      () => state.linkIndex,
      (index) => {
        state.linkIndex = index
      },
      scrollToLink,
      'next'
    )
  }

  function navigateLinkPrevious(): void {
    if (state.navigationMode !== 'links') {
      resetNavigation()
    }
    state.navigationMode = 'links'

    navigateGeneric(
      getLinkElementsWithFallback,
      () => state.linkIndex,
      (index) => {
        state.linkIndex = index
      },
      scrollToLink,
      'previous'
    )
  }

  function validateLinkForOpening(): string | null {
    if (state.navigationMode !== 'links' || !state.linkElement) return null

    const href = state.linkElement.getAttribute('href')

    if (!href) {
      import('../utils/notification').then(({ notification }) => {
        notification.error('Link has no URL')
      })
      return null
    }

    return href
  }

  function handleSectionNavigation(href: string): void {
    const sectionName = href.substring(1)
    const contentElement = deps.focusManager.noteContentElement

    if (!contentElement) {
      showErrorNotification('Content not available for navigation')
      return
    }

    const targetHeader = findTargetHeader(contentElement, sectionName)
    if (targetHeader) {
      navigateToFoundHeader(targetHeader)
    } else {
      showErrorNotification(`Section not found: ${sectionName}`)
    }
  }

  function findTargetHeader(
    contentElement: HTMLElement,
    sectionName: string
  ): Element | null {
    const headers = Array.from(
      contentElement.querySelectorAll('h1, h2, h3, h4, h5, h6')
    )

    const exactMatch = findExactHeaderMatch(headers, sectionName)
    if (exactMatch) return exactMatch

    return findPartialHeaderMatch(headers, sectionName) || null
  }

  function findExactHeaderMatch(
    headers: Element[],
    sectionName: string
  ): Element | undefined {
    return headers.find((header) => {
      const headerText = (header.textContent || '').trim().toLowerCase()
      return headerText === sectionName.toLowerCase()
    })
  }

  function findPartialHeaderMatch(
    headers: Element[],
    sectionName: string
  ): Element | undefined {
    return headers.find((header) => {
      const headerText = (header.textContent || '').trim().toLowerCase()
      return (
        headerText.includes(sectionName.toLowerCase()) ||
        sectionName.toLowerCase().includes(headerText)
      )
    })
  }

  function navigateToFoundHeader(targetHeader: Element): void {
    const headerElements = getHeaderElementsWithFallback()
    const headerIndex = headerElements.indexOf(targetHeader)
    if (headerIndex >= 0) {
      state.currentIndex = headerIndex
      state.navigationMode = 'headers'
      scrollToElement(targetHeader)
    }
  }

  function showErrorNotification(message: string): void {
    import('../utils/notification').then(({ notification }) => {
      notification.error(message)
    })
  }

  function handleFilePathOpening(href: string): void {
    import('@tauri-apps/plugin-opener').then(({ openPath }) => {
      openPath(href).catch((error) => {
        console.error('Failed to open file:', error)
        showErrorNotification(`Failed to open file: ${href}`)
      })
    })
  }

  function handleUrlOpening(href: string): void {
    if (!validateUrl(href)) {
      showErrorNotification(`Malformed URL: ${href}`)
      return
    }

    openValidUrl(href)
  }

  function validateUrl(href: string): boolean {
    try {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      new URL(href)
      return true
    } catch {
      return false
    }
  }

  function openValidUrl(href: string): void {
    import('@tauri-apps/plugin-opener').then(({ openUrl }) => {
      openUrl(href).catch((error) => {
        console.error('Failed to open URL:', error)
        showErrorNotification(`Failed to open link: ${href}`)
      })
    })
  }

  function handleUnsupportedLinkFormat(href: string): void {
    showErrorNotification(`Unsupported link format: ${href}`)
  }

  function openCurrentLink(): void {
    const href = validateLinkForOpening()
    if (!href) return

    processLinkByType(href)
  }

  function processLinkByType(href: string): void {
    if (isSection(href)) {
      handleSectionNavigation(href)
      return
    }

    if (isFilePath(href)) {
      handleFilePathOpening(href)
      return
    }

    if (isUrl(href)) {
      handleUrlOpening(href)
      return
    }

    handleUnsupportedLinkFormat(href)
  }

  function resetNavigation(): void {
    clearCurrentElementStyle()

    // Clear accordion state
    const contentElement = deps.focusManager.noteContentElement
    if (contentElement) {
      // Remove all accordion styling
      const allElements = Array.from(contentElement.querySelectorAll('*'))
      allElements.forEach((el) => {
        el.classList.remove(
          'header-expanded',
          'header-collapsed',
          'content-collapsed'
        )
      })
    }

    state.collapsedSections.clear()
    state.currentSection = null
    state.currentIndex = -1
    state.navigationMode = 'inactive'
    state.codeBlockIndex = -1
    state.linkIndex = -1
  }

  function clearCurrentStyles(): void {
    clearCurrentElementStyle()
  }

  function clearHighlights(): void {
    state.highlightVisibility = 'hidden'
  }

  function showHighlights(): void {
    state.highlightVisibility = 'visible'
  }

  function startHighlightNavigation(): void {
    // Only start if we have highlights and they're visible
    const query = deps.searchManager.query
    const hasQuery = query.trim() !== ''

    if (!hasQuery || state.highlightVisibility !== 'visible') {
      return
    }

    const elements = getHighlightElementsWithFallback()
    if (elements.length === 0) {
      return
    }

    // Set navigation to highlight mode and select first element
    state.navigationMode = 'highlights'
    state.currentIndex = 0
    scrollToElement(elements[0])
  }

  async function copyCurrentSection(): Promise<boolean> {
    const textToCopy = extractTextFromCurrentElement()
    if (!textToCopy.trim()) return false

    return await writeToClipboard(textToCopy)
  }

  function extractTextFromCurrentElement(): string {
    if (state.codeBlockElement) {
      return state.codeBlockElement.textContent || ''
    }

    if (state.currentElement && state.navigationMode === 'highlights') {
      return getFormattedText(state.currentElement)
    }

    if (state.currentElement && state.navigationMode === 'headers') {
      return extractHeaderSectionText()
    }

    return ''
  }

  function extractHeaderSectionText(): string {
    if (!state.currentElement) return ''

    const headerText = state.currentElement.textContent || ''
    const content = getContentBetweenHeaders(state.currentElement)
    const contentTexts = content
      .map((el) => getFormattedText(el))
      .filter((text) => text.trim())

    return [headerText, ...contentTexts].join('\n\n')
  }

  async function writeToClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (error) {
      console.warn('Failed to copy to clipboard:', error)
      return false
    }
  }

  function clearLinkNavigationIfActive(): EscapeAction | null {
    if (state.navigationMode === 'links') {
      resetNavigation()
      return 'navigation_cleared'
    }
    return null
  }

  function clearCodeBlockNavigationIfActive(): EscapeAction | null {
    if (state.codeBlockElement) {
      clearCurrentElementStyle()
      state.codeBlockIndex = -1
      state.linkIndex = -1 // Also reset link navigation
      state.navigationMode = 'inactive' // Reset navigation mode
      return 'navigation_cleared'
    }
    return null
  }

  function clearHighlightNavigationIfActive(): EscapeAction | null {
    if (state.navigationMode === 'highlights') {
      resetNavigation()
      clearHighlights()
      return 'highlights_cleared'
    }
    return null
  }

  function clearHeaderNavigationIfActive(): EscapeAction | null {
    if (state.navigationMode !== 'inactive') {
      resetNavigation()
      return 'navigation_cleared'
    }
    return null
  }

  function evaluateSearchState() {
    const query = deps.searchManager.query
    const searchInput = deps.searchManager.searchInput
    const hasQuery = query.trim() !== ''
    const hasSearchInput = searchInput.trim() !== ''
    return { query, searchInput, hasQuery, hasSearchInput }
  }

  function clearVisibleHighlightsIfQueryExists(
    searchState: ReturnType<typeof evaluateSearchState>
  ): EscapeAction | null {
    if (searchState.hasQuery && state.highlightVisibility === 'visible') {
      clearHighlights()
      return 'highlights_cleared'
    }
    return null
  }

  function clearPartialSearchInput(
    searchState: ReturnType<typeof evaluateSearchState>
  ): EscapeAction | null {
    if (searchState.hasSearchInput && searchState.searchInput.length < 3) {
      deps.searchManager.clearSearch()
      showHighlights() // Reset highlights for next search
      return 'search_cleared'
    }
    return null
  }

  function handleEscape(): EscapeAction {
    return processEscapeSequence()
  }

  function processEscapeSequence(): EscapeAction {
    const navigationResults = clearActiveNavigationStates()
    if (navigationResults) return navigationResults

    return handleSearchStateEscapeSequence()
  }

  function clearActiveNavigationStates(): EscapeAction | null {
    const linkResult = clearLinkNavigationIfActive()
    if (linkResult) return linkResult

    const codeBlockResult = clearCodeBlockNavigationIfActive()
    if (codeBlockResult) return codeBlockResult

    const highlightNavResult = clearHighlightNavigationIfActive()
    if (highlightNavResult) return highlightNavResult

    const headerNavResult = clearHeaderNavigationIfActive()
    if (headerNavResult) return headerNavResult

    return null
  }

  function handleSearchStateEscapeSequence(): EscapeAction {
    const searchState = evaluateSearchState()

    const visibleHighlightsResult =
      clearVisibleHighlightsIfQueryExists(searchState)
    if (visibleHighlightsResult) return visibleHighlightsResult

    const hiddenHighlightsResult = clearSearchIfHiddenHighlights(searchState)
    if (hiddenHighlightsResult) return hiddenHighlightsResult

    const partialSearchResult = clearPartialSearchInput(searchState)
    if (partialSearchResult) return partialSearchResult

    return 'focus_search'
  }

  function clearSearchIfHiddenHighlights(
    searchState: ReturnType<typeof evaluateSearchState>
  ): EscapeAction | null {
    if (searchState.hasQuery && state.highlightVisibility === 'hidden') {
      deps.searchManager.clearSearch()
      showHighlights()
      return 'search_cleared'
    }
    return null
  }

  function getCurrentHeaderText(): string {
    const header = determineCurrentHeader()
    return header ? convertHeaderToMarkdown(header) : ''
  }

  function convertHeaderToMarkdown(header: Element): string {
    const level = parseInt(header.tagName[1], 10)
    const content = htmlToMarkdown(header)
    return `${'#'.repeat(level)} ${content}`
  }

  function determineCurrentHeader(): Element | null {
    const navigationBasedHeader = getHeaderFromNavigationState()
    if (navigationBasedHeader) return navigationBasedHeader

    return getHeaderFromViewport()
  }

  function getHeaderFromNavigationState(): Element | null {
    if (state.navigationMode === 'headers' && state.currentElement) {
      return state.currentElement
    }

    if (state.navigationMode === 'highlights' && state.currentElement) {
      return getNearestHeaderFromHighlight()
    }

    return null
  }

  function getNearestHeaderFromHighlight(): Element | null {
    const contentElement = deps.focusManager.noteContentElement
    if (!contentElement || !state.currentElement) return null

    const headers = Array.from(
      contentElement.querySelectorAll('h1, h2, h3, h4, h5, h6')
    )

    if (headers.length === 0) return null

    let nearestHeader: Element | null = null

    for (const h of headers) {
      const pos = h.compareDocumentPosition(state.currentElement)
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) {
        nearestHeader = h
      } else {
        break
      }
    }

    return nearestHeader || headers[0]
  }

  function getHeaderFromViewport(): Element | null {
    const contentElement = deps.focusManager.noteContentElement
    if (!contentElement) return null

    const rect = contentElement.getBoundingClientRect()
    const headers = Array.from(
      contentElement.querySelectorAll('h1, h2, h3, h4, h5, h6')
    )

    const { firstVisibleHeader, lastPassedHeader } = analyzeHeaderVisibility(
      headers,
      rect
    )

    return firstVisibleHeader || lastPassedHeader
  }

  function analyzeHeaderVisibility(
    headers: Element[],
    containerRect: DOMRect
  ): { firstVisibleHeader: Element | null; lastPassedHeader: Element | null } {
    let firstVisibleHeader: Element | null = null
    let lastPassedHeader: Element | null = null

    for (const h of headers) {
      const r = h.getBoundingClientRect()
      const isVisible =
        r.top >= containerRect.top &&
        r.top <= containerRect.top + (containerRect.height || 600)

      if (isVisible && !firstVisibleHeader) {
        firstVisibleHeader = h
      } else if (r.top < containerRect.top) {
        lastPassedHeader = h
      }
    }

    return { firstVisibleHeader, lastPassedHeader }
  }

  function navigateToHeader(headerText: string): boolean {
    if (!headerText.trim()) return false

    const contentElement = deps.focusManager.noteContentElement
    if (!contentElement) return false

    const headers = Array.from(
      contentElement.querySelectorAll('h1, h2, h3, h4, h5, h6')
    )

    // Extract content from markdown header and convert to HTML
    const cleanHeaderText = headerText.replace(/^#+\s*/, '').trim()
    const expectedHtml = markdownToHtml(cleanHeaderText)

    const targetHeader = headers.find((header) => {
      // Get innerHTML content from HTML header
      const headerHtmlContent = header.innerHTML?.trim() || ''
      return headerHtmlContent === expectedHtml
    })

    if (targetHeader) {
      const headerElements = getHeaderElementsWithFallback()
      const headerIndex = headerElements.indexOf(targetHeader)
      if (headerIndex >= 0) {
        state.currentIndex = headerIndex
        state.navigationMode = 'headers'
        scrollToElement(targetHeader)
        return true
      }
    }

    return false
  }

  return {
    navigateNext,
    navigatePrevious,
    navigateCodeNext,
    navigateCodePrevious,
    navigateLinkNext,
    navigateLinkPrevious,
    openCurrentLink,
    resetNavigation,
    clearCurrentStyles,
    clearHighlights,
    showHighlights,
    startHighlightNavigation,
    handleEscape,
    copyCurrentSection,
    getCurrentHeaderText,
    navigateToHeader,

    get isActivelyNavigating(): boolean {
      return state.navigationMode !== 'inactive'
    },

    get hideHighlights(): boolean {
      return state.highlightVisibility === 'hidden'
    },

    get isNavigatingLinks(): boolean {
      return state.navigationMode === 'links'
    },
  }
}
