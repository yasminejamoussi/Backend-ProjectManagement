const Task = require('../models/Task');
const User = require('../models/User');
const Project = require('../models/Project');
const Role = require('../models/Role');

// Create Task
exports.createTask = async (req, res) => {
  try {
    const { title, description, status, priority, project, assignedTo, dueDate, startDate, createdBy } = req.body;

    // Validation des champs obligatoires
    if (!title || !project || !createdBy) {
      return res.status(422).json({ error: "Le titre, le projet et le créateur sont obligatoires." });
    }

    // Vérifier que le projet existe
    const projectDoc = await Project.findById(project);
    if (!projectDoc) {
      return res.status(404).json({ error: "Projet non trouvé." });
    }

    // Vérifier que le créateur existe
    const creator = await User.findById(createdBy).populate('role', 'name');
    if (!creator) {
      return res.status(404).json({ error: "Créateur non trouvé." });
    }

    // Validation des assignés (si fournis)
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

    // Ajouter la tâche au projet
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

// Read All Tasks (par projet ou global)
exports.getAllTasks = async (req, res) => {
  try {
    const { projectId } = req.query; // Filtrer par projet si fourni
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

    // Vérifier que le projet existe si modifié
    if (project) {
      const projectDoc = await Project.findById(project);
      if (!projectDoc) {
        return res.status(404).json({ error: "Projet non trouvé." });
      }
    }

    // Validation des assignés (si fournis)
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

    // Si le projet change, synchroniser les tâches dans Project
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

    // Retirer la tâche du projet
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