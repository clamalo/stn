# Speech Bucket Demo

This prototype exposes a minimal front end and back end for capturing short spoken notes and organising them with Google Gemini.

## Setup

```
pip install -r requirements.txt
export GEMINI_API_KEY="<your-key>"
python server.py
```

Then open `http://localhost:5000` in a browser that supports the Web Speech API (Chrome recommended). Existing buckets and notes are stored in `buckets.json` and `notes.json` so they persist across runs.
