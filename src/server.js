const http = require('http');
const createWss = require('./ws');
const createApp = require('./http');
const log = require('./logger');
const { port } = require('./config');

function createServer(applications) {
  const httpApp = createApp(applications);
  const server = http.createServer(httpApp);

  createWss(applications, {server});

  server.listen(port, () => {
    log.info(`Server listening on port ${port}`);
  })
}

module.exports = createServer;
