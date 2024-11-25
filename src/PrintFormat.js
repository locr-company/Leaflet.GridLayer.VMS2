class PrintFormat {
  static DEFAULT_PRINT_DPI = 300
  static DEFAULT_UNIT_TYPE = 'px'

  static CM_PER_INCH = 2.54
  static MM_PER_INCH = 25.4

  static DEFAULT_PRINT_SCALE = 2 * 3604 / 2480

  unitTypeConversionFunctions = {
    'px': (width, height, dpi) => ({ width, height }),
    'cm': (width, height, dpi) => ({ width: width * dpi / PrintFormat.CM_PER_INCH, height: height * dpi / PrintFormat.CM_PER_INCH }),
    'mm': (width, height, dpi) => ({ width: width * dpi / PrintFormat.MM_PER_INCH, height: height * dpi / PrintFormat.MM_PER_INCH }),
    'in': (width, height, dpi) => ({ width: width * dpi, height: height * dpi }),
    'pt': (width, height, dpi) => ({ width: width * dpi / 72, height: height * dpi / 72 }),
    'pc': (width, height, dpi) => ({ width: width * dpi / 6, height: height * dpi / 6 }),
  }

  width = 0
  height = 0

  dpi = PrintFormat.DEFAULT_PRINT_DPI

  printScale = PrintFormat.DEFAULT_PRINT_SCALE

  constructor(printSizeInfo) {
    if (typeof printSizeInfo !== 'object' || printSizeInfo === null) {
      throw new TypeError('printSizeInfo must be an object')
    }

    if (isNaN(printSizeInfo.width) || isNaN(printSizeInfo.height)) {
      throw new ReferenceError('width and height values need to be defined')
    }

    if (printSizeInfo.width <= 0 || printSizeInfo.height <= 0) {
      throw new RangeError('width and height values need to be greater than 0')
    }

    this.dpi = printSizeInfo.dpi || PrintFormat.DEFAULT_PRINT_DPI

    this.printScale = printSizeInfo.printScale || PrintFormat.DEFAULT_PRINT_SCALE

    let unitTypeConversionFunction = this.unitTypeConversionFunctions[PrintFormat.DEFAULT_UNIT_TYPE]

    if (printSizeInfo.unitType) {
      unitTypeConversionFunction = this.unitTypeConversionFunctions[printSizeInfo.unitType]

      if (unitTypeConversionFunction === undefined) {
        throw new RangeError('invalid unit type')
      }
    }

    let convertedValues = unitTypeConversionFunction(printSizeInfo.width, printSizeInfo.height, this.dpi)

    this.width = convertedValues.width
    this.height = convertedValues.height
  }

  getSize() {
    return { 
      width: this.width, 
      height: this.height, 
      dpi: this.dpi,
      printScale: this.printScale 
    }
  }
}

export default PrintFormat
