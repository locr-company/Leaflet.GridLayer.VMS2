describe('basic map specs', () => {
  it('can display an empty (blue-water) map.', () => {
    cy.visit('http://localhost:9876/empty_map.html')

    cy.window().then(win => {
      const map = win.document.getElementById('map')
      if (map.leafletMap instanceof win.L.Map) {
        map.leafletMap.eachLayer(layer => {
          if (!(layer instanceof win.L.GridLayer.VMS2)) {
            return
          }

          cy.wrap(layer.getPrintCanvas()).then(canvas => {
            const image = canvas[0].toDataURL('image/png')
            cy.fixture('empty_map.base64').then(refImage => {
              expect(refImage).to.equal(image)
            })
          })
        })
      }
    })
  })
})
