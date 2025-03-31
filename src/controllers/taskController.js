const Task = require('../models/Task');
const User = require('../models/User');
const Project = require('../models/Project');
const Role = require('../models/Role');
const { spawn } = require("child_process");
const path = require("path");

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

const mongoose = require('mongoose'); // Importer mongoose

exports.getProductivity = async (req, res) => {
  const projectId = req.params.projectId; // Récupérer l'ID du projet depuis le chemin

  try {
    // Récupérer les tâches terminées pour le projet spécifique
    const projectTasks = await Task.aggregate([
      {
        $match: { 
          status: "Done", // Filtrer uniquement les tâches terminées
          project: new mongoose.Types.ObjectId(projectId), // Filtrer par ID du projet
          assignedTo: { $exists: true, $ne: [], $not: { $size: 0 } },
          priority: { $exists: true, $in: ["High", "Urgent", "Medium", "Low"] }
        }
      },
      {
        $lookup: {
          from: "projects", // Vérifiez le nom exact de la collection
          localField: "project",
          foreignField: "_id",
          as: "projectInfo"
        }
      },
      {
        $unwind: "$projectInfo" // Décomposer le tableau de jointure pour les projets
      },
      {
        $group: {
          _id: "$projectInfo._id", // Grouper par ID du projet
          projectName: { $first: "$projectInfo.name" }, // Nom du projet
          totalTasksCompleted: { $sum: 1 }, // Nombre total de tâches terminées
          tasks: { 
            $push: {
              priority: "$priority",
              isLate: { 
                $cond: [{ 
                  $and: [
                    { $gt: [{ $ifNull: ["$updatedAt", new Date(0)] }, { $ifNull: [{ $toDate: "$dueDate" }, new Date(0)] }] },
                    { $ne: ["$dueDate", null] }
                  ]
                }, true, false] 
              }
            }
          }
        }
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
                  5, // +5 points par tâche terminée
                  { $cond: [{ $in: [{ $toLower: "$$this.priority" }, ["high", "urgent"]] }, 10, 0] }, // +10 pour High/Urgent
                  { $cond: ["$$this.isLate", -5, 0] } // -5 si en retard
                ]
              }
            }
          }
        }
      }
    ]);

    // Vérifier si le projet existe et a des tâches Done
    if (projectTasks.length === 0) {
      const project = await Project.findById(projectId).lean(); // Vérifiez le nom exact de la collection
      if (!project) {
        return res.status(404).json({ message: "Projet non trouvé" });
      }
      return res.status(200).json({
        project: project.name,
        message: "Aucun tâche est complétée"
      });
    }

    res.json(projectTasks[0]); // Retourner un seul objet pour le projet spécifique
  } catch (error) {
    console.error("Erreur lors du calcul de la productivité par projet :", error);
    res.status(500).json({ message: "Erreur lors du calcul de la productivité par projet" });
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