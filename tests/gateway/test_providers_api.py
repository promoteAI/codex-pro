"""Tests for the ProvidersAPI."""
from __future__ import annotations

import json as _json
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import yaml

from codex_pro.config.schema import ProviderConfig
from codex_pro.gateway.api.providers import ProvidersAPI


def _tmp_dir() -> Path:
    """Create a fresh temp directory for each test run."""
    d = Path(__file__).parent / ".tmp_providers_test"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _fake_request(query: dict | None = None, json_body: Any = None) -> object:
    class _Req:
        def __init__(self):
            self.query = query or {}
            self.match_info: dict = {}
            self._json_body = json_body

        async def json(self):
            return self._json_body

    return _Req()


def _make_server(
    providers: list[ProviderConfig] | None = None,
    routes: list | None = None,
    default_model: str = "",
    fallback_model: str = "",
    model_windows: dict | None = None,
    config_path: Path | None = None,
    has_router: bool = False,
) -> MagicMock:
    cfg = MagicMock()
    cfg.models.providers = providers or []
    cfg.models.routes = routes or []
    cfg.models.default_model = default_model
    cfg.models.fallback_model = fallback_model
    cfg.models.model_windows = model_windows or {}
    server = MagicMock()
    server._require_admin_token = MagicMock(return_value=None)
    server._agent_loop = MagicMock()
    server._agent_loop.config = cfg
    server.web_ws = MagicMock()
    server.web_ws.broadcast = AsyncMock()
    if config_path is not None:
        server._config_path = config_path
    else:
        server._workspace = _tmp_dir()
    if has_router:
        router = MagicMock()
        router._health = {}
        server._agent_loop.model_router = router
    return server


def _config_path() -> Path:
    return _tmp_dir() / f"config-{id(_tmp_dir())}.yaml"


@pytest.mark.asyncio
async def test_list_providers_empty():
    p = _config_path()
    p.write_text("_version: 1\n", encoding="utf-8")
    server = _make_server(config_path=p)
    api = ProvidersAPI(server)
    req = _fake_request()
    resp = await api.list_providers(req)
    assert resp.status == 200
    data = _json.loads(resp.text)
    assert data["providers"] == []


@pytest.mark.asyncio
async def test_list_providers_sanitized():
    p = _config_path()
    p.write_text("_version: 1\n", encoding="utf-8")
    server = _make_server(
        providers=[
            ProviderConfig(name="openai", api_key="sk-secret", api_base="https://api.openai.com/v1", models=["gpt-4o"]),
            ProviderConfig(name="anthropic", api_key_env="ANTHROPIC_API_KEY", models=["claude-sonnet-4"]),
        ],
        config_path=p,
    )
    api = ProvidersAPI(server)
    req = _fake_request()
    resp = await api.list_providers(req)
    data = _json.loads(resp.text)
    assert len(data["providers"]) == 2
    openai = next(pr for pr in data["providers"] if pr["name"] == "openai")
    assert openai["api_key"] == ""
    assert openai["api_base"] == "https://api.openai.com/v1"
    assert openai["models"] == ["gpt-4o"]
    anthropic = next(pr for pr in data["providers"] if pr["name"] == "anthropic")
    assert anthropic["api_key_env"] == "ANTHROPIC_API_KEY"


@pytest.mark.asyncio
async def test_get_provider_found():
    p = _config_path()
    p.write_text("_version: 1\n", encoding="utf-8")
    server = _make_server(
        providers=[ProviderConfig(name="openai", api_key="sk-x", models=["gpt-4o"])],
        config_path=p,
    )
    api = ProvidersAPI(server)
    req = _fake_request()
    req.match_info = {"name": "openai"}
    resp = await api.get_provider(req)
    assert resp.status == 200
    data = _json.loads(resp.text)
    assert data["name"] == "openai"
    assert data["api_key"] == ""


@pytest.mark.asyncio
async def test_get_provider_not_found():
    p = _config_path()
    p.write_text("_version: 1\n", encoding="utf-8")
    server = _make_server(config_path=p)
    api = ProvidersAPI(server)
    req = _fake_request()
    req.match_info = {"name": "missing"}
    resp = await api.get_provider(req)
    assert resp.status == 404


@pytest.mark.asyncio
async def test_create_provider_success():
    p = _config_path()
    p.write_text("_version: 1\n", encoding="utf-8")
    server = _make_server(config_path=p)
    api = ProvidersAPI(server)
    body = {
        "name": "deepseek",
        "api_key": "sk-deep",
        "api_base": "https://api.deepseek.com/v1",
        "models": ["deepseek-chat"],
    }
    req = _fake_request(json_body=body)
    resp = await api.create_provider(req)
    assert resp.status == 201
    data = _json.loads(resp.text)
    assert data["success"] is True
    assert data["name"] == "deepseek"
    assert data["restart_required"] is True
    server.web_ws.broadcast.assert_called_once()
    raw = yaml.safe_load(p.read_text(encoding="utf-8"))
    assert raw["models"]["providers"][0]["name"] == "deepseek"


