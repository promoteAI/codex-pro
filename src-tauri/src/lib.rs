/// Entry point for the desktop shell. Task 2 fills in the gateway spawn and
/// the HTTP/WebSocket proxy; for now this just opens the Tauri window which
/// loads the bundled web UI from `frontendDist` (../web/dist).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
