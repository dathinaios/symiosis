use std::path::Path;
use std::time::UNIX_EPOCH;

/// Read a file's modification time as whole seconds since the Unix epoch.
///
/// This is the single definition of "when was this note last modified". The
/// database `modified` column and the filesystem scan must agree on it: if the
/// database instead stored wall-clock-now at write time, the two would disagree
/// whenever a write straddled a second boundary, and the next filesystem sync
/// would treat an unchanged note as modified.
///
/// Returns 0 when the metadata cannot be read, matching the filesystem scan.
pub fn file_modified_secs(path: &Path) -> i64 {
    path.metadata()
        .and_then(|m| m.modified())
        .map(|mtime| {
            mtime
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0)
        })
        .unwrap_or(0)
}
