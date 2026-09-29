"""Tests for the first-run setup handler endpoints."""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
import yaml

from codex_pro.gateway.http_handlers.setup_handler import SetupHandlers


def _empty_request() -> MagicMock:
    request = MagicMock()
    request.json = AsyncMock(return_value={})
    return request


def _json_request(body: dict) -> MagicMock:
    request = MagicMock()
    request.json = AsyncMock(return_value=body)
    return request


def _loopback_request(body: dict) -> MagicMock:
    """A request whose transport is a loopback peer (gateway bound locally)."""
    request = MagicMock()
    request.json = AsyncMock(return_value=body)
    transport = MagicMock()
    transport.get_extra_info.return_value = ("127.0.0.1", 12345)
    request.transport = transport
    return request


@pytest.mark.asyncio
async def test_providers_lists_full_catalog():
    handlers = SetupHandlers(None, None)
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
async def test_setup_status_unconfigured(tmp_path: Path):
    cfg = tmp_path / "codex-pro.yaml"
    cfg.write_text("gateway:\n  enabled: true\n", encoding="utf-8")
    handlers = SetupHandlers(None, cfg, tmp_path)
    resp = await handlers.setup_status(_empty_request())
    assert resp.status == 200
    data = json.loads(resp.body)
    assert data["configured"] is False
    # workspace falls back to the gateway's workspace when config has none.
    assert data["workspace"] == str(tmp_path)


@pytest.mark.asyncio
async def test_setup_status_configured_from_disk(tmp_path: Path):
    """Production wiring: GatewayServer gets a GatewayConfig (no models), so the
    'should I show the wizard?' answer must come from the on-disk config."""
    cfg = tmp_path / "codex-pro.yaml"
    cfg.write_text(
        "models:\n  providers:\n    - name: openai\n      api_key: sk-x\n",
        encoding="utf-8",
    )
    handlers = SetupHandlers(None, cfg, tmp_path)
    resp = await handlers.setup_status(_empty_request())
    assert resp.status == 200
    data = json.loads(resp.body)
    assert data["configured"] is True


@pytest.mark.asyncio
async def test_setup_status_reads_workspace_from_disk(tmp_path: Path):
    cfg = tmp_path / "codex-pro.yaml"
    cfg.write_text("workspace: /custom/ws\nmodels:\n  providers: []\n", encoding="utf-8")
    handlers = SetupHandlers(None, cfg, tmp_path)
    data = json.loads((await handlers.setup_status(_empty_request())).body)
    assert data["workspace"] == "/custom/ws"


@pytest.mark.asyncio
async def test_save_config_writes_snake_case_and_preserves_other_keys(tmp_path: Path):
    """save_config must write ProviderConfig's snake_case keys, read-merge-write,
    and leave every unrelated top-level key + models.routes/modelWindows intact."""
    cfg = tmp_path / "codex-pro.yaml"
    cfg.write_text(
        (
            "gateway:\n  enabled: true\n"
            "channels:\n  telegram:\n    enabled: true\n"
            "models:\n"
            "  fallback_model: gpt-4o-mini\n"
            "  routes:\n"
            "    - model: gpt-4o\n      provider: openai\n"
            "  modelWindows:\n    gpt-4o: 128000\n"
            "  providers:\n    - name: anthropic\n      api_key: sk-ant\n"
        ),
        encoding="utf-8",
    )
    handlers = SetupHandlers(None, cfg, tmp_path)
    request = _loopback_request(
        {"provider_id": "openai", "api_key": "sk-test", "api_base": "", "model": "gpt-4o"}
    )
    resp = await handlers.save_config(request)
    assert resp.status == 200
    data = json.loads(resp.body)
    assert data["ok"] is True
    assert data["workspace"] == str(tmp_path)

    saved = yaml.safe_load(cfg.read_text(encoding="utf-8"))
    # Unrelated top-level sections survive.
    assert saved["gateway"]["enabled"] is True
    assert saved["channels"]["telegram"]["enabled"] is True
    # models.routes / modelWindows / fallback_model survive the merge.
    assert saved["models"]["fallback_model"] == "gpt-4o-mini"
    assert saved["models"]["routes"][0]["model"] == "gpt-4o"
    assert saved["models"]["modelWindows"]["gpt-4o"] == 128000
    # The configured provider is now openai, not the pre-existing anthropic.
    provider = saved["models"]["providers"][0]
    assert provider["name"] == "openai"
    assert "api_key" in provider
    assert "apiKey" not in provider
    assert "api_base" in provider
    assert "apiBase" not in provider
    assert provider["api_key"] == "sk-test"
    # Empty api_base falls back to the catalog entry's prefilled URL.
    assert provider["api_base"] == "https://api.openai.com/v1"
    assert provider["models"] == ["gpt-4o"]
    assert saved["models"]["default_model"] == "gpt-4o"
    # workspace written back.
    assert saved["workspace"] == str(tmp_path)


@pytest.mark.asyncio
async def test_save_config_unknown_provider_rejected(tmp_path: Path):
    cfg = tmp_path / "codex-pro.yaml"
    handlers = SetupHandlers(None, cfg, tmp_path)
    request = _loopback_request({"provider_id": "does-not-exist"})
    resp = await handlers.save_config(request)
    assert resp.status == 400
    assert "error" in json.loads(resp.body)


@pytest.mark.asyncio
async def test_save_config_uses_fallback_models_when_no_model(tmp_path: Path):
    cfg = tmp_path / "codex-pro.yaml"
    handlers = SetupHandlers(None, cfg, tmp_path)
    request = _loopback_request({"provider_id": "anthropic", "api_key": "sk-ant"})
    resp = await handlers.save_config(request)
    assert resp.status == 200
    saved = yaml.safe_load(cfg.read_text(encoding="utf-8"))
    provider = saved["models"]["providers"][0]
    assert provider["api_base"] == ""  # dialect anthropic has no api_base
    assert len(provider["models"]) > 0
    assert saved["models"]["default_model"] == provider["models"][0]


@pytest.mark.asyncio
async def test_save_config_rejects_non_loopback_client(tmp_path: Path):
    """A network client must not be able to inject an api_key into the shared file."""
    cfg = tmp_path / "codex-pro.yaml"
    cfg.write_text("gateway:\n  enabled: true\n", encoding="utf-8")
    handlers = SetupHandlers(None, cfg, tmp_path)
    request = MagicMock()
    request.json = AsyncMock(return_value={"provider_id": "openai", "api_key": "x"})
    transport = MagicMock()
    transport.get_extra_info.return_value = ("203.0.113.9", 12345)
    request.transport = transport
    resp = await handlers.save_config(request)
    assert resp.status == 403
    # File untouched.
    saved = yaml.safe_load(cfg.read_text(encoding="utf-8"))
    assert "models" not in saved


@pytest.mark.asyncio
async def test_save_config_uses_configured_path_when_provided(tmp_path: Path):
    """L5: an explicit config_path must be the write target, not always path=None."""
    custom = tmp_path / "custom-config.yaml"
    handlers = SetupHandlers(None, custom, tmp_path)
    request = _loopback_request({"provider_id": "openai", "api_key": "sk-test", "model": "gpt-4o"})
    resp = await handlers.save_config(request)
    assert resp.status == 200
    assert custom.exists()
    assert not (tmp_path / "codex-pro.yaml").exists()
