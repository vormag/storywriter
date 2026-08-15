function parseCell(value) {
  return String(value || '').trim().replaceAll('\\|', '|')
}

function splitRow(line) {
  return line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(parseCell)
}

export function parseTimeline(markdown) {
  const table = String(markdown || '')
    .split(/\r?\n/)
    .filter(line => /^\s*\|/.test(line))
  const legacy = splitRow(table[0] || '')[0]?.toLowerCase() === 'time'
  return table.slice(2)
    .map((line, index) => {
      const cells = splitRow(line)
      const [date = '', time = '', event = '', loreCell = ''] = legacy
        ? [cells[0], '', cells[1], cells[2]]
        : cells
      const link = loreCell.match(/^\[(.*?)]\((.*?)\)$/)
      return {
        id: `${Date.now()}-${index}`,
        date,
        time,
        event,
        lore: link?.[2] || '',
        loreLabel: link?.[1] || ''
      }
    })
}

export function sortTimeline(rows) {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const date = left.row.date.localeCompare(right.row.date, undefined, { numeric: true, sensitivity: 'base' })
      if (date) return date
      const time = left.row.time.localeCompare(right.row.time, undefined, { numeric: true, sensitivity: 'base' })
      return time || left.index - right.index
    })
    .map(item => item.row)
}

function escapeCell(value) {
  return String(value || '').replaceAll('|', '\\|').replaceAll('\n', ' ')
}

export function serializeTimeline(rows, loreItems) {
  const lines = ['| Date | Time | Event | Lore |', '| --- | --- | --- | --- |']
  for (const row of rows) {
    if (!row.date.trim() && !row.time.trim() && !row.event.trim() && !row.lore) continue
    const lore = loreItems.find(item => item.path === row.lore)
    const loreCell = row.lore ? `[${escapeCell(lore?.label || row.loreLabel || row.lore)}](${row.lore})` : ''
    lines.push(`| ${escapeCell(row.date)} | ${escapeCell(row.time)} | ${escapeCell(row.event)} | ${loreCell} |`)
  }
  return `${lines.join('\n')}\n`
}
