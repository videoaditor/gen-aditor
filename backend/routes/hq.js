const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const STATE_PATH = path.join(__dirname, '..', 'hq-state.json');

// --- Helpers ---

function readState() {
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
}

function writeState(state) {
  const tmp = STATE_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_PATH);
}

// --- Stripe metrics cache ---

let metricsCache = null;
let metricsCacheTime = 0;
const METRICS_TTL = 5 * 60 * 1000;

async function fetchStripeMetrics() {
  const now = Date.now();
  if (metricsCache && now - metricsCacheTime < METRICS_TTL) return metricsCache;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return { mrr: 0, totalRevenue: 0, activeSubscriptions: 0, ltv: 0, error: 'STRIPE_SECRET_KEY not set' };
  }

  try {
    const stripe = require('stripe')(key);

    const [subs, balance] = await Promise.all([
      stripe.subscriptions.list({ status: 'active', limit: 100 }),
      stripe.balanceTransactions.list({ limit: 100, type: 'charge' }),
    ]);

    const mrr = subs.data.reduce((sum, s) => {
      const item = s.items.data[0];
      if (!item) return sum;
      const amount = item.price.unit_amount || 0;
      const interval = item.price.recurring?.interval;
      if (interval === 'year') return sum + Math.round(amount / 12);
      return sum + amount;
    }, 0) / 100;

    const totalRevenue = balance.data.reduce((sum, t) => sum + t.amount, 0) / 100;
    const activeSubscriptions = subs.data.length;
    const ltv = activeSubscriptions > 0 ? Math.round(totalRevenue / activeSubscriptions * 100) / 100 : 0;

    metricsCache = { mrr, totalRevenue, activeSubscriptions, ltv };
    metricsCacheTime = now;
    return metricsCache;
  } catch (err) {
    console.error('[HQ] Stripe error:', err.message);
    return { mrr: 0, totalRevenue: 0, activeSubscriptions: 0, ltv: 0, error: err.message };
  }
}

// --- Routes ---

