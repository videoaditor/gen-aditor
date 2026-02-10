// Workflow Modal Logic

let currentWorkflow = null;
let characters = [];

// Create and show modal
function showWorkflowModal(workflow) {
  currentWorkflow = workflow;
  
  // Create modal HTML
  const modalHTML = `
    <div id="workflow-modal" class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div class="bg-gray-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div class="p-6 border-b border-gray-700">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-2xl font-bold">${workflow.name}</h2>
              <p class="text-gray-400 mt-1">${workflow.description}</p>
            </div>
            <button id="close-modal" class="text-gray-400 hover:text-white">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
        
        <form id="workflow-form" class="p-6 space-y-6">
          ${generateFormFields(workflow.params)}
          
          <div class="flex space-x-3 pt-4 border-t border-gray-700">
            <button type="button" id="cancel-workflow" class="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg">
              Cancel
            </button>
            <button type="submit" class="flex-1 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg">
              Generate
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
  
  // Append to body
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  // Add event listeners
  document.getElementById('close-modal').addEventListener('click', closeWorkflowModal);
  document.getElementById('cancel-workflow').addEventListener('click', closeWorkflowModal);
  document.getElementById('workflow-form').addEventListener('submit', handleWorkflowSubmit);
  
  // Close on outside click
  document.getElementById('workflow-modal').addEventListener('click', (e) => {
    if (e.target.id === 'workflow-modal') {
      closeWorkflowModal();
    }
  });
  
  // Load characters if this workflow uses them
  if (workflow.params.some(p => p.type === 'character')) {
    loadCharacters().then(renderCharacterGrid);
    
    // Handle new character button
    const newCharBtn = document.getElementById('new-character-btn');
    if (newCharBtn) {
      newCharBtn.addEventListener('click', showNewCharacterModal);
    }
  }
  
  // Load voices if this workflow uses them
  if (workflow.params.some(p => p.type === 'voice')) {
    loadVoices();
  }
  
  // Handle avatar upload
  const avatarUploadArea = document.querySelector('#avatar-upload')?.parentElement;
  if (avatarUploadArea) {
    avatarUploadArea.addEventListener('click', () => {
      document.getElementById('avatar-upload').click();
    });
    
    document.getElementById('avatar-upload').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const preview = document.getElementById('avatar-preview');
        const previewImg = document.getElementById('avatar-preview-img');
        const reader = new FileReader();
        reader.onload = (e) => {
          previewImg.src = e.target.result;
          preview.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
      }
    });
  }
}

// Generate form fields based on workflow params
function generateFormFields(params) {
  return params.map(param => {
    switch (param.type) {
      case 'textarea':
        return `
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">${param.label}${param.required ? ' *' : ''}</label>
            <textarea 
              name="${param.name}" 
              rows="4" 
              class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 text-white placeholder-gray-400"
              placeholder="${param.default || ''}"
              ${param.required ? 'required' : ''}
            >${param.default || ''}</textarea>
          </div>
        `;
      
      case 'text':
        return `
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">${param.label}${param.required ? ' *' : ''}</label>
            <input 
              type="text"
              name="${param.name}" 
              class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 text-white placeholder-gray-400"
              placeholder="${param.default || ''}"
              value="${param.default || ''}"
              ${param.required ? 'required' : ''}
            />
          </div>
        `;
      
      case 'select':
        return `
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">${param.label}${param.required ? ' *' : ''}</label>
            <select 
              name="${param.name}" 
              class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 text-white"
              ${param.required ? 'required' : ''}
            >
              ${param.options.map(opt => 
                `<option value="${opt}" ${opt === param.default ? 'selected' : ''}>${opt}</option>`
              ).join('')}
            </select>
          </div>
        `;
      
      case 'number':
        return `
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">${param.label}${param.required ? ' *' : ''}</label>
            <input 
              type="number"
              name="${param.name}" 
              class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 text-white"
              value="${param.default !== undefined ? param.default : ''}"
              ${param.required ? 'required' : ''}
            />
          </div>
        `;
      
      case 'slider':
        return `
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">${param.label}${param.required ? ' *' : ''}</label>
            <div class="flex items-center space-x-4">
              <input 
                type="range"
                name="${param.name}" 
                min="${param.min || 0}"
                max="${param.max || 100}"
                value="${param.default || 50}"
                class="flex-1"
                oninput="this.nextElementSibling.textContent = this.value"
              />
              <span class="text-lg font-semibold text-primary-500 w-16 text-right">${param.default || 50}</span>
            </div>
          </div>
        `;
      
      case 'file':
        return `
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">${param.label}${param.required ? ' *' : ''}</label>
            <input 
              type="file"
              name="${param.name}" 
              accept="${param.accept || '*'}"
              class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-600 file:text-white hover:file:bg-primary-700"
              ${param.required ? 'required' : ''}
            />
          </div>
        `;
      
      case 'voice':
        return `
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">${param.label}${param.required ? ' *' : ''}</label>
            <div class="relative">
              <input 
                type="text"
                id="voice-search"
                class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 text-white placeholder-gray-400"
                placeholder="Search voices..."
                autocomplete="off"
              />
              <div id="voice-dropdown" class="hidden absolute z-10 w-full mt-1 bg-gray-700 border border-gray-600 rounded-lg max-h-64 overflow-y-auto">
                <div class="p-2 text-gray-400 text-sm text-center">Loading voices...</div>
              </div>
            </div>
            <input type="hidden" name="${param.name}" id="selected-voice" ${param.required ? 'required' : ''} />
            <div id="selected-voice-display" class="hidden mt-2 p-2 bg-gray-700 rounded text-sm">
              <span id="selected-voice-name"></span>
            </div>
          </div>
        `;
      
      case 'avatar':
        return `
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">${param.label}${param.required ? ' *' : ''}</label>
            <div class="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center hover:border-primary-500 transition-colors cursor-pointer">
              <input type="file" name="${param.name}" id="avatar-upload" accept="image/*,video/*" class="hidden" ${param.required ? 'required' : ''}>
              <svg class="w-12 h-12 mx-auto mb-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
              </svg>
              <p class="text-gray-400 mb-1">Click to upload creator photo/video</p>
              <p class="text-xs text-gray-500">PNG, JPG, MP4 up to 10MB</p>
            </div>
            <div id="avatar-preview" class="hidden mt-3">
              <img id="avatar-preview-img" class="w-32 h-32 object-cover rounded-lg mx-auto">
            </div>
          </div>
        `;
      
      case 'character':
        return `
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">${param.label}${param.required ? ' *' : ''}</label>
            <div id="character-picker" class="space-y-3">
              <div class="grid grid-cols-2 gap-3" id="character-grid">
                <p class="text-gray-400 col-span-2 text-center py-4">Loading characters...</p>
              </div>
              <button type="button" id="new-character-btn" class="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">
                + Create New Character
              </button>
            </div>
            <input type="hidden" name="${param.name}" id="selected-character" ${param.required ? 'required' : ''} />
          </div>
        `;
      
      default:
        return '';
    }
  }).join('');
}

// Load voices from ElevenLabs
let voices = [];

async function loadVoices() {
  try {
    const res = await fetch(`${API_BASE}/api/elevenlabs/voices`);
    const data = await res.json();
    voices = data.voices || [];
    
    // Set up voice search
    const searchInput = document.getElementById('voice-search');
    const dropdown = document.getElementById('voice-dropdown');
    
    if (!searchInput || !dropdown) return;
    
    // Show dropdown on focus
    searchInput.addEventListener('focus', () => {
      renderVoiceDropdown(voices);
      dropdown.classList.remove('hidden');
    });
    
    // Filter on input
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      const filtered = voices.filter(v => 
        v.name.toLowerCase().includes(query) || 
        (v.labels && Object.values(v.labels).some(l => l.toLowerCase().includes(query)))
      );
      renderVoiceDropdown(filtered);
    });
    
    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
      }
    });
    
  } catch (error) {
    console.error('Failed to load voices:', error);
    const dropdown = document.getElementById('voice-dropdown');
    if (dropdown) {
      dropdown.innerHTML = '<div class="p-2 text-red-400 text-sm text-center">Failed to load voices</div>';
    }
  }
}

function renderVoiceDropdown(voiceList) {
  const dropdown = document.getElementById('voice-dropdown');
  if (!dropdown) return;
  
  if (voiceList.length === 0) {
    dropdown.innerHTML = '<div class="p-2 text-gray-400 text-sm text-center">No voices found</div>';
    return;
  }
  
  dropdown.innerHTML = voiceList.map(voice => `
    <div class="voice-item p-3 hover:bg-gray-600 cursor-pointer border-b border-gray-600 last:border-0" data-voice-id="${voice.id}" data-voice-name="${voice.name}">
      <div class="font-medium text-white">${voice.name}</div>
      ${voice.labels ? `<div class="text-xs text-gray-400">${Object.entries(voice.labels).map(([k,v]) => v).join(', ')}</div>` : ''}
    </div>
  `).join('');
  
  // Add click handlers
  dropdown.querySelectorAll('.voice-item').forEach(item => {
    item.addEventListener('click', () => {
      const voiceId = item.dataset.voiceId;
      const voiceName = item.dataset.voiceName;
      
      document.getElementById('selected-voice').value = voiceId;
      document.getElementById('voice-search').value = voiceName;
      document.getElementById('selected-voice-name').textContent = `Selected: ${voiceName}`;
      document.getElementById('selected-voice-display').classList.remove('hidden');
      dropdown.classList.add('hidden');
    });
  });
}

// Load characters
async function loadCharacters() {
  try {
    const res = await fetch(`${API_BASE}/api/characters`);
    const data = await res.json();
    characters = data.characters || [];
    return characters;
  } catch (error) {
    console.error('Failed to load characters:', error);
    return [];
  }
}

// Render character grid
function renderCharacterGrid() {
  const grid = document.getElementById('character-grid');
  if (!grid) return;
  
  if (characters.length === 0) {
    grid.innerHTML = '<p class="text-gray-400 col-span-2 text-center py-4">No characters yet. Create one!</p>';
    return;
  }
  
  grid.innerHTML = characters.map(char => `
    <div class="character-card p-3 bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-600 transition-colors border-2 border-transparent" data-character-id="${char.id}">
      <img src="${char.avatarUrl}" class="w-full h-24 object-cover rounded mb-2" />
      <div class="text-sm font-medium">${char.name}</div>
      <div class="text-xs text-gray-400">Voice: ${char.voiceId.substring(0, 8)}...</div>
    </div>
  `).join('');
  
  // Add click handlers
  document.querySelectorAll('.character-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.character-card').forEach(c => {
        c.classList.remove('border-primary-500');
      });
      card.classList.add('border-primary-500');
      document.getElementById('selected-character').value = card.dataset.characterId;
    });
  });
}

// Close modal
function closeWorkflowModal() {
  const modal = document.getElementById('workflow-modal');
  if (modal) {
    modal.remove();
  }
  currentWorkflow = null;
}

// Handle form submission
async function handleWorkflowSubmit(e) {
  e.preventDefault();
  
  const form = e.target;
  const formData = new FormData(form);
  const params = {};
  
  // Convert form data to params object
  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      // Convert file to base64
      params[key] = await fileToBase64(value);
    } else {
      params[key] = value;
    }
  }
  
  // Show loading state
  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Generating...';
  
  try {
    // Handle UGC workflow specially
    if (currentWorkflow.id === 'script-to-ugc') {
      const voiceId = params.voice;
      const avatarFile = params.avatar; // Base64 data URL
      
      if (!voiceId) {
        throw new Error('Please select a voice');
      }
      
      if (!avatarFile) {
        throw new Error('Please upload a creator avatar');
      }
      
      const response = await fetch(`${API_BASE}/api/ugc/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: params.script,
          voiceId: voiceId,
          avatarFile: avatarFile, // Base64 image
          outputFolder: params.outputFolder || undefined
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Generation failed');
      }
      
      // Close modal
      closeWorkflowModal();
      
      // Show success with drive folder info
      alert(`UGC Video job started!\n\nJob ID: ${data.jobId}\nOutput folder: ${data.folderName}\n\nYou'll receive a Slack notification when complete.`);
      
      return;
    }
    
    // Submit to API (for other workflows)
    const response = await fetch(`${API_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId: currentWorkflow.id,
        params
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Generation failed');
    }
    
    // Close modal
    closeWorkflowModal();
    
    // Show success message
    alert(`Job started! Job ID: ${data.jobId}`);
    
    // Poll for results
    pollJob(data.jobId);
    
  } catch (error) {
    alert(`Error: ${error.message}`);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Generate';
  }
}

// Convert file to base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Poll job status
async function pollJob(jobId, maxRetries = 60) {
  let retries = 0;
  
  const poll = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/jobs/${jobId}`);
      const job = await response.json();
      
      if (job.status === 'completed') {
        showJobResults(job);
        return;
      } else if (job.status === 'failed') {
        alert(`Job failed: ${job.error || 'Unknown error'}`);
        return;
      } else if (retries >= maxRetries) {
        alert('Job timed out');
        return;
      }
      
      retries++;
      setTimeout(poll, 3000);
      
    } catch (error) {
      console.error('Poll error:', error);
      setTimeout(poll, 3000);
    }
  };
  
  poll();
}

