export default class MapOverlay {
  #width = 0
  #height = 0

  #fontFaces = []
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
    if (!(layer instanceof SvgLayer) && !(layer instanceof PoiLayer)) {
      throw new TypeError('layer must be an instance of SvgLayer or PoiLayer')
    }

    this.#layers.push(layer)
  }

  /**
   * @param {FontFace} fontFace
   * @returns {void}
   */
  addFontFace(fontFace) {
    if (!(fontFace instanceof FontFace)) {
      throw new TypeError('fontFace must be an instance of FontFace')
    }

    this.#fontFaces.push(fontFace)
  }

  /**
   * @param {SvgLayer} layer
   * @returns {void}
   */
  addOrReplace(layer) {
    if (!(layer instanceof SvgLayer) && !(layer instanceof PoiLayer)) {
      throw new TypeError('layer must be an instance of SvgLayer or PoiLayer')
    }

    if(layer instanceof SvgLayer) {
      const domParser = new DOMParser()

      const parsedLayerDom = domParser.parseFromString(layer.getSvgSource(), 'application/xml')
      const layerId = parsedLayerDom.documentElement.id || ''

      if (layerId !== '') {
        for (const layerIndex in this.#layers) {
          const currentLayer = this.#layers[layerIndex]

          if(currentLayer instanceof SvgLayer) {
            const currentParsedLayerDom = domParser.parseFromString(currentLayer.getSvgSource(), 'application/xml')

            if (currentParsedLayerDom.documentElement.id === layerId) {
              this.#layers[layerIndex] = layer

              return
            }
          }
        }
      }
    } else if(layer instanceof PoiLayer) {
      const poiData = layer.getPoiData()

      if(poiData.id !== '') {
        for (const layerIndex in this.#layers) {
          const currentLayer = this.#layers[layerIndex]
  
          if(currentLayer instanceof PoiLayer) {
            const currentPoiData = currentLayer.getPoiData()

            if (currentPoiData.id === poiData.id) {
              Object.assign(currentPoiData, poiData)
  
              return
            }
          }
        }
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

    let svgString = `<svg x="0" y="0" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">\n`

    if (this.#fontFaces.length > 0) {
      svgString += '<defs>\n'
      svgString += '<style type="text/css">\n'
      for (const fontFace of this.#fontFaces) {
        svgString += fontFace.buildCssFontFace() + '\n'
      }
      svgString += '</style>\n'
      svgString += '</defs>\n'
    }
    for (const layer of this.#layers) {
      svgString += layer.getSvgSource() + '\n'
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

  /**
   * @param {string} id
   * @param {string} textContent
   */
  replaceTextContent(id, textContent) {
    if (typeof id !== 'string') {
      throw new TypeError('id must be a string')
    }
    if (typeof textContent !== 'string') {
      throw new TypeError('textContent must be a string')
    }

    for (const layerIndex in this.#layers) {
      const currentLayer = this.#layers[layerIndex]

      if(!(currentLayer instanceof TextSvgLayer)) {
        continue
      }
      const domParser = new DOMParser()
      const currentParsedLayerDom = domParser.parseFromString(currentLayer.getSvgSource(), 'application/xml')

      if (currentParsedLayerDom.documentElement.id !== id) {
        continue
      }

      this.#layers[layerIndex] = currentLayer.buildLayerWithReplacedTextContent(textContent)
      return
    }

    throw new ReferenceError(`TextSvgLayer with id: "${id}" not found`)
  }
}

class SvgLayer {
  #svgString = ''

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

    this.#svgString = svgString
  }

  /**
   * @returns {string}
   */
  getSvgSource() {
    return this.#svgString
  }
}

class ImageSvgLayer extends SvgLayer {
  /**
   * @param {{href: string, x: string|number, y: string|number, [key: string]: any}} imageInfo
   */
  constructor(imageInfo) {
    if (imageInfo === undefined || imageInfo === null || imageInfo.constructor !== Object) {
      throw new TypeError('imageInfo must be an object')
    }
    if (typeof imageInfo.href !== 'string') {
      throw new TypeError('imageInfo.href must be a string')
    }
    if (typeof imageInfo.x !== 'string' && typeof imageInfo.x !== 'number') {
      throw new TypeError('imageInfo.x must be a string or a number')
    }
    if (typeof imageInfo.y !== 'string' && typeof imageInfo.y !== 'number') {
      throw new TypeError('imageInfo.y must be a string or a number')
    }

    const svgImageElement = document.createElement('image')

    for (const [key, value] of Object.entries(imageInfo)) {
      svgImageElement.setAttribute(key, value)
    }

    super(svgImageElement.outerHTML)
  }
}

class TextSvgLayer extends SvgLayer {
  /**
   * @type {{text: string, x: string|number, y: string|number, [key: string]: any}}
   */
  #data

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

    const svgTextElement = document.createElement('text')

    const lineSplittedText = textInfo.text.split('\n')

    if (lineSplittedText.length > 1) {
      for (const lineIndex in lineSplittedText) {
        const tspan = document.createElement('tspan')
        tspan.textContent = lineSplittedText[lineIndex]
        tspan.setAttribute('x', textInfo.x)
    
        if (lineIndex > 0) {
          tspan.setAttribute('dy', '1.2em')
        }
    
        svgTextElement.appendChild(tspan)
      }
    } else {
      svgTextElement.textContent = textInfo.text
    }

    for (const [key, value] of Object.entries(textInfo)) {
      if (key === 'text') {
        continue
      }

      svgTextElement.setAttribute(key, value)
    }

    super(svgTextElement.outerHTML)

    this.#data = textInfo
  }

  /**
   * @param {string} textContent
   * @returns {TextSvgLayer}
   */
  buildLayerWithReplacedTextContent(textContent) {
    return new TextSvgLayer({ ...this.#data, text: textContent })
  }
}

class PoiLayer {
  #poiData

  constructor(poiData) {
    this.#poiData = poiData
  }

  getPoiData() {
    return this.#poiData
  }

  getSvgSource() {
    return ''
  }
}

class FontFace {
  #fontFamily = ''
  #srcUrl = ''
  #fontStyle = 'normal'
  #fontWeight = 400
  #unicodeRanges = []

  /**
   * @param {{
   *  fontFamily: string,
   *  srcUrl: string,
   *  fontStyle: string?,
   *  fontWeight: number?,
   *  unicodeRanges: string[]?
   * }} data
   */
  constructor(data) {
    if (data === undefined || data === null || data.constructor !== Object) {
      throw new TypeError('data must be an object')
    }
    if (typeof data.fontFamily !== 'string') {
      throw new TypeError('data.fontFamily must be a string')
    }
    this.#fontFamily = data.fontFamily.trim()
    if (this.#fontFamily === '') {
      throw new RangeError('data.fontFamily must not be an empty string')
    }

    if (typeof data.srcUrl !== 'string') {
      throw new TypeError('data.srcUrl must be a string')
    }
    this.#srcUrl = data.srcUrl.trim()
    if (this.#srcUrl === '') {
      throw new RangeError('data.srcUrl must not be an empty string')
    }

    if (data.fontStyle !== undefined && data.fontStyle !== null) {
      if (typeof data.fontStyle !== 'string') {
        throw new TypeError('data.fontStyle must be a string')
      }
      this.#fontStyle = data.fontStyle
    }
    if (data.fontWeight !== undefined && data.fontWeight !== null) {
      if (isNaN(data.fontWeight)) {
        throw new TypeError('data.fontWeight must be a number')
      }
      this.#fontWeight = data.fontWeight
    }
    if (data.unicodeRanges !== undefined && data.unicodeRanges !== null) {
      if (!Array.isArray(data.unicodeRanges)) {
        throw new TypeError('data.unicodeRanges must be an array')
      }
      this.#unicodeRanges = data.unicodeRanges
    }
  }

  buildCssFontFace() {
    let cssFontFace = `@font-face {\n`
    cssFontFace += `  font-family: '${this.#fontFamily}';\n`
    cssFontFace += `  src: url('${this.#srcUrl}');\n`
    cssFontFace += `  font-style: ${this.#fontStyle};\n`
    cssFontFace += `  font-weight: ${this.#fontWeight};\n`
    if (this.#unicodeRanges.length > 0) {
      cssFontFace += `  unicode-range: ${this.#unicodeRanges.join(', ')};\n`
    }
    cssFontFace += `}`

    return cssFontFace
  }
}

export {
  FontFace,
  MapOverlay,
  SvgLayer,
  ImageSvgLayer,
  TextSvgLayer,
  PoiLayer
}
