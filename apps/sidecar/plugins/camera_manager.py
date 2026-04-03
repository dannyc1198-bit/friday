"""
Camera Manager — Thread-safe camera capture with persistent VideoCapture.
Supports USB webcam, RTSP streams, and HTTP snapshot URLs.
"""
import cv2
import time
import logging
import threading
import httpx

log = logging.getLogger("sidecar.camera")


class CameraManager:
    def __init__(self):
        self._frame: bytes | None = None
        self._lock = threading.Lock()
        self._running = False
        self._thread: threading.Thread | None = None
        self._source_type: str = "webcam"
        self._source = 0
        self._cap: cv2.VideoCapture | None = None

    def start(self, source_type: str = "webcam", source=0):
        """Start the camera capture thread."""
        self._source_type = source_type
        self._source = source
        self._running = True

        if source_type in ("webcam", "rtsp"):
            self._thread = threading.Thread(target=self._capture_loop, daemon=True)
        else:
            self._thread = threading.Thread(target=self._http_loop, daemon=True)

        self._thread.start()
        log.info(f"Camera started: {source_type} — {source}")

    def stop(self):
        self._running = False
        if self._cap:
            self._cap.release()
            self._cap = None

    def get_frame(self) -> bytes | None:
        """Get the latest JPEG frame (thread-safe)."""
        with self._lock:
            return self._frame

    def _set_frame(self, frame_bytes: bytes):
        with self._lock:
            self._frame = frame_bytes

    def _open_capture(self) -> cv2.VideoCapture | None:
        """Open the VideoCapture device."""
        if self._source_type == "webcam":
            cap = cv2.VideoCapture(self._source, cv2.CAP_DSHOW)
            if not cap.isOpened():
                cap = cv2.VideoCapture(self._source)
        elif self._source_type == "rtsp":
            cap = cv2.VideoCapture(self._source)
        else:
            return None

        if not cap.isOpened():
            log.error(f"Cannot open camera: {self._source}")
            return None

        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        # Warmup frames
        cap.read()
        cap.read()
        return cap

    def _capture_loop(self):
        """Persistent capture loop — keeps VideoCapture open."""
        self._cap = self._open_capture()
        if not self._cap:
            log.error("Camera failed to open, capture loop exiting")
            return

        consecutive_failures = 0
        while self._running:
            try:
                ret, frame = self._cap.read()
                if ret:
                    _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                    self._set_frame(buf.tobytes())
                    consecutive_failures = 0
                else:
                    consecutive_failures += 1
                    if consecutive_failures > 10:
                        log.warning("Too many capture failures, reopening camera...")
                        self._cap.release()
                        time.sleep(2)
                        self._cap = self._open_capture()
                        consecutive_failures = 0

                time.sleep(0.5)  # ~2 FPS, sufficient for monitoring
            except Exception as e:
                log.error(f"Capture error: {e}")
                time.sleep(1)

        if self._cap:
            self._cap.release()

    def _http_loop(self):
        """HTTP snapshot loop for IP cameras."""
        while self._running:
            try:
                with httpx.Client(timeout=10) as client:
                    resp = client.get(str(self._source))
                    resp.raise_for_status()
                    self._set_frame(resp.content)
            except Exception as e:
                log.error(f"HTTP snapshot failed: {e}")
            time.sleep(2)
