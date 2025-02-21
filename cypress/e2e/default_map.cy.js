describe('basic map specs', () => {
  const prefix = 'data:image/png;base64,'

  it('can display a default map of locr HQ in BS.', () => {
    cy.visit('http://localhost:9876/default_map.html')

    cy.window().then(win => {
      const map = win.document.getElementById('map')
      if (map.leafletMap instanceof win.L.Map) {
        map.leafletMap.eachLayer(layer => {
          if (!(layer instanceof win.L.GridLayer.VMS2)) {
            return
          }

          cy.wrap(layer.getPrintCanvas(), { timeout: 30000 }).then(canvas => {
            const image = canvas[0].toDataURL('image/png')
            cy.fixture('default_map.png').then(refImage => {
              expect(refImage).to.equal(image.slice(prefix.length))
            })
          })
        })
      }
    })
  })
})
