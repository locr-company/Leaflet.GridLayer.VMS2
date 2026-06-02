/* eslint-disable no-underscore-dangle */
/* global DOMParser, FileReader, Image, L, XMLSerializer */

import MapOverlay from '../MapOverlay.js'
import PrintFormat from '../PrintFormat.js'
import { DEFAULT_PRINT_DPI } from './constants.js'

function removeMapOverlayMarkers (layer) {
  if (!layer._map) {
    return
  }

  for (const marker of layer.mapOverlayMarkerDatas) {
    layer._map.removeLayer(marker)
  }
}

function collectSvgUrlStrings (svgString) {
  const matches = [
    ...svgString.matchAll(/url\('((https?:\/\/[^\s']+)|(.*\/[^\s']+))'/g),
    ...svgString.matchAll(/href="((https?:\/\/[^\s"]+)|(.*\/[^\s"]+))"/g)
  ]

  return [...new Set(matches.map(match => match[1]))]
}

function fetchAsDataUrl (urlString) {
  return new Promise((resolve, reject) => {
    fetch(urlString)
      .then(response => response.blob())
      .then(blob => {
        const reader = new FileReader()

        reader.onloadend = function () {
          resolve(reader.result || urlString)
        }

        reader.onerror = function (event) {
          reject(event.target.error)
        }

        reader.readAsDataURL(blob)
      })
      .catch(reject)
  })
}

function clonePoiDataForMarker (poiData) {
  const clonedPoiData = {
    ...poiData,
    iconData: {
      ...(poiData.iconData ?? {})
    }
  }

  delete clonedPoiData.marker

  if (Array.isArray(poiData.iconData?.iconSize)) {
    clonedPoiData.iconData.iconSize = [...poiData.iconData.iconSize]
  }

  if (Array.isArray(poiData.iconData?.iconAnchor)) {
    clonedPoiData.iconData.iconAnchor = [...poiData.iconData.iconAnchor]
  }

  return clonedPoiData
}

const overlayMethods = {
  setPrintFormat: function (printFormat) {
    if (!(printFormat instanceof PrintFormat)) {
      throw new TypeError('printFormat is not an instance of PrintFormat')
    }

    this.printFormat = printFormat

    if (this._map) {
      this._map.invalidateSize()
      this._map.fire('resize')
    }
  },

  setMapOverlay: function (mapOverlay) {
    if (!(mapOverlay instanceof MapOverlay)) {
      throw new TypeError('mapOverlay is not an instance of MapOverlay')
    }

    this.mapOverlay = mapOverlay

    removeMapOverlayMarkers(this)
    this.mapOverlayMarkerDatas = []

    if (this._map) {
      this._rebuildMapOverlay()
    }
  },

  getPrintCanvas: async function () {
    if (!this.printFormat || !this._map) {
      throw (new Error('Missing essential parameters!'))
    }

    const printFormatSize = this.printFormat.getSize()

    let latitudeMin = this._map.getBounds().getSouth()
    let longitudeMin = this._map.getBounds().getWest()
    let latitudeMax = this._map.getBounds().getNorth()
    let longitudeMax = this._map.getBounds().getEast()

    const mapDegreesWidth = longitudeMax - longitudeMin
    const normalizedWidth = mapDegreesWidth / 360
    const normalizedHeight = this._latitudeToNormalized(latitudeMin) - this._latitudeToNormalized(latitudeMax)
    const mapRatio = normalizedWidth / normalizedHeight
    const printRatio = printFormatSize.width / printFormatSize.height

    if (printRatio <= mapRatio) {
      longitudeMin -= (mapDegreesWidth * printRatio / mapRatio - mapDegreesWidth) / 2
      longitudeMax += (mapDegreesWidth * printRatio / mapRatio - mapDegreesWidth) / 2
    } else {
      let normalizedMin = this._latitudeToNormalized(latitudeMin)
      let normalizedMax = this._latitudeToNormalized(latitudeMax)

      normalizedMin += (normalizedWidth / printRatio - normalizedHeight) / 2
      normalizedMax -= (normalizedWidth / printRatio - normalizedHeight) / 2

      latitudeMin = this._normalizedToLatitude(normalizedMin)
      latitudeMax = this._normalizedToLatitude(normalizedMax)
    }

    const mapInfo = {
      dpi: printFormatSize.dpi,
      style: this.options.style,

      latitudeMin,
      longitudeMin,
      latitudeMax,
      longitudeMax,

      width: printFormatSize.width,
      height: printFormatSize.height,

      mapScale: printFormatSize.printScale * DEFAULT_PRINT_DPI / printFormatSize.dpi,

      objectScale: this.options.objectScale,
      detailOffset: this.options.detailOffset,
      zoomRangeOffset: this.options.zoomRangeOffset
    }

    const mapCanvas = await this.getMapCanvas(mapInfo)

    if (!this.mapOverlay) {
      return mapCanvas
    }

    const printCanvas = document.createElement('canvas')

    printCanvas.width = printFormatSize.width
    printCanvas.height = printFormatSize.height

    const printCanvasContext = printCanvas.getContext('2d')
    printCanvasContext.drawImage(mapCanvas, 0, 0)

    const domParser = new DOMParser()
    const mapOverlaySvgElement = domParser.parseFromString(this.mapOverlayDiv.innerHTML, 'image/svg+xml').documentElement

    mapOverlaySvgElement.setAttribute('width', printFormatSize.width)
    mapOverlaySvgElement.setAttribute('height', printFormatSize.height)

    const poiDatas = this.mapOverlay.getPoiDatas()

    for (const poiData of poiDatas) {
      if (!poiData.marker) {
        continue
      }

      const markerPoint = this._map.project(poiData.marker.getLatLng())
      const pixelOrigin = this._map.project([latitudeMax, longitudeMin])
      const iconSvgElement = document.createElementNS('http://www.w3.org/2000/svg', 'image')

      const x = (markerPoint.x - pixelOrigin.x) * printFormatSize.printScale / (this.printMapScale ?? this.options.mapScale)
      const y = (markerPoint.y - pixelOrigin.y) * printFormatSize.printScale / (this.printMapScale ?? this.options.mapScale)

      iconSvgElement.setAttribute('href', poiData.iconData.iconUrl)
      iconSvgElement.setAttribute('x', x - poiData.iconData.iconAnchor[0] * printFormatSize.printScale)
      iconSvgElement.setAttribute('y', y - poiData.iconData.iconAnchor[1] * printFormatSize.printScale)
      iconSvgElement.setAttribute('width', poiData.iconData.iconSize[0] * printFormatSize.printScale)
      iconSvgElement.setAttribute('height', poiData.iconData.iconSize[1] * printFormatSize.printScale)

      mapOverlaySvgElement.insertBefore(iconSvgElement, mapOverlaySvgElement.firstChild)
    }

    const xmlSerializer = new XMLSerializer()
    let svgString = xmlSerializer.serializeToString(mapOverlaySvgElement)

    const replacements = await Promise.all(
      collectSvgUrlStrings(svgString).map(async urlString => {
        return [urlString, await fetchAsDataUrl(urlString)]
      })
    )

    for (const [urlString, dataUrl] of replacements) {
      svgString = svgString.replaceAll(urlString, dataUrl)
    }

    const mapOverlayImage = new Image()
    const mapOverlaySvgBlobUrl = URL.createObjectURL(new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' }))

    return await new Promise(resolve => {
      mapOverlayImage.src = mapOverlaySvgBlobUrl
      mapOverlayImage.addEventListener('load', () => {
        URL.revokeObjectURL(mapOverlaySvgBlobUrl)

        printCanvasContext.drawImage(mapOverlayImage, 0, 0)

        resolve(printCanvas)
      })
    })
  },

  _updateMapOverlayMarkerDatas: function () {
    const markerScale = this.printMapScale ?? this.options.mapScale

    removeMapOverlayMarkers(this)
    this.mapOverlayMarkerDatas = []

    const poiDatas = this.mapOverlay.getPoiDatas()

    for (const poiData of poiDatas) {
      const newPoiData = clonePoiDataForMarker(poiData)

      if (!Array.isArray(newPoiData.iconData.iconSize) || !Array.isArray(newPoiData.iconData.iconAnchor)) {
        continue
      }

      newPoiData.iconData.iconSize[0] *= markerScale
      newPoiData.iconData.iconSize[1] *= markerScale
      newPoiData.iconData.iconAnchor[0] *= markerScale
      newPoiData.iconData.iconAnchor[1] *= markerScale

      const latitude = poiData.marker?.getLatLng().lat ?? poiData.latitude
      const longitude = poiData.marker?.getLatLng().lng ?? poiData.longitude
      const marker = L.marker([latitude, longitude], { icon: L.icon(newPoiData.iconData) })

      marker.addTo(this._map)
      marker.dragging.enable()

      this.mapOverlayMarkerDatas.push(marker)

      poiData.marker = marker
    }
  },

  _rebuildMapOverlay: function () {
    if (this.mapOverlay) {
      if (!this.mapOverlayDiv.isConnected) {
        this._map.getContainer().appendChild(this.mapOverlayDiv)
      }
    } else if (this.mapOverlayDiv.isConnected) {
      this.mapOverlayDiv.remove()
    }

    if (this.printFormat) {
      const printFormatSize = this.printFormat.getSize()

      this.mapOverlayDiv.innerHTML = this.mapOverlay?.getSvgOverlay({
        width: printFormatSize.width,
        height: printFormatSize.height
      }) ?? ''
    }

    if (this.mapOverlay) {
      this._updateMapOverlayMarkerDatas()
    }
  },

  _onResize: function () {
    if (this.printFormat) {
      if (!this.printFormatMaskDiv.isConnected) {
        this._map.getContainer().appendChild(this.printFormatMaskDiv)
      }
    } else if (this.printFormatMaskDiv.isConnected) {
      this.printFormatMaskDiv.remove()
    }

    if (this.printFormat) {
      const printFormatSize = this.printFormat.getSize()
      const previousPrintMapScale = this.printMapScale ?? this.options.mapScale

      this.printMapScale = this.printFormat.calculateMapScale(this._map.getSize().x, this._map.getSize().y)
      this.printFormatMaskDiv.style.clipPath = this.printFormat.buildMaskForClipPath(this._map.getSize().x, this._map.getSize().y)

      let printFormatScaleRatio = 1

      if (this.previousPrintFormatSize) {
        printFormatScaleRatio = Math.sqrt(printFormatSize.width * printFormatSize.height) /
          Math.sqrt(this.previousPrintFormatSize.width * this.previousPrintFormatSize.height)
      }

      this.previousPrintFormatSize = printFormatSize

      const center = this._map.getCenter()
      const newZoom = this._map.getZoom() + Math.log(printFormatScaleRatio * this.printMapScale / previousPrintMapScale) / Math.log(this.options.zoomPowerBase)

      this._map._resetView(center, newZoom, true)

      this.redraw()
    }

    this._rebuildMapOverlay()
  }
}

export default overlayMethods
