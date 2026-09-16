"""Tests for the OpenAPI schema generator used by /docs and /openapi.json.

Historically broken: it read ``server.app`` (the attribute is ``_app``) and
``resource.pattern`` (None in this aiohttp version) instead of
``resource.canonical``, and looked up static docs with the full pre-fixed path
so ``_ROUTE_DOCS`` summaries/tags never applied. These tests pin the fixes.
"""

from __future__ import annotations

from unittest.mock import MagicMock

from aiohttp import web

from codex_pro.gateway.api.openapi import generate_openapi_schema


def _server_with_routes(*routes: tuple[str, str]):
    """Build a mock server whose _app has the given (method, path) routes."""
    app = web.Application()

    async def _h(request: web.Request) -> web.Response:
        return web.Response()

    for method, path in routes:
        getattr(app.router, f"add_{method.lower()}")(path, _h)

    server = MagicMock()
    server._app = app
    return server


def test_schema_uses_app_attribute_and_canonical_paths():
    server = _server_with_routes(
        ("GET", "/api/v1/memory"),
        ("POST", "/api/v1/memory/search"),
        ("GET", "/api/v1/memory/{id}"),
    )
    schema = generate_openapi_schema(server)
    assert "/api/v1/memory" in schema["paths"]
    assert "/api/v1/memory/search" in schema["paths"]
    assert {"get", "delete", "put"} & set(schema["paths"]["/api/v1/memory/{id}"]) == {"get"}


def test_schema_skips_non_prefix_and_head_routes():
    server = _server_with_routes(
        ("GET", "/api/v1/logs"),
        ("GET", "/docs"),          # docs page: not under prefix
        ("GET", "/{path:.*}"),     # SPA catch-all: not under prefix
    )
    schema = generate_openapi_schema(server)
    assert "/api/v1/logs" in schema["paths"]
    assert "/docs" not in schema["paths"]
    # /logs should be the only path; HEAD auto-route must be skipped.
    assert list(schema["paths"]) == ["/api/v1/logs"]
    assert "head" not in schema["paths"]["/api/v1/logs"]
    assert "options" not in schema["paths"]["/api/v1/logs"]


def test_schema_applies_static_docs_summaries_and_tags():
    server = _server_with_routes(
        ("GET", "/api/v1/memory"),
        ("GET", "/api/v1/analytics/tokens"),
    )
    schema = generate_openapi_schema(server)
    assert schema["paths"]["/api/v1/memory"]["get"]["summary"] == "List all memory entries"
    assert schema["paths"]["/api/v1/memory"]["get"]["tags"] == ["Memory"]
    assert schema["paths"]["/api/v1/analytics/tokens"]["get"]["tags"] == ["Analytics"]


def test_schema_derives_path_parameters():
    server = _server_with_routes(("GET", "/api/v1/memory/{id}"))
    schema = generate_openapi_schema(server)
    params = schema["paths"]["/api/v1/memory/{id}"]["get"]["parameters"]
    assert params == [
        {"name": "id", "in": "path", "required": True, "schema": {"type": "string"}}
    ]


def test_schema_has_security_scheme():
    server = _server_with_routes(("GET", "/api/v1/logs"))
    schema = generate_openapi_schema(server)
    assert schema["components"]["securitySchemes"]["ApiToken"]["name"] == "X-API-Token"


def test_schema_no_servers_key_to_avoid_double_prefixing():
    """Regression: ``servers: [{url: '/api/v1'}]`` + absolute paths made Swagger UI
    emit URLs like ``/api/v1/api/v1/health``. Removing the ``servers`` entry fixes
    this; paths are already absolute.
    """
    server = _server_with_routes(("GET", "/api/v1/health"))
    schema = generate_openapi_schema(server)
    assert "servers" not in schema
    assert "/api/v1/health" in schema["paths"]
