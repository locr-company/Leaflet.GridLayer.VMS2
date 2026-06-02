/* global DOMMatrix */

import unicodeDataTable from '../unicode.js'

const geometryMethods = {
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
            ) {
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
            ) {
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
            ) {
              continue
            }

            return false
          }
        }

        if (
          displacementLayer.regions[bottomRightHash] &&
          bottomRightHash !== topLeftHash &&
          bottomRightHash !== topRightHash &&
          bottomRightHash !== bottomLeftHash
        ) {
          for (const hashedBox of displacementLayer.regions[bottomRightHash]) {
            if (
              box.left > hashedBox.right ||
              box.right < hashedBox.left ||
              box.bottom > hashedBox.top ||
              box.top < hashedBox.bottom
            ) {
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
      case 1:
        dataOffset = this._drawPoint(drawingInfo, geometry, dataOffset)
        break

      case 2:
        dataOffset = this._drawLineString(drawingInfo, geometry, dataOffset)
        break

      case 3:
        if (drawingInfo.isIcon || drawingInfo.isText) {
          this._drawIcon(drawingInfo, drawingInfo.objectData.Center.x, drawingInfo.objectData.Center.y)
          dataOffset = this._skipPolygon(geometry, dataOffset)
        } else {
          const polygons = []
          dataOffset = this._preparePolygon(drawingInfo, geometry, dataOffset, polygons)
          this._drawPolygons(drawingInfo, polygons)
        }
        break

      case 4:
        break

      case 5:
        {
          dataOffset += 4

          const numberOfLineStrings = geometry.getUint32(dataOffset, true)
          dataOffset += 4

          for (let lineStringIndex = 0; lineStringIndex < numberOfLineStrings; lineStringIndex++) {
            dataOffset = this._drawLineString(drawingInfo, geometry, dataOffset)
          }
        }
        break

      case 6:
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

      case 7:
        {
          dataOffset += 4

          const numberOfGeometries = geometry.getUint32(dataOffset, true)
          dataOffset += 4

          for (let geometryIndex = 0; geometryIndex < numberOfGeometries; geometryIndex++) {
            dataOffset = this._drawGeometry(drawingInfo, geometry, dataOffset)
          }
        }
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
        const textAndIconBoxes = [textDisplacementBox]

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

            if (!(iconLeft > drawingInfo.mapArea.right || iconRight < drawingInfo.mapArea.left || iconTop < drawingInfo.mapArea.bottom || iconBottom > drawingInfo.mapArea.top)) {
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
            if (!(textDisplacementBox.left > drawingInfo.mapArea.right || textDisplacementBox.right < drawingInfo.mapArea.left || textDisplacementBox.top < drawingInfo.mapArea.bottom || textDisplacementBox.bottom > drawingInfo.mapArea.top)) {
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
    } else if (drawingInfo.isIcon && drawingInfo.iconImage) {
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
        ) {
          if (drawingInfo.iconAngle !== 0) {
            drawingInfo.context.save()

            try {
              drawingInfo.context.setTransform(
                new DOMMatrix()
                  .translate((x - drawingInfo.drawingArea.left) * drawingInfo.scale, (drawingInfo.drawingArea.top - y) * drawingInfo.scale)
                  .rotate(drawingInfo.iconAngle * 180 / Math.PI)
              )

              drawingInfo.context.drawImage(
                drawingInfo.iconImage,
                iconX * drawingInfo.scale,
                iconY * drawingInfo.scale,
                drawingInfo.iconWidth * drawingInfo.iconMirrorX * drawingInfo.scale,
                drawingInfo.iconHeight * drawingInfo.iconMirrorY * drawingInfo.scale
              )
            } finally {
              drawingInfo.context.restore()
            }
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
  },

  _drawLineString: function (drawingInfo, geometry, dataOffset) {
    dataOffset += 4

    const numberOfPoints = geometry.getUint32(dataOffset, true)
    dataOffset += 4

    if (numberOfPoints === 0) {
      return dataOffset
    }

    if (drawingInfo.isIcon && drawingInfo.iconImage) {
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
    } else if (drawingInfo.isText && drawingInfo.text) {
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

        if (globalThis.vms2Context.fontCharacterWidths[drawingInfo.fontFamily][drawingInfo.fontStyle][character] === undefined) {
          globalThis.vms2Context.fontCharacterContext.font = drawingInfo.fontStyle + ' 100px \'' + drawingInfo.fontFamily + '\''
          globalThis.vms2Context.fontCharacterWidths[drawingInfo.fontFamily][drawingInfo.fontStyle][character] =
            globalThis.vms2Context.fontCharacterContext.measureText(character).width
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
            const characterWidth =
              globalThis.vms2Context.fontCharacterWidths[drawingInfo.fontFamily][drawingInfo.fontStyle][character] *
              drawingInfo.fontSize / 100

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

              if (!(left > drawingInfo.mapArea.right || right < drawingInfo.mapArea.left || top < drawingInfo.mapArea.bottom || bottom > drawingInfo.mapArea.top)) {
                textIsVisible = true
              }
            }
          }

          if (this._checkAndSetDisplacement(drawingInfo.displacementLayers, drawingInfo.displacementLayerNames, textBoxes)) {
            if (textIsVisible) {
              let maximumRotationAngleDelta = 0
              let startRotationAngle = 0

              if (characterInfos[0].point.y > characterInfos[1].point.y) {
                startRotationAngle = Math.PI / 2
              } else {
                startRotationAngle = -Math.PI / 2
              }

              let lastRotationAngle = null

              for (let characterIndex = 0; characterIndex < text.length; characterIndex++) {
                const angleStartPoint = characterIndex > 0 ? characterInfos[characterIndex - 1].point : characterInfos[0].point
                const angleEndPoint = characterIndex < characterInfos.length - 1 ? characterInfos[characterIndex + 1].point : characterInfos[characterIndex].point
                let characterRotationAngle = (angleEndPoint.x - angleStartPoint.x) === 0
                  ? startRotationAngle
                  : Math.atan((angleEndPoint.y - angleStartPoint.y) / (angleEndPoint.x - angleStartPoint.x))

                if (angleEndPoint.x <= angleStartPoint.x) {
                  characterRotationAngle += Math.PI
                }

                characterRotationAngle += additionalCharacterRotation

                characterInfos[characterIndex].rotationAngle = characterRotationAngle

                if (lastRotationAngle !== null) {
                  const absDelta = Math.abs(lastRotationAngle - characterRotationAngle)
                  const wrappedDelta = Math.min(absDelta, (Math.PI * 2) - absDelta)

                  if (wrappedDelta > maximumRotationAngleDelta) {
                    maximumRotationAngleDelta = wrappedDelta
                  }
                }

                lastRotationAngle = characterRotationAngle
              }

              if (maximumRotationAngleDelta < Math.PI * 2 / 4) {
                const matrices = []
                let matrixIndex = 0

                drawingInfo.context.save()

                try {
                  drawingInfo.context.beginGroup(drawingInfo.text)

                  for (let characterIndex = 0; characterIndex < text.length; characterIndex++) {
                    if (text[characterIndex] !== ' ') {
                      const matrix = new DOMMatrix()
                        .translate(
                          (characterInfos[characterIndex].point.x - drawingInfo.drawingArea.left) * drawingInfo.scale,
                          (drawingInfo.drawingArea.top - characterInfos[characterIndex].point.y) * drawingInfo.scale
                        )
                        .rotate(-characterInfos[characterIndex].rotationAngle * 180 / Math.PI)

                      matrices.push(matrix)

                      drawingInfo.context.tw = characterInfos[characterIndex].width * drawingInfo.scale
                      drawingInfo.context.setTransform(matrix)
                      drawingInfo.context.strokeText(text[characterIndex], 0, 0)
                    }
                  }

                  for (let characterIndex = 0; characterIndex < text.length; characterIndex++) {
                    if (text[characterIndex] !== ' ') {
                      drawingInfo.context.tw = characterInfos[characterIndex].width * drawingInfo.scale
                      drawingInfo.context.setTransform(matrices[matrixIndex++])
                      drawingInfo.context.fillText(text[characterIndex], 0, 0)
                    }
                  }

                  drawingInfo.context.endGroup()
                } finally {
                  drawingInfo.context.restore()
                }
              }
            }
          }
        }
      } else {
        dataOffset += numberOfPoints * 4 * 2
      }
    } else if (!drawingInfo.isText && !drawingInfo.isIcon) {
      drawingInfo.context.beginPath()

      let x = geometry.getFloat32(dataOffset, true)
      dataOffset += 4

      let y = geometry.getFloat32(dataOffset, true)
      dataOffset += 4

      drawingInfo.context.moveTo(
        Math.round((x - drawingInfo.drawingArea.left) * drawingInfo.scale),
        Math.round((drawingInfo.drawingArea.top - y) * drawingInfo.scale)
      )

      for (let pointIndex = 1; pointIndex < numberOfPoints; pointIndex++) {
        x = geometry.getFloat32(dataOffset, true)
        dataOffset += 4

        y = geometry.getFloat32(dataOffset, true)
        dataOffset += 4

        drawingInfo.context.lineTo(
          Math.round((x - drawingInfo.drawingArea.left) * drawingInfo.scale),
          Math.round((drawingInfo.drawingArea.top - y) * drawingInfo.scale)
        )
      }

      drawingInfo.context.stroke()
    } else {
      dataOffset += numberOfPoints * 4 * 2
    }

    return dataOffset
  },

  _drawPolygons: function (drawingInfo, polygons) {
    if (drawingInfo.isFilled) {
      this._drawPolygonsFilled(drawingInfo, polygons)
    }

    if (drawingInfo.isStroked) {
      this._drawPolygonsStroked(drawingInfo, polygons)
    }
  },

  _drawPolygonsStroked: function (drawingInfo, polygons) {
    const drawingAreaLeft = drawingInfo.drawingArea.left
    const drawingAreaTop = drawingInfo.drawingArea.top
    const drawingScale = drawingInfo.scale
    const tileBoundingBox = drawingInfo.tileBoundingBox
    // We use a threshold of 2 map units (drawingScale * 2) instead of 0.5 (drawingScale / 2)
    // to account for Float32 precision loss at large coordinates (where step size can be up to 2 meters).
    const edgeThresholdPx = tileBoundingBox ? Math.max(1, Math.ceil(drawingScale * 2)) : 0

    for (const polygonRings of polygons) {
      for (const polygonPoints of polygonRings) {
        const numberOfPoints = polygonPoints.length

        let pointsDrawn = 0

        let lastPx = 0
        let lastPy = 0

        let lastOnLeft = false
        let lastOnRight = false
        let lastOnTop = false
        let lastOnBottom = false

        for (let pointIndex = 0; pointIndex < numberOfPoints; pointIndex++) {
          const x = polygonPoints[pointIndex].x
          const y = polygonPoints[pointIndex].y

          const px = Math.round((x - drawingAreaLeft) * drawingScale)
          const py = Math.round((drawingAreaTop - y) * drawingScale)

          const onLeft = tileBoundingBox ? Math.abs((x - tileBoundingBox.left) * drawingScale) <= edgeThresholdPx : false
          const onRight = tileBoundingBox ? Math.abs((x - tileBoundingBox.right) * drawingScale) <= edgeThresholdPx : false
          const onTop = tileBoundingBox ? Math.abs((tileBoundingBox.top - y) * drawingScale) <= edgeThresholdPx : false
          const onBottom = tileBoundingBox ? Math.abs((tileBoundingBox.bottom - y) * drawingScale) <= edgeThresholdPx : false

          if (pointIndex > 0) {
            if (
              (onLeft && lastOnLeft) ||
              (onRight && lastOnRight) ||
              (onTop && lastOnTop) ||
              (onBottom && lastOnBottom)
            ) {
              if (pointsDrawn > 0) {
                drawingInfo.context.stroke()
              }

              pointsDrawn = 0
            } else {
              if (pointsDrawn === 0) {
                drawingInfo.context.beginPath()
                drawingInfo.context.moveTo(lastPx, lastPy)
              }

              drawingInfo.context.lineTo(px, py)

              pointsDrawn++
            }
          }

          lastPx = px
          lastPy = py

          lastOnLeft = onLeft
          lastOnRight = onRight
          lastOnTop = onTop
          lastOnBottom = onBottom
        }

        if (pointsDrawn > 0) {
          drawingInfo.context.stroke()
        }
      }
    }
  },

  _drawPolygonsFilled: function (drawingInfo, polygons) {
    const drawingAreaLeft = drawingInfo.drawingArea.left
    const drawingAreaTop = drawingInfo.drawingArea.top
    const drawingScale = drawingInfo.scale

    drawingInfo.context.beginPath()

    for (const polygonRings of polygons) {
      for (const polygonPoints of polygonRings) {
        const numberOfPoints = polygonPoints.length

        for (let pointIndex = 0; pointIndex < numberOfPoints; pointIndex++) {
          const x = polygonPoints[pointIndex].x
          const y = polygonPoints[pointIndex].y
          const px = Math.round((x - drawingAreaLeft) * drawingScale)
          const py = Math.round((drawingAreaTop - y) * drawingScale)

          if (pointIndex === 0) {
            drawingInfo.context.moveTo(px, py)
          } else {
            drawingInfo.context.lineTo(px, py)
          }
        }
      }
    }

    drawingInfo.context.fill()
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

  _skipPolygon: function (geometry, dataOffset) {
    dataOffset += 4

    const numberOfRings = geometry.getUint32(dataOffset, true)
    dataOffset += 4

    for (let ringIndex = 0; ringIndex < numberOfRings; ringIndex++) {
      dataOffset += 4 + geometry.getUint32(dataOffset, true) * 4 * 2
    }

    return dataOffset
  }
}

export default geometryMethods
