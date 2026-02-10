/**
 * Screenshot → Broll Workflow Handler
 * Upload competitor ad + your product → recreate with your assets
 */

let currentStep = 1;
let jobId = null;

/**
 * Open modal and show Step 1
 */
function openScreenshotBrollModal() {
  const modal = document.getElementById('screenshot-broll-modal');
  if (modal) {
    modal.classList.remove('hidden');
    showStep1();
  }
}

/**
 * Close modal
 */
function closeScreenshotBrollModal() {
  const modal = document.getElementById('screenshot-broll-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
  currentStep = 1;
  jobId = null;
}

/**
 * Convert file to base64
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Step 1: Upload images
 */
function showStep1() {
  const content = document.getElementById('screenshot-broll-content');
  
  content.innerHTML = `
    <div class="space-y-6">
      <div>
        <h3 class="text-lg font-bold mb-2">📸 Screenshot → Broll</h3>
        <p class="text-gray-400 text-sm">Upload a competitor ad and recreate it with your product/person</p>
      </div>
      
      <!-- Competitor Ad Upload -->
      <div>
        <label class="block text-sm font-medium mb-2">Competitor Ad Screenshot *</label>
        <div class="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center hover:border-primary-500 transition cursor-pointer" onclick="document.getElementById('competitor-file').click()">
          <input type="file" id="competitor-file" accept="image/*" style="display:none" onchange="previewCompetitor(this)">
          <div id="competitor-preview" class="space-y-2">
            <div class="text-3xl">🖼️</div>
            <p class="text-sm">Click to upload competitor ad</p>
            <p class="text-xs text-gray-500">JPG, PNG, or WebP</p>
          </div>
        </div>
      </div>
      
      <!-- Product Image Upload -->
      <div>
        <label class="block text-sm font-medium mb-2">Your Product Image *</label>
        <div class="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center hover:border-primary-500 transition cursor-pointer" onclick="document.getElementById('product-file').click()">
          <input type="file" id="product-file" accept="image/*" style="display:none" onchange="previewProduct(this)">
          <div id="product-preview" class="space-y-2">
            <div class="text-3xl">📦</div>
            <p class="text-sm">Click to upload your product</p>
            <p class="text-xs text-gray-500">JPG, PNG, or WebP</p>
          </div>
        </div>
      </div>
      
      <!-- Creator Image Upload (Optional) -->
      <div>
        <label class="block text-sm font-medium mb-2">Your Creator/Person (optional)</label>
        <div class="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center hover:border-primary-500 transition cursor-pointer" onclick="document.getElementById('creator-file').click()">
          <input type="file" id="creator-file" accept="image/*" style="display:none" onchange="previewCreator(this)">
          <div id="creator-preview" class="space-y-2">
            <div class="text-3xl">👤</div>
            <p class="text-sm">Click to upload creator/person</p>
            <p class="text-xs text-gray-500">Leave empty if not needed</p>
          </div>
        </div>
      </div>
      
      <!-- Product Name -->
      <div>
        <label class="block text-sm font-medium mb-2">Product Name *</label>
        <input 
          type="text" 
          id="product-name" 
          placeholder="e.g., Premium Wireless Headphones"
          class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
        >
        <p class="text-xs text-gray-500 mt-1">This helps the AI understand your product better</p>
      </div>
      
      <div id="step1-error" class="hidden text-red-400 text-sm bg-red-900/20 p-3 rounded-lg"></div>
      
      <div class="flex space-x-3 pt-4">
        <button onclick="closeScreenshotBrollModal()" class="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium">
          Cancel
        </button>
        <button onclick="startGeneration()" class="flex-1 px-6 py-3 bg-primary-600 hover:bg-primary-700 rounded-lg font-semibold">
          Generate Recreation →
        </button>
      </div>
    </div>
  `;
}

/**
 * Preview competitor image
 */
function previewCompetitor(input) {
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = (e) => {
      document.getElementById('competitor-preview').innerHTML = `
        <img src="${e.target.result}" class="max-h-40 mx-auto rounded" alt="Competitor ad">
        <p class="text-xs text-green-400">✓ Competitor ad uploaded</p>
      `;
    };
    reader.readAsDataURL(input.files[0]);
  }
}

