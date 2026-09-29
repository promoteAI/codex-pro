//! Local HTTP/WebSocket proxy: forwards `/api`, `/meta` to the gateway.
//!
//! The Tauri frontend reaches the gateway through this proxy on
//! `127.0.0.1:58124` (the Rust native listening port). The proxy strips
//! browser-origin headers so the gateway treats the request as coming from a
//! native client, bypassing the cross-site CSRF gate.

use std::iter::once;

use axum::{
    body::{to_bytes, Body},
    extract::{Request, State},
    response::Response,
    routing::{any, get},
    Router,
};
use tauri::http::HeaderMap;
use reqwest::{Client, StatusCode};

/// Build the proxy router.
///
/// `target` is the gateway base URL, e.g. `http://127.0.0.1:8443`.
pub fn router(target: String) -> Router {
    let state = ProxyState { target };
    Router::new()
        .route("/api/{*path}", any(forward_http))
        .route("/meta", get(forward_http))
        .route("/ws/{*path}", any(forward_ws))
        .with_state(state)
}

#[derive(Clone)]
struct ProxyState {
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
    let query = uri
        .query()
        .map(|q| format!("?{q}"))
        .unwrap_or_default();
    let url = format!("{}{}{}", state.target, path, query);

    // Strip browser-origin headers so the gateway sees a native client.
    let forward_headers = strip_origin_headers(req.headers());

    // Collect the body as bytes first (simple for now; streaming for large bodies
    // would require a different approach).
    let body_bytes = match to_bytes(req.into_body(), usize::MAX).await {
        Ok(b) => b.to_vec(),
        Err(e) => {
            return Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
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
                .status(StatusCode::BAD_GATEWAY)
                .body(Body::from(format!("proxy error: {e}")))
                .unwrap();
        }
    };

    let status = resp.status();
    let body_bytes = match resp.bytes().await {
        Ok(b) => b,
        Err(e) => {
            return Response::builder()
                .status(StatusCode::BAD_GATEWAY)
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
        if lower == "origin"
            || lower == "sec-fetch-site"
            || lower == "sec-fetch-mode"
            || lower == "sec-fetch-dest"
            || lower == "referer"
        {
            continue;
        }
        out.insert(key, value.clone());
    }
    out
}

/// Placeholder for WebSocket upgrade forwarding (Task 3).
async fn forward_ws(
    _state: State<ProxyState>,
    _req: Request<Body>,
) -> Response {
    Response::builder()
        .status(StatusCode::NOT_IMPLEMENTED)
        .body(Body::from("ws proxy not yet implemented"))
        .unwrap()
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
        // HeaderMap treats keys case-insensitively, so even "origin" is gone.
        assert!(!out.contains_key("origin"));
    }
}
