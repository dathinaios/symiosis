use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::logging::log;

/// How long a recorded self-write stays interesting.
///
/// Only staleness is bounded here, not correctness: a recorded entry matches an
/// event solely when the state on disk is still exactly what we wrote, so a
/// genuine external edit inside the window is recognised as external and
/// handled. The window just needs to outlast the delay between our write and
/// the watcher hearing about it.
const ENTRY_TTL: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Copy, PartialEq)]
enum Expected {
    /// We wrote this content.
    Content(u64),
    /// We removed the file (deleted it, or renamed it away).
    Absent,
}

/// Records the filesystem changes the app makes itself, so the watcher can tell
/// them apart from edits made in another program.
///
/// This replaces a global "an operation is in progress" counter that was cleared
/// by a detached thread five seconds later. That counter suppressed events for
/// *every* note, so any external edit in the five seconds after any save was
/// dropped entirely — no backup, no index update. Matching per path against the
/// exact bytes we wrote suppresses only our own echo.
#[derive(Default)]
pub struct SelfWriteRegistry {
    entries: Mutex<HashMap<PathBuf, (Instant, Expected)>>,
}

impl SelfWriteRegistry {
    /// Record that we are about to write `content` to `path`.
    /// Must be called before the write, so the entry is in place when the
    /// watcher event arrives.
    pub fn record_write(&self, path: &Path, content: &str) {
        self.insert(path, Expected::Content(hash_content(content)));
    }

    /// Record that we are about to remove `path`.
    pub fn record_removal(&self, path: &Path) {
        self.insert(path, Expected::Absent);
    }

    /// Record a move: `from` disappears, `to` gains `from`'s current content.
    pub fn record_move(&self, from: &Path, to: &Path) {
        // An unreadable source leaves `to` unrecorded, so the watcher treats the
        // new file as an external change and indexes it from disk.
        if let Ok(content) = std::fs::read_to_string(from) {
            self.record_write(to, &content);
        }
        self.record_removal(from);
    }

    /// Whether the current state of `path` is one this app just produced.
    pub fn is_own_write(&self, path: &Path) -> bool {
        let observed = match std::fs::read_to_string(path) {
            Ok(content) => Expected::Content(hash_content(&content)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Expected::Absent,
            // Unreadable but present: cannot prove it is ours, so treat it as
            // external and let the normal path report the failure.
            Err(_) => return false,
        };

        let mut entries = self.lock();
        entries.retain(|_, (recorded_at, _)| recorded_at.elapsed() < ENTRY_TTL);

        // The entry is deliberately not consumed. A write can produce several
        // events, and every one of them is our own echo.
        entries
            .get(path)
            .map(|(_, expected)| *expected == observed)
            .unwrap_or(false)
    }

    fn insert(&self, path: &Path, expected: Expected) {
        let mut entries = self.lock();
        entries.retain(|_, (recorded_at, _)| recorded_at.elapsed() < ENTRY_TTL);
        entries.insert(path.to_path_buf(), (Instant::now(), expected));
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<PathBuf, (Instant, Expected)>> {
        self.entries.lock().unwrap_or_else(|e| {
            log(
                "SELF_WRITES",
                "Self-write registry lock was poisoned, recovering",
                None,
            );
            e.into_inner()
        })
    }
}

fn hash_content(content: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    content.hash(&mut hasher);
    hasher.finish()
}
