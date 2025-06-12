from __future__ import annotations
import os
import json
import re
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Tuple, List, Optional

import numpy as np
from flask import Flask, request, jsonify, send_from_directory
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', 'AIzaSyC4ddJdNRvRBXx9xfQ7T5IH1zvZPNb4Goc')
CHAT_MODEL = 'gemini-2.0-flash'
EMBED_MODEL = 'text-embedding-004'
DUPLICATE_THRESHOLD = 0.80

STOPWORDS = {
    "The", "A", "An", "In", "On", "At", "For", "And", "Of", "To", "With",
    "By", "Or", "But", "Nor", "So", "Yet", "From", "Into", "During", "Until",
}

app = Flask(__name__, static_folder='static', static_url_path='')

# ---------------------------------------------------------------------------
# Data models
class NoteProcessing(BaseModel):
    clean: str
    side: str
    project_candidate: str | None
    rationale: str

class Bucket(BaseModel):
    side: str
    name: str
    centroid: List[float] = Field(default_factory=list)
    note_count: int = 0
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def update_centroid(self, note_vec: List[float]):
        if self.note_count == 0 or len(self.centroid) != len(note_vec):
            self.centroid = list(note_vec)
        else:
            self.centroid = list(
                (np.array(self.centroid) * self.note_count + np.array(note_vec))
                / (self.note_count + 1)
            )
        self.note_count += 1

# ---------------------------------------------------------------------------
# Helpers
_proper_noun_re = re.compile(r"(?:[A-Z][a-z'\u2011-]+\s+){1,}[A-Z][a-z'\u2011-]+")


def extract_proper_noun(text: str) -> Optional[str]:
    for match in _proper_noun_re.finditer(text):
        phrase = match.group().strip()
        tokens = [t for t in phrase.split() if t not in STOPWORDS]
        if len(tokens) >= 2:
            return " ".join(tokens)[:60]
    return None


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    return 0.0 if denom == 0 else float(np.dot(a, b) / denom)

# ---------------------------------------------------------------------------
# Storage
ROOT = Path(__file__).resolve().parent
BUCKETS_PATH = ROOT / 'buckets.json'
NOTES_PATH = ROOT / 'notes.json'

if BUCKETS_PATH.exists():
    raw = json.loads(BUCKETS_PATH.read_text())
    buckets: Dict[Tuple[str, str], Bucket] = {
        tuple(k.split('::')): Bucket(**v) for k, v in raw.items()
    }
else:
    buckets = {
        ('work', 'Scratchpad'): Bucket(side='work', name='Scratchpad'),
        ('personal', 'Scratchpad'): Bucket(side='personal', name='Scratchpad'),
    }

notes: List[dict] = json.loads(NOTES_PATH.read_text()) if NOTES_PATH.exists() else []

# Gemini client
client = genai.Client(api_key=GEMINI_API_KEY)

# ---------------------------------------------------------------------------
# Logic

def process_text(raw_text: str) -> dict:
    existing_projects_work = [n for (s, n) in buckets if s == 'work' and n != 'Scratchpad']
    existing_projects_personal = [n for (s, n) in buckets if s == 'personal' and n != 'Scratchpad']

    prompt = f"""
You are an organisational assistant. Clean up the transcribed note, decide whether it's 'work' or 'personal', and, if appropriate, propose a concise project name.

Current work projects: {existing_projects_work or 'None'}
Current personal projects: {existing_projects_personal or 'None'}

User context: The user is a grad student; anything tagged as research or academic reading counts as *work*.

Rules:
- Prefer *specific* project names. If the note references a distinct event, deliverable, or proper noun (e.g., Conference 2025, Mom Birthday, CASA Application), create or reuse a project bucket.
- Avoid generic terms like 'work', 'life', 'misc'.
- If genuinely unsure, set project_candidate to null; the note will go to Scratchpad.
- If the note names a **brand / initiative plus a generic medium**, drop the medium and keep only the core project name.
- Always return JSON that matches the schema.

Transcribed text (verbatim):
{raw_text}
"""

    chat_resp = client.models.generate_content(
        model=CHAT_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type='application/json',
            response_schema=NoteProcessing,
        ),
    )

    note_info = NoteProcessing.model_validate_json(chat_resp.text)
    proj_name: str | None = note_info.project_candidate
    if proj_name is None:
        heuristic = extract_proper_noun(note_info.clean)
        if heuristic:
            proj_name = heuristic
    chosen_side = note_info.side.lower()

    if proj_name and proj_name != 'Scratchpad':
        embed_resp = client.models.embed_content(model=EMBED_MODEL, contents=proj_name)
        cand_vec = np.array(embed_resp.embeddings[0].values, dtype=np.float32)

        best_name, best_score = None, 0.0
        for (side, name), bucket in buckets.items():
            if side != chosen_side or name == 'Scratchpad' or bucket.note_count == 0:
                continue
            score = cosine(cand_vec, np.array(bucket.centroid, dtype=np.float32))
            if score > best_score:
                best_name, best_score = name, score

        if best_score >= DUPLICATE_THRESHOLD:
            proj_name = best_name
    else:
        proj_name = 'Scratchpad'

    bucket_key = (chosen_side, proj_name)
    if bucket_key not in buckets:
        buckets[bucket_key] = Bucket(side=chosen_side, name=proj_name)

    text_vec = client.models.embed_content(model=EMBED_MODEL, contents=note_info.clean).embeddings[0].values
    buckets[bucket_key].update_centroid(text_vec)

    note = {
        'id': len(notes) + 1,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'side': chosen_side,
        'bucket': proj_name,
        'clean_text': note_info.clean,
        'rationale': note_info.rationale,
    }
    notes.append(note)

    BUCKETS_PATH.write_text(json.dumps({f"{s}::{n}": b.model_dump() for (s, n), b in buckets.items()}, indent=2))
    NOTES_PATH.write_text(json.dumps(notes, indent=2))

    return note

