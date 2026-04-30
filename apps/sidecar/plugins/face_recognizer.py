"""
Face Recognizer — InsightFace (buffalo_l) wrapper for Option A hard-gate identity.

Workflow:
  1. enroll_face.py captures N frames -> averages embedding -> saves data/faces/<name>.npy
  2. recognize(frame_bytes) returns (name, score) of best match if score >= threshold,
     or None if no enrolled face matches.

The VLM (Gemini) is NEVER asked "who is this" — it only describes the scene.
Identity is decided here, locally, with a face-embedding model. Then we hand the
identity to the scene prompt as a fact: "The person in frame is danny."
"""
from __future__ import annotations

import logging
import threading
from pathlib import Path

import cv2
import numpy as np

from config import (
    FACE_DB_DIR, FACE_MATCH_THRESHOLD, FACE_MATCH_MARGIN,
    FACE_DETECTION_SIZE, OWNER_NAME,
)

log = logging.getLogger("sidecar.face")

_app = None  # lazy-init InsightFace app — heavy import, ~1-2s cold start
_app_lock = threading.Lock()


def _get_app():
    global _app
    with _app_lock:
        if _app is None:
            from insightface.app import FaceAnalysis
            log.info("Loading InsightFace (buffalo_l)...")
            app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
            app.prepare(ctx_id=0, det_size=FACE_DETECTION_SIZE)
            _app = app
            log.info("InsightFace ready.")
        return _app


def _decode_frame(frame_bytes: bytes) -> np.ndarray | None:
    arr = np.frombuffer(frame_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    return img


def embed(frame_bytes: bytes) -> np.ndarray | None:
    """Return the largest face's L2-normalized embedding, or None."""
    img = _decode_frame(frame_bytes)
    if img is None:
        return None
    faces = _get_app().get(img)
    if not faces:
        return None
    # Largest bbox = closest / most likely subject
    faces.sort(key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]), reverse=True)
    emb = faces[0].normed_embedding  # already L2-normalized by InsightFace
    return np.asarray(emb, dtype=np.float32)


def enroll(name: str, frame_bytes_list: list[bytes]) -> int:
    """Average embeddings across frames, save to FACE_DB_DIR/<name>.npy. Returns count used."""
    FACE_DB_DIR.mkdir(parents=True, exist_ok=True)
    embeddings: list[np.ndarray] = []
    for fb in frame_bytes_list:
        e = embed(fb)
        if e is not None:
            embeddings.append(e)
    if not embeddings:
        raise RuntimeError("No faces detected in any enrollment frame.")
    avg = np.mean(np.stack(embeddings), axis=0)
    avg = avg / np.linalg.norm(avg)  # re-normalize after averaging
    out = FACE_DB_DIR / f"{name.lower()}.npy"
    np.save(out, avg)
    log.info(f"Enrolled '{name}': {len(embeddings)}/{len(frame_bytes_list)} frames -> {out}")
    return len(embeddings)


def _load_db() -> dict[str, np.ndarray]:
    """Load all enrolled embeddings keyed by name."""
    db: dict[str, np.ndarray] = {}
    if not FACE_DB_DIR.exists():
        return db
    for p in FACE_DB_DIR.glob("*.npy"):
        try:
            db[p.stem] = np.load(p)
        except Exception as e:
            log.warning(f"Failed to load {p}: {e}")
    return db


def recognize(frame_bytes: bytes) -> tuple[str, float] | None:
    """
    Recognize the largest face in the frame against the enrolled DB.

    Returns (name, cosine_similarity) for the best match if it passes the policy,
    else None. None means: no face in frame, OR face present but didn't pass the
    hard gate (treat as Unknown).
    """
    e = embed(frame_bytes)
    if e is None:
        return None
    db = _load_db()
    if not db:
        log.warning("No enrolled faces in DB — run enroll_face.py first.")
        return None
    # InsightFace embeddings are L2-normalized -> dot product == cosine similarity
    scored = [(name, float(np.dot(e, ref))) for name, ref in db.items()]
    scored.sort(key=lambda x: x[1], reverse=True)
    best_name, best_score = scored[0]
    log.debug(f"Face match candidates: {scored[:3]}")
    return _match_policy(best_name, best_score, scored)


# ────────────────────────────────────────────────────────────────────
# 🛠️  DANNY: implement the match policy below.
#
# This is the HARD GATE for Option A. Tuning here is the difference between
# "FRIDAY ignores you in bad lighting" and "FRIDAY greets a stranger as boss."
#
# Inputs:
#   best_name     — name of top-scoring enrolled face (e.g. "danny")
#   best_score    — cosine similarity in [-1, 1]; with normed_embedding it's
#                   roughly [0.0, 1.0] for face-vs-face.
#   all_scores    — full sorted list [(name, score), ...] in case you want a
#                   margin check (top1 vs top2).
#
# Reference points for buffalo_l ArcFace cosine similarity:
#   > 0.55  — very confident match (same person, similar conditions)
#   0.45–0.55 — likely match (different lighting, slight angle)
#   0.35–0.45 — borderline (could be same person at a bad angle, OR a similar-looking person)
#   < 0.35  — almost certainly not the same person
#
# `FACE_MATCH_THRESHOLD` is currently 0.45 in config.py — feel free to bump it.
#
# Suggested rules to consider:
#   1. Reject if best_score < FACE_MATCH_THRESHOLD                  (below that, it's noise)
#   2. Reject if best_name != OWNER_NAME                            (only the owner gates)
#   3. Optional margin check: best_score - second_score > 0.10      (no near-tie)
#   4. Return (name, score) on accept, else None
#
# Return None means "Unknown" — the scan_loop will then NOT greet, and the
# security monitor will treat the unknown person as suspicious.
#
# Replace the placeholder body below. ~5–10 lines.
# ────────────────────────────────────────────────────────────────────
def _match_policy(
    best_name: str,
    best_score: float,
    all_scores: list[tuple[str, float]],
) -> tuple[str, float] | None:
    # Strict: high floor, owner-only, margin check vs runner-up to reject near-ties.
    if best_score < FACE_MATCH_THRESHOLD:
        return None
    if best_name != OWNER_NAME:
        return None
    if len(all_scores) > 1:
        second_score = all_scores[1][1]
        if (best_score - second_score) < FACE_MATCH_MARGIN:
            log.info(f"Strict reject: top1={best_score:.3f} top2={second_score:.3f} (margin too small)")
            return None
    return (best_name, best_score)
