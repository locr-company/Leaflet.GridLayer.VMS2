/* global describe, it */

import { expect } from 'chai'
import 'jsdom-global/register.js'

import setupMethods from '../src/leaflet-gridlayer-vms2/setup.js'
import lifecycleMethods from '../src/leaflet-gridlayer-vms2/lifecycle.js'
import layerDataMethods from '../src/leaflet-gridlayer-vms2/layer-data.js'
import resourceLoaderMethods from '../src/leaflet-gridlayer-vms2/resource-loader.js'
import mathMethods from '../src/leaflet-gridlayer-vms2/math.js'
import { cacheDecodedTile } from '../src/leaflet-gridlayer-vms2/context.js'

function createTileCacheContext (tileCacheSize) {
  return {
    tileCache: new Map(),
    tileCacheSize,
    tileCacheLayerMaps: {}
  }
}

function createDecodedTile (x, y, z, detailZoom, objects) {
  return {
    x,
    y,
    z,
    dZ: detailZoom,
    tOs: objects
  }
}

function getCachedTileKeys (context, layerId) {
  return Array.from(context.tileCacheLayerMaps[layerId]?.keys() || []).sort((a, b) => a.localeCompare(b))
}

function createPruneLayer (zoomPowerBase, zoom, tiles) {
  const removedTiles = []
  const layer = {
    _map: {
      getZoom: () => zoom
    },
    _tiles: tiles,
    options: {
      zoomPowerBase,
      zoomStep: Math.log2(zoomPowerBase),
      minZoom: -Infinity,
      maxZoom: Infinity
    },
    _removeAllTiles: function () {
      for (const key of Object.keys(this._tiles)) {
        this._removeTile(key)
      }
    },
    _removeTile: function (key) {
      removedTiles.push(key)
      delete this._tiles[key]
    }
  }

  return {
    layer,
    removedTiles
  }
}

