const path = require('path');
const express = require('express');
const handlebars = require('express-handlebars');

const { port } = require('./config');
const log = require('./logger');

const app = express();
let applications = new Map();

app.engine('handlebars', handlebars());

app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));

app.get('/:appId', function (req, res) {
  const { appId } = req.params;

  const application = applications.get(appId);

  if (!application) {
    return res.render('not-found', {
      title: 'Not Found',
      applicationId: appId,
    });
  }

  const status = application.getState();

  res.render('status', {
    title: application.getName(),
    applicationId: appId,
    status,
    statusJson: JSON.stringify(status),
  });
});

app.use((req, res) => {
  res.render('not-found', {
    title: 'Not Found',
    message: 'The page was not found',
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  log.error(err);
  res.render('error', {
    title: 'Internal Server Error',
    message: err.message,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
  });
});

function createApp(apps) {
  applications = new Map(apps.map((app) => [app.getId(), app]));
  return app;
}

module.exports = createApp;
