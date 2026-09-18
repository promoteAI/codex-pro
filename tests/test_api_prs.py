# tests/test_api_prs.py
"""Tests for the Pull Request listing API.

Covers gh-CLI parsing/status normalization, the git-based fallback path, the
shared output contract (all fields present on both paths), and file-change
parsing. Command execution is mocked at the module's ``_run`` boundary unless a
test explicitly runs real git (the ``@pytest.mark.slow`` integration case).
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from codex_pro.gateway.api.prs import (
    PrsAPI,
    _git_prs,
    _normalize_status,
    _parse_gh_files,
)


def _fake_run(script: dict[str, tuple[int, str]]):
    """Build a `_run` stand-in that returns scripted output per joined command.

    Keys are the full command string (``" ".join(cmd)``); unmatched commands
    return ``(1, "")`` so the fallback branches are exercised naturally.
    """

    def _run(cmd: list[str], cwd: Path, timeout: float = 15.0) -> tuple[int, str]:
        return script.get(" ".join(cmd), (1, ""))

    return _run


@pytest.fixture
def mock_server(tmp_workspace):
    server = MagicMock()
    server._require_api_token = MagicMock(return_value=None)
    server._workspace = tmp_workspace
    return server


@pytest.fixture
def api(mock_server):
    return PrsAPI(mock_server)


# ─────────────────────────────────────────────────────────────────────────────
# Status normalization (pure helper)
# ─────────────────────────────────────────────────────────────────────────────


def test_normalize_status_maps_known_states():
    assert _normalize_status("OPEN") == "open"
    assert _normalize_status("MERGED") == "merged"
    assert _normalize_status("CLOSED") == "closed"


def test_normalize_status_is_draft_forces_draft():
    assert _normalize_status("OPEN", is_draft=True) == "draft"


def test_normalize_status_unknown_falls_back_to_closed():
    assert _normalize_status("WEIRD") == "closed"
    assert _normalize_status("") == "closed"


# ─────────────────────────────────────────────────────────────────────────────
# gh files parsing (pure helper)
# ─────────────────────────────────────────────────────────────────────────────


def test_parse_gh_files_parses_entries():
    raw = json.dumps([
        {"path": "src/a.py", "additions": 12, "deletions": 3},
        {"path": "src/b.py", "additions": 0, "deletions": 1},
    ])
    assert _parse_gh_files(raw) == [
        {"file": "src/a.py", "additions": 12, "deletions": 3},
        {"file": "src/b.py", "additions": 0, "deletions": 1},
    ]


def test_parse_gh_files_handles_empty_and_not_a_list():
    assert _parse_gh_files("") == []
    assert _parse_gh_files("not json") == []
    assert _parse_gh_files("{}") == []
    assert _parse_gh_files(json.dumps([{"no_path": True}])) == []


# ─────────────────────────────────────────────────────────────────────────────
# list_prs — gh path
# ─────────────────────────────────────────────────────────────────────────────

_GH_JSON = [
    {
        "number": 42,
        "title": "feat: shell redesign",
        "state": "OPEN",
        "url": "https://github.com/x/y/pull/42",
        "headRefName": "feat/shell",
        "baseRefName": "dev",
        "body": "描述",
        "isDraft": False,
    },
    {
        "number": 41,
        "title": "chore: bundle gate",
        "state": "MERGED",
        "url": "https://github.com/x/y/pull/41",
        "headRefName": "chore/gate",
        "baseRefName": "dev",
        "body": "",
        "isDraft": False,
    },
    {
        "number": 40,
        "title": "wip: draft pr",
        "state": "OPEN",
        "url": "https://github.com/x/y/pull/40",
        "headRefName": "wip/x",
        "baseRefName": "dev",
        "body": "",
        "isDraft": True,
    },
]

_GH_FILES_JSON = json.dumps([
    {"path": "web/src/App.tsx", "additions": 12, "deletions": 4},
])


def _gh_script():
    return {
        " ".join(["gh", "pr", "list", "--json",
                  "number,title,state,url,headRefName,baseRefName,body,createdAt,isDraft"]): (0, json.dumps(_GH_JSON)),
        "gh pr view 42 --json files": (0, _GH_FILES_JSON),
        "gh pr view 41 --json files": (0, "[]"),
        "gh pr view 40 --json files": (1, ""),
    }


@pytest.mark.asyncio
async def test_gh_list_normalizes_fields_and_files(api):
    with patch("codex_pro.gateway.api.prs._run", side_effect=_fake_run(_gh_script())):
        resp = await api.list_prs(MagicMock())
    assert resp.status == 200
    data = json.loads(resp.body.decode())
    assert len(data["prs"]) == 3

    open_pr = data["prs"][0]
    assert open_pr["status"] == "open"
    assert open_pr["branch"] == "feat/shell"
    assert open_pr["default_branch"] == "dev"
    assert open_pr["url"] == "https://github.com/x/y/pull/42"
    # open 非 draft → tabs 含 review
    assert "review" in open_pr["tabs"]
    assert open_pr["files"] == [
        {"file": "web/src/App.tsx", "additions": 12, "deletions": 4},
    ]

    merged = data["prs"][1]
    assert merged["status"] == "merged"
    assert "review" not in merged["tabs"]
    assert merged["files"] == []

    draft = data["prs"][2]
    assert draft["status"] == "draft"
    assert "review" not in draft["tabs"]
    assert draft["files"] == []  # gh pr view rc!=0 → no files, not an error


# ─────────────────────────────────────────────────────────────────────────────
# list_prs — git fallback path
# ─────────────────────────────────────────────────────────────────────────────


def _git_script():
    """Scripted state for a feature branch with unmerged commits and a changed file."""
    return {
        "git branch --show-current": (0, "feature/x\n"),
        "git rev-parse --verify main": (0, "main\n"),
        "git log main..feature/x --oneline": (0, "abc123 first\n"),
        "git diff --stat origin/main": (1, ""),
        "git diff --stat main": (0, " web/src/App.tsx | 5 +++--\n 1 file changed, 3 insertions(+), 2 deletions(-)\n"),
        "git diff --numstat main": (0, "3\t2\tweb/src/App.tsx\n"),
    }


@pytest.mark.asyncio
async def test_git_fallback_has_all_contract_fields(mock_server, api):
    mock_server._workspace = Path("/tmp/proj")
    with patch("codex_pro.gateway.api.prs._run", side_effect=_fake_run(_git_script())):
        resp = await api.list_prs(MagicMock())
    assert resp.status == 200
    data = json.loads(resp.body.decode())
    assert len(data["prs"]) == 1
    pr = data["prs"][0]
    # Every contract field present on the fallback path too.
    assert pr["url"] == ""
    assert pr["branch"] == "feature/x"
    assert pr["default_branch"] == "main"
    assert pr["status"] == "open"
    assert pr["tabs"] == ["all", "mine"]
    assert pr["files"] == [{"file": "web/src/App.tsx", "additions": 3, "deletions": 2}]


def test_git_files_parses_binary_and_spaces_in_path():
    raw = "1\t0\tweb/src/a.py\n-\t-\tassets/logo.bin\n2\t3\tdocs/my file.md\n"
    script = {
        "git diff --numstat main": (0, raw),
        "git diff --numstat origin/main": (1, ""),
    }
    from codex_pro.gateway.api.prs import _git_files
    with patch("codex_pro.gateway.api.prs._run", side_effect=_fake_run(script)):
        assert _git_files(Path("/tmp/proj"), "main") == [
            {"file": "web/src/a.py", "additions": 1, "deletions": 0},
            {"file": "assets/logo.bin", "additions": 0, "deletions": 0},
            {"file": "docs/my file.md", "additions": 2, "deletions": 3},
        ]


# ─────────────────────────────────────────────────────────────────────────────
# HTTP contract
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_prs_returns_prs_key(mock_server, api):
    app = web.Application()
    app.router.add_get("/api/v1/prs", api.list_prs)
    with patch("codex_pro.gateway.api.prs._run", side_effect=_fake_run(_git_script())):
        async with TestClient(TestServer(app)) as client:
            resp = await client.get("/api/v1/prs")
            assert resp.status == 200
            data = await resp.json()
    assert "prs" in data
    assert isinstance(data["prs"], list)
    # All fields present per entry.
    pr = data["prs"][0]
    for key in ("id", "title", "meta", "tabs", "body", "status", "url",
                "branch", "default_branch", "files"):
        assert key in pr


@pytest.mark.asyncio
async def test_list_prs_requires_token(api):
    rejection = web.json_response({"error": "unauthorized"}, status=401)
    api._server._require_api_token = MagicMock(return_value=rejection)
    resp = await api.list_prs(MagicMock())
    assert resp.status == 401


# ─────────────────────────────────────────────────────────────────────────────
# Real git integration (slow) — no `_run` mocking
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.slow
def test_git_prs_real_repo(tmp_path):
    """Build a real feature branch in a temp repo and read it back via _git_prs.

    Exercises the actual git commands (diff --stat, diff --numstat, log) against
    a controlled repository instead of mock output, pinning the fallback path's
    real data flow without depending on the host repo's branch state.
    """
    workspace = tmp_path / "proj"
    workspace.mkdir()

    def git(*args):
        import subprocess
        return subprocess.run(
            ["git", *args], cwd=str(workspace), capture_output=True, text=True,
        )

    git("init", "-q", "-b", "main")
    git("config", "user.email", "test@example.com")
    git("config", "user.name", "tester")
    git("config", "commit.gpgsign", "false")

    (workspace / "a.txt").write_text("line1\n", encoding="utf-8")
    git("add", "-A")
    git("commit", "-q", "-m", "initial")
    git("checkout", "-b", "feature/x")
    (workspace / "a.txt").write_text("line1\nline2\n", encoding="utf-8")
    git("add", "-A")
    git("commit", "-q", "-m", "add line")

    prs = _git_prs(workspace)
    assert len(prs) == 1
    pr = prs[0]
    assert pr["status"] == "open"
    assert pr["tabs"] == ["all", "mine"]
    assert pr["url"] == ""
    assert pr["branch"] == "feature/x"
    assert pr["default_branch"] == "main"
    assert pr["files"] == [{"file": "a.txt", "additions": 1, "deletions": 0}]
    assert "1 unmerged commit" in pr["body"]
