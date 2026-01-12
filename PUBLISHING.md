# Publishing a new version

This package is published to npm via GitHub Actions when a GitHub Release is created.

## Stable release

1. Bump version: `npm version <major>.<minor>.<patch>`
2. Update `CHANGELOG.md`, commit and push changes
3. Push tags: `git push && git push origin --tags`
4. Create a GitHub Release: https://github.com/locr-company/Leaflet.GridLayer.VMS2/releases/new

## Beta release (npm dist-tag: `beta`)

1. Bump prerelease version: `npm version prerelease --preid beta` (creates e.g. `1.2.0-beta.1`)
2. Update `CHANGELOG.md`, commit and push changes
3. Push tags: `git push && git push origin --tags`
4. Create a GitHub Release and mark it as a prerelease

The `npm-publish` workflow publishes prereleases with `npm publish --tag beta`, so CDNs can reference `@beta`.

## CDN URLs (via npm)

Once a version is on npm, it is automatically available on CDNs like jsDelivr and unpkg:

- jsDelivr (pinned): `https://cdn.jsdelivr.net/npm/@locr-company/leaflet-gridlayer-vms2@1.1.1/src/Leaflet.GridLayer.VMS2.js`
- jsDelivr (latest stable): `https://cdn.jsdelivr.net/npm/@locr-company/leaflet-gridlayer-vms2@latest/src/Leaflet.GridLayer.VMS2.js`
- jsDelivr (latest beta): `https://cdn.jsdelivr.net/npm/@locr-company/leaflet-gridlayer-vms2@beta/src/Leaflet.GridLayer.VMS2.js`
- unpkg (pinned): `https://unpkg.com/@locr-company/leaflet-gridlayer-vms2@1.1.1/src/Leaflet.GridLayer.VMS2.js`
