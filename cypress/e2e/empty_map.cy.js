describe('template spec', () => {
  it('passes', () => {
    cy.visit('http://localhost:9876/empty_map.html')

    cy.window().then(win => {
      cy.wait(2000).then(() => {
        const map = win.document.getElementById('map')
        if (map.leafletMap instanceof win.L.Map) {
          map.leafletMap.eachLayer(layer => {
            if (!(layer instanceof win.L.GridLayer.VMS2)) {
              return
            }

            layer.getPrintCanvas().then(canvas => {
              const image = canvas.toDataURL('image/png')
              cy.writeFile('empty_map.png', image)
              cy.readFile('empty_map.png').should('exist')
            })
          })
        }
      })
    })
  })
})