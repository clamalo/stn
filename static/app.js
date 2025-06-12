let recording = false;
let recognizer = null;
const btn = document.getElementById('mic');
const status = document.getElementById('status');
const authForms = document.getElementById('auth-forms');
const userInfo = document.getElementById('user-info');
const mainContent = document.getElementById('main-content');
const usernameSpan = document.getElementById('current-user');

document.getElementById('signup-btn').addEventListener('click', signup);
document.getElementById('login-btn').addEventListener('click', login);
document.getElementById('logout-btn').addEventListener('click', logout);

async function signup() {
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value.trim();
  if (!username || !password) {
    alert('Username and password required');
    return;
  }
  const r = await fetch('/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await r.json();
  if (!r.ok) {
    alert(data.error || 'Signup failed');
    return;
  }
  setLoggedIn(data.username);
}

async function login() {
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value.trim();
  if (!username || !password) {
    alert('Username and password required');
    return;
  }
  const r = await fetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await r.json();
  if (!r.ok) {
    alert(data.error || 'Login failed');
    return;
  }
  setLoggedIn(data.username);
}

async function logout() {
  await fetch('/logout', { method: 'POST' });
  authForms.style.display = 'flex';
  userInfo.style.display = 'none';
  mainContent.style.display = 'none';
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

function setLoggedIn(name) {
  usernameSpan.textContent = name;
  authForms.style.display = 'none';
  userInfo.style.display = 'flex';
  mainContent.style.display = 'block';
  loadBuckets();
  if (!refreshInterval) {
    refreshInterval = setInterval(loadBuckets, 30000);
  }
}

async function checkAuth() {
  const r = await fetch('/current_user');
  const data = await r.json();
  if (data.username) {
    setLoggedIn(data.username);
  }
}

// Project view functionality
let currentProject = null;
let refreshInterval = null;

btn.addEventListener('click', () => {
  if (!recording) {
    start();
  } else {
    stop();
  }
});

function updateStatus(message, type = '') {
  status.textContent = message;
  status.className = 'status';
  if (type) {
    status.classList.add(type);
  }
}

function start() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    updateStatus('Speech recognition not supported in this browser', 'error');
    return;
  }
  
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognizer = new SR();
  recognizer.lang = 'en-US';
  recognizer.interimResults = false;
  
  recognizer.onresult = (e) => {
    const text = e.results[0][0].transcript;
    updateStatus(`Processing: "${text}"`, 'processing');
    
    fetch('/process_note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    })
    .then(r => r.json())
    .then(data => {
      updateStatus(`✅ Saved to ${data.bucket}`, 'success');
      loadBuckets();
      
      // Clear status after 3 seconds
      setTimeout(() => {
        updateStatus('Click the microphone to start recording');
      }, 3000);
    })
    .catch(err => {
      console.error(err);
      updateStatus('❌ Failed to save note', 'error');
      
      // Clear status after 3 seconds
      setTimeout(() => {
        updateStatus('Click the microphone to start recording');
      }, 3000);
    });
  };
  
  recognizer.onerror = (e) => {
    console.error(e);
    let errorMessage = 'Recording error';
    
    switch (e.error) {
      case 'no-speech':
        errorMessage = 'No speech detected. Please try again.';
        break;
      case 'audio-capture':
        errorMessage = 'Microphone access denied or unavailable';
        break;
      case 'not-allowed':
        errorMessage = 'Microphone permission denied';
        break;
      case 'network':
        errorMessage = 'Network error occurred';
        break;
      default:
        errorMessage = `Recording error: ${e.error}`;
    }
    
    updateStatus(errorMessage, 'error');
    stop();
    
    // Clear status after 3 seconds
    setTimeout(() => {
      updateStatus('Click the microphone to start recording');
    }, 3000);
  };
  
  recognizer.onend = () => {
    stop();
  };
  
  recording = true;
  btn.classList.add('recording');
  btn.textContent = '🛑';
  updateStatus('🎤 Listening... Speak now', 'listening');
  
  try {
    recognizer.start();
  } catch (error) {
    console.error('Failed to start recognition:', error);
    updateStatus('Failed to start recording', 'error');
    stop();
  }
}

function stop() {
  recording = false;
  btn.classList.remove('recording');
  btn.textContent = '🎙️';
  
  if (recognizer) {
    try {
      recognizer.stop();
    } catch (error) {
      console.error('Error stopping recognition:', error);
    }
  }
}

function createBucketCard(bucket) {
  const card = document.createElement('div');
  card.className = 'bucket-card fade-in';
  
  const sideClass = bucket.side.toLowerCase();
  const noteText = bucket.note_count === 1 ? 'note' : 'notes';
  const canEdit = bucket.name !== 'Scratchpad';
  
  card.innerHTML = `
    <div class="bucket-header">
      <div>
        <div class="bucket-name" data-original-name="${bucket.name}">${bucket.name}</div>
        <div class="bucket-stats">
          <span class="note-count">${bucket.note_count}</span> ${noteText}
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <span class="bucket-side ${sideClass}">${bucket.side}</span>
        ${canEdit ? `
          <div class="bucket-actions">
            <button class="bucket-action-btn edit" title="Edit project name">
              ✏️
            </button>
            <button class="bucket-action-btn delete" title="Delete project">
              🗑️
            </button>
          </div>
        ` : ''}
      </div>
    </div>
  `;
  
  // Add click handler to open project
  card.addEventListener('click', (e) => {
    // Don't open project if clicking on action buttons
    if (e.target.closest('.bucket-actions') || e.target.closest('.bucket-edit-actions')) {
      return;
    }
    openProject(bucket);
  });
  
  // Add cursor pointer style
  card.style.cursor = 'pointer';
  
  if (canEdit) {
    // Add event listeners for edit and delete buttons
    const editBtn = card.querySelector('.bucket-action-btn.edit');
    const deleteBtn = card.querySelector('.bucket-action-btn.delete');
    
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      startEditBucket(card, bucket);
    });
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteBucket(bucket);
    });
  }
  
  return card;
}

