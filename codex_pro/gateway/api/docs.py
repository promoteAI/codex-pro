"""API documentation (Swagger UI) for the Gateway management API.

The OpenAPI 3.0 schema is generated at ``{api_prefix}/openapi.json`` (see
``gateway/api/openapi.py``). This module serves a Swagger UI page at ``/docs``
so operators and integrators can browse the management API in a browser.

Swagger UI assets are vendored in ``gateway/static/swagger-ui/`` (see
``register_swagger_assets``) so the page is fully self-hosted and never
depends on an external CDN or proxy.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

from aiohttp import web

if TYPE_CHECKING:
    from codex_pro.gateway.server import GatewayServer

# The page references only vendored assets under /static/swagger-ui/, so it
# works offline and behind restrictive proxies.
_CSS_URL = "/static/swagger-ui/swagger-ui.css"
_BUNDLE_URL = "/static/swagger-ui/swagger-ui-bundle.js"
_FAVICON_URL = "/static/swagger-ui/favicon-32x32.png"

_PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Codex Pro Gateway API</title>
  <link rel="icon" type="image/png" href="{favicon}" />
  <link rel="stylesheet" href="{css}" />
  <style>
    html {{ box-sizing: border-box; overflow-y: scroll; }}
    *, *::before, *::after {{ box-sizing: inherit; }}
    body {{ margin: 0; background: #fafafa; }}
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="{bundle}"></script>
  <script>
    window.onload = function () {{
      window.ui = SwaggerUIBundle({{
        url: {spec_url_json},
        dom_id: "#swagger-ui",
        deepLinking: true,
        displayOperationId: true,
        persistAuthorization: true,
        presets: [SwaggerUIBundle.presets.apis]
      }});
    }};
  </script>
</body>
</html>
"""


def _assets_dir() -> Path:
    return Path(__file__).resolve().parent.parent / "static" / "swagger-ui"


def docs_handler(spec_url: str) -> web.RequestHandler:
    """Build a handler that serves the Swagger UI page for ``spec_url``.

    ``spec_url`` is the absolute path to the generated OpenAPI schema, e.g.
    ``/api/v1/openapi.json``.
    """

    async def _docs(request: web.Request) -> web.Response:
        html = _PAGE_TEMPLATE.format(
            css=_CSS_URL,
            bundle=_BUNDLE_URL,
            favicon=_FAVICON_URL,
            spec_url_json=json.dumps(spec_url),
        )
        return web.Response(text=html, content_type="text/html")

    return _docs


def register_swagger_assets(app: web.Application, server: GatewayServer) -> None:
    """Serve the vendored Swagger UI assets under ``/static/swagger-ui/``."""
    assets = _assets_dir()

    async def _serve_file(request: web.Request) -> web.Response:
        name = request.match_info.get("name", "")
        # Only allow known, safe asset filenames.
        if name not in {
            "swagger-ui.css",
            "swagger-ui.css.map",
            "swagger-ui-bundle.js",
            "swagger-ui-bundle.js.map",
            "favicon-16x16.png",
            "favicon-32x32.png",
        }:
            return web.Response(text="Not found", status=404)
        file_path = (assets / name).resolve()
        if file_path.is_file() and str(file_path).startswith(str(assets.resolve())):
            return web.FileResponse(file_path)
        return web.Response(text="Not found", status=404)

    app.router.add_get("/static/swagger-ui/{name}", _serve_file)
