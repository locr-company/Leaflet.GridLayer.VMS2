/* global Worker */

import {
  DEFAULT_MIN_NUMBER_OF_WORKERS,
  DEFAULT_TILE_CACHE_SIZE
} from './constants.js'
import { unpackPackedTileObjects } from './packed-tile-objects.js'

const TILE_CACHE_KEY_SEPARATOR = '\u0000'

function getTileKey (tileData) {
  return tileData.x + '|' + tileData.y + '|' + tileData.z + '|' + tileData.dZ
}

function getTileCacheKey (layerId, tileKey) {
  return layerId + TILE_CACHE_KEY_SEPARATOR + tileKey
}

function normalizeTileCacheSize (tileCacheSize) {
  if (!Number.isFinite(tileCacheSize)) {
    return DEFAULT_TILE_CACHE_SIZE
  }

  return Math.max(0, Math.floor(tileCacheSize))
}

function ensureTileCache (context) {
  if (!(context.tileCache instanceof Map)) {
    context.tileCache = new Map()
    context.tileCacheLayerMaps = {}
  }

  return context.tileCache
}

function ensureTileCacheLayerMap (context, layerId) {
  if (!context.tileCacheLayerMaps) {
    context.tileCacheLayerMaps = {}
  }

  let layerMap = context.tileCacheLayerMaps[layerId]

  if (!layerMap) {
    layerMap = new Map()
    context.tileCacheLayerMaps[layerId] = layerMap
  }

  return layerMap
}

function trimTileCache (context) {
  const tileCache = ensureTileCache(context)
  const tileCacheSize = normalizeTileCacheSize(context.tileCacheSize)

  if (!context.tileCacheLayerMaps) {
    context.tileCacheLayerMaps = {}
  }

  while (tileCache.size > tileCacheSize) {
    const firstEntry = tileCache.entries().next().value

    if (!firstEntry) {
      return
    }

    const [cacheKey, cacheEntry] = firstEntry

    tileCache.delete(cacheKey)

    const layerMap = context.tileCacheLayerMaps[cacheEntry.layerId]

    if (!layerMap) {
      continue
    }

    layerMap.delete(cacheEntry.tileKey)

    if (layerMap.size === 0) {
      delete context.tileCacheLayerMaps[cacheEntry.layerId]
    }
  }
}

export function cacheDecodedTile (context, layerId, tileData) {
  const tileKey = getTileKey(tileData)
  const objects = tileData.tOs ?? unpackPackedTileObjects(tileData.packedTileObjects)
  const tileCache = ensureTileCache(context)
  const layerMap = ensureTileCacheLayerMap(context, layerId)

  layerMap.set(tileKey, {
    objects,
    x: tileData.x,
    y: tileData.y,
    z: tileData.z,
    detailZoom: tileData.dZ
  })

  const cacheKey = getTileCacheKey(layerId, tileKey)

  tileCache.delete(cacheKey)
  tileCache.set(cacheKey, { layerId, tileKey })

  trimTileCache(context)
}

export function touchCachedTile (context, layerId, tileKey) {
  if (!context || !(context.tileCache instanceof Map)) {
    return
  }

  const cacheKey = getTileCacheKey(layerId, tileKey)
  const cacheEntry = context.tileCache.get(cacheKey)

  if (!cacheEntry) {
    return
  }

  context.tileCache.delete(cacheKey)
  context.tileCache.set(cacheKey, cacheEntry)
}

function createVms2Context () {
  return {
    decodeWorkers: [],
    decodeWorkersRunning: 0,
    decodeQueue: [],

    styleRequestQueues: {},

    fontCharacterCanvas: null,
    fontCharacterContext: null,
    fontCharacterWidths: {},
    fontFaceCache: {},

    imageCache: {},
    patternCache: {},

    tileLayerRequestInfos: {},
    tileCache: new Map(),
    tileCacheSize: DEFAULT_TILE_CACHE_SIZE,
    tileCacheLayerMaps: {}
  }
}

function handleDecodeWorkerMessage (event) {
  const context = globalThis.vms2Context

  for (const tileData of event.data.tDs) {
    cacheDecodedTile(context, event.data.lId, tileData)
  }

  const resolveFunction = event.target.resolveFunction

  event.target.resolveFunction = null

  if (resolveFunction) {
    resolveFunction()
  }
}

export function ensureVms2Context (workerUrl) {
  if (globalThis.vms2Context) {
    return globalThis.vms2Context
  }

  const context = createVms2Context()

  context.fontCharacterCanvas = document.createElement('canvas')
  context.fontCharacterContext = context.fontCharacterCanvas.getContext('2d')

  const availableCores = navigator.hardwareConcurrency ?? (DEFAULT_MIN_NUMBER_OF_WORKERS + 1)
  const maxNumberOfWorkers = Math.max(availableCores - 1, DEFAULT_MIN_NUMBER_OF_WORKERS)

  for (let count = 0; count < maxNumberOfWorkers; count++) {
    const decodeWorker = new Worker(workerUrl)

    decodeWorker.onmessage = handleDecodeWorkerMessage

    context.decodeWorkers.push(decodeWorker)
  }

  globalThis.vms2Context = context

  return context
}
