"""Codex Pro Plugin System.

Public API for plugin authors and the agent core.
"""

from codex_pro.plugins.context import PluginContext
from codex_pro.plugins.errors import (
    PluginActivationError,
    PluginError,
    PluginLoadError,
    PluginManifestError,
)
from codex_pro.plugins.hooks import HookRegistry, HookResult, VALID_HOOKS
from codex_pro.plugins.manager import PluginManager
from codex_pro.plugins.manifest import PluginManifest, PluginProvides, PluginRecord

__all__ = [
    "PluginContext",
    "PluginManager",
    "PluginManifest",
    "PluginProvides",
    "PluginRecord",
    "HookRegistry",
    "HookResult",
    "VALID_HOOKS",
    "PluginError",
    "PluginLoadError",
    "PluginActivationError",
    "PluginManifestError",
]
