/* global describe, it, beforeEach, afterEach */

import { expect } from 'chai'

import resourceLoaderMethods, { getFontFaceFiles } from '../src/leaflet-gridlayer-vms2/resource-loader.js'

describe('resourceLoader font faces', () => {
  describe('getFontFaceFiles', () => {
    it('keeps the regular file for styles without bold or italic', () => {
      expect(getFontFaceFiles({ FontFamily: 'DejaVuSansCondensed', FontStyle: null })).to.deep.equal([
        { files: ['DejaVuSansCondensed.ttf'], descriptors: { style: 'normal', weight: 'normal' } }
      ])
    })

    it('adds the bold and italic files of static fonts', () => {
      expect(getFontFaceFiles({ FontFamily: 'DejaVuSans', FontStyle: 'bold' })).to.deep.equal([
        { files: ['DejaVuSans.ttf'], descriptors: { style: 'normal', weight: 'normal' } },
        { files: ['DejaVuSans-Bold.ttf'], descriptors: { style: 'normal', weight: 'bold' } }
      ])
      // DejaVu Sans names its italics Oblique, DejaVu Serif names them Italic.
      expect(getFontFaceFiles({ FontFamily: 'DejaVuSerif', FontStyle: 'Italic' })[1]).to.deep.equal(
        { files: ['DejaVuSerif-Italic.ttf', 'DejaVuSerif-Oblique.ttf'], descriptors: { style: 'italic', weight: 'normal' } }
      )
      expect(getFontFaceFiles({ FontFamily: 'DejaVu Sans', FontStyle: 'bold italic' })[1]).to.deep.equal(
        { files: ['DejaVuSans-BoldItalic.ttf', 'DejaVuSans-BoldOblique.ttf'], descriptors: { style: 'italic', weight: 'bold' } }
      )
    })

    it('uses the weight axis of variable fonts and their separate italic file', () => {
      expect(getFontFaceFiles({ FontFamily: 'RobotoCondensed-VariableFont_wght', FontStyle: 'bold' })).to.deep.equal([
        { files: ['RobotoCondensed-VariableFont_wght.ttf'], descriptors: { style: 'normal', weight: '1 1000' } }
      ])
      expect(getFontFaceFiles({ FontFamily: 'NotoSans-VariableFont_wdth,wght', FontStyle: 'italic' })).to.deep.equal([
        { files: ['NotoSans-VariableFont_wdth,wght.ttf'], descriptors: { style: 'normal', weight: '1 1000' } },
        { files: ['NotoSans-Italic-VariableFont_wdth,wght.ttf'], descriptors: { style: 'italic', weight: '1 1000' } }
      ])
    })
  })

  describe('_requestFontFace', () => {
    let previousContext, previousDocument, previousFontFace, fontFaces, addedFontFaces, loader

    beforeEach(() => {
      previousContext = globalThis.vms2Context
      previousDocument = globalThis.document
      previousFontFace = globalThis.FontFace
      fontFaces = []
      addedFontFaces = []

      globalThis.vms2Context = { fontFaceCache: {} }
      globalThis.document = { fonts: { add: fontFace => addedFontFaces.push(fontFace) } }
      globalThis.FontFace = class {
        constructor (family, source, descriptors) {
          Object.assign(this, { family, source, descriptors })
          this.loaded = new Promise((resolve, reject) => { Object.assign(this, { resolve, reject }) })
          fontFaces.push(this)
        }

        load () {
          return this.loaded
        }
      }

      loader = { options: { assetsUrl: 'https://example.invalid/styles' }, ...resourceLoaderMethods }
    })

    afterEach(() => {
      for (const [name, value] of [['vms2Context', previousContext], ['document', previousDocument], ['FontFace', previousFontFace]]) {
        if (typeof value === 'undefined') {
          delete globalThis[name]
        } else {
          globalThis[name] = value
        }
      }
    })

    it('registers the real bold file under the style family and waits for it', async () => {
      let settled = false
      const request = loader._requestFontFace({ FontFamily: 'DejaVuSans', FontStyle: 'bold' }).then(() => { settled = true })

      expect(fontFaces.map(({ family, source, descriptors }) => ({ family, source, descriptors }))).to.deep.equal([
        { family: 'DejaVuSans', source: 'url(\'https://example.invalid/styles/fonts/DejaVuSans.ttf\')', descriptors: { style: 'normal', weight: 'normal' } },
        { family: 'DejaVuSans', source: 'url(\'https://example.invalid/styles/fonts/DejaVuSans-Bold.ttf\')', descriptors: { style: 'normal', weight: 'bold' } }
      ])

      fontFaces[0].resolve()
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(settled).to.equal(false)

      fontFaces[1].resolve()
      await request
      expect(addedFontFaces).to.deep.equal(fontFaces)

      await loader._requestFontFace({ FontFamily: 'DejaVuSans' })
      expect(fontFaces).to.have.length(2)
    })

    it('tries Italic before Oblique and resolves when a family has no italic file', async () => {
      const request = loader._requestFontFace({ FontFamily: 'Kalam', FontStyle: 'italic' })

      expect(fontFaces[1].source).to.equal(
        'url(\'https://example.invalid/styles/fonts/Kalam-Italic.ttf\'), url(\'https://example.invalid/styles/fonts/Kalam-Oblique.ttf\')'
      )

      fontFaces[0].resolve()
      fontFaces[1].reject(new Error('404'))
      await request

      expect(addedFontFaces).to.deep.equal([fontFaces[0]])
    })

    it('keeps loading the file given in FontSpecs', async () => {
      const request = loader._requestFontFace({ FontFamily: 'DejaVuSans', FontStyle: 'bold', FontSpecs: ['DejaVuSans-Bold.ttf', 'bold'] })

      expect(fontFaces.map(({ source, descriptors }) => ({ source, descriptors }))).to.deep.equal([
        { source: 'url(\'https://example.invalid/styles/fonts/DejaVuSans-Bold.ttf\')', descriptors: { style: 'normal', weight: 'bold' } }
      ])

      fontFaces[0].resolve()
      await request
    })
  })
})
