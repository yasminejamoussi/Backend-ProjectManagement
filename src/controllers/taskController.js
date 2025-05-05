const Task = require('../models/Task');
const User = require('../models/User');
const Project = require('../models/Project');
const Role = require('../models/Role');
const { spawn } = require("child_process");
const { predictTaskDelay } = require('../utils/taskDelayPredictor');
const path = require("path");
const mongoose = require('mongoose');
const calculateProjectStatus = require('../utils/projectStatus');

exports.prioritizeTask = async (req, res) => {
  const { title, description } = req.body;

  if (!title) {
    return res.status(400).json({ error: "Title is required" });
  }

  const scriptPath = path.join(__dirname, "..", "scripts", "prioritize.py");
  console.log("Chemin vers le script Python:", scriptPath);  // Log pour confirmer

  const pythonProcess = spawn('/venv/bin/python', [scriptPath, JSON.stringify({ title, description })]);
  let output = '';
  let errorOutput = '';

  pythonProcess.stdout.on('data', (data) => {
    console.log("Sortie du processus Python:", data.toString());
    output += data.toString();
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error("Erreur dans le processus Python:", data.toString());
    errorOutput += data.toString();
  });

  pythonProcess.on('close', (code) => {
    if (code === 0) {
      try {
        const result = JSON.parse(output);
        console.log("Réponse de l'IA :", result);
        res.json(result);
      } catch (e) {
        console.error("Erreur lors du parsing de la réponse Python :", e);
        res.status(500).json({ error: "Failed to parse AI response" });
      }
    } else {
      console.error("Erreur lors de l'exécution du script Python :", errorOutput);
      res.status(500).json({ error: "Failed to get AI suggestion: " + errorOutput });
    }
  });
};


// Read All Tasks
exports.getAllTasks = async (req, res) => {
  try {
    const { projectId, assignedTo } = req.query;
    let filter = {};
    if (projectId) {
      // Handle single projectId or array of projectIds
      filter.project = Array.isArray(projectId) ? { $in: projectId } : projectId;
    }
    if (assignedTo) {
      filter.assignedTo = assignedTo;
    }

    console.log("Filtre MongoDB appliqué pour tâches :", filter);

    const tasks = await Task.find(filter)
      .populate("project", "name")
      .populate("assignedTo", "firstname lastname email")
      .populate("createdBy", "firstname lastname email");

    console.log("Tâches retournées :", tasks.map(task => ({
      id: task._id,
      title: task.title,
      project: task.project?.name,
      assignedTo: task.assignedTo.map(user => `${user.firstname} ${user.lastname}`)
    })));

    res.json(tasks);
  } catch (error) {
    console.error("Erreur lors de la récupération des tâches :", error);
    res.status(500).json({ error: error.message });
  }
};

// Read One Task
exports.getTaskById = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate("project", "name")
      .populate("assignedTo", "firstname lastname email")
      .populate("createdBy", "firstname lastname email");

    if (!task) {
      return res.status(404).json({ message: "Tâche non trouvée" });
    }

    res.json(task);
  } catch (error) {
    console.error("Erreur lors de la récupération de la tâche :", error);
    res.status(500).json({ error: error.message });
  }
};

