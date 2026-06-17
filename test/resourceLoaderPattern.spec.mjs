/* global describe, it */

import { expect } from 'chai'

import resourceLoaderMethods from '../src/leaflet-gridlayer-vms2/resource-loader.js'

describe('resourceLoader pattern compatibility', () => {
  it('creates a fallback pattern descriptor when the context lacks createPattern', async () => {
    const patternImage = {
      naturalHeight: 8,
      naturalWidth: 8,
      src: 'pattern.png'
    }

    const loader = {
      options: {
        assetsUrl: 'https://example.invalid'
      },
      _requestImage: async () => patternImage
    }

    const previousContext = globalThis.vms2Context
    globalThis.vms2Context = { patternCache: {} }

    try {
      const pattern = await resourceLoaderMethods._getPattern.call(loader, {}, 'sample-pattern')

      expect(pattern).to.equal(globalThis.vms2Context.patternCache['sample-pattern'])
      expect(pattern.patternImage).to.equal(patternImage)
      expect(pattern.repetition).to.equal('repeat')
      expect(pattern.setTransform).to.be.a('function')

      const transformMatrix = { a: 1, d: 1 }
      pattern.setTransform(transformMatrix)

      expect(pattern.transformMatrix).to.equal(transformMatrix)
    } finally {
      if (typeof previousContext === 'undefined') {
        delete globalThis.vms2Context
      } else {
        globalThis.vms2Context = previousContext
      }
    }
  })
})
