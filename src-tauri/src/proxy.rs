//! Local HTTP/WebSocket proxy: forwards `/api`, `/meta` to the gateway.
//!
//! The Tauri frontend reaches the gateway through this proxy on
//! `127.0.0.1:58124` (the Rust native listening port). The proxy strips
//! browser-origin headers so the gateway treats the request as coming from a
//! native client, bypassing the cross-site CSRF gate.
//!
//! CORS handling: the WebView page is served from `http://tauri.localhost`,
//! which is cross-origin with the proxy's `http://127.0.0.1:58124`.
//! Responses forwarded by this proxy preserve gateway headers (Content-Type,
//! etc.) and synthesize an Access-Control-Allow-Origin header so the browser
//! allows the SPA to read them. OPTIONS preflight requests for `/api/*`,
//! `/meta`, and `/ws` are answered directly without contacting the gateway.

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
///
/// Note: axum 0.7 uses `*path` (single `*`, no braces) for catch-all route
/// parameters. `{*path}` panics at route-build time.
pub fn router(target: String) -> Router {
    let state = ProxyState {
        client: Client::new(),
        target,
    };

    // Route tree that handles CORS preflight for every publicly-addressable
    // path: /meta, /api/*, and /ws(/*).
    Router::new()
        .route("/meta", get(forward_http).options(cors_options))
        .route("/api/*path", any(forward_http).options(cors_options))
        .route("/ws", any(forward_ws).options(cors_options))
        .route("/ws/*path", any(forward_ws).options(cors_options))
        .with_state(state)
}

#[derive(Clone)]
struct ProxyState {
    /// Reusable HTTP client shared across all forwarded requests.
    client: Client,
    /// Gateway base URL, e.g. `http://127.0.0.1:8443`.
    target: String,
}

/// Handle CORS preflight OPTIONS requests.
///
/// Answers locally without forwarding to the gateway. This lets the WebView
/// browser satisfy its CORS preflight before the actual request, regardless of
/// whether the gateway itself is reachable.
async fn cors_options(State(state): State<ProxyState>, req: Request<Body>) -> Response {
    let _ = state; // state unused — this is a pure CORS response.
    // Capture origin before consuming the body (into_body moves `req`).
    let origin = cors_origin(&req);
    let _ = to_bytes(req.into_body(), usize::MAX).await;
    let resp = Response::builder()
        .status(204)
        .header("Access-Control-Allow-Origin", origin)
        .header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        .header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        .header("Access-Control-Max-Age", "86400")
        .body(Body::empty())
        .unwrap();
    resp
}

