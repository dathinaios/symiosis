<!--
UI Layer - CodeMirror Editor Core
Focused component handling CodeMirror initialization and content editing.
-->

<script lang="ts">
  import { onMount, tick, getContext } from 'svelte'
  import type { AppManagers } from '../app/appCoordinator.svelte'
  import { EditorView, basicSetup } from 'codemirror'
  import type { Extension } from '@codemirror/state'
  import { keymap } from '@codemirror/view'
  import {
    indentWithTab,
    cursorLineUp,
    cursorLineDown,
  } from '@codemirror/commands'
  import { indentUnit } from '@codemirror/language'
  import { EditorState } from '@codemirror/state'
  import type { Text } from '@codemirror/state'
  import type { ViewUpdate } from '@codemirror/view'
  import {
    codeFolding,
    foldState,
    foldCode,
    unfoldCode,
    foldAll,
    unfoldAll,
    foldable,
    foldEffect,
    syntaxTree,
  } from '@codemirror/language'
  import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
  import { languages } from '@codemirror/language-data'
  import { StreamLanguage } from '@codemirror/language'
  import { toml } from '@codemirror/legacy-modes/mode/toml'
  import { vim, Vim } from '@replit/codemirror-vim'
  import { emacs } from '@replit/codemirror-emacs'
  import { getTheme } from '../utils/editorThemes'
  import { EditorView as EditorViewBase } from '@codemirror/view'

  interface Props {
    value: string
    filename: string
    nearestHeaderText?: string
    onSave: () => void
    onContentChange?: (newValue: string) => void
    onDirtyChange?: (isDirty: boolean) => void
    onExit?: (() => void) | null | undefined
    onRequestExit?: (() => void) | null | undefined
    onExitHeaderCapture?: ((headerText: string) => void) | null
    onExitCursorCapture?: ((line: number, column: number) => void) | null
    initialCursor?: [number, number] | null
  }

  let {
    value = $bindable(),
    filename,
    nearestHeaderText = '',
    onSave,
    onContentChange,
    onDirtyChange,
    onExit = null,
    onRequestExit = null,
    onExitHeaderCapture = null,
    onExitCursorCapture = null,
    initialCursor = null,
  }: Props = $props()

  // Get reactive config state
  const { configManager, editorManager } = getContext<AppManagers>('managers')

  let editorContainer: HTMLElement
  let editorView: EditorView | null = null
  let initialValue = $state(value)
  let lastPropsValue = $state(value)

  // Reactive config values
  const keyBindingMode = $derived(configManager.editor.mode || 'basic')
  const currentTheme = $derived(
    getTheme(configManager.editor.theme || 'gruvbox-dark')
  )
  const editorFontFamily = $derived(
    configManager.interface.editor_font_family ||
      'JetBrains Mono, Consolas, monospace'
  )
  const editorFontSize = $derived(
    configManager.interface.editor_font_size || 14
  )

  const propsChanged = $derived(value !== lastPropsValue)

  // Reported, never bound: the authoritative dirty flag lives in editorManager
  // as a derived value. Binding it back here would write to a getter-only
  // property and throw on every keystroke.
  function handleDirtyChange(dirty: boolean): void {
    onDirtyChange?.(dirty)
  }

  // Use effect only for side effect (notification), not state updates
  $effect(() => {
    if (propsChanged) {
      initialValue = value
      lastPropsValue = value
      handleDirtyChange(false)
    }
  })

  function createFontExtension(
    fontFamily: string,
    fontSize: number
  ): Extension {
    return EditorViewBase.theme({
      '&': {
        fontFamily: fontFamily,
        fontSize: `${fontSize}px`,
      },
      '.cm-content': {
        fontFamily: fontFamily,
        fontSize: `${fontSize}px`,
      },
      '.cm-editor': {
        fontFamily: fontFamily,
        fontSize: `${fontSize}px`,
      },
    })
  }

  function createVimDialogTheme(): Extension {
    return EditorViewBase.theme({
      '.cm-vim-dialog, .cm-dialog, .cm-vim-panel': {
        position: 'fixed !important',
        top: '50% !important',
        left: '50% !important',
        transform: 'translate(-50%, -50%) !important',
        zIndex: '1000 !important',
        background: 'var(--cm-background, #282828) !important',
        border: '2px solid var(--cm-accent, #665c54) !important',
        borderRadius: '8px !important',
        padding: '12px 16px !important',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6) !important',
        minWidth: '300px !important',
        maxWidth: '500px !important',
        fontFamily: 'inherit !important',
        fontSize: 'inherit !important',
        color: 'var(--cm-foreground, #fbf1c7) !important',
      },
      '.cm-vim-dialog input, .cm-dialog input, .cm-vim-panel input': {
        background: 'transparent !important',
        border: 'none !important',
        outline: 'none !important',
        color: 'inherit !important',
        fontFamily: 'inherit !important',
        fontSize: 'inherit !important',
        width: '100% !important',
        marginLeft: '4px !important',
      },
      '.cm-vim-dialog-backdrop': {
        position: 'fixed !important',
        top: '0 !important',
        left: '0 !important',
        right: '0 !important',
        bottom: '0 !important',
        background: 'rgba(0, 0, 0, 0.3) !important',
        zIndex: '999 !important',
      },
    })
  }

  function getKeyMappingsMode(mode: string): Extension | null {
    switch (mode) {
      case 'vim':
        return vim({
          status: false,
        })
      case 'emacs':
        return emacs()
      case 'basic':
        return null
      default:
        return null
    }
  }

  function setupVimFoldingCommands(): void {
    defineBasicVimFoldingActions()
    defineAdvancedVimFoldingActions()
    mapVimFoldingKeys()
  }

  function setupVimVisualLineNavigation(): void {
    if (!configManager.editor.word_wrap) return

    Vim.defineAction('visualLineUp', (cm: unknown) => {
      const view = extractEditorView(cm)
      visualLineUp(view)
    })

    Vim.defineAction('visualLineDown', (cm: unknown) => {
      const view = extractEditorView(cm)
      visualLineDown(view)
    })

    Vim.mapCommand('j', 'action', 'visualLineDown', undefined, {
      context: 'normal',
    })
    Vim.mapCommand('k', 'action', 'visualLineUp', undefined, {
      context: 'normal',
    })
  }

  function defineBasicVimFoldingActions(): void {
    Vim.defineAction('foldClose', (cm: unknown) => {
      const view = extractEditorView(cm)
      foldCode(view)
    })

    Vim.defineAction('foldOpen', (cm: unknown) => {
      const view = extractEditorView(cm)
      unfoldCode(view)
    })

    Vim.defineAction('foldToggle', (cm: unknown) => {
      const view = extractEditorView(cm)
      performFoldToggle(view)
    })
  }

  function extractEditorView(cm: unknown): EditorView {
    return (cm as { cm6?: EditorView }).cm6 || (cm as EditorView)
  }

  function performFoldToggle(view: EditorView): void {
    const state = view.state
    const beforeFolds = state.field(foldState, false)?.size || 0
    unfoldCode(view)
    const afterUnfold = view.state.field(foldState, false)?.size || 0

    if (beforeFolds === afterUnfold) {
      foldCode(view)
    }
  }

  function defineAdvancedVimFoldingActions(): void {
    Vim.defineAction('foldCloseAll', (cm: unknown) => {
      const view = extractEditorView(cm)
      performSensibleFoldAll(view)
    })

    Vim.defineAction('foldOpenAll', (cm: unknown) => {
      const view = extractEditorView(cm)
      unfoldAll(view)
    })

    Vim.defineAction('foldMore', (cm: unknown) => {
      const view = extractEditorView(cm)
      foldCode(view)
    })

    Vim.defineAction('foldLess', (cm: unknown) => {
      const view = extractEditorView(cm)
      unfoldCode(view)
    })
  }

  function performSensibleFoldAll(view: EditorView): void {
    const state = view.state
    const foldRanges = collectFoldableRanges(state)

    if (foldRanges.length > 0) {
      applyFoldRanges(view, foldRanges)
    }
  }

  function collectFoldableRanges(
    state: EditorState
  ): { from: number; to: number }[] {
    const foldRanges: { from: number; to: number }[] = []

    syntaxTree(state).iterate({
      enter(node) {
        if (isFoldableMarkdownNode(node)) {
          const isFoldable = foldable(state, node.from, node.to)
          if (isFoldable) {
            foldRanges.push({ from: isFoldable.from, to: isFoldable.to })
          }
        }
      },
    })

    return foldRanges
  }

  function isFoldableMarkdownNode(node: {
    name: string
    from: number
    to: number
  }): boolean {
    const foldableNodeTypes = [
      'ATXHeading1',
      'ATXHeading2',
      'ATXHeading3',
      'ATXHeading4',
      'ATXHeading5',
      'ATXHeading6',
      'SetextHeading1',
      'SetextHeading2',
      'FencedCode',
      'CodeBlock',
      'Blockquote',
      'BulletList',
      'OrderedList',
    ]

    return foldableNodeTypes.includes(node.name)
  }

  function applyFoldRanges(
    view: EditorView,
    foldRanges: { from: number; to: number }[]
  ): void {
    view.dispatch({
      effects: foldRanges.map((range) =>
        foldEffect.of({ from: range.from, to: range.to })
      ),
    })
  }

  function mapVimFoldingKeys(): void {
    Vim.mapCommand('zc', 'action', 'foldClose', undefined, {})
    Vim.mapCommand('zo', 'action', 'foldOpen', undefined, {})
    Vim.mapCommand('za', 'action', 'foldToggle', undefined, {})
    Vim.mapCommand('zC', 'action', 'foldClose', undefined, {})
    Vim.mapCommand('zO', 'action', 'foldOpen', undefined, {})
    Vim.mapCommand('zA', 'action', 'foldToggle', undefined, {})
    Vim.mapCommand('zM', 'action', 'foldCloseAll', undefined, {})
    Vim.mapCommand('zR', 'action', 'foldOpenAll', undefined, {})
    Vim.mapCommand('zm', 'action', 'foldMore', undefined, {})
    Vim.mapCommand('zr', 'action', 'foldLess', undefined, {})
  }

  function getLanguageExtension(filename: string): Extension {
    if (!filename)
      return markdown({
        base: markdownLanguage,
        codeLanguages: languages,
      })
    const ext = filename.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'toml':
        return StreamLanguage.define(toml)
      case 'md':
      case 'markdown':
      default:
        return markdown({
          base: markdownLanguage,
          codeLanguages: languages,
        })
    }
  }

  function destroyEditor(): void {
    if (editorView) {
      editorView.destroy()
      editorView = null
      editorManager.setEditorView(null)
    }
  }

  function createCodeMirrorEditor(): void {
    if (!editorContainer) return

    prepareContainer()
    initializeEditor()
  }

  function initializeEditor(): void {
    try {
      setupVimModeIfNeeded()
      const newEditorView = createEditorViewInstance()
      finalizeEditorSetup(newEditorView)
    } catch (error) {
      handleCreationFailure(error)
    }
  }

  function setupVimModeIfNeeded(): void {
    if (keyBindingMode === 'vim') {
      setupVimFoldingCommands()
      setupVimVisualLineNavigation()
    }
  }

  function createEditorViewInstance(): EditorView {
    const extensions = buildEditorConfiguration()
    return new EditorView({
      doc: value || '',
      extensions,
      parent: editorContainer,
    })
  }

  function finalizeEditorSetup(newEditorView: EditorView): void {
    editorView = newEditorView
    editorManager.setEditorView(newEditorView)
    scrollToHeader()
  }

  function prepareContainer(): void {
    destroyEditor()
    editorContainer.innerHTML = ''
  }

  function buildEditorConfiguration(): Extension[] {
    const keymaps = createKeymaps()
    const updateListener = createUpdateListener()
    const customSetup = createBasicSetupConfiguration()
    const coreExtensions = createCoreExtensions(
      customSetup,
      keymaps,
      updateListener
    )

    return coreExtensions.filter((ext): ext is Extension => Boolean(ext))
  }

  function createUpdateListener(): Extension {
    return EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        handleDocumentChange(update)
      }
    })
  }

  function handleDocumentChange(update: ViewUpdate): void {
    const newValue = update.state.doc.toString()
    lastPropsValue = newValue
    onContentChange?.(newValue)
    const isDirty = newValue !== initialValue
    handleDirtyChange(isDirty)
  }

  function createBasicSetupConfiguration(): Extension {
    return basicSetup
  }

  function createCoreExtensions(
    customSetup: Extension,
    keymaps: Extension[],
    updateListener: Extension
  ): Extension[] {
    const baseExtensions = [
      getKeyMappingsMode(keyBindingMode),
      customSetup,
      getLanguageExtension(filename),
      codeFolding(),
      currentTheme,
      createFontExtension(editorFontFamily, editorFontSize),
      createVimDialogTheme(),
      ...keymaps,
      updateListener,
    ].filter((ext): ext is Extension => Boolean(ext))

    const conditionalExtensions = createConditionalExtensions()
    return [...baseExtensions, ...conditionalExtensions]
  }

  function createConditionalExtensions(): Extension[] {
    const extensions: Extension[] = []

    if (configManager.editor.word_wrap) {
      extensions.push(EditorView.lineWrapping)
    }

    if (!configManager.editor.show_line_numbers) {
      extensions.push(
        EditorView.theme({
          '.cm-gutters': { display: 'none' },
        })
      )
    }

    extensions.push(
      indentUnit.of(
        configManager.editor.expand_tabs
          ? ' '.repeat(configManager.editor.tab_size || 2)
          : '\t'
      ),
      EditorState.tabSize.of(configManager.editor.tab_size || 2)
    )

    return extensions
  }

  function visualLineUp(view: EditorView): boolean {
    const { state } = view
    const { main } = state.selection

    const coords = view.coordsAtPos(main.head)
    if (!coords) return cursorLineUp(view)

    const targetY = coords.top - view.defaultLineHeight
    const targetPos = view.posAtCoords({ x: coords.left, y: targetY })

    if (targetPos === null || targetPos === main.head) {
      return cursorLineUp(view)
    }

    view.dispatch({
      selection: { anchor: targetPos, head: targetPos },
      scrollIntoView: true,
    })

    return true
  }

  function visualLineDown(view: EditorView): boolean {
    const { state } = view
    const { main } = state.selection

    const coords = view.coordsAtPos(main.head)
    if (!coords) return cursorLineDown(view)

    const targetY = coords.bottom + view.defaultLineHeight
    const targetPos = view.posAtCoords({ x: coords.left, y: targetY })

    if (targetPos === null || targetPos === main.head) {
      return cursorLineDown(view)
    }

    view.dispatch({
      selection: { anchor: targetPos, head: targetPos },
      scrollIntoView: true,
    })

    return true
  }

  function createKeymaps(): Extension[] {
    const insertSpaces = (view: EditorView): boolean => {
      const tabSize = configManager.editor.tab_size || 2
      const spaces = ' '.repeat(tabSize)
      const { from, to } = view.state.selection.main
      view.dispatch({
        changes: { from, to, insert: spaces },
        selection: { anchor: from + spaces.length },
      })
      return true
    }

    const tabBinding = configManager.editor.expand_tabs
      ? { key: 'Tab', run: insertSpaces }
      : indentWithTab

    const baseKeybindings = [
      tabBinding,
      // Folding shortcuts for all modes
      { key: 'Ctrl-Shift-[', run: foldCode },
      { key: 'Ctrl-Shift-]', run: unfoldCode },
      { key: 'Ctrl-Alt-[', run: foldAll },
      { key: 'Ctrl-Alt-]', run: unfoldAll },
    ]

    // Add visual line navigation for non-vim modes when word wrap is enabled
    if (keyBindingMode !== 'vim' && configManager.editor.word_wrap) {
      baseKeybindings.push(
        { key: 'ArrowUp', run: visualLineUp },
        { key: 'ArrowDown', run: visualLineDown }
      )
    }

    const customKeymap = keymap.of(baseKeybindings)

    const escapeKeymap =
      onExit || onRequestExit
        ? keymap.of([
            {
              key: 'Escape',
              run: (): boolean => {
                // Always capture position first, regardless of vim mode
                captureExitPosition()

                setTimeout(() => {
                  try {
                    if (keyBindingMode === 'vim') {
                      return false
                    }

                    // For basic/emacs modes, check dirty state and show dialog if needed
                    const isDirty = editorManager.isDirty
                    if (isDirty && onRequestExit) {
                      onRequestExit()
                    } else if (onExit) {
                      onExit()
                    }
                  } catch {
                    if (onExit) onExit()
                  }
                }, 100)
                return false
              },
            },
          ])
        : null

    return [customKeymap, escapeKeymap].filter(Boolean) as Extension[]
  }

  function handleCreationFailure(error: unknown): void {
    console.error('Failed to create CodeMirror editor:', error)
    createFallbackEditor()
  }

  function captureExitPosition(): void {
    editorManager.captureExitPosition(onExitHeaderCapture, onExitCursorCapture)
  }

  function scrollToHeader(): void {
    if (shouldScrollToHeaderText()) {
      scheduleHeaderTextScroll()
    } else {
      scheduleInitialCursorScroll()
    }
  }

  function shouldScrollToHeaderText(): boolean {
    return nearestHeaderText.length > 2 && Boolean(editorView)
  }

  function scheduleHeaderTextScroll(): void {
    setTimeout(() => {
      if (editorView) {
        scrollToHeaderText()
        editorView.focus()
      }
    }, 150)
  }

  function scrollToHeaderText(): void {
    const doc = editorView!.state.doc
    const fullText = doc.toString()
    const match = findHeaderTextMatch(fullText)

    if (match && match.index !== undefined) {
      scrollToMatchPosition(match.index)
    }
  }

  function findHeaderTextMatch(fullText: string): RegExpMatchArray | null {
    const escapedHeader = escapeRegexText(nearestHeaderText)
    const headerRegex = new RegExp(`^${escapedHeader}\\s*$`, 'm')
    return fullText.match(headerRegex)
  }

  function escapeRegexText(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  function scrollToMatchPosition(position: number): void {
    editorView!.dispatch({
      selection: { anchor: position, head: position },
      effects: EditorView.scrollIntoView(position, {
        y: 'start',
        yMargin: 80,
      }),
    })
  }

  function scheduleInitialCursorScroll(): void {
    setTimeout(() => {
      if (editorView) {
        handleInitialCursorPosition()
        editorView.focus()
      }
    }, 100)
  }

  function handleInitialCursorPosition(): void {
    if (initialCursor) {
      setInitialCursorPosition()
    }
  }

  function setInitialCursorPosition(): void {
    try {
      const [line, column] = initialCursor!
      const doc = editorView!.state.doc
      const pos = calculateCursorPosition(doc, line, column)
      scrollToCursorPosition(pos)
    } catch (error) {
      console.warn('Failed to set initial cursor position:', error)
    }
  }

  function calculateCursorPosition(
    doc: Text,
    line: number,
    column: number
  ): number {
    const targetLine = Math.min(line, doc.lines)
    const lineObj = doc.line(targetLine)
    const targetColumn = Math.min(column - 1, lineObj.length)
    return lineObj.from + targetColumn
  }

  function scrollToCursorPosition(position: number): void {
    editorView!.dispatch({
      selection: { anchor: position, head: position },
      effects: EditorView.scrollIntoView(position, { y: 'center' }),
    })
  }

  let fallbackInputHandler: ((event: Event) => void) | null = null

  function createFallbackEditor(): void {
    if (!editorContainer) return
    editorContainer.innerHTML =
      '<textarea style="width:100%; height:100%; background:#282828; color:#fbf1c7; font-family:\'JetBrains Mono\', monospace; padding:16px; border:none; resize:none;"></textarea>'
    const textarea = editorContainer.querySelector(
      'textarea'
    ) as HTMLTextAreaElement
    if (textarea) {
      textarea.value = value || ''

      if (fallbackInputHandler) {
        textarea.removeEventListener('input', fallbackInputHandler)
      }

      fallbackInputHandler = () => {
        onContentChange?.(textarea.value)
      }

      textarea.addEventListener('input', fallbackInputHandler)
      setTimeout(() => textarea.focus(), 10)
    }
  }

  onMount(() => {
    const init = async () => {
      await tick()
      // Create editor with current reactive config values
      createCodeMirrorEditor()
    }

    init()

    return () => {
      // Capture cursor position before destroying (if not already captured)
      captureExitPosition()

      if (editorView) {
        editorView.destroy()
        editorView = null
        editorManager.setEditorView(null)
      }

      if (fallbackInputHandler && editorContainer) {
        const textarea = editorContainer.querySelector('textarea')
        if (textarea) {
          textarea.removeEventListener('input', fallbackInputHandler)
        }
        fallbackInputHandler = null
      }
    }
  })
</script>

<div class="editor-container">
  <div bind:this={editorContainer} class="codemirror-editor"></div>
  <div class="edit-footer">
    <h3>Editing: {filename}</h3>
    <div class="edit-controls">
      <button
        onclick={() => {
          captureExitPosition()
          onSave()
        }}
        class="save-btn">Save (Ctrl+S)</button
      >
      <button
        onclick={() => {
          captureExitPosition()
          onExit?.()
        }}
        class="cancel-btn">Cancel (Esc)</button
      >
    </div>
  </div>
</div>

<style>
  .codemirror-editor {
    flex: 1;
    min-height: 0;
    background-color: #282828;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .codemirror-editor :global(.cm-editor) {
    height: 100% !important;
  }

  .codemirror-editor :global(.cm-scroller) {
    height: 100% !important;
    overflow-y: auto !important;
  }

  .codemirror-editor :global(.cm-editor) {
    margin-left: max(1em, calc((100vw - 100ch) / 2)) !important;
    margin-right: max(1em, calc((100vw - 100ch) / 2)) !important;
  }

  @media (min-width: 768px) {
    .codemirror-editor :global(.cm-editor) {
      margin-left: max(1.5em, calc((100vw - 110ch) / 2)) !important;
      margin-right: max(1.5em, calc((100vw - 110ch) / 2)) !important;
    }
  }

  @media (min-width: 1024px) {
    .codemirror-editor :global(.cm-editor) {
      margin-left: max(2em, calc((100vw - 120ch) / 2)) !important;
      margin-right: max(2em, calc((100vw - 120ch) / 2)) !important;
    }
  }

  /* Add padding specifically to the text content, not the gutter */
  .codemirror-editor :global(.cm-content) {
    padding-top: 1.2em !important;
    padding-left: 1em !important;
    padding-right: 1em !important;
  }

  /* Editor container styles */
  .editor-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    background-color: #21252b;
    min-height: 0;
  }

  /* Edit footer styles with responsive width to match editor */
  .edit-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.8em 0;
    border-top: 1px solid #181a1f;
    background-color: #21252b;
    flex-shrink: 0;
    margin-left: max(1em, calc((100vw - 100ch) / 2));
    margin-right: max(1em, calc((100vw - 100ch) / 2));
    padding-left: 1em;
    padding-right: 1em;
  }

  @media (min-width: 768px) {
    .edit-footer {
      margin-left: max(1.5em, calc((100vw - 110ch) / 2));
      margin-right: max(1.5em, calc((100vw - 110ch) / 2));
    }
  }

  @media (min-width: 1024px) {
    .edit-footer {
      margin-left: max(2em, calc((100vw - 120ch) / 2));
      margin-right: max(2em, calc((100vw - 120ch) / 2));
    }
  }

  .edit-footer h3 {
    margin: 0;
    color: #61afef;
    font-size: 1.1em;
    font-weight: 500;
  }

  .edit-controls {
    display: flex;
    gap: 0.5em;
  }

  .save-btn,
  .cancel-btn {
    padding: 0.4em 0.8em;
    border: none;
    border-radius: 4px;
    font-size: 0.9em;
    cursor: pointer;
    transition: background-color 0.2s ease;
  }

  .save-btn {
    background-color: #98c379;
    color: #282c34;
  }

  .save-btn:hover {
    background-color: #a7d78b;
  }

  .cancel-btn {
    background-color: #3a3f4b;
    color: #abb2bf;
  }

  .cancel-btn:hover {
    background-color: #4b5263;
  }

  .codemirror-editor :global(.cm-foldPlaceholder) {
    background: linear-gradient(135deg, #3c3836 0%, #504945 100%) !important;
    color: #d5c4a1 !important;
    border: 1px solid #665c54 !important;
    border-radius: 6px !important;
    padding: 2px 8px !important;
    font-size: 11px !important;
    font-weight: 500 !important;
    margin: 0 4px !important;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2) !important;
  }
</style>
