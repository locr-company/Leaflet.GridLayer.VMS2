import {
  isTileLayerDataStale,
  resolveTileLayerData
} from './tile-requests.js'
import { touchCachedTile } from './context.js'

const DETAIL_ZOOMS_BY_LAYER = {
  terrain: [0, 0, 2, 2, 4, 4, 6, 6, 8, 8, 10, 10, 12, 12, 12],
  depth: [0, 0, 2, 2, 4, 4, 6, 6, 8, 8, 10, 10, 12, 12, 12],
  bathymetry: [0, 0, 2, 2, 4, 4, 6, 6, 8, 8, 10, 10, 10, 10, 10],
  blue_marble: [0, 0, 2, 2, 4, 4, 6, 6, 8, 8, 10, 10, 10, 10, 10],
  elevation: [0, 0, 2, 2, 4, 4, 6, 6, 8, 8, 10, 10, 10, 10, 10]
}

function dequeueTileInfo (tileLayerRequestInfo) {
  if (!Array.isArray(tileLayerRequestInfo.tileInfos) || tileLayerRequestInfo.tileInfos.length === 0) {
    return null
  }

  let cursor = tileLayerRequestInfo.tileInfoCursor ?? 0

  while (cursor < tileLayerRequestInfo.tileInfos.length) {
    const tileInfo = tileLayerRequestInfo.tileInfos[cursor]

    tileLayerRequestInfo.tileInfos[cursor] = null
    cursor++

    if (tileInfo) {
      tileLayerRequestInfo.tileInfoCursor = cursor

      if (tileLayerRequestInfo.tileInfoCursor > 32 && tileLayerRequestInfo.tileInfoCursor * 2 >= tileLayerRequestInfo.tileInfos.length) {
        tileLayerRequestInfo.tileInfos = tileLayerRequestInfo.tileInfos.slice(tileLayerRequestInfo.tileInfoCursor).filter(Boolean)
        tileLayerRequestInfo.tileInfoCursor = 0
      }

      return tileInfo
    }
  }

  tileLayerRequestInfo.tileInfos.length = 0
  tileLayerRequestInfo.tileInfoCursor = 0

  return null
}

export function getLayerStyleType (layer) {
  if (!layer.Grid && layer.Style) {
    if (layer.Style.IconFunction || layer.Style.TextFunction) {
      return 'text'
    }

    if (layer.Filters) {
      for (const filter of layer.Filters) {
        if (filter.Style && (filter.Style.IconFunction || filter.Style.TextFunction)) {
          return 'text'
        }
      }
    }
  }

  return 'base'
}

export function shouldProcessLayer (layer, tileInfo, options, styleType = getLayerStyleType(layer)) {
  return !!(
    layer &&
    !(options.type && options.type !== styleType) &&
    layer.Enable !== false &&
    tileInfo.vms2TileZ >= (layer.ZoomRange[0] > 0 ? layer.ZoomRange[0] + options.zoomRangeOffset : 0) &&
    tileInfo.vms2TileZ < (layer.ZoomRange[1] + options.zoomRangeOffset)
  )
}

