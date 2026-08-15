import { Node } from '@tiptap/core'

export const StoryPageBreak = Node.create({
  name: 'storyPageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML: () => [{ tag: 'div[data-story-page-break]' }],
  renderHTML: () => ['div', { 'data-story-page-break': '', class: 'story-page-break' }]
})
