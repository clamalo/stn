let recording = false;
let recognizer = null;
let mediaRecorder = null;
let audioChunks = [];
const btn = document.getElementById('mic');
const userInfo = document.getElementById('profile-dropdown');
const mainContent = document.getElementById('main-interface');
const usernameSpan = document.getElementById('current-user');
let audioContext;
let analyser;
let microphone;
let animationId;

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


async function logout() {
  await fetch('/logout', { method: 'POST' });
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
  window.location.href = '/';
}

function generateUserAvatar(name) {
  if (!name) return '';
  
  // Get first letter of the name, or first two letters if it contains spaces
  const words = name.trim().split(' ');
  if (words.length > 1) {
    return (words[0][0] + words[1][0]).toUpperCase();
  } else {
    return name[0].toUpperCase();
  }
}

function setLoggedIn(name) {
  // Generate and set avatar
  const userAvatar = document.getElementById('profile-avatar');
  if (userAvatar) {
    userAvatar.textContent = generateUserAvatar(name);
  }
  
  // Hide auth section and show main interface
  document.getElementById('auth-section').classList.remove('active');
  userInfo.style.display = 'flex';
  mainContent.style.display = 'flex';
  
  // Show mini projects UI
  document.getElementById('quick-projects-btn').style.display = 'flex';
  document.getElementById('mini-projects-sidebar').style.display = 'block';
  
  loadBuckets();
  if (!refreshInterval) {
    refreshInterval = setInterval(loadBuckets, 30000);
  }
}

// Make setLoggedIn globally accessible
window.setLoggedIn = setLoggedIn;

async function checkAuth() {
  const r = await fetch('/current_user');
  const data = await r.json();
  if (data.username) {
    setLoggedIn(data.username);
  } else {
    // Show auth section instead of redirecting
    document.getElementById('auth-section').classList.add('active');
    userInfo.style.display = 'none';
    mainContent.style.display = 'none';
  }
}

// Project view functionality
let currentProject = null;
let refreshInterval = null;
let miniProjectsVisible = false;
let lastProjectCount = 0;
let recentProjects = [];

btn.addEventListener('click', () => {
  if (!recording) {
    start();
  } else {
    stop();
  }
});

function updateStatus(message, type = '') {
  // In the new magical interface, we show status through orb visual changes and toasts
  // instead of a status text element
  
  if (type === 'listening') {
    btn.classList.add('listening');
  } else {
    btn.classList.remove('listening');
  }
  
  // Show toast for important status updates
  if (type && type !== 'listening') {
    showToast(message, type);
  }
}

