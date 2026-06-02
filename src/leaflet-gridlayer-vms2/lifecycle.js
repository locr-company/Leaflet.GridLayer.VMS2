/* eslint-disable no-underscore-dangle */

import { DEFAULT_ZOOM_POWER_BASE } from './constants.js'
import {
  abortTileRequests,
  cancelQueuedTileRequestsForCanvas,
  trimTileCanvasPool
} from './tile-requests.js'

function getNormalizedTileBounds (coords, zoomPowerBase) {
  const scale = Math.pow(zoomPowerBase, coords.z)

  return {
    minX: coords.x / scale,
    maxX: (coords.x + 1) / scale,
    minY: coords.y / scale,
    maxY: (coords.y + 1) / scale
  }
}

function normalizedBoundsOverlap (bounds1, bounds2) {
  return (
    bounds1.minX < bounds2.maxX &&
    bounds1.maxX > bounds2.minX &&
    bounds1.minY < bounds2.maxY &&
    bounds1.maxY > bounds2.minY
  )
}

const lifecycleMethods = {
  _pruneTilesOld: function () {
    if (!this._map) {
      return
    }

    let tile

    const zoom = this._map.getZoom()
    if (zoom > this.options.maxZoom || zoom < this.options.minZoom) {
      this._removeAllTiles()
      return
    }

    for (const key in this._tiles) {
      tile = this._tiles[key]
      tile.retain = tile.current
    }

    for (const key in this._tiles) {
      tile = this._tiles[key]
      if (tile.current && !tile.active) {
        const coords = tile.coords
        if (!this._retainParent(coords.x, coords.y, coords.z, coords.z - 5)) {
          this._retainChildren(coords.x, coords.y, coords.z, coords.z + 2)
        }
      }
    }

    for (const key in this._tiles) {
      if (!this._tiles[key].retain) {
        this._removeTile(key)
      }
    }
  },

  _pruneTiles: function () {
    if (this.options.zoomPowerBase === DEFAULT_ZOOM_POWER_BASE) {
      this._pruneTilesOld()
      return
    }

    if (!this._map) {
      return
    }

    const zoom = this._map.getZoom()

    if (zoom > this.options.maxZoom || zoom < this.options.minZoom) {
      this._removeAllTiles()
      return
    }

    const maxRetainedZoomDistance = 2 / this.options.zoomStep
    const currentTileInfos = []
    const fallbackTileInfos = []

    for (const key in this._tiles) {
      const tile = this._tiles[key]
      const coords = tile.coords

      tile.retain = tile.current

      const tileInfo = {
        tile,
        bounds: getNormalizedTileBounds(coords, this.options.zoomPowerBase)
      }

      if (tile.current) {
        currentTileInfos.push(tileInfo)
      } else if (
        (tile.active || tile.loaded) &&
        Math.abs(coords.z - zoom) <= maxRetainedZoomDistance
      ) {
        fallbackTileInfos.push(tileInfo)
      }
    }

    for (const fallbackTileInfo of fallbackTileInfos) {
      for (const currentTileInfo of currentTileInfos) {
        if (
          !currentTileInfo.tile.active &&
          normalizedBoundsOverlap(fallbackTileInfo.bounds, currentTileInfo.bounds)
        ) {
          fallbackTileInfo.tile.retain = true

          break
        }
      }
    }

    for (const key in this._tiles) {
      if (!this._tiles[key].retain) {
        this._removeTile(key)
      }
    }
  },

  _removeTile: function (key) {
    const tile = this._tiles[key]

    if (!tile) {
      return
    }

    const tileElement = tile.el

    tileElement.hasBeenRemoved = true

    abortTileRequests(tileElement)
    cancelQueuedTileRequestsForCanvas(globalThis.vms2Context, tileElement)

    if (tileElement.parentNode) {
      tileElement.parentNode.removeChild(tileElement)
    }

    delete this._tiles[key]

    this.fire('tileunload', {
      tile: tileElement,
      coords: this._keyToTileCoords(key)
    })

    trimTileCanvasPool(this)
  },

  onAdd: function () {
    this._map.on('resize', this._onResize, this)

    this._initContainer()

    this._levels = {}
    this._tiles = {}

    this._resetView()

    this._map.fire('resize')
  },

  onRemove: function (map) {
    this._map.off('resize', this._onResize, this)

    if (Array.isArray(this.mapOverlayMarkerDatas)) {
      for (const marker of this.mapOverlayMarkerDatas) {
        map.removeLayer(marker)
      }

      this.mapOverlayMarkerDatas.length = 0
    }

    if (this.mapOverlayDiv?.isConnected) {
      this.mapOverlayDiv.remove()
    }

    if (this.printFormatMaskDiv?.isConnected) {
      this.printFormatMaskDiv.remove()
    }

    this._removeAllTiles()
    globalThis.L.DomUtil.remove(this._container)
    map._removeZoomLimit(this)
    this._container = null
    this._tileZoom = undefined
  }
}

export default lifecycleMethods
