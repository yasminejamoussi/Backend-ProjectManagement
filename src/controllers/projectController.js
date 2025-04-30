const Project = require('../models/Project');
const User = require('../models/User');
const Role = require('../models/Role');
const Task = require('../models/Task');
const { predictDelay } = require('../utils/PrjctDelayPrediction');
const { exec } = require("child_process");
const util = require("util");
const logActivity = require('../middleware/logActivity');
const calculateProjectStatus = require('../utils/projectStatus');

// Promisify exec pour une gestion asynchrone
const execPromise = util.promisify(exec);

// Liste des compétences pour le fallback (alignée avec SKILL_KEYWORDS dans extract_skills.py)
const SKILL_KEYWORDS = [
  "react", "javascript", "python", "sql", "java", "project management",
  "node.js", "node", "html", "css", "typescript", "mongodb", "docker", "aws",
  "angular", "vue.js", "git", "jenkins", "kubernetes",
  "ingénierie informatique", "développement logiciel", "gestion de projet",
  "ui design", "ux design", "api development", "backend development", "frontend development",
  "database design", "cloud computing", "machine learning", "data analysis", "devops"
];

// Fonction réutilisable pour extraire les compétences
const extractSkills = async (deliverables) => {
  // Vérifier que deliverables est une liste
  if (!Array.isArray(deliverables)) {
    throw new Error("Les livrables doivent être une liste");
  }

  // Nettoyer les livrables en joignant et en normalisant le texte
  const deliverablesText = deliverables
    .join(" ")
    .replace(/,\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!deliverablesText) {
    return [];
  }

  console.log("📝 Texte des livrables envoyé au script Python :", deliverablesText);

  let extractedSkills = [];
  try {
    console.log("🤖 Exécution du script Python pour extraire les compétences...");
    const escapedText = deliverablesText.replace(/"/g, '\\"');
    const command = `python scripts/extract_skills.py "${escapedText}"`;
    const { stdout, stderr } = await execPromise(command);

    if (stderr) {
      console.error("❌ Erreur lors de l'exécution du script Python :", stderr);
      throw new Error(stderr);
    }

    const result = JSON.parse(stdout);
    extractedSkills = result.skills || [];
    console.log("✅ Compétences extraites par le script Python :", extractedSkills);
  } catch (scriptError) {
    console.error("❌ Erreur lors de l'exécution du script Python :", scriptError.message);
    // Fallback : utiliser la liste complète des compétences
    extractedSkills = SKILL_KEYWORDS.filter((skill) =>
      deliverablesText.toLowerCase().includes(skill.toLowerCase())
    );
    console.log("⚠️ Fallback utilisé, compétences extraites :", extractedSkills);
  }

  // Filtrer les doublons ou les variantes (ex. garder "node.js" et supprimer "node")
  if (extractedSkills.includes("node.js") && extractedSkills.includes("node")) {
    extractedSkills = extractedSkills.filter(skill => skill !== "node");
  }

  return extractedSkills;
};

// Fonction réutilisable pour matcher les utilisateurs avec les compétences requises
const matchUsers = async (requiredSkills) => {
  // Récupérer tous les utilisateurs avec des compétences
  const users = await User.find({ skills: { $exists: true, $ne: [] } })
    .select('firstname lastname skills')
    .populate('role', 'name');

  // Filtrer les utilisateurs par rôle (Team Leader ou Team Member)
  const teamRoles = await Role.find({ name: { $in: ["Team Leader", "Team Member"] } });
  const teamRoleIds = teamRoles.map(role => role._id);
  const eligibleUsers = users.filter(user => teamRoleIds.includes(user.role?._id));

  // Calculer le score de compatibilité pour chaque utilisateur
  const matchedUsers = eligibleUsers.map(user => {
    const userSkills = user.skills || [];

    // Compétences communes
    const commonSkills = userSkills.filter(skill => requiredSkills.includes(skill));

    // Score = (nombre de compétences communes / nombre de compétences requises) * 100
    const score = requiredSkills.length > 0 
      ? (commonSkills.length / requiredSkills.length) * 100 
      : 0;

    return {
      id: user._id,
      firstname: user.firstname,
      lastname: user.lastname,
      skills: user.skills,
      role: user.role?.name,
      commonSkills,
      score: parseFloat(score.toFixed(2)) // Arrondir à 2 décimales
    };
  });

  // Trier les utilisateurs par score (du plus haut au plus bas)
  return matchedUsers.sort((a, b) => b.score - a.score);
};

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
    // Étape 1 : Extraire les données de la requête (sans "status")
    let { name, description, objectives, startDate, endDate, deliverables, projectManager, teamMembers, tasks } = req.body;

    // Étape 2 : Valider les champs obligatoires (retirer "status" des champs requis)
    if (!name || !startDate || !endDate || !projectManager) {
      return res.status(422).json({ error: "Les champs obligatoires sont manquants." });
    }

    // Étape 3 : Normaliser les champs de type string
    name = name.trim();
    description = description ? description.trim() : undefined;

    // Étape 4 : Valider les dates
    if (new Date(endDate) < new Date(startDate)) {
      return res.status(422).json({ error: "La date de fin ne peut pas être antérieure à la date de début." });
    }

    // Étape 5 : Valider le project manager
    const manager = await User.findById(projectManager).populate("role", "name");
    if (!manager) {
      return res.status(422).json({ error: "Le projectManager n'existe pas." });
    }
    if (!["Admin", "Project Manager"].includes(manager.role?.name)) {
      return res.status(422).json({ error: "Le projectManager doit être un administrateur ou un chef de projet." });
    }

    // Étape 6 : Valider les membres de l'équipe
    let validatedTeamMembers = [];
    if (teamMembers && Array.isArray(teamMembers) && teamMembers.length > 0) {
      const teamRoles = await Role.find({ name: { $in: ["Team Leader", "Team Member"] } });
      const teamRoleIds = teamRoles.map((role) => role._id);
      const members = await User.find({
        _id: { $in: teamMembers },
        role: { $in: teamRoleIds },
      }).populate("role", "name");
      if (members.length !== teamMembers.length) {
        return res.status(422).json({ error: "Certains membres de l'équipe n'existent pas ou n'ont pas le bon rôle." });
      }
      validatedTeamMembers = members.map((member) => member._id);
    }

    // Étape 7 : Valider les livrables (doivent être une liste)
    if (deliverables && !Array.isArray(deliverables)) {
      return res.status(422).json({ error: "Les livrables doivent être une liste." });
    }

    // Étape 8 : Valider et préparer les tâches
    let validatedTasks = [];
    if (tasks && Array.isArray(tasks) && tasks.length > 0) {
      const teamRoles = await Role.find({ name: { $in: ["Team Leader", "Team Member"] } });
      const teamRoleIds = teamRoles.map((role) => role._id);

      validatedTasks = tasks.map((task) => ({
        title: task.title.trim(),
        description: task.description ? task.description.trim() : undefined,
        status: task.status || "To Do",
        priority: task.priority || "Medium",
        project: null, // Sera défini après la création du projet
        assignedTo: task.assignedTo || [],
        dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
        startDate: task.startDate ? new Date(task.startDate) : undefined,
        createdBy: projectManager,
      }));

      for (const task of validatedTasks) {
        if (task.assignedTo.length > 0) {
          const assignedMembers = await User.find({
            _id: { $in: task.assignedTo },
            role: { $in: teamRoleIds },
          });
          if (assignedMembers.length !== task.assignedTo.length) {
            return res.status(422).json({ error: "Certains assignés dans les tâches n'existent pas ou n'ont pas le bon rôle." });
          }
          task.assignedTo = assignedMembers.map((member) => member._id);
        }
      }
    }

    // Étape 9 : Créer le projet (sans spécifier "status" manuellement)
    const newProject = new Project({
      name,
      description,
      objectives: objectives || [],
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      deliverables: deliverables || [],
      projectManager,
      teamMembers: validatedTeamMembers,
      tasks: [],
      requiredSkills: [],
    });

    // Étape 10 : Sauvegarder le projet initialement
    await newProject.save();

    // Étape 11 : Créer et lier les tâches
    if (validatedTasks.length > 0) {
      validatedTasks.forEach((task) => (task.project = newProject._id));
      const createdTasks = await Task.insertMany(validatedTasks);
      newProject.tasks = createdTasks.map((task) => task._id);
    }

    // Étape 12 : Calculer le statut du projet dynamiquement
    const calculatedStatus = calculateProjectStatus(validatedTasks);
    newProject.status = calculatedStatus;

    // Étape 13 : Extraire les compétences et matcher les utilisateurs (si livrables fournis)
    let suggestedUsers = [];
    if (deliverables && Array.isArray(deliverables) && deliverables.length > 0) {
      newProject.requiredSkills = await extractSkills(deliverables);
      suggestedUsers = await matchUsers(newProject.requiredSkills);
    }

    // Étape 14 : Sauvegarder le projet avec le statut calculé et les tâches
    await newProject.save();

    // Étape 15 : Remplir les données pour la réponse
    const populatedProject = await Project.findById(newProject._id)
      .populate("projectManager", "firstname lastname email")
      .populate("teamMembers", "firstname lastname email")
      .populate({
        path: "tasks",
        populate: { path: "assignedTo", select: "firstname lastname" },
      });

    // Étape 16 : Renvoyer le projet créé et les utilisateurs suggérés
    res.status(201).json({
      project: populatedProject,
      suggestedUsers,
    });
  } catch (error) {
    console.error("Erreur lors de la création du projet :", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getAllProjects = async (req, res) => {
  try {
    // Étape 1 : Extraire les paramètres de la requête
    const { status, startDate, endDate, projectManager, sortBy, order } = req.query;
    console.log("Paramètres reçus :", req.query);
    let filter = {};

    // Étape 2 : Construire les filtres (sans filtrer par "status" pour l'instant)
    if (projectManager) filter.projectManager = projectManager;
    if (startDate) filter.startDate = { ...filter.startDate, $gte: new Date(startDate) };
    if (endDate) filter.endDate = { ...filter.endDate, $lte: new Date(endDate) };

    // Étape 3 : Récupérer tous les projets
    let projects = await Project.find(filter)
      .populate("projectManager", "firstname lastname email skills profileImage")
      .populate({
        path: "teamMembers",
        select: "firstname lastname email skills profileImage",
        populate: { path: "role", select: "name" }
      })
      .populate("tasks");

    // Étape 4 : Récupérer toutes les tâches associées aux projets
    const projectIds = projects.map(project => project._id);
    const tasks = await Task.find({ project: { $in: projectIds } });

    // Créer un mapping des tâches par projet
    const tasksByProject = {};
    tasks.forEach(task => {
      const projectId = task.project.toString();
      if (!tasksByProject[projectId]) {
        tasksByProject[projectId] = [];
      }
      tasksByProject[projectId].push(task);
    });

    // Étape 5 : Recalculer le statut de chaque projet
    projects = projects.map(project => {
      const projectTasks = tasksByProject[project._id.toString()] || [];
      const calculatedStatus = calculateProjectStatus(projectTasks);
      return {
        ...project._doc,
        status: calculatedStatus // Remplacer le statut stocké par celui calculé
      };
    });

    // Étape 6 : Appliquer le filtre sur le statut (si fourni)
    if (status) {
      projects = projects.filter(project => project.status === status);
    }

    // Étape 7 : Appliquer le tri
    if (sortBy) {
      const sortOrder = order === "desc" ? -1 : 1;
      projects.sort((a, b) => {
        const valueA = a[sortBy];
        const valueB = b[sortBy];
        return sortOrder * (valueA > valueB ? 1 : valueA < valueB ? -1 : 0);
      });
    }

    // Étape 8 : Log des données retournées
    console.log("📋 Projets retournés :", projects.map(project => ({
      id: project._id,
      name: project.name,
      status: project.status, // Log du statut calculé
      projectManager: project.projectManager ? {
        name: `${project.projectManager.firstname} ${project.projectManager.lastname}`,
        email: project.projectManager.email,
        skills: project.projectManager.skills
      } : null,
      teamMembers: project.teamMembers.map(member => ({
        name: `${member.firstname} ${member.lastname}`,
        email: member.email,
        skills: member.skills,
        role: member.role?.name
      }))
    })));

    // Étape 9 : Renvoyer les projets
    res.json(projects);
  } catch (error) {
    console.error("Erreur lors de la récupération des projets :", error);
    res.status(500).json({ error: error.message });
  }
};
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
    // Étape 1 : Extraire les données de la requête
    const { projectManager, startDate, endDate, tasks, deliverables } = req.body;

    // Étape 2 : Récupérer le projet avant mise à jour
    const previousProject = await Project.findById(req.params.id)
      .populate("projectManager", "firstname lastname email")
      .populate({
        path: "teamMembers",
        select: "firstname lastname email",
        populate: { path: "role", select: "name" }
      })
      .populate("tasks");
    if (!previousProject) {
      return res.status(404).json({ message: "Projet non trouvé" });
    }

    // Étape 3 : Stocker l'état précédent pour logging
    res.locals.previousProject = previousProject.toObject();

    // Étape 4 : Vérifier que projectManager ne peut pas être modifié
    if (projectManager) {
      return res.status(403).json({ error: "Le projectManager ne peut pas être modifié après la création." });
    }

    // Étape 5 : Valider les dates
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      return res.status(422).json({ error: "La date de fin doit être après la date de début." });
    }

    // Étape 6 : Valider et mettre à jour les tâches
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
          createdBy: task.createdBy || previousProject.projectManager,
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
          const previousTask = await Task.findById(task._id);
          res.locals.previousTask = previousTask.toObject();
          const updatedTask = await Task.findByIdAndUpdate(task._id, taskData, { new: true });
          return updatedTask;
        } else {
          const newTask = new Task(taskData);
          await newTask.save();
          return newTask;
        }
      }));

      req.body.tasks = validatedTasks.map(task => task._id);
    }

    // Étape 7 : Vérifier les livrables
    if (deliverables && !Array.isArray(deliverables)) {
      return res.status(422).json({ error: "Les livrables doivent être une liste" });
    }

    // Étape 8 : Ajouter updatedBy
    req.body.updatedBy = req.user?.id || previousProject.projectManager;

    // Étape 9 : Supprimer le champ "status" de req.body (il sera calculé)
    delete req.body.status;

    // Étape 10 : Mettre à jour le projet
    const updatedProject = await Project.findByIdAndUpdate(req.params.id, req.body, { new: true })
      .populate("projectManager", "firstname lastname email")
      .populate({
        path: "teamMembers",
        select: "firstname lastname email",
        populate: { path: "role", select: "name" }
      })
      .populate("tasks");

    if (!updatedProject) return res.status(404).json({ message: "Projet non trouvé" });

    // Étape 11 : Mettre à jour les compétences si des livrables sont fournis
    if (deliverables && Array.isArray(deliverables) && deliverables.length > 0) {
      updatedProject.requiredSkills = await extractSkills(deliverables);
    }

    // Étape 12 : Recalculer le statut du projet
    const projectTasks = await Task.find({ project: updatedProject._id });
    updatedProject.status = calculateProjectStatus(projectTasks);

    // Étape 13 : Sauvegarder le projet avec le statut calculé
    await updatedProject.save();

    // Étape 14 : Renvoyer le projet mis à jour
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

    // Ajouter deletedBy (supposons que req.user.id est défini par une middleware d'authentification)
    req.body.deletedBy = req.user?.id || deletedProject.projectManager; // Fallback sur projectManager si req.user.id n'est pas défini

    await Task.deleteMany({ project: req.params.id });

    res.json({ message: "Projet et ses tâches supprimés avec succès" });
  } catch (error) {
    console.error("Erreur lors de la suppression du projet :", error);
    res.status(500).json({ error: error.message });
  }
};

