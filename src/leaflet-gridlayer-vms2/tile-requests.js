import {
  DEFAULT_SAVE_DATA_CANVAS_POOL_SIZE,
  DEFAULT_TILE_CANVAS_POOL_SIZE
} from './constants.js'

export function hasTileRequestChanged (tileCanvas, requestId) {
  return requestId !== undefined && tileCanvas && tileCanvas.requestId !== requestId
}

export function isTileCanvasStale (tileCanvas, requestId) {
  return !tileCanvas || tileCanvas.hasBeenRemoved || hasTileRequestChanged(tileCanvas, requestId)
}

export function isTileLayerDataStale (tileLayerData) {
  if (!tileLayerData) {
    return true
  }

  return isTileCanvasStale(tileLayerData.tileCanvas, tileLayerData.requestId)
}

export function addTileAbortController (tileCanvas, abortController) {
  if (!tileCanvas.abortControllers) {
    tileCanvas.abortControllers = new Set()
  }

  tileCanvas.abortControllers.add(abortController)
}

export function removeTileAbortController (tileCanvas, abortController) {
  if (tileCanvas.abortControllers) {
    tileCanvas.abortControllers.delete(abortController)
  }
}

export function abortTileRequests (tileCanvas) {
  if (tileCanvas.abortController && !tileCanvas.abortController.signal.aborted) {
    tileCanvas.abortController.abort()
  }

  delete tileCanvas.abortController

  if (!tileCanvas.abortControllers) {
    return
  }

  for (const abortController of tileCanvas.abortControllers) {
    if (!abortController.signal.aborted) {
      abortController.abort()
    }
  }

  tileCanvas.abortControllers.clear()
}

export function resolveTileLayerData (tileLayerData) {
  if (!tileLayerData || tileLayerData.hasResolved || tileLayerData.tileCount > 0) {
    return
  }

  tileLayerData.hasResolved = true

  if (tileLayerData.resolve) {
    tileLayerData.resolve()
  }
}

export function cancelQueuedTileRequestsForCanvas (context, tileCanvas) {
  if (!context) {
    return
  }

  if (Array.isArray(context.decodeQueue)) {
    const nextDecodeQueue = []

    for (const decodeEntry of context.decodeQueue) {
      if (!decodeEntry) {
        continue
      }

      if (decodeEntry.tileLayerData.tileCanvas === tileCanvas) {
        decodeEntry.resolve()
      } else {
        nextDecodeQueue.push(decodeEntry)
      }
    }

    context.decodeQueue = nextDecodeQueue
    context.decodeQueueCursor = 0
  }

  if (!context.tileLayerRequestInfos) {
    return
  }

  for (const requestKey in context.tileLayerRequestInfos) {
    const tileLayerRequestInfo = context.tileLayerRequestInfos[requestKey]
    const nextTileInfos = []

    for (const tileInfo of tileLayerRequestInfo.tileInfos) {
      if (!tileInfo) {
        continue
      }

      const tileLayerData = tileInfo.tileLayerData

      if (tileLayerData.tileCanvas === tileCanvas) {
        tileLayerData.tileCount = Math.max(tileLayerData.tileCount - 1, 0)
        resolveTileLayerData(tileLayerData)
      } else {
        nextTileInfos.push(tileInfo)
      }
    }

    tileLayerRequestInfo.tileInfos = nextTileInfos
    tileLayerRequestInfo.tileInfoCursor = 0
  }
}

function releaseCanvas (canvas) {
  abortTileRequests(canvas)

  canvas.width = 0
  canvas.height = 0
  canvas.inUse = false
  canvas.hasBeenRemoved = true

  delete canvas.context
}

function normalizePoolSize (poolSize, fallbackPoolSize) {
  if (!Number.isFinite(poolSize)) {
    return fallbackPoolSize
  }

  return Math.max(0, Math.floor(poolSize))
}

function trimCanvasPool (canvases, maxPoolSize, isReusable) {
  let reusableCount = 0

  for (const canvas of canvases) {
    if (isReusable(canvas)) {
      reusableCount++
    }
  }

  if (reusableCount <= maxPoolSize) {
    return
  }

  let toRelease = reusableCount - maxPoolSize
  let writeIndex = 0

  for (let readIndex = 0; readIndex < canvases.length; readIndex++) {
    const canvas = canvases[readIndex]

    if (toRelease > 0 && isReusable(canvas)) {
      releaseCanvas(canvas)
      toRelease--
    } else {
      canvases[writeIndex++] = canvas
    }
  }

  canvases.length = writeIndex
}

export function trimTileCanvasPool (layer) {
  trimCanvasPool(
    layer.tileCanvases,
    normalizePoolSize(layer.options.tileCanvasPoolSize, DEFAULT_TILE_CANVAS_POOL_SIZE),
    canvas => !canvas.inUse && canvas.hasBeenRemoved
  )
}

export function trimSaveDataCanvasPool (layer) {
  trimCanvasPool(
    layer.saveDataCanvases,
    normalizePoolSize(layer.options.saveDataCanvasPoolSize, DEFAULT_SAVE_DATA_CANVAS_POOL_SIZE),
    canvas => !canvas.inUse
  )
}
