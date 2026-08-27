use crate::{
    core::{AppError, AppResult},
    database::with_db,
    logging::log,
    utilities::note_renderer::render_note,
};
use rusqlite::params;

pub fn update_note_in_database(
    app_state: &crate::core::state::AppState,
    note_name: &str,
    content: &str,
    modified: i64,
) -> AppResult<()> {
    with_db(app_state, |conn| {
        let html_render = render_note(note_name, content);

        crate::services::database_service::upsert_note(
            conn,
            note_name,
            content,
            &html_render,
            modified,
            true,
        )?;

        // Verify database was updated correctly
        let db_content = conn
            .query_row(
                "SELECT content FROM notes WHERE filename = ?1",
                params![note_name],
                |row| row.get::<_, String>(0),
            )
            .map_err(|e| {
                AppError::DatabaseQuery(format!("Failed to verify database update: {}", e))
            })?;

        if db_content != content {
            let error_msg = format!(
                "Database update verification failed for '{}': expected {} bytes, found {} bytes",
                note_name,
                content.len(),
                db_content.len()
            );
            log(
                "DATABASE_VERIFICATION",
                "Database update verification failed",
                Some(&error_msg),
            );
            return Err(AppError::DatabaseQuery(error_msg));
        }

        // Log successful database operation
        log(
            "DATABASE_OPERATION",
            &format!(
                "UPDATE/INSERT: {} | Size: {} bytes | SUCCESS",
                note_name,
                content.len()
            ),
            None,
        );

        Ok(())
    })
}
