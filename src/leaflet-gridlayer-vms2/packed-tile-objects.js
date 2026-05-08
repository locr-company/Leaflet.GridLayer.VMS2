const utf8TextDecoder = new TextDecoder('utf-8')

function hashString (value, seed = 0) {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed

  for (let index = 0; index < value.length; index++) {
    const character = value.charCodeAt(index)

    h1 = Math.imul(h1 ^ character, 2654435761)
    h2 = Math.imul(h2 ^ character, 1597334677)
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)

  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

function buildObjectInfo (
  packedTileObjects,
  objectIndex,
  rawData,
  centers,
  envelopes,
  infoOffsets,
  infoSizes,
  geometryOffsets,
  geometrySizes
) {
  const centerIndex = objectIndex * 2
  const envelopeIndex = objectIndex * 4
  const center = {
    x: centers[centerIndex],
    y: centers[centerIndex + 1]
  }
  const envelope = {
    left: envelopes[envelopeIndex],
    bottom: envelopes[envelopeIndex + 1],
    right: envelopes[envelopeIndex + 2],
    top: envelopes[envelopeIndex + 3]
  }

  let info = {}
  const infoSize = infoSizes[objectIndex]

  if (infoSize > 0) {
    const infoOffset = infoOffsets[objectIndex]
    const infoJson = utf8TextDecoder.decode(rawData.subarray(infoOffset, infoOffset + infoSize))

    info = JSON.parse(infoJson)
    info.Hash = hashString(infoJson)
  }

  info.Center = center
  info.Envelope = envelope

  if (geometryOffsets && geometrySizes) {
    const geometrySize = geometrySizes[objectIndex]

    return {
      info,
      geometry: geometrySize > 0
        ? new DataView(packedTileObjects.rawBuffer, geometryOffsets[objectIndex], geometrySize)
        : null
    }
  }

  return { info, geometry: null }
}

export function unpackPackedTileObjects (packedTileObjects) {
  if (!packedTileObjects) {
    return []
  }

  const rawData = new Uint8Array(packedTileObjects.rawBuffer)
  const centers = new Float32Array(packedTileObjects.centers)
  const envelopes = new Float32Array(packedTileObjects.envelopes)
  const infoOffsets = new Uint32Array(packedTileObjects.infoOffsets)
  const infoSizes = new Uint32Array(packedTileObjects.infoSizes)
  const geometryOffsets = packedTileObjects.geometryOffsets
    ? new Uint32Array(packedTileObjects.geometryOffsets)
    : null
  const geometrySizes = packedTileObjects.geometrySizes
    ? new Uint32Array(packedTileObjects.geometrySizes)
    : null
  const tileObjects = [{ info: packedTileObjects.bounds }]

  for (let objectIndex = 0; objectIndex < packedTileObjects.objectCount; objectIndex++) {
    const tileObject = buildObjectInfo(
      packedTileObjects,
      objectIndex,
      rawData,
      centers,
      envelopes,
      infoOffsets,
      infoSizes,
      geometryOffsets,
      geometrySizes
    )

    tileObject.tileBounds = packedTileObjects.bounds
    tileObjects.push(tileObject)
  }

  return tileObjects
}
