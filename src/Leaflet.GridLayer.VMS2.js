import { unicodeDataTable } from './unicode.js'

const DEFAULT_PRINT_DPI_ = 300
const DEFAULT_DISPLAY_DPI_ = 72
const EARTH_EQUATORIAL_RADIUS_METERS_ = 6378137
const EARTH_EQUATORIAL_CIRCUMFERENCE_METERS_ = 2 * Math.PI * EARTH_EQUATORIAL_RADIUS_METERS_
const TILE_AREA_DRAWING_EXTENSION_ = 1
const TILE_AREA_SAVE_EXTENSION_ = 0.25

const DEFAULT_ZOOM_POWER_BASE = 2
const DEFAULT_STYLE_ID = '4201'

const DEFAULT_STYLE_URL_ = 'https://vms2.locr.com/api/style/{style_id}'
const DEFAULT_TILE_URL_ = 'https://vms2.locr.com/api/tile/{z}/{y}/{x}?k={key}&v={value}&t={type}'
const DEFAULT_ASSETS_URL_ = 'https://vms2.locr.com/api/styles/assets'

const MIN_NUMBER_OF_WORKERS = 4

const devicePixelRatio_ = window.devicePixelRatio || 1

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

RandomGenerator.prototype.random_pick = function (elements_, elementCounts_) {
  if (elementCounts_) {
    const expandedElements_ = []

    for (let elementIndex_ = 0; elementIndex_ < elements_.length; elementIndex_++) {
      for (let count_ = 0; count_ < elementCounts_[elementIndex_]; count_++) {
        expandedElements_.push(elements_[elementIndex_])
      }
    }

    return expandedElements_[Math.floor(this.random() * expandedElements_.length)]
  } else {
    return elements_[Math.floor(this.random() * elements_.length)]
  }
}

