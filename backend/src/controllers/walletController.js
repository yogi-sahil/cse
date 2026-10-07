const { pool } = require('../config/db');

// Helper to calculate recharge bonus based on tiers
function calculateBonus(amount) {
  const amt = parseFloat(amount) || 0;
  if (amt < 5000) {
    return { percentage: 0, bonus_amount: 0, total_credit: amt };
  }
  let percentage = 3;
  if (amt >= 50000) {
    percentage = 8;
  } else if (amt >= 25000) {
    percentage = 7;
  } else if (amt >= 20000) {
    percentage = 6;
  } else if (amt >= 15000) {
    percentage = 5;
  } else if (amt >= 10000) {
    percentage = 4;
  } else {
    percentage = 3;
  }
  const bonus_amount = parseFloat(((amt * percentage) / 100).toFixed(2));
  const total_credit = parseFloat((amt + bonus_amount).toFixed(2));
  return { percentage, bonus_amount, total_credit };
}

// Get Wallet Transactions (Role-based: Admin sees all, User sees only own)
exports.getTransactions = async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === 'admin';
    const { type, category, target_user_id } = req.query;

    let query = `
      SELECT t.*, u.name as user_name, u.csc_id, u.email as user_email
      FROM wallet_transactions t
      JOIN users u ON t.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (!isSuperAdmin) {
      query += ' AND t.user_id = ?';
      params.push(req.user.id);
    } else if (target_user_id) {
      query += ' AND t.user_id = ?';
      params.push(target_user_id);
    }

    if (type && type !== 'all') {
      query += ' AND t.type = ?';
      params.push(type);
    }

    if (category && category !== 'all') {
      query += ' AND t.category = ?';
      params.push(category);
    }

    query += ' ORDER BY t.created_at DESC';

    const [transactions] = await pool.query(query, params);

    return res.json({
      success: true,
      count: transactions.length,
      transactions
    });
  } catch (error) {
    console.error('Wallet transactions error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Get current wallet balance
exports.getBalance = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT wallet_balance FROM users WHERE id = ?', [req.user.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.json({
      success: true,
      wallet_balance: parseFloat(rows[0].wallet_balance)
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Calculate bonus preview endpoint (for live UI calculator)
exports.previewBonus = (req, res) => {
  const { amount } = req.query;
  const amt = parseFloat(amount);
  if (isNaN(amt) || amt < 5000) {
    return res.json({
      success: true,
      amount: amt || 0,
      percentage: 0,
      bonus_amount: 0,
      total_credit: amt || 0,
      minimum_required: 5000
    });
  }
  const calc = calculateBonus(amt);
  return res.json({
    success: true,
    amount: amt,
    ...calc,
    minimum_required: 5000
  });
};

// VLE: Request Wallet Recharge (Must be >= ₹5,000; Admin will approve)
exports.requestRecharge = async (req, res) => {
  try {
    const { amount, payment_mode, utr_number, remarks } = req.body;
    const reqAmount = parseFloat(amount);

    if (isNaN(reqAmount) || reqAmount < 5000) {
      return res.status(400).json({
        success: false,
        message: 'Minimum wallet recharge request is ₹5,000 (5K).'
      });
    }

    if (!payment_mode || !payment_mode.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please select a valid payment mode (UPI, IMPS, NEFT, Bank Transfer).'
      });
    }

    if (!utr_number || !utr_number.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Transaction Reference / UTR Number is required for verification.'
      });
    }

    // Check duplicate pending request with same UTR
    const [existing] = await pool.query(
      "SELECT id FROM wallet_recharge_requests WHERE utr_number = ? AND status = 'pending'",
      [utr_number.trim()]
    );
    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'A pending request with this UTR/Reference number already exists.'
      });
    }

    const { bonus_amount, total_credit, percentage } = calculateBonus(reqAmount);
    const requestNo = `REQ-REC-${Date.now()}`;

    const [result] = await pool.query(
      `INSERT INTO wallet_recharge_requests 
         (request_no, user_id, amount, bonus_amount, total_credit, payment_mode, utr_number, remarks, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        requestNo,
        req.user.id,
        reqAmount,
        bonus_amount,
        total_credit,
        payment_mode.trim(),
        utr_number.trim().toUpperCase(),
        remarks ? remarks.trim() : null
      ]
    );

    return res.status(201).json({
      success: true,
      message: `Wallet recharge request of ₹${reqAmount.toLocaleString('en-IN')} (+₹${bonus_amount.toLocaleString('en-IN')} Bonus = ₹${total_credit.toLocaleString('en-IN')}) submitted to Admin!`,
      request: {
        id: result.insertId,
        request_no: requestNo,
        amount: reqAmount,
        bonus_amount,
        total_credit,
        percentage,
        payment_mode: payment_mode.trim(),
        utr_number: utr_number.trim().toUpperCase(),
        status: 'pending',
        created_at: new Date()
      }
    });
  } catch (error) {
    console.error('Recharge request error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Get Recharge Requests (VLE gets own, Admin gets all)
exports.getRechargeRequests = async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === 'admin';
    const { status, search } = req.query;

    let query = `
      SELECT r.*, u.name as user_name, u.csc_id, u.email as user_email, u.phone as user_phone, u.center_name, u.wallet_balance as current_wallet_balance
      FROM wallet_recharge_requests r
      JOIN users u ON r.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (!isSuperAdmin) {
      query += ' AND r.user_id = ?';
      params.push(req.user.id);
    }

    if (status && status !== 'all') {
      query += ' AND r.status = ?';
      params.push(status);
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      query += ' AND (r.request_no LIKE ? OR r.utr_number LIKE ? OR u.name LIKE ? OR u.csc_id LIKE ?)';
      params.push(q, q, q, q);
    }

    query += ' ORDER BY r.created_at DESC';

    const [requests] = await pool.query(query, params);

    // Summary counts
    let summary = {
      total: requests.length,
      pending: requests.filter(r => r.status === 'pending').length,
      approved: requests.filter(r => r.status === 'approved').length,
      rejected: requests.filter(r => r.status === 'rejected').length,
      total_disbursed: requests
        .filter(r => r.status === 'approved')
        .reduce((sum, r) => sum + parseFloat(r.total_credit || 0), 0)
    };

    return res.json({
      success: true,
      count: requests.length,
      summary,
      requests: requests.map(r => ({
        ...r,
        amount: parseFloat(r.amount),
        bonus_amount: parseFloat(r.bonus_amount),
        total_credit: parseFloat(r.total_credit),
        current_wallet_balance: parseFloat(r.current_wallet_balance || 0)
      }))
    });
  } catch (error) {
    console.error('Get recharge requests error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Admin: Approve or Reject Recharge Request
exports.updateRechargeRequestStatus = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const { status, admin_notes } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be approved or rejected.'
      });
    }

    await connection.beginTransaction();

    const [rows] = await connection.query(
      'SELECT * FROM wallet_recharge_requests WHERE id = ? FOR UPDATE',
      [id]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Recharge request not found.' });
    }

    const rechargeReq = rows[0];

    if (rechargeReq.status !== 'pending') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `This request is already ${rechargeReq.status.toUpperCase()}.`
      });
    }

    if (status === 'approved') {
      const creditAmt = parseFloat(rechargeReq.total_credit);

      // Lock target user
      const [userRows] = await connection.query(
        'SELECT wallet_balance FROM users WHERE id = ? FOR UPDATE',
        [rechargeReq.user_id]
      );

      if (userRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: 'Operator user account not found.' });
      }

      const currentBal = parseFloat(userRows[0].wallet_balance);
      const newBal = currentBal + creditAmt;

      // Update wallet balance
      await connection.query('UPDATE users SET wallet_balance = ? WHERE id = ?', [newBal, rechargeReq.user_id]);

      // Record wallet ledger transaction
      const txnId = `TXN-APPV-${Date.now()}`;
      const desc = `Wallet Recharge Approved: Base ₹${parseFloat(rechargeReq.amount).toLocaleString('en-IN')} + Bonus ₹${parseFloat(rechargeReq.bonus_amount).toLocaleString('en-IN')} (UTR: ${rechargeReq.utr_number})`;

      await connection.query(
        `INSERT INTO wallet_transactions (txn_id, user_id, type, category, amount, balance_after, reference_id, description, status)
           VALUES (?, ?, 'credit', 'wallet_topup', ?, ?, ?, ?, 'success')`,
        [txnId, rechargeReq.user_id, creditAmt, newBal, rechargeReq.utr_number, desc]
      );

      // Mark request approved
      await connection.query(
        `UPDATE wallet_recharge_requests 
           SET status = 'approved', admin_notes = ?, processed_by = ?, processed_at = NOW()
           WHERE id = ?`,
        [admin_notes || 'Approved and credited by Super Admin', req.user.id, id]
      );

      await connection.commit();

      return res.json({
        success: true,
        message: `Recharge Request #${rechargeReq.request_no} approved! Credited ₹${creditAmt.toLocaleString('en-IN')} to VLE wallet.`,
        credited_amount: creditAmt,
        new_balance: newBal
      });
    } else {
      // Rejected
      await connection.query(
        `UPDATE wallet_recharge_requests 
           SET status = 'rejected', admin_notes = ?, processed_by = ?, processed_at = NOW()
           WHERE id = ?`,
        [admin_notes || 'Recharge request rejected by Super Admin', req.user.id, id]
      );

      await connection.commit();

      return res.json({
        success: true,
        message: `Recharge Request #${rechargeReq.request_no} rejected.`
      });
    }
  } catch (error) {
    await connection.rollback();
    console.error('Update recharge request status error:', error);
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    connection.release();
  }
};

