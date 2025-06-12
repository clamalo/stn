# note_capture_demo.py – bucket demo with 10 hard‑coded notes (no Whisper)
# ---------------------------------------------------------------------------
# This script runs ten example note strings through Gemini‑powered cleanup &
# categorisation and shows how they land in buckets.  It now includes:
#   • Prompt tuned to encourage *specific* project creation.
#   • A tiny proper‑noun heuristic: if Gemini returns `project_candidate=null`,
#     we scan the cleaned text for 2‑plus‑word capitalised phrases and promote
#     the first hit as the project name.  This keeps Scratchpads from bloating.
#   • Cosine duplicate‑guard against existing project centroids (unchanged).
# ---------------------------------------------------------------------------
# Quick‑start (local):
#   pip install google-generativeai pydantic>=2 numpy
#   export GEMINI_API_KEY="<your‑key>"
#   python note_capture_demo.py
# ---------------------------------------------------------------------------

import os
import json
import re
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Tuple, List, Optional

import numpy as np
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Config
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSyC4ddJdNRvRBXx9xfQ7T5IH1zvZPNb4Goc")
CHAT_MODEL = "gemini-2.0-flash"
EMBED_MODEL = "text-embedding-004"  # 768‑D
DUPLICATE_THRESHOLD = 0.80          # cosine similarity for project merge

# Stop‑words for the proper‑noun heuristic (very small set)
STOPWORDS = {
    "The", "A", "An", "In", "On", "At", "For", "And", "Of", "To", "With",
    "By", "Or", "But", "Nor", "So", "Yet", "From", "Into", "During", "Until",
}

# Ten demo note strings ------------------------------------------------------
DEMO_NOTES = [
    "Refactor HARPnet training script and push to GitHub by Friday.",
    "Buy groceries for camping trip this weekend.",
    "Schedule 1:1 with Sarah to discuss Q3 marketing strategy for Conference 2025.",
    "Ideas for Powderchasers Instagram captions: focus on upcoming Andes storm.",
    "Doctor appointment follow‑up: email Dr. Smith about lab results.",
    "Finish reading Sutton's Reinforcement Learning book for research project.",
    "Book flights to Denver for wedding in August.",
    "Create draft of CASA internship reflection for graduate application.",
    "Optimize precipitation model on Derecho supercomputer with new normalization.",
    "Plan birthday surprise for mom next month."
]

# ---------------------------------------------------------------------------
# Data models (Pydantic v2)

class NoteProcessing(BaseModel):
    clean: str = Field(..., description="Polished note text")
    side: str = Field(..., description="'work' or 'personal'")
    project_candidate: str | None = Field(..., description="Project name or null")
    rationale: str = Field(..., description="Debug explanation")

class Bucket(BaseModel):
    side: str
    name: str  # project name or "Scratchpad"
    centroid: List[float] = Field(default_factory=list)
    note_count: int = 0
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def update_centroid(self, note_vec: List[float]):
        """Incremental mean update in O(d) time."""
        if self.note_count == 0 or len(self.centroid) != len(note_vec):
            self.centroid = list(note_vec)
        else:
            self.centroid = list(
                (
                    np.array(self.centroid) * self.note_count + np.array(note_vec)
                )
                / (self.note_count + 1)
            )
        self.note_count += 1

# ---------------------------------------------------------------------------
# Helpers

def cosine(a: np.ndarray, b: np.ndarray) -> float:
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    return 0.0 if denom == 0 else float(np.dot(a, b) / denom)

_proper_noun_re = re.compile(r"(?:[A-Z][a-z'‑-]+\s+){1,}[A-Z][a-z'‑-]+")

def extract_proper_noun(text: str) -> Optional[str]:
    """Return the first 2+ word capitalised phrase, excluding trivial stop‑words."""
    for match in _proper_noun_re.finditer(text):
        phrase = match.group().strip()
        tokens = [t for t in phrase.split() if t not in STOPWORDS]
        if len(tokens) >= 2:
            return " ".join(tokens)[:60]  # keep it short
    return None

# ---------------------------------------------------------------------------
# Bucket store (JSON files so they persist across runs)
ROOT = Path(__file__).resolve().parent
BUCKETS_PATH = ROOT / "buckets.json"
NOTES_PATH = ROOT / "notes.json"

