/* global describe, it */

import { expect } from 'chai'

import { unpackPackedTileObjects } from '../src/leaflet-gridlayer-vms2/packed-tile-objects.js'

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

describe('packedTileObjects', () => {
  it('returns an empty object list for empty packed payloads', () => {
    expect(unpackPackedTileObjects(null)).to.deep.equal([])
  })

  it('hydrates packed point objects without geometry', () => {
    const packedTileObjects = {
      objectCount: 1,
      bounds: { left: 1, right: 2, top: 3, bottom: 4 },
      rawBuffer: new ArrayBuffer(0),
      centers: new Float32Array([11.5, 22.5]).buffer,
      envelopes: new Float32Array([11.5, 22.5, 11.5, 22.5]).buffer,
      infoOffsets: new Uint32Array([0]).buffer,
      infoSizes: new Uint32Array([0]).buffer,
      geometryOffsets: null,
      geometrySizes: null
    }

    const tileObjects = unpackPackedTileObjects(packedTileObjects)

    expect(tileObjects).to.have.length(2)
    expect(tileObjects[0]).to.deep.equal({ info: packedTileObjects.bounds })
    expect(tileObjects[1].geometry).to.equal(null)
    expect(tileObjects[1].info).to.deep.equal({
      Center: { x: 11.5, y: 22.5 },
      Envelope: { left: 11.5, bottom: 22.5, right: 11.5, top: 22.5 }
    })
  })

  it('hydrates packed info and geometry buffers', () => {
    const infoJson = JSON.stringify({ highway: 'primary' })
    const infoBytes = new TextEncoder().encode(infoJson)
    const geometryBuffer = new ArrayBuffer(12)
    const geometryView = new DataView(geometryBuffer)

    geometryView.setUint32(0, 1, true)
    geometryView.setFloat32(4, 7.5, true)
    geometryView.setFloat32(8, 8.5, true)

    const infoOffset = 8
    const geometryOffset = infoOffset + infoBytes.byteLength
    const rawBuffer = new ArrayBuffer(geometryOffset + geometryBuffer.byteLength)
    const rawBytes = new Uint8Array(rawBuffer)

    rawBytes.set(infoBytes, infoOffset)
    rawBytes.set(new Uint8Array(geometryBuffer), geometryOffset)

    const packedTileObjects = {
      objectCount: 1,
      bounds: { left: 10, right: 20, top: 30, bottom: 40 },
      rawBuffer,
      centers: new Float32Array([15, 25]).buffer,
      envelopes: new Float32Array([11, 22, 33, 44]).buffer,
      infoOffsets: new Uint32Array([infoOffset]).buffer,
      infoSizes: new Uint32Array([infoBytes.byteLength]).buffer,
      geometryOffsets: new Uint32Array([geometryOffset]).buffer,
      geometrySizes: new Uint32Array([geometryBuffer.byteLength]).buffer
    }

    const tileObjects = unpackPackedTileObjects(packedTileObjects)

    expect(tileObjects).to.have.length(2)
    expect(tileObjects[1].info).to.deep.equal({
      highway: 'primary',
      Hash: hashString(infoJson),
      Center: { x: 15, y: 25 },
      Envelope: { left: 11, bottom: 22, right: 33, top: 44 }
    })
    expect(tileObjects[1].geometry).to.be.instanceOf(DataView)
    expect(tileObjects[1].geometry.getUint32(0, true)).to.equal(1)
    expect(tileObjects[1].geometry.getFloat32(4, true)).to.equal(7.5)
    expect(tileObjects[1].geometry.getFloat32(8, true)).to.equal(8.5)
  })
})
