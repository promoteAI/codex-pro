mod gateway;
mod proxy;

use std::sync::Arc;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Locate the gateway binary to spawn.
            let exe = tauri::process::current_binary(&app.env())
                .map_err(|e| e.to_string())?;
            let binary = gateway::resolve_binary(&exe)
                .ok_or("could not locate codex-pro-desktop-gateway.exe")?;

            // Shared supervision state, registered as Tauri state so the
            // window-close handler can signal shutdown on the same state the
            // supervisor thread watches.
            let state: Arc<gateway::SuperviseState> = Arc::new(gateway::SuperviseState::default());
            app.manage(state.clone());

            // Start the gateway and BLOCK until its proxy is actually listening
            // on 127.0.0.1:58124 before setup returns. Returning from setup is
            // what lets Tauri create the window; doing it after `start_proxy`
            // means the SPA's very first `/meta` and page-level requests all
            // land on a live proxy instead of racing a backend that is still
            // booting. `supervise` blocks until the gateway has written its
            // runtime endpoint (which can take ~20s on first run, e.g. when a
            // channel's network handshake times out), so the window appears a
            // few seconds later but never shows a static, data-less shell.
            //
            // `supervise` internally detaches its own supervisor thread for
            // restarts, so this call returns once the first gateway is healthy
            // and the proxy is bound. A startup failure (e.g. a missing gateway
            // binary) is surfaced as an Err so Tauri aborts rather than opening
            // an app with no backend.
            let binary_for_thread = binary.clone();
            let state_for_thread = state.clone();
            gateway::supervise(binary_for_thread, state_for_thread)
                .map_err(|e| e.to_string())?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Stop the gateway when the window closes.
                // signal_shutdown() kills the current child and tells the
                // supervisor thread to stop restarting.
                let state: tauri::State<std::sync::Arc<gateway::SuperviseState>> = window.state();
                state.signal_shutdown();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
