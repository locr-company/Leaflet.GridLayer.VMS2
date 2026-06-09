/* global describe, it */

import { expect } from 'chai'

import { collectSvgUrlStrings } from '../src/leaflet-gridlayer-vms2/overlay.js'

describe('overlay SVG URL collection', () => {
  it('collects external URLs and ignores internal references', () => {
    const svgString = [
      '<svg xmlns="http://www.w3.org/2000/svg">',
      '<g style="fill:url(\'https://example.com/pattern.svg\')">',
      '<image href="https://example.com/icons/icon.svg" />',
      '<image href="icons/icon.svg" />',
      '<path style="stroke:url(\'#gradient\')" />',
      '<path style="fill:url(\'data:image/svg+xml;base64,AAAA\')" />',
      '</g>',
      '</svg>'
    ].join('')

    expect(collectSvgUrlStrings(svgString)).to.deep.equal([
      'https://example.com/pattern.svg',
      'data:image/svg+xml;base64,AAAA',
      'https://example.com/icons/icon.svg',
      'icons/icon.svg'
    ])
  })
})
