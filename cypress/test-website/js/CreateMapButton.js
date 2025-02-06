import BaseMap from "./BaseMap.js"

export default class CreatePrintMapButton {
  /**
   * @param {BaseMap} baseMap
   */
  static init(baseMap) {
    const createMapButton = document.getElementById('create-map')
    if (createMapButton) {
      createMapButton.addEventListener('click', () => {
        const printFormat = baseMap.getPrintFormat()
        const printFormatSize = printFormat.getSize()
        const printRatio = printFormatSize.width / printFormatSize.height

        const mapPixelBounds = baseMap.getPixelBounds()
        const mapWidth = mapPixelBounds.max.x - mapPixelBounds.min.x
        const mapHeight = mapPixelBounds.max.y - mapPixelBounds.min.y
        const mapRatio = mapWidth / mapHeight

        let canvasLeft
        let canvasRight
        let canvasTop
        let canvasBottom

        if(mapRatio > printRatio) {
          canvasLeft = mapPixelBounds.min.x + (mapWidth - mapHeight * printRatio) / 2
          canvasRight = mapPixelBounds.max.x - (mapWidth - mapHeight * printRatio) / 2
          canvasTop = mapPixelBounds.min.y
          canvasBottom = mapPixelBounds.max.y
        } else {
          canvasLeft = mapPixelBounds.min.x
          canvasRight = mapPixelBounds.max.x
          canvasTop = mapPixelBounds.min.y + (mapHeight - mapWidth / printRatio) / 2
          canvasBottom = mapPixelBounds.max.y - (mapHeight - mapWidth / printRatio) / 2
        }

        const canvasLatLngMin = baseMap.pointToLatLng({ x: canvasLeft, y: canvasBottom })
        const canvasLatLngMax = baseMap.pointToLatLng({ x: canvasRight, y: canvasTop })

        const mapCanvasOptions = {
          width: canvasRight - canvasLeft,
          height: canvasBottom - canvasTop,

          latitudeMin: canvasLatLngMin.lat,
          longitudeMin: canvasLatLngMin.lng,
          latitudeMax: canvasLatLngMax.lat,
          longitudeMax: canvasLatLngMax.lng
        }

        /*
        mapCanvasOptions.width *= 2
        mapCanvasOptions.height *= 2
        mapCanvasOptions.dpi = 300 * 2
        */
       
        baseMap.getMapCanvas(mapCanvasOptions).then(canvas => {
          const mapCanvas = document.getElementById('map-canvas')
          if (mapCanvas) {
            canvas.style.width = `${mapCanvasOptions.width}px`

            mapCanvas.innerHTML = ''
            mapCanvas.appendChild(canvas)
          }
        })
      })
    }
  }
}
