/* eslint-disable no-underscore-dangle */
/* global DOMMatrix */

import { DEFAULT_PRINT_DPI } from './constants.js'
import { compileObjectDataExpression } from './style-expression.js'

function ensureCompiledObjectDataFunction (objectStyle, propertyName) {
  if (typeof objectStyle?.[propertyName] === 'string') {
    objectStyle[propertyName] = compileObjectDataExpression(objectStyle[propertyName])
  }

  return objectStyle?.[propertyName]
}

function ensureCompiledFilterConditions (layerStyle) {
  if (!Array.isArray(layerStyle?.Filters) || layerStyle._compiledFilterConditions === layerStyle.Filters) {
    return
  }

  // Compile filter predicates once per layer so the object loop only invokes them.
  for (const filter of layerStyle.Filters) {
    ensureCompiledObjectDataFunction(filter, 'Condition')
  }

  layerStyle._compiledFilterConditions = layerStyle.Filters
}

function ensureMapObjectType (mapObject) {
  if (!mapObject.type) {
    if (typeof mapObject.info.length === 'number') {
      mapObject.type = 'line'
    } else if (mapObject.geometry === null) {
      mapObject.type = 'point'
    } else {
      mapObject.type = 'polygon'
    }
  }
}

function isMapObjectVisible (mapObject, boundingArea) {
  return !(
    mapObject.info.Envelope.left > boundingArea.right ||
    mapObject.info.Envelope.right < boundingArea.left ||
    mapObject.info.Envelope.bottom > boundingArea.top ||
    mapObject.info.Envelope.top < boundingArea.bottom
  )
}

function applyPaintStyle (layer, drawingInfo, objectStyle, objectScale) {
  if (typeof objectStyle.FillAlpha !== 'number') {
    objectStyle.FillAlpha = 1
  }

  if (objectStyle.FillAlpha && objectStyle.FillColor) {
    drawingInfo.context.fillStyle = '#' + layer._hexify32([
      objectStyle.FillColor[0],
      objectStyle.FillColor[1],
      objectStyle.FillColor[2],
      Math.round(objectStyle.FillAlpha * 255)
    ])

    drawingInfo.isFilled = true
  } else {
    drawingInfo.isFilled = false
  }

  if (typeof objectStyle.StrokeAlpha !== 'number') {
    objectStyle.StrokeAlpha = 1
  }

  if (typeof objectStyle.StrokeWidth === 'number') {
    drawingInfo.context.lineWidth = objectStyle.StrokeWidth * (
      objectStyle.DisplayUnit === 'px'
        ? 1
        : objectScale * drawingInfo.scale * drawingInfo.adjustedObjectScale
    )
  }

  if (objectStyle.StrokeAlpha && objectStyle.StrokeWidth > 0 && objectStyle.StrokeColor) {
    drawingInfo.context.strokeStyle = '#' + layer._hexify32([
      objectStyle.StrokeColor[0],
      objectStyle.StrokeColor[1],
      objectStyle.StrokeColor[2],
      Math.round(objectStyle.StrokeAlpha * 255)
    ])

    drawingInfo.isStroked = true
  } else {
    drawingInfo.isStroked = false
  }

  if (!drawingInfo.isStroked) {
    return
  }

  if (objectStyle.LineDash) {
    const lineDash = []

    for (const dash of objectStyle.LineDash) {
      lineDash.push(dash * (objectStyle.DisplayUnit === 'px' ? 1 : objectScale * drawingInfo.scale))
    }

    drawingInfo.context.setLineDash(lineDash)
  } else {
    drawingInfo.context.setLineDash([])
  }

  drawingInfo.context.lineCap = objectStyle.LineCap || 'round'
  drawingInfo.context.lineJoin = objectStyle.LineJoin || 'round'
}

async function applyPatternFill (layer, drawingInfo, objectStyle, tileInfo) {
  const patternFunction = ensureCompiledObjectDataFunction(objectStyle, 'PatternFunction')

  if (typeof patternFunction !== 'function') {
    return
  }

  const patternName = patternFunction(drawingInfo.objectData, tileInfo.vms2TileZ, layer.randomGenerator)

  if (patternName) {
    const pattern = await layer._getPattern(drawingInfo.context, patternName)

    pattern.transformMatrix = new DOMMatrix()
      .scale(drawingInfo.patternScale)
      .translate(
        -drawingInfo.mapArea.left * drawingInfo.scale / drawingInfo.patternScale,
        -drawingInfo.mapArea.top * drawingInfo.scale / drawingInfo.patternScale
      )

    pattern.setTransform(pattern.transformMatrix)

    drawingInfo.context.fillStyle = pattern
    drawingInfo.isFilled = true
  } else {
    drawingInfo.isFilled = false
  }
}

