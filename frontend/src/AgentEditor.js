import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, TextField, Paper, Chip, Autocomplete, Divider, IconButton } from '@mui/material';
import { Delete as DeleteIcon, Add as AddIcon } from '@mui/icons-material';

const API_URL = 'http://localhost:8000';

function AgentEditor({ agentId, onBack }) {
  const [agent, setAgent] = useState(null);
  const [availableTools, setAvailableTools] = useState([]);
  const [selectedTools, setSelectedTools] = useState([]);
  const [files, setFiles] = useState([]);
  const [skills, setSkills] = useState([]);
  const [knowledgeBases, setKnowledgeBases] = useState([]);

  useEffect(() => {
    fetchAgent();
    fetchAvailableTools();
  }, [agentId]);

  const fetchAgent = async () => {
    const res = await fetch(`${API_URL}/agents/${agentId}`);
    const data = await res.json();
    setAgent(data);
    setSelectedTools(data.tools || []);
    
    // Parse resources
    const resources = data.resources || [];
    setFiles(resources.filter(r => typeof r === 'string' && r.startsWith('file://')));
    setSkills(resources.filter(r => typeof r === 'string' && r.startsWith('skill://')));
    setKnowledgeBases(resources.filter(r => typeof r === 'object' && r.type === 'knowledgeBase'));
  };

  const fetchAvailableTools = async () => {
    const res = await fetch(`${API_URL}/available-tools`);
    const data = await res.json();
    setAvailableTools(data);
  };

  const addFile = () => {
    const path = prompt('Enter file path (e.g., file://README.md or file://docs/**/*.md):');
    if (path) setFiles([...files, path]);
  };

  const addSkill = () => {
    const path = prompt('Enter skill path (e.g., skill://.kiro/skills/**/SKILL.md):');
    if (path) setSkills([...skills, path]);
  };

  const addKnowledgeBase = () => {
    const source = prompt('Enter knowledge base source path (e.g., file://./docs):');
    const name = prompt('Enter knowledge base name:');
    const description = prompt('Enter description (optional):');
    if (source && name) {
      setKnowledgeBases([...knowledgeBases, {
        type: 'knowledgeBase',
        source,
        name,
        description: description || '',
        indexType: 'best',
        autoUpdate: false
      }]);
    }
  };

  const saveAgent = async () => {
    const resources = [...files, ...skills, ...knowledgeBases];
    const updatedAgent = {
      ...agent,
      tools: selectedTools,
      resources
    };
    
    await fetch(`${API_URL}/agents/${agentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedAgent)
    });
    
    alert('Agent saved successfully!');
    onBack();
  };

  if (!agent) return <Typography>Loading...</Typography>;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">Edit Agent: {agent.name}</Typography>
        <Box>
          <Button variant="outlined" onClick={onBack} sx={{ mr: 1 }}>Cancel</Button>
          <Button variant="contained" onClick={saveAgent}>Save</Button>
        </Box>
      </Box>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>Tools</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Select which tools this agent can use
        </Typography>
        <Autocomplete
          multiple
          options={availableTools}
          value={selectedTools}
          onChange={(e, newValue) => setSelectedTools(newValue)}
          renderInput={(params) => <TextField {...params} label="Select tools" />}
          renderTags={(value, getTagProps) =>
            value.map((option, index) => (
              <Chip label={option} {...getTagProps({ index })} />
            ))
          }
        />
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>Files</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Files loaded directly into context at startup. Use for content the agent always needs.
        </Typography>
        {files.map((file, idx) => (
          <Box key={idx} sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <Typography sx={{ flexGrow: 1 }}>{file}</Typography>
            <IconButton size="small" onClick={() => setFiles(files.filter((_, i) => i !== idx))}>
              <DeleteIcon />
            </IconButton>
          </Box>
        ))}
        <Button startIcon={<AddIcon />} onClick={addFile}>Add File</Button>
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>Skills</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Skills are progressively loaded - metadata at startup, full content on demand.
        </Typography>
        {skills.map((skill, idx) => (
          <Box key={idx} sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <Typography sx={{ flexGrow: 1 }}>{skill}</Typography>
            <IconButton size="small" onClick={() => setSkills(skills.filter((_, i) => i !== idx))}>
              <DeleteIcon />
            </IconButton>
          </Box>
        ))}
        <Button startIcon={<AddIcon />} onClick={addSkill}>Add Skill</Button>
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>Knowledge Bases</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Indexed documentation that agents can search. Supports millions of tokens.
        </Typography>
        {knowledgeBases.map((kb, idx) => (
          <Box key={idx} sx={{ mb: 2, p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <Box>
                <Typography variant="subtitle2">{kb.name}</Typography>
                <Typography variant="caption" display="block">Source: {kb.source}</Typography>
                {kb.description && <Typography variant="caption" display="block">Description: {kb.description}</Typography>}
              </Box>
              <IconButton size="small" onClick={() => setKnowledgeBases(knowledgeBases.filter((_, i) => i !== idx))}>
                <DeleteIcon />
              </IconButton>
            </Box>
          </Box>
        ))}
        <Button startIcon={<AddIcon />} onClick={addKnowledgeBase}>Add Knowledge Base</Button>
      </Paper>
    </Box>
  );
}

export default AgentEditor;
