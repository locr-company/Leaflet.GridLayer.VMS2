/* eslint-disable no-underscore-dangle */

import { DEFAULT_ZOOM_POWER_BASE } from './constants.js'
import {
  abortTileRequests,
  cancelQueuedTileRequestsForCanvas,
  trimTileCanvasPool
} from './tile-requests.js'

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

    const mapBounds = this._map.getBounds()

    for (const key in this._tiles) {
      const tile = this._tiles[key]
      const coords = tile.coords

      tile.retain = true

      if (!tile.current) {
        if (coords.z - zoom > 2 / this.options.zoomStep || zoom - coords.z > 2 / this.options.zoomStep) {
          tile.retain = false
        } else {
          const latitudeMin = this._tileToLatitude(coords.y + 1, coords.z, this.options.zoomPowerBase)
          const longitudeMin = this._tileToLongitude(coords.x, coords.z, this.options.zoomPowerBase)
          const latitudeMax = this._tileToLatitude(coords.y, coords.z, this.options.zoomPowerBase)
          const longitudeMax = this._tileToLongitude(coords.x + 1, coords.z, this.options.zoomPowerBase)

          tile.bounds = L.latLngBounds([latitudeMin, longitudeMin], [latitudeMax, longitudeMax])

          if (!(
            tile.bounds._southWest.lat < mapBounds._northEast.lat &&
            tile.bounds._northEast.lat > mapBounds._southWest.lat &&
            tile.bounds._southWest.lng < mapBounds._northEast.lng &&
            tile.bounds._northEast.lng > mapBounds._southWest.lng
          )) {
            tile.retain = false
          }
        }
      }
    }

    for (const key1 in this._tiles) {
      const tile1 = this._tiles[key1]

      if (!tile1.current || !tile1.retain) {
        continue
      }

      for (const key2 in this._tiles) {
        if (key2 === key1) {
          continue
        }

        const tile2 = this._tiles[key2]

        if (
          !tile2.current &&
          tile2.retain &&
          tile2.bounds._northEast.lat < tile1.bounds._northEast.lat &&
          tile2.bounds._southWest.lat > tile1.bounds._southWest.lat &&
          tile2.bounds._northEast.lng < tile1.bounds._northEast.lng &&
          tile2.bounds._southWest.lng > tile1.bounds._southWest.lng
        ) {
          tile2.retain = false
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

    this._removeAllTiles()
    globalThis.L.DomUtil.remove(this._container)
    map._removeZoomLimit(this)
    this._container = null
    this._tileZoom = undefined
  }
}

export default lifecycleMethods
