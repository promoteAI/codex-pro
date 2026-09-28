# packaging/desktop/codex_pro.spec
# PyInstaller spec for the Codex Pro desktop bundle.
#
# Bundles the Python runtime + gateway deps + the built web UI (web/dist)
# into one executable. The web UI is placed at codex_pro/_bundled/web so the
# gateway's _resolve_web_dir() can find it after unpacking to sys._MEIPASS.
from __future__ import annotations

import os
import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_all, collect_data_files, collect_submodules

ROOT = Path(os.environ.get("CODEX_PRO_ROOT", Path.cwd()))
WEB_DIST = ROOT / "web" / "dist"
PKG = ROOT / "codex_pro"

# Collect the vector-search stack. PyInstaller's static analysis misses the
# dynamic imports and data files these libraries use. This group is load-bearing
# (Codex Pro must retain vector retrieval), so a real collection failure is NOT
# silent: it aborts the build unless CODEX_PRO_DESKTOP_NO_VECTOR=1 opts out.
datas = []
binaries = []
hiddenimports = []

# CODEX_PRO_DESKTOP_NO_VECTOR opts out of the fail-loud vector check. Treat the
# value as "skip" only when it explicitly says so ("1" / "true" / "yes"), so
# "0" / "false" / empty STILL fail loudly. A lingering truthy value like "0"
# must not silently disable the load-bearing check.
def _no_vector_requested() -> bool:
    value = os.environ.get("CODEX_PRO_DESKTOP_NO_VECTOR", "").strip().lower()
    return value in ("1", "true", "yes")


NO_VECTOR = _no_vector_requested()


def _collect(pkg: str, *, on_error: str = "warn once", fail_on_empty: bool = False) -> None:
    """Collect one package; empty result (missing/uncollectable) raises when
    fail_on_empty is set, so a silently-empty builtin catch (collect_all returns
    [] for a missing package rather than raising) can't slip through."""
    d, b, h = collect_all(pkg, on_error=on_error)
    datas.extend(d)
    binaries.extend(b)
    hiddenimports.extend(h)
    if fail_on_empty and not (d or b or h):
        raise RuntimeError(
            f"collect_all('{pkg}') returned nothing — the package is missing or "
            f"not importable in the build environment; the bundle would lack it."
        )


# Vector stack: fail loudly. The binary is unusable without these.
#
# onnxruntime ships optional subpackages (onnxruntime.backend, onnxruntime.
# quantization) that `import onnx` — an optional extra that fastembed's
# inference path never needs and that is NOT installed in the build env. With
# the default `on_error="warn once"` those submodules are silently dropped,
# which is exactly the silent vector loss C2 must close. `on_error="raise"`
# surfaces the failure, and the filter below removes the optional-onnx subtrees
# (which are not part of the inference path) so a genuine corrupt / missing
# onnxruntime is what aborts the build, not a missing optional.
def _vector_filter(name: str) -> bool:
    for probe in ("onnxruntime.backend", "onnxruntime.quantization"):
        if name == probe or name.startswith(probe + "."):
            return False
    return True


def _collect_vector(pkg: str) -> None:
    d, b, h = collect_all(pkg, on_error="raise", filter_submodules=_vector_filter)
    datas.extend(d)
    binaries.extend(b)
    hiddenimports.extend(h)
    if not (d or b or h):
        raise RuntimeError(
            f"collect_all('{pkg}') returned nothing — the vector package is "
            f"missing or not importable; the desktop binary would lack vector "
            f"retrieval."
        )


for pkg in ("fastembed", "onnxruntime", "faiss"):
    try:
        _collect_vector(pkg)
    except Exception as exc:
        if NO_VECTOR:
            print(
                f"warning: {pkg} collection failed; CODEX_PRO_DESKTOP_NO_VECTOR is set, "
                f"skipping vector stack ({exc})",
                file=sys.stderr,
            )
        else:
            raise SystemExit(
                f"ERROR: failed to collect '{pkg}' for the vector stack; "
                f"the desktop binary would lack vector retrieval. Set "
                f"CODEX_PRO_DESKTOP_NO_VECTOR=1 to skip this check. Cause: {exc}"
            )

# numpy is a hard dependency of the embedding stack; collection failure is a
# real problem, but not fatal (numpy may still be reachable via other hooks).
try:
    _collect("numpy")
except Exception as exc:
    print(
        f"warning: numpy collection failed ({exc}); continuing — verify numpy "
        f"is bundled before shipping.",
        file=sys.stderr,
    )

# Optional LLM provider SDKs. These are optional extras, so a missing/collect-
# failure is tolerated exactly like the vector stack used to be.
for pkg in ("google.generativeai", "boto3", "openai", "anthropic"):
    try:
        _collect(pkg)
    except Exception:
        # Optional extra not installed or not collectable — Codex Pro degrades
        # gracefully when a provider SDK is absent (see models/providers/).
        pass

# Bundle the built SPA at codex_pro/_bundled/web.
if WEB_DIST.is_dir() and (WEB_DIST / "index.html").is_file():
    datas += [(str(WEB_DIST), "codex_pro/_bundled/web")]
else:
    raise SystemExit(
        "web/dist/index.html not found. Build the frontend first: "
        "cd web && pnpm install --frozen-lockfile && pnpm build"
    )

a = Analysis(
    [str(PKG / "_desktop_entry.py")],
    pathex=[str(ROOT)],
    binaries=binaries,
    datas=datas,
    hiddenimports=[
        "codex_pro._desktop_entry",
        "codex_pro.app",
        "codex_pro.gateway.server",
        "codex_pro.config.schema",
        "codex_pro.cli.workspace",
        "codex_pro.runtime_paths",
        # Provider submodules are loaded by string via importlib in
        # codex_pro.models.providers.__init__ (factory), so PyInstaller's static
        # analysis cannot see them without being listed here. Include the
        # OpenAI-compatible/anthropic ones too as a safety net.
        "codex_pro.models.providers.gemini_provider",
        "codex_pro.models.providers.openrouter_provider",
        "codex_pro.models.providers.bedrock_provider",
        "codex_pro.models.providers.openai_provider",
        "codex_pro.models.providers.anthropic_provider",
    ]
    + hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "test", "unittest"],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="codex-pro-desktop",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,  # Desktop shell spawns this; keep console for logs in dev.
    disable_windowed_traceback=False,
)