const layerDataMethods = {
  _getTileLayers: function (tileCanvas, tileInfo, mapStyle) {
    return new Promise(resolve => {
      const tileLayers = {}
      let layerLayoutIdCount = 0

      for (const layerName of mapStyle.Order) {
        const layer = mapStyle.Layers[layerName]
        const styleType = getLayerStyleType(layer)

        if (!shouldProcessLayer(layer, tileInfo, this.options, styleType)) {
          continue
        }

        const layerLayout = layer.LayoutLayers || []
        const layerLayoutIds = []

        if (Array.isArray(layerLayout) && layerLayout.length > 0) {
          for (const layerLayoutId of layerLayout) {
            if (layerLayoutId) {
              layerLayoutIds.push(layerLayoutId)
            }
          }
        } else {
          for (const geometryType in layerLayout) {
            for (const osmKeyName in layerLayout[geometryType]) {
              for (const osmValue of layerLayout[geometryType][osmKeyName]) {
                layerLayoutIds.push(osmKeyName + '|' + osmValue + '|' + geometryType)
              }
            }
          }
        }

        layer.needsAreaExtension = !!(styleType === 'text' || layer.Grid || layer.Save)

        if (layer.CustomData) {
          if (!tileLayers[layerName]) {
            tileLayers[layerName] = []
            this._convertGeojsonToTileLayer(mapStyle.CustomData[layer.CustomData], tileLayers[layerName])
          }
        } else {
          for (const layerLayoutId of layerLayoutIds) {
            if (!tileLayers[layerName]) {
              tileLayers[layerName] = []
            }

            const tileLayerData = {
              tileCanvas,
              tileInfo,
              requestId: tileCanvas.requestId,
              dataLayerId: layerLayoutId,
              layerStyle: layer,
              tileIds: new Set(),
              objects: [],
              tileCount: 0
            }

            this._getTileLayer(tileLayerData)
              .then(() => {
                if (!isTileLayerDataStale(tileLayerData)) {
                  for (const obj of tileLayerData.objects) {
                    tileLayers[layerName].push(obj)
                  }
                }

                layerLayoutIdCount--

                if (layerLayoutIdCount === 0) {
                  resolve(tileLayers)
                }
              })

            layerLayoutIdCount++
          }
        }
      }

      if (layerLayoutIdCount === 0) {
        resolve(tileLayers)
      }
    })
  },

  _getLayerStyleType: function (layer) {
    return getLayerStyleType(layer)
  },

  _getCachedTile: function (layerId, x, y, z, tileLayer) {
    if (isTileLayerDataStale(tileLayer)) {
      return false
    }

    const detailZooms = DETAIL_ZOOMS_BY_LAYER[layerId] || [0, 0, 2, 2, 4, 4, 6, 6, 8, 8, 10, 10, 12, 12, 14]

    const ids = layerId.split('|')

    let detailZoom = detailZooms[Math.max(Math.min(z, 14), 0)]

    if (!(ids.length === 1 || ids[2] !== 'Points')) {
      detailZoom = 14
    }

    const tileWeight = Math.pow(4, 16 - z)
    let matchingTilesWeight = 0

    const context = globalThis.vms2Context
    const layerMap = context?.tileCacheLayerMaps?.[layerId]

    if (layerMap) {
      for (const keyValuePair of layerMap) {
        if (keyValuePair[1].detailZoom !== detailZoom) {
          continue
        }

        const deltaZ = keyValuePair[1].z - z

        let tileCoordinateMatch = false

        if (deltaZ >= 0) {
          tileCoordinateMatch = (keyValuePair[1].x >> deltaZ) === x && (keyValuePair[1].y >> deltaZ) === y
        } else {
          tileCoordinateMatch = (x >> -deltaZ) === keyValuePair[1].x && (y >> -deltaZ) === keyValuePair[1].y
        }

        if (tileCoordinateMatch) {
          touchCachedTile(context, layerId, keyValuePair[0])

          if (!tileLayer.tileIds.has(keyValuePair[0])) {
            for (const obj of keyValuePair[1].objects) {
              tileLayer.objects.push(obj)
            }
            tileLayer.tileIds.add(keyValuePair[0])
          }

          matchingTilesWeight += Math.pow(4, 16 - keyValuePair[1].z)

          if (matchingTilesWeight >= tileWeight) {
            return true
          }
        }
      }
    }

    return false
  },

  _processTileLayerRequests: async function (tileLayerRequestInfo) {
    if (tileLayerRequestInfo.requestInProcess) {
      return
    }

    tileLayerRequestInfo.requestInProcess = true

    let tileInfo = dequeueTileInfo(tileLayerRequestInfo)

    while (tileInfo) {
      const tileLayerData = tileInfo.tileLayerData

      if (!isTileLayerDataStale(tileLayerData)) {
        await this._requestTile(
          tileLayerData.dataLayerId,
          tileInfo.x,
          tileInfo.y,
          Math.floor(tileInfo.z),
          tileLayerData
        )
      }

      tileLayerData.tileCount = Math.max(tileLayerData.tileCount - 1, 0)

      resolveTileLayerData(tileLayerData)

      tileInfo = dequeueTileInfo(tileLayerRequestInfo)
    }

    tileLayerRequestInfo.requestInProcess = false
  },

  _getTileLayer: function (tileLayerData) {
    return new Promise((resolve, reject) => {
      tileLayerData.resolve = resolve
      tileLayerData.reject = reject

      const fetchTileZ = tileLayerData.tileInfo.vms2TileZ +
        Math.max(
          -tileLayerData.tileInfo.vms2TileZ,
          (tileLayerData.layerStyle.Detail || 0) + this.options.detailOffset
        )

      let fetchTileStartX = Math.floor(this._longitudeToTile(tileLayerData.tileInfo.mapBounds.longitudeMin, fetchTileZ))
      let fetchTileEndX = Math.floor(this._longitudeToTile(tileLayerData.tileInfo.mapBounds.longitudeMax, fetchTileZ))
      let fetchTileStartY = Math.floor(this._latitudeToTile(tileLayerData.tileInfo.mapBounds.latitudeMax, fetchTileZ))
      let fetchTileEndY = Math.floor(this._latitudeToTile(tileLayerData.tileInfo.mapBounds.latitudeMin, fetchTileZ))

      if (
        typeof tileLayerData.tileInfo.x === 'number' &&
        typeof tileLayerData.tileInfo.y === 'number' &&
        typeof tileLayerData.tileInfo.z === 'number' &&
        tileLayerData.layerStyle.needsAreaExtension
      ) {
        fetchTileStartX = Math.floor(this._longitudeToTile(tileLayerData.tileInfo.drawingMapBounds.longitudeMin, fetchTileZ))
        fetchTileEndX = Math.floor(this._longitudeToTile(tileLayerData.tileInfo.drawingMapBounds.longitudeMax, fetchTileZ))
        fetchTileStartY = Math.floor(this._latitudeToTile(tileLayerData.tileInfo.drawingMapBounds.latitudeMax, fetchTileZ))
        fetchTileEndY = Math.floor(this._latitudeToTile(tileLayerData.tileInfo.drawingMapBounds.latitudeMin, fetchTileZ))
      }

      if (!globalThis.vms2Context.tileLayerRequestInfos[tileLayerData.dataLayerId]) {
        globalThis.vms2Context.tileLayerRequestInfos[tileLayerData.dataLayerId] = {
          requestInProcess: false,
          tileInfos: [],
          tileInfoCursor: 0
        }
      }

      const tileLayerRequestInfo = globalThis.vms2Context.tileLayerRequestInfos[tileLayerData.dataLayerId]

      for (let fetchTileY = fetchTileStartY; fetchTileY <= fetchTileEndY; fetchTileY++) {
        for (let fetchTileX = fetchTileStartX; fetchTileX <= fetchTileEndX; fetchTileX++) {
          tileLayerRequestInfo.tileInfos.push({
            x: fetchTileX,
            y: fetchTileY,
            z: fetchTileZ,
            tileLayerData
          })

          tileLayerData.tileCount++
        }
      }

      if (tileLayerData.tileCount === 0) {
        resolveTileLayerData(tileLayerData)
      } else {
        this._processTileLayerRequests(tileLayerRequestInfo)
      }
    })
  }
}

export default layerDataMethods
