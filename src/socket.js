const { EventEmitter } = require('events');
const { Server } = require('ws');

const { checkSecret, appExist } = require('./applications');

class Client extends EventEmitter {
  constructor(ws) {
    super();

    this._isAuthorized = false;
    this._canWrite = false;
    this._appId = null;

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

  _onMessage(message) {
    const msg = JSON.parse(message);

    if (msg.type === 'auth') {
      if (!msg.appId) {
        return this.send('auth_failed', { message: 'appId is required'});
      }

      if (!appExist(msg.appId)) {
        return this.send('auth_failed', { message: 'unknown appId'});
      }

      if (checkSecret(msg.accessToken)) {
        this._canWrite = true;
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

    if (msg.type === 'change') {
      return this.emit('change', msg);
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
  constructor({ server }) {
    super();

    this._server = server;
    this._wss = new Server({ server });
    this._clients = {};

    this._wss.on('connection', (ws) => this._handleConnect(ws));
    this._wss.on('close', (ws) => this._handleClose(ws));
  }

  _handleConnect(ws) {
    const client = new Client(ws);

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

    client.on('change', (event) => {
      this.emit('change', client, event);
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

module.exports = {
  WsServer,
};