@pytest.mark.asyncio
async def test_create_provider_duplicate():
    p = _config_path()
    p.write_text("models:\n  providers:\n    - name: openai\n      models: [gpt-4o]\n", encoding="utf-8")
    server = _make_server(
        providers=[ProviderConfig(name="openai", api_key="", models=["gpt-4o"])],
        config_path=p,
    )
    api = ProvidersAPI(server)
    body = {"name": "openai", "api_key": "x", "models": ["gpt-4o"]}
    req = _fake_request(json_body=body)
    resp = await api.create_provider(req)
    assert resp.status == 409


@pytest.mark.asyncio
async def test_create_provider_invalid():
    p = _config_path()
    p.write_text("_version: 1\n", encoding="utf-8")
    server = _make_server(config_path=p)
    api = ProvidersAPI(server)
    body = {"name": "", "models": []}  # missing required fields
    req = _fake_request(json_body=body)
    resp = await api.create_provider(req)
    assert resp.status == 400


@pytest.mark.asyncio
async def test_delete_provider_success():
    p = _config_path()
    p.write_text("models:\n  providers:\n    - name: openai\n      models: [gpt-4o]\n", encoding="utf-8")
    server = _make_server(
        providers=[ProviderConfig(name="openai", api_key="", models=["gpt-4o"])],
        config_path=p,
    )
    api = ProvidersAPI(server)
    req = _fake_request()
    req.match_info = {"name": "openai"}
    resp = await api.delete_provider(req)
    assert resp.status == 200
    data = _json.loads(resp.text)
    assert data["success"] is True
    raw = yaml.safe_load(p.read_text(encoding="utf-8"))
    assert raw.get("models", {}).get("providers", []) == []


@pytest.mark.asyncio
async def test_delete_provider_not_found():
    p = _config_path()
    p.write_text("_version: 1\n", encoding="utf-8")
    server = _make_server(config_path=p)
    api = ProvidersAPI(server)
    req = _fake_request()
    req.match_info = {"name": "missing"}
    resp = await api.delete_provider(req)
    assert resp.status == 404


@pytest.mark.asyncio
async def test_test_provider_calls_chat():
    p = _config_path()
    p.write_text("_version: 1\n", encoding="utf-8")
    server = _make_server(
        providers=[
            ProviderConfig(name="test-prov", api_key="sk-fake", api_base="https://example.com/v1", models=["fake-model"])
        ],
        config_path=p,
    )
    api = ProvidersAPI(server)
    req = _fake_request()
    req.match_info = {"name": "test-prov"}
    with patch("codex_pro.gateway.api.providers.create_provider") as mock_create:
        mock_prov = MagicMock()
        mock_prov.chat = AsyncMock(
            return_value=MagicMock(finish_reason="error", content="connection refused", model="")
        )
        mock_prov.aclose = AsyncMock()
        mock_create.return_value = mock_prov
        resp = await api.test_provider(req)
        assert resp.status == 200
        data = _json.loads(resp.text)
        assert data["ok"] is False


@pytest.mark.asyncio
async def test_get_health_returns_all_providers():
    p = _config_path()
    p.write_text("_version: 1\n", encoding="utf-8")
    server = _make_server(
        providers=[ProviderConfig(name="openai", api_key="", models=["gpt-4o"])],
        config_path=p,
        has_router=True,
    )
    api = ProvidersAPI(server)
    req = _fake_request()
    resp = await api.get_health(req)
    assert resp.status == 200
    data = _json.loads(resp.text)
    assert "providers" in data
    assert "openai" in data["providers"]
    assert data["providers"]["openai"]["status"] == "unknown"


@pytest.mark.asyncio
async def test_update_provider_changes_base_url():
    p = _config_path()
    p.write_text("models:\n  providers:\n    - name: openai\n      apiKey: sk-x\n      apiBase: https://api.openai.com/v1\n      models: [gpt-4o]\n", encoding="utf-8")
    server = _make_server(
        providers=[ProviderConfig(name="openai", api_key="sk-x", api_base="https://api.openai.com/v1", models=["gpt-4o"])],
        config_path=p,
    )
    api = ProvidersAPI(server)
    body = {"api_base": "https://custom.example.com/v1"}
    req = _fake_request(json_body=body)
    req.match_info = {"name": "openai"}
    resp = await api.update_provider(req)
    assert resp.status == 200
    raw = yaml.safe_load(p.read_text(encoding="utf-8"))
    updated = raw["models"]["providers"][0]
    # YAML preserves the original key casing; update was written using the existing spelling
    assert updated["apiBase"] == "https://custom.example.com/v1"
    assert updated["apiKey"] == "sk-x"  # unchanged
    server.web_ws.broadcast.assert_called_once()


