/* global describe, it */

import { expect } from 'chai'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import 'jsdom-global/register.js'

const REQUIRED_VMS2_GL_FILES = [
  'vms2.gl/modules/main/map_style.js',
  'vms2.gl/modules/tiles.js',
  'get_tile.js',
  'tiles',
  'styles/locr-0099-300-svg.json'
]

function findVms2GlFixtureRoot() {
  const candidates = [
    join(process.cwd(), '..'),
    process.cwd()
  ]

  return candidates.find(candidate => {
    return REQUIRED_VMS2_GL_FILES.every(filePath => existsSync(join(candidate, filePath)))
  })
}

function getBrowserGlobalsScript() {
  return `
      globalThis.window = globalThis
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'node', hardwareConcurrency: 8 },
        configurable: true
      })
  `
}

function runChildScript(childScript, repoRoot) {
  return spawnSync(
    process.execPath,
    ['--experimental-default-type=module', '--input-type=module', '-e', childScript],
    {
      cwd: repoRoot,
      encoding: 'utf8'
    }
  )
}

const vms2GlFixtureRoot = findVms2GlFixtureRoot()
const runVms2GlIntegrationTests = process.env.RUN_VMS2_GL_TESTS === '1'
const describeVms2Gl = runVms2GlIntegrationTests && vms2GlFixtureRoot ? describe : describe.skip

