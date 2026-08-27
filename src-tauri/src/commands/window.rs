use crate::core::AppResult;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
pub fn show_main_window(
    app: AppHandle,
    app_state: tauri::State<crate::core::state::AppState>,
) -> Result<(), String> {
    let result = || -> AppResult<()> {
        match app.get_webview_window("main") {
            Some(window) => {
                window.show()?;
                window.set_focus()?;
            }
            None => {
                let config = app_state.config.read().unwrap_or_else(|e| e.into_inner());
                let (window_decorations, always_on_top) = (
                    config.interface.window_decorations,
                    config.interface.always_on_top,
                );

                let mut window_builder =
                    WebviewWindowBuilder::new(&app, "main", WebviewUrl::default())
                        .title("Symiosis Notes")
                        .inner_size(1200.0, 800.0)
                        .center()
                        .visible(false)
                        .decorations(window_decorations);

                if always_on_top {
                    window_builder = window_builder.always_on_top(true);
                }

                let _window = window_builder.build()?;
            }
        }
        Ok(())
    }();
    result.map_err(|e| e.to_string())
}