@pytest.mark.asyncio
async def test_update_provider_invalid_field_rejected():
    p = _config_path()
    p.write_text("_version: 1\n", encoding="utf-8")
    server = _make_server(
        providers=[ProviderConfig(name="openai", api_key="", models=["gpt-4o"])],
        config_path=p,
    )
    api = ProvidersAPI(server)
    body = {"name": "newname"}  # name is not updatable
    req = _fake_request(json_body=body)
    req.match_info = {"name": "openai"}
    resp = await api.update_provider(req)
    assert resp.status == 400


@pytest.mark.asyncio
async def test_update_provider_not_found():
    p = _config_path()
    p.write_text("_version: 1\n", encoding="utf-8")
    server = _make_server(config_path=p)
    api = ProvidersAPI(server)
    body = {"api_base": "https://x.com/v1"}
    req = _fake_request(json_body=body)
    req.match_info = {"name": "missing"}
    resp = await api.update_provider(req)
    assert resp.status == 404


@pytest.mark.asyncio
async def test_rename_provider():
    p = _config_path()
    p.write_text("models:\n  providers:\n    - name: openai\n      models: [gpt-4o]\n  routes:\n    - model: gpt-4o\n      provider: openai\n", encoding="utf-8")
    server = _make_server(
        providers=[ProviderConfig(name="openai", api_key="", models=["gpt-4o"])],
        config_path=p,
    )
    api = ProvidersAPI(server)
    body = {"name": "gpt-openai"}
    req = _fake_request(json_body=body)
    req.match_info = {"name": "openai"}
    resp = await api.rename_provider(req)
    assert resp.status == 200
    data = _json.loads(resp.text)
    assert data["success"] is True
    raw = yaml.safe_load(p.read_text(encoding="utf-8"))
    assert raw["models"]["providers"][0]["name"] == "gpt-openai"
    # Route references should also be updated
    assert raw["models"]["routes"][0]["provider"] == "gpt-openai"


@pytest.mark.asyncio
async def test_rename_provider_duplicate():
    p = _config_path()
    p.write_text("models:\n  providers:\n    - name: openai\n      models: [gpt-4o]\n    - name: anthropic\n      models: [claude]\n", encoding="utf-8")
    server = _make_server(
        providers=[
            ProviderConfig(name="openai", api_key="", models=["gpt-4o"]),
            ProviderConfig(name="anthropic", api_key="", models=["claude"]),
        ],
        config_path=p,
    )
    api = ProvidersAPI(server)
    body = {"name": "anthropic"}
    req = _fake_request(json_body=body)
    req.match_info = {"name": "openai"}
    resp = await api.rename_provider(req)
    assert resp.status == 409


@pytest.mark.asyncio
async def test_update_provider_disabled():
    """PATCH with disabled field should succeed and persist."""
    p = _config_path()
    yaml_content = (
        "models:\n"
        "  providers:\n"
        "    - name: openai\n"
        "      apiKey: sk-x\n"
        "      apiBase: https://api.openai.com/v1\n"
        "      models: [gpt-4o]\n"
    )
    p.write_text(yaml_content, encoding="utf-8")
    server = _make_server(
        providers=[ProviderConfig(name="openai", api_key="sk-x", api_base="https://api.openai.com/v1", models=["gpt-4o"])],
        config_path=p,
    )
    api = ProvidersAPI(server)
    body = {"disabled": True}
    req = _fake_request(json_body=body)
    req.match_info = {"name": "openai"}
    resp = await api.update_provider(req)
    assert resp.status == 200
    # Verify disabled was persisted to YAML
    raw = yaml.safe_load(p.read_text(encoding="utf-8"))
    assert raw["models"]["providers"][0]["disabled"] is True


@pytest.mark.asyncio
async def test_list_providers_includes_disabled():
    """GET should serialize the disabled field."""
    p = _config_path()
    yaml_content = (
        "models:\n"
        "  providers:\n"
        "    - name: openai\n"
        "      apiKey: sk-x\n"
        "      apiBase: https://api.openai.com/v1\n"
        "      models: [gpt-4o]\n"
        "      disabled: true\n"
    )
    p.write_text(yaml_content, encoding="utf-8")
    server = _make_server(
        providers=[ProviderConfig(name="openai", api_key="sk-x", api_base="https://api.openai.com/v1", models=["gpt-4o"], disabled=True)],
        config_path=p,
    )
    api = ProvidersAPI(server)
    req = _fake_request()
    resp = await api.list_providers(req)
    data = _json.loads(resp.body)
    assert data["providers"][0]["disabled"] is True
