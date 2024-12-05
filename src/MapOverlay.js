class MapOverlay {
  width
  height
  dpi

  layers = []

  constructor(mapInfo) {
    if (isNaN(mapInfo.width) || isNaN(mapInfo.height) || isNaN(mapInfo.dpi)) {
      throw new ReferenceError('missing essential parameters')
    }

    this.width = mapInfo.width
    this.height = mapInfo.height
    this.dpi = mapInfo.dpi
  }

  /**
   * @param {SvgLayer} layer
   */
  add(layer) {
    this.layers.push(layer)
  }

  /**
   * @param {SvgLayer} layer
   */
  addOrReplace(layer) {
    const domParser = new DOMParser()

    const parsedLayerDom = domParser.parseFromString(layer.getSvgSource(), 'application/xml')
    const layerId = parsedLayerDom.documentElement.id || ''
    if (layerId === '') {
      this.add(layer)
      return
    }

    for (const layerIndex in this.layers) {
      const currentLayer = this.layers[layerIndex]
      const currentParsedLayerDom = domParser.parseFromString(currentLayer.getSvgSource(), 'application/xml')
      if (currentParsedLayerDom.documentElement.id === layerId) {
        this.layers[layerIndex] = layer
        return
      }
    }

    this.add(layer)
  }

  getSvgOverlay(size) {
    const width = size?.width || this.width
    const height = size?.height || this.height

    let svgText = `<svg x="0" y="0" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">`

    for (const overlayLayer of this.layers) {
      svgText += overlayLayer.getSvgSource()
    }

    svgText += '</svg>'

    return svgText
  }
}

class SvgLayer {
  svgText = ''

  constructor(layerData) {
    switch (typeof layerData) {
    case 'string':
      this.svgText = layerData

      break

    case 'object':
      for (const svgElementName in layerData) {
        const svgElement = layerData[svgElementName]

        switch (typeof svgElement) {
        case 'string':
          this.svgText += svgElement

          break

        case 'object':
          for (const svgParameterName in svgElement) {

          }


          break
        }
      }
      break
    }
  }

  getSvgSource() {
    return this.svgText
  }
}

class ImageSvgLayer extends SvgLayer {
  constructor(imageInfo) {
    if (!imageInfo.href || !imageInfo.x || !imageInfo.y) {
      throw new ReferenceError('missing essential parameters')
    }

    super()

    let svgText = '<image '

    for (const [key, value] of Object.entries(imageInfo)) {
      svgText += `${key}="${value}" `
    }

    svgText += `/>`

    this.svgText += svgText
  }
}

class TextSvgLayer extends SvgLayer {
  /**
   * @param {{text: string, x: string|number, y: string|number, [key: string]: any}} textInfo
   */
  constructor(textInfo) {
    if (textInfo === undefined || textInfo === null || textInfo.constructor !== Object) {
      throw new TypeError('textInfo must be an object')
    }
    if (typeof textInfo.text !== 'string') {
      throw new TypeError('textInfo.text must be a string')
    }
    if (typeof textInfo.x !== 'string' && typeof textInfo.x !== 'number') {
      throw new TypeError('textInfo.x must be a string or a number')
    }
    if (typeof textInfo.y !== 'string' && typeof textInfo.y !== 'number') {
      throw new TypeError('textInfo.y must be a string or a number')
    }

    super()

    const svgText = document.createElement('text')

    const lineSplittedText = textInfo.text.split('\n')
    if (lineSplittedText.length > 1) {
      for (const lineIndex in lineSplittedText) {
        const tspan = document.createElement('tspan')
        tspan.textContent = lineSplittedText[lineIndex]
        tspan.setAttribute('x', textInfo.x)
        if (lineIndex > 0) {
          tspan.setAttribute('dy', `1.2em`)
        }
        svgText.appendChild(tspan)
      }
    } else {
      svgText.textContent = textInfo.text
    }

    for (const [key, value] of Object.entries(textInfo)) {
      if (key === 'text') {
        continue
      }

      svgText.setAttribute(key, value)
    }

    this.svgText = svgText.outerHTML
  }
}

export {
  MapOverlay,
  SvgLayer,
  ImageSvgLayer,
  TextSvgLayer
}
