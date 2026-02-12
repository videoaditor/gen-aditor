# 🎮 Player HQ — Game Design v2

## Vision
**"One island that grows with your business. Farmville meets operations."**

ONE connected island. More projects = bigger island. Farmville mechanics trick you into doing profitable things. Neglect = visible decay. Action = visible growth.

## The Island
The island is a single landmass that GROWS as projects accumulate:
- 0-2 projects: Tiny island, just a hut + garden plot
- 3-5 projects: Medium island, house + farm + workshop
- 6-10 projects: Large island, village with buildings
- 10+: Massive island, castle tier

Each zone of the island maps to a business function.

## Zones (Sections of the Island)

### 🌾 The Farm (Client Campaigns)
**Farmville Core Loop:**
- Each client = a crop plot
- Plant new campaign = seed a crop
- Crops need watering (check-ins, deliverables)
- Neglect a crop too long → it wilts → visual warning → dies
- Harvest = collect revenue / hit milestones

**Time Pressure Mechanics:**
- Crops have growth timers (match real campaign schedules)
- Watering resets decay timer
- "Crop about to die!" = urgent client alert
- Each harvest → coins + XP → unlock decorations

### ⚔️ The Barracks (Ad Testing)
**War Campaign Mechanic:**
- Supplies = ad creatives ready to test
- When testing is active: soldiers march, banners fly
- When testing stale (no new ads in 48h+): fires start spreading
- Fire spreads from barracks to nearby zones if ignored
- Feed new ads → troops cheer, fire extinguished, victory banner
- **Critical:** Fire can damage crops (client health drops if ads aren't being tested)

### 💰 The Treasury (Revenue)
- MRR visualized as gold pile that physically grows
- Coins rain in when new subscription hits
- Treasure chest unlocks at milestones ($1k, $5k, $10k, $50k)
- Each chest = cosmetic reward (new building skin, decoration, hat for character)

### 🏠 The Hub (Task Management)
- Player character lives here
- Task board on the wall
- Completing tasks = hammering/building animation
- Building upgrades as tasks complete (hut → house → mansion → castle)

### 📮 The Dock (Deliverables)
- Ships come in with client requests
- Ships leave with deliverables
- Ships stuck in dock too long = "package overdue!" alert
- Sending deliverable = ship sails away with confetti

## Farmville Brain Hacks → Business Actions

| Game Mechanic | Business Action | Urgency Trigger |
|---|---|---|
| Crop wilting 🥀 | Client needs check-in | Health timer counting down |
| Fire spreading 🔥 | Ad testing overdue | Hours since last creative |
| Ship stuck in dock ⚓ | Deliverable overdue | Days past due date |
| Daily harvest 🌾 | Review metrics | Login streak bonus |
| Expansion unlocked 🏗️ | New project started | Milestone reached |
| Treasure chest 💰 | Revenue milestone | MRR threshold hit |
| Crop ready to harvest ✨ | Campaign results ready | Review period ended |
| Plant new seed 🌱 | Start new campaign | Client onboarded |

## Progression & Rewards

### Island Size Tiers
1. **Dirt Patch** (0-2 projects): Tiny hut, one crop plot, dock
2. **Homestead** (3-5): House, small farm, barracks tent, treasury box
3. **Village** (6-10): Multiple buildings, windmill, stone walls, market
4. **Kingdom** (10+): Castle, golden treasury, parade grounds, lighthouse

### Daily Login Streak
- Day 1-7: Bonus coins (cosmetic)
- Day 7: Special crop (golden variant)
- Day 30: New building unlock
- Day 100: Crown for character

### Achievement Trophies (placed on island)
- "First Harvest" — complete first campaign
- "Fire Fighter" — test 10 ad batches
- "Treasure Hunter" — hit $5k MRR
- "Dock Master" — deliver on time 10x in a row

## Alert System (Cute but Urgent)
- **Speech bubbles** pop up from zones needing attention
- **Sound effects** (optional) for critical alerts
- **Glow/shake** on neglected zones
- **Priority color:** Green (good) → Yellow (attention) → Orange (urgent) → Red (critical)
- Clicking alert zooms camera to that zone + shows action needed

## Data Sources
- **Projects/Tasks:** Trello boards → island size + task board
- **Client Health:** Manual or Slack activity → crop health
- **Ad Testing:** Manual feed or Meta API → barracks status  
- **Revenue:** Stripe API → treasury size
- **Deliverables:** Trello due dates → dock ships

## Character
Chibi robot-human hybrid (from moodboard):
- Walks between zones when working
- Animation states: idle (bounce), working (hammering), sleeping (zzz), celebrating (confetti)
- Shiba helpers follow when tasks are active
