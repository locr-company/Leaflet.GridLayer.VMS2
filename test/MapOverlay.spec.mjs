import assert from 'assert'
import { expect } from 'chai'
import 'jsdom-global/register.js'

import MapOverlay, { SvgLayer, TextSvgLayer } from '../src/MapOverlay.js'

describe('MapOverlay', () => {
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
})
