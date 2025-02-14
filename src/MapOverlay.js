/* global DOMParser */

export default class MapOverlay {
  #width = 0
  #height = 0

  /**
   * @type {CustomFontFace[]}
   */
  #fontFaces = []
  #layers = []

  /**
   * @param {{width: number, height: number}} mapData
   */
  constructor (mapData) {
    if (typeof mapData !== 'object' || mapData === null) {
      throw new TypeError('mapData must be an object')
    }

    if (mapData.width === undefined || mapData.width === null) {
      throw new ReferenceError('width value is required')
    }
    if (mapData.height === undefined || mapData.height === null) {
      throw new ReferenceError('height value is required')
    }
    if (typeof mapData.width === 'string') {
      mapData.width = parseFloat(mapData.width)
    }
    if (typeof mapData.height === 'string') {
      mapData.height = parseFloat(mapData.height)
    }

    if (Number.isNaN(mapData.width) || Number.isNaN(mapData.height)) {
      throw new ReferenceError('width and height values must be numbers')
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
  get width () {
    return this.#width
  }

  /**
   * @returns {number}
   */
  get height () {
    return this.#height
  }

  /**
   * @param {SvgLayer} layer
   * @returns {void}
   */
  add (layer) {
    if (!(layer instanceof SvgLayer) && !(layer instanceof PoiLayer)) {
      throw new TypeError('layer must be an instance of SvgLayer or PoiLayer')
    }

    this.#layers.push(layer)
  }

  /**
   * @param {CustomFontFace} fontFace
   * @returns {void}
   */
  addFontFace (fontFace) {
    if (!(fontFace instanceof CustomFontFace)) {
      throw new TypeError('fontFace must be an instance of CustomFontFace')
    }

    this.#fontFaces.push(fontFace)
  }

  /**
   * @param {SvgLayer} layer
   * @returns {void}
   */
  addOrReplace (layer) {
    if (!(layer instanceof SvgLayer) && !(layer instanceof PoiLayer)) {
      throw new TypeError('layer must be an instance of SvgLayer or PoiLayer')
    }

    if (layer instanceof SvgLayer) {
      const domParser = new DOMParser()

      const parsedLayerDom = domParser.parseFromString(layer.getSvgSource(), 'application/xml')
      const layerId = parsedLayerDom.documentElement.id || ''

      if (layerId !== '') {
        for (const layerIndex in this.#layers) {
          const currentLayer = this.#layers[layerIndex]

          if (currentLayer instanceof SvgLayer) {
            const currentParsedLayerDom = domParser.parseFromString(currentLayer.getSvgSource(), 'application/xml')

            if (currentParsedLayerDom.documentElement.id === layerId) {
              this.#layers[layerIndex] = layer

              return
            }
          }
        }
      }
    } else if (layer instanceof PoiLayer) {
      const poiData = layer.getPoiData()

      if (poiData.id !== '') {
        for (const layerIndex in this.#layers) {
          const currentLayer = this.#layers[layerIndex]

          if (currentLayer instanceof PoiLayer) {
            const currentPoiData = currentLayer.getPoiData()

            if (currentPoiData.id === poiData.id) {
              Object.assign(currentPoiData, poiData)
              if (typeof currentPoiData.latitude === 'number' && typeof currentPoiData.longitude === 'number' && currentPoiData.marker) {
                currentPoiData.marker.setLatLng([currentPoiData.latitude, currentPoiData.longitude])
              }

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
  getSvgOverlay (size) {
    let width = this.#width
    let height = this.#height
    if (size !== undefined && size !== null && size.constructor === Object) {
      if (typeof size.width === 'string') {
        size.width = parseFloat(size.width)
      }
      if (typeof size.height === 'string') {
        size.height = parseFloat(size.height)
      }
      if (size.width !== undefined && size.width !== null && Number.isNaN(size.width)) {
        throw new TypeError('size.width must be a number')
      } else {
        width = size.width
      }
      if (size.height !== undefined && size.height !== null && Number.isNaN(size.height)) {
        throw new TypeError('size.height must be a number')
      } else {
        height = size.height
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

  getPoiDatas () {
    const poiDatas = []

    for (const layer of this.#layers) {
      if (layer instanceof PoiLayer) {
        poiDatas.push(layer.getPoiData())
      }
    }

    return poiDatas
  }

  /**
   * @param {string} id
   * @param {string} textContent
   */
  replaceTextContent (id, textContent) {
    if (typeof id !== 'string') {
      throw new TypeError('id must be a string')
    }
    if (typeof textContent !== 'string') {
      throw new TypeError('textContent must be a string')
    }

    for (const layerIndex in this.#layers) {
      const currentLayer = this.#layers[layerIndex]

      if (!(currentLayer instanceof TextSvgLayer)) {
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
  constructor (svgString) {
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
  getSvgSource () {
    return this.#svgString
  }
}

class ImageSvgLayer extends SvgLayer {
  /**
   * @param {{href: string, x: string|number, y: string|number, [key: string]: any}} imageInfo
   */
  constructor (imageInfo) {
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

    const svgImageElement = document.createElementNS('http://www.w3.org/2000/svg', 'image')
    for (const [key, value] of Object.entries(imageInfo)) {
      svgImageElement.setAttributeNS(null, key, value)
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
  constructor (textInfo) {
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
  buildLayerWithReplacedTextContent (textContent) {
    return new TextSvgLayer({ ...this.#data, text: textContent })
  }
}

class PoiLayer {
  #poiData

  constructor (poiData) {
    this.#poiData = poiData
  }

  getPoiData () {
    return this.#poiData
  }

  getSvgSource () {
    return ''
  }
}

class CustomFontFace {
  #source = ''

  /**
   * @param {string} family
   * @param {string} source
   * @param {FontFaceDescriptors?} descriptors
   */
  constructor (family, source, descriptors) {
    if (typeof family !== 'string') {
      throw new TypeError('family must be a string')
    }
    family = family.trim()
    if (family === '') {
      throw new RangeError('family must not be an empty string')
    }

    if (typeof source !== 'string') {
      throw new TypeError('source must be a string')
    }
    source = source.trim()
    if (source === '') {
      throw new RangeError('source must not be an empty string')
    }

    this.family = family
    this.#source = source

    if (descriptors) {
      if (descriptors.style) {
        this.style = descriptors.style
      }
      if (descriptors.weight) {
        this.weight = descriptors.weight
      }
      if (descriptors.display) {
        this.display = descriptors.display
      }
      if (descriptors.unicodeRange) {
        this.unicodeRange = descriptors.unicodeRange
      }
    }
  }

  /**
   * @returns {string}
   */
  buildCssFontFace () {
    let cssFontFace = '@font-face {\n'
    cssFontFace += `  font-family: '${this.family}';\n`
    cssFontFace += `  src: url('${this.#source}');\n`
    if (this.style) {
      cssFontFace += `  font-style: ${this.style};\n`
    }
    if (this.weight) {
      cssFontFace += `  font-weight: ${this.weight};\n`
    }
    if (this.display) {
      cssFontFace += `  font-display: ${this.display};\n`
    }
    if (this.unicodeRange) {
      cssFontFace += `  unicode-range: ${this.unicodeRange};\n`
    }
    cssFontFace += '}'

    return cssFontFace
  }
}

export {
  CustomFontFace,
  MapOverlay,
  SvgLayer,
  ImageSvgLayer,
  TextSvgLayer,
  PoiLayer
}
