function createHtmlContainer(htmlContent: string): HTMLDivElement {
  const tempDiv = document.createElement('div')
  tempDiv.innerHTML = htmlContent
  return tempDiv
}

function extractTextFromHtmlTree(container: HTMLDivElement): string {
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    null
  )

  let extractedContent = ''
  let node

  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) {
      extractedContent += node.textContent
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      extractedContent += processElementNode(node as Element)
    }
  }

  return extractedContent
}

function processElementNode(element: Element): string {
  const tagName = element.tagName.toLowerCase()
  const blockLevelTags = ['p', 'div', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']

  return blockLevelTags.includes(tagName) ? '\n\n' : ''
}

function cleanupExtractedText(content: string): string {
  return content.replace(/\n\n+/g, '\n\n').trim()
}

export function convertHtmlToText(htmlContent: string): string {
  const tempDiv = createHtmlContainer(htmlContent)
  const extractedContent = extractTextFromHtmlTree(tempDiv)
  return cleanupExtractedText(extractedContent)
}
