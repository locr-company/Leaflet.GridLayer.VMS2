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
        const mapBounds = baseMap.getBounds()

        const mapCanvasOptions = {
          ...printFormat.getSize(),
          latitudeMin: mapBounds.getSouth(),
          longitudeMin: mapBounds.getWest(),
          latitudeMax: mapBounds.getNorth(),
          longitudeMax: mapBounds.getEast()
        }

        const mapContainerSize = baseMap.getMapContainerSize()
        const virtualMapSize = printFormat.calculateVirtualMapContainerSize(mapContainerSize.width, mapContainerSize.height)
        const mapSize = baseMap.getMapContainerSize()
        const mapSizeRatio = mapSize.width / mapSize.height
        const virtualMapSizeRatio = virtualMapSize.width / virtualMapSize.height
        if (mapSizeRatio > virtualMapSizeRatio) {
          const leftAndRightOffset = (mapSize.width - virtualMapSize.width) / 2
          const topLeft = baseMap.containerPointToLatLng({ x: leftAndRightOffset, y: 0 })
          const bottomRight = baseMap.containerPointToLatLng({ x: mapSize.width - leftAndRightOffset, y: mapSize.height })
          mapCanvasOptions.longitudeMin = topLeft.lng
          mapCanvasOptions.longitudeMax = bottomRight.lng
        } else if (mapSizeRatio < virtualMapSizeRatio) {
          const topAndBottomOffset = (mapSize.height - virtualMapSize.height) / 2
          const topLeft = baseMap.containerPointToLatLng({ x: 0, y: topAndBottomOffset })
          const bottomRight = baseMap.containerPointToLatLng({ x: mapSize.width, y: mapSize.height - topAndBottomOffset })
          mapCanvasOptions.latitudeMin = bottomRight.lat
          mapCanvasOptions.latitudeMax = topLeft.lat
        }

        baseMap.getMapCanvas(mapCanvasOptions).then(canvas => {
          const mapCanvas = document.getElementById('map-canvas')
          if (mapCanvas) {
            canvas.style.width = `${virtualMapSize.width}px`

            mapCanvas.innerHTML = ''
            mapCanvas.appendChild(canvas)
          }
        })
      })
    }
  }
}
