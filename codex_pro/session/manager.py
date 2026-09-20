"""Session management — isolation, persistence, expiry, and archival."""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import tempfile
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import quote

from loguru import logger

from codex_pro.storage.errors import CorruptData


@dataclass
class Session:
    """A conversation session with append-only message history."""

    key: str
    messages: list[dict[str, Any]] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    title: str = ""  # human-readable label derived from the first user turn
    project: str = ""  # workspace path this session is scoped to; "" = none
    metadata: dict[str, Any] = field(default_factory=dict)
    last_consolidated: int = 0
    status: str = "active"  # active | expired | archived

    def add_message(self, role: str, content: str, **kwargs: Any) -> None:
        # Give the session a human-readable title from its first user turn so the
        # listing UI can show something meaningful instead of the raw key. Stored
        # as a top-level field so it sits alongside ``key`` in the listing, not
        # buried in metadata. See ``derive_title`` for the truncation rules.
        #
        # The guard is just "no title yet": a multimodal first message may have no
        # derivable label, and in that case the next real text user message should
        # take the title. Once a title is set here later messages never override
        # it.
        if role == "user" and not self.title:
            derived = self.derive_title(content)
            # Only persist a non-empty title; a multimodal first message may have
            # no derivable label, and the next real text message should get the
            # title instead.
            if derived:
                self.title = derived
        msg = {
            "role": role,
            "content": content,
            "timestamp": datetime.now().isoformat(),
            **kwargs,
        }
        self.messages.append(msg)
        self.updated_at = datetime.now()

    @staticmethod
    def derive_title(content: str, max_len: int = 40) -> str:
        """Build a short, single-line title from the text of a user's first message.

        Takes the first non-blank line, strips markdown emphasis and code fences
        that would leak into a list label, collapses runs of whitespace, and
        truncates to ``max_len`` characters with an ellipsis so a long prompt does
        not widen the session list. Content with no usable text falls back to the
        key the caller is already using.
        """
        import re

        # Non-string content (e.g. the structured list used for multimodal
        # messages) has no single label to extract; fall back to empty so the
        # listing shows the key instead of raising on an unexpected type.
        if not isinstance(content, str) or not content:
            return ""
        text = content.strip()
        # Drop code-fence blocks first (they may span lines) so the first-line
        # selection below does not latch onto a bare opening fence like
        # "```python" that has no closing marker on the same line.
        text = re.sub(r"```[\s\S]*?```", " ", text)
        for line in text.splitlines():
            if line.strip():
                text = line
                break
        # Drop inline emphasis and link syntax so a title like "**Seek** 文档"
        # doesn't render oddly in a list.
        text = re.sub(r"[`*_~\[\]]+", "", text)
        text = re.sub(r"\s+", " ", text).strip()
        if not text:
            return ""
        if len(text) > max_len:
            return text[: max_len - 1].rstrip() + "…"
        return text

    def get_history(self, max_messages: int = 500) -> list[dict[str, Any]]:
        """Return unconsolidated messages for LLM input, aligned to a safe boundary.

        Ensures no orphaned tool-result messages appear without their
        preceding assistant(tool_calls) message.
        """
        unconsolidated = self.messages[self.last_consolidated:]
        sliced = unconsolidated[-max_messages:]
        # Skip orphaned tool results at the start — their paired
        # assistant(tool_calls) was already consolidated.
        start = 0
        while start < len(sliced) and sliced[start].get("role") == "tool":
            start += 1
        sliced = sliced[start:]
        for i, m in enumerate(sliced):
            if m.get("role") == "user":
                return sliced[i:]
        return sliced

    #: Upper bound on ``get_display_history(max_messages=...)``.
    #:
    #: The endpoint takes this from a query parameter, so it is attacker- (or
    #: typo-) controlled. Serializing an entire long-running session to JSON on
    #: request is a cheap way to make the gateway do expensive work, and no
    #: viewer renders thousands of bubbles usefully.
    MAX_DISPLAY_MESSAGES = 500

    def get_display_history(self, max_messages: int = 100) -> list[dict[str, Any]]:
        """Return the most recent messages as a *human-readable* transcript.

        Distinct from ``get_history`` on purpose: that one starts at
        ``last_consolidated`` and aligns to an LLM-safe boundary, so a fully
        consolidated session yields nothing — the compact view the model needs,
        not the record a human wants to read. This slices the full ``messages``
        list instead. History before ``last_consolidated`` is kept verbatim
        (compression only ever rewrites the tail past that index — see
        agent/pipeline/context_stage.py), so those are real stored messages.

        What it is *not*: ``messages`` is not an immutable transcript. It is the
        LLM's working record, and two kinds of entry in it misrepresent the
        conversation to a human reader:

        * The compressor injects a summary as ``role: user`` plus an
          acknowledgement as ``role: assistant`` (agent/compression/assembler.py)
          so the model treats the summary as reference material. Persisted, those
          make a viewer show a machine-written summary as something the user
          typed. Dropped here, matched against the assembler's own constants
          rather than copied literals.
        * Tool calls and tool results are interleaved with the conversation. They
          are real and often worth seeing, but they are not chat turns, so they
          are tagged (``internal: True``) for the client to render distinctly
          instead of being passed off as ordinary agent replies.

        Filtering happens *before* slicing, so ``max_messages`` counts messages
        the user will actually see; otherwise a tool-heavy tail could fill the
        whole window with entries the viewer then collapses.

        Returns copies, never the stored dicts: the added ``internal`` tag must
        not leak back into the list the LLM path reads.
        """
        limit = max(1, min(int(max_messages), self.MAX_DISPLAY_MESSAGES))
        return self.display_messages()[-limit:]

    def display_messages(self) -> list[dict[str, Any]]:
        """The full human-readable transcript, unsliced.

        Split out from ``get_display_history`` so a caller can report how many
        messages exist without paying for a second filtering pass or — worse —
        reimplementing the filter and drifting from it. The history endpoint uses
        it for ``total``, which previously reported the length of the *returned*
        page and so always equalled ``len(messages)`` at small limits, telling a
        client nothing about whether more history existed.
        """
        from codex_pro.agent.compression.assembler import SUMMARY_ACK, SUMMARY_PREFIX

        visible: list[dict[str, Any]] = []
        for msg in self.messages:
            role = msg.get("role")
            content = msg.get("content")
            if isinstance(content, str):
                if role == "user" and content.startswith(SUMMARY_PREFIX):
                    continue
                if role == "assistant" and content == SUMMARY_ACK:
                    continue
            entry = dict(msg)
            # A tool result, or the assistant turn that only requested tools.
            if role == "tool" or msg.get("tool_calls"):
                entry["internal"] = True
            visible.append(entry)
        return visible

    def clear(self) -> None:
        self.messages.clear()
        self.last_consolidated = 0
        self.updated_at = datetime.now()

    @property
    def message_count(self) -> int:
        return len(self.messages)

    def resolved_title(self) -> str:
        """The title to show in listings, deriving one when none was persisted.

        Returns the top-level ``title`` field; for a session read from disk that
        predates the field (or whose first user message was multimodal), it
        derives one from the first ``user`` message instead. The derived value is
        not written back — that keeps read-only listing free of side effects.
        In-memory sessions created by ``add_message`` always have ``title`` set
        directly.
        """
        if isinstance(self.title, str) and self.title:
            return self.title
        for msg in self.messages:
            if msg.get("role") == "user":
                content = msg.get("content", "")
                # Skip multimodal/user messages without a string label and keep
                # looking, so the next plain-text user turn can still title it.
                if isinstance(content, str):
                    return self.derive_title(content)
                continue
        return ""


