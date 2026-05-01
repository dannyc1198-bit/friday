# FRIDAY Face-ID Setup (Option A: Strict hard gate)

Identity is decided **locally** by OpenCV's YuNet detector + SFace recognizer
(both ArcFace-quality, both shipped as ONNX, no extra Python deps beyond
what the sidecar already needs). This runs BEFORE the vision LLM call. The
vision model (Gemini 2.5 Flash) is told who the person is as a fact, not
asked to guess.

Why not InsightFace? Its source distro requires MSVC to compile a Cython
3D-mesh extension we don't even use. OpenCV's native face APIs deliver the
same recognition quality without the build pain.

## One-time setup

```bash
cd C:\Users\12368\jarvis\apps\sidecar

# 1. Install Python deps
python -m pip install -r requirements.txt

# 2. Download face models (~37MB) into data/models/
mkdir data\models
curl -L -o data\models\yunet.onnx https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx
curl -L -o data\models\sface.onnx https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx

# 3. Add keys to apps/orchestrator/.env (sidecar reads from there):
#    GEMINI_API_KEY=...    https://aistudio.google.com/apikey   (free)
#    GROQ_API_KEY=...      https://console.groq.com             (free)

# 4. Enroll your face — stand in front of webcam, vary angle/lighting between snaps
python enroll_face.py
# -> data/faces/danny.npy
```

## Run

```bash
python main.py --once          # one scan, then exit (smoke test)
python main.py                 # full daemon mode
```

Watch the logs for:
- `Face match: danny (score=0.612)` ← you, recognized
- `Face match: none (Unknown / no face)` ← stranger or no face

When unknown person + camera sees them, `security_concern='unknown_person'` fires.
When YOU arrive after >10min absence, the Hello-boss greeting fires.

## Tuning the strict gate

Open `plugins/face_recognizer.py` → `_match_policy()`. Default (Strict):

```python
if best_score < FACE_MATCH_THRESHOLD: return None    # 0.50
if best_name != OWNER_NAME: return None
# margin check: top1 - top2 >= 0.10 (active once 2+ faces enrolled)
```

SFace cosine sim reference (different scale than InsightFace's ArcFace):
- `> 0.50` very confident match
- `0.40–0.50` likely match (different lighting/angle)
- `0.363` OpenCV's published default threshold
- `< 0.30` not the same person

If FRIDAY ignores you in low light → drop `FACE_MATCH_THRESHOLD` in
`config.py` to 0.45. If a look-alike sneaks through → raise to 0.55.

## What changed (vs Anthropic-only kitchen nagger)

| Component | Before | After |
|---|---|---|
| Vision | `claude-sonnet-4` (Anthropic, paid, blocked) | `gemini-2.5-flash` (Google, free) |
| Nag text | `claude-haiku-4-5` (Anthropic, paid) | `llama-3.3-70b-versatile` via Groq (free) |
| Greeting text | `claude-sonnet-4` | `llama-3.3-70b-versatile` via Groq |
| Identity | VLM guesses "person_detected: true/false" | OpenCV YuNet+SFace local match → name passed to VLM |
| Greeting trigger | Any person | Only verified owner |
| Nag trigger | Any person | Only verified owner |
| Stranger | Generic `person_detected: true` | `security_concern: unknown_person` |

Net new monthly cost: **$0** (both providers have free tiers covering this workload).
