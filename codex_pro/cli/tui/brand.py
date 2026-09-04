"""Configurable brand strings for the TUI (name, prompt sigil, welcome, goodbye).

Everything user-facing that identifies
the product lives here so a white-label / multi-tenant deployment can rebrand
without touching widget code. Values come from env vars (CODEX_BRAND_*), falling
back to Codex Pro's defaults.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass, field

from codex_pro.cli.i18n import t

_MAX_LEN = 80

# Kept alongside the brand strings so the setup wizard can mirror the TUI
# wordmark without importing Textual. Setup maps these roles to ANSI colors.
CODEX_LOGO_ART = (
    " ██████╗ ██████╗ ██████╗ ███████╗██╗  ██╗",
    "██╔════╝██╔═══██╗██╔══██╗██╔════╝╚██╗██╔╝",
    "██║     ██║   ██║██║  ██║█████╗   ╚███╔╝ ",
    "██║     ██║   ██║██║  ██║██╔══╝   ██╔██╗ ",
    "╚██████╗╚██████╔╝██████╔╝███████╗██╔╝ ██╗",
)
CODEX_LOGO_GRADIENT = ("primary", "primary", "accent", "secondary", "secondary")

# Backward-compatible aliases (legacy Codex naming).
CODEX_LOGO_ART = CODEX_LOGO_ART
CODEX_LOGO_GRADIENT = CODEX_LOGO_GRADIENT

# Brand names that unlock the block-letter wordmark (case-insensitive).
DEFAULT_BRAND_NAMES = frozenset({"codex pro", "codex-pro", "codex"})


@dataclass(frozen=True)
class Brand:
    name: str = "Codex Pro"
    tagline: str = "agent"
    prompt: str = "❯"
    placeholder: str = field(default_factory=lambda: t("attach.ui.placeholder"))
    welcome: str = field(default_factory=lambda: t("attach.ui.welcome"))
    goodbye: str = field(default_factory=lambda: t("attach.ui.goodbye"))

    @property
    def uses_block_logo(self) -> bool:
        return self.name.lower() in DEFAULT_BRAND_NAMES


def _clean(value: str | None, fallback: str) -> str:
    cleaned = " ".join(str(value or "").split()).strip()
    if not cleaned or len(cleaned) > _MAX_LEN:
        return fallback
    return cleaned


def load_brand(env: Mapping[str, str] | None = None) -> Brand:
    """Build a Brand from CODEX_BRAND_* env vars, falling back to defaults."""
    e = env if env is not None else os.environ
    d = Brand()
    return Brand(
        name=_clean(e.get("CODEX_BRAND_NAME"), d.name),
        tagline=_clean(e.get("CODEX_BRAND_TAGLINE"), d.tagline),
        prompt=_clean(e.get("CODEX_BRAND_PROMPT"), d.prompt),
        placeholder=_clean(e.get("CODEX_BRAND_PLACEHOLDER"), d.placeholder),
        welcome=_clean(e.get("CODEX_BRAND_WELCOME"), d.welcome),
        goodbye=_clean(e.get("CODEX_BRAND_GOODBYE"), d.goodbye),
    )
