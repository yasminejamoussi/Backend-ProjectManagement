const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');
const Task = require('../models/Task');
const Project = require('../models/Project');
const activityLogController = require('../controllers/activityLogController');

const runAnomalyDetection = async () => {
  try {
    console.log('Starting anomaly detection...');

    // Step 1: Define the time window (1 hour)
    const TIME_WINDOW_MS = 60 * 60 * 1000; // 1 hour in milliseconds
    const timeWindowStart = new Date(Date.now() - TIME_WINDOW_MS);

    // Step 2: Fetch all users with their roles in one query
    const users = await User.find().populate('role', 'name').lean();

    // Step 3: Fetch all recent logs for all users in one query (optimization)
    const recentLogs = await ActivityLog.find({
      createdAt: { $gte: timeWindowStart },
    })
      .populate('user', 'firstname lastname email role')
      .lean();

    // Group logs by user for easier processing
    const logsByUser = recentLogs.reduce((acc, log) => {
      const userId = log.user._id.toString();
      if (!acc[userId]) acc[userId] = [];
      acc[userId].push(log);
      return acc;
    }, {});

    // Step 4: Check for anomalies for each user
    for (const user of users) {
      const userId = user._id.toString();
      const role = user.role.name;
      const userLogs = logsByUser[userId] || [];

      if (userLogs.length === 0) continue;

      // Step 4.1: Define thresholds
      const ACTION_THRESHOLD = 5; // Threshold for total actions (CREATE, UPDATE, DELETE)
      const UPDATE_THRESHOLD = 5; // Threshold for task updates (Team Members)

      // Step 4.2: Handle anomalies based on role
      if (role === 'Admin') {
        // Check total actions (CREATE, UPDATE, DELETE)
        const actionCount = userLogs.length;

        if (actionCount > ACTION_THRESHOLD) {
          console.log(
            `Anomaly detected for Admin ${userId}: ` +
            `${actionCount} actions in the last hour`
          );

          // Prepare anomaly data
          const anomalyData = {
            user,
            task: null, // Not specific to a task
            project: null, // Not specific to a project
            actionCount,
            logs: userLogs, // Include all logs, no limit
          };

          // Send email to the Admin and notify other Admins
          await activityLogController.sendAdminAnomalyAlert(anomalyData);
        }
      } else if (role === 'Project Manager' || role === 'Team Leader') {
        // Check total actions (CREATE, UPDATE, DELETE)
        const actionCount = userLogs.length;

        if (actionCount > ACTION_THRESHOLD) {
          console.log(
            `Anomaly detected for ${role} ${userId}: ` +
            `${actionCount} actions in the last hour`
          );

          // Prepare anomaly data
          const anomalyData = {
            user,
            task: null,
            project: null,
            actionCount,
            logs: userLogs, // Include all logs, no limit
          };

          // Send email to the user themselves and notify Admins
          await activityLogController.sendManagerLeaderAnomalyAlert(anomalyData);
        }
      } else if (role === 'Team Member') {
        // Check specifically for task updates
        const taskUpdateLogs = userLogs.filter(
          (log) => log.action === 'UPDATE' && log.targetType === 'TASK'
        );

        if (taskUpdateLogs.length > UPDATE_THRESHOLD) {
          console.log(
            `Anomaly detected for Team Member ${userId}: ` +
            `${taskUpdateLogs.length} task updates in the last hour`
          );

          // Fetch the projects associated with the tasks
          const taskIds = [...new Set(taskUpdateLogs.map((log) => log.targetId.toString()))];
          const tasks = await Task.find({ _id: { $in: taskIds } })
            .populate('project')
            .lean();
          const projectIds = [
            ...new Set(
              tasks
                .filter((task) => task.project)
                .map((task) => task.project._id.toString())
            ),
          ];

          // Send alerts for each project
          for (const projectId of projectIds) {
            const projectTasks = tasks.filter(
              (task) => task.project && task.project._id.toString() === projectId
            );
            const projectLogs = taskUpdateLogs.filter((log) =>
              projectTasks.some((task) => task._id.toString() === log.targetId.toString())
            );

            const anomalyData = {
              user,
              task: projectTasks[0] || null, // Representative task
              project: await Project.findById(projectId).lean(),
              updateCount: projectLogs.length,
              logs: projectLogs, // Include all logs, no limit
            };

            // Send email to Team Member, Project Manager, Team Leader, and Admins
            await activityLogController.sendTaskModificationAnomalyAlert(anomalyData);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error during anomaly detection:', error.message);
  }
};

// Schedule anomaly detection to run every 15 minutes
const scheduleAnomalyDetection = () => {
  runAnomalyDetection(); // Run immediately on start
  setInterval(runAnomalyDetection, 15 * 60 * 1000); // Run every 15 minutes
};

module.exports = { runAnomalyDetection, scheduleAnomalyDetection };