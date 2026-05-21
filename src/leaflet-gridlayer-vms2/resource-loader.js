/* eslint-disable no-underscore-dangle */
/* global FontFace, Image */

import {
  addTileAbortController,
  isTileLayerDataStale,
  removeTileAbortController
} from './tile-requests.js'

function flushQueuedResolvers (entries, handler) {
  while (entries.length > 0) {
    const entry = entries.shift()

    if (entry) {
      handler(entry)
    }
  }
}

function compileTileWorkerQueue (layer) {
  return function decodeFunction () {
    for (const decodeWorker of globalThis.vms2Context.decodeWorkers) {
      if (!decodeWorker.resolveFunction) {
        let decodeEntry = globalThis.vms2Context.decodeQueue.shift()

        while (decodeEntry && isTileLayerDataStale(decodeEntry.tileLayerData)) {
          decodeEntry.resolve()
          decodeEntry = globalThis.vms2Context.decodeQueue.shift()
        }

        if (!decodeEntry) {
          return
        }

        decodeWorker.postMessage(decodeEntry.decodeData)

        decodeWorker.resolveFunction = () => {
          if (!isTileLayerDataStale(decodeEntry.tileLayerData)) {
            layer._getCachedTile(
              decodeEntry.dataLayerId,
              decodeEntry.x,
              decodeEntry.y,
              decodeEntry.z,
              decodeEntry.tileLayerData
            )
          }

          globalThis.vms2Context.decodeWorkersRunning--

          decodeEntry.resolve()

          if (globalThis.vms2Context.decodeQueue.length > 0) {
            decodeFunction()
          }
        }

        globalThis.vms2Context.decodeWorkersRunning++
      }
    }
  }
}

function createPatternDescriptor (patternImage, repetition) {
  return {
    patternImage,
    repetition,
    transformMatrix: null,
    setTransform (matrix) {
      this.transformMatrix = matrix
    }
  }
}

function resolveTileDbInfosWithFallback (layer, queue, error) {
  console.warn('Tile DB info request failed', error)

  layer.tileDbInfos = []

  flushQueuedResolvers(queue, entry => entry.resolve(layer.tileDbInfos))
}

