const http = require('http');
const path = require('path');
const express = require('express');
const handlebars = require('express-handlebars');

const {
  setStatus,
  getStatus,
  appExist,
} = require('./applications');

const { WsServer } = require('./socket');
const log = require('./logger');

const app = express();
const server = http.createServer(app);
const wsServer = new WsServer({ server });

const subscriptions = {};

wsServer.on('subscribe', (client) => {
  const appId = client.getAppId();

  if (!subscriptions[appId]) {
    subscriptions[appId] = [];
  }

  subscriptions[appId].push(client);

  client.send('change', getStatus(appId));
});

wsServer.on('change', (client, event) => {
  const { payload: { services = [] } = {} } = event;

  const appId = client.getAppId();

  if (!appExist(appId)) {
    // TODO: give some more information
    log.warn(`App "${appId}" does not exist!`);
    return;
  }

  setStatus(appId, services);

  wsServer.send(appId, 'change', getStatus(appId));
});

wsServer.on('close', (client) => {
  const appId = client.getAppId();

  if (subscriptions[appId]) {
    subscriptions[appId] = subscriptions[appId].filter(c => c !== client);
  }
});

app.engine('handlebars', handlebars());

app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));


app.get('/:appId', function (req, res) {
  const { appId } = req.params;

  const title = `Status for ${appId.charAt(0).toLocaleUpperCase()}${appId.slice(1)}`;

  const status = getStatus(appId);

  res.render('status', {
    title,
    applicationId: appId,
    status,
    statusJson: JSON.stringify(status),
  });
});

module.exports = () => server.listen(3001, () => {
  console.log('Server listening on port 3001')
});