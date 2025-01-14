describe('map overlay specs', () => {
  const prefix = 'data:image/png;base64,'

  it('can display an empty map with a SvgLayer.', () => {
    const baseFilename = 'map_overlay_with_svg_layer'
    cy.visit(`http://localhost:9876/${baseFilename}.html`)

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
            cy.writeFile(`cypress/artifacts/${baseFilename}.png`, base64Data, 'base64');
            cy.task('comparePngs', {
              base: `cypress/fixtures/${baseFilename}.png`,
              compare: `cypress/artifacts/${baseFilename}.png`,
              diffPath: `cypress/artifacts/${baseFilename}-diff.png`,
            }).then((diffPixelCount) => {
              expect(diffPixelCount).to.equal(0)
            })
          })
        })
      }
    })
  })

  it('can display an empty map with a TextSvgLayer.', () => {
    const baseFilename = 'map_overlay_with_text_svg_layer'
    cy.visit(`http://localhost:9876/${baseFilename}.html`)

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
            cy.writeFile(`cypress/artifacts/${baseFilename}.png`, base64Data, 'base64');
            cy.task('comparePngs', {
              base: `cypress/fixtures/${baseFilename}.png`,
              compare: `cypress/artifacts/${baseFilename}.png`,
              diffPath: `cypress/artifacts/${baseFilename}-diff.png`,
            }).then((diffPixelCount) => {
              expect(diffPixelCount).to.be.lessThanOrEqual(100)
            })
          })
        })
      }
    })
  })

  it('can display an empty map with an ImageSvgLayer.', () => {
    const baseFilename = 'map_overlay_with_image_svg_layer'
    cy.visit(`http://localhost:9876/${baseFilename}.html`)

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
            cy.writeFile(`cypress/artifacts/${baseFilename}.png`, base64Data, 'base64');
            cy.task('comparePngs', {
              base: `cypress/fixtures/${baseFilename}.png`,
              compare: `cypress/artifacts/${baseFilename}.png`,
              diffPath: `cypress/artifacts/${baseFilename}-diff.png`,
            }).then((diffPixelCount) => {
              expect(diffPixelCount).to.equal(0)
            })
          })
        })
      }
    })
  })

  it('can display an empty map with an ImageSvgLayer with a relative image path.', () => {
    const baseFilename = 'map_overlay_with_relative_image_svg_layer'
    cy.visit(`http://localhost:9876/${baseFilename}.html`)

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
            cy.writeFile(`cypress/artifacts/${baseFilename}.png`, base64Data, 'base64');
            cy.task('comparePngs', {
              base: `cypress/fixtures/${baseFilename}.png`,
              compare: `cypress/artifacts/${baseFilename}.png`,
              diffPath: `cypress/artifacts/${baseFilename}-diff.png`,
            }).then((diffPixelCount) => {
              expect(diffPixelCount).to.equal(0)
            })
          })
        })
      }
    })
  })

  it('can display an empty map with a PoiLayer.', () => {
    const baseFilename = 'map_overlay_with_poi_layer'
    cy.visit(`http://localhost:9876/${baseFilename}.html`)

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
            cy.writeFile(`cypress/artifacts/${baseFilename}.png`, base64Data, 'base64');
            cy.task('comparePngs', {
              base: `cypress/fixtures/${baseFilename}.png`,
              compare: `cypress/artifacts/${baseFilename}.png`,
              diffPath: `cypress/artifacts/${baseFilename}-diff.png`,
            }).then((diffPixelCount) => {
              expect(diffPixelCount).to.equal(0)
            })
          })
        })
      }
    })
  })
})
