"""
Security Monitor — Detects unusual activity with per-type cooldown.
Fixes the lights_on_empty spam by enforcing 30-min cooldown per alert type.
"""
import time
import logging

from config import SECURITY_ALERT_COOLDOWN

log = logging.getLogger("sidecar.security")


class SecurityMonitor:
    def __init__(self, notification_manager):
        self.notifications = notification_manager
        self._cooldowns: dict[str, float] = {}  # alert_type -> last_fired timestamp

    def check(self, analysis: dict, person_present: bool) -> str | None:
        """Check scene analysis for security concerns. Returns alert message or None."""
        concern = analysis.get("security_concern", "none")
        if not concern or concern == "none":
            return None

        detail = analysis.get("security_detail", "")

        if not self._should_alert(concern):
            log.info(f"Security: {concern} (cooldown active, suppressed)")
            return None

        log.warning(f"SECURITY ALERT: {concern} — {detail}")

        # Only speak if person is present; always send toast
        alert_msg = f"{concern}: {detail}" if detail else concern

        if person_present:
            self.notifications.alert("Security", alert_msg, level="warning")
        else:
            self.notifications.alert("Security", alert_msg, level="critical")

        return alert_msg

    def _should_alert(self, concern: str) -> bool:
        """Enforce cooldown per alert type."""
        now = time.time()
        last = self._cooldowns.get(concern, 0)
        if now - last < SECURITY_ALERT_COOLDOWN:
            return False
        self._cooldowns[concern] = now
        return True
