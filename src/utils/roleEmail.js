const nodemailer = require('nodemailer');
const RoleNotification = require('../models/RoleNotification');
const mongoose = require('mongoose');

const sendRoleEmail = async (to, subject, text, html, userId) => {
  try {
    console.log('sendRoleEmail called for:', to, 'with userId:', userId);

    // Validate inputs
    if (!to || !subject || !text || !html || !userId) {
      throw new Error('Missing required parameters: to, subject, text, html, or userId');
    }

    // Validate userId as ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error(`Invalid userId: ${userId}`);
    }

    // Validate environment variables
    const emailUser = process.env.EMAIL_USER || 'orkestra.notifications@gmail.com';
    const emailPass = process.env.EMAIL_PASS || 'zzgf zmys jzrv thtw';
    if (!emailUser || !emailPass) {
      throw new Error('Missing EMAIL_USER or EMAIL_PASS in environment variables');
    }

    // Configure the email transporter
    console.log('Configuring nodemailer with user:', emailUser);
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: emailUser,
        pass: emailPass,
      },
    });

    // Verify transporter
    await transporter.verify();
    console.log('SMTP transporter verified successfully');

    // Define email options
    const mailOptions = {
      from: '"Orkestra Team" <orkestra.notifications@gmail.com>',
      to,
      subject,
      text,
      html,
    };

    // Send the email
    const info = await transporter.sendMail(mailOptions);
    console.log('Role email sent to:', to, 'Message ID:', info.messageId);

    // Save notification
    const notificationData = {
      user: userId,
      notificationType: 'role_assignment',
      message: text,
      entityId: userId,
      read: false,
      createdAt: new Date(),
    };
    await RoleNotification.create(notificationData);
    console.log('Role assignment notification saved:', notificationData);

    return info;
  } catch (error) {
    console.error('Error sending role email:', error);
    throw new Error(`Failed to send role email: ${error.message}`);
  }
};

module.exports = sendRoleEmail;