describe('tile handling', () => {
  it('keeps recently read cached tiles when the tile cache is trimmed', () => {
    const previousVms2Context = globalThis.vms2Context
    const context = createTileCacheContext(2)

    globalThis.vms2Context = context

    try {
      cacheDecodedTile(context, 'roads', createDecodedTile(0, 0, 2, 2, ['first']))
      cacheDecodedTile(context, 'roads', createDecodedTile(1, 0, 2, 2, ['second']))

      const tileLayer = {
        tileCanvas: { hasBeenRemoved: false },
        tileIds: new Set(),
        objects: []
      }

      expect(layerDataMethods._getCachedTile('roads', 0, 0, 2, tileLayer)).to.equal(true)
      expect(tileLayer.objects).to.deep.equal(['first'])

      cacheDecodedTile(context, 'roads', createDecodedTile(2, 0, 2, 2, ['third']))

      expect(getCachedTileKeys(context, 'roads')).to.deep.equal([
        '0|0|2|2',
        '2|0|2|2'
      ])
    } finally {
      if (typeof previousVms2Context === 'undefined') {
        delete globalThis.vms2Context
      } else {
        globalThis.vms2Context = previousVms2Context
      }
    }
  })

  it('refreshes existing cached tiles without leaving duplicate eviction records', () => {
    const context = createTileCacheContext(3)

    cacheDecodedTile(context, 'roads', createDecodedTile(0, 0, 2, 2, ['first']))
    cacheDecodedTile(context, 'roads', createDecodedTile(1, 0, 2, 2, ['second']))
    cacheDecodedTile(context, 'roads', createDecodedTile(0, 0, 2, 2, ['first updated']))
    cacheDecodedTile(context, 'roads', createDecodedTile(2, 0, 2, 2, ['third']))
    cacheDecodedTile(context, 'roads', createDecodedTile(3, 0, 2, 2, ['fourth']))

    expect(getCachedTileKeys(context, 'roads')).to.deep.equal([
      '0|0|2|2',
      '2|0|2|2',
      '3|0|2|2'
    ])
    expect(context.tileCacheLayerMaps.roads.get('0|0|2|2').objects).to.deep.equal(['first updated'])
  })

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

  it('hands raw tile buffers to decoder workers as transferables', async () => {
    const previousFetch = globalThis.fetch
    const previousWindow = globalThis.window
    const previousVms2Context = globalThis.vms2Context
    const rawTileBundle = new ArrayBuffer(24)
    const rawTileBundleView = new DataView(rawTileBundle)
    let postedMessage = null
    let postedTransferables = null

    rawTileBundleView.setUint32(0, 1, true)
    rawTileBundleView.setUint32(4, 1, true)
    rawTileBundleView.setUint32(8, 2, true)
    rawTileBundleView.setUint32(12, 3, true)
    rawTileBundleView.setUint32(16, 4, true)
    rawTileBundleView.setUint32(20, 0, true)

    globalThis.window = {
      location: {
        origin: 'https://app.example'
      }
    }

    globalThis.fetch = async url => {
      expect(String(url)).to.equal('https://tiles.example/3/2/1?k=amenity&v=school&t=Points')

      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => rawTileBundle
      }
    }

    const decodeWorker = {
      postMessage: function (message, transferables) {
        postedMessage = message
        postedTransferables = transferables

        queueMicrotask(() => {
          this.resolveFunction()
        })
      }
    }

    globalThis.vms2Context = {
      decodeWorkers: [decodeWorker],
      decodeWorkersRunning: 0,
      decodeQueue: [],
      decodeQueueCursor: 0
    }

    const layer = {
      ...mathMethods,
      options: {
        tileUrl: 'https://tiles.example/{z}/{y}/{x}?k={key}&v={value}&t={type}'
      },
      tileDbInfos: [],
      numberOfRequestedTiles: 0,
      _getCachedTile: () => false
    }

    const tileLayerData = {
      tileCanvas: {},
      dataLayerId: 'amenity|school|Points'
    }

    try {
      await resourceLoaderMethods._requestTile.call(layer, 'amenity|school|Points', 1, 2, 3, tileLayerData)

      expect(postedMessage).to.deep.equal({
        lId: 'amenity|school|Points',
        rawData: rawTileBundle
      })
      expect(postedTransferables).to.deep.equal([rawTileBundle])
      expect(postedMessage).not.to.have.property('datas')
    } finally {
      globalThis.fetch = previousFetch
      globalThis.window = previousWindow

      if (typeof previousVms2Context === 'undefined') {
        delete globalThis.vms2Context
      } else {
        globalThis.vms2Context = previousVms2Context
      }
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

  it('keeps a custom zoom-base fallback tile while an overlapping current neighbor is inactive', () => {
    const { layer, removedTiles } = createPruneLayer(4, 1, {
      fallback: {
        coords: { x: 0, y: 0, z: 0 },
        current: false,
        active: true,
        loaded: true
      },
      currentActive: {
        coords: { x: 0, y: 0, z: 1 },
        current: true,
        active: true
      },
      currentLoadingNeighbor: {
        coords: { x: 1, y: 0, z: 1 },
        current: true,
        active: false
      }
    })

    lifecycleMethods._pruneTiles.call(layer)

    expect(removedTiles).to.deep.equal([])
    expect(layer._tiles.fallback.retain).to.equal(true)
  })

  it('prunes a custom zoom-base fallback tile after overlapping current neighbors are active', () => {
    const { layer, removedTiles } = createPruneLayer(4, 1, {
      fallback: {
        coords: { x: 0, y: 0, z: 0 },
        current: false,
        active: true,
        loaded: true
      },
      currentActive: {
        coords: { x: 0, y: 0, z: 1 },
        current: true,
        active: true
      },
      currentActiveNeighbor: {
        coords: { x: 1, y: 0, z: 1 },
        current: true,
        active: true
      }
    })

    lifecycleMethods._pruneTiles.call(layer)

    expect(removedTiles).to.deep.equal(['fallback'])
    expect(layer._tiles).not.to.have.property('fallback')
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

  it('uses the custom zoom base when applying zoom offsets during rendering', async () => {
    const previousDomMatrix = globalThis.DOMMatrix
    const zoomStep = 1 / 1024
    const zoomPowerBase = Math.pow(2, zoomStep)
    const zoomOffset = -1 / zoomStep
    let capturedTileInfo = null

    globalThis.DOMMatrix = class DOMMatrix {}

    try {
      const { default: renderMethods } = await import(`../src/leaflet-gridlayer-vms2/render.js?test=${Date.now()}`)

      const tileCanvas = {
        width: 512,
        height: 512,
        inUse: true,
        hasBeenRemoved: true
      }
      const layer = {
        ...mathMethods,
        tileSize: 512,
        printMapScale: undefined,
        options: {
          mapScale: 1,
          styleOverride: {},
          zoomOffset,
          zoomPowerBase
        },
        _requestTileDbInfos: async () => [],
        _requestStyle: async () => ({
          Order: [],
          Layers: {},
          BackgroundColor: [0, 0, 0]
        }),
        _getTileLayers: async (canvas, tileInfo) => {
          capturedTileInfo = { ...tileInfo }

          return {}
        }
      }

      await renderMethods._drawTile.call(layer, tileCanvas, { x: 0, y: 0, z: 16 / zoomStep + zoomOffset })

      expect(capturedTileInfo.vms2TileZ).to.equal(16)
    } finally {
      if (typeof previousDomMatrix === 'undefined') {
        delete globalThis.DOMMatrix
      } else {
        globalThis.DOMMatrix = previousDomMatrix
      }
    }
  })
})
