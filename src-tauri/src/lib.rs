mod gateway;
mod proxy;

use std::net::SocketAddr;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Locate the gateway binary to spawn.
            let exe = tauri::process::current_binary(&app.env())
                .map_err(|e| e.to_string())?;
            let binary = gateway::resolve_binary(&exe)
                .ok_or("could not locate codex-pro-desktop-gateway.exe")?;

            // Start supervision: blocks until the first gateway is alive,
            // then returns a shared state handle for the background supervisor
            // thread (restarts on crash with backoff, stops on shutdown signal).
            let supervise_state = gateway::supervise(binary.clone());

            // Store the supervise state in Tauri state so the close handler
            // and the app exit hook can signal shutdown.
            app.manage(supervise_state.clone());

            // Read the gateway port from the endpoint file that supervise
            // already waited for during spawn_and_wait.
            let ws = gateway::desktop_workspace();
            let endpoint = ws.join(".codex-pro").join("gateway.json");
            let text = std::fs::read_to_string(&endpoint)
                .map_err(|e| format!("failed to read gateway endpoint: {e}"))?;
            let ep = serde_json::from_str::<gateway::RuntimeEndpoint>(&text)
                .map_err(|e| format!("failed to parse gateway endpoint: {e}"))?;
            let gateway_port = ep.port;

            // Start the axum proxy on a fixed localhost port.
            let proxy_addr: SocketAddr = "127.0.0.1:58124".parse().unwrap();
            let std_listener = std::net::TcpListener::bind(proxy_addr)
                .map_err(|e| format!("failed to bind proxy listener: {e}"))?;
            let listener = tokio::net::TcpListener::from_std(std_listener)
                .map_err(|e| format!("failed to create tokio listener: {e}"))?;
            let router = proxy::router(format!("http://127.0.0.1:{gateway_port}"));
            tauri::async_runtime::spawn(async move {
                let _ = axum::serve(listener, router).await;
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
