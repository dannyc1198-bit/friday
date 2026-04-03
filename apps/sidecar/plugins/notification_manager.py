"""
Notification Manager — Multi-channel alerts (Toast, VAPI phone, log file).
"""
import os
import logging
import subprocess
from datetime import datetime
from pathlib import Path
import httpx

from config import VAPI_API_KEY, VAPI_ASSISTANT_ID, SIDECAR_DIR

log = logging.getLogger("sidecar.notifications")

NOTIF_LOG = SIDECAR_DIR / "data" / "notifications.log"


class NotificationManager:
    def __init__(self):
        NOTIF_LOG.parent.mkdir(parents=True, exist_ok=True)

    def log_notification(self, message: str):
        """Always log to file."""
        with open(NOTIF_LOG, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {message}\n")

    def send_toast(self, title: str, message: str):
        """Windows toast notification via PowerShell."""
        try:
            safe_msg = message.replace('"', '`"').replace("'", "`'")
            safe_title = title.replace('"', '`"').replace("'", "`'")
            ps_cmd = f'''
            [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
            $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
            $textNodes = $template.GetElementsByTagName("text")
            $textNodes.Item(0).AppendChild($template.CreateTextNode("{safe_title}")) > $null
            $textNodes.Item(1).AppendChild($template.CreateTextNode("{safe_msg}")) > $null
            $toast = [Windows.UI.Notifications.ToastNotification]::new($template)
            [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("JARVIS").Show($toast)
            '''
            subprocess.run(["powershell", "-Command", ps_cmd], capture_output=True, timeout=10)
            log.info("Toast notification sent")
        except Exception as e:
            log.warning(f"Toast failed: {e}")

    def send_phone_call(self, message: str, phone: str = ""):
        """Trigger VAPI phone call for critical alerts."""
        if not VAPI_API_KEY:
            log.warning("No VAPI key, skipping phone call")
            return

        try:
            with httpx.Client(timeout=30) as client:
                resp = client.post(
                    "https://api.vapi.ai/call/phone",
                    headers={"Authorization": f"Bearer {VAPI_API_KEY}", "Content-Type": "application/json"},
                    json={
                        "assistantId": VAPI_ASSISTANT_ID,
                        "customer": {"number": phone} if phone else {},
                        "assistantOverrides": {"firstMessage": f"JARVIS Alert: {message}"},
                    },
                )
                log.info(f"VAPI call initiated: {resp.status_code}")
        except Exception as e:
            log.warning(f"VAPI call failed: {e}")

    def alert(self, title: str, message: str, level: str = "info", phone: str = ""):
        """Send alert through appropriate channels based on level."""
        self.log_notification(f"[{level.upper()}] {title}: {message}")

        if level in ("info", "warning", "critical"):
            self.send_toast(title, message)

        if level == "critical" and phone:
            self.send_phone_call(message, phone)