function loadBuckets() {
  const bucketsContainer = document.getElementById('buckets');
  const bucketsCount = document.getElementById('buckets-count');
  
  // Show loading state
  bucketsContainer.innerHTML = `
    <div class="empty-state">
      <div class="loading-spinner"></div>
      <p>Loading projects...</p>
    </div>
  `;
  
  fetch('/buckets')
    .then(r => r.json())
    .then(data => {
      const buckets = data.buckets || [];
      
      // Update count
      const totalNotes = buckets.reduce((sum, b) => sum + b.note_count, 0);
      const bucketText = buckets.length === 1 ? 'project' : 'projects';
      const noteText = totalNotes === 1 ? 'note' : 'notes';
      bucketsCount.textContent = `${buckets.length} ${bucketText} • ${totalNotes} ${noteText}`;
      
      // Clear container
      bucketsContainer.innerHTML = '';
      
      if (buckets.length === 0) {
        bucketsContainer.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">📁</div>
            <p>No projects yet. Start by recording your first note!</p>
          </div>
        `;
        return;
      }
      
      // Sort buckets: non-Scratchpad first, then by note count
      buckets.sort((a, b) => {
        if (a.name === 'Scratchpad' && b.name !== 'Scratchpad') return 1;
        if (b.name === 'Scratchpad' && a.name !== 'Scratchpad') return -1;
        return b.note_count - a.note_count;
      });
      
      // Create bucket cards
      buckets.forEach((bucket, index) => {
        const card = createBucketCard(bucket);
        // Stagger animations
        card.style.animationDelay = `${index * 0.1}s`;
        bucketsContainer.appendChild(card);
      });
    })
    .catch(err => {
      console.error('Failed to load buckets:', err);
      bucketsContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">⚠️</div>
          <p>Failed to load projects. Please refresh the page.</p>
        </div>
      `;
      bucketsCount.textContent = 'Error loading data';
    });
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Space bar to toggle recording
  if (e.code === 'Space' && e.target === document.body) {
    e.preventDefault();
    if (!recording) {
      start();
    } else {
      stop();
    }
  }
  
  // Escape to stop recording
  if (e.code === 'Escape' && recording) {
    stop();
  }
});

// Load buckets on page load
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();

  // Check for microphone permissions
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(() => {
        console.log('Microphone permission granted');
      })
      .catch((err) => {
        console.warn('Microphone permission denied:', err);
        updateStatus('Microphone permission needed for voice recording', 'error');
      });
  }
});


