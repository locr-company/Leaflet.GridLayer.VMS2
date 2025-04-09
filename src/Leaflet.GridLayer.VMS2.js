/* global DOMMatrix, DOMParser, FileReader, FontFace, Image, L, Worker, XMLSerializer */
/* eslint-disable no-new-func */

import unicodeDataTable from './unicode.js'
import MapOverlay from './MapOverlay.js'
import PrintFormat from './PrintFormat.js'

const EARTH_EQUATORIAL_RADIUS_METERS = 6378137
const EARTH_EQUATORIAL_CIRCUMFERENCE_METERS = 2 * Math.PI * EARTH_EQUATORIAL_RADIUS_METERS
const TILE_AREA_DRAWING_EXTENSION = 1
const TILE_AREA_SAVE_EXTENSION = 0.25

const DEFAULT_PRINT_DPI = 300

const DEFAULT_ZOOM_POWER_BASE = 2
const DEFAULT_STYLE_ID = '4201'

const DEFAULT_STYLE_URL = 'https://vms2.locr.com/api/style/{style_id}'
const DEFAULT_TILE_URL = 'https://vms2.locr.com/api/tile/{z}/{y}/{x}?k={key}&v={value}&t={type}'
const DEFAULT_ASSETS_URL = 'https://vms2.locr.com/api/styles/assets'

const DEFAULT_MIN_NUMBER_OF_WORKERS = 6

const devicePixelRatio = window.devicePixelRatio || 1

const RandomGenerator = function () {
  this.state = 624
}

RandomGenerator.prototype.init_seed = function (number) {
  this.state = number
}

RandomGenerator.prototype.random = function () {
  let x = this.state

  x ^= x << 13
  x ^= x >>> 17
  x ^= x << 5

  this.state = x

  return (x / 0xffffffff) + 0.5
}

RandomGenerator.prototype.random_int = function () {
  let x = this.state

  x ^= x << 13
  x ^= x >>> 17
  x ^= x << 5

  this.state = x

  return x
}

RandomGenerator.prototype.random_pick = function (elements, elementCounts) {
  if (elementCounts) {
    const expandedElements = []

    for (let elementIndex = 0; elementIndex < elements.length; elementIndex++) {
      for (let count = 0; count < elementCounts[elementIndex]; count++) {
        expandedElements.push(elements[elementIndex])
      }
    }

    return expandedElements[Math.floor(this.random() * expandedElements.length)]
  } else {
    return elements[Math.floor(this.random() * elements.length)]
  }
}