exports.predictTaskDuration = async (req, res) => {
  const { title, description, status, priority, assignedTo, project, startDate } = req.body;

  if (!title || !description || !status || !priority || !assignedTo || !project || !startDate) {
    return res.status(400).json({ error: "Toutes les informations de la tâche sont nécessaires." });
  }

  try {
    const pythonScriptPath = path.join(__dirname, '..', 'scripts', 'task_duration_predictor.py');
    const pythonProcess = spawn('python', [pythonScriptPath, title, description, status, priority, assignedTo.join(','), project, startDate]);

    let stdoutData = '';
    let stderrData = '';

    pythonProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    pythonProcess.on('close', (code) => {
      console.log("Script Python terminé avec code:", code);
      
      if (code !== 0) {
        console.error("Erreur Python:", stderrData);
        return res.status(500).json({ error: `Erreur dans l'exécution du script Python: ${stderrData || 'Code de sortie non nul'}` });
      }

      const predictedDuration = parseInt(stdoutData.trim());
      console.log("Sortie Python:", predictedDuration);

      if (isNaN(predictedDuration)) {
        return res.status(500).json({ error: "Durée prédite non valide." });
      }

      const startDateObj = new Date(startDate);
      const dueDate = new Date(startDateObj);
      dueDate.setDate(startDateObj.getDate() + predictedDuration);

      return res.json({
        predictedDuration,
        estimatedDueDate: dueDate.toISOString()
      });
    });
  } catch (error) {
    console.error("Erreur serveur:", error);
    return res.status(500).json({ error: "Erreur interne du serveur." });
  }
};

exports.predictTaskDelay = async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`Requête predictTaskDelay pour id: ${id}`);
    const task = await Task.findById(id)
      .populate('project')
      .populate('assignedTo', 'username'); // Ajouté pour peupler assignedTo
    if (!task) {
      console.log(`Tâche ${id} non trouvée`);
      return res.status(404).json({ message: "Tâche non trouvée" });
    }

    const prediction = predictTaskDelay(task);
    res.json(prediction);
  } catch (error) {
    console.error(`Erreur predictTaskDelay pour id ${req.params.id} :`, error);
    res.status(500).json({ error: error.message });
  }
};

