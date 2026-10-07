const express = require('express');
const router = express.Router();
const statsController = require('../controllers/statsController');
const { authenticateToken } = require('../middleware/authMiddleware');

router.get('/', authenticateToken, statsController.getDashboardStats);

module.exports = router;
