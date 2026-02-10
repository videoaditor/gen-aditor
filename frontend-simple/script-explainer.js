/**
 * Script → Explainer Workflow Handler
 * Analyzes script, picks visual style, generates consistent frames
 */

class ScriptExplainerWorkflow {
  constructor() {
    this.currentStep = 'input';
    this.jobId = null;
    this.script = null;
    this.analysis = null;
  }

  /**
   * Step 1: Analyze script
   */
  async analyzeScript(script) {
    try {
      const response = await fetch('/api/script-explainer/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze script');
      }

      this.jobId = data.jobId;
      this.script = script;
      
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
  async pollAnalysisJob(jobId, maxAttempts = 20) {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s

      try {
        const response = await fetch(`/api/script-explainer/jobs/${jobId}`);
        const data = await response.json();

        if (data.status === 'completed') {
          this.analysis = data.results;
          return data.results;
        }

        if (data.status === 'failed') {
          throw new Error(data.error || 'Analysis failed');
        }

      } catch (error) {
        console.error('Polling error:', error);
        throw error;
      }
    }

    throw new Error('Analysis timed out');
  }

  /**
   * Step 2: Generate frames
   */
  async generateFrames() {
    try {
      const response = await fetch('/api/script-explainer/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: this.script,
          style: this.analysis.style,
          scenes: this.analysis.scenes,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate frames');
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
        const response = await fetch(`/api/script-explainer/jobs/${jobId}`);
        const data = await response.json();

        if (data.status === 'completed') {
          return data.results;
        }

        if (data.status === 'failed') {
          throw new Error(data.error || 'Generation failed');
        }

        // Update progress
        if (data.progress) {
          const progressEl = document.getElementById('explainer-progress');
          if (progressEl) {
            progressEl.textContent = `${data.progress}%`;
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
    this.currentStep = 'input';
    this.jobId = null;
    this.script = null;
    this.analysis = null;
  }
}

/**
 * UI Handler for Script Explainer Modal
 */
function openScriptExplainerModal() {
  const modal = document.getElementById('script-explainer-modal');
  if (modal) {
    modal.classList.remove('hidden');
    showScriptExplainerStep1UI();
  }
}

function closeScriptExplainerModal() {
  const modal = document.getElementById('script-explainer-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

/**
 * Step 1 UI: Input script
 */
function showScriptExplainerStep1UI() {
  const container = document.getElementById('script-explainer-content');
  container.innerHTML = `
    <div class="space-y-4">
      <div>
        <h3 class="text-xl font-bold mb-2">Paste Your Script</h3>
        <p class="text-sm text-gray-400 mb-4">We'll turn it into explainer video frames</p>
      </div>
      
      <div>
        <label class="block text-sm font-medium mb-2">Paste Your Script</label>
        <textarea 
          id="explainer-script" 
          rows="12"
          class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-primary-500 text-sm"
          placeholder="Just paste your script here - we'll handle the rest...">Our platform helps businesses automate their creative production.

With AI-powered workflows, you can generate product ads, explainer videos, and broll content in minutes.

No more waiting days for designers. Get professional results instantly.

Try it free today.</textarea>
        <div class="flex items-center justify-between mt-2">
          <p class="text-xs text-gray-400">
            💡 Tip: Paste raw script, annotations like ### or *visual* will be cleaned automatically
          </p>
          <button 
            onclick="document.getElementById('explainer-script').value = ''; document.getElementById('explainer-script').focus();"
            class="text-xs text-primary-400 hover:text-primary-300"
          >
            Clear & start fresh
          </button>
        </div>
      </div>

      <div id="explainer-step1-status" class="hidden">
        <div class="flex items-center space-x-3">
          <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-500"></div>
          <span class="text-sm" id="explainer-step1-text">Analyzing script...</span>
        </div>
      </div>

      <div class="flex justify-end space-x-3">
        <button onclick="closeScriptExplainerModal()" class="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600">
          Cancel
        </button>
        <button onclick="runScriptExplainerStep1()" class="px-6 py-3 bg-primary-600 rounded-lg hover:bg-primary-700 font-medium text-base">
          Next →
        </button>
      </div>
    </div>
  `;
}

/**
 * Step 2 UI: Review analysis and confirm
 */
function showScriptExplainerStep2UI(analysis) {
  const container = document.getElementById('script-explainer-content');
  
  // Format style info
  const styleInfo = {
    'modern-minimal': { emoji: '🎯', name: 'Modern Minimal' },
    '3d-tech': { emoji: '🚀', name: 'Futuristic 3D Tech' },
    'professional-minimal': { emoji: '💼', name: 'Professional Minimal' },
    'organic-warm': { emoji: '🌿', name: 'Organic Warm' },
    'friendly-cartoon': { emoji: '🎨', name: 'Friendly Cartoon' },
    'bold-dynamic': { emoji: '⚡', name: 'Bold Dynamic' },
  };

  const style = styleInfo[analysis.style] || { emoji: '🎯', name: analysis.style };

  // Build scenes list
  const scenesList = analysis.scenes.map((scene, i) => `
    <div class="bg-gray-700 p-3 rounded-lg">
      <div class="flex items-start space-x-3">
        <div class="flex-shrink-0 w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center font-bold text-sm">
          ${i + 1}
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm text-gray-300">${scene.text}</p>
          <p class="text-xs text-gray-500 mt-1">${scene.duration}</p>
        </div>
      </div>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="space-y-4">
      <div>
        <h3 class="text-xl font-bold mb-2">Look Good?</h3>
        <p class="text-sm text-gray-400 mb-4">We picked a visual style based on your script</p>
      </div>
      
      <div class="bg-gray-700 p-4 rounded-lg">
        <h4 class="text-sm font-medium mb-2">Visual Style</h4>
        <div class="flex items-center space-x-3">
          <span class="text-3xl">${style.emoji}</span>
          <div>
            <p class="font-bold">${style.name}</p>
            <p class="text-sm text-gray-400">${analysis.styleDescription}</p>
          </div>
        </div>
      </div>

      <div class="bg-gray-700 p-4 rounded-lg">
        <h4 class="text-sm font-medium mb-2">Scenes Breakdown</h4>
        <div class="space-y-2 max-h-64 overflow-y-auto">
          ${scenesList}
        </div>
        <p class="text-xs text-gray-500 mt-3">
          ${analysis.scenes.length} scenes · ~${analysis.metadata.estimatedDuration} estimated duration
        </p>
      </div>

      <div id="explainer-step2-status" class="hidden">
        <div class="flex items-center space-x-3">
          <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-500"></div>
          <span class="text-sm" id="explainer-step2-text">Generating frames...</span>
          <span class="text-sm font-medium text-primary-400" id="explainer-progress">0%</span>
        </div>
      </div>

      <div class="flex justify-between">
        <button onclick="showScriptExplainerStep1UI()" class="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600">
          Back
        </button>
        <div class="flex space-x-3">
          <button onclick="closeScriptExplainerModal()" class="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600">
            Cancel
          </button>
          <button onclick="runScriptExplainerStep2()" class="px-6 py-3 bg-primary-600 rounded-lg hover:bg-primary-700 font-medium text-base">
            Generate →
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Step 3 UI: Show results
 */
function showScriptExplainerStep3UI(results) {
  const container = document.getElementById('script-explainer-content');
  
  const successCount = results.frames.filter(f => f.imageUrl).length;
  
  const frameGrid = results.frames.map((frame, i) => {
    if (frame.error) {
      return `
        <div class="bg-red-900/20 border border-red-800 rounded-lg p-4 text-center">
          <p class="text-sm text-red-400">Scene ${i+1} failed</p>
        </div>
      `;
    }
    
    return `
      <div class="bg-gray-700 rounded-lg overflow-hidden group relative">
        <img 
          src="${frame.imageUrl}" 
          alt="Scene ${i+1}"
          class="w-full aspect-video object-cover"
        />
        <div class="p-3">
          <p class="text-xs font-medium mb-1">Scene ${i + 1}</p>
          <p class="text-xs text-gray-400 line-clamp-2">${frame.sceneText}</p>
        </div>
        <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-60 flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-all">
          <a 
            href="${frame.imageUrl}" 
            download="scene-${i+1}.jpg"
            class="p-2 bg-white/10 hover:bg-white/20 rounded-lg backdrop-blur-sm"
            title="Download"
          >
            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
          </a>
          <button 
            onclick="event.preventDefault(); window.addImageToSelection('${frame.imageUrl}', 'script-explainer', 'Scene ${i+1}')"
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
        <h3 class="text-xl font-bold mb-2">✅ Your Frames Are Ready!</h3>
        <p class="text-sm text-gray-400 mb-4">${successCount} frames · ${results.style} style · $${results.totalCost.toFixed(2)}</p>
      </div>
      
      <div class="grid grid-cols-2 gap-4 max-h-[500px] overflow-y-auto">
        ${frameGrid}
      </div>

      <div class="bg-primary-900/20 border border-primary-800 rounded-lg p-4">
        <p class="text-sm text-primary-300">
          💡 <strong>Next step:</strong> Download frames and assemble in your video editor, or use our Video Gen tab to create motion
        </p>
      </div>

      <div class="flex justify-between">
        <button onclick="scriptExplainerWorkflow.reset(); showScriptExplainerStep1UI()" class="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600">
          New Script
        </button>
        <button onclick="closeScriptExplainerModal()" class="px-4 py-2 bg-primary-600 rounded-lg hover:bg-primary-700 font-medium">
          Done
        </button>
      </div>
    </div>
  `;
}

// Global workflow instance
const scriptExplainerWorkflow = new ScriptExplainerWorkflow();

/**
 * Run Step 1: Analyze script
 */
async function runScriptExplainerStep1() {
  const script = document.getElementById('explainer-script').value.trim();
  
  if (!script) {
    alert('📝 Paste your script in the box above');
    return;
  }

  if (script.length < 50) {
    alert('✍️ Script is too short - add a bit more (need at least a few sentences)');
    return;
  }

  const status = document.getElementById('explainer-step1-status');
  const statusText = document.getElementById('explainer-step1-text');
  
  status.classList.remove('hidden');
  statusText.textContent = 'Reading your script...';

  try {
    const results = await scriptExplainerWorkflow.analyzeScript(script);
    
    if (!results.style || !results.scenes) {
      alert('Could not analyze script');
      status.classList.add('hidden');
      return;
    }

    showScriptExplainerStep2UI(results);
    
  } catch (error) {
    alert('⚠️ Something went wrong analyzing your script. Try again or simplify it a bit.');
    status.classList.add('hidden');
    console.error('Analysis error:', error);
  }
}

/**
 * Run Step 2: Generate frames
 */
async function runScriptExplainerStep2() {
  const status = document.getElementById('explainer-step2-status');
  const statusText = document.getElementById('explainer-step2-text');
  const progress = document.getElementById('explainer-progress');
  
  status.classList.remove('hidden');
  statusText.textContent = 'Creating your explainer frames...';
  progress.textContent = '0%';

  try {
    const results = await scriptExplainerWorkflow.generateFrames();
    showScriptExplainerStep3UI(results);
    
  } catch (error) {
    alert('⚠️ Something went wrong creating your frames. This usually fixes itself if you try again.');
    status.classList.add('hidden');
    console.error('Generation error:', error);
  }
}