# ---------------------------------------------------------------------------
# Routes
@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/process_note', methods=['POST'])
def process_note_route():
    data = request.get_json(force=True)
    text = data.get('text', '').strip()
    if not text:
        return jsonify({'error': 'no text'}), 400
    note = process_text(text)
    return jsonify(note)

@app.route('/buckets')
def list_buckets():
    return jsonify({
        'buckets': [
            {
                'side': s,
                'name': n,
                'note_count': b.note_count,
            }
            for (s, n), b in buckets.items()
            if not (n == 'Scratchpad' and b.note_count == 0)
        ]
    })

@app.route('/buckets/<side>/<name>', methods=['PUT'])
def edit_bucket(side, name):
    """Edit bucket name"""
    data = request.get_json(force=True)
    new_name = data.get('new_name', '').strip()
    
    if not new_name:
        return jsonify({'error': 'new_name is required'}), 400
    
    if new_name == 'Scratchpad':
        return jsonify({'error': 'Cannot rename to Scratchpad'}), 400
    
    old_key = (side, name)
    new_key = (side, new_name)
    
    if old_key not in buckets:
        return jsonify({'error': 'Bucket not found'}), 404
    
    if new_key in buckets:
        return jsonify({'error': 'Bucket with new name already exists'}), 409
    
    # Update bucket
    bucket = buckets[old_key]
    bucket.name = new_name
    buckets[new_key] = bucket
    del buckets[old_key]
    
    # Update all notes with the old bucket name
    for note in notes:
        if note['side'] == side and note['bucket'] == name:
            note['bucket'] = new_name
    
    # Save changes
    BUCKETS_PATH.write_text(json.dumps({f"{s}::{n}": b.model_dump() for (s, n), b in buckets.items()}, indent=2))
    NOTES_PATH.write_text(json.dumps(notes, indent=2))
    
    return jsonify({'success': True})

@app.route('/buckets/<side>/<name>', methods=['DELETE'])
def delete_bucket(side, name):
    """Delete bucket and all its notes"""
    if name == 'Scratchpad':
        return jsonify({'error': 'Cannot delete Scratchpad'}), 400
    
    bucket_key = (side, name)
    
    if bucket_key not in buckets:
        return jsonify({'error': 'Bucket not found'}), 404
    
    # Remove bucket
    del buckets[bucket_key]
    
    # Remove all notes from this bucket
    global notes
    notes = [note for note in notes if not (note['side'] == side and note['bucket'] == name)]
    
    # Save changes
    BUCKETS_PATH.write_text(json.dumps({f"{s}::{n}": b.model_dump() for (s, n), b in buckets.items()}, indent=2))
    NOTES_PATH.write_text(json.dumps(notes, indent=2))
    
    return jsonify({'success': True})

@app.route('/buckets/<side>/<name>/notes')
def get_bucket_notes(side, name):
    """Get all notes for a specific bucket"""
    bucket_notes = [
        note for note in notes 
        if note['side'] == side and note['bucket'] == name
    ]
    
    # Sort by creation date, newest first
    bucket_notes.sort(key=lambda x: x['created_at'], reverse=True)
    
    return jsonify({
        'notes': bucket_notes,
        'bucket': {
            'side': side,
            'name': name,
            'note_count': len(bucket_notes)
        }
    })

@app.route('/notes/<int:note_id>', methods=['PUT'])
def edit_note(note_id):
    """Edit a note's text"""
    data = request.get_json(force=True)
    new_text = data.get('text', '').strip()
    
    if not new_text:
        return jsonify({'error': 'text is required'}), 400
    
    # Find the note
    note = None
    for n in notes:
        if n['id'] == note_id:
            note = n
            break
    
    if not note:
        return jsonify({'error': 'Note not found'}), 404
    
    # Update the note
    note['clean_text'] = new_text
    note['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    # Save changes
    NOTES_PATH.write_text(json.dumps(notes, indent=2))
    
    return jsonify({'success': True, 'note': note})

@app.route('/notes/<int:note_id>', methods=['DELETE'])
def delete_note(note_id):
    """Delete a note"""
    global notes
    
    # Find and remove the note
    original_count = len(notes)
    notes = [note for note in notes if note['id'] != note_id]
    
    if len(notes) == original_count:
        return jsonify({'error': 'Note not found'}), 404
    
    # Update bucket note count
    # We need to recalculate all bucket counts since we don't know which bucket the note was in
    for bucket in buckets.values():
        bucket.note_count = len([n for n in notes if n['side'] == bucket.side and n['bucket'] == bucket.name])
    
    # Save changes
    NOTES_PATH.write_text(json.dumps(notes, indent=2))
    BUCKETS_PATH.write_text(json.dumps({f"{s}::{n}": b.model_dump() for (s, n), b in buckets.items()}, indent=2))
    
    return jsonify({'success': True})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)
