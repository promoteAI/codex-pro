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

            // Kick off gateway supervision on a background thread so the window
            // is created immediately. `supervise` blocks until the gateway has
            // written its runtime endpoint (which can take ~20s on first run,
            // e.g. when a channel's network handshake times out), and only then
            // starts the proxy. Running it inline in `setup` would leave the
            // window blank for that whole time.
            //
            // We wrap in `catch_unwind` so that if `supervise` panics (e.g.
            // gateway exits unexpectedly during bootstrap), the panic is
            // contained to this thread and does NOT propagate to the main
            // thread — otherwise the entire Tauri app would abort.
            let binary_for_thread = binary.clone();
            let state_for_thread = state.clone();
            std::thread::spawn(move || {
                if let Err(e) = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    gateway::supervise(binary_for_thread, state_for_thread)
                })) {
                    eprintln!(
                        "gateway supervise panicked (gateway startup failed?): {:?}",
                        e
                    );
                }
            });

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
