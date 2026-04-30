"""
Greeting System — "Hello boss" on arrival + daily briefing.
Hard-gated by face recognition (Option A): only fires when verified_identity is the owner.
"""
import time
import logging
from datetime import datetime

from openai import OpenAI

from config import GROQ_API_KEY, GROQ_TEXT_MODEL, OWNER_NAME, PERSON_GONE_TIMEOUT
from plugins.memory_loader import build_voice_memory_context

log = logging.getLogger("sidecar.greeting")


class GreetingSystem:
    def __init__(self):
        if not GROQ_API_KEY:
            raise RuntimeError("GROQ_API_KEY missing")
        self._client = OpenAI(api_key=GROQ_API_KEY, base_url="https://api.groq.com/openai/v1")

    def check(self, analysis: dict, state: dict, verified_identity: str | None) -> str | None:
        """
        Returns spoken greeting text or None.

        Hard gate (Option A): we only treat 'person present' as TRUE when face recognition
        has confirmed it's the owner. An unknown face (verified_identity is None while a
        person is visible) is NOT a greeting event — that's a security event handled elsewhere.
        """
        person = analysis.get("person_detected", False)
        is_owner = verified_identity == OWNER_NAME
        now = time.time()

        # Treat "person present" as owner-present-only for greeting purposes
        if not (person and is_owner):
            if state.get("person_present") and (now - state.get("person_last_seen", 0)) > PERSON_GONE_TIMEOUT:
                state["person_present"] = False
                state["daily_events"].append(f"{datetime.now().strftime('%H:%M')} {OWNER_NAME} left")
                log.info("Owner left the area")
            return None

        was_gone = not state.get("person_present", False)
        time_since_seen = now - state.get("person_last_seen", 0)

        state["person_present"] = True
        state["person_last_seen"] = now

        if not was_gone and time_since_seen < PERSON_GONE_TIMEOUT:
            return None  # Owner never left

        today = datetime.now().strftime("%Y-%m-%d")
        already_greeted = state.get("last_greeting_date", "")[:10] == today

        if not already_greeted:
            log.info("Owner arrived — first time today, full greeting")
            greeting = self._generate_greeting(analysis, state)
            state["last_greeting_date"] = datetime.now().strftime("%Y-%m-%d %H:%M")
            state["daily_events"].append(f"{datetime.now().strftime('%H:%M')} {OWNER_NAME} arrived home")
            return greeting
        else:
            log.info("Owner arrived — welcome back")
            state["daily_events"].append(f"{datetime.now().strftime('%H:%M')} {OWNER_NAME} returned")
            return "Welcome back, boss."

    def _generate_greeting(self, analysis: dict, state: dict) -> str:
        events = state.get("daily_events", [])
        events_str = "\n".join(f"- {e}" for e in events[-10:]) if events else "- Nothing notable yet today"

        memory = build_voice_memory_context()
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

        resp = self._client.chat.completions.create(
            model=GROQ_TEXT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=300,
            temperature=0.7,
        )
        return resp.choices[0].message.content.strip().strip('"')
