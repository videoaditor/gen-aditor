#!/usr/bin/env node
/**
 * ElevenLabs Voice Cleanup Script
 * Removes cloned voices that haven't been used in 6 months or only used once
 */

const axios = require('axios');

const API_KEY = process.env.ELEVENLABS_API_KEY || 'sk_ef134e49e4f671ffc2e98dd4c58d11dc1f55c354e6959129';
const BASE_URL = 'https://api.elevenlabs.io/v1';
const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000; // ~6 months in ms
const SIX_MONTHS_AGO = Date.now() - SIX_MONTHS_MS;

const headers = {
  'xi-api-key': API_KEY,
  'Content-Type': 'application/json'
};

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

async function getAllHistory() {
  console.log('📊 Fetching usage history...');
  let allHistory = [];
  let nextCursor = null;
  let page = 0;
  
  do {
    const url = nextCursor 
      ? `${BASE_URL}/history?page_size=100&start_after_history_item_id=${nextCursor}`
      : `${BASE_URL}/history?page_size=100`;
    
    const res = await axios.get(url, { headers });
    allHistory = allHistory.concat(res.data.history || []);
    
    // Get last item ID for pagination
    const history = res.data.history || [];
    nextCursor = history.length === 100 ? history[history.length - 1].history_item_id : null;
    page++;
    
    if (VERBOSE) console.log(`  Page ${page}: ${history.length} items`);
    
    // Safety limit
    if (page > 100) break;
    
  } while (nextCursor);
  
  console.log(`  Total history items: ${allHistory.length}`);
  return allHistory;
}

async function getClonedVoices() {
  console.log('🎤 Fetching cloned voices...');
  const res = await axios.get(`${BASE_URL}/voices`, { headers });
  
  const cloned = res.data.voices.filter(v => 
    v.category === 'cloned' || 
    v.category === 'professional' || 
    v.category === 'generated'
  );
  
  console.log(`  Total cloned voices: ${cloned.length}`);
  return cloned;
}

async function deleteVoice(voiceId, voiceName) {
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would delete: ${voiceName} (${voiceId})`);
    return true;
  }
  
  try {
    await axios.delete(`${BASE_URL}/voices/${voiceId}`, { headers });
    console.log(`  ✅ Deleted: ${voiceName} (${voiceId})`);
    return true;
  } catch (err) {
    console.error(`  ❌ Failed to delete ${voiceName}: ${err.response?.data?.detail || err.message}`);
    return false;
  }
}

async function main() {
  console.log('🧹 ElevenLabs Voice Cleanup');
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (no deletions)' : 'LIVE (will delete voices)'}`);
  console.log(`   Cutoff: ${new Date(SIX_MONTHS_AGO).toISOString().split('T')[0]} (6 months ago)`);
  console.log('');

  // Get usage history
  const history = await getAllHistory();
  
  // Build usage map: voice_id -> { count, lastUsed }
  const usageMap = {};
  for (const item of history) {
    if (!item.voice_id) continue;
    
    if (!usageMap[item.voice_id]) {
      usageMap[item.voice_id] = { count: 0, lastUsed: 0, name: item.voice_name };
    }
    usageMap[item.voice_id].count++;
    usageMap[item.voice_id].lastUsed = Math.max(
      usageMap[item.voice_id].lastUsed, 
      item.date_unix * 1000
    );
  }
  
  // Get cloned voices
  const clonedVoices = await getClonedVoices();
  
  // Find voices to delete
  const toDelete = [];
  const toKeep = [];
  
  for (const voice of clonedVoices) {
    const usage = usageMap[voice.voice_id];
    
    if (!usage) {
      // Never used
      toDelete.push({ 
        ...voice, 
        reason: 'Never used',
        usageCount: 0,
        lastUsed: null
      });
    } else if (usage.count === 1) {
      // Only used once
      toDelete.push({ 
        ...voice, 
        reason: 'Only used once',
        usageCount: usage.count,
        lastUsed: new Date(usage.lastUsed)
      });
    } else if (usage.lastUsed < SIX_MONTHS_AGO) {
      // Not used in 6 months
      toDelete.push({ 
        ...voice, 
        reason: 'Not used in 6+ months',
        usageCount: usage.count,
        lastUsed: new Date(usage.lastUsed)
      });
    } else {
      toKeep.push({
        ...voice,
        usageCount: usage.count,
        lastUsed: new Date(usage.lastUsed)
      });
    }
  }
  
  console.log('');
  console.log('📋 Summary:');
  console.log(`   To keep: ${toKeep.length} voices`);
  console.log(`   To delete: ${toDelete.length} voices`);
  console.log('');
  
  if (toDelete.length === 0) {
    console.log('✨ No voices to clean up!');
    return;
  }
  
  // Group by reason
  const byReason = {};
  for (const v of toDelete) {
    byReason[v.reason] = byReason[v.reason] || [];
    byReason[v.reason].push(v);
  }
  
  console.log('🗑️ Voices to delete:');
  for (const [reason, voices] of Object.entries(byReason)) {
    console.log(`\n   ${reason} (${voices.length}):`);
    for (const v of voices.slice(0, 10)) {
      const lastUsedStr = v.lastUsed ? v.lastUsed.toISOString().split('T')[0] : 'never';
      console.log(`     - ${v.name} (used: ${v.usageCount}x, last: ${lastUsedStr})`);
    }
    if (voices.length > 10) {
      console.log(`     ... and ${voices.length - 10} more`);
    }
  }
  
  console.log('');
  
  // Delete voices
  if (!DRY_RUN) {
    console.log('🚀 Deleting voices...');
    let deleted = 0;
    let failed = 0;
    
    for (const voice of toDelete) {
      const success = await deleteVoice(voice.voice_id, voice.name);
      if (success) deleted++;
      else failed++;
      
      // Rate limiting - small delay between deletions
      await new Promise(r => setTimeout(r, 200));
    }
    
    console.log('');
    console.log(`✅ Done! Deleted: ${deleted}, Failed: ${failed}`);
  } else {
    console.log('💡 Run without --dry-run to actually delete these voices');
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
