# Changelog

All notable changes to the "NPM Version Dropdown in package.json" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-02-06

### Added

- 🔗 Clickable package name links — Cmd+click (Ctrl+click) any package name to open its npmjs.com page
- Hover tooltip on package names showing "Open <package> on npmjs.com"

---

## [0.0.1] - 2026-02-06

### Added

- 🎉 Initial release of NPM Version Dropdown in package.json
- ✨ Inline version indicators showing the latest available version
- 🎨 Color-coded update types:
  - Light blue for major updates (breaking changes)
  - Orange for minor updates (new features)
  - Green for patch updates (bug fixes)
- 📋 Click-to-open dropdown for selecting any version
- ⚡ Parallel package fetching for fast loading
- 🔄 Smart caching to minimize network requests
- 📦 Support for all dependency sections:
  - `dependencies`
  - `devDependencies`
  - `peerDependencies`
  - `optionalDependencies`
- 🔧 Commands:
  - `NPM Version Lens: Refresh` - Clear cache and refresh
  - `NPM Version Lens: Show All Versions` - Open version picker

### Technical

- Uses npm's abbreviated metadata API for faster responses
- Request deduplication for efficient network usage
- 5-second timeout to prevent hanging on slow connections
- Proper semver sorting (major → minor → patch → prerelease)
