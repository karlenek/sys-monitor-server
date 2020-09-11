const convict = require('convict');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

convict.addFormat({
  name: 'strict-array',
  validate: function(items, schema) {
    if (!Array.isArray(items)) {
      throw new Error('must be of type Array');
    }

    for (item of items) {
      convict(schema.children).load(item).validate();
    }
  }
});

const config = convict({
  configPath: {
    format: 'String',
    default: './config.json',
    env: 'SYSM_SERVER_CONFIG_PATH',
  },
  port: {
    format: 'port',
    default: 3001,
    env: 'SYSM_SERVER_PORT',
  },
  applications: {
    format: 'strict-array',
    default: [],
    children: {
      name: {
        format: 'String',
        default: 'unnamed',
      },
      id: {
        format: 'String',
        default: '-',
      },
      services: {
        format: 'strict-array',
        default: [],
        children: {
          name: {
            format: 'String',
            default: undefined,
          },
          id: {
            format: 'String',
            default: undefined,
          },
        },
      },
    },
  },
});

const configPath = path.join(__dirname, '../', config.get('configPath'));
logger.info(`Loading configuration from ${configPath}`);

if (fs.existsSync(configPath)) {
  config.loadFile(configPath);
  logger.info('Loaded configuration file');
} else {
  logger.warn('Config not available, using default config');
}

config.validate();

module.exports = config.getProperties();
