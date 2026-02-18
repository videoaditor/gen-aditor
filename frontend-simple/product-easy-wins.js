/**
 * Product Easy Wins Workflow - v2
 * 
 * Improved UI:
 * - Product image on left, 3x3 scene grid on right
 * - Toggle scenes on/off before generation
 * - Results displayed below with batch actions
 */

class ProductEasyWinsWorkflow {
  constructor() {
    this.jobId = null;
    this.uploadedImage = null;
    this.uploadedImageUrl = null;
    this.selectedScenes = new Set();
    this.prompts = [];
  }

  async generate(imageFile, selectedPromptIds) {
    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('selectedPrompts', JSON.stringify(selectedPromptIds));

    const response = await fetch('/api/product-easy-wins/generate', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to start generation');
    
    this.jobId = data.jobId;
    return data;
  }

  async pollJob(jobId, onProgress) {
    const maxAttempts = 180; // 3 min per image max
    
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const response = await fetch(`/api/product-easy-wins/jobs/${jobId}`);
      const data = await response.json();
      
      if (onProgress) onProgress(data);
      if (data.status === 'completed') return data;
      if (data.status === 'failed') throw new Error(data.error || 'Generation failed');
    }
    throw new Error('Generation timed out');
  }

  async getPrompts() {
    const response = await fetch('/api/product-easy-wins/prompts');
    const data = await response.json();
    this.prompts = data.prompts;
    return data.prompts;
  }

  reset() {
    this.jobId = null;
    this.uploadedImage = null;
    this.uploadedImageUrl = null;
    this.selectedScenes = new Set();
  }
}

const productEasyWins = new ProductEasyWinsWorkflow();

function openProductEasyWinsModal() {
  const modal = document.getElementById('product-easy-wins-modal');
  if (modal) {
    modal.classList.remove('hidden');
    initProductEasyWinsUI();
  }
}

function closeProductEasyWinsModal() {
  const modal = document.getElementById('product-easy-wins-modal');
  if (modal) {
    modal.classList.add('hidden');
    productEasyWins.reset();
  }
}

