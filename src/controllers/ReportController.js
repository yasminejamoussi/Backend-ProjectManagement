const Project = require('../models/Project');
const Task = require('../models/Task');
const User = require('../models/User');

exports.generateOverviewReport = async (req, res) => {
  try {
    console.log('Starting generateOverviewReport, user ID:', req.user.id);

    // Verify user
    const user = await User.findById(req.user.id).populate('role', 'name');
    if (!user) {
      console.log('User not found for ID:', req.user.id);
      return res.status(404).json({ error: 'User not found' });
    }
    if (!user.role || !user.role.name) {
      console.log('Role not defined for user:', user._id);
      return res.status(400).json({ error: 'Role not defined or invalid' });
    }
    console.log('User loaded:', user.firstname, user.lastname, 'Role:', user.role.name);

    // Filter projects
    let projectFilter = {};
    if (user.role.name === 'Project Manager') {
      projectFilter.projectManager = user._id;
    }
    console.log('Project filter:', projectFilter);

    // Fetch projects
    const projects = await Project.find(projectFilter).populate({
      path: 'tasks',
      match: { _id: { $exists: true } }
    });
    console.log('Projects loaded:', projects.length);

    // Project statistics
    const projectsByStatus = { Pending: 0, 'In Progress': 0, Completed: 0 };
    projects.forEach(p => {
      const status = p.status || 'Pending';
      if (projectsByStatus.hasOwnProperty(status)) {
        projectsByStatus[status]++;
      }
    });
    console.log('Project statistics:', projectsByStatus);

    // Task statistics
    let totalTasks = 0;
    let completedTasks = 0;
    projects.forEach(p => {
      if (Array.isArray(p.tasks)) {
        totalTasks += p.tasks.length;
        completedTasks += p.tasks.filter(t => t.status && ['Done', 'Tested'].includes(t.status)).length;
      }
    });
    const completionRate = totalTasks ? (completedTasks / totalTasks * 100) : 0;
    console.log('Total tasks:', totalTasks, 'Completed:', completedTasks, 'Rate:', completionRate);

    // Delayed tasks
    const projectIds = projects.map(p => p._id);
    const delayedTasks = await Task.countDocuments({
      project: { $in: projectIds },
      dueDate: { $lt: new Date(), $exists: true },
      status: { $nin: ['Done', 'Tested'] }
    });
    console.log('Delayed tasks:', delayedTasks);

    // Average project duration
    let totalDuration = 0;
    let validProjects = 0;
    projects.forEach(p => {
      if (p.startDate && p.endDate) {
        const duration = (new Date(p.endDate) - new Date(p.startDate)) / (1000 * 60 * 60 * 24);
        if (!isNaN(duration)) {
          totalDuration += duration;
          validProjects++;
        }
      }
    });
    const avgProjectDuration = validProjects ? totalDuration / validProjects : 0;
    console.log('Average duration:', avgProjectDuration, 'Valid projects:', validProjects);

    // Average workload
    const activeMembers = await User.find({
      assignedTasks: { $exists: true, $ne: [] }
    });
    let totalAssignedTasks = 0;
    activeMembers.forEach(m => {
      if (Array.isArray(m.assignedTasks)) {
        totalAssignedTasks += m.assignedTasks.length;
      }
    });
    const avgWorkload = activeMembers.length ? totalAssignedTasks / activeMembers.length : 0;
    console.log('Active members:', activeMembers.length, 'Average workload:', avgWorkload);

    // Total projects and tasks
    const totalProjects = projects.length;

    // Average remaining time for tasks
    const tasks = await Task.find({
      project: { $in: projectIds },
      dueDate: { $exists: true, $gt: new Date() },
      status: { $nin: ['Done', 'Tested'] }
    });
    let totalRemainingTime = 0;
    let tasksWithDueDate = 0;
    tasks.forEach(t => {
      const remainingTime = (new Date(t.dueDate) - new Date()) / (1000 * 60 * 60 * 24);
      if (!isNaN(remainingTime)) {
        totalRemainingTime += remainingTime;
        tasksWithDueDate++;
      }
    });
    const avgRemainingTime = tasksWithDueDate ? totalRemainingTime / tasksWithDueDate : 0;
    console.log('Average remaining time:', avgRemainingTime, 'Tasks with due date:', tasksWithDueDate);

    // Top 3 longest projects
    const longestProjects = projects
      .filter(p => p.startDate && p.endDate)
      .map(p => ({
        name: p.name,
        duration: (new Date(p.endDate) - new Date(p.startDate)) / (1000 * 60 * 60 * 24)
      }))
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 3);
    console.log('Longest projects:', longestProjects);

    // New: Project details
    const projectDetails = projects.map(p => ({
      name: p.name,
      status: p.status || 'Pending',
      duration: p.startDate && p.endDate ? ((new Date(p.endDate) - new Date(p.startDate)) / (1000 * 60 * 60 * 24)).toFixed(1) : 'N/A',
      totalTasks: Array.isArray(p.tasks) ? p.tasks.length : 0,
      completedTasks: Array.isArray(p.tasks) ? p.tasks.filter(t => t.status && ['Done', 'Tested'].includes(t.status)).length : 0
    }));
    console.log('Project details:', projectDetails);

    // Generate report
    const report = {
      title: `Project Overview - ${new Date().toLocaleDateString('en-GB')}`,
      generatedBy: `${user.firstname || 'Unknown'} ${user.lastname || ''}`,
      data: {
        projectsByStatus,
        completionRate: completionRate.toFixed(2),
        delayedTasks,
        avgProjectDuration: avgProjectDuration.toFixed(1),
        avgWorkload: avgWorkload.toFixed(1),
        totalProjects,
        totalTasks,
        activeMembers: activeMembers.length,
        avgRemainingTime: avgRemainingTime.toFixed(1),
        longestProjects,
        projectDetails
      }
    };

    console.log('Report generated:', JSON.stringify(report, null, 2));
    res.json(report);
  } catch (error) {
    console.error('Error in generateOverviewReport:', error.message, error.stack);
    res.status(500).json({ error: 'Server error' });
  }
};