#!/usr/bin/env node
/**
 * Simple local server to accept POSTed game recordings and save them into assets/game_recordings
 * Usage: node tools/save_recording_server.js [port]
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.argv[2], 10) || 8765;

function safeFilenameFromPayload(obj) {
  const meta = obj.metadata || obj.recording && obj.recording.metadata || {};
  const timestamp = meta.timestamp || new Date().toISOString();
  const safeTs = timestamp.replace(/[:.]/g, '-').replace(/T/, '_').split('Z')[0];
  const gid = (meta.gameId || obj.gameId || '').toString().slice(-12).replace(/[^a-z0-9_-]/gi, '') || Math.random().toString(36).substr(2,6);
  return `game_${safeTs}_${gid}.json`;
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  if (req.method !== 'POST' || req.url !== '/save-recording') {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }

  let body = '';
  req.setEncoding('utf8');
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const parsed = JSON.parse(body);
      const destDir = path.resolve(process.cwd(), 'assets', 'game_recordings');
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      const filename = safeFilenameFromPayload(parsed);
      const dest = path.join(destDir, filename);
      fs.writeFileSync(dest, JSON.stringify(parsed, null, 2), 'utf8');
      console.log('Saved recording to', dest);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true, path: dest }));
    } catch (err) {
      console.error('Failed to save recording:', err && err.message);
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: false, error: err && err.message }));
    }
  });
  req.on('error', (err) => {
    console.error('Request error', err);
    res.writeHead(500);
    res.end('Server error');
  });
});

server.listen(PORT, () => {
  console.log(`Save Recording Server listening on http://localhost:${PORT}/save-recording`);
  console.log('CORS enabled for local use. POST JSON to the endpoint to save recordings into assets/game_recordings/.');
});