/**
 * Preview product image
 */
function previewProduct(input) {
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = (e) => {
      document.getElementById('product-preview').innerHTML = `
        <img src="${e.target.result}" class="max-h-40 mx-auto rounded" alt="Product">
        <p class="text-xs text-green-400">✓ Product image uploaded</p>
      `;
    };
    reader.readAsDataURL(input.files[0]);
  }
}

/**
 * Preview creator image
 */
function previewCreator(input) {
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = (e) => {
      document.getElementById('creator-preview').innerHTML = `
        <img src="${e.target.result}" class="max-h-40 mx-auto rounded" alt="Creator">
        <p class="text-xs text-green-400">✓ Creator image uploaded</p>
      `;
    };
    reader.readAsDataURL(input.files[0]);
  }
}

/**
 * Start generation
 */
async function startGeneration() {
  const competitorFile = document.getElementById('competitor-file').files[0];
  const productFile = document.getElementById('product-file').files[0];
  const creatorFile = document.getElementById('creator-file').files[0];
  const productName = document.getElementById('product-name').value.trim();
  
  const errorDiv = document.getElementById('step1-error');
  
  // Validation
  if (!competitorFile) {
    errorDiv.textContent = '📸 Please upload a competitor ad screenshot';
    errorDiv.classList.remove('hidden');
    return;
  }
  
  if (!productFile) {
    errorDiv.textContent = '📦 Please upload your product image';
    errorDiv.classList.remove('hidden');
    return;
  }
  
  if (!productName) {
    errorDiv.textContent = '✏️ Please enter your product name';
    errorDiv.classList.remove('hidden');
    return;
  }
  
  errorDiv.classList.add('hidden');
  
  try {
    // Show loading state
    showLoadingState();
    
    // Convert files to base64
    const competitorImage = await fileToBase64(competitorFile);
    const productImage = await fileToBase64(productFile);
    const creatorImage = creatorFile ? await fileToBase64(creatorFile) : null;
    
    // Submit to backend
    const response = await fetch('/api/screenshot-broll/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        competitorImage,
        productImage,
        creatorImage,
        productName
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to start generation');
    }
    
    const data = await response.json();
    jobId = data.jobId;
    
    // Poll for results
    pollJobStatus();
    
  } catch (error) {
    console.error('Generation error:', error);
    errorDiv.textContent = '⚠️ ' + error.message;
    errorDiv.classList.remove('hidden');
    showStep1();
  }
}

/**
 * Show loading state
 */
function showLoadingState() {
  const content = document.getElementById('screenshot-broll-content');
  
  content.innerHTML = `
    <div class="space-y-6">
      <div class="text-center">
        <div class="text-5xl mb-4">🎨</div>
        <h3 class="text-xl font-bold mb-2">Recreating Your Ad...</h3>
        <p class="text-gray-400">This may take 30-60 seconds</p>
      </div>
      
      <div class="space-y-3">
        <div class="bg-gray-700 rounded-full h-2 overflow-hidden">
          <div id="progress-bar" class="bg-gradient-to-r from-primary-500 to-purple-500 h-2 rounded-full transition-all duration-500" style="width: 10%"></div>
        </div>
        <p id="progress-text" class="text-sm text-center text-gray-400">Analyzing competitor ad...</p>
      </div>
      
      <div class="bg-gray-700 rounded-lg p-4 space-y-2 text-sm text-gray-400">
        <p>✓ Analyzing composition and style</p>
        <p id="step-prompt" class="opacity-50">Building recreation prompt...</p>
        <p id="step-generate" class="opacity-50">Generating image...</p>
      </div>
    </div>
  `;
}

/**
 * Poll job status
 */
