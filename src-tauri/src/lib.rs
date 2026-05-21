mod commands;
mod errors;

use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "noop schema bootstrap, real migrations live in TS",
        sql: "SELECT 1",
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:paperplate.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            // Ensure the app data directory exists for image cache and exports.
            if let Ok(app_data_dir) = app.path().app_data_dir() {
                let _ = std::fs::create_dir_all(app_data_dir.join("images"));
                let _ = std::fs::create_dir_all(app_data_dir.join("exports"));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::scrape::fetch_recipe_html,
            commands::scrape::download_image,
            commands::scrape::save_local_image,
            commands::scrape::save_local_image_from_path,
            commands::backup::export_database,
            commands::backup::import_database,
            commands::backup::delete_image,
            commands::print::print_current_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running paperplate");
}
