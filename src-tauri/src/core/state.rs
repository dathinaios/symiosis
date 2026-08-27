use crate::{
    config::AppConfig, core::self_writes::SelfWriteRegistry, core::AppResult,
    database::DatabaseManager, logging::log,
};
use std::path::PathBuf;
use std::sync::{atomic::AtomicBool, Arc, Mutex, RwLock};

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<RwLock<AppConfig>>,
    pub was_first_run: Arc<AtomicBool>,
    /// Filesystem changes this app made, so the watcher can ignore its own echo.
    pub self_writes: Arc<SelfWriteRegistry>,
    pub database_manager: Arc<Mutex<DatabaseManager>>,
    pub database_rebuild_lock: Arc<RwLock<()>>,
}

impl AppState {
    pub fn new(config: AppConfig) -> AppResult<Self> {
        let database_manager = DatabaseManager::new(&notes_dir_of(&config))?;

        Ok(Self {
            config: Arc::new(RwLock::new(config)),
            was_first_run: Arc::new(AtomicBool::new(false)),
            self_writes: Arc::new(SelfWriteRegistry::default()),
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
        let notes_dir = notes_dir_of(&config);

        // Try to delete the corrupted database and start fresh
        if let Ok(db_path) = crate::utilities::paths::get_database_path_for_notes_dir(&notes_dir) {
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
        let database_manager = DatabaseManager::new(&notes_dir)?;
        let state = Self {
            config: Arc::new(RwLock::new(config)),
            was_first_run: Arc::new(AtomicBool::new(false)),
            self_writes: Arc::new(SelfWriteRegistry::default()),
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

    /// The configured notes directory.
    ///
    /// This is the single source of truth for where notes live. Everything that
    /// needs it — note paths, backup paths, the database location, the file
    /// watcher — reads it from here rather than re-parsing `config.toml`, so
    /// they cannot drift apart from the config the app is actually running on.
    pub fn notes_dir(&self) -> PathBuf {
        let config = self.config.read().unwrap_or_else(|e| e.into_inner());
        notes_dir_of(&config)
    }
}

fn notes_dir_of(config: &AppConfig) -> PathBuf {
    crate::config::get_config_notes_dir_from_config(config)
}