// Show new character modal
function showNewCharacterModal() {
  const modalHTML = `
    <div id="new-character-modal" class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div class="bg-gray-800 rounded-xl max-w-md w-full">
        <div class="p-6 border-b border-gray-700">
          <div class="flex items-center justify-between">
            <h2 class="text-xl font-bold">Create New Character</h2>
            <button id="close-char-modal" class="text-gray-400 hover:text-white">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
        
        <form id="new-character-form" class="p-6 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Character Name *</label>
            <input 
              type="text"
              name="name"
              class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 text-white"
              placeholder="e.g., Sarah - Energetic"
              required
            />
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">ElevenLabs Voice ID *</label>
            <input 
              type="text"
              name="voiceId"
              class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 text-white font-mono text-sm"
              placeholder="21m00Tcm4TlvDq8ikWAM"
              required
            />
            <p class="text-xs text-gray-400 mt-1">Get this from ElevenLabs → Voices → Copy Voice ID</p>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Avatar Image *</label>
            <input 
              type="file"
              name="avatar"
              accept="image/*"
              class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-600 file:text-white hover:file:bg-primary-700"
              required
            />
          </div>
          
          <div class="flex space-x-3 pt-4">
            <button type="button" id="cancel-char" class="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg">
              Cancel
            </button>
            <button type="submit" class="flex-1 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg">
              Create Character
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  document.getElementById('close-char-modal').addEventListener('click', () => {
    document.getElementById('new-character-modal').remove();
  });
  
  document.getElementById('cancel-char').addEventListener('click', () => {
    document.getElementById('new-character-modal').remove();
  });
  
  document.getElementById('new-character-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const name = formData.get('name');
    const voiceId = formData.get('voiceId');
    const avatarFile = formData.get('avatar');
    
    // Convert avatar to base64
    const avatarBase64 = await fileToBase64(avatarFile);
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating...';
    
    try {
      const response = await fetch(`${API_BASE}/api/characters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          voiceId,
          avatarUrl: avatarBase64
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create character');
      }
      
      // Reload characters
      await loadCharacters();
      renderCharacterGrid();
      
      // Close modal
      document.getElementById('new-character-modal').remove();
      
      alert('Character created successfully!');
      
    } catch (error) {
      alert(`Error: ${error.message}`);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Character';
    }
  });
}

// Show job results
function showJobResults(job) {
  if (!job.outputs || job.outputs.length === 0) {
    alert('Job completed but no outputs found');
    return;
  }
  
  // Create results modal
  const resultsHTML = `
    <div id="results-modal" class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div class="bg-gray-800 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div class="p-6 border-b border-gray-700">
          <div class="flex items-center justify-between">
            <h2 class="text-2xl font-bold">Results Ready!</h2>
            <button id="close-results" class="text-gray-400 hover:text-white">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
        
        <div class="p-6">
          <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
            ${job.outputs.map(url => `
              <div class="relative group">
                <img src="${url}" class="w-full h-auto rounded-lg" />
                <a href="${url}" download class="absolute inset-0 bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                  </svg>
                </a>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', resultsHTML);
  
  document.getElementById('close-results').addEventListener('click', () => {
    document.getElementById('results-modal').remove();
  });
}
