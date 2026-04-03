"""
Kitchen Nagger — Claude Vision scene analysis + escalating nags.
Detects mess, tracks escalation (gentle -> drill_sergeant), praises cleanup.
"""
import json
import base64
import logging
import time

import anthropic

from config import (
    ANTHROPIC_API_KEY, CLAUDE_MODEL, CLAUDE_HAIKU,
    MESS_THRESHOLD, NAG_COOLDOWN, ESCALATION_LEVELS,
)

log = logging.getLogger("sidecar.kitchen")

SCENE_ANALYSIS_PROMPT = """You are Danny's Home AI Companion watching his home through a camera.

Analyze this image and respond with ONLY valid JSON (no markdown, no code blocks):

{
  "scene_type": "<kitchen|living_room|entrance|other>",
  "person_detected": <true|false>,
  "person_appears_to_be": "<entering|leaving|sitting|cooking|cleaning|walking|unknown>",
  "mess_level": <1-10 integer, 0 if not a kitchen/living area>,
  "mess_description": "<what's messy, be specific about items>",
  "cleanup_tasks": ["<specific task 1>", "<task 2>"],
  "positive_notes": "<anything good - clean areas, nice setup, etc>",
  "security_concern": "<none|unusual_activity|unknown_person|door_left_open|lights_on_empty|other>",
  "security_detail": "<details if concern exists>",
  "general_observation": "<brief 1-sentence description of what you see>",
  "time_of_day_guess": "<morning|afternoon|evening|night based on lighting>",
  "mood_suggestion": "<a helpful or encouraging observation for someone with ADHD>"
}

Mess scoring:
- 1-2: Spotless. A few items out is fine.
- 3-4: Minor mess. Some dishes, crumbs, items misplaced.
- 5-6: Moderate. Dishes piling, counters cluttered.
- 7-8: Significant. Multiple areas need attention, food out.
- 9-10: Disaster. Health concern territory.

Be specific. Name actual items you see.
If image is too dark or unclear, set mess_level to 0 and note in general_observation."""


class KitchenNagger:
    def __init__(self):
        self.client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    def analyze_scene(self, frame_bytes: bytes) -> dict:
        """Full scene analysis with Claude Vision."""
        b64 = base64.standard_b64encode(frame_bytes).decode("utf-8")
        response = self.client.messages.create(
            model=CLAUDE_MODEL, max_tokens=600,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b64}},
                    {"type": "text", "text": SCENE_ANALYSIS_PROMPT},
                ],
            }],
        )
        text = response.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
            text = text.rsplit("```", 1)[0]
        return json.loads(text)

    def check_and_nag(self, analysis: dict, state: dict) -> str | None:
        """Check mess level and return nag message if threshold exceeded."""
        mess = analysis.get("mess_level", 0)
        now = time.time()

        if mess >= MESS_THRESHOLD:
            time_since_nag = now - state.get("last_nag_time", 0)
            if time_since_nag > NAG_COOLDOWN:
                nag_count = state.get("consecutive_nags", 0)
                nag_msg = self._generate_nag(analysis, nag_count)

                state["consecutive_nags"] = nag_count + 1
                state["last_nag_time"] = now
                state["total_nags_today"] = state.get("total_nags_today", 0) + 1

                esc = ESCALATION_LEVELS[min(nag_count, len(ESCALATION_LEVELS) - 1)]
                log.info(f"NAG #{nag_count+1} [{esc}]: {nag_msg}")
                return nag_msg
            else:
                remaining = int(NAG_COOLDOWN - time_since_nag)
                log.info(f"Mess detected ({mess}/10) but cooling down ({remaining}s)")
                return None

        elif mess < MESS_THRESHOLD and state.get("consecutive_nags", 0) > 0:
            # Kitchen cleaned!
            state["total_cleanups_today"] = state.get("total_cleanups_today", 0) + 1
            state["consecutive_nags"] = 0
            praise = "Nice work Danny! Kitchen's looking clean. You crushed it, boss."
            log.info(f"CLEAN: {praise}")
            return praise

        return None

    def _generate_nag(self, analysis: dict, escalation: int) -> str:
        level = ESCALATION_LEVELS[min(escalation, len(ESCALATION_LEVELS) - 1)]
        tone = {
            "gentle": "Friendly, supportive buddy. Use humor. 'Hey Danny'",
            "firm": "Direct but friendly. 'Come on Danny' energy.",
            "stern": "No-nonsense. 'Danny. Kitchen. Now.' energy.",
            "drill_sergeant": "FULL DRILL SERGEANT. 'DANNY BOY! WARZONE!' Funny but intense.",
        }
        tasks = "\n".join(f"- {t}" for t in analysis.get("cleanup_tasks", []))

        prompt = f"""SHORT spoken nag (2-4 sentences) for Danny about his messy kitchen.
Tone: {level} -- {tone[level]}
Mess level: {analysis['mess_level']}/10
What's messy: {analysis.get('mess_description', '')}
Tasks:\n{tasks}
Rules: SHORT, specific items, one action to do RIGHT NOW, ADHD-friendly, never mean."""

        response = self.client.messages.create(
            model=CLAUDE_HAIKU, max_tokens=200,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text.strip().strip('"')
