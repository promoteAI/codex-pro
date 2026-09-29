mod gateway;
mod proxy;

use std::net::SocketAddr;
use std::sync::Mutex;

use tauri::Manager;

/// Holds the gateway child handle so we can terminate it when the window closes.
pub struct GatewayGuard(pub Mutex<Option<std::process::Child>>);

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Locate the gateway binary to spawn.
            let exe = tauri::process::current_binary(&app.env())
                .map_err(|e| e.to_string())?;
            let binary = gateway::resolve_binary(&exe)
                .ok_or("could not locate codex-pro-desktop.exe")?;

            // Spawn the gateway and wait for the runtime endpoint file.
            let (child, gateway_port) =
                gateway::spawn_and_wait(&binary).map_err(|e| e.to_string())?;

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

            // Manage the child handle so we can shut it down on window close.
            app.manage(GatewayGuard(Mutex::new(Some(child))));
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Stop the gateway when the window closes.
                let guard: tauri::State<GatewayGuard> = window.state();
                // Extract the child, then drop the guard so the Mutex is released.
                let child = guard.0.lock().unwrap().take();
                // `guard` goes out of scope at the end of this block, releasing the lock.
                if let Some(child) = child {
                    gateway::shutdown(child);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
