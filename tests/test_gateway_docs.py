"""Tests for the interactive API documentation (Swagger UI) at /docs.

The gateway generates an OpenAPI 3.0 schema at ``{api_prefix}/openapi.json``;
the ``/docs`` route serves a Swagger UI page that loads it so operators and
integrators can browse the management API in a browser. The Swagger UI assets
are vendored locally (``gateway/static/swagger-ui/``) so the page never hits an
external CDN or proxy.
"""

from __future__ import annotations

import pytest
from aiohttp import web

from codex_pro.gateway.api.docs import (
    docs_handler,
    register_swagger_assets,
)


class TestDocsHandler:
    def _handler(self):
        return docs_handler("/api/v1/openapi.json")

    @pytest.mark.asyncio
    async def test_docs_renders_swagger_ui_page(self):
        # The handler ignores the request object.
        resp = await self._handler()(None)
        assert resp.status == 200
        assert resp.content_type == "text/html"
        body = resp.text

        assert "SwaggerUIBundle" in body
        # The page must point at the generated OpenAPI schema.
        assert "/api/v1/openapi.json" in body

    @pytest.mark.asyncio
    async def test_docs_uses_vendored_assets_not_cdn(self):
        # Regression: assets must be served locally — no external CDN/proxy.
        body = (await self._handler()(None)).text
        assert "/static/swagger-ui/swagger-ui.css" in body
        assert "/static/swagger-ui/swagger-ui-bundle.js" in body
        assert "unpkg.com" not in body
        assert "cdn" not in body.lower()

    @pytest.mark.asyncio
    async def test_docs_uses_given_spec_url(self):
        handler = docs_handler("/custom/v3/openapi.json")
        resp = await handler(None)
        assert "/custom/v3/openapi.json" in resp.text


class TestSwaggerAssets:
    def _app(self):
        app = web.Application()
        register_swagger_assets(app, None)
        return app

    def test_asset_route_registered(self):
        app = self._app()
        patterns = [str(r.resource.canonical) for r in app.router.routes()]
        assert "/static/swagger-ui/{name}" in patterns
