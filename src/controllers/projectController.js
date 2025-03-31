const Project = require('../models/Project');
const User = require('../models/User');
const Role = require('../models/Role');
const Task = require('../models/Task');
const { predictDelay } = require('../utils/PrjctDelayPrediction');


exports.predictDelay = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id).populate('tasks');
    if (!project) return res.status(404).json({ message: "Projet non trouvé" });

    const prediction = predictDelay(project);
    res.json(prediction);
  } catch (error) {
    console.error("Erreur lors de la prédiction du retard :", error);
    res.status(500).json({ error: error.message });
  }
};
// Create Project
exports.createProject = async (req, res) => {
  try {
    let { name, description, objectives, status, startDate, endDate, deliverables, projectManager, teamMembers, tasks } = req.body;

    name = name.trim();
    description = description ? description.trim() : "";

    if (new Date(endDate) < new Date(startDate)) {
      return res.status(422).json({ error: "La date de fin doit être après la date de début." });
    }

    const manager = await User.findById(projectManager).populate('role', 'name');
    if (!manager) return res.status(422).json({ error: "Le projectManager n'existe pas." });
    if (!["Project Manager", "Admin"].includes(manager.role?.name)) {
      return res.status(422).json({ error: "Le projectManager doit être un Project Manager ou Admin existant." });
    }

    const teamRoles = await Role.find({ name: { $in: ["Team Leader", "Team Member"] } });
    const teamRoleIds = teamRoles.map(role => role._id);

    const members = await User.find({ 
      _id: { $in: teamMembers }, 
      role: { $in: teamRoleIds } 
    }).populate('role', 'name');
    if (members.length !== teamMembers.length) {
      return res.status(422).json({ error: "Certains membres de l'équipe n'existent pas ou n'ont pas le bon rôle." });
    }

    // Gestion des tâches (optionnel à la création)
    let validatedTasks = [];
    if (tasks && Array.isArray(tasks)) {
      validatedTasks = tasks.map(task => ({
        title: task.title.trim(),
        description: task.description ? task.description.trim() : undefined,
        status: task.status || "To Do",
        priority: task.priority || "Medium",
        project: null, // sera défini après la création du projet
        assignedTo: task.assignedTo || [],
        dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
        startDate: task.startDate ? new Date(task.startDate) : undefined,
        createdBy: projectManager // Par défaut, le projectManager crée les tâches
      }));

      // Validation des assignés dans les tâches
      for (const task of validatedTasks) {
        if (task.assignedTo.length > 0) {
          const assignedMembers = await User.find({ 
            _id: { $in: task.assignedTo }, 
            role: { $in: teamRoleIds } 
          });
          if (assignedMembers.length !== task.assignedTo.length) {
            return res.status(422).json({ error: "Certains assignés dans les tâches n'existent pas ou n'ont pas le bon rôle." });
          }
          task.assignedTo = assignedMembers.map(member => member._id);
        }
      }
    }

    const newProject = new Project({ 
      name, 
      description, 
      objectives, 
      status, 
      startDate, 
      endDate, 
      deliverables, 
      projectManager, 
      teamMembers,
      tasks: [] // Initialisé vide, sera mis à jour après
    });
    await newProject.save();

    // Créer et lier les tâches
    if (validatedTasks.length > 0) {
      validatedTasks.forEach(task => task.project = newProject._id);
      const createdTasks = await Task.insertMany(validatedTasks);
      newProject.tasks = createdTasks.map(task => task._id);
      await newProject.save();
    }

    res.status(201).json(newProject);
  } catch (error) {
    console.error("Erreur lors de la création du projet :", error);
    res.status(500).json({ error: error.message });
  }
};

