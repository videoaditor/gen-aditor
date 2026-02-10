#!/usr/bin/env node
/**
 * Full-stack test for gen.aditor.ai workflows
 * Uses Playwright to actually click through the UI like a human
 */

const { chromium } = require('playwright');

const BASE_URL = 'https://gen.aditor.ai';
const BACKEND_URL = 'http://localhost:3001';

// Test scripts
const TEST_SCRIPTS = {
  simple: `Our platform helps businesses automate their creative production.

With AI-powered workflows, you can generate product ads, explainer videos, and broll content in minutes.

No more waiting days for designers. Get professional results instantly.

Try it free today.`,

  complex: `### Hook 1
I watched 6 dropshippers run the exact same shower head ad.

### Hook 2  
Your winning product isn't dead because the market's saturated.

It's dead because you've been running the same creative for 3 weeks.

### Hook 3
You're not an entrepreneur.`
};

async function testScriptExplainer() {
  console.log('\n🧪 Testing Script → Explainer workflow...\n');

  const browser = await chromium.launch({ headless: false }); // Set to true for CI
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. Navigate to site
    console.log('📍 Step 1: Navigate to gen.aditor.ai');
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    console.log('  ✅ Page loaded');

    // 2. Click Script → Explainer card
    console.log('\n📍 Step 2: Click Script → Explainer workflow');
    await page.click('text=Script → Explainer');
    await page.waitForSelector('#script-explainer-modal:not(.hidden)', { timeout: 5000 });
    console.log('  ✅ Modal opened');

    // 3. Check pre-filled script
    console.log('\n📍 Step 3: Verify pre-filled example');
    const scriptValue = await page.inputValue('#explainer-script');
    if (scriptValue.length > 0) {
      console.log(`  ✅ Script pre-filled (${scriptValue.length} chars)`);
    } else {
      console.log('  ⚠️  Script NOT pre-filled');
    }

    // 4. Replace with test script
    console.log('\n📍 Step 4: Enter test script');
    await page.fill('#explainer-script', TEST_SCRIPTS.simple);
    console.log('  ✅ Test script entered');

    // 5. Click Next
    console.log('\n📍 Step 5: Click Next (analyze)');
    await page.click('button:has-text("Next")');
    
    // Wait for analysis
    await page.waitForSelector('text=Look Good?', { timeout: 10000 });
    console.log('  ✅ Analysis completed');

    // 6. Check style detection
    const styleText = await page.textContent('.text-3xl'); // Emoji
    console.log(`  🎨 Style detected: ${styleText}`);

    // 7. Check scene count
    const sceneCards = await page.locator('.bg-gray-700').count();
    console.log(`  📋 Scenes detected: ${sceneCards}`);

    // 8. Click Generate
    console.log('\n📍 Step 6: Click Generate (create frames)');
    await page.click('button:has-text("Generate")');

    // Wait for generation (this takes time)
    console.log('  ⏳ Waiting for frame generation...');
    await page.waitForSelector('text=Your Frames Are Ready!', { timeout: 180000 }); // 3 min max
    console.log('  ✅ Frames generated!');

    // 9. Check results
    const successText = await page.textContent('h3:has-text("Frames Are Ready")');
    console.log(`  ${successText}`);

    // Count successful frames
    const frameImages = await page.locator('img[alt^="Scene"]').count();
    const failedScenes = await page.locator('text=failed').count();
    console.log(`  ✅ Success: ${frameImages} frames`);
    if (failedScenes > 0) {
      console.log(`  ⚠️  Failed: ${failedScenes} scenes`);
    }

    // 10. Take screenshot
    await page.screenshot({ path: '/tmp/gen-aditor-test-results.png', fullPage: true });
    console.log('  📸 Screenshot saved to /tmp/gen-aditor-test-results.png');

    console.log('\n✅ FULL-STACK TEST PASSED\n');
    return { success: true, frames: frameImages, failed: failedScenes };

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    await page.screenshot({ path: '/tmp/gen-aditor-test-error.png', fullPage: true });
    console.log('  📸 Error screenshot saved to /tmp/gen-aditor-test-error.png');
    return { success: false, error: error.message };
  } finally {
    await browser.close();
  }
}

async function testBackendHealth() {
  console.log('\n🏥 Testing backend health...\n');
  
  const axios = require('axios');
  
  try {
    const response = await axios.get(`${BACKEND_URL}/health`);
    console.log('  ✅ Backend responding');
    console.log(`     Status: ${response.data.status}`);
    return true;
  } catch (error) {
    console.error('  ❌ Backend not responding');
    console.error(`     Error: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 gen.aditor.ai Full-Stack Test Suite');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 1. Backend health
  const backendOk = await testBackendHealth();
  if (!backendOk) {
    console.log('\n❌ Backend not running. Start with: cd backend && node server.js');
    process.exit(1);
  }

  // 2. Script Explainer workflow
  const result = await testScriptExplainer();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Test Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Backend: ${backendOk ? '✅' : '❌'}`);
  console.log(`UI Flow: ${result.success ? '✅' : '❌'}`);
  if (result.success) {
    console.log(`Frames Generated: ${result.frames}`);
    if (result.failed > 0) {
      console.log(`Failed Scenes: ${result.failed} ⚠️`);
    }
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  process.exit(result.success ? 0 : 1);
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
