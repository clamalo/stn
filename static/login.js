// Login and signup page logic

document.getElementById('signup-btn').addEventListener('click', signup);
document.getElementById('login-btn').addEventListener('click', login);

function showToast(message, type = 'info', duration = 5000) {
  const existingToast = document.querySelector('.toast');
  if (existingToast) existingToast.remove();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideInRight 0.3s ease-out reverse';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function setLoadingState(el, loading) {
  if (loading) {
    el.disabled = true;
    el.style.opacity = '0.7';
    el.style.cursor = 'not-allowed';
  } else {
    el.disabled = false;
    el.style.opacity = '1';
    el.style.cursor = 'pointer';
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
  btn.textContent = 'Signing Up...';
  try {
    const r = await fetch('/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Signup failed');
    showToast(`Welcome ${data.username}! Account created successfully.`, 'success');
    window.location.href = '/';
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setLoadingState(btn, false);
    btn.textContent = 'Sign Up';
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
  btn.textContent = 'Logging In...';
  try {
    const r = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Login failed');
    showToast(`Welcome back, ${data.username}!`, 'success');
    window.location.href = '/';
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setLoadingState(btn, false);
    btn.textContent = 'Log In';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const usernameInput = document.getElementById('auth-username');
  const passwordInput = document.getElementById('auth-password');

  const handleKeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      login();
    }
  };

  usernameInput.addEventListener('keydown', handleKeydown);
  passwordInput.addEventListener('keydown', handleKeydown);

  passwordInput.addEventListener('input', (e) => {
    const val = e.target.value;
    if (val.length > 0 && val.length < 6) {
      e.target.style.borderColor = 'var(--error-color)';
      e.target.title = 'Password must be at least 6 characters';
    } else {
      e.target.style.borderColor = '';
      e.target.title = '';
    }
  });
});
