"""``Session.title`` — the human-readable label derived from the first user turn.

A session's key (``channel:chat_id``) is an identifier, not a label. The listing
UI shows a title so a person can tell conversations apart; it is derived from the
first ``user`` message and stored as a top-level field on the session — alongside
``key``, not in metadata — so it survives persistence and the listing can read it
directly. Sessions that predate the field fall back to a lazy, read-only
derivation.
"""

from __future__ import annotations

import pytest

from codex_pro.session.manager import Session


class TestDeriveTitle:
    def test_takes_first_non_blank_line(self):
        assert Session.derive_title("第一行\n第二行") == "第一行"

    def test_strips_markdown_and_collapses_whitespace(self):
        assert Session.derive_title("**加粗** 和 `code` 标题") == "加粗 和 code 标题"

    def test_truncates_long_text_with_ellipsis(self):
        long = "甲" * 100
        result = Session.derive_title(long)
        assert len(result) <= 40
        assert result.endswith("…")

    def test_empty_content_yields_empty_title(self):
        assert Session.derive_title("") == ""
        assert Session.derive_title("   \n  ") == ""

    def test_code_fence_is_dropped(self):
        assert Session.derive_title("```python\nprint(1)\n```") == ""


class TestAddMessageSetsTitle:
    def test_first_user_message_sets_top_level_title(self):
        session = Session(key="cli:local")
        session.add_message("user", "帮我看看这个 bug")
        # The title is a top-level field, NOT metadata.
        assert session.title == "帮我看看这个 bug"
        assert "title" not in session.metadata

    def test_title_is_not_overwritten_on_later_messages(self):
        session = Session(key="cli:local")
        session.add_message("user", "第一条")
        session.add_message("assistant", "回复")
        session.add_message("user", "第二条")
        assert session.title == "第一条"

    def test_non_user_first_message_does_not_claim_the_title(self):
        session = Session(key="cli:local")
        session.add_message("assistant", "开场")
        session.add_message("user", "真正的问题")
        assert session.title == "真正的问题"

    def test_multimodal_first_message_then_text_message_gets_title(self):
        # A multimodal (non-string) first user message has no derivable label, so
        # nothing is persisted; the next plain-text user message should take the
        # title instead. This is the case the guard's comment promises.
        session = Session(key="cli:local")
        session.add_message("user", [{"type": "text", "text": "看图"}])
        assert session.title == ""
        session.add_message("user", "帮我分析这张截图")
        assert session.title == "帮我分析这张截图"

    def test_explicit_top_level_title_wins_over_derivation(self):
        session = Session(key="cli:local", title="定制的标题")
        session.add_message("user", "默认标题")
        assert session.title == "定制的标题"


class TestResolvedTitleForLegacySessions:
    def test_title_derived_when_no_field_has_title(self):
        session = Session(key="cli:local")
        session.messages.append({"role": "user", "content": "旧会话的问题"})
        assert session.resolved_title() == "旧会话的问题"

    def test_metadata_title_is_ignored(self):
        # A legacy ``metadata["title"]`` left over from the old implementation is
        # not a source of truth; resolved_title() derives from the user message
        # instead, so the field is fully removed from concern.
        session = Session(key="cli:local", metadata={"title": "旧标题"})
        session.messages.append({"role": "user", "content": "新问题"})
        assert session.resolved_title() == "新问题"

    def test_resolution_has_no_side_effect(self):
        session = Session(key="cli:local")
        session.messages.append({"role": "user", "content": "旧会话的问题"})
        _ = session.resolved_title()
        assert session.title == ""
        assert "title" not in session.metadata

    def test_no_user_message_yields_empty_title(self):
        session = Session(key="cli:local")
        session.add_message("assistant", "只有助手消息")
        assert session.title == ""
        assert session.resolved_title() == ""


