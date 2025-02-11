import BaseMap from "./BaseMap.js"

export default class CreatePrintMapButton {
  /**
   * @param {BaseMap|LocrMapCustomerElement} baseMap
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

        const canvasWidth = canvasRight - canvasLeft
        const canvasHeight = canvasBottom - canvasTop

        const printFormatFactor = printFormatSize.width / canvasWidth

        const mapCanvasOptions = {
          width: canvasWidth * printFormatFactor,
          height: canvasHeight * printFormatFactor,
          dpi: 300 * printFormatFactor,

          latitudeMin: canvasLatLngMin.lat,
          longitudeMin: canvasLatLngMin.lng,
          latitudeMax: canvasLatLngMax.lat,
          longitudeMax: canvasLatLngMax.lng
        }
       
        baseMap.getMapCanvas(mapCanvasOptions).then(canvas => {
          const mapCanvas = document.getElementById('map-canvas')
          if (mapCanvas) {
            canvas.style.width = `${canvasWidth}px`

            mapCanvas.innerHTML = ''
            mapCanvas.appendChild(canvas)
          }
        })
      })
    }
  }
}
