import express from 'express'
import helmet from 'helmet'
import serveIndex from 'serve-index'
import { SQLite } from '@locr-company/vms2-tile-db-reader'

const tileDb = new SQLite('cypress/test-website/braunschweig.sqlite')
//const tileDb = new SQLite('/zfs_pool/data/vms2/tiles.sqlite')

const app = express()

app.use('/', serveIndex('cypress/test-website'))
app.use('/', express.static('cypress/test-website'))
app.use(helmet())

app.get('/api/tile/:z/:y/:x', (req, res) => {
  const tileData = tileDb.getRawData(
    req.params.x,
    req.params.y,
    req.params.z,
    req.query.k,
    req.query.v,
    req.query.t
  )

  res.setHeader('Content-Type', 'application/octet-stream')
  res.write(tileData)
  res.end()
})

app.listen(9876, () => {
  console.log('Server running at http://localhost:9876')
})
