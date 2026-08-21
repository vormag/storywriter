import { unified } from 'unified'
import remarkParse from 'remark-parse'

function textOf(node) {
  if (node.type === 'text' || node.type === 'inlineCode' || node.type === 'code') return node.value || ''
  return (node.children || []).map(textOf).join('')
}

function imageSizeAttrs(text) {
  const value = String(text || '').trim()
  if (!/^\{.*\}$/.test(value)) return null
  const attrs = { width: '', height: '', align: '' }
  for (const [, key, rawValue] of value.matchAll(/\b(width|w|height|h|align)=([a-z\d]+)\b/gi)) {
    if (key === 'width' || key === 'w') attrs.width = /^\d{1,4}$/.test(rawValue) ? rawValue : ''
    if (key === 'height' || key === 'h') attrs.height = /^\d{1,4}$/.test(rawValue) ? rawValue : ''
    if (key === 'align') attrs.align = /^(left|center|right)$/i.test(rawValue) ? rawValue.toLowerCase() : ''
  }
  return attrs.width || attrs.height || attrs.align ? attrs : null
}

function imageNode(node, resolveImageSrc, sizeAttrs = {}) {
  const markdownSrc = node.url || ''
  return {
    type: 'storyImage',
    attrs: {
      src: resolveImageSrc ? resolveImageSrc(markdownSrc) : markdownSrc,
      markdownSrc,
      alt: node.alt || '',
      title: node.title || '',
      width: sizeAttrs.width || '',
      height: sizeAttrs.height || '',
      align: sizeAttrs.align || 'center'
    }
  }
}

function inlineNodes(nodes, marks = [], resolveImageSrc) {
  return (nodes || []).flatMap(node => {
    switch (node.type) {
      case 'text':
        return node.value ? [{ type: 'text', text: node.value, ...(marks.length ? { marks } : {}) }] : []
      case 'strong':
        return inlineNodes(node.children, [...marks, { type: 'bold' }], resolveImageSrc)
      case 'emphasis':
        return inlineNodes(node.children, [...marks, { type: 'italic' }], resolveImageSrc)
      case 'inlineCode':
        return node.value ? [{ type: 'text', text: node.value, marks: [...marks, { type: 'code' }] }] : []
      case 'link':
        return inlineNodes(node.children, [...marks, {
          type: 'link',
          attrs: { href: node.url || '', target: null, rel: 'noopener noreferrer nofollow', class: null }
        }], resolveImageSrc)
      case 'image':
        return [{ type: 'text', text: node.alt || node.url || '' }]
      case 'break':
        return [{ type: 'hardBreak' }]
      default: {
        const value = textOf(node)
        return value ? [{ type: 'text', text: value, ...(marks.length ? { marks } : {}) }] : []
      }
    }
  })
}

function blockNode(node, resolveImageSrc) {
  switch (node.type) {
    case 'heading':
      return { type: 'heading', attrs: { level: node.depth }, content: inlineNodes(node.children, [], resolveImageSrc) }
    case 'paragraph':
      if (node.children?.length === 1 && node.children[0].type === 'image') {
        return imageNode(node.children[0], resolveImageSrc)
      }
      if (node.children?.length === 2 && node.children[0].type === 'image' && node.children[1].type === 'text') {
        const sizeAttrs = imageSizeAttrs(node.children[1].value)
        if (sizeAttrs) return imageNode(node.children[0], resolveImageSrc, sizeAttrs)
      }
      return { type: 'paragraph', content: inlineNodes(node.children, [], resolveImageSrc) }
    case 'list':
      return {
        type: node.ordered ? 'orderedList' : 'bulletList',
        ...(node.ordered ? { attrs: { start: node.start || 1, type: null } } : {}),
        content: (node.children || []).map(child => blockNode(child, resolveImageSrc)).filter(Boolean)
      }
    case 'listItem': {
      const content = (node.children || []).map(child => blockNode(child, resolveImageSrc)).filter(Boolean)
      return { type: 'listItem', content: content.length ? content : [{ type: 'paragraph' }] }
    }
    case 'blockquote':
      return { type: 'blockquote', content: (node.children || []).map(child => blockNode(child, resolveImageSrc)).filter(Boolean) }
    case 'code':
      return {
        type: 'codeBlock',
        attrs: { language: node.lang || null },
        content: node.value ? [{ type: 'text', text: node.value }] : []
      }
    case 'thematicBreak':
      return { type: 'horizontalRule' }
    case 'html':
      return /<!--\s*pagebreak\s*-->/i.test(node.value)
        ? { type: 'storyPageBreak' }
        : { type: 'paragraph', content: [{ type: 'text', text: node.value || '' }] }
    default: {
      const value = textOf(node)
      return value ? { type: 'paragraph', content: [{ type: 'text', text: value }] } : null
    }
  }
}

