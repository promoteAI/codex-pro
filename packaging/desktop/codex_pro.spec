# packaging/desktop/codex_pro.spec
# PyInstaller spec for the Codex Pro desktop bundle.
#
# Bundles the Python runtime + gateway deps + the built web UI (web/dist)
# into one executable. The web UI is placed at codex_pro/_bundled/web so the
# gateway's _resolve_web_dir() can find it after unpacking to sys._MEIPASS.
from __future__ import annotations

import os
from pathlib import Path

from PyInstaller.utils.hooks import collect_all, collect_data_files, collect_submodules

ROOT = Path(os.environ.get("CODEX_PRO_ROOT", Path.cwd()))
WEB_DIST = ROOT / "web" / "dist"
PKG = ROOT / "codex_pro"

# Collect the vector-search stack. PyInstaller's static analysis misses the
# dynamic imports and data files these libraries use.
datas = []
binaries = []
hiddenimports = []

for pkg in ("fastembed", "onnxruntime", "faiss", "numpy"):
    try:
        d, b, h = collect_all(pkg)
        datas += d
        binaries += b
        hiddenimports += h
    except Exception:
        # A missing optional package is acceptable — Codex Pro degrades
        # gracefully when fastembed is absent (see memory/local_embed.py).
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
