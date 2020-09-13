const { EventEmitter } = require('events');
const fs = require('fs');
const log = require('./logger');

const { sendMail } = require('./mail');

const APPLICATION_STATE_CHANGED = 'applicationStateChanged';
const DEFAULT_UPDATE_INTERVAL = 5000;

class Application extends EventEmitter {
  constructor(application) {
    super();

    const updateInterval = application.updateInterval || DEFAULT_UPDATE_INTERVAL;

    this._application = {};
    this._name = application.name;
    this._id = application.id;
    this._status = 'Unknown';
    this._services = application.services || [];
    this._emailReceivers = application.email || [];

    this._token = application.token;

    this._storage = `data/${application.id}.json`;

    if (!fs.existsSync('data')) {
      fs.mkdirSync('data');
    }
    if (!fs.existsSync(this._storage)) {
      fs.writeFileSync(this._storage, '{}');
    }

    this._storedState = JSON.parse(fs.readFileSync(this._storage));

    const { services: storedServices = {}, updated = 0 } = this._storedState;

    this._updated = updated;
    this._online = this._updated + updateInterval > Date.now();

    this._services = this._services.map((service) => {
      const { online, sensitive = {}, status } = storedServices[service.id] || {};

      return {
        id: service.id,
        name: service.name,
        online: typeof online !== 'undefined' ? online : false,
        status: typeof status !== 'undefined' ? status : '--',
        sensitive: {
          ...sensitive,
          error: typeof sensitive.error !== 'undefined' ? sensitive.error : null,
        },
      };
    });

    // Make sure the application is alive and sending updates
    setInterval(() => {
      try {
        const someServiceIsOnline = this._services.some(s => s.online);
        if (someServiceIsOnline && this._updated + updateInterval < Date.now()) {
          this.setOffline();
        }
      } catch (err) {
        log.error(err);
      }
    }, 2000);

    // Send email when state changes
    this.on(APPLICATION_STATE_CHANGED, (...args) => this.onStateChanged(...args));

    this.persistState();
  }

  onStateChanged({ oldState, newState }) {
    if (this._emailReceivers.length === 0) {
      return;
    }

    if (!this._oldStateForEmail) {
      this._oldStateForEmail = oldState;
    }

    clearTimeout(this._emailTimer);

    this._emailTimer = setTimeout(async () => {
      const oldStateString = JSON.stringify(this._oldStateForEmail);
      const newStateString = JSON.stringify(newState);

      try {
        if (oldStateString !== newStateString) {
          log.debug(`Sending email notification to: ${this._emailReceivers.join(',')}`);

          const content = JSON.stringify({
            newState,
            oldState,
          }, null, 4);

          await sendMail({
            subject: newState.online ? `${this.getId()} is online` : `${this.getId()} is offline`,
            content,
            receivers: [...this._emailReceivers],
          });
        }
      } catch (err) {
        console.error(err);
        log.error('Failed to send email');
      }
      this._oldStateForEmail = null;
      this._emailTimer = undefined;
    }, 5000);
  }

  persistState() {
    this._services.forEach((service) => {
      const { online, status, sensitive, id, updated } = service;

      if (!this._storedState.services) {
        this._storedState.services = {};
      }

      this._storedState.updated = this._updated;

      this._storedState.services[service.id] = {
        id,
        online,
        status,
        sensitive,
      };
    });

    fs.writeFile(
      this._storage,
      JSON.stringify(this._storedState, null, 4),
      (err) => {
        if (err) {
          log.error(err);
          log.error('Failed to store application states');
        }
      },
    );
  }

  setState(services) {
    const oldState = this.getState(true);

    services.forEach((service) => {
      const index = this._services.findIndex(s => s.id === service.id);
  
      if (index === -1) {
        log.warn(`Trying to set status on service that has not been registred. Service: ${service.id}, App: ${appId}`);
        return;
      }

      const { id, status, online, ...rest } = service;
  
      this._services[index] = {
        ...this._services[index],
        id,
        status,
        online,
        sensitive: rest,
      };
    });

    this._online = this._services.every(s => s.online);

    this._updated = Date.now();

    const newState = this.getState(true);

    this.persistState();

    if (JSON.stringify(oldState) !== JSON.stringify(newState)) {
      this.emit(APPLICATION_STATE_CHANGED, {
        newState,
        oldState,
      });
    }
  }

  getState(includeSensitive = false) {
    return JSON.parse(JSON.stringify({
      id: this._id,
      name: this._name,
      online: this._online,
      services: this._services.map((service) => ({
        ...service,
        sensitive: includeSensitive ? service.sensitive : undefined,
      })),
    }));
  }

  setOffline() {
    let { services } = this.getState();

    services = services.map((service) => {
      if (!service.online) {
        return service;
      }

      return {
        ...service,
        online: false,
        status: 'Application Offline',
        sensitive: {},
      };
    });

    this.setState(services);
  }

  checkToken(token) {
    if (!this._token || !token) {
      return false;
    }

    return this._token === token;
  }

  getId() {
    return this._id;
  }

  getName() {
    return this._name;
  }
}

Application.APPLICATION_STATE_CHANGED = APPLICATION_STATE_CHANGED;

module.exports = Application;
