export default class MapOverlay {
  #width = 0
  #height = 0

  #layers = []

  /**
   * @param {{width: number, height: number}} mapData
   */
  constructor(mapData) {
    if (typeof mapData !== 'object' || mapData === null) {
      throw new TypeError('mapData must be an object')
    }

    if (isNaN(mapData.width) || isNaN(mapData.height)) {
      throw new ReferenceError('width and height values need to be defined')
    }

    if (typeof mapData.width !== 'number') {
      mapData.width = parseFloat(mapData.width)
    }
    if (typeof mapData.height !== 'number') {
      mapData.height = parseFloat(mapData.height)
    }

    if (mapData.width <= 0 || mapData.height <= 0) {
      throw new RangeError('width and height values need to be greater than 0')
    }

    this.#width = mapData.width
    this.#height = mapData.height
  }

  /**
   * @returns {number}
   */
  get width() {
    return this.#width
  }

  /**
   * @returns {number}
   */
  get height() {
    return this.#height
  }

  /**
   * @param {SvgLayer} layer
   * @returns {void}
   */
  add(layer) {
    if (!(layer instanceof SvgLayer)) {
      throw new TypeError('layer must be an instance of SvgLayer')
    }

    this.#layers.push(layer)
  }

  /**
   * @param {SvgLayer} layer
   * @returns {void}
   */
  addOrReplace(layer) {
    if (!(layer instanceof SvgLayer)) {
      throw new TypeError('layer must be an instance of SvgLayer')
    }

    const domParser = new DOMParser()

    const parsedLayerDom = domParser.parseFromString(layer.getSvgSource(), 'application/xml')
    const layerId = parsedLayerDom.documentElement.id || ''
    if (layerId === '') {
      this.add(layer)
      return
    }

    for (const layerIndex in this.#layers) {
      const currentLayer = this.#layers[layerIndex]
      const currentParsedLayerDom = domParser.parseFromString(currentLayer.getSvgSource(), 'application/xml')
      if (currentParsedLayerDom.documentElement.id === layerId) {
        this.#layers[layerIndex] = layer
        return
      }
    }

    this.add(layer)
  }

  /**
   * @param {{width?: number, height?: number}|undefined} size
   * @returns {string}
   */
  getSvgOverlay(size) {
    let width = this.#width
    let height = this.#height
    if (size !== undefined && size !== null && size.constructor === Object) {
      if (isNaN(size.width)) {
        if (size.width !== undefined && size.width !== null) {
          throw new TypeError('size.width must be a number')
        }
      } else {
        width = parseFloat(size.width)
      }
      if (isNaN(size.height)) {
        if (size.height !== undefined && size.height !== null) {
          throw new TypeError('size.height must be a number')
        }
      } else {
        height = parseFloat(size.height)
      }
    }

    let svgString = `<svg x="0" y="0" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">`

    for (const layer of this.#layers) {
      svgString += layer.getSvgSource()
    }

    svgString += '</svg>'

    return svgString
  }

  getPoiDatas() {
    const poiDatas = []

    for (const layer of this.#layers) {
      if(layer instanceof PoiLayer) {
        poiDatas.push(layer.getPoiData())
      }
    }

    return poiDatas
  }
}

class SvgLayer {
  svgString = ''

  /**
   * @param {string} svgString
   */
  constructor(svgString) {
    if (svgString === undefined || svgString === null) {
      return
    }

    if (typeof svgString !== 'string') {
      throw new TypeError('svgString must be a string')
    }

    this.svgString = svgString
  }

  /**
   * @returns {string}
   */
  getSvgSource() {
    return this.svgString
  }
}

class ImageSvgLayer extends SvgLayer {
  constructor(imageInfo) {
    if (!imageInfo.href || !imageInfo.x || !imageInfo.y) {
      throw new ReferenceError('missing essential parameters')
    }

    super()

    let svgString = '<image '

    for (const [key, value] of Object.entries(imageInfo)) {
      svgString += `${key}="${value}" `
    }

    svgString += `/>`

    this.svgString += svgString
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

    const svgString = document.createElement('text')

    const lineSplittedText = textInfo.text.split('\n')

    if (lineSplittedText.length > 1) {
      for (const lineIndex in lineSplittedText) {
        const tspan = document.createElement('tspan')
        tspan.textContent = lineSplittedText[lineIndex]
        tspan.setAttribute('x', textInfo.x)
    
        if (lineIndex > 0) {
          tspan.setAttribute('dy', '1.2em')
        }
    
        svgString.appendChild(tspan)
      }
    } else {
      svgString.textContent = textInfo.text
    }

    for (const [key, value] of Object.entries(textInfo)) {
      if (key === 'text') {
        continue
      }

      svgString.setAttribute(key, value)
    }

    super(svgString.outerHTML)
  }
}

class PoiLayer {
  #poiData

  constructor(iconData) {
    this.#poiData = { iconData }
  }

  getPoiData() {
    return this.#poiData
  }

  getSvgSource() {
    return ''
  }
}

export {
  MapOverlay,
  SvgLayer,
  ImageSvgLayer,
  TextSvgLayer,
  PoiLayer
}