L.GridLayer.VMS2 = L.GridLayer.extend({
  numberOfRequestedTiles: 0,

  tileSize: 0,

  randomGenerator: new RandomGenerator(),

  tileDbInfos: null,
  tileDbInfosResolves: [],

  tileCanvases: [],
  saveDataCanvases: [],

  mapOverlay: undefined,
  printFormat: undefined,

  options: {
    zoomPowerBase: DEFAULT_ZOOM_POWER_BASE,
    style: DEFAULT_STYLE_ID,
    styleUrl: DEFAULT_STYLE_URL,
    tileUrl: DEFAULT_TILE_URL,
    assetsUrl: DEFAULT_ASSETS_URL,
    accessKey: '',
    mapScale: 1,
    objectScale: 1,
    detailOffset: 0,
    zoomRangeOffset: 0,
    styleOverride: {}
  },

  initialize: function (options) {
    if (!globalThis.vms2Context) {
      globalThis.vms2Context = {
        decodeWorkers: [],
        decodeWorkersRunning: 0,
        decodeQueue: [],

        styleRequestQueues: {},

        fontCharacterCanvas: null,
        fontCharacterContext: null,
        fontCharacterWidths: {},
        fontFaceCache: {},

        imageCache: {},
        patternCache: {},

        tileLayerRequestInfos: {},
        tileCache: [],
        tileCacheIndex: 0,
        tileCacheSize: 600,
        tileCacheLayerMaps: {}
      }

      globalThis.vms2Context.fontCharacterCanvas = document.createElement('canvas')
      globalThis.vms2Context.fontCharacterContext = globalThis.vms2Context.fontCharacterCanvas.getContext('2d')

      const maxNumberOfWorkers = Math.max(navigator.hardwareConcurrency - 1, DEFAULT_MIN_NUMBER_OF_WORKERS)

      for (let count = 0; count < maxNumberOfWorkers; count++) {
        const decodeWorker = new Worker(this._getWorkerURL(new URL('decoder.js', import.meta.url)))

        decodeWorker.onmessage = e => {
          for (const tileData of e.data.tDs) {
            let layerMap = globalThis.vms2Context.tileCacheLayerMaps[e.data.lId]

            if (!layerMap) {
              layerMap = new Map()

              globalThis.vms2Context.tileCacheLayerMaps[e.data.lId] = layerMap
            }

            const tileKey = tileData.x + '|' + tileData.y + '|' + tileData.z + '|' + tileData.dZ

            layerMap.set(tileKey, { objects: tileData.tOs, x: tileData.x, y: tileData.y, z: tileData.z, detailZoom: tileData.dZ })

            const newEntry = { layerMap, tileKey }

            if (globalThis.vms2Context.tileCache[globalThis.vms2Context.tileCacheIndex]) {
              const oldEntry = globalThis.vms2Context.tileCache[globalThis.vms2Context.tileCacheIndex]

              oldEntry.layerMap.delete(oldEntry.tileKey)
            }

            globalThis.vms2Context.tileCache[globalThis.vms2Context.tileCacheIndex] = newEntry

            globalThis.vms2Context.tileCacheIndex = (globalThis.vms2Context.tileCacheIndex + 1) % globalThis.vms2Context.tileCacheSize
          }

          const resolveFunction = e.target.resolveFunction

          e.target.resolveFunction = null

          resolveFunction()
        }

        globalThis.vms2Context.decodeWorkers.push(decodeWorker)
      }
    }

    L.GridLayer.prototype.initialize.call(this, options)

    this.tileSize = this.getTileSize().x

    this.options.tileUrl += '&key=' + this.options.accessKey

    this.options.zoomStep = Math.log2(this.options.zoomPowerBase)

    this.printFormatMaskDiv = document.createElement('div')

    this.printFormatMaskDiv.id = 'vms2-print-format-mask'

    this.printFormatMaskDiv.style.zIndex = 990
    this.printFormatMaskDiv.style.position = 'absolute'
    this.printFormatMaskDiv.style.width = '100%'
    this.printFormatMaskDiv.style.height = '100%'
    this.printFormatMaskDiv.style.backgroundColor = '#0008'
    this.printFormatMaskDiv.style.pointerEvents = 'none'

    this.mapOverlayDiv = document.createElement('div')

    this.mapOverlayDiv.id = 'vms2-map-overlay'

    this.mapOverlayDiv.style.zIndex = 980
    this.mapOverlayDiv.style.position = 'absolute'
    this.mapOverlayDiv.style.width = '100%'
    this.mapOverlayDiv.style.height = '100%'
    this.mapOverlayDiv.style.pointerEvents = 'none'

    this.mapOverlayMarkerDatas = []
  },
  createTile: function (tileInfo, doneFunction) {
    let tileCanvas = null

    for (const canvas of this.tileCanvases) {
      if (!canvas.inUse && canvas.hasBeenRemoved) {
        tileCanvas = canvas

        tileCanvas.getContext('2d').clearRect(0, 0, tileCanvas.width, tileCanvas.height)

        break
      }
    }

    if (!tileCanvas) {
      tileCanvas = document.createElement('canvas')

      tileCanvas.width = Math.round(this.tileSize * devicePixelRatio)
      tileCanvas.height = Math.round(this.tileSize * devicePixelRatio)

      tileCanvas.isTile = true

      tileCanvas.hasBeenCreated = true
    }

    tileCanvas.inUse = true
    tileCanvas.hasBeenRemoved = false

    this._drawTile(tileCanvas, tileInfo)
      .then(() => doneFunction(null, tileCanvas))

    return tileCanvas
  },
  setPrintFormat (printFormat) {
    if (!(printFormat instanceof PrintFormat)) {
      throw new TypeError('printFormat is not an instance of PrintFormat')
    }

    this.printFormat = printFormat

    if (this._map) {
      this._map.invalidateSize()

      this._map.fire('resize')
    }
  },
  setMapOverlay (mapOverlay) {
    if (!(mapOverlay instanceof MapOverlay)) {
      throw new TypeError('mapOverlay is not an instance of MapOverlay')
    }

    this.mapOverlay = mapOverlay

    for (const marker of this.mapOverlayMarkerDatas) {
      this._map.removeLayer(marker)
    }

    this.mapOverlayMarkerDatas = []

    if (this._map) {
      this._rebuildMapOverlay()
    }
  },
  getPrintCanvas: async function () {
    return new Promise((resolve, reject) => {
      if (!this.printFormat || !this._map) {
        throw (new Error('Missing essential parameters!'))
      }

      const printFormatSize = this.printFormat.getSize()

      let latitudeMin = this._map.getBounds().getSouth()
      let longitudeMin = this._map.getBounds().getWest()
      let latitudeMax = this._map.getBounds().getNorth()
      let longitudeMax = this._map.getBounds().getEast()

      const mapDegreesWidth = longitudeMax - longitudeMin

      const normalizedWidth = mapDegreesWidth / 360
      const normalizedHeight = this._latitudeToNormalized(latitudeMin) - this._latitudeToNormalized(latitudeMax)

      const mapRatio = normalizedWidth / normalizedHeight
      const printRatio = printFormatSize.width / printFormatSize.height

      if (printRatio <= mapRatio) {
        longitudeMin -= (mapDegreesWidth * printRatio / mapRatio - mapDegreesWidth) / 2
        longitudeMax += (mapDegreesWidth * printRatio / mapRatio - mapDegreesWidth) / 2
      } else {
        let normalizedMin = this._latitudeToNormalized(latitudeMin)
        let normalizedMax = this._latitudeToNormalized(latitudeMax)

        normalizedMin += (normalizedWidth / printRatio - normalizedHeight) / 2
        normalizedMax -= (normalizedWidth / printRatio - normalizedHeight) / 2

        latitudeMin = this._normalizedToLatitude(normalizedMin)
        latitudeMax = this._normalizedToLatitude(normalizedMax)
      }

      const mapInfo = {
        dpi: printFormatSize.dpi,
        style: this.options.style,

        latitudeMin,
        longitudeMin,
        latitudeMax,
        longitudeMax,

        width: printFormatSize.width,
        height: printFormatSize.height,

        mapScale: printFormatSize.printScale * DEFAULT_PRINT_DPI / printFormatSize.dpi,

        objectScale: this.options.objectScale,
        detailOffset: this.options.detailOffset,
        zoomRangeOffset: this.options.zoomRangeOffset
      }

      this.getMapCanvas(mapInfo)
        .then(mapCanvas => {
          if (this.mapOverlay) {
            const printCanvas = document.createElement('canvas')

            printCanvas.width = printFormatSize.width
            printCanvas.height = printFormatSize.height

            const printCanvasContext = printCanvas.getContext('2d')

            printCanvasContext.drawImage(mapCanvas, 0, 0)

            const domParser = new DOMParser()
            const mapOverlaySvgElement = domParser.parseFromString(this.mapOverlayDiv.innerHTML, 'image/svg+xml').documentElement

            mapOverlaySvgElement.setAttribute('width', printFormatSize.width)
            mapOverlaySvgElement.setAttribute('height', printFormatSize.height)

            const poiDatas = this.mapOverlay.getPoiDatas()

            for (const poiData of poiDatas) {
              if (poiData.marker) {
                const markerPoint = this._map.project(poiData.marker.getLatLng())
                const pixelOrigin = this._map.project([latitudeMax, longitudeMin])

                const iconSvgElement = document.createElementNS('http://www.w3.org/2000/svg', 'image')

                const x = (markerPoint.x - pixelOrigin.x) * printFormatSize.printScale / (this.printMapScale ?? this.options.mapScale)
                const y = (markerPoint.y - pixelOrigin.y) * printFormatSize.printScale / (this.printMapScale ?? this.options.mapScale)

                iconSvgElement.setAttribute('href', poiData.iconData.iconUrl)
                iconSvgElement.setAttribute('x', x - poiData.iconData.iconAnchor[0] * printFormatSize.printScale)
                iconSvgElement.setAttribute('y', y - poiData.iconData.iconAnchor[1] * printFormatSize.printScale)
                iconSvgElement.setAttribute('width', poiData.iconData.iconSize[0] * printFormatSize.printScale)
                iconSvgElement.setAttribute('height', poiData.iconData.iconSize[1] * printFormatSize.printScale)

                const firstChild = mapOverlaySvgElement.firstChild
                mapOverlaySvgElement.insertBefore(iconSvgElement, firstChild)
              }
            }

            const mapOverlayImage = new Image()
            const xmlSerializer = new XMLSerializer()

            let svgString = xmlSerializer.serializeToString(mapOverlaySvgElement)

            const urlStringMatches = [...svgString.matchAll(/url\('((https?:\/\/[^\s']+)|(.*\/[^\s']+))'/g)].concat([...svgString.matchAll(/href="((https?:\/\/[^\s"]+)|(.*\/[^\s"]+))"/g)])

            const fetchAndConvertToDataURL = function (urlString) {
              return new Promise((resolve, reject) => {
                fetch(urlString)
                  .then(response => response.blob())
                  .then(blob => {
                    const reader = new FileReader()

                    reader.onloadend = function () {
                      if (reader.result) {
                        svgString = svgString.replace(urlString, reader.result)
                      }

                      resolve()
                    }

                    reader.onerror = function (event) {
                      reject(event.target.error)
                    }

                    reader.readAsDataURL(blob)
                  })
              })
            }

            const fetchPromises = []
            for (const urlStringMatch of urlStringMatches) {
              fetchPromises.push(fetchAndConvertToDataURL(urlStringMatch[1]))
            }

            Promise.all(fetchPromises)
              .then(() => {
                const mapOverlaySvgBlobUrl = URL.createObjectURL(new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' }))

                mapOverlayImage.src = mapOverlaySvgBlobUrl
                mapOverlayImage.addEventListener('load', () => {
                  URL.revokeObjectURL(mapOverlaySvgBlobUrl)

                  printCanvasContext.drawImage(mapOverlayImage, 0, 0)

                  resolve(printCanvas)
                })
              })
          } else {
            resolve(mapCanvas)
          }
        })
    })
  },
  getMapCanvas: async function (mapInfo) {
    if (mapInfo &&
      typeof mapInfo.width === 'number' && typeof mapInfo.height === 'number' &&
      (
        (typeof mapInfo.x === 'number' && typeof mapInfo.y === 'number' && typeof mapInfo.z === 'number') ||
        (typeof mapInfo.latitudeMin === 'number' && typeof mapInfo.longitudeMin === 'number' && typeof mapInfo.latitudeMax === 'number' && typeof mapInfo.longitudeMax === 'number')
      )
    ) {
      /*
       * Start of billing related code block. Do not change or skip it, neither block its function.
       * It must be executed when this function is being called.
       * Refer to the license for more information.
       */
      if (this.options.accessKey) {
        const meta = {
          function: this.getMapCanvas.name,
          mapInfo
        }

        const metaJson = JSON.stringify(meta)

        fetch('https://vms2.locr.com/api/vms2/ping', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ key: this.options.accessKey, meta: metaJson })
        })
      }
      /*
       * End of billing related code block. Do not change or skip it, neither block its function.
       * It must be executed when this function is being called.
       * Refer to the license for more information.
       */

      const mapCanvas = document.createElement('canvas')

      mapCanvas.width = mapInfo.width
      mapCanvas.height = mapInfo.height

      mapCanvas.inUse = true
      mapCanvas.hasBeenRemoved = false

      await this._drawTile(mapCanvas, mapInfo)

      return mapCanvas
    } else {
      throw (new Error('Missing essential parameters!'))
    }
  },
  getMapObjects: function (tileInfo, doneFunction) {
    const tileCanvas = {}

    if (tileInfo.width && tileInfo.height) {
      tileCanvas.width = Math.round(tileInfo.width)
      tileCanvas.height = Math.round(tileInfo.height)
    }

    tileCanvas.inUse = true
    tileCanvas.hasBeenRemoved = false

    tileCanvas.isDummy = true

    this._drawTile(tileCanvas, tileInfo)
      .then(doneFunction)
  },
  _pruneTilesOld: function () {
    if (!this._map) {
      return
    }

    let tile

    const zoom = this._map.getZoom()
    if (
      zoom > this.options.maxZoom ||
      zoom < this.options.minZoom
    ) {
      this._removeAllTiles()
      return
    }

    for (const key in this._tiles) {
      tile = this._tiles[key]
      tile.retain = tile.current
    }

    for (const key in this._tiles) {
      tile = this._tiles[key]
      if (tile.current && !tile.active) {
        const coords = tile.coords
        if (!this._retainParent(coords.x, coords.y, coords.z, coords.z - 5)) {
          this._retainChildren(coords.x, coords.y, coords.z, coords.z + 2)
        }
      }
    }

    for (const key in this._tiles) {
      if (!this._tiles[key].retain) {
        this._removeTile(key)
      }
    }
  },
  _pruneTiles: function () {
    // FIXME!

    if (this.options.zoomPowerBase === DEFAULT_ZOOM_POWER_BASE) {
      this._pruneTilesOld()

      return
    }

    if (!this._map) {
      return
    }

    const zoom = this._map.getZoom()

    if (zoom > this.options.maxZoom || zoom < this.options.minZoom) {
      this._removeAllTiles()

      return
    }

    const mapBounds = this._map.getBounds()

    for (const key in this._tiles) {
      const tile = this._tiles[key]
      const coords = tile.coords

      tile.retain = true

      if (!tile.current) {
        if (coords.z - zoom > 2 / this.options.zoomStep || zoom - coords.z > 2 / this.options.zoomStep) {
          tile.retain = false
        } else {
          const latitudeMin = this._tileToLatitude(coords.y + 1, coords.z, this.options.zoomPowerBase)
          const longitudeMin = this._tileToLongitude(coords.x, coords.z, this.options.zoomPowerBase)
          const latitudeMax = this._tileToLatitude(coords.y, coords.z, this.options.zoomPowerBase)
          const longitudeMax = this._tileToLongitude(coords.x + 1, coords.z, this.options.zoomPowerBase)

          tile.bounds = L.latLngBounds([latitudeMin, longitudeMin], [latitudeMax, longitudeMax])

          if (
            !(
              // eslint-disable-next-line no-underscore-dangle
              tile.bounds._southWest.lat < mapBounds._northEast.lat &&
              // eslint-disable-next-line no-underscore-dangle
              tile.bounds._northEast.lat > mapBounds._southWest.lat &&
              // eslint-disable-next-line no-underscore-dangle
              tile.bounds._southWest.lng < mapBounds._northEast.lng &&
              // eslint-disable-next-line no-underscore-dangle
              tile.bounds._northEast.lng > mapBounds._southWest.lng
            )
          ) {
            tile.retain = false
          }
        }
      }
    }

    for (const key1 in this._tiles) {
      const tile1 = this._tiles[key1]

      if (!tile1.current && tile1.retain) {
        for (const key2 in this._tiles) {
          if (key2 === key1) {
            continue
          }

          const tile2 = this._tiles[key2]

          if (!tile2.current && tile2.retain) {
            if (
              // eslint-disable-next-line no-underscore-dangle
              tile2.bounds._northEast.lat < tile1.bounds._northEast.lat &&
              // eslint-disable-next-line no-underscore-dangle
              tile2.bounds._southWest.lat > tile1.bounds._southWest.lat &&
              // eslint-disable-next-line no-underscore-dangle
              tile2.bounds._northEast.lng < tile1.bounds._northEast.lng &&
              // eslint-disable-next-line no-underscore-dangle
              tile2.bounds._southWest.lng > tile1.bounds._southWest.lng
            ) {
              tile2.retain = false
            }
          }
        }
      }
    }

    for (const key in this._tiles) {
      const tile = this._tiles[key]

      if (!tile.retain) {
        this._removeTile(key)
      }
    }
  },
  _removeTile: function (key) {
    const tile = this._tiles[key]

    if (!tile) {
      return
    }

    const tileElement = tile.el

    // Start of added code.

    if (tileElement.abortController) {
      if (!tileElement.abortController.signal.aborted) {
        tileElement.abortController.abort()
      }

      delete tileElement.abortController
    }

    tileElement.hasBeenRemoved = true

    // End of added code.

    if (tileElement.parentNode) {
      tileElement.parentNode.removeChild(tileElement)
    }

    delete this._tiles[key]

    // @event tileunload: TileEvent
    // Fired when a tile is removed (e.g. when a tile goes off the screen).
    this.fire('tileunload', {
      tile: tileElement,
      coords: this._keyToTileCoords(key)
    })
  },
  onAdd: function () {
    this._map.on('resize', this._onResize, this)

    this._initContainer()

    this._levels = {}
    this._tiles = {}

    this._resetView() // implicit _update() call

    this._map.fire('resize')
  },
  onRemove: function (map) {
    this._map.off('resize', this._onResize, this)

    this._removeAllTiles()
    L.DomUtil.remove(this._container)
    // eslint-disable-next-line no-underscore-dangle
    map._removeZoomLimit(this)
    this._container = null
    this._tileZoom = undefined
  },
  _updateMapOverlayMarkerDatas: function () {
    const markerScale = this.printMapScale ?? this.options.mapScale

    for (const marker of this.mapOverlayMarkerDatas) {
      this._map.removeLayer(marker)
    }

    this.mapOverlayMarkerDatas = []

    if (this.mapOverlayMarkerDatas.length === 0) {
      const poiDatas = this.mapOverlay.getPoiDatas()

      for (const poiData of poiDatas) {
        const newPoiData = JSON.parse(JSON.stringify(poiData))

        newPoiData.iconData.iconSize[0] *= markerScale
        newPoiData.iconData.iconSize[1] *= markerScale
        newPoiData.iconData.iconAnchor[0] *= markerScale
        newPoiData.iconData.iconAnchor[1] *= markerScale

        const latitude = poiData.marker?.getLatLng().lat ?? poiData.latitude
        const longitude = poiData.marker?.getLatLng().lng ?? poiData.longitude
        const marker = L.marker([latitude, longitude], { icon: L.icon(newPoiData.iconData) })

        marker.addTo(this._map)
        marker.dragging.enable()

        this.mapOverlayMarkerDatas.push(marker)

        poiData.marker = marker
      }
    }
  },
  _rebuildMapOverlay: function () {
    if (this.mapOverlay) {
      if (!this.mapOverlayDiv.isConnected) {
        this._map.getContainer().appendChild(this.mapOverlayDiv)
      }

      this._updateMapOverlayMarkerDatas()
    } else if (this.mapOverlayDiv.isConnected) {
      this.mapOverlayDiv.remove()
    }

    if (this.printFormat) {
      const printFormatSize = this.printFormat.getSize()

      if (this.mapOverlay) {
        this._updateMapOverlayMarkerDatas()
      }

      this.mapOverlayDiv.innerHTML = this.mapOverlay?.getSvgOverlay({ width: printFormatSize.width, height: printFormatSize.height }) ?? ''
    }
  },
  _onResize: function (event) {
    if (this.printFormat) {
      if (!this.printFormatMaskDiv.isConnected) {
        this._map.getContainer().appendChild(this.printFormatMaskDiv)
      }
    } else {
      if (this.printFormatMaskDiv.isConnected) {
        this.printFormatMaskDiv.remove()
      }
    }

    if (this.printFormat) {
      const printFormatSize = this.printFormat.getSize()

      const previousPrintMapScale = this.printMapScale ?? this.options.mapScale

      this.printMapScale = this.printFormat.calculateMapScale(this._map.getSize().x, this._map.getSize().y)
      this.printFormatMaskDiv.style.clipPath = this.printFormat.buildMaskForClipPath(this._map.getSize().x, this._map.getSize().y)

      let printFormatScaleRatio = 1

      if (this.previousPrintFormatSize) {
        printFormatScaleRatio = Math.sqrt(printFormatSize.width * printFormatSize.height) / Math.sqrt(this.previousPrintFormatSize.width * this.previousPrintFormatSize.height)
      }

      this.previousPrintFormatSize = printFormatSize

      const center = this._map.getCenter()
      const newZoom = this._map.getZoom() + Math.log(printFormatScaleRatio * this.printMapScale / previousPrintMapScale) / Math.log(this.options.zoomPowerBase)

      // eslint-disable-next-line no-underscore-dangle
      this._map._resetView(center, newZoom, true)

      this.redraw()
    }

    this._rebuildMapOverlay()
  },
  _checkAndSetDisplacement: function (displacementLayers, displacementLayerNames, boxes) {
    for (const box of boxes) {
      if (box.left > box.right) {
        const temp = box.left

        box.left = box.right
        box.right = temp
      }

      if (box.bottom > box.top) {
        const temp = box.top

        box.top = box.bottom
        box.bottom = temp
      }
    }

    for (const displacementLayerName of displacementLayerNames) {
      const displacementLayer = displacementLayers[displacementLayerName]

      for (const box of boxes) {
        if (displacementLayer.allowedMapArea) {
          if (
            box.left < displacementLayer.allowedMapArea.left ||
            box.right > displacementLayer.allowedMapArea.right ||
            box.top > displacementLayer.allowedMapArea.top ||
            box.bottom < displacementLayer.allowedMapArea.bottom
          ) {
            return false
          }
        }

        const topLeftHash = (box.left >> displacementLayer.shift) + 'x' + (box.top >> displacementLayer.shift)
        const topRightHash = (box.right >> displacementLayer.shift) + 'x' + (box.top >> displacementLayer.shift)
        const bottomLeftHash = (box.left >> displacementLayer.shift) + 'x' + (box.bottom >> displacementLayer.shift)
        const bottomRightHash = (box.right >> displacementLayer.shift) + 'x' + (box.bottom >> displacementLayer.shift)

        if (displacementLayer.regions[topLeftHash]) {
          for (const hashedBox of displacementLayer.regions[topLeftHash]) {
            if (
              box.left > hashedBox.right ||
              box.right < hashedBox.left ||
              box.bottom > hashedBox.top ||
              box.top < hashedBox.bottom
            ) { // Note: Top > Bottom!
              continue
            }

            return false
          }
        }

        if (displacementLayer.regions[topRightHash] && topRightHash !== topLeftHash) {
          for (const hashedBox of displacementLayer.regions[topRightHash]) {
            if (
              box.left > hashedBox.right ||
              box.right < hashedBox.left ||
              box.bottom > hashedBox.top ||
              box.top < hashedBox.bottom
            ) { // Note: Top > Bottom!
              continue
            }

            return false
          }
        }

        if (displacementLayer.regions[bottomLeftHash] && bottomLeftHash !== topLeftHash && bottomLeftHash !== topRightHash) {
          for (const hashedBox of displacementLayer.regions[bottomLeftHash]) {
            if (
              box.left > hashedBox.right ||
              box.right < hashedBox.left ||
              box.bottom > hashedBox.top ||
              box.top < hashedBox.bottom
            ) { // Note: Top > Bottom!
              continue
            }

            return false
          }
        }

        if (displacementLayer.regions[bottomRightHash] && bottomRightHash !== topLeftHash && bottomRightHash !== topRightHash && bottomRightHash !== bottomLeftHash) {
          for (const hashedBox of displacementLayer.regions[bottomRightHash]) {
            if (
              box.left > hashedBox.right ||
              box.right < hashedBox.left ||
              box.bottom > hashedBox.top ||
              box.top < hashedBox.bottom
            ) { // Note: Top > Bottom!
              continue
            }

            return false
          }
        }
      }
    }

    for (const displacementLayerName of displacementLayerNames) {
      const displacementLayer = displacementLayers[displacementLayerName]

      for (const box of boxes) {
        if (box.left === box.right || box.top === box.bottom) {
          continue
        }

        const topLeftHash = (box.left >> displacementLayer.shift) + 'x' + (box.top >> displacementLayer.shift)
        const topRightHash = (box.right >> displacementLayer.shift) + 'x' + (box.top >> displacementLayer.shift)
        const bottomLeftHash = (box.left >> displacementLayer.shift) + 'x' + (box.bottom >> displacementLayer.shift)
        const bottomRightHash = (box.right >> displacementLayer.shift) + 'x' + (box.bottom >> displacementLayer.shift)

        if (!displacementLayer.regions[topLeftHash]) {
          displacementLayer.regions[topLeftHash] = []
        }

        displacementLayer.regions[topLeftHash].push(box)

        if (topRightHash !== topLeftHash) {
          if (!displacementLayer.regions[topRightHash]) {
            displacementLayer.regions[topRightHash] = []
          }

          displacementLayer.regions[topRightHash].push(box)
        }

        if (bottomLeftHash !== topLeftHash && bottomLeftHash !== topRightHash) {
          if (!displacementLayer.regions[bottomLeftHash]) {
            displacementLayer.regions[bottomLeftHash] = []
          }

          displacementLayer.regions[bottomLeftHash].push(box)
        }

        if (bottomRightHash !== topLeftHash && bottomRightHash !== topRightHash && bottomRightHash !== bottomLeftHash) {
          if (!displacementLayer.regions[bottomRightHash]) {
            displacementLayer.regions[bottomRightHash] = []
          }

          displacementLayer.regions[bottomRightHash].push(box)
        }
      }
    }

    return true
  },
  _drawGeometry: function (drawingInfo, geometry, dataOffset = 0) {
    const wkbType = geometry.getUint32(dataOffset, true)

    switch (wkbType) {
      case 1: // WKBPoint.
        dataOffset = this._drawPoint(drawingInfo, geometry, dataOffset)
        break

      case 2: // WKBLineString.
        dataOffset = this._drawLineString(drawingInfo, geometry, dataOffset)
        break

      case 3: // WKBPolygon.
        if (drawingInfo.isIcon || drawingInfo.isText) {
          this._drawIcon(drawingInfo, drawingInfo.objectData.Center.x, drawingInfo.objectData.Center.y)
          dataOffset = this._skipPolygon(geometry, dataOffset)
        } else {
          const polygons = []
          dataOffset = this._preparePolygon(drawingInfo, geometry, dataOffset, polygons)
          this._drawPolygons(drawingInfo, polygons)
        }
        break

      case 4: // WKBMultiPoint.
        // console.log('Unhandled WKB type found: ' + wkbType + ' => MultiPoint')
        break

      case 5: // WKBMultiLineString.
        {
          dataOffset += 4

          const numberOfLineStrings = geometry.getUint32(dataOffset, true)
          dataOffset += 4

          for (let lineStringIndex = 0; lineStringIndex < numberOfLineStrings; lineStringIndex++) {
            dataOffset = this._drawLineString(drawingInfo, geometry, dataOffset)
          }
        }
        break

      case 6: // WKBMultiPolygon.
        dataOffset += 4

        if (drawingInfo.isIcon || drawingInfo.isText) {
          this._drawIcon(drawingInfo, drawingInfo.objectData.Center.x, drawingInfo.objectData.Center.y)

          const numberOfPolygons = geometry.getUint32(dataOffset, true)
          dataOffset += 4

          for (let polygonIndex = 0; polygonIndex < numberOfPolygons; polygonIndex++) {
            dataOffset = this._skipPolygon(geometry, dataOffset)
          }
        } else {
          const polygons = []

          const numberOfPolygons = geometry.getUint32(dataOffset, true)
          dataOffset += 4

          for (let polygonIndex = 0; polygonIndex < numberOfPolygons; polygonIndex++) {
            dataOffset = this._preparePolygon(drawingInfo, geometry, dataOffset, polygons)
          }

          this._drawPolygons(drawingInfo, polygons)
        }
        break

      case 7: // WKBGeometryCollection.
        {
          dataOffset += 4

          const numberOfGeometries = geometry.getUint32(dataOffset, true)
          dataOffset += 4

          for (let geometryIndex = 0; geometryIndex < numberOfGeometries; geometryIndex++) {
            dataOffset = this._drawGeometry(drawingInfo, geometry, dataOffset)
          }
        }
        break

      default:
        // console.log('Unhandled WKB type found: ' + wkbType_)
        break
    }

    return dataOffset
  },
  _drawPoint: function (drawingInfo, geometry, dataOffset) {
    dataOffset += 4

    const x = geometry.getFloat32(dataOffset, true)
    dataOffset += 4

    const y = geometry.getFloat32(dataOffset, true)
    dataOffset += 4

    if (drawingInfo.isIcon || drawingInfo.isText) {
      this._drawIcon(drawingInfo, x, y)
    }

    return dataOffset
  },
  _drawIcon: function (drawingInfo, x, y) {
    let iconDisplacementBox = null
    const textDisplacementBoxes = []
    const textLineInfos = []

    if (drawingInfo.isIcon && drawingInfo.iconImage) {
      if (drawingInfo.displacementScaleX > 0 && drawingInfo.displacementScaleY > 0) {
        iconDisplacementBox = {
          left: x + drawingInfo.iconImageOffsetX - drawingInfo.iconWidth * drawingInfo.displacementScaleX / 2,
          right: x + drawingInfo.iconImageOffsetX + drawingInfo.iconWidth * drawingInfo.displacementScaleX / 2,
          top: y - drawingInfo.iconImageOffsetY + drawingInfo.iconHeight * drawingInfo.displacementScaleY / 2,
          bottom: y - drawingInfo.iconImageOffsetY - drawingInfo.iconHeight * drawingInfo.displacementScaleY / 2
        }
      }
    }

    if (drawingInfo.isText && drawingInfo.text) {
      let textY = drawingInfo.iconTextOffsetY

      // Convert name to multiline text.

      let maxTextLength = 10

      const textWords = drawingInfo.text.replace(/-/g, '- ').split(' ')

      for (const textWord of textWords) {
        if (textWord.length > maxTextLength) {
          maxTextLength = textWord.length
        }
      }

      let textLine = ''

      for (const textWord of textWords) {
        if (textLine.length + textWord.length > maxTextLength) {
          textLineInfos.push({ text: textLine })

          textLine = textWord
        } else {
          if (textLine) {
            textLine += ' '
          }

          textLine += textWord
        }
      }

      if (textLine) {
        textLineInfos.push({ text: textLine })
      }

      let textBoxWidth = 0

      globalThis.vms2Context.fontCharacterContext.font = drawingInfo.fontStyle + ' 100px ' + drawingInfo.fontFamily

      for (const textLineInfo of textLineInfos) {
        textLineInfo.width = globalThis.vms2Context.fontCharacterContext.measureText(textLineInfo.text).width * drawingInfo.fontSize / 100

        if (textLineInfo.width > textBoxWidth) {
          textBoxWidth = textLineInfo.width
        }
      }

      const textBoxHeight = drawingInfo.fontSize * textLineInfos.length

      if (textLineInfos.length > 1) {
        if (textY === 0) {
          textY -= (textLineInfos.length - 1) * drawingInfo.fontSize / 2
        } else if (textY < 0) {
          textY -= (textLineInfos.length - 1) * drawingInfo.fontSize
        }
      }

      const spacingX = textBoxWidth * (drawingInfo.displacementScaleX - 1)
      const spacingY = textBoxHeight * (drawingInfo.displacementScaleY - 1)

      if (drawingInfo.displacementScaleX > 0 && drawingInfo.displacementScaleY > 0) {
        if (drawingInfo.iconTextPlacement && drawingInfo.isIcon && drawingInfo.iconImage) {
          for (const placementCode in drawingInfo.iconTextPlacement) {
            const gapX = drawingInfo.iconWidth * drawingInfo.iconTextPlacement[placementCode]
            const gapY = drawingInfo.iconHeight * drawingInfo.iconTextPlacement[placementCode]

            switch (placementCode) {
              case 't':
                textDisplacementBoxes.push({
                  x: drawingInfo.iconImageOffsetX,
                  y: drawingInfo.iconImageOffsetY - textBoxHeight - drawingInfo.iconHeight / 2 - gapY,
                  left: x + drawingInfo.iconImageOffsetX - textBoxWidth / 2 - spacingX,
                  right: x + drawingInfo.iconImageOffsetX + textBoxWidth / 2 + spacingX,
                  top: y - drawingInfo.iconImageOffsetY + textBoxHeight + drawingInfo.iconHeight / 2 + spacingY + gapY,
                  bottom: y - drawingInfo.iconImageOffsetY + drawingInfo.iconHeight / 2 - spacingY + gapY,
                  align: 'center',
                  baseline: 'top'
                })
                break

              case 'b':
                textDisplacementBoxes.push({
                  x: drawingInfo.iconImageOffsetX,
                  y: drawingInfo.iconImageOffsetY + drawingInfo.iconHeight / 2 + gapY,
                  left: x + drawingInfo.iconImageOffsetX - textBoxWidth / 2 - spacingX,
                  right: x + drawingInfo.iconImageOffsetX + textBoxWidth / 2 + spacingX,
                  top: y - drawingInfo.iconImageOffsetY - drawingInfo.iconHeight / 2 + spacingY - gapY,
                  bottom: y - drawingInfo.iconImageOffsetY - textBoxHeight - drawingInfo.iconHeight / 2 - spacingY - gapY,
                  align: 'center',
                  baseline: 'top'
                })
                break

              case 'l':
                textDisplacementBoxes.push({
                  x: drawingInfo.iconImageOffsetX - drawingInfo.iconWidth / 2 - gapX,
                  y: drawingInfo.iconImageOffsetY - textBoxHeight / 2,
                  left: x + drawingInfo.iconImageOffsetX - textBoxWidth - drawingInfo.iconWidth / 2 - spacingX - gapX,
                  right: x + drawingInfo.iconImageOffsetX - drawingInfo.iconWidth / 2 + spacingX - gapX,
                  top: y - drawingInfo.iconImageOffsetY + textBoxHeight / 2 + spacingY,
                  bottom: y - drawingInfo.iconImageOffsetY - textBoxHeight / 2 - spacingY,
                  align: 'right',
                  baseline: 'top'
                })
                break

              case 'r':
                textDisplacementBoxes.push({
                  x: drawingInfo.iconImageOffsetX + drawingInfo.iconWidth / 2 + gapX,
                  y: drawingInfo.iconImageOffsetY - textBoxHeight / 2,
                  left: x + drawingInfo.iconImageOffsetX + drawingInfo.iconWidth / 2 - spacingX + gapX,
                  right: x + drawingInfo.iconImageOffsetX + textBoxWidth + drawingInfo.iconWidth / 2 + spacingX + gapX,
                  top: y - drawingInfo.iconImageOffsetY + textBoxHeight / 2 + spacingY,
                  bottom: y - drawingInfo.iconImageOffsetY - textBoxHeight / 2 - spacingY,
                  align: 'left',
                  baseline: 'top'
                })
                break

              case 'tl':
                textDisplacementBoxes.push({
                  x: drawingInfo.iconImageOffsetX - drawingInfo.iconWidth / 2 - gapX,
                  y: drawingInfo.iconImageOffsetY - textBoxHeight - drawingInfo.iconHeight / 2 - gapY,
                  left: x + drawingInfo.iconImageOffsetX - textBoxWidth - drawingInfo.iconWidth / 2 - spacingX - gapX,
                  right: x + drawingInfo.iconImageOffsetX - drawingInfo.iconWidth / 2 + spacingX - gapX,
                  top: y - drawingInfo.iconImageOffsetY + textBoxHeight + drawingInfo.iconHeight / 2 + spacingY + gapY,
                  bottom: y - drawingInfo.iconImageOffsetY + drawingInfo.iconHeight / 2 - spacingY + gapY,
                  align: 'right',
                  baseline: 'top'
                })
                break

              case 'tr':
                textDisplacementBoxes.push({
                  x: drawingInfo.iconImageOffsetX + drawingInfo.iconWidth / 2 + gapX,
                  y: drawingInfo.iconImageOffsetY - textBoxHeight - drawingInfo.iconHeight / 2 - gapY,
                  left: x + drawingInfo.iconImageOffsetX + drawingInfo.iconWidth / 2 + spacingX + gapX,
                  right: x + drawingInfo.iconImageOffsetX + textBoxWidth + drawingInfo.iconWidth / 2 - spacingX + gapX,
                  top: y - drawingInfo.iconImageOffsetY + textBoxHeight + drawingInfo.iconHeight / 2 + spacingY + gapY,
                  bottom: y - drawingInfo.iconImageOffsetY + drawingInfo.iconHeight / 2 - spacingY + gapY,
                  align: 'left',
                  baseline: 'top'
                })
                break

              case 'bl':
                textDisplacementBoxes.push({
                  x: drawingInfo.iconImageOffsetX - drawingInfo.iconWidth / 2 - gapX,
                  y: drawingInfo.iconImageOffsetY + drawingInfo.iconHeight / 2 + gapY,
                  left: x + drawingInfo.iconImageOffsetX - textBoxWidth - drawingInfo.iconWidth / 2 - spacingX - gapX,
                  right: x + drawingInfo.iconImageOffsetX - drawingInfo.iconWidth / 2 + spacingX - gapX,
                  top: y - drawingInfo.iconImageOffsetY - drawingInfo.iconHeight / 2 + spacingY - gapY,
                  bottom: y - drawingInfo.iconImageOffsetY - textBoxHeight - drawingInfo.iconHeight / 2 - spacingY - gapY,
                  align: 'right',
                  baseline: 'top'
                })
                break

              case 'br':
                textDisplacementBoxes.push({
                  x: drawingInfo.iconImageOffsetX + drawingInfo.iconWidth / 2 + gapX,
                  y: drawingInfo.iconImageOffsetY + drawingInfo.iconHeight / 2 + gapY,
                  left: x + drawingInfo.iconImageOffsetX + drawingInfo.iconWidth / 2 - spacingX + gapX,
                  right: x + drawingInfo.iconImageOffsetX + textBoxWidth + drawingInfo.iconWidth / 2 + spacingX + gapX,
                  top: y - drawingInfo.iconImageOffsetY - drawingInfo.iconHeight / 2 + spacingY - gapY,
                  bottom: y - drawingInfo.iconImageOffsetY - textBoxHeight - drawingInfo.iconHeight / 2 - spacingY - gapY,
                  align: 'left',
                  baseline: 'top'
                })
                break
            }
          }
        } else {
          textDisplacementBoxes.push({
            x: drawingInfo.iconTextOffsetX,
            y: drawingInfo.iconTextOffsetY,
            left: x + drawingInfo.iconTextOffsetX - textBoxWidth / 2 - spacingX,
            right: x + drawingInfo.iconTextOffsetX + textBoxWidth / 2 + spacingX,
            top: y - drawingInfo.iconTextOffsetY + textBoxHeight / 2 + spacingY,
            bottom: y - drawingInfo.iconTextOffsetY - textBoxHeight / 2 - spacingY,
            align: 'center',
            baseline: 'middle'
          })
        }
      }
    }

    if (textDisplacementBoxes.length > 0) {
      for (const textDisplacementBox of textDisplacementBoxes) {
        const textAndIconBoxes = []

        textAndIconBoxes.push(textDisplacementBox)

        if (iconDisplacementBox) {
          textAndIconBoxes.push(iconDisplacementBox)
        }

        if (this._checkAndSetDisplacement(drawingInfo.displacementLayers, drawingInfo.displacementLayerNames, textAndIconBoxes)) {
          let groupStarted = false

          if (drawingInfo.isIcon && drawingInfo.iconImage) {
            const iconX = drawingInfo.iconImageOffsetX - drawingInfo.iconWidth * drawingInfo.iconMirrorX / 2
            const iconY = drawingInfo.iconImageOffsetY - drawingInfo.iconHeight * drawingInfo.iconMirrorY / 2

            let iconLeft = x + iconX
            let iconRight = iconLeft + drawingInfo.iconWidth * drawingInfo.iconMirrorX
            let iconBottom = y + iconY
            let iconTop = iconBottom + drawingInfo.iconHeight * drawingInfo.iconMirrorY

            if (iconLeft > iconRight) {
              const temp = iconLeft

              iconLeft = iconRight
              iconRight = temp
            }

            if (iconBottom > iconTop) {
              const temp = iconBottom

              iconBottom = iconTop
              iconTop = temp
            }

            if (!(iconLeft > drawingInfo.mapArea.right || iconRight < drawingInfo.mapArea.left || iconTop < drawingInfo.mapArea.bottom || iconBottom > drawingInfo.mapArea.top)) { // Note: Top > Bottom!
              drawingInfo.context.beginGroup(drawingInfo.text || '')

              groupStarted = true

              drawingInfo.context.drawImage(
                drawingInfo.iconImage,
                (x - drawingInfo.drawingArea.left + iconX) * drawingInfo.scale,
                (drawingInfo.drawingArea.top - y + iconY) * drawingInfo.scale,
                drawingInfo.iconWidth * drawingInfo.iconMirrorX * drawingInfo.scale,
                drawingInfo.iconHeight * drawingInfo.iconMirrorY * drawingInfo.scale
              )
            }
          }

          if (drawingInfo.isText && drawingInfo.text) {
            if (!(textDisplacementBox.left > drawingInfo.mapArea.right || textDisplacementBox.right < drawingInfo.mapArea.left || textDisplacementBox.top < drawingInfo.mapArea.bottom || textDisplacementBox.bottom > drawingInfo.mapArea.top)) { // Note: Top > Bottom!
              drawingInfo.context.beginGroup(drawingInfo.text)

              if (drawingInfo.isIcon && drawingInfo.iconPositions[drawingInfo.text]) {
                drawingInfo.iconPositions[drawingInfo.text].push({ x, y })
              }

              drawingInfo.context.textAlign = textDisplacementBox.align
              drawingInfo.context.textBaseline = textDisplacementBox.baseline

              const textX = (x - drawingInfo.drawingArea.left + textDisplacementBox.x) * drawingInfo.scale
              let textY = (drawingInfo.drawingArea.top - y + textDisplacementBox.y) * drawingInfo.scale

              if (textLineInfos.length > 1 && textDisplacementBox.baseline === 'middle') {
                textY -= drawingInfo.fontSize * drawingInfo.scale * (textLineInfos.length - 1) / 2
              }

              for (const textLineInfo of textLineInfos) {
                drawingInfo.context.tw = textLineInfo.width
                drawingInfo.context.strokeText(textLineInfo.text, textX, textY)
                drawingInfo.context.fillText(textLineInfo.text, textX, textY)

                textY += drawingInfo.fontSize * drawingInfo.scale
              }

              drawingInfo.context.endGroup()
            }
          }

          if (groupStarted) {
            drawingInfo.context.endGroup()
          }

          break
        }
      }
    } else {
      if (drawingInfo.isIcon && drawingInfo.iconImage) {
        if (
          (iconDisplacementBox && this._checkAndSetDisplacement(drawingInfo.displacementLayers, drawingInfo.displacementLayerNames, [iconDisplacementBox])) ||
          !iconDisplacementBox
        ) {
          const iconX = drawingInfo.iconImageOffsetX - drawingInfo.iconWidth * drawingInfo.iconMirrorX / 2
          const iconY = drawingInfo.iconImageOffsetY - drawingInfo.iconHeight * drawingInfo.iconMirrorY / 2

          let iconLeft = x + iconX
          let iconRight = iconLeft + drawingInfo.iconWidth * drawingInfo.iconMirrorX
          let iconBottom = y + iconY
          let iconTop = iconBottom + drawingInfo.iconHeight * drawingInfo.iconMirrorY

          if (iconLeft > iconRight) {
            const temp = iconLeft

            iconLeft = iconRight
            iconRight = temp
          }

          if (iconBottom > iconTop) {
            const temp = iconBottom

            iconBottom = iconTop
            iconTop = temp
          }

          if (
            !(
              iconLeft > drawingInfo.boundingArea.right ||
              iconRight < drawingInfo.boundingArea.left ||
              iconTop < drawingInfo.boundingArea.bottom ||
              iconBottom > drawingInfo.boundingArea.top
            ) ||
            drawingInfo.isGrid
          ) { // Note: Top > Bottom! Allow every location if there is a grid!
            if (drawingInfo.iconAngle !== 0) {
              drawingInfo.context.setTransform(new DOMMatrix().translate((x - drawingInfo.drawingArea.left) * drawingInfo.scale, (drawingInfo.drawingArea.top - y) * drawingInfo.scale).rotate(drawingInfo.iconAngle * 180 / Math.PI))
              drawingInfo.context.drawImage(
                drawingInfo.iconImage,
                iconX * drawingInfo.scale, iconY * drawingInfo.scale,
                drawingInfo.iconWidth * drawingInfo.iconMirrorX * drawingInfo.scale,
                drawingInfo.iconHeight * drawingInfo.iconMirrorY * drawingInfo.scale)
            } else {
              drawingInfo.context.drawImage(
                drawingInfo.iconImage,
                (x - drawingInfo.drawingArea.left + iconX) * drawingInfo.scale,
                (drawingInfo.drawingArea.top - y + iconY) * drawingInfo.scale,
                drawingInfo.iconWidth * drawingInfo.iconMirrorX * drawingInfo.scale,
                drawingInfo.iconHeight * drawingInfo.iconMirrorY * drawingInfo.scale
              )
            }
          }
        }
      }
    }
  },
  _drawLineString: function (drawingInfo, geometry, dataOffset) {
    dataOffset += 4

    const numberOfPoints = geometry.getUint32(dataOffset, true)
    dataOffset += 4

    if (numberOfPoints === 0) {
      return dataOffset
    }

    if (drawingInfo.isIcon && drawingInfo.iconImage) { // Draw an icon and text on the line center.
      const halfLength = drawingInfo.objectData.length / 2
      let iconPositionLength = 0

      let x = geometry.getFloat32(dataOffset, true)
      dataOffset += 4

      let y = geometry.getFloat32(dataOffset, true)
      dataOffset += 4

      for (let pointIndex = 1; pointIndex < numberOfPoints; pointIndex++) {
        const x2 = geometry.getFloat32(dataOffset, true)
        dataOffset += 4

        const y2 = geometry.getFloat32(dataOffset, true)
        dataOffset += 4

        const deltaX = x2 - x
        const deltaY = y2 - y

        const segmentLength = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

        if (iconPositionLength + segmentLength > halfLength) {
          const factor = (halfLength - iconPositionLength) / segmentLength

          x += deltaX * factor
          y += deltaY * factor

          dataOffset += (numberOfPoints - pointIndex - 1) * 4 * 2

          break
        }

        iconPositionLength += segmentLength

        x = x2
        y = y2
      }

      // Check the distance to other labels of the same type.

      let isExceedingMinimumDistance = true

      if (drawingInfo.iconPositions[drawingInfo.text]) {
        for (const iconPosition of drawingInfo.iconPositions[drawingInfo.text]) {
          const deltaX = x - iconPosition.x
          const deltaY = y - iconPosition.y

          if (deltaX * deltaX + deltaY * deltaY < drawingInfo.iconMinimumDistance * drawingInfo.iconMinimumDistance) {
            isExceedingMinimumDistance = false

            break
          }
        }
      } else {
        drawingInfo.iconPositions[drawingInfo.text] = []
      }

      if (isExceedingMinimumDistance) {
        this._drawIcon(drawingInfo, x, y)
      }
    } else if (drawingInfo.isText && drawingInfo.text) { // Draw text along the line.
      let text = drawingInfo.text.slice()
      let textWidth = 0

      if (text.length === 1) {
        text = ' ' + text + ' '
      }

      for (let characterIndex = 0; characterIndex < text.length; characterIndex++) {
        if (unicodeDataTable[text.charCodeAt(characterIndex)]) {
          text = [...text].reverse().join('')

          break
        }
      }

      for (const character of text) {
        if (!globalThis.vms2Context.fontCharacterWidths[drawingInfo.fontFamily]) {
          globalThis.vms2Context.fontCharacterWidths[drawingInfo.fontFamily] = {}
        }

        if (!globalThis.vms2Context.fontCharacterWidths[drawingInfo.fontFamily][drawingInfo.fontStyle]) {
          globalThis.vms2Context.fontCharacterWidths[drawingInfo.fontFamily][drawingInfo.fontStyle] = {}
        }

        if (!globalThis.vms2Context.fontCharacterWidths[drawingInfo.fontFamily][drawingInfo.fontStyle][character]) {
          globalThis.vms2Context.fontCharacterContext.font = drawingInfo.fontStyle + ' 100px \'' + drawingInfo.fontFamily + '\''
          globalThis.vms2Context.fontCharacterWidths[drawingInfo.fontFamily][drawingInfo.fontStyle][character] = globalThis.vms2Context.fontCharacterContext.measureText(character).width
        }

        textWidth += globalThis.vms2Context.fontCharacterWidths[drawingInfo.fontFamily][drawingInfo.fontStyle][character] * drawingInfo.fontSize / 100
      }

      if (textWidth < drawingInfo.objectData.length) {
        const segmentLengths = []
        const points = []
        let lineStringLength = 0

        for (let pointIndex = 0; pointIndex < numberOfPoints; pointIndex++) {
          const x = geometry.getFloat32(dataOffset, true)
          dataOffset += 4

          const y = geometry.getFloat32(dataOffset, true)
          dataOffset += 4

          points.push({ x, y })

          if (pointIndex > 0) {
            const deltaX = points[pointIndex - 1].x - x
            const deltaY = points[pointIndex - 1].y - y

            const segmentLength = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

            lineStringLength += segmentLength
            segmentLengths.push(segmentLength)
          }
        }

        if (textWidth < lineStringLength) {
          let additionalCharacterRotation = 0
          let pointsIndex = 0
          let lineOffset = 0
          let characterOffset = (lineStringLength - textWidth) / 2

          const characterInfos = []

          let tempLength = 0
          let tempPointsIndex = 0

          while (tempLength + segmentLengths[tempPointsIndex] < lineStringLength / 2) {
            tempLength += segmentLengths[tempPointsIndex]

            tempPointsIndex++
          }

          if (points[tempPointsIndex].x > points[tempPointsIndex + 1].x) {
            text = [...text].reverse().join('')

            additionalCharacterRotation = Math.PI
          }

          for (const character of text) {
            const characterWidth = globalThis.vms2Context.fontCharacterWidths[drawingInfo.fontFamily][drawingInfo.fontStyle][character] * drawingInfo.fontSize / 100

            characterOffset += characterWidth / 2

            while (lineOffset + segmentLengths[pointsIndex] < characterOffset) {
              lineOffset += segmentLengths[pointsIndex++]
            }

            const factor = (characterOffset - lineOffset) / segmentLengths[pointsIndex]
            const textX = points[pointsIndex].x + (points[pointsIndex + 1].x - points[pointsIndex].x) * factor
            const textY = points[pointsIndex].y + (points[pointsIndex + 1].y - points[pointsIndex].y) * factor

            characterOffset += characterWidth / 2

            characterInfos.push({ point: { x: textX, y: textY }, width: characterWidth })
          }

          const textBoxes = []
          let textIsVisible = false

          if (drawingInfo.displacementScaleX > 0 && drawingInfo.displacementScaleY > 0) {
            for (const characterInfo of characterInfos) {
              const left = characterInfo.point.x - drawingInfo.fontSize * drawingInfo.displacementScaleX / 2
              const right = characterInfo.point.x + drawingInfo.fontSize * drawingInfo.displacementScaleX / 2
              const top = characterInfo.point.y + drawingInfo.fontSize * drawingInfo.displacementScaleY / 2
              const bottom = characterInfo.point.y - drawingInfo.fontSize * drawingInfo.displacementScaleY / 2

              textBoxes.push({ left, right, top, bottom })

              if (!(left > drawingInfo.mapArea.right || right < drawingInfo.mapArea.left || top < drawingInfo.mapArea.bottom || bottom > drawingInfo.mapArea.top)) { // Note: Top > Bottom!
                textIsVisible = true
              }
            }
          }

          if (this._checkAndSetDisplacement(drawingInfo.displacementLayers, drawingInfo.displacementLayerNames, textBoxes)) {
            if (textIsVisible) {
              let maximumRotationAngleDelta = 0
              let lastRotationAngle = 0
              let startRotationAngle = 0

              if (characterInfos[0].point.y > characterInfos[1].point.y) {
                startRotationAngle = Math.PI / 2
              } else {
                startRotationAngle = -Math.PI / 2
              }

              for (let characterIndex = 0; characterIndex < text.length; characterIndex++) {
                const angleStartPoint = characterIndex > 0 ? characterInfos[characterIndex - 1].point : characterInfos[0].point
                const angleEndPoint = characterIndex < characterInfos.length - 1 ? characterInfos[characterIndex + 1].point : characterInfos[characterIndex].point
                let characterRotationAngle = (angleEndPoint.x - angleStartPoint.x) === 0 ? startRotationAngle : Math.atan((angleEndPoint.y - angleStartPoint.y) / (angleEndPoint.x - angleStartPoint.x))

                if (angleEndPoint.x <= angleStartPoint.x) {
                  characterRotationAngle += Math.PI
                }

                characterRotationAngle += additionalCharacterRotation

                characterInfos[characterIndex].rotationAngle = characterRotationAngle

                if (characterIndex === 0) {
                  lastRotationAngle = characterRotationAngle
                }

                const rotationAngleDelta = Math.abs(lastRotationAngle - characterRotationAngle)

                if (rotationAngleDelta > maximumRotationAngleDelta) {
                  maximumRotationAngleDelta = rotationAngleDelta
                }
              }

              if (maximumRotationAngleDelta < Math.PI * 2 / 4) {
                const matrices = []

                drawingInfo.context.beginGroup(drawingInfo.text)

                for (let characterIndex = 0; characterIndex < text.length; characterIndex++) {
                  if (text[characterIndex] !== ' ') {
                    const matrix = new DOMMatrix().translate((characterInfos[characterIndex].point.x - drawingInfo.drawingArea.left) * drawingInfo.scale, (drawingInfo.drawingArea.top - characterInfos[characterIndex].point.y) * drawingInfo.scale).rotate(-characterInfos[characterIndex].rotationAngle * 180 / Math.PI)

                    matrices.push(matrix)

                    drawingInfo.context.tw = characterInfos[characterIndex].width * drawingInfo.scale
                    drawingInfo.context.setTransform(matrix)
                    drawingInfo.context.strokeText(text[characterIndex], 0, 0)
                  }
                }

                for (let characterIndex = 0; characterIndex < text.length; characterIndex++) {
                  if (text[characterIndex] !== ' ') {
                    drawingInfo.context.tw = characterInfos[characterIndex].width * drawingInfo.scale
                    drawingInfo.context.setTransform(matrices.shift())
                    drawingInfo.context.fillText(text[characterIndex], 0, 0)
                  }
                }

                drawingInfo.context.endGroup()
              }
            }
          }
        }
      } else {
        dataOffset += numberOfPoints * 4 * 2
      }
    } else if (!drawingInfo.isText && !drawingInfo.isIcon) { // Draw a line
      drawingInfo.context.beginPath()

      let x = geometry.getFloat32(dataOffset, true)
      dataOffset += 4

      let y = geometry.getFloat32(dataOffset, true)
      dataOffset += 4

      drawingInfo.context.moveTo(Math.round((x - drawingInfo.drawingArea.left) * drawingInfo.scale), Math.round((drawingInfo.drawingArea.top - y) * drawingInfo.scale))

      for (let pointIndex = 1; pointIndex < numberOfPoints; pointIndex++) {
        x = geometry.getFloat32(dataOffset, true)
        dataOffset += 4

        y = geometry.getFloat32(dataOffset, true)
        dataOffset += 4

        drawingInfo.context.lineTo(Math.round((x - drawingInfo.drawingArea.left) * drawingInfo.scale), Math.round((drawingInfo.drawingArea.top - y) * drawingInfo.scale))
      }

      drawingInfo.context.stroke()
    } else {
      dataOffset += numberOfPoints * 4 * 2
    }

    return dataOffset
  },
  _drawPolygons: function (drawingInfo, polygons_) {
    if (drawingInfo.isFilled) {
      this._drawPolygonsFilled(drawingInfo, polygons_)
    }

    if (drawingInfo.isStroked) {
      this._drawPolygonsStroked(drawingInfo, polygons_)
    }
  },
  _drawPolygonsStroked: function (drawingInfo, polygons) {
    for (const polygonRings of polygons) {
      for (const polygonPoints of polygonRings) {
        const numberOfPoints = polygonPoints.length

        let pointsDrawn = 0

        let lastX = 0
        let lastY = 0

        let lastDeltaLeft = 0
        let lastDeltaRight = 0
        let lastDeltaTop = 0
        let lastDeltaBottom = 0

        const deltaScale = Math.min(1, drawingInfo.scale)

        for (let pointIndex = 0; pointIndex < numberOfPoints; pointIndex++) {
          const x = polygonPoints[pointIndex].x
          const y = polygonPoints[pointIndex].y

          const deltaLeft = drawingInfo.tileBoundingBox ? Math.round((x - drawingInfo.tileBoundingBox.left) * deltaScale) : 1
          const deltaRight = drawingInfo.tileBoundingBox ? Math.round((x - drawingInfo.tileBoundingBox.right) * deltaScale) : 1
          const deltaTop = drawingInfo.tileBoundingBox ? Math.round((drawingInfo.tileBoundingBox.top - y) * deltaScale) : 1
          const deltaBottom = drawingInfo.tileBoundingBox ? Math.round((drawingInfo.tileBoundingBox.bottom - y) * deltaScale) : 1

          if (pointIndex > 0) {
            if (
              (deltaLeft === 0 && lastDeltaLeft === 0) ||
              (deltaRight === 0 && lastDeltaRight === 0) ||
              (deltaTop === 0 && lastDeltaTop === 0) ||
              (deltaBottom === 0 && lastDeltaBottom === 0)
            ) {
              if (pointsDrawn > 0) {
                drawingInfo.context.stroke()
              }

              pointsDrawn = 0
            } else {
              if (pointsDrawn === 0) {
                drawingInfo.context.beginPath()

                drawingInfo.context.moveTo(Math.round((lastX - drawingInfo.drawingArea.left) * drawingInfo.scale), Math.round((drawingInfo.drawingArea.top - lastY) * drawingInfo.scale))
              }

              drawingInfo.context.lineTo(Math.round((x - drawingInfo.drawingArea.left) * drawingInfo.scale), Math.round((drawingInfo.drawingArea.top - y) * drawingInfo.scale))

              pointsDrawn++
            }
          }

          lastX = x
          lastY = y

          lastDeltaLeft = deltaLeft
          lastDeltaRight = deltaRight
          lastDeltaTop = deltaTop
          lastDeltaBottom = deltaBottom
        }

        if (pointsDrawn > 0) {
          drawingInfo.context.stroke()
        }
      }
    }
  },
  _drawPolygonsFilled: function (drawingInfo, polygons_) {
    drawingInfo.context.beginPath()

    for (const polygonRings of polygons_) {
      for (const polygonPoints of polygonRings) {
        const numberOfPoints = polygonPoints.length

        for (let pointIndex = 0; pointIndex < numberOfPoints; pointIndex++) {
          const x = polygonPoints[pointIndex].x
          const y = polygonPoints[pointIndex].y

          if (pointIndex === 0) {
            drawingInfo.context.moveTo(Math.round((x - drawingInfo.drawingArea.left) * drawingInfo.scale), Math.round((drawingInfo.drawingArea.top - y) * drawingInfo.scale))
          } else {
            drawingInfo.context.lineTo(Math.round((x - drawingInfo.drawingArea.left) * drawingInfo.scale), Math.round((drawingInfo.drawingArea.top - y) * drawingInfo.scale))
          }
        }
      }
    }

    drawingInfo.context.fill()
  },
  _convertGeojsonToTileLayer: function (geojsonData, tileLayer, properties) {
    switch (geojsonData.type) {
      case 'FeatureCollection':
        for (const feature of geojsonData.features) {
          this._convertGeojsonToTileLayer(feature, tileLayer)
        }

        break

      case 'Feature':
        this._convertGeojsonToTileLayer(geojsonData.geometry, tileLayer, geojsonData.properties)

        break

      case 'Point':
        {
          const objectData = {
            info: {
              Envelope: {},
              Center: {}
            }
          }

          if (properties) {
            objectData.info.tags = properties
          }

          objectData.geometry = null

          const x = this._longitudeToMeters(geojsonData.coordinates[0])
          const y = this._latitudeToMeters(geojsonData.coordinates[1])

          objectData.info.Envelope.left = x
          objectData.info.Envelope.right = x
          objectData.info.Envelope.top = y
          objectData.info.Envelope.bottom = y

          objectData.info.Center.x = x
          objectData.info.Center.y = y

          tileLayer.push(objectData)
        }

        break

      case 'LineString':
        {
          const objectData = {
            info: {
              Envelope: {},
              Center: {}
            }
          }

          if (properties) {
            objectData.info.tags = properties
          }

          objectData.geometry = new DataView(new Uint8Array(4 + 4 + geojsonData.coordinates.length * 4 * 2).buffer)

          let geometryDataOffset = 0

          objectData.geometry.setUint32(geometryDataOffset, 2, true) // wkbType = 2 (WKBLineString)
          geometryDataOffset += 4

          objectData.geometry.setUint32(geometryDataOffset, geojsonData.coordinates.length, true)
          geometryDataOffset += 4

          let previousX = 0
          let previousY = 0
          let length = -1

          for (const coordinate of geojsonData.coordinates) {
            const x = this._longitudeToMeters(coordinate[0])
            const y = this._latitudeToMeters(coordinate[1])

            if (length < 0) {
              length = 0
            } else {
              const deltaX = (x - previousX)
              const deltaY = (y - previousY)

              length += Math.sqrt(deltaX * deltaX + deltaY * deltaY)
            }

            objectData.info.length = length

            previousX = x
            previousY = y

            if (geometryDataOffset === 4 + 4) {
              objectData.info.Envelope.left = x
              objectData.info.Envelope.right = x
              objectData.info.Envelope.top = y
              objectData.info.Envelope.bottom = y
            } else {
              if (x < objectData.info.Envelope.left) {
                objectData.info.Envelope.left = x
              } else if (x > objectData.info.Envelope.right) {
                objectData.info.Envelope.right = x
              }

              if (y < objectData.info.Envelope.bottom) {
                objectData.info.Envelope.bottom = y
              } else if (y > objectData.info.Envelope.top) {
                objectData.info.Envelope.top = y
              }
            }

            objectData.geometry.setFloat32(geometryDataOffset, x, true)
            geometryDataOffset += 4

            objectData.geometry.setFloat32(geometryDataOffset, y, true)
            geometryDataOffset += 4
          }

          objectData.info.Center.x = (objectData.info.Envelope.left + objectData.info.Envelope.right) / 2
          objectData.info.Center.y = (objectData.info.Envelope.top + objectData.info.Envelope.bottom) / 2

          tileLayer.push(objectData)
        }
        break

      case 'Polygon':
        {
          const objectData = {
            info: {
              Envelope: {},
              Center: {}
            }
          }

          if (properties) {
            objectData.info.tags = properties
          }

          let arraySize = 4 + 4 + 4

          for (const ring of geojsonData.coordinates) {
            arraySize += ring.length * 4 * 2
          }

          objectData.geometry = new DataView(new Uint8Array(arraySize).buffer)

          let geometryDataOffset = 0

          objectData.geometry.setUint32(geometryDataOffset, 3, true) // wkbType = 3 (WKBPolygon)
          geometryDataOffset += 4

          objectData.geometry.setUint32(geometryDataOffset, geojsonData.coordinates.length, true)
          geometryDataOffset += 4

          for (const ring of geojsonData.coordinates) {
            objectData.geometry.setUint32(geometryDataOffset, ring.length, true)
            geometryDataOffset += 4

            for (const coordinate of ring) {
              const x = this._longitudeToMeters(coordinate[0])
              const y = this._latitudeToMeters(coordinate[1])

              if (geometryDataOffset === 4 + 4 + 4) {
                objectData.info.Envelope.left = x
                objectData.info.Envelope.right = x
                objectData.info.Envelope.top = y
                objectData.info.Envelope.bottom = y
              } else {
                if (x < objectData.info.Envelope.left) {
                  objectData.info.Envelope.left = x
                } else if (x > objectData.info.Envelope.right) {
                  objectData.info.Envelope.right = x
                }

                if (y < objectData.info.Envelope.bottom) {
                  objectData.info.Envelope.bottom = y
                } else if (y > objectData.info.Envelope.top) {
                  objectData.info.Envelope.top = y
                }
              }

              objectData.geometry.setFloat32(geometryDataOffset, x, true)
              geometryDataOffset += 4

              objectData.geometry.setFloat32(geometryDataOffset, y, true)
              geometryDataOffset += 4
            }
          }

          objectData.info.Center.x = (objectData.info.Envelope.left + objectData.info.Envelope.right) / 2
          objectData.info.Center.y = (objectData.info.Envelope.top + objectData.info.Envelope.bottom) / 2

          tileLayer.push(objectData)
        }
        break
    }
  },
  _getTileLayers: function (tileCanvas, tileInfo, mapStyle) {
    return new Promise(resolve => {
      const tileLayers = {}

      let layerLayoutIdCount = 0

      for (const layerName of mapStyle.Order) {
        const layer = mapStyle.Layers[layerName]

        const styleType = this._getLayerStyleType(layer)

        if (
          !layer ||
          (this.options.type && this.options.type !== styleType) ||
          layer.Enable === false ||
          tileInfo.vms2TileZ < (layer.ZoomRange[0] > 0 ? layer.ZoomRange[0] + this.options.zoomRangeOffset : 0) ||
          tileInfo.vms2TileZ >= (layer.ZoomRange[1] + this.options.zoomRangeOffset)
        ) {
          continue
        }

        const layerLayout = layer.LayoutLayers || []

        const layerLayoutIds = []

        if (Array.isArray(layerLayout) && layerLayout.length > 0) {
          layerLayoutIds.push(layerLayout[0])
        } else {
          for (const geometryType in layerLayout) {
            for (const osmKeyName in layerLayout[geometryType]) {
              for (const osmValue of layerLayout[geometryType][osmKeyName]) {
                layerLayoutIds.push(osmKeyName + '|' + osmValue + '|' + geometryType)
              }
            }
          }
        }

        layer.needsAreaExtension = !!(this._getLayerStyleType(layer) === 'text' || layer.Grid || layer.Save)

        if (layer.CustomData) {
          if (!tileLayers[layerName]) {
            tileLayers[layerName] = []

            this._convertGeojsonToTileLayer(mapStyle.CustomData[layer.CustomData], tileLayers[layerName])
          }
        } else {
          for (const layerLayoutId of layerLayoutIds) {
            if (!tileLayers[layerName]) {
              tileLayers[layerName] = []
            }

            const tileLayerData = { tileCanvas, tileInfo, dataLayerId: layerLayoutId, layerStyle: layer, tileIds: [], objects: [], tileCount: 0 }

            this._getTileLayer(tileLayerData)
              .then(() => {
                tileLayers[layerName] = tileLayers[layerName].concat(tileLayerData.objects)

                layerLayoutIdCount--

                if (layerLayoutIdCount === 0) {
                  resolve(tileLayers)
                }
              })

            layerLayoutIdCount++
          }
        }
      }

      if (layerLayoutIdCount === 0) {
        resolve(tileLayers)
      }
    })
  },
  _drawSaveLayer: async function (drawingInfo, mapObjects, tileInfo, layer) {
    drawingInfo.isFilled = true

    const saveStyle = layer.Save

    let objectScale = drawingInfo.objectScale

    if (typeof saveStyle.ZoomScale === 'number') {
      objectScale = drawingInfo.objectScale / drawingInfo.userMapScale / Math.pow(DEFAULT_PRINT_DPI * drawingInfo.scale / drawingInfo.userMapScale / tileInfo.dpi, saveStyle.ZoomScale)
    }

    if (typeof saveStyle.StrokeWidth === 'number') {
      drawingInfo.context.lineWidth = saveStyle.StrokeWidth * objectScale * drawingInfo.scale * drawingInfo.adjustedObjectScale

      drawingInfo.context.setLineDash([])
      drawingInfo.context.lineCap = 'round'
      drawingInfo.context.lineJoin = 'round'

      drawingInfo.isStroked = true
    }

    for (const mapObject of mapObjects) {
      if (!mapObject) {
        continue
      }

      if (mapObject.geometry === undefined) { // Tile bounding box object to avoid drawing lines along tile edges.
        drawingInfo.tileBoundingBox = mapObject.info

        continue
      }

      if (
        mapObject.info.Envelope.left > drawingInfo.boundingArea.right ||
        mapObject.info.Envelope.right < drawingInfo.boundingArea.left ||
        mapObject.info.Envelope.bottom > drawingInfo.boundingArea.top ||
        mapObject.info.Envelope.top < drawingInfo.boundingArea.bottom
      ) { // Note: Top > Bottom!
        continue
      }

      mapObject.info.locr_layer = layer.layerName

      if (!mapObject.type) {
        if (typeof mapObject.info.length === 'number') {
          mapObject.type = 'line'
        } else if (mapObject.geometry === null) {
          mapObject.type = 'point'
        } else {
          mapObject.type = 'polygon'
        }
      }

      drawingInfo.objectData = mapObject.info

      this.randomGenerator.init_seed(drawingInfo.objectData.Hash)

      const randomColor = (this.randomGenerator.random_int() & 0xffffff)

      drawingInfo.saveDataIds[randomColor] = drawingInfo.objectData

      const red = (randomColor >> 16) & 0xff
      const green = (randomColor >> 8) & 0xff
      const blue = randomColor & 0xff

      if (drawingInfo.isFilled) {
        drawingInfo.context.fillStyle = '#' + this._hexify24([red, green, blue]) + 'ff'
      }

      if (drawingInfo.isStroked) {
        drawingInfo.context.strokeStyle = '#' + this._hexify24([red, green, blue]) + 'ff'
      }

      this._drawGeometry(drawingInfo, mapObject.geometry)
    }
  },
  _drawBaseLayer: async function (drawingInfo, mapObjects, tileInfo, layer) {
    drawingInfo.isText = false

    if (!layer.isGrid && layer.Style && !layer.Filters) {
      drawingInfo.isIcon = false

      const objectStyle = layer.Style

      let objectScale = drawingInfo.objectScale

      if (typeof objectStyle.ZoomScale === 'number') {
        objectScale = drawingInfo.objectScale / drawingInfo.userMapScale / Math.pow(DEFAULT_PRINT_DPI * drawingInfo.scale / drawingInfo.userMapScale / tileInfo.dpi, objectStyle.ZoomScale)
      }

      if (typeof objectStyle.FillAlpha !== 'number') {
        objectStyle.FillAlpha = 1
      }

      if (objectStyle.FillAlpha && objectStyle.FillColor) {
        drawingInfo.context.fillStyle = '#' + this._hexify32([objectStyle.FillColor[0], objectStyle.FillColor[1], objectStyle.FillColor[2], Math.round(objectStyle.FillAlpha * 255)])

        drawingInfo.isFilled = true
      } else {
        drawingInfo.isFilled = false
      }

      if (typeof objectStyle.StrokeAlpha !== 'number') {
        objectStyle.StrokeAlpha = 1
      }

      if (typeof objectStyle.StrokeWidth === 'number') {
        drawingInfo.context.lineWidth = objectStyle.StrokeWidth * (objectStyle.DisplayUnit === 'px' ? 1 : objectScale * drawingInfo.scale * drawingInfo.adjustedObjectScale)
      }

      if (objectStyle.StrokeAlpha && objectStyle.StrokeWidth > 0 && objectStyle.StrokeColor) {
        drawingInfo.context.strokeStyle = '#' + this._hexify32([objectStyle.StrokeColor[0], objectStyle.StrokeColor[1], objectStyle.StrokeColor[2], Math.round(objectStyle.StrokeAlpha * 255)])

        drawingInfo.isStroked = true
      } else {
        drawingInfo.isStroked = false
      }

      if (drawingInfo.isStroked) {
        if (objectStyle.LineDash) {
          const lineDash = []

          for (const dash of objectStyle.LineDash) {
            lineDash.push(dash * (objectStyle.DisplayUnit === 'px' ? 1 : objectScale * drawingInfo.scale))
          }

          drawingInfo.context.setLineDash(lineDash)
        } else {
          drawingInfo.context.setLineDash([])
        }

        if (objectStyle.LineCap) {
          drawingInfo.context.lineCap = objectStyle.LineCap
        } else {
          drawingInfo.context.lineCap = 'round'
        }

        if (objectStyle.LineJoin) {
          drawingInfo.context.lineJoin = objectStyle.LineJoin
        } else {
          drawingInfo.context.lineJoin = 'round'
        }
      }

      if (objectStyle.PatternFunction) {
        if (typeof objectStyle.PatternFunction === 'string') {
          objectStyle.PatternFunction = new Function(
            'ObjectData',
            'MapZoom',
            'RandomGenerator',
            'return ' + objectStyle.PatternFunction.replace(/<tags.([a-z1-9_:]+)>/g, 'ObjectData.tags[\'$1\']').replace(/<([a-z1-9_:]+)>/g, 'ObjectData.$1')
          )
        }

        const patternName = objectStyle.PatternFunction(drawingInfo.objectData, tileInfo.vms2TileZ, this.randomGenerator)

        if (patternName) {
          const pattern = await this._getPattern(drawingInfo.context, patternName)

          pattern.transformMatrix = new DOMMatrix().translate(drawingInfo.mapArea.left * drawingInfo.scale, drawingInfo.mapArea.top * drawingInfo.scale).scale(drawingInfo.patternScale)

          pattern.setTransform(pattern.transformMatrix)

          drawingInfo.context.fillStyle = pattern

          drawingInfo.isFilled = true
        } else {
          drawingInfo.isFilled = false
        }
      }

      for (const mapObject of mapObjects) {
        if (!mapObject) {
          continue
        }

        if (mapObject.geometry === undefined) { // Tile bounding box object to avoid drawing lines along tile edges.
          drawingInfo.tileBoundingBox = mapObject.info

          continue
        }

        if (
          mapObject.info.Envelope.left > drawingInfo.boundingArea.right ||
          mapObject.info.Envelope.right < drawingInfo.boundingArea.left ||
          mapObject.info.Envelope.bottom > drawingInfo.boundingArea.top ||
          mapObject.info.Envelope.top < drawingInfo.boundingArea.bottom
        ) { // Note: Top > Bottom!
          continue
        }

        if (!mapObject.type) {
          if (typeof mapObject.info.length === 'number') {
            mapObject.type = 'line'
          } else if (mapObject.geometry === null) {
            mapObject.type = 'point'
          } else {
            mapObject.type = 'polygon'
          }
        }

        drawingInfo.objectData = mapObject.info

        if (mapObject.geometry && (drawingInfo.isStroked || drawingInfo.isFilled)) {
          this._drawGeometry(drawingInfo, mapObject.geometry)
        }
      }

      return
    }

    let activeObjectStyle = null

    for (const mapObject of mapObjects) {
      if (!mapObject) {
        continue
      }

      if (mapObject.geometry === undefined) { // Tile bounding box object to avoid drawing lines along tile edges.
        drawingInfo.tileBoundingBox = mapObject.info

        continue
      }

      if (
        mapObject.info.Envelope.left > drawingInfo.boundingArea.right ||
        mapObject.info.Envelope.right < drawingInfo.boundingArea.left ||
        mapObject.info.Envelope.bottom > drawingInfo.boundingArea.top ||
        mapObject.info.Envelope.top < drawingInfo.boundingArea.bottom
      ) { // Note: Top > Bottom!
        continue
      }

      if (!mapObject.type) {
        if (typeof mapObject.info.length === 'number') {
          mapObject.type = 'line'
        } else if (mapObject.geometry === null) {
          mapObject.type = 'point'
        } else {
          mapObject.type = 'polygon'
        }
      }

      drawingInfo.objectData = mapObject.info

      let objectStyle = layer.Style

      if (layer.Filters) {
        let objectData = drawingInfo.objectData

        const x = objectData.Center.x
        const y = objectData.Center.y

        this.randomGenerator.init_seed((Math.round(x) + 0xaffeaffe) * (Math.round(y) + 0xaffeaffe))

        if (drawingInfo.isGrid && drawingInfo.saveDataCanvas) {
          if (!drawingInfo.saveDataPixels) {
            drawingInfo.saveDataPixels = drawingInfo.saveDataCanvas.context.getImageData(0, 0, drawingInfo.saveDataCanvas.width, drawingInfo.saveDataCanvas.height).data

            this._remapPixels(drawingInfo.saveDataPixels, drawingInfo.saveDataIds, drawingInfo.saveDataCanvas.width)
          }

          const pixelX = Math.round((x - drawingInfo.saveDataArea.left) * drawingInfo.scale)
          const pixelY = Math.round((drawingInfo.saveDataArea.top - y) * drawingInfo.scale)

          if (pixelX >= 0 && pixelX < drawingInfo.saveDataCanvas.width && pixelY >= 0 && pixelY < drawingInfo.saveDataCanvas.height) {
            const pixelIndex = (pixelX + pixelY * drawingInfo.saveDataCanvas.width) * 4

            const red = drawingInfo.saveDataPixels[pixelIndex]
            const green = drawingInfo.saveDataPixels[pixelIndex + 1]
            const blue = drawingInfo.saveDataPixels[pixelIndex + 2]

            const color = (red << 16) + (green << 8) + blue

            objectData = drawingInfo.saveDataIds[color]
          } else {
            continue
          }
        }

        if (objectData) {
          for (const filter of layer.Filters) {
            if (filter.Enable === false) {
              continue
            }

            if (filter.Condition) {
              if (typeof filter.Condition === 'string') {
                filter.Condition = new Function(
                  'ObjectData',
                  'MapZoom',
                  'RandomGenerator',
                  'return ' + filter.Condition.replace(/<tags.([a-z1-9_:]+)>/g, 'ObjectData.tags[\'$1\']').replace(/<([a-z1-9_:]+)>/g, 'ObjectData.$1')
                )
              }

              if (filter.Condition(objectData, tileInfo.vms2TileZ, this.randomGenerator)) {
                objectStyle = filter.Style

                break
              }
            }
          }
        }
      }

      if (objectStyle) {
        let objectScale = drawingInfo.objectScale

        if (typeof objectStyle.ZoomScale === 'number') {
          objectScale = drawingInfo.objectScale / drawingInfo.userMapScale / Math.pow(DEFAULT_PRINT_DPI * drawingInfo.scale / drawingInfo.userMapScale / tileInfo.dpi, objectStyle.ZoomScale)
        }

        if (activeObjectStyle !== objectStyle) {
          if (typeof objectStyle.FillAlpha !== 'number') {
            objectStyle.FillAlpha = 1
          }

          if (objectStyle.FillAlpha && objectStyle.FillColor) {
            drawingInfo.context.fillStyle = '#' + this._hexify32([objectStyle.FillColor[0], objectStyle.FillColor[1], objectStyle.FillColor[2], Math.round(objectStyle.FillAlpha * 255)])

            drawingInfo.isFilled = true
          } else {
            drawingInfo.isFilled = false
          }

          if (typeof objectStyle.StrokeAlpha !== 'number') {
            objectStyle.StrokeAlpha = 1
          }

          if (typeof objectStyle.StrokeWidth === 'number') {
            drawingInfo.context.lineWidth = objectStyle.StrokeWidth * (objectStyle.DisplayUnit === 'px' ? 1 : objectScale * drawingInfo.scale * drawingInfo.adjustedObjectScale)
          }

          if (objectStyle.StrokeAlpha && objectStyle.StrokeWidth > 0 && objectStyle.StrokeColor) {
            drawingInfo.context.strokeStyle = '#' + this._hexify32([objectStyle.StrokeColor[0], objectStyle.StrokeColor[1], objectStyle.StrokeColor[2], Math.round(objectStyle.StrokeAlpha * 255)])

            drawingInfo.isStroked = true
          } else {
            drawingInfo.isStroked = false
          }

          if (drawingInfo.isStroked) {
            if (objectStyle.LineDash) {
              const lineDash = []

              for (const dash of objectStyle.LineDash) {
                lineDash.push(dash * (objectStyle.DisplayUnit === 'px' ? 1 : objectScale * drawingInfo.scale))
              }

              drawingInfo.context.setLineDash(lineDash)
            } else {
              drawingInfo.context.setLineDash([])
            }

            if (objectStyle.LineCap) {
              drawingInfo.context.lineCap = objectStyle.LineCap
            } else {
              drawingInfo.context.lineCap = 'round'
            }

            if (objectStyle.LineJoin) {
              drawingInfo.context.lineJoin = objectStyle.LineJoin
            } else {
              drawingInfo.context.lineJoin = 'round'
            }
          }

          if (typeof objectStyle.PatternFunction === 'string') {
            objectStyle.PatternFunction = new Function(
              'ObjectData',
              'MapZoom',
              'RandomGenerator',
              'return ' + objectStyle.PatternFunction.replace(/<tags.([a-z1-9_:]+)>/g, 'ObjectData.tags[\'$1\']').replace(/<([a-z1-9_:]+)>/g, 'ObjectData.$1')
            )
          }

          activeObjectStyle = objectStyle
        }

        drawingInfo.isIcon = false

        drawingInfo.iconImage = null

        drawingInfo.iconWidth = 0
        drawingInfo.iconHeight = 0

        if (typeof activeObjectStyle.PatternFunction === 'function') {
          const patternName = activeObjectStyle.PatternFunction(drawingInfo.objectData, tileInfo.vms2TileZ, this.randomGenerator)

          if (patternName) {
            const pattern = await this._getPattern(drawingInfo.context, patternName)

            pattern.transformMatrix = new DOMMatrix().translate(drawingInfo.mapArea.left * drawingInfo.scale, drawingInfo.mapArea.top * drawingInfo.scale).scale(drawingInfo.patternScale)

            pattern.setTransform(pattern.transformMatrix)

            drawingInfo.context.fillStyle = pattern

            drawingInfo.isFilled = true
          } else {
            drawingInfo.isFilled = false
          }
        }

        if (mapObject.geometry && (drawingInfo.isStroked || drawingInfo.isFilled)) {
          this._drawGeometry(drawingInfo, mapObject.geometry)
        } else if (drawingInfo.isIcon) {
          this._drawIcon(drawingInfo, mapObject.info.Center.x, mapObject.info.Center.y)
        }
      }
    }
  },
  _drawObjectsLayer: async function (drawingInfo, mapObjects_, tileInfo, layer_) {
    let activeObjectStyle = null

    for (const mapObject of mapObjects_) {
      if (!mapObject) {
        continue
      }

      if (mapObject.geometry === undefined) { // Tile bounding box object to avoid drawing lines along tile edges.
        drawingInfo.tileBoundingBox = mapObject.info

        continue
      }

      if (
        mapObject.info.Envelope.left > drawingInfo.boundingArea.right ||
        mapObject.info.Envelope.right < drawingInfo.boundingArea.left ||
        mapObject.info.Envelope.bottom > drawingInfo.boundingArea.top ||
        mapObject.info.Envelope.top < drawingInfo.boundingArea.bottom
      ) { // Note: Top > Bottom!
        continue
      }

      if (!mapObject.type) {
        if (typeof mapObject.info.length === 'number') {
          mapObject.type = 'line'
        } else if (mapObject.geometry === null) {
          mapObject.type = 'point'
        } else {
          mapObject.type = 'polygon'
        }
      }

      drawingInfo.objectData = mapObject.info

      let objectStyle = layer_.Style

      if (layer_.Filters) {
        let objectData = drawingInfo.objectData

        const x = objectData.Center.x
        const y = objectData.Center.y

        this.randomGenerator.init_seed((Math.round(x) + 0xaffeaffe) * (Math.round(y) + 0xaffeaffe))

        if (drawingInfo.isGrid && drawingInfo.saveDataCanvas) {
          if (!drawingInfo.saveDataPixels) {
            drawingInfo.saveDataPixels = drawingInfo.saveDataCanvas.context.getImageData(0, 0, drawingInfo.saveDataCanvas.width, drawingInfo.saveDataCanvas.height).data

            this._remapPixels(drawingInfo.saveDataPixels, drawingInfo.saveDataIds, drawingInfo.saveDataCanvas.width)
          }

          const pixelX = Math.round((x - drawingInfo.saveDataArea.left) * drawingInfo.scale)
          const pixelY = Math.round((drawingInfo.saveDataArea.top - y) * drawingInfo.scale)

          if (pixelX >= 0 && pixelX < drawingInfo.saveDataCanvas.width && pixelY >= 0 && pixelY < drawingInfo.saveDataCanvas.height) {
            const pixelIndex = (pixelX + pixelY * drawingInfo.saveDataCanvas.width) * 4

            const red = drawingInfo.saveDataPixels[pixelIndex]
            const green = drawingInfo.saveDataPixels[pixelIndex + 1]
            const blue = drawingInfo.saveDataPixels[pixelIndex + 2]

            const color = (red << 16) + (green << 8) + blue

            objectData = drawingInfo.saveDataIds[color]
          } else {
            continue
          }
        }

        if (objectData) {
          for (const filter of layer_.Filters) {
            if (filter.Enable === false) {
              continue
            }

            if (filter.Condition) {
              if (typeof filter.Condition === 'string') {
                filter.Condition = new Function(
                  'ObjectData',
                  'MapZoom',
                  'RandomGenerator',
                  'return ' + filter.Condition.replace(/<tags.([a-z1-9_:]+)>/g, 'ObjectData.tags[\'$1\']').replace(/<([a-z1-9_:]+)>/g, 'ObjectData.$1')
                )
              }

              if (filter.Condition(objectData, tileInfo.vms2TileZ, this.randomGenerator)) {
                objectStyle = filter.Style

                break
              }
            }
          }
        }
      }

      if (objectStyle) {
        let objectScale = drawingInfo.objectScale

        if (typeof objectStyle.ZoomScale === 'number') {
          objectScale = drawingInfo.objectScale / drawingInfo.userMapScale / Math.pow(DEFAULT_PRINT_DPI * drawingInfo.scale / drawingInfo.userMapScale / tileInfo.dpi, objectStyle.ZoomScale)
        }

        if (activeObjectStyle !== objectStyle) {
          if (typeof objectStyle.FillAlpha !== 'number') {
            objectStyle.FillAlpha = 1
          }

          if (objectStyle.FillAlpha && objectStyle.FillColor) {
            drawingInfo.context.fillStyle = '#' + this._hexify32([objectStyle.FillColor[0], objectStyle.FillColor[1], objectStyle.FillColor[2], Math.round(objectStyle.FillAlpha * 255)])

            drawingInfo.isFilled = true
          } else {
            drawingInfo.isFilled = false
          }

          if (typeof objectStyle.StrokeAlpha !== 'number') {
            objectStyle.StrokeAlpha = 1
          }

          if (typeof objectStyle.StrokeWidth === 'number') {
            drawingInfo.context.lineWidth = objectStyle.StrokeWidth * (objectStyle.DisplayUnit === 'px' ? 1 : objectScale * drawingInfo.scale * drawingInfo.adjustedObjectScale)
          }

          if (objectStyle.StrokeAlpha && objectStyle.StrokeWidth > 0 && objectStyle.StrokeColor) {
            drawingInfo.context.strokeStyle = '#' + this._hexify32([objectStyle.StrokeColor[0], objectStyle.StrokeColor[1], objectStyle.StrokeColor[2], Math.round(objectStyle.StrokeAlpha * 255)])

            drawingInfo.isStroked = true
          } else {
            drawingInfo.isStroked = false
          }

          if (drawingInfo.isStroked) {
            if (objectStyle.LineDash) {
              const lineDash = []

              for (const dash of objectStyle.LineDash) {
                lineDash.push(dash * (objectStyle.DisplayUnit === 'px' ? 1 : objectScale * drawingInfo.scale))
              }

              drawingInfo.context.setLineDash(lineDash)
            } else {
              drawingInfo.context.setLineDash([])
            }

            if (objectStyle.LineCap) {
              drawingInfo.context.lineCap = objectStyle.LineCap
            } else {
              drawingInfo.context.lineCap = 'round'
            }

            if (objectStyle.LineJoin) {
              drawingInfo.context.lineJoin = objectStyle.LineJoin
            } else {
              drawingInfo.context.lineJoin = 'round'
            }
          }

          if (objectStyle.FontFamily && objectStyle.FontSize != null) {
            await this._requestFontFace(objectStyle)

            drawingInfo.fontSize = objectStyle.FontSize * objectScale

            let fontStyle = 'normal'

            if (objectStyle.FontStyle) {
              fontStyle = objectStyle.FontStyle
            }

            drawingInfo.context.font = fontStyle + ' ' + (drawingInfo.fontSize * drawingInfo.scale) + 'px \'' + objectStyle.FontFamily + '\''

            drawingInfo.fontStyle = fontStyle
            drawingInfo.fontFamily = objectStyle.FontFamily
          }

          if (typeof objectStyle.IconFunction === 'string') {
            objectStyle.IconFunction = new Function(
              'ObjectData',
              'MapZoom',
              'RandomGenerator',
              'return ' + objectStyle.IconFunction.replace(/<tags.([a-z1-9_:]+)>/g, 'ObjectData.tags[\'$1\']').replace(/<([a-z1-9_:]+)>/g, 'ObjectData.$1')
            )
          }

          if (typeof objectStyle.PatternFunction === 'string') {
            objectStyle.PatternFunction = new Function(
              'ObjectData',
              'MapZoom',
              'RandomGenerator',
              'return ' + objectStyle.PatternFunction.replace(/<tags.([a-z1-9_:]+)>/g, 'ObjectData.tags[\'$1\']').replace(/<([a-z1-9_:]+)>/g, 'ObjectData.$1')
            )
          }

          activeObjectStyle = objectStyle
        }

        drawingInfo.isIcon = false
        drawingInfo.isText = false

        drawingInfo.iconImage = null
        drawingInfo.text = null

        drawingInfo.iconWidth = 0
        drawingInfo.iconHeight = 0
        drawingInfo.iconTextOffsetX = 0
        drawingInfo.iconTextOffsetY = 0

        if (typeof activeObjectStyle.IconFunction === 'function') {
          const x = drawingInfo.objectData.Center.x
          const y = drawingInfo.objectData.Center.y

          this.randomGenerator.init_seed((Math.round(x) + 0xaffeaffe) * (Math.round(y) + 0xaffeaffe))

          const iconName = activeObjectStyle.IconFunction(drawingInfo.objectData, tileInfo.vms2TileZ, this.randomGenerator)

          if (iconName) {
            let iconUrl = iconName

            if (!/^http.*:\/\//.test(iconName) && !/^\.\//.test(iconName)) {
              iconUrl = this.options.assetsUrl + '/images/icons/' + iconName.replace(/file:\/\/[^/]*\//g, '')
            }

            drawingInfo.iconImage = await this._requestImage(iconUrl)

            const iconScales = [1, 1]

            if (activeObjectStyle.IconScales != null) {
              iconScales[0] = activeObjectStyle.IconScales[0]
              iconScales[1] = activeObjectStyle.IconScales[1]
            }

            drawingInfo.iconMirrorX = iconScales[0] < 0 ? -1 : 1
            drawingInfo.iconMirrorY = iconScales[1] < 0 ? -1 : 1

            drawingInfo.iconWidth = Math.abs(drawingInfo.iconImage.width * iconScales[0]) * (objectStyle.DisplayUnit === 'px' ? 1 / drawingInfo.scale : objectScale)
            drawingInfo.iconHeight = Math.abs(drawingInfo.iconImage.height * iconScales[1]) * (objectStyle.DisplayUnit === 'px' ? 1 / drawingInfo.scale : objectScale)

            drawingInfo.iconAngle = drawingInfo.objectData.Angle || 0

            const iconImageAnchor = [0, 0]

            if (activeObjectStyle.IconImageAnchor) {
              iconImageAnchor[0] = objectStyle.DisplayUnit === 'px' ? (activeObjectStyle.IconImageAnchor[0] - drawingInfo.iconImage.width / 2) / drawingInfo.scale : (activeObjectStyle.IconImageAnchor[0] - 0.5) * Math.abs(drawingInfo.iconImage.width * iconScales[0]) * objectScale
              iconImageAnchor[1] = objectStyle.DisplayUnit === 'px' ? (activeObjectStyle.IconImageAnchor[1] - drawingInfo.iconImage.height / 2) / drawingInfo.scale : (activeObjectStyle.IconImageAnchor[1] - 0.5) * Math.abs(drawingInfo.iconImage.height * iconScales[1]) * objectScale
            }

            const iconImageOffsets = [0, 0]

            if (activeObjectStyle.IconImageOffsets) {
              iconImageOffsets[0] = activeObjectStyle.IconImageOffsets[0] * (objectStyle.DisplayUnit === 'px' ? 1 / drawingInfo.scale : Math.abs(drawingInfo.iconImage.width * iconScales[0]) * objectScale)
              iconImageOffsets[1] = activeObjectStyle.IconImageOffsets[1] * (objectStyle.DisplayUnit === 'px' ? 1 / drawingInfo.scale : Math.abs(drawingInfo.iconImage.height * iconScales[1]) * objectScale)
            }

            drawingInfo.iconImageOffsetX = iconImageOffsets[0] - iconImageAnchor[0]
            drawingInfo.iconImageOffsetY = iconImageOffsets[1] - iconImageAnchor[1]

            const iconTextOffset = [0, 0]

            if (activeObjectStyle.IconTextOffset) {
              iconTextOffset[0] = activeObjectStyle.IconTextOffset[0] * (objectStyle.DisplayUnit === 'px' ? 1 / drawingInfo.scale : objectScale)
              iconTextOffset[1] = activeObjectStyle.IconTextOffset[1] * (objectStyle.DisplayUnit === 'px' ? 1 / drawingInfo.scale : objectScale)
            }

            drawingInfo.iconTextOffsetX = iconTextOffset[0]
            drawingInfo.iconTextOffsetY = iconTextOffset[1]

            let iconMinimumDistance = 200

            if (activeObjectStyle.IconMinimumDistance) {
              iconMinimumDistance = activeObjectStyle.IconMinimumDistance
            }

            drawingInfo.iconMinimumDistance = iconMinimumDistance * (objectStyle.DisplayUnit === 'px' ? 1 / drawingInfo.scale : objectScale)

            drawingInfo.iconTextPlacement = activeObjectStyle.IconTextPlacement
          }

          drawingInfo.isIcon = true
        }

        if (typeof activeObjectStyle.TextFunction === 'string') {
          activeObjectStyle.TextFunction = new Function(
            'ObjectData',
            'MapZoom',
            'RandomGenerator',
            'return ' + activeObjectStyle.TextFunction.replace(/<tags.([a-z1-9_:]+)>/g, 'ObjectData.tags[\'$1\']').replace(/<([a-z1-9_:]+)>/g, 'ObjectData.$1')
          )
        }

        if (typeof activeObjectStyle.TextFunction === 'function') {
          drawingInfo.text = activeObjectStyle.TextFunction(drawingInfo.objectData, tileInfo.vms2TileZ, this.randomGenerator)

          drawingInfo.isText = true
        }

        if (typeof activeObjectStyle.PatternFunction === 'function') {
          const patternName = activeObjectStyle.PatternFunction(drawingInfo.objectData, tileInfo.vms2TileZ, this.randomGenerator)

          if (patternName) {
            const pattern = await this._getPattern(drawingInfo.context, patternName)

            pattern.transformMatrix = new DOMMatrix().translate(drawingInfo.mapArea.left * drawingInfo.scale, drawingInfo.mapArea.top * drawingInfo.scale).scale(drawingInfo.patternScale)

            pattern.setTransform(pattern.transformMatrix)

            drawingInfo.context.fillStyle = pattern

            drawingInfo.isFilled = true
          } else {
            drawingInfo.isFilled = false
          }
        }

        let displacementScale = [1, 1]

        if (activeObjectStyle.DisplacementScale) {
          displacementScale = activeObjectStyle.DisplacementScale
        }

        drawingInfo.displacementScaleX = displacementScale[0]
        drawingInfo.displacementScaleY = displacementScale[1]

        if (mapObject.geometry && (drawingInfo.isStroked || drawingInfo.isFilled)) {
          this._drawGeometry(drawingInfo, mapObject.geometry)
        } else if (drawingInfo.isIcon || drawingInfo.isText) {
          this._drawIcon(drawingInfo, drawingInfo.objectData.Center.x, drawingInfo.objectData.Center.y)
        }
      }
    }
  },
  _getLayerStyleType: function (layer) {
    if (layer.Style) {
      if (layer.Style.IconFunction || layer.Style.TextFunction) {
        return 'text'
      } else if (layer.Filters) {
        for (const filter of layer.Filters) {
          if (filter.Style && (filter.Style.IconFunction || filter.Style.TextFunction)) {
            return 'text'
          }
        }
      }
    }

    return 'base'
  },
  _requestStyle: function () {
    return new Promise(resolve => {
      if (this.options.style.Order && Array.isArray(this.options.style.Order)) {
        resolve(this.options.style)
      } else {
        const styleId = this.options.style

        if (!globalThis.vms2Context.styleRequestQueues[styleId]) {
          globalThis.vms2Context.styleRequestQueues[styleId] = []
        }

        globalThis.vms2Context.styleRequestQueues[styleId].push(resolve)

        if (globalThis.vms2Context.styleRequestQueues[styleId].length === 1) {
          const url = new URL(this.options.styleUrl.replace('{style_id}', styleId), window.location.origin)

          const parameters = new URLSearchParams(url.search)

          const formBody = []

          for (const keyValuePair of parameters.entries()) {
            formBody.push(encodeURIComponent(keyValuePair[0]) + '=' + encodeURIComponent(keyValuePair[1]))
          }

          const options = {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formBody.join('&')
          }

          fetch(url.origin + url.pathname, options)
            .then(response => response.json())
            .then(style => {
              this.options.style = style

              for (const styleRequestResolve of globalThis.vms2Context.styleRequestQueues[styleId]) {
                styleRequestResolve(this.options.style)
              }

              globalThis.vms2Context.styleRequestQueues[styleId] = []
            })
        }
      }
    })
  },
  _drawTile: function (tileCanvas, tileInfo) {
    return new Promise(resolve => {
      this._requestTileDbInfos()
        .then(() => {
          this._requestStyle()
            .then(style => {
              let mapStyle = {}

              if (this.options.styleOverride) {
                for (const key in style) {
                  if (Object.prototype.hasOwnProperty.call(style, key)) {
                    mapStyle[key] = style[key]
                  }
                }

                for (const key in this.options.styleOverride) {
                  if (Object.prototype.hasOwnProperty.call(this.options.styleOverride, key)) {
                    mapStyle[key] = this.options.styleOverride[key]
                  }
                }
              } else {
                mapStyle = style
              }

              if (tileInfo.drawingContext) {
                tileInfo.drawingContext.width = tileCanvas.width
                tileInfo.drawingContext.height = tileCanvas.height

                tileCanvas.context = tileInfo.drawingContext
              }

              tileInfo.width = tileCanvas.width
              tileInfo.height = tileCanvas.height

              const userMapScale = tileInfo.mapScale ?? this.printMapScale ?? this.options.mapScale

              tileInfo.mapBounds = {}

              if (typeof tileInfo.x === 'number' && typeof tileInfo.y === 'number' && typeof tileInfo.z === 'number') {
                tileInfo.mapBounds.longitudeMin = this._tileToLongitude(tileInfo.x, tileInfo.z, this.options.zoomPowerBase)
                tileInfo.mapBounds.longitudeMax = this._tileToLongitude(tileInfo.x + 1, tileInfo.z, this.options.zoomPowerBase)
                tileInfo.mapBounds.latitudeMin = this._tileToLatitude(tileInfo.y + 1, tileInfo.z, this.options.zoomPowerBase)
                tileInfo.mapBounds.latitudeMax = this._tileToLatitude(tileInfo.y, tileInfo.z, this.options.zoomPowerBase)

                tileInfo.dpi = (this.options.dpi ?? DEFAULT_PRINT_DPI) * tileInfo.width / this.tileSize
              } else {
                tileInfo.mapBounds.longitudeMin = tileInfo.longitudeMin
                tileInfo.mapBounds.longitudeMax = tileInfo.longitudeMax
                tileInfo.mapBounds.latitudeMin = tileInfo.latitudeMin
                tileInfo.mapBounds.latitudeMax = tileInfo.latitudeMax

                const degreesWidth = tileInfo.mapBounds.longitudeMax - tileInfo.mapBounds.longitudeMin

                const normalizedWidth = degreesWidth / 360
                const normalizedHeight = this._latitudeToNormalized(tileInfo.mapBounds.latitudeMin) - this._latitudeToNormalized(tileInfo.mapBounds.latitudeMax)

                const normalizedRatio = normalizedWidth / normalizedHeight
                const mapRatio = tileInfo.width / tileInfo.height

                if (mapRatio >= normalizedRatio) {
                  tileInfo.mapBounds.longitudeMin -= (degreesWidth * mapRatio / normalizedRatio - degreesWidth) / 2
                  tileInfo.mapBounds.longitudeMax += (degreesWidth * mapRatio / normalizedRatio - degreesWidth) / 2
                } else {
                  let normalizedMin = this._latitudeToNormalized(tileInfo.mapBounds.latitudeMin)
                  let normalizedMax = this._latitudeToNormalized(tileInfo.mapBounds.latitudeMax)

                  normalizedMin += (normalizedWidth / mapRatio - normalizedHeight) / 2
                  normalizedMax -= (normalizedWidth / mapRatio - normalizedHeight) / 2

                  tileInfo.mapBounds.latitudeMin = this._normalizedToLatitude(normalizedMin)
                  tileInfo.mapBounds.latitudeMax = this._normalizedToLatitude(normalizedMax)
                }

                tileInfo.dpi ??= DEFAULT_PRINT_DPI

                const tileSize = this.tileSize * tileInfo.dpi / DEFAULT_PRINT_DPI

                tileInfo.z = Math.log(360 * tileInfo.width / tileSize / (tileInfo.mapBounds.longitudeMax - tileInfo.mapBounds.longitudeMin)) / Math.log(this.options.zoomPowerBase)
              }

              const tileAreaDrawingExtension = TILE_AREA_DRAWING_EXTENSION * userMapScale

              tileInfo.drawingMapBounds = {
                latitudeMin: this._tileToLatitude(this._latitudeToTile(tileInfo.mapBounds.latitudeMin, tileInfo.z, this.options.zoomPowerBase) + tileAreaDrawingExtension, tileInfo.z, this.options.zoomPowerBase),
                latitudeMax: this._tileToLatitude(this._latitudeToTile(tileInfo.mapBounds.latitudeMax, tileInfo.z, this.options.zoomPowerBase) - tileAreaDrawingExtension, tileInfo.z, this.options.zoomPowerBase),
                longitudeMin: this._tileToLongitude(this._longitudeToTile(tileInfo.mapBounds.longitudeMin, tileInfo.z, this.options.zoomPowerBase) - tileAreaDrawingExtension, tileInfo.z, this.options.zoomPowerBase),
                longitudeMax: this._tileToLongitude(this._longitudeToTile(tileInfo.mapBounds.longitudeMax, tileInfo.z, this.options.zoomPowerBase) + tileAreaDrawingExtension, tileInfo.z, this.options.zoomPowerBase)
              }

              const tileAreaSaveExtension = TILE_AREA_SAVE_EXTENSION * userMapScale

              tileInfo.saveMapBounds = {
                latitudeMin: this._tileToLatitude(this._latitudeToTile(tileInfo.mapBounds.latitudeMin, tileInfo.z, this.options.zoomPowerBase) + tileAreaSaveExtension, tileInfo.z, this.options.zoomPowerBase),
                latitudeMax: this._tileToLatitude(this._latitudeToTile(tileInfo.mapBounds.latitudeMax, tileInfo.z, this.options.zoomPowerBase) - tileAreaSaveExtension, tileInfo.z, this.options.zoomPowerBase),
                longitudeMin: this._tileToLongitude(this._longitudeToTile(tileInfo.mapBounds.longitudeMin, tileInfo.z, this.options.zoomPowerBase) - tileAreaSaveExtension, tileInfo.z, this.options.zoomPowerBase),
                longitudeMax: this._tileToLongitude(this._longitudeToTile(tileInfo.mapBounds.longitudeMax, tileInfo.z, this.options.zoomPowerBase) + tileAreaSaveExtension, tileInfo.z, this.options.zoomPowerBase)
              }

              tileInfo.vms2TileZ = Math.round(Math.log2(Math.pow(this.options.zoomPowerBase, tileInfo.z) / userMapScale))

              this._getTileLayers(tileCanvas, tileInfo, mapStyle)
                .then(async tileLayers => {
                  if (tileCanvas.isDummy) {
                    return resolve(tileLayers)
                  }

                  if (tileCanvas.hasBeenRemoved) {
                    return resolve()
                  }

                  if (tileCanvas.hasBeenCreated) {
                    this.tileCanvases.push(tileCanvas)

                    tileCanvas.hasBeenCreated = false
                  }

                  if (!tileCanvas.context) {
                    tileCanvas.context = tileCanvas.getContext('2d')

                    tileCanvas.context.patterns = {}

                    tileCanvas.context.beginGroup = function (name) {
                    }

                    tileCanvas.context.endGroup = function () {
                    }
                  }

                  tileCanvas.context.clearRect(0, 0, tileCanvas.width, tileCanvas.height)

                  const mapArea = {
                    left: this._longitudeToMeters(tileInfo.mapBounds.longitudeMin),
                    right: this._longitudeToMeters(tileInfo.mapBounds.longitudeMax),
                    bottom: this._latitudeToMeters(tileInfo.mapBounds.latitudeMin),
                    top: this._latitudeToMeters(tileInfo.mapBounds.latitudeMax)
                  }

                  const extendedMapArea = {
                    left: this._longitudeToMeters(tileInfo.drawingMapBounds.longitudeMin),
                    right: this._longitudeToMeters(tileInfo.drawingMapBounds.longitudeMax),
                    bottom: this._latitudeToMeters(tileInfo.drawingMapBounds.latitudeMin),
                    top: this._latitudeToMeters(tileInfo.drawingMapBounds.latitudeMax)
                  }

                  const saveDataArea = {
                    left: this._longitudeToMeters(tileInfo.saveMapBounds.longitudeMin),
                    right: this._longitudeToMeters(tileInfo.saveMapBounds.longitudeMax),
                    bottom: this._latitudeToMeters(tileInfo.saveMapBounds.latitudeMin),
                    top: this._latitudeToMeters(tileInfo.saveMapBounds.latitudeMax)
                  }

                  const drawingInfo = {
                    mapArea,
                    extendedMapArea,
                    mapWidth_: tileInfo.width,
                    mapHeight: tileInfo.height,

                    userMapScale,
                    objectScale: this.options.objectScale * userMapScale,

                    drawingArea: mapArea,
                    boundingArea: mapArea,

                    mapCanvas: null,

                    saveDataArea,
                    saveDataCanvas: null,

                    workCanvases_: {},

                    iconPositions: {},

                    patternScale: tileInfo.dpi * 72 / DEFAULT_PRINT_DPI / DEFAULT_PRINT_DPI * userMapScale,
                    scale: tileInfo.width / (mapArea.right - mapArea.left),
                    adjustedObjectScale: Math.abs(tileInfo.vms2TileZ < 6 ? 0.7 : 0.7 / Math.cos(tileInfo.mapBounds.latitudeMin * Math.PI / 180)),

                    displacementLayers: {
                      '': {
                        shift: 26 - Math.round(tileInfo.vms2TileZ),
                        regions: {},
                        allowedMapArea: null // { left: mapArea.left, right: mapArea.right, top: mapArea.top, bottom: mapArea.bottom } }
                      }
                    },
                    displacementLayerNames: [''],

                    saveDataIds: {},
                    saveDataPixels: null
                  }

                  drawingInfo.mapCanvas = tileCanvas

                  if (this.options.allowedMapArea) {
                    if (this.options.allowedMapArea === true) {
                      drawingInfo.displacementLayers[''].allowedMapArea = drawingInfo.mapArea
                    } else {
                      drawingInfo.displacementLayers[''].allowedMapArea = {
                        left: this._longitudeToMeters(this.options.allowedMapArea.longitudeMin),
                        right: this._longitudeToMeters(this.options.allowedMapArea.longitudeMax),
                        top: this._latitudeToMeters(this.options.allowedMapArea.latitudeMax),
                        bottom: this._latitudeToMeters(this.options.allowedMapArea.latitudeMin)
                      }
                    }
                  }

                  if (this.options.displacementIcons) {
                    const displacementBoxes = []

                    for (const displacementIcon of this.options.displacementIcons) {
                      const width = displacementIcon.size[0]
                      const height = displacementIcon.size[1]

                      const anchorX = displacementIcon.anchor ? displacementIcon.anchor[0] : (width / 2)
                      const anchorY = height - (displacementIcon.anchor ? displacementIcon.anchor[1] : (height / 2))

                      const left = this._longitudeToMeters(displacementIcon.longitude) - anchorX * tileInfo.width / (this.tileSize * drawingInfo.scale)
                      const right = this._longitudeToMeters(displacementIcon.longitude) + (width - anchorX) * tileInfo.width / (this.tileSize * drawingInfo.scale)
                      const top = this._latitudeToMeters(displacementIcon.latitude) + (height - anchorY) * tileInfo.width / (this.tileSize * drawingInfo.scale)
                      const bottom = this._latitudeToMeters(displacementIcon.latitude) - anchorY * tileInfo.width / (this.tileSize * drawingInfo.scale)

                      displacementBoxes.push({ left, right, top, bottom })
                    }

                    this._checkAndSetDisplacement(drawingInfo.displacementLayers, drawingInfo.displacementLayerNames, displacementBoxes)
                  }

                  // Process all style layers.

                  for (const layerName of mapStyle.Order) {
                    if (drawingInfo.mapCanvas.hasBeenRemoved) {
                      continue
                    }

                    const layer = mapStyle.Layers[layerName]

                    let styleType = this._getLayerStyleType(layer)

                    if (
                      !layer ||
                      (this.options.type && this.options.type !== styleType) ||
                      layer.Enable === false ||
                      tileInfo.vms2TileZ < (layer.ZoomRange[0] > 0 ? layer.ZoomRange[0] + this.options.zoomRangeOffset : 0) ||
                      tileInfo.vms2TileZ >= (layer.ZoomRange[1] + this.options.zoomRangeOffset)
                    ) {
                      continue
                    }

                    const mapObjects = tileLayers[layerName] || []

                    // Create grid points.

                    if (layer.Grid) {
                      drawingInfo.isGrid = true

                      const gridZoomScale = 1 / drawingInfo.userMapScale / Math.pow(DEFAULT_PRINT_DPI * drawingInfo.scale / drawingInfo.userMapScale / tileInfo.dpi, layer.Grid.ZoomScale || 1)

                      const gridSize = [layer.Grid.Size[0] * drawingInfo.objectScale * gridZoomScale, layer.Grid.Size[1] * drawingInfo.objectScale * gridZoomScale]

                      const gridOffset = [0, 0]

                      if (layer.Grid.Offset) {
                        gridOffset[0] = layer.Grid.Offset[0] * drawingInfo.objectScale * gridZoomScale
                        gridOffset[1] = layer.Grid.Offset[1] * drawingInfo.objectScale * gridZoomScale
                      }

                      const gridSkew = [0, 0]

                      if (layer.Grid.Skew) {
                        gridSkew[0] = layer.Grid.Skew[0] * drawingInfo.objectScale * gridZoomScale
                        gridSkew[1] = layer.Grid.Skew[1] * drawingInfo.objectScale * gridZoomScale
                      }

                      const randomDistribution = [0, 0]

                      if (layer.Grid.RandomDistribution) {
                        randomDistribution[0] = layer.Grid.RandomDistribution[0] * drawingInfo.objectScale * gridZoomScale
                        randomDistribution[1] = layer.Grid.RandomDistribution[1] * drawingInfo.objectScale * gridZoomScale
                      }

                      const randomAngle = [0, 0]

                      if (layer.Grid.RandomAngle) {
                        randomAngle[0] = layer.Grid.RandomAngle[0] * Math.PI * 2
                        randomAngle[1] = layer.Grid.RandomAngle[1] * Math.PI * 2
                      }

                      const worldTop = this._tileYToMeters(0, 0)
                      const worldLeft = this._tileXToMeters(0, 0)

                      const gridStartIndexX = Math.floor((drawingInfo.saveDataArea.left - worldLeft) / gridSize[0]) - 1
                      let gridIndexY = Math.floor((worldTop - drawingInfo.saveDataArea.top) / gridSize[1]) - 1

                      const gridLeft = gridStartIndexX * gridSize[0] + worldLeft
                      const gridRight = drawingInfo.saveDataArea.right
                      const gridTop = worldTop - gridIndexY * gridSize[1]
                      const gridBottom = drawingInfo.saveDataArea.bottom

                      const gridPoints = []

                      for (let gridY = gridTop; gridY >= gridBottom; gridIndexY++) {
                        gridY = worldTop - gridIndexY * gridSize[1]

                        const gridSkewX = (gridIndexY * gridSkew[0]) % gridSize[0]

                        for (let gridX = gridLeft, gridIndexX = gridStartIndexX; gridX <= gridRight; gridIndexX++) {
                          gridX = gridIndexX * gridSize[0] + worldLeft

                          this.randomGenerator.init_seed((Math.round(gridIndexX) + 0xaffeaffe) * (Math.round(gridIndexY) + 0xaffeaffe))

                          const gridSkewY = (gridIndexX * gridSkew[1]) % gridSize[1]

                          gridPoints.push({
                            x: gridX + gridSkewX + gridOffset[0] + randomDistribution[0] * this.randomGenerator.random(),
                            y: gridY - gridSkewY - gridOffset[1] - randomDistribution[1] * this.randomGenerator.random(),
                            angle: randomAngle[0] + randomAngle[1] * this.randomGenerator.random()
                          })
                        }
                      }

                      gridPoints.sort((a, b) => { return (b.y - a.y) })

                      for (const gridPoint of gridPoints) {
                        const center = {}

                        center.x = gridPoint.x
                        center.y = gridPoint.y

                        const envelope = {}

                        envelope.left = envelope.right = gridPoint.x
                        envelope.bottom = envelope.top = gridPoint.y

                        const objectInfo = { Center: center, Envelope: envelope, Angle: gridPoint.angle }

                        mapObjects.push({ info: objectInfo, geometry: null })
                      }

                      styleType = 'text'
                    } else {
                      drawingInfo.isGrid = false
                    }

                    // Sort map objects.

                    if (layer.SortFunction) {
                      const sortFunction = new Function('a', 'b', 'return (' + layer.SortFunction + ')')

                      mapObjects.sort((a, b) => {
                        if (a && b) {
                          return sortFunction(a.info, b.info)
                        } else {
                          return 0
                        }
                      })
                    }

                    // Draw objects on all defined canvases.

                    const layerCanvasNames = [''] // layer_.CanvasNames || [ '' ]

                    if (layer.Save) {
                      layerCanvasNames.push('save')
                    }

                    for (const layerCanvasName of layerCanvasNames) {
                      if (layerCanvasName === 'save') {
                        if (!drawingInfo.saveDataCanvas) {
                          let saveDataCanvas = null

                          for (const canvas of this.saveDataCanvases) {
                            if (!canvas.inUse) {
                              saveDataCanvas = canvas

                              break
                            }
                          }

                          if (!drawingInfo.mapCanvas.isTile || !saveDataCanvas) {
                            saveDataCanvas = document.createElement('canvas')

                            saveDataCanvas.width = drawingInfo.mapCanvas.width * (1 + 2 * TILE_AREA_SAVE_EXTENSION)
                            saveDataCanvas.height = drawingInfo.mapCanvas.height * (1 + 2 * TILE_AREA_SAVE_EXTENSION)

                            saveDataCanvas.context = saveDataCanvas.getContext('2d', { willReadFrequently: true })

                            saveDataCanvas.context.patterns = {}

                            saveDataCanvas.context.beginGroup = function (name_) {
                            }

                            saveDataCanvas.context.endGroup = function () {
                            }

                            this.saveDataCanvases.push(saveDataCanvas)
                          }

                          saveDataCanvas.context.clearRect(0, 0, saveDataCanvas.width, saveDataCanvas.height)

                          saveDataCanvas.inUse = true

                          drawingInfo.saveDataCanvas = saveDataCanvas
                        }

                        drawingInfo.context = drawingInfo.saveDataCanvas.context

                        drawingInfo.drawingArea = drawingInfo.saveDataArea
                      } else {
                        drawingInfo.context = drawingInfo.mapCanvas.context

                        drawingInfo.drawingArea = drawingInfo.mapArea
                      }

                      if (layerCanvasName !== 'save' && !layer.Style && !layer.Filters) {
                        continue
                      }

                      if (layer.needsAreaExtension) {
                        drawingInfo.boundingArea = drawingInfo.extendedMapArea
                      } else {
                        drawingInfo.boundingArea = drawingInfo.mapArea
                      }

                      // Canvas preparation.

                      drawingInfo.context.beginGroup(layerName)

                      drawingInfo.context.setTransform(new DOMMatrix())

                      drawingInfo.context.globalCompositeOperation = layer.CompositeOperation || 'source-over'
                      drawingInfo.context.filter = layer.CanvasFilter || 'none'

                      drawingInfo.context.fillStyle = '#00000000'
                      drawingInfo.context.strokeStyle = '#00000000'
                      drawingInfo.context.lineWidth = 0
                      drawingInfo.context.setLineDash([])
                      drawingInfo.context.textAlign = 'center'
                      drawingInfo.context.textBaseline = 'middle'

                      drawingInfo.tileBoundingBox = null

                      // Draw map objects.

                      if (layerCanvasName === 'save') {
                        layer.layerName = layerName

                        await this._drawSaveLayer(drawingInfo, mapObjects, tileInfo, layer)

                        drawingInfo.saveDataPixels = null // Invalidate pixels
                      } else if (styleType === 'text') {
                        await this._drawObjectsLayer(drawingInfo, mapObjects, tileInfo, layer)
                      } else {
                        await this._drawBaseLayer(drawingInfo, mapObjects, tileInfo, layer)
                      }

                      if (drawingInfo.isGrid) { // TODO!
                        drawingInfo.displacementLayers[''].regions = {}
                      }

                      drawingInfo.context.endGroup()
                    }
                  }

                  if (drawingInfo.saveDataCanvas) {
                    drawingInfo.saveDataCanvas.inUse = false
                  }

                  drawingInfo.context = drawingInfo.mapCanvas.context

                  // Fill water areas.

                  drawingInfo.context.beginGroup('background')

                  drawingInfo.context.setTransform(new DOMMatrix())

                  drawingInfo.context.globalCompositeOperation = 'destination-over'

                  if (this.options.type !== 'text') {
                    if (mapStyle.BackgroundPatternFunction) {
                      if (typeof mapStyle.BackgroundPatternFunction === 'string') {
                        mapStyle.BackgroundPatternFunction = new Function(
                          'ObjectData',
                          'MapZoom',
                          'RandomGenerator',
                          'return ' + mapStyle.BackgroundPatternFunction.replace(/<tags.([a-z1-9_:]+)>/g, 'ObjectData.tags[\'$1\']').replace(/<([a-z1-9_:]+)>/g, 'ObjectData.$1')
                        )
                      }

                      const patternName = mapStyle.BackgroundPatternFunction(null, tileInfo.vms2TileZ, this.randomGenerator)

                      if (patternName) {
                        const pattern = await this._getPattern(drawingInfo.context, patternName)

                        pattern.transformMatrix = new DOMMatrix().translate(-drawingInfo.mapArea.left * drawingInfo.scale * drawingInfo.patternScale, -drawingInfo.mapArea.top * drawingInfo.scale * drawingInfo.patternScale).scale(drawingInfo.patternScale)
                        // pattern_.transformMatrix = new DOMMatrix().scale(drawingInfo.patternScale)

                        pattern.setTransform(pattern.transformMatrix)

                        drawingInfo.context.fillStyle = pattern
                        drawingInfo.context.fillRect(0, 0, tileInfo.width, tileInfo.height)
                      }
                    } else {
                      if (typeof mapStyle.BackgroundAlpha !== 'number') {
                        mapStyle.BackgroundAlpha = 1
                      }

                      drawingInfo.context.fillStyle = '#' + this._hexify32([mapStyle.BackgroundColor[0], mapStyle.BackgroundColor[1], mapStyle.BackgroundColor[2], Math.round(mapStyle.BackgroundAlpha * 255)])
                      drawingInfo.context.fillRect(0, 0, tileInfo.width, tileInfo.height)
                    }
                  }

                  drawingInfo.context.endGroup()

                  drawingInfo.mapCanvas.inUse = false

                  resolve()
                })
            })
        })
    })
  },
  _getCachedTile: function (layerId, x, y, z, tileLayer) {
    let detailZooms = [0, 0, 2, 2, 4, 4, 6, 6, 8, 8, 10, 10, 12, 12, 14]

    switch (layerId) {
      case 'terrain':
      case 'depth':
        detailZooms = [0, 0, 2, 2, 4, 4, 6, 6, 8, 8, 10, 10, 12, 12, 12]
        break

      case 'bathymetry':
      case 'blue_marble':
      case 'elevation':
        detailZooms = [0, 0, 2, 2, 4, 4, 6, 6, 8, 8, 10, 10, 10, 10, 10]
        break
    }

    let detailZoom = detailZooms[Math.max(Math.min(z, 14), 0)]

    const ids = layerId.split('|')

    if (!(ids.length === 1 || ids[2] !== 'Points')) {
      detailZoom = 14
    }

    const tileWeight = Math.pow(4, 16 - z)
    let matchingTilesWeight = 0

    const layerMap = globalThis.vms2Context.tileCacheLayerMaps[layerId]

    if (layerMap) {
      for (const keyValuePair of layerMap) {
        if (keyValuePair[1].detailZoom !== detailZoom) {
          continue
        }

        const deltaZ = keyValuePair[1].z - z

        let tileCoordinateMatch = false

        if (deltaZ >= 0) {
          tileCoordinateMatch = (keyValuePair[1].x >> deltaZ) === x && (keyValuePair[1].y >> deltaZ) === y
        } else {
          tileCoordinateMatch = (x >> -deltaZ) === keyValuePair[1].x && (y >> -deltaZ) === keyValuePair[1].y
        }

        if (tileCoordinateMatch) {
          if (!tileLayer.tileIds.includes(keyValuePair[0])) {
            tileLayer.objects = tileLayer.objects.concat(keyValuePair[1].objects)

            tileLayer.tileIds.push(keyValuePair[0])
          }

          matchingTilesWeight += Math.pow(4, 16 - keyValuePair[1].z)

          if (matchingTilesWeight >= tileWeight) {
            return true
          }
        }
      }
    }

    return false
  },
  _processTileLayerRequests: async function (tileLayerRequestInfo_) {
    if (!tileLayerRequestInfo_.requestInProcess) {
      tileLayerRequestInfo_.requestInProcess = true

      while (tileLayerRequestInfo_.tileInfos.length > 0) {
        const tileInfo = tileLayerRequestInfo_.tileInfos.shift()

        const dataLayerId = tileInfo.tileLayerData.dataLayerId

        const x = tileInfo.x
        const y = tileInfo.y
        const z = Math.floor(tileInfo.z)

        const tileLayerData = tileInfo.tileLayerData

        if (!tileLayerData.tileCanvas.hasBeenRemoved) {
          await this._requestTile(dataLayerId, x, y, z, tileLayerData)
        }

        tileLayerData.tileCount--

        if (tileLayerData.tileCount === 0) {
          tileLayerData.resolve()
        }
      }

      tileLayerRequestInfo_.requestInProcess = false
    }
  },
  _getTileLayer: function (tileLayerData) {
    return new Promise((resolve, reject) => {
      tileLayerData.resolve = resolve
      tileLayerData.reject = reject

      const fetchTileZ = tileLayerData.tileInfo.vms2TileZ + Math.max(-tileLayerData.tileInfo.vms2TileZ, (tileLayerData.layerStyle.Detail || 0) + this.options.detailOffset)

      let fetchTileStartX = Math.floor(this._longitudeToTile(tileLayerData.tileInfo.mapBounds.longitudeMin, fetchTileZ))
      let fetchTileEndX = Math.floor(this._longitudeToTile(tileLayerData.tileInfo.mapBounds.longitudeMax, fetchTileZ))
      let fetchTileStartY = Math.floor(this._latitudeToTile(tileLayerData.tileInfo.mapBounds.latitudeMax, fetchTileZ))
      let fetchTileEndY = Math.floor(this._latitudeToTile(tileLayerData.tileInfo.mapBounds.latitudeMin, fetchTileZ))

      if (typeof tileLayerData.tileInfo.x === 'number' && typeof tileLayerData.tileInfo.y === 'number' && typeof tileLayerData.tileInfo.z === 'number') {
        if (tileLayerData.layerStyle.needsAreaExtension) {
          fetchTileStartX = Math.floor(this._longitudeToTile(tileLayerData.tileInfo.drawingMapBounds.longitudeMin, fetchTileZ))
          fetchTileEndX = Math.floor(this._longitudeToTile(tileLayerData.tileInfo.drawingMapBounds.longitudeMax, fetchTileZ))
          fetchTileStartY = Math.floor(this._latitudeToTile(tileLayerData.tileInfo.drawingMapBounds.latitudeMax, fetchTileZ))
          fetchTileEndY = Math.floor(this._latitudeToTile(tileLayerData.tileInfo.drawingMapBounds.latitudeMin, fetchTileZ))
        }
      }

      if (!globalThis.vms2Context.tileLayerRequestInfos[tileLayerData.dataLayerId]) {
        globalThis.vms2Context.tileLayerRequestInfos[tileLayerData.dataLayerId] = { requestInProcess: false, tileInfos: [] }
      }

      const tileLayerRequestInfo = globalThis.vms2Context.tileLayerRequestInfos[tileLayerData.dataLayerId]

      for (let fetchTileY = fetchTileStartY; fetchTileY <= fetchTileEndY; fetchTileY++) {
        for (let fetchTileX = fetchTileStartX; fetchTileX <= fetchTileEndX; fetchTileX++) {
          tileLayerRequestInfo.tileInfos.push({ x: fetchTileX, y: fetchTileY, z: fetchTileZ, tileLayerData })

          tileLayerData.tileCount++
        }
      }

      this._processTileLayerRequests(tileLayerRequestInfo)
    })
  },
  _preparePolygon: function (drawingInfo, geometry, dataOffset, polygons) {
    const polygonRings = []

    dataOffset += 4

    const numberOfRings = geometry.getUint32(dataOffset, true)
    dataOffset += 4

    for (let ringIndex = 0; ringIndex < numberOfRings; ringIndex++) {
      const polygonPoints = []

      const numberOfPoints = geometry.getUint32(dataOffset, true)
      dataOffset += 4

      for (let pointIndex = 0; pointIndex < numberOfPoints; pointIndex++) {
        const x = geometry.getFloat32(dataOffset, true)
        dataOffset += 4

        const y = geometry.getFloat32(dataOffset, true)
        dataOffset += 4

        polygonPoints.push({ x, y })
      }

      polygonRings.push(polygonPoints)
    }

    polygons.push(polygonRings)

    return dataOffset
  },
  _requestFontFace: function (style) {
    return new Promise(resolve => {
      let fontName = style.FontFamily.replace(/ /g, '') + '.ttf'
      let fontStyle = 'normal'
      let fontWeight = 'normal'

      if (style.FontSpecs) {
        fontName = style.FontSpecs[0]

        if (style.FontSpecs[1] === 'bold') {
          fontWeight = style.FontSpecs[1]
        } else if (style.FontSpecs[2]) {
          fontStyle = style.FontSpecs[1]
        }
      }

      if (globalThis.vms2Context.fontFaceCache[fontName]) {
        if (globalThis.vms2Context.fontFaceCache[fontName].isLoading) {
          globalThis.vms2Context.fontFaceCache[fontName].resolveFunctions.push(resolve)
        } else {
          resolve()
        }

        return
      }

      const font = new FontFace(style.FontFamily, 'url(\'' + this.options.assetsUrl + '/fonts/' + fontName + '\')', { style: fontStyle, weight: fontWeight })

      font.load().then(() => {
        document.fonts.add(font)

        globalThis.vms2Context.fontFaceCache[fontName].isLoading = false

        for (const resolveFunction of globalThis.vms2Context.fontFaceCache[fontName].resolveFunctions) {
          if (resolveFunction) {
            resolveFunction()
          }
        }
      }).catch(exception => {
        for (const resolveFunction of globalThis.vms2Context.fontFaceCache[fontName].resolveFunctions) {
          if (resolveFunction) {
            resolveFunction()
          }
        }
      })

      globalThis.vms2Context.fontFaceCache[fontName] = { isLoading: true, resolveFunctions: [resolve] }
    })
  },
  _requestImage: function (imageUrlString) {
    return new Promise((resolve, reject) => {
      const imageCache = globalThis.vms2Context.imageCache

      if (imageCache[imageUrlString]) {
        if (imageCache[imageUrlString].isLoading) {
          imageCache[imageUrlString].resolveFunctions.push(resolve)
        } else {
          resolve(imageCache[imageUrlString].image)
        }

        return
      }

      const image = new Image()

      image.crossOrigin = 'anonymous'
      image.onerror = reject

      const imageUrl = new URL(imageUrlString, window.location.origin)

      if (imageUrl.search) {
        fetch(imageUrlString)
          .then(response => response.text())
          .then(svgImage => {
            image.onload = () => {
              imageCache[imageUrlString].isLoading = false

              for (const resolveFunction of imageCache[imageUrlString].resolveFunctions) {
                if (resolveFunction) {
                  resolveFunction(image)
                }
              }
            }

            svgImage = svgImage.replace('fill:#FFFFFF;', 'fill:#FF00FF;')

            image.src = `data:image/svg+xml;base64,${btoa(svgImage)}`
          })
      } else {
        image.onload = () => {
          imageCache[imageUrlString].isLoading = false

          for (const resolveFunction of imageCache[imageUrlString].resolveFunctions) {
            if (resolveFunction) {
              resolveFunction(image)
            }
          }
        }

        image.src = imageUrlString
      }

      imageCache[imageUrlString] = { isLoading: true, resolveFunctions: [resolve], image }
    })
  },
  _requestTileDbInfos: function () {
    return new Promise(resolve => {
      this.tileDbInfos = [] // Fixme!

      if (this.tileDbInfos) {
        resolve(this.tileDbInfos)
      } else {
        const resolves = this.tileDbInfosResolves

        resolves.push(resolve)

        if (resolves.length === 1) {
          const tileDbInfosUrlParts = this.options.tileUrl.split('?')

          fetch(new URL(tileDbInfosUrlParts[0], window.location.origin))
            .then(response => response.json())
            .then(tileDbInfos => {
              this.tileDbInfos = tileDbInfos

              while (resolves.length > 0) {
                resolves.shift()()
              }
            })
        }
      }
    })
  },
  _requestTile: function (dataLayerId, x, y, z, tileLayerData) {
    return new Promise(resolve => {
      x &= ((1 << z) - 1)
      y &= ((1 << z) - 1)

      const tileLatitudeMin = this._tileToLatitude(y + 1, z)
      const tileLatitudeMax = this._tileToLatitude(y, z)
      const tileLongitudeMin = this._tileToLongitude(x, z)
      const tileLongitudeMax = this._tileToLongitude(x + 1, z)

      for (const tileDbInfo of this.tileDbInfos) {
        if (tileDbInfo.infos.length > 0) {
          const boundingBox = tileDbInfo.infos[0].bounding_box

          if (
            tileLatitudeMin >= boundingBox.latitude_min &&
            tileLatitudeMax <= boundingBox.latitude_max &&
            tileLongitudeMin >= boundingBox.longitude_min &&
            tileLongitudeMax <= boundingBox.longitude_max
          ) {
            if (tileDbInfo.infos[0].max_detail_zoom < 14 && tileDbInfo.infos[0].max_detail_zoom < z) {
              x >>= ((z & ~1) - tileDbInfo.infos[0].max_detail_zoom)
              y >>= ((z & ~1) - tileDbInfo.infos[0].max_detail_zoom)
              z = tileDbInfo.infos[0].max_detail_zoom | (z & 1)
            }

            break
          }
        }
      }

      if (this._getCachedTile(dataLayerId, x, y, z, tileLayerData)) {
        return resolve()
      }

      let tileUrl = this.options.tileUrl

      tileUrl = tileUrl.replace('{x}', x)
      tileUrl = tileUrl.replace('{y}', y)
      tileUrl = tileUrl.replace('{z}', z)

      const idParts = dataLayerId.split('|')

      if (idParts.length > 0) {
        tileUrl = tileUrl.replace('{key}', idParts[0])

        if (idParts.length > 1) {
          tileUrl = tileUrl.replace('{value}', idParts[1])

          if (idParts.length > 2) {
            tileUrl = tileUrl.replace('{type}', idParts[2])
          }
        }
      }

      tileUrl = tileUrl.replace('{key}', '').replace('{value}', '').replace('{type}', '')

      const decodeFunction = () => {
        for (const decodeWorker of globalThis.vms2Context.decodeWorkers) {
          if (!decodeWorker.resolveFunction) {
            const decodeEntry = globalThis.vms2Context.decodeQueue.shift()

            if (decodeEntry.tileLayerData.tileCanvas.hasBeenRemoved) {
              decodeEntry.resolve()
            } else {
              decodeWorker.postMessage(decodeEntry.decodeData)

              decodeWorker.resolveFunction = () => {
                this._getCachedTile(decodeEntry.dataLayerId, decodeEntry.x, decodeEntry.y, decodeEntry.z, decodeEntry.tileLayerData)

                globalThis.vms2Context.decodeWorkersRunning--

                decodeEntry.resolve()

                if (globalThis.vms2Context.decodeQueue.length > 0) {
                  decodeFunction()
                }
              }

              globalThis.vms2Context.decodeWorkersRunning++
            }

            return
          }
        }
      }

      const processRawData = rawData => {
        if (tileLayerData.tileCanvas.hasBeenRemoved) {
          return resolve()
        }

        if (rawData.byteLength <= 4) {
          return resolve()
        }

        const decodeData = { lId: dataLayerId, datas: [] }

        const rawDataDataView = new DataView(rawData)
        let rawDataOffset = 0

        let tileCount = rawDataDataView.getUint32(rawDataOffset, true)
        rawDataOffset += 4

        while (tileCount > 0) {
          const tileX = rawDataDataView.getUint32(rawDataOffset, true)
          rawDataOffset += 4

          const tileY = rawDataDataView.getUint32(rawDataOffset, true)
          rawDataOffset += 4

          const tileZ = rawDataDataView.getUint32(rawDataOffset, true)
          rawDataOffset += 4

          const detailZoom = rawDataDataView.getUint32(rawDataOffset, true)
          rawDataOffset += 4

          const dataSize = rawDataDataView.getUint32(rawDataOffset, true)
          rawDataOffset += 4

          decodeData.datas.push({
            x: tileX,
            y: tileY,
            z: tileZ,
            dZ: detailZoom,
            cD: this.options.disableDecode === true ? new DataView(new ArrayBuffer()) : rawData.slice(rawDataOffset, rawDataOffset + dataSize)
          })

          rawDataOffset += dataSize

          tileCount--
        }

        globalThis.vms2Context.decodeQueue.push({ dataLayerId, x, y, z, tileLayerData, decodeData, resolve })

        decodeFunction()
      }

      tileLayerData.tileCanvas.abortController = new AbortController()

      if (this.options.disableDecode === true) {
        processRawData(new ArrayBuffer(4))
      } else {
        fetch(new URL(tileUrl, window.location.origin), { signal: tileLayerData.tileCanvas.abortController.signal })
          .then(response => {
            if (!response.ok) {
              throw new Error({
                code: response.status,
                message: response.statusText,
                response
              })
            }

            this.numberOfRequestedTiles++

            return response.arrayBuffer()
          })
          .then(processRawData)
          .catch(error => {
            if (error.code === 20) {
              resolve()
            } else {
              throw error
            }
          })
      }
    })
  },
  _skipPolygon: function (geometry, dataOffset) {
    dataOffset += 4

    const numberOfRings = geometry.getUint32(dataOffset, true)
    dataOffset += 4

    for (let ringIndex = 0; ringIndex < numberOfRings; ringIndex++) {
      dataOffset += 4 + geometry.getUint32(dataOffset, true) * 4 * 2
    }

    return dataOffset
  },
  _latitudeToMeters: function (latitude) {
    return Math.log(Math.tan((90 + latitude) * Math.PI / 360)) * EARTH_EQUATORIAL_RADIUS_METERS
  },
  _longitudeToMeters: function (longitude) {
    return longitude * EARTH_EQUATORIAL_RADIUS_METERS * Math.PI / 180
  },
  _latitudeToTile: function (latitude, z, base = DEFAULT_ZOOM_POWER_BASE) {
    return (Math.log(Math.tan((90 - latitude) * Math.PI / 360)) / (2 * Math.PI) + 0.5) * Math.pow(base, z)
  },
  _longitudeToTile: function (longitude, z, base = DEFAULT_ZOOM_POWER_BASE) {
    return (longitude + 180) * Math.pow(base, z) / 360
  },
  _tileToLatitude: function (y, z, base = DEFAULT_ZOOM_POWER_BASE) {
    return 90 - Math.atan(Math.exp((y / Math.pow(base, z) - 0.5) * 2 * Math.PI)) * 360 / Math.PI
  },
  _tileToLongitude: function (x, z, base = DEFAULT_ZOOM_POWER_BASE) {
    return x * 360 / Math.pow(base, z) - 180
  },
  _tileXToMeters: function (x, z, base = DEFAULT_ZOOM_POWER_BASE) {
    return (x / Math.pow(base, z) - 0.5) * EARTH_EQUATORIAL_CIRCUMFERENCE_METERS
  },
  _tileYToMeters: function (y, z, base = DEFAULT_ZOOM_POWER_BASE) {
    return (0.5 - y / Math.pow(base, z)) * EARTH_EQUATORIAL_CIRCUMFERENCE_METERS
  },
  _latitudeToNormalized: function (latitude) {
    return Math.log(Math.tan((90 - latitude) * Math.PI / 360)) / (2 * Math.PI) + 0.5
  },
  _longitudeToNormalized: function (longitude) {
    return (longitude + 180) / 360
  },
  _normalizedToLatitude: function (y) {
    return 90 - Math.atan(Math.exp((y - 0.5) * 2 * Math.PI)) * 360 / Math.PI
  },
  _normalizedToLongitude: function (x) {
    return x * 360 - 180
  },
  _hexify8: function (value) {
    return ('00' + value.toString(16)).slice(-2)
  },
  _hexify16: function (values) {
    return ('0000' + ((values[0] << 8) + values[1]).toString(16)).slice(-4)
  },
  _hexify24: function (values) {
    return ('000000' + ((values[0] << 16) + (values[1] << 8) + values[2]).toString(16)).slice(-6)
  },
  _hexify32: function (values) {
    return this._hexify24(values) + this._hexify8(values[3])
  },
  _getWorkerURL: function (url_) {
    const content = `importScripts("${url_}");`

    return URL.createObjectURL(new Blob([content], { type: 'text/javascript' }))
  },
  _getPattern: async function (context, patternName) {
    if (!globalThis.vms2Context.patternCache[patternName]) {
      let patternUrl = patternName

      if (!patternName.includes('http://') && !patternName.includes('https://')) {
        patternUrl = this.options.assetsUrl + '/images/patterns/' + patternName.replace(/file:\/\/[^/]*\//g, '')
      }

      const patternImage = await this._requestImage(patternUrl)

      globalThis.vms2Context.patternCache[patternName] = context.createPattern(patternImage, 'repeat')
      globalThis.vms2Context.patternCache[patternName].patternImage = patternImage
    }

    return globalThis.vms2Context.patternCache[patternName]
  },
  _remapPixels: function (pixels, saveDataIds, width) {
    let lastValidRed = 0
    let lastValidGreen = 0
    let lastValidBlue = 0

    let lastValidColorDistance = 0

    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 2]

      if (alpha > 0) {
        let red = pixels[index]
        let green = pixels[index + 1]
        let blue = pixels[index + 2]

        if (saveDataIds[(red << 16) + (green << 8) + blue]) {
          lastValidRed = red
          lastValidGreen = green
          lastValidBlue = blue

          lastValidColorDistance = 0
        } else {
          pixels[index] = lastValidRed
          pixels[index + 1] = lastValidGreen
          pixels[index + 2] = lastValidBlue

          lastValidColorDistance++

          if (lastValidColorDistance > 10 && index > width * 4) {
            red = pixels[index - width * 4]
            green = pixels[index - width * 4 + 1]
            blue = pixels[index - width * 4 + 2]

            if (saveDataIds[(red << 16) + (green << 8) + blue]) {
              pixels[index] = red
              pixels[index + 1] = green
              pixels[index + 2] = blue
            }
          }
        }
      }
    }
  }
})

L.gridLayer.vms2 = function (options) {
  return new L.GridLayer.VMS2(options)
}
