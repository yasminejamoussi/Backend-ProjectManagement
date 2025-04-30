const axios = require('axios');
const { sendNotification, Notification } = require('../utils/notificationUtils');
const Project = require('../models/Project');
const Task = require('../models/Task');
const User = require('../models/User');
const Role = require('../models/Role');

exports.checkAndNotifyDelays = async () => {
  try {
    console.log('Checking for delays...');

    // Fetch the admin role's ObjectId
    const adminRole = await Role.findOne({ name: 'Admin' });
    if (!adminRole) {
      console.error('Admin role not found in the roles collection');
    }

    // Fetch the admin user using the admin role's ObjectId
    const admin = adminRole ? await User.findOne({ role: adminRole._id }) : null;
    if (!admin) {
      console.error('Admin user not found');
    }

    // Fetch all projects
    const projects = await Project.find().populate('projectManager');
    const projectDelayPromises = projects.map(async (project) => {
      try {
        const delayResponse = await axios.get(`http://localhost:4000/api/projects/${project._id}/predict-delay`);
        if (delayResponse.data.riskOfDelay === 'Oui') {
          return {
            type: 'project',
            projectId: project._id,
            projectName: project.name,
            riskOfDelay: delayResponse.data.riskOfDelay,
            delayDays: Math.ceil(delayResponse.data.delayDays),
            projectManager: project.projectManager,
            endDate: project.endDate.toLocaleDateString('en-GB'),
            projectManagerName: project.projectManager ? ` ${project.projectManager.firstname} ${project.projectManager.lastname} ` : 'Unknown',
          };
        }
        return null;
      } catch (error) {
        console.error(`Error predicting delay for project ${project._id}:`, error.message);
        return null;
      }
    });

    // Fetch all tasks
    const tasks = await Task.find().populate('assignedTo project');
    const taskDelayPromises = tasks.map(async (task) => {
      try {
        const delayResponse = await axios.get(`http://localhost:4000/api/tasks/${task._id}/predict-delay`);
        if (delayResponse.data.riskOfDelay === 'Oui') {
          const assignedToNames = task.assignedTo.map(user => ` ${user.firstname} ${user.lastname}`).join(', ') || 'Unknown';
          return {
            type: 'task',
            taskId: task._id,
            taskTitle: task.title,
            projectName: task.project?.name || 'Unknown',
            projectManager: task.project?.projectManager || null,
            riskOfDelay: delayResponse.data.riskOfDelay,
            delayDays: Math.ceil(delayResponse.data.delayDays),
            assignedTo: task.assignedTo,
            endDate: task.endDate.toLocaleDateString('en-GB'),
            projectManagerName: task.project?.projectManager ? `${task.project.projectManager.firstname} ${task.project.projectManager.lastname}` : 'Unknown',
            assignedToNames: assignedToNames,
          };
        }
        return null;
      } catch (error) {
        console.error(`Error predicting delay for task ${task._id}:`, error.message);
        return null;
      }
    });

    const projectDelays = (await Promise.all(projectDelayPromises)).filter(p => p !== null);
    const taskDelays = (await Promise.all(taskDelayPromises)).filter(t => t !== null);

    const allNotifications = [...projectDelays, ...taskDelays];

    // Send notifications for new delays
    for (const notif of allNotifications) {
      try {
        // Check if a similar notification was sent in the last 24 hours
        const recentNotification = await Notification.findOne({
          notificationType: notif.type,
          entityId: notif.type === 'project' ? notif.projectId : notif.taskId,
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        });

        if (recentNotification) {
          console.log(`Notification already sent for ${notif.type}: ${notif.projectName || notif.taskTitle}`);
          continue;
        }

        let recipients;
        if (notif.type === 'project') {
          recipients = [notif.projectManager];
          if (admin) recipients.push(admin);
        } else {
          recipients = notif.assignedTo || [];
          if (notif.projectManager) {
            const projectManagerId = notif.projectManager._id.toString();
            const isAlreadyRecipient = recipients.some(user => user._id.toString() === projectManagerId);
            if (!isAlreadyRecipient) {
              recipients.push(notif.projectManager);
            }
          }
          if (admin) recipients.push(admin);
        }

        // Ensure recipients is an array and not empty
        if (!recipients || recipients.length === 0) {
          console.error(`No recipients for ${notif.type}: ${notif.projectName || notif.taskTitle}`);
          continue;
        }

        await sendNotification(
          notif.type,
          recipients,
          notif,
          admin ? admin._id.toString() : null
        );
        console.log(`Notification sent for ${notif.type}: ${notif.projectName || notif.taskTitle}`);
      } catch (error) {
        console.error(`Error sending notification for ${notif.type}:`, error.message);
      }
    }

    console.log('Delay check completed.');
    return allNotifications;
  } catch (error) {
    console.error('Global error in checkAndNotifyDelays:', error.message);
    throw error;
  }
};

// Manual endpoint to test
exports.triggerDelayCheck = async (req, res) => {
  try {
    const notifications = await exports.checkAndNotifyDelays();
    res.status(200).json({ message: 'Delay check performed', notifications });
  } catch (error) {
    console.error('Error in triggerDelayCheck:', error);
    res.status(500).json({ error: 'Error during delay check' });
  }
};

// Fetch notification history (for admin use)
exports.getNotificationHistory = async (req, res) => {
  try {
    const notifications = await Notification.find()
      .sort({ createdAt: -1 })
      .limit(50);
    res.status(200).json(notifications);
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: 'Error fetching history' });
  }
};

// Fetch notifications for the logged-in user
exports.getMyNotifications = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = { user: req.user.id };

    const totalNotifications = await Notification.countDocuments(query);
    const notifications = await Notification.find(query)
      .populate('entityId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(totalNotifications / limit);

    res.status(200).json({
      notifications,
      totalNotifications,
      totalPages,
      currentPage: page,
    });
  } catch (error) {
    console.error('Error fetching user notifications:', error.message);
    res.status(500).json({ error: 'Error fetching notifications.' });
  }
};

// Mark a notification as read
exports.markNotificationAsRead = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ error: 'Notification non trouvée.' });
    }
    if (notification.user.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Accès non autorisé.' });
    }
    notification.read = true;
    await notification.save();
    res.status(200).json({ message: 'Notification marquée comme lue.' });
  } catch (error) {
    console.error('Error marking notification as read:', error.message);
    res.status(500).json({ error: 'Erreur lors de la mise à jour de la notification.' });
  }
};