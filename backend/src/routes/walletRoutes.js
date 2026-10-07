const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');

router.get('/transactions', authenticateToken, walletController.getTransactions);
router.get('/balance', authenticateToken, walletController.getBalance);
router.get('/preview-bonus', authenticateToken, walletController.previewBonus);

// Recharge Request endpoints
router.post('/request-recharge', authenticateToken, walletController.requestRecharge);
router.get('/recharge-requests', authenticateToken, walletController.getRechargeRequests);
router.put('/recharge-requests/:id/status', authenticateToken, requireAdmin, walletController.updateRechargeRequestStatus);

// Direct Add money by Admin
router.post('/add-money', authenticateToken, requireAdmin, walletController.addMoney);

module.exports = router;
