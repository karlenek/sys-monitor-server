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


async function sendMail({
  receivers,
  subject,
  content,
}) {
  const to = receivers.join(', ');

  const info = await transport.sendMail({
    from: sender,
    to,
    subject,
    text: content,
  });

  console.log(info);
  return true;
}

module.exports = {
  sendMail,
};
