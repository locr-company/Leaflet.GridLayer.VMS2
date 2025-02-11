/* global DOMParser, HTMLElement, L, ResizeObserver, XMLDocument */

import 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'

import './Leaflet.GridLayer.VMS2.js'
import PrintFormat from './PrintFormat.js'
import MapOverlay, { CustomFontFace, PoiLayer, SvgLayer, TextSvgLayer } from './MapOverlay.js'

const DEFAULT_STYLE = '4201'
const DEFAULT_ZOOM = 1
const MIN_ZOOM = 0
const MAX_ZOOM = 21
const PRINT_FORMAT_PATTERN = /(?<width>\d+(\.\d+)?)x(?<height>\d+(\.\d+)?)(?<unitType>cm|in|mm|pc|pt|px)?(@(?<dpi>\d+)dpi)?/

class LocrMapCustomElement extends HTMLElement {
  #accessKey = ''
  #initState = 'uninitialized' // 'uninitialized', 'initializing', 'initialized'
  #layer = null
  #map = null
  #mapIsReady = false
  #maxZoom = MAX_ZOOM
  #minZoom = MIN_ZOOM
  #printFormat = null
  #resizeObserver = null
  #style = DEFAULT_STYLE
  #zoom = DEFAULT_ZOOM

  static observedAttributes = ['access-key', 'map-style', 'print-format']

  constructor () {
    super()

    this.#parseAttributes()

    if (this.#minZoom > this.#maxZoom) {
      console.warn(`locr-map element: min-zoom attribute value (${this.#minZoom}) is greater than max-zoom attribute value (${this.#maxZoom}). Setting min-zoom to ${MIN_ZOOM}.`)
      this.#minZoom = MIN_ZOOM
    }
  }

  connectedCallback () {
    if (!this.style.display) {
      this.style.display = 'block'
    }

    this.#initMap()
  }

  /**
   * @param {string} name
   * @param {string} oldValue
   * @param {string} newValue
   */
  attributeChangedCallback (name, oldValue, newValue) {
    if (oldValue === newValue) {
      return
    }

    if (name === 'access-key') {
      this.#accessKey = this.#parseAccessKeyAttribute()
      if (this.#accessKey) {
        this.#initMap()
      }
    }

    if (name === 'map-style') {
      this.#style = this.#parseMapStyleAttribute()
      this.setStyle(this.#style)
    }

    if (name === 'print-format') {
      this.#printFormat = this.#parsePrintFormatAttribute()
      if (this.#printFormat) {
        this.setPrintFormat(this.#printFormat, false)
      }
    }
  }

  /**
   * @param {Array} dataLayers
   * @param {MapOverlay} mapOverlay
   */
  #addDataLayersToMapOverlay (dataLayers, mapOverlay) {
    if (!(dataLayers instanceof Array)) {
      return
    }

    for (const layerIndex in dataLayers) {
      const layer = dataLayers[layerIndex]

      if (typeof layer.type !== 'string') {
        console.warn(`locr-map element: dataLayers[${layerIndex}].type is not a string in setMapOverlayByData( data )!`)
        continue
      }

      let overlayLayer = null
      switch (layer.type) {
        case 'svg':
          overlayLayer = this.#buildSvgLayerByDataLayer(layer)
          break

        case 'text':
          overlayLayer = this.#buildTextSvgLayerByDataLayer(layer)
          break

        default:
          console.warn(`locr-map element: Invalid dataLayers.type (${layer.type}) in setMapOverlayByData( data )!`, layer)
          break
      }

      if (overlayLayer !== null) {
        mapOverlay.addOrReplace(overlayLayer)
      }
    }
  }

  /**
   * @param {Array} fontFaces
   * @param {MapOverlay} mapOverlay
   */
  #addFontFacesToMapOverlay (fontFaces, mapOverlay) {
    if (!(fontFaces instanceof Array)) {
      return
    }

    for (const fontFace of fontFaces) {
      if (fontFace.family && fontFace.source) {
        mapOverlay.addFontFace(new CustomFontFace(fontFace.family, fontFace.source, fontFace.descriptors))
      }
    }
  }

