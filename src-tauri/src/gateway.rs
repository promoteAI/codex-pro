//! Spawn and manage the embedded PyInstaller gateway process.
//!
//! The desktop Tauri shell owns the gateway lifecycle: it spawns the gateway
//! binary (Plan A product), waits until the gateway writes its runtime endpoint
//! file, then hands the child handle back to `lib.rs` so it can be terminated
//! on window close.

use std::io;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
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
pub(crate) struct RuntimeEndpoint {
    pub(crate) port: u16,
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
///
/// Calls `kill()` and then `wait()` to reap the child. Safe to call multiple
/// times (subsequent calls are no-ops).
#[allow(dead_code)]
pub fn shutdown(mut child: Child) {
    let _ = child.kill();
    let _ = child.wait();
}

/// Exponential backoff for gateway restart attempts, capped at 30 seconds.
///
/// Attempts 0..=4 map to 2^0..=2^4 seconds (1, 2, 4, 8, 16).
/// Attempts >= 5 stay at the 30 s cap.
pub fn backoff(attempt: u32) -> Duration {
    let secs = 2u64.saturating_pow(attempt.min(5));
    Duration::from_secs(secs.min(30))
}

/// Shared state between the supervisor thread and the Tauri app.
///
/// `child` holds the currently-running gateway child (updated atomically by
/// the supervisor). `shutdown` is set by the app when closing; the supervisor
/// uses it to stop restarting and tear down the current child gracefully.
#[derive(Default)]
pub struct SuperviseState {
    /// Live child handle, None when no gateway is running.
    pub child: Arc<Mutex<Option<Child>>>,
    /// Set to true to signal the supervisor to stop restarting.
    pub shutdown: Arc<AtomicBool>,
}

impl SuperviseState {
    /// Signal the supervisor to stop and kill the current child if running.
    ///
    /// This is the graceful shutdown path called from the window-close
    /// handler and from the Tauri exit hook.
    pub fn signal_shutdown(&self) {
        self.shutdown.store(true, Ordering::SeqCst);
        match self.child.lock() {
            Ok(mut g) => {
                if let Some(ref mut c) = *g {
                    let _ = c.kill();
                }
            }
            Err(poisoned) => {
                // If the lock was poisoned (supervisor thread panicked),
                // recover the guard so we can still attempt to kill the child.
                let mut g = poisoned.into_inner();
                if let Some(ref mut c) = *g {
                    let _ = c.kill();
                }
            }
        }
    }
}

/// Spawn the gateway and supervise it: on unexpected exit, restart with
/// exponential backoff until `state.shutdown` is set.
///
/// **Blocking semantics**: this function blocks the calling (setup) thread
/// until the first gateway process is alive and has written its endpoint file
/// (same guarantee as `spawn_and_wait`).  A background supervisor thread is
/// then started and immediately returns control to the caller.
///
/// Returns the `SuperviseState` — the caller stores it in Tauri state and
/// uses it to signal shutdown from the window close handler / exit hook.
pub fn supervise(binary: PathBuf) -> Arc<SuperviseState> {
    let state = Arc::new(SuperviseState::default());

    // Block on first successful spawn.
    let (first_child, _first_port) = match spawn_and_wait(&binary) {
        Ok(pair) => pair,
        Err(e) => {
            panic!("gateway failed to start during supervise: {e}");
        }
    };

    // Install the first child into shared state before launching the supervisor.
    {
        let mut g = state.child.lock().unwrap();
        *g = Some(first_child);
    }

    // Detach the supervisor thread.  It will call spawn_and_wait again on
    // crash, updating state.child each time.
    let state_thread = state.clone();
    std::thread::spawn(move || {
        let mut attempt: u32 = 0;
        loop {
            // Check shutdown before each restart attempt.
            if state_thread.shutdown.load(Ordering::SeqCst) {
                break;
            }

            // Wait for the current child to exit (or be killed by shutdown).
            {
                let mut g = match state_thread.child.lock() {
                    Ok(g) => g,
                    Err(e) => {
                        eprintln!("supervisor: poisoned child lock during wait: {e}");
                        break;
                    }
                };
                match g.as_mut().map(|c| c.wait()) {
                    Some(_) => {}
                    None => break,
                }
            }

            // Clean up the dead child handle.
            let _ = state_thread.child.lock().map(|mut g| g.take());

            if state_thread.shutdown.load(Ordering::SeqCst) {
                eprintln!("supervisor: shutdown requested, stopping");
                break;
            }

            match spawn_and_wait(&binary) {
                Ok((mut child, _port)) => {
                    if state_thread.shutdown.load(Ordering::SeqCst) {
                        // Shutdown was requested while spawn_and_wait was running;
                        // tear down the just-spawned process and don't install it.
                        eprintln!("supervisor: shutdown during spawn, tearing down");
                        let _ = child.kill();
                        return;
                    }
                    let mut g = match state_thread.child.lock() {
                        Ok(g) => g,
                        Err(e) => {
                            eprintln!("supervisor: poisoned child lock on restart: {e}");
                            break;
                        }
                    };
                    *g = Some(child);
                    drop(g);
                    attempt = 0; // reset on successful restart
                }
                Err(e) => {
                    eprintln!(
                        "gateway spawn/wait failed ({e:?}), retrying in {:?}",
                        backoff(attempt)
                    );
                    std::thread::sleep(backoff(attempt));
                    attempt = attempt.saturating_add(1);
                }
            }
        }
        eprintln!("gateway supervisor stopped");
    });

    state
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
    fn resolve_binary_returns_correct_candidate_paths() {
        let repo_root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();

        // Bundled layout: app_exe next to the gateway artifact.
        let bundled_dir = PathBuf::from("/some/bundled/app");
        let app_exe = bundled_dir.join("codex-pro-desktop.exe");
        let found = resolve_binary(&app_exe);
        if let Some(p) = found {
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
            assert!(
                p.starts_with(repo_root),
                "resolved to {:?}, expected under {:?}",
                p,
                repo_root
            );
        }
    }

    #[test]
    fn backoff_bounds() {
        // Exponential growth: 2^0=1, 2^1=2, 2^2=4, 2^3=8, 2^4=16.
        assert_eq!(backoff(0), Duration::from_secs(1));
        assert_eq!(backoff(1), Duration::from_secs(2));
        assert_eq!(backoff(2), Duration::from_secs(4));
        assert_eq!(backoff(3), Duration::from_secs(8));
        assert_eq!(backoff(4), Duration::from_secs(16));
        // Cap at 30s for attempts >= 5.
        assert_eq!(backoff(5), Duration::from_secs(30));
        assert_eq!(backoff(10), Duration::from_secs(30));
        assert_eq!(backoff(100), Duration::from_secs(30));
    }
}
