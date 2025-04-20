const Task = require('../models/Task');
const User = require('../models/User');
const Project = require('../models/Project');
const Role = require('../models/Role');
const { spawn } = require("child_process");
const { predictTaskDelay } = require('../utils/taskDelayPredictor');
const path = require("path");
const mongoose = require('mongoose');

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
// Create Task
exports.createTask = async (req, res) => {
  try {
    const { title, description, status, priority, project, assignedTo, dueDate, startDate, createdBy } = req.body;

    if (!title || !project || !createdBy) {
      return res.status(422).json({ error: "Le titre, le projet et le créateur sont obligatoires." });
    }

    const projectDoc = await Project.findById(project);
    if (!projectDoc) {
      return res.status(404).json({ error: "Projet non trouvé." });
    }

    const creator = await User.findById(createdBy).populate('role', 'name');
    if (!creator) {
      return res.status(404).json({ error: "Créateur non trouvé." });
    }

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

    await newTask.save();

    await Project.updateOne(
      { _id: project },
      { $push: { tasks: newTask._id } }
    );

    res.status(201).json(newTask);
  } catch (error) {
    console.error("Erreur lors de la création de la tâche :", error);
    res.status(500).json({ error: error.message });
  }
};

// Read All Tasks
exports.getAllTasks = async (req, res) => {
  try {
    const { projectId } = req.query;
    let filter = {};
    if (projectId) {
      filter.project = projectId;
    }

    const tasks = await Task.find(filter)
      .populate("project", "name")
      .populate("assignedTo", "firstname lastname email")
      .populate("createdBy", "firstname lastname email");

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

// Update Task
exports.updateTask = async (req, res) => {
  try {
    const { title, description, status, priority, project, assignedTo, dueDate, startDate } = req.body;

    if (project) {
      const projectDoc = await Project.findById(project);
      if (!projectDoc) {
        return res.status(404).json({ error: "Projet non trouvé." });
      }
    }

    let validatedAssignedTo = [];
    if (assignedTo && Array.isArray(assignedTo)) {
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

    const updatedTask = await Task.findByIdAndUpdate(
      req.params.id,
      {
        title: title ? title.trim() : undefined,
        description: description ? description.trim() : undefined,
        status,
        priority,
        project,
        assignedTo: validatedAssignedTo.length > 0 ? validatedAssignedTo : undefined,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        startDate: startDate ? new Date(startDate) : undefined
      },
      { new: true, runValidators: true }
    );

    if (!updatedTask) {
      return res.status(404).json({ message: "Tâche non trouvée" });
    }

    if (project && updatedTask.project.toString() !== project) {
      await Project.updateOne(
        { _id: updatedTask.project },
        { $pull: { tasks: updatedTask._id } }
      );
      await Project.updateOne(
        { _id: project },
        { $push: { tasks: updatedTask._id } }
      );
    }

    console.log(`Tâche ${updatedTask._id} mise à jour :`, updatedTask);
    res.json(updatedTask);
  } catch (error) {
    console.error("Erreur lors de la mise à jour de la tâche :", error);
    res.status(500).json({ error: error.message });
  }
};

// Delete Task
exports.deleteTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ message: "Tâche non trouvée" });
    }

    await Task.deleteOne({ _id: req.params.id });

    await Project.updateOne(
      { _id: task.project },
      { $pull: { tasks: task._id } }
    );

    res.json({ message: "Tâche supprimée avec succès" });
  } catch (error) {
    console.error("Erreur lors de la suppression de la tâche :", error);
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