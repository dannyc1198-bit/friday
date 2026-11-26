"""The only openWakeWord model the ear is allowed to load."""

ONLY_WAKE_MODEL = "hey_jarvis"
BLOCKED = ("alexa", "hey_mycroft", "hey_rhasspy", "timer", "weather")


def models_to_load() -> list[str]:
    return [ONLY_WAKE_MODEL]


def assert_only_hey_jarvis(loaded: list[str]) -> None:
    extra = [name for name in loaded if ONLY_WAKE_MODEL not in name.lower()]
    blocked = [name for name in loaded if any(item in name.lower() for item in BLOCKED)]
    if extra or blocked:
        raise RuntimeError(f"refusing wake models other than hey_jarvis: {loaded}")
