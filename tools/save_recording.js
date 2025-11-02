#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const USAGE = `Usage:
  node tools/save_recording.js <source.json>
  cat recording.json | node tools/save_recording.js -

This copies the given recording JSON into assets/game_recordings with a safe filename.
If stdin is used ("-"), the script reads JSON from stdin.`;

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error(USAGE);
    process.exit(2);
  }

  let inputJson = null;

  if (args[0] === '-') {
    // read stdin
    inputJson = await new Promise((resolve, reject) => {
      let data = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', chunk => data += chunk);
      process.stdin.on('end', () => resolve(data));
      process.stdin.on('error', reject);
    });
  } else {
    const src = path.resolve(process.cwd(), args[0]);
    if (!fs.existsSync(src)) {
      console.error('Source file not found:', src);
      process.exit(3);
    }
    inputJson = fs.readFileSync(src, 'utf8');
  }

  if (!inputJson || inputJson.trim().length === 0) {
    console.error('No input JSON');
    process.exit(4);
  }

  let parsed = null;
  try {
    parsed = JSON.parse(inputJson);
  } catch (err) {
    console.error('Input is not valid JSON:', err.message);
    process.exit(5);
  }

  // Determine filename: try to use metadata.timestamp and gameId if available
  const meta = parsed.metadata || parsed.recording?.metadata || {};
  const timestampRaw = meta.timestamp || parsed.timestamp || new Date().toISOString();
  const safeTs = timestampRaw.replace(/[:.]/g, '-').replace(/T/, '_').split('Z')[0];
  const gid = (meta.gameId || parsed.gameId || '').toString().slice(-12).replace(/[^a-z0-9_-]/gi, '') || Math.random().toString(36).substr(2,6);

  const filename = `game_${safeTs}_${gid}.json`;
  const destDir = path.resolve(process.cwd(), 'assets', 'game_recordings');
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, filename);

  fs.writeFileSync(dest, JSON.stringify(parsed, null, 2), 'utf8');
  console.log('Saved recording to', dest);
}

main().catch(err => {
  console.error('Error saving recording:', err);
  process.exit(1);
});
