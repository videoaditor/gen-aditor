/**
 * Selection & Video Queue Management
 * Allows users to select images and convert them to videos
 */

class SelectionQueue {
  constructor() {
    this.selections = [];
    this.videoJobs = [];
    this.pollInterval = null;
  }

  /**
   * Initialize the selection system
   */
  init() {
    this.loadSelections();
    this.loadVideoQueue();
    this.startPolling();
  }

  /**
   * Add image to selection
   */
  async addToSelection(imageUrl, workflow, prompt = '') {
    try {
      const response = await fetch('/api/selection/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl, workflow, prompt })
      });

      const data = await response.json();
      this.selections = data.selections || [];
      this.renderSelections();

      return data;
    } catch (error) {
      console.error('Add to selection failed:', error);
      throw error;
    }
  }

  /**
   * Remove from selection
   */
  async removeFromSelection(id) {
    try {
      const response = await fetch(`/api/selection/remove/${id}`, {
        method: 'DELETE'
      });

      const data = await response.json();
      this.selections = data.selections || [];
      this.renderSelections();

      return data;
    } catch (error) {
      console.error('Remove from selection failed:', error);
      throw error;
    }
  }

  /**
   * Clear all selections
   */
  async clearSelections() {
    try {
      const response = await fetch('/api/selection/clear', {
        method: 'DELETE'
      });

      const data = await response.json();
      this.selections = [];
      this.renderSelections();

      return data;
    } catch (error) {
      console.error('Clear selections failed:', error);
      throw error;
    }
  }

  /**
   * Load selections from API
   */
  async loadSelections() {
    try {
      const response = await fetch('/api/selection/list');
      const data = await response.json();
      this.selections = data.selections || [];
      this.renderSelections();
    } catch (error) {
      console.error('Load selections failed:', error);
    }
  }

  /**
   * Create video from selection
   */
  async createVideo(imageUrl, prompt, duration = 6, aspectRatio = '9:16') {
    try {
      const response = await fetch('/api/video-queue/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl, prompt, duration, aspectRatio })
      });

      const data = await response.json();
      this.loadVideoQueue(); // Refresh queue

      return data;
    } catch (error) {
      console.error('Create video failed:', error);
      throw error;
    }
  }

  /**
   * Load video queue from API
   */
  async loadVideoQueue() {
    try {
      const response = await fetch('/api/video-queue/list');
      const data = await response.json();
      this.videoJobs = data.jobs || [];
      this.renderVideoQueue();
    } catch (error) {
      console.error('Load video queue failed:', error);
    }
  }

  /**
   * Delete video job
   */
  async deleteVideoJob(id) {
    try {
      await fetch(`/api/video-queue/delete/${id}`, {
        method: 'DELETE'
      });

      this.loadVideoQueue(); // Refresh
    } catch (error) {
      console.error('Delete video job failed:', error);
      throw error;
    }
  }

  /**
   * Clear completed jobs
   */
  async clearCompletedJobs() {
    try {
      await fetch('/api/video-queue/clear-completed', {
        method: 'DELETE'
      });

      this.loadVideoQueue(); // Refresh
    } catch (error) {
      console.error('Clear completed jobs failed:', error);
      throw error;
    }
  }

  /**
   * Start polling for job updates
   */
  startPolling() {
    if (this.pollInterval) return;

    this.pollInterval = setInterval(() => {
      // Only poll if there are active jobs
      const hasActiveJobs = this.videoJobs.some(
        j => j.status === 'queued' || j.status === 'processing'
      );

      if (hasActiveJobs) {
        this.loadVideoQueue();
      }
    }, 3000); // Poll every 3 seconds
  }

  /**
   * Stop polling
   */
  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Render selections UI
   */
  renderSelections() {
    const container = document.getElementById('selections-container');
    if (!container) return;

    if (this.selections.length === 0) {
      container.innerHTML = `
        <div class="text-center py-12 text-gray-400">
          <svg class="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
          <p>No images selected yet</p>
          <p class="text-sm mt-2">Use workflow results to add images here</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-semibold">${this.selections.length} Selected</h3>
        <button onclick="selectionQueue.clearSelections()" class="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm">
          Clear All
        </button>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        ${this.selections.map(s => `
          <div class="relative group bg-gray-800 rounded-lg overflow-hidden">
            <img src="${s.imageUrl}" alt="Selected" class="w-full h-48 object-cover">
            <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all flex items-center justify-center">
              <div class="opacity-0 group-hover:opacity-100 transition-all space-x-2">
                <button 
                  onclick="selectionQueue.showVideoDialog('${s.id}', '${s.imageUrl}', '${s.prompt}')"
                  class="px-3 py-1 bg-primary-600 hover:bg-primary-700 rounded text-sm"
                >
                  Create Video
                </button>
                <button 
                  onclick="selectionQueue.removeFromSelection('${s.id}')"
                  class="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
                >
                  Remove
                </button>
              </div>
            </div>
            <div class="p-2 text-xs text-gray-400">
              <div class="truncate">${s.workflow}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  /**
   * Render video queue UI
   */
  renderVideoQueue() {
    const container = document.getElementById('video-queue-container');
    if (!container) return;

    if (this.videoJobs.length === 0) {
      container.innerHTML = `
        <div class="text-center py-12 text-gray-400">
          <svg class="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
          </svg>
          <p>No videos in queue</p>
          <p class="text-sm mt-2">Select images and create videos to see them here</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-semibold">${this.videoJobs.length} Jobs</h3>
        <button onclick="selectionQueue.clearCompletedJobs()" class="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm">
          Clear Completed
        </button>
      </div>
      <div class="space-y-4">
        ${this.videoJobs.map(job => this.renderVideoJob(job)).join('')}
      </div>
    `;
  }

  /**
   * Render individual video job
   */
  renderVideoJob(job) {
    const statusColors = {
      queued: 'bg-yellow-600',
      processing: 'bg-blue-600',
      completed: 'bg-green-600',
      failed: 'bg-red-600'
    };

    const statusColor = statusColors[job.status] || 'bg-gray-600';

    return `
      <div class="bg-gray-800 rounded-lg p-4">
        <div class="flex items-start space-x-4">
          <img src="${job.imageUrl}" alt="Source" class="w-24 h-24 object-cover rounded">
          <div class="flex-1">
            <div class="flex justify-between items-start mb-2">
              <div>
                <div class="font-semibold truncate">${job.prompt}</div>
                <div class="text-xs text-gray-400">${job.duration}s • ${job.aspectRatio}</div>
              </div>
              <span class="${statusColor} px-2 py-1 rounded text-xs font-medium">${job.status}</span>
            </div>

            ${job.status === 'processing' ? `
              <div class="mt-2">
                <div class="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div class="h-full bg-primary-600 transition-all" style="width: ${job.progress}%"></div>
                </div>
                <div class="text-xs text-gray-400 mt-1">${job.progress}% complete</div>
              </div>
            ` : ''}

            ${job.status === 'completed' && job.videoUrl ? `
              <div class="mt-2 space-x-2">
                <a href="${job.videoUrl}" target="_blank" class="inline-block px-3 py-1 bg-primary-600 hover:bg-primary-700 rounded text-sm">
                  Download Video
                </a>
                <button onclick="selectionQueue.deleteVideoJob('${job.id}')" class="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm">
                  Remove
                </button>
              </div>
            ` : ''}

            ${job.status === 'failed' ? `
              <div class="mt-2 text-red-400 text-sm">${job.error || 'Generation failed'}</div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Show video creation dialog
   */
  showVideoDialog(selectionId, imageUrl, defaultPrompt = '') {
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50';
    modal.innerHTML = `
      <div class="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
        <h3 class="text-xl font-bold mb-4">Create Video</h3>
        
        <div class="mb-4">
          <label class="block text-sm font-medium mb-2">Video Prompt</label>
          <textarea id="video-prompt" class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:border-primary-500" rows="3" placeholder="Describe the video motion...">${defaultPrompt}</textarea>
        </div>

        <div class="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label class="block text-sm font-medium mb-2">Duration</label>
            <select id="video-duration" class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:border-primary-500">
              <option value="4">4 seconds</option>
              <option value="6" selected>6 seconds</option>
              <option value="8">8 seconds</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium mb-2">Aspect Ratio</label>
            <select id="video-aspect" class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:border-primary-500">
              <option value="9:16" selected>9:16 (Portrait)</option>
              <option value="16:9">16:9 (Landscape)</option>
              <option value="1:1">1:1 (Square)</option>
            </select>
          </div>
        </div>

        <div class="flex space-x-3">
          <button onclick="this.closest('.fixed').remove()" class="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded">
            Cancel
          </button>
          <button onclick="selectionQueue.confirmCreateVideo('${imageUrl}', this)" class="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded font-semibold">
            Create Video
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  /**
   * Confirm video creation
   */
  async confirmCreateVideo(imageUrl, button) {
    const modal = button.closest('.fixed');
    const prompt = document.getElementById('video-prompt').value.trim();
    const duration = parseInt(document.getElementById('video-duration').value);
    const aspectRatio = document.getElementById('video-aspect').value;

    if (!prompt) {
      alert('Please enter a video prompt');
      return;
    }

    try {
      button.disabled = true;
      button.textContent = 'Creating...';

      await this.createVideo(imageUrl, prompt, duration, aspectRatio);

      modal.remove();

      // Show success message
      alert('Video job created! Check the Video Queue tab for progress.');

    } catch (error) {
      alert('Failed to create video: ' + error.message);
      button.disabled = false;
      button.textContent = 'Create Video';
    }
  }
}

// Global instance
const selectionQueue = new SelectionQueue();

// Expose globally for easy access from workflows
window.selectionQueue = selectionQueue;

// Helper function for workflows to add images
window.addImageToSelection = function(imageUrl, workflow, prompt = '') {
  return selectionQueue.addToSelection(imageUrl, workflow, prompt);
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => selectionQueue.init());
} else {
  selectionQueue.init();
}
