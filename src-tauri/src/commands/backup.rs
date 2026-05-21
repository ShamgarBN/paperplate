use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use crate::errors::{AppError, AppResult};

const DB_FILENAME: &str = "paperplate.db";

fn db_path(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| AppError::Io(e.to_string()))?;
    Ok(dir.join(DB_FILENAME))
}

fn ensure_inside_user_dirs(path: &Path) -> AppResult<()> {
    let canonical = path
        .canonicalize()
        .or_else(|_| {
            // If the file doesn't exist yet (export target), check the parent.
            path.parent()
                .map(|p| p.canonicalize())
                .unwrap_or_else(|| Err(std::io::Error::other("no parent")))
        })
        .map_err(|e| AppError::Io(e.to_string()))?;

    let mut roots: Vec<PathBuf> = Vec::new();
    if let Some(home) = dirs_next::home_dir() {
        roots.push(home);
    }
    if roots.is_empty() {
        return Err(AppError::Io("could not resolve home directory".into()));
    }
    for root in &roots {
        let resolved_root = root.canonicalize().unwrap_or_else(|_| root.clone());
        if canonical.starts_with(&resolved_root) {
            return Ok(());
        }
    }
    Err(AppError::NotAllowed(
        "path is outside the user's home directory".into(),
    ))
}

#[tauri::command]
pub async fn export_database(app: AppHandle, destination: String) -> AppResult<u64> {
    let dest = PathBuf::from(&destination);
    ensure_inside_user_dirs(&dest)?;
    let src = db_path(&app)?;
    let bytes = tokio::fs::copy(&src, &dest)
        .await
        .map_err(|e| AppError::Io(e.to_string()))?;
    Ok(bytes)
}

/// Delete a single image file under the app's `images/` directory.
///
/// `relative_path` is intentionally the same value stored in the recipe row
/// (e.g. `images/abc123.jpg`). We refuse to look outside the app's local data
/// directory so a malformed path can't be used to delete arbitrary files.
#[tauri::command]
pub async fn delete_image(app: AppHandle, relative_path: String) -> AppResult<()> {
    if relative_path.is_empty() {
        return Ok(());
    }
    if relative_path.contains("..") {
        return Err(AppError::NotAllowed(
            "image path may not traverse parent directories".into(),
        ));
    }
    let app_local = app
        .path()
        .app_local_data_dir()
        .map_err(|e| AppError::Io(e.to_string()))?;
    let target = app_local.join(&relative_path);
    let resolved_root = app_local.canonicalize().unwrap_or(app_local);
    let canonical_target = match target.canonicalize() {
        Ok(p) => p,
        // File already gone — treat as success.
        Err(_) => return Ok(()),
    };
    if !canonical_target.starts_with(&resolved_root) {
        return Err(AppError::NotAllowed(
            "image path is outside the app data directory".into(),
        ));
    }
    if let Err(e) = tokio::fs::remove_file(&canonical_target).await {
        if e.kind() != std::io::ErrorKind::NotFound {
            return Err(AppError::Io(e.to_string()));
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn import_database(app: AppHandle, source: String) -> AppResult<u64> {
    let src = PathBuf::from(&source);
    ensure_inside_user_dirs(&src)?;
    if !src.exists() {
        return Err(AppError::Io("source file does not exist".into()));
    }
    let dest = db_path(&app)?;
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| AppError::Io(e.to_string()))?;
    }
    // Back up the current DB next to itself before overwriting.
    if dest.exists() {
        let backup = dest.with_file_name(format!("{}.bak", DB_FILENAME));
        let _ = tokio::fs::copy(&dest, &backup).await;
    }
    let bytes = tokio::fs::copy(&src, &dest)
        .await
        .map_err(|e| AppError::Io(e.to_string()))?;
    Ok(bytes)
}

mod dirs_next {
    use std::path::PathBuf;
    pub fn home_dir() -> Option<PathBuf> {
        std::env::var_os("HOME").map(PathBuf::from)
    }
}