function start() {
  // Start audio level monitoring for orb bounce effect
  startAudioLevelMonitoring();

  if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognizer = new SR();
    recognizer.lang = 'en-US';
    recognizer.interimResults = true; // Enable interim results to keep connection alive
    recognizer.continuous = true; // Keep listening continuously
    recognizer.maxAlternatives = 1;
  } else if (navigator.mediaDevices && window.MediaRecorder) {
    startFallbackRecording();
    return;
  } else {
    updateStatus('Speech recognition not supported in this browser', 'error');
    return;
  }
  
  window.finalTranscript = '';
  window.processingTimeout = null;
  
  recognizer.onresult = (e) => {
    let interimTranscript = '';
    
    // Process all results
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const transcript = e.results[i][0].transcript;
      if (e.results[i].isFinal) {
        window.finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }
    
    // Show live feedback with interim results
    const currentText = window.finalTranscript + interimTranscript;
    if (currentText.trim()) {
      updateStatus(`🎤 "${currentText.trim()}" (keep speaking or wait 2 seconds to process)`, 'listening');
    }
    
    // Clear any existing timeout
    if (window.processingTimeout) {
      clearTimeout(window.processingTimeout);
    }
    
    // Set a new timeout to process after 2 seconds of no new speech
    window.processingTimeout = setTimeout(() => {
      if (window.finalTranscript.trim() || interimTranscript.trim()) {
        const textToProcess = (window.finalTranscript + interimTranscript).trim();
        
        if (textToProcess) {
          updateStatus(`Processing: "${textToProcess}"`, 'processing');
          showToast('Voice captured! Processing your note...', 'info', 3000);
          
          fetch('/process_note', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: textToProcess })
          })
          .then(r => r.json())
          .then(data => {
            updateStatus(`✅ Saved to ${data.bucket}`, 'success');
            
            // Enhanced notification with project information
            const projectName = data.bucket;
            const notePreview = textToProcess.length > 50 ? textToProcess.substring(0, 50) + '...' : textToProcess;
            
            showToast(`Note saved to "${projectName}" project!`, 'success');
            
            // Ensure mini projects sidebar is visible for the animation
            const sidebar = document.getElementById('mini-projects-sidebar');
            const btn = document.getElementById('quick-projects-btn');
            const wasVisible = miniProjectsVisible;
            
            if (!miniProjectsVisible) {
              sidebar.classList.add('visible');
              btn.classList.add('active');
              miniProjectsVisible = true;
            }
            
            // Show magical note creation animation
            showNoteCreationAnimation(projectName, notePreview);
            
            // Auto-hide sidebar after animation if it wasn't originally visible
            if (!wasVisible) {
              setTimeout(() => {
                if (miniProjectsVisible && !btn.matches(':hover') && !sidebar.matches(':hover')) {
                  miniProjectsVisible = false;
                  sidebar.classList.remove('visible');
                  btn.classList.remove('active');
                }
              }, 3000);
            }
            
            // Update buckets and mini projects
            loadBuckets();
            
            // If currently viewing the project, refresh notes and highlight new one
            if (currentProject && currentProject.name === projectName) {
              setTimeout(() => {
                loadProjectNotes(currentProject.side, currentProject.name, true);
              }, 300);
            }
            
            // Stop recording after processing
            stop();
          })
          .catch(err => {
            console.error(err);
            updateStatus('❌ Failed to save note', 'error');
            showToast('Failed to save your note. Please try again.', 'error');
            stop();
          });
        }
      }
    }, 2000); // Wait 2 seconds after last speech before processing
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
  };
  
  recognizer.onend = () => {
    stop();
  };
  
  recording = true;
  btn.classList.add('listening');
  btn.setAttribute('aria-label', 'Stop voice recording');
  btn.title = 'Click to stop recording';
  updateStatus('🎤 Listening... Speak now', 'listening');
  
  try {
    recognizer.start();
  } catch (error) {
    console.error('Failed to start recognition:', error);
    updateStatus('Failed to start recording', 'error');
    stop();
  }
}

function startFallbackRecording() {
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    // Set up audio level monitoring for orb bounce
    setupAudioAnalyser(stream);

    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };
    mediaRecorder.onstop = () => {
      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('audio', blob, 'note.webm');

      updateStatus('Processing audio...', 'processing');
      fetch('/transcribe', { method: 'POST', body: formData })
        .then(r => r.json())
        .then(data => {
          if (!data.text) throw new Error('No transcript');
          updateStatus(`Processing: "${data.text}"`, 'processing');
          return fetch('/process_note', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: data.text })
          });
        })
        .then(r => r.json())
        .then(data => {
          updateStatus(`✅ Saved to ${data.bucket}`, 'success');
          showToast(`Note saved to ${data.bucket} project!`, 'success');
          loadBuckets();
        })
        .catch(err => {
          console.error(err);
          updateStatus('❌ Failed to save note', 'error');
        });
    };

    recording = true;
    btn.classList.add('listening');
    btn.setAttribute('aria-label', 'Stop voice recording');
    btn.title = 'Click to stop recording';
    updateStatus('🎤 Listening... Speak now', 'listening');

    mediaRecorder.start();
  }).catch(err => {
    console.error(err);
    updateStatus('Microphone access denied', 'error');
  });
}

