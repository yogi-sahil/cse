const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'csc_digital_seva_secret_key_2026_super_secure_token_jwt';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Generate CSC ID helper: e.g. CSC9023418
function generateCscId() {
  const num = Math.floor(1000000 + Math.random() * 9000000);
  return `CSC${num}`;
}

// User / Admin Login
exports.login = async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide CSC ID / Email and Password.'
      });
    }

    // Lookup by CSC ID or Email
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE csc_id = ? OR email = ? LIMIT 1',
      [identifier.trim(), identifier.trim()]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid CSC credentials. User not found.'
      });
    }

    const user = rows[0];

    // Check account status
    if (user.status === 'suspended') {
      return res.status(403).json({
        success: false,
        message: 'This CSC account is suspended. Contact administrator.'
      });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Incorrect password. Please verify and retry.'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, csc_id: user.csc_id, role: user.role, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        csc_id: user.csc_id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        center_name: user.center_name,
        state: user.state,
        district: user.district,
        wallet_balance: parseFloat(user.wallet_balance),
        status: user.status
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during login'
    });
  }
};

// VLE Operator Registration (Disabled for public; Admin only)
exports.register = async (req, res) => {
  return res.status(403).json({
    success: false,
    message: 'Public VLE registration is disabled. VLE Operators must be onboarded directly by Super Admin via the Admin Control Panel.'
  });
  try {
    const { name, email, phone, password, center_name, state, district } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Full Name, Email, and Password are required.'
      });
    }

    // Check email existence
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email.trim()]);
    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email address already exists.'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    const newCscId = generateCscId();

    const [result] = await pool.query(
      `INSERT INTO users (csc_id, name, email, phone, password, role, center_name, state, district, status, wallet_balance)
       VALUES (?, ?, ?, ?, ?, 'user', ?, ?, ?, 'active', 500.00)`,
      [
        newCscId,
        name.trim(),
        email.trim(),
        phone ? phone.trim() : null,
        hashedPassword,
        center_name ? center_name.trim() : 'Digital Seva Kendra',
        state || 'Delhi',
        district || 'Central Delhi'
      ]
    );

    // Initial sign-up bonus / welcome wallet balance transaction
    await pool.query(
      `INSERT INTO wallet_transactions (txn_id, user_id, type, category, amount, balance_after, reference_id, description, status)
       VALUES (?, ?, 'credit', 'wallet_topup', 500.00, 500.00, 'JOINING-BONUS', 'Welcome credit for newly onboarded VLE', 'success')`,
      [`TXN-REG-${Date.now()}`, result.insertId]
    );

    const token = jwt.sign(
      { id: result.insertId, csc_id: newCscId, role: 'user', email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.status(201).json({
      success: true,
      message: 'VLE Operator Registration successful! Welcome to CSC Digital Seva.',
      token,
      user: {
        id: result.insertId,
        csc_id: newCscId,
        name,
        email,
        phone,
        role: 'user',
        center_name: center_name || 'Digital Seva Kendra',
        state: state || 'Delhi',
        district: district || 'Central Delhi',
        wallet_balance: 500.00,
        status: 'active'
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to register VLE. ' + error.message
    });
  }
};

// Get current profile
exports.getProfile = async (req, res) => {
  return res.json({
    success: true,
    user: {
      ...req.user,
      wallet_balance: parseFloat(req.user.wallet_balance)
    }
  });
};

// Update profile
exports.updateProfile = async (req, res) => {
  try {
    const { name, phone, center_name, state, district } = req.body;
    await pool.query(
      `UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone),
       center_name = COALESCE(?, center_name), state = COALESCE(?, state),
       district = COALESCE(?, district) WHERE id = ?`,
      [name, phone, center_name, state, district, req.user.id]
    );

    const [updated] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    return res.json({
      success: true,
      message: 'Profile updated successfully',
      user: updated[0]
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
