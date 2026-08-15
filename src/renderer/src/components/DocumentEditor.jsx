import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { PaginationPlus } from 'tiptap-pagination-plus'
import {
  Autocomplete,
  Box,
  Divider,
  IconButton,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography
} from '@mui/material'
import { documentToMarkdown, markdownToDocument } from '../editor/markdownAdapter'
import { StoryPageBreak } from '../editor/storyExtensions'

const A4 = { width: 794, height: 1123 }
const LETTER = { width: 816, height: 1056 }
const PAGE_GAP = 18
const FONT_SIZES = [9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32]
const PROJECT_FONT_ALIAS = 'Storywriter Project Font'
const SELECTION_HIGHLIGHT = 'storywriter-editor-selection'
const mmToPixels = value => Math.round((Number(value) || 0) * 96 / 25.4)
const clampScale = value => Math.min(2, Math.max(0.5, Number(value) || 1))
const quoteFont = value => `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`

function ToolButton({ title, active = false, disabled = false, onClick, children }) {
  return (
    <Tooltip title={title} enterDelay={500}>
      <span>
        <IconButton
          size="small"
          disabled={disabled}
          onClick={onClick}
          sx={{
            width: 30,
            height: 30,
            borderRadius: 1,
            fontSize: 15,
            fontWeight: 600,
            bgcolor: active ? 'action.selected' : 'transparent'
          }}
        >
          {children}
        </IconButton>
      </span>
    </Tooltip>
  )
}

