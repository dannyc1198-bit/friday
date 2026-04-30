"""
Enroll a face for FRIDAY's hard-gate identity check.

Usage:
    python enroll_face.py                  # enrolls "danny" from webcam 0, 12 frames
    python enroll_face.py --name alice     # enroll someone else
    python enroll_face.py --camera 1       # alt webcam
    python enroll_face.py --frames 20      # more samples = more robust template

Stand in front of the camera, vary your angle/lighting slightly between captures.
Output: data/faces/<name>.npy (a 512-d normalized embedding average).
"""
import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import cv2  # noqa: E402
from plugins.face_recognizer import enroll  # noqa: E402
from config import OWNER_NAME  # noqa: E402


def capture_frames(cam_index: int, n: int, delay: float = 1.0) -> list[bytes]:
    cap = cv2.VideoCapture(cam_index, cv2.CAP_DSHOW)
    if not cap.isOpened():
        cap = cv2.VideoCapture(cam_index)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open webcam #{cam_index}")
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    # Warmup
    for _ in range(3):
        cap.read()

    frames: list[bytes] = []
    print(f"Capturing {n} frames — look into the camera and slowly vary angle/lighting.")
    for i in range(n):
        ok, frame = cap.read()
        if not ok:
            print(f"  [{i+1}/{n}] capture failed, retrying")
            time.sleep(delay)
            continue
        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
        frames.append(buf.tobytes())
        print(f"  [{i+1}/{n}] captured")
        time.sleep(delay)

    cap.release()
    return frames


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", default=OWNER_NAME, help="Identity label")
    ap.add_argument("--camera", type=int, default=0, help="Webcam index")
    ap.add_argument("--frames", type=int, default=12, help="Number of samples to capture")
    ap.add_argument("--delay", type=float, default=1.0, help="Seconds between captures")
    args = ap.parse_args()

    frames = capture_frames(args.camera, args.frames, args.delay)
    if not frames:
        print("No frames captured — aborting.")
        sys.exit(1)

    used = enroll(args.name, frames)
    print(f"\nEnrolled '{args.name}' using {used}/{len(frames)} frames with detected faces.")
    print("FRIDAY can now hard-gate greetings to this identity.")


if __name__ == "__main__":
    main()
