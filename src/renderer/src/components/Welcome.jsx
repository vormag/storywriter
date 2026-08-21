import { FiFolder, FiFolderPlus, FiMoon, FiSun } from 'react-icons/fi'
import {
  Box,
  Button,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Tooltip,
  Typography
} from '@mui/material'
const iconSize = 16

function relativeTime(iso) {
  const timestamp = Date.parse(iso)
  if (!Number.isFinite(timestamp)) return ''
  const days = Math.floor((Date.now() - timestamp) / 86400000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

export default function Welcome({ recents, busy, onCreate, onOpen, onOpenRecent, themeMode, onThemeToggle }) {
  return (
    <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', bgcolor: 'background.default', p: 2 }}>
      <Paper variant="outlined" sx={{ width: 'min(560px, 100%)', overflow: 'hidden' }}>
        <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Storywriter</Typography>
          <Box sx={{ flex: 1 }} />
          <Tooltip title={themeMode === 'dark' ? 'Use light theme' : 'Use dark theme'}>
            <IconButton size="small" onClick={onThemeToggle}>{themeMode === 'dark' ? <FiSun size={iconSize} /> : <FiMoon size={iconSize} />}</IconButton>
          </Tooltip>
          <Button size="small" onClick={onCreate} disabled={busy} startIcon={<FiFolderPlus size={14} />}>New</Button>
          <Button size="small" onClick={onOpen} disabled={busy} startIcon={<FiFolder size={14} />}>Open folder…</Button>
        </Box>
        <Divider />
        <List dense disablePadding sx={{ minHeight: 120, maxHeight: 360, overflow: 'auto' }}>
          {recents.map(item => (
            <ListItemButton key={item.path} onClick={() => onOpenRecent(item.path)} disabled={busy}>
              <ListItemText
                primary={item.title || item.path}
                secondary={item.path}
                slotProps={{ primary: { noWrap: true }, secondary: { noWrap: true } }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ ml: 2, whiteSpace: 'nowrap' }}>
                {relativeTime(item.lastOpenedAt)}
              </Typography>
            </ListItemButton>
          ))}
          {!recents.length && (
            <Box sx={{ px: 2, py: 3, color: 'text.secondary' }}>
              <Typography variant="body2">No recent projects.</Typography>
            </Box>
          )}
        </List>
      </Paper>
    </Box>
  )
}