// Admin: Direct Add/Topup Money (Restricted to Super Admin)
exports.addMoney = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { amount, payment_method, reference, user_id } = req.body;
    const topupAmount = parseFloat(amount);

    if (isNaN(topupAmount) || topupAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Please enter a valid amount.' });
    }

    const targetUserId = (req.user.role === 'admin' && user_id) ? user_id : req.user.id;

    await connection.beginTransaction();

    const [userRows] = await connection.query('SELECT wallet_balance FROM users WHERE id = ? FOR UPDATE', [targetUserId]);
    if (userRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const currentBalance = parseFloat(userRows[0].wallet_balance);
    const newBalance = currentBalance + topupAmount;

    await connection.query('UPDATE users SET wallet_balance = ? WHERE id = ?', [newBalance, targetUserId]);

    const txnId = `TXN-TOPUP-${Date.now()}`;
    const refId = reference || `ADMIN-DIRECT-${Math.floor(100000 + Math.random() * 900000)}`;

    await connection.query(
      `INSERT INTO wallet_transactions (txn_id, user_id, type, category, amount, balance_after, reference_id, description, status)
         VALUES (?, ?, 'credit', 'wallet_topup', ?, ?, ?, ?, 'success')`,
      [
        txnId,
        targetUserId,
        topupAmount,
        newBalance,
        refId,
        `Direct wallet top-up by ${req.user.role === 'admin' ? 'Super Admin' : 'System'} (${payment_method || 'Admin Credit'})`
      ]
    );

    await connection.commit();

    return res.json({
      success: true,
      message: `₹${topupAmount.toFixed(2)} added successfully to wallet!`,
      txnId,
      newBalance
    });
  } catch (error) {
    await connection.rollback();
    console.error('Add money error:', error);
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    connection.release();
  }
};