function stop() {
  recording = false;
  btn.classList.remove('listening');
  btn.setAttribute('aria-label', 'Start voice recording');
  btn.title = 'Click to start recording';
  
  // Stop audio level monitoring
  stopAudioLevelMonitoring();
  
  // Clear any pending processing timeout
  if (window.processingTimeout) {
    clearTimeout(window.processingTimeout);
    window.processingTimeout = null;
  }
  
  // Reset transcript variables
  if (window.finalTranscript !== undefined) {
    window.finalTranscript = '';
  }
  
  if (recognizer) {
    try {
      recognizer.stop();
    } catch (error) {
      console.error('Error stopping recognition:', error);
    }
  }

  if (mediaRecorder) {
    try {
      mediaRecorder.stop();
    } catch (error) {
      console.error('Error stopping recorder:', error);
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
      
      // Update mini projects after loading buckets
      updateMiniProjects(buckets);
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

// Mini Projects Functionality
function toggleMiniProjects() {
  miniProjectsVisible = !miniProjectsVisible;
  const sidebar = document.getElementById('mini-projects-sidebar');
  const btn = document.getElementById('quick-projects-btn');
  
  if (miniProjectsVisible) {
    sidebar.classList.add('visible');
    btn.classList.add('active');
  } else {
    sidebar.classList.remove('visible');
    btn.classList.remove('active');
  }
}

function updateMiniProjects(buckets) {
  const miniProjectsList = document.getElementById('mini-projects-list');
  const counterBadge = document.getElementById('project-counter-badge');
  const quickBtn = document.getElementById('quick-projects-btn');
  
  // Filter out Scratchpad and sort by note count
  const nonScratchpadBuckets = buckets.filter(b => b.name !== 'Scratchpad');
  const sortedBuckets = nonScratchpadBuckets.sort((a, b) => b.note_count - a.note_count);
  
  // Update counter badge
  if (nonScratchpadBuckets.length > 0) {
    counterBadge.textContent = nonScratchpadBuckets.length;
    counterBadge.style.display = 'block';
  } else {
    counterBadge.style.display = 'none';
  }
  
  // Check for new projects
  const currentProjectCount = nonScratchpadBuckets.length;
  const hasNewProjects = currentProjectCount > lastProjectCount && lastProjectCount > 0;
  lastProjectCount = currentProjectCount;
  
  if (nonScratchpadBuckets.length === 0) {
    miniProjectsList.innerHTML = `
      <div class="empty-state" style="text-align: center; padding: 2rem; color: var(--text-muted);">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">📁</div>
        <p style="font-size: 0.9rem;">No projects yet</p>
      </div>
    `;
    return;
  }
  
  // Show up to 5 most recent projects
  const recentBuckets = sortedBuckets.slice(0, 5);
  
  miniProjectsList.innerHTML = '';
  recentBuckets.forEach((bucket, index) => {
    const item = createMiniProjectItem(bucket, hasNewProjects && index === 0);
    miniProjectsList.appendChild(item);
  });
  
  // Auto-show sidebar briefly if new projects were created
  if (hasNewProjects && !miniProjectsVisible) {
    showNewProjectNotification();
  }
}

function createMiniProjectItem(bucket, isNew = false) {
  const item = document.createElement('div');
  item.className = `mini-project-item ${isNew ? 'new-project' : ''}`;
  item.setAttribute('role', 'button');
  item.setAttribute('tabindex', '0');
  
  const noteText = bucket.note_count === 1 ? 'note' : 'notes';
  
  item.innerHTML = `
    <div class="mini-project-info">
      <div class="mini-project-name">${bucket.name}</div>
      <div class="mini-project-stats">${bucket.note_count} ${noteText}</div>
    </div>
    <div class="mini-project-side ${bucket.side.toLowerCase()}">${bucket.side}</div>
  `;
  
  // Click to open project
  item.addEventListener('click', () => {
    openProject(bucket);
    toggleMiniProjects(); // Close mini projects when opening full view
  });
  
  // Keyboard support
  item.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      item.click();
    }
  });
  
  return item;
}

