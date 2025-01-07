import 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
import 'http://localhost:9876/Leaflet.GridLayer.VMS2/Leaflet.GridLayer.VMS2.js'
import PrintFormat from 'http://localhost:9876/Leaflet.GridLayer.VMS2/PrintFormat.js'
import MapOverlay, { ImageSvgLayer, PoiLayer, SvgLayer, TextSvgLayer } from 'http://localhost:9876/Leaflet.GridLayer.VMS2/MapOverlay.js'

L.Map.addInitHook(function () {
  this.getContainer().leafletMap = this
})

const mapContainer = document.getElementById('map')

const map = L.map(mapContainer, {
  minZoom: 0,
  maxZoom: 19
}).setView([52.27645, 10.53453], 15)

const resizeObserver = new ResizeObserver( ( entries ) => {
  for ( const entry of entries ) {
    if ( entry.target === mapContainer ) {
      map.invalidateSize()
    }
  }
})
resizeObserver.observe( mapContainer )

const vms2Layer = L.gridLayer.vms2({
  attribution: '&copy; <a href="https://maps.locr.com">locr</a>/<a href="https://osm.org/copyright">OpenStreetMap</a>/<a href="https://leafletjs.com/">Leaflet</a>',
  style: '4502',
  disableDecode: true,
})

vms2Layer.addTo(map)

function getTextOverlayContent() {
  const textSvgOverlayElement = document.getElementById('text-svg-overlay')
  if (textSvgOverlayElement instanceof HTMLTextAreaElement) {
    const textContentLines = []
    const textContentSplitted = textSvgOverlayElement.value.split('\n')
    for (const line of textContentSplitted) {
      const trimmedLine = line.trim()
      if (trimmedLine === '') {
        continue
      }
      textContentLines.push(trimmedLine)
    }

    return textContentLines.join('\n')
  }
}

/**
 * @returns {PrintFormat|null}
 */
function getPrintFormat() {
  const printFormatElement = document.getElementById('print-format')
  if (!(printFormatElement instanceof HTMLSelectElement)) {
    throw new Error('print-format element not found')
  }
  if (printFormatElement.selectedOptions.length === 0) {
    throw new Error('no print format selected')
  }

  const dataPrintFormatAttr = printFormatElement.selectedOptions[0].attributes.getNamedItem('data-print-format')
  if (!(dataPrintFormatAttr instanceof Attr)) {
    throw new Error('data-print-format attribute not found')
  }

  return new PrintFormat(JSON.parse(dataPrintFormatAttr.value))
}

function initTextSvgOverlayElement() {
  const textSvgOverlayElement = document.getElementById('text-svg-overlay')
  if (textSvgOverlayElement instanceof HTMLTextAreaElement) {
    textSvgOverlayElement.value = getTextOverlayContent()
    textSvgOverlayElement.addEventListener('keyup', refreshMapOverlay)
  }
}

function refreshMapOverlay() {
  const printFormat = getPrintFormat()
  const mapOverlay = new MapOverlay(printFormat.getSize())

  const rawCircleSvgLayer = `<g>
      <defs>
          <mask id="circle-mask">
              <rect width="100%" height="100%" fill="white"/>
              <circle cx="50%" cy="50%" r="30%" fill="black"/>
          </mask>
      </defs>
      <rect width="100%" height="100%" fill="white" mask="url(#circle-mask)"/>
  </g>`
  const circleSvgLayer = new SvgLayer(rawCircleSvgLayer)

  const textSvgLayer = new TextSvgLayer({text: getTextOverlayContent(), x: '50%', y: '30%', 'font-size': '2cm', 'text-anchor': 'middle', 'dominant-baseline': 'middle'})

  const imageSvgLayer = new ImageSvgLayer({href: 'http://localhost:9876/assets/gfx/cup_of_coffee.jpeg', x: 'calc(50% - 128px)', y: 'calc(50% + 64px)', width: '256px', height: '256px'})

  const iconData = {
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png', 
    latitude: 52.27645,
    longitude: 10.53453,
    iconSize: [25, 41],
    iconAnchor: [12.5, 41],
  }
  const poiLayer = new PoiLayer(iconData)

  mapOverlay.add(poiLayer)
  mapOverlay.add(textSvgLayer)
  mapOverlay.add(circleSvgLayer)
  mapOverlay.add(imageSvgLayer)

  vms2Layer.setMapOverlay(mapOverlay)
}

function refreshPrintFormat() {
  vms2Layer.setPrintFormat(getPrintFormat())
}

initTextSvgOverlayElement()
refreshPrintFormat()
refreshMapOverlay()
