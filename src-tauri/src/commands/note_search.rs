use crate::search::{search_notes_hybrid, NoteMetadata};

#[tauri::command]
pub fn search_notes(
    query: &str,
    app_state: tauri::State<crate::core::state::AppState>,
) -> Result<Vec<NoteMetadata>, String> {
    let config = app_state.config.read().unwrap_or_else(|e| e.into_inner());
    search_notes_hybrid(&app_state, query, config.preferences.max_search_results)
        .map_err(|e| e.to_string())
}