function showNewProjectNotification() {
  const sidebar = document.getElementById('mini-projects-sidebar');
  const btn = document.getElementById('quick-projects-btn');
  
  // Briefly show the sidebar to indicate new project
  sidebar.classList.add('visible');
  btn.classList.add('active');
  miniProjectsVisible = true;
  
  // Show toast notification
  showToast('New project created! 📁', 'success', 3000);
  
  // Auto-hide after 4 seconds if user doesn't interact (longer to allow for note animation)
  setTimeout(() => {
    if (miniProjectsVisible && !btn.matches(':hover') && !sidebar.matches(':hover')) {
      // User didn't manually interact, auto-close
      miniProjectsVisible = false;
      sidebar.classList.remove('visible');
      btn.classList.remove('active');
    }
  }, 4000);
}

function showNoteCreationAnimation(projectName, notePreview) {
  // Get orb position (start point)
  const orb = document.getElementById('mic');
  const orbRect = orb.getBoundingClientRect();
  const orbCenter = {
    x: orbRect.left + orbRect.width / 2,
    y: orbRect.top + orbRect.height / 2
  };
  
  // Find the target project in mini sidebar or use the quick projects button
  let targetElement = null;
  const miniProjectItems = document.querySelectorAll('.mini-project-item');
  
  // Look for the specific project in the mini sidebar
  for (const item of miniProjectItems) {
    const nameEl = item.querySelector('.mini-project-name');
    if (nameEl && nameEl.textContent.trim() === projectName) {
      targetElement = item;
      break;
    }
  }
  
  // If not found in mini sidebar or sidebar is not visible, use the quick projects button
  if (!targetElement || !document.getElementById('mini-projects-sidebar').classList.contains('visible')) {
    targetElement = document.getElementById('quick-projects-btn');
  }
  
  const targetRect = targetElement.getBoundingClientRect();
  const targetCenter = {
    x: targetRect.left + targetRect.width / 2,
    y: targetRect.top + targetRect.height / 2
  };
  
  // Create the flying note element
  const noteElement = document.createElement('div');
  noteElement.style.cssText = `
    position: fixed;
    left: ${orbCenter.x}px;
    top: ${orbCenter.y}px;
    transform: translate(-50%, -50%);
    background: rgba(16, 185, 129, 0.15);
    border: 2px solid var(--success-color);
    border-radius: 0.75rem;
    padding: 0.75rem 1rem;
    color: var(--success-color);
    font-size: 0.8rem;
    z-index: 3000;
    backdrop-filter: blur(15px);
    box-shadow: 0 8px 32px rgba(16, 185, 129, 0.4);
    pointer-events: none;
    opacity: 1;
    max-width: 250px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: all 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    font-weight: 500;
  `;
  
  noteElement.textContent = `📝 ${notePreview}`;
  document.body.appendChild(noteElement);
  
  // Create a magical trail effect
  const trail = document.createElement('div');
  trail.style.cssText = `
    position: fixed;
    left: ${orbCenter.x}px;
    top: ${orbCenter.y}px;
    width: 3px;
    height: 3px;
    background: var(--success-color);
    border-radius: 50%;
    z-index: 2999;
    pointer-events: none;
    opacity: 0;
    box-shadow: 0 0 20px var(--success-color);
  `;
  document.body.appendChild(trail);
  
     // Create trailing particles function
   function createTrailParticle(x, y, delay = 0) {
     setTimeout(() => {
       const particle = document.createElement('div');
       particle.className = 'note-particle';
       particle.style.left = `${x}px`;
       particle.style.top = `${y}px`;
       particle.style.transform = 'translate(-50%, -50%)';
       document.body.appendChild(particle);
       
       setTimeout(() => {
         if (particle.parentNode) particle.parentNode.removeChild(particle);
       }, 1000);
     }, delay);
   }
   
   // Start the flight animation
   setTimeout(() => {
     // Move the note to the target
     noteElement.style.left = `${targetCenter.x}px`;
     noteElement.style.top = `${targetCenter.y}px`;
     noteElement.style.transform = 'translate(-50%, -50%) scale(0.3)';
     noteElement.style.opacity = '0.8';
     
     // Animate the trail following
     trail.style.left = `${targetCenter.x}px`;
     trail.style.top = `${targetCenter.y}px`;
     trail.style.opacity = '1';
     trail.style.transition = 'all 1.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
     
     // Create magical trailing particles along the flight path
     const steps = 8;
     for (let i = 0; i < steps; i++) {
       const progress = (i + 1) / steps;
       const x = orbCenter.x + (targetCenter.x - orbCenter.x) * progress;
       const y = orbCenter.y + (targetCenter.y - orbCenter.y) * progress;
       createTrailParticle(x, y, i * 150);
     }
   }, 100);
  
  // Create pulse effect on target when note arrives
  setTimeout(() => {
    targetElement.style.transition = 'all 0.3s ease';
    targetElement.style.transform = 'scale(1.15)';
    targetElement.style.boxShadow = '0 0 30px rgba(16, 185, 129, 0.6)';
    
    // Create arrival burst effect
    const burst = document.createElement('div');
    burst.style.cssText = `
      position: fixed;
      left: ${targetCenter.x}px;
      top: ${targetCenter.y}px;
      width: 40px;
      height: 40px;
      border: 2px solid var(--success-color);
      border-radius: 50%;
      transform: translate(-50%, -50%) scale(0);
      z-index: 2998;
      pointer-events: none;
      animation: burstPulse 0.6s ease-out forwards;
    `;
    document.body.appendChild(burst);
    
    // Add burst animation if not already added
    if (!document.getElementById('burst-animation')) {
      const style = document.createElement('style');
      style.id = 'burst-animation';
      style.textContent = `
        @keyframes burstPulse {
          0% {
            transform: translate(-50%, -50%) scale(0);
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -50%) scale(3);
            opacity: 0;
          }
        }
      `;
      document.head.appendChild(style);
    }
    
    // Remove burst after animation
    setTimeout(() => {
      if (burst.parentNode) burst.parentNode.removeChild(burst);
    }, 600);
    
    // Reset target element
    setTimeout(() => {
      targetElement.style.transform = '';
      targetElement.style.boxShadow = '';
    }, 300);
    
  }, 1300);
  
  // Clean up elements
  setTimeout(() => {
    if (noteElement.parentNode) noteElement.parentNode.removeChild(noteElement);
    if (trail.parentNode) trail.parentNode.removeChild(trail);
  }, 2000);
  
  // Update counter badge with a nice pop animation
  const counterBadge = document.getElementById('project-counter-badge');
  if (counterBadge && counterBadge.style.display !== 'none') {
    setTimeout(() => {
      counterBadge.style.transition = 'all 0.2s ease';
      counterBadge.style.transform = 'scale(1.3)';
      setTimeout(() => {
        counterBadge.style.transform = 'scale(1)';
      }, 200);
    }, 1300);
  }
}

