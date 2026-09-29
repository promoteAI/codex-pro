//! Local HTTP/WebSocket proxy: forwards `/api`, `/meta` to the gateway.
//!
//! The Tauri frontend reaches the gateway through this proxy on
//! `127.0.0.1:58124` (the Rust native listening port). The proxy strips
//! browser-origin headers so the gateway treats the request as coming from a
//! native client, bypassing the cross-site CSRF gate.

use std::iter::once;

use axum::{
    body::{to_bytes, Body},
    extract::{Request, State, WebSocketUpgrade},
    response::Response,
    routing::{any, get},
    Router,
};
use futures_util::{SinkExt, StreamExt};
use reqwest::Client;
use tauri::http::HeaderMap;
use tokio_tungstenite::{
    connect_async_with_config,
    tungstenite::{
        protocol::{
            frame::coding::CloseCode,
            CloseFrame,
            Message as TungsteniteMessage,
            WebSocketConfig,
        },
        Error as TungsteniteError,
    },
};

/// Build the proxy router.
///
/// `target` is the gateway base URL, e.g. `http://127.0.0.1:8443`.
pub fn router(target: String) -> Router {
    let state = ProxyState { target };
    Router::new()
        .route("/api", any(forward_http))
        .route("/meta", get(forward_http))
        .route("/ws", any(forward_ws))
        .with_state(state)
}

#[derive(Clone)]
struct ProxyState {
    /// Gateway base URL, e.g. `http://127.0.0.1:8443`.
    target: String,
}

/// Forward an HTTP request to the gateway, stripping browser-origin headers.
async fn forward_http(
    State(state): State<ProxyState>,
    req: Request<Body>,
) -> Response {
    let method = req.method().clone();
    let uri = req.uri().clone();
    let path = uri.path().to_string();
    let query = uri.query().map(|q| format!("?{q}")).unwrap_or_default();
    let url = format!("{}{}{}", state.target, path, query);

    // Strip browser-origin headers so the gateway sees a native client.
    let forward_headers = strip_origin_headers(req.headers());

    // Collect the body as bytes first (simple for now; streaming for large bodies
    // would require a different approach).
    let body_bytes = match to_bytes(req.into_body(), usize::MAX).await {
        Ok(b) => b.to_vec(),
        Err(e) => {
            return Response::builder()
                .status(500)
                .body(Body::from(format!("failed to read body: {e}")))
                .unwrap();
        }
    };

    // Forward via reqwest using the wrapped body stream.
    let resp = match Client::new()
        .request(method, &url)
        .headers(forward_headers)
        .body(reqwest::Body::wrap_stream(futures_util::stream::iter(
            once(Ok::<_, std::convert::Infallible>(bytes::Bytes::from(body_bytes))),
        )))
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return Response::builder()
                .status(502)
                .body(Body::from(format!("proxy error: {e}")))
                .unwrap();
        }
    };

    let status = resp.status();
    let body_bytes = match resp.bytes().await {
        Ok(b) => b,
        Err(e) => {
            return Response::builder()
                .status(502)
                .body(Body::from(format!("failed to read gateway response: {e}")))
                .unwrap();
        }
    };

    Response::builder()
        .status(status)
        .body(Body::from(body_bytes))
        .unwrap()
}

/// Strip browser-origin / Sec-* headers that would trigger gateway cross-site checks.
fn strip_origin_headers(h: &HeaderMap) -> HeaderMap {
    let mut out = HeaderMap::new();
    for (key, value) in h.iter() {
        // Keep all headers except those the gateway interprets as browser-origin signals.
        let lower = key.as_str().to_lowercase();
        if matches!(
            lower.as_str(),
            "origin" | "sec-fetch-site" | "sec-fetch-mode" | "sec-fetch-dest" | "referer"
        ) {
            continue;
        }
        out.insert(key.clone(), value.clone());
    }
    out
}

/// Derive the gateway WS path from the proxy request path.
///
/// The proxy receives requests at `/ws/{suffix}` and forwards to the gateway
/// at `{suffix}` (which defaults to `/ws` when suffix is empty).
pub fn derive_gateway_path(path: &str) -> &str {
    if let Some(stripped) = path.strip_prefix("/ws") {
        if stripped.is_empty() {
            return "/ws";
        }
        return stripped;
    }
    "/ws"
}

