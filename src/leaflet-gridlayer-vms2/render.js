/* eslint-disable no-new-func, no-underscore-dangle */
/* global DOMMatrix */

import {
  DEFAULT_PRINT_DPI,
  TILE_AREA_DRAWING_EXTENSION,
  TILE_AREA_SAVE_EXTENSION
} from './constants.js'
import { getLayerStyleType, shouldProcessLayer } from './layer-data.js'
import {
  hasTileRequestChanged,
  isTileCanvasStale,
  trimSaveDataCanvasPool
} from './tile-requests.js'

const IDENTITY = new DOMMatrix()

function buildMergedMapStyle (style, styleOverride) {
  if (!styleOverride) {
    return style
  }

  const mapStyle = {}

  for (const key in style) {
    if (Object.hasOwn(style, key)) {
      mapStyle[key] = style[key]
    }
  }

  for (const key in styleOverride) {
    if (Object.hasOwn(styleOverride, key)) {
      mapStyle[key] = styleOverride[key]
    }
  }

  return mapStyle
}

function ensureCanvasContext (tileCanvas) {
  if (tileCanvas.context) {
    return tileCanvas.context
  }

  tileCanvas.context = tileCanvas.getContext('2d')
  tileCanvas.context.patterns = {}

  tileCanvas.context.beginGroup = function (id) {
    if (id === 'clipRect') {
      tileCanvas.context.save()
    }
  }

  tileCanvas.context.endGroup = function (id) {
    if (id === 'clipRect') {
      tileCanvas.context.restore()
    }
  }

  tileCanvas.context.clipRect = function (x, y, width, height) {
    tileCanvas.context.beginPath()
    tileCanvas.context.rect(x, y, width, height)
    tileCanvas.context.clip()
  }

  return tileCanvas.context
}

function buildAreaFromBounds (layer, bounds) {
  return {
    left: layer._longitudeToMeters(bounds.longitudeMin),
    right: layer._longitudeToMeters(bounds.longitudeMax),
    bottom: layer._latitudeToMeters(bounds.latitudeMin),
    top: layer._latitudeToMeters(bounds.latitudeMax)
  }
}

function createDrawingInfo (layer, tileCanvas, tileInfo, userMapScale) {
  const mapArea = buildAreaFromBounds(layer, tileInfo.mapBounds)
  const extendedMapArea = buildAreaFromBounds(layer, tileInfo.drawingMapBounds)
  const saveDataArea = buildAreaFromBounds(layer, tileInfo.saveMapBounds)

  return {
    mapArea,
    extendedMapArea,
    mapWidth_: tileInfo.width,
    mapHeight: tileInfo.height,

    userMapScale,
    objectScale: layer.options.objectScale * userMapScale * Math.pow(2, -layer.options.zoomOffset),

    drawingArea: mapArea,
    boundingArea: mapArea,

    mapCanvas: tileCanvas,

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
        allowedMapArea: null
      }
    },
    displacementLayerNames: [''],

    saveDataIds: {},
    saveDataPixels: null
  }
}

function getOrCreateSaveDataCanvas (layer, drawingInfo) {
  if (drawingInfo.saveDataCanvas) {
    return drawingInfo.saveDataCanvas
  }

  let saveDataCanvas = null

  for (const canvas of layer.saveDataCanvases) {
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
    saveDataCanvas.context.beginGroup = function () {}
    saveDataCanvas.context.endGroup = function () {}

    layer.saveDataCanvases.push(saveDataCanvas)
  }

  saveDataCanvas.context.clearRect(0, 0, saveDataCanvas.width, saveDataCanvas.height)
  saveDataCanvas.inUse = true

  drawingInfo.saveDataCanvas = saveDataCanvas

  return saveDataCanvas
}

