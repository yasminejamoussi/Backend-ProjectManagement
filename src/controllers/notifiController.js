const Task = require('../models/Task');
const Project = require('../models/Project');
const User = require('../models/User');
const Notification = require('../models/Notification');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  pool: true,
});

const checkAndNotifyDelays = async () => {
  try {
    console.log('Checking for delays at:', new Date().toISOString());

    // Vérifier les tâches en retard
    const tasks = await Task.find({
      dueDate: { $lt: new Date() },
      status: { $ne: 'Done' },
    }).populate('assignedTo project');
    console.log(`Found ${tasks.length} overdue tasks`);

    for (const task of tasks) {
      const project = task.project;
      const assignedUsers = task.assignedTo;

      for (const user of assignedUsers) {
        // Enregistrer la notification dans la base de données
        const notification = new Notification({
          user: user._id,
          type: 'DELAY',
          message: `The task "${task.title}" in project "${project.title}" is overdue. Due date was ${task.dueDate.toISOString()}.`,
          relatedEntity: task._id,
          relatedEntityType: 'Task',
        });
        await notification.save();
        console.log(`Saved delay notification for user ${user._id} for task ${task._id}`);

        // Envoyer l'email
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: user.email,
          subject: `Task Delay Alert: ${task.title}`,
          text: notification.message,
        };

        console.log(`Sending delay notification to ${user.email} for task ${task._id}...`);
        await transporter.sendMail(mailOptions);
        console.log(`Delay notification sent to ${user.email} for task ${task._id}`);
      }
    }

    // Vérifier les projets en retard
    const projects = await Project.find({
      dueDate: { $lt: new Date() },
      status: { $ne: 'Completed' },
    }).populate('projectManager');
    console.log(`Found ${projects.length} overdue projects`);

    for (const project of projects) {
      const projectManager = project.projectManager;

      // Enregistrer la notification
      const notification = new Notification({
        user: projectManager._id,
        type: 'DELAY',
        message: `The project "${project.title}" is overdue. Due date was ${project.dueDate.toISOString()}.`,
        relatedEntity: project._id,
        relatedEntityType: 'Project',
      });
      await notification.save();
      console.log(`Saved delay notification for user ${projectManager._id} for project ${project._id}`);

      // Envoyer l'email
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: projectManager.email,
        subject: `Project Delay Alert: ${project.title}`,
        text: notification.message,
      };

      console.log(`Sending delay notification to ${projectManager.email} for project ${project._id}...`);
      await transporter.sendMail(mailOptions);
      console.log(`Delay notification sent to ${projectManager.email} for project ${project._id}`);
    }
  } catch (error) {
    console.error('Error in checkAndNotifyDelays:', error.message);
  }
};

module.exports = { checkAndNotifyDelays };