async function initProductEasyWinsUI() {
  const container = document.getElementById('product-easy-wins-content');
  
  // Load prompts
  let prompts = [];
  try {
    prompts = await productEasyWins.getPrompts();
    prompts.forEach(p => productEasyWins.selectedScenes.add(p.id));
  } catch (e) {
    console.error('Failed to load prompts:', e);
  }

  container.innerHTML = `
    <div class="pew-layout">
      <!-- Top Section: Image + Scene Grid -->
      <div class="pew-top-section">
        <!-- Left: Product Image Upload -->
        <div class="pew-image-section">
          <div class="pew-section-label">Product Image</div>
          <div id="pew-upload-area" class="pew-upload-area">
            <input type="file" id="pew-file-input" accept="image/*" class="hidden">
            <div id="pew-upload-placeholder" class="pew-upload-placeholder">
              <svg class="w-12 h-12 mx-auto mb-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
              <p class="text-gray-400 text-sm">Click or drop image</p>
            </div>
            <img id="pew-preview-img" class="pew-preview-img hidden" alt="Product preview">
          </div>
          <button id="pew-change-image" class="pew-change-btn hidden">Change Image</button>
        </div>

        <!-- Right: Scene Selection Grid -->
        <div class="pew-scenes-section">
          <div class="pew-section-label">
            Scenes to Generate
            <span class="pew-scene-count">(<span id="pew-selected-count">${prompts.length}</span>/${prompts.length} selected)</span>
          </div>
          <div class="pew-scenes-grid">
            ${prompts.map(p => `
              <div class="pew-scene-item selected" data-scene-id="${p.id}" onclick="toggleScene('${p.id}')">
                <div class="pew-scene-check">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
                  </svg>
                </div>
                <div class="pew-scene-name">${p.name}</div>
                <div class="pew-scene-desc">${p.description}</div>
              </div>
            `).join('')}
          </div>
          <div class="pew-scene-actions">
            <button onclick="selectAllScenes()" class="pew-select-btn">Select All</button>
            <button onclick="deselectAllScenes()" class="pew-select-btn">Deselect All</button>
          </div>
        </div>
      </div>

      <!-- Generate Button -->
      <div class="pew-generate-section">
        <button id="pew-generate-btn" onclick="runProductEasyWins()" class="pew-generate-btn" disabled>
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
          Generate <span id="pew-gen-count">${prompts.length}</span> Shots
        </button>
        <div id="pew-progress-section" class="pew-progress-section hidden">
          <div class="pew-progress-bar">
            <div id="pew-progress-fill" class="pew-progress-fill"></div>
          </div>
          <div id="pew-progress-text" class="pew-progress-text">Starting...</div>
        </div>
      </div>

      <!-- Results Section -->
      <div id="pew-results-section" class="pew-results-section hidden">
        <div class="pew-results-header">
          <div class="pew-section-label">Generated Shots</div>
          <div class="pew-batch-actions">
            <button onclick="downloadAllResults()" class="pew-batch-btn">
              <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              Download All
            </button>
            <button onclick="addAllToVideoQueue()" class="pew-batch-btn primary">
              <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
              </svg>
              Add All to Video Queue
            </button>
          </div>
        </div>
        <div id="pew-results-grid" class="pew-results-grid"></div>
      </div>
    </div>

    <style>
      .pew-layout { display: flex; flex-direction: column; gap: 24px; }
      
      .pew-top-section { display: grid; grid-template-columns: 280px 1fr; gap: 24px; }
      @media (max-width: 768px) { .pew-top-section { grid-template-columns: 1fr; } }
      
      .pew-section-label { font-size: 14px; font-weight: 600; color: #9CA3AF; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
      .pew-scene-count { font-weight: 400; color: #6B7280; }
      
      .pew-image-section { display: flex; flex-direction: column; }
      .pew-upload-area { 
        aspect-ratio: 1; 
        border: 2px dashed #4B5563; 
        border-radius: 12px; 
        display: flex; 
        align-items: center; 
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s;
        overflow: hidden;
        background: #1F2937;
      }
      .pew-upload-area:hover { border-color: #F97316; }
      .pew-upload-area.has-image { border-style: solid; border-color: #374151; }
      .pew-upload-placeholder { text-align: center; padding: 20px; }
      .pew-preview-img { width: 100%; height: 100%; object-fit: cover; }
      .pew-change-btn { margin-top: 8px; padding: 8px 16px; background: #374151; border: none; border-radius: 8px; color: #D1D5DB; cursor: pointer; font-size: 13px; }
      .pew-change-btn:hover { background: #4B5563; }
      
      .pew-scenes-section { display: flex; flex-direction: column; }
      .pew-scenes-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
      @media (max-width: 640px) { .pew-scenes-grid { grid-template-columns: repeat(2, 1fr); } }
      
      .pew-scene-item {
        padding: 12px;
        background: #1F2937;
        border: 2px solid #374151;
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.15s;
        position: relative;
      }
      .pew-scene-item:hover { border-color: #4B5563; }
      .pew-scene-item.selected { border-color: #F97316; background: rgba(249, 115, 22, 0.1); }
      .pew-scene-check {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 20px;
        height: 20px;
        background: #374151;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: all 0.15s;
      }
      .pew-scene-item.selected .pew-scene-check { opacity: 1; background: #F97316; }
      .pew-scene-check svg { color: white; }
      .pew-scene-name { font-size: 13px; font-weight: 600; color: white; margin-bottom: 4px; padding-right: 24px; }
      .pew-scene-desc { font-size: 11px; color: #9CA3AF; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      
      .pew-scene-actions { display: flex; gap: 8px; margin-top: 12px; }
      .pew-select-btn { padding: 6px 12px; background: #374151; border: none; border-radius: 6px; color: #9CA3AF; cursor: pointer; font-size: 12px; }
      .pew-select-btn:hover { background: #4B5563; color: white; }
      
      .pew-generate-section { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 16px 0; border-top: 1px solid #374151; }
      .pew-generate-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 14px 32px;
        background: linear-gradient(135deg, #F97316, #EA580C);
        border: none;
        border-radius: 10px;
        color: white;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        min-width: 200px;
      }
      .pew-generate-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(249, 115, 22, 0.4); }
      .pew-generate-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      
      .pew-progress-section { width: 100%; max-width: 400px; }
      .pew-progress-bar { height: 8px; background: #374151; border-radius: 4px; overflow: hidden; }
      .pew-progress-fill { height: 100%; background: linear-gradient(90deg, #F97316, #FBBF24); border-radius: 4px; transition: width 0.3s; width: 0%; }
      .pew-progress-text { text-align: center; margin-top: 8px; font-size: 13px; color: #9CA3AF; }
      
      .pew-results-section { border-top: 1px solid #374151; padding-top: 24px; }
      .pew-results-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
      .pew-batch-actions { display: flex; gap: 8px; }
      .pew-batch-btn {
        display: flex;
        align-items: center;
        padding: 8px 16px;
        background: #374151;
        border: none;
        border-radius: 8px;
        color: #D1D5DB;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s;
      }
      .pew-batch-btn:hover { background: #4B5563; }
      .pew-batch-btn.primary { background: #F97316; color: white; }
      .pew-batch-btn.primary:hover { background: #EA580C; }
      
      .pew-results-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; }
      .pew-result-item { position: relative; border-radius: 10px; overflow: hidden; background: #1F2937; }
      .pew-result-item img { width: 100%; aspect-ratio: 9/16; object-fit: cover; display: block; }
      .pew-result-label { position: absolute; bottom: 0; left: 0; right: 0; padding: 8px; background: linear-gradient(transparent, rgba(0,0,0,0.8)); }
      .pew-result-label span { font-size: 12px; font-weight: 500; color: white; }
      .pew-result-actions { position: absolute; top: 8px; right: 8px; display: flex; gap: 4px; opacity: 0; transition: opacity 0.15s; }
      .pew-result-item:hover .pew-result-actions { opacity: 1; }
      .pew-result-action { width: 32px; height: 32px; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); border: none; border-radius: 6px; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; }
      .pew-result-action:hover { background: rgba(249, 115, 22, 0.8); }
      
      .pew-result-error { padding: 16px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 10px; }
      .pew-result-error-title { font-size: 13px; font-weight: 500; color: #F87171; margin-bottom: 4px; }
      .pew-result-error-msg { font-size: 11px; color: #9CA3AF; }
    </style>
  `;

  setupProductEasyWinsHandlers();
}

