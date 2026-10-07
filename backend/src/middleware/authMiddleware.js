const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'csc_digital_seva_secret_key_2026_super_secure_token_jwt';

// Middleware to authenticate any valid logged in user (Admin or VLE)
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access Denied: No authentication token provided. Please log in.'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Fetch live user from database to ensure up-to-date role and balance
    const [rows] = await pool.query(
      'SELECT id, csc_id, name, email, phone, role, center_name, state, district, status, wallet_balance FROM users WHERE id = ?',
      [decoded.id]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'User account not found or has been removed.'
      });
    }

    const user = rows[0];
    if (user.status === 'suspended') {
      return res.status(403).json({
        success: false,
        message: 'Your CSC account is currently suspended. Please contact National Admin.'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired session token. Please log in again.'
    });
  }
}

// Middleware to enforce SUPER ADMIN only
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access Restricted: This operation requires Super Admin privileges.'
    });
  }
  next();
}

module.exports = {
  authenticateToken,
  requireAdmin
};
