/* global describe, it */

import { expect } from 'chai'
import 'jsdom-global/register.js'

import setupMethods from '../src/leaflet-gridlayer-vms2/setup.js'
import lifecycleMethods from '../src/leaflet-gridlayer-vms2/lifecycle.js'
import resourceLoaderMethods from '../src/leaflet-gridlayer-vms2/resource-loader.js'
import mathMethods from '../src/leaflet-gridlayer-vms2/math.js'

describe('tile handling', () => {
  it('loads tile DB infos once and resolves queued callers with the fetched data', async () => {
    const previousFetch = globalThis.fetch
    const previousWindow = globalThis.window
    const tileDbInfos = [{ infos: [{ max_detail_zoom: 12 }] }]
    let fetchCount = 0

    globalThis.window = {
      location: {
        origin: 'https://app.example'
      }
    }

    globalThis.fetch = async url => {
      fetchCount++
      expect(String(url)).to.equal('https://tiles.example/tiles.json')

      return {
        ok: true,
        json: async () => tileDbInfos
      }
    }

    const loader = {
      options: {
        tileUrl: 'https://tiles.example/tiles.json?x={x}&y={y}&z={z}'
      },
      tileDbInfos: null,
      tileDbInfosResolves: []
    }

    try {
      const firstRequest = resourceLoaderMethods._requestTileDbInfos.call(loader)
      const secondRequest = resourceLoaderMethods._requestTileDbInfos.call(loader)
      const [firstResult, secondResult] = await Promise.all([firstRequest, secondRequest])

      expect(fetchCount).to.equal(1)
      expect(firstResult).to.equal(tileDbInfos)
      expect(secondResult).to.equal(tileDbInfos)
      expect(loader.tileDbInfos).to.equal(tileDbInfos)
    } finally {
      globalThis.fetch = previousFetch
      globalThis.window = previousWindow
    }
  })

  it('calls the Leaflet tile callback with render errors and releases the canvas', async () => {
    const renderError = new Error('render failed')
    const layer = {
      tileCanvases: [],
      tileSize: 256,
      options: {
        zoomOffset: 0
      },
      _drawTile: async () => {
        throw renderError
      }
    }

    const tileInfo = { x: 0, y: 0, z: 0 }
    let tileCanvas

    await new Promise(resolve => {
      tileCanvas = setupMethods.createTile.call(layer, tileInfo, (error, doneTileCanvas) => {
        expect(error).to.equal(renderError)
        expect(doneTileCanvas).to.equal(tileCanvas)
        resolve()
      })
    })

    expect(tileCanvas.inUse).to.equal(false)
  })

  it('aborts active requests and removes queued work when unloading a tile', () => {
    const previousVms2Context = globalThis.vms2Context
    const firstAbortController = new AbortController()
    const secondAbortController = new AbortController()
    let decodeQueueResolveCount = 0
    let tileLayerResolveCount = 0

    const tileCanvas = {
      abortControllers: new Set([firstAbortController, secondAbortController]),
      hasBeenRemoved: false,
      inUse: false
    }
    const tileLayerData = {
      tileCanvas,
      tileCount: 1,
      resolve: () => {
        tileLayerResolveCount++
      }
    }

    globalThis.vms2Context = {
      decodeQueue: [
        {
          tileLayerData,
          resolve: () => {
            decodeQueueResolveCount++
          }
        }
      ],
      tileLayerRequestInfos: {
        roads: {
          tileInfos: [
            {
              tileLayerData
            }
          ]
        }
      }
    }

    const layer = {
      _tiles: {
        tileKey: {
          el: tileCanvas
        }
      },
      _keyToTileCoords: () => ({ x: 0, y: 0, z: 0 }),
      fire: () => {},
      options: {
        tileCanvasPoolSize: 64
      },
      tileCanvases: []
    }

    try {
      lifecycleMethods._removeTile.call(layer, 'tileKey')

      expect(tileCanvas.hasBeenRemoved).to.equal(true)
      expect(firstAbortController.signal.aborted).to.equal(true)
      expect(secondAbortController.signal.aborted).to.equal(true)
      expect(tileCanvas.abortControllers.size).to.equal(0)
      expect(globalThis.vms2Context.decodeQueue).to.deep.equal([])
      expect(globalThis.vms2Context.tileLayerRequestInfos.roads.tileInfos).to.deep.equal([])
      expect(decodeQueueResolveCount).to.equal(1)
      expect(tileLayerData.tileCount).to.equal(0)
      expect(tileLayerResolveCount).to.equal(1)
    } finally {
      if (typeof previousVms2Context === 'undefined') {
        delete globalThis.vms2Context
      } else {
        globalThis.vms2Context = previousVms2Context
      }
    }
  })

  it('trims the reusable tile canvas pool after tile unload', () => {
    const reusableCanvas1 = { width: 256, height: 256, inUse: false, hasBeenRemoved: true }
    const reusableCanvas2 = { width: 256, height: 256, inUse: false, hasBeenRemoved: true }
    const tileCanvas = { width: 256, height: 256, inUse: false, hasBeenRemoved: false }
    const layer = {
      _tiles: {
        tileKey: {
          el: tileCanvas
        }
      },
      _keyToTileCoords: () => ({ x: 0, y: 0, z: 0 }),
      fire: () => {},
      options: {
        tileCanvasPoolSize: 1
      },
      tileCanvases: [reusableCanvas1, reusableCanvas2, tileCanvas]
    }

    lifecycleMethods._removeTile.call(layer, 'tileKey')

    expect(layer.tileCanvases).to.have.length(1)
    expect(layer.tileCanvases[0]).to.equal(tileCanvas)
    expect(reusableCanvas1.width).to.equal(0)
    expect(reusableCanvas2.width).to.equal(0)
  })

  it('releases a tile canvas when drawing exits after tile removal', async () => {
    const previousDomMatrix = globalThis.DOMMatrix

    globalThis.DOMMatrix = class DOMMatrix {}

    try {
      const { default: renderMethods } = await import(`../src/leaflet-gridlayer-vms2/render.js?test=${Date.now()}`)

      const tileCanvas = {
        width: 256,
        height: 256,
        inUse: true,
        hasBeenRemoved: true
      }
      const layer = {
        ...mathMethods,
        tileSize: 256,
        printMapScale: undefined,
        options: {
          mapScale: 1,
          styleOverride: {},
          zoomOffset: 0,
          zoomPowerBase: 2
        },
        _requestTileDbInfos: async () => [],
        _requestStyle: async () => ({
          Order: [],
          Layers: {},
          BackgroundColor: [0, 0, 0]
        }),
        _getTileLayers: async () => ({})
      }

      await renderMethods._drawTile.call(layer, tileCanvas, { x: 0, y: 0, z: 0 })

      expect(tileCanvas.inUse).to.equal(false)
    } finally {
      if (typeof previousDomMatrix === 'undefined') {
        delete globalThis.DOMMatrix
      } else {
        globalThis.DOMMatrix = previousDomMatrix
      }
    }
  })
})
