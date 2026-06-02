import { DEFAULT_PRINT_DPI, DEVICE_PIXEL_RATIO } from './constants.js'
import { ensureVms2Context } from './context.js'
import RandomGenerator from './random-generator.js'

function initializeLayerState (layer) {
  layer.numberOfRequestedTiles = 0
  layer.tileRequestId = 0
  layer.tileSize = 0
  layer.randomGenerator = new RandomGenerator()

  layer.tileDbInfos = null
  layer.tileDbInfosResolves = []

  layer.tileCanvases = []
  layer.saveDataCanvases = []

  layer.mapOverlay = undefined
  layer.printFormat = undefined
  layer.printMapScale = undefined
  layer.previousPrintFormatSize = undefined
}

const setupMethods = {
  initialize: function (options) {
    initializeLayerState(this)

    if (!globalThis.vms2Context) {
      ensureVms2Context(this._getWorkerURL(new URL('../decoder.js', import.meta.url)))
    } else {
      ensureVms2Context()
    }

    globalThis.L.GridLayer.prototype.initialize.call(this, options)

    this.tileSize = this.getTileSize().x

    if (this.options.accessKey && !this.options.tileUrl.includes('key=')) {
      const separator = this.options.tileUrl.includes('?') ? '&' : '?'
      this.options.tileUrl += separator + 'key=' + this.options.accessKey
    }
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

      tileCanvas.width = Math.round(this.tileSize * DEVICE_PIXEL_RATIO)
      tileCanvas.height = Math.round(this.tileSize * DEVICE_PIXEL_RATIO)
      tileCanvas.isTile = true
      tileCanvas.hasBeenCreated = true
    }

    tileCanvas.inUse = true
    tileCanvas.hasBeenRemoved = false
    tileCanvas.requestId = ++this.tileRequestId

    tileInfo = { ...tileInfo, requestId: tileCanvas.requestId }
    tileInfo.z += this.options.zoomOffset

    this._drawTile(tileCanvas, tileInfo)
      .then(() => doneFunction(null, tileCanvas))
      .catch(error => {
        tileCanvas.inUse = false
        doneFunction(error, tileCanvas)
      })

    return tileCanvas
  },

  getMapCanvas: async function (mapInfo) {
    if (!(mapInfo &&
      typeof mapInfo.width === 'number' && typeof mapInfo.height === 'number' &&
      (
        (typeof mapInfo.x === 'number' && typeof mapInfo.y === 'number' && typeof mapInfo.z === 'number') ||
        (typeof mapInfo.latitudeMin === 'number' && typeof mapInfo.longitudeMin === 'number' && typeof mapInfo.latitudeMax === 'number' && typeof mapInfo.longitudeMax === 'number')
      )
    )) {
      throw (new Error('Missing essential parameters!'))
    }

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

    if (
      typeof mapInfo.latitudeMin === 'number' &&
      typeof mapInfo.longitudeMin === 'number' &&
      typeof mapInfo.latitudeMax === 'number' &&
      typeof mapInfo.longitudeMax === 'number'
    ) {
      let longitudeMin = (mapInfo.longitudeMin + 180) % 360

      if (longitudeMin < 0) {
        longitudeMin += 360
      }

      longitudeMin -= 180

      let longitudeMax = longitudeMin + mapInfo.longitudeMax - mapInfo.longitudeMin

      while (longitudeMax > -180) {
        mapInfo.longitudeMin = longitudeMin
        mapInfo.longitudeMax = longitudeMax

        await this._drawTile(mapCanvas, mapInfo)

        longitudeMin -= 360
        longitudeMax -= 360
      }
    } else {
      await this._drawTile(mapCanvas, mapInfo)
    }

    return mapCanvas
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

    if (!tileInfo.dpi) {
      tileInfo.dpi = DEFAULT_PRINT_DPI
    }

    this._drawTile(tileCanvas, tileInfo)
      .then(doneFunction)
  }
}

export default setupMethods
