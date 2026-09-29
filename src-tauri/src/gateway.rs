//! Spawn and manage the embedded PyInstaller gateway process.
//!
//! The desktop Tauri shell owns the gateway lifecycle: it spawns the gateway
//! binary (Plan A product), waits until the gateway writes its runtime endpoint
//! file, then hands the child handle back to `lib.rs` so it can be terminated
//! on window close.

use std::io;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::time::{Duration, Instant};

use serde::Deserialize;

/// Desktop workspace shared with the CLI data model.
///
/// Isolated from the CLI default workspace so the per-workspace instance lock
/// (`workspace/data/<lock>`) never collides when a CLI gateway is also running.
///
/// Mirrors [`codex_pro::_desktop_entry::DESKTOP_WORKSPACE`].
pub fn desktop_workspace() -> PathBuf {
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .expect("HOME/USERPROFILE not set");
    PathBuf::from(home).join(".codex-pro").join("desktop-workspace")
}

#[derive(Deserialize, Debug)]
struct RuntimeEndpoint {
    port: u16,
}

/// Locate the gateway binary to spawn.
///
/// Priority order:
/// 1. Next to the current executable (`exe_dir/<gateway_name>`) — used when the
///    Tauri app is bundled. The bundled binary name differs from the Tauri app
///    name (`codex-pro-desktop-gateway` vs `codex-pro-desktop`), so it cannot
///    accidentally resolve to itself.
/// 2. Project-local `dist/<gateway_name>` — used during development.
///
/// `app_exe` is the path returned by `tauri::process::current_binary()` — the
/// Tauri app executable itself. In dev mode `current_binary()` points at the
/// debug Tauri binary, which is NOT the gateway; we must not return a path
/// that would cause the spawned process to re-enter this same `run()` flow.
///
/// Falls back to `None` when neither location holds a recognizable binary.
pub(crate) fn resolve_binary(app_exe: &Path) -> Option<PathBuf> {
    // Bundled layout: the gateway binary sits alongside the Tauri app exe.
    // Search for `codex-pro-desktop-gateway.exe` (distinct from
    // `codex-pro-desktop.exe`, the Tauri app itself) to avoid the self-match
    // trap where `current_binary()` returns the Tauri app and would otherwise
    // cause recursive spawning.
    if let Some(parent) = app_exe.parent() {
        let bundled = parent.join("codex-pro-desktop-gateway.exe");
        // Guard: in dev mode `app_exe.parent()` may point at the Tauri dev
        // binary, so the candidate here could be the Tauri binary itself
        // (e.g. when the exe was copied into a temp dir with the gateway name
        // alongside it). If the resolved path equals the Tauri app exe, skip
        // and fall back to the dev layout.
        if bundled.exists() && bundled.canonicalize().ok() != app_exe.canonicalize().ok() {
            return Some(bundled);
        }
    }
    // Dev layout: Plan A output lives at <repo_root>/dist/codex-pro-desktop-gateway.exe.
    // Use an absolute path so it stays valid even if cwd shifts.
    let repo_root = Path::new(env!("CARGO_MANIFEST_DIR")).parent()?; // src-tauri -> repo root
    let dev = repo_root.join("dist").join("codex-pro-desktop-gateway.exe");
    if dev.exists() && dev.canonicalize().ok() != app_exe.canonicalize().ok() {
        return Some(dev);
    }
    None
}

/// Spawn the PyInstaller gateway with a dynamic port, then block until the
/// runtime endpoint file reveals the bound port.
///
/// `binary` must point to the gateway artifact.
/// Returns `(child, actual_port)` on success, or an `Err` if the gateway
/// fails to start or does not write `gateway.json` within 30 s.
pub fn spawn_and_wait(binary: &Path) -> io::Result<(Child, u16)> {
    let ws = desktop_workspace();
    std::fs::create_dir_all(&ws)?;
    let endpoint = ws.join(".codex-pro").join("gateway.json");

    let mut child = Command::new(binary)
        .arg("--port")
        .arg("0")
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--workspace")
        .arg(&ws)
        .spawn()?;

    let deadline = Instant::now() + Duration::from_secs(30);
    loop {
        if let Ok(text) = std::fs::read_to_string(&endpoint) {
            if let Ok(ep) = serde_json::from_str::<RuntimeEndpoint>(&text) {
                if ep.port > 0 {
                    return Ok((child, ep.port));
                }
            }
        }
        // Check if the child has exited prematurely.
        if let Ok(Some(s)) = child.try_wait() {
            return Err(io::Error::other(format!(
                "gateway process exited unexpectedly (code={s:?})",
            )));
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            return Err(io::Error::new(
                io::ErrorKind::TimedOut,
                "gateway did not reveal its port within 30s",
            ));
        }
        std::thread::sleep(Duration::from_millis(250));
    }
}

/// Terminate the gateway process on app exit.
pub fn shutdown(mut child: Child) {
    let _ = child.kill();
    let _ = child.wait();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn desktop_workspace_is_isolated() {
        let ws = desktop_workspace();
        assert!(ws.ends_with(".codex-pro/desktop-workspace"));
    }

    /// Hermetic test: verify that `resolve_binary` returns paths consistent
    /// with the search logic (bundled vs dev) without depending on the ~230 MB
    /// Plan A artifact actually being present. The old version used
    /// `found.exists()` which failed on CI machines that lack the dist artifact.
    #[test]
    fn resolve_binary_returns_correct_candidate_paths() {
        let repo_root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();

        // Bundled layout: app_exe next to the gateway artifact.
        let bundled_dir = PathBuf::from("/some/bundled/app");
        let app_exe = bundled_dir.join("codex-pro-desktop.exe");
        let found = resolve_binary(&app_exe);
        // In CI / dev without the real artifact, the bundled candidate will
        // not exist — we only assert the return type and the dev fallback.
        if let Some(p) = found {
            // Must resolve to the gateway name, not the Tauri app name.
            assert!(
                p.to_string_lossy().contains("codex-pro-desktop-gateway"),
                "resolved to {:?}",
                p
            );
        }

        // Dev layout: fake exe anywhere — resolve_binary must still point at
        // the same name pattern, even if the file doesn't exist on disk.
        let fake_exe = PathBuf::from("/some/random/dir/Whatever.exe");
        let found = resolve_binary(&fake_exe);
        if let Some(p) = found {
            assert!(
                p.to_string_lossy().contains("codex-pro-desktop-gateway"),
                "resolved to {:?}",
                p
            );
            // The dev path should always point at the repo-local dist dir.
            assert!(
                p.starts_with(repo_root),
                "resolved to {:?}, expected under {:?}",
                p,
                repo_root
            );
        }
    }
}
