const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const logActivity = require('../middleware/logActivity'); 

router.post('/tasks', logActivity,taskController.createTask);
router.get('/tasks', taskController.getAllTasks);
router.get('/tasks/user-task-counts', taskController.getUserTaskCounts);
router.get('/tasks/:id/predict-delay', taskController.predictTaskDelay);
router.get('/tasks/:id', taskController.getTaskById);
router.put('/tasks/:id', logActivity,taskController.updateTask);
router.delete('/tasks/:id',logActivity, taskController.deleteTask);
router.post('/prioritize', taskController.prioritizeTask);
router.post('/tasks/predict-duration', taskController.predictTaskDuration);
router.get("/productivity/:projectId", taskController.getProductivity);

module.exports = router;