class TestListIncludesTitle:
    def test_file_listing_exposes_top_level_title(self, tmp_path):
        # A session file with the top-level title field.
        path = tmp_path / "cli%3Alocal.jsonl"
        with open(path, "w", encoding="utf-8") as f:
            f.write(
                '{"_type": "metadata", "key": "cli:local", "title": "带标题", '
                '"created_at": "2026-01-01T00:00:00", '
                '"updated_at": "2026-01-01T00:00:00", '
                '"metadata": {}, "last_consolidated": 0, "status": "active"}\n'
            )
        # No top-level title anywhere: derived from the first user message.
        path2 = tmp_path / "cli%3Aold.jsonl"
        with open(path2, "w", encoding="utf-8") as f:
            f.write(
                '{"_type": "metadata", "key": "cli:old", '
                '"created_at": "2026-01-01T00:00:00", '
                '"updated_at": "2026-01-01T00:00:00", '
                '"metadata": {}, "last_consolidated": 0, "status": "active"}\n'
            )
            f.write('{"role": "user", "content": "没有标题的旧问题"}\n')
            f.write('{"role": "assistant", "content": "回复"}\n')

        from codex_pro.session.manager import SessionManager

        manager = SessionManager(sessions_dir=tmp_path)
        rows = {r["key"]: r["title"] for r in manager.list_sessions()}
        assert rows["cli:local"] == "带标题"
        assert rows["cli:old"] == "没有标题的旧问题"


class TestSessionProject:
    """``Session.project`` — the workspace this session is scoped to.

    Stored as a top-level field alongside ``key``/``title`` (never in metadata) so
    the listing can group sessions under their project. Like ``title``, it is a
    sibling of ``key``, not part of the message history.
    """

    def test_default_project_is_empty(self):
        assert Session(key="cli:local").project == ""

    def test_project_is_not_written_to_metadata(self):
        session = Session(key="cli:local")
        session.add_message("user", "hello")
        assert "project" not in session.metadata

    @pytest.mark.asyncio
    async def test_project_round_trips_through_file_persistence(self, tmp_path):
        from codex_pro.session.manager import SessionManager

        manager = SessionManager(sessions_dir=tmp_path)
        session = Session(key="cli:local", project="e:\\workspace\\codex-pro")
        session.add_message("user", "hello")
        await manager.save(session)

        loaded = await manager.get_or_create("cli:local")
        assert loaded.project == "e:\\workspace\\codex-pro"
        # project is a top-level field, never metadata.
        assert "project" not in loaded.metadata

    @pytest.mark.asyncio
    async def test_legacy_record_without_project_loads_as_empty(self, tmp_path):
        # A session file written before the field existed: project is "".
        path = tmp_path / "cli%3Aold.jsonl"
        with open(path, "w", encoding="utf-8") as f:
            f.write(
                '{"_type": "metadata", "key": "cli:old", '
                '"created_at": "2026-01-01T00:00:00", '
                '"updated_at": "2026-01-01T00:00:00", '
                '"metadata": {}, "last_consolidated": 0, "status": "active"}\n'
            )
            f.write('{"role": "user", "content": "旧问题"}\n')

        from codex_pro.session.manager import SessionManager

        manager = SessionManager(sessions_dir=tmp_path)
        session = await manager.get_or_create("cli:old")
        assert session.project == ""


class TestListIncludesProject:
    def test_file_listing_exposes_top_level_project(self, tmp_path):
        path = tmp_path / "cli%3Alocal.jsonl"
        with open(path, "w", encoding="utf-8") as f:
            f.write(
                '{"_type": "metadata", "key": "cli:local", "title": "带标题", '
                '"project": "e:\\\\workspace\\\\codex-pro", '
                '"created_at": "2026-01-01T00:00:00", '
                '"updated_at": "2026-01-01T00:00:00", '
                '"metadata": {}, "last_consolidated": 0, "status": "active"}\n'
            )

        from codex_pro.session.manager import SessionManager

        manager = SessionManager(sessions_dir=tmp_path)
        rows = {r["key"]: r["project"] for r in manager.list_sessions()}
        assert rows["cli:local"] == "e:\\workspace\\codex-pro"

    def test_listing_without_project_yields_empty(self, tmp_path):
        path = tmp_path / "cli%3Aold.jsonl"
        with open(path, "w", encoding="utf-8") as f:
            f.write(
                '{"_type": "metadata", "key": "cli:old", '
                '"created_at": "2026-01-01T00:00:00", '
                '"updated_at": "2026-01-01T00:00:00", '
                '"metadata": {}, "last_consolidated": 0, "status": "active"}\n'
            )

        from codex_pro.session.manager import SessionManager

        manager = SessionManager(sessions_dir=tmp_path)
        rows = {r["key"]: r["project"] for r in manager.list_sessions()}
        assert rows["cli:old"] == ""
