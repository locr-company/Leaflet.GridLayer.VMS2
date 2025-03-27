import 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
import '../Leaflet.GridLayer.VMS2/Leaflet.GridLayer.VMS2.js'

export default class BaseMap {
  #map
  #printFormat
  #vms2Layer

  constructor() {
    const searchParams = new URLSearchParams(window.location.search)

    L.Map.addInitHook(function () {
      this.getContainer().leafletMap = this
    })

    const center = [52.27645, 10.53453]
    let zoom = 17

    const latitude = searchParams.get('latitude')
    const longitude = searchParams.get('longitude')
    if (typeof latitude === 'string') {
      const parsedLatitude = Number.parseFloat(latitude)
      if (!Number.isNaN(parsedLatitude)) {
        center[0] = parsedLatitude
      }
    }
    if (typeof longitude === 'string') {
      const parsedLongitude = Number.parseFloat(longitude)
      if (!Number.isNaN(parsedLongitude)) {
        center[1] = parsedLongitude
      }
    }

    const zoomLevel = searchParams.get('zoom')
    if (typeof zoomLevel === 'string') {
      const parsedZoom = Number.parseInt(zoomLevel, 10)
      if (!Number.isNaN(parsedZoom)) {
        zoom = parsedZoom
      }
    }

    this.#map = L.map('map', {
      minZoom: 0,
      maxZoom: 19
    }).setView(center, zoom)

    const vms2Options = {
      style: '4502',
      tileUrl: '/api/tile/{z}/{y}/{x}?k={key}&v={value}&t={type}'
    }
    const accessKey = searchParams.get('access_key')
    if (typeof accessKey === 'string' && accessKey !== '') {
      vms2Options.accessKey = accessKey
    }

    const disableDecode = searchParams.get('disable_decode')
    if (typeof disableDecode === 'string' && (disableDecode === 'true' || disableDecode === '1')) {
      vms2Options.disableDecode = true
    }

    this.#vms2Layer = L.gridLayer.vms2(vms2Options)

    this.#vms2Layer.addTo(this.#map)
  }

  getPixelBounds() {
    return this.#map.getPixelBounds()
  }

  pointToLatLng(point) {
    return this.#map.options.crs.pointToLatLng(point, this.#map.getZoom())
  }

  /**
   * @returns {{width: number, height: number}}
   */
  getMapContainerSize() {
    const size = this.#map.getSize()

    return {
      width: size.x,
      height: size.y
    }
  }

  /**
   * @returns {{x: number, y: number}}
   */
  getSize() {
    return this.#map.getSize()
  }

  getMapCanvas(args) {
    return this.#vms2Layer.getMapCanvas(args)
  }

  getPrintCanvas() {
    return this.#vms2Layer.getPrintCanvas()
  }

  getPrintFormat() {
    return this.#printFormat
  }

  invalidateSize() {
    this.#map.invalidateSize()
  }

  setMapOverlay(mapOverlay) {
    this.#vms2Layer.setMapOverlay(mapOverlay)
  }

  setPrintFormat(printFormat) {
    this.#printFormat = printFormat
    this.#vms2Layer.setPrintFormat(printFormat)
  }
}
