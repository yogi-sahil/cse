const express = require('express');
const router = express.Router();
const usersController = require('../controllers/usersController');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');

router.get('/', authenticateToken, requireAdmin, usersController.getAllUsers);
router.post('/', authenticateToken, requireAdmin, usersController.createUser);
router.put('/:id/status', authenticateToken, requireAdmin, usersController.updateUserStatus);
router.post('/:id/adjust-wallet', authenticateToken, requireAdmin, usersController.adjustUserWallet);
router.delete('/:id', authenticateToken, requireAdmin, usersController.deleteUser);

module.exports = router;