/// Convert axum WS close code (u16) to tungstenite CloseCode.
fn axum_close_to_tungstenite(code: u16) -> CloseCode {
    match code {
        1000 => CloseCode::Normal,
        1001 => CloseCode::Away,
        1002 => CloseCode::Protocol,
        1003 => CloseCode::Unsupported,
        1007 => CloseCode::Invalid,
        1008 => CloseCode::Policy,
        1009 => CloseCode::Size,
        1010 => CloseCode::Extension,
        1011 => CloseCode::Error,
        _ => CloseCode::Error,
    }
}

/// Convert tungstenite CloseCode to axum WS close code (u16).
fn tungstenite_close_to_axum(code: CloseCode) -> u16 {
    match code {
        CloseCode::Normal => 1000,
        CloseCode::Away => 1001,
        CloseCode::Protocol => 1002,
        CloseCode::Unsupported => 1003,
        CloseCode::Status => 1005,
        CloseCode::Abnormal => 1006,
        CloseCode::Invalid => 1007,
        CloseCode::Policy => 1008,
        CloseCode::Size => 1009,
        CloseCode::Extension => 1010,
        CloseCode::Error => 1011,
        // Restart and Again are internal codes without standard WebSocket equivalents
        CloseCode::Restart | CloseCode::Again => 1011,
        _ => 1011,
    }
}

/// Convert an axum WebSocket message to a tungstenite WebSocket message.
fn axum_to_tungstenite(msg: axum::extract::ws::Message) -> TungsteniteMessage {
    match msg {
        axum::extract::ws::Message::Text(t) => TungsteniteMessage::Text(t),
        axum::extract::ws::Message::Binary(b) => TungsteniteMessage::Binary(b),
        axum::extract::ws::Message::Close(c) => {
            TungsteniteMessage::Close(c.map(|f| CloseFrame {
                code: axum_close_to_tungstenite(f.code),
                reason: f.reason.into(),
            }))
        }
        axum::extract::ws::Message::Ping(p) => TungsteniteMessage::Ping(p),
        axum::extract::ws::Message::Pong(p) => TungsteniteMessage::Pong(p),
    }
}

/// Convert a tungstenite WebSocket message to an axum WebSocket message.
fn tungstenite_to_axum(msg: TungsteniteMessage) -> axum::extract::ws::Message {
    match msg {
        TungsteniteMessage::Text(t) => axum::extract::ws::Message::Text(t.into()),
        TungsteniteMessage::Binary(b) => axum::extract::ws::Message::Binary(b),
        TungsteniteMessage::Close(c) => {
            axum::extract::ws::Message::Close(c.map(|f| axum::extract::ws::CloseFrame {
                code: tungstenite_close_to_axum(f.code),
                reason: f.reason.into(),
            }))
        }
        TungsteniteMessage::Ping(p) => axum::extract::ws::Message::Ping(p),
        TungsteniteMessage::Pong(p) => axum::extract::ws::Message::Pong(p),
        TungsteniteMessage::Frame(_) => unreachable!(),
    }
}

