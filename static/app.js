let recording = false;
let recognizer = null;
const btn = document.getElementById('mic');
const status = document.getElementById('status');
const authForms = document.getElementById('auth-forms');
const userInfo = document.getElementById('user-info');
const mainContent = document.getElementById('main-content');
const usernameSpan = document.getElementById('current-user');

// Add loading state management
let isLoading = false;

document.getElementById('signup-btn').addEventListener('click', signup);
document.getElementById('login-btn').addEventListener('click', login);
document.getElementById('logout-btn').addEventListener('click', logout);

// Enhanced notification system
function showToast(message, type = 'info', duration = 5000) {
  // Remove existing toast
  const existingToast = document.querySelector('.toast');
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideInRight 0.3s ease-out reverse';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function setLoadingState(element, isLoading) {
  if (isLoading) {
    element.disabled = true;
    element.style.opacity = '0.7';
    element.style.cursor = 'not-allowed';
  } else {
    element.disabled = false;
    element.style.opacity = '1';
    element.style.cursor = 'pointer';
  }
}

async function signup() {
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value.trim();
  
  if (!username || !password) {
    showToast('Username and password are required', 'error');
    return;
  }

  if (password.length < 6) {
    showToast('Password must be at least 6 characters long', 'error');
    return;
  }

  const signupBtn = document.getElementById('signup-btn');
  setLoadingState(signupBtn, true);
  signupBtn.textContent = 'Signing Up...';

  try {
    const r = await fetch('/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await r.json();
    
    if (!r.ok) {
      throw new Error(data.error || 'Signup failed');
    }
    
    showToast(`Welcome ${data.username}! Account created successfully.`, 'success');
    setLoggedIn(data.username);
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    setLoadingState(signupBtn, false);
    signupBtn.textContent = 'Sign Up';
  }
}

async function login() {
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value.trim();
  
  if (!username || !password) {
    showToast('Username and password are required', 'error');
    return;
  }

  const loginBtn = document.getElementById('login-btn');
  setLoadingState(loginBtn, true);
  loginBtn.textContent = 'Logging In...';

  try {
    const r = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await r.json();
    
    if (!r.ok) {
      throw new Error(data.error || 'Login failed');
    }
    
    showToast(`Welcome back, ${data.username}!`, 'success');
    setLoggedIn(data.username);
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    setLoadingState(loginBtn, false);
    loginBtn.textContent = 'Log In';
  }
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
  
  // Add accessibility announcement
  status.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  
  // Add visual feedback for different states
  if (type === 'listening') {
    status.innerHTML = `
      <div class="loading-spinner" style="width: 1rem; height: 1rem; margin-right: 0.5rem;"></div>
      ${message}
    `;
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
    
    // Provide better user feedback
    showToast('Voice captured! Processing your note...', 'info', 3000);
    
    fetch('/process_note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    })
    .then(r => r.json())
    .then(data => {
      updateStatus(`✅ Saved to ${data.bucket}`, 'success');
      showToast(`Note saved to ${data.bucket} project!`, 'success');
      loadBuckets();
      
      // Clear status after 5 seconds
      setTimeout(() => {
        updateStatus('Click the microphone to start recording');
      }, 5000);
    })
    .catch(err => {
      console.error(err);
      updateStatus('❌ Failed to save note', 'error');
      showToast('Failed to save your note. Please try again.', 'error');
      
      // Clear status after 5 seconds
      setTimeout(() => {
        updateStatus('Click the microphone to start recording');
      }, 5000);
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
  btn.setAttribute('aria-label', 'Stop voice recording');
  btn.title = 'Click to stop recording (or press Escape)';
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
  btn.setAttribute('aria-label', 'Start voice recording');
  btn.title = 'Click to start recording (or press Space)';
  
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
  card.setAttribute('role', 'gridcell');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `${bucket.name} project, ${bucket.note_count} notes, ${bucket.side} category`);
  
  const sideClass = bucket.side.toLowerCase();
  const noteText = bucket.note_count === 1 ? 'note' : 'notes';
  const canEdit = bucket.name !== 'Scratchpad';
  
  // Enhanced card content with better visual hierarchy
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
            <button class="bucket-action-btn edit" title="Edit project name" aria-label="Edit ${bucket.name} project name">
              ✏️
            </button>
            <button class="bucket-action-btn delete" title="Delete project" aria-label="Delete ${bucket.name} project">
              🗑️
            </button>
          </div>
        ` : ''}
      </div>
    </div>
  `;
  
  // Enhanced click handling
  const handleCardClick = (e) => {
    // Don't open project if clicking on action buttons
    if (e.target.closest('.bucket-actions') || e.target.closest('.bucket-edit-actions')) {
      return;
    }
    openProject(bucket);
  };

  card.addEventListener('click', handleCardClick);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCardClick(e);
    }
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

  // Add form validation and Enter key handling
  const usernameInput = document.getElementById('auth-username');
  const passwordInput = document.getElementById('auth-password');
  
  // Handle Enter key in auth forms
  const handleAuthKeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Try login first, then signup if no account exists
      login();
    }
  };
  
  usernameInput.addEventListener('keydown', handleAuthKeydown);
  passwordInput.addEventListener('keydown', handleAuthKeydown);
  
  // Real-time validation feedback
  passwordInput.addEventListener('input', (e) => {
    const password = e.target.value;
    if (password.length > 0 && password.length < 6) {
      e.target.style.borderColor = 'var(--error-color)';
      e.target.title = 'Password must be at least 6 characters';
    } else {
      e.target.style.borderColor = '';
      e.target.title = '';
    }
  });

  // Check for microphone permissions
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(() => {
        console.log('Microphone permission granted');
        showToast('Microphone access granted! You can now record voice notes.', 'success', 3000);
      })
      .catch((err) => {
        console.warn('Microphone permission denied:', err);
        updateStatus('Microphone permission needed for voice recording', 'error');
        showToast('Please allow microphone access to record voice notes.', 'error', 8000);
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
      showToast(`Project renamed to "${newName}"`, 'success');
      
    } catch (error) {
      console.error('Error renaming bucket:', error);
      showToast(`Failed to rename project: ${error.message}`, 'error');
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
  const result = await showConfirmDialog(
    `Delete "${bucket.name}" project?`,
    `This will permanently delete the project "${bucket.name}" and all ${bucket.note_count} notes inside it. This action cannot be undone.`,
    'Delete Project'
  );
  
  if (!result) return;

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
    showToast(`Project "${bucket.name}" deleted successfully`, 'success');
    
  } catch (error) {
    console.error('Error deleting bucket:', error);
    showToast(`Failed to delete project: ${error.message}`, 'error');
  }
}

// Enhanced confirmation dialog
function showConfirmDialog(title, message, confirmText = 'Confirm') {
  return new Promise((resolve) => {
    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog-overlay';
    dialog.innerHTML = `
      <div class="confirm-dialog">
        <h3>${title}</h3>
        <p>${message}</p>
        <div class="confirm-dialog-actions">
          <button class="confirm-btn cancel">Cancel</button>
          <button class="confirm-btn delete">${confirmText}</button>
        </div>
      </div>
    `;
    
    // Add styles
    dialog.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(5px);
      display: flex; align-items: center; justify-content: center;
      z-index: 1001; animation: fadeIn 0.2s ease-out;
    `;
    
    const dialogBox = dialog.querySelector('.confirm-dialog');
    dialogBox.style.cssText = `
      background: var(--surface); border-radius: 1rem; padding: 2rem;
      border: 2px solid var(--border-color); box-shadow: var(--shadow);
      max-width: 400px; width: 90vw; animation: scaleIn 0.2s ease-out;
    `;
    
    const h3 = dialogBox.querySelector('h3');
    h3.style.cssText = `
      color: var(--text-primary); margin: 0 0 1rem 0;
      font-size: 1.25rem; font-weight: 600;
    `;
    
    const p = dialogBox.querySelector('p');
    p.style.cssText = `
      color: var(--text-secondary); margin: 0 0 2rem 0;
      line-height: 1.5; font-size: 0.95rem;
    `;
    
    const actions = dialogBox.querySelector('.confirm-dialog-actions');
    actions.style.cssText = `
      display: flex; gap: 1rem; justify-content: flex-end;
    `;
    
    const buttons = actions.querySelectorAll('.confirm-btn');
    buttons.forEach(btn => {
      btn.style.cssText = `
        padding: 0.75rem 1.5rem; border: none; border-radius: 0.5rem;
        cursor: pointer; font-weight: 600; transition: all 0.2s ease;
      `;
    });
    
    const cancelBtn = actions.querySelector('.cancel');
    cancelBtn.style.cssText += `
      background: var(--surface-light); color: var(--text-secondary);
    `;
    
    const deleteBtn = actions.querySelector('.delete');
    deleteBtn.style.cssText += `
      background: var(--error-color); color: white;
    `;
    
    document.body.appendChild(dialog);
    
    // Add animation styles
    const style = document.createElement('style');
    style.textContent = `
      @keyframes scaleIn {
        from { transform: scale(0.9); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
    
    // Event listeners
    cancelBtn.addEventListener('click', () => {
      document.body.removeChild(dialog);
      document.head.removeChild(style);
      resolve(false);
    });
    
    deleteBtn.addEventListener('click', () => {
      document.body.removeChild(dialog);
      document.head.removeChild(style);
      resolve(true);
    });
    
    // ESC key to cancel
    const handleKeydown = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', handleKeydown);
        document.body.removeChild(dialog);
        document.head.removeChild(style);
        resolve(false);
      }
    };
    document.addEventListener('keydown', handleKeydown);
  });
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
      showToast('Note updated successfully', 'success');
      
    } catch (error) {
      console.error('Error updating note:', error);
      showToast(`Failed to update note: ${error.message}`, 'error');
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
  const result = await showConfirmDialog(
    'Delete Note?',
    'This note will be permanently deleted. This action cannot be undone.',
    'Delete Note'
  );
  
  if (!result) return;

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
    showToast('Note deleted successfully', 'success');
    
    // Update current project note count
    if (currentProject) {
      currentProject.note_count = Math.max(0, currentProject.note_count - 1);
      const noteText = currentProject.note_count === 1 ? 'note' : 'notes';
      document.getElementById('project-note-count').textContent = `${currentProject.note_count} ${noteText}`;
    }
    
  } catch (error) {
    console.error('Error deleting note:', error);
    showToast(`Failed to delete note: ${error.message}`, 'error');
  }
}

// Add back button functionality
document.getElementById('back-btn').addEventListener('click', closeProject);
