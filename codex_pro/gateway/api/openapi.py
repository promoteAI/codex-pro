"""OpenAPI 3.0 schema generator for the Gateway management API.

The gateway uses aiohttp (not FastAPI), so we build the schema manually from
the registered route table rather than relying on framework introspection.
The generated schema is served at ``/api/v1/openapi.json`` when enabled.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from codex_pro.gateway.server import GatewayServer


# Static path descriptions keyed by route pattern.
_ROUTE_DOCS: dict[str, dict[str, dict[str, Any]]] = {
    # Memory
    "GET /memory": {"summary": "List all memory entries", "tags": ["Memory"]},
    "GET /memory/stats": {"summary": "Memory statistics", "tags": ["Memory"]},
    "POST /memory/search": {"summary": "Search memory entries", "tags": ["Memory"]},
    "GET /memory/{id}": {"summary": "Get a memory entry by ID", "tags": ["Memory"]},
    "PUT /memory/{id}": {"summary": "Update a memory entry", "tags": ["Memory"]},
    "DELETE /memory/{id}": {"summary": "Delete a memory entry", "tags": ["Memory"]},
    # Skills
    "GET /skills": {"summary": "List all skills", "tags": ["Skills"]},
    "POST /skills/import": {"summary": "Import a skill from a directory", "tags": ["Skills"]},
    "POST /skills/upload": {"summary": "Upload a skill zip", "tags": ["Skills"]},
    "GET /skills/{name}": {"summary": "Get skill details", "tags": ["Skills"]},
    "GET /skills/{name}/deps": {"summary": "List skill dependencies", "tags": ["Skills"]},
    "POST /skills/{name}/deps/install": {"summary": "Install skill dependencies", "tags": ["Skills"]},
    "POST /skills/{name}/toggle": {"summary": "Enable/disable a skill", "tags": ["Skills"]},
    "DELETE /skills/{name}": {"summary": "Delete a skill", "tags": ["Skills"]},
    # Channels
    "GET /channels": {"summary": "List configured channels", "tags": ["Channels"]},
    "POST /channels/{name}/{action}": {"summary": "Channel lifecycle action", "tags": ["Channels"]},
    # Knowledge
    "GET /knowledge/status": {"summary": "Knowledge base status", "tags": ["Knowledge"]},
    "POST /knowledge/rebuild": {"summary": "Rebuild knowledge index", "tags": ["Knowledge"]},
    "POST /knowledge/upload": {"summary": "Upload a document", "tags": ["Knowledge"]},
    "GET /knowledge/documents": {"summary": "List knowledge documents", "tags": ["Knowledge"]},
    "GET /knowledge/jobs": {"summary": "List indexing jobs", "tags": ["Knowledge"]},
    "GET /knowledge/jobs/{id}": {"summary": "Get job status", "tags": ["Knowledge"]},
    "DELETE /knowledge/jobs/{id}": {"summary": "Cancel an indexing job", "tags": ["Knowledge"]},
    "DELETE /knowledge/documents/{path}": {"summary": "Delete a document", "tags": ["Knowledge"]},
    # Config
    "GET /config": {"summary": "Get current configuration", "tags": ["Config"]},
    "PATCH /config": {"summary": "Update configuration", "tags": ["Config"]},
    # Tasks
    "GET /tasks": {"summary": "List tasks", "tags": ["Tasks"]},
    "POST /tasks": {"summary": "Create a task", "tags": ["Tasks"]},
    "GET /tasks/{id}": {"summary": "Get task details", "tags": ["Tasks"]},
    "PUT /tasks/{id}": {"summary": "Update a task", "tags": ["Tasks"]},
    "DELETE /tasks/{id}": {"summary": "Delete a task", "tags": ["Tasks"]},
    "POST /tasks/{id}/transition": {"summary": "Transition task state", "tags": ["Tasks"]},
    "POST /tasks/{id}/retry": {"summary": "Retry a failed task", "tags": ["Tasks"]},
    # Sessions
    "GET /sessions": {"summary": "List sessions", "tags": ["Sessions"]},
    "GET /sessions/{key}/history": {"summary": "Get session message history", "tags": ["Sessions"]},
    "GET /sessions/{key}/turns": {"summary": "List session turns", "tags": ["Sessions"]},
    "GET /turns/{event_id}": {"summary": "Get a specific turn", "tags": ["Sessions"]},
    # Cron
    "GET /cron": {"summary": "List cron jobs", "tags": ["Cron"]},
    "POST /cron": {"summary": "Create a cron job", "tags": ["Cron"]},
    "PUT /cron/{id}": {"summary": "Update a cron job", "tags": ["Cron"]},
    "DELETE /cron/{id}": {"summary": "Delete a cron job", "tags": ["Cron"]},
    "POST /cron/{id}/trigger": {"summary": "Trigger a cron job immediately", "tags": ["Cron"]},
    "GET /cron/{id}/runs": {"summary": "List cron job runs", "tags": ["Cron"]},
    # Logs
    "GET /logs": {"summary": "List recent log entries", "tags": ["Logs"]},
    # Analytics
    "GET /analytics/tokens": {"summary": "Token usage over time", "tags": ["Analytics"]},
    "GET /analytics/skills": {"summary": "Skill usage statistics", "tags": ["Analytics"]},
    "GET /analytics/channels": {"summary": "Channel usage statistics", "tags": ["Analytics"]},
}


def _path_to_openapi_params(path: str) -> list[dict[str, Any]]:
    """Convert an aiohttp path pattern to OpenAPI path parameters."""
    import re
    params: list[dict[str, Any]] = []
    for match in re.finditer(r"\{([^}]+)(?::[^}]*)?}", path):
        name = match.group(1)
        params.append({
            "name": name,
            "in": "path",
            "required": True,
            "schema": {"type": "string"},
        })
    return params


def generate_openapi_schema(server: GatewayServer, prefix: str = "/api/v1") -> dict[str, Any]:
    """Generate an OpenAPI 3.0 schema from registered routes."""
    paths: dict[str, dict[str, Any]] = {}

    for route in server.app.router.routes():
        resource = getattr(route, "resource", None)
        if resource is None:
            continue
        pattern = str(getattr(resource, "pattern", ""))
        # Skip non-API routes (SPA catch-all, static files, etc.)
        if not pattern.startswith(prefix):
            continue

        methods = getattr(resource, "methods", set())
        for method in sorted(methods):
            method_upper = method.upper()
            if method_upper == "OPTIONS":
                continue
            openapi_path = pattern
            # Normalize path params: {name} -> /{name} (already correct in aiohttp)
            # Remove trailing slash for consistency
            if openapi_path.endswith("/") and len(openapi_path) > 1:
                openapi_path = openapi_path[:-1]

            # Build operation
            operation: dict[str, Any] = {
                "summary": "",
                "tags": [],
                "parameters": _path_to_openapi_params(openapi_path),
                "responses": {"200": {"description": "Successful response"}},
            }

            # Look up static docs
            key = f"{method_upper} {openapi_path}"
            doc = _ROUTE_DOCS.get(key)
            if doc:
                operation["summary"] = doc["summary"]
                operation["tags"] = doc["tags"]
            else:
                operation["summary"] = f"{method_upper} {openapi_path}"
                operation["tags"] = ["General"]

            paths.setdefault(openapi_path, {})[method.lower()] = operation

    # Build top-level schema
    schema: dict[str, Any] = {
        "openapi": "3.0.3",
        "info": {
            "title": "Codex Pro Gateway API",
            "description": "Management API for the Codex Pro agent runtime. All endpoints require an API token unless explicitly noted.",
            "version": "0.1.0",
        },
        "servers": [{"url": prefix.rstrip("/")}],
        "paths": paths,
        "components": {
            "securitySchemes": {
                "ApiToken": {
                    "type": "apiKey",
                    "in": "header",
                    "name": "X-API-Token",
                    "description": "API token for authentication. Admin tokens have write access; reader tokens are read-only.",
                }
            }
        },
        "security": [{"ApiToken": []}],
    }
    return schema
