describe('basic map specs', () => {
  const prefix = 'data:image/png;base64,'

  it('can display an empty (blue-water) map.', () => {
    cy.visit('http://localhost:9876/default_map.html?disable_decode=true&zoom=15')

    cy.window().then(win => {
      const map = win.document.getElementById('map')
      if (map.leafletMap instanceof win.L.Map) {
        map.leafletMap.eachLayer(layer => {
          if (!(layer instanceof win.L.GridLayer.VMS2)) {
            return
          }

          cy.wrap(layer.getPrintCanvas(), { timeout: 60000 }).then(canvas => {
            const image = canvas[0].toDataURL('image/png')
            const base64Data = image.slice(prefix.length)
            cy.writeFile('cypress/artifacts/empty_map.png', base64Data, 'base64')
            cy.task('comparePngs', {
              base: 'cypress/fixtures/empty_map.png',
              compare: 'cypress/artifacts/empty_map.png',
              diffPath: 'cypress/artifacts/empty_map-diff.png',
            }).then((diffPixelCount) => {
              expect(diffPixelCount).to.lessThan(100)
            })
          })
        })
      }
    })
  })
})
