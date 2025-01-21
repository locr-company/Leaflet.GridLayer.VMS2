import assert from 'assert'
import { expect } from 'chai'
import 'jsdom-global/register.js'
import { JSDOM } from 'jsdom'

import MapOverlay, { CustomFontFace, ImageSvgLayer, SvgLayer, TextSvgLayer } from '../src/MapOverlay.js'

describe('MapOverlay', () => {
  before(function() {
    const dom = new JSDOM()
    global.DOMParser = dom.window.DOMParser
  })

  describe('default (MapOverlay)', () => {
    it('constructs a MapOverlay object', () => {
      const mapOverlay = new MapOverlay({ width: 100, height: 200 })

      expect(mapOverlay.width).to.be.equals(100)
      expect(mapOverlay.height).to.be.equals(200)
    })

    it('constructs a MapOverlay object with valid numerical string values', () => {
      const mapOverlay = new MapOverlay({ width: '100', height: '200' })

      expect(mapOverlay.width).to.be.equals(100)
      expect(mapOverlay.height).to.be.equals(200)
    })

    it('constructor with no mapData throws an error', () => {
      assert.throws(() => new MapOverlay(), TypeError)
    })

    it('constructor with null mapData throws an error', () => {
      assert.throws(() => new MapOverlay(null), TypeError)
    })

    it('constructor with non-object mapData throws an error', () => {
      assert.throws(() => new MapOverlay('string'), TypeError)
    })

    it('constructor with no width property throws an error', () => {
      assert.throws(() => new MapOverlay({}), ReferenceError)
    })

    it('constructor with no height property throws an error', () => {
      assert.throws(() => new MapOverlay({ width: 100 }), ReferenceError)
    })

    it('constructor with non-number width property throws an error', () => {
      assert.throws(() => new MapOverlay({ width: 'a', height: 200 }), ReferenceError)
    })

    it('constructor with non-number height property throws an error', () => {
      assert.throws(() => new MapOverlay({ width: 100, height: 'b' }), ReferenceError)
    })

    it('constructor with invalid width property throws an error', () => {
      assert.throws(() => new MapOverlay({ width: 0, height: 200 }), RangeError)
      assert.throws(() => new MapOverlay({ width: -1, height: 200 }), RangeError)
      assert.throws(() => new MapOverlay({ width: -1000000, height: 200 }), RangeError)
    })

    it('constructor with invalid height property throws an error', () => {
      assert.throws(() => new MapOverlay({ width: 100, height: 0 }), RangeError)
      assert.throws(() => new MapOverlay({ width: 100, height: -1 }), RangeError)
      assert.throws(() => new MapOverlay({ width: 100, height: -1000000 }), RangeError)
    })

    it('getSvgOverlay with no layers', () => {
      const mapData = { width: 100, height: 200 }
      const mapOverlay = new MapOverlay(mapData)

      const expectedSvg1 = `<svg x="0" y="0" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${mapData.width} ${mapData.height}" preserveAspectRatio="xMidYMid meet">\n</svg>`
      expect(mapOverlay.getSvgOverlay()).to.be.equals(expectedSvg1)

      const getSvgOverlaySizeOption = { width: 50, height: 50 }
      const expectedSvg2 = `<svg x="0" y="0" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${getSvgOverlaySizeOption.width} ${getSvgOverlaySizeOption.height}" preserveAspectRatio="xMidYMid meet">\n</svg>`
      expect(mapOverlay.getSvgOverlay(getSvgOverlaySizeOption)).to.be.equals(expectedSvg2)
    })

    it('getSvgOverlay with a SvgLayer object', () => {
      const mapData = { width: 100, height: 200 }
      const mapOverlay = new MapOverlay(mapData)
      const rawSvg = '<g><text x="50%" y="85%">Hello World!</text></g>'
      const svgLayer = new SvgLayer(rawSvg)

      mapOverlay.add(svgLayer)

      expect(mapOverlay.getSvgOverlay()).to.be.equals(`<svg x="0" y="0" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${mapData.width} ${mapData.height}" preserveAspectRatio="xMidYMid meet">\n${rawSvg}\n</svg>`)
    })

    it('getSvgOverlay with an invalid width option', () => {
      const mapOverlay = new MapOverlay({ width: 100, height: 200 })

      assert.throws(() => mapOverlay.getSvgOverlay({ width: 'a' }), TypeError)
    })

    it('getSvgOverlay with an invalid height option', () => {
      const mapOverlay = new MapOverlay({ width: 100, height: 200 })

      assert.throws(() => mapOverlay.getSvgOverlay({ height: 'b' }), TypeError)
    })

    it('add method with a non-SvgLayer object throws an error', () => {
      const mapOverlay = new MapOverlay({ width: 100, height: 200 })

      assert.throws(() => mapOverlay.add({}), TypeError)
    })

    it('addOrReplace method with a non-SvgLayer object throws an error', () => {
      const mapOverlay = new MapOverlay({ width: 100, height: 200 })

      assert.throws(() => mapOverlay.addOrReplace({}), TypeError)
    })

    it('addOrReplace method with a SvgLayer object replaces the layer with the same id', () => {
      const mapOverlay = new MapOverlay({ width: 100, height: 200 })

      const rawSvg1 = '<g id="1">some layer</g>'
      const svgLayer1 = new SvgLayer(rawSvg1)
      const textSvgLayer2 = new TextSvgLayer({ text: 'Hello, world!', x: '100', y: '200', id: '2' })

      mapOverlay.add(svgLayer1)
      mapOverlay.add(textSvgLayer2)

      const expectedSvgBeforeReplace = `<svg x="0" y="0" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 200" preserveAspectRatio="xMidYMid meet">\n${rawSvg1}\n${textSvgLayer2.getSvgSource()}\n</svg>`
      expect(mapOverlay.getSvgOverlay()).to.be.equals(expectedSvgBeforeReplace)

      const textSvgLayer3 = new TextSvgLayer({ text: 'Foo Bar', x: '100', y: '200', id: '2' })
      mapOverlay.addOrReplace(textSvgLayer3)

      const expectedSvgAfterReplace = `<svg x="0" y="0" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 200" preserveAspectRatio="xMidYMid meet">\n${rawSvg1}\n${textSvgLayer3.getSvgSource()}\n</svg>`
      expect(mapOverlay.getSvgOverlay()).to.be.equals(expectedSvgAfterReplace)
    })

    it('addOrReplace method with a SvgLayer object added the layer where the id does not exists, yet', () => {
      const mapOverlay = new MapOverlay({ width: 100, height: 200 })

      const rawSvg1 = '<g id="1">some layer</g>'
      const svgLayer1 = new SvgLayer(rawSvg1)
      const textSvgLayer2 = new TextSvgLayer({ text: 'Hello, world!', x: '100', y: '200', id: '2' })

      mapOverlay.add(svgLayer1)
      mapOverlay.add(textSvgLayer2)

      const expectedSvgBeforeReplace = `<svg x="0" y="0" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 200" preserveAspectRatio="xMidYMid meet">\n${rawSvg1}\n${textSvgLayer2.getSvgSource()}\n</svg>`
      expect(mapOverlay.getSvgOverlay()).to.be.equals(expectedSvgBeforeReplace)

      const textSvgLayer3 = new TextSvgLayer({ text: 'Foo Bar', x: '100', y: '200', id: '3' })
      mapOverlay.addOrReplace(textSvgLayer3)

      const expectedSvgAfterReplace = `<svg x="0" y="0" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 200" preserveAspectRatio="xMidYMid meet">\n${rawSvg1}\n${textSvgLayer2.getSvgSource()}\n${textSvgLayer3.getSvgSource()}\n</svg>`
      expect(mapOverlay.getSvgOverlay()).to.be.equals(expectedSvgAfterReplace)
    })

    it('addOrReplace method with a SvgLayer object added the layer where no id exists', () => {
      const mapOverlay = new MapOverlay({ width: 100, height: 200 })

      const rawSvg1 = '<g id="1">some layer</g>'
      const svgLayer1 = new SvgLayer(rawSvg1)
      const textSvgLayer2 = new TextSvgLayer({ text: 'Hello, world!', x: '100', y: '200', id: '2' })

      mapOverlay.add(svgLayer1)
      mapOverlay.add(textSvgLayer2)

      const expectedSvgBeforeReplace = `<svg x="0" y="0" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 200" preserveAspectRatio="xMidYMid meet">\n${rawSvg1}\n${textSvgLayer2.getSvgSource()}\n</svg>`
      expect(mapOverlay.getSvgOverlay()).to.be.equals(expectedSvgBeforeReplace)

      const textSvgLayer3 = new TextSvgLayer({ text: 'Foo Bar', x: '100', y: '200' })
      mapOverlay.addOrReplace(textSvgLayer3)

      const expectedSvgAfterReplace = `<svg x="0" y="0" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 200" preserveAspectRatio="xMidYMid meet">\n${rawSvg1}\n${textSvgLayer2.getSvgSource()}\n${textSvgLayer3.getSvgSource()}\n</svg>`
      expect(mapOverlay.getSvgOverlay()).to.be.equals(expectedSvgAfterReplace)
    })

    it('replaceTextContent method with a non-string id throws an error', () => {
      const mapOverlay = new MapOverlay({ width: 100, height: 200 })

      assert.throws(() => mapOverlay.replaceTextContent(1), TypeError)
    })

    it('replaceTextContent method with a non-string textContent throws an error', () => {
      const mapOverlay = new MapOverlay({ width: 100, height: 200 })

      assert.throws(() => mapOverlay.replaceTextContent('1', 1), TypeError)
    })

    it('replaceTextContent method with a non-existing id throws an error', () => {
      const mapOverlay = new MapOverlay({ width: 100, height: 200 })

      const textSvgLayer = new TextSvgLayer({ text: 'Hello, world!', x: '100', y: '200', id: '1' })

      mapOverlay.add(textSvgLayer)

      const expectedSvg = `<svg x="0" y="0" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 200" preserveAspectRatio="xMidYMid meet">\n${textSvgLayer.getSvgSource()}\n</svg>`
      expect(mapOverlay.getSvgOverlay()).to.be.equals(expectedSvg)

      assert.throws(() => mapOverlay.replaceTextContent('2', 'foo'), ReferenceError)
    })

    it('replaceTextContent method with a existing id replaces text', () => {
      const mapOverlay = new MapOverlay({ width: 100, height: 200 })

      const textSvgLayer = new TextSvgLayer({ text: 'Hello, world!', x: '100', y: '200', id: '1' })

      mapOverlay.add(textSvgLayer)

      const expectedSvgBeforeTextReplacement = `<svg x="0" y="0" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 200" preserveAspectRatio="xMidYMid meet">\n${textSvgLayer.getSvgSource()}\n</svg>`
      expect(mapOverlay.getSvgOverlay()).to.be.equals(expectedSvgBeforeTextReplacement)

      mapOverlay.replaceTextContent('1', 'foo')

      const expectedTextSvgLayerAfterReplacement = new TextSvgLayer({ text: 'foo', x: '100', y: '200', id: '1' })

      const expectedSvgAfterTextReplacement = `<svg x="0" y="0" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 200" preserveAspectRatio="xMidYMid meet">\n${expectedTextSvgLayerAfterReplacement.getSvgSource()}\n</svg>`
      expect(mapOverlay.getSvgOverlay()).to.be.equals(expectedSvgAfterTextReplacement)
    })
  })

  describe('SvgLayer', () => {
    it('constructs an empty SVG layer', () => {
      const svgLayer = new SvgLayer()

      expect(svgLayer.getSvgSource()).to.be.equals('')
    })

    it('constructs an SVG layer with a source', () => {
      const svgString = '<circle cx="50" cy="50" r="40" stroke="black" stroke-width="3" fill="red" />'
      const svgLayer = new SvgLayer(svgString)

      expect(svgLayer.getSvgSource()).to.be.equals(svgString)
    })

    it('constructor with a number as svgString throws an error', () => {
      assert.throws(() => new SvgLayer(1), TypeError)
    })
  })

  describe('TextSvgLayer', () => {
    it('constructs a basic text SVG layer', () => {
      const textInfo = {
        text: 'Hello, world!',
        x: '100',
        y: '200'
      }

      const textLayer = new TextSvgLayer(textInfo)

      expect(textLayer.getSvgSource()).to.be.equals('<text x="100" y="200">Hello, world!</text>')
    })

    it('constructor with no textInfo throws an error', () => {
      assert.throws(() => new TextSvgLayer(), TypeError)
    })

    it('constructor with null textInfo throws an error', () => {
      assert.throws(() => new TextSvgLayer(null), TypeError)
    })

    it('constructor with non-object textInfo throws an error', () => {
      assert.throws(() => new TextSvgLayer('string'), TypeError)
    })

    it('constructor with no text property throws an error', () => {
      assert.throws(() => new TextSvgLayer({}), TypeError)
    })

    it('constructor with non-string text property throws an error', () => {
      assert.throws(() => new TextSvgLayer({ text: 123 }), TypeError)
    })

    it('constructor with no x property throws an error', () => {
      assert.throws(() => new TextSvgLayer({ text: 'Hello, world!' }), TypeError)
    })

    it('constructor with non-string or non-number x property throws an error', () => {
      assert.throws(() => new TextSvgLayer({ text: 'Hello, world!', x: {} }), TypeError)
    })

    it('constructor with no y property throws an error', () => {
      assert.throws(() => new TextSvgLayer({ text: 'Hello, world!', x: '100' }), TypeError)
    })

    it('constructor with non-string or non-number y property throws an error', () => {
      assert.throws(() => new TextSvgLayer({ text: 'Hello, world!', x: '100', y: {} }), TypeError)
    })

    it('constructor with additional properties', () => {
      const textInfo = {
        text: 'Hello, world!',
        x: '100',
        y: '200',
        fill: 'red'
      }

      const textLayer = new TextSvgLayer(textInfo)

      expect(textLayer.getSvgSource()).to.be.equals('<text x="100" y="200" fill="red">Hello, world!</text>')
    })

    it('constructor with special characters in the text property', () => {
      const textInfo = {
        text: '<Hello>, "&world"!',
        x: '1&0"0',
        y: '20<0>'
      }

      const expectedSvg = document.createElement('text')
      expectedSvg.textContent = textInfo.text
      expectedSvg.setAttribute('x', textInfo.x)
      expectedSvg.setAttribute('y', textInfo.y)

      const textLayer = new TextSvgLayer(textInfo)

      expect(textLayer.getSvgSource()).to.be.equals(expectedSvg.outerHTML)
      expect(textLayer.getSvgSource()).to.be.equals('<text x="1&amp;0&quot;0" y="20<0>">&lt;Hello&gt;, "&amp;world"!</text>')
    })

    it('constructor with multiple lines of text', () => {
      const textInfo = {
        text: 'Hello\nWorld!\nHow are you?',
        x: '100',
        y: '200'
      }

      const expectedSvg = document.createElement('text')
      const lineSplittedText = textInfo.text.split('\n')
      if (lineSplittedText.length > 1) {
        for (const lineIndex in lineSplittedText) {
          const tspan = document.createElement('tspan')
          tspan.textContent = lineSplittedText[lineIndex]
          tspan.setAttribute('x', textInfo.x)
          if (lineIndex > 0) {
            tspan.setAttribute('dy', `1.2em`)
          }
          expectedSvg.appendChild(tspan)
        }
      } else {
        expectedSvg.textContent = textInfo.text
      }
      expectedSvg.setAttribute('x', textInfo.x)
      expectedSvg.setAttribute('y', textInfo.y)

      const textLayer = new TextSvgLayer(textInfo)

      expect(textLayer.getSvgSource()).to.be.equals(expectedSvg.outerHTML)
      expect(textLayer.getSvgSource()).to.be.equals('<text x="100" y="200"><tspan x="100">Hello</tspan><tspan x="100" dy="1.2em">World!</tspan><tspan x="100" dy="1.2em">How are you?</tspan></text>')
    })
  })

  describe('ImageSvgLayer', () => {
    it('constructs a basic image SVG layer', () => {
      const imageInfo = {
        href: 'cup_of_coffee.jpeg',
        x: '200',
        y: '200'
      }

      const imageLayer = new ImageSvgLayer(imageInfo)

      expect(imageLayer.getSvgSource()).to.be.equals('<image href="cup_of_coffee.jpeg" x="200" y="200"></image>')
    })

    it('constructor with no imageInfo throws an error', () => {
      assert.throws(() => new ImageSvgLayer(), TypeError)
    })

    it('constructor with null imageInfo throws an error', () => {
      assert.throws(() => new ImageSvgLayer(null), TypeError)
    })

    it('constructor with non-object imageInfo throws an error', () => {
      assert.throws(() => new ImageSvgLayer('string'), TypeError)
    })

    it('constructor with no text property throws an error', () => {
      assert.throws(() => new ImageSvgLayer({}), TypeError)
    })

    it('constructor with non-string href property throws an error', () => {
      assert.throws(() => new ImageSvgLayer({ href: 123 }), TypeError)
    })

    it('constructor with no x property throws an error', () => {
      assert.throws(() => new ImageSvgLayer({ href: 'cup_of_coffee.jpeg' }), TypeError)
    })

    it('constructor with non-string or non-number x property throws an error', () => {
      assert.throws(() => new ImageSvgLayer({ href: 'cup_of_coffee.jpeg', x: {} }), TypeError)
    })

    it('constructor with no y property throws an error', () => {
      assert.throws(() => new ImageSvgLayer({ href: 'cup_of_coffee.jpeg', x: '100' }), TypeError)
    })

    it('constructor with non-string or non-number y property throws an error', () => {
      assert.throws(() => new ImageSvgLayer({ href: 'cup_of_coffee.jpeg', x: '100', y: {} }), TypeError)
    })

    it('constructor with additional properties', () => {
      const imageInfo = {
        href: 'cup_of_coffee.jpeg',
        x: '100',
        y: '200',
        width: '100',
        height: '100'
      }

      const imageLayer = new ImageSvgLayer(imageInfo)

      expect(imageLayer.getSvgSource()).to.be.equals('<image href="cup_of_coffee.jpeg" x="100" y="200" width="100" height="100"></image>')
    })

    it('constructor with special characters in the href property', () => {
      const imageInfo = {
        href: 'cup_of_">coffee.jpeg',
        x: '100',
        y: '200'
      }

      const expectedSvg = document.createElement('image')
      expectedSvg.setAttribute('href', imageInfo.href)
      expectedSvg.setAttribute('x', imageInfo.x)
      expectedSvg.setAttribute('y', imageInfo.y)

      const imageLayer = new ImageSvgLayer(imageInfo)

      expect(imageLayer.getSvgSource()).to.be.equals(expectedSvg.outerHTML)
      expect(imageLayer.getSvgSource()).to.be.equals('<image href="cup_of_&quot;>coffee.jpeg" x="100" y="200"></image>')
    })
  })

  describe('CustomFontFace', () => {
    it('constructs a CustomFontFace object', () => {
      const fontFace = new CustomFontFace('Noto Sans', 'https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,100..900;1,100..900&display=swap')

      const expectedFontFace = `@font-face {
  font-family: 'Noto Sans';
  src: url('https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,100..900;1,100..900&display=swap');
}`
      expect(fontFace.buildCssFontFace()).to.be.equals(expectedFontFace)
    })

    it('constructs a CustomFontFace object with all arguments and descriptors', () => {
      const fontFace = new CustomFontFace(
        'Noto Sans',
        'https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,100..900;1,100..900&display=swap',
        {
          style: 'italic',
          weight: 700,
          unicodeRange: 'U+0000-00FF, U+0100-017F'
        }
      )

      const expectedFontFace = `@font-face {
  font-family: 'Noto Sans';
  src: url('https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,100..900;1,100..900&display=swap');
  font-style: italic;
  font-weight: 700;
  unicode-range: U+0000-00FF, U+0100-017F;
}`
      expect(fontFace.buildCssFontFace()).to.be.equals(expectedFontFace)
    })

    it('constructs a CustomFontFace object with an empty family argument', () => {
      assert.throws(() => new CustomFontFace('', 'https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,100..900;1,100..900&display=swap'), RangeError)
    })

    it('constructs a CustomFontFace object without source argument', () => {
      assert.throws(() => new CustomFontFace('Noto Sans'), TypeError)
    })

    it('constructs a CustomFontFace object with an empty source argument', () => {
      assert.throws(() => new CustomFontFace('Noto Sans', ''), RangeError)
    })
  })
})
