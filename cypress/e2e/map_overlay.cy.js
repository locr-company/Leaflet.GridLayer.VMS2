describe('map overlay specs', () => {
  const prefix = 'data:image/png;base64,'

  /*
  it('can display an empty map with a SvgLayer.', () => {
    cy.visit('http://localhost:9876/map_overlay_with_svg_layer.html')

    cy.window().then(win => {
      const map = win.document.getElementById('map')
      if (map.leafletMap instanceof win.L.Map) {
        map.leafletMap.eachLayer(layer => {
          if (!(layer instanceof win.L.GridLayer.VMS2)) {
            return
          }

          cy.wrap(layer.getPrintCanvas()).then(canvas => {
            const image = canvas[0].toDataURL('image/png')
            cy.fixture('map_overlay_with_svg_layer.png').then(refImage => {
              expect(refImage).to.equal(image.slice(prefix.length))
            })
          })
        })
      }
    })
  })
  //*/

  it('can display an empty map with a TextSvgLayer.', () => {
    cy.visit('http://localhost:9876/map_overlay_with_text_svg_layer.html')

    cy.window().then(win => {
      const map = win.document.getElementById('map')
      if (map.leafletMap instanceof win.L.Map) {
        map.leafletMap.eachLayer(layer => {
          if (!(layer instanceof win.L.GridLayer.VMS2)) {
            return
          }

          cy.wrap(layer.getPrintCanvas()).then(canvas => {
            const image = canvas[0].toDataURL('image/png')
            const base64Data = image.slice(prefix.length);
            cy.writeFile('cypress/artifacts/map_overlay_with_text_svg_layer.png', base64Data, 'base64');
            cy.fixture('map_overlay_with_text_svg_layer.png').then(refImage => {
              expect(refImage).to.equal(base64Data)
            })
          })
        })
      }
    })
  })

  /*
  it('can display an empty map with an ImageSvgLayer.', () => {
    cy.visit('http://localhost:9876/map_overlay_with_image_svg_layer.html')

    cy.window().then(win => {
      const map = win.document.getElementById('map')
      if (map.leafletMap instanceof win.L.Map) {
        map.leafletMap.eachLayer(layer => {
          if (!(layer instanceof win.L.GridLayer.VMS2)) {
            return
          }

          cy.wrap(layer.getPrintCanvas()).then(canvas => {
            const image = canvas[0].toDataURL('image/png')
            cy.fixture('map_overlay_with_image_svg_layer.png').then(refImage => {
              expect(refImage).to.equal(image.slice(prefix.length))
            })
          })
        })
      }
    })
  })

  it('can display an empty map with an ImageSvgLayer with a relative image path.', () => {
    cy.visit('http://localhost:9876/map_overlay_with_relative_image_svg_layer.html')

    cy.window().then(win => {
      const map = win.document.getElementById('map')
      if (map.leafletMap instanceof win.L.Map) {
        map.leafletMap.eachLayer(layer => {
          if (!(layer instanceof win.L.GridLayer.VMS2)) {
            return
          }

          cy.wrap(layer.getPrintCanvas()).then(canvas => {
            const image = canvas[0].toDataURL('image/png')
            cy.fixture('map_overlay_with_image_svg_layer.png').then(refImage => {
              expect(refImage).to.equal(image.slice(prefix.length))
            })
          })
        })
      }
    })
  })

  it('can display an empty map with a PoiLayer.', () => {
    cy.visit('http://localhost:9876/map_overlay_with_poi_layer.html')

    cy.window().then(win => {
      const map = win.document.getElementById('map')
      if (map.leafletMap instanceof win.L.Map) {
        map.leafletMap.eachLayer(layer => {
          if (!(layer instanceof win.L.GridLayer.VMS2)) {
            return
          }

          cy.wrap(layer.getPrintCanvas()).then(canvas => {
            const image = canvas[0].toDataURL('image/png')
            cy.fixture('map_overlay_with_poi_layer.png').then(refImage => {
              expect(refImage).to.equal(image.slice(prefix.length))
            })
          })
        })
      }
    })
  })
  //*/
})
