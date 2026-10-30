"""Shared base model for all config schema sections.

Every schema_defs module must import ``_Base`` from here instead of
defining a local copy. Local copies with identical definitions are still
distinct classes, which breaks ``issubclass`` checks in
``codex_pro.config.metadata.iter_fields`` (schema traversal silently
degrades to top-level sections only).
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class _Base(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
