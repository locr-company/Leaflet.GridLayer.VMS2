describe('basic map specs', () => {
  const prefix = 'data:image/png;base64,'
  const visitAndCompare = (baseFilename) => {
    cy.visit(`http://localhost:9876/${baseFilename}.html`)

    cy.window().then(win => {
      const map = win.document.getElementById('map')
      if (!(map.leafletMap instanceof win.L.Map)) {
        return
      }

      map.leafletMap.eachLayer(layer => {
        if (!(layer instanceof win.L.GridLayer.VMS2)) {
          return
        }

        cy.wrap(layer.getPrintCanvas(), { timeout: 60000 }).then(canvas => {
          const image = canvas[0].toDataURL('image/png')
          const base64Data = image.slice(prefix.length)
          cy.writeFile(`cypress/artifacts/${baseFilename}.png`, base64Data, 'base64')
          cy.task('comparePngs', {
            base: `cypress/fixtures/${baseFilename}.png`,
            compare: `cypress/artifacts/${baseFilename}.png`,
            diffPath: `cypress/artifacts/${baseFilename}-diff.png`,
          }).then((diffPixelCount) => {
            expect(diffPixelCount).to.lessThan(100)
          })
        })
      })
    })
  }

  it('can display a default map of locr HQ in BS.', () => {
    visitAndCompare('default_map')
  })
})
