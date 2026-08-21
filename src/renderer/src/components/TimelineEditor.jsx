import { useMemo, useState } from 'react'
import { FiPlus, FiRepeat, FiTrash2 } from 'react-icons/fi'
import {
  Box,
  Button,
  IconButton,
  Link,
  MenuItem,
  TextField,
  Tooltip,
  Typography
} from '@mui/material'
import { parseTimeline, serializeTimeline, sortTimeline } from '../editor/timelineAdapter'

const iconSize = 16

function countWords(rows) {
  return rows.reduce((count, row) => count + row.event.trim().split(/\s+/).filter(Boolean).length, 0)
}

function dateHeading(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || 'Undated'
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.valueOf())) return value
  const weekday = date.toLocaleDateString(undefined, { weekday: 'long', timeZone: 'UTC' })
  return `${value} (${weekday})`
}

function TimelineView({ rows, onOpen }) {
  const groups = useMemo(() => {
    const result = []
    for (const row of sortTimeline(rows)) {
      const previous = result.at(-1)
      if (previous?.date === row.date) previous.rows.push(row)
      else result.push({ date: row.date, rows: [row] })
    }
    return result
  }, [rows])

  if (!groups.length) {
    return <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>No timeline events.</Typography>
  }

  return (
    <Box className="timeline-view">
      {groups.map(group => (
        <Box key={group.date || 'undated'} className="timeline-date-group">
          <Typography variant="body1" className="timeline-date-heading">{dateHeading(group.date)}</Typography>
          <Box component="ul" className="timeline-event-list">
            {group.rows.map(row => (
              <Box component="li" key={row.id}>
                {row.time && <span className="timeline-event-time">({row.time}) </span>}
                <span>{row.event}</span>
                {row.lore && (
                  <>
                    {' '}
                    <Link component="button" type="button" variant="body2" onClick={() => onOpen?.(row.lore)}>
                      (source)
                    </Link>
                  </>
                )}
              </Box>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  )
}

export default function TimelineEditor({
  content,
  loreItems,
  onChange,
  saveStatus,
  mode = 'view',
  onModeChange,
  onOpen
}) {
  const [rows, setRows] = useState(() => parseTimeline(content))

  const commit = nextRows => {
    setRows(nextRows)
    onChange(serializeTimeline(nextRows, loreItems), countWords(nextRows))
  }

  const updateRow = (id, field, value) => {
    const nextRows = rows.map(row => row.id === id ? { ...row, [field]: value } : row)
    setRows(nextRows)
    onChange(serializeTimeline(nextRows, loreItems), countWords(nextRows))
  }

  const addRow = () => {
    const nextRows = [...rows, { id: crypto.randomUUID(), date: '', time: '', event: '', lore: '', loreLabel: '' }]
    commit(nextRows)
  }

  const removeRow = id => commit(rows.filter(row => row.id !== id))

  return (
    <Box sx={{ minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <Box className="document-toolbar">
        <Button size="small" variant={mode === 'view' ? 'contained' : 'text'} onClick={() => onModeChange?.('view')}>View</Button>
        <Button size="small" variant={mode === 'edit' ? 'contained' : 'text'} onClick={() => onModeChange?.('edit')}>Edit</Button>
        {mode === 'edit' && <Button size="small" onClick={addRow} startIcon={<FiPlus size={14} />}>Event</Button>}
        {mode === 'edit' && <Button size="small" onClick={() => commit(sortTimeline(rows))} startIcon={<FiRepeat size={14} />}>Rearrange</Button>}
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary">{rows.length} events · {saveStatus}</Typography>
      </Box>
      {mode === 'view' && <TimelineView rows={rows} onOpen={onOpen} />}
      {mode === 'edit' && <Box sx={{ overflow: 'auto', p: 1.5 }}>
        <Box className="timeline-grid timeline-grid-header">
          <Typography variant="caption">Date</Typography>
          <Typography variant="caption">Time</Typography>
          <Typography variant="caption">Event</Typography>
          <Typography variant="caption">Lore</Typography>
          <span />
        </Box>
        {rows.map(row => (
          <Box className="timeline-grid" key={row.id}>
            <TextField
              type="date"
              value={row.date}
              onChange={event => updateRow(row.id, 'date', event.target.value)}
              slotProps={{ htmlInput: { 'aria-label': 'Event date' } }}
            />
            <TextField
              type="time"
              value={row.time}
              onChange={event => updateRow(row.id, 'time', event.target.value)}
              slotProps={{ htmlInput: { 'aria-label': 'Event time', step: 60 } }}
            />
            <TextField
              value={row.event}
              placeholder="Event"
              onChange={event => updateRow(row.id, 'event', event.target.value)}
            />
            <TextField
              select
              value={row.lore}
              onChange={event => updateRow(row.id, 'lore', event.target.value)}
            >
              <MenuItem value=""><em>None</em></MenuItem>
              {loreItems.map(item => <MenuItem key={item.path} value={item.path}>{item.label}</MenuItem>)}
            </TextField>
            <Tooltip title="Delete event">
              <IconButton size="small" onClick={() => removeRow(row.id)}>
                <FiTrash2 size={iconSize} />
              </IconButton>
            </Tooltip>
          </Box>
        ))}
        {!rows.length && (
          <Button size="small" onClick={addRow} startIcon={<FiPlus size={14} />} sx={{ mt: 1 }}>Add first event</Button>
        )}
      </Box>}
    </Box>
  )
}
