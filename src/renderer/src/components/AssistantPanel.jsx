import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  TextField,
  Typography
} from '@mui/material'

function MarkdownMessage({ children, onNavigate }) {
  return (
    <Box className="assistant-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: linkChildren }) => (
            <a
              href={href}
              onClick={event => {
                event.preventDefault()
                if (href) onNavigate?.(href)
              }}
            >
              {linkChildren}
            </a>
          )
        }}
      >
        {children}
      </ReactMarkdown>
    </Box>
  )
}

export default function AssistantPanel({
  configured,
  agents,
  initialConversationId,
  onConversationChange,
  onBeforeSend,
  editorContext,
  onNavigate,
  onConfiguredChange
}) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const [busy, setBusy] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState('')
  const [conversationId, setConversationId] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyItems, setHistoryItems] = useState([])
  const [historyError, setHistoryError] = useState('')
  const [historyLoading, setHistoryLoading] = useState(false)
  const [keyDialogOpen, setKeyDialogOpen] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [keyError, setKeyError] = useState('')
  const [keySaving, setKeySaving] = useState(false)
  const endRef = useRef(null)
  const restorationCompleteRef = useRef(false)
  const onConversationChangeRef = useRef(onConversationChange)
  const enabled = Boolean(configured && selectedAgent)

  useEffect(() => {
    onConversationChangeRef.current = onConversationChange
  }, [onConversationChange])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, busy])

  useEffect(() => {
    if (selectedAgent && !agents.some(agent => agent.path === selectedAgent)) {
      setSelectedAgent('')
      setMessages([])
      setConversationId(null)
      onConversationChange(null)
    }
  }, [agents, selectedAgent, onConversationChange])

  useEffect(() => {
    if (restorationCompleteRef.current) return

    let cancelled = false
    const restore = async () => {
      try {
        let targetId = initialConversationId
        if (!targetId) {
          const conversations = await window.storywriter.getAiConversations()
          targetId = conversations[0]?.id || null
        }
        if (!targetId) {
          if (!cancelled) restorationCompleteRef.current = true
          return
        }

        const conversation = await window.storywriter.readAiConversation(targetId)
        if (cancelled) return
        restorationCompleteRef.current = true
        const agentAvailable = agents.some(agent => agent.path === conversation.agentPath)
        setSelectedAgent(agentAvailable ? conversation.agentPath : '')
        setConversationId(conversation.id)
        setMessages(conversation.messages)
        if (conversation.id !== initialConversationId) onConversationChangeRef.current(conversation.id)
      } catch {
        if (cancelled) return
        if (initialConversationId) {
          try {
            const conversations = await window.storywriter.getAiConversations()
            const fallbackId = conversations[0]?.id
            if (fallbackId && fallbackId !== initialConversationId) {
              const conversation = await window.storywriter.readAiConversation(fallbackId)
              if (cancelled) return
              restorationCompleteRef.current = true
              const agentAvailable = agents.some(agent => agent.path === conversation.agentPath)
              setSelectedAgent(agentAvailable ? conversation.agentPath : '')
              setConversationId(conversation.id)
              setMessages(conversation.messages)
              onConversationChangeRef.current(conversation.id)
              return
            }
          } catch {
            // Clear the stale preference below.
          }
        }
        restorationCompleteRef.current = true
        onConversationChangeRef.current(null)
      }
    }
    void restore()
    return () => { cancelled = true }
  }, [agents, initialConversationId])

  const send = async () => {
    const message = input.trim()
    if (!message || busy || !enabled) return

    setInput('')
    setBusy(true)
    const withUserMessage = [...messages, { role: 'user', text: message }]
    setMessages(withUserMessage)
    try {
      await onBeforeSend?.()
      const response = await window.storywriter.sendAiMessage({
        message,
        agentPath: selectedAgent,
        editorContext,
        history: messages.filter(item => item.role === 'user' || item.role === 'assistant')
      })
      const completedMessages = [...withUserMessage, { role: 'assistant', text: response.text }]
      setMessages(completedMessages)
      const saved = await window.storywriter.saveAiConversation({
        id: conversationId,
        agentPath: selectedAgent,
        messages: completedMessages
      })
      if (saved?.id) {
        setConversationId(saved.id)
        if (saved.id !== conversationId) onConversationChange(saved.id)
      }
    } catch (error) {
      setMessages(current => [...current, { role: 'error', text: error.message || 'The request failed.' }])
    } finally {
      setBusy(false)
    }
  }

  const openHistory = async () => {
    setHistoryOpen(true)
    setHistoryLoading(true)
    setHistoryError('')
    try {
      setHistoryItems(await window.storywriter.getAiConversations())
    } catch (error) {
      setHistoryError(error.message || 'Could not load conversations.')
    } finally {
      setHistoryLoading(false)
    }
  }

  const loadConversation = async id => {
    setHistoryLoading(true)
    setHistoryError('')
    try {
      const conversation = await window.storywriter.readAiConversation(id)
      const agentAvailable = agents.some(agent => agent.path === conversation.agentPath)
      setSelectedAgent(agentAvailable ? conversation.agentPath : '')
      setConversationId(conversation.id)
      setMessages(conversation.messages)
      setInput('')
      onConversationChange(conversation.id)
      setHistoryOpen(false)
    } catch (error) {
      setHistoryError(error.message || 'Could not load the conversation.')
    } finally {
      setHistoryLoading(false)
    }
  }

  const removeConversation = async conversation => {
    if (!window.confirm(`Remove conversation "${conversation.title}"?`)) return
    setHistoryLoading(true)
    setHistoryError('')
    try {
      await window.storywriter.deleteAiConversation(conversation.id)
      setHistoryItems(current => current.filter(item => item.id !== conversation.id))
      if (conversation.id === conversationId) {
        setMessages([])
        setConversationId(null)
        onConversationChange(null)
      }
    } catch (error) {
      setHistoryError(error.message || 'Could not remove the conversation.')
    } finally {
      setHistoryLoading(false)
    }
  }

  const saveOpenAiKey = async event => {
    event.preventDefault()
    setKeySaving(true)
    setKeyError('')
    try {
      const status = await window.storywriter.setOpenAiKey(keyInput)
      onConfiguredChange?.(status.configured)
      setKeyInput('')
      setKeyDialogOpen(false)
    } catch (error) {
      setKeyError(error.message || 'Could not store the OpenAI key.')
    } finally {
      setKeySaving(false)
    }
  }

  return (
    <>
      <Box className="panel-toolbar" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, px: 0.5 }}>Assistant</Typography>
        <TextField
          select
          size="small"
          value={selectedAgent}
          disabled={busy || !agents.length}
          onChange={event => {
            restorationCompleteRef.current = true
            setSelectedAgent(event.target.value)
            setMessages([])
            setConversationId(null)
            onConversationChange(null)
            setInput('')
          }}
          sx={{
            flex: 1,
            minWidth: 0,
            '& .MuiInputBase-root': { height: 28, fontSize: 12 },
            '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
            '& .MuiSelect-select': { py: 0.5 }
          }}
        >
          <MenuItem value=""><em>Select agent</em></MenuItem>
          {agents.map(agent => <MenuItem key={agent.path} value={agent.path}>{agent.label}</MenuItem>)}
        </TextField>
        <IconButton
          size="small"
          disabled={busy}
          aria-label="Conversation history"
          title="Conversation history"
          onClick={openHistory}
        >◷</IconButton>
        <IconButton
          size="small"
          disabled={busy}
          aria-label="New conversation"
          title="New conversation"
          onClick={() => {
            restorationCompleteRef.current = true
            setMessages([])
            setConversationId(null)
            onConversationChange(null)
          }}
        >＋</IconButton>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 1 }}>
        {configured === false && (
          <Box sx={{ display: 'grid', justifyItems: 'start', gap: 1 }}>
            <Typography variant="body2" color="text.secondary">No OpenAI API key is configured.</Typography>
            <Button size="small" variant="outlined" onClick={() => setKeyDialogOpen(true)}>Add OpenAI key</Button>
          </Box>
        )}
        {!messages.length && configured !== false && (
          <Typography variant="body2" color="text.secondary">
            {configured === null && 'Checking OpenAI configuration…'}
            {configured === true && !agents.length && 'Create an agent to use the assistant.'}
            {configured === true && agents.length > 0 && !selectedAgent && 'Select an agent.'}
            {configured === true && selectedAgent && 'Send a message.'}
          </Typography>
        )}
        {messages.map((message, index) => (
          <Box
            key={index}
            sx={{
              mb: 1,
              ml: message.role === 'user' ? 2 : 0,
              mr: message.role === 'user' ? 0 : 2,
              px: 1,
              py: 0.75,
              borderRadius: 1,
              bgcolor: message.role === 'user' ? 'action.selected' : 'background.paper',
              color: message.role === 'error' ? 'error.main' : 'text.primary'
            }}
          >
            {message.role === 'assistant'
              ? <MarkdownMessage onNavigate={onNavigate}>{message.text}</MarkdownMessage>
              : <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message.text}</Typography>}
          </Box>
        ))}
        {busy && <Typography variant="caption" color="text.secondary">Thinking…</Typography>}
        <div ref={endRef} />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5, p: 1, borderTop: 1, borderColor: 'divider' }}>
        <TextField
          fullWidth
          multiline
          maxRows={5}
          size="small"
          value={input}
          disabled={!enabled || busy}
          placeholder={!configured ? 'Not connected' : selectedAgent ? 'Message' : 'Select an agent'}
          onChange={event => setInput(event.target.value)}
          onKeyDown={event => {
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
            event.preventDefault()
            if (event.shiftKey || event.ctrlKey) {
              const target = event.currentTarget
              const start = target.selectionStart ?? input.length
              const end = target.selectionEnd ?? start
              setInput(`${input.slice(0, start)}\n${input.slice(end)}`)
              window.requestAnimationFrame(() => target.setSelectionRange(start + 1, start + 1))
            } else {
              void send()
            }
          }}
        />
      </Box>
      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Conversations</DialogTitle>
        <DialogContent dividers sx={{ p: 0, minHeight: 180 }}>
          {historyLoading && <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>Loading…</Typography>}
          {!historyLoading && historyError && <Typography variant="body2" color="error" sx={{ p: 2 }}>{historyError}</Typography>}
          {!historyLoading && !historyError && !historyItems.length && (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>No saved conversations.</Typography>
          )}
          {!historyLoading && !historyError && Boolean(historyItems.length) && (
            <List disablePadding>
              {historyItems.map(item => (
                <Box key={item.id} sx={{ display: 'flex', alignItems: 'center' }}>
                  <ListItemButton selected={item.id === conversationId} onClick={() => loadConversation(item.id)}>
                    <ListItemText
                      primary={item.title}
                      secondary={`${item.agentName} · ${item.updatedAt ? new Date(item.updatedAt).toLocaleString() : ''}`}
                      primaryTypographyProps={{ noWrap: true }}
                    />
                  </ListItemButton>
                  <IconButton
                    size="small"
                    color="error"
                    aria-label={`Remove ${item.title}`}
                    title="Remove conversation"
                    onClick={() => removeConversation(item)}
                    sx={{ mx: 1 }}
                  >×</IconButton>
                </Box>
              ))}
            </List>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={keyDialogOpen} onClose={() => !keySaving && setKeyDialogOpen(false)} fullWidth maxWidth="xs">
        <Box component="form" onSubmit={saveOpenAiKey}>
          <DialogTitle>Add OpenAI key</DialogTitle>
          <DialogContent sx={{ pt: '8px !important' }}>
            <TextField
              autoFocus
              fullWidth
              type="password"
              label="API key"
              value={keyInput}
              disabled={keySaving}
              error={Boolean(keyError)}
              helperText={keyError || 'Stored securely for this operating-system user.'}
              autoComplete="off"
              onChange={event => setKeyInput(event.target.value)}
            />
          </DialogContent>
          <DialogActions>
            <Button disabled={keySaving} onClick={() => setKeyDialogOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={keySaving || !keyInput.trim()}>Save</Button>
          </DialogActions>
        </Box>
      </Dialog>
    </>
  )
}
