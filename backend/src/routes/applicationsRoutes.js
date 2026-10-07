const express = require('express');
const router = express.Router();
const applicationsController = require('../controllers/applicationsController');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');

router.get('/', authenticateToken, applicationsController.getApplications);
router.post('/', authenticateToken, applicationsController.createApplication);
router.put('/:id/status', authenticateToken, requireAdmin, applicationsController.updateApplicationStatus);

module.exports = router;
