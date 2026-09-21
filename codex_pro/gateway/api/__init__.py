"""Management API routes for the built-in Dashboard and operators.

All routes are registered under the gateway's api_prefix (default /api/v1).
Authentication reuses the existing GatewayAuth token check.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from aiohttp import web

if TYPE_CHECKING:
    from codex_pro.gateway.server import GatewayServer


def register_management_routes(app: web.Application, prefix: str, server: GatewayServer) -> None:
    from codex_pro.gateway.api.memory import MemoryAPI
    from codex_pro.gateway.api.skills import SkillsAPI
    from codex_pro.gateway.api.channels import ChannelsAPI
    from codex_pro.gateway.api.knowledge import KnowledgeAPI
    from codex_pro.gateway.api.config import ConfigAPI
    from codex_pro.gateway.api.tasks import TasksAPI
    from codex_pro.gateway.api.sessions import SessionsAPI
    from codex_pro.gateway.api.cron_api import CronAPI
    from codex_pro.gateway.api.logs import LogsAPI
    from codex_pro.gateway.api.analytics import AnalyticsAPI
    from codex_pro.gateway.api.git import GitAPI
    from codex_pro.gateway.api.files import FilesAPI
    from codex_pro.gateway.api.prs import PrsAPI
    from codex_pro.gateway.api.hooks import register_hook_api_routes
    from codex_pro.gateway.api.plugins import register_plugin_api_routes
    from codex_pro.gateway.api.providers import ProvidersAPI
    from codex_pro.gateway.api.connections import ConnectionsAPI
    from codex_pro.gateway.api.context_usage import ContextUsageAPI

    memory_api = MemoryAPI(server)
    skills_api = SkillsAPI(server)
    channels_api = ChannelsAPI(server)
    knowledge_api = KnowledgeAPI(server)
    config_api = ConfigAPI(server)
    tasks_api = TasksAPI(server)
    sessions_api = SessionsAPI(server)
    cron_api = CronAPI(server)
    logs_api = LogsAPI(server)
    analytics_api = AnalyticsAPI(server)
    git_api = GitAPI(server)
    files_api = FilesAPI(server)
    prs_api = PrsAPI(server)
    providers_api = ProvidersAPI(server)
    connections_api = ConnectionsAPI(server)
    context_usage_api = ContextUsageAPI(server)

    app.router.add_get(f"{prefix}/memory", memory_api.list_entries)
    app.router.add_get(f"{prefix}/memory/stats", memory_api.stats)
    app.router.add_post(f"{prefix}/memory/search", memory_api.search)
    app.router.add_get(f"{prefix}/memory/{{id}}", memory_api.get_entry)
    app.router.add_put(f"{prefix}/memory/{{id}}", memory_api.update_entry)
    app.router.add_delete(f"{prefix}/memory/{{id}}", memory_api.delete_entry)

    app.router.add_get(f"{prefix}/skills", skills_api.list_skills)
    app.router.add_post(f"{prefix}/skills/import", skills_api.import_skill)
    app.router.add_post(f"{prefix}/skills/upload", skills_api.upload_skill)
    app.router.add_get(f"{prefix}/skills/{{name}}", skills_api.get_skill)
    app.router.add_get(f"{prefix}/skills/{{name}}/deps", skills_api.get_skill_deps)
    app.router.add_post(f"{prefix}/skills/{{name}}/deps/install", skills_api.install_skill_deps)
    app.router.add_post(f"{prefix}/skills/{{name}}/toggle", skills_api.toggle_skill)
    app.router.add_delete(f"{prefix}/skills/{{name}}", skills_api.delete_skill)

    app.router.add_get(f"{prefix}/channels", channels_api.list_channels)
    app.router.add_post(f"{prefix}/channels/{{name}}/{{action}}", channels_api.lifecycle)

    app.router.add_get(f"{prefix}/knowledge/status", knowledge_api.get_status)
    app.router.add_post(f"{prefix}/knowledge/rebuild", knowledge_api.rebuild)
    app.router.add_post(f"{prefix}/knowledge/upload", knowledge_api.upload)
    app.router.add_get(f"{prefix}/knowledge/documents", knowledge_api.list_documents)
    app.router.add_get(f"{prefix}/knowledge/jobs", knowledge_api.list_jobs)
    app.router.add_get(f"{prefix}/knowledge/jobs/{{id}}", knowledge_api.get_job)
    app.router.add_delete(f"{prefix}/knowledge/documents/{{path:.+}}", knowledge_api.delete_document)

    app.router.add_get(f"{prefix}/config", config_api.get_config)
    app.router.add_patch(f"{prefix}/config", config_api.update_config)

    app.router.add_get(f"{prefix}/providers", providers_api.list_providers)
    app.router.add_get(f"{prefix}/providers/catalog", providers_api.get_catalog)
    app.router.add_get(f"{prefix}/providers/{{name}}", providers_api.get_provider)
    app.router.add_post(f"{prefix}/providers", providers_api.create_provider)
    app.router.add_patch(f"{prefix}/providers/{{name}}", providers_api.update_provider)
    app.router.add_patch(f"{prefix}/providers/{{name}}/rename", providers_api.rename_provider)
    app.router.add_delete(f"{prefix}/providers/{{name}}", providers_api.delete_provider)
    app.router.add_post(f"{prefix}/providers/{{name}}/test", providers_api.test_provider)
    app.router.add_get(f"{prefix}/providers/health", providers_api.get_health)

    app.router.add_get(f"{prefix}/connections", connections_api.list_connections)
    app.router.add_post(f"{prefix}/connections", connections_api.add_connection)
    app.router.add_get(f"{prefix}/connections/refresh", connections_api.refresh_connections)
    app.router.add_put(f"{prefix}/connections/{{name}}", connections_api.update_connection)
    app.router.add_delete(f"{prefix}/connections/{{name}}", connections_api.delete_connection)
    app.router.add_post(f"{prefix}/connections/{{name}}/test", connections_api.test_connection)

    app.router.add_get(f"{prefix}/tasks", tasks_api.list_tasks)
    app.router.add_post(f"{prefix}/tasks", tasks_api.create_task)
    app.router.add_get(f"{prefix}/tasks/{{id}}", tasks_api.get_task)
    app.router.add_put(f"{prefix}/tasks/{{id}}", tasks_api.update_task)
    app.router.add_delete(f"{prefix}/tasks/{{id}}", tasks_api.delete_task)
    app.router.add_post(f"{prefix}/tasks/{{id}}/transition", tasks_api.transition_task)
    app.router.add_post(f"{prefix}/tasks/{{id}}/retry", tasks_api.retry_task)

    app.router.add_get(f"{prefix}/sessions", sessions_api.list_sessions)
    app.router.add_get(f"{prefix}/sessions/{{key}}/history", sessions_api.get_history)
    app.router.add_get(f"{prefix}/sessions/{{key}}/context-usage", context_usage_api.get_context_usage)
    app.router.add_get(f"{prefix}/sessions/{{key}}/turns", sessions_api.list_turns)
    app.router.add_get(f"{prefix}/turns/{{event_id}}", sessions_api.get_turn)
    app.router.add_post(f"{prefix}/sessions/{{key}}/archive", sessions_api.archive_session)
    app.router.add_post(f"{prefix}/sessions/{{key}}/unarchive", sessions_api.unarchive_session)
    app.router.add_delete(f"{prefix}/sessions/{{key}}", sessions_api.delete_session)

    app.router.add_get(f"{prefix}/cron", cron_api.list_jobs)
    app.router.add_post(f"{prefix}/cron", cron_api.create_job)
    app.router.add_put(f"{prefix}/cron/{{id}}", cron_api.update_job)
    app.router.add_delete(f"{prefix}/cron/{{id}}", cron_api.delete_job)
    app.router.add_post(f"{prefix}/cron/{{id}}/trigger", cron_api.trigger_job)
    app.router.add_get(f"{prefix}/cron/{{id}}/runs", cron_api.get_runs)

    app.router.add_get(f"{prefix}/logs", logs_api.list_logs)
    app.router.add_get(f"{prefix}/analytics/tokens", analytics_api.token_usage)
    app.router.add_get(f"{prefix}/analytics/skills", analytics_api.skill_usage)
    app.router.add_get(f"{prefix}/analytics/channels", analytics_api.channel_usage)

    # Plugins
    register_plugin_api_routes(app, prefix, server)

    # User-configured lifecycle hooks
    register_hook_api_routes(app, prefix, server)

    # Git operations for Composer dropdowns
    app.router.add_get(f"{prefix}/git/repos", git_api.list_repos)
    app.router.add_post(f"{prefix}/git/repos", git_api.create_repo)
    app.router.add_post(f"{prefix}/git/open", git_api.open_folder)
    app.router.add_get(f"{prefix}/git/branches", git_api.list_branches)
    app.router.add_post(f"{prefix}/git/branches", git_api.create_branch)

    # File browser for tools panel
    app.router.add_get(f"{prefix}/files", files_api.list_dir)
    app.router.add_get(f"{prefix}/files/content", files_api.read_file)

    # Pull requests
    app.router.add_get(f"{prefix}/prs", prs_api.list_prs)

    # OpenAPI schema endpoint
    from codex_pro.gateway.api.openapi import generate_openapi_schema

    async def _openapi_json(request: web.Request) -> web.Response:
        schema = generate_openapi_schema(server)
        return web.json_response(schema)

    app.router.add_get(f"{prefix}/openapi.json", _openapi_json)

    # Interactive API docs (Swagger UI) served at /docs, pointed at the schema.
    # Assets are vendored locally so the page never depends on an external CDN
    # or proxy.
    from codex_pro.gateway.api.docs import docs_handler, register_swagger_assets

    app.router.add_get("/docs", docs_handler(f"{prefix}/openapi.json"))
    register_swagger_assets(app, server)