L.GridLayer.VMS2 = L.GridLayer.extend({
  numberOfRequestedTiles: 0,

  allSystemsGo_: true,

  tileSize_: 0,

  voidTileAreas_: [],

  randomGenerator_: new RandomGenerator(),

  tileDbInfos_: null,
  tileDbInfosResolves_: [],

  unicodeDataTable_: unicodeDataTable,

  tileCanvases_: [],
  saveDataCanvases_: [],

  options: {
    zoomPowerBase: DEFAULT_ZOOM_POWER_BASE,
    style: DEFAULT_STYLE_ID,
    styleUrl: DEFAULT_STYLE_URL_,
    tileUrl: DEFAULT_TILE_URL_,
    assetsUrl: DEFAULT_ASSETS_URL_,
    accessKey: '',
    mapScale: 1,
    objectScale: 1,
    detailOffset: 0,
    zoomRangeOffset: 0,
    styleOverride: {}
  },

  initialize: function (options_) {
    if (!globalThis.vms2Context_) {
      globalThis.vms2Context_ = {
        decodeWorkers_: [],
        decodeWorkersRunning_: 0,
        decodeQueue_: [],

        styleRequestQueues_: {},

        fontCharacterCanvas_: null,
        fontCharacterContext_: null,
        fontCharacterWidths_: {},
        fontFaceCache_: {},

        imageCache_: {},
        patternCache_: {},

        tileLayerRequestInfos_: {},
        tileCache_: [],
        tileCacheIndex_: 0,
        tileCacheSize_: 600,
        tileCacheLayerMaps_: {}
      }

      globalThis.vms2Context_.fontCharacterCanvas_ = document.createElement('canvas')
      globalThis.vms2Context_.fontCharacterContext_ = globalThis.vms2Context_.fontCharacterCanvas_.getContext('2d')

      const maxNumberOfWorkers_ = Math.max(navigator.hardwareConcurrency - 1, MIN_NUMBER_OF_WORKERS)

      for (let count_ = 0; count_ < maxNumberOfWorkers_; count_++) {
        const decodeWorker_ = new Worker(this._getWorkerURL_(new URL('decoder.js', import.meta.url)))

        decodeWorker_.onmessage = e => {
          for (const tileData_ of e.data.tDs) {
            let layerMap_ = globalThis.vms2Context_.tileCacheLayerMaps_[e.data.lId]

            if (!layerMap_) {
              layerMap_ = new Map()

              globalThis.vms2Context_.tileCacheLayerMaps_[e.data.lId] = layerMap_
            }

            const tileKey_ = tileData_.x + '|' + tileData_.y + '|' + tileData_.z + '|' + tileData_.dZ

            layerMap_.set(tileKey_, { objects_: tileData_.tOs, x_: tileData_.x, y_: tileData_.y, z_: tileData_.z, detailZoom_: tileData_.dZ })

            const newEntry_ = { layerMap_, tileKey_ }

            if (globalThis.vms2Context_.tileCache_[globalThis.vms2Context_.tileCacheIndex_]) {
              const oldEntry_ = globalThis.vms2Context_.tileCache_[globalThis.vms2Context_.tileCacheIndex_]

              oldEntry_.layerMap_.delete(oldEntry_.tileKey_)
            }

            globalThis.vms2Context_.tileCache_[globalThis.vms2Context_.tileCacheIndex_] = newEntry_

            globalThis.vms2Context_.tileCacheIndex_ = (globalThis.vms2Context_.tileCacheIndex_ + 1) % globalThis.vms2Context_.tileCacheSize_
          }

          const resolveFunction_ = e.target.resolveFunction_

          e.target.resolveFunction_ = null

          resolveFunction_()
        }

        globalThis.vms2Context_.decodeWorkers_.push(decodeWorker_)
      }
    }

    L.GridLayer.prototype.initialize.call(this, options_)

    this.tileSize_ = this.getTileSize().x

    this.options.tileUrl += '&key=' + this.options.accessKey

    this.options.zoomStep = Math.log2(this.options.zoomPowerBase)
  },
  createTile: function (tileInfo_, doneFunction_) {
    let tileCanvas_ = null

    for (const canvas_ of this.tileCanvases_) {
      if (!canvas_.inUse_ && canvas_.hasBeenRemoved_) {
        tileCanvas_ = canvas_

        tileCanvas_.getContext('2d').clearRect(0, 0, tileCanvas_.width, tileCanvas_.height)

        break
      }
    }

    if (!tileCanvas_) {
      tileCanvas_ = document.createElement('canvas')

      tileCanvas_.width = Math.round(this.tileSize_ * devicePixelRatio_)
      tileCanvas_.height = Math.round(this.tileSize_ * devicePixelRatio_)

      tileCanvas_.isTile = true

      tileCanvas_.hasBeenCreated_ = true
    }

    tileCanvas_.inUse_ = true
    tileCanvas_.hasBeenRemoved_ = false

    this._drawTile_(tileCanvas_, tileInfo_)
      .then(() => doneFunction_(null, tileCanvas_))

    return tileCanvas_
  },
  getMapCanvas: async function (tileInfo_) {
    /*
     * Start of billing related code block. Do not change or skip it, neither block its function.
     * It must be executed when this function is being called.
     * Refer to the license for more information.
     */
    if (this.options.accessKey) {
      const meta_ = {
        function: this.getMapCanvas.name,
        tileInfo: tileInfo_
      }

      const metaJson_ = JSON.stringify(meta_)

      fetch('https://vms2.locr.com/api/vms2/ping?key=' + this.options.accessKey + '&meta=' + encodeURIComponent(metaJson_))
    }
    /*
     * End of billing related code block. Do not change or skip it, neither block its function.
     * It must be executed when this function is being called.
     * Refer to the license for more information.
     */

    let mapCanvas_ = null

    if (tileInfo_.width && tileInfo_.height) {
      mapCanvas_ = document.createElement('canvas')

      mapCanvas_.width = tileInfo_.width
      mapCanvas_.height = tileInfo_.height

      mapCanvas_.inUse_ = true
      mapCanvas_.hasBeenRemoved_ = false

      await this._drawTile_(mapCanvas_, tileInfo_)
    }

    return mapCanvas_
  },
  getMapObjects: function (tileInfo_, doneFunction_) {
    const tileCanvas_ = {}

    if (tileInfo_.width && tileInfo_.height) {
      tileCanvas_.width = Math.round(tileInfo_.width)
      tileCanvas_.height = Math.round(tileInfo_.height)
    }

    tileCanvas_.inUse_ = true
    tileCanvas_.hasBeenRemoved_ = false

    tileCanvas_.isDummy_ = true

    this._drawTile_(tileCanvas_, tileInfo_)
      .then(tileLayers_ => {
        doneFunction_(tileLayers_)
      })
  },
  _pruneTilesOld: function () {
    if (!this._map) {
      return
    }

    let key, tile

    const zoom = this._map.getZoom()
    if (
      zoom > this.options.maxZoom ||
      zoom < this.options.minZoom
    ) {
      this._removeAllTiles()
      return
    }

    for (key in this._tiles) {
      tile = this._tiles[key]
      tile.retain = tile.current
    }

    for (key in this._tiles) {
      tile = this._tiles[key]
      if (tile.current && !tile.active) {
        const coords = tile.coords
        if (!this._retainParent(coords.x, coords.y, coords.z, coords.z - 5)) {
          this._retainChildren(coords.x, coords.y, coords.z, coords.z + 2)
        }
      }
    }

    for (key in this._tiles) {
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
          const latitudeMin = this._tileToLatitude_(coords.y + 1, coords.z, this.options.zoomPowerBase)
          const longitudeMin = this._tileToLongitude_(coords.x, coords.z, this.options.zoomPowerBase)
          const latitudeMax = this._tileToLatitude_(coords.y, coords.z, this.options.zoomPowerBase)
          const longitudeMax = this._tileToLongitude_(coords.x + 1, coords.z, this.options.zoomPowerBase)

          tile.bounds = L.latLngBounds([latitudeMin, longitudeMin], [latitudeMax, longitudeMax])

          if (
            !(
              tile.bounds._southWest.lat < mapBounds._northEast.lat &&
              tile.bounds._northEast.lat > mapBounds._southWest.lat &&
              tile.bounds._southWest.lng < mapBounds._northEast.lng &&
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

      if (!tile1.current && tile1.reain) {
        for (const key2 in this._tiles) {
          if (key2 === key1) {
            continue
          }

          const tile2 = this._tiles[key2]

          if (!tile2.current && tile2.reain) {
            if (
              tile2.bounds._northEast.lat < tile1.bounds._northEast.lat &&
              tile2.bounds._southWest.lat > tile1.bounds._southWest.lat &&
              tile2.bounds._northEast.lng < tile1.bounds._northEast.lng &&
              tile2.bounds._southWest.lng > tile1.bounds._southWest.lng
            ) {
              tile2.reain = false
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

    if (tileElement.abortController_) {
      if (!tileElement.abortController_.signal.aborted) {
        tileElement.abortController_.abort()
      }

      delete tileElement.abortController_
    }

    tileElement.hasBeenRemoved_ = true

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
  _checkAndSetDisplacement_: function (displacementLayers_, displacementLayerNames_, boxes_) {
    for (const box_ of boxes_) {
      if (box_.left_ > box_.right_) {
        const temp_ = box_.left_

        box_.left_ = box_.right_
        box_.right_ = temp_
      }

      if (box_.bottom_ > box_.top_) {
        const temp_ = box_.top_

        box_.top_ = box_.bottom_
        box_.bottom_ = temp_
      }
    }

    for (const displacementLayerName_ of displacementLayerNames_) {
      const displacementLayer_ = displacementLayers_[displacementLayerName_]

      for (const box_ of boxes_) {
        if (displacementLayer_.allowedMapArea_) {
          if (
            box_.left_ < displacementLayer_.allowedMapArea_.left_ ||
            box_.right_ > displacementLayer_.allowedMapArea_.right_ ||
            box_.top_ > displacementLayer_.allowedMapArea_.top_ ||
            box_.bottom_ < displacementLayer_.allowedMapArea_.bottom_
          ) {
            return false
          }
        }

        const topLeftHash_ = (box_.left_ >> displacementLayer_.shift_) + 'x' + (box_.top_ >> displacementLayer_.shift_)
        const topRightHash_ = (box_.right_ >> displacementLayer_.shift_) + 'x' + (box_.top_ >> displacementLayer_.shift_)
        const bottomLeftHash_ = (box_.left_ >> displacementLayer_.shift_) + 'x' + (box_.bottom_ >> displacementLayer_.shift_)
        const bottomRightHash_ = (box_.right_ >> displacementLayer_.shift_) + 'x' + (box_.bottom_ >> displacementLayer_.shift_)

        if (displacementLayer_.regions_[topLeftHash_]) {
          for (const hashedBox_ of displacementLayer_.regions_[topLeftHash_]) {
            if (
              box_.left_ > hashedBox_.right_ ||
              box_.right_ < hashedBox_.left_ ||
              box_.bottom_ > hashedBox_.top_ ||
              box_.top_ < hashedBox_.bottom_
            ) { // Note: Top > Bottom!
              continue
            }

            return false
          }
        }

        if (displacementLayer_.regions_[topRightHash_] && topRightHash_ !== topLeftHash_) {
          for (const hashedBox_ of displacementLayer_.regions_[topRightHash_]) {
            if (
              box_.left_ > hashedBox_.right_ ||
              box_.right_ < hashedBox_.left_ ||
              box_.bottom_ > hashedBox_.top_ ||
              box_.top_ < hashedBox_.bottom_
            ) { // Note: Top > Bottom!
              continue
            }

            return false
          }
        }

        if (displacementLayer_.regions_[bottomLeftHash_] && bottomLeftHash_ !== topLeftHash_ && bottomLeftHash_ !== topRightHash_) {
          for (const hashedBox_ of displacementLayer_.regions_[bottomLeftHash_]) {
            if (
              box_.left_ > hashedBox_.right_ ||
              box_.right_ < hashedBox_.left_ ||
              box_.bottom_ > hashedBox_.top_ ||
              box_.top_ < hashedBox_.bottom_
            ) { // Note: Top > Bottom!
              continue
            }

            return false
          }
        }

        if (displacementLayer_.regions_[bottomRightHash_] && bottomRightHash_ !== topLeftHash_ && bottomRightHash_ !== topRightHash_ && bottomRightHash_ !== bottomLeftHash_) {
          for (const hashedBox_ of displacementLayer_.regions_[bottomRightHash_]) {
            if (
              box_.left_ > hashedBox_.right_ ||
              box_.right_ < hashedBox_.left_ ||
              box_.bottom_ > hashedBox_.top_ ||
              box_.top_ < hashedBox_.bottom_
            ) { // Note: Top > Bottom!
              continue
            }

            return false
          }
        }
      }
    }

    for (const displacementLayerName_ of displacementLayerNames_) {
      const displacementLayer_ = displacementLayers_[displacementLayerName_]

      for (const box_ of boxes_) {
        if (box_.left_ === box_.right_ || box_.top_ === box_.bottom_) {
          continue
        }

        const topLeftHash_ = (box_.left_ >> displacementLayer_.shift_) + 'x' + (box_.top_ >> displacementLayer_.shift_)
        const topRightHash_ = (box_.right_ >> displacementLayer_.shift_) + 'x' + (box_.top_ >> displacementLayer_.shift_)
        const bottomLeftHash_ = (box_.left_ >> displacementLayer_.shift_) + 'x' + (box_.bottom_ >> displacementLayer_.shift_)
        const bottomRightHash_ = (box_.right_ >> displacementLayer_.shift_) + 'x' + (box_.bottom_ >> displacementLayer_.shift_)

        if (!displacementLayer_.regions_[topLeftHash_]) {
          displacementLayer_.regions_[topLeftHash_] = []
        }

        displacementLayer_.regions_[topLeftHash_].push(box_)

        if (topRightHash_ !== topLeftHash_) {
          if (!displacementLayer_.regions_[topRightHash_]) {
            displacementLayer_.regions_[topRightHash_] = []
          }

          displacementLayer_.regions_[topRightHash_].push(box_)
        }

        if (bottomLeftHash_ !== topLeftHash_ && bottomLeftHash_ !== topRightHash_) {
          if (!displacementLayer_.regions_[bottomLeftHash_]) {
            displacementLayer_.regions_[bottomLeftHash_] = []
          }

          displacementLayer_.regions_[bottomLeftHash_].push(box_)
        }

        if (bottomRightHash_ !== topLeftHash_ && bottomRightHash_ !== topRightHash_ && bottomRightHash_ !== bottomLeftHash_) {
          if (!displacementLayer_.regions_[bottomRightHash_]) {
            displacementLayer_.regions_[bottomRightHash_] = []
          }

          displacementLayer_.regions_[bottomRightHash_].push(box_)
        }
      }
    }

    return true
  },
  _drawGeometry_: function (drawingInfo_, geometry_, dataOffset_ = 0) {
    const wkbType_ = geometry_.getUint32(dataOffset_, true)

    switch (wkbType_) {
      case 1: // WKBPoint.
        dataOffset_ = this._drawPoint_(drawingInfo_, geometry_, dataOffset_)

        break

      case 2: // WKBLineString.
        dataOffset_ = this._drawLineString_(drawingInfo_, geometry_, dataOffset_)

        break

      case 3: // WKBPolygon.
        if (drawingInfo_.isIcon_ || drawingInfo_.isText_) {
          this._drawIcon_(drawingInfo_, drawingInfo_.objectData_.Center.x, drawingInfo_.objectData_.Center.y)
          dataOffset_ = this._skipPolygon_(geometry_, dataOffset_)
        } else {
          const polygons = []
          dataOffset_ = this._preparePolygon_(drawingInfo_, geometry_, dataOffset_, polygons)
          this._drawPolygons_(drawingInfo_, polygons)
        }

        break

      case 4: // WKBMultiPoint
        // console.log('Unhandled WKB type found: ' + wkbType_ + ' => MultiPoint');

        break

      case 5: // WKBMultiLineString.
        {
          dataOffset_ += 4

          const numberOfLineStrings_ = geometry_.getUint32(dataOffset_, true)
          dataOffset_ += 4

          for (let lineStringIndex_ = 0; lineStringIndex_ < numberOfLineStrings_; lineStringIndex_++) {
            dataOffset_ = this._drawLineString_(drawingInfo_, geometry_, dataOffset_)
          }
        }

        break

      case 6: // WKBMultiPolygon.
        dataOffset_ += 4

        if (drawingInfo_.isIcon_ || drawingInfo_.isText_) {
          this._drawIcon_(drawingInfo_, drawingInfo_.objectData_.Center.x, drawingInfo_.objectData_.Center.y)

          const numberOfPolygons_ = geometry_.getUint32(dataOffset_, true)
          dataOffset_ += 4

          for (let polygonIndex_ = 0; polygonIndex_ < numberOfPolygons_; polygonIndex_++) {
            dataOffset_ = this._skipPolygon_(geometry_, dataOffset_)
          }
        } else {
          const polygons_ = []

          const numberOfPolygons_ = geometry_.getUint32(dataOffset_, true)
          dataOffset_ += 4

          for (let polygonIndex_ = 0; polygonIndex_ < numberOfPolygons_; polygonIndex_++) {
            dataOffset_ = this._preparePolygon_(drawingInfo_, geometry_, dataOffset_, polygons_)
          }

          this._drawPolygons_(drawingInfo_, polygons_)
        }

        break

      case 7: // WKBGeometryCollection.
        {
          dataOffset_ += 4

          const numberOfGeometries_ = geometry_.getUint32(dataOffset_, true)
          dataOffset_ += 4

          for (let geometryIndex_ = 0; geometryIndex_ < numberOfGeometries_; geometryIndex_++) {
            dataOffset_ = this._drawGeometry_(drawingInfo_, geometry_, dataOffset_)
          }
        }

        break

      default:
        // console.log('Unhandled WKB type found: ' + wkbType_);

        break
    }

    return dataOffset_
  },
  _drawPoint_: function (drawingInfo_, geometry_, dataOffset_) {
    dataOffset_ += 4

    const x_ = geometry_.getFloat32(dataOffset_, true)
    dataOffset_ += 4

    const y_ = geometry_.getFloat32(dataOffset_, true)
    dataOffset_ += 4

    if (drawingInfo_.isIcon_ || drawingInfo_.isText_) {
      this._drawIcon_(drawingInfo_, x_, y_)
    }

    return dataOffset_
  },
  _drawIcon_: function (drawingInfo_, x_, y_) {
    let iconDisplacementBox_ = null
    const textDisplacementBoxes_ = []
    const textLineInfos_ = []

    if (drawingInfo_.isIcon_ && drawingInfo_.iconImage_) {
      if (drawingInfo_.displacementScaleX_ > 0 && drawingInfo_.displacementScaleY_ > 0) {
        iconDisplacementBox_ = {
          left_: x_ + drawingInfo_.iconImageOffsetX_ - drawingInfo_.iconWidth_ * drawingInfo_.displacementScaleX_ / 2,
          right_: x_ + drawingInfo_.iconImageOffsetX_ + drawingInfo_.iconWidth_ * drawingInfo_.displacementScaleX_ / 2,
          top_: y_ - drawingInfo_.iconImageOffsetY_ + drawingInfo_.iconHeight_ * drawingInfo_.displacementScaleY_ / 2,
          bottom_: y_ - drawingInfo_.iconImageOffsetY_ - drawingInfo_.iconHeight_ * drawingInfo_.displacementScaleY_ / 2
        }
      }
    }

    if (drawingInfo_.isText_ && drawingInfo_.text_) {
      let textY_ = drawingInfo_.iconTextOffsetY_

      // Convert name to multiline text.

      let maxTextLength_ = 10

      const textWords_ = drawingInfo_.text_.replace(/-/g, '- ').split(' ')

      for (const textWord_ of textWords_) {
        if (textWord_.length > maxTextLength_) {
          maxTextLength_ = textWord_.length
        }
      }

      let textLine_ = ''

      for (const textWord_ of textWords_) {
        if (textLine_.length + textWord_.length > maxTextLength_) {
          textLineInfos_.push({ text_: textLine_ })

          textLine_ = textWord_
        } else {
          if (textLine_) {
            textLine_ += ' '
          }

          textLine_ += textWord_
        }
      }

      if (textLine_) {
        textLineInfos_.push({ text_: textLine_ })
      }

      let textBoxWidth_ = 0

      globalThis.vms2Context_.fontCharacterContext_.font = drawingInfo_.fontStyle_ + ' 100px ' + drawingInfo_.fontFamily_

      for (const textLineInfo_ of textLineInfos_) {
        textLineInfo_.width_ = globalThis.vms2Context_.fontCharacterContext_.measureText(textLineInfo_.text_).width * drawingInfo_.fontSize_ / 100

        if (textLineInfo_.width_ > textBoxWidth_) {
          textBoxWidth_ = textLineInfo_.width_
        }
      }

      const textBoxHeight_ = drawingInfo_.fontSize_ * textLineInfos_.length

      if (textLineInfos_.length > 1) {
        if (textY_ === 0) {
          textY_ -= (textLineInfos_.length - 1) * drawingInfo_.fontSize_ / 2
        } else if (textY_ < 0) {
          textY_ -= (textLineInfos_.length - 1) * drawingInfo_.fontSize_
        }
      }

      const spacingX_ = textBoxWidth_ * (drawingInfo_.displacementScaleX_ - 1)
      const spacingY_ = textBoxHeight_ * (drawingInfo_.displacementScaleY_ - 1)

      if (drawingInfo_.displacementScaleX_ > 0 && drawingInfo_.displacementScaleY_ > 0) {
        if (drawingInfo_.iconTextPlacement_ && drawingInfo_.isIcon_ && drawingInfo_.iconImage_) {
          for (const placementCode_ in drawingInfo_.iconTextPlacement_) {
            const gapX_ = drawingInfo_.iconWidth_ * drawingInfo_.iconTextPlacement_[placementCode_]
            const gapY_ = drawingInfo_.iconHeight_ * drawingInfo_.iconTextPlacement_[placementCode_]

            switch (placementCode_) {
              case 't':
                textDisplacementBoxes_.push({
                  x_: drawingInfo_.iconImageOffsetX_,
                  y_: drawingInfo_.iconImageOffsetY_ - textBoxHeight_ - drawingInfo_.iconHeight_ / 2 - gapY_,
                  left_: x_ + drawingInfo_.iconImageOffsetX_ - textBoxWidth_ / 2 - spacingX_,
                  right_: x_ + drawingInfo_.iconImageOffsetX_ + textBoxWidth_ / 2 + spacingX_,
                  top_: y_ - drawingInfo_.iconImageOffsetY_ + textBoxHeight_ + drawingInfo_.iconHeight_ / 2 + spacingY_ + gapY_,
                  bottom_: y_ - drawingInfo_.iconImageOffsetY_ + drawingInfo_.iconHeight_ / 2 - spacingY_ + gapY_,
                  align_: 'center',
                  baseline_: 'top'
                })
                break

              case 'b':
                textDisplacementBoxes_.push({
                  x_: drawingInfo_.iconImageOffsetX_,
                  y_: drawingInfo_.iconImageOffsetY_ + drawingInfo_.iconHeight_ / 2 + gapY_,
                  left_: x_ + drawingInfo_.iconImageOffsetX_ - textBoxWidth_ / 2 - spacingX_,
                  right_: x_ + drawingInfo_.iconImageOffsetX_ + textBoxWidth_ / 2 + spacingX_,
                  top_: y_ - drawingInfo_.iconImageOffsetY_ - drawingInfo_.iconHeight_ / 2 + spacingY_ - gapY_,
                  bottom_: y_ - drawingInfo_.iconImageOffsetY_ - textBoxHeight_ - drawingInfo_.iconHeight_ / 2 - spacingY_ - gapY_,
                  align_: 'center',
                  baseline_: 'top'
                })
                break

              case 'l':
                textDisplacementBoxes_.push({
                  x_: drawingInfo_.iconImageOffsetX_ - drawingInfo_.iconWidth_ / 2 - gapX_,
                  y_: drawingInfo_.iconImageOffsetY_ - textBoxHeight_ / 2,
                  left_: x_ + drawingInfo_.iconImageOffsetX_ - textBoxWidth_ - drawingInfo_.iconWidth_ / 2 - spacingX_ - gapX_,
                  right_: x_ + drawingInfo_.iconImageOffsetX_ - drawingInfo_.iconWidth_ / 2 + spacingX_ - gapX_,
                  top_: y_ - drawingInfo_.iconImageOffsetY_ + textBoxHeight_ / 2 + spacingY_,
                  bottom_: y_ - drawingInfo_.iconImageOffsetY_ - textBoxHeight_ / 2 - spacingY_,
                  align_: 'right',
                  baseline_: 'top'
                })
                break

              case 'r':
                textDisplacementBoxes_.push({
                  x_: drawingInfo_.iconImageOffsetX_ + drawingInfo_.iconWidth_ / 2 + gapX_,
                  y_: drawingInfo_.iconImageOffsetY_ - textBoxHeight_ / 2,
                  left_: x_ + drawingInfo_.iconImageOffsetX_ + drawingInfo_.iconWidth_ / 2 - spacingX_ + gapX_,
                  right_: x_ + drawingInfo_.iconImageOffsetX_ + textBoxWidth_ + drawingInfo_.iconWidth_ / 2 + spacingX_ + gapX_,
                  top_: y_ - drawingInfo_.iconImageOffsetY_ + textBoxHeight_ / 2 + spacingY_,
                  bottom_: y_ - drawingInfo_.iconImageOffsetY_ - textBoxHeight_ / 2 - spacingY_,
                  align_: 'left',
                  baseline_: 'top'
                })
                break

              case 'tl':
                textDisplacementBoxes_.push({
                  x_: drawingInfo_.iconImageOffsetX_ - drawingInfo_.iconWidth_ / 2 - gapX_,
                  y_: drawingInfo_.iconImageOffsetY_ - textBoxHeight_ - drawingInfo_.iconHeight_ / 2 - gapY_,
                  left_: x_ + drawingInfo_.iconImageOffsetX_ - textBoxWidth_ - drawingInfo_.iconWidth_ / 2 - spacingX_ - gapX_,
                  right_: x_ + drawingInfo_.iconImageOffsetX_ - drawingInfo_.iconWidth_ / 2 + spacingX_ - gapX_,
                  top_: y_ - drawingInfo_.iconImageOffsetY_ + textBoxHeight_ + drawingInfo_.iconHeight_ / 2 + spacingY_ + gapY_,
                  bottom_: y_ - drawingInfo_.iconImageOffsetY_ + drawingInfo_.iconHeight_ / 2 - spacingY_ + gapY_,
                  align_: 'right',
                  baseline_: 'top'
                })
                break

              case 'tr':
                textDisplacementBoxes_.push({
                  x_: drawingInfo_.iconImageOffsetX_ + drawingInfo_.iconWidth_ / 2 + gapX_,
                  y_: drawingInfo_.iconImageOffsetY_ - textBoxHeight_ - drawingInfo_.iconHeight_ / 2 - gapY_,
                  left_: x_ + drawingInfo_.iconImageOffsetX_ + drawingInfo_.iconWidth_ / 2 + spacingX_ + gapX_,
                  right_: x_ + drawingInfo_.iconImageOffsetX_ + textBoxWidth_ + drawingInfo_.iconWidth_ / 2 - spacingX_ + gapX_,
                  top_: y_ - drawingInfo_.iconImageOffsetY_ + textBoxHeight_ + drawingInfo_.iconHeight_ / 2 + spacingY_ + gapY_,
                  bottom_: y_ - drawingInfo_.iconImageOffsetY_ + drawingInfo_.iconHeight_ / 2 - spacingY_ + gapY_,
                  align_: 'left',
                  baseline_: 'top'
                })
                break

              case 'bl':
                textDisplacementBoxes_.push({
                  x_: drawingInfo_.iconImageOffsetX_ - drawingInfo_.iconWidth_ / 2 - gapX_,
                  y_: drawingInfo_.iconImageOffsetY_ + drawingInfo_.iconHeight_ / 2 + gapY_,
                  left_: x_ + drawingInfo_.iconImageOffsetX_ - textBoxWidth_ - drawingInfo_.iconWidth_ / 2 - spacingX_ - gapX_,
                  right_: x_ + drawingInfo_.iconImageOffsetX_ - drawingInfo_.iconWidth_ / 2 + spacingX_ - gapX_,
                  top_: y_ - drawingInfo_.iconImageOffsetY_ - drawingInfo_.iconHeight_ / 2 + spacingY_ - gapY_,
                  bottom_: y_ - drawingInfo_.iconImageOffsetY_ - textBoxHeight_ - drawingInfo_.iconHeight_ / 2 - spacingY_ - gapY_,
                  align_: 'right',
                  baseline_: 'top'
                })
                break

              case 'br':
                textDisplacementBoxes_.push({
                  x_: drawingInfo_.iconImageOffsetX_ + drawingInfo_.iconWidth_ / 2 + gapX_,
                  y_: drawingInfo_.iconImageOffsetY_ + drawingInfo_.iconHeight_ / 2 + gapY_,
                  left_: x_ + drawingInfo_.iconImageOffsetX_ + drawingInfo_.iconWidth_ / 2 - spacingX_ + gapX_,
                  right_: x_ + drawingInfo_.iconImageOffsetX_ + textBoxWidth_ + drawingInfo_.iconWidth_ / 2 + spacingX_ + gapX_,
                  top_: y_ - drawingInfo_.iconImageOffsetY_ - drawingInfo_.iconHeight_ / 2 + spacingY_ - gapY_,
                  bottom_: y_ - drawingInfo_.iconImageOffsetY_ - textBoxHeight_ - drawingInfo_.iconHeight_ / 2 - spacingY_ - gapY_,
                  align_: 'left',
                  baseline_: 'top'
                })
                break
            }
          }
        } else {
          textDisplacementBoxes_.push({
            x_: drawingInfo_.iconTextOffsetX_,
            y_: drawingInfo_.iconTextOffsetY_,
            left_: x_ + drawingInfo_.iconTextOffsetX_ - textBoxWidth_ / 2 - spacingX_,
            right_: x_ + drawingInfo_.iconTextOffsetX_ + textBoxWidth_ / 2 + spacingX_,
            top_: y_ - drawingInfo_.iconTextOffsetY_ + textBoxHeight_ / 2 + spacingY_,
            bottom_: y_ - drawingInfo_.iconTextOffsetY_ - textBoxHeight_ / 2 - spacingY_,
            align_: 'center',
            baseline_: 'middle'
          })
        }
      }
    }

    if (textDisplacementBoxes_.length > 0) {
      for (const textDisplacementBox_ of textDisplacementBoxes_) {
        const textAndIconBoxes_ = []

        textAndIconBoxes_.push(textDisplacementBox_)

        if (iconDisplacementBox_) {
          textAndIconBoxes_.push(iconDisplacementBox_)
        }

        if (this._checkAndSetDisplacement_(drawingInfo_.displacementLayers_, drawingInfo_.displacementLayerNames_, textAndIconBoxes_)) {
          let groupStarted_ = false

          if (drawingInfo_.isIcon_ && drawingInfo_.iconImage_) {
            const iconX_ = drawingInfo_.iconImageOffsetX_ - drawingInfo_.iconWidth_ * drawingInfo_.iconMirrorX_ / 2
            const iconY_ = drawingInfo_.iconImageOffsetY_ - drawingInfo_.iconHeight_ * drawingInfo_.iconMirrorY_ / 2

            let iconLeft_ = x_ + iconX_
            let iconRight_ = iconLeft_ + drawingInfo_.iconWidth_ * drawingInfo_.iconMirrorX_
            let iconBottom_ = y_ + iconY_
            let iconTop_ = iconBottom_ + drawingInfo_.iconHeight_ * drawingInfo_.iconMirrorY_

            if (iconLeft_ > iconRight_) {
              const temp_ = iconLeft_

              iconLeft_ = iconRight_
              iconRight_ = temp_
            }

            if (iconBottom_ > iconTop_) {
              const temp_ = iconBottom_

              iconBottom_ = iconTop_
              iconTop_ = temp_
            }

            if (!(iconLeft_ > drawingInfo_.mapArea_.right_ || iconRight_ < drawingInfo_.mapArea_.left_ || iconTop_ < drawingInfo_.mapArea_.bottom_ || iconBottom_ > drawingInfo_.mapArea_.top_)) { // Note: Top > Bottom!
              drawingInfo_.context_.beginGroup(drawingInfo_.text_ || '')

              groupStarted_ = true

              drawingInfo_.context_.drawImage(
                drawingInfo_.iconImage_,
                (x_ - drawingInfo_.drawingArea_.left_ + iconX_) * drawingInfo_.mapScale_,
                (drawingInfo_.drawingArea_.top_ - y_ + iconY_) * drawingInfo_.mapScale_,
                drawingInfo_.iconWidth_ * drawingInfo_.iconMirrorX_ * drawingInfo_.mapScale_,
                drawingInfo_.iconHeight_ * drawingInfo_.iconMirrorY_ * drawingInfo_.mapScale_
              )
            }
          }

          if (drawingInfo_.isText_ && drawingInfo_.text_) {
            if (!(textDisplacementBox_.left_ > drawingInfo_.mapArea_.right_ || textDisplacementBox_.right_ < drawingInfo_.mapArea_.left_ || textDisplacementBox_.top_ < drawingInfo_.mapArea_.bottom_ || textDisplacementBox_.bottom_ > drawingInfo_.mapArea_.top_)) { // Note: Top > Bottom!
              drawingInfo_.context_.beginGroup(drawingInfo_.text_)

              if (drawingInfo_.isIcon_ && drawingInfo_.iconPositions_[drawingInfo_.text_]) {
                drawingInfo_.iconPositions_[drawingInfo_.text_].push({ x_, y_ })
              }

              drawingInfo_.context_.textAlign = textDisplacementBox_.align_
              drawingInfo_.context_.textBaseline = textDisplacementBox_.baseline_

              const textX_ = (x_ - drawingInfo_.drawingArea_.left_ + textDisplacementBox_.x_) * drawingInfo_.mapScale_
              let textY_ = (drawingInfo_.drawingArea_.top_ - y_ + textDisplacementBox_.y_) * drawingInfo_.mapScale_

              if (textLineInfos_.length > 1 && textDisplacementBox_.baseline_ === 'middle') {
                textY_ -= drawingInfo_.fontSize_ * drawingInfo_.mapScale_ * (textLineInfos_.length - 1) / 2
              }

              for (const textLineInfo_ of textLineInfos_) {
                drawingInfo_.context_.tw = textLineInfo_.width_
                drawingInfo_.context_.strokeText(textLineInfo_.text_, textX_, textY_)
                drawingInfo_.context_.fillText(textLineInfo_.text_, textX_, textY_)

                textY_ += drawingInfo_.fontSize_ * drawingInfo_.mapScale_
              }

              drawingInfo_.context_.endGroup()
            }
          }

          if (groupStarted_) {
            drawingInfo_.context_.endGroup()
          }

          break
        }
      }
    } else {
      if (drawingInfo_.isIcon_ && drawingInfo_.iconImage_) {
        if (
          (iconDisplacementBox_ && this._checkAndSetDisplacement_(drawingInfo_.displacementLayers_, drawingInfo_.displacementLayerNames_, [iconDisplacementBox_])) ||
          !iconDisplacementBox_
        ) {
          const iconX_ = drawingInfo_.iconImageOffsetX_ - drawingInfo_.iconWidth_ * drawingInfo_.iconMirrorX_ / 2
          const iconY_ = drawingInfo_.iconImageOffsetY_ - drawingInfo_.iconHeight_ * drawingInfo_.iconMirrorY_ / 2

          let iconLeft_ = x_ + iconX_
          let iconRight_ = iconLeft_ + drawingInfo_.iconWidth_ * drawingInfo_.iconMirrorX_
          let iconBottom_ = y_ + iconY_
          let iconTop_ = iconBottom_ + drawingInfo_.iconHeight_ * drawingInfo_.iconMirrorY_

          if (iconLeft_ > iconRight_) {
            const temp_ = iconLeft_

            iconLeft_ = iconRight_
            iconRight_ = temp_
          }

          if (iconBottom_ > iconTop_) {
            const temp_ = iconBottom_

            iconBottom_ = iconTop_
            iconTop_ = temp_
          }

          if (
            !(
              iconLeft_ > drawingInfo_.boundingArea_.right_ ||
              iconRight_ < drawingInfo_.boundingArea_.left_ ||
              iconTop_ < drawingInfo_.boundingArea_.bottom_ ||
              iconBottom_ > drawingInfo_.boundingArea_.top_
            ) ||
            drawingInfo_.isGrid_
          ) { // Note: Top > Bottom! Allow every location if there is a grid!
            if (drawingInfo_.iconAngle_ !== 0) {
              drawingInfo_.context_.setTransform(new DOMMatrix().translate((x_ - drawingInfo_.drawingArea_.left_) * drawingInfo_.mapScale_, (drawingInfo_.drawingArea_.top_ - y_) * drawingInfo_.mapScale_).rotate(drawingInfo_.iconAngle_ * 180 / Math.PI))
              drawingInfo_.context_.drawImage(
                drawingInfo_.iconImage_,
                iconX_ * drawingInfo_.mapScale_, iconY_ * drawingInfo_.mapScale_,
                drawingInfo_.iconWidth_ * drawingInfo_.iconMirrorX_ * drawingInfo_.mapScale_,
                drawingInfo_.iconHeight_ * drawingInfo_.iconMirrorY_ * drawingInfo_.mapScale_)
            } else {
              drawingInfo_.context_.drawImage(
                drawingInfo_.iconImage_,
                (x_ - drawingInfo_.drawingArea_.left_ + iconX_) * drawingInfo_.mapScale_,
                (drawingInfo_.drawingArea_.top_ - y_ + iconY_) * drawingInfo_.mapScale_,
                drawingInfo_.iconWidth_ * drawingInfo_.iconMirrorX_ * drawingInfo_.mapScale_,
                drawingInfo_.iconHeight_ * drawingInfo_.iconMirrorY_ * drawingInfo_.mapScale_
              )
            }
          }
        }
      }
    }
  },
  _drawLineString_ (drawingInfo_, geometry_, dataOffset_) {
    dataOffset_ += 4

    const numberOfPoints_ = geometry_.getUint32(dataOffset_, true)
    dataOffset_ += 4

    if (numberOfPoints_ === 0) {
      return dataOffset_
    }

    if (drawingInfo_.isIcon_ && drawingInfo_.iconImage_) { // Draw an icon and text on the line center.
      const halfLength_ = drawingInfo_.objectData_.length / 2
      let iconPositionLength_ = 0

      let x_ = geometry_.getFloat32(dataOffset_, true)
      dataOffset_ += 4

      let y_ = geometry_.getFloat32(dataOffset_, true)
      dataOffset_ += 4

      for (let pointIndex_ = 1; pointIndex_ < numberOfPoints_; pointIndex_++) {
        const x2_ = geometry_.getFloat32(dataOffset_, true)
        dataOffset_ += 4

        const y2_ = geometry_.getFloat32(dataOffset_, true)
        dataOffset_ += 4

        const deltaX_ = x2_ - x_
        const deltaY_ = y2_ - y_

        const segmentLength_ = Math.sqrt(deltaX_ * deltaX_ + deltaY_ * deltaY_)

        if (iconPositionLength_ + segmentLength_ > halfLength_) {
          const factor_ = (halfLength_ - iconPositionLength_) / segmentLength_

          x_ += deltaX_ * factor_
          y_ += deltaY_ * factor_

          dataOffset_ += (numberOfPoints_ - pointIndex_ - 1) * 4 * 2

          break
        }

        iconPositionLength_ += segmentLength_

        x_ = x2_
        y_ = y2_
      }

      // Check the distance to other labels of the same type.

      let isExceedingMinimumDistance_ = true

      if (drawingInfo_.iconPositions_[drawingInfo_.text_]) {
        for (const iconPosition_ of drawingInfo_.iconPositions_[drawingInfo_.text_]) {
          const deltaX_ = x_ - iconPosition_.x_
          const deltaY_ = y_ - iconPosition_.y_

          if (deltaX_ * deltaX_ + deltaY_ * deltaY_ < drawingInfo_.iconMinimumDistance_ * drawingInfo_.iconMinimumDistance_) {
            isExceedingMinimumDistance_ = false

            break
          }
        }
      } else {
        drawingInfo_.iconPositions_[drawingInfo_.text_] = []
      }

      if (isExceedingMinimumDistance_) {
        this._drawIcon_(drawingInfo_, x_, y_)
      }
    } else if (drawingInfo_.isText_ && drawingInfo_.text_) { // Draw text along the line.
      let text_ = drawingInfo_.text_.slice()
      let textWidth_ = 0

      if (text_.length === 1) {
        text_ = ' ' + text_ + ' '
      }

      for (let characterIndex_ = 0; characterIndex_ < text_.length; characterIndex_++) {
        if (this.unicodeDataTable_[text_.charCodeAt(characterIndex_)]) {
          text_ = [...text_].reverse().join('')

          break
        }
      }

      for (let characterIndex_ = 0; characterIndex_ < text_.length; characterIndex_++) {
        if (!globalThis.vms2Context_.fontCharacterWidths_[drawingInfo_.fontFamily_]) {
          globalThis.vms2Context_.fontCharacterWidths_[drawingInfo_.fontFamily_] = {}
        }

        if (!globalThis.vms2Context_.fontCharacterWidths_[drawingInfo_.fontFamily_][drawingInfo_.fontStyle_]) {
          globalThis.vms2Context_.fontCharacterWidths_[drawingInfo_.fontFamily_][drawingInfo_.fontStyle_] = {}
        }

        if (!globalThis.vms2Context_.fontCharacterWidths_[drawingInfo_.fontFamily_][drawingInfo_.fontStyle_][text_[characterIndex_]]) {
          globalThis.vms2Context_.fontCharacterContext_.font = drawingInfo_.fontStyle_ + ' 100px \'' + drawingInfo_.fontFamily_ + '\''
          globalThis.vms2Context_.fontCharacterWidths_[drawingInfo_.fontFamily_][drawingInfo_.fontStyle_][text_[characterIndex_]] = globalThis.vms2Context_.fontCharacterContext_.measureText(text_[characterIndex_]).width
        }

        textWidth_ += globalThis.vms2Context_.fontCharacterWidths_[drawingInfo_.fontFamily_][drawingInfo_.fontStyle_][text_[characterIndex_]] * drawingInfo_.fontSize_ / 100
      }

      if (textWidth_ < drawingInfo_.objectData_.length) {
        const segmentLengths_ = []
        const points_ = []
        let lineStringLength_ = 0

        for (let pointIndex_ = 0; pointIndex_ < numberOfPoints_; pointIndex_++) {
          const x_ = geometry_.getFloat32(dataOffset_, true)
          dataOffset_ += 4

          const y_ = geometry_.getFloat32(dataOffset_, true)
          dataOffset_ += 4

          points_.push({ x_, y_ })

          if (pointIndex_ > 0) {
            const deltaX_ = points_[pointIndex_ - 1].x_ - x_
            const deltaY_ = points_[pointIndex_ - 1].y_ - y_

            const segmentLength_ = Math.sqrt(deltaX_ * deltaX_ + deltaY_ * deltaY_)

            lineStringLength_ += segmentLength_
            segmentLengths_.push(segmentLength_)
          }
        }

        if (textWidth_ < lineStringLength_) {
          let additionalCharacterRotation_ = 0
          let pointsIndex_ = 0
          let lineOffset_ = 0
          let characterOffset_ = (lineStringLength_ - textWidth_) / 2

          const characterInfos_ = []

          let tempLength_ = 0
          let tempPointsIndex_ = 0

          while (tempLength_ + segmentLengths_[tempPointsIndex_] < lineStringLength_ / 2) {
            tempLength_ += segmentLengths_[tempPointsIndex_]

            tempPointsIndex_++
          }

          if (points_[tempPointsIndex_].x_ > points_[tempPointsIndex_ + 1].x_) {
            text_ = [...text_].reverse().join('')

            additionalCharacterRotation_ = Math.PI
          }

          for (let characterIndex_ = 0; characterIndex_ < text_.length; characterIndex_++) {
            const characterWidth_ = globalThis.vms2Context_.fontCharacterWidths_[drawingInfo_.fontFamily_][drawingInfo_.fontStyle_][text_[characterIndex_]] * drawingInfo_.fontSize_ / 100

            characterOffset_ += characterWidth_ / 2

            while (lineOffset_ + segmentLengths_[pointsIndex_] < characterOffset_) {
              lineOffset_ += segmentLengths_[pointsIndex_++]
            }

            const factor_ = (characterOffset_ - lineOffset_) / segmentLengths_[pointsIndex_]
            const textX_ = points_[pointsIndex_].x_ + (points_[pointsIndex_ + 1].x_ - points_[pointsIndex_].x_) * factor_
            const textY_ = points_[pointsIndex_].y_ + (points_[pointsIndex_ + 1].y_ - points_[pointsIndex_].y_) * factor_

            characterOffset_ += characterWidth_ / 2

            characterInfos_.push({ point_: { x_: textX_, y_: textY_ }, width_: characterWidth_ })
          }

          const textBoxes_ = []
          let textIsVisible_ = false

          if (drawingInfo_.displacementScaleX_ > 0 && drawingInfo_.displacementScaleY_ > 0) {
            for (const characterInfo_ of characterInfos_) {
              const left_ = characterInfo_.point_.x_ - drawingInfo_.fontSize_ * drawingInfo_.displacementScaleX_ / 2
              const right_ = characterInfo_.point_.x_ + drawingInfo_.fontSize_ * drawingInfo_.displacementScaleX_ / 2
              const top_ = characterInfo_.point_.y_ + drawingInfo_.fontSize_ * drawingInfo_.displacementScaleY_ / 2
              const bottom_ = characterInfo_.point_.y_ - drawingInfo_.fontSize_ * drawingInfo_.displacementScaleY_ / 2

              textBoxes_.push({ left_, right_, top_, bottom_ })

              if (!(left_ > drawingInfo_.mapArea_.right_ || right_ < drawingInfo_.mapArea_.left_ || top_ < drawingInfo_.mapArea_.bottom_ || bottom_ > drawingInfo_.mapArea_.top_)) { // Note: Top > Bottom!
                textIsVisible_ = true
              }
            }
          }

          if (this._checkAndSetDisplacement_(drawingInfo_.displacementLayers_, drawingInfo_.displacementLayerNames_, textBoxes_)) {
            if (textIsVisible_) {
              let maximumRotationAngleDelta_ = 0
              let lastRotationAngle_ = 0
              let startRotationAngle_ = 0

              if (characterInfos_[0].point_.y_ > characterInfos_[1].point_.y_) {
                startRotationAngle_ = Math.PI / 2
              } else {
                startRotationAngle_ = -Math.PI / 2
              }

              for (let characterIndex_ = 0; characterIndex_ < text_.length; characterIndex_++) {
                const angleStartPoint_ = characterIndex_ > 0 ? characterInfos_[characterIndex_ - 1].point_ : characterInfos_[0].point_
                const angleEndPoint_ = characterIndex_ < characterInfos_.length - 1 ? characterInfos_[characterIndex_ + 1].point_ : characterInfos_[characterIndex_].point_
                let characterRotationAngle_ = (angleEndPoint_.x_ - angleStartPoint_.x_) === 0 ? startRotationAngle_ : Math.atan((angleEndPoint_.y_ - angleStartPoint_.y_) / (angleEndPoint_.x_ - angleStartPoint_.x_))

                if (angleEndPoint_.x_ <= angleStartPoint_.x_) {
                  characterRotationAngle_ += Math.PI
                }

                characterRotationAngle_ += additionalCharacterRotation_

                characterInfos_[characterIndex_].rotationAngle_ = characterRotationAngle_

                if (characterIndex_ === 0) {
                  lastRotationAngle_ = characterRotationAngle_
                }

                const rotationAngleDelta_ = Math.abs(lastRotationAngle_ - characterRotationAngle_)

                if (rotationAngleDelta_ > maximumRotationAngleDelta_) {
                  maximumRotationAngleDelta_ = rotationAngleDelta_
                }
              }

              if (maximumRotationAngleDelta_ < Math.PI * 2 / 4) {
                const matrices_ = []

                drawingInfo_.context_.beginGroup(drawingInfo_.text_)

                for (let characterIndex_ = 0; characterIndex_ < text_.length; characterIndex_++) {
                  if (text_[characterIndex_] !== ' ') {
                    const matrix_ = new DOMMatrix().translate((characterInfos_[characterIndex_].point_.x_ - drawingInfo_.drawingArea_.left_) * drawingInfo_.mapScale_, (drawingInfo_.drawingArea_.top_ - characterInfos_[characterIndex_].point_.y_) * drawingInfo_.mapScale_).rotate(-characterInfos_[characterIndex_].rotationAngle_ * 180 / Math.PI)

                    matrices_.push(matrix_)

                    drawingInfo_.context_.tw = characterInfos_[characterIndex_].width_ * drawingInfo_.mapScale_
                    drawingInfo_.context_.setTransform(matrix_)
                    drawingInfo_.context_.strokeText(text_[characterIndex_], 0, 0)
                  }
                }

                for (let characterIndex_ = 0; characterIndex_ < text_.length; characterIndex_++) {
                  if (text_[characterIndex_] !== ' ') {
                    drawingInfo_.context_.tw = characterInfos_[characterIndex_].width_ * drawingInfo_.mapScale_
                    drawingInfo_.context_.setTransform(matrices_.shift())
                    drawingInfo_.context_.fillText(text_[characterIndex_], 0, 0)
                  }
                }

                drawingInfo_.context_.endGroup()
              }
            }
          }
        }
      } else {
        dataOffset_ += numberOfPoints_ * 4 * 2
      }
    } else if (!drawingInfo_.isText_ && !drawingInfo_.isIcon_) { // Draw a line
      drawingInfo_.context_.beginPath()

      let x_ = geometry_.getFloat32(dataOffset_, true)
      dataOffset_ += 4

      let y_ = geometry_.getFloat32(dataOffset_, true)
      dataOffset_ += 4

      drawingInfo_.context_.moveTo(Math.round((x_ - drawingInfo_.drawingArea_.left_) * drawingInfo_.mapScale_), Math.round((drawingInfo_.drawingArea_.top_ - y_) * drawingInfo_.mapScale_))

      for (let pointIndex_ = 1; pointIndex_ < numberOfPoints_; pointIndex_++) {
        x_ = geometry_.getFloat32(dataOffset_, true)
        dataOffset_ += 4

        y_ = geometry_.getFloat32(dataOffset_, true)
        dataOffset_ += 4

        drawingInfo_.context_.lineTo(Math.round((x_ - drawingInfo_.drawingArea_.left_) * drawingInfo_.mapScale_), Math.round((drawingInfo_.drawingArea_.top_ - y_) * drawingInfo_.mapScale_))
      }

      drawingInfo_.context_.stroke()
    } else {
      dataOffset_ += numberOfPoints_ * 4 * 2
    }

    return dataOffset_
  },
  _drawPolygons_: function (drawingInfo_, polygons_) {
    if (drawingInfo_.isFilled_) {
      this._drawPolygonsInterior_(drawingInfo_, polygons_)
    }

    if (drawingInfo_.isStroked_) {
      this._drawPolygonsBoundary_(drawingInfo_, polygons_)
    }
  },
  _drawPolygonsBoundary_: function (drawingInfo_, polygons_) {
    for (const polygonRings_ of polygons_) {
      for (const polygonPoints_ of polygonRings_) {
        const numberOfPoints_ = polygonPoints_.length

        let pointsDrawn_ = 0

        let lastX_ = 0
        let lastY_ = 0

        let lastDeltaLeft_ = 0
        let lastDeltaRight_ = 0
        let lastDeltaTop_ = 0
        let lastDeltaBottom_ = 0

        const deltaScale_ = Math.min(1, drawingInfo_.mapScale_)

        for (let pointIndex_ = 0; pointIndex_ < numberOfPoints_; pointIndex_++) {
          const x_ = polygonPoints_[pointIndex_].x
          const y_ = polygonPoints_[pointIndex_].y

          const deltaLeft_ = Math.round((x_ - drawingInfo_.tileBoundingBox_.left) * deltaScale_)
          const deltaRight_ = Math.round((x_ - drawingInfo_.tileBoundingBox_.right) * deltaScale_)
          const deltaTop_ = Math.round((drawingInfo_.tileBoundingBox_.top - y_) * deltaScale_)
          const deltaBottom_ = Math.round((drawingInfo_.tileBoundingBox_.bottom - y_) * deltaScale_)

          if (pointIndex_ > 0) {
            if (
              (deltaLeft_ === 0 && lastDeltaLeft_ === 0) ||
              (deltaRight_ === 0 && lastDeltaRight_ === 0) ||
              (deltaTop_ === 0 && lastDeltaTop_ === 0) ||
              (deltaBottom_ === 0 && lastDeltaBottom_ === 0)
            ) {
              if (pointsDrawn_ > 0) {
                drawingInfo_.context_.stroke()
              }

              pointsDrawn_ = 0
            } else {
              if (pointsDrawn_ === 0) {
                drawingInfo_.context_.beginPath()

                drawingInfo_.context_.moveTo(Math.round((lastX_ - drawingInfo_.drawingArea_.left_) * drawingInfo_.mapScale_), Math.round((drawingInfo_.drawingArea_.top_ - lastY_) * drawingInfo_.mapScale_))
              }

              drawingInfo_.context_.lineTo(Math.round((x_ - drawingInfo_.drawingArea_.left_) * drawingInfo_.mapScale_), Math.round((drawingInfo_.drawingArea_.top_ - y_) * drawingInfo_.mapScale_))

              pointsDrawn_++
            }
          }

          lastX_ = x_
          lastY_ = y_

          lastDeltaLeft_ = deltaLeft_
          lastDeltaRight_ = deltaRight_
          lastDeltaTop_ = deltaTop_
          lastDeltaBottom_ = deltaBottom_
        }

        if (pointsDrawn_ > 0) {
          drawingInfo_.context_.stroke()
        }
      }
    }
  },
  _drawPolygonsInterior_: function (drawingInfo_, polygons_) {
    drawingInfo_.context_.beginPath()

    for (const polygonRings_ of polygons_) {
      for (const polygonPoints_ of polygonRings_) {
        const numberOfPoints_ = polygonPoints_.length

        for (let pointIndex_ = 0; pointIndex_ < numberOfPoints_; pointIndex_++) {
          const x_ = polygonPoints_[pointIndex_].x
          const y_ = polygonPoints_[pointIndex_].y

          if (pointIndex_ === 0) {
            drawingInfo_.context_.moveTo(Math.round((x_ - drawingInfo_.drawingArea_.left_) * drawingInfo_.mapScale_), Math.round((drawingInfo_.drawingArea_.top_ - y_) * drawingInfo_.mapScale_))
          } else {
            drawingInfo_.context_.lineTo(Math.round((x_ - drawingInfo_.drawingArea_.left_) * drawingInfo_.mapScale_), Math.round((drawingInfo_.drawingArea_.top_ - y_) * drawingInfo_.mapScale_))
          }
        }
      }
    }

    drawingInfo_.context_.fill()
  },
  _convertGeojsonToTileLayer_: function (geojsonData_, tileLayer_, properties_) {
    switch (geojsonData_.type) {
      case 'FeatureCollection':
        for (const feature_ of geojsonData_.features) {
          this._convertGeojsonToTileLayer_(feature_, tileLayer_)
        }

        break

      case 'Feature':
        this._convertGeojsonToTileLayer_(geojsonData_.geometry, tileLayer_, geojsonData_.properties)

        break

      case 'Point':
        {
          const objectData_ = {
            info: {
              Envelope: {},
              Center: {}
            }
          }

          if (properties_) {
            objectData_.info.tags = properties_
          }

          objectData_.geometry = null

          const x_ = this._longitudeToMeters_(geojsonData_.coordinates[0])
          const y_ = this._latitudeToMeters_(geojsonData_.coordinates[1])

          objectData_.info.Envelope.left = x_
          objectData_.info.Envelope.right = x_
          objectData_.info.Envelope.top = y_
          objectData_.info.Envelope.bottom = y_

          objectData_.info.Center.x = x_
          objectData_.info.Center.y = y_

          tileLayer_.push(objectData_)
        }

        break

      case 'LineString':
        {
          const objectData_ = {
            info: {
              Envelope: {},
              Center: {}
            }
          }

          if (properties_) {
            objectData_.info.tags = properties_
          }

          objectData_.geometry = new DataView(new Uint8Array(4 + 4 + geojsonData_.coordinates.length * 4 * 2).buffer)

          let geometryDataOffset_ = 0

          objectData_.geometry.setUint32(geometryDataOffset_, 2, true) // wkbType = 2 (WKBLineString)
          geometryDataOffset_ += 4

          objectData_.geometry.setUint32(geometryDataOffset_, geojsonData_.coordinates.length, true)
          geometryDataOffset_ += 4

          let previousX_ = 0
          let previousY_ = 0
          let length_ = -1

          for (const coordinate_ of geojsonData_.coordinates) {
            const x_ = this._longitudeToMeters_(coordinate_[0])
            const y_ = this._latitudeToMeters_(coordinate_[1])

            if (length_ < 0) {
              length_ = 0
            } else {
              const deltaX_ = (x_ - previousX_)
              const deltaY_ = (y_ - previousY_)

              length_ += Math.sqrt(deltaX_ * deltaX_ + deltaY_ * deltaY_)
            }

            objectData_.info.length = length_

            previousX_ = x_
            previousY_ = y_

            if (geometryDataOffset_ === 8) {
              objectData_.info.Envelope.left = x_
              objectData_.info.Envelope.right = x_
              objectData_.info.Envelope.top = y_
              objectData_.info.Envelope.bottom = y_
            } else {
              if (x_ < objectData_.info.Envelope.left) {
                objectData_.info.Envelope.left = x_
              } else if (x_ > objectData_.info.Envelope.right) {
                objectData_.info.Envelope.right = x_
              }

              if (y_ < objectData_.info.Envelope.bottom) {
                objectData_.info.Envelope.bottom = y_
              } else if (y_ > objectData_.info.Envelope.top) {
                objectData_.info.Envelope.top = y_
              }
            }

            objectData_.geometry.setFloat32(geometryDataOffset_, x_, true)
            geometryDataOffset_ += 4

            objectData_.geometry.setFloat32(geometryDataOffset_, y_, true)
            geometryDataOffset_ += 4
          }

          objectData_.info.Center.x = (objectData_.info.Envelope.left + objectData_.info.Envelope.right) / 2
          objectData_.info.Center.y = (objectData_.info.Envelope.top + objectData_.info.Envelope.bottom) / 2

          tileLayer_.push(objectData_)
        }

        break
    }
  },
  _getTileLayers_: function (tileCanvas_, tileInfo_, mapStyle_) {
    return new Promise(resolve => {
      const tileLayers_ = {}

      let layerLayoutIdCount_ = 0

      for (const layerName_ of mapStyle_.Order) {
        const layer_ = mapStyle_.Layers[layerName_]

        const styleType_ = this._getLayerStyleType_(layer_)

        if (
          !layer_ ||
          (this.options.type && this.options.type !== styleType_) ||
          layer_.Enable === false ||
          tileInfo_.vms2TileZ_ < (layer_.ZoomRange[0] > 0 ? layer_.ZoomRange[0] + this.options.zoomRangeOffset : 0) ||
          tileInfo_.vms2TileZ_ >= (layer_.ZoomRange[1] + this.options.zoomRangeOffset)
        ) {
          continue
        }

        const layerLayout_ = layer_.LayoutLayers || []

        const layerLayoutIds_ = []

        if (Array.isArray(layerLayout_) && layerLayout_.length > 0) {
          layerLayoutIds_.push(layerLayout_[0])
        } else {
          for (const geometryType_ in layerLayout_) {
            for (const osmKeyName_ in layerLayout_[geometryType_]) {
              for (const osmValue_ of layerLayout_[geometryType_][osmKeyName_]) {
                layerLayoutIds_.push(osmKeyName_ + '|' + osmValue_ + '|' + geometryType_)
              }
            }
          }
        }

        layer_.needsAreaExtension_ = !!(this._getLayerStyleType_(layer_) === 'text' || layer_.Grid || layer_.Save)

        if (layer_.CustomData) {
          if (!tileLayers_[layerName_]) {
            tileLayers_[layerName_] = []

            this._convertGeojsonToTileLayer_(mapStyle_.CustomData[layer_.CustomData], tileLayers_[layerName_])
          }
        } else {
          for (const layerLayoutId_ of layerLayoutIds_) {
            if (!tileLayers_[layerName_]) {
              tileLayers_[layerName_] = []
            }

            const tileLayerData_ = { tileCanvas_, tileInfo_, dataLayerId_: layerLayoutId_, layerStyle_: layer_, tileIds_: [], objects: [], tileCount_: 0 }

            this._getTileLayer_(tileLayerData_).then(() => {
              tileLayers_[layerName_] = tileLayers_[layerName_].concat(tileLayerData_.objects)

              layerLayoutIdCount_--

              if (layerLayoutIdCount_ === 0) {
                resolve(tileLayers_)
              }
            })

            layerLayoutIdCount_++
          }
        }
      }
    })
  },
  _drawSaveLayer_: async function (drawingInfo_, mapObjects_, tileInfo_, layer_) {
    drawingInfo_.isFilled_ = true

    const saveStyle_ = layer_.Save

    let objectScale_ = drawingInfo_.objectScale_

    if (saveStyle_.ZoomScale != null) {
      objectScale_ = 1 / drawingInfo_.userMapScale_ / Math.pow(DEFAULT_DISPLAY_DPI_ * drawingInfo_.mapScale_ / drawingInfo_.userMapScale_ / tileInfo_.dpi_, saveStyle_.ZoomScale)
    }

    if (!isNaN(saveStyle_.StrokeWidth)) {
      drawingInfo_.context_.lineWidth = saveStyle_.StrokeWidth * objectScale_ * drawingInfo_.mapScale_

      drawingInfo_.context_.setLineDash([])
      drawingInfo_.context_.lineCap = 'round'
      drawingInfo_.context_.lineJoin = 'round'

      drawingInfo_.isStroked_ = true
    }

    for (const mapObject_ of mapObjects_) {
      if (!mapObject_) {
        continue
      }

      if (mapObject_.geometry === undefined) { // Tile bounding box object to avoid drawing lines on tile edges.
        drawingInfo_.tileBoundingBox_ = mapObject_.info

        continue
      }

      if (
        mapObject_.info.Envelope.left > drawingInfo_.boundingArea_.right_ ||
        mapObject_.info.Envelope.right < drawingInfo_.boundingArea_.left_ ||
        mapObject_.info.Envelope.bottom > drawingInfo_.boundingArea_.top_ ||
        mapObject_.info.Envelope.top < drawingInfo_.boundingArea_.bottom_
      ) { // Note: Top > Bottom!
        continue
      }

      mapObject_.info.locr_layer = layer_.layerName_

      if (!mapObject_.type) {
        if (!isNaN(mapObject_.info.length)) {
          mapObject_.type = 'line'
        } else if (mapObject_.geometry === null) {
          mapObject_.type = 'point'
        } else {
          mapObject_.type = 'polygon'
        }
      }

      drawingInfo_.objectData_ = mapObject_.info

      this.randomGenerator_.init_seed(drawingInfo_.objectData_.Hash)

      const randomColor_ = (this.randomGenerator_.random_int() & 0xffffff)

      drawingInfo_.saveDataIds_[randomColor_] = drawingInfo_.objectData_

      const red_ = (randomColor_ >> 16) & 0xff
      const green_ = (randomColor_ >> 8) & 0xff
      const blue_ = randomColor_ & 0xff

      if (drawingInfo_.isFilled_) {
        drawingInfo_.context_.fillStyle = '#' + this._hexify24_([red_, green_, blue_]) + 'ff'
      }

      if (drawingInfo_.isStroked_) {
        drawingInfo_.context_.strokeStyle = '#' + this._hexify24_([red_, green_, blue_]) + 'ff'
      }

      this._drawGeometry_(drawingInfo_, mapObject_.geometry)
    }
  },
  _drawBaseLayer_: async function (drawingInfo_, mapObjects_, tileInfo_, layer_) {
    drawingInfo_.isText_ = false

    if (!layer_.isGrid_ && layer_.Style && !layer_.Filters) {
      drawingInfo_.isIcon_ = false

      const objectStyle_ = layer_.Style

      let objectScale_ = drawingInfo_.objectScale_

      if (!isNaN(objectStyle_.ZoomScale)) {
        objectScale_ = drawingInfo_.objectScale_ / drawingInfo_.userMapScale_ / Math.pow(DEFAULT_DISPLAY_DPI_ * drawingInfo_.mapScale_ / drawingInfo_.userMapScale_ / tileInfo_.dpi_, objectStyle_.ZoomScale)
      }

      if (isNaN(objectStyle_.FillAlpha)) {
        objectStyle_.FillAlpha = 1
      }

      if (objectStyle_.FillAlpha && objectStyle_.FillColor) {
        drawingInfo_.context_.fillStyle = '#' + this._hexify32_([objectStyle_.FillColor[0], objectStyle_.FillColor[1], objectStyle_.FillColor[2], Math.round(objectStyle_.FillAlpha * 255)])

        drawingInfo_.isFilled_ = true
      } else {
        drawingInfo_.isFilled_ = false
      }

      if (isNaN(objectStyle_.StrokeAlpha)) {
        objectStyle_.StrokeAlpha = 1
      }

      if (!isNaN(objectStyle_.StrokeWidth)) {
        if (objectStyle_.StrokeUnit === 'px') {
          drawingInfo_.context_.lineWidth = objectStyle_.StrokeWidth
        } else {
          drawingInfo_.context_.lineWidth = objectStyle_.StrokeWidth * objectScale_ * drawingInfo_.mapScale_ * drawingInfo_.adjustedObjectScale_
        }
      }

      if (objectStyle_.StrokeAlpha && objectStyle_.StrokeWidth > 0 && objectStyle_.StrokeColor) {
        drawingInfo_.context_.strokeStyle = '#' + this._hexify32_([objectStyle_.StrokeColor[0], objectStyle_.StrokeColor[1], objectStyle_.StrokeColor[2], Math.round(objectStyle_.StrokeAlpha * 255)])

        drawingInfo_.isStroked_ = true
      } else {
        drawingInfo_.isStroked_ = false
      }

      if (drawingInfo_.isStroked_) {
        if (objectStyle_.LineDash) {
          const lineDash_ = []

          for (const dash_ of objectStyle_.LineDash) {
            lineDash_.push(dash_ * objectScale_ * drawingInfo_.mapScale_)
          }

          drawingInfo_.context_.setLineDash(lineDash_)
        } else {
          drawingInfo_.context_.setLineDash([])
        }

        if (objectStyle_.LineCap) {
          drawingInfo_.context_.lineCap = objectStyle_.LineCap
        } else {
          drawingInfo_.context_.lineCap = 'round'
        }

        if (objectStyle_.LineJoin) {
          drawingInfo_.context_.lineJoin = objectStyle_.LineJoin
        } else {
          drawingInfo_.context_.lineJoin = 'round'
        }
      }

      if (objectStyle_.PatternFunction) {
        if (!objectStyle_.PatternFunction_) {
          objectStyle_.PatternFunction_ = new Function(
            'ObjectData',
            'MapZoom',
            'RandomGenerator',
            'return ' + objectStyle_.PatternFunction.replace(/<tags.([a-z1-9_:]+)>/g, 'ObjectData.tags[\'$1\']').replace(/<([a-z1-9_:]+)>/g, 'ObjectData.$1')
          )
        }

        const patternName_ = objectStyle_.PatternFunction_(drawingInfo_.objectData_, tileInfo_.vms2TileZ_, this.randomGenerator_)

        if (patternName_) {
          const pattern_ = await this._getPattern_(drawingInfo_.context_, patternName_)

          pattern_.transformMatrix = new DOMMatrix().translate(drawingInfo_.mapArea_.left_ * drawingInfo_.mapScale_, drawingInfo_.mapArea_.top_ * drawingInfo_.mapScale_).scale(drawingInfo_.patternScale_)

          pattern_.setTransform(pattern_.transformMatrix)

          drawingInfo_.context_.fillStyle = pattern_

          drawingInfo_.isFilled_ = true
        } else {
          drawingInfo_.isFilled_ = false
        }
      }

      for (const mapObject_ of mapObjects_) {
        if (!mapObject_) {
          continue
        }

        if (mapObject_.geometry === undefined) { // Tile bounding box object to avoid drawing lines on tile edges.
          drawingInfo_.tileBoundingBox_ = mapObject_.info

          continue
        }

        if (
          mapObject_.info.Envelope.left > drawingInfo_.boundingArea_.right_ ||
          mapObject_.info.Envelope.right < drawingInfo_.boundingArea_.left_ ||
          mapObject_.info.Envelope.bottom > drawingInfo_.boundingArea_.top_ ||
          mapObject_.info.Envelope.top < drawingInfo_.boundingArea_.bottom_
        ) { // Note: Top > Bottom!
          continue
        }

        if (!mapObject_.type) {
          if (!isNaN(mapObject_.info.length)) {
            mapObject_.type = 'line'
          } else if (mapObject_.geometry === null) {
            mapObject_.type = 'point'
          } else {
            mapObject_.type = 'polygon'
          }
        }

        drawingInfo_.objectData_ = mapObject_.info

        if (mapObject_.geometry && (drawingInfo_.isStroked_ || drawingInfo_.isFilled_)) {
          this._drawGeometry_(drawingInfo_, mapObject_.geometry)
        }
      }

      return
    }

    let activeObjectStyle_ = null

    for (const mapObject_ of mapObjects_) {
      if (!mapObject_) {
        continue
      }

      if (mapObject_.geometry === undefined) { // Tile bounding box object to avoid drawing lines on tile edges.
        drawingInfo_.tileBoundingBox_ = mapObject_.info

        continue
      }

      if (
        mapObject_.info.Envelope.left > drawingInfo_.boundingArea_.right_ ||
        mapObject_.info.Envelope.right < drawingInfo_.boundingArea_.left_ ||
        mapObject_.info.Envelope.bottom > drawingInfo_.boundingArea_.top_ ||
        mapObject_.info.Envelope.top < drawingInfo_.boundingArea_.bottom_
      ) { // Note: Top > Bottom!
        continue
      }

      if (!mapObject_.type) {
        if (!isNaN(mapObject_.info.length)) {
          mapObject_.type = 'line'
        } else if (mapObject_.geometry === null) {
          mapObject_.type = 'point'
        } else {
          mapObject_.type = 'polygon'
        }
      }

      drawingInfo_.objectData_ = mapObject_.info

      let objectStyle_ = layer_.Style

      if (layer_.Filters) {
        let objectData_ = drawingInfo_.objectData_

        const x_ = objectData_.Center.x
        const y_ = objectData_.Center.y

        this.randomGenerator_.init_seed((Math.round(x_) + 0xaffeaffe) * (Math.round(y_) + 0xaffeaffe))

        if (drawingInfo_.isGrid_ && drawingInfo_.saveDataCanvas_) {
          if (!drawingInfo_.saveDataPixels_) {
            drawingInfo_.saveDataPixels_ = drawingInfo_.saveDataCanvas_.context_.getImageData(0, 0, drawingInfo_.saveDataCanvas_.width, drawingInfo_.saveDataCanvas_.height).data

            this._remapPixels_(drawingInfo_.saveDataPixels_, drawingInfo_.saveDataIds_, drawingInfo_.saveDataCanvas_.width)
          }

          const pixelX_ = Math.round((x_ - drawingInfo_.saveDataArea_.left_) * drawingInfo_.mapScale_)
          const pixelY_ = Math.round((drawingInfo_.saveDataArea_.top_ - y_) * drawingInfo_.mapScale_)

          if (pixelX_ >= 0 && pixelX_ < drawingInfo_.saveDataCanvas_.width && pixelY_ >= 0 && pixelY_ < drawingInfo_.saveDataCanvas_.height) {
            const pixelIndex_ = (pixelX_ + pixelY_ * drawingInfo_.saveDataCanvas_.width) * 4

            const red_ = drawingInfo_.saveDataPixels_[pixelIndex_]
            const green_ = drawingInfo_.saveDataPixels_[pixelIndex_ + 1]
            const blue_ = drawingInfo_.saveDataPixels_[pixelIndex_ + 2]

            const color_ = (red_ << 16) + (green_ << 8) + blue_

            objectData_ = drawingInfo_.saveDataIds_[color_]
          } else {
            continue
          }
        }

        if (objectData_) {
          for (const filter_ of layer_.Filters) {
            if (filter_.Enable === false) {
              continue
            }

            if (!filter_.ConditionFunction_) {
              filter_.ConditionFunction_ = new Function(
                'ObjectData',
                'MapZoom',
                'RandomGenerator',
                'return ' + filter_.Condition.replace(/<tags.([a-z1-9_:]+)>/g, 'ObjectData.tags[\'$1\']').replace(/<([a-z1-9_:]+)>/g, 'ObjectData.$1')
              )
            }

            if (filter_.ConditionFunction_(objectData_, tileInfo_.vms2TileZ_, this.randomGenerator_)) {
              objectStyle_ = filter_.Style

              break
            }
          }
        }
      }

      if (objectStyle_) {
        let objectScale_ = drawingInfo_.objectScale_

        if (!isNaN(objectStyle_.ZoomScale)) {
          objectScale_ = drawingInfo_.objectScale_ / drawingInfo_.userMapScale_ / Math.pow(DEFAULT_DISPLAY_DPI_ * drawingInfo_.mapScale_ / drawingInfo_.userMapScale_ / tileInfo_.dpi_, objectStyle_.ZoomScale)
        }

        if (activeObjectStyle_ !== objectStyle_) {
          if (isNaN(objectStyle_.FillAlpha)) {
            objectStyle_.FillAlpha = 1
          }

          if (objectStyle_.FillAlpha && objectStyle_.FillColor) {
            drawingInfo_.context_.fillStyle = '#' + this._hexify32_([objectStyle_.FillColor[0], objectStyle_.FillColor[1], objectStyle_.FillColor[2], Math.round(objectStyle_.FillAlpha * 255)])

            drawingInfo_.isFilled_ = true
          } else {
            drawingInfo_.isFilled_ = false
          }

          if (isNaN(objectStyle_.StrokeAlpha)) {
            objectStyle_.StrokeAlpha = 1
          }

          if (!isNaN(objectStyle_.StrokeWidth)) {
            if (objectStyle_.StrokeUnit === 'px') {
              drawingInfo_.context_.lineWidth = objectStyle_.StrokeWidth
            } else {
              drawingInfo_.context_.lineWidth = objectStyle_.StrokeWidth * objectScale_ * drawingInfo_.mapScale_ * drawingInfo_.adjustedObjectScale_
            }
          }

          if (objectStyle_.StrokeAlpha && objectStyle_.StrokeWidth > 0 && objectStyle_.StrokeColor) {
            drawingInfo_.context_.strokeStyle = '#' + this._hexify32_([objectStyle_.StrokeColor[0], objectStyle_.StrokeColor[1], objectStyle_.StrokeColor[2], Math.round(objectStyle_.StrokeAlpha * 255)])

            drawingInfo_.isStroked_ = true
          } else {
            drawingInfo_.isStroked_ = false
          }

          if (drawingInfo_.isStroked_) {
            if (objectStyle_.LineDash) {
              const lineDash_ = []

              for (const dash_ of objectStyle_.LineDash) {
                lineDash_.push(dash_ * objectScale_ * drawingInfo_.mapScale_)
              }

              drawingInfo_.context_.setLineDash(lineDash_)
            } else {
              drawingInfo_.context_.setLineDash([])
            }

            if (objectStyle_.LineCap) {
              drawingInfo_.context_.lineCap = objectStyle_.LineCap
            } else {
              drawingInfo_.context_.lineCap = 'round'
            }

            if (objectStyle_.LineJoin) {
              drawingInfo_.context_.lineJoin = objectStyle_.LineJoin
            } else {
              drawingInfo_.context_.lineJoin = 'round'
            }
          }

          if (objectStyle_.PatternFunction) {
            if (!objectStyle_.PatternFunction_) {
              objectStyle_.PatternFunction_ = new Function(
                'ObjectData',
                'MapZoom',
                'RandomGenerator',
                'return ' + objectStyle_.PatternFunction.replace(/<tags.([a-z1-9_:]+)>/g, 'ObjectData.tags[\'$1\']').replace(/<([a-z1-9_:]+)>/g, 'ObjectData.$1')
              )
            }
          }

          activeObjectStyle_ = objectStyle_
        }

        drawingInfo_.isIcon_ = false

        drawingInfo_.iconImage_ = null

        drawingInfo_.iconWidth_ = 0
        drawingInfo_.iconHeight_ = 0

        if (activeObjectStyle_.PatternFunction) {
          const patternName_ = activeObjectStyle_.PatternFunction_(drawingInfo_.objectData_, tileInfo_.vms2TileZ_, this.randomGenerator_)

          if (patternName_) {
            const pattern_ = await this._getPattern_(drawingInfo_.context_, patternName_)

            pattern_.transformMatrix = new DOMMatrix().translate(drawingInfo_.mapArea_.left_ * drawingInfo_.mapScale_, drawingInfo_.mapArea_.top_ * drawingInfo_.mapScale_).scale(drawingInfo_.patternScale_)

            pattern_.setTransform(pattern_.transformMatrix)

            drawingInfo_.context_.fillStyle = pattern_

            drawingInfo_.isFilled_ = true
          } else {
            drawingInfo_.isFilled_ = false
          }
        }

        if (mapObject_.geometry && (drawingInfo_.isStroked_ || drawingInfo_.isFilled_)) {
          this._drawGeometry_(drawingInfo_, mapObject_.geometry)
        } else if (drawingInfo_.isIcon_) {
          this._drawIcon_(drawingInfo_, mapObject_.info.Center.x, mapObject_.info.Center.y)
        }
      }
    }
  },
  _drawObjectsLayer_: async function (drawingInfo_, mapObjects_, tileInfo_, layer_) {
    let activeObjectStyle_ = null

    for (const mapObject_ of mapObjects_) {
      if (!mapObject_) {
        continue
      }

      if (mapObject_.geometry === undefined) { // Tile bounding box object to avoid drawing lines on tile edges.
        drawingInfo_.tileBoundingBox_ = mapObject_.info

        continue
      }

      if (mapObject_.info.Envelope.left > drawingInfo_.boundingArea_.right_ ||
                mapObject_.info.Envelope.right < drawingInfo_.boundingArea_.left_ ||
                mapObject_.info.Envelope.bottom > drawingInfo_.boundingArea_.top_ ||
                mapObject_.info.Envelope.top < drawingInfo_.boundingArea_.bottom_) { // Note: Top > Bottom!
        continue
      }

      if (!mapObject_.type) {
        if (!isNaN(mapObject_.info.length)) {
          mapObject_.type = 'line'
        } else if (mapObject_.geometry === null) {
          mapObject_.type = 'point'
        } else {
          mapObject_.type = 'polygon'
        }
      }

      drawingInfo_.objectData_ = mapObject_.info

      let objectStyle_ = layer_.Style

      if (layer_.Filters) {
        let objectData_ = drawingInfo_.objectData_

        const x_ = objectData_.Center.x
        const y_ = objectData_.Center.y

        this.randomGenerator_.init_seed((Math.round(x_) + 0xaffeaffe) * (Math.round(y_) + 0xaffeaffe))

        if (drawingInfo_.isGrid_ && drawingInfo_.saveDataCanvas_) {
          if (!drawingInfo_.saveDataPixels_) {
            drawingInfo_.saveDataPixels_ = drawingInfo_.saveDataCanvas_.context_.getImageData(0, 0, drawingInfo_.saveDataCanvas_.width, drawingInfo_.saveDataCanvas_.height).data

            this._remapPixels_(drawingInfo_.saveDataPixels_, drawingInfo_.saveDataIds_, drawingInfo_.saveDataCanvas_.width)
          }

          const pixelX_ = Math.round((x_ - drawingInfo_.saveDataArea_.left_) * drawingInfo_.mapScale_)
          const pixelY_ = Math.round((drawingInfo_.saveDataArea_.top_ - y_) * drawingInfo_.mapScale_)

          if (pixelX_ >= 0 && pixelX_ < drawingInfo_.saveDataCanvas_.width && pixelY_ >= 0 && pixelY_ < drawingInfo_.saveDataCanvas_.height) {
            const pixelIndex_ = (pixelX_ + pixelY_ * drawingInfo_.saveDataCanvas_.width) * 4

            const red_ = drawingInfo_.saveDataPixels_[pixelIndex_]
            const green_ = drawingInfo_.saveDataPixels_[pixelIndex_ + 1]
            const blue_ = drawingInfo_.saveDataPixels_[pixelIndex_ + 2]

            const color_ = (red_ << 16) + (green_ << 8) + blue_

            objectData_ = drawingInfo_.saveDataIds_[color_]
          } else {
            continue
          }
        }

        if (objectData_) {
          for (const filter_ of layer_.Filters) {
            if (filter_.Enable === false) {
              continue
            }

            if (!filter_.ConditionFunction_) {
              filter_.ConditionFunction_ = new Function(
                'ObjectData',
                'MapZoom',
                'RandomGenerator',
                'return ' + filter_.Condition.replace(/<tags.([a-z1-9_:]+)>/g, 'ObjectData.tags[\'$1\']').replace(/<([a-z1-9_:]+)>/g, 'ObjectData.$1')
              )
            }

            if (filter_.ConditionFunction_(objectData_, tileInfo_.vms2TileZ_, this.randomGenerator_)) {
              objectStyle_ = filter_.Style

              break
            }
          }
        }
      }

      if (objectStyle_) {
        let objectScale_ = drawingInfo_.objectScale_

        if (!isNaN(objectStyle_.ZoomScale)) {
          objectScale_ = drawingInfo_.objectScale_ / drawingInfo_.userMapScale_ / Math.pow(DEFAULT_DISPLAY_DPI_ * drawingInfo_.mapScale_ / drawingInfo_.userMapScale_ / tileInfo_.dpi_, objectStyle_.ZoomScale)
        }

        if (activeObjectStyle_ !== objectStyle_) {
          if (isNaN(objectStyle_.FillAlpha)) {
            objectStyle_.FillAlpha = 1
          }

          if (objectStyle_.FillAlpha && objectStyle_.FillColor) {
            drawingInfo_.context_.fillStyle = '#' + this._hexify32_([objectStyle_.FillColor[0], objectStyle_.FillColor[1], objectStyle_.FillColor[2], Math.round(objectStyle_.FillAlpha * 255)])

            drawingInfo_.isFilled_ = true
          } else {
            drawingInfo_.isFilled_ = false
          }

          if (isNaN(objectStyle_.StrokeAlpha)) {
            objectStyle_.StrokeAlpha = 1
          }

          if (!isNaN(objectStyle_.StrokeWidth)) {
            if (objectStyle_.StrokeUnit === 'px') {
              drawingInfo_.context_.lineWidth = objectStyle_.StrokeWidth
            } else {
              drawingInfo_.context_.lineWidth = objectStyle_.StrokeWidth * objectScale_ * drawingInfo_.mapScale_ * drawingInfo_.adjustedObjectScale_
            }
          }

          if (objectStyle_.StrokeAlpha && objectStyle_.StrokeWidth > 0 && objectStyle_.StrokeColor) {
            drawingInfo_.context_.strokeStyle = '#' + this._hexify32_([objectStyle_.StrokeColor[0], objectStyle_.StrokeColor[1], objectStyle_.StrokeColor[2], Math.round(objectStyle_.StrokeAlpha * 255)])

            drawingInfo_.isStroked_ = true
          } else {
            drawingInfo_.isStroked_ = false
          }

          if (drawingInfo_.isStroked_) {
            if (objectStyle_.LineDash) {
              const lineDash_ = []

              for (const dash_ of objectStyle_.LineDash) {
                lineDash_.push(dash_ * objectScale_ * drawingInfo_.mapScale_)
              }

              drawingInfo_.context_.setLineDash(lineDash_)
            } else {
              drawingInfo_.context_.setLineDash([])
            }

            if (objectStyle_.LineCap) {
              drawingInfo_.context_.lineCap = objectStyle_.LineCap
            } else {
              drawingInfo_.context_.lineCap = 'round'
            }

            if (objectStyle_.LineJoin) {
              drawingInfo_.context_.lineJoin = objectStyle_.LineJoin
            } else {
              drawingInfo_.context_.lineJoin = 'round'
            }
          }

          if (objectStyle_.FontFamily && objectStyle_.FontSize != null) {
            await this._requestFontFace_(objectStyle_)

            drawingInfo_.fontSize_ = objectStyle_.FontSize * objectScale_

            let fontStyle_ = 'normal'

            if (objectStyle_.FontStyle) {
              fontStyle_ = objectStyle_.FontStyle
            }

            drawingInfo_.context_.font = fontStyle_ + ' ' + (drawingInfo_.fontSize_ * drawingInfo_.mapScale_) + 'px \'' + objectStyle_.FontFamily + '\''

            drawingInfo_.fontStyle_ = fontStyle_
            drawingInfo_.fontFamily_ = objectStyle_.FontFamily
          }

          if (objectStyle_.IconFunction) {
            if (!objectStyle_.IconFunction_) {
              objectStyle_.IconFunction_ = new Function(
                'ObjectData',
                'MapZoom',
                'RandomGenerator',
                'return ' + objectStyle_.IconFunction.replace(/<tags.([a-z1-9_:]+)>/g, 'ObjectData.tags[\'$1\']').replace(/<([a-z1-9_:]+)>/g, 'ObjectData.$1')
              )
            }
          }

          if (objectStyle_.PatternFunction) {
            if (!objectStyle_.PatternFunction_) {
              objectStyle_.PatternFunction_ = new Function(
                'ObjectData',
                'MapZoom',
                'RandomGenerator',
                'return ' + objectStyle_.PatternFunction.replace(/<tags.([a-z1-9_:]+)>/g, 'ObjectData.tags[\'$1\']').replace(/<([a-z1-9_:]+)>/g, 'ObjectData.$1')
              )
            }
          }

          activeObjectStyle_ = objectStyle_
        }

        drawingInfo_.isIcon_ = false
        drawingInfo_.isText_ = false

        drawingInfo_.iconImage_ = null
        drawingInfo_.text_ = null

        drawingInfo_.iconWidth_ = 0
        drawingInfo_.iconHeight_ = 0
        drawingInfo_.iconTextOffsetX_ = 0
        drawingInfo_.iconTextOffsetY_ = 0

        if (activeObjectStyle_.IconFunction) {
          const x_ = drawingInfo_.objectData_.Center.x
          const y_ = drawingInfo_.objectData_.Center.y

          this.randomGenerator_.init_seed((Math.round(x_) + 0xaffeaffe) * (Math.round(y_) + 0xaffeaffe))

          const iconName_ = activeObjectStyle_.IconFunction_(drawingInfo_.objectData_, tileInfo_.vms2TileZ_, this.randomGenerator_)

          if (iconName_) {
            let iconUrl_ = iconName_

            if (!/^http.*:\/\//.test(iconName_) && !/^\.\//.test(iconName_)) {
              iconUrl_ = this.options.assetsUrl + '/images/icons/' + iconName_.replace(/file:\/\/[^/]*\//g, '')
            }

            drawingInfo_.iconImage_ = await this._requestImage_(iconUrl_)

            let iconScales_ = [1, 1]

            if (activeObjectStyle_.IconScales != null) {
              iconScales_ = activeObjectStyle_.IconScales
            }

            drawingInfo_.iconMirrorX_ = iconScales_[0] < 0 ? -1 : 1
            drawingInfo_.iconMirrorY_ = iconScales_[1] < 0 ? -1 : 1

            drawingInfo_.iconWidth_ = Math.abs(drawingInfo_.iconImage_.width * iconScales_[0] * objectScale_)
            drawingInfo_.iconHeight_ = Math.abs(drawingInfo_.iconImage_.height * iconScales_[1] * objectScale_)

            // drawingInfo_.iconAngle_ = activeObjectStyle_.IconAngle || 0;
            drawingInfo_.iconAngle_ = drawingInfo_.objectData_.Angle || 0

            const iconImageAnchors_ = [0, 0]

            if (activeObjectStyle_.IconImageAnchors) {
              iconImageAnchors_[0] = activeObjectStyle_.IconImageAnchors[0] * drawingInfo_.iconImage_.width * iconScales_[0] / 2
              iconImageAnchors_[1] = activeObjectStyle_.IconImageAnchors[1] * drawingInfo_.iconImage_.height * iconScales_[1] / 2
            }

            const iconImageOffsets_ = [0, 0]

            if (activeObjectStyle_.IconImageOffsets) {
              iconImageOffsets_[0] = activeObjectStyle_.IconImageOffsets[0] * Math.abs(drawingInfo_.iconImage_.width * iconScales_[0])
              iconImageOffsets_[1] = activeObjectStyle_.IconImageOffsets[1] * Math.abs(drawingInfo_.iconImage_.height * iconScales_[1])
            }

            iconImageOffsets_[0] += iconImageAnchors_[0]
            iconImageOffsets_[1] += iconImageAnchors_[1]

            drawingInfo_.iconImageOffsetX_ = iconImageOffsets_[0] * objectScale_
            drawingInfo_.iconImageOffsetY_ = iconImageOffsets_[1] * objectScale_

            let iconTextOffset_ = [0, 0]

            if (activeObjectStyle_.IconTextOffset) {
              iconTextOffset_ = activeObjectStyle_.IconTextOffset
            }

            drawingInfo_.iconTextOffsetX_ = iconTextOffset_[0] * objectScale_
            drawingInfo_.iconTextOffsetY_ = iconTextOffset_[1] * objectScale_

            let iconMinimumDistance_ = 200

            if (activeObjectStyle_.IconMinimumDistance) {
              iconMinimumDistance_ = activeObjectStyle_.IconMinimumDistance
            }

            drawingInfo_.iconMinimumDistance_ = iconMinimumDistance_ * objectScale_

            drawingInfo_.iconTextPlacement_ = activeObjectStyle_.IconTextPlacement
          }

          drawingInfo_.isIcon_ = true
        }

        if (activeObjectStyle_.TextFunction) {
          if (!activeObjectStyle_.TextFunction_) {
            activeObjectStyle_.TextFunction_ = new Function(
              'ObjectData',
              'MapZoom',
              'RandomGenerator',
              'return ' + activeObjectStyle_.TextFunction.replace(/<tags.([a-z1-9_:]+)>/g, 'ObjectData.tags[\'$1\']').replace(/<([a-z1-9_:]+)>/g, 'ObjectData.$1')
            )
          }

          drawingInfo_.text_ = activeObjectStyle_.TextFunction_(drawingInfo_.objectData_, tileInfo_.vms2TileZ_, this.randomGenerator_)

          drawingInfo_.isText_ = true
        }

        if (activeObjectStyle_.PatternFunction) {
          const patternName_ = activeObjectStyle_.PatternFunction_(drawingInfo_.objectData_, tileInfo_.vms2TileZ_, this.randomGenerator_)

          if (patternName_) {
            const pattern_ = await this._getPattern_(drawingInfo_.context_, patternName_)

            pattern_.transformMatrix = new DOMMatrix().translate(drawingInfo_.mapArea_.left_ * drawingInfo_.mapScale_, drawingInfo_.mapArea_.top_ * drawingInfo_.mapScale_).scale(drawingInfo_.patternScale_)

            pattern_.setTransform(pattern_.transformMatrix)

            drawingInfo_.context_.fillStyle = pattern_

            drawingInfo_.isFilled_ = true
          } else {
            drawingInfo_.isFilled_ = false
          }
        }

        let displacementScale_ = [1, 1]

        if (activeObjectStyle_.DisplacementScale) {
          displacementScale_ = activeObjectStyle_.DisplacementScale
        }

        drawingInfo_.displacementScaleX_ = displacementScale_[0]
        drawingInfo_.displacementScaleY_ = displacementScale_[1]

        if (mapObject_.geometry && (drawingInfo_.isStroked_ || drawingInfo_.isFilled_)) {
          this._drawGeometry_(drawingInfo_, mapObject_.geometry)
        } else if (drawingInfo_.isIcon_ || drawingInfo_.isText_) {
          this._drawIcon_(drawingInfo_, drawingInfo_.objectData_.Center.x, drawingInfo_.objectData_.Center.y)
        }
      }
    }
  },
  _getLayerStyleType_ (layer_) {
    if (layer_.Style) {
      if (layer_.Style.IconFunction || layer_.Style.TextFunction) {
        return 'text'
      } else if (layer_.Filters) {
        for (const filter of layer_.Filters) {
          if (filter.Style && (filter.Style.IconFunction || filter.Style.TextFunction)) {
            return 'text'
          }
        }
      }
    }

    return 'base'
  },
  _requestStyle_: function () {
    return new Promise(resolve => {
      if (this.options.style.Order && Array.isArray(this.options.style.Order)) {
        resolve(this.options.style)
      } else {
        const styleId_ = this.options.style

        if (!globalThis.vms2Context_.styleRequestQueues_[styleId_]) {
          globalThis.vms2Context_.styleRequestQueues_[styleId_] = []
        }

        globalThis.vms2Context_.styleRequestQueues_[styleId_].push(resolve)

        if (globalThis.vms2Context_.styleRequestQueues_[styleId_].length === 1) {
          const url_ = new URL(this.options.styleUrl.replace('{style_id}', styleId_), window.location.origin)

          const parameters_ = new URLSearchParams(url_.search)

          const formBody_ = []

          for (const keyValuePair_ of parameters_.entries()) {
            formBody_.push(encodeURIComponent(keyValuePair_[0]) + '=' + encodeURIComponent(keyValuePair_[1]))
          }

          const options_ = {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formBody_.join('&')
          }

          fetch(url_.origin + url_.pathname, options_)
            .then(response_ => response_.json())
            .then(style_ => {
              this.options.style = style_

              for (const styleRequestResolve of globalThis.vms2Context_.styleRequestQueues_[styleId_]) {
                styleRequestResolve(this.options.style)
              }

              globalThis.vms2Context_.styleRequestQueues_[styleId_] = []
            })
        }
      }
    })
  },
  _drawTile_: function (tileCanvas_, tileInfo_) {
    return new Promise(resolve => {
      this._requestTileDbInfos_()
        .then(() => {
          this._requestStyle_()
            .then(style_ => {
              let mapStyle_ = {}

              if (this.options.styleOverride) {
                for (const key_ in style_) {
                  if (Object.prototype.hasOwnProperty.call(style_, key_)) {
                    mapStyle_[key_] = style_[key_]
                  }
                }

                for (const key_ in this.options.styleOverride) {
                  if (Object.prototype.hasOwnProperty.call(this.options.styleOverride, key_)) {
                    mapStyle_[key_] = this.options.styleOverride[key_]
                  }
                }
              } else {
                mapStyle_ = style_
              }

              if (tileInfo_.drawingContext) {
                tileInfo_.drawingContext.width = tileCanvas_.width
                tileInfo_.drawingContext.height = tileCanvas_.height

                tileCanvas_.context_ = tileInfo_.drawingContext
              }

              tileInfo_.width_ = tileCanvas_.width
              tileInfo_.height_ = tileCanvas_.height

              tileInfo_.mapBounds_ = {}

              if (!isNaN(tileInfo_.x) && !isNaN(tileInfo_.y) && !isNaN(tileInfo_.z)) {
                tileInfo_.mapBounds_.longitudeMin_ = this._tileToLongitude_(tileInfo_.x, tileInfo_.z, this.options.zoomPowerBase)
                tileInfo_.mapBounds_.longitudeMax_ = this._tileToLongitude_(tileInfo_.x + 1, tileInfo_.z, this.options.zoomPowerBase)
                tileInfo_.mapBounds_.latitudeMin_ = this._tileToLatitude_(tileInfo_.y + 1, tileInfo_.z, this.options.zoomPowerBase)
                tileInfo_.mapBounds_.latitudeMax_ = this._tileToLatitude_(tileInfo_.y, tileInfo_.z, this.options.zoomPowerBase)

                tileInfo_.dpi_ = DEFAULT_DISPLAY_DPI_ * tileInfo_.width_ / this.tileSize_
              } else {
                tileInfo_.mapBounds_.longitudeMin_ = tileInfo_.longitudeMin
                tileInfo_.mapBounds_.longitudeMax_ = tileInfo_.longitudeMax
                tileInfo_.mapBounds_.latitudeMin_ = tileInfo_.latitudeMin
                tileInfo_.mapBounds_.latitudeMax_ = tileInfo_.latitudeMax

                const degreesWidth_ = tileInfo_.mapBounds_.longitudeMax_ - tileInfo_.mapBounds_.longitudeMin_

                const normalizedWidth_ = degreesWidth_ / 360
                const normalizedHeight_ = this._latitudeToNormalized_(tileInfo_.mapBounds_.latitudeMin_) - this._latitudeToNormalized_(tileInfo_.mapBounds_.latitudeMax_)

                const normalizedRatio_ = normalizedWidth_ / normalizedHeight_
                const mapRatio_ = tileInfo_.width_ / tileInfo_.height_

                if (mapRatio_ >= normalizedRatio_) {
                  tileInfo_.mapBounds_.longitudeMin_ -= (degreesWidth_ * mapRatio_ / normalizedRatio_ - degreesWidth_) / 2
                  tileInfo_.mapBounds_.longitudeMax_ += (degreesWidth_ * mapRatio_ / normalizedRatio_ - degreesWidth_) / 2
                } else {
                  let normalizedMin_ = this._latitudeToNormalized_(tileInfo_.mapBounds_.latitudeMin_)
                  let normalizedMax_ = this._latitudeToNormalized_(tileInfo_.mapBounds_.latitudeMax_)

                  normalizedMin_ += (normalizedWidth_ / mapRatio_ - normalizedHeight_) / 2
                  normalizedMax_ -= (normalizedWidth_ / mapRatio_ - normalizedHeight_) / 2

                  tileInfo_.mapBounds_.latitudeMin_ = this._normalizedToLatitude_(normalizedMin_)
                  tileInfo_.mapBounds_.latitudeMax_ = this._normalizedToLatitude_(normalizedMax_)
                }

                const tileSize_ = this.tileSize_ * tileInfo_.dpi / DEFAULT_DISPLAY_DPI_

                tileInfo_.z = Math.floor(Math.max(0, Math.log(((tileInfo_.width_ - 1) * 360) / (tileSize_ * (tileInfo_.mapBounds_.longitudeMax_ - tileInfo_.mapBounds_.longitudeMin_))) / Math.log(this.options.zoomPowerBase) + 1))

                tileInfo_.dpi_ = tileInfo_.dpi
              }

              tileInfo_.drawingMapBounds_ = {
                latitudeMin_: this._tileToLatitude_(this._latitudeToTile_(tileInfo_.mapBounds_.latitudeMin_, tileInfo_.z, this.options.zoomPowerBase) + TILE_AREA_DRAWING_EXTENSION_, tileInfo_.z, this.options.zoomPowerBase),
                latitudeMax_: this._tileToLatitude_(this._latitudeToTile_(tileInfo_.mapBounds_.latitudeMax_, tileInfo_.z, this.options.zoomPowerBase) - TILE_AREA_DRAWING_EXTENSION_, tileInfo_.z, this.options.zoomPowerBase),
                longitudeMin_: this._tileToLongitude_(this._longitudeToTile_(tileInfo_.mapBounds_.longitudeMin_, tileInfo_.z, this.options.zoomPowerBase) - TILE_AREA_DRAWING_EXTENSION_, tileInfo_.z, this.options.zoomPowerBase),
                longitudeMax_: this._tileToLongitude_(this._longitudeToTile_(tileInfo_.mapBounds_.longitudeMax_, tileInfo_.z, this.options.zoomPowerBase) + TILE_AREA_DRAWING_EXTENSION_, tileInfo_.z, this.options.zoomPowerBase)
              }

              tileInfo_.saveMapBounds_ = {
                latitudeMin_: this._tileToLatitude_(this._latitudeToTile_(tileInfo_.mapBounds_.latitudeMin_, tileInfo_.z, this.options.zoomPowerBase) + TILE_AREA_SAVE_EXTENSION_, tileInfo_.z, this.options.zoomPowerBase),
                latitudeMax_: this._tileToLatitude_(this._latitudeToTile_(tileInfo_.mapBounds_.latitudeMax_, tileInfo_.z, this.options.zoomPowerBase) - TILE_AREA_SAVE_EXTENSION_, tileInfo_.z, this.options.zoomPowerBase),
                longitudeMin_: this._tileToLongitude_(this._longitudeToTile_(tileInfo_.mapBounds_.longitudeMin_, tileInfo_.z, this.options.zoomPowerBase) - TILE_AREA_SAVE_EXTENSION_, tileInfo_.z, this.options.zoomPowerBase),
                longitudeMax_: this._tileToLongitude_(this._longitudeToTile_(tileInfo_.mapBounds_.longitudeMax_, tileInfo_.z, this.options.zoomPowerBase) + TILE_AREA_SAVE_EXTENSION_, tileInfo_.z, this.options.zoomPowerBase)
              }

              tileInfo_.vms2TileZ_ = Math.log2(Math.pow(this.options.zoomPowerBase, tileInfo_.z) / this.options.mapScale)

              this._getTileLayers_(tileCanvas_, tileInfo_, mapStyle_).then(async tileLayers_ => {
                if (tileCanvas_.isDummy_) {
                  return resolve(tileLayers_)
                }

                if (tileCanvas_.hasBeenRemoved_) {
                  return resolve()
                }

                if (tileCanvas_.hasBeenCreated_) {
                  this.tileCanvases_.push(tileCanvas_)

                  tileCanvas_.hasBeenCreated_ = false
                }

                if (!tileCanvas_.context_) {
                  tileCanvas_.context_ = tileCanvas_.getContext('2d')

                  tileCanvas_.context_.patterns_ = {}

                  tileCanvas_.context_.beginGroup = function (name_) {
                  }

                  tileCanvas_.context_.endGroup = function () {
                  }
                }

                tileCanvas_.context_.clearRect(0, 0, tileCanvas_.width, tileCanvas_.height)

                const mapArea_ = {
                  left_: this._longitudeToMeters_(tileInfo_.mapBounds_.longitudeMin_),
                  right_: this._longitudeToMeters_(tileInfo_.mapBounds_.longitudeMax_),
                  bottom_: this._latitudeToMeters_(tileInfo_.mapBounds_.latitudeMin_),
                  top_: this._latitudeToMeters_(tileInfo_.mapBounds_.latitudeMax_)
                }

                const extendedMapArea_ = {
                  left_: this._longitudeToMeters_(tileInfo_.drawingMapBounds_.longitudeMin_),
                  right_: this._longitudeToMeters_(tileInfo_.drawingMapBounds_.longitudeMax_),
                  bottom_: this._latitudeToMeters_(tileInfo_.drawingMapBounds_.latitudeMin_),
                  top_: this._latitudeToMeters_(tileInfo_.drawingMapBounds_.latitudeMax_)
                }

                const saveDataArea_ = {
                  left_: this._longitudeToMeters_(tileInfo_.saveMapBounds_.longitudeMin_),
                  right_: this._longitudeToMeters_(tileInfo_.saveMapBounds_.longitudeMax_),
                  bottom_: this._latitudeToMeters_(tileInfo_.saveMapBounds_.latitudeMin_),
                  top_: this._latitudeToMeters_(tileInfo_.saveMapBounds_.latitudeMax_)
                }

                const drawingInfo_ = {
                  mapArea_,
                  extendedMapArea_,
                  mapWidth_: tileInfo_.width_,
                  mapHeight_: tileInfo_.height_,

                  userMapScale_: this.options.mapScale,
                  objectScale_: this.options.objectScale * this.options.mapScale,

                  drawingArea_: mapArea_,
                  boundingArea_: mapArea_,

                  mapCanvas_: null,

                  saveDataArea_,
                  saveDataCanvas_: null,

                  workCanvases_: {},

                  iconPositions_: {},

                  patternScale_: tileInfo_.dpi_ * this.options.mapScale / DEFAULT_PRINT_DPI_,
                  mapScale_: tileInfo_.width_ / (mapArea_.right_ - mapArea_.left_),
                  adjustedObjectScale_: Math.abs(tileInfo_.vms2TileZ_ < 6 ? 0.7 : 0.7 / Math.cos(tileInfo_.mapBounds_.latitudeMin_ * Math.PI / 180)),

                  displacementLayers_: {
                    '': {
                      shift_: 26 - Math.round(tileInfo_.vms2TileZ_),
                      regions_: {},
                      allowedMapArea_: null // { left_: mapArea_.left_, right_: mapArea_.right_, top_: mapArea_.top_, bottom_: mapArea_.bottom_ } }
                    }
                  },
                  displacementLayerNames_: [''],

                  saveDataIds_: {},
                  saveDataPixels_: null
                }

                drawingInfo_.mapCanvas_ = tileCanvas_

                if (this.options.allowedMapArea) {
                  if (this.options.allowedMapArea === true) {
                    drawingInfo_.displacementLayers_[''].allowedMapArea_ = drawingInfo_.mapArea_
                  } else {
                    drawingInfo_.displacementLayers_[''].allowedMapArea_ = {
                      left_: this._longitudeToMeters_(this.options.allowedMapArea.longitudeMin),
                      right_: this._longitudeToMeters_(this.options.allowedMapArea.longitudeMax),
                      top_: this._latitudeToMeters_(this.options.allowedMapArea.latitudeMax),
                      bottom_: this._latitudeToMeters_(this.options.allowedMapArea.latitudeMin)
                    }
                  }
                }

                if (this.options.displacementIcons) {
                  const displacementBoxes_ = []

                  for (const displacementIcon_ of this.options.displacementIcons) {
                    const width_ = displacementIcon_.size[0]
                    const height_ = displacementIcon_.size[1]

                    const anchorX_ = displacementIcon_.anchor ? displacementIcon_.anchor[0] : (width_ / 2)
                    const anchorY_ = height_ - (displacementIcon_.anchor ? displacementIcon_.anchor[1] : (height_ / 2))

                    const left_ = this._longitudeToMeters_(displacementIcon_.longitude) - anchorX_ * tileInfo_.width_ / (this.tileSize_ * drawingInfo_.mapScale_)
                    const right_ = this._longitudeToMeters_(displacementIcon_.longitude) + (width_ - anchorX_) * tileInfo_.width_ / (this.tileSize_ * drawingInfo_.mapScale_)
                    const top_ = this._latitudeToMeters_(displacementIcon_.latitude) + (height_ - anchorY_) * tileInfo_.width_ / (this.tileSize_ * drawingInfo_.mapScale_)
                    const bottom_ = this._latitudeToMeters_(displacementIcon_.latitude) - anchorY_ * tileInfo_.width_ / (this.tileSize_ * drawingInfo_.mapScale_)

                    displacementBoxes_.push({ left_, right_, top_, bottom_ })
                  }

                  this._checkAndSetDisplacement_(drawingInfo_.displacementLayers_, drawingInfo_.displacementLayerNames_, displacementBoxes_)
                }

                // Process all style layers.

                for (const layerName_ of mapStyle_.Order) {
                  if (drawingInfo_.mapCanvas_.hasBeenRemoved_) {
                    continue
                  }

                  const layer_ = mapStyle_.Layers[layerName_]

                  const styleType_ = this._getLayerStyleType_(layer_)

                  if (
                    !layer_ ||
                    (this.options.type && this.options.type !== styleType_) ||
                    layer_.Enable === false ||
                    tileInfo_.vms2TileZ_ < (layer_.ZoomRange[0] > 0 ? layer_.ZoomRange[0] + this.options.zoomRangeOffset : 0) ||
                    tileInfo_.vms2TileZ_ >= (layer_.ZoomRange[1] + this.options.zoomRangeOffset)
                  ) {
                    continue
                  }

                  const mapObjects_ = tileLayers_[layerName_] || []

                  // Create grid points.

                  if (layer_.Grid) {
                    drawingInfo_.isGrid_ = true

                    const gridZoomScale_ = 1 / drawingInfo_.userMapScale_ / Math.pow(DEFAULT_DISPLAY_DPI_ * drawingInfo_.mapScale_ / drawingInfo_.userMapScale_ / tileInfo_.dpi_, layer_.Grid.ZoomScale || 1)

                    const gridSize_ = [layer_.Grid.Size[0] * drawingInfo_.objectScale_ * gridZoomScale_, layer_.Grid.Size[1] * drawingInfo_.objectScale_ * gridZoomScale_]

                    const gridOffset_ = [0, 0]

                    if (layer_.Grid.Offset) {
                      gridOffset_[0] = layer_.Grid.Offset[0] * drawingInfo_.objectScale_ * gridZoomScale_
                      gridOffset_[1] = layer_.Grid.Offset[1] * drawingInfo_.objectScale_ * gridZoomScale_
                    }

                    const gridSkew_ = [0, 0]

                    if (layer_.Grid.Skew) {
                      gridSkew_[0] = layer_.Grid.Skew[0] * drawingInfo_.objectScale_ * gridZoomScale_
                      gridSkew_[1] = layer_.Grid.Skew[1] * drawingInfo_.objectScale_ * gridZoomScale_
                    }

                    const randomDistribution_ = [0, 0]

                    if (layer_.Grid.RandomDistribution) {
                      randomDistribution_[0] = layer_.Grid.RandomDistribution[0] * drawingInfo_.objectScale_ * gridZoomScale_
                      randomDistribution_[1] = layer_.Grid.RandomDistribution[1] * drawingInfo_.objectScale_ * gridZoomScale_
                    }

                    const randomAngle_ = [0, 0]

                    if (layer_.Grid.RandomAngle) {
                      randomAngle_[0] = layer_.Grid.RandomAngle[0] * Math.PI * 2
                      randomAngle_[1] = layer_.Grid.RandomAngle[1] * Math.PI * 2
                    }

                    const worldTop_ = this._tileYToMeters_(0, 0)
                    const worldLeft_ = this._tileXToMeters_(0, 0)

                    const gridStartIndexX_ = Math.floor((drawingInfo_.saveDataArea_.left_ - worldLeft_) / gridSize_[0]) - 1
                    let gridIndexY_ = Math.floor((worldTop_ - drawingInfo_.saveDataArea_.top_) / gridSize_[1]) - 1

                    const gridLeft_ = gridStartIndexX_ * gridSize_[0] + worldLeft_
                    const gridRight_ = drawingInfo_.saveDataArea_.right_
                    const gridTop_ = worldTop_ - gridIndexY_ * gridSize_[1]
                    const gridBottom_ = drawingInfo_.saveDataArea_.bottom_

                    const gridPoints_ = []

                    for (let gridY_ = gridTop_; gridY_ >= gridBottom_; gridIndexY_++) {
                      gridY_ = worldTop_ - gridIndexY_ * gridSize_[1]

                      const gridSkewX_ = (gridIndexY_ * gridSkew_[0]) % gridSize_[0]

                      for (let gridX_ = gridLeft_, gridIndexX_ = gridStartIndexX_; gridX_ <= gridRight_; gridIndexX_++) {
                        gridX_ = gridIndexX_ * gridSize_[0] + worldLeft_

                        this.randomGenerator_.init_seed((Math.round(gridIndexX_) + 0xaffeaffe) * (Math.round(gridIndexY_) + 0xaffeaffe))

                        const gridSkewY_ = (gridIndexX_ * gridSkew_[1]) % gridSize_[1]

                        gridPoints_.push({
                          x_: gridX_ + gridSkewX_ + gridOffset_[0] + randomDistribution_[0] * this.randomGenerator_.random(),
                          y_: gridY_ - gridSkewY_ - gridOffset_[1] - randomDistribution_[1] * this.randomGenerator_.random(),
                          angle_: randomAngle_[0] + randomAngle_[1] * this.randomGenerator_.random()
                        })
                      }
                    }

                    gridPoints_.sort((a, b) => { return (b.y_ - a.y_) })

                    for (const gridPoint_ of gridPoints_) {
                      const center_ = {}

                      center_.x = gridPoint_.x_
                      center_.y = gridPoint_.y_

                      const envelope_ = {}

                      envelope_.left = envelope_.right = gridPoint_.x_
                      envelope_.bottom = envelope_.top = gridPoint_.y_

                      const objectInfo_ = { Center: center_, Envelope: envelope_, Angle: gridPoint_.angle_ }

                      mapObjects_.push({ info: objectInfo_, geometry: null })
                    }
                  } else {
                    drawingInfo_.isGrid_ = false
                  }

                  // Sort map objects.

                  if (layer_.SortFunction) {
                    const sortFunction_ = new Function('a', 'b', 'return (' + layer_.SortFunction + ')')

                    mapObjects_.sort((a, b) => {
                      if (a && b) {
                        return sortFunction_(a.info, b.info)
                      } else {
                        return 0
                      }
                    })
                  }

                  // Draw objects on all defined canvases.

                  const layerCanvasNames_ = [''] // layer_.CanvasNames || [ '' ];

                  if (layer_.Save) {
                    layerCanvasNames_.push('save')
                  }

                  for (const layerCanvasName_ of layerCanvasNames_) {
                    if (layerCanvasName_ === 'save') {
                      if (!drawingInfo_.saveDataCanvas_) {
                        let saveDataCanvas_ = null

                        for (const canvas_ of this.saveDataCanvases_) {
                          if (!canvas_.inUse) {
                            saveDataCanvas_ = canvas_

                            break
                          }
                        }

                        if (!drawingInfo_.mapCanvas_.isTile || !saveDataCanvas_) {
                          saveDataCanvas_ = document.createElement('canvas')

                          saveDataCanvas_.width = drawingInfo_.mapCanvas_.width * (1 + 2 * TILE_AREA_SAVE_EXTENSION_)
                          saveDataCanvas_.height = drawingInfo_.mapCanvas_.height * (1 + 2 * TILE_AREA_SAVE_EXTENSION_)

                          saveDataCanvas_.context_ = saveDataCanvas_.getContext('2d', { willReadFrequently: true })

                          saveDataCanvas_.context_.patterns_ = {}

                          saveDataCanvas_.context_.beginGroup = function (name_) {
                          }

                          saveDataCanvas_.context_.endGroup = function () {
                          }

                          this.saveDataCanvases_.push(saveDataCanvas_)
                        }

                        saveDataCanvas_.context_.clearRect(0, 0, saveDataCanvas_.width, saveDataCanvas_.height)

                        saveDataCanvas_.inUse = true

                        drawingInfo_.saveDataCanvas_ = saveDataCanvas_
                      }

                      drawingInfo_.context_ = drawingInfo_.saveDataCanvas_.context_

                      drawingInfo_.drawingArea_ = drawingInfo_.saveDataArea_
                    } else {
                      drawingInfo_.context_ = drawingInfo_.mapCanvas_.context_

                      drawingInfo_.drawingArea_ = drawingInfo_.mapArea_
                    }

                    if (layerCanvasName_ !== 'save' && !layer_.Style && !layer_.Filters) {
                      continue
                    }

                    if (layer_.needsAreaExtension_) {
                      drawingInfo_.boundingArea_ = drawingInfo_.extendedMapArea_
                    } else {
                      drawingInfo_.boundingArea_ = drawingInfo_.mapArea_
                    }

                    // Canvas preparation.

                    drawingInfo_.context_.beginGroup(layerName_)

                    drawingInfo_.context_.setTransform(new DOMMatrix())

                    drawingInfo_.context_.globalCompositeOperation = layer_.CompositeOperation || 'source-over'
                    drawingInfo_.context_.filter = layer_.CanvasFilter || 'none'

                    drawingInfo_.context_.fillStyle = '#00000000'
                    drawingInfo_.context_.strokeStyle = '#00000000'
                    drawingInfo_.context_.lineWidth = 0
                    drawingInfo_.context_.setLineDash([])
                    drawingInfo_.context_.textAlign = 'center'
                    drawingInfo_.context_.textBaseline = 'middle'

                    drawingInfo_.tileBoundingBox_ = null

                    // Draw map objects.

                    if (layerCanvasName_ === 'save') {
                      layer_.layerName_ = layerName_

                      await this._drawSaveLayer_(drawingInfo_, mapObjects_, tileInfo_, layer_)

                      drawingInfo_.saveDataPixels_ = null // Invalidate pixels
                    } else if (styleType_ === 'text') {
                      await this._drawObjectsLayer_(drawingInfo_, mapObjects_, tileInfo_, layer_)
                    } else {
                      await this._drawBaseLayer_(drawingInfo_, mapObjects_, tileInfo_, layer_)
                    }

                    if (drawingInfo_.isGrid_) { // TODO!
                      drawingInfo_.displacementLayers_[''].regions_ = {}
                    }

                    drawingInfo_.context_.endGroup()
                  }
                }

                if (drawingInfo_.saveDataCanvas_) {
                  drawingInfo_.saveDataCanvas_.inUse = false
                }

                drawingInfo_.context_ = drawingInfo_.mapCanvas_.context_

                // Fill water areas.

                drawingInfo_.context_.beginGroup('background')

                drawingInfo_.context_.setTransform(new DOMMatrix())

                drawingInfo_.context_.globalCompositeOperation = 'destination-over'

                if (this.options.type !== 'text') {
                  if (mapStyle_.BackgroundPatternFunction) {
                    if (!mapStyle_.BackgroundPatternFunction_) {
                      mapStyle_.BackgroundPatternFunction_ = new Function(
                        'ObjectData',
                        'MapZoom',
                        'RandomGenerator',
                        'return ' + mapStyle_.BackgroundPatternFunction.replace(/<tags.([a-z1-9_:]+)>/g, 'ObjectData.tags[\'$1\']').replace(/<([a-z1-9_:]+)>/g, 'ObjectData.$1')
                      )
                    }

                    const patternName_ = mapStyle_.BackgroundPatternFunction_(null, tileInfo_.vms2TileZ_, this.randomGenerator_)

                    if (patternName_) {
                      const pattern_ = await this._getPattern_(drawingInfo_.context_, patternName_)

                      pattern_.transformMatrix = new DOMMatrix().translate(drawingInfo_.mapArea_.left_ * drawingInfo_.mapScale_, drawingInfo_.mapArea_.top_ * drawingInfo_.mapScale_).scale(drawingInfo_.patternScale_)

                      pattern_.setTransform(pattern_.transformMatrix)

                      drawingInfo_.context_.fillStyle = pattern_
                      drawingInfo_.context_.fillRect(0, 0, tileInfo_.width_, tileInfo_.height_)
                    }
                  } else {
                    if (isNaN(mapStyle_.BackgroundAlpha)) {
                      mapStyle_.BackgroundAlpha = 1
                    }

                    drawingInfo_.context_.fillStyle = '#' + this._hexify32_([mapStyle_.BackgroundColor[0], mapStyle_.BackgroundColor[1], mapStyle_.BackgroundColor[2], Math.round(mapStyle_.BackgroundAlpha * 255)])
                    drawingInfo_.context_.fillRect(0, 0, tileInfo_.width_, tileInfo_.height_)
                  }
                }

                drawingInfo_.context_.endGroup()

                drawingInfo_.mapCanvas_.inUse_ = false

                resolve()
              })
            })
        })
    })
  },
  _getCachedTile_: function (layerId_, x_, y_, z_, tileLayer_) {
    let detailZooms_ = [0, 0, 2, 2, 4, 4, 6, 6, 8, 8, 10, 10, 12, 12, 14]

    switch (layerId_) {
      case 'terrain':
      case 'depth':
        detailZooms_ = [0, 0, 2, 2, 4, 4, 6, 6, 8, 8, 10, 10, 12, 12, 12]

        break

      case 'bathymetry':
      case 'blue_marble':
      case 'elevation':
        detailZooms_ = [0, 0, 2, 2, 4, 4, 6, 6, 8, 8, 10, 10, 10, 10, 10]

        break
    }

    let detailZoom_ = detailZooms_[Math.max(Math.min(z_, 14), 0)]

    const ids_ = layerId_.split('|')

    if (!(ids_.length === 1 || ids_[2] !== 'Points')) {
      detailZoom_ = 14
    }

    const tileWeight_ = Math.pow(4, 16 - z_)
    let matchingTilesWeight_ = 0

    const layerMap_ = globalThis.vms2Context_.tileCacheLayerMaps_[layerId_]

    if (layerMap_) {
      for (const keyValuePair_ of layerMap_) {
        if (keyValuePair_[1].detailZoom_ !== detailZoom_) {
          continue
        }

        const deltaZ_ = keyValuePair_[1].z_ - z_

        let tileCoordinateDoMatch_ = false

        if (deltaZ_ >= 0) {
          tileCoordinateDoMatch_ = (keyValuePair_[1].x_ >> deltaZ_) === x_ && (keyValuePair_[1].y_ >> deltaZ_) === y_
        } else {
          tileCoordinateDoMatch_ = (x_ >> -deltaZ_) === keyValuePair_[1].x_ && (y_ >> -deltaZ_) === keyValuePair_[1].y_
        }

        if (tileCoordinateDoMatch_) {
          if (!tileLayer_.tileIds_.includes(keyValuePair_[0])) {
            tileLayer_.objects = tileLayer_.objects.concat(keyValuePair_[1].objects_)

            tileLayer_.tileIds_.push(keyValuePair_[0])
          }

          matchingTilesWeight_ += Math.pow(4, 16 - keyValuePair_[1].z_)

          if (matchingTilesWeight_ >= tileWeight_) {
            return true
          }
        }
      }
    }

    return false
  },
  _processTileLayerRequests_: async function (tileLayerRequestInfo_) {
    if (!tileLayerRequestInfo_.requestInProcess_) {
      tileLayerRequestInfo_.requestInProcess_ = true

      while (tileLayerRequestInfo_.tileInfos_.length > 0) {
        const tileInfo_ = tileLayerRequestInfo_.tileInfos_.shift()

        const dataLayerId_ = tileInfo_.tileLayerData_.dataLayerId_

        const x_ = tileInfo_.x
        const y_ = tileInfo_.y
        const z_ = Math.floor(tileInfo_.z)

        const tileLayerData_ = tileInfo_.tileLayerData_

        if (!tileLayerData_.tileCanvas_.hasBeenRemoved_) {
          await this._requestTile_(dataLayerId_, x_, y_, z_, tileLayerData_)
        }

        tileLayerData_.tileCount_--

        if (tileLayerData_.tileCount_ === 0) {
          tileLayerData_.resolve()
        }
      }

      tileLayerRequestInfo_.requestInProcess_ = false
    }
  },
  _getTileLayer_: function (tileLayerData_) {
    return new Promise((resolve, reject) => {
      tileLayerData_.resolve = resolve
      tileLayerData_.reject = reject

      let fetchTileZ_ = Math.round(tileLayerData_.tileInfo_.vms2TileZ_)

      fetchTileZ_ += Math.max(-fetchTileZ_, (tileLayerData_.layerStyle_.Detail || 0) + this.options.detailOffset)

      let fetchTileStartX_ = Math.floor(this._longitudeToTile_(tileLayerData_.tileInfo_.mapBounds_.longitudeMin_, fetchTileZ_))
      let fetchTileEndX = Math.floor(this._longitudeToTile_(tileLayerData_.tileInfo_.mapBounds_.longitudeMax_, fetchTileZ_))
      let fetchTileStartY_ = Math.floor(this._latitudeToTile_(tileLayerData_.tileInfo_.mapBounds_.latitudeMax_, fetchTileZ_))
      let fetchTileEndY_ = Math.floor(this._latitudeToTile_(tileLayerData_.tileInfo_.mapBounds_.latitudeMin_, fetchTileZ_))

      if (!isNaN(tileLayerData_.tileInfo_.x) && !isNaN(tileLayerData_.tileInfo_.y) && !isNaN(tileLayerData_.tileInfo_.z)) {
        if (tileLayerData_.layerStyle_.needsAreaExtension_) {
          fetchTileStartX_ = Math.floor(this._longitudeToTile_(tileLayerData_.tileInfo_.drawingMapBounds_.longitudeMin_, fetchTileZ_))
          fetchTileEndX = Math.floor(this._longitudeToTile_(tileLayerData_.tileInfo_.drawingMapBounds_.longitudeMax_, fetchTileZ_))
          fetchTileStartY_ = Math.floor(this._latitudeToTile_(tileLayerData_.tileInfo_.drawingMapBounds_.latitudeMax_, fetchTileZ_))
          fetchTileEndY_ = Math.floor(this._latitudeToTile_(tileLayerData_.tileInfo_.drawingMapBounds_.latitudeMin_, fetchTileZ_))
        }
      }

      if (!globalThis.vms2Context_.tileLayerRequestInfos_[tileLayerData_.dataLayerId_]) {
        globalThis.vms2Context_.tileLayerRequestInfos_[tileLayerData_.dataLayerId_] = { requestInProcess_: false, tileInfos_: [] }
      }

      const tileLayerRequestInfo_ = globalThis.vms2Context_.tileLayerRequestInfos_[tileLayerData_.dataLayerId_]

      for (let fetchTileY_ = fetchTileStartY_; fetchTileY_ <= fetchTileEndY_; fetchTileY_++) {
        for (let fetchTileX_ = fetchTileStartX_; fetchTileX_ <= fetchTileEndX; fetchTileX_++) {
          tileLayerRequestInfo_.tileInfos_.push({ x: fetchTileX_, y: fetchTileY_, z: fetchTileZ_, tileLayerData_ })

          tileLayerData_.tileCount_++
        }
      }

      this._processTileLayerRequests_(tileLayerRequestInfo_)
    })
  },
  _preparePolygon_: function (drawingInfo_, geometry_, dataOffset_, polygons_) {
    const polygonRings_ = []

    dataOffset_ += 4

    const numberOfRings_ = geometry_.getUint32(dataOffset_, true)
    dataOffset_ += 4

    for (let ringIndex_ = 0; ringIndex_ < numberOfRings_; ringIndex_++) {
      const polygonPoints_ = []

      const numberOfPoints_ = geometry_.getUint32(dataOffset_, true)
      dataOffset_ += 4

      for (let pointIndex_ = 0; pointIndex_ < numberOfPoints_; pointIndex_++) {
        const x_ = geometry_.getFloat32(dataOffset_, true)
        dataOffset_ += 4

        const y_ = geometry_.getFloat32(dataOffset_, true)
        dataOffset_ += 4

        polygonPoints_.push({ x: x_, y: y_ })
      }

      polygonRings_.push(polygonPoints_)
    }

    polygons_.push(polygonRings_)

    return dataOffset_
  },
  _requestFontFace_: function (style_) {
    return new Promise(resolve => {
      let fontName_ = style_.FontFamily.replace(/ /g, '') + '.ttf'
      let fontStyle_ = 'normal'
      let fontWeight_ = 'normal'

      if (style_.FontSpecs) {
        fontName_ = style_.FontSpecs[0]

        if (style_.FontSpecs[1] === 'bold') {
          fontWeight_ = style_.FontSpecs[1]
        } else if (style_.FontSpecs[2]) {
          fontStyle_ = style_.FontSpecs[1]
        }
      }

      if (globalThis.vms2Context_.fontFaceCache_[fontName_]) {
        if (globalThis.vms2Context_.fontFaceCache_[fontName_].isLoading_) {
          globalThis.vms2Context_.fontFaceCache_[fontName_].resolveFunctions_.push(resolve)
        } else {
          resolve()
        }

        return
      }

      const font_ = new FontFace(style_.FontFamily, 'url(\'' + this.options.assetsUrl + '/fonts/' + fontName_ + '\')', { style: fontStyle_, weight: fontWeight_ })

      font_.load().then(() => {
        document.fonts.add(font_)

        globalThis.vms2Context_.fontFaceCache_[fontName_].isLoading_ = false

        for (const resolveFunction_ of globalThis.vms2Context_.fontFaceCache_[fontName_].resolveFunctions_) {
          if (resolveFunction_) {
            resolveFunction_()
          }
        }
      }).catch(exception_ => {
        // console.log(exception_);

        for (const resolveFunction_ of globalThis.vms2Context_.fontFaceCache_[fontName_].resolveFunctions_) {
          if (resolveFunction_) {
            resolveFunction_()
          }
        }
      })

      globalThis.vms2Context_.fontFaceCache_[fontName_] = { isLoading_: true, resolveFunctions_: [resolve] }
    })
  },
  _requestImage_: function (imageUrlString_) {
    return new Promise((resolve, reject) => {
      const imageCache_ = globalThis.vms2Context_.imageCache_

      if (imageCache_[imageUrlString_]) {
        if (imageCache_[imageUrlString_].isLoading_) {
          imageCache_[imageUrlString_].resolveFunctions_.push(resolve)
        } else {
          resolve(imageCache_[imageUrlString_].image_)
        }

        return
      }

      const image_ = new Image()

      image_.crossOrigin = 'anonymous'
      image_.onerror = reject

      const imageUrl_ = new URL(imageUrlString_, window.location.origin)

      if (imageUrl_.search) {
        fetch(imageUrlString_)
          .then(response_ => response_.text())
          .then(svgImage_ => {
            image_.onload = () => {
              imageCache_[imageUrlString_].isLoading_ = false

              for (const resolveFunction_ of imageCache_[imageUrlString_].resolveFunctions_) {
                if (resolveFunction_) {
                  resolveFunction_(image_)
                }
              }
            }

            svgImage_ = svgImage_.replace('fill:#FFFFFF;', 'fill:#FF00FF;')

            image_.src = `data:image/svg+xml;base64,${btoa(svgImage_)}`
          })
      } else {
        image_.onload = () => {
          imageCache_[imageUrlString_].isLoading_ = false

          for (const resolveFunction_ of imageCache_[imageUrlString_].resolveFunctions_) {
            if (resolveFunction_) {
              resolveFunction_(image_)
            }
          }
        }

        image_.src = imageUrlString_
      }

      imageCache_[imageUrlString_] = { isLoading_: true, resolveFunctions_: [resolve], image_ }
    })
  },
  _setVoidTileArea_ (x_, y_, z_) {
    const tileLeft_ = x_ << (16 - z_)
    const tileRight_ = (x_ + 1) << (16 - z_)
    const tileTop_ = y_ << (16 - z_)
    const tileBottom_ = (y_ + 1) << (16 - z_)

    const voidTileAreas_ = []

    voidTileAreas_.push({ tileLeft_, tileRight_, tileTop_, tileBottom_ })

    for (const voidTileArea_ of this.voidTileAreas_) {
      if (voidTileArea_.tileLeft_ >= tileLeft_ &&
                voidTileArea_.tileRight_ <= tileRight_ &&
                voidTileArea_.tileTop_ >= tileTop_ &&
                voidTileArea_.tileBottom_ <= tileBottom_) {
        continue
      }

      voidTileAreas_.push(voidTileArea_)
    }

    this.voidTileAreas_ = voidTileAreas_
  },
  _checkVoidTileAreas_ (x_, y_, z_) {
    const tileLeft_ = x_ << (16 - z_)
    const tileRight_ = (x_ + 1) << (16 - z_)
    const tileTop_ = y_ << (16 - z_)
    const tileBottom_ = (y_ + 1) << (16 - z_)

    for (const voidTileArea_ of this.voidTileAreas_) {
      if (tileLeft_ >= voidTileArea_.tileLeft_ &&
                tileRight_ <= voidTileArea_.tileRight_ &&
                tileTop_ >= voidTileArea_.tileTop_ &&
                tileBottom_ <= voidTileArea_.tileBottom_) {
        return true
      }
    }

    return false
  },
  _requestTileDbInfos_: function () {
    return new Promise(resolve => {
      this.tileDbInfos_ = [] // Fixme!

      if (this.tileDbInfos_) {
        resolve(this.tileDbInfos_)
      } else {
        const resolves_ = this.tileDbInfosResolves_

        resolves_.push(resolve)

        if (resolves_.length === 1) {
          const tileDbInfosUrlParts_ = this.options.tileUrl.split('?')

          fetch(new URL(tileDbInfosUrlParts_[0], window.location.origin))
            .then(response_ => response_.json())
            .then(tileDbInfos_ => {
              this.tileDbInfos_ = tileDbInfos_

              while (resolves_.length > 0) {
                resolves_.shift()()
              }
            })
        }
      }
    })
  },
  _requestTile_: function (dataLayerId_, x_, y_, z_, tileLayerData_) {
    return new Promise(resolve => {
      if (!this.allSystemsGo_) {
        return resolve()
      }

      x_ &= ((1 << z_) - 1)
      y_ &= ((1 << z_) - 1)

      const tileLatitudeMin_ = this._tileToLatitude_(y_ + 1, z_)
      const tileLatitudeMax_ = this._tileToLatitude_(y_, z_)
      const tileLongitudeMin_ = this._tileToLongitude_(x_, z_)
      const tileLongitudeMax_ = this._tileToLongitude_(x_ + 1, z_)

      for (const tileDbInfo_ of this.tileDbInfos_) {
        if (tileDbInfo_.infos.length > 0) {
          const boundingBox = tileDbInfo_.infos[0].bounding_box

          if (tileLatitudeMin_ >= boundingBox.latitude_min &&
                        tileLatitudeMax_ <= boundingBox.latitude_max &&
                        tileLongitudeMin_ >= boundingBox.longitude_min &&
                        tileLongitudeMax_ <= boundingBox.longitude_max) {
            if (tileDbInfo_.infos[0].max_detail_zoom < 14 && tileDbInfo_.infos[0].max_detail_zoom < z_) {
              x_ >>= ((z_ & ~1) - tileDbInfo_.infos[0].max_detail_zoom)
              y_ >>= ((z_ & ~1) - tileDbInfo_.infos[0].max_detail_zoom)
              z_ = tileDbInfo_.infos[0].max_detail_zoom | (z_ & 1)
            }

            break
          }
        }
      }

      if (this._getCachedTile_(dataLayerId_, x_, y_, z_, tileLayerData_)) {
        return resolve()
      }

      let tileUrl_ = this.options.tileUrl

      tileUrl_ = tileUrl_.replace('{x}', x_)
      tileUrl_ = tileUrl_.replace('{y}', y_)
      tileUrl_ = tileUrl_.replace('{z}', z_)

      const idParts_ = dataLayerId_.split('|')

      if (idParts_.length > 0) {
        tileUrl_ = tileUrl_.replace('{key}', idParts_[0])

        if (idParts_.length > 1) {
          tileUrl_ = tileUrl_.replace('{value}', idParts_[1])

          if (idParts_.length > 2) {
            tileUrl_ = tileUrl_.replace('{type}', idParts_[2])
          }
        }
      }

      tileUrl_ = tileUrl_.replace('{key}', '').replace('{value}', '').replace('{type}', '')

      tileLayerData_.tileCanvas_.abortController_ = new AbortController()

      fetch(new URL(tileUrl_, window.location.origin), { signal: tileLayerData_.tileCanvas_.abortController_.signal })
        .then(response_ => {
          if (!response_.ok) {
            throw new Error({
              code: response_.status,
              message: response_.statusText,
              response: response_
            })
          }

          this.numberOfRequestedTiles++

          return response_.arrayBuffer()
        })
        .then(rawData_ => {
          if (tileLayerData_.tileCanvas_.hasBeenRemoved_) {
            return resolve()
          }

          if (rawData_.byteLength <= 4) {
            this._setVoidTileArea_(x_, y_, z_)

            return resolve()
          }

          const decodeData_ = { lId: dataLayerId_, datas: [] }

          const rawDataDataView_ = new DataView(rawData_)
          let rawDataOffset_ = 0

          let tileCount_ = rawDataDataView_.getUint32(rawDataOffset_, true)
          rawDataOffset_ += 4

          while (tileCount_ > 0) {
            const tileX_ = rawDataDataView_.getUint32(rawDataOffset_, true)
            rawDataOffset_ += 4

            const tileY_ = rawDataDataView_.getUint32(rawDataOffset_, true)
            rawDataOffset_ += 4

            const tileZ_ = rawDataDataView_.getUint32(rawDataOffset_, true)
            rawDataOffset_ += 4

            const detailZoom_ = rawDataDataView_.getUint32(rawDataOffset_, true)
            rawDataOffset_ += 4

            const dataSize_ = rawDataDataView_.getUint32(rawDataOffset_, true)
            rawDataOffset_ += 4

            decodeData_.datas.push({
              x: tileX_,
              y: tileY_,
              z: tileZ_,
              dZ: detailZoom_,
              cD: this.options.disableDecode === true ? new DataView(new ArrayBuffer()) : rawData_.slice(rawDataOffset_, rawDataOffset_ + dataSize_)
            })

            rawDataOffset_ += dataSize_

            tileCount_--
          }

          const decodeFunction_ = () => {
            for (const decodeWorker_ of globalThis.vms2Context_.decodeWorkers_) {
              if (!decodeWorker_.resolveFunction_) {
                const decodeEntry_ = globalThis.vms2Context_.decodeQueue_.shift()

                if (decodeEntry_.tileLayerData_.tileCanvas_.hasBeenRemoved_) {
                  decodeEntry_.resolve()
                } else {
                  decodeWorker_.postMessage(decodeEntry_.decodeData_)

                  decodeWorker_.resolveFunction_ = () => {
                    this._getCachedTile_(decodeEntry_.dataLayerId_, decodeEntry_.x_, decodeEntry_.y_, decodeEntry_.z_, decodeEntry_.tileLayerData_)

                    globalThis.vms2Context_.decodeWorkersRunning_--

                    decodeEntry_.resolve()

                    if (globalThis.vms2Context_.decodeQueue_.length > 0) {
                      decodeFunction_()
                    }
                  }

                  globalThis.vms2Context_.decodeWorkersRunning_++
                }

                return
              }
            }
          }

          globalThis.vms2Context_.decodeQueue_.push({ dataLayerId_, x_, y_, z_, tileLayerData_, decodeData_, resolve })

          decodeFunction_()
        })
        .catch(error_ => {
          if (error_.code === 20) {
            resolve()
          } else {
            throw error_
          }
        })
    })
  },
  _skipPolygon_: function (geometry_, dataOffset_) {
    dataOffset_ += 4

    const numberOfRings_ = geometry_.getUint32(dataOffset_, true)
    dataOffset_ += 4

    for (let ringIndex_ = 0; ringIndex_ < numberOfRings_; ringIndex_++) {
      dataOffset_ += 4 + geometry_.getUint32(dataOffset_, true) * 4 * 2
    }

    return dataOffset_
  },
  _latitudeToMeters_: function (latitude_) {
    return Math.log(Math.tan((90 + latitude_) * Math.PI / 360)) * EARTH_EQUATORIAL_RADIUS_METERS_
  },
  _longitudeToMeters_: function (longitude_) {
    return longitude_ * EARTH_EQUATORIAL_RADIUS_METERS_ * Math.PI / 180
  },
  _latitudeToTile_: function (latitude_, z_, base_ = DEFAULT_ZOOM_POWER_BASE) {
    return (Math.log(Math.tan((90 - latitude_) * Math.PI / 360)) / (2 * Math.PI) + 0.5) * Math.pow(base_, z_)
  },
  _longitudeToTile_: function (longitude_, z_, base_ = DEFAULT_ZOOM_POWER_BASE) {
    return (longitude_ + 180) * Math.pow(base_, z_) / 360
  },
  _tileToLatitude_: function (y_, z_, base_ = DEFAULT_ZOOM_POWER_BASE) {
    return 90 - Math.atan(Math.exp((y_ / Math.pow(base_, z_) - 0.5) * 2 * Math.PI)) * 360 / Math.PI
  },
  _tileToLongitude_: function (x_, z_, base_ = DEFAULT_ZOOM_POWER_BASE) {
    return x_ * 360 / Math.pow(base_, z_) - 180
  },
  _tileXToMeters_: function (x_, z_, base_ = DEFAULT_ZOOM_POWER_BASE) {
    return (x_ / Math.pow(base_, z_) - 0.5) * EARTH_EQUATORIAL_CIRCUMFERENCE_METERS_
  },
  _tileYToMeters_: function (y_, z_, base_ = DEFAULT_ZOOM_POWER_BASE) {
    return (0.5 - y_ / Math.pow(base_, z_)) * EARTH_EQUATORIAL_CIRCUMFERENCE_METERS_
  },
  _latitudeToNormalized_: function (latitude_) {
    return Math.log(Math.tan((90 - latitude_) * Math.PI / 360)) / (2 * Math.PI) + 0.5
  },
  _longitudeToNormalized_: function (longitude_) {
    return (longitude_ + 180) / 360
  },
  _normalizedToLatitude_: function (y_) {
    return 90 - Math.atan(Math.exp((y_ - 0.5) * 2 * Math.PI)) * 360 / Math.PI
  },
  _normalizedToLongitude_: function (x_) {
    return x_ * 360 - 180
  },
  _hexify8_ (value_) {
    return ('00' + value_.toString(16)).slice(-2)
  },
  _hexify16_ (values_) {
    return ('0000' + ((values_[0] << 8) + values_[1]).toString(16)).slice(-4)
  },
  _hexify24_ (values_) {
    return ('000000' + ((values_[0] << 16) + (values_[1] << 8) + values_[2]).toString(16)).slice(-6)
  },
  _hexify32_ (values_) {
    return this._hexify24_(values_) + this._hexify8_(values_[3])
  },
  _getWorkerURL_ (url_) {
    const content_ = `importScripts("${url_}");`

    return URL.createObjectURL(new Blob([content_], { type: 'text/javascript' }))
  },
  async _getPattern_ (context_, patternName_) {
    if (!globalThis.vms2Context_.patternCache_[patternName_]) {
      let patternUrl_ = patternName_

      if (!patternName_.includes('http://') && !patternName_.includes('https://')) {
        patternUrl_ = this.options.assetsUrl + '/images/patterns/' + patternName_.replace(/file:\/\/[^/]*\//g, '')
      }

      const patternImage_ = await this._requestImage_(patternUrl_)

      globalThis.vms2Context_.patternCache_[patternName_] = context_.createPattern(patternImage_, 'repeat')

      globalThis.vms2Context_.patternCache_[patternName_].patternImage = patternImage_
    }

    return globalThis.vms2Context_.patternCache_[patternName_]
  },
  _remapPixels_ (pixels_, saveDataIds_, width_) {
    let lastValidRed_ = 0
    let lastValidGreen_ = 0
    let lastValidBlue_ = 0

    let lastValidColorDistance_ = 0

    for (let index_ = 0; index_ < pixels_.length; index_ += 4) {
      const alpha_ = pixels_[index_ + 2]

      if (alpha_ > 0) {
        let red_ = pixels_[index_]
        let green_ = pixels_[index_ + 1]
        let blue_ = pixels_[index_ + 2]

        if (saveDataIds_[(red_ << 16) + (green_ << 8) + blue_]) {
          lastValidRed_ = red_
          lastValidGreen_ = green_
          lastValidBlue_ = blue_

          lastValidColorDistance_ = 0
        } else {
          pixels_[index_] = lastValidRed_
          pixels_[index_ + 1] = lastValidGreen_
          pixels_[index_ + 2] = lastValidBlue_

          lastValidColorDistance_++

          if (lastValidColorDistance_ > 10 && index_ > width_ * 4) {
            red_ = pixels_[index_ - width_ * 4]
            green_ = pixels_[index_ - width_ * 4 + 1]
            blue_ = pixels_[index_ - width_ * 4 + 2]

            if (saveDataIds_[(red_ << 16) + (green_ << 8) + blue_]) {
              pixels_[index_] = red_
              pixels_[index_ + 1] = green_
              pixels_[index_ + 2] = blue_
            }
          }
        }
      }
    }
  }
})

L.gridLayer.vms2 = function (options_) {
  return new L.GridLayer.VMS2(options_)
}
