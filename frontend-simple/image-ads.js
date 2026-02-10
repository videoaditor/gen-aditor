/**
 * Image Ads Workflow Handler
 * Multi-step workflow for generating ads from product page + inspiration images
 */

class ImageAdsWorkflow {
  constructor() {
    this.currentStep = 'analyze';
    this.jobId = null;
    this.productInfo = null;
    this.inspirationImages = [];
  }

  /**
   * Step 1: Analyze product page
   */
  async analyzeProductPage(url) {
    try {
      const response = await fetch('/api/image-ads/analyze', {
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
        const response = await fetch(`/api/image-ads/jobs/${jobId}`);
        const data = await response.json();

        if (data.status === 'completed') {
          this.productInfo = data.results.productInfo;
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
   * Step 2: Generate ads from inspiration images
   */
  async generateAds(inspirationImages) {
    try {
      const response = await fetch('/api/image-ads/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productInfo: this.productInfo,
          inspirationImages,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate ads');
      }

      this.jobId = data.jobId;
      
      // Poll for results
      return this.pollGenerateJob(data.jobId);

    } catch (error) {
      console.error('Generation error:', error);
      throw error;
    }
  }

  /**
   * Poll for generation job completion
   */
  async pollGenerateJob(jobId, maxAttempts = 120) {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3s

      try {
        const response = await fetch(`/api/image-ads/jobs/${jobId}`);
        const data = await response.json();

        if (data.status === 'completed') {
          return data.results;
        }

        if (data.status === 'failed') {
          throw new Error(data.error || 'Generation failed');
        }

        // Update progress if available
        if (data.progress) {
          const progressEl = document.getElementById('step2-progress');
          if (progressEl) {
            progressEl.textContent = `${data.progress}% complete...`;
          }
        }
        
      } catch (error) {
        console.error('Polling error:', error);
        throw error;
      }
    }

    throw new Error('Generation timed out');
  }

  /**
   * Reset workflow
   */
  reset() {
    this.currentStep = 'analyze';
    this.jobId = null;
    this.productInfo = null;
    this.inspirationImages = [];
  }
}

/**
 * UI Handler for Image Ads Modal
 */
function openImageAdsModal() {
  const modal = document.getElementById('image-ads-modal');
  if (modal) {
    modal.classList.remove('hidden');
    showImageAdsStep1UI();
  }
}

function closeImageAdsModal() {
  const modal = document.getElementById('image-ads-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

/**
 * Step 1 UI: Analyze product page
 */
function showImageAdsStep1UI() {
  const container = document.getElementById('image-ads-content');
  container.innerHTML = `
    <div class="space-y-4">
      <div>
        <h3 class="text-lg font-bold mb-2">Step 1: Product Page</h3>
        <p class="text-sm text-gray-400 mb-4">Enter your product page URL</p>
      </div>
      
      <div>
        <label class="block text-sm font-medium mb-2">Product Page URL</label>
        <input 
          type="text" 
          id="imageads-product-url" 
          class="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-primary-500"
          placeholder="Paste any product page URL here..."
          value="https://www.amazon.com/dp/B08XYZ1234"
        />
      </div>

      <div id="step1-status" class="hidden">
        <div class="flex items-center space-x-3">
          <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-500"></div>
          <span class="text-sm" id="step1-status-text">Analyzing page...</span>
        </div>
      </div>

      <div class="flex justify-end space-x-3">
        <button onclick="closeImageAdsModal()" class="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600">
          Cancel
        </button>
        <button onclick="runImageAdsStep1()" class="px-4 py-2 bg-primary-600 rounded-lg hover:bg-primary-700 font-medium">
          Next
        </button>
      </div>
    </div>
  `;
}

/**
 * Step 2 UI: Upload inspiration images
 */
function showImageAdsStep2UI(productInfo) {
  const container = document.getElementById('image-ads-content');
  
  container.innerHTML = `
    <div class="space-y-4">
      <div>
        <h3 class="text-lg font-bold mb-2">Step 2: Upload Inspiration Ads</h3>
        <p class="text-sm text-gray-400 mb-2">Product: ${productInfo.title || 'Unknown'}</p>
        <p class="text-sm text-gray-400 mb-4">Upload up to 8 inspiration ad images</p>
      </div>
      
      <div>
        <label class="block text-sm font-medium mb-2">Inspiration Images</label>
        <div class="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center hover:border-primary-500 transition-colors cursor-pointer">
          <input type="file" id="inspo-images" accept="image/*" multiple class="hidden">
          <svg class="w-12 h-12 mx-auto mb-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
          <p class="text-gray-400 mb-1">Click to upload inspiration ads</p>
          <p class="text-xs text-gray-500">PNG, JPG (up to 8 images)</p>
        </div>
        <div id="inspo-preview" class="hidden mt-4 grid grid-cols-4 gap-2">
          <!-- Preview images appear here -->
        </div>
      </div>

      <div id="step2-status" class="hidden">
        <div class="flex items-center space-x-3">
          <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-500"></div>
          <span class="text-sm" id="step2-status-text">Generating ads...</span>
          <span class="text-sm text-gray-400" id="step2-progress"></span>
        </div>
      </div>

      <div class="flex justify-between">
        <button onclick="showImageAdsStep1UI()" class="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600">
          Back
        </button>
        <div class="flex space-x-3">
          <button onclick="closeImageAdsModal()" class="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600">
            Cancel
          </button>
          <button onclick="runImageAdsStep2()" class="px-4 py-2 bg-primary-600 rounded-lg hover:bg-primary-700 font-medium">
            Generate Ads
          </button>
        </div>
      </div>
    </div>
  `;

  // Set up file upload
  const uploadArea = document.querySelector('#image-ads-content .border-dashed');
  const fileInput = document.getElementById('inspo-images');
  const preview = document.getElementById('inspo-preview');

  uploadArea.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files).slice(0, 8);
    if (files.length > 0) {
      preview.classList.remove('hidden');
      preview.innerHTML = files.map((file, i) => {
        const url = URL.createObjectURL(file);
        return `<img src="${url}" class="w-full h-24 object-cover rounded" data-file-index="${i}">`;
      }).join('');
    }
  });
}

/**
 * Step 3 UI: Show results
 */
function showImageAdsStep3UI(results) {
  const container = document.getElementById('image-ads-content');
  
  const successCount = results.filter(r => r.imageUrl).length;
  
  const resultGrid = results.map((result, i) => {
    if (result.error) {
      return `
        <div class="bg-red-900/20 border border-red-800 rounded-lg p-4 text-center">
          <p class="text-sm text-red-400">Ad ${i+1} failed</p>
        </div>
      `;
    }
    
    return `
      <div class="relative group">
        <img 
          src="${result.imageUrl}" 
          alt="Ad ${i+1}"
          class="w-full h-auto rounded-lg"
        />
        <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 rounded-lg flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-all">
          <a 
            href="${result.imageUrl}" 
            download="ad-${i+1}.jpg"
            class="p-2 bg-white/10 hover:bg-white/20 rounded-lg backdrop-blur-sm"
            title="Download"
          >
            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
          </a>
          <button 
            onclick="event.preventDefault(); window.addImageToSelection('${result.imageUrl}', 'image-ads', '${result.style || 'Style ' + (i+1)}')"
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
        <h3 class="text-lg font-bold mb-2">✅ ${successCount} Ads Generated!</h3>
        <p class="text-sm text-gray-400 mb-4">Click images to download</p>
      </div>
      
      <div class="grid grid-cols-2 gap-4 max-h-96 overflow-y-auto">
        ${resultGrid}
      </div>

      <div class="flex justify-between">
        <button onclick="imageAdsWorkflow.reset(); showImageAdsStep1UI()" class="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600">
          Start New
        </button>
        <button onclick="closeImageAdsModal()" class="px-4 py-2 bg-primary-600 rounded-lg hover:bg-primary-700 font-medium">
          Done
        </button>
      </div>
    </div>
  `;
}

// Global workflow instance
const imageAdsWorkflow = new ImageAdsWorkflow();

/**
 * Run Step 1: Analyze product page
 */
async function runImageAdsStep1() {
  const url = document.getElementById('imageads-product-url').value.trim();
  
  if (!url) {
    alert('📝 Paste a product page URL in the box above');
    return;
  }

  const status = document.getElementById('step1-status');
  const statusText = document.getElementById('step1-status-text');
  
  status.classList.remove('hidden');
  statusText.textContent = 'Analyzing product page...';

  try {
    const results = await imageAdsWorkflow.analyzeProductPage(url);
    
    if (!results.productInfo) {
      alert('Could not extract product information');
      status.classList.add('hidden');
      return;
    }

    showImageAdsStep2UI(results.productInfo);
    
  } catch (error) {
    alert('⚠️ Couldn\'t load that page. Try a different product URL.');
    status.classList.add('hidden');
    console.error('Analysis error:', error);
  }
}

/**
 * Run Step 2: Generate ads
 */
async function runImageAdsStep2() {
  const fileInput = document.getElementById('inspo-images');
  const files = fileInput.files;
  
  if (files.length === 0) {
    alert('📸 Click the box above to upload some inspiration ad images');
    return;
  }

  const status = document.getElementById('step2-status');
  const statusText = document.getElementById('step2-status-text');
  
  status.classList.remove('hidden');
  statusText.textContent = 'Uploading images...';

  try {
    // Convert files to data URLs
    const imageUrls = await Promise.all(
      Array.from(files).map(file => {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.readAsDataURL(file);
        });
      })
    );

    statusText.textContent = 'Generating ads...';
    
    const results = await imageAdsWorkflow.generateAds(imageUrls);
    showImageAdsStep3UI(results);
    
  } catch (error) {
    alert('⚠️ Something went wrong creating your ads. Try again with different images.');
    status.classList.add('hidden');
    console.error('Generation error:', error);
  }
}
