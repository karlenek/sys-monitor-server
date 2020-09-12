const config = require('./config');
const log = require('./logger');

const applications = {};
const secrets = {};

config.applications.forEach((app) => {
  applications[app.id] = {
    id: app.id,
    name: app.name,
    online: false,
    services: (app.services || []).map((service) => ({
      id: service.id,
      name: service.name,
      online: false,
      status: '--',
      info: {},
    })),
  };

  secrets[app.id] = app.secret;
});

function getStatus(appId) {
  const defaultApp = {
    id: appId,
    name: 'Not found',
    online: false,
    services: [],
  };

  return applications[appId] || defaultApp;
}

function checkSecret(appId, secret) {
  if (!secrets[appId]) {
    return false;
  }

  return secrets[appId] === secret;
}

function appExist(appId) {
  return !!applications[appId];
}

function setStatus(appId, services) {
  if (!applications[appId]) {
    throw new Error('Application not found');
  }

  services.forEach((service) => {
    const index = applications[appId].services.findIndex(s => s.id === service.id);

    if (index === -1) {
      log.warn(`Trying to set status on service that does not exist. Service: ${service.id}, App: ${appId}`);
      return;
    }

    applications[appId].services[index] = {
      ...applications[appId].services[index],
      status: service.status,
      online: service.online,
    };
  });

  const allOnline = applications[appId].services.every(s => s.online);

  applications[appId].online = allOnline;
}

module.exports = {
  getStatus,
  appExist,
  checkSecret,
  setStatus,
};
