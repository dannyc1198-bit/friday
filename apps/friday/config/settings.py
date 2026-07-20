"""
Friday config — loads .env, validates required keys, exposes typed settings.

Boot policy: Friday starts with just LLM + voice + DB filled. Every monitor
data source is optional and the matching monitor degrades gracefully.
"""
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=REPO_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- LLM ---
    llm_provider: str = "groq"
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    groq_base_url: str = "https://api.groq.com/openai/v1"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"

    # --- Voice ---
    deepgram_api_key: str = ""
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = ""
    picovoice_api_key: str = ""

    # --- DB ---
    database_url: str = "postgresql://friday:friday@localhost:5432/friday"

    # --- Bridges ---
    orchestrator_url: str = "http://127.0.0.1:3001"
    friday_api_key: str = ""
    sidecar_url: str = "http://127.0.0.1:3002"

    # --- Monitor data sources (all optional) ---
    stripe_secret_key: str = ""
    supabase_url: str = ""
    supabase_service_key: str = ""
    polyclaw_supabase_url: str = ""
    polyclaw_supabase_key: str = ""
    google_client_id: str = ""
    google_client_secret: str = ""
    google_refresh_token: str = ""

    # --- Server ---
    friday_host: str = "127.0.0.1"
    friday_port: int = 3003

    @field_validator("llm_provider")
    @classmethod
    def _provider_valid(cls, v: str) -> str:
        if v not in {"groq", "anthropic"}:
            raise ValueError(f"LLM_PROVIDER must be 'groq' or 'anthropic', got {v!r}")
        return v


settings = Settings()


def required(*keys: str) -> list[str]:
    """Return list of missing required env keys. Empty list = ready."""
    return [k for k in keys if not getattr(settings, k, "")]


def assert_minimum_to_boot() -> None:
    """Friday boots with just LLM + voice + DB. Monitors degrade gracefully."""
    if settings.llm_provider == "groq":
        missing = required(
            "groq_api_key",
            "deepgram_api_key",
            "elevenlabs_api_key",
            "elevenlabs_voice_id",
        )
    else:
        missing = required(
            "anthropic_api_key",
            "deepgram_api_key",
            "elevenlabs_api_key",
            "elevenlabs_voice_id",
        )
    if missing:
        raise RuntimeError(f"Friday cannot boot — missing env vars: {missing}")