// Make mini projects functions globally accessible
window.toggleMiniProjects = toggleMiniProjects;

// Make showSection globally accessible (it's defined in HTML)
window.showSection = window.showSection || function(sectionId) {
  document.querySelectorAll('.hidden-section').forEach(section => {
    section.classList.remove('active');
  });
  document.getElementById(sectionId).classList.add('active');
};

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
  
  // Escape to stop recording, close mini projects, or close sections
  if (e.code === 'Escape') {
    if (recording) {
      stop();
    } else if (miniProjectsVisible) {
      toggleMiniProjects();
    } else {
      // Check if any section is active and close it
      const activeSection = document.querySelector('.hidden-section.active');
      if (activeSection) {
        activeSection.classList.remove('active');
        // Show main orb interface if closing projects section
        if (activeSection.id === 'projects-section') {
          document.getElementById('main-interface').style.display = 'flex';
        }
      }
    }
  }
  
  // P key to toggle mini projects
  if (e.code === 'KeyP' && e.target === document.body && !recording) {
    e.preventDefault();
    toggleMiniProjects();
  }
});

// Load buckets on page load
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();

  // User dropdown functionality
  const userInfoDropdown = document.getElementById('user-info');
  const profileBtn = document.getElementById('profile-btn');
  
  if (userInfoDropdown) {
    // Toggle dropdown on click
    userInfoDropdown.addEventListener('click', (e) => {
      if (!e.target.closest('.user-dropdown')) {
        e.preventDefault();
        userInfoDropdown.classList.toggle('active');
      }
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!userInfoDropdown.contains(e.target)) {
        userInfoDropdown.classList.remove('active');
      }
    });
    
    // Handle profile button (placeholder for future functionality)
    if (profileBtn) {
      profileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        userInfoDropdown.classList.remove('active');
        // TODO: Add profile functionality
        showToast('Profile settings coming soon!', 'info');
      });
    }
  }

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
  
  // Show project view section using the correct function
  showSection('project-view-section');
  
  // Load notes for this project
  loadProjectNotes(bucket.side, bucket.name);
}

