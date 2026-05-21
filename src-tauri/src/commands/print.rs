use tauri::{AppHandle, Manager};

use crate::errors::{AppError, AppResult};

/// Opens the native print dialog for the main webview window.
///
/// JS's plain `window.print()` is unreliable inside WKWebView on macOS — in
/// many Tauri builds the call is silently dropped. Tauri exposes a Webview
/// method that calls into the platform's print operation directly; on macOS
/// this is the system print panel. This command is the bridge so the
/// front-end can trigger it from a button click.
#[tauri::command]
pub fn print_current_window(app: AppHandle) -> AppResult<()> {
    // The window label is fixed in tauri.conf.json (`main`). We could iterate
    // over all webviews, but printing a specific one matches the user's
    // intent — they clicked Print on a specific page in this window.
    let webview = app
        .get_webview_window("main")
        .ok_or_else(|| AppError::Io("main window not found".into()))?;
    webview
        .print()
        .map_err(|e| AppError::Io(format!("print failed: {}", e)))
}
