use crate::core::errors::{AppError, AppResult};
use ammonia::Builder;
use html_escape;
use once_cell::sync::Lazy;
use pulldown_cmark::{html, Options, Parser};
use regex::Regex;
use std::collections::HashSet;

static URL_REGEX: Lazy<Result<Regex, regex::Error>> =
    Lazy::new(|| Regex::new(r#"(?i)\b(https?://[^\s<>"'`()\[\]{}]+)\b"#));

pub(crate) fn linkify_urls_in_html(html: &str) -> AppResult<String> {
    let url_regex = URL_REGEX
        .as_ref()
        .map_err(|e| AppError::SearchQuery(format!("Failed to compile URL regex: {}", e)))?;

    // More sophisticated check: avoid URLs that are already inside <a> tags
    let result = url_regex
        .replace_all(html, |caps: &regex::Captures| {
            let url = &caps[1];
            let match_start = match caps.get(1) {
                Some(m) => m.start(),
                None => return url.to_string(),
            };

            // Check if this URL is already inside an <a> tag by looking backwards for unclosed <a>
            let before_match = &html[..match_start];
            let last_a_open = before_match.rfind("<a ");
            let last_a_close = before_match.rfind("</a>");

            // If we found an <a> tag that hasn't been closed, don't linkify
            match (last_a_open, last_a_close) {
                (Some(open_pos), Some(close_pos)) if open_pos > close_pos => {
                    // There's an unclosed <a> tag before this URL
                    url.to_string()
                }
                (Some(_), None) => {
                    // There's an <a> tag with no closing tag before this URL
                    url.to_string()
                }
                _ => {
                    // No unclosed <a> tag, safe to linkify
                    format!(
                        r#"<a href="{}" target="_blank" rel="noopener noreferrer">{}</a>"#,
                        url, url
                    )
                }
            }
        })
        .to_string();

    Ok(result)
}

fn sanitize_html(html: &str) -> String {
    let allowed_tags: HashSet<&str> = [
        "a",
        "abbr",
        "acronym",
        "area",
        "article",
        "aside",
        "b",
        "bdi",
        "bdo",
        "blockquote",
        "br",
        "caption",
        "center",
        "cite",
        "code",
        "col",
        "colgroup",
        "data",
        "dd",
        "del",
        "details",
        "dfn",
        "div",
        "dl",
        "dt",
        "em",
        "figcaption",
        "figure",
        "footer",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "header",
        "hgroup",
        "hr",
        "i",
        "img",
        "ins",
        "kbd",
        "li",
        "map",
        "mark",
        "nav",
        "ol",
        "p",
        "pre",
        "q",
        "rp",
        "rt",
        "rtc",
        "ruby",
        "s",
        "samp",
        "section",
        "small",
        "span",
        "strong",
        "sub",
        "summary",
        "sup",
        "table",
        "tbody",
        "td",
        "tfoot",
        "th",
        "thead",
        "time",
        "tr",
        "tt",
        "u",
        "ul",
        "var",
        "wbr",
        "input",
    ]
    .into_iter()
    .collect();

    let mut tag_attributes: std::collections::HashMap<&str, HashSet<&str>> =
        std::collections::HashMap::new();
    tag_attributes.insert(
        "input",
        ["type", "checked", "disabled"].into_iter().collect(),
    );
    tag_attributes.insert("td", ["align"].into_iter().collect());
    tag_attributes.insert("th", ["align"].into_iter().collect());
    tag_attributes.insert("img", ["src", "alt", "title"].into_iter().collect());

    Builder::default()
        .tags(allowed_tags)
        .tag_attributes(tag_attributes)
        .add_generic_attributes(["id", "class"])
        .link_rel(Some("noopener noreferrer"))
        .clean(html)
        .to_string()
}

pub fn render_note(filename: &str, content: &str) -> String {
    if filename.ends_with(".md") || filename.ends_with(".markdown") {
        let mut options = Options::empty();
        options.insert(Options::ENABLE_STRIKETHROUGH);
        options.insert(Options::ENABLE_TABLES);
        options.insert(Options::ENABLE_FOOTNOTES);
        options.insert(Options::ENABLE_TASKLISTS);
        options.insert(Options::ENABLE_SMART_PUNCTUATION);

        let parser = Parser::new_ext(content, options);
        let mut html_output = String::new();
        html::push_html(&mut html_output, parser);

        let html_output = sanitize_html(&html_output);

        match linkify_urls_in_html(&html_output) {
            Ok(result) => result,
            Err(e) => {
                crate::logging::log(
                    "WARN",
                    &format!("URL linkification failed: {}", e),
                    Some("render_note"),
                );
                html_output // Return original HTML if linkification fails
            }
        }
    } else {
        let escaped = html_escape::encode_text(content);
        match linkify_urls_in_html(&escaped) {
            Ok(linkified) => format!("<pre>{}</pre>", linkified),
            Err(e) => {
                crate::logging::log(
                    "WARN",
                    &format!("URL linkification failed: {}", e),
                    Some("render_note"),
                );
                format!("<pre>{}</pre>", escaped) // Return original escaped content if linkification fails
            }
        }
    }
}
