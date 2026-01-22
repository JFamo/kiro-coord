import React, { useState, useEffect, useRef } from 'react';
import { Box, Drawer, List, ListItem, ListItemButton, ListItemText, IconButton, TextField, Paper, Typography, AppBar, Toolbar, Button } from '@mui/material';
import { Add as AddIcon, Close as CloseIcon, LightMode as LightModeIcon, DarkMode as DarkModeIcon } from '@mui/icons-material';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const DRAWER_WIDTH = 240;
const API_URL = 'http://localhost:8000';
const WS_URL = 'ws://localhost:8000';

const darkTheme = {
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  cursor: '#d4d4d4',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#e5e5e5'
};

const lightTheme = {
  background: '#ffffff',
  foreground: '#000000',
  cursor: '#000000',
  black: '#000000',
  red: '#cd3131',
  green: '#00bc00',
  yellow: '#949800',
  blue: '#0451a5',
  magenta: '#bc05bc',
  cyan: '#0598bc',
  white: '#555555',
  brightBlack: '#666666',
  brightRed: '#cd3131',
  brightGreen: '#14ce14',
  brightYellow: '#b5ba00',
  brightBlue: '#0451a5',
  brightMagenta: '#bc05bc',
  brightCyan: '#0598bc',
  brightWhite: '#a5a5a5'
};

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
    
    // Wait for next tick to ensure DOM is ready
    setTimeout(() => {
      if (!terminalContainerRef.current) return;
      
      // Create new terminal
      const terminal = new Terminal({
        cursorBlink: true,
        theme: theme === 'dark' ? darkTheme : lightTheme,
        fontSize: 14,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        scrollback: 10000
      });
      
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(terminalContainerRef.current);
      fitAddon.fit();
      
      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;
      
      // Handle window resize
      const resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
      });
      resizeObserver.observe(terminalContainerRef.current);
      
      const ws = new WebSocket(`${WS_URL}/ws/${sessionId}`);
      ws.onopen = () => {
        console.log('WebSocket connected');
      };
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'output') {
          terminal.write(data.content);
        } else if (data.type === 'error') {
          terminal.write('\r\n[ERROR] ' + data.content + '\r\n');
        }
      };
      ws.onclose = () => {
        console.log('WebSocket closed');
        terminal.write('\r\n[Connection closed]\r\n');
      };
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
      wsRef.current = ws;
    }, 0);
  };

  const sendMessage = () => {
    console.log('sendMessage called', { input, wsState: wsRef.current?.readyState });
    if (!input.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.log('Message not sent - validation failed');
      return;
    }
    
    console.log('Sending message:', input);
    if (terminalRef.current) {
      terminalRef.current.write('\r\n> ' + input + '\r\n');
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