// Full state
router.get('/state', (req, res) => {
  try {
    res.json(readState());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Task queue
router.get('/queue', (req, res) => {
  try {
    res.json(readState().taskQueue);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add task
router.post('/queue', (req, res) => {
  try {
    const { prompt, room, priority } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });

    const state = readState();
    const task = {
      id: uuidv4(),
      prompt,
      room: room || 'bedroom',
      priority: priority || 0,
      status: 'queued',
      createdAt: new Date().toISOString(),
    };
    state.taskQueue.push(task);
    state.taskQueue.sort((a, b) => b.priority - a.priority);
    writeState(state);
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update task
router.put('/queue/:id', (req, res) => {
  try {
    const state = readState();
    const task = state.taskQueue.find(t => t.id === req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const { prompt, room, priority } = req.body;
    if (prompt !== undefined) task.prompt = prompt;
    if (room !== undefined) task.room = room;
    if (priority !== undefined) task.priority = priority;
    task.updatedAt = new Date().toISOString();

    state.taskQueue.sort((a, b) => b.priority - a.priority);
    writeState(state);
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete task
router.delete('/queue/:id', (req, res) => {
  try {
    const state = readState();
    const idx = state.taskQueue.findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Task not found' });

    const [removed] = state.taskQueue.splice(idx, 1);
    writeState(state);
    res.json(removed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Force-start task
router.post('/queue/:id/start', (req, res) => {
  try {
    const state = readState();
    const task = state.taskQueue.find(t => t.id === req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    // Mark any currently active task as queued again
    state.taskQueue.forEach(t => { if (t.status === 'active') t.status = 'queued'; });

    task.status = 'active';
    task.startedAt = new Date().toISOString();
    state.player.currentTask = task.id;
    state.player.status = 'working';
    state.player.currentRoom = task.room || state.player.currentRoom;

    writeState(state);
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Next task (mark current done, advance)
router.post('/queue/next', (req, res) => {
  try {
    const state = readState();

    // Complete current active task
    const activeIdx = state.taskQueue.findIndex(t => t.status === 'active');
    if (activeIdx !== -1) {
      state.taskQueue[activeIdx].status = 'done';
      state.taskQueue[activeIdx].completedAt = new Date().toISOString();
      state.metrics.tasksCompletedToday = (state.metrics.tasksCompletedToday || 0) + 1;
    }

    // Remove done tasks
    state.taskQueue = state.taskQueue.filter(t => t.status !== 'done');

    // Start next queued task
    const next = state.taskQueue.find(t => t.status === 'queued');
    if (next) {
      next.status = 'active';
      next.startedAt = new Date().toISOString();
      state.player.currentTask = next.id;
      state.player.status = 'working';
      state.player.currentRoom = next.room || state.player.currentRoom;
    } else {
      state.player.currentTask = null;
      state.player.status = 'idle';
    }

    writeState(state);

    // Trigger OpenClaw wake to pick up next task
    if (next) {
      try {
        const axios = require('axios');
        axios.post('http://localhost:18789/api/cron/wake', {
          text: `[HQ] Task completed. Next task: "${next.prompt}" (room: ${next.room}). Pick it up and work on it. When done, call POST /api/hq/queue/next to advance to the next card.`,
          mode: 'now'
        }, {
          headers: { 'Authorization': `Bearer ${process.env.OPENCLAW_TOKEN || ''}` },
          timeout: 5000
        }).catch(() => {});
      } catch(_){}
    }

    res.json({ currentTask: next || null, tasksCompletedToday: state.metrics.tasksCompletedToday });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stripe metrics
router.get('/metrics', async (req, res) => {
  try {
    const metrics = await fetchStripeMetrics();
    res.json(metrics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upgrades list
router.get('/upgrades', (req, res) => {
  try {
    res.json(readState().upgrades);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Unlock upgrade (Q&A)
router.post('/upgrades/:id/unlock', (req, res) => {
  try {
    const { answer } = req.body;
    if (!answer) return res.status(400).json({ error: 'answer required' });

    const state = readState();
    const upgrade = state.upgrades.available.find(u => u.id === req.params.id);
    if (!upgrade) return res.status(404).json({ error: 'Upgrade not found' });
    if (upgrade.unlocked) return res.json({ message: 'Already unlocked', upgrade });

    // Simple check: answer must be non-empty (game master validates later or we accept any answer)
    upgrade.unlocked = true;
    upgrade.answer = answer;
    upgrade.unlockedAt = new Date().toISOString();

    // Move to completed
    state.upgrades.completed.push({ ...upgrade });
    state.upgrades.available = state.upgrades.available.filter(u => u.id !== req.params.id);

    // Level up the room
    const room = state.rooms[upgrade.room];
    if (room) room.level = (room.level || 1) + 1;

    writeState(state);
    res.json({ message: 'Upgrade unlocked!', upgrade });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Player status update
router.post('/player/status', (req, res) => {
  try {
    const { status, currentRoom, currentTask } = req.body;
    const state = readState();

    if (status) state.player.status = status;
    if (currentRoom) state.player.currentRoom = currentRoom;
    if (currentTask !== undefined) state.player.currentTask = currentTask;

    writeState(state);
    res.json(state.player);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Projects (Trello-backed islands) ---

async function fetchTrelloProjects() {
  const key = process.env.TRELLO_API_KEY;
  const token = process.env.TRELLO_TOKEN;
  if (!key || !token) return { projects: [], error: 'Trello not configured' };

  try {
    const axios = require('axios');
    // Get boards
    const boardsRes = await axios.get(`https://api.trello.com/1/members/me/boards?key=${key}&token=${token}&fields=name,id`);
    const projects = [];
    
    // For each board, get lists and cards to determine project status
    for (const board of boardsRes.data.slice(0, 10)) { // limit to 10 boards
      const listsRes = await axios.get(`https://api.trello.com/1/boards/${board.id}/lists?key=${key}&token=${token}&cards=all`);
      
      let totalCards = 0;
      let doneCards = 0;
      let hasBlocker = false;
      let blockerText = '';
      
      for (const list of listsRes.data) {
        const cardCount = list.cards?.length || 0;
        totalCards += cardCount;
        
        const listName = list.name.toLowerCase();
        if (listName.includes('done') || listName.includes('complete') || listName.includes('shipped')) {
          doneCards += cardCount;
        }
        if (listName.includes('block') || listName.includes('waiting')) {
          hasBlocker = cardCount > 0;
          if (hasBlocker && list.cards?.[0]) {
            blockerText = list.cards[0].name;
          }
        }
      }
      
      projects.push({
        id: board.id,
        name: board.name,
        totalTasks: totalCards,
        completedTasks: doneCards,
        progress: totalCards > 0 ? Math.round((doneCards / totalCards) * 100) : 0,
        hasBlocker,
        blockerText,
        status: doneCards === totalCards && totalCards > 0 ? 'complete' : hasBlocker ? 'blocked' : 'active'
      });
    }
    
    return { projects };
  } catch (err) {
    console.error('[HQ] Trello error:', err.message);
    return { projects: [], error: err.message };
  }
}

router.get('/projects', async (req, res) => {
  try {
    const data = await fetchTrelloProjects();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Ad Warzone Status ---

const ADS_STATE_PATH = path.join(__dirname, '..', 'ads-warzone-state.json');

function readAdsState() {
  try {
    return JSON.parse(fs.readFileSync(ADS_STATE_PATH, 'utf8'));
  } catch {
    return {
      lastAdReceived: null,
      lastTestStarted: null,
      adsInQueue: 0,
      testsRunning: 0,
      burnLevel: 0, // 0-100, increases over time without new ads
      alerts: []
    };
  }
}

function writeAdsState(state) {
  fs.writeFileSync(ADS_STATE_PATH, JSON.stringify(state, null, 2));
}

router.get('/ads', (req, res) => {
  try {
    const state = readAdsState();
    
    // Calculate burn level based on time since last ad
    const now = Date.now();
    const lastAd = state.lastAdReceived ? new Date(state.lastAdReceived).getTime() : now;
    const hoursSinceAd = (now - lastAd) / (1000 * 60 * 60);
    
    // Burn increases: 0 at 0h, 25 at 24h, 50 at 48h, 75 at 72h, 100 at 96h+
    state.burnLevel = Math.min(100, Math.floor(hoursSinceAd / 24 * 25));
    
    // Generate alerts based on burn level
    state.alerts = [];
    if (state.burnLevel >= 25) {
      state.alerts.push({ level: 'warning', message: 'Ad testing slowing down...' });
    }
    if (state.burnLevel >= 50) {
      state.alerts.push({ level: 'danger', message: '🔥 Warzone needs supplies!' });
    }
    if (state.burnLevel >= 75) {
      state.alerts.push({ level: 'critical', message: '🔥🔥 TESTING OVERDUE! Feed me ads!' });
    }
    
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Called when new ads are received
router.post('/ads/feed', (req, res) => {
  try {
    const { count } = req.body;
    const state = readAdsState();
    
    state.lastAdReceived = new Date().toISOString();
    state.adsInQueue = (state.adsInQueue || 0) + (count || 1);
    state.burnLevel = 0; // Reset burn
    state.alerts = [];
    
    writeAdsState(state);
    res.json({ message: '🎯 Ads received! Warzone resupplied.', state });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Global Alerts (fast, no external calls) ---

router.get('/alerts', (req, res) => {
  try {
    const alerts = [];
    
    // Check ad warzone
    const adsState = readAdsState();
    const now = Date.now();
    const lastAd = adsState.lastAdReceived ? new Date(adsState.lastAdReceived).getTime() : now;
    const hoursSinceAd = (now - lastAd) / (1000 * 60 * 60);
    
    if (hoursSinceAd > 48) {
      alerts.push({
        id: 'ads-overdue',
        type: 'warzone',
        level: hoursSinceAd > 72 ? 'critical' : 'warning',
        title: '🔥 Ad Testing Overdue',
        message: `No new ads in ${Math.floor(hoursSinceAd)}h!`,
        action: 'Feed ads to extinguish'
      });
    }
    
    // Check client health from local state (fast)
    const hqState = readState();
    for (const plant of hqState.rooms?.greenhouse?.plants || []) {
      if (plant.health < 40) {
        alerts.push({
          id: `client-${plant.client}`,
          type: 'client',
          level: plant.health < 20 ? 'critical' : 'warning',
          title: `🌱 ${plant.client} needs attention`,
          message: `Health at ${plant.health}%`,
          action: 'Check deliverables'
        });
      }
    }
    
    res.json({ alerts, count: alerts.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// --- Sync from Trello ---
const CLIENT_BOARD_MAP = {
  'Bawldy': 'Bawldy', 'Buchmann': 'Buchmann', 'Clubwell': 'Clubwell',
  'Cuppings': 'Cuppings', 'Dr Franks': 'Dr Franks', 'EcomPro': 'EcomPro GmbH',
  'Get A Drip': 'Get A Drip', 'Glow25': 'Glow25 / DailyRituals', 
  'Gracen': 'Gracen App', 'K&O': 'K&O Solutions Limited', 'Levide': 'Levide',
  'Lift': 'Lift', 'Lior': 'Lior', 'LOTUS': 'LOTUS',
  'mammaly': 'mammaly (Peturo GmbH)', 'Olivia': 'Olivia Morasch',
  'Proof Brother': 'Proof Brother', 'Veda': 'Veda Naturals',
};

router.post('/sync', async (req, res) => {
  try {
    const key = process.env.TRELLO_API_KEY || process.env.TRELLO_KEY;
    const token = process.env.TRELLO_TOKEN;
    if (!key || !token) return res.status(500).json({ error: 'Trello not configured' });

    const axios = require('axios');
    const boardsRes = await axios.get(
      `https://api.trello.com/1/members/me/boards?key=${key}&token=${token}&fields=name,dateLastActivity`
    );

    const boardActivity = {};
    for (const b of boardsRes.data) boardActivity[b.name] = b.dateLastActivity;

    const state = readState();
    const plants = [];
    const now = Date.now();

    for (const [client, boardName] of Object.entries(CLIENT_BOARD_MAP)) {
      const lastAct = boardActivity[boardName];
      if (lastAct) {
        const hoursSince = (now - new Date(lastAct).getTime()) / (1000*60*60);
        const health = Math.max(20, Math.round(100 - (hoursSince/12)*10));
        const stage = health >= 80 ? 'flowering' : health >= 60 ? 'growing' : health >= 40 ? 'seedling' : 'wilting';
        plants.push({ client, health, stage, lastActivity: lastAct });
      }
    }

    plants.sort((a,b) => a.health - b.health);
    state.rooms.greenhouse.plants = plants;
    state.metrics.activeClients = plants.length;
    state.metrics.lastUpdated = new Date().toISOString();
    writeState(state);

    const unhealthy = plants.filter(p => p.health < 60);
    res.json({ synced: plants.length, unhealthy: unhealthy.length, plants: unhealthy });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// --- Backend Health Check ---
router.get('/backends', async (req, res) => {
  const backends = {
    gen: { url: 'http://localhost:3001/health', status: false },
    mixer: { url: 'http://localhost:3003/health', status: false },
    hooks: { url: 'http://localhost:3010/health', status: false },
  };

  const axios = require('axios');
  await Promise.all(Object.entries(backends).map(async ([name, cfg]) => {
    try {
      const r = await axios.get(cfg.url, { timeout: 3000 });
      backends[name].status = r.data?.status === 'ok' || r.status === 200;
    } catch { backends[name].status = false; }
  }));

  res.json(backends);
});

module.exports = router;