export default function DocumentEditor({
  content,
  filePath,
  page,
  typography = {},
  view = {},
  onTypographyChange,
  onViewChange,
  onChange,
  wordCount,
  saveStatus,
  selectionRequest,
  onSelectionChange,
  onOpenLink
}) {
  const scrollRef = useRef(null)
  const editorHostRef = useRef(null)
  const changeTimerRef = useRef(null)
  const restoreTimerRef = useRef(null)
  const paginationTimerRef = useRef(null)
  const onChangeRef = useRef(onChange)
  const onViewChangeRef = useRef(onViewChange)
  const onOpenLinkRef = useRef(onOpenLink)
  const onSelectionChangeRef = useRef(onSelectionChange)
  const format = page?.format === 'Letter' ? LETTER : A4
  const margins = page?.marginsMm || { top: 25, right: 25, bottom: 25, left: 25 }
  const fontFamily = typography?.fontFamily || 'Literata'
  const baseSize = Number(typography?.baseSize) || 16
  const [initialPage] = useState(() => Math.max(0, Number(view?.page) || 0))
  const [scale, setScale] = useState(() => clampScale(view?.zoom))
  const [pageCount, setPageCount] = useState(1)
  const scaleRef = useRef(scale)
  const pageCountRef = useRef(1)
  const [currentPage, setCurrentPage] = useState(initialPage)
  const [fonts, setFonts] = useState(() => [...new Set([fontFamily, 'Literata'])])
  const [rangeStyle, setRangeStyle] = useState({
    bold: false,
    italic: false,
    heading: 0,
    undo: false,
    redo: false
  })

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    onViewChangeRef.current = onViewChange
  }, [onViewChange])

  useEffect(() => {
    onOpenLinkRef.current = onOpenLink
  }, [onOpenLink])

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange
  }, [onSelectionChange])

  useEffect(() => {
    let active = true
    window.storywriter.getSystemFonts()
      .then(value => {
        if (active && value.length) setFonts([...new Set([fontFamily, 'Literata', ...value])].sort((a, b) => a.localeCompare(b)))
      })
      .catch(() => {})
    return () => { active = false }
  }, [fontFamily])

  const extensions = useMemo(() => [
    StarterKit.configure({
      link: { openOnClick: false, autolink: true, linkOnPaste: true }
    }),
    StoryPageBreak,
    PaginationPlus.configure({
      enabled: true,
      pageWidth: format.width,
      pageHeight: format.height,
      pageGap: PAGE_GAP,
      pageGapBorderSize: 1,
      pageGapBorderColor: '#c6c9ce',
      pageBreakBackground: '#dfe2e6',
      marginTop: mmToPixels(margins.top),
      marginRight: mmToPixels(margins.right),
      marginBottom: mmToPixels(margins.bottom),
      marginLeft: mmToPixels(margins.left),
      contentMarginTop: 0,
      contentMarginBottom: 0,
      headerLeft: '',
      headerRight: '',
      footerLeft: '',
      footerRight: '{page}'
    })
  ], [format.height, format.width, margins.bottom, margins.left, margins.right, margins.top])

  const syncRangeStyle = editor => {
    const { from, to, empty } = editor.state.selection
    const text = empty ? '' : editor.state.doc.textBetween(from, to, '\n').trim()
    const highlights = window.CSS?.highlights
    const HighlightConstructor = window.Highlight
    highlights?.delete(SELECTION_HIGHLIGHT)
    if (text && highlights && HighlightConstructor) {
      try {
        const start = editor.view.domAtPos(from)
        const end = editor.view.domAtPos(to)
        const range = document.createRange()
        range.setStart(start.node, start.offset)
        range.setEnd(end.node, end.offset)
        highlights.set(SELECTION_HIGHLIGHT, new HighlightConstructor(range))
      } catch {
        // The editor selection remains available even if Chromium cannot paint it.
      }
    }
    onSelectionChangeRef.current?.(text ? { text, from, to } : null)
    setRangeStyle({
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      heading: [1, 2, 3].find(level => editor.isActive('heading', { level })) || 0,
      undo: editor.can().undo(),
      redo: editor.can().redo()
    })
  }

  const editor = useEditor({
    extensions,
    content: markdownToDocument(content),
    editorProps: {
      attributes: {
        'aria-label': 'Document editor',
        spellcheck: 'true'
      },
      handleDOMEvents: {
        mousedown: (_view, event) => {
          const target = event.target
          if (!(target instanceof Element)) return false
          const paginationChrome = target.closest([
            '[data-rm-pagination]',
            '.rm-first-page-header',
            '.rm-page-header',
            '.rm-page-footer',
            '.rm-pagination-gap',
            '.breaker'
          ].join(','))
          if (!paginationChrome) return false
          event.preventDefault()
          return true
        },
        click: (_view, event) => {
          if (event.button !== 0) return false
          const target = event.target
          if (!(target instanceof Element)) return false
          const anchor = target.closest('a[href]')
          if (!anchor) return false
          event.preventDefault()
          onOpenLinkRef.current?.(anchor.getAttribute('href'))
          return true
        }
      }
    },
    onCreate: ({ editor: instance }) => syncRangeStyle(instance),
    onSelectionUpdate: ({ editor: instance }) => syncRangeStyle(instance),
    onTransaction: ({ editor: instance }) => syncRangeStyle(instance),
    onUpdate: ({ editor: instance }) => {
      window.clearTimeout(changeTimerRef.current)
      changeTimerRef.current = window.setTimeout(() => {
        const markdown = documentToMarkdown(instance.getJSON())
        const text = instance.getText().trim()
        const nextWordCount = text ? text.split(/\s+/).length : 0
        onChangeRef.current(markdown, nextWordCount)
      }, 160)
    }
  }, [filePath])

  useEffect(() => () => {
    window.CSS?.highlights?.delete(SELECTION_HIGHLIGHT)
  }, [])

  useEffect(() => {
    if (!editor || fontFamily === 'Literata' || typeof FontFace === 'undefined') return undefined
    let active = true
    const family = quoteFont(fontFamily)
    const faces = [
      new FontFace(PROJECT_FONT_ALIAS, `local(${family}), local(${quoteFont(`${fontFamily} Regular`)})`, { weight: '400', style: 'normal' }),
      new FontFace(PROJECT_FONT_ALIAS, `local(${quoteFont(`${fontFamily} Bold`)}), local(${family})`, { weight: '700', style: 'normal' }),
      new FontFace(PROJECT_FONT_ALIAS, `local(${quoteFont(`${fontFamily} Italic`)}), local(${family})`, { weight: '400', style: 'italic' }),
      new FontFace(PROJECT_FONT_ALIAS, `local(${quoteFont(`${fontFamily} Bold Italic`)}), local(${family})`, { weight: '700', style: 'italic' })
    ]
    const loadedFaces = []
    Promise.allSettled(faces.map(face => face.load())).then(results => {
      if (!active) return
      for (const result of results) {
        if (result.status !== 'fulfilled') continue
        document.fonts.add(result.value)
        loadedFaces.push(result.value)
      }
      if (!loadedFaces.length || editor.isDestroyed) return
      editor.view.dispatch(
        editor.state.tr
          .setSelection(editor.state.selection)
          .setMeta('addToHistory', false)
          .setMeta('storywriter:font-loaded', true)
      )
    })
    return () => {
      active = false
      for (const face of loadedFaces) document.fonts.delete(face)
    }
  }, [editor, fontFamily])

  useEffect(() => {
    if (!editor) return undefined
    let active = true
    let firstFrame
    let secondFrame
    const refreshPagination = () => {
      if (!active || editor.isDestroyed) return
      const transaction = editor.state.tr
        .setSelection(editor.state.selection)
        .setMeta('addToHistory', false)
        .setMeta('storywriter:refresh-pagination', true)
      editor.view.dispatch(transaction)
    }
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(refreshPagination)
    })
    const delayed = window.setTimeout(refreshPagination, 250)
    document.fonts?.load(`${baseSize}px "${fontFamily}"`).then(refreshPagination).catch(() => {})
    return () => {
      active = false
      window.cancelAnimationFrame(firstFrame)
      window.cancelAnimationFrame(secondFrame)
      window.clearTimeout(delayed)
    }
  }, [editor, fontFamily, baseSize])

  useEffect(() => {
    if (!editor || selectionRequest?.path !== filePath || !selectionRequest.text) return
    const text = String(selectionRequest.text)
    const flatPositions = []
    let flatText = ''
    let previousEnd = null
    editor.state.doc.descendants((node, position) => {
      if (!node.isText) return
      if (previousEnd !== null && position > previousEnd) {
        flatText += '\n'
        flatPositions.push(null)
      }
      for (let index = 0; index < node.text.length; index += 1) {
        flatText += node.text[index]
        flatPositions.push(position + index)
      }
      previousEnd = position + node.nodeSize
    })

    let match = -1
    let offset = 0
    const occurrence = Math.max(1, Number(selectionRequest.occurrence) || 1)
    for (let index = 0; index < occurrence; index += 1) {
      match = flatText.indexOf(text, offset)
      if (match < 0) return
      offset = match + text.length
    }
    const selectedPositions = flatPositions.slice(match, match + text.length).filter(Number.isInteger)
    if (!selectedPositions.length) return
    editor.chain()
      .focus()
      .setTextSelection({ from: selectedPositions[0], to: selectedPositions.at(-1) + 1 })
      .scrollIntoView()
      .run()
  }, [editor, filePath, selectionRequest])

  useEffect(() => {
    const scroll = scrollRef.current
    const host = editorHostRef.current
    if (!editor || !scroll || !host) return undefined

    const updatePagination = () => {
      window.clearTimeout(paginationTimerRef.current)
      paginationTimerRef.current = window.setTimeout(() => {
        const count = Math.max(1, host.querySelectorAll('#pages > .rm-page-break').length)
        pageCountRef.current = count
        setPageCount(count)
      }, 40)
    }
    const updateCurrentPage = () => {
      const next = Math.max(0, Math.min(
        Math.floor((scroll.scrollTop + scroll.clientHeight * 0.2) / ((format.height + PAGE_GAP) * scaleRef.current)),
        pageCountRef.current - 1
      ))
      setCurrentPage(next)
      onViewChangeRef.current?.({ page: next })
    }

    const observer = new MutationObserver(updatePagination)
    observer.observe(host, { childList: true, subtree: true })
    scroll.addEventListener('scroll', updateCurrentPage, { passive: true })
    updatePagination()
    restoreTimerRef.current = window.setTimeout(() => {
      scroll.scrollTop = initialPage * (format.height + PAGE_GAP) * scaleRef.current
      updateCurrentPage()
    }, 180)

    return () => {
      observer.disconnect()
      scroll.removeEventListener('scroll', updateCurrentPage)
      window.clearTimeout(changeTimerRef.current)
      window.clearTimeout(restoreTimerRef.current)
      window.clearTimeout(paginationTimerRef.current)
    }
  }, [editor, format.height, initialPage])

  const updateScale = value => {
    const next = clampScale(value)
    scaleRef.current = next
    setScale(next)
    onViewChangeRef.current?.({ zoom: next })
  }

  const editorStyles = {
    '--story-font-family': `${quoteFont(PROJECT_FONT_ALIAS)}, ${quoteFont(fontFamily)}`,
    '--story-base-size': `${baseSize}px`,
    '--story-h1-size': `${Math.round(baseSize * 2)}px`,
    '--story-h2-size': `${Math.round(baseSize * 1.5)}px`,
    '--story-h3-size': `${Math.round(baseSize * 1.17)}px`,
    '--story-h4-size': `${Math.round(baseSize * 1.25)}px`,
    '--story-h5-size': `${Math.round(baseSize * 1.125)}px`,
    '--story-editor-zoom': scale
  }

  return (
    <Box sx={{ minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box className="document-toolbar">
        <ToolButton title="Undo" disabled={!rangeStyle.undo} onClick={() => editor?.chain().focus().undo().run()}>
          ↶
        </ToolButton>
        <ToolButton title="Redo" disabled={!rangeStyle.redo} onClick={() => editor?.chain().focus().redo().run()}>
          ↷
        </ToolButton>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <Autocomplete
          disableClearable
          openOnFocus
          autoHighlight
          selectOnFocus
          handleHomeEndKeys
          forcePopupIcon
          popupIcon={<span style={{ fontSize: 12, lineHeight: 1 }}>▾</span>}
          options={fonts}
          value={typography.fontFamily || 'Literata'}
          onChange={(_event, value) => onTypographyChange?.({ fontFamily: value })}
          renderOption={({ key, ...optionProps }, option) => (
            <li key={key} {...optionProps} style={{ ...optionProps.style, fontFamily: option }}>
              {option}
            </li>
          )}
          renderInput={params => (
            <TextField
              {...params}
              variant="standard"
              placeholder="Font"
              InputProps={{ ...params.InputProps, disableUnderline: true }}
            />
          )}
          sx={{
            width: 222,
            mx: 0.5,
            '& .MuiInputBase-root': { height: 30, py: 0, fontSize: 12 },
            '& .MuiAutocomplete-input': {
              py: '4px !important',
              fontFamily: `${quoteFont(typography.fontFamily || 'Literata')}, sans-serif`
            },
            '& .MuiAutocomplete-popupIndicator': { color: 'text.secondary' }
          }}
        />
        <Select
          variant="standard"
          disableUnderline
          value={FONT_SIZES.includes(typography.baseSize) ? typography.baseSize : 16}
          onChange={event => onTypographyChange?.({ baseSize: Number(event.target.value) })}
          aria-label="Base font size"
          sx={{ width: 42, mr: 0.5, fontSize: 12 }}
        >
          {FONT_SIZES.map(size => <MenuItem key={size} value={size}>{size}</MenuItem>)}
        </Select>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <ToolButton title="Bold (Ctrl+B)" active={rangeStyle.bold} onClick={() => editor?.chain().focus().toggleBold().run()}>
          B
        </ToolButton>
        <ToolButton title="Italic (Ctrl+I)" active={rangeStyle.italic} onClick={() => editor?.chain().focus().toggleItalic().run()}>
          <i>I</i>
        </ToolButton>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        {[1, 2, 3].map(level => (
          <ToolButton
            key={level}
            title={`Heading ${level}`}
            active={rangeStyle.heading === level}
            onClick={() => editor?.chain().focus().toggleHeading({ level }).run()}
          >
            <span style={{ fontSize: 11 }}>H{level}</span>
          </ToolButton>
        ))}
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <ToolButton title="Insert page break" onClick={() => editor?.chain().focus().insertContent({ type: 'storyPageBreak' }).run()}>
          ↵
        </ToolButton>
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary" sx={{ mr: 1, whiteSpace: 'nowrap' }}>
          {wordCount.toLocaleString()} words · page {Math.min(currentPage + 1, pageCount)}/{pageCount} · {saveStatus}
        </Typography>
        <ToolButton title="Zoom out" onClick={() => updateScale(scale - 0.1)}>
          −
        </ToolButton>
        <Typography variant="caption" sx={{ width: 38, textAlign: 'center' }}>
          {Math.round(scale * 100)}%
        </Typography>
        <ToolButton title="Actual size (100%)" onClick={() => updateScale(1)}>
          <span style={{ fontSize: 10, letterSpacing: '-0.5px' }}>1:1</span>
        </ToolButton>
        <ToolButton title="Zoom in" onClick={() => updateScale(scale + 0.1)}>
          +
        </ToolButton>
      </Box>
      <Box ref={scrollRef} id="document-scroll" className="document-scroll">
        <Box ref={editorHostRef} className="tiptap-editor-host" style={editorStyles}>
          <Box className="tiptap-editor-scale">
            <EditorContent editor={editor} />
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
