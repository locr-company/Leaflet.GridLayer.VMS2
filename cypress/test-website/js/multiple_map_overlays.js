import 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
import 'http://localhost:9876/Leaflet.GridLayer.VMS2/Leaflet.GridLayer.VMS2.js'
import PrintFormat from 'http://localhost:9876/Leaflet.GridLayer.VMS2/PrintFormat.js'
import MapOverlay, { ImageSvgLayer, PoiLayer, SvgLayer, TextSvgLayer } from 'http://localhost:9876/Leaflet.GridLayer.VMS2/MapOverlay.js'

L.Map.addInitHook(function () {
  this.getContainer().leafletMap = this
})

let poiLayerAdded = false
const initialCenter = {
  lat: 52.27645,
  lng: 10.53453
}
const printFormat = getPrintFormat()
const mapOverlay = new MapOverlay(printFormat.getSize())

const mapContainer = document.getElementById('map')

const map = L.map(mapContainer, {
  minZoom: 0,
  maxZoom: 19
}).setView([initialCenter.lat, initialCenter.lng], 15)

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

/**
 * @returns {{width: number, height: number}}
 */
function getMapContainerFormat() {
  const mapContainerFormatElement = document.getElementById('map-container-format')
  if (!(mapContainerFormatElement instanceof HTMLSelectElement)) {
    throw new Error('map-container-format element not found')
  }
  if (mapContainerFormatElement.selectedOptions.length === 0) {
    throw new Error('no map container format selected')
  }

  const selectedOption = mapContainerFormatElement.selectedOptions[0]
  if (!(selectedOption instanceof HTMLOptionElement)) {
    throw new Error('selected option not found')
  }

  const dataMapContainerFormatAttr = selectedOption.attributes.getNamedItem('data-map-container-format')
  if (!(dataMapContainerFormatAttr instanceof Attr)) {
    throw new Error('data-map-container-format attribute not found')
  }

  const mapContainerFormat = JSON.parse(dataMapContainerFormatAttr.value)

  return {
    width: mapContainerFormat.width,
    height: mapContainerFormat.height
  }
}

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

function getPoiData() {
  const poiIconsElement = document.getElementById('poi-icons')
  if (!(poiIconsElement instanceof HTMLSelectElement)) {
    throw new Error('poi-icons element not found')
  }
  if (poiIconsElement.selectedOptions.length === 0) {
    throw new Error('no poi icon selected')
  }

  const dataPoiDataAttr = poiIconsElement.selectedOptions[0].attributes.getNamedItem('data-poi-data')
  if (!(dataPoiDataAttr instanceof Attr)) {
    throw new Error('data-poi-data attribute not found')
  }

  return JSON.parse(dataPoiDataAttr.value)
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

function initMapContainerFormatElement() {
  const mapContainerFormatElement = document.getElementById('map-container-format')
  if (mapContainerFormatElement instanceof HTMLSelectElement) {
    mapContainerFormatElement.addEventListener('change', refreshMapContainerFormat)
  }
}

function initTextSvgOverlayElement() {
  const textSvgOverlayElement = document.getElementById('text-svg-overlay')
  if (textSvgOverlayElement instanceof HTMLTextAreaElement) {
    textSvgOverlayElement.value = getTextOverlayContent()
    textSvgOverlayElement.addEventListener('keyup', refreshMapOverlay)
  }
}

function initPoiDataElement() {
  const poiIconsElement = document.getElementById('poi-icons')
  if (poiIconsElement instanceof HTMLSelectElement) {
    poiIconsElement.addEventListener('change', refreshMapOverlay)
  }
}

function initPrintFormatElement() {
  const printFormatElement = document.getElementById('print-format')
  if (printFormatElement instanceof HTMLSelectElement) {
    printFormatElement.addEventListener('change', refreshPrintFormat)
  }
}

function refreshMapContainerFormat() {
  const mapContainerFormat = getMapContainerFormat()
  mapContainer.style.width = `${mapContainerFormat.width}px`
  mapContainer.style.height = `${mapContainerFormat.height}px`
  map.invalidateSize()

  const elementIdsToResize = ['text-svg-overlay', 'print-format', 'map-container-format', 'poi-icons']
  for (const elementId of elementIdsToResize) {
    const element = document.getElementById(elementId)
    if (element instanceof HTMLElement) {
      element.style.width = `${mapContainerFormat.width}px`
    }
  }
}

function refreshMapOverlay() {
  const rawCircleSvgLayer = `<g id="my-circle">
      <defs>
          <mask id="circle-mask">
              <rect width="100%" height="100%" fill="white"/>
              <circle cx="50%" cy="50%" r="30%" fill="black"/>
          </mask>
      </defs>
      <rect width="100%" height="100%" fill="white" mask="url(#circle-mask)"/>
  </g>`
  const circleSvgLayer = new SvgLayer(rawCircleSvgLayer)

  const textSvgLayer = new TextSvgLayer({id: 'my-text', text: getTextOverlayContent(), x: '50%', y: '30%', 'font-size': '2cm', 'text-anchor': 'middle', 'dominant-baseline': 'middle'})

  const imageSvgLayer = new ImageSvgLayer({id: 'my-image', href: 'assets/gfx/cup_of_coffee.jpeg', x: 'calc(50% - 128px)', y: 'calc(50% + 64px)', width: '256px', height: '256px'})

  const iconData = {
    ...getPoiData(),
    id: 'my-poi'
  }
  if (!poiLayerAdded) {
    iconData.latitude = initialCenter.lat
    iconData.longitude = initialCenter.lng
  }

  mapOverlay.addOrReplace(new PoiLayer(iconData))
  poiLayerAdded = true

  mapOverlay.addOrReplace(textSvgLayer)
  mapOverlay.addOrReplace(circleSvgLayer)
  mapOverlay.addOrReplace(imageSvgLayer)
  
  vms2Layer.setMapOverlay(mapOverlay)
}

function refreshPrintFormat() {
  vms2Layer.setPrintFormat(getPrintFormat())
}

initTextSvgOverlayElement()
initPrintFormatElement()
initMapContainerFormatElement()
initPoiDataElement()
refreshPrintFormat()
refreshMapOverlay()
refreshMapContainerFormat()