class SessionManager:
    """Manages conversation sessions with JSONL or SQLite persistence.

    Session keys follow the pattern `channel:chat_id` to ensure isolation
    across private chats, group chats, different channels, and cron jobs.
    """

    def __init__(self, sessions_dir: Path, expiry_hours: int = 72, archive_hours: int = 168, storage: Any = None):
        self.sessions_dir = sessions_dir
        self.sessions_dir.mkdir(parents=True, exist_ok=True)
        self._expiry_delta = timedelta(hours=expiry_hours)
        self._archive_delta = timedelta(hours=archive_hours)
        self._cache: OrderedDict[str, Session] = OrderedDict()
        self._max_cache_size = 200
        self._storage = storage
        self._lock = asyncio.Lock()
        self._session_locks: OrderedDict[str, asyncio.Lock] = OrderedDict()
        self._max_session_locks = 200
        self._migrate_legacy_filenames()

    def _session_path(self, key: str) -> Path:
        # Lossless, bijective encoding so distinct keys never map to the same
        # file. The old scheme replaced both ":" and "/" with "_", so "a:b",
        # "a/b" and "a_b" all collided onto "a_b.jsonl" — one session silently
        # overwriting another. quote(safe="") escapes every reserved char.
        safe = quote(key, safe="")
        return self.sessions_dir / f"{safe}.jsonl"

    def _migrate_legacy_filenames(self) -> None:
        """One-time, idempotent rename of files written under the old lossy
        scheme (":"/"/" -> "_") to the new quote()-encoded names.

        The authoritative key is the ``key`` field in each file's metadata line,
        not the filename — so a legacy "a_b.jsonl" whose metadata key is "a:b"
        is moved to "a%3Ab.jsonl". Files already at their canonical path are left
        untouched; ambiguous cases (missing key, target exists) are logged and
        skipped rather than risking data loss.
        """
        for path in self.sessions_dir.glob("*.jsonl"):
            try:
                with open(path, encoding="utf-8") as f:
                    first = f.readline().strip()
                if not first:
                    continue
                meta = json.loads(first)
                if meta.get("_type") != "metadata":
                    continue
                key = meta.get("key")
                if not key:
                    logger.warning("Session file {} has no key; skipping migration", path.name)
                    continue
                target = self._session_path(key)
                if target == path:
                    continue  # already canonical — idempotent no-op
                if target.exists():
                    logger.warning(
                        "Cannot migrate {} -> {}: target exists; skipping",
                        path.name, target.name,
                    )
                    continue
                os.replace(str(path), str(target))
                logger.info("Migrated session filename {} -> {}", path.name, target.name)
            except (OSError, ValueError) as e:
                logger.warning("Failed to migrate session file {}: {}", path.name, e)
                continue

    async def acquire(self, key: str) -> asyncio.Lock:
        """Return a per-session lock for serializing concurrent access.

        LRU eviction MUST NOT remove a lock that is currently held — doing so
        would let a second caller create a fresh Lock for the same key while
        the original holder is still inside its critical section, breaking
        mutual exclusion. Held locks are skipped during eviction.
        """
        async with self._lock:
            if key not in self._session_locks:
                self._session_locks[key] = asyncio.Lock()
            self._session_locks.move_to_end(key)
            while len(self._session_locks) > self._max_session_locks:
                evicted = False
                for candidate_key in list(self._session_locks.keys()):
                    if candidate_key == key:
                        continue
                    candidate_lock = self._session_locks[candidate_key]
                    if not candidate_lock.locked():
                        del self._session_locks[candidate_key]
                        evicted = True
                        break
                if not evicted:
                    # All other locks are in use; allow the cache to grow rather
                    # than violate mutex semantics.
                    break
            return self._session_locks[key]

    async def get_or_create(self, key: str) -> Session:
        async with self._lock:
            if key in self._cache:
                session = self._cache[key]
                self._cache.move_to_end(key)
                if session.status == "expired":
                    session.status = "active"
                    session.updated_at = datetime.now()
                return session

            session = await self._load(key)
            if session is None:
                session = Session(key=key)
            self._cache[key] = session
            self._cache.move_to_end(key)
            while len(self._cache) > self._max_cache_size:
                # Never evict a session whose per-session lock is held: its
                # holder is mid-turn, so saving here would snapshot a
                # half-finished state (and could later overwrite the holder's
                # complete save with a stale one).
                evicted_key = None
                for candidate_key in self._cache:
                    if candidate_key == key:
                        continue
                    candidate_lock = self._session_locks.get(candidate_key)
                    if candidate_lock is not None and candidate_lock.locked():
                        continue
                    evicted_key = candidate_key
                    break
                if evicted_key is None:
                    break  # everything is busy; let the cache grow temporarily
                evicted = self._cache.pop(evicted_key)
                try:
                    if self._storage:
                        await self._save_to_storage(evicted)
                    else:
                        await self._save_to_file(evicted)
                except Exception as e:
                    logger.warning("Failed to save evicted session {}: {}", evicted.key, e)
            return session

    async def get(self, key: str) -> Session | None:
        """Read a session without creating one. Returns None if it does not exist.

        ``get_or_create`` is the write path: it fabricates an empty Session for an
        unknown key, inserts it into the LRU, and can evict-and-persist another
        session to make room. Read-only callers (the dashboard's session-history
        endpoint) went through it and so *created* a session for any key they were
        asked about — a GET with a persistent side effect. This is the read path:
        cache hit, else load from storage, and no mutation either way."""
        async with self._lock:
            cached = self._cache.get(key)
            if cached is not None:
                # Deliberately no move_to_end: a read must not reorder eviction
                # priority for the write path.
                return cached
        # Load outside the manager lock. Unlike get_or_create (which loads while
        # holding it, because it then has to publish into the cache atomically),
        # this returns a detached copy and touches no shared state, so holding the
        # lock across the I/O would only block concurrent turns.
        return await self._load(key)

    async def _load(self, key: str) -> Session | None:
        if not self._storage:
            return await self._load_from_file(key)
        # StorageUnavailable / CorruptData propagate — we must NOT quietly serve a
        # possibly-stale downgrade file when the backend is merely unreachable.
        session = await self._load_from_storage(key)
        if session is not None:
            return session
        # Genuine NotFound in SQLite: a prior save may have fallen back to a
        # downgrade file. Recover it and best-effort re-persist to SQLite.
        recovered = await self._load_from_file(key)
        if recovered is not None:
            try:
                await self._save_to_storage(recovered)
            except Exception as e:
                logger.warning("Failed to re-persist recovered session {} to storage: {}", key, e)
        return recovered

    async def _load_from_storage(self, key: str) -> Session | None:
        # StorageUnavailable / CorruptData propagate to get_or_create, which must
        # NOT fabricate an empty session (that would overwrite real history on the
        # next save). Only a genuine NotFound (load_session -> None) returns None.
        data = await self._storage.load_session(key)
        if not data:
            return None
        try:
            return self._build_session(key, data.get("messages", []), data)
        except (ValueError, TypeError, KeyError) as e:
            logger.error("Corrupt session record for '{}': {}", key, e)
            raise CorruptData(f"session '{key}' fields are not parseable: {e}") from e

    def _build_session(self, key: str, messages: list[dict[str, Any]], data: dict[str, Any]) -> Session:
        """Construct a ``Session`` from a persisted record.

        The title is a top-level field and is read straight from the record. Any
        legacy ``metadata["title"]`` left in older records is ignored and will be
        dropped on the next save (see ``_persisted_metadata``), so the field never
        lives in metadata again.
        """
        metadata = dict(data.get("metadata") or {})
        title = data.get("title", "")
        if not isinstance(title, str):
            title = ""
        project = data.get("project", "")
        if not isinstance(project, str):
            project = ""
        return Session(
            key=key,
            messages=messages,
            created_at=datetime.fromisoformat(data["created_at"]) if data.get("created_at") else datetime.now(),
            updated_at=datetime.fromisoformat(data["updated_at"]) if data.get("updated_at") else datetime.now(),
            title=title,
            project=project,
            metadata=metadata,
            last_consolidated=data.get("last_consolidated", 0),
            status=data.get("status", "active"),
        )

    async def _load_from_file(self, key: str) -> Session | None:
        path = self._session_path(key)
        if not path.exists():
            return None
        try:
            import asyncio

            def _sync_load() -> Session | None:
                messages: list[dict[str, Any]] = []
                metadata: dict[str, Any] = {}
                created_at = None
                updated_at = None
                last_consolidated = 0
                status = "active"
                title = ""
                project = ""

                with open(path, encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        data = json.loads(line)
                        if data.get("_type") == "metadata":
                            metadata = data.get("metadata", {})
                            title = data.get("title", "")
                            project = data.get("project", "")
                            created_at = datetime.fromisoformat(data["created_at"]) if data.get("created_at") else None
                            updated_at = datetime.fromisoformat(data["updated_at"]) if data.get("updated_at") else None
                            last_consolidated = data.get("last_consolidated", 0)
                            status = data.get("status", "active")
                        else:
                            messages.append(data)

                return self._build_session(key, messages, {
                    "created_at": created_at.isoformat() if created_at else None,
                    "updated_at": updated_at.isoformat() if updated_at else None,
                    "metadata": metadata,
                    "title": title,
                    "project": project,
                    "last_consolidated": last_consolidated,
                    "status": status,
                })

            return await asyncio.to_thread(_sync_load)
        except Exception as e:
            logger.warning("Failed to load session {}: {}", key, e)
            return None

    async def save(self, session: Session) -> None:
        async with self._lock:
            self._cache[session.key] = session
            self._cache.move_to_end(session.key)
        if self._storage:
            await self._save_to_storage(session)
        else:
            await self._save_to_file(session)

    async def _save_to_storage(self, session: Session) -> None:
        data = {
            "messages": session.messages,
            "created_at": session.created_at.isoformat(),
            "updated_at": session.updated_at.isoformat(),
            "title": session.title,
            "project": session.project,
            "metadata": self._persisted_metadata(session),
            "last_consolidated": session.last_consolidated,
            "status": session.status,
        }
        try:
            await self._storage.store_session(session.key, data)
        except Exception as e:
            logger.warning("Failed to save session {} to storage, falling back to file: {}", session.key, e)
            await self._save_to_file(session)

    @staticmethod
    def _persisted_metadata(session: Session) -> dict[str, Any]:
        """Metadata as written to disk, minus the title key.

        The title lives at the top level of the session (alongside ``key``), so it
        must not also be stored in metadata. Dropping it here also clears any
        legacy ``metadata["title"]`` still present in older records, so the field
        is fully removed from metadata on the next save.
        """
        metadata = dict(session.metadata)
        metadata.pop("title", None)
        return metadata

    async def _save_to_file(self, session: Session) -> None:
        import asyncio

        path = self._session_path(session.key)
        # Snapshot on the event loop before handing off to a thread: the
        # writer must not iterate a list another task may still append to.
        messages_snapshot = list(session.messages)
        meta = {
            "_type": "metadata",
            "key": session.key,
            "created_at": session.created_at.isoformat(),
            "updated_at": session.updated_at.isoformat(),
            "title": session.title,
            "project": session.project,
            "metadata": self._persisted_metadata(session),
            "last_consolidated": session.last_consolidated,
            "status": session.status,
        }

        def _sync_save() -> None:
            fd, tmp = tempfile.mkstemp(dir=str(self.sessions_dir), prefix=".sess_", suffix=".tmp")
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as f:
                    f.write(json.dumps(meta, ensure_ascii=False) + "\n")
                    for msg in messages_snapshot:
                        f.write(json.dumps(msg, ensure_ascii=False) + "\n")
                    f.flush()
                    os.fsync(f.fileno())
                os.replace(tmp, str(path))
            except BaseException:
                try:
                    os.unlink(tmp)
                except OSError:
                    # Preserve the original save/cancellation failure; atomic
                    # replace prevents exposing a partial session file.
                    pass
                raise

        await asyncio.to_thread(_sync_save)

    async def expire_session(self, key: str) -> None:
        async with self._lock:
            session = self._cache.get(key)
        if session is None:
            # Mode-aware load: in file mode _load_from_storage would hit a None
            # backend and (previously) swallow the error, leaving cleanup_expired
            # reporting processed=1 while the on-disk status stayed "active".
            session = await self._load(key)
        if session is None:
            return
        session.status = "expired"
        await self.save(session)

    async def archive_session(self, key: str) -> bool:
        if self._storage:
            async with self._lock:
                session = self._cache.get(key)
            if session is None:
                session = await self._load(key)
            if session is None:
                return False
            session.status = "archived"
            session.updated_at = datetime.now()
            await self.save(session)
            async with self._lock:
                self._cache.pop(key, None)
            return True
        path = self._session_path(key)
        if not path.exists():
            return False
        archive_dir = self.sessions_dir / "archive"
        archive_dir.mkdir(exist_ok=True)
        shutil.move(str(path), str(archive_dir / path.name))
        async with self._lock:
            self._cache.pop(key, None)
        return True

    async def unarchive_session(self, key: str) -> bool:
        """Restore an archived session to active. Returns False if it is not found.

        The inverse of ``archive_session``: storage mode flips ``status`` back to
        ``active`` (the record stays in the sessions table either way), file mode
        moves the file back out of ``archive/`` into the main sessions directory.
        """
        if self._storage:
            async with self._lock:
                session = self._cache.get(key)
            if session is None:
                session = await self._load(key)
            if session is None or session.status != "archived":
                return False
            session.status = "active"
            session.updated_at = datetime.now()
            await self.save(session)
            async with self._lock:
                self._cache.pop(key, None)
            return True
        path = self._session_path(key)
        archive_path = self.sessions_dir / "archive" / path.name
        if archive_path.exists():
            self.sessions_dir.mkdir(exist_ok=True)
            shutil.move(str(archive_path), str(path))
        elif not path.exists():
            return False
        async with self._lock:
            self._cache.pop(key, None)
        return True

    async def delete_session(self, key: str) -> bool:
        """Permanently delete a session from both cache and persistence.

        Covers whichever location the session is in, so a key archived (file
        mode, in ``archive/``) or active (in the sessions dir) is equally
        removable. Returns True if anything was deleted.
        """
        async with self._lock:
            self._cache.pop(key, None)
        if self._storage:
            return await self._storage.delete_session(key)
        path = self._session_path(key)
        archive_path = self.sessions_dir / "archive" / path.name
        existed = False
        if path.exists():
            path.unlink()
            existed = True
        if archive_path.exists():
            archive_path.unlink()
            existed = True
        return existed

    async def cleanup_expired(self) -> int:
        """Expire stale sessions and archive old expired ones. Returns count processed."""
        now = datetime.now()
        count = 0
        if self._storage:
            for item in await self.list_sessions_async():
                try:
                    updated = datetime.fromisoformat(item["updated_at"]) if item.get("updated_at") else now
                    status = item.get("status", "active")
                    key = item.get("key", "")
                    if not key or status == "archived":
                        continue
                    if status == "active" and (now - updated) > self._expiry_delta:
                        await self.expire_session(key)
                        count += 1
                    elif status == "expired" and (now - updated) > self._archive_delta:
                        await self.archive_session(key)
                        count += 1
                except Exception as e:
                    logger.debug("Error during storage session cleanup for {}: {}", item.get("key", ""), e)
                    continue
            return count
        for path in self.sessions_dir.glob("*.jsonl"):
            key = path.stem
            try:
                with open(path, encoding="utf-8") as f:
                    first = f.readline().strip()
                if not first:
                    continue
                data = json.loads(first)
                if data.get("_type") != "metadata":
                    continue
                updated = datetime.fromisoformat(data["updated_at"]) if data.get("updated_at") else now
                status = data.get("status", "active")
                key = data.get("key", path.stem.replace("_", ":", 1))

                if status == "active" and (now - updated) > self._expiry_delta:
                    await self.expire_session(key)
                    count += 1
                elif status == "expired" and (now - updated) > self._archive_delta:
                    await self.archive_session(key)
                    count += 1
            except Exception as e:
                logger.debug("Error during session cleanup for {}: {}", key, e)
                continue
        return count

    async def list_sessions_async(self, archived: bool | None = None) -> list[dict[str, Any]]:
        if self._storage and hasattr(self._storage, "list_sessions"):
            sessions = await self._storage.list_sessions()
            if archived is not None:
                sessions = [s for s in sessions if (s.get("status") == "archived") is archived]
            return sorted(sessions, key=lambda x: x.get("updated_at", ""), reverse=True)
        return self.list_sessions(archived=archived)

    def list_sessions(self, archived: bool | None = None) -> list[dict[str, Any]]:
        """Synchronous listing. With SQLite storage and a running event loop
        this can only see the in-memory cache (≤ max_cache_size entries) —
        prefer ``list_sessions_async`` for a complete listing.

        ``archived`` filters the result: True keeps only archived sessions,
        False keeps only non-archived ones, and None (the default) returns the
        main sessions list (never the archive dir), so existing callers keep
        their behaviour.
        """
        if self._storage:
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                return asyncio.run(self.list_sessions_async(archived=archived))
            if loop.is_running():
                items = [
                    {
                        "key": session.key,
                        "status": session.status,
                        "created_at": session.created_at.isoformat(),
                        "updated_at": session.updated_at.isoformat(),
                        "metadata": session.metadata,
                        "title": session.resolved_title(),
                        "project": session.project,
                        "message_count": len(session.messages),
                    }
                    for session in self._cache.values()
                ]
                if archived is not None:
                    items = [s for s in items if (s["status"] == "archived") is archived]
                return sorted(items, key=lambda x: x.get("updated_at", ""), reverse=True)
        archive_dir = self.sessions_dir / "archive"
        # File-mode archival moves files into ``archive/`` without rewriting their
        # status field, so the on-disk location (not the status) is the
        # authoritative signal. The default (archived=None) must keep scanning only
        # the main sessions dir so existing callers — cleanup_expired, search,
        # health — see exactly what they saw before; only an explicit archived=True
        # reaches into the archive dir.
        if archived is True:
            paths = sorted(archive_dir.glob("*.jsonl")) if archive_dir.exists() else []
        else:
            paths = list(self.sessions_dir.glob("*.jsonl"))
        sessions = []
        for path in paths:
            try:
                with open(path, encoding="utf-8") as f:
                    first = f.readline().strip()
                    if not first:
                        continue
                    data = json.loads(first)
                    if data.get("_type") != "metadata":
                        continue
                    status = data.get("status", "active")
                    # A session is archived if it lives in ``archive/`` or its
                    # status field already says so (storage-written records).
                    is_archived = path.parent == archive_dir or status == "archived"
                    if archived is not None and is_archived is not archived:
                        continue
                    title = data.get("title", "")
                    # Sessions written before the top-level field existed have no
                    # title; derive one from the first user message so the listing
                    # still shows a meaningful label. Only the lines up to (and
                    # including) the first user message are read, so a long
                    # transcript is not fully materialized.
                    if not (isinstance(title, str) and title):
                        title = _first_user_title(f)
                    sessions.append({
                        "key": data.get("key", path.stem),
                        "status": data.get("status", "active"),
                        "created_at": data.get("created_at"),
                        "updated_at": data.get("updated_at"),
                        "title": title,
                        "project": data.get("project", "") or "",
                    })
            except Exception as e:
                logger.debug("Failed to read session file {}: {}", path.name, e)
                continue
        return sorted(sessions, key=lambda x: x.get("updated_at", ""), reverse=True)

    async def invalidate(self, key: str) -> None:
        async with self._lock:
            self._cache.pop(key, None)


def _first_user_title(f) -> str:
    """Derive a title from the first ``user`` message in an open session file.

    Called from ``SessionManager.list_sessions`` (file mode) when the persisted
    top-level title is absent — i.e. sessions written before title generation
    existed. Reads message lines already positioned past the metadata line and
    stops at the first ``user`` message so a large transcript isn't fully
    materialized.
    """
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            data = json.loads(line)
        except ValueError:
            continue
        if data.get("role") == "user":
            content = data.get("content", "")
            if isinstance(content, str):
                return Session.derive_title(content)
            continue
    return ""
