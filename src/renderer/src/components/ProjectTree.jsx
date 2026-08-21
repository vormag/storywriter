import { useMemo, useState } from 'react'
import { FiMoreVertical, FiPlus, FiRefreshCw } from 'react-icons/fi'
import { RichTreeView } from '@mui/x-tree-view/RichTreeView'
import {
  Box,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Tooltip
} from '@mui/material'
function buildItems(project) {
  if (!project) return []
  return [
    {
      id: 'section:story',
      label: 'Story',
      kind: 'section',
      children: project.tree.story
    },
    project.tree.timeline,
    {
      id: 'section:lore',
      label: 'Lore',
      kind: 'section',
      children: project.tree.lore
    },
    {
      id: 'section:assets',
      label: 'Assets',
      kind: 'section',
      children: project.tree.assets || []
    },
    {
      id: 'section:agents',
      label: 'Agents',
      kind: 'section',
      children: project.tree.agents
    }
  ]
}

const iconSize = 16

function findItem(items, id) {
  for (const item of items) {
    if (item.id === id) return item
    const child = findItem(item.children || [], id)
    if (child) return child
  }
  return null
}

export default function ProjectTree({
  project,
  activePath,
  onOpen,
  onCreateChapter,
  onCreateLore,
  onCreateCategory,
  onCreateAgent,
  onRename,
  onDelete,
  onRefresh
}) {
  const items = useMemo(() => buildItems(project), [project])
  const [selectedId, setSelectedId] = useState(activePath)
  const [previousActivePath, setPreviousActivePath] = useState(activePath)
  const [addAnchor, setAddAnchor] = useState(null)
  const [moreAnchor, setMoreAnchor] = useState(null)

  if (activePath !== previousActivePath) {
    setPreviousActivePath(activePath)
    setSelectedId(activePath)
  }
  const selected = findItem(items, selectedId)
  const editable = selected && !['section', 'timeline', 'asset-folder'].includes(selected.kind)

  const select = (_event, id) => {
    setSelectedId(id)
    const item = findItem(items, id)
    if (/\.(md|json|jpe?g|png|gif|webp|avif|svg)$/i.test(item?.path || '')) onOpen(item.path)
  }

  return (
    <Box sx={{ height: '100%', minWidth: 0, display: 'flex', flexDirection: 'column', bgcolor: 'background.paper' }}>
      <Box className="panel-toolbar">
        <Tooltip title="New">
          <IconButton size="small" onClick={event => setAddAnchor(event.currentTarget)}><FiPlus size={iconSize} /></IconButton>
        </Tooltip>
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={onRefresh}><FiRefreshCw size={iconSize} /></IconButton>
        </Tooltip>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Rename or delete">
          <span>
            <IconButton size="small" disabled={!editable} onClick={event => setMoreAnchor(event.currentTarget)}>
              <FiMoreVertical size={iconSize} />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
      <Divider />
      <Box sx={{ flex: 1, overflow: 'auto', py: 0.5 }}>
        <RichTreeView
          items={items}
          selectedItems={selectedId || null}
          onSelectedItemsChange={select}
          defaultExpandedItems={['section:story', 'section:lore', 'section:assets', 'section:agents']}
          sx={{ minWidth: 0, '& .MuiTreeItem-label': { fontSize: 13 } }}
        />
      </Box>
      <Menu anchorEl={addAnchor} open={Boolean(addAnchor)} onClose={() => setAddAnchor(null)}>
        <MenuItem onClick={() => { setAddAnchor(null); onCreateChapter() }}>Chapter</MenuItem>
        <MenuItem onClick={() => { setAddAnchor(null); onCreateLore(selected?.kind === 'folder' ? selected.path : null) }}>Lore page</MenuItem>
        <MenuItem onClick={() => { setAddAnchor(null); onCreateCategory() }}>Lore category</MenuItem>
        <MenuItem onClick={() => { setAddAnchor(null); onCreateAgent() }}>Agent</MenuItem>
      </Menu>
      <Menu anchorEl={moreAnchor} open={Boolean(moreAnchor)} onClose={() => setMoreAnchor(null)}>
        <MenuItem onClick={() => { setMoreAnchor(null); onRename(selected) }}>Rename</MenuItem>
        <MenuItem sx={{ color: 'error.main' }} onClick={() => { setMoreAnchor(null); onDelete(selected) }}>Delete</MenuItem>
      </Menu>
    </Box>
  )
}
