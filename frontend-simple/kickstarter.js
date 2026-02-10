/**
 * Kickstarter Workflow Handler
 * Multi-step workflow for product page scraping + badge generation
 */

class KickstarterWorkflow {
  constructor() {
    this.currentStep = 'analyze';
    this.jobId = null;
    this.scrapedData = null;
    this.selectedImages = [];
  }

  /**
   * Step 1: Analyze product page
   */
  async analyzeProductPage(url) {
    try {
      const response = await fetch('/api/kickstarter/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze page');
      }

      this.jobId = data.jobId;
      
      // Poll for results
      return this.pollAnalysisJob(data.jobId);

    } catch (error) {
      console.error('Analysis error:', error);
      throw error;
    }
  }

  /**
   * Poll for analysis job completion
   */
  async pollAnalysisJob(jobId, maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s

      try {
        const response = await fetch(`/api/kickstarter/jobs/${jobId}`);
        const data = await response.json();

        if (data.status === 'completed') {
          this.scrapedData = data.results;
          return data.results;
        }

        if (data.status === 'failed') {
          throw new Error(data.error || 'Analysis failed');
        }

        // Still processing...
        
      } catch (error) {
        console.error('Polling error:', error);
        throw error;
      }
    }

    throw new Error('Analysis timed out');
  }

  /**
   * Step 2: Generate badge overlays
   */
  async generateBadges(images, badgeTexts) {
    try {
      const response = await fetch('/api/kickstarter/generate-badges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images,
          badges: badgeTexts,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate badges');
      }

      this.jobId = data.jobId;
      
      // Poll for results
      return this.pollBadgeJob(data.jobId);

    } catch (error) {
      console.error('Badge generation error:', error);
      throw error;
    }
  }

  /**
   * Poll for badge generation completion
   */
  async pollBadgeJob(jobId, maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s

      try {
        const response = await fetch(`/api/kickstarter/jobs/${jobId}`);
        const data = await response.json();

        if (data.status === 'completed') {
          return data.results;
        }

        if (data.status === 'failed') {
          throw new Error(data.error || 'Badge generation failed');
        }

        // Still processing...
        
      } catch (error) {
        console.error('Polling error:', error);
        throw error;
      }
    }

    throw new Error('Badge generation timed out');
  }

  /**
   * Reset workflow
   */
  reset() {
    this.currentStep = 'analyze';
    this.jobId = null;
    this.scrapedData = null;
    this.selectedImages = [];
  }
}

/**
 * UI Handler for Kickstarter Modal
 */
function openKickstarterModal() {
  const modal = document.getElementById('kickstarter-modal');
  if (modal) {
    modal.classList.remove('hidden');
    showStep1UI();
  }
}

