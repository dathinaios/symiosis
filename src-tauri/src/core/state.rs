use crate::{config::AppConfig, core::AppResult, database::DatabaseManager, logging::log};
use std::sync::{
    atomic::{AtomicBool, AtomicUsize},
    Arc, Mutex, RwLock,
};

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<RwLock<AppConfig>>,
    pub was_first_run: Arc<AtomicBool>,
    pub programmatic_operation_in_progress: Arc<AtomicUsize>,
    pub database_manager: Arc<Mutex<DatabaseManager>>,
    pub database_rebuild_lock: Arc<RwLock<()>>,
}

impl AppState {
    pub fn new(config: AppConfig) -> AppResult<Self> {
        let database_manager = DatabaseManager::new()?;

        Ok(Self {
            config: Arc::new(RwLock::new(config)),
            was_first_run: Arc::new(AtomicBool::new(false)),
            programmatic_operation_in_progress: Arc::new(AtomicUsize::new(0)),
            database_manager: Arc::new(Mutex::new(database_manager)),
            database_rebuild_lock: Arc::new(RwLock::new(())),
        })
    }

    pub fn new_with_fallback(config: AppConfig) -> AppResult<Self> {
        match Self::new(config.clone()) {
            Ok(state) => Ok(state),
            Err(original_error) => {
                log(
                    "DATABASE_INIT_FAILURE",
                    "Database initialization failed, attempting recovery",
                    Some(&original_error.to_string()),
                );

                // Attempt to recreate database from filesystem
                match Self::new_with_recovery(config) {
                    Ok(state) => {
                        log(
                            "DATABASE_RECOVERY_SUCCESS",
                            "Database recovered successfully from filesystem",
                            None,
                        );
                        Ok(state)
                    }
                    Err(recovery_error) => {
                        log(
                            "DATABASE_RECOVERY_FAILURE",
                            "Database recovery failed",
                            Some(&recovery_error.to_string()),
                        );
                        Err(crate::core::AppError::database_recovery_failed(
                            "database initialization",
                            &original_error.to_string(),
                            &recovery_error.to_string(),
                        ))
                    }
                }
            }
        }
    }

    fn new_with_recovery(config: AppConfig) -> AppResult<Self> {
        // Try to delete the corrupted database and start fresh
        if let Ok(db_path) = crate::utilities::paths::get_database_path() {
            if db_path.exists() {
                if let Err(e) = std::fs::remove_file(&db_path) {
                    log(
                        "DATABASE_FILE_DELETE_FAILED",
                        "Failed to delete corrupted database file",
                        Some(&e.to_string()),
                    );
                }
            }
        }

        // Try to create fresh database connection
        let database_manager = DatabaseManager::new()?;
        let state = Self {
            config: Arc::new(RwLock::new(config)),
            was_first_run: Arc::new(AtomicBool::new(false)),
            programmatic_operation_in_progress: Arc::new(AtomicUsize::new(0)),
            database_manager: Arc::new(Mutex::new(database_manager)),
            database_rebuild_lock: Arc::new(RwLock::new(())),
        };

        // Recreate database from filesystem
        crate::services::database_service::recreate_database(&state)?;

        Ok(state)
    }

    pub fn set_first_run(&self, value: bool) {
        self.was_first_run
            .store(value, std::sync::atomic::Ordering::Relaxed);
    }

    pub fn was_first_run(&self) -> &AtomicBool {
        &self.was_first_run
    }

    pub fn programmatic_operation_in_progress(&self) -> &AtomicUsize {
        &self.programmatic_operation_in_progress
    }
}
