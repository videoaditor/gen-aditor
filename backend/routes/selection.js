/**
 * Selection Management Routes
 * Store selected images for video conversion
 */

const express = require('express');
const router = express.Router();

// In-memory selection store (could move to Redis later)
let selections = [];

/**
 * Add image to selection
 * POST /api/selection/add
 * Body: { imageUrl, workflow, prompt }
 */
router.post('/add', async (req, res) => {
  try {
    const { imageUrl, workflow, prompt } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: 'imageUrl required' });
    }

    // Check if already selected
    const exists = selections.find(s => s.imageUrl === imageUrl);
    if (exists) {
      return res.json({ message: 'Already selected', selections });
    }

    // Add to selections
    const selection = {
      id: Date.now().toString(),
      imageUrl,
      workflow: workflow || 'unknown',
      prompt: prompt || '',
      timestamp: new Date().toISOString()
    };

    selections.push(selection);

    console.log(`✅ Added to selection: ${workflow} (${selections.length} total)`);

    res.json({
      message: 'Added to selection',
      selection,
      total: selections.length,
      selections
    });

  } catch (error) {
    console.error('❌ Selection add failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Remove image from selection
 * DELETE /api/selection/remove/:id
 */
router.delete('/remove/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const before = selections.length;
    selections = selections.filter(s => s.id !== id);
    const removed = before - selections.length;

    if (removed === 0) {
      return res.status(404).json({ error: 'Selection not found' });
    }

    console.log(`🗑️ Removed from selection (${selections.length} remaining)`);

    res.json({
      message: 'Removed from selection',
      total: selections.length,
      selections
    });

  } catch (error) {
    console.error('❌ Selection remove failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Clear all selections
 * DELETE /api/selection/clear
 */
router.delete('/clear', async (req, res) => {
  try {
    const count = selections.length;
    selections = [];

    console.log(`🗑️ Cleared ${count} selections`);

    res.json({
      message: `Cleared ${count} selections`,
      selections: []
    });

  } catch (error) {
    console.error('❌ Selection clear failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * List all selections
 * GET /api/selection/list
 */
router.get('/list', async (req, res) => {
  try {
    res.json({
      total: selections.length,
      selections
    });
  } catch (error) {
    console.error('❌ Selection list failed:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
