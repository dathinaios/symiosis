use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "details")]
pub enum AppError {
    // Database errors
    DatabaseConnection(String),
    DatabaseQuery(String),
    DatabaseRebuild(String),

    // File system errors
    FileNotFound(String),
    FilePermission(String),
    FileWrite(String),
    FileRead(String),

    // Validation errors
    InvalidNoteName(String),
    PathTraversal,
    InvalidPath(String),

    // Configuration errors
    ConfigLoad(String),
    ConfigSave(String),

    // Search errors
    SearchIndex(String),
    SearchQuery(String),

    // UI/Window errors
    WindowOperation(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::DatabaseConnection(msg) => write!(f, "Database connection error: {}", msg),
            AppError::DatabaseQuery(msg) => write!(f, "Database query error: {}", msg),
            AppError::DatabaseRebuild(msg) => write!(f, "Database rebuild error: {}", msg),

            AppError::FileNotFound(path) => write!(f, "File not found: {}", path),
            AppError::FilePermission(msg) => write!(f, "File permission error: {}", msg),
            AppError::FileWrite(msg) => write!(f, "File write error: {}", msg),
            AppError::FileRead(msg) => write!(f, "File read error: {}", msg),

            AppError::InvalidNoteName(msg) => write!(f, "Invalid note name: {}", msg),
            AppError::PathTraversal => write!(f, "Path traversal not allowed"),
            AppError::InvalidPath(path) => write!(f, "Invalid path: {}", path),

            AppError::ConfigLoad(msg) => write!(f, "Configuration load error: {}", msg),
            AppError::ConfigSave(msg) => write!(f, "Configuration save error: {}", msg),

            AppError::SearchIndex(msg) => write!(f, "Search index error: {}", msg),
            AppError::SearchQuery(msg) => write!(f, "Search query error: {}", msg),

            AppError::WindowOperation(msg) => write!(f, "Window operation error: {}", msg),
        }
    }
}

impl std::error::Error for AppError {}

// Conversion from common error types
impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        let error = match err.kind() {
            std::io::ErrorKind::NotFound => AppError::FileNotFound(err.to_string()),
            std::io::ErrorKind::PermissionDenied => AppError::FilePermission(err.to_string()),
            _ => AppError::FileWrite(err.to_string()),
        };
        crate::logging::log("ERROR", &error.to_string(), Some("From std::io::Error"));
        error
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(err: rusqlite::Error) -> Self {
        let error = AppError::DatabaseQuery(err.to_string());
        crate::logging::log("ERROR", &error.to_string(), Some("From rusqlite::Error"));
        error
    }
}

impl From<String> for AppError {
    fn from(err: String) -> Self {
        let error = if err.contains("permission") || err.contains("Permission") {
            AppError::FilePermission(err)
        } else if err.contains("not found") || err.contains("No such file") {
            AppError::FileNotFound(err)
        } else if err.contains("backup") || err.contains("temp") {
            AppError::FileWrite(err)
        } else {
            AppError::FileWrite(err)
        };
        crate::logging::log("ERROR", &error.to_string(), Some("From String"));
        error
    }
}

impl From<&str> for AppError {
    fn from(err: &str) -> Self {
        AppError::from(err.to_string())
    }
}

impl From<tauri::Error> for AppError {
    fn from(err: tauri::Error) -> Self {
        let error = AppError::WindowOperation(err.to_string());
        crate::logging::log("ERROR", &error.to_string(), Some("From tauri::Error"));
        error
    }
}

// For converting AppError back to String (for backward compatibility)
impl From<AppError> for String {
    fn from(err: AppError) -> Self {
        err.to_string()
    }
}

impl AppError {
    pub fn validation_error(field: &str, message: &str) -> Self {
        let error = AppError::InvalidNoteName(format!("{}: {}", field, message));
        crate::logging::log("ERROR", &error.to_string(), None);
        error
    }

    pub fn database_recovery_failed(
        operation: &str,
        original_error: &str,
        rebuild_error: &str,
    ) -> Self {
        let error = AppError::DatabaseRebuild(format!(
            "Operation '{}' failed ({}), and database rebuild also failed: {}",
            operation, original_error, rebuild_error
        ));
        crate::logging::log("ERROR", &error.to_string(), None);
        error
    }
}

pub type AppResult<T> = Result<T, AppError>;
