const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');
const Project = require('../models/Project');
const Task = require('../models/Task');

const logActivity = async (req, res, next) => {
  console.log(`logActivity middleware called for ${req.method} ${req.originalUrl}`);

  // Flag pour éviter les duplications
  if (res.locals.logCreated) {
    console.log('Log already created, skipping...');
    return next();
  }

  try {
    // Création d'un projet avec des tâches (POST /api/projects, status 201)
    if (req.method === 'POST' && req.originalUrl === '/api/projects') {
      console.log('Handling POST /api/projects');
      const originalSend = res.json;
      res.json = async function (data) {
        if (res.statusCode === 201 && !res.locals.logCreated) {
          try {
            const project = data.project || data; // Ajustement pour accéder au projet
            console.log('Project creation response:', project);
            const userId = project.projectManager?._id || project.projectManager;
            console.log('User ID for logging:', userId);
            const user = await User.findById(userId);
            if (!user) {
              console.error('User not found for logging (CREATE PROJECT):', userId);
              return originalSend.call(this, data);
            }

            // Vérifier si un log identique existe déjà dans les 5 dernières secondes
            const recentLog = await ActivityLog.findOne({
              user: userId,
              action: 'CREATE',
              targetType: 'PROJECT',
              targetId: project._id,
              createdAt: { $gte: new Date(Date.now() - 5000) },
            });

            if (!recentLog) {
              const projectLog = new ActivityLog({
                user: userId,
                action: 'CREATE',
                targetType: 'PROJECT',
                targetId: project._id,
                message: `${user.firstname} ${user.lastname} created the project "${project.name}"`,
              });
              await projectLog.save();
              console.log('Activity log created (CREATE PROJECT):', projectLog);

              if (project.tasks && Array.isArray(project.tasks) && project.tasks.length > 0) {
                for (const task of project.tasks) {
                  let message = `${user.firstname} ${user.lastname} created the task "${task.title}"`;
                  if (task.assignedTo && Array.isArray(task.assignedTo) && task.assignedTo.length > 0) {
                    const assignedUserNames = task.assignedTo.map(u => `${u.firstname} ${u.lastname}`).join(', ');
                    message += ` and assigned it to ${assignedUserNames}`;
                  }

                  const recentTaskLog = await ActivityLog.findOne({
                    user: userId,
                    action: 'CREATE',
                    targetType: 'TASK',
                    targetId: task._id,
                    createdAt: { $gte: new Date(Date.now() - 5000) },
                  });

                  if (!recentTaskLog) {
                    const taskLog = new ActivityLog({
                      user: userId,
                      action: 'CREATE',
                      targetType: 'TASK',
                      targetId: task._id,
                      message: message,
                    });
                    await taskLog.save();
                    console.log('Activity log created (CREATE TASK via PROJECT):', taskLog);
                  }
                }
              }

              res.locals.logCreated = true;
            } else {
              console.log('Duplicate log found for CREATE PROJECT, skipping...');
            }
          } catch (error) {
            console.error('Error during log creation (CREATE PROJECT):', error.message);
          }
        }
        return originalSend.call(this, data);
      };
    }

    // Mise à jour d'un projet (PUT /api/projects/:id, status 200)
    if (req.method === 'PUT' && req.originalUrl.startsWith('/api/projects/')) {
      console.log('Handling PUT /api/projects/:id');
      const originalSend = res.json;
      res.json = async function (data) {
        if (res.statusCode === 200 && !res.locals.logCreated) {
          try {
            const projectId = req.params.id;
            const previousProject = res.locals.previousProject;
            if (!previousProject) {
              console.error('Previous project state not found in res.locals (UPDATE PROJECT):', projectId);
              return originalSend.call(this, data);
            }

            const userId = req.body.updatedBy;
            console.log('User ID for logging (UPDATE PROJECT):', userId);
            const user = await User.findById(userId);
            if (!user) {
              console.error('User not found for logging (UPDATE PROJECT):', userId);
              return originalSend.call(this, data);
            }

            const updatedProject = data;
            const changes = [];
            const prevName = previousProject.name ? String(previousProject.name).trim() : '';
            const newName = updatedProject.name ? String(updatedProject.name).trim() : '';
            if (newName && newName !== prevName) {
              changes.push(`by changing its name to "${newName}"`);
            }

            const prevDescription = previousProject.description ? String(previousProject.description).trim() : '';
            const newDescription = updatedProject.description ? String(updatedProject.description).trim() : '';
            if (newDescription && newDescription !== prevDescription) {
              changes.push(`by changing its description`);
            }

            const prevStatus = previousProject.status ? String(previousProject.status).trim() : '';
            const newStatus = updatedProject.status ? String(updatedProject.status).trim() : '';
            if (newStatus && newStatus !== prevStatus) {
              changes.push(`by changing its status to "${newStatus}"`);
            }

            const prevStartDate = previousProject.startDate ? new Date(previousProject.startDate).toISOString().split('T')[0] : null;
            const newStartDate = updatedProject.startDate ? new Date(updatedProject.startDate).toISOString().split('T')[0] : null;
            if (newStartDate && (prevStartDate === null || newStartDate !== prevStartDate)) {
              changes.push(`by changing its start date to "${new Date(updatedProject.startDate).toLocaleDateString('en-US')}"`);
            }

            const prevEndDate = previousProject.endDate ? new Date(previousProject.endDate).toISOString().split('T')[0] : null;
            const newEndDate = updatedProject.endDate ? new Date(updatedProject.endDate).toISOString().split('T')[0] : null;
            if (newEndDate && (prevEndDate === null || newEndDate !== prevEndDate)) {
              changes.push(`by changing its end date to "${new Date(updatedProject.endDate).toLocaleDateString('en-US')}"`);
            }

            const prevTeamMembers = previousProject.teamMembers ? previousProject.teamMembers.map(member => member._id.toString()) : [];
            const newTeamMembers = updatedProject.teamMembers ? updatedProject.teamMembers.map(member => member._id.toString()) : [];
            if (JSON.stringify(prevTeamMembers.sort()) !== JSON.stringify(newTeamMembers.sort())) {
              const addedMembers = updatedProject.teamMembers.filter(member => !prevTeamMembers.includes(member._id.toString()));
              const removedMembers = previousProject.teamMembers.filter(member => !newTeamMembers.includes(member._id.toString()));
              let teamChanges = [];
              if (addedMembers.length > 0) {
                const addedNames = addedMembers.map(member => `${member.firstname} ${member.lastname}`).join(', ');
                teamChanges.push(`added ${addedNames}`);
              }
              if (removedMembers.length > 0) {
                const removedNames = removedMembers.map(member => `${member.firstname} ${member.lastname}`).join(', ');
                teamChanges.push(`removed ${removedNames}`);
              }
              if (teamChanges.length > 0) {
                changes.push(`by modifying the team: ${teamChanges.join(', ')}`);
              }
            }

            const prevDeliverables = previousProject.deliverables ? [...previousProject.deliverables].sort() : [];
            const newDeliverables = updatedProject.deliverables ? [...updatedProject.deliverables].sort() : [];
            if (JSON.stringify(prevDeliverables) !== JSON.stringify(newDeliverables)) {
              const addedDeliverables = newDeliverables.filter(item => !prevDeliverables.includes(item));
              const removedDeliverables = prevDeliverables.filter(item => !newDeliverables.includes(item));
              let deliverableChanges = [];
              if (addedDeliverables.length > 0) {
                deliverableChanges.push(`added deliverables "${addedDeliverables.join(', ')}"`);
              }
              if (removedDeliverables.length > 0) {
                deliverableChanges.push(`removed deliverables "${removedDeliverables.join(', ')}"`);
              }
              if (deliverableChanges.length > 0) {
                changes.push(`by modifying deliverables: ${deliverableChanges.join(', ')}`);
              }
            }

            const prevObjectives = previousProject.objectives ? [...previousProject.objectives].sort() : [];
            const newObjectives = updatedProject.objectives ? [...updatedProject.objectives].sort() : [];
            if (JSON.stringify(prevObjectives) !== JSON.stringify(newObjectives)) {
              const addedObjectives = newObjectives.filter(item => !prevObjectives.includes(item));
              const removedObjectives = prevObjectives.filter(item => !newObjectives.includes(item));
              let objectiveChanges = [];
              if (addedObjectives.length > 0) {
                objectiveChanges.push(`added objectives "${addedObjectives.join(', ')}"`);
              }
              if (removedObjectives.length > 0) {
                objectiveChanges.push(`removed objectives "${removedObjectives.join(', ')}"`);
              }
              if (objectiveChanges.length > 0) {
                changes.push(`by modifying objectives: ${objectiveChanges.join(', ')}`);
              }
            }

            let changeMessage = '';
            if (changes.length === 0) {
              changeMessage = `with some modifications`;
            } else if (changes.length === 1) {
              changeMessage = changes[0];
            } else {
              const lastChange = changes.pop();
              changeMessage = `${changes.join(', ')} and ${lastChange}`;
            }

            const recentLog = await ActivityLog.findOne({
              user: userId,
              action: 'UPDATE',
              targetType: 'PROJECT',
              targetId: updatedProject._id,
              message: `${user.firstname} ${user.lastname} updated the project "${updatedProject.name}" ${changeMessage}`,
              createdAt: { $gte: new Date(Date.now() - 5000) },
            });

            if (!recentLog) {
              const log = new ActivityLog({
                user: userId,
                action: 'UPDATE',
                targetType: 'PROJECT',
                targetId: updatedProject._id,
                message: `${user.firstname} ${user.lastname} updated the project "${updatedProject.name}" ${changeMessage}`,
              });
              await log.save();
              console.log('Activity log created (UPDATE PROJECT):', log);
              res.locals.logCreated = true;
            } else {
              console.log('Duplicate log found for UPDATE PROJECT, skipping...');
            }
          } catch (error) {
            console.error('Error during log creation (UPDATE PROJECT):', error.message);
          }
        }
        return originalSend.call(this, data);
      };
    }

    // Création d'une tâche (POST /api/tasks, status 201)
    if (req.method === 'POST' && req.originalUrl === '/api/tasks') {
      console.log('Handling POST /api/tasks');
      const originalSend = res.json;
      res.json = async function (data) {
        if (res.statusCode === 201 && !res.locals.logCreated) {
          try {
            const userId = req.body.createdBy;
            console.log('User ID for logging (CREATE TASK):', userId);
            if (!userId) {
              console.error('No createdBy provided for activity logging (CREATE TASK)');
              return originalSend.call(this, data);
            }

            const user = await User.findById(userId);
            if (!user) {
              console.error('User not found for logging (CREATE TASK):', userId);
              return originalSend.call(this, data);
            }

            const task = data;
            let message = `${user.firstname} ${user.lastname} created the task "${task.title}"`;
            if (task.assignedTo && Array.isArray(task.assignedTo) && task.assignedTo.length > 0) {
              const assignedUserNames = task.assignedTo.map(u => `${u.firstname} ${u.lastname}`).join(', ');
              message += ` and assigned it to ${assignedUserNames}`;
            }

            const recentLog = await ActivityLog.findOne({
              user: userId,
              action: 'CREATE',
              targetType: 'TASK',
              targetId: task._id,
              createdAt: { $gte: new Date(Date.now() - 5000) },
            });

            if (!recentLog) {
              const log = new ActivityLog({
                user: userId,
                action: 'CREATE',
                targetType: 'TASK',
                targetId: task._id,
                message: message,
              });
              await log.save();
              console.log('Activity log created (CREATE TASK):', log);
              res.locals.logCreated = true;
            } else {
              console.log('Duplicate log found for CREATE TASK, skipping...');
            }
          } catch (error) {
            console.error('Error during log creation (CREATE TASK):', error.message);
          }
        }
        return originalSend.call(this, data);
      };
    }

    // Mise à jour d'une tâche (PUT /api/tasks/:id, status 200)
    if (req.method === 'PUT' && req.originalUrl.startsWith('/api/tasks/')) {
      console.log('Handling PUT /api/tasks/:id');
      const originalSend = res.json;
      res.json = async function (data) {
        if (res.statusCode === 200 && !res.locals.logCreated) {
          try {
            const taskId = req.params.id;
            const previousTask = res.locals.previousTask;
            if (!previousTask) {
              console.error('Previous task state not found in res.locals (UPDATE TASK):', taskId);
              return originalSend.call(this, data);
            }

            const userId = req.body.updatedBy;
            console.log('User ID for logging (UPDATE TASK):', userId);
            if (!userId) {
              console.error('No updatedBy provided for activity logging (UPDATE TASK)');
              return originalSend.call(this, data);
            }

            const user = await User.findById(userId);
            if (!user) {
              console.error('User not found for logging (UPDATE TASK):', userId);
              return originalSend.call(this, data);
            }

            const updatedTask = data;
            const changes = [];
            const prevStatus = previousTask.status ? String(previousTask.status).trim() : '';
            const newStatus = updatedTask.status ? String(updatedTask.status).trim() : '';
            if (newStatus && newStatus !== prevStatus) {
              changes.push(`by changing its status to "${newStatus}"`);
            }

            const prevPriority = previousTask.priority ? String(previousTask.priority).trim() : '';
            const newPriority = updatedTask.priority ? String(updatedTask.priority).trim() : '';
            if (newPriority && newPriority !== prevPriority) {
              changes.push(`by changing its priority to "${newPriority}"`);
            }

            const prevTitle = previousTask.title ? String(previousTask.title).trim() : '';
            const newTitle = updatedTask.title ? String(updatedTask.title).trim() : '';
            if (newTitle && newTitle !== prevTitle) {
              changes.push(`by changing its title to "${newTitle}"`);
            }

            const prevDescription = previousTask.description ? String(previousTask.description).trim() : '';
            const newDescription = updatedTask.description ? String(updatedTask.description).trim() : '';
            if (newDescription && newDescription !== prevDescription) {
              changes.push(`by changing its description`);
            }

            const prevStartDate = previousTask.startDate ? new Date(previousTask.startDate).toISOString().split('T')[0] : null;
            const newStartDate = updatedTask.startDate ? new Date(updatedTask.startDate).toISOString().split('T')[0] : null;
            if (newStartDate && (prevStartDate === null || newStartDate !== prevStartDate)) {
              changes.push(`by changing its start date to "${new Date(updatedTask.startDate).toLocaleDateString('en-US')}"`);
            }

            const prevDueDate = previousTask.dueDate ? new Date(previousTask.dueDate).toISOString().split('T')[0] : null;
            const newDueDate = updatedTask.dueDate ? new Date(updatedTask.dueDate).toISOString().split('T')[0] : null;
            if (newDueDate && (prevDueDate === null || newDueDate !== prevDueDate)) {
              changes.push(`by changing its due date to "${new Date(updatedTask.dueDate).toLocaleDateString('en-US')}"`);
            }

            const prevAssignedTo = previousTask.assignedTo ? previousTask.assignedTo.map(id => id.toString()) : [];
            const newAssignedTo = updatedTask.assignedTo ? updatedTask.assignedTo.map(user => user._id.toString()) : [];
            if (JSON.stringify(prevAssignedTo.sort()) !== JSON.stringify(newAssignedTo.sort())) {
              changes.push(`by changing the assignees`);
            }

            const prevImportance = Number(previousTask.importance);
            const newImportance = updatedTask.importance ? Number(updatedTask.importance) : null;
            if (newImportance !== null && newImportance !== prevImportance) {
              changes.push(`by changing its importance to "${newImportance}"`);
            }

            const prevUrgency = Number(previousTask.urgency);
            const newUrgency = updatedTask.urgency ? Number(updatedTask.urgency) : null;
            if (newUrgency !== null && newUrgency !== prevUrgency) {
              changes.push(`by changing its urgency to "${newUrgency}"`);
            }

            const prevEffort = Number(previousTask.effort);
            const newEffort = updatedTask.effort ? Number(updatedTask.effort) : null;
            if (newEffort !== null && newEffort !== prevEffort) {
              changes.push(`by changing its effort to "${newEffort}"`);
            }

            let changeMessage = '';
            if (changes.length === 0) {
              changeMessage = `with some modifications`;
            } else if (changes.length === 1) {
              changeMessage = changes[0];
            } else if (changes.length > 1) {
              const lastChange = changes.pop();
              changeMessage = `${changes.join(', ')} and ${lastChange}`;
            }

            const recentLog = await ActivityLog.findOne({
              user: userId,
              action: 'UPDATE',
              targetType: 'TASK',
              targetId: updatedTask._id,
              message: `${user.firstname} ${user.lastname} updated the task "${updatedTask.title}" ${changeMessage}`,
              createdAt: { $gte: new Date(Date.now() - 5000) },
            });

            if (!recentLog) {
              const log = new ActivityLog({
                user: userId,
                action: 'UPDATE',
                targetType: 'TASK',
                targetId: updatedTask._id,
                message: `${user.firstname} ${user.lastname} updated the task "${updatedTask.title}" ${changeMessage}`,
              });
              await log.save();
              console.log('Activity log created (UPDATE TASK):', log);
              res.locals.logCreated = true;
            } else {
              console.log('Duplicate log found for UPDATE TASK, skipping...');
            }
          } catch (error) {
            console.error('Error during log creation (UPDATE TASK):', error.message);
          }
        }
        return originalSend.call(this, data);
      };
    }

    // Suppression d'un projet ou d'une tâche (DELETE /api/projects/:id ou /api/tasks/:id)
    if (req.method === 'DELETE' && (req.originalUrl.startsWith('/api/projects/') || req.originalUrl.startsWith('/api/tasks/'))) {
      console.log('Handling DELETE for /api/projects or /api/tasks');
      try {
        const id = req.params.id;
        let targetType, target, userId, messagePrefix;

        if (req.originalUrl.startsWith('/api/projects/')) {
          targetType = 'PROJECT';
          target = await Project.findById(id).populate('tasks');
          if (!target) {
            console.error('Project not found for logging (DELETE PROJECT):', id);
            return next();
          }
          userId = req.body.deletedBy || target.projectManager;
          console.log('User ID for logging (DELETE PROJECT):', userId);
          messagePrefix = 'the project';

          if (target.tasks && target.tasks.length > 0) {
            const user = await User.findById(userId);
            if (user) {
              for (const task of target.tasks) {
                const recentTaskLog = await ActivityLog.findOne({
                  user: userId,
                  action: 'DELETE',
                  targetType: 'TASK',
                  targetId: task._id,
                  createdAt: { $gte: new Date(Date.now() - 5000) },
                });

                if (!recentTaskLog) {
                  const taskLog = new ActivityLog({
                    user: userId,
                    action: 'DELETE',
                    targetType: 'TASK',
                    targetId: task._id,
                    message: `${user.firstname} ${user.lastname} deleted the task "${task.title}"`,
                  });
                  await taskLog.save();
                  console.log('Activity log created (DELETE TASK via DELETE PROJECT):', taskLog);
                }
              }
            }
          }
        } else if (req.originalUrl.startsWith('/api/tasks/')) {
          targetType = 'TASK';
          target = await Task.findById(id);
          if (!target) {
            console.error('Task not found for logging (DELETE TASK):', id);
            return next();
          }
          userId = req.body.deletedBy;
          console.log('User ID for logging (DELETE TASK):', userId);
          if (!userId) {
            console.error('No deletedBy provided for activity logging (DELETE TASK)');
            return next();
          }
          messagePrefix = 'the task';
        }

        const user = await User.findById(userId);
        if (!user) {
          console.error('User not found for logging (DELETE):', userId);
          return next();
        }

        const recentLog = await ActivityLog.findOne({
          user: userId,
          action: 'DELETE',
          targetType,
          targetId: id,
          createdAt: { $gte: new Date(Date.now() - 5000) },
        });

        if (!recentLog) {
          const log = new ActivityLog({
            user: userId,
            action: 'DELETE',
            targetType,
            targetId: id,
            message: `${user.firstname} ${user.lastname} deleted ${messagePrefix} "${target.title || target.name}"`,
          });
          await log.save();
          console.log(`Activity log created (DELETE ${targetType}):`, log);
        } else {
          console.log(`Duplicate log found for DELETE ${targetType}, skipping...`);
        }
      } catch (error) {
        console.error('Error during log creation before deletion:', error.message);
      }
    }
  } catch (error) {
    console.error('Error in logActivity middleware:', error.message);
  }

  next();
};

module.exports = logActivity;