function closeKickstarterModal() {
  const modal = document.getElementById('kickstarter-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

/**
 * Step 1 UI: Analyze product page
 */
function showStep1UI() {
  const container = document.getElementById('kickstarter-content');
  container.innerHTML = `
    <div class="space-y-4">
      <div>
        <h3 class="text-lg font-bold mb-2">Step 1: Analyze Product Page</h3>
        <p class="text-sm text-gray-400 mb-4">Enter a product page URL to extract images and offers</p>
      </div>
      
      <div>
        <label class="block text-sm font-medium mb-2">Product Page URL</label>
        <input 
          type="text" 
          id="product-url" 
          class="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-primary-500"
          placeholder="https://example.com/product"
        />
      </div>

      <div id="step1-status" class="hidden">
        <div class="flex items-center space-x-3">
          <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-500"></div>
          <span class="text-sm" id="step1-status-text">Analyzing page...</span>
        </div>
      </div>

      <div class="flex justify-end space-x-3">
        <button onclick="closeKickstarterModal()" class="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600">
          Cancel
        </button>
        <button onclick="runStep1()" class="px-4 py-2 bg-primary-600 rounded-lg hover:bg-primary-700 font-medium">
          Analyze Page
        </button>
      </div>
    </div>
  `;
}

/**
 * Step 2 UI: Select images and add badges
 */
function showStep2UI(scrapedData) {
  const container = document.getElementById('kickstarter-content');
  
  const imageGrid = scrapedData.images.map((img, i) => `
    <div class="relative group cursor-pointer" onclick="toggleImageSelection(${i})">
      <img 
        src="${img.url}" 
        alt="${img.alt || 'Product image'}"
        class="w-full h-48 object-cover rounded-lg"
        onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22><rect fill=%22%23374151%22 width=%22200%22 height=%22200%22/><text x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%239CA3AF%22 font-size=%2216%22>Failed to load</text></svg>'"
      />
      <div id="img-check-${i}" class="hidden absolute top-2 right-2 w-6 h-6 bg-primary-500 rounded-full flex items-center justify-center">
        <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
        </svg>
      </div>
      <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 rounded-lg transition-all"></div>
    </div>
  `).join('');

  const suggestedBadges = scrapedData.offers.length > 0 
    ? scrapedData.offers.join('\n')
    : '50% OFF\nFREE SHIPPING\nLIMITED TIME';

  container.innerHTML = `
    <div class="space-y-4">
      <div>
        <h3 class="text-lg font-bold mb-2">Step 2: Select Images & Add Badges</h3>
        <p class="text-sm text-gray-400 mb-4">Select images and enter badge text (one per line)</p>
      </div>

      <div>
        <p class="text-sm font-medium mb-2">Product: ${scrapedData.productInfo.title || 'Unknown'}</p>
        <p class="text-xs text-gray-400 mb-4">Found ${scrapedData.images.length} vertical images</p>
      </div>
      
      <div>
        <label class="block text-sm font-medium mb-2">Select Images (click to select)</label>
        <div class="grid grid-cols-3 gap-3 max-h-64 overflow-y-auto">
          ${imageGrid}
        </div>
      </div>

      <div>
        <label class="block text-sm font-medium mb-2">Badge Texts (one per line)</label>
        <textarea 
          id="badge-texts" 
          class="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-primary-500 h-32"
          placeholder="50% OFF\nFREE SHIPPING\nLIMITED TIME"
        >${suggestedBadges}</textarea>
        <p class="text-xs text-gray-400 mt-1">Tip: We auto-detected ${scrapedData.offers.length} offers from the page</p>
      </div>

      <div id="step2-status" class="hidden">
        <div class="flex items-center space-x-3">
          <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-500"></div>
          <span class="text-sm" id="step2-status-text">Generating badges...</span>
        </div>
      </div>

      <div class="flex justify-between">
        <button onclick="showStep1UI()" class="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600">
          Back
        </button>
        <div class="flex space-x-3">
          <button onclick="closeKickstarterModal()" class="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600">
            Cancel
          </button>
          <button onclick="runStep2()" class="px-4 py-2 bg-primary-600 rounded-lg hover:bg-primary-700 font-medium">
            Generate Badges
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Step 3 UI: Show results
 */
function showStep3UI(results) {
  const container = document.getElementById('kickstarter-content');
  
  const resultGrid = results.map((result, i) => {
    if (result.error) {
      return `
        <div class="bg-red-900/20 border border-red-800 rounded-lg p-4">
          <p class="text-sm text-red-400">Failed: ${result.text}</p>
          <p class="text-xs text-gray-400 mt-1">${result.error}</p>
        </div>
      `;
    }
    
    // Use thumbnail for display, full res for download
    const displayUrl = result.thumbnail || result.url;
    const downloadUrl = result.fullRes || result.url;
    
    return `
      <div class="relative group">
        <img 
          src="${displayUrl}" 
          alt="Badge ${i+1}"
          class="w-full h-auto rounded-lg"
          loading="lazy"
        />
        <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 rounded-lg flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-all">
          <a 
            href="${downloadUrl}" 
            download="${result.filename}"
            class="p-2 bg-white/10 hover:bg-white/20 rounded-lg backdrop-blur-sm"
            title="Download Full Resolution"
          >
            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
          </a>
          <button 
            onclick="event.preventDefault(); window.addImageToSelection('${downloadUrl}', 'kickstarter', '${result.text || ''}')"
            class="p-2 bg-primary-600/80 hover:bg-primary-600 rounded-lg backdrop-blur-sm"
            title="Add to Selection"
          >
            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="space-y-4">
      <div>
        <h3 class="text-lg font-bold mb-2">✅ Badges Generated!</h3>
        <p class="text-sm text-gray-400 mb-4">Click images to download</p>
      </div>
      
      <div class="grid grid-cols-2 gap-4 max-h-96 overflow-y-auto">
        ${resultGrid}
      </div>

      <div class="flex justify-between">
        <button onclick="workflow.reset(); showStep1UI()" class="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600">
          Start New
        </button>
        <button onclick="closeKickstarterModal()" class="px-4 py-2 bg-primary-600 rounded-lg hover:bg-primary-700 font-medium">
          Done
        </button>
      </div>
    </div>
  `;
}

// Global workflow instance
const workflow = new KickstarterWorkflow();
let selectedImageIndices = [];

/**
 * Toggle image selection
 */
function toggleImageSelection(index) {
  const checkmark = document.getElementById(`img-check-${index}`);
  
  if (selectedImageIndices.includes(index)) {
    // Deselect
    selectedImageIndices = selectedImageIndices.filter(i => i !== index);
    checkmark.classList.add('hidden');
  } else {
    // Select
    selectedImageIndices.push(index);
    checkmark.classList.remove('hidden');
  }
}

/**
 * Run Step 1: Analyze page
 */
async function runStep1() {
  const url = document.getElementById('product-url').value.trim();
  
  if (!url) {
    alert('Please enter a product page URL');
    return;
  }

  const status = document.getElementById('step1-status');
  const statusText = document.getElementById('step1-status-text');
  
  status.classList.remove('hidden');
  statusText.textContent = 'Analyzing page...';

  try {
    const results = await workflow.analyzeProductPage(url);
    
    if (results.images.length === 0) {
      alert('No vertical images found on this page');
      status.classList.add('hidden');
      return;
    }

    showStep2UI(results);
    
  } catch (error) {
    alert('Failed to analyze page: ' + error.message);
    status.classList.add('hidden');
  }
}

/**
 * Run Step 2: Generate badges
 */
async function runStep2() {
  if (selectedImageIndices.length === 0) {
    alert('Please select at least one image');
    return;
  }

  const badgeTextarea = document.getElementById('badge-texts');
  const badgeTexts = badgeTextarea.value.trim().split('\n').filter(t => t.trim());
  
  if (badgeTexts.length === 0) {
    alert('Please enter at least one badge text');
    return;
  }

  const selectedImages = selectedImageIndices.map(i => workflow.scrapedData.images[i].url);

  const status = document.getElementById('step2-status');
  const statusText = document.getElementById('step2-status-text');
  
  status.classList.remove('hidden');
  statusText.textContent = 'Generating badges...';

  try {
    const results = await workflow.generateBadges(selectedImages, badgeTexts);
    showStep3UI(results);
    
  } catch (error) {
    alert('Failed to generate badges: ' + error.message);
    status.classList.add('hidden');
  }
}
