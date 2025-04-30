const express = require("express");
const router = express.Router();
const projectController = require("../controllers/projectController");
const ReportController = require('../controllers/ReportController');
const authMiddleware = require('../middleware/authMiddleware');
const logActivity = require('../middleware/logActivity'); 

router.get("/cluster-users", projectController.clusterUsers);
router.post("/", logActivity,projectController.createProject);
router.get("/", projectController.getAllProjects);
router.get("/:id", projectController.getProjectById); 
router.put("/:id", logActivity ,projectController.updateProject);
router.get('/:id/predict-delay', projectController.predictDelay);
router.delete("/:id",logActivity, projectController.deleteProject);
router.get('/reports/overview', authMiddleware, ReportController.generateOverviewReport);
router.get("/:id/extract-skills", projectController.extractSkillsFromDeliverables);
router.get("/:id/match-users", projectController.matchUsersToProject);

const { predictDuration } = require("../utils/PrjctDeadlinePrediction");
router.get('/with-details', projectController.getProjectsWithDetails);
//Project-deadline-prediction
router.post("/predict", (req, res) => {
    try {
      const projectData = req.body;
      if (!projectData.tasks || !Array.isArray(projectData.tasks)) {
        return res.status(400).json({ error: "Les tâches doivent être un tableau valide" });
      }
      if (!projectData.teamMembers || !Array.isArray(projectData.teamMembers)) {
        return res.status(400).json({ error: "Les membres de l'équipe doivent être un tableau valide" });
      }
      if (!projectData.startDate) {
        return res.status(400).json({ error: "La date de début est requise" });
      }
  
      const duration = predictDuration(projectData);
      const startDate = new Date(projectData.startDate);
      if (isNaN(startDate.getTime())) {
        return res.status(400).json({ error: "Date de début invalide" });
      }
  
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + duration);
  
      res.json({
        predictedDuration: duration,
        predictedEndDate: endDate
      });
    } catch (error) {
      console.error("Erreur dans /predict :", error);
      res.status(500).json({ error: "Erreur interne lors de la prédiction" });
    }
  });
  
module.exports = router;
