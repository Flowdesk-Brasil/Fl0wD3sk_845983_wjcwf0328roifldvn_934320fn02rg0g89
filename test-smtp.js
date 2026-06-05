const nodemailer = require('nodemailer');

async function testSMTP() {
  const transporter = nodemailer.createTransport({
    host: 'smtp.hostinger.com',
    port: 465,
    secure: true,
    auth: {
      user: 'fdesk@flwdesk.com',
      pass: 'Xg7@tY9LmQp4VrZb2Nv8KtWx5Qr'
    },
    logger: true,
    debug: true
  });

  try {
    const success = await transporter.verify();
    console.log('Success:', success);
  } catch (err) {
    console.error('Error:', err);
  }
}

testSMTP();