function addDisplacementIcons (layer, drawingInfo, tileInfo) {
  if (!layer.options.displacementIcons) {
    return
  }

  const displacementBoxes = []

  for (const displacementIcon of layer.options.displacementIcons) {
    const width = displacementIcon.size[0]
    const height = displacementIcon.size[1]

    const anchorX = displacementIcon.anchor ? displacementIcon.anchor[0] : (width / 2)
    const anchorY = height - (displacementIcon.anchor ? displacementIcon.anchor[1] : (height / 2))

    const left = layer._longitudeToMeters(displacementIcon.longitude) - anchorX * tileInfo.width / (layer.tileSize * drawingInfo.scale)
    const right = layer._longitudeToMeters(displacementIcon.longitude) + (width - anchorX) * tileInfo.width / (layer.tileSize * drawingInfo.scale)
    const top = layer._latitudeToMeters(displacementIcon.latitude) + (height - anchorY) * tileInfo.width / (layer.tileSize * drawingInfo.scale)
    const bottom = layer._latitudeToMeters(displacementIcon.latitude) - anchorY * tileInfo.width / (layer.tileSize * drawingInfo.scale)

    displacementBoxes.push({ left, right, top, bottom })
  }

  layer._checkAndSetDisplacement(drawingInfo.displacementLayers, drawingInfo.displacementLayerNames, displacementBoxes)
}

function appendGridPoints (layer, drawingInfo, tileInfo, styleLayer, mapObjects) {
  const gridZoomScale = 1 / drawingInfo.userMapScale /
    Math.pow(DEFAULT_PRINT_DPI * drawingInfo.scale / drawingInfo.userMapScale / tileInfo.dpi, styleLayer.Grid.ZoomScale || 1)

  const gridSize = [
    styleLayer.Grid.Size[0] * drawingInfo.objectScale * gridZoomScale,
    styleLayer.Grid.Size[1] * drawingInfo.objectScale * gridZoomScale
  ]

  const gridOffset = [0, 0]

  if (styleLayer.Grid.Offset) {
    gridOffset[0] = styleLayer.Grid.Offset[0] * drawingInfo.objectScale * gridZoomScale
    gridOffset[1] = styleLayer.Grid.Offset[1] * drawingInfo.objectScale * gridZoomScale
  }

  const gridSkew = [0, 0]

  if (styleLayer.Grid.Skew) {
    gridSkew[0] = styleLayer.Grid.Skew[0] * drawingInfo.objectScale * gridZoomScale
    gridSkew[1] = styleLayer.Grid.Skew[1] * drawingInfo.objectScale * gridZoomScale
  }

  const randomDistribution = [0, 0]

  if (styleLayer.Grid.RandomDistribution) {
    randomDistribution[0] = styleLayer.Grid.RandomDistribution[0] * drawingInfo.objectScale * gridZoomScale
    randomDistribution[1] = styleLayer.Grid.RandomDistribution[1] * drawingInfo.objectScale * gridZoomScale
  }

  const randomAngle = [0, 0]

  if (styleLayer.Grid.RandomAngle) {
    randomAngle[0] = styleLayer.Grid.RandomAngle[0] * Math.PI * 2
    randomAngle[1] = styleLayer.Grid.RandomAngle[1] * Math.PI * 2
  }

  const worldTop = layer._tileYToMeters(0, 0)
  const worldLeft = layer._tileXToMeters(0, 0)

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

      layer.randomGenerator.init_seed((Math.round(gridIndexX) + 0xaffeaffe) * (Math.round(gridIndexY) + 0xaffeaffe))

      const gridSkewY = (gridIndexX * gridSkew[1]) % gridSize[1]

      gridPoints.push({
        x: gridX + gridSkewX + gridOffset[0] + randomDistribution[0] * layer.randomGenerator.random(),
        y: gridY - gridSkewY - gridOffset[1] - randomDistribution[1] * layer.randomGenerator.random(),
        angle: randomAngle[0] + randomAngle[1] * layer.randomGenerator.random()
      })
    }
  }

  gridPoints.sort((a, b) => { return (b.y - a.y) })

  for (const gridPoint of gridPoints) {
    const center = { x: gridPoint.x, y: gridPoint.y }
    const envelope = {
      left: gridPoint.x,
      right: gridPoint.x,
      bottom: gridPoint.y,
      top: gridPoint.y
    }

    const objectInfo = { Center: center, Envelope: envelope, Angle: gridPoint.angle }

    mapObjects.push({ info: objectInfo, geometry: null })
  }
}

