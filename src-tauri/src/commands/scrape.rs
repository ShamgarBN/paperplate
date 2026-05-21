use std::net::IpAddr;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tokio::io::AsyncWriteExt;
use url::Host;

use crate::errors::{AppError, AppResult};

const MAX_HTML_BYTES: u64 = 4 * 1024 * 1024; // 4 MiB cap on raw HTML
const MAX_IMAGE_BYTES: u64 = 8 * 1024 * 1024; // 8 MiB cap on hero images
const FETCH_TIMEOUT: Duration = Duration::from_secs(25);

// Pose as a current Chrome on macOS. Many recipe sites (NYT Cooking, Serious
// Eats, Bon Appétit, Food Network…) fingerprint more than the User-Agent
// alone, so we send the standard companion headers a real Chrome sends.
const USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

fn browser_headers(target: &url::Url, is_navigation: bool) -> reqwest::header::HeaderMap {
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
    if is_navigation {
        h.insert("Sec-Fetch-Dest", HeaderValue::from_static("document"));
        h.insert("Sec-Fetch-Mode", HeaderValue::from_static("navigate"));
        h.insert("Sec-Fetch-Site", HeaderValue::from_static("none"));
        h.insert("Sec-Fetch-User", HeaderValue::from_static("?1"));
    } else {
        h.insert("Sec-Fetch-Dest", HeaderValue::from_static("image"));
        h.insert("Sec-Fetch-Mode", HeaderValue::from_static("no-cors"));
        h.insert("Sec-Fetch-Site", HeaderValue::from_static("cross-site"));
    }
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

#[derive(Serialize, Deserialize)]
pub struct DownloadedImage {
    pub absolute_path: String,
    pub relative_path: String,
    pub byte_size: u64,
    pub content_type: Option<String>,
}

/// Fetch the HTML at the given URL, with strict SSRF protections:
/// - Only http/https schemes are allowed
/// - Private, loopback, link-local, multicast, and unspecified addresses are rejected
/// - Redirects are followed (max 5) with each hop revalidated
/// - Body is capped at MAX_HTML_BYTES
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
        .headers(browser_headers(&parsed, true))
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

/// Persist an image that the user dropped onto the recipe editor by way of
/// Tauri's native drag-and-drop API (which gives us file paths, not bytes).
///
/// We treat the path as untrusted input: it must point at a regular file,
/// have a recognisable image extension, and weigh in below the same size
/// cap as the scrape path. We then hand the bytes off to `persist_image`
/// for hashing/extension/MIME normalisation, so dropped files end up in
/// the same content-addressed `images/` cache as scraped images.
#[tauri::command]
pub async fn save_local_image_from_path(
    app: AppHandle,
    path: String,
) -> AppResult<DownloadedImage> {
    let source = std::path::PathBuf::from(&path);
    if !source.is_file() {
        return Err(AppError::InvalidUrl(format!(
            "{} is not a regular file",
            source.display()
        )));
    }

    // Refuse anything that isn't one of the formats the scrape path also
    // accepts. The extension check is a fast first filter; we still hand
    // the MIME type through to `persist_image` for the eventual rename.
    let extension = source
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    let content_type = match extension.as_str() {
        "jpg" | "jpeg" => Some("image/jpeg".to_string()),
        "png" => Some("image/png".to_string()),
        "webp" => Some("image/webp".to_string()),
        "gif" => Some("image/gif".to_string()),
        "avif" => Some("image/avif".to_string()),
        _ => {
            return Err(AppError::NotAllowed(format!(
                "{} is not a supported image type",
                extension,
            )))
        }
    };

    // Bail early if the file is too large to bother reading. tokio::fs::
    // metadata().len() is cheap so we don't need our own header parsing.
    let metadata = tokio::fs::metadata(&source)
        .await
        .map_err(|e| AppError::Io(e.to_string()))?;
    if metadata.len() > MAX_IMAGE_BYTES {
        return Err(AppError::NotAllowed(format!(
            "image too large ({} > {} bytes)",
            metadata.len(),
            MAX_IMAGE_BYTES
        )));
    }

    let bytes = tokio::fs::read(&source)
        .await
        .map_err(|e| AppError::Io(e.to_string()))?;

    persist_image(&app, bytes, content_type).await
}

/// Persist an image the user drag-and-dropped (or picked) onto the recipe
/// editor. Treats the caller-provided byte buffer as untrusted: we cap the
/// length, sniff a safe extension from the declared MIME type, and write
/// into the same `images/` directory under `$APPLOCALDATA` that scraped
/// images use. The returned `DownloadedImage` matches `download_image` so
/// the front-end can treat both flows identically.
#[tauri::command]
pub async fn save_local_image(
    app: AppHandle,
    bytes: Vec<u8>,
    content_type: Option<String>,
) -> AppResult<DownloadedImage> {
    persist_image(&app, bytes, content_type).await
}

/// Shared writer for both the dropped-file and the byte-array entry points.
/// Performs the size cap check, MIME→extension mapping, SHA-256 hashing,
/// and disk write. Returning a fresh `DownloadedImage` lets the front-end
/// treat scraped, dropped, and byte-pasted images uniformly.
async fn persist_image(
    app: &AppHandle,
    bytes: Vec<u8>,
    content_type: Option<String>,
) -> AppResult<DownloadedImage> {
    if bytes.is_empty() {
        return Err(AppError::InvalidUrl("empty image payload".into()));
    }
    if (bytes.len() as u64) > MAX_IMAGE_BYTES {
        return Err(AppError::NotAllowed(format!(
            "image too large ({} > {} bytes)",
            bytes.len(),
            MAX_IMAGE_BYTES
        )));
    }

    // We accept only the same MIME types as the scraping path. Anything
    // unrecognised falls back to a generic `img` extension; the file
    // extension is cosmetic — the WebView decodes the bytes when the
    // <img> tag is rendered.
    let extension = content_type
        .as_deref()
        .and_then(|ct| match ct.split(';').next().unwrap_or("").trim() {
            "image/jpeg" => Some("jpg"),
            "image/png" => Some("png"),
            "image/webp" => Some("webp"),
            "image/gif" => Some("gif"),
            "image/avif" => Some("avif"),
            _ => None,
        })
        .unwrap_or("img");

    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let digest = hex::encode(hasher.finalize());
    let filename = format!("{}.{}", &digest[..16], extension);

    let app_local = app
        .path()
        .app_local_data_dir()
        .map_err(|e| AppError::Io(e.to_string()))?;
    let images_dir = app_local.join("images");
    tokio::fs::create_dir_all(&images_dir)
        .await
        .map_err(|e| AppError::Io(e.to_string()))?;
    let target = images_dir.join(&filename);

    let mut file = tokio::fs::File::create(&target)
        .await
        .map_err(|e| AppError::Io(e.to_string()))?;
    file.write_all(&bytes)
        .await
        .map_err(|e| AppError::Io(e.to_string()))?;
    file.flush()
        .await
        .map_err(|e| AppError::Io(e.to_string()))?;

    let relative_path = format!("images/{}", filename);
    let absolute_path = target
        .to_str()
        .ok_or_else(|| AppError::Internal("path is not valid UTF-8".to_string()))?
        .to_string();

    Ok(DownloadedImage {
        absolute_path,
        relative_path,
        byte_size: bytes.len() as u64,
        content_type,
    })
}

/// Download an image to the app data directory, returning a path relative to
/// $APPLOCALDATA so the frontend can use the asset:// protocol.
#[tauri::command]
pub async fn download_image(
    app: AppHandle,
    url: String,
) -> AppResult<DownloadedImage> {
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
            if let Err(reason) = validate_url(attempt.url()) {
                return attempt.error(reason.to_string());
            }
            attempt.follow()
        }))
        .build()
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let response = client
        .get(parsed.clone())
        .headers(browser_headers(&parsed, false))
        .send()
        .await
        .map_err(|e| AppError::Network(e.to_string()))?;

    if !response.status().is_success() {
        return Err(AppError::Network(format!(
            "image download failed with status {}",
            response.status()
        )));
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let bytes = read_capped(response, MAX_IMAGE_BYTES).await?;
    let extension = content_type
        .as_deref()
        .and_then(|ct| match ct.split(';').next().unwrap_or("").trim() {
            "image/jpeg" => Some("jpg"),
            "image/png" => Some("png"),
            "image/webp" => Some("webp"),
            "image/gif" => Some("gif"),
            "image/avif" => Some("avif"),
            _ => None,
        })
        .unwrap_or("img");

    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let digest = hex::encode(hasher.finalize());
    let filename = format!("{}.{}", &digest[..16], extension);

    let app_local = app
        .path()
        .app_local_data_dir()
        .map_err(|e| AppError::Io(e.to_string()))?;
    let images_dir = app_local.join("images");
    tokio::fs::create_dir_all(&images_dir)
        .await
        .map_err(|e| AppError::Io(e.to_string()))?;
    let target = images_dir.join(&filename);

    let mut file = tokio::fs::File::create(&target)
        .await
        .map_err(|e| AppError::Io(e.to_string()))?;
    file.write_all(&bytes)
        .await
        .map_err(|e| AppError::Io(e.to_string()))?;
    file.flush()
        .await
        .map_err(|e| AppError::Io(e.to_string()))?;

    let relative_path = format!("images/{}", filename);
    let absolute_path = target
        .to_str()
        .ok_or_else(|| AppError::Internal("path is not valid UTF-8".to_string()))?
        .to_string();

    Ok(DownloadedImage {
        absolute_path,
        relative_path,
        byte_size: bytes.len() as u64,
        content_type,
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