function startEditBucket(card, bucket) {
  const nameElement = card.querySelector('.bucket-name');
  const originalName = nameElement.getAttribute('data-original-name');
  const actionsElement = card.querySelector('.bucket-actions');
  
  // Hide actions and show edit form
  actionsElement.style.display = 'none';
  
  // Replace name with input
  nameElement.innerHTML = `
    <input type="text" class="bucket-name-input" value="${originalName}" maxlength="60">
    <div class="bucket-edit-actions">
      <button class="bucket-edit-btn save">Save</button>
      <button class="bucket-edit-btn cancel">Cancel</button>
    </div>
  `;
  
  const input = nameElement.querySelector('.bucket-name-input');
  const saveBtn = nameElement.querySelector('.bucket-edit-btn.save');
  const cancelBtn = nameElement.querySelector('.bucket-edit-btn.cancel');
  
  // Focus input and select text
  input.focus();
  input.select();
  
  // Handle save
  const handleSave = async () => {
    const newName = input.value.trim();
    
    if (!newName) {
      alert('Project name cannot be empty');
      return;
    }
    
    if (newName === originalName) {
      cancelEdit();
      return;
    }
    
    try {
      const response = await fetch(`/buckets/${bucket.side}/${encodeURIComponent(originalName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_name: newName })
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to rename project');
      }
      
      // Success - reload buckets
      loadBuckets();
      updateStatus(`✅ Renamed project to "${newName}"`, 'success');
      
      // Clear status after 3 seconds
      setTimeout(() => {
        updateStatus('Click the microphone to start recording');
      }, 3000);
      
    } catch (error) {
      console.error('Error renaming bucket:', error);
      alert(`Failed to rename project: ${error.message}`);
      cancelEdit();
    }
  };
  
  // Handle cancel
  const cancelEdit = () => {
    nameElement.textContent = originalName;
    actionsElement.style.display = 'flex';
  };
  
  // Event listeners
  saveBtn.addEventListener('click', handleSave);
  cancelBtn.addEventListener('click', cancelEdit);
  
  // Handle Enter key
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  });
}

async function deleteBucket(bucket) {
  const confirmMessage = `Are you sure you want to delete the project "${bucket.name}"?\n\nThis will also delete all ${bucket.note_count} notes in this project. This action cannot be undone.`;
  
  if (!confirm(confirmMessage)) {
    return;
  }
  
  try {
    const response = await fetch(`/buckets/${bucket.side}/${encodeURIComponent(bucket.name)}`, {
      method: 'DELETE'
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Failed to delete project');
    }
    
    // Success - reload buckets
    loadBuckets();
    updateStatus(`✅ Deleted project "${bucket.name}"`, 'success');
    
    // Clear status after 3 seconds
    setTimeout(() => {
      updateStatus('Click the microphone to start recording');
    }, 3000);
    
  } catch (error) {
    console.error('Error deleting bucket:', error);
    alert(`Failed to delete project: ${error.message}`);
  }
}

function openProject(bucket) {
  currentProject = bucket;
  
  // Update project header
  document.getElementById('project-title').textContent = bucket.name;
  document.getElementById('project-side').textContent = bucket.side;
  document.getElementById('project-side').className = `bucket-side ${bucket.side.toLowerCase()}`;
  
  const noteText = bucket.note_count === 1 ? 'note' : 'notes';
  document.getElementById('project-note-count').textContent = `${bucket.note_count} ${noteText}`;
  
  // Hide buckets section and show project view
  document.querySelector('.buckets-section').style.display = 'none';
  document.getElementById('project-view').classList.add('active');
  
  // Load notes for this project
  loadProjectNotes(bucket.side, bucket.name);
}

function closeProject() {
  currentProject = null;
  
  // Show buckets section and hide project view
  document.querySelector('.buckets-section').style.display = 'block';
  document.getElementById('project-view').classList.remove('active');
  
  // Refresh buckets in case notes were modified
  loadBuckets();
}

async function loadProjectNotes(side, name) {
  const notesList = document.getElementById('notes-list');
  
  // Show loading state
  notesList.innerHTML = `
    <div class="empty-state">
      <div class="loading-spinner"></div>
      <p>Loading notes...</p>
    </div>
  `;
  
  try {
    const response = await fetch(`/buckets/${encodeURIComponent(side)}/${encodeURIComponent(name)}/notes`);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to load notes');
    }
    
    const notes = data.notes || [];
    
    // Clear container
    notesList.innerHTML = '';
    
    if (notes.length === 0) {
      notesList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📝</div>
          <p>No notes in this project yet.</p>
        </div>
      `;
      return;
    }
    
    // Create note cards
    notes.forEach((note, index) => {
      const card = createNoteCard(note);
      // Stagger animations
      card.style.animationDelay = `${index * 0.1}s`;
      notesList.appendChild(card);
    });
    
  } catch (error) {
    console.error('Failed to load notes:', error);
    notesList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <p>Failed to load notes. Please try again.</p>
      </div>
    `;
  }
}

function createNoteCard(note) {
  const card = document.createElement('div');
  card.className = 'note-card fade-in';
  
  const createdDate = new Date(note.created_at).toLocaleString();
  const updatedDate = note.updated_at ? new Date(note.updated_at).toLocaleString() : null;
  
  card.innerHTML = `
    <div class="note-header">
      <div class="note-date">
        Created: ${createdDate}
        ${updatedDate ? `<br>Updated: ${updatedDate}` : ''}
      </div>
      <div class="note-actions">
        <button class="note-action-btn edit" title="Edit note">
          ✏️
        </button>
        <button class="note-action-btn delete" title="Delete note">
          🗑️
        </button>
      </div>
    </div>
    <div class="note-text" data-original-text="${note.clean_text}">${note.clean_text}</div>
  `;
  
  // Add event listeners
  const editBtn = card.querySelector('.note-action-btn.edit');
  const deleteBtn = card.querySelector('.note-action-btn.delete');
  
  editBtn.addEventListener('click', () => startEditNote(card, note));
  deleteBtn.addEventListener('click', () => deleteNote(note));
  
  return card;
}

function startEditNote(card, note) {
  const textElement = card.querySelector('.note-text');
  const originalText = textElement.getAttribute('data-original-text');
  const actionsElement = card.querySelector('.note-actions');
  
  // Hide actions
  actionsElement.style.display = 'none';
  
  // Replace text with textarea
  textElement.innerHTML = `
    <textarea class="note-text-input">${originalText}</textarea>
    <div class="note-edit-actions">
      <button class="note-edit-btn save">Save</button>
      <button class="note-edit-btn cancel">Cancel</button>
    </div>
  `;
  
  const textarea = textElement.querySelector('.note-text-input');
  const saveBtn = textElement.querySelector('.note-edit-btn.save');
  const cancelBtn = textElement.querySelector('.note-edit-btn.cancel');
  
  // Focus textarea and adjust height
  textarea.focus();
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
  
  // Auto-resize textarea
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  });
  
  // Handle save
  const handleSave = async () => {
    const newText = textarea.value.trim();
    
    if (!newText) {
      alert('Note text cannot be empty');
      return;
    }
    
    if (newText === originalText) {
      cancelEdit();
      return;
    }
    
    try {
      const response = await fetch(`/notes/${note.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newText })
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to update note');
      }
      
      // Success - reload notes
      loadProjectNotes(currentProject.side, currentProject.name);
      updateStatus('✅ Note updated successfully', 'success');
      
      // Clear status after 3 seconds
      setTimeout(() => {
        updateStatus('Click the microphone to start recording');
      }, 3000);
      
    } catch (error) {
      console.error('Error updating note:', error);
      alert(`Failed to update note: ${error.message}`);
      cancelEdit();
    }
  };
  
  // Handle cancel
  const cancelEdit = () => {
    textElement.textContent = originalText;
    textElement.setAttribute('data-original-text', originalText);
    actionsElement.style.display = 'flex';
  };
  
  // Event listeners
  saveBtn.addEventListener('click', handleSave);
  cancelBtn.addEventListener('click', cancelEdit);
  
  // Handle keyboard shortcuts
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  });
}

async function deleteNote(note) {
  const confirmMessage = `Are you sure you want to delete this note?\n\nThis action cannot be undone.`;
  
  if (!confirm(confirmMessage)) {
    return;
  }
  
  try {
    const response = await fetch(`/notes/${note.id}`, {
      method: 'DELETE'
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Failed to delete note');
    }
    
    // Success - reload notes
    loadProjectNotes(currentProject.side, currentProject.name);
    updateStatus('✅ Note deleted successfully', 'success');
    
    // Update current project note count
    if (currentProject) {
      currentProject.note_count = Math.max(0, currentProject.note_count - 1);
      const noteText = currentProject.note_count === 1 ? 'note' : 'notes';
      document.getElementById('project-note-count').textContent = `${currentProject.note_count} ${noteText}`;
    }
    
    // Clear status after 3 seconds
    setTimeout(() => {
      updateStatus('Click the microphone to start recording');
    }, 3000);
    
  } catch (error) {
    console.error('Error deleting note:', error);
    alert(`Failed to delete note: ${error.message}`);
  }
}

// Add back button functionality
document.getElementById('back-btn').addEventListener('click', closeProject);
