"""Tests for the first-run setup handler endpoints."""
from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from codex_pro.gateway.http_handlers.setup_handler import SetupHandlers


def _config(providers: list | None = None, *, workspace: str = "/tmp/ws") -> SimpleNamespace:
    return SimpleNamespace(
        models=SimpleNamespace(providers=providers or []),
        workspace=workspace,
    )


def _empty_request() -> MagicMock:
    request = MagicMock()
    request.json = AsyncMock(return_value={})
    return request


def _json_request(body: dict) -> MagicMock:
    request = MagicMock()
    request.json = AsyncMock(return_value=body)
    return request


@pytest.mark.asyncio
async def test_providers_lists_full_catalog():
    handlers = SetupHandlers(_config(), None)
    resp = await handlers.list_providers(_empty_request())
    assert resp.status == 200
    data = json.loads(resp.body)
    ids = [e["id"] for g in data["groups"] for e in g["entries"]]
    # Complete catalog per spec: the major vendors and the >=14 total.
    assert "openai" in ids and "anthropic" in ids and "bedrock" in ids
    assert len(ids) >= 14
    # Every entry carries the fields the wizard needs.
    for group in data["groups"]:
        for entry in group["entries"]:
            assert set(entry) >= {"id", "label", "dialect", "api_base", "needs_api_base"}


@pytest.mark.asyncio
async def test_setup_status_unconfigured():
    handlers = SetupHandlers(_config([]), None)
    resp = await handlers.setup_status(_empty_request())
    assert resp.status == 200
    data = json.loads(resp.body)
    assert data["configured"] is False
    assert data["workspace"] == "/tmp/ws"


@pytest.mark.asyncio
async def test_setup_status_configured():
    handlers = SetupHandlers(_config([{"name": "openai", "api_key": "sk-x"}]), None)
    resp = await handlers.setup_status(_empty_request())
    data = json.loads(resp.body)
    assert data["configured"] is True


@pytest.mark.asyncio
async def test_save_config_writes_snake_case_fields():
    """save_config must write ProviderConfig's snake_case keys, not camelCase."""
    captured: dict = {}

    def _fake_save(data, path=None):
        captured["data"] = data
        captured["path"] = path
        return Path("/tmp/out/codex-pro.yaml")

    handlers = SetupHandlers(_config([]), None)
    request = _json_request(
        {"provider_id": "openai", "api_key": "sk-test", "api_base": "", "model": "gpt-4o"}
    )
    with patch("codex_pro.gateway.http_handlers.setup_handler.save_config", _fake_save):
        resp = await handlers.save_config(request)

    assert resp.status == 200
    assert captured["path"] is None  # path None -> shared ~/.codex-pro/codex-pro.yaml
    models = captured["data"]["models"]
    provider = models["providers"][0]
    # snake_case field names only — never the UI's camelCase spellings.
    assert "api_key" in provider
    assert "api_key_env" not in provider
    assert "apiKey" not in provider
    assert "apiBase" not in provider
    assert "api_base" in provider
    assert provider["name"] == "openai"
    assert provider["api_key"] == "sk-test"
    # Empty api_base falls back to the catalog entry's prefilled URL.
    assert provider["api_base"] == "https://api.openai.com/v1"
    assert provider["models"] == ["gpt-4o"]
    assert models["default_model"] == "gpt-4o"


@pytest.mark.asyncio
async def test_save_config_unknown_provider_rejected():
    handlers = SetupHandlers(_config([]), None)
    request = _json_request({"provider_id": "does-not-exist"})
    resp = await handlers.save_config(request)
    assert resp.status == 400
    data = json.loads(resp.body)
    assert "error" in data


@pytest.mark.asyncio
async def test_save_config_uses_fallback_models_when_no_model():
    handlers = SetupHandlers(_config([]), None)
    # anthropic catalog entry has no api_base; no model supplied -> fallback list.
    request = _json_request({"provider_id": "anthropic", "api_key": "sk-ant"})
    with patch("codex_pro.gateway.http_handlers.setup_handler.save_config") as fake_save:
        fake_save.return_value = Path("/tmp/codex-pro.yaml")
        resp = await handlers.save_config(request)
    assert resp.status == 200
    provider = fake_save.call_args.args[0]["models"]["providers"][0]
    assert provider["api_base"] == ""  # dialect anthropic has no api_base
    assert len(provider["models"]) > 0
