use std::net::IpAddr;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use url::Host;

use crate::errors::{AppError, AppResult};

const MAX_HTML_BYTES: u64 = 4 * 1024 * 1024; // 4 MiB cap on raw HTML
const FETCH_TIMEOUT: Duration = Duration::from_secs(25);

// Pose as a current Chrome on macOS. Many recipe sites (NYT Cooking, Serious
// Eats, Bon Appétit, Food Network…) fingerprint more than the User-Agent
// alone, so we send the standard companion headers a real Chrome sends.
const USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

fn browser_headers(target: &url::Url) -> reqwest::header::HeaderMap {
    use reqwest::header::{HeaderMap, HeaderValue};
    let mut h = HeaderMap::new();
    h.insert(
        "Accept",
        HeaderValue::from_static(
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        ),
    );
    h.insert(
        "Accept-Language",
        HeaderValue::from_static("en-US,en;q=0.9"),
    );
    h.insert("DNT", HeaderValue::from_static("1"));
    h.insert("Upgrade-Insecure-Requests", HeaderValue::from_static("1"));
    h.insert(
        "sec-ch-ua",
        HeaderValue::from_static(
            "\"Chromium\";v=\"127\", \"Not;A=Brand\";v=\"99\", \"Google Chrome\";v=\"127\"",
        ),
    );
    h.insert("sec-ch-ua-mobile", HeaderValue::from_static("?0"));
    h.insert("sec-ch-ua-platform", HeaderValue::from_static("\"macOS\""));
    h.insert("Sec-Fetch-Dest", HeaderValue::from_static("document"));
    h.insert("Sec-Fetch-Mode", HeaderValue::from_static("navigate"));
    h.insert("Sec-Fetch-Site", HeaderValue::from_static("none"));
    h.insert("Sec-Fetch-User", HeaderValue::from_static("?1"));
    // Pretend we arrived from the site's own root. A handful of sites (Bon
    // Appétit's Cloudflare config in particular) reject empty referers.
    if let Ok(origin) = target.join("/") {
        if let Ok(value) = HeaderValue::from_str(origin.as_str()) {
            h.insert("Referer", value);
        }
    }
    h
}

#[derive(Serialize, Deserialize)]
pub struct FetchResult {
    pub url: String,
    pub final_url: String,
    pub status: u16,
    pub content_type: Option<String>,
    pub html: String,
}

/// Fetch the HTML at the given URL, with strict SSRF protections:
/// - Only http/https schemes are allowed
/// - Private, loopback, link-local, multicast, and unspecified addresses are rejected
/// - Redirects are followed (max 5) with each hop revalidated
/// - Body is capped at MAX_HTML_BYTES
///
/// Image download + local-cache writes used to live alongside this; those
/// moved to Supabase Storage when we swapped the data layer.
#[tauri::command]
pub async fn fetch_recipe_html(url: String) -> AppResult<FetchResult> {
    let parsed = url::Url::parse(&url).map_err(|e| AppError::InvalidUrl(e.to_string()))?;
    validate_url(&parsed)?;

    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(FETCH_TIMEOUT)
        .cookie_store(true)
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() > 5 {
                return attempt.error("too many redirects");
            }
            // Re-validate the next hop against our SSRF rules before following.
            let next = attempt.url();
            if let Err(reason) = validate_url(next) {
                return attempt.error(reason.to_string());
            }
            attempt.follow()
        }))
        .build()
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let response = client
        .get(parsed.clone())
        .headers(browser_headers(&parsed))
        .send()
        .await
        .map_err(|e| AppError::Network(e.to_string()))?;

    let final_url = response.url().to_string();
    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    if !response.status().is_success() {
        return Err(AppError::Network(format!(
            "site responded with HTTP {} when fetching {}",
            status, final_url
        )));
    }

    let bytes = read_capped(response, MAX_HTML_BYTES).await?;
    let html = String::from_utf8_lossy(&bytes).to_string();

    Ok(FetchResult {
        url,
        final_url,
        status,
        content_type,
        html,
    })
}

async fn read_capped(
    mut response: reqwest::Response,
    max_bytes: u64,
) -> AppResult<Vec<u8>> {
    if let Some(len) = response.content_length() {
        if len > max_bytes {
            return Err(AppError::NotAllowed(format!(
                "response too large ({} > {} bytes)",
                len, max_bytes
            )));
        }
    }
    let mut buffer = Vec::with_capacity(64 * 1024);
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| AppError::Network(e.to_string()))?
    {
        if (buffer.len() as u64) + (chunk.len() as u64) > max_bytes {
            return Err(AppError::NotAllowed(format!(
                "response exceeded {} bytes",
                max_bytes
            )));
        }
        buffer.extend_from_slice(&chunk);
    }
    Ok(buffer)
}

fn validate_url(url: &url::Url) -> AppResult<()> {
    match url.scheme() {
        "http" | "https" => {}
        other => {
            return Err(AppError::NotAllowed(format!(
                "scheme {} is not allowed",
                other
            )))
        }
    }
    let host = url
        .host()
        .ok_or_else(|| AppError::InvalidUrl("missing host".to_string()))?;
    match host {
        Host::Domain(name) => {
            let lower = name.to_lowercase();
            if lower == "localhost"
                || lower.ends_with(".localhost")
                || lower == "ip6-localhost"
                || lower.ends_with(".local")
            {
                return Err(AppError::NotAllowed(format!(
                    "host {} is not allowed",
                    lower
                )));
            }
        }
        Host::Ipv4(addr) => {
            check_ip(IpAddr::V4(addr))?;
        }
        Host::Ipv6(addr) => {
            check_ip(IpAddr::V6(addr))?;
        }
    }
    Ok(())
}

fn check_ip(ip: IpAddr) -> AppResult<()> {
    let bad = match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_multicast()
                || v4.is_unspecified()
                || v4.is_broadcast()
                || v4.octets()[0] == 0
                || v4.octets()[0] == 127
                || (v4.octets()[0] == 169 && v4.octets()[1] == 254)
                || (v4.octets()[0] == 100 && (v4.octets()[1] & 0xC0) == 0x40)
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_multicast()
                || v6.is_unspecified()
                || (v6.segments()[0] & 0xfe00) == 0xfc00 // unique local
                || (v6.segments()[0] & 0xffc0) == 0xfe80 // link local
        }
    };
    if bad {
        return Err(AppError::NotAllowed(format!(
            "ip address {} is not in a public range",
            ip
        )));
    }
    Ok(())
}
