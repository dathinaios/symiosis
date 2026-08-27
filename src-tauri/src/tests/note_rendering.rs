//! Note Rendering Unit Tests
//!
//! Tests for note content rendering functionality.

use crate::utilities::note_renderer::render_note;

// Import the private function for testing
use crate::utilities::note_renderer::linkify_urls_in_html;

#[test]
fn test_render_markdown_note() {
    let markdown_content = "# Hello World\n\nThis is **bold** text.";
    let result = render_note("test.md", markdown_content);

    assert!(result.contains("<h1>"));
    assert!(result.contains("Hello World"));
    assert!(result.contains("<strong>"));
    assert!(result.contains("bold"));
}

#[test]
fn test_render_plain_text_note() {
    let text_content = "This is plain text with <script>alert('xss')</script>";
    let result = render_note("test.txt", text_content);

    assert!(result.starts_with("<pre>"));
    assert!(result.ends_with("</pre>"));
    assert!(result.contains("&lt;script&gt;"));
    assert!(!result.contains("<script>"));
}

#[test]
fn test_render_note_file_extension_detection() {
    let content = "# Test";

    assert!(render_note("test.md", content).contains("<h1>"));
    assert!(render_note("test.markdown", content).contains("<h1>"));

    assert!(render_note("test.txt", content).starts_with("<pre>"));
    assert!(render_note("test.rs", content).starts_with("<pre>"));
    assert!(render_note("no-extension", content).starts_with("<pre>"));
}

// URL Linkification Tests

#[test]
fn test_linkify_urls_in_html() {
    let html = "Check out https://example.com and http://test.org for more info";
    let result = linkify_urls_in_html(html).unwrap();
    assert!(result.contains(r#"<a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a>"#));
    assert!(result.contains(
        r#"<a href="http://test.org" target="_blank" rel="noopener noreferrer">http://test.org</a>"#
    ));
}

#[test]
fn test_linkify_preserves_existing_links() {
    let html = r#"Visit <a href="https://example.com">Example</a> and also https://test.com"#;
    let result = linkify_urls_in_html(html).unwrap();
    // Should preserve existing link and linkify the bare URL
    assert!(result.contains(r#"<a href="https://example.com">Example</a>"#));
    assert!(result.contains(r#"<a href="https://test.com" target="_blank" rel="noopener noreferrer">https://test.com</a>"#));
}

#[test]
fn test_linkify_avoids_urls_inside_existing_links() {
    let html = r#"Visit <a href="https://example.com">https://example.com</a> for more info"#;
    let result = linkify_urls_in_html(html).unwrap();
    // Should not double-link the URL inside the existing <a> tag
    assert_eq!(result, html);
}

#[test]
fn test_render_markdown_with_urls() {
    let content = "# Test\n\nVisit https://example.com for more info.";
    let result = render_note("test.md", content);
    assert!(result.contains("<h1>Test</h1>"));
    assert!(result.contains(r#"<a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a>"#));
}

#[test]
fn test_render_plain_text_with_urls() {
    let content = "Visit https://example.com for more info.";
    let result = render_note("test.txt", content);
    assert!(result.starts_with("<pre>"));
    assert!(result.contains(r#"<a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a>"#));
    assert!(result.ends_with("</pre>"));
}

#[test]
fn test_urls_in_attributes_are_left_alone() {
    let html = r#"<p><img src="https://example.com/a.png" alt="x"></p>"#;
    let result = linkify_urls_in_html(html).expect("linkify should succeed");

    // Rewriting an attribute value produced `src="<a href="https://..."`, and
    // the webview then asked the dev server for the literal path `<a href=`.
    assert_eq!(result, html, "attribute URL must not be linkified");
    assert!(!result.contains(r#"src="<a"#));
}

#[test]
fn test_attribute_url_does_not_block_a_later_text_url() {
    let html = r#"<p><img src="https://example.com/a.png"> see https://test.org here</p>"#;
    let result = linkify_urls_in_html(html).expect("linkify should succeed");

    assert!(result.contains(r#"<img src="https://example.com/a.png">"#));
    assert!(result.contains(
        r#"<a href="https://test.org" target="_blank" rel="noopener noreferrer">https://test.org</a>"#
    ));
}
