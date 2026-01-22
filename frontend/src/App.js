import React, { useState, useEffect, useRef } from 'react';
import { Box, Drawer, List, ListItem, ListItemButton, ListItemText, IconButton, TextField, Paper, Typography, AppBar, Toolbar, Button } from '@mui/material';
import { Add as AddIcon, Close as CloseIcon, LightMode as LightModeIcon, DarkMode as DarkModeIcon } from '@mui/icons-material';
import '@xterm/xterm/css/xterm.css';
import { DRAWER_WIDTH, API_URL, WS_URL, darkTheme, lightTheme } from './config';
import { createTerminal, setupResizeHandler, normalizeLineEndings } from './terminalUtils';

function App() {
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [input, setInput] = useState('');
  const [theme, setTheme] = useState('dark');
  const wsRef = useRef(null);
  const terminalRef = useRef(null);
  const terminalContainerRef = useRef(null);
  const fitAddonRef = useRef(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = theme === 'dark' ? darkTheme : lightTheme;
    }
  }, [theme]);

  const fetchSessions = async () => {
    const res = await fetch(`${API_URL}/sessions`);
    const data = await res.json();
    setSessions(data);
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
    const name = `Session ${sessions.length + 1}`;
    const res = await fetch(`${API_URL}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
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
        theme === 'dark' ? darkTheme : lightTheme,
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
    
    wsRef.current.send(JSON.stringify({ type: 'input', content: input }));
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            Kiro Coordinator
          </Typography>
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
                  <IconButton edge="end" onClick={() => deleteSession(session.id)}>
                    <CloseIcon />
                  </IconButton>
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
            <Button fullWidth variant="contained" startIcon={<AddIcon />} onClick={createSession}>
              New Session
            </Button>
          </Box>
        </Box>
      </Drawer>
      
      <Box component="main" sx={{ flexGrow: 1, p: 3, display: 'flex', flexDirection: 'column' }}>
        <Toolbar />
        {activeSessionId ? (
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
  );
}

export default App;
