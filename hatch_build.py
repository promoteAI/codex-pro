"""Build hooks for the codex-pro package.

The Codex Pro web UI lives in ``web/dist/`` (gitignored build artifact).
It must end up at ``codex_pro/_bundled/web`` inside the wheel that
users install from PyPI. We make that include *conditional* and *robust
across all build paths*:

- ``pip install -e .`` works in environments where the frontend has not
  been built yet (CI runners, fresh clones) — the hook silently skips.
- ``hatch build`` (used by ``scripts/publish.sh``) still bundles the
  dashboard because the hook sees the freshly-built ``web/dist``.
- ``python -m build`` and downstream ``pip install codex-pro.tar.gz``
  (sdist → wheel rebuild) also work, because the sdist target re-runs
  the same hook against its extracted copy of ``web/dist``.

The hook runs for both wheel and sdist targets. For the wheel target it
injects a ``force_include``. For the sdist target it injects an artifact
so the web UI survives the sdist round-trip; the wheel hook then
re-activates the ``force_include`` when the sdist is later rebuilt.

Missing assets are only tolerated where a web UI genuinely cannot be
expected. A *distributable* wheel or sdist with no web UI is a broken
release, so those builds fail loudly instead of quietly shipping a
web-UI-less package to PyPI.
"""
from __future__ import annotations

import os
from pathlib import Path

from hatchling.builders.hooks.plugin.interface import BuildHookInterface


class WebAssetsHook(BuildHookInterface):
    """Bundle the built Codex Pro web UI at every stage of the build pipeline."""

    PLUGIN_NAME = "web"

    def initialize(self, version, build_data):
        web_src = Path(self.root) / "web" / "dist"
        if not web_src.is_dir() or not (web_src / "index.html").is_file():
            self._handle_missing_web(version)
            return

        # The hook runs for every target (wheel, sdist, editable wheel).
        # For the wheel target we route the SPA to its runtime path inside
        # the package; for the sdist target we use the same mapping so that
        # a downstream wheel rebuild (e.g. ``python -m build`` or a user
        # ``pip install`` of the sdist) can still locate the artifact.
        if self.target_name in ("wheel", "sdist"):
            build_data.setdefault("force_include", {})[str(web_src)] = (
                "codex_pro/_bundled/web"
            )

    def _handle_missing_web(self, version) -> None:
        """Skip or fail, depending on whether this build is distributable.

        Two build paths legitimately have no ``web/dist``:

        - ``pip install -e .`` (``version == "editable"``): a development
          checkout serves the dashboard from ``web/dist`` at runtime, so
          nothing needs bundling and the frontend may not be built yet.
        - a wheel rebuilt from an *extracted sdist*: the sdist already
          carries the SPA at ``codex_pro/_bundled/web`` (that is
          where this hook put it), and does not ship ``web/`` at all, so
          the assets are present even though ``web/dist`` is not.

        Anything else is a real release built without the frontend.
        """
        if version == "editable":
            return

        prebundled = Path(self.root) / "codex_pro" / "_bundled" / "web"
        if (prebundled / "index.html").is_file():
            return  # rebuilt from an sdist that already carries the SPA

        if os.environ.get("CODEX_PRO_ALLOW_NO_WEB") == "1":
            # Escape hatch for `pip install .` from a checkout where the
            # frontend was deliberately not built. The resulting package has
            # no web UI; never use it for a release.
            return

        raise RuntimeError(
            "Web UI assets are missing: neither web/dist/index.html nor "
            "codex_pro/_bundled/web/index.html exists, so this "
            f"{self.target_name} would ship without the web UI. Build the "
            "frontend first:\n"
            "    cd web && pnpm install --frozen-lockfile && pnpm build\n"
            "(scripts/publish.sh does this for you.)\n"
            "To build a package without the web UI on purpose, set "
            "CODEX_PRO_ALLOW_NO_WEB=1."
        )
