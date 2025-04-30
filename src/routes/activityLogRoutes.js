const express = require('express');
const router = express.Router();
const activityLogController = require('../controllers/activityLogController');
const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');

// GET: Fetch activity logs (no authMiddleware, as per current setup)
router.get('/activity-logs', activityLogController.getActivityLogs);

// DELETE: Delete multiple activity logs by IDs
router.delete('/activity-logs/delete', async (req, res) => {
  try {
    const { logIds, userId } = req.body; // Expecting logIds and userId in the request body
    if (!Array.isArray(logIds) || logIds.length === 0) {
      return res.status(400).json({ message: 'No log IDs provided.' });
    }
    if (!userId) {
      return res.status(400).json({ message: 'userId is required in the request body.' });
    }

    // Verify the user's role by querying the database
    const user = await User.findById(userId).populate('role', 'name');
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Verify that the user has permission (e.g., Admin role)
    if (user.role.name !== 'Admin') {
      return res.status(403).json({ message: 'Unauthorized: Admin access required.' });
    }

    // Delete the logs
    const result = await ActivityLog.deleteMany({ _id: { $in: logIds } });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'No logs found to delete.' });
    }

    res.json({ message: `${result.deletedCount} logs deleted successfully.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error while deleting logs.' });
  }
});

module.exports = router;