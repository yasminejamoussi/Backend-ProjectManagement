const Project = require("../models/Project");
const User = require("../models/User");
const Role = require('../models/Role');

exports.createProject = async (req, res) => {
  try {
    let { name, description, objectives, status, startDate, endDate, deliverables, projectManager, teamMembers } = req.body;

    name = name.trim();
    description = description ? description.trim() : "";

    if (new Date(endDate) < new Date(startDate)) {
      return res.status(422).json({ error: "La date de fin doit être après la date de début." });
    }

    // Peupler le rôle du projectManager
    const manager = await User.findById(projectManager).populate('role', 'name');
    if (!manager) {
      return res.status(422).json({ error: "Le projectManager n'existe pas." });
    }
    if (!["Project Manager", "Admin"].includes(manager.role?.name)) {
      return res.status(422).json({ error: "Le projectManager doit être un Project Manager ou Admin existant." });
    }

    // Récupérer les ObjectIds des rôles "Team Leader" et "Team Member"
    const teamRoles = await Role.find({ name: { $in: ["Team Leader", "Team Member"] } });
    const teamRoleIds = teamRoles.map(role => role._id);

    // Vérifier les teamMembers avec les rôles corrects
    const members = await User.find({ 
      _id: { $in: teamMembers }, 
      role: { $in: teamRoleIds } 
    }).populate('role', 'name');
    if (members.length !== teamMembers.length) {
      return res.status(422).json({ error: "Certains membres de l'équipe n'existent pas ou n'ont pas le bon rôle." });
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
      teamMembers 
    });
    await newProject.save();

    res.status(201).json(newProject);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAllProjects = async (req, res) => {
  try {
    const { status, startDate, endDate, projectManager, sortBy, order } = req.query;
    console.log("Paramètres reçus :", req.query); // Log pour débogage
    let filter = {};
    
    if (status) filter.status = status;
    if (projectManager) filter.projectManager = projectManager;

    // Correction pour filtrer une plage de dates
    if (startDate) {
      filter.startDate = { ...filter.startDate, $gte: new Date(startDate) };
    }
    if (endDate) {
      filter.endDate = { ...filter.endDate, $lte: new Date(endDate) };
    }

    let sortOptions = {};
    if (sortBy) {
      const sortOrder = order === "desc" ? -1 : 1;
      sortOptions[sortBy] = sortOrder;
    }

    console.log("Filtre appliqué :", filter); // Log pour vérifier le filtre
    console.log("Options de tri :", sortOptions); // Log pour vérifier le tri

    const projects = await Project.find(filter)
      .populate("projectManager", "firstname lastname email")
      .populate({
        path: "teamMembers",
        select: "firstname lastname email",
        populate: { path: "role", select: "name" }
      })
      .sort(sortOptions);

    console.log("Projets trouvés :", projects.length); // Log pour vérifier les résultats
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


// 🚀 Ajout de la récupération d'un projet par son ID
exports.getProjectById = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate("projectManager", "firstname lastname email")
      .populate({
        path: "teamMembers",
        select: "firstname lastname email",
        populate: { path: "role", select: "name" }
      });
    console.log("Projet trouvé avec teamMembers :", project); // Log détaillé
    if (!project) return res.status(404).json({ message: "Projet non trouvé" });
    res.json(project);
  } catch (error) {
    console.error("Erreur :", error);
    res.status(500).json({ error: error.message });
  }
};

exports.updateProject = async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      return res.status(422).json({ error: "La date de fin doit être après la date de début." });
    }

    const updatedProject = await Project.findByIdAndUpdate(req.params.id, req.body, { new: true })
      .populate("projectManager", "firstname lastname email")
      .populate("teamMembers", "firstname lastname email role");

    if (!updatedProject) return res.status(404).json({ message: "Projet non trouvé" });

    res.json(updatedProject);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
exports.deleteProject = async (req, res) => {
  try {
    const deletedProject = await Project.findByIdAndDelete(req.params.id);
    if (!deletedProject) return res.status(404).json({ message: "Projet non trouvé" });
    
    res.json({ message: "Projet supprimé avec succès" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
