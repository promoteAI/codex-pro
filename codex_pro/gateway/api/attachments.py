"""Attachment upload endpoint — store browser-selected local files for a session.

A browser cannot hand a local file to ``POST /message`` as an ``http(s)`` URL
(the only thing ``media_urls`` accepts), so this module gives the web UI a
place to land the bytes first. The upload writes the file into a dedicated
attachments directory on the gateway and returns an ``attachment_id`` plus a
local file path; ``POST /message`` then accepts that attachment id (in a new
``attachments`` field) and turns the stored file into a content block. That
keeps the client from ever supplying an arbitrary filesystem path — it only
ever names an id the gateway itself minted and validated on upload.

The stored local path flows into the existing media pipeline unchanged:
``agent/context.py:resolve_inbound_media`` already handles local paths for
images (rendered as a data URL) and for documents (``file`` type with
``_doc_enabled`` extracts text straight from the path).
"""
from __future__ import annotations

import json
import re
import tempfile
import uuid
from pathlib import Path, PurePosixPath
from typing import TYPE_CHECKING, Any

from aiohttp import web

if TYPE_CHECKING:
    from codex_pro.gateway.server import GatewayServer


# Per-file ceiling. Browsers select files for a chat attachment, so this mirrors
# the gateway media file limit rather than the (larger) knowledge document cap.
_DEFAULT_MAX_UPLOAD_FILE_BYTES = 25 * 1024 * 1024

# Only the extension is taken from the client-supplied filename for the stored
# file; everything else about the on-disk path is minted by the gateway.
_ALLOWED_EXT_CHARS = re.compile(r"[^A-Za-z0-9]+")


def _safe_ext(filename: str, max_len: int = 10) -> str:
    """Return a sanitized lowercase extension (with dot) or '' when useless."""
    normalized = filename.replace("\\", "/")
    ext = PurePosixPath(normalized).suffix.lower()
    if not ext or len(ext) > max_len + 1:
        return ""
    cleaned = _ALLOWED_EXT_CHARS.sub("", ext)
    if not cleaned:
        return ""
    return "." + cleaned.lstrip(".")


class AttachmentStore:
    """Persist uploaded attachments under a fixed directory.

    Each attachment is stored as ``<attachment_id><ext>`` inside ``store_dir``
    with its metadata (original name, mime type, size) kept in an ``index.json``
    sidecar so metadata survives a gateway restart and ``attachment_id`` stays
    resolvable to a path for as long as the file remains on disk.
    """

    def __init__(self, store_dir: Path, max_file_bytes: int = _DEFAULT_MAX_UPLOAD_FILE_BYTES):
        self._store_dir = store_dir
        self._max_file_bytes = max(1, max_file_bytes)
        self._index_path = store_dir / "index.json"
        self._store_dir.mkdir(parents=True, exist_ok=True)
        self._index: dict[str, dict[str, Any]] = self._load_index()

    def _load_index(self) -> dict[str, dict[str, Any]]:
        if not self._index_path.exists():
            return {}
        try:
            data = json.loads(self._index_path.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except (ValueError, OSError):
            return {}

    def _save_index(self) -> None:
        try:
            self._index_path.write_text(
                json.dumps(self._index, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except OSError as e:  # pragma: no cover - best-effort persistence
            from loguru import logger

            logger.error("Attachment index persist failed: {}", e)

    def max_file_bytes(self) -> int:
        return self._max_file_bytes

    def store(self, *, filename: str, mime_type: str, size: int, source: Path) -> dict[str, Any]:
        """Move a validated staging file into place and record its metadata."""
        attachment_id = uuid.uuid4().hex[:16]
        ext = _safe_ext(filename)
        target = self._store_dir / f"{attachment_id}{ext}"
        source.replace(target)
        record = {
            "attachment_id": attachment_id,
            "path": str(target.resolve()),
            "name": filename,
            "mime_type": mime_type,
            "size": size,
        }
        self._index[attachment_id] = record
        self._save_index()
        return {
            "attachment_id": attachment_id,
            "url": record["path"],
            "name": record["name"],
            "mime_type": record["mime_type"],
            "size": record["size"],
        }

    def get(self, attachment_id: str) -> dict[str, Any] | None:
        return self._index.get(attachment_id)

    def get_path(self, attachment_id: str) -> Path | None:
        record = self._index.get(attachment_id)
        if record is None:
            return None
        path = Path(record["path"])
        return path if path.is_file() else None


class AttachmentsAPI:
    """HTTP handlers for the attachment upload endpoint."""

    def __init__(self, server: GatewayServer):
        self._server = server

    def _store(self) -> AttachmentStore:
        store = getattr(self._server, "_attachment_store", None)
        if store is None:
            max_bytes = self._server._config.media_max_file_mb * 1024 * 1024
            store = AttachmentStore(
                self._server._workspace / "data" / "attachments",
                max_file_bytes=max_bytes,
            )
            self._server._attachment_store = store
        return store

    async def upload(self, request: web.Request) -> web.Response:
        guard = self._server._require_api_token(request, action="attachment_upload")
        if guard is not None:
            return guard

        try:
            reader = await request.multipart()
        except Exception:
            return web.json_response({"error": "multipart form required"}, status=400)
        if reader is None:
            return web.json_response({"error": "multipart form required"}, status=400)

        store = self._store()

        # A user-visible attachment is not committed until it passes size
        # validation. TemporaryDirectory guarantees cleanup on malformed streams.
        with tempfile.TemporaryDirectory(prefix=".attach-", dir=store._store_dir) as temp_name:
            staging = Path(temp_name) / "upload"
            name = "unnamed"
            mime_type = ""
            file_bytes = 0
            found = False
            while True:
                part = await reader.next()
                if part is None:
                    break
                if part.name != "file":
                    await part.release()
                    continue
                found = True
                name = (part.filename or "unnamed").replace("\\", "/").split("/")[-1]
                mime_type = (part.headers.get("Content-Type", "") or "").split(";")[0].strip()
                with staging.open("wb") as handle:
                    while True:
                        chunk = await part.read_chunk(64 * 1024)
                        if not chunk:
                            break
                        file_bytes += len(chunk)
                        if file_bytes > store.max_file_bytes():
                            return web.json_response(
                                {
                                    "error": f"file too large: {name}",
                                    "max_bytes": store.max_file_bytes(),
                                },
                                status=413,
                            )
                        handle.write(chunk)

            if not found:
                return web.json_response({"error": "no file uploaded"}, status=400)
            if file_bytes == 0:
                return web.json_response({"error": "empty file"}, status=400)

            return web.json_response(
                store.store(
                    filename=name,
                    mime_type=mime_type,
                    size=file_bytes,
                    source=staging,
                ),
                status=201,
            )
