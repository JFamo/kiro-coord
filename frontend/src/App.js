import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Box, Drawer, List, ListItem, ListItemButton, ListItemText, IconButton, TextField, Paper, Typography, AppBar, Toolbar, Button, ThemeProvider, createTheme, CssBaseline, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { Add as AddIcon, Close as CloseIcon, LightMode as LightModeIcon, DarkMode as DarkModeIcon, Edit as EditIcon, Info as InfoIcon, Settings as SettingsIcon } from '@mui/icons-material';
import '@xterm/xterm/css/xterm.css';
import { DRAWER_WIDTH, API_URL, WS_URL, darkTheme as terminalDarkTheme, lightTheme as terminalLightTheme } from './config';
import { createTerminal, setupResizeHandler, normalizeLineEndings } from './terminalUtils';
import AgentEditor from './AgentEditor';

function App() {
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [input, setInput] = useState('');
  const [theme, setTheme] = useState('dark');
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renamingSessionId, setRenamingSessionId] = useState(null);
  const [newSessionName, setNewSessionName] = useState('');
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const [showAgents, setShowAgents] = useState(false);
  const [agents, setAgents] = useState([]);
  const [editingAgentId, setEditingAgentId] = useState(null);
  const wsRef = useRef(null);
  const terminalRef = useRef(null);
  const terminalContainerRef = useRef(null);
  const fitAddonRef = useRef(null);

  const muiTheme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: theme,
        },
      }),
    [theme]
  );

  useEffect(() => {
    fetchSessions();
    if (showAgents) {
      fetchAgents();
    }
  }, [showAgents]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = theme === 'dark' ? terminalDarkTheme : terminalLightTheme;
    }
  }, [theme]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Cmd+Shift+Arrow keys for navigation (won't conflict with browser)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          navigateToPreviousSession();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          navigateToNextSession();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sessions, activeSessionId]);

  const navigateToPreviousSession = () => {
    if (sessions.length === 0) return;
    const currentIndex = sessions.findIndex(s => s.id === activeSessionId);
    const previousIndex = currentIndex <= 0 ? sessions.length - 1 : currentIndex - 1;
    connectToSession(sessions[previousIndex].id);
  };

  const navigateToNextSession = () => {
    if (sessions.length === 0) return;
    const currentIndex = sessions.findIndex(s => s.id === activeSessionId);
    const nextIndex = currentIndex >= sessions.length - 1 ? 0 : currentIndex + 1;
    connectToSession(sessions[nextIndex].id);
  };

  const fetchSessions = async () => {
    const res = await fetch(`${API_URL}/sessions`);
    const data = await res.json();
    setSessions(data);
  };

  const fetchAgents = async () => {
    const res = await fetch(`${API_URL}/agents`);
    const data = await res.json();
    setAgents(data);
  };

  const toggleTheme = async () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    await fetch(`${API_URL}/theme`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: newTheme })
    });
    setTheme(newTheme);
  };

  const createSession = async () => {
    const res = await fetch(`${API_URL}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '' })  // Send empty name to use server counter
    });
    const session = await res.json();
    setSessions([...sessions, session]);
    connectToSession(session.id);
  };

  const deleteSession = async (sessionId) => {
    await fetch(`${API_URL}/sessions/${sessionId}`, { method: 'DELETE' });
    setSessions(sessions.filter(s => s.id !== sessionId));
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (terminalRef.current) {
        if (terminalRef.current._resizeObserver) {
          terminalRef.current._resizeObserver.disconnect();
        }
        terminalRef.current.dispose();
        terminalRef.current = null;
      }
    }
  };

  const connectToSession = (sessionId) => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    if (terminalRef.current) {
      terminalRef.current.dispose();
    }
    
    setActiveSessionId(sessionId);
    
    setTimeout(() => {
      if (!terminalContainerRef.current) return;
      
      const { terminal, fitAddon } = createTerminal(
        theme === 'dark' ? terminalDarkTheme : terminalLightTheme,
        terminalContainerRef.current
      );
      
      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;
      
      const resizeObserver = setupResizeHandler(terminalContainerRef.current, fitAddon);
      terminal._resizeObserver = resizeObserver;
      
      const ws = new WebSocket(`${WS_URL}/ws/${sessionId}`);
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'output') {
          terminal.write(normalizeLineEndings(data.content));
        } else if (data.type === 'error') {
          terminal.write('[ERROR] ' + data.content);
        }
      };
      ws.onclose = () => {
        terminal.write('[Connection closed]');
      };
      wsRef.current = ws;
    }, 0);
  };

  const sendMessage = () => {
    if (!input.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }
    
    // Display user message with clear styling
    if (terminalRef.current) {
      const userMessage = `\r\n\x1b[36m─────────────────────────────────────────────────────────────────────────────────\x1b[0m\r\n\x1b[1;36mUser:\x1b[0m ${input}\r\n\x1b[36m─────────────────────────────────────────────────────────────────────────────────\x1b[0m\r\n`;
      terminalRef.current.write(userMessage);
    }
    
    wsRef.current.send(JSON.stringify({ type: 'input', content: input }));
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const openRenameDialog = (sessionId, currentName) => {
    setRenamingSessionId(sessionId);
    setNewSessionName(currentName);
    setRenameDialogOpen(true);
  };

  const closeRenameDialog = () => {
    setRenameDialogOpen(false);
    setRenamingSessionId(null);
    setNewSessionName('');
  };

  const renameSession = async () => {
    if (!newSessionName.trim() || !renamingSessionId) return;
    
    await fetch(`${API_URL}/sessions/${renamingSessionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newSessionName })
    });
    
    setSessions(sessions.map(s => 
      s.id === renamingSessionId ? { ...s, name: newSessionName } : s
    ));
    
    closeRenameDialog();
  };

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', height: '100vh' }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            Kiro Coordinator
          </Typography>
          <IconButton color="inherit" onClick={() => setInfoDialogOpen(true)}>
            <InfoIcon />
          </IconButton>
          <IconButton color="inherit" onClick={toggleTheme}>
            {theme === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>
        </Toolbar>
      </AppBar>
      
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' }
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto', display: 'flex', flexDirection: 'column', height: '100%' }}>
          <List>
            {sessions.map((session) => (
              <ListItem
                key={session.id}
                disablePadding
                secondaryAction={
                  <Box>
                    <IconButton edge="end" size="small" onClick={() => openRenameDialog(session.id, session.name)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton edge="end" onClick={() => deleteSession(session.id)}>
                      <CloseIcon />
                    </IconButton>
                  </Box>
                }
              >
                <ListItemButton
                  selected={activeSessionId === session.id}
                  onClick={() => connectToSession(session.id)}
                >
                  <ListItemText primary={session.name} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
          <Box sx={{ mt: 'auto', p: 2 }}>
            <Button fullWidth variant="contained" startIcon={<AddIcon />} onClick={createSession} sx={{ mb: 1 }}>
              New Session
            </Button>
            <Button 
              fullWidth 
              variant="outlined" 
              startIcon={<SettingsIcon />} 
              onClick={() => {
                setShowAgents(true);
                setActiveSessionId(null);
                if (wsRef.current) {
                  wsRef.current.close();
                  wsRef.current = null;
                }
                if (terminalRef.current) {
                  if (terminalRef.current._resizeObserver) {
                    terminalRef.current._resizeObserver.disconnect();
                  }
                  terminalRef.current.dispose();
                  terminalRef.current = null;
                }
              }}
            >
              Agents
            </Button>
          </Box>
        </Box>
      </Drawer>
      
      <Box component="main" sx={{ flexGrow: 1, p: 3, display: 'flex', flexDirection: 'column' }}>
        <Toolbar />
        {showAgents ? (
          editingAgentId ? (
            <AgentEditor 
              agentId={editingAgentId} 
              onBack={() => {
                setEditingAgentId(null);
                fetchAgents();
              }} 
            />
          ) : (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5">Agents</Typography>
                <Button 
                  variant="outlined" 
                  onClick={() => setShowAgents(false)}
                >
                  Back to Sessions
                </Button>
              </Box>
              {agents.length === 0 ? (
                <Typography color="text.secondary">No agents found in ~/.kiro/agents</Typography>
              ) : (
                <List>
                  {agents.map((agent) => (
                    <Paper 
                      key={agent.id} 
                      sx={{ mb: 2, p: 2, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                      onClick={() => setEditingAgentId(agent.id)}
                    >
                      <Typography variant="h6">{agent.name}</Typography>
                      {agent.description && (
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                          {agent.description}
                        </Typography>
                      )}
                      {agent.model && (
                        <Typography variant="caption" display="block">
                          Model: {agent.model}
                        </Typography>
                      )}
                      {agent.mcpServers.length > 0 && (
                        <Typography variant="caption" display="block">
                          MCP Servers: {agent.mcpServers.join(', ')}
                        </Typography>
                      )}
                      {agent.resources.length > 0 && (
                        <Typography variant="caption" display="block">
                          Resources: {agent.resources.length} configured
                        </Typography>
                      )}
                    </Paper>
                  ))}
                </List>
              )}
            </Box>
          )
        ) : activeSessionId ? (
          <>
            <Paper sx={{ flexGrow: 1, mb: 2, overflow: 'hidden', p: 0 }}>
              <Box ref={terminalContainerRef} sx={{ width: '100%', height: '100%' }} />
            </Paper>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                fullWidth
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                multiline
                maxRows={4}
              />
              <Button variant="contained" onClick={sendMessage}>Send</Button>
            </Box>
          </>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Typography variant="h6" color="text.secondary">
              Select or create a session to start
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
    
    <Dialog open={renameDialogOpen} onClose={closeRenameDialog}>
      <DialogTitle>Rename Session</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label="Session Name"
          fullWidth
          value={newSessionName}
          onChange={(e) => setNewSessionName(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && renameSession()}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={closeRenameDialog}>Cancel</Button>
        <Button onClick={renameSession} variant="contained">Rename</Button>
      </DialogActions>
    </Dialog>

    <Dialog open={infoDialogOpen} onClose={() => setInfoDialogOpen(false)}>
      <DialogTitle>Keyboard Shortcuts</DialogTitle>
      <DialogContent>
        <Typography variant="body1" gutterBottom>
          Navigate between sessions:
        </Typography>
        <Typography variant="body2" sx={{ ml: 2, mb: 1 }}>
          • <strong>Cmd+Shift+↑</strong> (Mac) or <strong>Ctrl+Shift+↑</strong> - Previous session
        </Typography>
        <Typography variant="body2" sx={{ ml: 2, mb: 2 }}>
          • <strong>Cmd+Shift+↓</strong> (Mac) or <strong>Ctrl+Shift+↓</strong> - Next session
        </Typography>
        <Typography variant="body1" gutterBottom>
          Theme:
        </Typography>
        <Typography variant="body2" sx={{ ml: 2 }}>
          • Click the sun/moon icon to toggle dark/light mode
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setInfoDialogOpen(false)} variant="contained">Close</Button>
      </DialogActions>
    </Dialog>
    </ThemeProvider>
  );
}

export default App;