function resolveFilterObjectData (layer, drawingInfo, mapObject) {
  let objectData = mapObject.info

  if (drawingInfo.isGrid && drawingInfo.saveDataCanvas) {
    if (!drawingInfo.saveDataPixels) {
      drawingInfo.saveDataPixels = drawingInfo.saveDataCanvas.context
        .getImageData(0, 0, drawingInfo.saveDataCanvas.width, drawingInfo.saveDataCanvas.height)
        .data

      layer._remapPixels(
        drawingInfo.saveDataPixels,
        drawingInfo.saveDataIds,
        drawingInfo.saveDataCanvas.width
      )
    }

    const x = objectData.Center.x
    const y = objectData.Center.y

    const pixelX = Math.round((x - drawingInfo.saveDataArea.left) * drawingInfo.scale)
    const pixelY = Math.round((drawingInfo.saveDataArea.top - y) * drawingInfo.scale)

    if (
      pixelX >= 0 && pixelX < drawingInfo.saveDataCanvas.width &&
      pixelY >= 0 && pixelY < drawingInfo.saveDataCanvas.height
    ) {
      const pixelIndex = (pixelX + pixelY * drawingInfo.saveDataCanvas.width) * 4

      const red = drawingInfo.saveDataPixels[pixelIndex]
      const green = drawingInfo.saveDataPixels[pixelIndex + 1]
      const blue = drawingInfo.saveDataPixels[pixelIndex + 2]

      objectData = drawingInfo.saveDataIds[(red << 16) + (green << 8) + blue]
    } else {
      return { skip: true }
    }
  }

  return { objectData }
}

function resolveObjectStyle (layer, drawingInfo, tileInfo, layerStyle, mapObject) {
  let objectStyle = layerStyle.Style
  let objectData = drawingInfo.objectData

  if (!layerStyle.Filters) {
    return { objectStyle, objectData }
  }

  const centerX = objectData.Center.x
  const centerY = objectData.Center.y

  layer.randomGenerator.init_seed((Math.round(centerX) + 0xaffeaffe) * (Math.round(centerY) + 0xaffeaffe))

  const filterObjectData = resolveFilterObjectData(layer, drawingInfo, mapObject)

  if (filterObjectData.skip) {
    return filterObjectData
  }

  objectData = filterObjectData.objectData

  if (objectData) {
    for (const filter of layerStyle.Filters) {
      if (filter.Enable === false) {
        continue
      }

      const condition = filter.Condition

      if (typeof condition === 'function' && condition(objectData, tileInfo.vms2TileZ, layer.randomGenerator)) {
        objectStyle = filter.Style
        break
      }
    }
  }

  return { objectStyle, objectData }
}

async function applyFontStyle (layer, drawingInfo, objectStyle, objectScale) {
  if (!(objectStyle.FontFamily && objectStyle.FontSize != null)) {
    return
  }

  await layer._requestFontFace(objectStyle)

  drawingInfo.fontSize = objectStyle.FontSize * objectScale

  let fontStyle = 'normal'

  if (objectStyle.FontStyle) {
    fontStyle = objectStyle.FontStyle
  }

  drawingInfo.context.font = fontStyle + ' ' + (drawingInfo.fontSize * drawingInfo.scale) + 'px \'' + objectStyle.FontFamily + '\''
  drawingInfo.fontStyle = fontStyle
  drawingInfo.fontFamily = objectStyle.FontFamily
}

