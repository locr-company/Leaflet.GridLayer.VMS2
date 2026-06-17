function createObjectData (properties) {
  const objectData = {
    info: {
      Envelope: {},
      Center: {}
    }
  }

  if (properties) {
    objectData.info.tags = properties
  }

  return objectData
}

function updateEnvelope (envelope, x, y, isFirstPoint) {
  if (isFirstPoint) {
    envelope.left = x
    envelope.right = x
    envelope.top = y
    envelope.bottom = y
    return
  }

  if (x < envelope.left) {
    envelope.left = x
  } else if (x > envelope.right) {
    envelope.right = x
  }

  if (y < envelope.bottom) {
    envelope.bottom = y
  } else if (y > envelope.top) {
    envelope.top = y
  }
}

const geojsonMethods = {
  _convertGeojsonToTileLayer: function (geojsonData, tileLayer, properties) {
    switch (geojsonData.type) {
      case 'FeatureCollection':
        for (const feature of geojsonData.features) {
          this._convertGeojsonToTileLayer(feature, tileLayer)
        }
        break

      case 'Feature':
        this._convertGeojsonToTileLayer(geojsonData.geometry, tileLayer, geojsonData.properties)
        break

      case 'Point':
        {
          const objectData = createObjectData(properties)

          objectData.geometry = null

          const x = this._longitudeToMeters(geojsonData.coordinates[0])
          const y = this._latitudeToMeters(geojsonData.coordinates[1])

          updateEnvelope(objectData.info.Envelope, x, y, true)

          objectData.info.Center.x = x
          objectData.info.Center.y = y

          tileLayer.push(objectData)
        }
        break

      case 'LineString':
        {
          const objectData = createObjectData(properties)

          objectData.geometry = new DataView(new Uint8Array(4 + 4 + geojsonData.coordinates.length * 4 * 2).buffer)

          let geometryDataOffset = 0

          objectData.geometry.setUint32(geometryDataOffset, 2, true)
          geometryDataOffset += 4

          objectData.geometry.setUint32(geometryDataOffset, geojsonData.coordinates.length, true)
          geometryDataOffset += 4

          let previousX = 0
          let previousY = 0
          let length = -1

          for (const coordinate of geojsonData.coordinates) {
            const x = this._longitudeToMeters(coordinate[0])
            const y = this._latitudeToMeters(coordinate[1])

            if (length < 0) {
              length = 0
            } else {
              const deltaX = x - previousX
              const deltaY = y - previousY

              length += Math.sqrt(deltaX * deltaX + deltaY * deltaY)
            }

            objectData.info.length = length

            previousX = x
            previousY = y

            updateEnvelope(objectData.info.Envelope, x, y, geometryDataOffset === 8)

            objectData.geometry.setFloat32(geometryDataOffset, x, true)
            geometryDataOffset += 4

            objectData.geometry.setFloat32(geometryDataOffset, y, true)
            geometryDataOffset += 4
          }

          objectData.info.Center.x = (objectData.info.Envelope.left + objectData.info.Envelope.right) / 2
          objectData.info.Center.y = (objectData.info.Envelope.top + objectData.info.Envelope.bottom) / 2

          tileLayer.push(objectData)
        }
        break

      case 'Polygon':
        {
          const objectData = createObjectData(properties)

          let arraySize = 4 + 4

          for (const ring of geojsonData.coordinates) {
            arraySize += 4 + ring.length * 4 * 2
          }

          objectData.geometry = new DataView(new Uint8Array(arraySize).buffer)

          let geometryDataOffset = 0

          objectData.geometry.setUint32(geometryDataOffset, 3, true)
          geometryDataOffset += 4

          objectData.geometry.setUint32(geometryDataOffset, geojsonData.coordinates.length, true)
          geometryDataOffset += 4

          for (const ring of geojsonData.coordinates) {
            objectData.geometry.setUint32(geometryDataOffset, ring.length, true)
            geometryDataOffset += 4

            for (const coordinate of ring) {
              const x = this._longitudeToMeters(coordinate[0])
              const y = this._latitudeToMeters(coordinate[1])

              updateEnvelope(objectData.info.Envelope, x, y, geometryDataOffset === 12)

              objectData.geometry.setFloat32(geometryDataOffset, x, true)
              geometryDataOffset += 4

              objectData.geometry.setFloat32(geometryDataOffset, y, true)
              geometryDataOffset += 4
            }
          }

          objectData.info.Center.x = (objectData.info.Envelope.left + objectData.info.Envelope.right) / 2
          objectData.info.Center.y = (objectData.info.Envelope.top + objectData.info.Envelope.bottom) / 2

          tileLayer.push(objectData)
        }
        break
    }
  }
}

export default geojsonMethods