function setupProductEasyWinsHandlers() {
  const uploadArea = document.getElementById('pew-upload-area');
  const fileInput = document.getElementById('pew-file-input');
  const placeholder = document.getElementById('pew-upload-placeholder');
  const previewImg = document.getElementById('pew-preview-img');
  const changeBtn = document.getElementById('pew-change-image');
  const generateBtn = document.getElementById('pew-generate-btn');

  uploadArea.addEventListener('click', () => fileInput.click());
  changeBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) setProductImage(file);
  });

  uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.style.borderColor = '#F97316'; });
  uploadArea.addEventListener('dragleave', () => { uploadArea.style.borderColor = productEasyWins.uploadedImage ? '#374151' : '#4B5563'; });
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) setProductImage(file);
  });
}

function setProductImage(file) {
  productEasyWins.uploadedImage = file;
  productEasyWins.uploadedImageUrl = URL.createObjectURL(file);
  
  const uploadArea = document.getElementById('pew-upload-area');
  const placeholder = document.getElementById('pew-upload-placeholder');
  const previewImg = document.getElementById('pew-preview-img');
  const changeBtn = document.getElementById('pew-change-image');
  const generateBtn = document.getElementById('pew-generate-btn');

  placeholder.classList.add('hidden');
  previewImg.src = productEasyWins.uploadedImageUrl;
  previewImg.classList.remove('hidden');
  uploadArea.classList.add('has-image');
  changeBtn.classList.remove('hidden');
  
  updateGenerateButton();
}

function toggleScene(sceneId) {
  const item = document.querySelector(`[data-scene-id="${sceneId}"]`);
  
  if (productEasyWins.selectedScenes.has(sceneId)) {
    productEasyWins.selectedScenes.delete(sceneId);
    item.classList.remove('selected');
  } else {
    productEasyWins.selectedScenes.add(sceneId);
    item.classList.add('selected');
  }
  
  updateGenerateButton();
}

