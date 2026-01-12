[![github_tag](https://img.shields.io/github/v/tag/locr-company/Leaflet.GridLayer.VMS2)](https://github.com/locr-company/Leaflet.GridLayer.VMS2/tags)
[![GitHub Release](https://img.shields.io/github/v/release/locr-company/Leaflet.GridLayer.VMS2)](https://github.com/locr-company/Leaflet.GridLayer.VMS2/releases)
[![NPM Version](https://img.shields.io/npm/v/%40locr-company%2Fleaflet-gridlayer-vms2)](https://www.npmjs.com/package/@locr-company/leaflet-gridlayer-vms2)
[![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/locr-company/leaflet.gridlayer.vms2/node.js.yml)](https://github.com/locr-company/Leaflet.GridLayer.VMS2/actions/workflows/node.js.yml)
[![CodeQL](https://github.com/locr-company/Leaflet.GridLayer.VMS2/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/locr-company/Leaflet.GridLayer.VMS2/actions/workflows/github-code-scanning/codeql)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=locr-company_Leaflet.GridLayer.VMS2&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=locr-company_Leaflet.GridLayer.VMS2)

# Synopsis

`Leaflet.Gridlayer.VMS2` is a _locr VMS2_ [Leaflet GridLayer](https://leafletjs.com/reference.html#gridlayer) extension for the [Leaflet Javascript library for interactive maps](https://leafletjs.com/). _locr VMS2_ is an abbreviation for _locr VectorMapServer2_. 

The extension uses tiled vector data processed from [OpenStreetMap](https://www.openstreetmap.org/) and [Blue Marble Next Generation/SRTM, NASA](https://earthobservatory.nasa.gov/) to show and create print quality images of individually styled maps. Also [custom data](https://github.com/locr-company/Leaflet.GridLayer.VMS2/wiki#custom-data) can be added to the map as well. Tiles and images will be rendered on the client machine so that there's almost no limit in map styling possibilities.

The _locr VMS2_ focuses on flexibility, high resolution image generation and the [WYSIWYG](https://en.wikipedia.org/wiki/WYSIWYG) technique to create printable maps.

Take a look at the [examples](https://github.com/locr-company/Leaflet.GridLayer.VMS2/wiki#examples) or head over to the [Wiki](https://github.com/locr-company/Leaflet.GridLayer.VMS2/wiki) to get started.

# Local Installation

```sh
npm install @locr-company/leaflet-gridlayer-vms2
```

# CDN (Browser)

This project ships as ESM modules. If you want to load it directly in the browser, load Leaflet first (to provide the global `L`), then import the module from a CDN:

```html
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script type="module">
  import 'https://cdn.jsdelivr.net/npm/@locr-company/leaflet-gridlayer-vms2@latest/src/Leaflet.GridLayer.VMS2.js'
</script>
```

Use `@beta` instead of `@latest` to load the latest prerelease from npm.

# For Maintainers

[Publishing a new version](PUBLISHING.md)