const resourceLoaderMethods = {
  _requestStyle: function () {
    return new Promise((resolve, reject) => {
      if (this.options.style.Order && Array.isArray(this.options.style.Order)) {
        resolve(this.options.style)
        return
      }

      const styleId = this.options.style

      if (!globalThis.vms2Context.styleRequestQueues[styleId]) {
        globalThis.vms2Context.styleRequestQueues[styleId] = []
      }

      const queue = globalThis.vms2Context.styleRequestQueues[styleId]

      queue.push({ resolve, reject })

      if (queue.length > 1) {
        return
      }

      const url = new URL(this.options.styleUrl.replace('{style_id}', styleId), window.location.origin)
      const parameters = new URLSearchParams(url.search)
      const formBody = []

      for (const keyValuePair of parameters.entries()) {
        formBody.push(encodeURIComponent(keyValuePair[0]) + '=' + encodeURIComponent(keyValuePair[1]))
      }

      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formBody.join('&')
      }

      const beforeFetchTime = performance.now()

      fetch(url.origin + url.pathname, options)
        .then(response => response.json())
        .then(style => {
          this.options.style = style
          this.fire('style-loaded', {
            data: {
              style,
              fetchUrl: url.origin + url.pathname,
              fetchOptions: options,
              fetchTimeMS: performance.now() - beforeFetchTime
            }
          })

          flushQueuedResolvers(queue, entry => entry.resolve(this.options.style))
        })
        .catch(error => {
          console.error(error)
          flushQueuedResolvers(queue, entry => entry.reject(error))
        })
    })
  },

  _requestFontFace: function (style) {
    return new Promise(resolve => {
      let fontName = style.FontFamily.replace(/ /g, '') + '.ttf'
      let fontStyle = 'normal'
      let fontWeight = 'normal'

      if (style.FontSpecs) {
        fontName = style.FontSpecs[0]

        if (style.FontSpecs[1] === 'bold') {
          fontWeight = style.FontSpecs[1]
        } else if (style.FontSpecs[2]) {
          fontStyle = style.FontSpecs[1]
        }
      }

      const fontUrl = this.options.assetsUrl + '/fonts/' + fontName

      if (globalThis.vms2Context.fontFaceCache[fontName]) {
        if (globalThis.vms2Context.fontFaceCache[fontName].isLoading) {
          globalThis.vms2Context.fontFaceCache[fontName].resolveFunctions.push(resolve)
        } else {
          resolve()
        }

        return
      }

      const font = new FontFace(
        style.FontFamily,
        'url(\'' + fontUrl + '\')',
        { style: fontStyle, weight: fontWeight }
      )

      globalThis.vms2Context.fontFaceCache[fontName] = {
        isLoading: true,
        resolveFunctions: [resolve],
        family: style.FontFamily,
        fontName,
        url: fontUrl,
        style: fontStyle,
        weight: fontWeight
      }

      font.load()
        .then(() => {
          document.fonts.add(font)
          globalThis.vms2Context.fontFaceCache[fontName].isLoading = false

          for (const resolveFunction of globalThis.vms2Context.fontFaceCache[fontName].resolveFunctions) {
            if (resolveFunction) {
              resolveFunction()
            }
          }

          globalThis.vms2Context.fontFaceCache[fontName].resolveFunctions = []
        })
        .catch(() => {
          globalThis.vms2Context.fontFaceCache[fontName].isLoading = false

          for (const resolveFunction of globalThis.vms2Context.fontFaceCache[fontName].resolveFunctions) {
            if (resolveFunction) {
              resolveFunction()
            }
          }

          globalThis.vms2Context.fontFaceCache[fontName].resolveFunctions = []
        })
    })
  },

  _requestImage: function (imageUrlString) {
    return new Promise((resolve, reject) => {
      const imageCache = globalThis.vms2Context.imageCache

      if (imageCache[imageUrlString]) {
        if (imageCache[imageUrlString].isLoading) {
          imageCache[imageUrlString].resolveFunctions.push(resolve)
          imageCache[imageUrlString].rejectFunctions.push(reject)
        } else if (imageCache[imageUrlString].image) {
          resolve(imageCache[imageUrlString].image)
        } else {
          reject(imageCache[imageUrlString].error)
        }

        return
      }

      const image = new Image()

      image.crossOrigin = 'anonymous'

      imageCache[imageUrlString] = {
        isLoading: true,
        resolveFunctions: [resolve],
        rejectFunctions: [reject],
        image
      }

      image.onerror = error => {
        imageCache[imageUrlString].isLoading = false
        imageCache[imageUrlString].error = error

        for (const rejectFunction of imageCache[imageUrlString].rejectFunctions) {
          if (rejectFunction) {
            rejectFunction(error)
          }
        }

        imageCache[imageUrlString].resolveFunctions = []
        imageCache[imageUrlString].rejectFunctions = []
      }

      const imageUrl = new URL(imageUrlString, window.location.origin)

      if (imageUrl.search) {
        fetch(imageUrlString)
          .then(response => response.text())
          .then(svgImage => {
            image.onload = () => {
              imageCache[imageUrlString].isLoading = false

              for (const resolveFunction of imageCache[imageUrlString].resolveFunctions) {
                if (resolveFunction) {
                  resolveFunction(image)
                }
              }

              imageCache[imageUrlString].resolveFunctions = []
              imageCache[imageUrlString].rejectFunctions = []
            }

            svgImage = svgImage.replace('fill:#FFFFFF;', 'fill:#FF00FF;')

            image.src = `data:image/svg+xml;base64,${btoa(svgImage)}`
          })
          .catch(error => image.onerror(error))
      } else {
        image.onload = () => {
          imageCache[imageUrlString].isLoading = false

          for (const resolveFunction of imageCache[imageUrlString].resolveFunctions) {
            if (resolveFunction) {
              resolveFunction(image)
            }
          }

          imageCache[imageUrlString].resolveFunctions = []
          imageCache[imageUrlString].rejectFunctions = []
        }

        image.src = imageUrlString
      }
    })
  },

  _requestTileDbInfos: function () {
    return new Promise(resolve => {
      if (this.tileDbInfos) {
        resolve(this.tileDbInfos)
        return
      }

      const queue = this.tileDbInfosResolves

      queue.push({ resolve })

      if (queue.length > 1) {
        return
      }

      const tileDbInfosUrlParts = this.options.tileUrl.split('?')
      let tileDbInfosUrl

      try {
        tileDbInfosUrl = new URL(tileDbInfosUrlParts[0], window.location.origin)
      } catch (error) {
        resolveTileDbInfosWithFallback(this, queue, error)
        return
      }

      Promise.resolve()
        .then(() => fetch(tileDbInfosUrl))
        .then(response => {
          if (!response.ok) {
            throw new Error(`Tile DB info request failed with status ${response.status}`)
          }

          return response.json()
        })
        .then(tileDbInfos => {
          this.tileDbInfos = Array.isArray(tileDbInfos) ? tileDbInfos : []

          flushQueuedResolvers(queue, entry => entry.resolve(this.tileDbInfos))
        })
        .catch(error => {
          resolveTileDbInfosWithFallback(this, queue, error)
        })
    })
  },

  _requestTile: function (dataLayerId, x, y, z, tileLayerData) {
    return new Promise(resolve => {
      if (isTileLayerDataStale(tileLayerData)) {
        resolve()
        return
      }

      x &= ((1 << z) - 1)
      y &= ((1 << z) - 1)

      const tileLatitudeMin = this._tileToLatitude(y + 1, z)
      const tileLatitudeMax = this._tileToLatitude(y, z)
      const tileLongitudeMin = this._tileToLongitude(x, z)
      const tileLongitudeMax = this._tileToLongitude(x + 1, z)

      for (const tileDbInfo of this.tileDbInfos) {
        if (tileDbInfo.infos.length > 0) {
          const boundingBox = tileDbInfo.infos[0].bounding_box

          if (
            tileLatitudeMin >= boundingBox.latitude_min &&
            tileLatitudeMax <= boundingBox.latitude_max &&
            tileLongitudeMin >= boundingBox.longitude_min &&
            tileLongitudeMax <= boundingBox.longitude_max
          ) {
            if (tileDbInfo.infos[0].max_detail_zoom < 14 && tileDbInfo.infos[0].max_detail_zoom < z) {
              x >>= ((z & ~1) - tileDbInfo.infos[0].max_detail_zoom)
              y >>= ((z & ~1) - tileDbInfo.infos[0].max_detail_zoom)
              z = tileDbInfo.infos[0].max_detail_zoom | (z & 1)
            }

            break
          }
        }
      }

      if (this._getCachedTile(dataLayerId, x, y, z, tileLayerData)) {
        resolve()
        return
      }

      let tileUrl = this.options.tileUrl

      tileUrl = tileUrl.replace('{x}', x)
      tileUrl = tileUrl.replace('{y}', y)
      tileUrl = tileUrl.replace('{z}', z)

      const idParts = dataLayerId.split('|')

      if (idParts.length > 0) {
        tileUrl = tileUrl.replace('{key}', idParts[0])

        if (idParts.length > 1) {
          tileUrl = tileUrl.replace('{value}', idParts[1])

          if (idParts.length > 2) {
            tileUrl = tileUrl.replace('{type}', idParts[2])
          }
        }
      }

      tileUrl = tileUrl.replace('{key}', '').replace('{value}', '').replace('{type}', '')

      const decodeFunction = compileTileWorkerQueue(this)

      const processRawData = rawData => {
        if (isTileLayerDataStale(tileLayerData)) {
          resolve()
          return
        }

        if (rawData.byteLength <= 4) {
          resolve()
          return
        }

        const decodeData = { lId: dataLayerId, datas: [] }
        const rawDataDataView = new DataView(rawData)

        let rawDataOffset = 0
        let tileCount = rawDataDataView.getUint32(rawDataOffset, true)

        rawDataOffset += 4

        while (tileCount > 0) {
          const tileX = rawDataDataView.getUint32(rawDataOffset, true)
          rawDataOffset += 4

          const tileY = rawDataDataView.getUint32(rawDataOffset, true)
          rawDataOffset += 4

          const tileZ = rawDataDataView.getUint32(rawDataOffset, true)
          rawDataOffset += 4

          const detailZoom = rawDataDataView.getUint32(rawDataOffset, true)
          rawDataOffset += 4

          const dataSize = rawDataDataView.getUint32(rawDataOffset, true)
          rawDataOffset += 4

          decodeData.datas.push({
            x: tileX,
            y: tileY,
            z: tileZ,
            dZ: detailZoom,
            cD: this.options.disableDecode === true
              ? new DataView(new ArrayBuffer())
              : rawData.slice(rawDataOffset, rawDataOffset + dataSize)
          })

          rawDataOffset += dataSize
          tileCount--
        }

        globalThis.vms2Context.decodeQueue.push({
          dataLayerId,
          x,
          y,
          z,
          tileLayerData,
          decodeData,
          resolve
        })

        decodeFunction()
      }

      if (this.options.disableDecode === true) {
        processRawData(new ArrayBuffer(4))
      } else {
        if (isTileLayerDataStale(tileLayerData)) {
          resolve()
          return
        }

        const abortController = new AbortController()
        const tileCanvas = tileLayerData.tileCanvas

        addTileAbortController(tileCanvas, abortController)

        Promise.resolve()
          .then(() => fetch(new URL(tileUrl, window.location.origin), { signal: abortController.signal }))
          .then(response => {
            if (!response.ok) {
              console.warn('Tile request failed', response.status, response.statusText, tileUrl)
              resolve()
              return null
            }

            this.numberOfRequestedTiles++

            return response.arrayBuffer()
          })
          .then(rawData => {
            if (!rawData) {
              return
            }
            processRawData(rawData)
          })
          .catch(error => {
            if (error.code === 20 || error.name === 'AbortError') {
              resolve()
            } else {
              console.warn('Tile request error', error, tileUrl)
              resolve()
            }
          })
          .finally(() => {
            removeTileAbortController(tileCanvas, abortController)
          })
      }
    })
  },

  _getPattern: async function (context, patternName) {
    if (!globalThis.vms2Context.patternCache[patternName]) {
      let patternUrl = patternName

      if (!patternName.includes('http://') && !patternName.includes('https://')) {
        patternUrl = this.options.assetsUrl + '/images/patterns/' + patternName.replace(/file:\/\/[^/]*\//g, '')
      }

      const patternImage = await this._requestImage(patternUrl)

      const pattern = typeof context.createPattern === 'function'
        ? context.createPattern(patternImage, 'repeat')
        : createPatternDescriptor(patternImage, 'repeat')

      pattern.patternImage = patternImage

      if (typeof pattern.setTransform !== 'function') {
        pattern.setTransform = function (matrix) {
          this.transformMatrix = matrix
        }
      }

      if (typeof pattern.transformMatrix === 'undefined') {
        pattern.transformMatrix = null
      }

      globalThis.vms2Context.patternCache[patternName] = pattern
    }

    return globalThis.vms2Context.patternCache[patternName]
  }
}

export default resourceLoaderMethods