export function markdownToDocument(markdown, options = {}) {
  const tree = unified().use(remarkParse).parse(String(markdown || ''))
  const content = (tree.children || []).map(node => blockNode(node, options.resolveImageSrc)).filter(Boolean)
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }
}

function escapeMarkdown(value) {
  return String(value)
    .replaceAll('\\', '\\\\')
    .replace(/([*_[\]`])/g, '\\$1')
}

function serializeInline(nodes = []) {
  return nodes.map(node => {
    if (node.type === 'hardBreak') return '  \n'
    if (node.type !== 'text') return ''
    let value = escapeMarkdown(node.text || '')
    const marks = node.marks || []
    if (marks.some(mark => mark.type === 'code')) {
      value = `\`${String(node.text || '').replaceAll('`', '\\`')}\``
    } else {
      const bold = marks.some(mark => mark.type === 'bold')
      const italic = marks.some(mark => mark.type === 'italic')
      if (bold && italic) value = `***${value}***`
      else if (bold) value = `**${value}**`
      else if (italic) value = `*${value}*`
    }
    const link = marks.find(mark => mark.type === 'link')
    if (link) value = `[${value}](${link.attrs?.href || ''})`
    return value
  }).join('')
}

function serializeList(node, depth = 0) {
  const ordered = node.type === 'orderedList'
  const start = Number(node.attrs?.start) || 1
  return (node.content || []).map((item, index) => {
    const children = item.content || []
    const first = children[0]?.type === 'paragraph' ? serializeInline(children[0].content) : ''
    const marker = ordered ? `${start + index}. ` : '- '
    const nested = children.slice(1).map(child => serializeBlock(child, depth + 1)).filter(Boolean)
    const indentation = '  '.repeat(depth)
    return `${indentation}${marker}${first}${nested.length ? `\n${nested.join('\n')}` : ''}`
  }).join('\n')
}

function serializeBlock(node, depth = 0) {
  switch (node.type) {
    case 'paragraph':
      return serializeInline(node.content)
    case 'heading':
      return `${'#'.repeat(node.attrs?.level || 1)} ${serializeInline(node.content)}`
    case 'bulletList':
    case 'orderedList':
      return serializeList(node, depth)
    case 'blockquote':
      return (node.content || []).map(child => serializeBlock(child, depth)).join('\n\n')
        .split('\n').map(line => `> ${line}`).join('\n')
    case 'codeBlock': {
      const value = (node.content || []).map(child => child.text || '').join('')
      return `\`\`\`${node.attrs?.language || ''}\n${value}\n\`\`\``
    }
    case 'horizontalRule':
      return '---'
    case 'storyPageBreak':
      return '<!-- pagebreak -->'
    case 'storyImage': {
      const attrs = node.attrs || {}
      const alt = escapeMarkdown(attrs.alt || '')
      const src = attrs.markdownSrc || attrs.src || ''
      const title = attrs.title ? ` "${String(attrs.title).replaceAll('"', '\\"')}"` : ''
      const width = Number.parseInt(attrs.width, 10)
      const height = Number.parseInt(attrs.height, 10)
      const align = /^(left|center|right)$/.test(attrs.align) ? attrs.align : 'center'
      const size = [
        Number.isFinite(width) && width > 0 ? `width=${width}` : '',
        Number.isFinite(height) && height > 0 ? `height=${height}` : '',
        align !== 'center' ? `align=${align}` : ''
      ].filter(Boolean).join(' ')
      return `![${alt}](${src}${title})${size ? `{${size}}` : ''}`
    }
    default:
      return serializeInline(node.content)
  }
}

export function documentToMarkdown(document) {
  const blocks = (document?.content || []).map(node => serializeBlock(node)).filter(value => value !== '')
  return `${blocks.join('\n\n')}\n`
}
