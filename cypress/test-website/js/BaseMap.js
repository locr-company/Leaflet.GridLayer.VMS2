import 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
import 'http://localhost:9876/Leaflet.GridLayer.VMS2/Leaflet.GridLayer.VMS2.js'

export default class BaseMap {
  #map
  #printFormat
  #vms2Layer

  constructor() {
    L.Map.addInitHook(function () {
      this.getContainer().leafletMap = this
    })

    this.#map = L.map('map', {
      minZoom: 0,
      maxZoom: 19
    }).setView([52.27645, 10.53453], 15)

    this.#vms2Layer = L.gridLayer.vms2({
      style: '4502',
      disableDecode: true,
    })

    this.#vms2Layer.addTo(this.#map)
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

  getPrintCanvas() {
    return this.#vms2Layer.getPrintCanvas()
  }

  getPrintFormat() {
    return this.#printFormat
  }

  setMapOverlay(mapOverlay) {
    this.#vms2Layer.setMapOverlay(mapOverlay)
  }

  setPrintFormat(printFormat) {
    this.#printFormat = printFormat
    this.#vms2Layer.setPrintFormat(printFormat)
  }
}