function selectAllScenes() {
  productEasyWins.prompts.forEach(p => {
    productEasyWins.selectedScenes.add(p.id);
    document.querySelector(`[data-scene-id="${p.id}"]`)?.classList.add('selected');
  });
  updateGenerateButton();
}

function deselectAllScenes() {
  productEasyWins.selectedScenes.clear();
  document.querySelectorAll('.pew-scene-item').forEach(el => el.classList.remove('selected'));
  updateGenerateButton();
}

function updateGenerateButton() {
  const count = productEasyWins.selectedScenes.size;
  const hasImage = !!productEasyWins.uploadedImage;
  
  document.getElementById('pew-selected-count').textContent = count;
  document.getElementById('pew-gen-count').textContent = count;
  document.getElementById('pew-generate-btn').disabled = !hasImage || count === 0;
}

async function runProductEasyWins() {
  const generateBtn = document.getElementById('pew-generate-btn');
  const progressSection = document.getElementById('pew-progress-section');
  const progressFill = document.getElementById('pew-progress-fill');
  const progressText = document.getElementById('pew-progress-text');
  const resultsSection = document.getElementById('pew-results-section');

  if (!productEasyWins.uploadedImage || productEasyWins.selectedScenes.size === 0) return;

  generateBtn.disabled = true;
  progressSection.classList.remove('hidden');
  resultsSection.classList.add('hidden');
  progressFill.style.width = '0%';
  progressText.textContent = 'Uploading image...';

  try {
    const selectedIds = Array.from(productEasyWins.selectedScenes);
    const startData = await productEasyWins.generate(productEasyWins.uploadedImage, selectedIds);
    
    progressText.textContent = `Generating 0/${startData.total} shots...`;

    const result = await productEasyWins.pollJob(startData.jobId, (data) => {
      const progress = ((data.progress || 0) / data.total) * 100;
      progressFill.style.width = `${progress}%`;
      progressText.textContent = data.currentPrompt 
        ? `Generating ${data.progress}/${data.total}: ${data.currentPrompt}`
        : `Generating ${data.progress || 0}/${data.total} shots...`;
    });

    showProductEasyWinsResults(result);

  } catch (error) {
    alert('Generation failed: ' + error.message);
    progressSection.classList.add('hidden');
    generateBtn.disabled = false;
  }
}

function showProductEasyWinsResults(result) {
  const progressSection = document.getElementById('pew-progress-section');
  const resultsSection = document.getElementById('pew-results-section');
  const resultsGrid = document.getElementById('pew-results-grid');
  const generateBtn = document.getElementById('pew-generate-btn');

  progressSection.classList.add('hidden');
  resultsSection.classList.remove('hidden');
  generateBtn.disabled = false;

  // Store results for batch actions
  window.pewResults = result.results.filter(r => r.success);

  const successHtml = result.results.filter(r => r.success).map(r => `
    <div class="pew-result-item">
      <img src="${r.url}" alt="${r.name}" loading="lazy">
      <div class="pew-result-label"><span>${r.name}</span></div>
      <div class="pew-result-actions">
        <a href="${r.url}" download="${r.id}.png" class="pew-result-action" title="Download">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
          </svg>
        </a>
        <button onclick="addToVideoQueue('${r.url}', '${r.name}')" class="pew-result-action" title="Add to Video Queue">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');

  const errorHtml = (result.errors || []).map(e => `
    <div class="pew-result-error">
      <div class="pew-result-error-title">${e.name}</div>
      <div class="pew-result-error-msg">${e.error}</div>
    </div>
  `).join('');

  resultsGrid.innerHTML = successHtml + errorHtml;
}

function downloadAllResults() {
  if (!window.pewResults || window.pewResults.length === 0) return;
  
  window.pewResults.forEach((r, i) => {
    setTimeout(() => {
      const a = document.createElement('a');
      a.href = r.url;
      a.download = `${r.id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }, i * 300);
  });
}

function addToVideoQueue(url, name) {
  if (window.addImageToSelection) {
    window.addImageToSelection(url, 'product-easy-wins', name);
  } else {
    console.warn('Video queue not available');
  }
}

function addAllToVideoQueue() {
  if (!window.pewResults || window.pewResults.length === 0) return;
  
  window.pewResults.forEach(r => {
    addToVideoQueue(r.url, r.name);
  });
}
