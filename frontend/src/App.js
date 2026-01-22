import React, { useState, useEffect, useRef } from 'react';
import { Box, Drawer, List, ListItem, ListItemButton, ListItemText, IconButton, TextField, Paper, Typography, AppBar, Toolbar, Button } from '@mui/material';
import { Add as AddIcon, Close as CloseIcon } from '@mui/icons-material';

const DRAWER_WIDTH = 240;
const API_URL = 'http://localhost:8000';
const WS_URL = 'ws://localhost:8000';

function App() {
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const wsRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchSessions = async () => {
    const res = await fetch(`${API_URL}/sessions`);
    const data = await res.json();
    setSessions(data);
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
    setActiveSessionId(session.id);
  };

  const deleteSession = async (sessionId) => {
    await fetch(`${API_URL}/sessions/${sessionId}`, { method: 'DELETE' });
    setSessions(sessions.filter(s => s.id !== sessionId));
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
      setMessages([]);
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
    setMessages([]);
    
    const ws = new WebSocket(`${WS_URL}/ws/${sessionId}`);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'output') {
        setMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
      }
    };
    wsRef.current = ws;
  };

  const sendMessage = () => {
    if (!input.trim() || !wsRef.current) return;
    
    setMessages(prev => [...prev, { role: 'user', content: input }]);
    wsRef.current.send(JSON.stringify({ type: 'input', content: input }));
    setInput('');
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h6" noWrap component="div">
            Kiro Coordinator
          </Typography>
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
            <Paper sx={{ flexGrow: 1, p: 2, mb: 2, overflow: 'auto' }}>
              {messages.map((msg, idx) => (
                <Box key={idx} sx={{ mb: 1, textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                  <Typography
                    component="span"
                    sx={{
                      display: 'inline-block',
                      p: 1,
                      borderRadius: 1,
                      bgcolor: msg.role === 'user' ? 'primary.main' : 'grey.200',
                      color: msg.role === 'user' ? 'white' : 'black'
                    }}
                  >
                    {msg.content}
                  </Typography>
                </Box>
              ))}
              <div ref={messagesEndRef} />
            </Paper>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                fullWidth
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Type a message..."
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