exports.getUserTaskCounts = async (req, res) => {
  try {
    // Récupérer les rôles Team Leader et Team Member
    const teamRoles = await Role.find({ name: { $in: ['Team Leader', 'Team Member'] } });
    if (!teamRoles || teamRoles.length === 0) {
      console.log('Aucun rôle Team Leader ou Team Member trouvé');
      return res.status(404).json({ message: 'No Team Leader or Team Member roles found' });
    }
    const teamRoleIds = teamRoles.map(role => role._id);
    console.log('teamRoleIds:', teamRoleIds);

    // Récupérer les utilisateurs avec ces rôles
    const users = await User.find({ role: { $in: teamRoleIds } })
      .populate('role', 'name')
      .select('username firstname lastname email role');
    console.log('Utilisateurs trouvés:', users.length);

    if (!users || users.length === 0) {
      console.log('Aucun utilisateur avec rôle Team Leader ou Team Member trouvé');
      return res.status(404).json({ message: 'No users with role Team Leader or Team Member found' });
    }

    // Compter les tâches non terminées et analyser les retards pour chaque utilisateur
    const userTaskAnalysis = await Promise.all(
      users.map(async (user) => {
        try {
          // Récupérer les tâches non terminées de l'utilisateur
          const tasks = await Task.find({
            assignedTo: user._id,
            status: { $ne: 'Done' },
          })
            .populate('project', 'name')
            .populate('assignedTo', 'username');
          console.log(`Tâches pour utilisateur ${user.username}:`, tasks.length);

          // Compter le nombre total de tâches non terminées
          const taskCount = tasks.length;

          // Prédire les retards pour chaque tâche et calculer des métriques
          let totalDelayDays = 0;
          let highPriorityTasks = 0;
          let overdueTasks = 0;
          let totalPriorityScore = 0;

          const today = new Date();

          for (const task of tasks) {
            try {
              // Vérifier les champs nécessaires pour predictTaskDelay
              if (!task.startDate || !task.dueDate) {
                console.warn(`Tâche ${task._id} ignorée: startDate ou dueDate manquant`);
                continue;
              }

              // Prédire le retard de la tâche
              const prediction = predictTaskDelay(task);
              totalDelayDays += prediction.delayDays || 0;

              // Vérifier si la tâche est en retard
              if (task.dueDate && today > new Date(task.dueDate)) {
                overdueTasks += 1;
              }

              // Compter les tâches de haute priorité
              if (task.priority === 'High') {
                highPriorityTasks += 1;
              }

              // Calculer un score de priorité pour la tâche
              const priorityScore = task.priority === 'High' ? 1 : task.priority === 'Medium' ? 0.5 : 0;
              totalPriorityScore += priorityScore;
            } catch (taskError) {
              console.error(`Erreur lors de l'analyse de la tâche ${task._id} pour l'utilisateur ${user.username}:`, taskError);
              continue;
            }
          }

          // Calculer un score d'efficacité
          const averagePriority = taskCount > 0 ? totalPriorityScore / taskCount : 0;
          const workloadScore = (taskCount * averagePriority) + (totalDelayDays * 0.5) + (overdueTasks * 2);

          // Déterminer un statut de surcharge
          let workloadStatus = 'Balanced';
          if (workloadScore > 20) {
            workloadStatus = 'Overloaded';
          } else if (workloadScore <= 5) { // Changement : Inclure les utilisateurs avec 0 tâche
            workloadStatus = 'Underutilized';
          }

          // Retourner les détails pour cet utilisateur
          return {
            userId: user._id,
            username: user.username,
            firstname: user.firstname || 'N/A',
            lastname: user.lastname || 'N/A',
            role: user.role ? user.role.name : 'Unknown',
            taskCount,
            totalDelayDays,
            highPriorityTasks,
            overdueTasks,
            workloadScore: parseFloat(workloadScore.toFixed(2)),
            workloadStatus,
          };
        } catch (userError) {
          console.error(`Erreur lors du traitement de l'utilisateur ${user.username}:`, userError);
          return {
            userId: user._id,
            username: user.username,
            firstname: user.firstname || 'N/A',
            lastname: user.lastname || 'N/A',
            role: user.role ? user.role.name : 'Unknown',
            taskCount: 0,
            totalDelayDays: 0,
            highPriorityTasks: 0,
            overdueTasks: 0,
            workloadScore: 0,
            workloadStatus: 'Error',
          };
        }
      })
    );

    // Trier les utilisateurs par workloadScore
    userTaskAnalysis.sort((a, b) => b.workloadScore - a.workloadScore);

    // Ajouter une recommandation globale
    const overloadedUsers = userTaskAnalysis.filter(user => user.workloadStatus === 'Overloaded');
    const underutilizedUsers = userTaskAnalysis.filter(user => user.workloadStatus === 'Underutilized');

    const recommendation = overloadedUsers.length > 0 && underutilizedUsers.length > 0
      ? `Consider reassigning tasks from overloaded users (${overloadedUsers.map(u => u.username).join(', ')}) to underutilized users (${underutilizedUsers.map(u => u.username).join(', ')}).`
      : 'Workload distribution seems balanced.';

    res.status(200).json({
      userTaskAnalysis,
      recommendation,
    });
  } catch (error) {
    console.error('Erreur critique dans getUserTaskCounts:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
exports.getProductivity = async (req, res) => {
  const projectId = req.params.projectId;

  try {
    // Vérifier si le projet existe
    const project = await Project.findById(projectId).lean();
    if (!project) {
      return res.status(404).json({ message: "Projet non trouvé" });
    }

    // Récupérer les tâches terminées
    const projectTasks = await Task.aggregate([
      {
        $match: {
          status: "Done",
          project: new mongoose.Types.ObjectId(projectId),
          assignedTo: { $exists: true, $ne: [] }, // S'assurer que assignedTo n'est pas vide
        },
      },
      {
        $lookup: {
          from: "projects",
          localField: "project",
          foreignField: "_id",
          as: "projectInfo",
        },
      },
      {
        $unwind: {
          path: "$projectInfo",
          preserveNullAndEmptyArrays: true, // Éviter les erreurs si pas de projet
        },
      },
      {
        $group: {
          _id: "$projectInfo._id",
          projectName: { $first: "$projectInfo.name" },
          totalTasksCompleted: { $sum: 1 },
          tasks: {
            $push: {
              priority: { $ifNull: ["$priority", "Medium"] }, // Valeur par défaut
              isLate: {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$dueDate", null] },
                      {
                        $gt: [
                          { $ifNull: ["$updatedAt", new Date()] },
                          { $ifNull: [{ $toDate: "$dueDate" }, new Date()] },
                        ],
                      },
                    ],
                  },
                  true,
                  false,
                ],
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          project: "$projectName",
          totalTasksCompleted: 1,
          score: {
            $reduce: {
              input: "$tasks",
              initialValue: 0,
              in: {
                $add: [
                  "$$value",
                  5, // +5 par tâche
                  {
                    $cond: [
                      { $in: [{ $toLower: "$$this.priority" }, ["high", "urgent"]] },
                      10,
                      0,
                    ],
                  },
                  { $cond: ["$$this.isLate", -5, 0] },
                ],
              },
            },
          },
        },
      },
    ]);

    if (projectTasks.length === 0) {
      return res.status(200).json({
        project: project.name,
        totalTasksCompleted: 0,
        score: 0,
        message: "Aucune tâche terminée",
      });
    }

    res.json(projectTasks[0]);
  } catch (error) {
    console.error("Erreur dans getProductivity:", error.message, error.stack);
    res.status(500).json({ message: "Erreur serveur lors du calcul de la productivité" });
  }
};
// Create Task
exports.createTask = async (req, res) => {
  try {
    // Étape 1 : Extraire les données de la requête
    const { title, description, status, priority, project, assignedTo, dueDate, startDate, createdBy } = req.body;
    console.log('Request body for createTask:', req.body);

    // Étape 2 : Valider les champs obligatoires
    if (!title || !project || !createdBy) {
      return res.status(422).json({ error: "Le titre, le projet et le créateur sont obligatoires." });
    }

    // Étape 3 : Vérifier l’existence du projet
    const projectDoc = await Project.findById(project);
    if (!projectDoc) {
      return res.status(404).json({ error: "Projet non trouvé." });
    }

    // Étape 4 : Vérifier l’existence du créateur
    const creator = await User.findById(createdBy).populate('role', 'name');
    if (!creator) {
      return res.status(404).json({ error: "Créateur non trouvé." });
    }

    // Étape 5 : Valider les utilisateurs assignés
    let validatedAssignedTo = [];
    if (assignedTo && Array.isArray(assignedTo) && assignedTo.length > 0) {
      const teamRoles = await Role.find({ name: { $in: ["Team Leader", "Team Member"] } });
      const teamRoleIds = teamRoles.map(role => role._id);
      const members = await User.find({ 
        _id: { $in: assignedTo }, 
        role: { $in: teamRoleIds } 
      });
      if (members.length !== assignedTo.length) {
        return res.status(422).json({ error: "Certains assignés n'existent pas ou n'ont pas le bon rôle." });
      }
      validatedAssignedTo = members.map(member => member._id);
    }
    console.log('Validated assignedTo:', validatedAssignedTo);

    // Étape 6 : Créer la nouvelle tâche
    const newTask = new Task({
      title: title.trim(),
      description: description ? description.trim() : undefined,
      status: status || "To Do",
      priority: priority || "Medium",
      project,
      assignedTo: validatedAssignedTo,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      createdBy
    });

    // Étape 7 : Sauvegarder la tâche
    await newTask.save();

    // Étape 8 : Ajouter la tâche au projet
    await Project.updateOne(
      { _id: project },
      { $push: { tasks: newTask._id } }
    );

    // Étape 9 : Recalculer le statut du projet
    const projectTasks = await Task.find({ project: projectDoc._id });
    const calculatedStatus = calculateProjectStatus(projectTasks);
    await Project.updateOne(
      { _id: projectDoc._id },
      { status: calculatedStatus }
    );

    // Étape 10 : Remplir les données pour la réponse
    const populatedTask = await Task.findById(newTask._id)
      .populate("assignedTo", "firstname lastname")
      .populate("project", "name")
      .populate("createdBy", "firstname lastname email");
    console.log('Task response being sent:', populatedTask);

    // Étape 11 : Renvoyer la tâche créée
    res.status(201).json(populatedTask);
  } catch (error) {
    console.error("Erreur lors de la création de la tâche :", error);
    res.status(500).json({ error: error.message });
  }
};
// Update Task
exports.updateTask = async (req, res) => {
  try {
    // Étape 1 : Extraire les données de la requête
    const taskId = req.params.id;
    const updates = req.body;

    // Étape 2 : Récupérer la tâche avant mise à jour
    const previousTask = await Task.findById(taskId);
    if (!previousTask) {
      return res.status(404).json({ error: "Task not found" });
    }

    // Vérifier que le projet associé existe
    const project = await Project.findById(previousTask.project);
    if (!project) {
      return res.status(400).json({ error: "Associated project not found. This task may be orphaned." });
    }

    // Étape 3 : Stocker l’état précédent
    res.locals.previousTask = previousTask.toObject();

    // Étape 4 : Valider les dates
    if (updates.startDate && updates.dueDate && new Date(updates.dueDate) < new Date(updates.startDate)) {
      return res.status(422).json({ error: "La date d'échéance ne peut pas être antérieure à la date de début." });
    }

    // Étape 5 : Valider les utilisateurs assignés
    if (updates.assignedTo && Array.isArray(updates.assignedTo)) {
      const teamRoles = await Role.find({ name: { $in: ["Team Leader", "Team Member"] } });
      const teamRoleIds = teamRoles.map(role => role._id);
      const assignedMembers = await User.find({
        _id: { $in: updates.assignedTo },
        role: { $in: teamRoleIds },
      });
      if (assignedMembers.length !== updates.assignedTo.length) {
        return res.status(422).json({ error: "Certains assignés n'existent pas ou n'ont pas le bon rôle." });
      }
      updates.assignedTo = assignedMembers.map(member => member._id);
    }

    // Étape 6 : Normaliser les champs de type string
    if (updates.title) updates.title = String(updates.title).trim();
    if (updates.status) updates.status = String(updates.status).trim();
    if (updates.priority) updates.priority = String(updates.priority).trim();
    if (updates.description) updates.description = String(updates.description).trim();

    // Étape 7 : Ajouter updatedBy
    req.body.updatedBy = req.user?.id || previousTask.createdBy;

    // Étape 8 : Mettre à jour la tâche
    const updatedTask = await Task.findByIdAndUpdate(taskId, updates, { new: true })
      .populate("project", "name")
      .populate("assignedTo", "firstname lastname email")
      .populate("createdBy", "firstname lastname email");

    // Étape 9 : Recalculer le statut du projet
    const projectTasks = await Task.find({ project: updatedTask.project._id });
    const calculatedStatus = calculateProjectStatus(projectTasks);
    await Project.updateOne(
      { _id: updatedTask.project._id },
      { status: calculatedStatus }
    );

    // Étape 10 : Renvoyer la tâche mise à jour
    res.status(200).json(updatedTask);
  } catch (error) {
    console.error("Error updating task:", error);
    res.status(500).json({ error: error.message });
  }
};
// Delete Task
exports.deleteTask = async (req, res) => {
  try {
    const taskId = req.params.id;
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    // Ajouter deletedBy
    req.body.deletedBy = req.user?.id || task.createdBy; // Fallback sur createdBy si req.user.id n'est pas défini

    await task.deleteOne();

    res.status(200).json({ message: "Task deleted successfully" });
  } catch (error) {
    console.error("Error deleting task:", error);
    res.status(500).json({ error: error.message });
  }
};