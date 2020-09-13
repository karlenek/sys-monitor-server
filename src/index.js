const config = require('./config');
const Application = require('./application');
const startServer = require('./server');

startServer(config.applications.map((app) => new Application(app)));