const renderMethods = {
  _drawTile: async function (tileCanvas, tileInfo) {
    let drawingInfo = null
    let clipRectStarted = false

    try {
      await this._requestTileDbInfos()

      const style = await this._requestStyle()
      const mapStyle = buildMergedMapStyle(style, this.options.styleOverride)

      if (tileInfo.drawingContext) {
        tileInfo.drawingContext.width = tileCanvas.width
        tileInfo.drawingContext.height = tileCanvas.height

        tileCanvas.context = tileInfo.drawingContext
      }

      tileInfo.width = tileCanvas.width
      tileInfo.height = tileCanvas.height

      const userMapScale = (tileInfo.mapScale ?? this.printMapScale ?? this.options.mapScale) * Math.pow(2, this.options.zoomOffset)

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

      if (tileInfo.drawingContext) {
        tileInfo.drawingContext.dpi = tileInfo.dpi
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

      const tileLayers = await this._getTileLayers(tileCanvas, tileInfo, mapStyle)

      if (tileCanvas.isDummy) {
        return tileLayers
      }

      if (isTileCanvasStale(tileCanvas, tileInfo.requestId)) {
        return
      }

      if (tileCanvas.hasBeenCreated) {
        this.tileCanvases.push(tileCanvas)
        tileCanvas.hasBeenCreated = false
      }

      ensureCanvasContext(tileCanvas)

      drawingInfo = createDrawingInfo(this, tileCanvas, tileInfo, userMapScale)

      tileCanvas.context.beginGroup('clipRect')
      clipRectStarted = true

      tileCanvas.context.clipRect(
        (this._longitudeToMeters(-180.01) - drawingInfo.mapArea.left) * drawingInfo.scale,
        0,
        (this._longitudeToMeters(180.01) - this._longitudeToMeters(-180)) * drawingInfo.scale,
        tileInfo.height
      )

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

      addDisplacementIcons(this, drawingInfo, tileInfo)

      for (const layerName of mapStyle.Order) {
        if (isTileCanvasStale(drawingInfo.mapCanvas, tileInfo.requestId)) {
          break
        }

        const layer = mapStyle.Layers[layerName]
        let styleType = getLayerStyleType(layer)

        if (!shouldProcessLayer(layer, tileInfo, this.options, styleType)) {
          continue
        }

        const mapObjects = tileLayers[layerName] || []

        if (layer.Grid) {
          drawingInfo.isGrid = true
          appendGridPoints(this, drawingInfo, tileInfo, layer, mapObjects)
          styleType = 'text'
        } else {
          drawingInfo.isGrid = false
        }

        if (layer.SortFunction) {
          if (typeof layer._compiledSortFunction !== 'function') {
            layer._compiledSortFunction = new Function('a', 'b', 'return (' + layer.SortFunction + ')')
          }

          mapObjects.sort((a, b) => {
            if (a && b) {
              return layer._compiledSortFunction(a.info, b.info)
            }

            return 0
          })
        }

        const layerCanvasNames = ['']

        if (layer.Save) {
          layerCanvasNames.push('save')
        }

        for (const layerCanvasName of layerCanvasNames) {
          if (layerCanvasName === 'save') {
            getOrCreateSaveDataCanvas(this, drawingInfo)

            drawingInfo.context = drawingInfo.saveDataCanvas.context
            drawingInfo.drawingArea = drawingInfo.saveDataArea
          } else {
            drawingInfo.context = drawingInfo.mapCanvas.context
            drawingInfo.drawingArea = drawingInfo.mapArea
          }

          if (layerCanvasName !== 'save' && !layer.Style && !layer.Filters) {
            continue
          }

          drawingInfo.boundingArea = layer.needsAreaExtension ? drawingInfo.extendedMapArea : drawingInfo.mapArea

          drawingInfo.context.beginGroup(layerName)
          drawingInfo.context.setTransform(IDENTITY)
          drawingInfo.context.globalCompositeOperation = layer.CompositeOperation || 'source-over'
          drawingInfo.context.filter = layer.CanvasFilter || 'none'
          drawingInfo.context.textAlign = 'center'
          drawingInfo.context.textBaseline = 'middle'
          drawingInfo.tileBoundingBox = null

          if (layerCanvasName === 'save') {
            layer.layerName = layerName

            await this._drawSaveLayer(drawingInfo, mapObjects, tileInfo, layer)

            drawingInfo.saveDataPixels = null
          } else if (styleType === 'text') {
            await this._drawObjectsLayer(drawingInfo, mapObjects, tileInfo, layer)
          } else {
            await this._drawBaseLayer(drawingInfo, mapObjects, tileInfo, layer)
          }

          if (drawingInfo.isGrid) {
            drawingInfo.displacementLayers[''].regions = {}
          }

          drawingInfo.context.endGroup()

          if (isTileCanvasStale(drawingInfo.mapCanvas, tileInfo.requestId)) {
            break
          }
        }
      }

      if (drawingInfo.saveDataCanvas) {
        drawingInfo.saveDataCanvas.inUse = false
      }

      drawingInfo.context = drawingInfo.mapCanvas.context

      drawingInfo.context.beginGroup('background')
      drawingInfo.context.setTransform(IDENTITY)
      drawingInfo.context.globalCompositeOperation = 'destination-over'

      if (this.options.type !== 'text') {
        if (mapStyle.BackgroundPatternFunction) {
          if (typeof mapStyle.BackgroundPatternFunction === 'string') {
            mapStyle.BackgroundPatternFunction = new Function(
              'ObjectData',
              'MapZoom',
              'RandomGenerator',
              'return ' + mapStyle.BackgroundPatternFunction
                .replace(/<tags.([a-z1-9_:]+)>/g, 'ObjectData.tags[\'$1\']')
                .replace(/<([a-z1-9_:]+)>/g, 'ObjectData.$1')
            )
          }

          const patternName = mapStyle.BackgroundPatternFunction(null, tileInfo.vms2TileZ, this.randomGenerator)

          if (patternName) {
            const pattern = await this._getPattern(drawingInfo.context, patternName)

            pattern.transformMatrix = new DOMMatrix()
              .scale(drawingInfo.patternScale)
              .translate(
                -drawingInfo.mapArea.left * drawingInfo.scale / drawingInfo.patternScale,
                -drawingInfo.mapArea.top * drawingInfo.scale / drawingInfo.patternScale
              )

            pattern.setTransform(pattern.transformMatrix)

            drawingInfo.context.fillStyle = pattern
            drawingInfo.context.fillRect(0, 0, tileInfo.width, tileInfo.height)
          }
        } else {
          if (typeof mapStyle.BackgroundAlpha !== 'number') {
            mapStyle.BackgroundAlpha = 1
          }

          drawingInfo.context.fillStyle = '#' + this._hexify32([
            mapStyle.BackgroundColor[0],
            mapStyle.BackgroundColor[1],
            mapStyle.BackgroundColor[2],
            Math.round(mapStyle.BackgroundAlpha * 255)
          ])
          drawingInfo.context.fillRect(0, 0, tileInfo.width, tileInfo.height)
        }
      }

      drawingInfo.context.endGroup()

      if (!hasTileRequestChanged(drawingInfo.mapCanvas, tileInfo.requestId)) {
        drawingInfo.mapCanvas.inUse = false
      }

      tileCanvas.context.endGroup('clipRect')
      clipRectStarted = false
    } finally {
      if (drawingInfo && drawingInfo.saveDataCanvas) {
        drawingInfo.saveDataCanvas.inUse = false
        drawingInfo.saveDataPixels = null
      }

      if (!hasTileRequestChanged(tileCanvas, tileInfo.requestId)) {
        tileCanvas.inUse = false
      }

      if (this.saveDataCanvases) {
        trimSaveDataCanvasPool(this)
      }

      if (clipRectStarted && tileCanvas.context) {
        try {
          tileCanvas.context.endGroup('clipRect')
        } catch (error) {
          console.warn('Failed to close tile clip group', error)
        }
      }
    }
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
}

export default renderMethods
