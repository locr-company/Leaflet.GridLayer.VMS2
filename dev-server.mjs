import httpServer from 'http-server'

const server = httpServer.createServer({
  root: './cypress/test-website'
})

server.listen(9876, () => {
  console.log('Server running at http://localhost:9876')
})