function closeProject() {
  currentProject = null;
  
  // Show projects section
  showSection('projects-section');
  
  // Refresh buckets in case notes were modified
  loadBuckets();
}

async function loadProjectNotes(side, name, highlightNewNote = false) {
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
    
    // Sort notes by creation date (newest first)
    notes.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    // Create note cards
    notes.forEach((note, index) => {
      const isNewNote = highlightNewNote && index === 0;
      const card = createNoteCard(note, isNewNote);
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

function createNoteCard(note, isNew = false) {
  const card = document.createElement('div');
  card.className = `note-card fade-in ${isNew ? 'new-note' : ''}`;
  
  const createdDate = new Date(note.created_at).toLocaleString();
  const updatedDate = note.updated_at ? new Date(note.updated_at).toLocaleString() : null;
  
  const noteText = note.clean_text || '';
  const isLongNote = noteText.length > 150;
  
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
    <div class="note-text ${isLongNote ? 'truncated' : ''}" data-original-text="${noteText}">${noteText}</div>
    ${isLongNote ? '<button class="note-expand-btn">Read more →</button>' : ''}
  `;
  
  // Add event listeners
  const editBtn = card.querySelector('.note-action-btn.edit');
  const deleteBtn = card.querySelector('.note-action-btn.delete');
  const noteTextEl = card.querySelector('.note-text');
  const expandBtn = card.querySelector('.note-expand-btn');
  
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    startEditNote(card, note);
  });
  
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteNote(note);
  });
  
  // Note expansion functionality
  if (expandBtn) {
    const handleExpansion = (e) => {
      e.stopPropagation();
      const isExpanded = noteTextEl.classList.contains('expanded');
      
      if (isExpanded) {
        noteTextEl.classList.remove('expanded');
        card.classList.remove('expanded');
        expandBtn.textContent = 'Read more →';
      } else {
        noteTextEl.classList.add('expanded');
        card.classList.add('expanded');
        expandBtn.textContent = '← Show less';
      }
    };
    
    expandBtn.addEventListener('click', handleExpansion);
    
    // Also allow clicking on the note text to expand
    noteTextEl.addEventListener('click', handleExpansion);
    noteTextEl.style.cursor = 'pointer';
  }
  
  // Remove new-note class after animation
  if (isNew) {
    setTimeout(() => {
      card.classList.remove('new-note');
    }, 600);
  }
  
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

// Audio level monitoring for orb bounce effect
function startAudioLevelMonitoring() {
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      setupAudioAnalyser(stream);
      animateOrbBounce();
    })
    .catch(err => {
      console.error('Could not access microphone for audio monitoring:', err);
    });
}

function setupAudioAnalyser(stream) {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioContext.createAnalyser();
  microphone = audioContext.createMediaStreamSource(stream);
  
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.8;
  microphone.connect(analyser);
}

function animateOrbBounce() {
  if (!recording || !analyser) {
    return;
  }
  
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(dataArray);
  
  // Calculate average audio level
  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) {
    sum += dataArray[i];
  }
  const average = sum / dataArray.length;
  
  // Normalize to 0-1 range and apply some smoothing
  const level = Math.min(average / 128, 1);
  
  // Scale the orb based on audio level (1.0 to 1.15 range)
  const scale = 1.0 + (level * 0.15);
  btn.style.transform = `scale(${scale})`;
  
  // Continue animation
  animationId = requestAnimationFrame(animateOrbBounce);
}

function stopAudioLevelMonitoring() {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  
  if (microphone) {
    microphone.disconnect();
    microphone = null;
  }
  
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  
  analyser = null;
  
  // Reset orb scale
  btn.style.transform = '';
}