exports.extractSkillsFromDeliverables = async (req, res) => {
  try {
    const projectId = req.params.id;
    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    project.requiredSkills = await extractSkills(project.deliverables);
    await project.save();

    res.json({
      message: "Skills extracted successfully",
      requiredSkills: project.requiredSkills,
    });
  } catch (error) {
    console.error("❌ Erreur serveur :", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.clusterUsers = async (req, res) => {
  try {
      // Récupérer tous les utilisateurs avec leurs compétences
      const users = await User.find({ skills: { $exists: true, $ne: [] } }).select('firstname lastname skills');
      if (!users || users.length === 0) {
          return res.status(404).json({ message: "Aucun utilisateur avec des compétences trouvé" });
      }

      // Préparer les données pour le clustering
      const usersSkills = users.map(user => user.skills || []);
      const numClusters = req.query.numClusters ? parseInt(req.query.numClusters) : 3;

      if (usersSkills.length < numClusters) {
          return res.status(400).json({ message: `Nombre d'utilisateurs (${usersSkills.length}) insuffisant pour ${numClusters} clusters` });
      }

      // Échapper correctement les guillemets dans la chaîne JSON
      const escapedJson = JSON.stringify(usersSkills).replace(/"/g, '\\"');
      const command = `/venv/bin/python src/scripts/cluster_users.py "${escapedJson}" ${numClusters}`;
      console.log("Commande exécutée :", command); // Pour déboguer

      const { stdout, stderr } = await execPromise(command);

      if (stderr) {
          console.error("❌ Erreur lors de l'exécution du script de clustering :", stderr);
          throw new Error(stderr);
      }

      const result = JSON.parse(stdout);
      const clusterLabels = result.clusters;

      // Associer chaque utilisateur à son cluster
      const clusteredUsers = users.map((user, index) => ({
          id: user._id,
          firstname: user.firstname,
          lastname: user.lastname,
          skills: user.skills,
          cluster: clusterLabels[index]
      }));

      // Regrouper les utilisateurs par cluster
      const clusters = {};
      clusteredUsers.forEach(user => {
          if (!clusters[user.cluster]) {
              clusters[user.cluster] = [];
          }
          clusters[user.cluster].push(user);
      });

      res.json({ clusters });
  } catch (error) {
      console.error("❌ Erreur lors du clustering des utilisateurs :", error);
      res.status(500).json({ message: "Erreur serveur", error: error.message });
  }
};

exports.matchUsersToProject = async (req, res) => {
  try {
    const projectId = req.params.id;
    const project = await Project.findById(projectId);

    if (!project) {
      return res.status(404).json({ message: "Projet non trouvé" });
    }

    if (!project.requiredSkills || project.requiredSkills.length === 0) {
      return res.status(400).json({ message: "No skills required for this project" });
    }

    // Log des compétences requises
    console.log("🔍 Compétences requises pour le projet :", project.requiredSkills);

    // Récupérer tous les utilisateurs avec des compétences
    const users = await User.find({ skills: { $exists: true, $ne: [] } })
      .select('firstname lastname skills')
      .populate('role', 'name');

    // Log des utilisateurs récupérés
    console.log("👥 Utilisateurs récupérés pour le matching :", users.map(user => ({
      name: `${user.firstname} ${user.lastname}`,
      skills: user.skills,
      role: user.role?.name
    })));

    // Filtrer les utilisateurs par rôle (Team Leader ou Team Member)
    const teamRoles = await Role.find({ name: { $in: ["Team Leader", "Team Member"] } });
    const teamRoleIds = teamRoles.map(role => role._id.toString());
    const eligibleUsers = users.filter(user => user.role && teamRoleIds.includes(user.role._id.toString()));

    // Log des utilisateurs éligibles
    console.log("👥 Utilisateurs éligibles (Team Leader/Team Member) :", eligibleUsers.map(user => ({
      name: `${user.firstname} ${user.lastname}`,
      skills: user.skills,
      role: user.role?.name
    })));

    // Récupérer toutes les tâches assignées (non terminées) pour compter les assignations
    const tasks = await Task.find({ status: { $nin: ['Done', 'Tested'] } })
      .select('assignedTo');

    // Créer un mapping des utilisateurs et de leurs nombres de tâches assignées
    const taskCountMap = {};
    eligibleUsers.forEach(user => {
      taskCountMap[user._id.toString()] = 0; // Initialiser à 0 pour chaque utilisateur
    });

    tasks.forEach(task => {
      if (task.assignedTo && task.assignedTo.length > 0) {
        task.assignedTo.forEach(assignee => {
          const userId = assignee.toString();
          if (taskCountMap[userId] !== undefined) {
            taskCountMap[userId] += 1; // Incrémenter le compteur pour cet utilisateur
          }
        });
      }
    });

    // Log du nombre de tâches par utilisateur
    console.log("📋 Nombre de tâches assignées par utilisateur :", taskCountMap);

    // Normaliser les compétences requises en minuscules
    const normalizedRequiredSkills = project.requiredSkills.map(skill => skill.toLowerCase());

    // Calculer le score de compatibilité pour chaque utilisateur
    const matchedUsers = eligibleUsers.map(user => {
      const userSkills = user.skills || [];
      // Normaliser les compétences de l’utilisateur en minuscules
      const normalizedUserSkills = userSkills.map(skill => skill.toLowerCase());

      // Compétences communes (comparaison insensible à la casse)
      const commonSkills = userSkills.filter(skill => normalizedRequiredSkills.includes(skill.toLowerCase()));

      // Score = (nombre de compétences communes / nombre de compétences requises) * 100
      const score = project.requiredSkills.length > 0 
        ? (commonSkills.length / project.requiredSkills.length) * 100 
        : 0;

      return {
        id: user._id,
        firstname: user.firstname,
        lastname: user.lastname,
        skills: user.skills, // Garder les compétences originales pour l’affichage
        role: user.role?.name,
        commonSkills,
        taskCount: taskCountMap[user._id.toString()] || 0, // Nombre de tâches assignées
        score: parseFloat(score.toFixed(2))
      };
    });

    // Filtrer les utilisateurs avec un score supérieur à 0 et trier par score (décroissant) puis par taskCount (croissant)
    const filteredMatchedUsers = matchedUsers
      .filter(user => user.score > 0)
      .sort((a, b) => {
        if (a.score !== b.score) {
          return b.score - a.score; // Tri par score décroissant
        }
        return a.taskCount - b.taskCount; // Si même score, tri par taskCount croissant
      });

    // Log final des utilisateurs matchés
    console.log("✅ Utilisateurs matchés (triés) :", filteredMatchedUsers);

    res.json({
      projectId: project._id,
      projectName: project.name,
      requiredSkills: project.requiredSkills,
      matchedUsers: filteredMatchedUsers
    });
  } catch (error) {
    console.error("❌ Erreur lors du matching des utilisateurs :", error);
    res.status(500).json({ message: "Erreur serveur", error: error.message });
  }
};

// Récupérer les projets avec managedProjects et assignedTasks calculés dynamiquement
exports.getProjectsWithDetails = async (req, res) => {
  try {
    const { status, startDate, endDate, projectManager, sortBy, order } = req.query;
    console.log("Paramètres reçus pour getProjectsWithDetails :", req.query);
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

    // Récupérer les projets avec population
    const projects = await Project.find(filter)
      .populate({
        path: "projectManager",
        select: "firstname lastname email",
        populate: { path: "role", select: "name" }
      })
      .populate({
        path: "teamMembers",
        select: "firstname lastname email",
        populate: { path: "role", select: "name" }
      })
      .populate("tasks")
      .sort(sortOptions);

    // Calculer managedProjects et assignedTasks dynamiquement
    const enrichedProjects = await Promise.all(
      projects.map(async (project) => {
        const projectId = project._id;

        // Calculer managedProjects pour projectManager
        const managerManagedProjects = await Project.countDocuments({
          $or: [
            { projectManager: project.projectManager?._id },
            { teamMembers: project.projectManager?._id }
          ]
        });

        // Calculer assignedTasks pour projectManager
        const managerAssignedTasks = await Task.countDocuments({
          assignedTo: project.projectManager?._id
        });

        // Calculer managedProjects et assignedTasks pour teamMembers
        const enrichedTeamMembers = await Promise.all(
          (project.teamMembers || []).map(async (member) => {
            const memberManagedProjects = await Project.countDocuments({
              $or: [
                { projectManager: member._id },
                { teamMembers: member._id }
              ]
            });
            const memberAssignedTasks = await Task.countDocuments({
              assignedTo: member._id
            });
            return {
              ...member.toObject(),
              managedProjects: Array(memberManagedProjects).fill(projectId), // Simuler un tableau
              assignedTasks: Array(memberAssignedTasks).fill(projectId) // Simuler un tableau
            };
          })
        );

        return {
          ...project.toObject(),
          projectManager: project.projectManager
            ? {
                ...project.projectManager.toObject(),
                managedProjects: Array(managerManagedProjects).fill(projectId), // Simuler un tableau
                assignedTasks: Array(managerAssignedTasks).fill(projectId) // Simuler un tableau
              }
            : null,
          teamMembers: enrichedTeamMembers
        };
      })
    );

    res.json(enrichedProjects);
  } catch (error) {
    console.error("Erreur lors de la récupération des projets avec détails :", error);
    res.status(500).json({ error: error.message });
  }
};