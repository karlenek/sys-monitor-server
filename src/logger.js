const { createLogger, transports, format } = require('winston');

const loggerConfig =   {
  level: 'debug',
  transports: [
    new transports.Console(),
  ],
  format: format.combine(
    format.splat(),
    format.colorize(),
    format.simple()
  ),
};

const logger = createLogger(loggerConfig);

logger.init = (config = {}) => {
  if (config.level) {
    loggerConfig.level = config.level;
  }

  logger.configure(loggerConfig);
};

module.exports = logger;