//! Spawn and manage the embedded PyInstaller gateway process.
//!
//! The desktop Tauri shell owns the gateway lifecycle: it spawns the gateway
//! binary (Plan A product), waits until the gateway writes its runtime endpoint
//! file, then hands the child handle back to `lib.rs` so it can be terminated
//! on window close.

use std::io;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Deserialize;

/// The fixed localhost port the frontend uses to reach the proxy.
///
/// The Rust proxy always listens here and forwards to the gateway's *dynamic*
/// port. Keeping it constant lets the SPA target one origin regardless of how
/// the gateway's port changes across restarts.
pub const PROXY_PORT: u16 = 58124;

/// How long `supervise` waits for the proxy to actually accept connections on
/// `PROXY_PORT` before declaring startup complete. The gateway can take ~20s on
/// first run, so this is a generous bound for the proxy bind + first serve.
pub const PROXY_READY_TIMEOUT: Duration = Duration::from_secs(30);

/// Desktop workspace shared with the CLI data model.
///
/// The desktop gateway uses the same ``~/.codex-pro`` workspace as the CLI so
/// sessions, config and memory are shared between the shell and the CLI. The
/// single-instance lock is bypassed on the Python side (see
/// ``codex_pro/_desktop_entry.py``), so the desktop gateway can coexist with a
/// running CLI gateway on the same workspace.
///
/// Mirrors [`codex_pro::_desktop_entry::DESKTOP_WORKSPACE`].
pub fn desktop_workspace() -> PathBuf {
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .expect("HOME/USERPROFILE not set");
    PathBuf::from(home).join(".codex-pro")
}

#[derive(Deserialize, Debug)]
pub(crate) struct RuntimeEndpoint {
    pub(crate) port: u16,
}

