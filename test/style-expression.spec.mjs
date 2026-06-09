/* global describe, it */

import { expect } from 'chai'

import RandomGenerator from '../src/leaflet-gridlayer-vms2/random-generator.js'
import {
  compileObjectDataExpression,
  compileSortExpression
} from '../src/leaflet-gridlayer-vms2/style-expression.js'

describe('style expression compiler', () => {
  it('evaluates placeholders, regex replacements, and missing tag fallbacks', () => {
    const compiled = compileObjectDataExpression("<tags>['name:de'] ? <tags>['name:de'] : <name>")

    expect(compiled({ name: 'Lake Example' }, 12, new RandomGenerator())).to.equal('Lake Example')
    expect(compiled({ name: 'Lake Example', tags: { 'name:de': 'See Beispiel' } }, 12, new RandomGenerator())).to.equal('See Beispiel')
  })

  it('supports regex literals inside string replacements', () => {
    const compiled = compileObjectDataExpression("<name>.replace(/ County$/, '')")

    expect(compiled({ name: 'Example County' }, 12, new RandomGenerator())).to.equal('Example')
  })

  it('supports array membership, ternaries, and string methods', () => {
    const compiled = compileObjectDataExpression("MapZoom >= 16 ? <name> : (<name> && [ 'lake', 'lagoon' ].includes(<water>) ? <name> : null)")

    expect(compiled({ name: 'Lake Example', water: 'lake' }, 15, new RandomGenerator())).to.equal('Lake Example')
    expect(compiled({ name: 'River Example', water: 'river' }, 15, new RandomGenerator())).to.equal(null)
    expect(compiled({ name: 'Lake Example', water: 'lake' }, 16, new RandomGenerator())).to.equal('Lake Example')
  })

  it('supports the shipped math and parsing helpers', () => {
    const compiled = compileObjectDataExpression("'512_peak_' + Math.max(Math.min(Math.round(isNaN(parseFloat(<ele> ? <ele> : '0')) ? 0 : (parseFloat(<ele> ? <ele> : '0') * 27 / 9000)) + 1, 28), 1) + '.png'")

    expect(compiled({ ele: '9000' }, 12, new RandomGenerator())).to.equal('512_peak_28.png')
    expect(compiled({ ele: 'not-a-number' }, 12, new RandomGenerator())).to.equal('512_peak_1.png')
  })

  it('supports random generator calls and sortable expressions', () => {
    const randomGenerator = new RandomGenerator()
    randomGenerator.init_seed(123)

    const patternFn = compileObjectDataExpression("RandomGenerator.random_pick(['a', 'b'], [1, 1])")
    expect(['a', 'b']).to.include(patternFn({}, 0, randomGenerator))

    const sortFn = compileSortExpression("parseInt(b.population) - parseInt(a.population)")
    expect(sortFn({ population: '10' }, { population: '25' })).to.equal(15)
    expect(sortFn({ population: '25' }, { population: '10' })).to.equal(-15)
  })
})
