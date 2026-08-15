import { useEffect, useMemo, useState } from 'react'
import { generateHTML } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { markdownToDocument } from '../editor/markdownAdapter'
import { StoryPageBreak } from '../editor/storyExtensions'

const PAGE_SIZES = {
  A4: { width: 794, height: 1123 },
  Letter: { width: 816, height: 1056 }
}
const mmToPixels = value => Math.round((Number(value) || 0) * 96 / 25.4)

const extensions = [
  StarterKit.configure({ link: { openOnClick: false } }),
  StoryPageBreak
]

export default function PdfExportView() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    document.documentElement.dataset.pdfExport = 'true'
    window.storywriter.getPdfExportData()
      .then(setData)
      .catch(reason => setError(reason.message || 'Could not prepare PDF export.'))
    return () => { delete document.documentElement.dataset.pdfExport }
  }, [])

  const chapters = useMemo(() => data?.chapters.map(chapter => {
    const document = markdownToDocument(chapter.content)
    return {
      ...chapter,
      hasOpeningHeading: document.content?.[0]?.type === 'heading',
      html: generateHTML(document, extensions)
    }
  }) ?? [], [data])

  useEffect(() => {
    if (!data && !error) return
    let cancelled = false
    const finish = async () => {
      if (!error) {
        const fontFamily = data.typography?.fontFamily || 'Literata'
        const baseSize = Number(data.typography?.baseSize) || 16
        await document.fonts?.load(`${baseSize}px "${fontFamily}"`).catch(() => {})
        await document.fonts?.ready
        await new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)))
      }
      if (!cancelled) window.storywriter.signalPdfExportReady(error || null)
    }
    void finish()
    return () => { cancelled = true }
  }, [data, error])

  if (error) return <div>{error}</div>
  if (!data) return null

  const format = PAGE_SIZES[data.page?.format] || PAGE_SIZES.A4
  const margins = data.page?.marginsMm || { top: 25, right: 25, bottom: 25, left: 25 }
  const fontFamily = data.typography?.fontFamily || 'Literata'
  const baseSize = Number(data.typography?.baseSize) || 16
  const css = `
    @page {
      size: ${format.width}px ${format.height}px;
      margin: ${mmToPixels(margins.top)}px ${mmToPixels(margins.right)}px ${mmToPixels(margins.bottom)}px ${mmToPixels(margins.left)}px;
    }
    .pdf-document {
      color: #191919;
      background: #fff;
      font-family: "${fontFamily.replaceAll('"', '\\"')}", serif;
      font-size: ${baseSize}px;
      line-height: 1.5;
    }
    .pdf-chapter + .pdf-chapter { break-before: page; }
    .pdf-chapter { position: relative; }
    .pdf-chapter-marker { position: absolute; width: 1px; height: 1px; margin: 0; overflow: hidden; opacity: 0; }
    .pdf-document p { margin: 0 0 0.75em; text-align: justify; }
    .pdf-document h1,
    .pdf-document h2,
    .pdf-document h3,
    .pdf-document h4,
    .pdf-document h5,
    .pdf-document h6 { margin: 0.85em 0 0.45em; line-height: 1.2; }
    .pdf-document h1 { font-size: ${Math.round(baseSize * 2)}px; }
    .pdf-document h2 { font-size: ${Math.round(baseSize * 1.5)}px; }
    .pdf-document h3 { font-size: ${Math.round(baseSize * 1.17)}px; }
    .pdf-document h4 { font-size: ${Math.round(baseSize * 1.25)}px; }
    .pdf-document h5 { font-size: ${Math.round(baseSize * 1.125)}px; }
    .pdf-document h6 { font-size: ${baseSize}px; }
    .pdf-document ul,
    .pdf-document ol { margin: 0 0 0.75em; padding-left: 1.6em; }
    .pdf-document blockquote { margin: 0 0 0.75em; padding-left: 0.9em; color: #555; border-left: 3px solid #c8c8c8; }
    .pdf-document pre { margin: 0 0 0.75em; padding: 0.65em 0.8em; overflow: hidden; background: #f3f3f3; border-radius: 3px; font-family: Consolas, monospace; }
    .pdf-document code { font-family: Consolas, monospace; }
    .pdf-document a { color: #1565c0; text-decoration: underline; }
    .pdf-document .story-page-break { height: 0; margin: 0; border: 0; break-after: page; }
  `

  return (
    <>
      <style>{css}</style>
      <main className="pdf-document">
        {chapters.map(chapter => (
          <section
            className="pdf-chapter"
            key={chapter.path}
          >
            {!chapter.hasOpeningHeading && <h1 className="pdf-chapter-marker">{chapter.title}</h1>}
            <div dangerouslySetInnerHTML={{ __html: chapter.html }} />
          </section>
        ))}
      </main>
    </>
  )
}
