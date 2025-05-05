const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/check-delays', authMiddleware, notificationController.triggerDelayCheck);
router.get('/history', authMiddleware, notificationController.getNotificationHistory);
router.get('/my-notifications', authMiddleware, notificationController.getMyNotifications);

// Mark a notification as read
router.put('/mark-read/:id', authMiddleware, notificationController.markNotificationAsRead);

module.exports = router;