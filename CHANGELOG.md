# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0-beta.1] - 2026-01-12

### Changed

- GitHub Actions publishes prerelease GitHub Releases to npm using dist-tag `beta`.
- Documented CDN usage (`@latest` vs `@beta`).

## [1.1.1] - 2025-08-20

### Fixed

- Improved robustness for icon rendering when `isGrid` property is missing or undefined.
- Minor code consistency improvements in `_drawIcon` function.
- Documentation and code comments updated for better maintainability.

## [1.1.0] - 2025-02-10

### Added

- PrintFormat class
- MapOverlay with SvgLayer, ImageSvgLayer, TextSvgLayer, PoiLayer, CustomFontFace classes

### Fixed

- Style parameter "DisplayUnit" works for icons.
- Minor cleanups and fixes.

## [1.0.0] - 2024-07-25

### Added

- first official release

[unreleased]: https://github.com/locr-company/Leaflet.GridLayer.VMS2/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/locr-company/Leaflet.GridLayer.VMS2/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/locr-company/Leaflet.GridLayer.VMS2/releases/tag/v1.0.0
