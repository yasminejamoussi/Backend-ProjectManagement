const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');

router.post('/tasks', taskController.createTask);
router.get('/tasks', taskController.getAllTasks);
router.get('/tasks/user-task-counts', taskController.getUserTaskCounts);
router.get('/tasks/:id/predict-delay', taskController.predictTaskDelay);
router.get('/tasks/:id', taskController.getTaskById);
router.put('/tasks/:id', taskController.updateTask);
router.delete('/tasks/:id', taskController.deleteTask);
router.post('/prioritize', taskController.prioritizeTask);
router.post('/tasks/predict-duration', taskController.predictTaskDuration);
router.get("/productivity/:projectId", taskController.getProductivity);

module.exports = router;