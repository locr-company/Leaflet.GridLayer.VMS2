/* global describe, it */

import { expect } from 'chai'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import 'jsdom-global/register.js'

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

describe('vms2.gl tile loading', () => {
  it('starts more than one fetch when the viewport spans multiple tiles', () => {
    const repoRoot = join(process.cwd(), '..')
    const mapStyleUrl = pathToFileURL(join(repoRoot, 'vms2.gl/modules/main/map_style.js')).href
    const tilesUrl = pathToFileURL(join(repoRoot, 'vms2.gl/modules/tiles.js')).href

    const childScript = `
      globalThis.window = globalThis
      globalThis.navigator = { userAgent: 'node', hardwareConcurrency: 8 }
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

  it('keeps shared layout tiles alive across a zoom transition', () => {
    const repoRoot = join(process.cwd(), '..')
    const mapStyleUrl = pathToFileURL(join(repoRoot, 'vms2.gl/modules/main/map_style.js')).href
    const tilesUrl = pathToFileURL(join(repoRoot, 'vms2.gl/modules/tiles.js')).href

    const childScript = `
      import { createRequire } from 'node:module'

      const require = createRequire(import.meta.url)
      const { buildTileResponseBuffer } = require('./get_tile.js')

      globalThis.window = globalThis
      globalThis.navigator = { userAgent: 'node', hardwareConcurrency: 8 }

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
      const styleJson = require('./styles/locr-0099-300-svg.json')

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
    const repoRoot = join(process.cwd(), '..')
    const mapStyleUrl = pathToFileURL(join(repoRoot, 'vms2.gl/modules/main/map_style.js')).href
    const tilesUrl = pathToFileURL(join(repoRoot, 'vms2.gl/modules/tiles.js')).href

    const childScript = `
      globalThis.window = globalThis
      globalThis.navigator = { userAgent: 'node', hardwareConcurrency: 8 }

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
