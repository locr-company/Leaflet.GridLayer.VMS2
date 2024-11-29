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

  add(layer) {
    this.layers.push(layer)
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

class SvgMapOverlayLayer {
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
    /*
    if (typeof layerData === 'string') {
      this.svgText = layerData
    } else if (Array.isArray(layerData)) {
      if (layerData.style) {
 
      }
 
 
      for (const elementName in layerData) {
        if (layerData[elementName])
      }
 
      if (layerData.style) {
 
      }
    } else {
      throw new ReferenceError('missing essential parameters')
    }
    */
  }

  getSvgSource() {
    return this.svgText
  }
}

class ImageMapOverlayLayer extends SvgMapOverlayLayer {
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

    super.svgText = svgText
  }
}

class TextMapOverlayLayer extends SvgMapOverlayLayer {
  constructor(textInfo) {
    if (!textInfo.text || !textInfo.x || !textInfo.y) {
      throw new ReferenceError('missing essential parameters')
    }

    super()

    let svgText = '<text '

    for (const [key, value] of Object.entries(textInfo)) {
      if (key == 'text') {
        continue
      }

      svgText += `${key}="${value}" `
    }

    svgText += `>${textInfo.text}</text>`

    super.svgText = svgText
  }
}

export {
  MapOverlay,
  SvgMapOverlayLayer,
  ImageMapOverlayLayer,
  TextMapOverlayLayer
}
