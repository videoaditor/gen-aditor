const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const CHARACTERS_FILE = path.join(__dirname, '../characters.json');

// Load characters
function loadCharacters() {
  try {
    const data = fs.readFileSync(CHARACTERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

// Save characters
function saveCharacters(characters) {
  fs.writeFileSync(CHARACTERS_FILE, JSON.stringify(characters, null, 2));
}

// Get all characters
router.get('/', (req, res) => {
  const characters = loadCharacters();
  res.json({ characters });
});

// Get character by ID
router.get('/:id', (req, res) => {
  const characters = loadCharacters();
  const character = characters.find(c => c.id === req.params.id);
  
  if (!character) {
    return res.status(404).json({ error: 'Character not found' });
  }
  
  res.json(character);
});

// Create new character
router.post('/', (req, res) => {
  const { name, voiceId, avatarUrl } = req.body;
  
  if (!name || !voiceId || !avatarUrl) {
    return res.status(400).json({ error: 'name, voiceId, and avatarUrl required' });
  }
  
  const characters = loadCharacters();
  
  const newCharacter = {
    id: uuidv4(),
    name,
    voiceId,
    avatarUrl,
    createdAt: new Date().toISOString()
  };
  
  characters.push(newCharacter);
  saveCharacters(characters);
  
  res.json(newCharacter);
});

// Update character
router.put('/:id', (req, res) => {
  const characters = loadCharacters();
  const index = characters.findIndex(c => c.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Character not found' });
  }
  
  const { name, voiceId, avatarUrl } = req.body;
  
  if (name) characters[index].name = name;
  if (voiceId) characters[index].voiceId = voiceId;
  if (avatarUrl) characters[index].avatarUrl = avatarUrl;
  
  saveCharacters(characters);
  res.json(characters[index]);
});

// Delete character
router.delete('/:id', (req, res) => {
  const characters = loadCharacters();
  const filtered = characters.filter(c => c.id !== req.params.id);
  
  if (filtered.length === characters.length) {
    return res.status(404).json({ error: 'Character not found' });
  }
  
  saveCharacters(filtered);
  res.json({ success: true });
});

module.exports = router;
