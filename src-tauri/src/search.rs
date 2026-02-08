use crate::core::{AppError, AppResult};
use crate::utilities::strings::{
    extract_title_from_content, extract_title_from_filename, sanitize_fts_query,
};
use nucleo_matcher::{Config, Matcher, Utf32Str};
use rusqlite::params;
use serde::Serialize;
use std::cmp::Ordering;

#[derive(Serialize)]
pub struct NoteMetadata {
    pub filename: String,
    pub modified: i64,
}

#[derive(Debug, Clone)]
pub struct SearchResult {
    pub filename: String,
    pub title: String,
    pub score: u32,
    match_type: MatchType,
    pub modified: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
enum MatchType {
    ExactTitle = 3,
    PrefixTitle = 2,
    FuzzyTitle = 1,
    Content = 0,
}

#[derive(Debug, Clone)]
struct SearchCandidate {
    filename: String,
    title: String,
    content: String,
    modified: i64,
}

pub struct HybridSearcher {
    matcher: Matcher,
}

impl HybridSearcher {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let matcher = Matcher::new(Config::DEFAULT);
        Ok(Self { matcher })
    }

    pub fn search(
        &mut self,
        app_state: &crate::core::state::AppState,
        query: &str,
        max_results: usize,
    ) -> AppResult<Vec<NoteMetadata>> {
        if query.trim().is_empty() {
            return self.get_recent_notes(app_state, max_results);
        }

        let candidates = self.get_candidates_from_sqlite(app_state, query)?;
        let mut results = Vec::new();

        for candidate in candidates {
            if let Some(result) = self.score_candidate(&candidate, query) {
                results.push(result);
            }
        }

        results.sort_by(|a, b| self.compare_results(a, b));
        results.truncate(max_results);

        Ok(results
            .into_iter()
            .map(|r| NoteMetadata {
                filename: r.filename,
                modified: r.modified,
            })
            .collect())
    }

    fn get_candidates_from_sqlite(
        &self,
        app_state: &crate::core::state::AppState,
        query: &str,
    ) -> AppResult<Vec<SearchCandidate>> {
        let sanitized_query = sanitize_fts_query(query);

        if sanitized_query.trim().is_empty() {
            return Ok(Vec::new());
        }

        let fts_pattern = if sanitized_query.contains(' ') {
            sanitized_query
                .split_whitespace()
                .filter(|word| !word.trim().is_empty())
                .map(|word| format!("{}*", word))
                .collect::<Vec<_>>()
                .join(" OR ")
        } else {
            format!("{}*", sanitized_query)
        };

        crate::database::with_db(app_state, |conn| {
            let mut stmt = conn.prepare(
                "SELECT filename, content, modified FROM notes
                     WHERE notes MATCH ?
                     ORDER BY rank
                     LIMIT 500",
            )?;

            let rows = stmt.query_map(params![fts_pattern], |row| {
                let filename: String = row.get(0)?;
                let content: String = row.get(1)?;
                let modified: i64 = row.get(2)?;

                let title = extract_title_from_content(&content)
                    .unwrap_or_else(|| extract_title_from_filename(&filename));

                Ok(SearchCandidate {
                    filename,
                    title,
                    content,
                    modified,
                })
            })?;

            let candidates = rows.collect::<Result<Vec<_>, _>>()?;
            Ok(candidates)
        })
    }

    fn score_candidate(
        &mut self,
        candidate: &SearchCandidate,
        query: &str,
    ) -> Option<SearchResult> {
        let query_lower = query.to_lowercase();
        let title_lower = candidate.title.to_lowercase();
        let filename_lower = candidate.filename.to_lowercase();

        if let Some((score, match_type)) =
            self.score_title_match(&title_lower, &filename_lower, &query_lower)
        {
            Some(SearchResult {
                filename: candidate.filename.clone(),
                title: candidate.title.clone(),
                score,
                match_type,
                modified: candidate.modified,
            })
        } else if let Some(score) = self.score_content_match(&candidate.content, &query_lower) {
            Some(SearchResult {
                filename: candidate.filename.clone(),
                title: candidate.title.clone(),
                score,
                match_type: MatchType::Content,
                modified: candidate.modified,
            })
        } else {
            None
        }
    }

    fn score_title_match(
        &mut self,
        title_lower: &str,
        filename_lower: &str,
        query_lower: &str,
    ) -> Option<(u32, MatchType)> {
        for (text, boost) in [(title_lower, 100), (filename_lower, 50)] {
            if text == query_lower {
                return Some((1000 + boost, MatchType::ExactTitle));
            }

            if text.starts_with(query_lower) {
                return Some((800 + boost, MatchType::PrefixTitle));
            }

            if text
                .split(|c: char| "_-.,+=;: ".contains(c) || c.is_whitespace())
                .filter(|s| !s.is_empty())
                .any(|word| word.starts_with(query_lower))
            {
                return Some((700 + boost, MatchType::PrefixTitle));
            }

            if let Some(score) = self.fuzzy_match(text, query_lower) {
                if score > 50 {
                    return Some((score + boost, MatchType::FuzzyTitle));
                }
            }
        }

        None
    }

    fn score_content_match(&mut self, content: &str, query_lower: &str) -> Option<u32> {
        let content_lower = content.to_lowercase();

        if content_lower.contains(query_lower) {
            let count = content_lower.matches(query_lower).count() as u32;
            Some(50 + count * 10)
        } else {
            self.fuzzy_match(&content_lower, query_lower)
        }
    }

    fn fuzzy_match(&mut self, text: &str, query: &str) -> Option<u32> {
        let mut haystack_buf = Vec::new();
        let mut needle_buf = Vec::new();
        let haystack = Utf32Str::new(text, &mut haystack_buf);
        let needle = Utf32Str::new(query, &mut needle_buf);
        self.matcher
            .fuzzy_match(needle, haystack)
            .map(|score| score as u32)
    }

    fn compare_results(&self, a: &SearchResult, b: &SearchResult) -> Ordering {
        b.match_type
            .cmp(&a.match_type)
            .then_with(|| b.score.cmp(&a.score))
            .then_with(|| b.modified.cmp(&a.modified))
            .then_with(|| a.title.cmp(&b.title))
    }

    fn get_recent_notes(
        &self,
        app_state: &crate::core::state::AppState,
        max_results: usize,
    ) -> AppResult<Vec<NoteMetadata>> {
        crate::database::with_db(app_state, |conn| {
            let mut stmt = conn
                .prepare("SELECT filename, modified FROM notes ORDER BY modified DESC LIMIT ?")?;

            let rows = stmt.query_map([max_results], |row| {
                Ok(NoteMetadata {
                    filename: row.get(0)?,
                    modified: row.get(1)?,
                })
            })?;

            let notes = rows.collect::<Result<Vec<_>, _>>()?;
            Ok(notes)
        })
    }
}

pub fn search_notes_hybrid(
    app_state: &crate::core::state::AppState,
    query: &str,
    max_results: usize,
) -> AppResult<Vec<NoteMetadata>> {
    let mut searcher =
        HybridSearcher::new().map_err(|e| AppError::DatabaseConnection(e.to_string()))?;
    searcher.search(app_state, query, max_results)
}
