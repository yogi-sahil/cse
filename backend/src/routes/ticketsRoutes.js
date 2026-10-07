const express = require('express');
const router = express.Router();
const ticketsController = require('../controllers/ticketsController');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');

router.get('/', authenticateToken, ticketsController.getTickets);
router.post('/', authenticateToken, ticketsController.createTicket);
router.put('/:id', authenticateToken, requireAdmin, ticketsController.updateTicket);

module.exports = router;
