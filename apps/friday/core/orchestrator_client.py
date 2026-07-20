"""
Bridge to TS orchestrator at apps/orchestrator (port 3001).

Path A architecture: Friday's Python brain owns the LLM call + agentic loop,
but tool *execution* stays in the TS orchestrator (50 tools across pc-control,
memory-tools, task-manager, vault-tools, browser-control).

Two endpoints required from orchestrator (do not exist yet, see TODO #18):
  GET  /v1/tools/list       -> { tools: [{ name, description, parameters }] }
  POST /v1/tools/execute    -> { name, arguments } -> { ok, result | error }

Both must reuse middleware/auth.ts and the existing rate-limit + CORS rules.
Until those endpoints exist, list_tools() returns [] and the brain runs in
"voice + monitors only" mode — surfacing the dependency rather than 500ing.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

from config.settings import settings

log = logging.getLogger("friday.bridge")


class OrchestratorBridge:
    def __init__(self, base_url: str | None = None, api_key: str | None = None):
        self.base_url = (base_url or settings.orchestrator_url).rstrip("/")
        self.api_key = api_key or settings.friday_api_key
        self._client: httpx.AsyncClient | None = None

    async def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            headers = (
                {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}
            )
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers=headers,
                timeout=30.0,
            )
        return self._client

    async def list_tools(self) -> list[dict[str, Any]]:
        """Fetch the orchestrator's registered tool schemas. Empty list on failure."""
        try:
            client = await self._http()
            r = await client.get("/v1/tools/list")
            r.raise_for_status()
            return r.json().get("tools", [])
        except Exception as e:
            log.warning(
                "orchestrator.list_tools failed: %s — running brain without external tools",
                e,
            )
            return []

    async def execute_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """Execute a tool by name on the orchestrator. Returns {ok, result|error}."""
        try:
            client = await self._http()
            r = await client.post(
                "/v1/tools/execute", json={"name": name, "arguments": arguments}
            )
            r.raise_for_status()
            return r.json()
        except httpx.HTTPStatusError as e:
            return {
                "ok": False,
                "error": f"orchestrator http {e.response.status_code}: {e.response.text[:200]}",
            }
        except Exception as e:
            return {"ok": False, "error": f"orchestrator error: {type(e).__name__}: {e}"}

    async def health(self) -> dict[str, Any]:
        try:
            client = await self._http()
            r = await client.get("/healthz")
            return {"ok": r.status_code == 200, "status": r.status_code}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None


bridge = OrchestratorBridge()
