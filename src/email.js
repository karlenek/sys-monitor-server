const nodemailer = require('nodemailer');
const log = require('./logger');
const config = require('./config');

const {
  host,
  port,
  secure,
  auth: {
    username: user,
    password: pass,
  },
  sender,
} = config.mail;

const transport = nodemailer.createTransport({
  host,
  port,
  secure,
  requireTLS: secure,
  auth: {
    user,
    pass,
  }
});

// transport.sendMail({
//   from: sender,
//   to: 'karl@karl-ek.se',
//   subject: 'Testing',
//   text: 'A test message',
// }, (err, info) => {
//   if (err) {
//     console.error(err);
//     return;
//   }

//   console.log(info);
// });