// Read All Projects
exports.getAllProjects = async (req, res) => {
  try {
    const { status, startDate, endDate, projectManager, sortBy, order } = req.query;
    console.log("Paramètres reçus :", req.query);
    let filter = {};
    
    if (status) filter.status = status;
    if (projectManager) filter.projectManager = projectManager;
    if (startDate) filter.startDate = { ...filter.startDate, $gte: new Date(startDate) };
    if (endDate) filter.endDate = { ...filter.endDate, $lte: new Date(endDate) };

    let sortOptions = {};
    if (sortBy) {
      const sortOrder = order === "desc" ? -1 : 1;
      sortOptions[sortBy] = sortOrder;
    }

    const projects = await Project.find(filter)
      .populate("projectManager", "firstname lastname email")
      .populate({
        path: "teamMembers",
        select: "firstname lastname email",
        populate: { path: "role", select: "name" }
      })
      .populate("tasks")
      .sort(sortOptions);

    res.json(projects);
  } catch (error) {
    console.error("Erreur lors de la récupération des projets :", error);
    res.status(500).json({ error: error.message });
  }
};

// Read One Project
exports.getProjectById = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate("projectManager", "firstname lastname email")
      .populate({
        path: "teamMembers",
        select: "firstname lastname email",
        populate: { path: "role", select: "name" }
      })
      .populate("tasks");
    console.log("Projet trouvé :", project);
    if (!project) return res.status(404).json({ message: "Projet non trouvé" });
    res.json(project);
  } catch (error) {
    console.error("Erreur lors de la récupération du projet :", error);
    res.status(500).json({ error: error.message });
  }
};

// Update Project
exports.updateProject = async (req, res) => {
  try {
    const { projectManager, startDate, endDate, tasks } = req.body;

    if (projectManager) {
      return res.status(403).json({ error: "Le projectManager ne peut pas être modifié après la création." });
    }

    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      return res.status(422).json({ error: "La date de fin doit être après la date de début." });
    }

    // Gestion des tâches (ajout ou mise à jour)
    let validatedTasks = [];
    if (tasks && Array.isArray(tasks)) {
      const teamRoles = await Role.find({ name: { $in: ["Team Leader", "Team Member"] } });
      const teamRoleIds = teamRoles.map(role => role._id);

      validatedTasks = await Promise.all(tasks.map(async task => {
        const taskData = {
          title: task.title.trim(),
          description: task.description ? task.description.trim() : undefined,
          status: task.status || "To Do",
          priority: task.priority || "Medium",
          project: req.params.id,
          assignedTo: task.assignedTo || [],
          dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
          startDate: task.startDate ? new Date(task.startDate) : undefined,
          createdBy: task.createdBy || projectManager // Fallback au projectManager actuel
        };

        if (taskData.assignedTo.length > 0) {
          const assignedMembers = await User.find({ 
            _id: { $in: taskData.assignedTo }, 
            role: { $in: teamRoleIds } 
          });
          if (assignedMembers.length !== taskData.assignedTo.length) {
            throw new Error("Certains assignés dans les tâches n'existent pas ou n'ont pas le bon rôle.");
          }
          taskData.assignedTo = assignedMembers.map(member => member._id);
        }

        if (task._id) {
          // Mise à jour d’une tâche existante
          return await Task.findByIdAndUpdate(task._id, taskData, { new: true });
        } else {
          // Création d’une nouvelle tâche
          const newTask = new Task(taskData);
          await newTask.save();
          return newTask;
        }
      }));

      req.body.tasks = validatedTasks.map(task => task._id);
    }

    const updatedProject = await Project.findByIdAndUpdate(req.params.id, req.body, { new: true })
      .populate("projectManager", "firstname lastname email")
      .populate({
        path: "teamMembers",
        select: "firstname lastname email",
        populate: { path: "role", select: "name" }
      })
      .populate("tasks");

    if (!updatedProject) return res.status(404).json({ message: "Projet non trouvé" });

    res.json(updatedProject);
  } catch (error) {
    console.error("Erreur lors de la mise à jour du projet :", error);
    res.status(500).json({ error: error.message });
  }
};

// Delete Project
exports.deleteProject = async (req, res) => {
  try {
    const deletedProject = await Project.findByIdAndDelete(req.params.id);
    if (!deletedProject) return res.status(404).json({ message: "Projet non trouvé" });

    await Task.deleteMany({ project: req.params.id });

    res.json({ message: "Projet et ses tâches supprimés avec succès" });
  } catch (error) {
    console.error("Erreur lors de la suppression du projet :", error);
    res.status(500).json({ error: error.message });
  }
};