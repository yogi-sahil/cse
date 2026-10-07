const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const servicesController = require('../controllers/servicesController');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');

const JWT_SECRET = process.env.JWT_SECRET || 'csc_digital_seva_secret_key_2026_super_secure_token_jwt';

// Optional auth so public visitors can always see the services catalog, but admins get full access
router.get('/', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const [rows] = await pool.query(
        'SELECT id, csc_id, name, email, role, status FROM users WHERE id = ?',
        [decoded.id]
      );
      if (rows && rows.length > 0 && rows[0].status !== 'suspended') {
        req.user = rows[0];
      }
    } catch (e) {
      // Expired or invalid token: continue as public visitor gracefully without failing
      req.user = null;
    }
  }
  return servicesController.getAllServices(req, res);
});

router.get('/:id', servicesController.getServiceById);
router.post('/', authenticateToken, requireAdmin, servicesController.createService);
router.put('/:id', authenticateToken, requireAdmin, servicesController.updateService);
router.delete('/:id', authenticateToken, requireAdmin, servicesController.deleteService);

module.exports = router;
