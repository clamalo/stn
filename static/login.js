// Login and signup page logic

document.getElementById('signup-btn').addEventListener('click', signup);
document.getElementById('login-btn').addEventListener('click', login);

function showToast(message, type = 'info', duration = 5000) {
  const existingToast = document.querySelector('.toast');
  if (existingToast) existingToast.remove();
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  // Add icon based on type
  const icon = document.createElement('i');
  icon.className = 'toast-icon fas ' + (
    type === 'success' ? 'fa-check-circle' :
    type === 'error' ? 'fa-exclamation-circle' :
    'fa-info-circle'
  );
  
  const textNode = document.createTextNode(message);
  
  toast.appendChild(icon);
  toast.appendChild(textNode);
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideInRight 0.4s cubic-bezier(0.4, 0, 0.2, 1) reverse';
    setTimeout(() => toast.remove(), 400);
  }, duration);
}

function setLoadingState(el, loading) {
  const btnText = el.querySelector('.btn-text');
  
  if (loading) {
    el.disabled = true;
    el.style.opacity = '0.7';
    el.style.cursor = 'not-allowed';
    
    // Add loading spinner
    if (!el.querySelector('.loading-spinner')) {
      const spinner = document.createElement('span');
      spinner.className = 'loading-spinner';
      el.insertBefore(spinner, btnText);
    }
    
    // Update button text
    if (el.id === 'signup-btn') {
      btnText.textContent = 'Creating Account...';
    } else if (el.id === 'login-btn') {
      btnText.textContent = 'Signing In...';
    }
  } else {
    el.disabled = false;
    el.style.opacity = '1';
    el.style.cursor = 'pointer';
    
    // Remove loading spinner
    const spinner = el.querySelector('.loading-spinner');
    if (spinner) spinner.remove();
    
    // Reset button text
    if (el.id === 'signup-btn') {
      btnText.textContent = 'Sign Up';
    } else if (el.id === 'login-btn') {
      btnText.textContent = 'Sign In';
    }
  }
}

function validateInput(input, value) {
  const inputElement = document.getElementById(input);
  
  if (input === 'auth-password' && value.length > 0 && value.length < 6) {
    inputElement.classList.add('error');
    inputElement.title = 'Password must be at least 6 characters';
    return false;
  } else {
    inputElement.classList.remove('error');
    inputElement.title = '';
    return true;
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

  const btn = document.getElementById('signup-btn');
  setLoadingState(btn, true);
  
  try {
    const r = await fetch('/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Signup failed');
    showToast(`Welcome ${data.username}! Account created successfully.`, 'success');
    
    // Add smooth transition before redirect
    setTimeout(() => {
      window.location.href = '/';
    }, 1500);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setLoadingState(btn, false);
  }
}

async function login() {
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value.trim();

  if (!username || !password) {
    showToast('Username and password are required', 'error');
    return;
  }

  const btn = document.getElementById('login-btn');
  setLoadingState(btn, true);
  
  try {
    const r = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Login failed');
    showToast(`Welcome back, ${data.username}!`, 'success');
    
    // Add smooth transition before redirect
    setTimeout(() => {
      window.location.href = '/';
    }, 1500);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setLoadingState(btn, false);
  }
}

// Enhanced form interactions and animations
document.addEventListener('DOMContentLoaded', () => {
  const usernameInput = document.getElementById('auth-username');
  const passwordInput = document.getElementById('auth-password');
  const loginCard = document.querySelector('.login-card');

  // Add focus animations to inputs
  const inputs = [usernameInput, passwordInput];
  inputs.forEach(input => {
    input.addEventListener('focus', () => {
      input.parentElement.style.transform = 'scale(1.02)';
    });
    
    input.addEventListener('blur', () => {
      input.parentElement.style.transform = 'scale(1)';
    });
  });

  // Enhanced keyboard navigation
  const handleKeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      
      // If on username field, move to password
      if (e.target === usernameInput && !passwordInput.value) {
        passwordInput.focus();
        return;
      }
      
      // Otherwise, attempt login
      login();
    }
  };

  usernameInput.addEventListener('keydown', handleKeydown);
  passwordInput.addEventListener('keydown', handleKeydown);

  // Real-time password validation with better UX
  passwordInput.addEventListener('input', (e) => {
    const val = e.target.value;
    validateInput('auth-password', val);
  });

  // Form submission prevention
  const form = document.getElementById('login-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      login();
    });
  }

  // Add subtle hover effects to the card
  loginCard.addEventListener('mouseenter', () => {
    loginCard.style.transform = 'translateY(-2px)';
    loginCard.style.boxShadow = '0 32px 64px -12px rgba(0, 0, 0, 0.8)';
  });

  loginCard.addEventListener('mouseleave', () => {
    loginCard.style.transform = 'translateY(0)';
    loginCard.style.boxShadow = 'var(--shadow)';
  });

  // Add ripple effect to buttons
  const buttons = document.querySelectorAll('.btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', function(e) {
      if (this.disabled) return;
      
      const ripple = document.createElement('span');
      const rect = this.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;
      
      ripple.style.cssText = `
        position: absolute;
        border-radius: 50%;
        transform: scale(0);
        animation: ripple 0.6s linear;
        background-color: rgba(255, 255, 255, 0.3);
        width: ${size}px;
        height: ${size}px;
        left: ${x}px;
        top: ${y}px;
        pointer-events: none;
      `;
      
      this.appendChild(ripple);
      
      setTimeout(() => {
        ripple.remove();
      }, 600);
    });
  });

  // Add CSS for ripple animation
  const style = document.createElement('style');
  style.textContent = `
    .btn {
      position: relative;
      overflow: hidden;
    }
    
    @keyframes ripple {
      to {
        transform: scale(4);
        opacity: 0;
      }
    }
    
    .input-wrapper {
      transition: transform 0.2s ease;
    }
  `;
  document.head.appendChild(style);
});
