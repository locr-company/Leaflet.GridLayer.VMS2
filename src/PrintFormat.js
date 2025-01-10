export default class PrintFormat {
  static get DEFAULT_PRINT_DPI() { return 300 }
  static get DEFAULT_UNIT_TYPE() { return 'px' }

  static get CM_PER_INCH() { return 2.54 }
  static get MM_PER_INCH() { return 25.4 }

  static get DEFAULT_PRINT_SCALE() { return 2 * 3604 / 2480 }

  #unitTypeConversionFunctions = {
    'px': (width, height, dpi) => ({ width, height }),
    'cm': (width, height, dpi) => ({ width: width * dpi / PrintFormat.CM_PER_INCH, height: height * dpi / PrintFormat.CM_PER_INCH }),
    'mm': (width, height, dpi) => ({ width: width * dpi / PrintFormat.MM_PER_INCH, height: height * dpi / PrintFormat.MM_PER_INCH }),
    'in': (width, height, dpi) => ({ width: width * dpi, height: height * dpi }),
    'pt': (width, height, dpi) => ({ width: width * dpi / 72, height: height * dpi / 72 }),
    'pc': (width, height, dpi) => ({ width: width * dpi / 6, height: height * dpi / 6 }),
  }

  #width = 0
  #height = 0

  #dpi = PrintFormat.DEFAULT_PRINT_DPI

  #printScale = PrintFormat.DEFAULT_PRINT_SCALE

  /**
   * @param {{width: number, height: number, dpi?: number, printScale?: number, unitType?: 'px'|'cm'|'mm'|'in'|'pt'|'pc'}} printSizeInfo
   */
  constructor(printSizeInfo) {
    if (typeof printSizeInfo !== 'object' || printSizeInfo === null) {
      throw new TypeError('printSizeInfo must be an object')
    }

    if (isNaN(printSizeInfo.width) || isNaN(printSizeInfo.height)) {
      throw new ReferenceError('width and height values need to be defined')
    }

    if (typeof printSizeInfo.width !== 'number') {
      printSizeInfo.width = parseFloat(printSizeInfo.width)
    }
    if (typeof printSizeInfo.height !== 'number') {
      printSizeInfo.height = parseFloat(printSizeInfo.height)
    }

    if (printSizeInfo.width <= 0 || printSizeInfo.height <= 0) {
      throw new RangeError('width and height values need to be greater than 0')
    }

    if (!isNaN(printSizeInfo.dpi)) {
      if (typeof printSizeInfo.dpi !== 'number') {
        printSizeInfo.dpi = parseInt(printSizeInfo.dpi)
      }
      if (printSizeInfo.dpi <= 0) {
        throw new RangeError('dpi value needs to be greater than 0')
      }
      this.#dpi = printSizeInfo.dpi
    }

    if (!isNaN(printSizeInfo.printScale)) {
      if (typeof printSizeInfo.printScale !== 'number') {
        printSizeInfo.printScale = parseInt(printSizeInfo.printScale)
      }
      if (printSizeInfo.printScale <= 0) {
        throw new RangeError('printScale value needs to be greater than 0')
      }
      this.#printScale = printSizeInfo.printScale
    }

    let unitTypeConversionFunction = this.#unitTypeConversionFunctions[PrintFormat.DEFAULT_UNIT_TYPE]

    if (printSizeInfo.unitType) {
      unitTypeConversionFunction = this.#unitTypeConversionFunctions[printSizeInfo.unitType]
      if (unitTypeConversionFunction === undefined) {
        throw new ReferenceError('invalid unit type')
      }
    }

    const convertedValues = unitTypeConversionFunction(printSizeInfo.width, printSizeInfo.height, this.#dpi)

    this.#width = convertedValues.width
    this.#height = convertedValues.height
  }

  /**
   * @param {number} mapContainerWidth
   * @param {number} mapContainerHeight
   * @returns {string}
   */
  buildMaskForClipPath(mapContainerWidth, mapContainerHeight) {
    const size = this.getSize()

    const aspectRatio = size.width / size.height
    const mapContainerAspectRatio = mapContainerWidth / mapContainerHeight

    if (aspectRatio > mapContainerAspectRatio) {
      const topBorderPercent = 50 - mapContainerAspectRatio / aspectRatio * 50
      const bottomBorderPercent = 100 - topBorderPercent

      return `polygon(0% 0%, 100% 0%, 100% ${topBorderPercent}%, 0% ${topBorderPercent}%, 0% ${bottomBorderPercent}%, 100% ${bottomBorderPercent}%, 100% 100%, 0% 100%)`
    } else {
      const leftBorderPercent = 50 - aspectRatio / mapContainerAspectRatio * 50
      const rightBorderPercent = 100 - leftBorderPercent

      return `polygon(0% 100%, 0% 0%, ${leftBorderPercent}% 0%, ${leftBorderPercent}% 100%, ${rightBorderPercent}% 100%, ${rightBorderPercent}% 0%, 100% 0%, 100% 100%)`
    }
  }

  /**
   * @param {number} mapContainerWidth
   * @param {number} mapContainerHeight
   * @returns {number}
   */
  calculateMapScale(mapContainerWidth, mapContainerHeight) {
    const size = this.getSize()

    const aspectRatio = size.width / size.height
    const mapContainerAspectRatio = mapContainerWidth / mapContainerHeight

    if (aspectRatio > mapContainerAspectRatio) {
      return mapContainerWidth * size.printScale / size.width
    } else {
      return mapContainerHeight * size.printScale / size.height
    }
  }

  /**
   * @param {number} mapContainerWidth
   * @param {number} mapContainerHeight
   * @returns {{width: number, height: number}}
   */
  calculateVirtualMapContainerSize(mapContainerWidth, mapContainerHeight) {
    const virtualSize = {
      width: mapContainerWidth,
      height: mapContainerHeight
    }

    const size = this.getSize()

    const aspectRatio = size.width / size.height
    const mapContainerAspectRatio = mapContainerWidth / mapContainerHeight

    if (aspectRatio > mapContainerAspectRatio) {
      virtualSize.height *= mapContainerAspectRatio / aspectRatio
    } else {
      virtualSize.width *= aspectRatio / mapContainerAspectRatio
    }

    return virtualSize
  }

  /**
   * @returns {{width: number, height: number, dpi: number, printScale: number}}
   */
  getSize() {
    return {
      width: this.#width,
      height: this.#height,
      dpi: this.#dpi,
      printScale: this.#printScale
    }
  }
}
