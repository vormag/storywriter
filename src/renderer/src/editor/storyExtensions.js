import { Node } from '@tiptap/core'

export const StoryPageBreak = Node.create({
  name: 'storyPageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML: () => [{ tag: 'div[data-story-page-break]' }],
  renderHTML: () => ['div', { 'data-story-page-break': '', class: 'story-page-break' }]
})

export const StoryImage = Node.create({
  name: 'storyImage',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: '' },
      markdownSrc: { default: '' },
      alt: { default: '' },
      title: { default: '' },
      width: { default: '' },
      height: { default: '' },
      align: { default: 'center' }
    }
  },
  parseHTML: () => [{ tag: 'figure[data-story-image]' }, { tag: 'img[data-story-image]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'figure',
    {
      'data-story-image': '',
      class: 'story-image',
      'data-align': HTMLAttributes.align || 'center'
    },
    [
      'img',
      {
        src: HTMLAttributes.src || HTMLAttributes.markdownSrc || '',
        alt: HTMLAttributes.alt || '',
        width: HTMLAttributes.width || null,
        height: HTMLAttributes.height || null
      }
    ]
  ]
})
