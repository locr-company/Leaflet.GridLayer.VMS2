import assert from 'assert'
import { expect } from 'chai'

import PrintFormat from '../src/PrintFormat.js'

describe('PrintFormat', () => {
  it('constructs a PrintFormat object with minimum required values', () => {
    const printFormat = new PrintFormat({width: 100, height: 200})
    expect(printFormat.getSize()).to.deep.equal({width: 100, height: 200, dpi: PrintFormat.DEFAULT_PRINT_DPI, printScale: PrintFormat.DEFAULT_PRINT_SCALE})
  })

  it('constructs a PrintFormat object with minimum required values (input values are strings)', () => {
    const printFormat = new PrintFormat({width: '100', height: '200'})
    expect(printFormat.getSize()).to.deep.equal({width: 100, height: 200, dpi: PrintFormat.DEFAULT_PRINT_DPI, printScale: PrintFormat.DEFAULT_PRINT_SCALE})
  })

  it('constructs a PrintFormat object with minimum width and height values', () => {
    const printFormatMinWidthHeight = new PrintFormat({width: 1, height: 1})
    expect(printFormatMinWidthHeight.getSize()).to.deep.equal({width: 1, height: 1, dpi: PrintFormat.DEFAULT_PRINT_DPI, printScale: PrintFormat.DEFAULT_PRINT_SCALE})
  })

  it('constructs a PrintFormat object with more values', () => {
    const printFormat = new PrintFormat({width: 100, height: 200, dpi: 72, printScale: 1})
    expect(printFormat.getSize()).to.deep.equal({width: 100, height: 200, dpi: 72, printScale: 1})
  })

  it('constructs a PrintFormat object with minimum dpi value', () => {
    const printFormat = new PrintFormat({width: 100, height: 200, dpi: 1})
    expect(printFormat.getSize()).to.deep.equal({width: 100, height: 200, dpi: 1, printScale: PrintFormat.DEFAULT_PRINT_SCALE})
  })

  it('constructs a PrintFormat object with stringed dpi value', () => {
    const printFormat = new PrintFormat({width: 100, height: 200, dpi: '72'})
    expect(printFormat.getSize()).to.deep.equal({width: 100, height: 200, dpi: 72, printScale: PrintFormat.DEFAULT_PRINT_SCALE})
  })

  it('constructs a PrintFormat object with very low printScale value', () => {
    const printFormat = new PrintFormat({width: 100, height: 200, printScale: 0.000000001})
    expect(printFormat.getSize()).to.deep.equal({width: 100, height: 200, dpi: PrintFormat.DEFAULT_PRINT_DPI, printScale: 0.000000001})
  })

  it('constructs a PrintFormat object with stringed printScale value', () => {
    const printFormat = new PrintFormat({width: 100, height: 200, printScale: '2'})
    expect(printFormat.getSize()).to.deep.equal({width: 100, height: 200, dpi: PrintFormat.DEFAULT_PRINT_DPI, printScale: 2})
  })

  it('constructs a PrintFormat object with different unitType values', () => {
    const printFormatPx = new PrintFormat({width: 100, height: 200, unitType: 'px'})
    expect(printFormatPx.getSize()).to.deep.equal({width: 100, height: 200, dpi: PrintFormat.DEFAULT_PRINT_DPI, printScale: PrintFormat.DEFAULT_PRINT_SCALE})

    const printFormatCm = new PrintFormat({width: 14.8, height: 21, unitType: 'cm'})
    expect(printFormatCm.getSize()).to.deep.equal({width: 1748.0314960629921, height: 2480.314960629921, dpi: PrintFormat.DEFAULT_PRINT_DPI, printScale: PrintFormat.DEFAULT_PRINT_SCALE})

    const printFormatMm = new PrintFormat({width: 148, height: 210, unitType: 'mm'})
    expect(printFormatMm.getSize()).to.deep.equal({width: 1748.0314960629921, height: 2480.314960629921, dpi: PrintFormat.DEFAULT_PRINT_DPI, printScale: PrintFormat.DEFAULT_PRINT_SCALE})

    const printFormatIn = new PrintFormat({width: 5.5, height: 8.5, unitType: 'in'})
    expect(printFormatIn.getSize()).to.deep.equal({width: 1650, height: 2550, dpi: PrintFormat.DEFAULT_PRINT_DPI, printScale: PrintFormat.DEFAULT_PRINT_SCALE})

    const printFormatPt = new PrintFormat({width: 100, height: 200, unitType: 'pt'})
    expect(printFormatPt.getSize()).to.deep.equal({width: 416.6666666666667, height: 833.3333333333334, dpi: PrintFormat.DEFAULT_PRINT_DPI, printScale: PrintFormat.DEFAULT_PRINT_SCALE})

    const printFormatPc = new PrintFormat({width: 100, height: 200, unitType: 'pc'})
    expect(printFormatPc.getSize()).to.deep.equal({width: 5000, height: 10000, dpi: PrintFormat.DEFAULT_PRINT_DPI, printScale: PrintFormat.DEFAULT_PRINT_SCALE})
  })

  it('constructs a PrintFormat object with different unitType values and another dpi value', () => {
    const printFormatPx = new PrintFormat({width: 100, height: 200, dpi: 72, unitType: 'px'})
    expect(printFormatPx.getSize()).to.deep.equal({width: 100, height: 200, dpi: 72, printScale: PrintFormat.DEFAULT_PRINT_SCALE})

    const printFormatCm = new PrintFormat({width: 14.8, height: 21, dpi: 72, unitType: 'cm'})
    expect(printFormatCm.getSize()).to.deep.equal({width: 419.52755905511816, height: 595.275590551181, dpi: 72, printScale: PrintFormat.DEFAULT_PRINT_SCALE})

    const printFormatMm = new PrintFormat({width: 148, height: 210, dpi: 72, unitType: 'mm'})
    expect(printFormatMm.getSize()).to.deep.equal({width: 419.52755905511816, height: 595.2755905511812, dpi: 72, printScale: PrintFormat.DEFAULT_PRINT_SCALE})

    const printFormatIn = new PrintFormat({width: 5.5, height: 8.5, dpi: 72, unitType: 'in'})
    expect(printFormatIn.getSize()).to.deep.equal({width: 396, height: 612, dpi: 72, printScale: PrintFormat.DEFAULT_PRINT_SCALE})

    const printFormatPt = new PrintFormat({width: 100, height: 200, dpi: 72, unitType: 'pt'})
    expect(printFormatPt.getSize()).to.deep.equal({width: 100, height: 200, dpi: 72, printScale: PrintFormat.DEFAULT_PRINT_SCALE})

    const printFormatPc = new PrintFormat({width: 100, height: 200, dpi: 72, unitType: 'pc'})
    expect(printFormatPc.getSize()).to.deep.equal({width: 1200, height: 2400, dpi: 72, printScale: PrintFormat.DEFAULT_PRINT_SCALE})
  })

  it('constructor with no printSizeInfo throws an error', () => {
    assert.throws(() => new PrintFormat(), TypeError)
  })

  it('constructor with invalid width or height types throws an error', () => {
    assert.throws(() => new PrintFormat({width: 'a', height: 200}), ReferenceError)
    assert.throws(() => new PrintFormat({width: 100, height: 'b'}), ReferenceError)
  })

  it('constructor with invalid width or height values throws an error', () => {
    assert.throws(() => new PrintFormat({width: 0, height: 200}), RangeError)
    assert.throws(() => new PrintFormat({width: 100, height: 0}), RangeError)
  })

  it('constructor with invalid dpi value throws an error', () => {
    assert.throws(() => new PrintFormat({width: 100, height: 200, dpi: 0}), RangeError)
    assert.throws(() => new PrintFormat({width: 100, height: 200, dpi: -1}), RangeError)
    assert.throws(() => new PrintFormat({width: 100, height: 200, dpi: -1000000}), RangeError)
  })

  it('constructor with invalid printScale value throws an error', () => {
    assert.throws(() => new PrintFormat({width: 100, height: 200, printScale: 0}), RangeError)
    assert.throws(() => new PrintFormat({width: 100, height: 200, printScale: -1}), RangeError)
    assert.throws(() => new PrintFormat({width: 100, height: 200, printScale: -1000000}), RangeError)
  })

  it('constructs with invalid unitType value throws an error', () => {
    assert.throws(() => new PrintFormat({width: 100, height: 200, unitType: 'foo'}), ReferenceError)
  })

  it('static values are not writable', () => {
    assert.throws(() => PrintFormat.DEFAULT_PRINT_DPI = 72, TypeError)
    assert.throws(() => PrintFormat.DEFAULT_PRINT_SCALE = 1, TypeError)
    assert.throws(() => PrintFormat.DEFAULT_UNIT_TYPE = 'foo', TypeError)
    assert.throws(() => PrintFormat.CM_PER_INCH = 1, TypeError)
    assert.throws(() => PrintFormat.MM_PER_INCH = 1, TypeError)
  })

  it('buildMaskForClipPath() returns a correct portrait polygon string', () => {
    const printFormat = new PrintFormat({width: 14.8, height: 21, unitType: 'cm'})
    
    const mask = printFormat.buildMaskForClipPath(500, 500)
    expect(mask).to.equal('polygon(0% 100%, 0% 0%, 14.76190476190476% 0%, 14.76190476190476% 100%, 85.23809523809524% 100%, 85.23809523809524% 0%, 100% 0%, 100% 100%)')
  })

  it('buildMaskForClipPath() returns a correct landscape polygon string', () => {
    const printFormat = new PrintFormat({width: 21, height: 14.8, unitType: 'cm'})
    
    const mask = printFormat.buildMaskForClipPath(500, 500)
    expect(mask).to.equal('polygon(0% 0%, 100% 0%, 100% 14.76190476190476%, 0% 14.76190476190476%, 0% 85.23809523809524%, 100% 85.23809523809524%, 100% 100%, 0% 100%)')
  })

  it('calculateMapScale() returns a correct map scale for portrait', () => {
    const printFormat = new PrintFormat({width: 14.8, height: 21, unitType: 'cm'})
    
    const mapScale = printFormat.calculateMapScale(500, 500)
    expect(mapScale).to.equal(0.5859037378392217)
  })

  it('calculateMapScale() returns a correct map scale for landscape', () => {
    const printFormat = new PrintFormat({width: 21, height: 14.8, unitType: 'cm'})
    
    const mapScale = printFormat.calculateMapScale(500, 500)
    expect(mapScale).to.equal(0.5859037378392217)
  })

  it('calculateVirtualMapContainerSize() returns a correct size for portrait', () => {
    const printFormat = new PrintFormat({width: 14.8, height: 21, unitType: 'cm'})
    
    const size = printFormat.calculateVirtualMapContainerSize(500, 500)
    expect(size).to.deep.equal({width: 352.3809523809524, height: 500})
  })

  it('calculateVirtualMapContainerSize() returns a correct size for landscape', () => {
    const printFormat = new PrintFormat({width: 21, height: 14.8, unitType: 'cm'})
    
    const size = printFormat.calculateVirtualMapContainerSize(500, 500)
    expect(size).to.deep.equal({width: 500, height: 352.3809523809524})
  })
})