/// Try `base` and `base.exe` in `dir`, returning the first that exists and is
/// not the Tauri app executable itself.
///
/// Tauri's sidecar bundling strips the target-triple suffix and only appends
/// `.exe` on Windows, so the gateway may be next to the app exe either as
/// `codex-pro-desktop-gateway` (macOS/Linux) or `codex-pro-desktop-gateway.exe`
/// (Windows). `resolve_binary` therefore probes both spellings on every
/// platform; this helper keeps that logic in one place.
fn find_candidate(dir: &Path, base: &str, app_exe: &Path) -> Option<PathBuf> {
    let app_canonical = app_exe.canonicalize().ok();
    for name in [base.to_string(), format!("{base}.exe")] {
        let candidate = dir.join(&name);
        // Guard: in dev mode `dir` may point at the Tauri dev binary's folder,
        // so a candidate here could be the Tauri binary itself (e.g. when the
        // exe was copied into a temp dir with the gateway name alongside it).
        // If the resolved path equals the Tauri app exe, skip that spelling.
        if candidate.exists() && candidate.canonicalize().ok() != app_canonical {
            return Some(candidate);
        }
    }
    None
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
/// The gateway is probed both with and without a `.exe` suffix, because Tauri's
/// `externalBin`/sidecar bundling only appends `.exe` on Windows; on macOS and
/// Linux the sidecar is extensionless (`codex-pro-desktop-gateway`). Both
/// bundled and dev layouts are searched for both spellings.
///
/// Falls back to `None` when neither location holds a recognizable binary.
pub(crate) fn resolve_binary(app_exe: &Path) -> Option<PathBuf> {
    const GATEWAY: &str = "codex-pro-desktop-gateway";
    // Bundled layout: the gateway binary sits alongside the Tauri app exe.
    if let Some(parent) = app_exe.parent() {
        if let Some(found) = find_candidate(parent, GATEWAY, app_exe) {
            return Some(found);
        }
    }
    // Dev layout: Plan A output lives at <repo_root>/dist/codex-pro-desktop-gateway(.exe).
    // Use an absolute path so it stays valid even if cwd shifts.
    let repo_root = Path::new(env!("CARGO_MANIFEST_DIR")).parent()?; // src-tauri -> repo root
    find_candidate(&repo_root.join("dist"), GATEWAY, app_exe)
}

/// Spawn the PyInstaller gateway with a dynamic port, then block until the
/// runtime endpoint file reveals the bound port.
///
/// `binary` must point to the gateway artifact.
/// Returns `(child, actual_port)` on success, or an `Err` if the gateway
/// fails to start or does not write `gateway.json` within 300 s.
pub fn spawn_and_wait(binary: &Path) -> io::Result<(Child, u16)> {
    let ws = desktop_workspace();
    std::fs::create_dir_all(&ws)?;
    let endpoint = ws.join(".codex-pro").join("gateway.json");

    // Remove any stale endpoint file from a previous run before spawning. If
    // left behind, `spawn_and_wait` would read the old port and return
    // immediately, and the proxy would forward to a dead gateway. The fresh
    // gateway rewrites this file after it binds its dynamic port.
    let _ = std::fs::remove_file(&endpoint);

    // Run the gateway as a background process. We deliberately redirect stdin
    // to null so the gateway does NOT inherit the Tauri app's console.
    // Without this, the gateway receives console control events (close, Ctrl-C)
    // from the desktop shell and treats them as a shutdown request, terminating
    // before it ever writes gateway.json. stdout/stderr are likewise nulled so
    // the gateway's log output cannot leak into (or hold open) the shell's
    // console.
    //
    // The CLI channel already disables itself when stdin is not a TTY
    // (`not sys.stdin.isatty()` in cli.py), so this is safe — no interactive
    // input functionality is lost in desktop mode.
    let mut command = Command::new(binary);
    command
        .arg("--port")
        .arg("0")
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--workspace")
        .arg(&ws)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        // Mark this as a desktop-supervised gateway. The Python side sets the
        // same marker in _desktop_entry.py; primarily the CLI channel reads it
        // to disable interactive stdin on hosts where isatty() wrongly reports
        // True under PyInstaller onefile + Tauri.
        .env("_CODEX_PRO_DESKTOP", "1");
    // On Windows, spawn the gateway without a console window. The PyInstaller
    // gateway is a console subsystem binary, so without this flag its startup
    // flashes a separate `cmd`/console window alongside the Tauri app. We still
    // redirect stdin/stdout/stderr to null elsewhere, so no console output is
    // lost — this only suppresses the visible window.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = command.spawn()?;

    let deadline = Instant::now() + Duration::from_secs(300);
    loop {
        if let Ok(text) = std::fs::read_to_string(&endpoint) {
            if let Ok(ep) = serde_json::from_str::<RuntimeEndpoint>(&text) {
                if ep.port > 0 && port_is_listening(ep.port) {
                    // Only accept the endpoint once its port actually accepts
                    // connections. A stale gateway.json (left by a killed prior
                    // run) or a transient early write can expose a port that is
                    // already dead; trusting it would point the proxy at a
                    // gateway that never answers. Confirming a live listener
                    // makes the returned port authoritative.
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
                "gateway did not reveal its port within 300s",
            ));
        }
        std::thread::sleep(Duration::from_millis(250));
    }
}

/// Return whether a TCP listener is currently accepting connections on
/// `127.0.0.1:port`.
///
/// Used to validate a port read from `gateway.json` before it is trusted: a
/// stale or transient entry can name a port that is already closed, and the
/// proxy must not be pointed at it.
fn port_is_listening(port: u16) -> bool {
    use std::net::{SocketAddr, TcpStream};
    let addr: SocketAddr = format!("127.0.0.1:{port}").parse().unwrap();
    TcpStream::connect_timeout(&addr, Duration::from_millis(500)).is_ok()
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
    /// The proxy's current gateway target, e.g. `http://127.0.0.1:51257`.
    ///
    /// The supervisor thread rewrites this after every gateway restart so the
    /// axum router keeps forwarding to the live port. Wrapped in a Mutex because
    /// the router reads it on every request while the supervisor updates it on
    /// restart.
    pub proxy_target: Arc<Mutex<String>>,
}

impl SuperviseState {
    /// Rewrite the proxy's gateway target after a restart.
    ///
    /// The gateway binds a fresh dynamic port each run, so the proxy must stop
    /// forwarding to the old (now dead) port and aim at the new one.
    fn set_proxy_target(&self, gateway_port: u16) {
        let target = format!("http://127.0.0.1:{gateway_port}");
        match self.proxy_target.lock() {
            Ok(mut g) => *g = target,
            Err(poisoned) => *poisoned.into_inner() = target,
        }
    }

    /// Kill whichever child is currently held in `state.child`, if any.
    ///
    /// Tolerates a poisoned lock (recovering the guard via `into_inner()`) so
    /// the kill attempt is never silently skipped, matching `signal_shutdown`.
    fn kill_current_child(&self) {
        match self.child.lock() {
            Ok(mut g) => {
                if let Some(ref mut c) = *g {
                    let _ = c.kill();
                }
            }
            Err(poisoned) => {
                let mut g = poisoned.into_inner();
                if let Some(ref mut c) = *g {
                    let _ = c.kill();
                }
            }
        }
    }

    /// Signal the supervisor to stop and kill the current child if running.
    ///
    /// This is the graceful shutdown path called from the window-close
    /// handler and from the Tauri exit hook.
    pub fn signal_shutdown(&self) {
        self.shutdown.store(true, Ordering::SeqCst);
        self.kill_current_child();
    }
}

/// Start the axum HTTP/WS proxy that relays frontend requests to the gateway.
///
/// `gateway_port` is the dynamic port the gateway bound (read from
/// `gateway.json`). The proxy listens on a fixed localhost port (`PROXY_PORT`)
/// and forwards `/api`, `/ws` and `/meta` to the gateway.
///
/// This must be called from a context with a Tokio runtime available (the
/// spawned future converts the std listener with `TcpListener::from_std`,
/// which panics outside a runtime). We bind the std listener on the calling
/// thread (no runtime needed) and convert + serve inside the async task.
///
/// The listener is created with `SO_REUSEADDR` so a TIME_WAIT socket left by a
/// prior run (or a crashed proxy) does not make rebinding `PROXY_PORT` fail
/// with `WSAEADDRINUSE` / `EADDRINUSE`.
///
/// Returns the shared gateway-target string the supervisor thread rewrites on a
/// gateway restart — the axum router reads it per request, so the proxy always
/// forwards to the *current* gateway port. On bind failure it returns `Err` so
/// the caller can abort startup instead of opening a window with no backend.
pub fn start_proxy(gateway_port: u16) -> io::Result<Arc<Mutex<String>>> {
    let proxy_addr: SocketAddr = format!("127.0.0.1:{PROXY_PORT}").parse().unwrap();

    let socket = socket2::Socket::new(
        socket2::Domain::IPV4,
        socket2::Type::STREAM,
        Some(socket2::Protocol::TCP),
    )
    .map_err(|e| {
        io::Error::new(
            e.kind(),
            format!("failed to create proxy socket on {proxy_addr}: {e}"),
        )
    })?;
    socket.set_reuse_address(true).map_err(|e| {
        io::Error::new(
            e.kind(),
            format!("failed to set SO_REUSEADDR on proxy socket {proxy_addr}: {e}"),
        )
    })?;
    socket
        .bind(&proxy_addr.into())
        .map_err(|e| io::Error::new(e.kind(), format!("failed to bind proxy listener on {proxy_addr}: {e}")))?;
    // socket2::Socket::bind only binds the address; unlike
    // std::net::TcpListener::bind it does NOT start accepting connections. Call
    // listen() explicitly so the socket actually accepts — otherwise the ready
    // probe (a connect) is refused and the proxy is unusable.
    socket
        .listen(1024)
        .map_err(|e| io::Error::new(e.kind(), format!("failed to listen on proxy socket {proxy_addr}: {e}")))?;
    // The std listener must be non-blocking before it is handed to the tokio
    // runtime; converting a blocking listener panics.
    socket
        .set_nonblocking(true)
        .map_err(|e| io::Error::new(e.kind(), format!("failed to set proxy listener nonblocking: {e}")))?;
    let std_listener: std::net::TcpListener = socket.into();
    eprintln!("[start_proxy] proxy on 127.0.0.1:{PROXY_PORT} -> gateway 127.0.0.1:{gateway_port}");

    let proxy_target = router_target_handle(gateway_port);
    let router = crate::proxy::router(proxy_target.clone());
    tauri::async_runtime::spawn(async move {
        match tokio::net::TcpListener::from_std(std_listener) {
            Ok(listener) => {
                let _ = axum::serve(listener, router).await;
            }
            Err(e) => {
                eprintln!("failed to create tokio listener for proxy: {e}");
            }
        }
    });

    Ok(proxy_target)
}

/// Build the shared gateway-target handle the proxy router reads per request.
///
/// The proxy must keep forwarding to the gateway's *current* port: the gateway
/// rebinds a new dynamic port on every restart, so the supervisor thread
/// rewrites this value via [`SuperviseState::proxy_target`]. Returns a fresh
/// handle each call so the router and the supervisor share the same Mutex.
pub fn router_target_handle(gateway_port: u16) -> Arc<Mutex<String>> {
    Arc::new(Mutex::new(format!("http://127.0.0.1:{gateway_port}")))
}

/// Poll until `port` on loopback accepts a connection, or `timeout` elapses.
///
/// Used by `supervise` to honour its "the window is only created once the proxy
/// actually answers" contract: `start_proxy` binds the socket synchronously but
/// the axum serve runs on a runtime task, so the listener may not accept yet
/// when `start_proxy` returns.
fn wait_until_listening(port: u16, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    loop {
        if port_is_listening(port) {
            return true;
        }
        if Instant::now() >= deadline {
            return false;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

/// Spawn the gateway and supervise it: on unexpected exit, restart with
/// exponential backoff until `state.shutdown` is set.
///
/// **Blocking semantics**: this function blocks the calling (setup) thread
/// until the first gateway process is alive and has written its endpoint file
/// (same guarantee as `spawn_and_wait`).  A background supervisor thread is
/// then started and immediately returns control to the caller. Once the
/// gateway is ready, `start_proxy` is called so the frontend can reach it.
///
/// `state` is the caller-provided shared state (created by the app so it can
/// be registered with `app.manage`) — it is installed here so the window-close
/// handler can signal shutdown on the same state the supervisor watches.
///
/// Returns `Err` if the gateway cannot be brought up on the first attempt
/// (typically a missing/misconfigured binary). The caller decides whether a
/// failure to start the backend should abort application startup.
pub fn supervise(binary: PathBuf, state: Arc<SuperviseState>) -> io::Result<Arc<SuperviseState>> {
    // Block on first successful spawn.
    let (first_child, first_port) = spawn_and_wait(&binary).map_err(|e| {
        io::Error::new(e.kind(), format!("gateway failed to start during supervise: {e}"))
    })?;

    // Install the first child into shared state before launching the supervisor.
    {
        let mut g = state.child.lock().unwrap();
        *g = Some(first_child);
    }

    // Start the proxy so the frontend can reach it. Propagate a bind failure so
    // the app aborts startup instead of opening a window with no backend.
    let proxy_target = start_proxy(first_port)?;
    {
        let mut g = state.proxy_target.lock().unwrap();
        *g = (*proxy_target).lock().unwrap().clone();
    }

    // Honour the "window is only created once the proxy actually answers"
    // contract: the socket is bound synchronously, but the axum serve runs on a
    // runtime task, so wait until it really accepts before returning.
    if !wait_until_listening(PROXY_PORT, PROXY_READY_TIMEOUT) {
        return Err(io::Error::new(
            io::ErrorKind::TimedOut,
            format!("proxy did not begin accepting on 127.0.0.1:{PROXY_PORT} within {PROXY_READY_TIMEOUT:?}"),
        ));
    }

    // Detach the supervisor thread.  It will call spawn_and_wait again on
    // crash, updating state.child each time.
    let state_thread = state.clone();
    std::thread::spawn(move || {
        let mut attempt: u32 = 0;
        loop {
            // Check shutdown before each restart attempt.
            if state_thread.shutdown.load(Ordering::SeqCst) {
                // Tear down whatever child is currently held before exiting so
                // no gateway is left running as an orphan (TOCTOU guard).
                state_thread.kill_current_child();
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
                state_thread.kill_current_child();
                break;
            }

            match spawn_and_wait(&binary) {
                Ok((mut child, port)) => {
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
                    // The gateway bound a fresh dynamic port — point the proxy at
                    // it so the frontend keeps working after a restart.
                    state_thread.set_proxy_target(port);
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

    Ok(state)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn desktop_workspace_is_shared_with_cli() {
        let ws = desktop_workspace();
        assert!(ws.ends_with(".codex-pro"));
        assert!(!ws.to_string_lossy().contains("desktop-workspace"));
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
    fn find_candidate_matches_with_and_without_exe_suffix() {
        let dir = std::env::temp_dir().join(format!("gateway-sidecar-test-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let base = "codex-pro-desktop-gateway";
        let app_exe = dir.join("codex-pro-desktop");

        // Extensionless sidecar (macOS/Linux bundled layout).
        let extless = dir.join(base);
        std::fs::write(&extless, b"gateway").unwrap();
        let found = find_candidate(&dir, base, &app_exe);
        assert_eq!(found, Some(extless.clone()));

        // Remove the extensionless spelling, leave only the .exe spelling
        // (Windows bundled layout) — it must resolve too.
        std::fs::remove_file(&extless).unwrap();
        let exe_name = dir.join(format!("{base}.exe"));
        std::fs::write(&exe_name, b"gateway").unwrap();
        let found = find_candidate(&dir, base, &app_exe);
        assert_eq!(found, Some(exe_name));

        // A candidate equal to the Tauri app exe must be skipped (self-match trap).
        let self_exe = dir.join(format!("{base}.exe"));
        let app_exe_same = self_exe.clone();
        let found = find_candidate(&dir, base, &app_exe_same);
        assert!(found.is_none() || found != Some(self_exe.clone()));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn resolve_binary_finds_dev_artifact_without_exe_suffix() {
        // Dev layout: an extensionless dist artifact should resolve, matching the
        // macOS/Linux sidecar naming.
        let repo_root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let fake_exe = PathBuf::from("/some/random/dir/Whatever.exe");
        let found = resolve_binary(&fake_exe);
        if let Some(p) = found {
            assert!(p.to_string_lossy().contains("codex-pro-desktop-gateway"));
            assert!(p.starts_with(repo_root));
        }
    }

    #[test]
    fn port_is_listening_rejects_closed_port() {
        // Reserve a port by binding it, then drop the listener so it is closed.
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        // After the listener is dropped the port is closed — the connect must fail.
        assert!(!port_is_listening(port));
    }

    #[test]
    fn port_is_listening_accepts_live_port() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        assert!(port_is_listening(port));
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
