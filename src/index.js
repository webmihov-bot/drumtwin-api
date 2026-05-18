'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'drumtwin-dev-token';
const DATA_FILE = path.join(__dirname, 'data', 'projects.json');

// ── helpers ──────────────────────────────────────────────────────────────────

function readProjects() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeProjects(projects) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(projects, null, 2), 'utf8');
}

function requireAuth(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ── middleware ────────────────────────────────────────────────────────────────

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── public routes ─────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'drumtwin-api', version: '0.2.0' });
});

app.get('/api/projects', (req, res) => {
  res.json(readProjects());
});

// ── admin routes (token-gated) ────────────────────────────────────────────────

app.post('/api/admin/projects', requireAuth, (req, res) => {
  const { name, description, status, tags } = req.body;
  if (!name || !description) {
    return res.status(400).json({ error: 'name and description are required' });
  }
  const projects = readProjects();
  const project = {
    id: crypto.randomUUID(),
    name,
    description,
    status: status || 'coming_soon',
    tags: Array.isArray(tags) ? tags : (tags ? tags.split(',').map(t => t.trim()) : []),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  projects.push(project);
  writeProjects(projects);
  res.status(201).json(project);
});

app.put('/api/admin/projects/:id', requireAuth, (req, res) => {
  const projects = readProjects();
  const idx = projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const { name, description, status, tags } = req.body;
  const updated = {
    ...projects[idx],
    ...(name !== undefined && { name }),
    ...(description !== undefined && { description }),
    ...(status !== undefined && { status }),
    ...(tags !== undefined && {
      tags: Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim()),
    }),
    updatedAt: new Date().toISOString(),
  };
  projects[idx] = updated;
  writeProjects(projects);
  res.json(updated);
});

app.delete('/api/admin/projects/:id', requireAuth, (req, res) => {
  const projects = readProjects();
  const idx = projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  projects.splice(idx, 1);
  writeProjects(projects);
  res.status(204).end();
});

// ── start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(JSON.stringify({ level: 'info', msg: `DrumTwin listening on :${PORT}`, port: PORT }));
});
