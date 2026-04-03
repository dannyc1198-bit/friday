"""
Greeting System — "Hello boss" on arrival + daily briefing.
Tracks person presence and departure.
"""
import time
import logging
from datetime import datetime

import anthropic

from config import ANTHROPIC_API_KEY, CLAUDE_MODEL, PERSON_GONE_TIMEOUT
from plugins.memory_loader import build_voice_memory_context

log = logging.getLogger("sidecar.greeting")


class GreetingSystem:
    def __init__(self):
        self.client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    def check(self, analysis: dict, state: dict) -> str | None:
        """Check if person arrived and generate greeting. Returns spoken text or None."""
        person = analysis.get("person_detected", False)
        now = time.time()

        if not person:
            # Mark as gone if timeout exceeded
            if state.get("person_present") and (now - state.get("person_last_seen", 0)) > PERSON_GONE_TIMEOUT:
                state["person_present"] = False
                state["daily_events"].append(f"{datetime.now().strftime('%H:%M')} Danny left")
                log.info("Person left the area")
            return None

        was_gone = not state.get("person_present", False)
        time_since_seen = now - state.get("person_last_seen", 0)

        state["person_present"] = True
        state["person_last_seen"] = now

        if not was_gone and time_since_seen < PERSON_GONE_TIMEOUT:
            return None  # Person never left

        today = datetime.now().strftime("%Y-%m-%d")
        already_greeted = state.get("last_greeting_date", "")[:10] == today

        if not already_greeted:
            # First arrival of day — full greeting
            log.info("Person arrived — first time today, full greeting")
            greeting = self._generate_greeting(analysis, state)
            state["last_greeting_date"] = datetime.now().strftime("%Y-%m-%d %H:%M")
            state["daily_events"].append(f"{datetime.now().strftime('%H:%M')} Danny arrived home")
            return greeting
        else:
            # Already greeted — short welcome back
            log.info("Person arrived — welcome back")
            state["daily_events"].append(f"{datetime.now().strftime('%H:%M')} Danny returned")
            return "Welcome back, boss."

    def _generate_greeting(self, analysis: dict, state: dict) -> str:
        events = state.get("daily_events", [])
        events_str = "\n".join(f"- {e}" for e in events[-10:]) if events else "- Nothing notable yet today"

        # Load Danny's context for a personalized greeting
        memory = build_voice_memory_context()
        # Trim to just the key facts (pending tasks, goals)
        memory_snippet = memory[:1500] if memory else ""

        prompt = f"""Generate a SHORT greeting (3-5 sentences) for Danny walking into his house.
Start with "Hello boss" or a variation. Then give a brief update.
Time: {datetime.now().strftime('%I:%M %p')}
What you see: {analysis.get('general_observation', '')}
Mood suggestion: {analysis.get('mood_suggestion', '')}
Today's events so far:
{events_str}
Kitchen mess level: {analysis.get('mess_level', 0)}/10

Danny's context (use if relevant):
{memory_snippet}

Rules: Warm but efficient. Like JARVIS greeting Tony Stark. Brief daily summary.
If kitchen is messy, mention it casually. If clean, compliment him.
Reference something from Danny's context if relevant (a pending task, a project update, etc).
End with something encouraging. Keep it ADHD-friendly — one actionable suggestion max."""

        response = self.client.messages.create(
            model=CLAUDE_MODEL, max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text.strip().strip('"')
