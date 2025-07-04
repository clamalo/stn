# Speech Bucket Demo

This project is a small proof‑of‑concept for capturing short voice notes and automatically organising them into "buckets" using Google Gemini.  It consists of a Flask back end and a lightweight front end built with vanilla JavaScript.

Voice notes are transcribed in the browser (via the Web Speech API) and sent to the server.  Gemini cleans up the text, decides whether the note is **work** or **personal**, and proposes a project name.  Notes are grouped into project buckets which can be renamed or deleted from the UI.

Data is stored in `buckets.json` and `notes.json` in the project root so everything persists across runs.

## How it works

1. **Transcription** – The browser uses the Web Speech API to turn audio into text. If speech recognition isn't available, the page records audio and sends it to the server's `/transcribe` endpoint where the `speech_recognition` library performs the transcription.
2. **Gemini processing** – The text is passed to `/process_note`. Gemini Flash cleans up the wording, classifies the note as *work* or *personal*, suggests a project name and explains the decision in a short rationale.
3. **Embeddings and bucket choice** – The suggested project name is embedded with `text-embedding-004`. The embedding is compared with the centroid of each existing bucket using cosine similarity. If any score exceeds `0.80` the note is placed in that bucket; otherwise a new bucket is created.
4. **Updating the bucket** – The cleaned note text is also embedded and the chosen bucket's centroid is updated to be the running average of its notes. This makes future similarity checks more accurate as more notes accumulate.
5. **Persistence** – Notes (including Gemini's rationale) are appended to `notes.json`, and bucket metadata lives in `buckets.json` so everything survives server restarts.

## Quick start

```bash
pip install -r requirements.txt
export GEMINI_API_KEY="<your-key>"
python server.py
```

By default the server runs on `http://localhost:5001`.  Open this address in a browser that supports speech recognition (Chrome recommended) and click the microphone to start dictating.

## Demo script

`test.py` runs ten hard‑coded notes through the same Gemini workflow without the web UI.  It's handy for verifying that the API key works and checking how notes get bucketed.

```bash
python test.py
```

## Notes

The project uses the `google-generativeai` library.  A minimal Whisper example (`whisper_demo.py`) is also included for local experimentation with speech recognition but is not required for normal use.
