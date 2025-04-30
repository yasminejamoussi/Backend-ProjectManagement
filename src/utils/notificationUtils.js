const nodemailer = require('nodemailer');
const twilio = require('twilio');
const mongoose = require('mongoose');

// Model for notification history
const NotificationSchema = new mongoose.Schema({
  type: { type: String, enum: ['email', 'sms'] },
  to: String,
  subject: String,
  message: String,
  status: { type: String, enum: ['sent', 'failed'], default: 'sent' },
  createdAt: { type: Date, default: Date.now },
  notificationType: { type: String, enum: ['project', 'task'] },
  entityId: { type: mongoose.Schema.Types.ObjectId },
  read: { type: Boolean, default: false },
});
const Notification = mongoose.model('Notification', NotificationSchema);

// Nodemailer configuration (hard-coded credentials)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'orkestra.notifications@gmail.com',
    pass: 'zzgf zmys jzrv thtw',
  },
});

// Twilio configuration (hard-coded credentials)
const twilioClient = twilio(
  'ACcf28b54b8bbd20dbb06fc7ed3c12302a',
  'a0d71c39d69526fc663b3c3e7c0bfd06'
);

// Send email
const sendEmail = async (to, subject, text, html, notificationData) => {
  const mailOptions = {
    from: 'orkestra.notifications@gmail.com',
    to,
    subject,
    text,
    html,
  };
  try {
    await transporter.sendMail(mailOptions);
    await new Notification({ ...notificationData, type: 'email', to, status: 'sent' }).save();
    console.log('Email sent to', to);
  } catch (error) {
    await new Notification({ ...notificationData, type: 'email', to, status: 'failed' }).save();
    console.error(`Error sending email to ${to}:`, error.message);
    throw error;
  }
};

// Send SMS
const sendSMS = async (to, body, notificationData) => {
  let formattedNumber = to;
  if (!to.startsWith('+') && /^\d{8}$/.test(to)) {
    formattedNumber = `+216${to}`;
  }
  if (!formattedNumber.startsWith('+216') || formattedNumber.length !== 12) {
    throw new Error(`Invalid number: ${to}. Use a Tunisian 8-digit number or format +21612345678`);
  }
  try {
    await twilioClient.messages.create({
      body,
      from: '+14406434264',
      to: formattedNumber,
    });
    await new Notification({ ...notificationData, type: 'sms', to: formattedNumber, status: 'sent' }).save();
    console.log('SMS sent to', formattedNumber);
  } catch (error) {
    await new Notification({ ...notificationData, type: 'sms', to: formattedNumber, status: 'failed' }).save();
    console.error(`Error sending SMS to ${formattedNumber}:`, error.message);
    throw error;
  }
};

// Send notification (email + SMS)
const sendNotification = async (type, recipients, notif, adminId) => {
  const notificationData = {
    notificationType: type,
    entityId: notif.type === 'project' ? notif.projectId : notif.taskId,
  };
  try {
    const recipientList = Array.isArray(recipients) ? recipients : [recipients];
    
    for (const user of recipientList) {
      const isAdmin = adminId && user._id.toString() === adminId;
      const isProjectManager = notif.projectManager && user._id.toString() === notif.projectManager._id.toString();
      const isAssignedTo = notif.type === 'task' && notif.assignedTo.some(u => u._id.toString() === user._id.toString());

      let smsMessage, emailMessage, subject, html;

      if (notif.type === 'project') {
        if (isAdmin) {
          smsMessage =` Delay: Project '${notif.projectName}' - ${notif.delayDays} days. Supervise.`;
          emailMessage = `Delay Alert for Project '${notif.projectName}':  
Delay: ${notif.delayDays} days  
Deadline: ${notif.endDate}  
Manager: ${notif.projectManagerName}  

Please supervise the progress and coordinate with the team.`;
          subject = `Project Alert: ${notif.projectName}`;
        } else if (isProjectManager) {
          smsMessage = `Urgent: Project '${notif.projectName}' delayed by ${notif.delayDays} days! Adjust the schedule now.`;
          emailMessage = `Important Alert for Project '${notif.projectName}':  
Delay: ${notif.delayDays} days  
Deadline: ${notif.endDate}  

As the project manager, please adjust the schedule promptly and coordinate with your team to minimize impact on deliverables. If needed, consider allocating more resources to speed up progress.`;
          subject =` Project Alert: ${notif.projectName}`;
        }
      } else {
        if (isAdmin) {
          smsMessage = `Delay: Task '${notif.taskTitle}' (${notif.projectName}) - ${notif.delayDays} days. Supervise.`;
          emailMessage = `Delay Alert for Task '${notif.taskTitle}':  
Project: ${notif.projectName}  
Delay: ${notif.delayDays} days  
Deadline: ${notif.endDate}  
Assigned: ${notif.assignedToNames}  

Please supervise the progress of this task.`;
          subject = `Task Alert: ${notif.taskTitle}`;
        } else if (isProjectManager) {
          smsMessage = `Alert: Task '${notif.taskTitle}' (${notif.projectName}) delayed by ${notif.delayDays} days.`;
          emailMessage = `Delay Alert for Task '${notif.taskTitle}':  
Project: ${notif.projectName}  
Delay: ${notif.delayDays} days  
Deadline: ${notif.endDate}  

As the project manager, please closely monitor this task’s progress with your team to ensure subsequent stages are not affected.`;
          subject = `Task Alert: ${notif.taskTitle}`;
        } else if (isAssignedTo) {
          smsMessage = `Urgent: Task '${notif.taskTitle}' (${notif.projectName}) delayed by ${notif.delayDays} days. Update now!`;
          emailMessage = `Urgent Alert for Task '${notif.taskTitle}':  
Project: ${notif.projectName}  
Delay: ${notif.delayDays} days  
Deadline: ${notif.endDate}  

You are assigned to this task. Please update its status immediately in the system and inform your project manager of any obstacles.`;
          subject = `Task Alert: ${notif.taskTitle}`;
        }
      }

      if (!smsMessage || !emailMessage) continue;

      // HTML template for the email
      html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${subject}</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
          <div style="max-width: 600px; margin: 20px auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; background-color: #ffffff;">
            <div style="background-color: #9074f4; color: #ffffff; padding: 20px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; line-height: 1.2;">Orkestra Delay Notification</h1>
            </div>
            <div style="padding: 25px;">
              <h2 style="color: #333333; font-size: 20px; margin: 0 0 20px 0; line-height: 1.3;">
                ${notif.type === 'project' ? `Project: ${notif.projectName} `: `Task: ${notif.taskTitle}`}
              </h2>
              <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 0;">
                ${emailMessage.replace(/\n/g, '<br>')}
              </p>
            </div>
            <div style="background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #777777;">
              <p style="margin: 0;">© 2025 Orkestra. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      notificationData.subject = subject;
      notificationData.message = emailMessage;

      if (user.email) {
        await sendEmail(user.email, subject, emailMessage, html, notificationData);
      }
      if (user.phone) {
        await sendSMS(user.phone, smsMessage, { ...notificationData, message: smsMessage });
      }
    }
  } catch (error) {
    console.error('Error sending notification:', error);
    throw error;
  }
};

module.exports = { sendNotification, Notification };