export function slugify(value) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
  return slug || 'untitled'
}

export function normalizeRelative(relativePath) {
  return String(relativePath || '').replaceAll('\\', '/').replace(/^\/+/, '')
}

export function validateConversationId(id) {
  const value = String(id || '')
  if (!/^[0-9a-f-]{36}$/i.test(value)) throw new Error('Invalid conversation identifier.')
  return value
}