  /**
   * @param {MapOverlay} mapOverlay
   */
  #addOrReplacePoiDatasToMapOverlay (mapOverlay) {
    if (!this.#layer.mapOverlay) {
      return
    }

    const poiDatas = this.#layer.mapOverlay.getPoiDatas()
    if (poiDatas instanceof Array) {
      for (const poiData of poiDatas) {
        mapOverlay.addOrReplace(new PoiLayer(poiData))
      }
    }
  }

  /**
   * @param {*} layerOptions
   */
  async #applyLayerOptionsIfConstraintsAreMet (layerOptions) {
    const response = await fetch(`https://users.locr.com/api/api_key/${this.#accessKey}/constraints`)
    if (response.status === 404) {
      throw new Error('Access-Key not found for locrMAP!')
    }
    if (response.status >= 400) {
      throw new Error('Invalid Access-Key for locrMAP!')
    }
    const constraints = await response.json()
    if (typeof constraints['vms2-server'] === 'string') {
      let vms2Server = constraints['vms2-server'].trim()
      if (vms2Server !== '') {
        if (!vms2Server.startsWith('http://') && !vms2Server.startsWith('https://')) {
          vms2Server = `https://${vms2Server}`
        }
        if (!vms2Server.endsWith('/')) {
          vms2Server += '/'
        }
        layerOptions.tileUrl = `${vms2Server}api/tile/{z}/{y}/{x}?k={key}&v={value}&t={type}`
        layerOptions.styleUrl = `${vms2Server}api/style/{style_id}`
        layerOptions.assetsUrl = `${vms2Server}api/styles/assets`
      }
    }
  }

  /**
   * @param {*} dataLayer
   * @returns {SvgLayer?}
   */
  #buildSvgLayerByDataLayer (dataLayer) {
    if (typeof dataLayer.content !== 'string') {
      return null
    }
    if (typeof dataLayer.id !== 'string') {
      console.warn('locr-map element: dataLayer.id is not a string in #buildSvgLayerByDataLayer (dataLayer)!')
      return null
    }
    const layerId = dataLayer.id.trim()
    if (layerId === '') {
      console.warn('locr-map element: dataLayer.id is an empty string in #buildSvgLayerByDataLayer (dataLayer)!')
      return null
    }

    const domParser = new DOMParser()
    const parsedDom = domParser.parseFromString(dataLayer.content, 'application/xml')
    if (parsedDom instanceof XMLDocument && parsedDom.children.length > 0) {
      parsedDom.documentElement.id = layerId
      dataLayer.content = parsedDom.documentElement.outerHTML
    }
    return new SvgLayer(dataLayer.content)
  }

  async #initMap () {
    if (this.#initState === 'initializing' || this.#initState === 'initialized') {
      return
    }

    this.innerHTML = ''

    try {
      if (this.#accessKey === '') {
        throw new Error('An Access-Key is required to display a locrMAP!')
      }

      this.#initState = 'initializing'

      const layerOptions = {
        attribution: '',
        accessKey: this.#accessKey,
        style: this.#style
      }

      await this.#applyLayerOptionsIfConstraintsAreMet(layerOptions)

      this.#map = L.map(this, {
        minZoom: this.#minZoom,
        maxZoom: this.#maxZoom
      })
      this.#map.whenReady(() => {
        this.#mapIsReady = true
      })
      this.#map.attributionControl.setPrefix('')
      this.#layer = L.gridLayer.vms2(layerOptions)
      this.#layer.addTo(this.#map)

      const center = L.latLng(0, 0)
      this.#map.setView(center, this.#zoom)

      if (this.#printFormat) {
        this.setPrintFormat(this.#printFormat, false)
      }

      this.#initResizeObserver()

      this.#initState = 'initialized'
      this.dispatchEvent(new CustomEvent('custom-element-initialized', { detail: {} }))
    } catch (error) {
      this.#initState = 'uninitialized'

      const span = document.createElement('span')
      span.classList.add('locr-map-error')
      span.style.color = 'red'
      span.style.fontWeight = 'bold'

      if (error instanceof Error) {
        span.textContent = error.message
      } else {
        span.textContent = 'An error occurred while retrieving Access-Key data for the locrMAP!'
      }
      this.appendChild(span)
    }
  }

  #initResizeObserver () {
    this.#resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === this) {
          this.#map.invalidateSize()
        }
      }
    })
    this.#resizeObserver.observe(this)
  }

  #parseAttributes () {
    this.#accessKey = this.#parseAccessKeyAttribute()
    this.#printFormat = this.#parsePrintFormatAttribute()
    this.#style = this.#parseMapStyleAttribute()
    this.#zoom = this.#parseZoomAttribute()
    this.#minZoom = this.#parseZoomAttribute('min-zoom', MIN_ZOOM)
    this.#maxZoom = this.#parseZoomAttribute('max-zoom', MAX_ZOOM)
  }

  /**
   * @param {string|null} attributeName
   * @return {string} Access key
   */
  #parseAccessKeyAttribute (attributeName) {
    const attribute = this.attributes.getNamedItem(attributeName || 'access-key')
    if (attribute) {
      return attribute.value.trim()
    }

    return ''
  }

  /**
   * @param {string|null} attributeName
   * @return {string} Style
   */
  #parseMapStyleAttribute (attributeName) {
    const attribute = this.attributes.getNamedItem(attributeName || 'map-style')
    if (attribute && attribute.value.trim() !== '') {
      return attribute.value.trim()
    }

    return DEFAULT_STYLE
  }

  /**
   * @param {string|null} attributeName
   * @return {PrintFormat?} Print Format
   */
  #parsePrintFormatAttribute (attributeName) {
    const attribute = this.attributes.getNamedItem(attributeName || 'print-format')
    if (attribute) {
      const trimmedAttribute = attribute.value.trim()
      if (trimmedAttribute !== '') {
        return this.#parsePrintFormatString(trimmedAttribute)
      }
    }

    return null
  }

  /**
   * @param {string|null} attributeName
   * @param {number}      defaultValue
   * @return {number} Zoom level
   */
  #parseZoomAttribute (attributeName, defaultValue) {
    const attribute = this.attributes.getNamedItem(attributeName || 'zoom')
    if (!attribute || attribute.value.trim() === '') {
      return defaultValue || DEFAULT_ZOOM
    }

    const parsedZoom = parseInt(attribute.value.trim())
    if (isNaN(parsedZoom)) {
      console.warn(`locr-map element: Invalid ${attributeName} attribute value (${attribute.value}).`)
      return defaultValue || DEFAULT_ZOOM
    }
    if (parsedZoom < MIN_ZOOM || parsedZoom > MAX_ZOOM) {
      console.warn(`locr-map element: Invalid ${attributeName} attribute value (${attribute.value}) is out of range (${MIN_ZOOM} <= x <= ${MAX_ZOOM}).`)
      return defaultValue || DEFAULT_ZOOM
    }

    return parsedZoom
  }

  /**
   * @param {string} printFormatString
   * @return {PrintFormat} Print format
   */
  #parsePrintFormatString (printFormatString) {
    const sizeMatch = RegExp(PRINT_FORMAT_PATTERN).exec(printFormatString)
    if (!sizeMatch) {
      throw new Error(`locr-map element: Invalid print format size string => ${printFormatString}`)
    }

    const printSizeInfo = {
      width: parseFloat(sizeMatch.groups.width),
      height: parseFloat(sizeMatch.groups.height),
      unitType: 'cm',
      dpi: 300
    }
    if (sizeMatch.groups.unitType) {
      printSizeInfo.unitType = sizeMatch.groups.unitType
    }
    if (sizeMatch.groups.dpi) {
      printSizeInfo.dpi = parseInt(sizeMatch.groups.dpi)
    }

    return new PrintFormat(printSizeInfo)
  }

  /**
   * @param {L.Marker} marker
   */
  addMarker (marker) {
    if (!this.#map) {
      console.warn('locr-map element: Leaflet map is not initialized for addMarker( marker ), yet!')
      return
    }
    if (!(marker instanceof L.Marker)) {
      console.warn('locr-map element: Invalid marker object in addMarker( marker )! It must be an instance of L.Marker.')
      return
    }

    marker.addTo(this.#map)
  }

  /**
   * @param {{icnoData: {iconUrl: string, iconSize: [number, number], iconAnchor: [number, number]}, latitude: number, longitude: number}} poi
   */
  addOrReplacePoiToMapOverlay (poi) {
    if (!this.#map) {
      console.warn('locr-map element: Leaflet map is not initialized for addOrReplacePoiToMapOverlay( poi ), yet!')
      return
    }
    if (!this.#layer) {
      console.warn('locr-map element: Leaflet layer is not initialized for addOrReplacePoiToMapOverlay( poi ), yet!')
      return
    }

    if (!this.#layer.mapOverlay) {
      console.warn('locr-map element: MapOverlay is not initialized for addOrReplacePoiToMapOverlay( poi ), yet!')
      return
    }

    const poiLayer = new PoiLayer(poi)
    this.#layer.mapOverlay.addOrReplace(poiLayer)
    this.#layer.setMapOverlay(this.#layer.mapOverlay)
  }

  /**
   * Wrapper for the Leaflet map.fitBounds method.
   */
  fitBounds () {
    this.#map?.fitBounds(...arguments)
  }

  /**
   * Wrapper for the Leaflet map.getBounds method.
   */
  getBounds () {
    return this.#map?.getBounds()
  }

  /**
   * Wrapper for the Leaflet map.getCenter method.
   */
  getCenter () {
    return this.#map?.getCenter()
  }

  /**
   * Wrapper for the Leaflet map.getContainer method.
   */
  getContainer () {
    return this.#map?.getContainer()
  }

  /**
   * @return {L.GridLayer} The locr map leaflet layer.
   */
  getLayer () {
    return this.#layer
  }

  getMapCanvas (options) {
    return this.#layer.getMapCanvas(options)
  }

  /**
   * Wrapper for the Leaflet map.getPixelBounds method.
   */
  getPixelBounds () {
    return this.#map?.getPixelBounds()
  }

  /**
   * @param {*} options
   */
  async getPrintCanvas (options) {
    if (!this.#map) {
      throw new Error('locr-map element: Leaflet map is not initialized for getPrintCanvas( options ), yet!')
    }
    if (!this.#layer) {
      throw new Error('locr-map element: Leaflet layer is not initialized for getPrintCanvas( options ), yet!')
    }

    const mapBounds = this.#map.getBounds()
    const mapContainer = this.#map.getContainer()
    options = {
      dpi: 300,
      latitudeMin: mapBounds.getSouth(),
      longitudeMin: mapBounds.getWest(),
      latitudeMax: mapBounds.getNorth(),
      longitudeMax: mapBounds.getEast(),
      width: mapContainer.clientWidth,
      height: mapContainer.clientHeight,
      ...options
    }

    if (this.#layer.options && this.#layer.options.printFormat) {
      options.printFormat = this.#layer.options.printFormat
    }

    return await this.#layer.getPrintCanvas(options)
  }

  /**
   * Wrapper for the Leaflet map.getSize method.
   */
  getSize () {
    return this.#map?.getSize()
  }

  /**
   * Wrapper for the Leaflet map.getZoom method.
   */
  getZoom () {
    return this.#map?.getZoom()
  }

  /**
   * Wrapper for the Leaflet map.invalidateSize method.
   */
  invalidateSize () {
    this.#map?.invalidateSize()
  }

  /**
   * Wrapper for the Leaflet map.on method.
   */
  on () {
    if (!this.#map) {
      console.warn('locr-map element: Leaflet map is not initialized for on( event, handler ), yet!')
      return
    }

    if (this.#mapIsReady) {
      arguments[1]()
    } else {
      this.#map.on(...arguments)
    }
  }

  /**
   * Wrapper for the Leaflet map.pointToLatLng method.
   */
  pointToLatLng (point) {
    return this.#map?.options.crs.pointToLatLng(point, this.#map.getZoom())
  }

  /**
   * @param {*} data
   */
  setMapOverlayByData (data) {
    if (!this.#layer) {
      console.warn('locr-map element: Leaflet map-layer is not initialized for setMapOverlayByData( data ), yet!')
      return
    }

    const mapOverlay = new MapOverlay({
      width: 1000,
      height: 1000,
      dpi: 300
    })

    this.#addFontFacesToMapOverlay(data.fontFaces, mapOverlay)
    this.#addDataLayersToMapOverlay(data.layers, mapOverlay)
    this.#addOrReplacePoiDatasToMapOverlay(mapOverlay)

    this.#layer.setMapOverlay(mapOverlay)
  }

  /**
   * @return {PrintFormat?} Print format
   */
  getPrintFormat () {
    return this.#layer?.printFormat
  }

  /**
   * @param {string|PrintFormat} printFormat
   * @param {boolean}            adjustRatio
   */
  setPrintFormat (printFormat, adjustRatio = true) {
    if (typeof printFormat === 'undefined') {
      console.warn('locr-map element: printFormat is undefined in setPrintFormat( printFormat )!')
      return
    }
    if (printFormat === null) {
      console.warn('locr-map element: printFormat is null in setPrintFormat( printFormat )!')
      return
    }
    if (typeof printFormat === 'string') {
      printFormat = this.#parsePrintFormatString(printFormat)
    }

    if (!(printFormat instanceof PrintFormat)) {
      console.warn('locr-map element: Invalid print format object in setPrintFormat( printFormat )!')
      return
    }

    if (!this.#layer) {
      console.warn('locr-map element: Leaflet layer is not initialized for setPrintFormat( printFormat ), yet!')
      return
    }

    if (adjustRatio) {
      const printFormatSize = printFormat.getSize()
      const sizeRatio = printFormatSize.width / printFormatSize.height

      const mapParentElement = this.parentElement
      const mapParentContainerRatio = mapParentElement.offsetWidth / mapParentElement.offsetHeight

      if (sizeRatio > mapParentContainerRatio) {
        this.style.width = '100%'
        const calculatedHeight = mapParentElement.offsetWidth / sizeRatio
        this.style.height = `${calculatedHeight}px`
      } else {
        this.style.height = '100%'
        const calculatedWidth = mapParentElement.offsetHeight * sizeRatio
        this.style.width = `${calculatedWidth}px`
      }
    }

    this.#layer.setPrintFormat(printFormat)

    this.dispatchEvent(new CustomEvent('set-print-format', { detail: { printFormat } }))
  }

  /**
   * @param {string} style
   */
  setStyle (style) {
    if (!this.#layer) {
      console.warn('locr-map element: Leaflet layer is not initialized for setStyle( style ), yet!')
      return
    }

    this.#layer.options.style = style
    this.#layer.redraw()
  }

  /**
   * @param {string} id
   * @param {string} textContent
   */
  replaceTextSvgLayerContent (id, textContent) {
    if (!this.#layer) {
      throw new Error('locr-map element: Leaflet layer is not initialized for replaceTextSvgLayerContent( id, textContent ), yet!')
    }

    if (this.#layer.mapOverlay) {
      this.#layer.mapOverlay.replaceTextContent(id, textContent)
      this.#layer.setMapOverlay(this.#layer.mapOverlay)
    }
  }

  /**
   * @param {*} dataLayer
   * @return {TextSvgLayer?} a new TextSvgLayer instance.
   */
  #buildTextSvgLayerByDataLayer (dataLayer) {
    if (typeof dataLayer.content !== 'string') {
      return null
    }

    if (!this.#map || !this.#layer) {
      console.warn('locr-map element: Leaflet map is not initialized for #buildTextSvgLayerByDataLayer(dataLayer), yet!')
      return null
    }

    const textInfo = {
      text: dataLayer.content,
      id: dataLayer.id,
      x: '50%',
      y: '85%',
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      fill: 'white',
      'font-size': '5cm',
      'font-family': 'Barlow Condensed',
      'font-weight': '500',
      'font-style': 'normal'
    }

    if (dataLayer.attributes) {
      for (const key in dataLayer.attributes) {
        textInfo[key] = dataLayer.attributes[key]
      }
    }

    return new TextSvgLayer(textInfo)
  }

  /**
   * Wrapper for the Leaflet map.setView method.
   */
  setView () {
    this.#map?.setView(...arguments)
  }
}

if (!window.customElements.get('locr-map')) {
  window.customElements.define('locr-map', LocrMapCustomElement)
}
