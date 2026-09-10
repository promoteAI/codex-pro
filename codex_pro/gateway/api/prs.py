"""Pull Request listing API for the Dashboard.

Tries `gh pr list` first; falls back to a lightweight git-based view that
shows local branches with unmerged commits versus the default branch.
This avoids requiring the GitHub CLI while still surfacing PR-like data.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import TYPE_CHECKING

from aiohttp import web

if TYPE_CHECKING:
    from codex_pro.gateway.server import GatewayServer


def _run(cmd: list[str], cwd: Path, timeout: float = 15.0) -> tuple[int, str]:
    try:
        result = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True, timeout=timeout)
        return result.returncode, result.stdout
    except (OSError, subprocess.TimeoutExpired):
        return 1, ""


def _git_prs(workspace: Path) -> list[dict]:
    """Build PR-like entries from local git state when gh CLI is unavailable."""
    default_branch = "main"
    rc, stdout = _run(["git", "branch", "--show-current"], workspace)
    if rc == 0 and stdout.strip():
        current_branch = stdout.strip()
    else:
        current_branch = ""

    # Check if default branch exists
    rc2, _ = _run(["git", "rev-parse", "--verify", default_branch], workspace)
    if rc2 != 0:
        # Try "master" as fallback
        rc2, _ = _run(["git", "rev-parse", "--verify", "master"], workspace)
        if rc2 == 0:
            default_branch = "master"
        else:
            return []

    rc3, stdout3 = _run(
        ["git", "log", f"{default_branch}..{current_branch}", "--oneline"],
        workspace,
    )
    unmerged: list[str] = []
    if rc3 == 0 and stdout3.strip():
        unmerged = [line.strip() for line in stdout3.splitlines() if line.strip()]

    # Count changed files
    rc4, stdout4 = _run(
        ["git", "diff", "--stat", f"origin/{default_branch}" if f"origin/{default_branch}" else default_branch],
        workspace,
    )
    # Fall back to diff against default_branch directly
    if rc4 != 0:
        rc4, stdout4 = _run(["git", "diff", "--stat", default_branch], workspace)

    added = 0
    removed = 0
    if rc4 == 0 and stdout4.strip():
        for line in stdout4.splitlines():
            parts = line.split()
            for p in parts:
                try:
                    n = int(p.replace(",", ""))
                    if "+" in line and "insert" in line.lower():
                        added += n
                    elif "-" in line and "delet" in line.lower():
                        removed += n
                except ValueError:
                    pass

    return [
        {
            "id": f"local-{current_branch or 'default'}",
            "title": f"Work in progress on {current_branch or default_branch}",
            "meta": f"{workspace.name} · local branch",
            "tabs": ["all", "mine"],
            "body": (
                f"**{len(unmerged)} unmerged commit(s)** vs `{default_branch}`.\n\n"
                + "\n".join(f"- {c}" for c in unmerged[:5])
                + (f"\n\n(+{added}/-{removed} lines)" if added or removed else "")
            ),
            "status": "open",
            "branch": current_branch,
            "default_branch": default_branch,
        }
    ]


class PrsAPI:
    def __init__(self, server: GatewayServer):
        self._server = server
        self._workspace = server._workspace

    def _guard(self, request: web.Request, action: str) -> web.Response | None:
        return self._server._require_api_token(request, action=action)

    async def list_prs(self, request: web.Request) -> web.Response:
        guard = self._guard(request, "prs_list")
        if guard is not None:
            return guard

        # Try gh CLI first
        rc, stdout = _run(["gh", "pr", "list", "--json", "number,title,state,url,headRefName,baseRefName,body,createdAt"], self._workspace)
        if rc == 0 and stdout.strip():
            try:
                prs = json.loads(stdout)
                result = []
                for pr in prs:
                    result.append({
                        "id": str(pr.get("number", "")),
                        "title": pr.get("title", ""),
                        "meta": f"#{pr.get('number', '?')} · {pr.get('state', '?')}",
                        "tabs": ["all", "mine"],
                        "body": pr.get("body") or "",
                        "status": pr.get("state", "open"),
                        "url": pr.get("url", ""),
                    })
                return web.json_response({"prs": result})
            except json.JSONDecodeError:
                pass

        # Fallback to git-based view
        prs = _git_prs(self._workspace)
        return web.json_response({"prs": prs})
