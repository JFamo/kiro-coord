import React, { useState, useEffect, useRef } from 'react';
import { Box, Drawer, List, ListItem, ListItemButton, ListItemText, IconButton, TextField, Paper, Typography, AppBar, Toolbar, Button } from '@mui/material';
import { Add as AddIcon, Close as CloseIcon, LightMode as LightModeIcon, DarkMode as DarkModeIcon } from '@mui/icons-material';
import AnsiToHtml from 'ansi-to-html';

const DRAWER_WIDTH = 240;
const API_URL = 'http://localhost:8000';
const WS_URL = 'ws://localhost:8000';

const ansiConverter = new AnsiToHtml({ fg: '#d4d4d4', bg: '#1e1e1e' });

function App() {
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [output, setOutput] = useState('');
  const [input, setInput] = useState('');
  const [theme, setTheme] = useState('dark');
  const wsRef = useRef(null);
  const outputEndRef = useRef(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [output]);

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
      setOutput('');
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    }
  };

  const connectToSession = (sessionId) => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    setActiveSessionId(sessionId);
    setOutput('');
    
    const ws = new WebSocket(`${WS_URL}/ws/${sessionId}`);
    ws.onopen = () => {
      console.log('WebSocket connected');
    };
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'output') {
        setOutput(prev => prev + data.content);
      } else if (data.type === 'error') {
        setOutput(prev => prev + '\n[ERROR] ' + data.content + '\n');
      }
    };
    ws.onclose = () => {
      console.log('WebSocket closed');
      setOutput(prev => prev + '\n[Connection closed]\n');
    };
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    wsRef.current = ws;
  };

  const sendMessage = () => {
    console.log('sendMessage called', { input, wsState: wsRef.current?.readyState });
    if (!input.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.log('Message not sent - validation failed');
      return;
    }
    
    console.log('Sending message:', input);
    setOutput(prev => prev + '\n> ' + input + '\n');
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
            <Paper sx={{ flexGrow: 1, p: 2, mb: 2, overflow: 'auto', bgcolor: '#1e1e1e' }}>
              <Box
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '14px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}
                dangerouslySetInnerHTML={{ __html: ansiConverter.toHtml(output) }}
              />
              <div ref={outputEndRef} />
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
