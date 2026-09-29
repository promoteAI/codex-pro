//! Spawn and manage the embedded PyInstaller gateway process.
//!
//! The desktop Tauri shell owns the gateway lifecycle: it spawns the
//! `codex-pro-desktop.exe` binary (Plan A product), waits until the gateway
//! writes its runtime endpoint file, then hands the child handle back to
//! `lib.rs` so it can be terminated on window close.

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
/// 1. Next to the current executable (`exe_dir/codex-pro-desktop.exe`) —
///    used when the Tauri app is bundled.
/// 2. Project-local `dist/codex-pro-desktop.exe` — used during development.
///
/// Falls back to `None` when neither location holds a recognizable binary.
pub(crate) fn resolve_binary(app_exe: &Path) -> Option<PathBuf> {
    // Bundled layout: the PyInstaller binary sits alongside the Tauri app exe.
    if let Some(parent) = app_exe.parent() {
        let bundled = parent.join("codex-pro-desktop.exe");
        if bundled.exists() {
            return Some(bundled);
        }
    }
    // Dev layout: Plan A output lives at <repo_root>/dist/codex-pro-desktop.exe.
    // Use an absolute path so it stays valid even if cwd shifts.
    let repo_root = Path::new(env!("CARGO_MANIFEST_DIR")).parent()?; // src-tauri -> repo root
    let dev = repo_root.join("dist").join("codex-pro-desktop.exe");
    if dev.exists() {
        return Some(dev);
    }
    None
}

/// Spawn the PyInstaller gateway with a dynamic port, then block until the
/// runtime endpoint file reveals the bound port.
///
/// `binary` must point to the `codex-pro-desktop.exe` Plan A artifact.
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
        if let Ok(status) = child.try_wait() {
            if let Some(s) = status {
                return Err(io::Error::new(
                    io::ErrorKind::Other,
                    format!("gateway process exited unexpectedly (code={s:?})"),
                ));
            }
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

    #[test]
    fn resolve_binary_finds_dev_artifact() {
        // In the dev layout the binary lives at <repo_root>/dist/codex-pro-desktop.exe.
        let fake_exe = PathBuf::from("/some/app/CodexPro.exe");
        let found = resolve_binary(&fake_exe)
            .expect("should find the dev-mode binary");
        assert!(found.exists());
    }
}
