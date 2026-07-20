"""
Kitchen Nagger — Gemini Vision scene analysis + Groq nag generation.

Vision: gemini-2.5-flash (free tier, ~1500 req/day) via google-genai SDK.
Text:   llama-3.3-70b-versatile via Groq (free tier).
Identity is decided UPSTREAM by face_recognizer (hard gate); we just receive
a hint here and bake it into the scene prompt as a known fact.
"""
import json
import logging
import time

from google import genai
from google.genai import types as genai_types
from openai import OpenAI

from config import (
    GEMINI_API_KEY, GROQ_API_KEY,
    GEMINI_VISION_MODEL, GROQ_TEXT_MODEL,
    MESS_THRESHOLD, NAG_COOLDOWN, ESCALATION_LEVELS,
)

log = logging.getLogger("sidecar.kitchen")

SCENE_ANALYSIS_PROMPT_TMPL = """You are Danny's Home AI Companion watching his home through a camera.

{identity_hint}

Analyze this image and respond with ONLY valid JSON (no markdown, no code blocks):

{{
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
}}

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
        if not GEMINI_API_KEY:
            raise RuntimeError("GEMINI_API_KEY missing — add it to apps/orchestrator/.env")
        self._gemini = genai.Client(api_key=GEMINI_API_KEY)

        # Groq is only needed for nag-text generation. Vision scene analysis still
        # works without it. Defer the hard fail to the moment text-gen is actually
        # invoked, so the camera-tile-only path boots without a Groq key.
        if GROQ_API_KEY:
            self._text = OpenAI(api_key=GROQ_API_KEY, base_url="https://api.groq.com/openai/v1")
        else:
            self._text = None
            log.warning("GROQ_API_KEY missing — nag text generation disabled, vision-only mode")

    def analyze_scene(self, frame_bytes: bytes, identity: str | None = None) -> dict:
        """
        Full scene analysis with Gemini Vision.

        identity: name of the recognized person (e.g. 'danny') from face_recognizer,
                  or None for unknown / no-face. Baked into the prompt so the VLM
                  knows whether it's looking at the owner or a stranger.
        """
        if identity:
            hint = f"IDENTITY (verified by local face recognition, not by you): The person in frame is {identity}. Treat as the homeowner. security_concern should NOT be 'unknown_person'."
        else:
            hint = "IDENTITY: No verified face match. If a person is visible, they are NOT the homeowner — set person_detected=true and security_concern='unknown_person'."

        prompt = SCENE_ANALYSIS_PROMPT_TMPL.format(identity_hint=hint)

        response = self._gemini.models.generate_content(
            model=GEMINI_VISION_MODEL,
            contents=[
                genai_types.Part.from_bytes(data=frame_bytes, mime_type="image/jpeg"),
                prompt,
            ],
            config=genai_types.GenerateContentConfig(temperature=0.2, max_output_tokens=600),
        )
        text = (response.text or "").strip()
        # Gemini occasionally wraps in fences despite instructions
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            text = text.rsplit("```", 1)[0]
        if text.startswith("json"):
            text = text[4:].lstrip()
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
Tasks:
{tasks}
Rules: SHORT, specific items, one action to do RIGHT NOW, ADHD-friendly, never mean."""

        if self._text is None:
            # Vision-only mode: emit a static nag derived from the analysis.
            # Groq key absent → no LLM-generated text. Keeps the route functional.
            top_task = (analysis.get("cleanup_tasks") or ["Tidy up the kitchen"])[0]
            return f"Danny — {top_task}. ({level})"

        resp = self._text.chat.completions.create(
            model=GROQ_TEXT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
            temperature=0.8,
        )
        return resp.choices[0].message.content.strip().strip('"')