/// Pick the CORS origin to emit.
///
/// * In desktop mode the browser sends `Origin: http://tauri.localhost`, which
///   the gateway also uses. Echo it back so the browser trusts the proxy
///   response.
/// * In browser mode the request usually lacks an Origin header (same-origin
///   navigation); fall back to `*` which is safe because the proxy only listens
///   on localhost and serves the local app.
fn cors_origin(req: &Request<Body>) -> String {
    req.headers()
        .get(tauri::http::header::ORIGIN)
        .and_then(|v| v.to_str().ok())
        .filter(|o| !o.is_empty())
        .unwrap_or("*")
        .to_string()
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

    // Capture the CORS origin before consuming the request body — it's needed
    // both for the response header and for the OPTIONS preflight path.
    let cors_origin = req
        .headers()
        .get(tauri::http::header::ORIGIN)
        .and_then(|v| v.to_str().ok())
        .filter(|o| !o.is_empty())
        .unwrap_or("*")
        .to_string();

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

    // Forward via the shared client instead of creating a new one per request.
    let resp = match state
        .client
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

    // Capture the gateway Content-Type before consuming the response bytes.
    let content_type = resp
        .headers()
        .get(tauri::http::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

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

    // Echo back the gateway's Content-Type and set Access-Control-Allow-Origin
    // so the WebView browser can read the response across the tauri.localhost
    // vs 127.0.0.1 origin boundary.
    let mut resp_builder = Response::builder().status(status);
    if let Some(ct) = content_type {
        resp_builder = resp_builder.header(tauri::http::header::CONTENT_TYPE, ct);
    }
    resp_builder
        .header(tauri::http::header::ACCESS_CONTROL_ALLOW_ORIGIN, cors_origin)
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
/// The gateway registers its WebSocket endpoints on the *full* `/ws/...` path
/// (see `codex_pro/gateway/server.py`: `ws_path` default `/ws`, plus the fixed
/// `/ws/web` and `/ws/term` routes), so the proxy must forward the incoming
/// path unchanged — `/ws/web` stays `/ws/web`, `/ws/term` stays `/ws/term`.
///
/// Only a request that does not already start with `/ws` is normalized to the
/// gateway default.
pub fn derive_gateway_path(path: &str) -> &str {
    if path.starts_with("/ws") {
        path
    } else {
        "/ws"
    }
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
/// it to the gateway's WebSocket endpoint at `ws://127.0.0.1:<gateway_port>/ws...`.
/// All frames between the two WebSocket connections are relayed bidirectionally.
///
/// The gateway is a loopback peer, so Origin/Sec-Fetch-Site headers are stripped
/// to avoid triggering its cross-site check.
async fn forward_ws(
    State(state): State<ProxyState>,
    ws: WebSocketUpgrade,
    req: Request,
) -> Response {
    // Preserve the full gateway WS path (e.g. `/ws/web`, `/ws/term`).
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
    use axum::{
        body::Body,
        http::{Method, Request as HttpRequest, StatusCode},
    };
    use tauri::http::header::HeaderValue;
    use tower::util::ServiceExt;

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

    #[tokio::test]
    async fn router_matches_nested_api_and_ws_paths() {
        // The router must expose catch-all /api and /ws routes so the proxy
        // forwards /api/v1/..., /ws/web and /ws/term instead of returning 404.
        let r = router("http://127.0.0.1:12345".into());

        // /api/v1/... must reach forward_http (non-404; the reqwest.c error means
        // the route matched and it tried to talk to the (unreachable) target).
        let req = HttpRequest::builder()
            .method(Method::GET)
            .uri("/api/v1/health")
            .body(Body::empty())
            .unwrap();
        let resp = r.clone().oneshot(req).await.unwrap();
        assert_ne!(resp.status(), StatusCode::NOT_FOUND);

        // /ws/web, /ws/term and /ws must all match the WebSocket route rather
        // than 404. A plain GET without an Upgrade handshake returns a 426
        // Upgrade Required from the WebSocketUpgrade extractor — which proves
        // the route matched.
        for path in ["/ws/web", "/ws/term", "/ws"] {
            let req = HttpRequest::builder()
                .method(Method::GET)
                .uri(path)
                .body(Body::empty())
                .unwrap();
            let resp = r.clone().oneshot(req).await.unwrap();
            assert_ne!(resp.status(), StatusCode::NOT_FOUND, "route {path} did not match");
        }
    }

    #[tokio::test]
    async fn options_preflight_returns_204_with_cors_headers() {
        let r = router("http://127.0.0.1:12345".into());
        let req = HttpRequest::builder()
            .method(Method::OPTIONS)
            .uri("/api/v1/plugins/test/toggle")
            .header("Origin", "http://tauri.localhost")
            .header("Access-Control-Request-Method", "POST")
            .body(Body::empty())
            .unwrap();
        let resp = r.clone().oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::NO_CONTENT);
        assert_eq!(
            resp.headers().get("Access-Control-Allow-Origin").unwrap(),
            "http://tauri.localhost"
        );
        assert_eq!(
            resp.headers()
                .get("Access-Control-Allow-Headers")
                .unwrap(),
            "Content-Type, Authorization"
        );
    }

    #[tokio::test]
    async fn options_preflight_falls_back_to_star_when_no_origin() {
        let r = router("http://127.0.0.1:12345".into());
        let req = HttpRequest::builder()
            .method(Method::OPTIONS)
            .uri("/meta")
            .body(Body::empty())
            .unwrap();
        let resp = r.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::NO_CONTENT);
        assert_eq!(resp.headers().get("Access-Control-Allow-Origin").unwrap(), "*");
    }

    #[test]
    fn derive_gateway_path_preserves_full_ws_path() {
        // The gateway registers /ws, /ws/web and /ws/term — the proxy must
        // forward the full path unchanged, not strip the /ws prefix.
        assert_eq!(derive_gateway_path("/ws/web"), "/ws/web");
        assert_eq!(derive_gateway_path("/ws/term"), "/ws/term");
        assert_eq!(derive_gateway_path("/ws"), "/ws");
        assert_eq!(derive_gateway_path("/ws/sessions/stream"), "/ws/sessions/stream");
        // Non-/ws paths fall back to the gateway default.
        assert_eq!(derive_gateway_path("/other"), "/ws");
    }
}
