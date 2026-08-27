use crate::{
    config::{reload_config, ConfigReloadResult},
    database::{refresh_database_connection, with_db_mut},
    logging::log,
    services::database_service::{
        init_db, load_all_notes_into_sqlite, load_all_notes_into_sqlite_with_progress,
        recreate_database_with_progress,
    },
};
use tauri::{AppHandle, Emitter};

fn emit_with_logging<T: serde::Serialize + Clone>(app: &AppHandle, event: &str, payload: T) {
    if let Err(e) = app.emit(event, payload) {
        log(
            "UI_UPDATE",
            &format!("Failed to emit {}", event),
            Some(&e.to_string()),
        );
    }
}

#[tauri::command]
pub async fn initialize_notes_with_progress(
    app: AppHandle,
    app_state: tauri::State<'_, crate::core::state::AppState>,
) -> Result<(), String> {
    let result = perform_notes_initialization(&app, &app_state).await;
    result.map_err(|e: crate::core::AppError| e.to_string())
}

#[tauri::command]
pub async fn refresh_cache(
    app: AppHandle,
    app_state: tauri::State<'_, crate::core::state::AppState>,
) -> Result<(), String> {
    let result = perform_cache_refresh(&app, &app_state).await;
    result.map_err(|e: crate::core::AppError| e.to_string())
}

/// The same refresh the `refresh_cache` command performs, callable with an
/// owned `AppState`. The tray menu needs this: it has no `tauri::State` to
/// borrow, and its handler is not async.
pub async fn refresh_cache_for_state(
    app: &AppHandle,
    app_state: &crate::core::state::AppState,
) -> Result<(), crate::core::AppError> {
    perform_cache_refresh(app, app_state).await
}

async fn perform_notes_initialization(
    app: &AppHandle,
    app_state: &tauri::State<'_, crate::core::state::AppState>,
) -> Result<(), crate::core::AppError> {
    std::thread::sleep(std::time::Duration::from_millis(50));

    emit_with_logging(app, "db-loading-start", "Initializing notes database...");

    if !crate::utilities::paths::get_config_path().exists() {
        emit_with_logging(app, "db-loading-complete", ());
        return Ok(());
    }

    emit_initialization_progress(app);

    let result = execute_notes_loading_task(app, app_state).await?;

    handle_initialization_result(app, result)
}

async fn perform_cache_refresh(
    app: &AppHandle,
    app_state: &crate::core::state::AppState,
) -> Result<(), crate::core::AppError> {
    emit_with_logging(app, "db-loading-start", "Refreshing notes...");
    emit_with_logging(app, "db-loading-progress", "Loading settings...");

    let reload_result = handle_config_reload(app, app_state)?;
    handle_database_connection_refresh(app, app_state, reload_result)?;

    emit_cache_refresh_progress(app);

    let result = execute_cache_refresh_task(app_state).await?;
    handle_cache_refresh_result(app, app_state, result).await
}

fn emit_initialization_progress(app: &AppHandle) {
    emit_with_logging(app, "db-loading-progress", "Setting up notes database...");
    emit_with_logging(
        app,
        "db-loading-progress",
        "Loading notes from filesystem...",
    );
}

async fn execute_notes_loading_task(
    app: &AppHandle,
    app_state: &tauri::State<'_, crate::core::state::AppState>,
) -> Result<Result<(), crate::core::AppError>, crate::core::AppError> {
    let app_clone = app.clone();
    let app_state_clone = app_state.inner().clone();

    tokio::task::spawn_blocking(move || {
        with_db_mut(&app_state_clone, |conn| {
            load_all_notes_into_sqlite_with_progress(&app_state_clone, conn, Some(&app_clone))
                .map_err(|e| e.into())
        })
    })
    .await
    .map_err(|e| crate::core::AppError::DatabaseConnection(format!("Task join error: {}", e)))
}

