import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import {
  FiBold,
  FiChevronDown,
  FiCornerDownRight,
  FiCornerUpLeft,
  FiCornerUpRight,
  FiImage,
  FiItalic,
  FiLink,
  FiLink2,
  FiMaximize,
  FiZoomIn,
  FiZoomOut
} from 'react-icons/fi'
import StarterKit from '@tiptap/starter-kit'
import { PaginationPlus } from 'tiptap-pagination-plus'
import {
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography
} from '@mui/material'
import { documentToMarkdown, markdownToDocument } from '../editor/markdownAdapter'
import { StoryImage, StoryPageBreak } from '../editor/storyExtensions'

const A4 = { width: 794, height: 1123 }
const LETTER = { width: 816, height: 1056 }
const PAGE_GAP = 18
const FONT_SIZES = [9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32]
const PROJECT_FONT_ALIAS = 'Storywriter Project Font'
const SELECTION_HIGHLIGHT = 'storywriter-editor-selection'
const PAGINATION_LOOP_WINDOW_MS = 700
const PAGINATION_LOOP_TRANSACTION_LIMIT = 14
const iconSize = 16
const mmToPixels = value => Math.round((Number(value) || 0) * 96 / 25.4)
const clampScale = value => Math.min(2, Math.max(0.5, Number(value) || 1))
const quoteFont = value => `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
const imageDimension = value => {
  const text = String(value ?? '').replace(/[^\d]/g, '').slice(0, 4)
  const number = Number.parseInt(text, 10)
  return Number.isFinite(number) && number > 0 ? String(number) : ''
}

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

function AddImageDialog({
  assets,
  assetUrlForPath,
  markdownAssetPath,
  selectedImage,
  onClose,
  onInsert,
  onUploadImages
}) {
  const initialSelectedPath = () => selectedImage
    ? assets.find(asset => assetUrlForPath(asset.path) === selectedImage.src || markdownAssetPath(asset.path) === selectedImage.markdownSrc)?.path || ''
    : ''
  const [query, setQuery] = useState('')
  const [selectedPath, setSelectedPath] = useState(initialSelectedPath)
  const [width, setWidth] = useState(() => selectedImage?.width || '')
  const [height, setHeight] = useState(() => selectedImage?.height || '')
  const [align, setAlign] = useState(() => selectedImage?.align || 'center')
  const [dimensionsLinked, setDimensionsLinked] = useState(true)
  const [naturalSizes, setNaturalSizes] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const filteredAssets = assets.filter(asset => {
    const value = query.trim().toLocaleLowerCase()
    if (!value) return true
    return `${asset.label || ''} ${asset.path || ''}`.toLocaleLowerCase().includes(value)
  })
  const selectedAsset = assets.find(asset => asset.path === selectedPath) || null
  const selectedNaturalSize = selectedAsset ? naturalSizes[selectedAsset.path] : null

  const imagePayload = asset => asset
    ? {
      path: asset.path,
      markdownSrc: markdownAssetPath(asset.path),
      src: assetUrlForPath(asset.path),
      alt: asset.label?.replace(/\.[^.]+$/, '') || 'Image',
      width: imageDimension(width),
      height: imageDimension(height),
      align
    }
    : {
      ...selectedImage,
      width: imageDimension(width),
      height: imageDimension(height),
      align
    }

  const selectAsset = asset => {
    if (selectedPath === asset.path) {
      setSelectedPath('')
      setWidth('')
      setHeight('')
      return
    }
    setSelectedPath(asset.path)
    const size = naturalSizes[asset.path]
    setWidth(size ? String(size.width) : '')
    setHeight(size ? String(size.height) : '')
  }

  const updateWidth = value => {
    const next = imageDimension(value)
    setWidth(next)
    if (dimensionsLinked && selectedNaturalSize?.width && selectedNaturalSize?.height && next) {
      setHeight(String(Math.max(1, Math.round(Number(next) * selectedNaturalSize.height / selectedNaturalSize.width))))
    }
  }

  const updateHeight = value => {
    const next = imageDimension(value)
    setHeight(next)
    if (dimensionsLinked && selectedNaturalSize?.width && selectedNaturalSize?.height && next) {
      setWidth(String(Math.max(1, Math.round(Number(next) * selectedNaturalSize.width / selectedNaturalSize.height))))
    }
  }

  const applyImage = () => {
    if (!selectedAsset && !selectedImage) return
    onInsert(imagePayload(selectedAsset))
  }

  const updateNaturalSize = (asset, image) => {
    const size = {
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height
    }
    if (!size.width || !size.height) return
    setNaturalSizes(current => ({ ...current, [asset.path]: size }))
    if (selectedPath === asset.path && !width && !height) {
      setWidth(String(size.width))
      setHeight(String(size.height))
    }
  }

  const upload = async () => {
    setBusy(true)
    setError('')
    try {
      const uploaded = await onUploadImages()
      if (uploaded?.[0]) {
        setQuery('')
        setSelectedPath(uploaded[0].path)
        setWidth('')
        setHeight('')
      }
    } catch (reason) {
      setError(reason.message || 'Could not upload images.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{selectedImage ? 'Edit Image' : 'Add Image'}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 1.5, pt: '8px !important' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <TextField size="small" label="Width" value={width} onChange={event => updateWidth(event.target.value)} inputProps={{ inputMode: 'numeric' }} sx={{ width: 120 }} />
          <Tooltip title={dimensionsLinked ? 'Unlink dimensions' : 'Link dimensions'}>
            <span>
              <IconButton
                size="small"
                onClick={() => setDimensionsLinked(value => !value)}
                disabled={!selectedNaturalSize}
                sx={{ width: 34, height: 34, borderRadius: 1, color: dimensionsLinked ? 'primary.main' : 'text.secondary' }}
              >
                {dimensionsLinked ? <FiLink2 size={iconSize} /> : <FiLink size={iconSize} />}
              </IconButton>
            </span>
          </Tooltip>
          <TextField size="small" label="Height" value={height} onChange={event => updateHeight(event.target.value)} inputProps={{ inputMode: 'numeric' }} sx={{ width: 120 }} />
          <Box sx={{ flex: 1 }} />
          <Box sx={{ display: 'flex', border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
            {['left', 'center', 'right'].map(value => (
              <Button
                key={value}
                size="small"
                variant={align === value ? 'contained' : 'text'}
                onClick={() => setAlign(value)}
                sx={{ minWidth: 58, borderRadius: 0 }}
              >
                {value}
              </Button>
            ))}
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.75 }}>
          <TextField size="small" fullWidth autoFocus value={query} placeholder="Search assets by name" onChange={event => setQuery(event.target.value)} />
          <Button size="small" variant="outlined" disabled={busy} onClick={upload}>Upload</Button>
        </Box>
        {error && <Typography variant="body2" color="error">{error}</Typography>}
        <Box sx={{
          minHeight: 260,
          maxHeight: 420,
          overflow: 'auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 132px))',
          gridAutoRows: 'max-content',
          alignContent: 'start',
          alignItems: 'start',
          gap: 1
        }}>
          {filteredAssets.map(item => {
            const label = item.label || item.path
            return (
              <Box
                component="button"
                type="button"
                key={item.path}
                disabled={busy}
                onClick={() => selectAsset(item)}
                style={{ font: 'inherit', textAlign: 'left' }}
                sx={{
                  display: 'grid',
                  gap: 0.5,
                  p: 0.75,
                  border: 1,
                  borderColor: selectedPath === item.path ? 'primary.main' : 'divider',
                  borderRadius: 1,
                  bgcolor: selectedPath === item.path ? 'action.selected' : 'background.paper',
                  color: 'text.primary',
                  cursor: busy ? 'default' : 'pointer',
                  alignSelf: 'start'
                }}
              >
                <Box
                  component="img"
                  src={assetUrlForPath(item.path)}
                  alt=""
                  onLoad={event => updateNaturalSize(item, event.currentTarget)}
                  sx={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', bgcolor: 'action.hover' }}
                />
                <Typography variant="caption" noWrap title={label}>{label}</Typography>
              </Box>
            )
          })}
          {!assets.length && <Typography variant="body2" color="text.secondary">No assets yet.</Typography>}
          {Boolean(assets.length) && !filteredAssets.length && <Typography variant="body2" color="text.secondary">No matching assets.</Typography>}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" disabled={!selectedAsset && !selectedImage} onClick={applyImage}>
          {selectedImage ? 'Apply' : 'Insert'}
        </Button>
      </DialogActions>
    </Dialog>
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
  onOpenLink,
  assets = [],
  assetUrlForPath,
  resolveImageSrc,
  markdownAssetPath,
  onUploadImages
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
  const [selectedImage, setSelectedImage] = useState(null)
  const [imageDialogOpen, setImageDialogOpen] = useState(false)

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
    StoryImage,
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
    const imageSelection = editor.state.selection.node?.type.name === 'storyImage'
      ? {
        position: from,
        src: editor.state.selection.node.attrs.src || '',
        markdownSrc: editor.state.selection.node.attrs.markdownSrc || '',
        alt: editor.state.selection.node.attrs.alt || '',
        title: editor.state.selection.node.attrs.title || '',
        width: editor.state.selection.node.attrs.width || '',
        height: editor.state.selection.node.attrs.height || '',
        align: editor.state.selection.node.attrs.align || 'center'
      }
      : null
    setSelectedImage(imageSelection)
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
    content: markdownToDocument(content, { resolveImageSrc }),
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

  useEffect(() => {
    if (!editor) return undefined

    const view = editor.view
    const originalDispatch = view.dispatch
    const dispatch = originalDispatch.bind(view)
    const emptyTransactions = []
    let cooldownTimer

    // ProseMirror exposes dispatch as a mutable integration point; guard the
    // third-party pagination plugin from flooding empty reflow transactions.
    // eslint-disable-next-line react-hooks/immutability
    view.dispatch = transaction => {
      const isEmptyPaginationReflow = !transaction.docChanged && !transaction.selectionSet && transaction.steps.length === 0

      if (isEmptyPaginationReflow) {
        const now = window.performance.now()
        while (emptyTransactions.length && now - emptyTransactions[0] > PAGINATION_LOOP_WINDOW_MS) {
          emptyTransactions.shift()
        }
        emptyTransactions.push(now)

        if (emptyTransactions.length > PAGINATION_LOOP_TRANSACTION_LIMIT) {
          window.clearTimeout(cooldownTimer)
          cooldownTimer = window.setTimeout(() => {
            emptyTransactions.length = 0
          }, PAGINATION_LOOP_WINDOW_MS)
          return
        }
      } else {
        emptyTransactions.length = 0
      }

      dispatch(transaction)
    }

    return () => {
      window.clearTimeout(cooldownTimer)
      view.dispatch = originalDispatch
    }
  }, [editor])

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
    const searchText = selectionRequest.caseInsensitive ? text.toLocaleLowerCase() : text
    const searchableText = selectionRequest.caseInsensitive ? flatText.toLocaleLowerCase() : flatText
    for (let index = 0; index < occurrence; index += 1) {
      match = searchableText.indexOf(searchText, offset)
      if (match < 0) return
      offset = match + text.length
    }
    const selectedPositions = flatPositions.slice(match, match + text.length).filter(Number.isInteger)
    if (!selectedPositions.length) return
    const chain = editor.chain()
    if (selectionRequest.focus !== false) chain.focus()
    chain
      .setTextSelection({ from: selectedPositions[0], to: selectedPositions.at(-1) + 1 })
      .scrollIntoView()
      .run()
    if (selectionRequest.focus === false) {
      window.requestAnimationFrame(() => {
        if (editor.isDestroyed) return
        const position = editor.view.domAtPos(selectedPositions[0])
        const target = position.node.nodeType === Node.TEXT_NODE
          ? position.node.parentElement
          : position.node instanceof Element ? position.node : null
        target?.scrollIntoView({ block: 'center', inline: 'nearest' })
      })
    }
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
          <FiCornerUpLeft size={iconSize} />
        </ToolButton>
        <ToolButton title="Redo" disabled={!rangeStyle.redo} onClick={() => editor?.chain().focus().redo().run()}>
          <FiCornerUpRight size={iconSize} />
        </ToolButton>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <Autocomplete
          disableClearable
          openOnFocus
          autoHighlight
          selectOnFocus
          handleHomeEndKeys
          forcePopupIcon
          popupIcon={<FiChevronDown size={14} />}
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
          <FiBold size={iconSize} />
        </ToolButton>
        <ToolButton title="Italic (Ctrl+I)" active={rangeStyle.italic} onClick={() => editor?.chain().focus().toggleItalic().run()}>
          <FiItalic size={iconSize} />
        </ToolButton>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <ToolButton title="Add image" onClick={() => setImageDialogOpen(true)}>
          <FiImage size={iconSize} />
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
          <FiCornerDownRight size={iconSize} />
        </ToolButton>
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary" sx={{ mr: 1, whiteSpace: 'nowrap' }}>
          {wordCount.toLocaleString()} words · page {Math.min(currentPage + 1, pageCount)}/{pageCount} · {saveStatus}
        </Typography>
        <ToolButton title="Zoom out" onClick={() => updateScale(scale - 0.1)}>
          <FiZoomOut size={iconSize} />
        </ToolButton>
        <Typography variant="caption" sx={{ width: 38, textAlign: 'center' }}>
          {Math.round(scale * 100)}%
        </Typography>
        <ToolButton title="Actual size (100%)" onClick={() => updateScale(1)}>
          <FiMaximize size={iconSize} />
        </ToolButton>
        <ToolButton title="Zoom in" onClick={() => updateScale(scale + 0.1)}>
          <FiZoomIn size={iconSize} />
        </ToolButton>
      </Box>
      <Box ref={scrollRef} id="document-scroll" className="document-scroll">
        <Box ref={editorHostRef} className="tiptap-editor-host" style={editorStyles}>
          <Box className="tiptap-editor-scale">
            <EditorContent editor={editor} />
          </Box>
        </Box>
      </Box>
      {imageDialogOpen && (
        <AddImageDialog
          assets={assets}
          assetUrlForPath={assetUrlForPath}
          markdownAssetPath={markdownAssetPath}
          selectedImage={selectedImage}
          onUploadImages={onUploadImages}
          onClose={() => setImageDialogOpen(false)}
          onInsert={image => {
            if (selectedImage?.position !== undefined) {
              editor?.chain().focus().setNodeSelection(selectedImage.position).updateAttributes('storyImage', {
                src: image.src ?? selectedImage.src,
                markdownSrc: image.markdownSrc ?? selectedImage.markdownSrc,
                alt: image.alt ?? selectedImage.alt,
                title: image.title ?? selectedImage.title,
                width: image.width,
                height: image.height,
                align: image.align
              }).run()
            } else {
              editor?.chain().focus().insertContent({
                type: 'storyImage',
                attrs: {
                  src: image.src,
                  markdownSrc: image.markdownSrc,
                  alt: image.alt,
                  title: '',
                  width: image.width,
                  height: image.height,
                  align: image.align
                }
              }).run()
            }
            setImageDialogOpen(false)
          }}
        />
      )}
    </Box>
  )
}
