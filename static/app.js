let recording = false;
let recognizer = null;
const btn = document.getElementById('mic');
const status = document.getElementById('status');

btn.addEventListener('click', () => {
  if (!recording) {
    start();
  } else {
    stop();
  }
});

function start() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    alert('SpeechRecognition not supported in this browser');
    return;
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognizer = new SR();
  recognizer.lang = 'en-US';
  recognizer.interimResults = false;
  recognizer.onresult = (e) => {
    const text = e.results[0][0].transcript;
    status.textContent = 'Sending: ' + text;
    fetch('/process_note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    })
    .then(r => r.json())
    .then(data => {
      status.textContent = 'Saved to ' + data.bucket;
      loadBuckets();
    })
    .catch(err => {
      console.error(err);
      status.textContent = 'Error';
    });
  };
  recognizer.onerror = (e) => {
    console.error(e);
    status.textContent = 'Error: ' + e.error;
  };
  recognizer.onend = () => {
    stop();
  };
  recording = true;
  btn.classList.add('recording');
  btn.textContent = '🛑';
  status.textContent = 'Listening...';
  recognizer.start();
}

function stop() {
  recording = false;
  btn.classList.remove('recording');
  btn.textContent = '🎙️';
  if (recognizer) {
    recognizer.stop();
  }
}

function loadBuckets() {
  fetch('/buckets')
    .then(r => r.json())
    .then(data => {
      const div = document.getElementById('buckets');
      div.innerHTML = '';
      data.buckets.forEach(b => {
        const p = document.createElement('div');
        p.textContent = `${b.side} - ${b.name}: ${b.note_count} notes`;
        div.appendChild(p);
      });
    });
}

document.addEventListener('DOMContentLoaded', loadBuckets);
