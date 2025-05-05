const { ObjectId } = require('mongoose').Types;
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const Task = require('../models/Task');
const Project = require('../models/Project');
const nodemailer = require('nodemailer');
const Role = require('../models/Role'); 

// Email transporter setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'ranimsboui2003@gmail.com',
    pass: 'lgiw nivr njmi xygc',
  },
  pool: true, // Enable connection pooling for faster email sending
});

exports.getActivityLogs = async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(400).json({ message: 'userId est requis dans les paramètres de requête.' });
    }

    // Paramètres de pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    console.log('Querying user with _id:', userId);
    const user = await User.findById(userId).populate('role', 'name');
    if (!user) {
      console.error('Utilisateur non trouvé:', userId);
      return res.status(404).json({ message: 'Utilisateur non trouvé.' });
    }

    let logs = [];
    let totalLogs = 0;

    if (user.role.name === 'Admin') {
      // Compter le nombre total de logs pour un Admin
      totalLogs = await ActivityLog.countDocuments();

      // Récupérer les logs avec pagination
      logs = await ActivityLog.find()
        .populate('user', 'firstname lastname email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
    } else if (user.role.name === 'Team Member') {
      return res.status(403).json({ message: 'Team Members are not allowed to view activity logs.' });
    } else if (user.role.name === 'Project Manager') {
      // Récupérer les projets gérés par le Project Manager
      const associatedProjects = await Project.find({ projectManager: user._id });
      const projectIds = associatedProjects.map(project => project._id);
      console.log('Associated projects for Project Manager:', projectIds);

      // Logs des projets gérés
      const projectLogs = await ActivityLog.find({
        targetType: 'PROJECT',
        targetId: { $in: projectIds },
      });

      // Logs des tâches associées à ces projets
      const projectTasks = await Task.find({ project: { $in: projectIds } });
      const projectTaskIds = projectTasks.map(task => task._id);
      console.log('Project task IDs:', projectTaskIds);
      const projectTaskLogs = await ActivityLog.find({
        targetType: 'TASK',
        targetId: { $in: projectTaskIds },
      });

      // Ajouter les logs où le Project Manager est l'auteur de l'action
      const userLogs = await ActivityLog.find({ user: user._id });

      // Combiner tous les logs
      const allLogs = [...projectLogs, ...projectTaskLogs, ...userLogs];
      const uniqueLogIds = [...new Set(allLogs.map(log => log._id.toString()))];

      // Compter le nombre total de logs pour le Project Manager
      totalLogs = uniqueLogIds.length;

      // Récupérer les logs avec pagination
      logs = await ActivityLog.find({ _id: { $in: uniqueLogIds } })
        .populate('user', 'firstname lastname email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
    } else {
      const userLogs = await ActivityLog.find({ user: user._id });

      const associatedProjects = await Project.find({
        $or: [
          { projectManager: user._id },
          { teamMembers: user._id },
        ],
      });
      const projectIds = associatedProjects.map(project => project._id);
      const projectLogs = await ActivityLog.find({
        targetType: 'PROJECT',
        targetId: { $in: projectIds },
      });

      const projectTasks = await Task.find({ project: { $in: projectIds } });
      const projectTaskIds = projectTasks.map(task => task._id);
      const projectTaskLogs = await ActivityLog.find({
        targetType: 'TASK',
        targetId: { $in: projectTaskIds },
      });

      const allLogs = [...userLogs, ...projectLogs, ...projectTaskLogs];
      const uniqueLogIds = [...new Set(allLogs.map(log => log._id.toString()))];

      // Compter le nombre total de logs
      totalLogs = uniqueLogIds.length;

      // Récupérer les logs avec pagination
      logs = await ActivityLog.find({ _id: { $in: uniqueLogIds } })
        .populate('user', 'firstname lastname email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
    }

    console.log('Logs fetched:', logs);
    res.json({
      logs,
      totalLogs,
      currentPage: page,
      totalPages: Math.ceil(totalLogs / limit),
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des logs:', error.message);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Function to get email recipients for Team Member anomaly notifications
exports.getTeamMemberAnomalyRecipients = async (projectId) => {
  try {
    const recipients = [];

    // Fetch the Project Manager and Team Members for the specific project
    const project = await Project.findById(projectId)
      .populate('projectManager teamMembers')
      .lean();
    if (!project) return recipients;

    // Add Project Manager
    if (project.projectManager) {
      const pmRole = project.projectManager.role.name;
      if (pmRole === 'Project Manager') {
        recipients.push({
          email: project.projectManager.email,
          role: 'Project Manager',
          user: project.projectManager,
        });
      }
    }

    // Add Team Leaders from the project's team members
    if (project.teamMembers) {
      const teamLeaders = project.teamMembers.filter((member) => member.role.name === 'Team Leader');
      teamLeaders.forEach((member) => {
        recipients.push({
          email: member.email,
          role: 'Team Leader',
          user: member,
        });
      });
    }

    return recipients;
  } catch (error) {
    console.error('Error fetching anomaly recipients:', error.message);
    return [];
  }
};

// Function to notify all Admins of any anomaly
exports.notifyAdminsOfAnomaly = async (anomaly) => {
  try {
    const { user, actionCount, updateCount, logs, project, task } = anomaly;
    const role = user.role.name;

    // Étape 1 : Récupérer dynamiquement le rôle "Admin"
    const adminRole = await Role.findOne({ name: 'Admin' }).lean();
    if (!adminRole) {
      console.warn('Rôle "Admin" non trouvé dans la base de données.');
      return;
    }

    // Étape 2 : Trouver tous les utilisateurs ayant le rôle "Admin"
    const admins = await User.find({ role: adminRole._id })
      .populate('role', 'name')
      .lean();

    console.log(`Notifying ${admins.length} Admins of anomaly for user ${user._id} (${role})...`);
    if (admins.length === 0) {
      console.warn('Aucun Admin trouvé pour être notifié de l\'anomalie.');
      return;
    }

    // Étape 3 : Préparer le contenu de l'email en fonction du type d'anomalie
    const anomalyType = updateCount ? 'Excessive Task Updates' : 'Excessive Activity';
    const count = updateCount || actionCount;
    const projectDetails = project ? `**Project**: ${project.name} (ID: ${project._id})\n` : '';
    const taskDetails = task
      ? `**Task**: ${task.title} (ID: ${task._id})\n`
      : updateCount
      ? '**Task**: Multiple Tasks\n'
      : '';

    // Étape 4 : Envoyer un email à tous les Admins en parallèle
    const adminEmails = admins.map((admin) => {
      const message = `
🚨 Anomaly Alert - ${anomalyType} by ${role}

Dear ${admin.firstname} ${admin.lastname} (Admin),

A ${role} has performed an abnormal number of actions in the last hour:

**User**: ${user.firstname} ${user.lastname} (${role}, ID: ${user._id})
${projectDetails}${taskDetails}**Number of Actions**: ${count} in the last hour

**Recent Logs**:
${logs.map((log) => `- ${log.message} at ${new Date(log.createdAt).toLocaleString()}`).join('\n')}

**Recommended Action**:
Please review the activity to ensure it is authorized. Contact the ${role} if necessary.

Best regards,
Project Management System
      `;

      return transporter.sendMail({
        from: 'ranimsboui2003@gmail.com',
        to: admin.email,
        subject: `🚨 Anomaly Alert - ${anomalyType} by ${role}`,
        text: message,
      }).then(() => {
        console.log(`Anomaly alert successfully sent to Admin ${admin.email}`);
      }).catch((error) => {
        console.error(`Error sending anomaly alert to Admin ${admin.email}:`, error.message);
        throw error; // Re-throw to catch in Promise.all
      });
    });

    await Promise.all(adminEmails);
  } catch (error) {
    console.error('Error notifying Admins of anomaly:', error.message);
  }
};

// Function to send anomaly alert to an Admin (for their own anomaly)
exports.sendAdminAnomalyAlert = async (anomaly) => {
  try {
    const { user, actionCount, logs } = anomaly;

    // Send email to the Admin themselves
    const message = `
🚨 Anomaly Alert - Excessive Activity Detected

Dear ${user.firstname} ${user.lastname} (Admin),

You have performed an abnormal number of actions in the last hour:

**User**: ${user.firstname} ${user.lastname} (Admin, ID: ${user._id})
**Number of Actions**: ${actionCount} actions in the last hour

**Recent Logs**:
${logs.map((log) => `- ${log.message} at ${new Date(log.createdAt).toLocaleString()}`).join('\n')}

**Recommended Action**:
Please review your activity to ensure it is necessary and authorized.

Best regards,
Project Management System
    `;

    await transporter.sendMail({
      from: 'ranimsboui2003@gmail.com',
      to: user.email,
      subject: '🚨 Anomaly Alert - Excessive Activity Detected',
      text: message,
    }).then(() => {
      console.log(`Anomaly alert successfully sent to Admin ${user.email}`);
    }).catch((error) => {
      console.error(`Error sending anomaly alert to Admin ${user.email}:`, error.message);
      throw error;
    });

    // Notify all Admins (including the Admin themselves, Gmail will handle deduplication)
    await exports.notifyAdminsOfAnomaly(anomaly);
  } catch (error) {
    console.error('Error sending Admin anomaly alert:', error.message);
  }
};

// Function to send anomaly alert to Project Managers/Team Leaders
exports.sendManagerLeaderAnomalyAlert = async (anomaly) => {
  try {
    const { user, actionCount, logs } = anomaly;
    const role = user.role.name;

    // Send to the user themselves
    const userMessage = `
🚨 Anomaly Alert - Excessive Activity Detected

Dear ${user.firstname} ${user.lastname} (${role}),

You have performed an abnormal number of actions in the last hour, which is unusual:

**User**: ${user.firstname} ${user.lastname} (${role}, ID: ${user._id})
**Number of Actions**: ${actionCount} actions in the last hour

**Recent Logs**:
${logs.map((log) => `- ${log.message} at ${new Date(log.createdAt).toLocaleString()}`).join('\n')}

**Recommended Action**:
Please be careful with your activity and ensure your actions are necessary and authorized.

Best regards,
Project Management System
    `;

    await transporter.sendMail({
      from: 'ranimsboui2003@gmail.com',
      to: user.email,
      subject: '🚨 Anomaly Alert - Excessive Activity Detected',
      text: userMessage,
    }).then(() => {
      console.log(`Anomaly alert successfully sent to ${role} ${user.email}`);
    }).catch((error) => {
      console.error(`Error sending anomaly alert to ${role} ${user.email}:`, error.message);
      throw error;
    });

    // Notify all Admins
    await exports.notifyAdminsOfAnomaly(anomaly);
  } catch (error) {
    console.error('Error sending Manager/Leader anomaly alert:', error.message);
  }
};

// Function to send anomaly alert for Team Member task updates
exports.sendTaskModificationAnomalyAlert = async (anomaly) => {
  try {
    const { user, task, project, updateCount, logs } = anomaly;
    if (!project) {
      console.error('No project associated with anomaly, skipping email notifications.');
      return;
    }

    // Send warning to the Team Member
    const userMessage = `
🚨 Warning: Excessive Task Updates Detected

Dear ${user.firstname} ${user.lastname},

You have made a lot of updates (${updateCount}) to task(s) in project "${project.name}" within the last hour:

**Project**: ${project.name} (ID: ${project._id})
**Number of Updates**: ${updateCount} updates in the last hour

**Recent Updates**:
${logs.map((log) => `- ${log.message} at ${new Date(log.createdAt).toLocaleString()}`).join('\n')}

**Recommended Action**:
Please ensure your updates are necessary and authorized. Contact your Project Manager or Team Leader if needed.

Best regards,
Project Management System
    `;

    await transporter.sendMail({
      from: 'ranimsboui2003@gmail.com',
      to: user.email,
      subject: '🚨 Warning: Excessive Task Updates Detected',
      text: userMessage,
    }).then(() => {
      console.log(`Warning email successfully sent to Team Member ${user.email} for excessive task updates.`);
    }).catch((error) => {
      console.error(`Error sending warning email to Team Member ${user.email}:`, error.message);
      throw error;
    });

    // Send alert to Project Manager and Team Leader
    const recipients = await exports.getTeamMemberAnomalyRecipients(project._id);

    const recipientEmails = recipients.map((recipient) => {
      const message = `
🚨 Anomaly Alert - Excessive Task Updates by Team Member

Dear ${recipient.user.firstname} ${recipient.user.lastname} (${recipient.role}),

A Team Member has made a lot of updates to task(s) in project "${project.name}":

**User**: ${user.firstname} ${user.lastname} (Team Member, ID: ${user._id})
**Task**: ${task ? task.title : 'Multiple Tasks'} (ID: ${task ? task._id : 'N/A'})
**Project**: ${project.name} (ID: ${project._id})
**Number of Updates**: ${updateCount} updates in the last hour

**Recent Logs**:
${logs.map((log) => `- ${log.message} at ${new Date(log.createdAt).toLocaleString()}`).join('\n')}

**Recommended Action**:
Please review the activity to ensure it is authorized. Contact the Team Member if necessary.

Best regards,
Project Management System
      `;

      return transporter.sendMail({
        from: 'ranimsboui2003@gmail.com',
        to: recipient.email,
        subject: '🚨 Anomaly Alert - Excessive Task Updates by Team Member',
        text: message,
      }).then(() => {
        console.log(`Anomaly alert successfully sent to ${recipient.email} (${recipient.role})`);
      }).catch((error) => {
        console.error(`Error sending anomaly alert to ${recipient.email} (${recipient.role}):`, error.message);
        throw error;
      });
    });

    await Promise.all(recipientEmails);

    // Notify all Admins
    await exports.notifyAdminsOfAnomaly(anomaly);
  } catch (error) {
    console.error('Error sending task modification anomaly alert:', error.message);
  }
};