use chrono::Utc;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn extract_title_from_filename(filename: &str) -> String {
    filename
        .trim_end_matches(".md")
        .trim_end_matches(".txt")
        .trim_end_matches(".markdown")
        .replace('_', " ")
        .replace('-', " ")
}

pub fn extract_title_from_content(content: &str) -> Option<String> {
    content
        .lines()
        .find(|line| !line.trim().is_empty())
        .map(|line| line.trim_start_matches('#').trim().to_string())
        .filter(|title| !title.is_empty())
}

pub fn sanitize_fts_query(query: &str) -> String {
    // First pass: remove dangerous characters and special syntax
    let cleaned_chars: String = query
        .chars()
        .filter_map(|c| match c {
            '"' | '\'' | '(' | ')' | '[' | ']' | '{' | '}' => None,
            ':' | ';' | ',' | '!' | '@' | '#' | '$' | '%' | '^' | '&' => None,
            '*' if query.len() == 1 => None,
            c if c.is_alphanumeric() || c.is_whitespace() || c == '-' || c == '_' || c == '.' => {
                Some(c)
            }
            '*' if query.len() > 1 => Some(c),
            _ => None,
        })
        .collect();

    // Second pass: remove FTS operators as standalone words only
    let words: Vec<&str> = cleaned_chars.split_whitespace().collect();
    let filtered_words: Vec<&str> = words
        .into_iter()
        .filter(|&word| {
            let upper_word = word.to_uppercase();
            !matches!(upper_word.as_str(), "AND" | "OR" | "NOT" | "NEAR" | "MATCH")
        })
        .collect();

    filtered_words.join(" ").trim().to_string()
}

pub fn format_timestamp_for_humans(timestamp: u64) -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let diff = now.saturating_sub(timestamp);

    match diff {
        0..=59 => "Just now".to_string(),
        60..=3599 => format!("{}m ago", diff / 60),
        3600..=86399 => format!("{}h ago", diff / 3600),
        86400..=2591999 => format!("{}d ago", diff / 86400),
        _ => format!("{}w ago", diff / 604800),
    }
}

pub fn get_log_timestamp() -> String {
    Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

pub fn parse_backup_filename(filename: &str, base_name: &str) -> Option<(String, u64)> {
    let without_ext = filename.strip_suffix(".md")?;
    let parts: Vec<&str> = without_ext.rsplitn(3, '.').collect();
    // parts[0] = timestamp, parts[1] = suffix, parts[2] = base_name
    if parts.len() == 3 && parts[2] == base_name {
        if let Ok(timestamp) = parts[0].parse::<u64>() {
            return Some((parts[1].to_string(), timestamp));
        }
    }
    None
}

pub fn parse_deleted_backup_filename(filename: &str) -> Option<(String, u64)> {
    let without_ext = filename.strip_suffix(".md")?;
    let parts: Vec<&str> = without_ext.rsplitn(3, '.').collect();
    // parts[0] = timestamp, parts[1] = suffix, parts[2] = base_name
    if parts.len() == 3 && parts[1] == "delete_backup" {
        if let Ok(timestamp) = parts[0].parse::<u64>() {
            let original_filename = format!("{}.md", parts[2]);
            return Some((original_filename, timestamp));
        }
    }
    None
}
