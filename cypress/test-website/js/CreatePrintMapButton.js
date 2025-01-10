import BaseMap from "./BaseMap.js"

export default class CreatePrintMapButton {
  /**
   * @param {BaseMap} baseMap
   */
  static init(baseMap) {
    const createPrintMapButton = document.getElementById('create-print-map')
    if (createPrintMapButton) {
      createPrintMapButton.addEventListener('click', () => {
        baseMap.getPrintCanvas().then(canvas => {
          const printMap = document.getElementById('print-map')
          if (printMap) {
            const printFormat = baseMap.getPrintFormat()
            const mapContainerSize = baseMap.getMapContainerSize()
            const virtualMapSize = printFormat.calculateVirtualMapContainerSize(mapContainerSize.width, mapContainerSize.height)
            canvas.style.width = `${virtualMapSize.width}px`

            printMap.innerHTML = ''
            printMap.appendChild(canvas)
          }
        })
      })
    }
  }
}
