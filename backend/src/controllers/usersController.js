const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

// Helper to generate unique CSC ID
function generateCscId() {
  const num = Math.floor(1000000 + Math.random() * 9000000);
  return `CSC${num}`;
}

// List all users / VLE operators (Admin Only)
exports.getAllUsers = async (req, res) => {
  try {
    const { role, status, search, state } = req.query;

    let query = `
      SELECT u.id, u.csc_id, u.name, u.email, u.phone, u.role, u.center_name, 
             u.state, u.district, u.status, u.wallet_balance, u.created_at,
             COUNT(a.id) AS total_applications
      FROM users u
      LEFT JOIN applications a ON u.id = a.user_id
      WHERE 1=1
    `;
    const params = [];

    if (role && role !== 'all') {
      query += ' AND u.role = ?';
      params.push(role);
    }

    if (status && status !== 'all') {
      query += ' AND u.status = ?';
      params.push(status);
    }

    if (state && state !== 'all') {
      query += ' AND u.state = ?';
      params.push(state);
    }

    if (search) {
      query += ' AND (u.csc_id LIKE ? OR u.name LIKE ? OR u.email LIKE ? OR u.center_name LIKE ? OR u.phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' GROUP BY u.id ORDER BY u.created_at DESC';

    const [users] = await pool.query(query, params);

    return res.json({
      success: true,
      count: users.length,
      users: users.map(u => ({
        ...u,
        wallet_balance: parseFloat(u.wallet_balance)
      }))
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Create New User / VLE (Super Admin Only)
exports.createUser = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const {
      csc_id,
      name,
      email,
      phone,
      password,
      role = 'user',
      center_name = 'Digital Seva Kendra',
      state = 'Delhi',
      district = 'Central Delhi',
      initial_wallet_balance = 500.00,
      status = 'active'
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, Email, and Password are required fields.'
      });
    }

    // Check if email already exists
    const [existingEmail] = await connection.query('SELECT id FROM users WHERE email = ?', [email.trim()]);
    if (existingEmail.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'A user with this email address already exists.'
      });
    }

    // Determine CSC ID
    let finalCscId = (csc_id && csc_id.trim().length > 0) ? csc_id.trim().toUpperCase() : generateCscId();

    // Verify CSC ID uniqueness
    const [existingCsc] = await connection.query('SELECT id FROM users WHERE csc_id = ?', [finalCscId]);
    if (existingCsc.length > 0) {
      if (csc_id) {
        return res.status(400).json({
          success: false,
          message: `CSC ID '${finalCscId}' already exists. Please choose a different unique ID.`
        });
      }
      finalCscId = generateCscId() + 'A';
    }

    await connection.beginTransaction();

    const hashedPassword = await bcrypt.hash(password, 10);
    const initialBal = parseFloat(initial_wallet_balance) || 0.00;

    const [result] = await connection.query(
      `INSERT INTO users (csc_id, name, email, phone, password, role, center_name, state, district, status, wallet_balance)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        finalCscId,
        name.trim(),
        email.trim(),
        phone ? phone.trim() : null,
        hashedPassword,
        role === 'admin' ? 'admin' : 'user',
        center_name.trim(),
        state.trim(),
        district.trim(),
        status,
        initialBal
      ]
    );

    // If initial wallet balance is provided, record audit ledger transaction
    if (initialBal > 0) {
      const txnId = `TXN-INIT-${Date.now()}`;
      await connection.query(
        `INSERT INTO wallet_transactions (txn_id, user_id, type, category, amount, balance_after, reference_id, description, status)
         VALUES (?, ?, 'credit', 'wallet_topup', ?, ?, 'ADMIN-ONBOARD', 'Initial allocated balance by Super Admin', 'success')`,
        [txnId, result.insertId, initialBal, initialBal]
      );
    }

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: `User created successfully with Unique CSC ID: ${finalCscId}`,
      user: {
        id: result.insertId,
        csc_id: finalCscId,
        name: name.trim(),
        email: email.trim(),
        phone: phone ? phone.trim() : null,
        role: role === 'admin' ? 'admin' : 'user',
        center_name: center_name.trim(),
        state: state.trim(),
        district: district.trim(),
        status,
        wallet_balance: initialBal
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating user:', error);
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    connection.release();
  }
};

// Update user status (Admin Only)
exports.updateUserStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const { id } = req.params;

    if (!['active', 'pending', 'suspended'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status provided.' });
    }

    await pool.query('UPDATE users SET status = ? WHERE id = ?', [status, id]);

    return res.json({
      success: true,
      message: `User status successfully updated to ${status}.`
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Admin Adjust User Wallet (Credit, Debit, or Direct Edit/Set Balance)
exports.adjustUserWallet = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const { type, amount, reason } = req.body;
    const adjustAmount = parseFloat(amount);

    if (isNaN(adjustAmount) || (type !== 'set' && adjustAmount <= 0) || (type === 'set' && adjustAmount < 0)) {
      return res.status(400).json({ success: false, message: 'Please specify a valid numeric amount (≥ 0).' });
    }

    if (!['credit', 'debit', 'set'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Type must be credit, debit, or set (edit balance).' });
    }

    await connection.beginTransaction();

    const [userRows] = await connection.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [id]);
    if (userRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Target VLE user not found.' });
    }

    const targetUser = userRows[0];
    const oldBalance = parseFloat(targetUser.wallet_balance);
    let newBalance = oldBalance;
    let txnType = 'credit';
    let txnAmount = adjustAmount;

    if (type === 'credit') {
      newBalance = oldBalance + adjustAmount;
      txnType = 'credit';
      txnAmount = adjustAmount;
    } else if (type === 'debit') {
      newBalance = oldBalance - adjustAmount;
      txnType = 'debit';
      txnAmount = adjustAmount;
    } else if (type === 'set') {
      newBalance = adjustAmount;
      const diff = newBalance - oldBalance;
      txnType = diff >= 0 ? 'credit' : 'debit';
      txnAmount = Math.abs(diff);
    }

    if (newBalance < 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Cannot debit or set balance below zero.' });
    }

    await connection.query('UPDATE users SET wallet_balance = ? WHERE id = ?', [newBalance, id]);

    const txnId = `TXN-ADJ-${Date.now()}`;
    const actionDesc = type === 'set' 
      ? (reason || `Direct balance edit by Super Admin (Set to ₹${newBalance.toFixed(2)})`)
      : (reason || `Super Admin manual balance ${type.toUpperCase()}`);

    await connection.query(
      `INSERT INTO wallet_transactions (txn_id, user_id, type, category, amount, balance_after, reference_id, description, status)
       VALUES (?, ?, ?, 'adjustment', ?, ?, 'ADMIN-ACTION', ?, 'success')`,
      [txnId, id, txnType, txnAmount, newBalance, actionDesc]
    );

    await connection.commit();

    return res.json({
      success: true,
      message: type === 'set' 
        ? `VLE wallet balance directly updated to ₹${newBalance.toFixed(2)}`
        : `Successfully adjusted VLE wallet: ${type.toUpperCase()} ₹${adjustAmount.toFixed(2)}. New balance: ₹${newBalance.toFixed(2)}`,
      newBalance
    });
  } catch (error) {
    await connection.rollback();
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    connection.release();
  }
};

// Delete User (Admin Only)
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own Super Admin account.' });
    }

    await pool.query('DELETE FROM users WHERE id = ?', [id]);
    return res.json({ success: true, message: 'User account deleted successfully.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
