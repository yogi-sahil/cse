const { pool } = require('../config/db');

// Helper to dynamically calculate recharge bonus based on DB packages
async function calculateBonus(amount) {
  const amt = parseFloat(amount) || 0;
  if (amt < 5000) {
    return { percentage: 0, bonus_amount: 0, total_credit: amt };
  }

  try {
    const [packages] = await pool.query(
      'SELECT amount, bonus_percentage FROM recharge_packages WHERE is_active = 1 ORDER BY amount DESC'
    );

    let percentage = 5; // default baseline minimum bonus
    if (packages && packages.length > 0) {
      const matched = packages.find(p => amt >= parseFloat(p.amount));
      if (matched) {
        percentage = parseFloat(matched.bonus_percentage);
      } else {
        percentage = parseFloat(packages[packages.length - 1].bonus_percentage);
      }
    }

    const bonus_amount = parseFloat(((amt * percentage) / 100).toFixed(2));
    const total_credit = parseFloat((amt + bonus_amount).toFixed(2));
    return { percentage, bonus_amount, total_credit };
  } catch (err) {
    console.error('Dynamic bonus calculation error:', err);
    let fallbackPct = 5;
    if (amt >= 50000) fallbackPct = 16;
    else if (amt >= 25000) fallbackPct = 13;
    else if (amt >= 20000) fallbackPct = 11;
    else if (amt >= 15000) fallbackPct = 9;
    else if (amt >= 10000) fallbackPct = 7;
    const bonus_amount = parseFloat(((amt * fallbackPct) / 100).toFixed(2));
    const total_credit = parseFloat((amt + bonus_amount).toFixed(2));
    return { percentage: fallbackPct, bonus_amount, total_credit };
  }
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
exports.previewBonus = async (req, res) => {
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
  const calc = await calculateBonus(amt);
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

    const { bonus_amount, total_credit, percentage } = await calculateBonus(reqAmount);
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


// ==========================================================================
// Recharge Packages & Bonus Rates Management (Super Admin & VLE)
// ==========================================================================

// Get all recharge packages (Active for VLE, All for Admin)
exports.getPackages = async (req, res) => {
  try {
    const isSuperAdmin = req.user && req.user.role === 'admin';
    let query = 'SELECT * FROM recharge_packages';
    if (!isSuperAdmin) {
      query += ' WHERE is_active = 1';
    }
    query += ' ORDER BY sort_order ASC, amount ASC';

    const [packages] = await pool.query(query);

    return res.json({
      success: true,
      packages: packages.map(p => {
        const amt = parseFloat(p.amount);
        const pct = parseFloat(p.bonus_percentage);
        const bonus = parseFloat(((amt * pct) / 100).toFixed(2));
        const total = parseFloat((amt + bonus).toFixed(2));
        return {
          ...p,
          amount: amt,
          bonus_percentage: pct,
          bonus_amount: bonus,
          total_credit: total,
          is_popular: Boolean(p.is_popular),
          is_active: Boolean(p.is_active)
        };
      })
    });
  } catch (error) {
    console.error('Error fetching recharge packages:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Admin: Create new recharge package
exports.createPackage = async (req, res) => {
  try {
    const { amount, bonus_percentage, tag, badge_style, is_popular, is_active, sort_order } = req.body;
    const numAmount = parseFloat(amount);
    const numBonus = parseFloat(bonus_percentage);

    if (isNaN(numAmount) || numAmount < 1000) {
      return res.status(400).json({ success: false, message: 'Valid package amount is required (min ₹1,000).' });
    }
    if (isNaN(numBonus) || numBonus < 0) {
      return res.status(400).json({ success: false, message: 'Valid bonus percentage (>= 0%) is required.' });
    }

    const [result] = await pool.query(
      `INSERT INTO recharge_packages (amount, bonus_percentage, tag, badge_style, is_popular, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        numAmount,
        numBonus,
        tag ? tag.trim() : null,
        badge_style || 'default',
        is_popular ? 1 : 0,
        is_active !== undefined ? (is_active ? 1 : 0) : 1,
        parseInt(sort_order, 10) || 0
      ]
    );

    return res.status(201).json({
      success: true,
      message: `Recharge package for ₹${numAmount.toLocaleString('en-IN')} with ${numBonus}% bonus created successfully!`,
      packageId: result.insertId
    });
  } catch (error) {
    console.error('Error creating recharge package:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Admin: Update existing recharge package
exports.updatePackage = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, bonus_percentage, tag, badge_style, is_popular, is_active, sort_order } = req.body;

    const [existing] = await pool.query('SELECT id FROM recharge_packages WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Recharge package not found.' });
    }

    const numAmount = parseFloat(amount);
    const numBonus = parseFloat(bonus_percentage);

    if (isNaN(numAmount) || numAmount < 1000) {
      return res.status(400).json({ success: false, message: 'Valid package amount is required.' });
    }
    if (isNaN(numBonus) || numBonus < 0) {
      return res.status(400).json({ success: false, message: 'Valid bonus percentage is required.' });
    }

    await pool.query(
      `UPDATE recharge_packages 
       SET amount = ?, bonus_percentage = ?, tag = ?, badge_style = ?, is_popular = ?, is_active = ?, sort_order = ?
       WHERE id = ?`,
      [
        numAmount,
        numBonus,
        tag ? tag.trim() : null,
        badge_style || 'default',
        is_popular ? 1 : 0,
        is_active ? 1 : 0,
        parseInt(sort_order, 10) || 0,
        id
      ]
    );

    return res.json({
      success: true,
      message: 'Recharge package and bonus rate updated successfully!'
    });
  } catch (error) {
    console.error('Error updating recharge package:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Admin: Delete recharge package
exports.deletePackage = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM recharge_packages WHERE id = ?', [id]);
    return res.json({
      success: true,
      message: 'Recharge package deleted successfully!'
    });
  } catch (error) {
    console.error('Error deleting package:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================================================
// CSC Central Settlement Account Settings (Admin Can Update Payment Details)
// ==========================================================================

// Get current settlement account details
exports.getSettlementAccount = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM settlement_settings ORDER BY id ASC LIMIT 1');
    if (rows.length === 0) {
      return res.json({
        success: true,
        settlement: {
          account_holder: 'CSC e-Governance Services India Limited',
          bank_name: 'State Bank of India (SBI)',
          account_number: '392810482910',
          ifsc_code: 'SBIN0001234',
          branch_name: 'Parliament Street HQ, New Delhi',
          upi_id: 'csc.spv.settle@sbi',
          qr_code_url: '',
          instructions: 'Transfer funds using your mobile banking or UPI app, then submit the 12-digit UTR or Reference Number below for Admin verification.'
        }
      });
    }
    return res.json({
      success: true,
      settlement: rows[0]
    });
  } catch (error) {
    console.error('Error fetching settlement account:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Admin: Update CSC Central Settlement Account Details
exports.updateSettlementAccount = async (req, res) => {
  try {
    const { account_holder, bank_name, account_number, ifsc_code, branch_name, upi_id, qr_code_url, instructions } = req.body;

    if (!bank_name || !account_number || !ifsc_code || !upi_id) {
      return res.status(400).json({
        success: false,
        message: 'Bank Name, Account Number, IFSC Code, and UPI ID are required.'
      });
    }

    const [existing] = await pool.query('SELECT id FROM settlement_settings LIMIT 1');
    if (existing.length === 0) {
      await pool.query(
        `INSERT INTO settlement_settings 
         (account_holder, bank_name, account_number, ifsc_code, branch_name, upi_id, qr_code_url, instructions, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          account_holder || 'CSC e-Governance Services India Limited',
          bank_name.trim(),
          account_number.trim(),
          ifsc_code.trim().toUpperCase(),
          branch_name ? branch_name.trim() : null,
          upi_id.trim().toLowerCase(),
          qr_code_url ? qr_code_url.trim() : null,
          instructions ? instructions.trim() : null,
          req.user.id
        ]
      );
    } else {
      await pool.query(
        `UPDATE settlement_settings 
         SET account_holder = ?, bank_name = ?, account_number = ?, ifsc_code = ?, branch_name = ?, upi_id = ?, qr_code_url = ?, instructions = ?, updated_by = ?
         WHERE id = ?`,
        [
          account_holder || 'CSC e-Governance Services India Limited',
          bank_name.trim(),
          account_number.trim(),
          ifsc_code.trim().toUpperCase(),
          branch_name ? branch_name.trim() : null,
          upi_id.trim().toLowerCase(),
          qr_code_url ? qr_code_url.trim() : null,
          instructions ? instructions.trim() : null,
          req.user.id,
          existing[0].id
        ]
      );
    }

    const [updated] = await pool.query('SELECT * FROM settlement_settings ORDER BY id ASC LIMIT 1');
    return res.json({
      success: true,
      message: 'CSC Central Settlement Account Details updated successfully! VLEs will now transfer payments to these updated details.',
      settlement: updated[0]
    });
  } catch (error) {
    console.error('Error updating settlement account:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