describeVms2Gl('vms2.gl tile loading', () => {
  it('starts more than one fetch when the viewport spans multiple tiles', () => {
    const repoRoot = vms2GlFixtureRoot
    const mapStyleUrl = pathToFileURL(join(repoRoot, 'vms2.gl/modules/main/map_style.js')).href
    const tilesUrl = pathToFileURL(join(repoRoot, 'vms2.gl/modules/tiles.js')).href

    const childScript = `
      ${getBrowserGlobalsScript()}
      globalThis.Worker = class {
        constructor () {
          this.onmessage = null
          this.onerror = null
        }

        postMessage () {}

        terminate () {}
      }

      let fetchCount = 0
      globalThis.fetch = async () => {
        fetchCount++

        return {
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(0)
        }
      }

      const { processMapStyle } = await import(${JSON.stringify(mapStyleUrl)})
      const { updateMap } = await import(${JSON.stringify(tilesUrl)} + '?test=' + Date.now())

      const style = processMapStyle({
        Order: ['roads'],
        Layers: {
          roads: {
            LayoutLayers: ['roads'],
            ZoomRange: [0, 100]
          }
        }
      })

      updateMap({
        latitude: 0,
        longitude: 0,
        zoom: 2,
        width: 1024,
        height: 512,
        tileSizePower: 9,
        style,
        userMapScale: 1,
        objectScale: 1,
        detailOffset: 0,
        zoomRangeOffset: 0,
        tileUrl: 'https://example.com/tiles'
      }, () => {})

      console.log(String(fetchCount))
    `

    const result = runChildScript(childScript, repoRoot)

    expect(result.status, result.stderr).to.equal(0)
    expect(Number(result.stdout.trim())).to.be.greaterThan(1)
  })

  it('invalidates cached tiles when the tile URL changes without moving the view', () => {
    const repoRoot = vms2GlFixtureRoot
    const mapStyleUrl = pathToFileURL(join(repoRoot, 'vms2.gl/modules/main/map_style.js')).href
    const tilesUrl = pathToFileURL(join(repoRoot, 'vms2.gl/modules/tiles.js')).href

    const childScript = `
      ${getBrowserGlobalsScript()}
      globalThis.Worker = class {
        constructor () {
          this.onmessage = null
          this.onerror = null
        }

        postMessage () {}

        terminate () {}
      }

      const urls = []
      globalThis.fetch = async (url) => {
        urls.push(String(url))

        return {
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(0)
        }
      }

      const { processMapStyle } = await import(${JSON.stringify(mapStyleUrl)})
      const { updateMap } = await import(${JSON.stringify(tilesUrl)} + '?test=' + Date.now())

      const style = processMapStyle({
        Order: ['roads'],
        Layers: {
          roads: {
            LayoutLayers: ['roads'],
            ZoomRange: [0, 100]
          }
        }
      })

      const base = {
        latitude: 0,
        longitude: 0,
        zoom: 2,
        width: 256,
        height: 256,
        tileSizePower: 9,
        style,
        userMapScale: 1,
        objectScale: 1,
        detailOffset: 0,
        zoomRangeOffset: 0
      }

      updateMap({ ...base, tileUrl: 'https://first.example/tiles?x={x}&y={y}&z={z}' }, () => {})
      updateMap({ ...base, tileUrl: 'https://second.example/tiles?x={x}&y={y}&z={z}' }, () => {})

      console.log(JSON.stringify(urls))
    `

    const result = runChildScript(childScript, repoRoot)

    expect(result.status, result.stderr).to.equal(0)

    const urls = JSON.parse(result.stdout.trim())
    expect(urls.some(url => url.startsWith('https://first.example/'))).to.equal(true)
    expect(urls.some(url => url.startsWith('https://second.example/'))).to.equal(true)
  })

  it('retries a transient tile fetch failure instead of marking the tile fetched', () => {
    const repoRoot = vms2GlFixtureRoot
    const mapStyleUrl = pathToFileURL(join(repoRoot, 'vms2.gl/modules/main/map_style.js')).href
    const tilesUrl = pathToFileURL(join(repoRoot, 'vms2.gl/modules/tiles.js')).href

    const childScript = `
      ${getBrowserGlobalsScript()}
      globalThis.Worker = class {
        constructor () {
          this.onmessage = null
          this.onerror = null
        }

        postMessage () {}

        terminate () {}
      }

      let fetchCount = 0
      globalThis.fetch = async () => {
        fetchCount++
        if (fetchCount === 1) {
          return {
            ok: false,
            status: 503,
            statusText: 'Service Unavailable'
          }
        }

        return {
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(0)
        }
      }

      const { processMapStyle } = await import(${JSON.stringify(mapStyleUrl)})
      const { updateMap } = await import(${JSON.stringify(tilesUrl)} + '?test=' + Date.now())

      const style = processMapStyle({
        Order: ['roads'],
        Layers: {
          roads: {
            LayoutLayers: ['roads'],
            ZoomRange: [0, 100]
          }
        }
      })

      updateMap({
        latitude: 0,
        longitude: 0,
        zoom: 2,
        width: 256,
        height: 256,
        tileSizePower: 9,
        style,
        userMapScale: 1,
        objectScale: 1,
        detailOffset: 0,
        zoomRangeOffset: 0,
        tileUrl: 'https://example.com/tiles?x={x}&y={y}&z={z}'
      }, () => {})

      await new Promise(resolve => setTimeout(resolve, 1200))

      console.log(String(fetchCount))
    `

    const result = runChildScript(childScript, repoRoot)

    expect(result.status, result.stderr).to.equal(0)
    expect(Number(result.stdout.trim())).to.be.greaterThan(1)
  })

  it('uses database tile size only as a same-retrieval-time eviction tie-breaker', () => {
    const repoRoot = vms2GlFixtureRoot
    const mapStyleUrl = pathToFileURL(join(repoRoot, 'vms2.gl/modules/main/map_style.js')).href
    const tilesUrl = pathToFileURL(join(repoRoot, 'vms2.gl/modules/tiles.js')).href

    const childScript = `
      ${getBrowserGlobalsScript()}
      globalThis.Worker = class {
        constructor () {
          this.onmessage = null
          this.onerror = null
        }

        postMessage () {}

        terminate () {}
      }

      function makeTileBuffer (entries) {
        const totalLength = 4 + entries.reduce((sum, entry) => sum + 20 + entry.data.length, 0)
        const buffer = new ArrayBuffer(totalLength)
        const view = new DataView(buffer)
        let offset = 0

        view.setUint32(offset, entries.length, true)
        offset += 4

        for (const entry of entries) {
          view.setUint32(offset, entry.x, true)
          offset += 4
          view.setUint32(offset, entry.y, true)
          offset += 4
          view.setUint32(offset, entry.z, true)
          offset += 4
          view.setUint32(offset, entry.detailZoom, true)
          offset += 4
          view.setUint32(offset, entry.data.length, true)
          offset += 4
          new Uint8Array(buffer, offset, entry.data.length).set(entry.data)
          offset += entry.data.length
        }

        return buffer
      }

      globalThis.fetch = async (url) => {
        const parsed = new URL(url)
        const [x, y, z] = parsed.searchParams.get('xyzkvt').split(',').slice(0, 3).map(Number)

        return {
          ok: true,
          arrayBuffer: async () => makeTileBuffer([
            { x: Math.floor(x / 2), y: Math.floor(y / 2), z: z - 1, detailZoom: 2, data: new Uint8Array([1]) },
            { x, y, z, detailZoom: 2, data: new Uint8Array([2]) },
            { x: x * 2, y: y * 2, z: z + 1, detailZoom: 2, data: new Uint8Array([3]) }
          ])
        }
      }

      const { processMapStyle } = await import(${JSON.stringify(mapStyleUrl)})
      const { dataTilesCache, updateMap } = await import(${JSON.stringify(tilesUrl)} + '?test=' + Date.now())
      dataTilesCache.maxSize = 2

      const style = processMapStyle({
        Order: ['roads'],
        Layers: {
          roads: {
            LayoutLayers: ['roads'],
            ZoomRange: [0, 100]
          }
        }
      })

      updateMap({
        latitude: 0,
        longitude: 0,
        zoom: 2,
        width: 1,
        height: 1,
        tileSizePower: 9,
        style,
        userMapScale: 1,
        objectScale: 1,
        detailOffset: 0,
        zoomRangeOffset: 0,
        tileUrl: 'https://example.com/tiles?xyzkvt={x},{y},{z},{key},{value},{type}'
      }, () => {})

      await new Promise(resolve => setTimeout(resolve, 50))

      console.log(JSON.stringify(Array.from(dataTilesCache.values()).map(tile => tile.z).sort((a, b) => a - b)))
    `

    const result = runChildScript(childScript, repoRoot)

    expect(result.status, result.stderr).to.equal(0)
    expect(JSON.parse(result.stdout.trim())).to.deep.equal([1, 2])
  })

  it('keeps shared layout tiles alive across a zoom transition', () => {
    const repoRoot = vms2GlFixtureRoot
    const mapStyleUrl = pathToFileURL(join(repoRoot, 'vms2.gl/modules/main/map_style.js')).href
    const tilesUrl = pathToFileURL(join(repoRoot, 'vms2.gl/modules/tiles.js')).href

    const childScript = `
      import { createRequire } from 'node:module'

      const require = createRequire(import.meta.url)
      const { buildTileResponseBuffer } = require(${JSON.stringify(join(repoRoot, 'get_tile.js'))})

      ${getBrowserGlobalsScript()}

      const decodeModule = await import('./vms2.gl/modules/tile_decode.js?probe=' + Date.now())
      const convertModule = await import('./vms2.gl/modules/tile_geometry.js?probe=' + Date.now())

      class FakeWorker {
        constructor (url) {
          this.url = String(url)
          this.onmessage = null
          this.onerror = null
        }

        postMessage (data) {
          queueMicrotask(async () => {
            try {
              const decoded = await decodeModule.decodeTileObjects(data)
              if (decoded.tileObjects) {
                const converted = convertModule.convert(data.drawStyleOsmKeys, data.textStyleOsmKeys, decoded.tileObjects, data.layerId)
                if (this.onmessage) {
                  this.onmessage({ data: converted })
                }
              } else if (this.onmessage) {
                this.onmessage({ data: {} })
              }
            } catch (error) {
              if (this.onerror) {
                this.onerror(error)
              }
            }
          })
        }

        terminate () {}
      }

      globalThis.Worker = FakeWorker

      globalThis.fetch = async (url) => {
        const parsed = new URL(url)
        const xyzkvt = parsed.searchParams.get('xyzkvt')
        const buf = await buildTileResponseBuffer({ tilesDbPath: './tiles', xyzkvt })

        return {
          ok: true,
          arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
        }
      }

      const { processMapStyle } = await import(${JSON.stringify(mapStyleUrl)})
      const { updateMap } = await import(${JSON.stringify(tilesUrl)} + '?test=' + Date.now())
      const styleJson = require(${JSON.stringify(join(repoRoot, 'styles/locr-0099-300-svg.json'))})

      const style = processMapStyle({
        Order: ['building', 'buildingCasing'],
        Layers: {
          building: styleJson.Layers.building,
          buildingCasing: styleJson.Layers.buildingCasing
        }
      })

      const events = []
      function callback (layerId, tileObjects) {
        events.push({ layerId, count: tileObjects.length })
      }

      const base = {
        latitude: 52.5,
        longitude: 13.4,
        width: 1024,
        height: 512,
        tileSizePower: 9,
        style,
        userMapScale: 1,
        objectScale: 1,
        detailOffset: 0,
        zoomRangeOffset: 0,
        tileUrl: 'https://example.com/tiles?xyzkvt={x},{y},{z},{key},{value},{type}'
      }

      updateMap({ ...base, zoom: 14 }, callback)
      await new Promise(resolve => setTimeout(resolve, 50))
      updateMap({ ...base, zoom: 15 }, callback)
      await new Promise(resolve => setTimeout(resolve, 300))

      const counts = events.reduce((acc, event) => {
        acc[event.layerId] = (acc[event.layerId] || 0) + 1
        return acc
      }, {})

      const lastByLayer = {}
      for (const event of events) {
        lastByLayer[event.layerId] = event.count
      }

      console.log(JSON.stringify({ counts, lastByLayer }))
    `

    const result = runChildScript(childScript, repoRoot)

    expect(result.status, result.stderr).to.equal(0)

    const output = JSON.parse(result.stdout.trim())
    expect(output.counts.building).to.be.greaterThan(1)
    expect(output.counts.buildingCasing).to.be.greaterThan(1)
    expect(output.lastByLayer.building).to.be.greaterThan(0)
    expect(output.lastByLayer.buildingCasing).to.be.greaterThan(0)
  })

  it('keeps the previous lower-detail cache visible when the next detail bucket is empty', () => {
    const repoRoot = vms2GlFixtureRoot
    const mapStyleUrl = pathToFileURL(join(repoRoot, 'vms2.gl/modules/main/map_style.js')).href
    const tilesUrl = pathToFileURL(join(repoRoot, 'vms2.gl/modules/tiles.js')).href

    const childScript = `
      ${getBrowserGlobalsScript()}

      class FakeWorker {
        constructor () {
          this.onmessage = null
          this.onerror = null
        }

        postMessage () {
          queueMicrotask(() => {
            if (this.onmessage) {
              this.onmessage({ data: { lineData: new ArrayBuffer(0), polygonData: new ArrayBuffer(0), styleDatas: {}, tileEnvelope: {}, tileObjects: [] } })
            }
          })
        }

        terminate () {}
      }

      globalThis.Worker = FakeWorker

      function makeTileBuffer (entries) {
        const totalLength = 4 + entries.reduce((sum, entry) => sum + 20 + entry.data.length, 0)
        const buffer = new ArrayBuffer(totalLength)
        const view = new DataView(buffer)
        let offset = 0

        view.setUint32(offset, entries.length, true)
        offset += 4

        for (const entry of entries) {
          view.setUint32(offset, entry.x, true)
          offset += 4
          view.setUint32(offset, entry.y, true)
          offset += 4
          view.setUint32(offset, entry.z, true)
          offset += 4
          view.setUint32(offset, entry.detailZoom, true)
          offset += 4
          view.setUint32(offset, entry.data.length, true)
          offset += 4
          new Uint8Array(buffer, offset, entry.data.length).set(entry.data)
          offset += entry.data.length
        }

        return buffer
      }

      globalThis.fetch = async (url) => {
        const parsed = new URL(url)
        const xyzkvt = parsed.searchParams.get('xyzkvt')
        const [x, y, z] = xyzkvt.split(',').slice(0, 3).map(Number)

        if (Math.trunc(z) === 13) {
          return {
            ok: true,
            arrayBuffer: async () => makeTileBuffer([{ x, y, z: 13, detailZoom: 12, data: new Uint8Array([1]) }])
          }
        }

        if (Math.trunc(z) === 14) {
          return {
            ok: true,
            arrayBuffer: async () => makeTileBuffer([])
          }
        }

        return {
          ok: true,
          arrayBuffer: async () => makeTileBuffer([])
        }
      }

      const { processMapStyle } = await import(${JSON.stringify(mapStyleUrl)})
      const { updateMap } = await import(${JSON.stringify(tilesUrl)} + '?test=' + Date.now())

      const style = processMapStyle({
        Order: ['testLayer'],
        Layers: {
          testLayer: {
            LayoutLayers: ['foo'],
            ZoomRange: [0, 100],
            Detail: -2
          }
        }
      })

      const events = []
      function callback (layerId, tileObjects) {
        events.push({ layerId, count: tileObjects.length })
      }

      const base = {
        latitude: 52.5,
        longitude: 13.4,
        width: 1024,
        height: 512,
        tileSizePower: 9,
        style,
        userMapScale: 1,
        objectScale: 1,
        detailOffset: 0,
        zoomRangeOffset: 0,
        tileUrl: 'https://example.com/tiles?xyzkvt={x},{y},{z},{key},{value},{type}'
      }

      updateMap({ ...base, zoom: 15 }, callback)
      await new Promise(resolve => setTimeout(resolve, 200))
      updateMap({ ...base, zoom: 16 }, callback)
      await new Promise(resolve => setTimeout(resolve, 500))

      console.log(JSON.stringify(events))
    `

    const result = runChildScript(childScript, repoRoot)

    expect(result.status, result.stderr).to.equal(0)

    const events = JSON.parse(result.stdout.trim())
    expect(events).to.have.length.greaterThan(1)
    expect(events[events.length - 1].count).to.be.greaterThan(0)
  })
})
