#!/usr/bin/env node
/**
 * Sync HQ state from Trello
 * Updates client health based on board activity
 * Run periodically or on-demand
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const STATE_PATH = path.join(__dirname, '..', 'hq-state.json');
const TRELLO_KEY = process.env.TRELLO_API_KEY || process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;

// Client name -> Trello board name mapping (handles variations)
const CLIENT_BOARD_MAP = {
  'Bawldy': 'Bawldy',
  'Buchmann': 'Buchmann',
  'Clubwell': 'Clubwell',
  'Cuppings': 'Cuppings',
  'Dr Franks': 'Dr Franks',
  'EcomPro': 'EcomPro GmbH',
  'Get A Drip': 'Get A Drip',
  'Glow25': 'Glow25 / DailyRituals',
  'Gracen': 'Gracen App',
  'K&O': 'K&O Solutions Limited',
  'Levide': 'Levide',
  'Lift': 'Lift',
  'Lior': 'Lior',
  'LOTUS': 'LOTUS',
  'mammaly': 'mammaly (Peturo GmbH)',
  'Olivia': 'Olivia Morasch',
  'Proof Brother': 'Proof Brother',
  'Veda': 'Veda Naturals',
};

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function getTrelloBoards() {
  const url = `https://api.trello.com/1/members/me/boards?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}&fields=name,dateLastActivity,id`;
  return fetchJson(url);
}

function calculateHealth(lastActivity) {
  const now = new Date();
  const lastAct = new Date(lastActivity);
  const hoursSince = (now - lastAct) / (1000 * 60 * 60);
  
  // Health decreases over time: 100 at 0h, ~50 at 48h, ~20 at 96h
  return Math.max(20, Math.round(100 - (hoursSince / 12) * 10));
}

function getStage(health) {
  if (health >= 80) return 'flowering';
  if (health >= 60) return 'growing';
  if (health >= 40) return 'seedling';
  return 'wilting';
}

async function syncHQ() {
  if (!TRELLO_KEY || !TRELLO_TOKEN) {
    console.error('TRELLO_KEY and TRELLO_TOKEN required');
    process.exit(1);
  }

  console.log('Fetching Trello boards...');
  const boards = await getTrelloBoards();
  
  // Create lookup by board name
  const boardActivity = {};
  for (const board of boards) {
    boardActivity[board.name] = board.dateLastActivity;
  }

  // Read current state
  const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  
  // Update each client plant
  const plants = [];
  for (const [clientName, boardName] of Object.entries(CLIENT_BOARD_MAP)) {
    const lastActivity = boardActivity[boardName];
    if (lastActivity) {
      const health = calculateHealth(lastActivity);
      plants.push({
        client: clientName,
        health,
        stage: getStage(health),
        lastActivity
      });
    }
  }

  // Sort by health (unhealthiest first for visibility)
  plants.sort((a, b) => a.health - b.health);

  // Update state
  state.rooms.greenhouse.plants = plants;
  state.metrics.activeClients = plants.length;
  state.metrics.lastUpdated = new Date().toISOString();

  // Write back
  const tmp = STATE_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_PATH);

  console.log(`Updated ${plants.length} client plants`);
  
  // Show health summary
  const unhealthy = plants.filter(p => p.health < 60);
  if (unhealthy.length > 0) {
    console.log('\n⚠️ Clients needing attention:');
    unhealthy.forEach(p => {
      console.log(`  - ${p.client}: ${p.health}% (${p.stage})`);
    });
  } else {
    console.log('\n✅ All clients healthy!');
  }
}

syncHQ().catch(err => {
  console.error('Sync failed:', err.message);
  process.exit(1);
});