const styleRenderingMethods = {
  _drawSaveLayer: async function (drawingInfo, mapObjects, tileInfo, layer) {
    drawingInfo.isFilled = true

    const saveStyle = layer.Save

    let objectScale = drawingInfo.objectScale

    if (typeof saveStyle.ZoomScale === 'number') {
      objectScale = drawingInfo.objectScale /
        drawingInfo.userMapScale /
        Math.pow(DEFAULT_PRINT_DPI * drawingInfo.scale / drawingInfo.userMapScale / tileInfo.dpi, saveStyle.ZoomScale)
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

      if (mapObject.geometry === undefined) {
        drawingInfo.tileBoundingBox = mapObject.info
        continue
      }

      if (mapObject.tileBounds !== undefined) {
        drawingInfo.tileBoundingBox = mapObject.tileBounds
      }

      if (!isMapObjectVisible(mapObject, drawingInfo.boundingArea)) {
        continue
      }

      mapObject.info.locr_layer = layer.layerName

      ensureMapObjectType(mapObject)

      drawingInfo.objectData = mapObject.info

      this.randomGenerator.init_seed(drawingInfo.objectData.Hash)

      const randomColor = this.randomGenerator.random_int() & 0xffffff

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
        objectScale = drawingInfo.objectScale /
          drawingInfo.userMapScale /
          Math.pow(DEFAULT_PRINT_DPI * drawingInfo.scale / drawingInfo.userMapScale / tileInfo.dpi, objectStyle.ZoomScale)
      }

      applyPaintStyle(this, drawingInfo, objectStyle, objectScale)
      await applyPatternFill(this, drawingInfo, objectStyle, tileInfo)

      for (const mapObject of mapObjects) {
        if (!mapObject) {
          continue
        }

        if (mapObject.geometry === undefined) {
          drawingInfo.tileBoundingBox = mapObject.info
          continue
        }

        if (mapObject.tileBounds !== undefined) {
          drawingInfo.tileBoundingBox = mapObject.tileBounds
        }

        if (!isMapObjectVisible(mapObject, drawingInfo.boundingArea)) {
          continue
        }

        ensureMapObjectType(mapObject)

        drawingInfo.objectData = mapObject.info

        if (mapObject.geometry && (drawingInfo.isStroked || drawingInfo.isFilled)) {
          this._drawGeometry(drawingInfo, mapObject.geometry)
        }
      }

      return
    }

    let activeObjectStyle = null

    ensureCompiledFilterConditions(layer)

    for (const mapObject of mapObjects) {
      if (!mapObject) {
        continue
      }

      if (mapObject.geometry === undefined) {
        drawingInfo.tileBoundingBox = mapObject.info
        continue
      }

      if (mapObject.tileBounds !== undefined) {
        drawingInfo.tileBoundingBox = mapObject.tileBounds
      }

      if (!isMapObjectVisible(mapObject, drawingInfo.boundingArea)) {
        continue
      }

      ensureMapObjectType(mapObject)

      drawingInfo.objectData = mapObject.info

      const resolvedStyle = resolveObjectStyle(this, drawingInfo, tileInfo, layer, mapObject)

      if (resolvedStyle.skip || !resolvedStyle.objectStyle) {
        continue
      }

      drawingInfo.objectData = resolvedStyle.objectData

      let objectScale = drawingInfo.objectScale

      if (typeof resolvedStyle.objectStyle.ZoomScale === 'number') {
        objectScale = drawingInfo.objectScale /
          drawingInfo.userMapScale /
          Math.pow(DEFAULT_PRINT_DPI * drawingInfo.scale / drawingInfo.userMapScale / tileInfo.dpi, resolvedStyle.objectStyle.ZoomScale)
      }

      if (activeObjectStyle !== resolvedStyle.objectStyle) {
        applyPaintStyle(this, drawingInfo, resolvedStyle.objectStyle, objectScale)
        activeObjectStyle = resolvedStyle.objectStyle
      }

      drawingInfo.isIcon = false
      drawingInfo.iconImage = null
      drawingInfo.iconWidth = 0
      drawingInfo.iconHeight = 0

      await applyPatternFill(this, drawingInfo, activeObjectStyle, tileInfo)

      if (mapObject.geometry && (drawingInfo.isStroked || drawingInfo.isFilled)) {
        this._drawGeometry(drawingInfo, mapObject.geometry)
      } else if (drawingInfo.isIcon) {
        this._drawIcon(drawingInfo, mapObject.info.Center.x, mapObject.info.Center.y)
      }
    }
  },

  _drawObjectsLayer: async function (drawingInfo, mapObjects, tileInfo, layer) {
    let activeObjectStyle = null

    ensureCompiledFilterConditions(layer)

    for (const mapObject of mapObjects) {
      if (!mapObject) {
        continue
      }

      if (mapObject.geometry === undefined) {
        drawingInfo.tileBoundingBox = mapObject.info
        continue
      }

      if (mapObject.tileBounds !== undefined) {
        drawingInfo.tileBoundingBox = mapObject.tileBounds
      }

      if (!isMapObjectVisible(mapObject, drawingInfo.boundingArea)) {
        continue
      }

      ensureMapObjectType(mapObject)

      drawingInfo.objectData = mapObject.info

      const resolvedStyle = resolveObjectStyle(this, drawingInfo, tileInfo, layer, mapObject)

      if (resolvedStyle.skip || !resolvedStyle.objectStyle) {
        continue
      }

      drawingInfo.objectData = resolvedStyle.objectData

      let objectScale = drawingInfo.objectScale

      if (typeof resolvedStyle.objectStyle.ZoomScale === 'number') {
        objectScale = drawingInfo.objectScale /
          drawingInfo.userMapScale /
          Math.pow(DEFAULT_PRINT_DPI * drawingInfo.scale / drawingInfo.userMapScale / tileInfo.dpi, resolvedStyle.objectStyle.ZoomScale)
      }

      if (activeObjectStyle !== resolvedStyle.objectStyle) {
        applyPaintStyle(this, drawingInfo, resolvedStyle.objectStyle, objectScale)
        await applyFontStyle(this, drawingInfo, resolvedStyle.objectStyle, objectScale)

        ensureCompiledObjectDataFunction(resolvedStyle.objectStyle, 'IconFunction')
        ensureCompiledObjectDataFunction(resolvedStyle.objectStyle, 'PatternFunction')

        activeObjectStyle = resolvedStyle.objectStyle
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

          const iconScales = activeObjectStyle.IconScales != null
            ? [activeObjectStyle.IconScales[0], activeObjectStyle.IconScales[1]]
            : [1, 1]

          drawingInfo.iconMirrorX = iconScales[0] < 0 ? -1 : 1
          drawingInfo.iconMirrorY = iconScales[1] < 0 ? -1 : 1

          drawingInfo.iconWidth = Math.abs(drawingInfo.iconImage.width * iconScales[0]) *
            (resolvedStyle.objectStyle.DisplayUnit === 'px' ? 1 / drawingInfo.scale : objectScale)
          drawingInfo.iconHeight = Math.abs(drawingInfo.iconImage.height * iconScales[1]) *
            (resolvedStyle.objectStyle.DisplayUnit === 'px' ? 1 / drawingInfo.scale : objectScale)

          drawingInfo.iconAngle = drawingInfo.objectData.Angle || 0

          const iconImageAnchor = [0, 0]

          if (activeObjectStyle.IconImageAnchor) {
            iconImageAnchor[0] = resolvedStyle.objectStyle.DisplayUnit === 'px'
              ? (activeObjectStyle.IconImageAnchor[0] - drawingInfo.iconImage.width / 2) / drawingInfo.scale
              : (activeObjectStyle.IconImageAnchor[0] - 0.5) * Math.abs(drawingInfo.iconImage.width * iconScales[0]) * objectScale
            iconImageAnchor[1] = resolvedStyle.objectStyle.DisplayUnit === 'px'
              ? (activeObjectStyle.IconImageAnchor[1] - drawingInfo.iconImage.height / 2) / drawingInfo.scale
              : (activeObjectStyle.IconImageAnchor[1] - 0.5) * Math.abs(drawingInfo.iconImage.height * iconScales[1]) * objectScale
          }

          const iconImageOffsets = [0, 0]

          if (activeObjectStyle.IconImageOffsets) {
            iconImageOffsets[0] = activeObjectStyle.IconImageOffsets[0] * (
              resolvedStyle.objectStyle.DisplayUnit === 'px'
                ? 1 / drawingInfo.scale
                : Math.abs(drawingInfo.iconImage.width * iconScales[0]) * objectScale
            )
            iconImageOffsets[1] = activeObjectStyle.IconImageOffsets[1] * (
              resolvedStyle.objectStyle.DisplayUnit === 'px'
                ? 1 / drawingInfo.scale
                : Math.abs(drawingInfo.iconImage.height * iconScales[1]) * objectScale
            )
          }

          drawingInfo.iconImageOffsetX = iconImageOffsets[0] - iconImageAnchor[0]
          drawingInfo.iconImageOffsetY = iconImageOffsets[1] - iconImageAnchor[1]

          const iconTextOffset = [0, 0]

          if (activeObjectStyle.IconTextOffset) {
            iconTextOffset[0] = activeObjectStyle.IconTextOffset[0] * (
              resolvedStyle.objectStyle.DisplayUnit === 'px'
                ? 1 / drawingInfo.scale
                : objectScale
            )
            iconTextOffset[1] = activeObjectStyle.IconTextOffset[1] * (
              resolvedStyle.objectStyle.DisplayUnit === 'px'
                ? 1 / drawingInfo.scale
                : objectScale
            )
          }

          drawingInfo.iconTextOffsetX = iconTextOffset[0]
          drawingInfo.iconTextOffsetY = iconTextOffset[1]

          let iconMinimumDistance = 200

          if (activeObjectStyle.IconMinimumDistance) {
            iconMinimumDistance = activeObjectStyle.IconMinimumDistance
          }

          drawingInfo.iconMinimumDistance = iconMinimumDistance * (
            resolvedStyle.objectStyle.DisplayUnit === 'px'
              ? 1 / drawingInfo.scale
              : objectScale
          )

          drawingInfo.iconTextPlacement = activeObjectStyle.IconTextPlacement
        }

        drawingInfo.isIcon = true
      }

      ensureCompiledObjectDataFunction(activeObjectStyle, 'TextFunction')

      if (typeof activeObjectStyle.TextFunction === 'function') {
        drawingInfo.text = activeObjectStyle.TextFunction(drawingInfo.objectData, tileInfo.vms2TileZ, this.randomGenerator)
        drawingInfo.isText = true
      }

      await applyPatternFill(this, drawingInfo, activeObjectStyle, tileInfo)

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
}

export default styleRenderingMethods