if BUCKETS_PATH.exists():
    raw = json.loads(BUCKETS_PATH.read_text())
    buckets: Dict[Tuple[str, str], Bucket] = {
        tuple(k.split("::")): Bucket(**v) for k, v in raw.items()
    }
else:
    buckets = {
        ("work", "Scratchpad"): Bucket(side="work", name="Scratchpad"),
        ("personal", "Scratchpad"): Bucket(side="personal", name="Scratchpad"),
    }

notes: List[dict] = json.loads(NOTES_PATH.read_text()) if NOTES_PATH.exists() else []

# ---------------------------------------------------------------------------
# Gemini client
client = genai.Client(api_key=GEMINI_API_KEY)

print("Processing demo notes…\n")

for idx, raw_text in enumerate(DEMO_NOTES, start=1):
    print(f"→ Note {idx}: {raw_text}")

    existing_projects_work = [n for (s, n) in buckets if s == "work" and n != "Scratchpad"]
    existing_projects_personal = [n for (s, n) in buckets if s == "personal" and n != "Scratchpad"]

    prompt = f"""
You are an organisational assistant. Clean up the transcribed note, decide whether it's 'work' or 'personal', and, if appropriate, propose a concise project name.

Current work projects: {existing_projects_work or 'None'}
Current personal projects: {existing_projects_personal or 'None'}

User context: The user is a grad student; anything tagged as research or academic reading counts as *work*.

Rules:
- Prefer *specific* project names. If the note references a distinct event, deliverable, or proper noun (e.g., Conference 2025, Mom Birthday, CASA Application), create or reuse a project bucket.
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
            response_mime_type="application/json",
            response_schema=NoteProcessing,
        ),
    )

    note_info = NoteProcessing.model_validate_json(chat_resp.text)

    # -------------------------------------------------------------------
    # Post‑processing if Gemini punted on project_candidate
    proj_name: str | None = note_info.project_candidate

    if proj_name is None:
        heuristic = extract_proper_noun(note_info.clean)
        if heuristic:
            proj_name = heuristic
    chosen_side = note_info.side.lower()

    # -------------------------------------------------------------------
    # Duplicate‑guard via embeddings (only if we now have a proj_name)
    if proj_name and proj_name != "Scratchpad":
        embed_resp = client.models.embed_content(model=EMBED_MODEL, contents=proj_name)
        cand_vec = np.array(embed_resp.embeddings[0].values, dtype=np.float32)

        best_name, best_score = None, 0.0
        for (side, name), bucket in buckets.items():
            if side != chosen_side or name == "Scratchpad" or bucket.note_count == 0:
                continue
            score = cosine(cand_vec, np.array(bucket.centroid, dtype=np.float32))
            if score > best_score:
                best_name, best_score = name, score

        if best_score >= DUPLICATE_THRESHOLD:
            proj_name = best_name
    else:
        proj_name = "Scratchpad"

    # -------------------------------------------------------------------
    bucket_key = (chosen_side, proj_name)
    if bucket_key not in buckets:
        buckets[bucket_key] = Bucket(side=chosen_side, name=proj_name)

    # Embed cleaned note & update centroid
    text_vec = client.models.embed_content(model=EMBED_MODEL, contents=note_info.clean).embeddings[0].values
    buckets[bucket_key].update_centroid(text_vec)

    # Persist note
    notes.append(
        {
            "id": len(notes) + 1,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "side": chosen_side,
            "bucket": proj_name,
            "clean_text": note_info.clean,
            "rationale": note_info.rationale,
        }
    )

# ---------------------------------------------------------------------------
# Save stores
BUCKETS_PATH.write_text(
    json.dumps({f"{s}::{n}": b.model_dump() for (s, n), b in buckets.items()}, indent=2)
)
NOTES_PATH.write_text(json.dumps(notes, indent=2))

# ---------------------------------------------------------------------------
# Summary
print("\n=== Bucket Summary ===")
for (side, name), bucket in sorted(buckets.items()):
    print(f"{side.title():<8} | {name:<25} | {bucket.note_count} notes")

print("\nProcessed", len(DEMO_NOTES), "demo notes. Check buckets.json and notes.json for details.")
