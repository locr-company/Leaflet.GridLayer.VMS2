# LOCR VMS2

## Synopsis

The LOCR VMS2 is a GridLayer extension for the [Leaflet Javascript library for interactive maps](https://leafletjs.com).

## Quickstart

Here's a simple HTML source with a full screen Leaflet map as an example how to integrate the LOCR VMS2 extension. 
Please note that you have to replace the 'mySecretAccessKey' with your valid LOCR VMS2 key.

```html
<!DOCTYPE html>
<html>

<head>
	<title>VMS</title>

	<meta charset='utf-8' />
	<meta name='viewport' content='width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no' />

	<style>
		body {
			padding: 0;
			margin: 0;
		}

		html,
		body,
		#map {
			height: 100%;
			width: 100%;
		}
	</style>

	<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />

	<script type='module'>
		import 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
		import 'https://vms2.locr.com/api/vms2/Leaflet.GridLayer.VMS2.min.js';

		let map = L.map('map', {
			minZoom: 0, 
			maxZoom: 19 
		}).setView([ 40.74264002709531, -73.98107528686525 ], 13);

		let vms2Layer = L.gridLayer.vms2({ 
			style: '4201',
			accessKey: 'mySecretAccessKey' // <--- Put in your valid LOCR VMS2 key here
		}).addTo(map);
	</script>
</head>

<body>
	<div id='map'></div>
</body>

</html>
```

## LOCR VMS2 Documentation

Import the LOCR VMS2 layer module within your HTML script.

```javascript
import 'https://vms2.locr.com/api/vms2/Leaflet.GridLayer.VMS2.min.js';
```

Besides the [standard map functions provided by Leaflet](https://leafletjs.com/reference.html), the LOCR VMS2 layer has additional functions described in this section.

### Layer Creation

The minimum requirement is to provide a valid LOCR VMS2 key in the options.

```javascript
let vms2Layer = L.gridLayer.vms2({ 
	accessKey: 'mySecretAccessKey' 
}).addTo(map);
```

| Factory | Description |
| :--- | :--- |
| `L.gridLayer.vms2(<options>)` | Creates a LOCR VMS2 map layer for the Leaflet map container. |

| Options | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `style` | String &#124; JSON | '4201' | [LOCR VMS2 map style ID](#map-styles) or a custom style definition in the JSON format. |
| `accessKey` | String | '' | LOCR VMS2 access key. Please contact LOCR sales to obtain a valid key. |
| `vectorScale` | Number | 1 | Scaling factor to modify the width of lines and the sizes of text and icon elements within the map to match the desired map dimensions. |
| `detailOffset` | Number | 0 | Control the map details being displayed. Note that more details will generate more data requests. |
| `zoomRangeOffset` | Number | 0 | Control the map layer zoom details. Negative values will activate more details in lower zoom levels. Note that more details will generate more data requests. |
| `allowedMapArea` | Boolean | false | Defines if a map will be created without having text and icons cutted by the border. Use `true` for creating preview maps. |

Options like switching to a different style can be done later by using the following code:

```javascript
vms2Layer.options.style = mapStyle;

vms2Layer.redraw();
```

### Methods

The LOCR VMS2 extension is able to create map images in the Jpeg or PNG format.

| Method | Returns | Description |
| :--- | :--- | :--- |
| `getMapCanvas(<options>)` | Promise | Creates a LOCR VMS2 map HTML5 canvas based on the parameters provided by options. It returns a Promise which resolves by returning a map canvas. |

An example implementation.
```javascript
const PREVIEW_DPI = 150;
const DEFAULT_DISPLAY_DPI = 72;

let mapElement = document.getElementById('map'); // Assuming the 'map' element ist the Leaflet map
let mapImageElement = document.getElementById('map_image'); // Assuming that 'map_image' is an existing image element

function latitudeToNormalized(latitude) {
	return Math.log(Math.tan((90 - latitude) * Math.PI / 360)) / (2 * Math.PI) + 0.5;
}

function normalizedToLatitude(y) {
	return 90 - Math.atan(Math.exp((y - 0.5) * 2 * Math.PI)) * 360 / Math.PI;
}

let latitudeMin = map.getBounds().getSouth();
let latitudeMax = map.getBounds().getNorth();
let longitudeMin = map.getBounds().getWest();
let longitudeMax = map.getBounds().getEast();

let degreesWidth = longitudeMax - longitudeMin;

let normalizedWidth = degreesWidth / 360;
let normalizedHeight = latitudeToNormalized(latitudeMin) - latitudeToNormalized(latitudeMax);

let normalizedRatio = normalizedWidth / normalizedHeight;

let width = mapElement.clientWidth;
let height = mapElement.clientHeight;

let mapRatio = width / height;

if (mapRatio >= normalizedRatio) {
	longitudeMin -= (degreesWidth * mapRatio / normalizedRatio - degreesWidth) / 2;
	longitudeMax += (degreesWidth * mapRatio / normalizedRatio - degreesWidth) / 2;
} else {
	let normalizedMin = latitudeToNormalized(latitudeMin);
	let normalizedMax = latitudeToNormalized(latitudeMax);

	normalizedMin += (normalizedWidth / mapRatio - normalizedHeight) / 2;
	normalizedMax -= (normalizedWidth / mapRatio - normalizedHeight) / 2;

	latitudeMin = normalizedToLatitude(normalizedMin);
	latitudeMax = normalizedToLatitude(normalizedMax);
}

let previewMapInfo = {
	dpi: PREVIEW_DPI,
	style: mapStyle,

	latitudeMin,
	longitudeMin,
	latitudeMax,
	longitudeMax,

	width: width * PREVIEW_DPI / DEFAULT_DISPLAY_DPI,
	height: height * PREVIEW_DPI / DEFAULT_DISPLAY_DPI,

	vectorScale: vms2Layer.options.vectorScale,
	detailOffset: vms2Layer.options.detailOffset,
	zoomRangeOffset: vms2Layer.options.zoomRangeOffset
}

vms2Layer.getMapCanvas(previewMapInfo)
.then(canvas => { 
	mapImageElement.src = canvas.toDataURL() ; 
});
```

### Map Styles

The LOCR VMS2 provides a set of predefined map styles. Head over to the styles overview website to select a style ID which is suitable for your needs.

## Custom Map Styles

A JSON formated style definition can be used as an alternative to a certain predefined map style ID for the LOCR VMS2 layer creation.

### Simple Example

The following example creates a very simple map style with land and water bodies.

```json
{
    "BackgroundColor": [
        130,
        168,
        205
    ],
    "BackgroundAlpha": 1,
    "Order": [
        "land",
        "naturalWater"
    ],
    "Layers": {
        "land": {
            "LayoutLayers": [
                "land"
            ],
            "ZoomRange": [
                0,
                100
            ],
            "Style": {
                "FillColor": [
                    235,
                    233,
                    228
                ]
            }
        },
        "naturalWater": {
            "LayoutLayers": {
                "Polygons": {
                    "natural": [
                        "water"
                    ]
                }
            },
            "ZoomRange": [
                0,
                100
            ],
            "Style": {
                "FillColor": [
                    130,
                    168,
                    205
                ]
            },
            "CompositeOperation": "destination-out"
        }
    }
}    
```

### Working With Styles

Adding custom data.

...
