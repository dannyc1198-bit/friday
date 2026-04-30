# FRIDAY Face-ID Setup (Option A: hard gate)

Identity is decided **locally** by InsightFace before any vision LLM call.
The vision model (Gemini 2.5 Flash) is told who the person is as a fact, not asked to guess.

## One-time setup

```bash
cd C:\Users\12368\jarvis\apps\sidecar

# 1. Install new deps
pip install -r requirements.txt
# First run of insightface auto-downloads the buffalo_l model (~280MB) to ~/.insightface/

# 2. Add your Gemini key to apps/orchestrator/.env (free at https://aistudio.google.com/apikey)
#    GEMINI_API_KEY=...

# 3. Enroll your face — stand in front of webcam, vary angle/lighting between snaps
python enroll_face.py
# -> data/faces/danny.npy
```

## Run

```bash
python main.py
# Watch for log lines:
#   "Face match: danny (score=0.612)"  ← you, recognized
#   "Face match: none"                  ← unknown / no face

# When unknown person + camera sees them, security_concern='unknown_person' fires
# When YOU arrive after >10min absence, the Hello-boss greeting fires
```

## Tuning the hard gate

Open `plugins/face_recognizer.py` → `_match_policy()`. The default is:

```python
if best_score < FACE_MATCH_THRESHOLD: return None   # 0.45 in config.py
if best_name != OWNER_NAME: return None
return (best_name, best_score)
```

Reference points for buffalo_l ArcFace cosine sim:
- `> 0.55` very confident match
- `0.45–0.55` likely match (different lighting/angle)
- `0.35–0.45` borderline
- `< 0.35` not the same person

If FRIDAY ignores you in low light → lower threshold to 0.40.
If a stranger gets greeted → raise to 0.50 and add a margin check.

## What changed (vs pre-face-ID)

| Component | Before | After |
|---|---|---|
| Vision | `claude-sonnet-4` (Anthropic, paid, blocked) | `gemini-2.5-flash` (Google, free) |
| Nag text | `claude-haiku-4-5` (Anthropic, paid) | `llama-3.3-70b-versatile` via Groq (free) |
| Greeting text | `claude-sonnet-4` | `llama-3.3-70b-versatile` via Groq |
| Identity | VLM guesses "person_detected: true/false" | InsightFace local match → name passed to VLM |
| Greeting trigger | Any person | Only verified owner |
| Nag trigger | Any person | Only verified owner |
| Stranger | Generic `person_detected: true` | `security_concern: unknown_person` |

Net new monthly cost: **$0**.