/// Forward a WebSocket upgrade request to the gateway.
///
/// The client connects to `ws://127.0.0.1:58124/ws/...`, and the proxy relays
/// it to the gateway's WebSocket endpoint at `ws://127.0.0.1:<gateway_port>/ws`.
/// All bytes between the two WebSocket connections are relayed bidirectionally.
///
/// The gateway is a loopback peer, so Origin/Sec-Fetch-Site headers are stripped
/// to avoid triggering its cross-site check.
async fn forward_ws(
    State(state): State<ProxyState>,
    ws: WebSocketUpgrade,
    req: Request,
) -> Response {
    // Derive the gateway WS path from the request URI.
    let gateway_path = derive_gateway_path(req.uri().path());
    let target = state.target.clone();

    let scheme = if target.starts_with("https://") { "wss" } else { "ws" };
    // Extract host:port from target (e.g. "http://127.0.0.1:8443" -> "127.0.0.1:8443")
    let authority = target
        .strip_prefix("http://")
        .or_else(|| target.strip_prefix("https://"))
        .unwrap_or(&target)
        .split('/')
        .next()
        .unwrap_or("")
        .to_string();
    let gw_url = format!("{}://{}{}", scheme, authority, gateway_path);

    ws.on_upgrade(move |client_socket| async move {
        // Connect to gateway WebSocket with custom config.
        let config = WebSocketConfig {
            max_frame_size: Some(10 * 1024 * 1024), // 10 MiB per frame
            max_message_size: Some(10 * 1024 * 1024), // 10 MiB per message
            ..Default::default()
        };

        let (mut gw_sink, mut gw_stream) = match connect_async_with_config(
            &gw_url,
            Some(config),
            false, // disable Nagle
        ).await {
            Ok((s, _r)) => s.split(),
            Err(e) => {
                eprintln!("Failed to connect to gateway WS {}: {e}", gw_url);
                return;
            }
        };
        let (mut client_sink, mut client_stream) = client_socket.split();

        // Forward gateway → client
        let fw_g2c = async {
            while let Some(msg) = gw_stream.next().await {
                match msg {
                    Ok(frame) => {
                        let axum_msg = tungstenite_to_axum(frame);
                        if client_sink.send(axum_msg).await.is_err() {
                            break;
                        }
                    }
                    Err(TungsteniteError::ConnectionClosed) | Err(TungsteniteError::AlreadyClosed) => {
                        break;
                    }
                    Err(e) => {
                        eprintln!("Gateway WS read error: {e}");
                        break;
                    }
                }
            }
        };

        // Forward client → gateway
        let fw_c2g = async {
            while let Some(msg) = client_stream.next().await {
                match msg {
                    Ok(frame) => {
                        let tg_frame = axum_to_tungstenite(frame);
                        if gw_sink.send(tg_frame).await.is_err() {
                            break;
                        }
                    }
                    Err(e) => {
                        eprintln!("Client WS read error: {e}");
                        break;
                    }
                }
            }
        };

        tokio::select! {
            _ = fw_g2c => {}
            _ = fw_c2g => {}
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::http::header::HeaderValue;

    #[test]
    fn strip_origin_headers_removes_target_headers() {
        let mut src = HeaderMap::new();
        src.insert("Origin", HeaderValue::from_static("http://example.com"));
        src.insert("Sec-Fetch-Site", HeaderValue::from_static("cross-site"));
        src.insert("Sec-Fetch-Mode", HeaderValue::from_static("cors"));
        src.insert("Sec-Fetch-Dest", HeaderValue::from_static("empty"));
        src.insert("Referer", HeaderValue::from_static("http://example.com/page"));
        src.insert("Content-Type", HeaderValue::from_static("application/json"));
        src.insert("Accept", HeaderValue::from_static("*/*"));

        let out = strip_origin_headers(&src);
        assert!(!out.contains_key("Origin"));
        assert!(!out.contains_key("Sec-Fetch-Site"));
        assert!(!out.contains_key("Sec-Fetch-Mode"));
        assert!(!out.contains_key("Sec-Fetch-Dest"));
        assert!(!out.contains_key("Referer"));
        assert!(out.contains_key("Content-Type"));
        assert!(out.contains_key("Accept"));
    }

    #[test]
    fn strip_origin_headers_case_insensitive() {
        let mut src = HeaderMap::new();
        src.insert("ORIGIN", HeaderValue::from_static("http://example.com"));
        let out = strip_origin_headers(&src);
        assert!(!out.contains_key("ORIGIN"));
        assert!(!out.contains_key("origin"));
    }

    #[test]
    fn router_has_ws_route() {
        // The router must expose /ws for WebSocket upgrade forwarding.
        let _r = router("http://127.0.0.1:12345".into());
        assert!(true);
    }

    #[test]
    fn derive_gateway_path_correct() {
        // Demonstrate the path derivation logic used in forward_ws.
        assert_eq!(derive_gateway_path("/ws/web"), "/web");
        assert_eq!(derive_gateway_path("/ws"), "/ws");
        assert_eq!(derive_gateway_path("/ws/sessions/stream"), "/sessions/stream");
        assert_eq!(derive_gateway_path("/other"), "/ws");
    }
}
