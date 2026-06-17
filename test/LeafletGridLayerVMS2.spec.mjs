/* global describe, it */

import { expect } from 'chai'
import 'jsdom-global/register.js'

let importCounter = 0

function importEntryPoint () {
  importCounter += 1

  return import(`../src/Leaflet.GridLayer.VMS2.js?test=${Date.now()}-${importCounter}`)
}

function createLeafletStub () {
  function extend (props) {
    const Parent = this

    const NewClass = function (...args) {
      this.options = Object.create(NewClass.prototype.options)

      if (this.initialize) {
        this.initialize(...args)
      }
    }

    NewClass.prototype = Object.create(Parent.prototype)
    Object.assign(NewClass.prototype, props)

    if (props.options) {
      NewClass.prototype.options = Object.create(Parent.prototype.options || null)
      Object.assign(NewClass.prototype.options, props.options)
    }

    NewClass.extend = extend

    return NewClass
  }

  function GridLayer () {}

  GridLayer.prototype = {
    options: {},
    initialize: function (options) {
      Object.assign(this.options, options)
    },
    getTileSize: function () {
      return { x: 256 }
    }
  }

  GridLayer.extend = extend

  return {
    GridLayer,
    gridLayer: {}
  }
}

describe('Leaflet.GridLayer.VMS2 entry point', () => {
  it('keeps mutable default options isolated between layer instances', async () => {
    const previousDomMatrix = globalThis.DOMMatrix
    const previousL = globalThis.L
    const previousVms2Context = globalThis.vms2Context
    const previousCreateObjectURL = globalThis.URL.createObjectURL

    globalThis.DOMMatrix = class DOMMatrix {}
    globalThis.L = createLeafletStub()
    globalThis.URL.createObjectURL = function () {
      return 'blob:vms2-test'
    }
    globalThis.vms2Context = {}

    try {
      await importEntryPoint()

      const firstLayer = globalThis.L.gridLayer.vms2()
      const secondLayer = globalThis.L.gridLayer.vms2()

      firstLayer.options.styleOverride.customLayer = { color: '#fff' }

      expect(firstLayer.options.styleOverride).not.to.equal(secondLayer.options.styleOverride)
      expect(secondLayer.options.styleOverride).to.deep.equal({})
    } finally {
      if (typeof previousDomMatrix === 'undefined') {
        delete globalThis.DOMMatrix
      } else {
        globalThis.DOMMatrix = previousDomMatrix
      }

      if (typeof previousL === 'undefined') {
        delete globalThis.L
      } else {
        globalThis.L = previousL
      }

      if (typeof previousVms2Context === 'undefined') {
        delete globalThis.vms2Context
      } else {
        globalThis.vms2Context = previousVms2Context
      }

      if (typeof previousCreateObjectURL === 'undefined') {
        delete globalThis.URL.createObjectURL
      } else {
        globalThis.URL.createObjectURL = previousCreateObjectURL
      }
    }
  })

  it('clones nested style overrides without requiring structuredClone', async () => {
    const previousDomMatrix = globalThis.DOMMatrix
    const previousL = globalThis.L
    const previousVms2Context = globalThis.vms2Context
    const previousCreateObjectURL = globalThis.URL.createObjectURL
    const previousStructuredClone = globalThis.structuredClone

    globalThis.DOMMatrix = class DOMMatrix {}
    globalThis.L = createLeafletStub()
    globalThis.URL.createObjectURL = function () {
      return 'blob:vms2-test'
    }
    globalThis.vms2Context = {}
    delete globalThis.structuredClone

    try {
      await importEntryPoint()

      const colorResolver = function () {
        return '#fff'
      }
      const styleOverride = {
        customLayer: {
          colorStops: ['#000'],
          colorResolver
        }
      }

      const layer = globalThis.L.gridLayer.vms2({ styleOverride })

      expect(layer.options.styleOverride).not.to.equal(styleOverride)
      expect(layer.options.styleOverride.customLayer).not.to.equal(styleOverride.customLayer)
      expect(layer.options.styleOverride.customLayer.colorStops).not.to.equal(styleOverride.customLayer.colorStops)
      expect(layer.options.styleOverride.customLayer.colorResolver).to.equal(colorResolver)

      layer.options.styleOverride.customLayer.colorStops.push('#fff')

      expect(styleOverride.customLayer.colorStops).to.deep.equal(['#000'])
    } finally {
      if (typeof previousDomMatrix === 'undefined') {
        delete globalThis.DOMMatrix
      } else {
        globalThis.DOMMatrix = previousDomMatrix
      }

      if (typeof previousL === 'undefined') {
        delete globalThis.L
      } else {
        globalThis.L = previousL
      }

      if (typeof previousVms2Context === 'undefined') {
        delete globalThis.vms2Context
      } else {
        globalThis.vms2Context = previousVms2Context
      }

      if (typeof previousCreateObjectURL === 'undefined') {
        delete globalThis.URL.createObjectURL
      } else {
        globalThis.URL.createObjectURL = previousCreateObjectURL
      }

      if (typeof previousStructuredClone === 'undefined') {
        delete globalThis.structuredClone
      } else {
        globalThis.structuredClone = previousStructuredClone
      }
    }
  })
})
