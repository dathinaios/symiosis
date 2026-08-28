# Changelog

All notable changes to Symiosis are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**Cutting a release:** rename the `[Unreleased]` heading to the new version with today's
date, open a fresh `[Unreleased]` section above it, bump `version` in
`src-tauri/Cargo.toml`, then tag `vX.Y.Z`. The tag must match the crate version —
`.github/workflows/publish.yml` fails the build otherwise.

## [Unreleased]

## [0.4.0] - 2026-08-28

### Added

- The hints panel lists the shortcut for opening settings.
- A custom theme stylesheet that cannot be read is reported in the settings error
  banner, instead of silently falling back to the built-in theme.
- The generated `config.toml` explains that `ui_theme` and `markdown_render_theme`
  name a built-in theme and act as the fallback for a custom stylesheet.

### Changed

- An invalid config is refused on save instead of being silently corrected. The
  error names the valid options.
- A shortcut bound to two actions is rejected on save. Previously the later
  binding silently won and the earlier action appeared broken.
- Recently Deleted closes after recovering a file, rather than staying open until
  the list emptied.
- Clicking the rendered note no longer parks keyboard focus there, so the
  shortcuts available immediately after a click have changed.
- macOS builds are arm64-native rather than x86_64 under Rosetta.

### Fixed

- Search returned nothing for any query containing a hyphen.
- Duplicate rows accumulated in the notes index, showing as doubled search results
  and eventually forcing a full database rebuild.
- Saving a note made the file watcher ignore every other note for five seconds, so
  an external edit in that window was neither backed up nor indexed.
- Notes could be indexed against a stale notes directory after it was changed.
- Notes ranked low by the initial match could never appear in results, however
  well they matched.
- URLs inside HTML attributes were rewritten as links, breaking image rendering.
- Search highlighting corrupted rendered markup — searching "code" broke code
  blocks.
- Leaving the editor collapsed the whole note instead of restoring your position.
- Moving between highlight and header navigation jumped back to the top of the note.
- A cache refresh reported no progress, leaving a large vault apparently frozen.
- A held scroll key scrolled no faster than tapping it.
- Focus was lost when a dialog closed over the editor, and when a recovered row
  unmounted from Recently Deleted.
- The tray refresh action did nothing.

### Performance

- Search scoring no longer copies every note body on each keystroke, which was
  megabytes of allocation per key press on a large vault.

## 0.3.7 and earlier

Released before this changelog was introduced. See the
[GitHub releases](https://github.com/dathinaios/symiosis/releases) for those versions.

[Unreleased]: https://github.com/dathinaios/symiosis/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/dathinaios/symiosis/compare/v0.3.7...v0.4.0
