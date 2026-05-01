"""
Face Recognizer — OpenCV YuNet detector + SFace recognizer (ArcFace-quality).

Why OpenCV instead of InsightFace: InsightFace's source distro requires MSVC to
compile a Cython 3D-mesh extension that we don't even use. OpenCV ships YuNet
+ SFace as native ONNX-backed C++ modules — zero extra Python deps, zero
compilation, same recognition quality (SFace is ~99.6% on LFW).

Workflow (unchanged from the InsightFace version):
  1. enroll_face.py captures N frames -> averages embedding -> data/faces/<name>.npy
  2. recognize(frame_bytes) returns (name, score) for the best match passing the
     hard-gate policy, or None.

Identity is decided HERE (locally, deterministic). The vision LLM (Gemini)
is told who the person is — it never has to guess.
"""
from __future__ import annotations

import logging
import threading
from pathlib import Path

import cv2
import numpy as np

from config import (
    FACE_DB_DIR, FACE_MATCH_THRESHOLD, FACE_MATCH_MARGIN,
    FACE_DETECTION_SIZE, OWNER_NAME, SIDECAR_DIR,
)

log = logging.getLogger("sidecar.face")

MODELS_DIR = SIDECAR_DIR / "data" / "models"
YUNET_PATH = MODELS_DIR / "yunet.onnx"
SFACE_PATH = MODELS_DIR / "sface.onnx"

_detector = None
_recognizer = None
_lock = threading.Lock()


def _ensure_loaded():
    global _detector, _recognizer
    with _lock:
        if _detector is None:
            if not YUNET_PATH.exists() or not SFACE_PATH.exists():
                raise RuntimeError(
                    f"Face models missing in {MODELS_DIR}. Re-download yunet.onnx + sface.onnx."
                )
            log.info("Loading YuNet + SFace...")
            _detector = cv2.FaceDetectorYN.create(
                str(YUNET_PATH), "", FACE_DETECTION_SIZE,
                score_threshold=0.7, nms_threshold=0.3, top_k=5000,
            )
            _recognizer = cv2.FaceRecognizerSF.create(str(SFACE_PATH), "")
            log.info("Face models ready.")
        return _detector, _recognizer


def _decode_frame(frame_bytes: bytes) -> np.ndarray | None:
    arr = np.frombuffer(frame_bytes, dtype=np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def embed(frame_bytes: bytes) -> np.ndarray | None:
    """
    Detect the largest face in the frame and return its 128-d L2-normalized embedding.
    Returns None if no face is detected.
    """
    img = _decode_frame(frame_bytes)
    if img is None:
        return None
    detector, recognizer = _ensure_loaded()

    h, w = img.shape[:2]
    detector.setInputSize((w, h))
    _, faces = detector.detect(img)
    if faces is None or len(faces) == 0:
        return None

    # Largest bbox (idx 0=x, 1=y, 2=w, 3=h, then 5 landmarks, then score)
    faces = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)
    aligned = recognizer.alignCrop(img, faces[0])
    feat = recognizer.feature(aligned).flatten().astype(np.float32)
    norm = np.linalg.norm(feat)
    return feat / norm if norm > 0 else None


def enroll(name: str, frame_bytes_list: list[bytes]) -> int:
    """Average embeddings across frames -> data/faces/<name>.npy. Returns count used."""
    FACE_DB_DIR.mkdir(parents=True, exist_ok=True)
    embeddings: list[np.ndarray] = []
    for fb in frame_bytes_list:
        e = embed(fb)
        if e is not None:
            embeddings.append(e)
    if not embeddings:
        raise RuntimeError("No faces detected in any enrollment frame.")
    avg = np.mean(np.stack(embeddings), axis=0)
    avg = avg / np.linalg.norm(avg)
    out = FACE_DB_DIR / f"{name.lower()}.npy"
    np.save(out, avg)
    log.info(f"Enrolled '{name}': {len(embeddings)}/{len(frame_bytes_list)} frames -> {out}")
    return len(embeddings)


def _load_db() -> dict[str, np.ndarray]:
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
    """Return (name, cosine_score) of the best match passing the policy, else None."""
    e = embed(frame_bytes)
    if e is None:
        return None
    db = _load_db()
    if not db:
        log.warning("No enrolled faces in DB — run enroll_face.py first.")
        return None
    # Both vectors L2-normalized -> dot product == cosine similarity
    scored = [(name, float(np.dot(e, ref))) for name, ref in db.items()]
    scored.sort(key=lambda x: x[1], reverse=True)
    best_name, best_score = scored[0]
    log.debug(f"Face match candidates: {scored[:3]}")
    return _match_policy(best_name, best_score, scored)


# ────────────────────────────────────────────────────────────────────
# STRICT hard-gate policy (Option A).
#
# SFace cosine reference (different scale than ArcFace/InsightFace!):
#   > 0.50  very confident match
#   0.40–0.50 likely match
#   0.363   OpenCV's published default threshold for SFace
#   < 0.30  not the same person
#
# Strict tuning: cosine >= FACE_MATCH_THRESHOLD (0.50), owner-only,
# top1 - top2 >= FACE_MATCH_MARGIN (0.10) once 2+ faces are enrolled.
# ────────────────────────────────────────────────────────────────────
def _match_policy(
    best_name: str,
    best_score: float,
    all_scores: list[tuple[str, float]],
) -> tuple[str, float] | None:
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
