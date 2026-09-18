"""Pull Request listing API for the Dashboard.

Tries `gh pr list` first; falls back to a lightweight git-based view that
shows local branches with unmerged commits versus the default branch.
This avoids requiring the GitHub CLI while still surfacing PR-like data.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

from aiohttp import web

if TYPE_CHECKING:
    from codex_pro.gateway.server import GatewayServer


from codex_pro.agent.proc_lifecycle import run_owned


def _run(cmd: list[str], cwd: Path, timeout: float = 15.0) -> tuple[int, str]:
    try:
        result = run_owned(cmd, cwd=str(cwd), capture_output=True, text=True, timeout=timeout)
        return result.returncode, result.stdout
    except (OSError, TimeoutError):
        return 1, ""


def _normalize_status(state: str, is_draft: bool = False) -> str:
    """Map a GitHub PR state to the dashboard's normalized status value.

    `state` arrives as OPEN/MERGED/CLOSED from `gh pr list`; a draft PR still
    reports OPEN but carries `isDraft: true`, so we force the ``draft`` label.
    Any unknown value falls back to ``closed`` rather than leaking raw text.
    """
    if is_draft:
        return "draft"
    normalized = (state or "").strip().lower()
    if normalized == "open":
        return "open"
    if normalized == "merged":
        return "merged"
    if normalized == "closed":
        return "closed"
    return "closed"


def _parse_gh_files(stdout: str) -> list[dict]:
    """Parse ``gh pr view --json files`` output into file change entries.

    gh returns ``[{"path": str, "additions": int, "deletions": int}, ...]``; we
    remap to the shared ``{file, additions, deletions}`` contract. Malformed
    entries are skipped.
    """
    if not stdout.strip():
        return []
    try:
        raw = json.loads(stdout)
    except json.JSONDecodeError:
        return []
    if not isinstance(raw, list):
        return []
    files = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        path = str(entry.get("path", ""))
        if not path:
            continue
        files.append({
            "file": path,
            "additions": int(entry.get("additions", 0) or 0),
            "deletions": int(entry.get("deletions", 0) or 0),
        })
    return files


def _collect_gh_files(workspace: Path, number: str) -> list[dict]:
    """Fetch the changed-files list for a single PR via `gh pr view`."""
    rc, stdout = _run(["gh", "pr", "view", number, "--json", "files"], workspace)
    if rc != 0:
        return []
    return _parse_gh_files(stdout)


def _git_files(workspace: Path, default_branch: str) -> list[dict]:
    """Build file change entries from `git diff --numstat` vs the default branch.

    Each numstat line is ``<additions>\t<deletions>\t<path>``; a binary file
    reports ``-`` in both count columns (counted as 0). The path may contain
    spaces, so it is the remainder after the first two TAB-separated counts.
    """
    rc, stdout = _run(["git", "diff", "--numstat", default_branch], workspace)
    if rc != 0:
        rc, stdout = _run(["git", "diff", "--numstat", f"origin/{default_branch}"], workspace)
    if rc != 0 or not stdout.strip():
        return []
    files = []
    for line in stdout.splitlines():
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        try:
            additions = int(parts[0]) if parts[0].isdigit() else 0
            deletions = int(parts[1]) if parts[1].isdigit() else 0
        except ValueError:
            continue
        path = "\t".join(parts[2:])
        if not path:
            continue
        files.append({"file": path, "additions": additions, "deletions": deletions})
    return files


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

    # Count changed files. Try the remote-tracking ref first, then fall back to
    # the local default branch (fresh clones may lack origin/<default>).
    rc4, stdout4 = _run(["git", "diff", "--stat", f"origin/{default_branch}"], workspace)
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
            "url": "",
            "branch": current_branch,
            "default_branch": default_branch,
            "files": _git_files(workspace, default_branch),
        }
    ]


class PrsAPI:
    def __init__(self, server: GatewayServer):
        self._server = server
        self._workspace = server._workspace
        self._projects = server._projects

    def _guard(self, request: web.Request, action: str) -> web.Response | None:
        return self._server._require_api_token(request, action=action)

    async def list_prs(self, request: web.Request) -> web.Response:
        guard = self._guard(request, "prs_list")
        if guard is not None:
            return guard

        # Try gh CLI first
        rc, stdout = _run(
            ["gh", "pr", "list", "--json",
             "number,title,state,url,headRefName,baseRefName,body,createdAt,isDraft"],
            self._workspace,
        )
        if rc == 0 and stdout.strip():
            try:
                prs = json.loads(stdout)
                result = []
                for pr in prs:
                    number = str(pr.get("number", ""))
                    state = str(pr.get("state", ""))
                    is_draft = bool(pr.get("isDraft", False))
                    status = _normalize_status(state, is_draft)
                    tabs = ["all", "mine"]
                    if status == "open":
                        tabs.append("review")
                    result.append({
                        "id": number,
                        "title": pr.get("title", ""),
                        "meta": f"#{number} · {status}",
                        "tabs": tabs,
                        "body": pr.get("body") or "",
                        "status": status,
                        "url": pr.get("url", ""),
                        "branch": pr.get("headRefName", ""),
                        "default_branch": pr.get("baseRefName", ""),
                        "files": _collect_gh_files(self._workspace, number),
                    })
                return web.json_response({"prs": result})
            except json.JSONDecodeError:
                pass

        # Fallback to git-based view
        prs = _git_prs(self._workspace)

        # Aggregate PR-like entries from all git projects under workspace/_projects.
        if (self._projects / ".git").is_dir():
            prs.extend(_git_prs(self._projects))
        for child in sorted(self._projects.iterdir()):
            if child.is_dir() and (child / ".git").is_dir():
                prs.extend(_git_prs(child))

        return web.json_response({"prs": prs})