async function pollJobStatus() {
  if (!jobId) return;
  
  try {
    const response = await fetch(`/api/screenshot-broll/jobs/${jobId}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch job status');
    }
    
    const job = await response.json();
    
    // Update progress
    if (job.progress) {
      const progressBar = document.getElementById('progress-bar');
      if (progressBar) {
        progressBar.style.width = job.progress + '%';
      }
      
      const progressText = document.getElementById('progress-text');
      if (progressText) {
        if (job.progress < 40) {
          progressText.textContent = 'Analyzing competitor ad...';
        } else if (job.progress < 70) {
          progressText.textContent = 'Building recreation prompt...';
          document.getElementById('step-prompt')?.classList.remove('opacity-50');
        } else {
          progressText.textContent = 'Generating your recreation...';
          document.getElementById('step-generate')?.classList.remove('opacity-50');
        }
      }
    }
    
    if (job.status === 'completed') {
      showResults(job.results);
    } else if (job.status === 'failed') {
      throw new Error(job.error || 'Generation failed');
    } else {
      // Poll again
      setTimeout(pollJobStatus, 2000);
    }
    
  } catch (error) {
    console.error('Poll error:', error);
    showError(error.message);
  }
}

/**
 * Show results
 */
function showResults(results) {
  const content = document.getElementById('screenshot-broll-content');
  
  const hasVapKey = results.imageUrl && !results.imageUrl.includes('trial');
  
  content.innerHTML = `
    <div class="space-y-6">
      <div>
        <h3 class="text-lg font-bold mb-2">✨ Recreation Complete!</h3>
        <p class="text-gray-400 text-sm">Your ad has been recreated with your product</p>
      </div>
      
      ${hasVapKey ? `
        <div class="bg-gray-700 rounded-lg p-4">
          <img src="${results.imageUrl}" alt="Recreated ad" class="w-full rounded-lg mb-4">
          <div class="flex space-x-3">
            <a href="${results.imageUrl}" download class="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded-lg text-center font-medium">
              Download Image
            </a>
            <button onclick="window.addImageToSelection?.('${results.imageUrl}', 'screenshot-broll', 'Recreated Ad')" class="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium">
              Add to Selection
            </button>
          </div>
        </div>
      ` : `
        <div class="bg-gray-700 rounded-lg p-6 text-center space-y-3">
          <div class="text-4xl">🔒</div>
          <p class="font-medium">Trial Mode</p>
          <p class="text-sm text-gray-400">Add VAP_API_KEY to backend/.env to generate images</p>
          <p class="text-xs text-gray-500">Workflow is working, just needs API key for image generation</p>
        </div>
      `}
      
      <div class="space-y-3">
        <details class="bg-gray-700 rounded-lg p-4">
          <summary class="cursor-pointer font-medium">📊 Analysis</summary>
          <pre class="mt-3 text-xs text-gray-400 whitespace-pre-wrap">${JSON.stringify(results.analysis, null, 2)}</pre>
        </details>
        
        <details class="bg-gray-700 rounded-lg p-4">
          <summary class="cursor-pointer font-medium">💬 Recreation Prompt</summary>
          <p class="mt-3 text-sm text-gray-400">${results.prompt}</p>
        </details>
        
        <div class="bg-gray-700 rounded-lg p-4">
          <p class="text-sm"><strong>Cost:</strong> $${results.cost.toFixed(4)}</p>
        </div>
      </div>
      
      <div class="flex space-x-3 pt-4">
        <button onclick="showStep1()" class="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium">
          ← Create Another
        </button>
        <button onclick="closeScreenshotBrollModal()" class="flex-1 px-6 py-3 bg-primary-600 hover:bg-primary-700 rounded-lg font-semibold">
          Done
        </button>
      </div>
    </div>
  `;
}

/**
 * Show error
 */
function showError(message) {
  const content = document.getElementById('screenshot-broll-content');
  
  content.innerHTML = `
    <div class="space-y-6">
      <div class="text-center">
        <div class="text-5xl mb-4">⚠️</div>
        <h3 class="text-xl font-bold mb-2">Generation Failed</h3>
        <p class="text-gray-400">${message}</p>
      </div>
      
      <div class="flex space-x-3">
        <button onclick="showStep1()" class="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium">
          ← Try Again
        </button>
        <button onclick="closeScreenshotBrollModal()" class="flex-1 px-6 py-3 bg-primary-600 hover:bg-primary-700 rounded-lg font-semibold">
          Close
        </button>
      </div>
    </div>
  `;
}