fn handle_initialization_result(
    app: &AppHandle,
    result: Result<(), crate::core::AppError>,
) -> Result<(), crate::core::AppError> {
    match result {
        Ok(()) => {
            emit_with_logging(app, "db-loading-complete", ());
            Ok(())
        }
        Err(e) => {
            let error_msg = format!("Failed to initialize notes database: {}", e);
            emit_with_logging(app, "db-loading-error", &error_msg);
            Err(e)
        }
    }
}

fn handle_config_reload(
    app: &AppHandle,
    app_state: &crate::core::state::AppState,
) -> Result<ConfigReloadResult, crate::core::AppError> {
    reload_config(&app_state.config, Some(app.clone())).map_err(|e| {
        emit_with_logging(
            app,
            "db-loading-error",
            format!("Failed to reload config: {}", e),
        );
        crate::core::AppError::ConfigLoad(e)
    })
}

fn handle_database_connection_refresh(
    app: &AppHandle,
    app_state: &crate::core::state::AppState,
    reload_result: ConfigReloadResult,
) -> Result<(), crate::core::AppError> {
    if reload_result == ConfigReloadResult::NotesDirChanged {
        match refresh_database_connection(app_state) {
            Ok(true) => {
                emit_with_logging(
                    app,
                    "db-loading-progress",
                    "Notes directory changed, database connection refreshed",
                );
            }
            Ok(false) => {
                emit_with_logging(
                    app,
                    "db-loading-progress",
                    "Notes directory unchanged, continuing with existing database",
                );
            }
            Err(e) => {
                emit_with_logging(
                    app,
                    "db-loading-error",
                    format!("Failed to refresh database connection: {}", e),
                );
                return Err(e);
            }
        }
    }
    Ok(())
}

fn emit_cache_refresh_progress(app: &AppHandle) {
    emit_with_logging(app, "db-loading-progress", "Preparing notes database...");
    emit_with_logging(app, "db-loading-progress", "Setting up notes database...");
    emit_with_logging(app, "db-loading-progress", "Loading notes...");
}

async fn execute_cache_refresh_task(
    app_state: &crate::core::state::AppState,
) -> Result<Result<(), crate::core::AppError>, crate::core::AppError> {
    let app_state_clone = app_state.clone();

    tokio::task::spawn_blocking(move || {
        with_db_mut(&app_state_clone, |conn| {
            init_db(conn)?;
            load_all_notes_into_sqlite(&app_state_clone, conn).map_err(|e| e.into())
        })
    })
    .await
    .map_err(|e| crate::core::AppError::DatabaseConnection(format!("Task join error: {}", e)))
}

async fn handle_cache_refresh_result(
    app: &AppHandle,
    app_state: &crate::core::state::AppState,
    result: Result<(), crate::core::AppError>,
) -> Result<(), crate::core::AppError> {
    match result {
        Ok(()) => {
            emit_with_logging(app, "db-loading-complete", ());
            Ok(())
        }
        Err(e) => handle_cache_refresh_failure(app, app_state, e).await,
    }
}

async fn handle_cache_refresh_failure(
    app: &AppHandle,
    app_state: &crate::core::state::AppState,
    original_error: crate::core::AppError,
) -> Result<(), crate::core::AppError> {
    emit_with_logging(
        app,
        "db-loading-progress",
        "Database sync failed, attempting recovery...",
    );
    log(
        "DATABASE_RECOVERY",
        "Failed to refresh notes cache. Attempting recovery...",
        Some(&original_error.to_string()),
    );

    let result = recreate_database_with_progress(
        app_state,
        app,
        "Database corruption detected. Recreating database tables...",
    )
    .await
    .map_err(|recovery_error| {
        crate::core::AppError::DatabaseConnection(format!(
            "Cache refresh failed and recovery failed: {}. Original error: {}",
            recovery_error, original_error
        ))
    });

    if result.is_ok() {
        emit_with_logging(app, "db-loading-complete", ());
    } else if let Err(ref e) = result {
        emit_with_logging(app, "db-loading-error", e.to_string());
    }
    result
}
