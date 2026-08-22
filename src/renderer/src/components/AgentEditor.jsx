import {
  Box,
  Checkbox,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormLabel,
  MenuItem,
  TextField,
  Typography
} from '@mui/material'

const AVAILABLE_TOOLS = [
  ['list', 'List files'],
  ['find', 'Find text'],
  ['read', 'Read files'],
  ['write_story', 'Write story'],
  ['write_lore', 'Write lore'],
  ['edit_story', 'Edit story'],
  ['edit_lore', 'Edit lore'],
  ['read_timeline', 'Read timeline'],
  ['edit_timeline', 'Edit timeline'],
  ['select_range', 'Select text in editor'],
  ['get_summary', 'Get file summaries'],
  ['view_image', 'View images']
]
const REASONING_LEVELS = ['none', 'low', 'medium', 'high', 'xhigh', 'max']
const DEFAULT_CONFIG = {
  name: 'New agent',
  systemPrompt: '',
  model: 'gpt-5.6-terra',
  reasoning: 'medium',
  tools: []
}

function readConfig(content) {
  try {
    const parsed = JSON.parse(content)
    const valid = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    const source = valid ? parsed : DEFAULT_CONFIG
    return {
      valid,
      value: {
        name: String(source.name ?? DEFAULT_CONFIG.name),
        systemPrompt: String(source.systemPrompt ?? ''),
        model: String(source.model ?? DEFAULT_CONFIG.model),
        reasoning: REASONING_LEVELS.includes(source.reasoning) ? source.reasoning : DEFAULT_CONFIG.reasoning,
        tools: Array.isArray(source.tools) ? source.tools.map(String) : []
      }
    }
  } catch {
    return { valid: false, value: DEFAULT_CONFIG }
  }
}

export default function AgentEditor({ content, saveStatus, onChange }) {
  const { valid, value: config } = readConfig(content)
  const update = patch => {
    onChange(`${JSON.stringify({ ...config, ...patch }, null, 2)}\n`, 0)
  }

  const toggleTool = tool => {
    const tools = config.tools.includes(tool)
      ? config.tools.filter(item => item !== tool)
      : [...config.tools, tool]
    update({ tools })
  }

  return (
    <Box sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Box className="document-toolbar">
        <Typography variant="body2" sx={{ fontWeight: 600, px: 0.5 }}>Agent</Typography>
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary">{saveStatus}</Typography>
      </Box>
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        <Box sx={{ width: 'min(720px, 100%)', display: 'grid', gap: 2 }}>
          {!valid && <Typography variant="body2" color="error">Invalid JSON. Editing a field will replace it with a valid configuration.</Typography>}
          <TextField
            label="Name"
            size="small"
            value={config.name}
            onChange={event => update({ name: event.target.value })}
          />
          <TextField
            label="System Prompt"
            multiline
            minRows={8}
            value={config.systemPrompt}
            onChange={event => update({ systemPrompt: event.target.value })}
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 160px', gap: 1.5 }}>
            <TextField
              label="Model"
              size="small"
              value={config.model}
              onChange={event => update({ model: event.target.value })}
            />
            <TextField
              select
              label="Reasoning"
              size="small"
              value={config.reasoning}
              onChange={event => update({ reasoning: event.target.value })}
            >
              {REASONING_LEVELS.map(level => <MenuItem key={level} value={level}>{level}</MenuItem>)}
            </TextField>
          </Box>
          <FormControl component="fieldset">
            <FormLabel component="legend">Tools</FormLabel>
            <FormGroup sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              {AVAILABLE_TOOLS.map(([tool, label]) => (
                <FormControlLabel
                  key={tool}
                  label={label}
                  control={<Checkbox checked={config.tools.includes(tool)} onChange={() => toggleTool(tool)} />}
                />
              ))}
            </FormGroup>
          </FormControl>
        </Box>
      </Box>
    </Box>
  )
}
