const { EventEmitter } = require('events');
const Application = require('./application');
const { Server } = require('ws');

const CLIENT_TYPE_APPLICATION = 'application';
const CLIENT_TYPE_LISTENER = 'listener';

class Client extends EventEmitter {
  constructor(ws, { authorizeCallback }) {
    super();

    this._isAuthorized = false;
    this._isListener = true;
    this._isApplication = false;
    this._appId = null;

    this.authorizeCallback = authorizeCallback;

    this._type = CLIENT_TYPE_LISTENER;

    this._ws = ws;


    this._ws.on('message', (...args) => this._onMessage(...args));
    this._ws.on('close', (...args) => this._onClose(...args));

    this.send('auth_required');

    this._authTimeout = setTimeout(() => {
      this.close();
    }, 5000);
  }

  close() {
    this._ws.close();
  }

  send(type, { message, ...rest } = {}) {
    this._ws.send(JSON.stringify({
      type,
      message,
      payload: {
        message,
        ...rest,
      },
    }));
  }

  getAppId() {
    return this._appId;
  }

  isApplication() {
    return this._type === CLIENT_TYPE_APPLICATION;
  }

  _onMessage(message) {
    const msg = JSON.parse(message);

    if (msg.type === 'auth') {
      if (!msg.appId) {
        return this.send('auth_failed', { message: 'appId is required'});
      }

      const authResult = this.authorizeCallback(msg.appId, msg.accessToken);

      if (!authResult.app) {
        return this.send('auth_failed', { message: 'unknown appId'});
      }

      if (typeof msg.accessToken !== 'undefined') {
        if (!authResult.token) {
          return this.send('auth_failed', { message: authResult.message || 'invalid credentials'});
        } else {
          this._type = CLIENT_TYPE_APPLICATION;
        }
      }

      this._isAuthorized = true;
      this._appId = msg.appId;

      clearTimeout(this._authTimeout);
      this.send('auth_success');
      return this.emit('authorized');
    }

    if (msg.type === 'subscribe') {
      return this.emit('subscribe', msg);
    }

    if (msg.type === 'status') {
      if (!this.isApplication()) {
        this.send('forbidden', { message: 'change event ignored, no permission to write'});
        return;
      }
      return this.emit('status', msg);
    }

    console.log(msg);
  }

  _onClose() {
    this.emit('close');

    this._isAuthorized = false;
    this._canWrite = false;
    this._appId = null;

    this.removeAllListeners();
  }

}

class WsServer extends EventEmitter {
  constructor({ server, authorizeCallback }) {
    super();

    this._server = server;
    this._wss = new Server({ server });
    this._clients = {};
    this.authorizeCallback = authorizeCallback;

    this._wss.on('connection', (ws) => this._handleConnect(ws));
    this._wss.on('close', (ws) => this._handleClose(ws));
  }

  _handleConnect(ws) {
    const client = new Client(ws, {
      authorizeCallback: this.authorizeCallback,
    });

    client.on('authorized', () => {
      const appId = client.getAppId();

      if (!this._clients[appId]) {
        this._clients[appId] = [];
      }

      this._clients[appId].push(client);

      this.emit('connection', client);
    });

    client.on('subscribe', (event) => {
      this.emit('subscribe', client, event);
    });

    client.on('status', (event) => {
      this.emit('status', client, event);
    });

    client.on('close', () => {
      const appId = client.getAppId();

      this.emit('close', client);

      if (this._clients[appId]) {
        this._clients[appId] = this._clients[appId].filter(c => c !== client);
      }
    });
  }

  send(appId, type, payload) {
    if (!this._clients[appId]) {
      return;
    }

    this._clients[appId].forEach((client) => {
      client.send(type, payload);
    });
  }
}


function createWss(apps, { server }) {
  const applications = new Map(apps.map((app) => [app.getId(), app]));
  const applicationSockets = {};

  function authorizeCallback(appId, token) {
    const app = applications.get(appId);

    if (!app) {
      return {
        app: false,
        token: false,
      };
    }

    if (applicationSockets[appId] && applicationSockets[appId].length > 0) {
      return {
        app: true,
        token: false,
        message: 'application already connected',
      };
    }

    return {
      app: true,
      token: app.checkToken(token),
    };
  }

  const wsServer = new WsServer({ server, authorizeCallback });

  const subscriptions = {};

  wsServer.on('subscribe', (client) => {
    const appId = client.getAppId();
  
    if (!subscriptions[appId]) {
      subscriptions[appId] = [];
    }
  
    subscriptions[appId].push(client);

    const app = applications.get(appId);

    client.send('change', app.getState());
  });

  wsServer.on('status', (client, event) => {
    const { payload: { services = [] } = {} } = event;

    const appId = client.getAppId();

    const application = applications.get(appId);

    if (!application) {
      // Should never happen :P
      log.warn(`Trying to send data about an app that does not exist!; "${appId}"`);
      return;
    }

    application.setState(services);
  });

  wsServer.on('connection', (client) => {
    const appId = client.getAppId();

    if (client.isApplication()) {
      if (!applicationSockets[appId]) {
        applicationSockets[appId] = [];
      }

      applicationSockets[appId].push(client);
    }
  });

  wsServer.on('close', (client) => {
    const appId = client.getAppId();

    if (subscriptions[appId]) {
      subscriptions[appId] = subscriptions[appId].filter(c => c !== client);
    }

    if (client.isApplication()) {
      if (!applicationSockets[appId]) {
        applicationSockets[appId] = [];
      }

      applicationSockets[appId] = applicationSockets[appId].filter(x => x !== client);
    }

    if (applicationSockets[appId].length === 0) {
      const app = applications.get(appId);
      app.setOffline();
    }
  });

  applications.forEach((app) => {
    app.on(Application.APPLICATION_STATE_CHANGED, (data) => {
      const appId = app.getId();
      const clients = subscriptions[appId] || [];
      clients.forEach((client) => {
        client.send('change', app.getState());
      });
    });
  });

  return wsServer;
}

module.exports = createWss;
