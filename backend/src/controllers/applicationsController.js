const { pool } = require('../config/db');

// Helper to generate application number
function generateApplicationNo() {
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `CSC-APP-2026-${rand}`;
}

// Get Applications (Role-Based: Super Admin gets all, User gets only their own)
exports.getApplications = async (req, res) => {
  try {
    const { status, search } = req.query;
    const isSuperAdmin = req.user.role === 'admin';

    let query = `
      SELECT a.*, 
             s.name AS service_name, s.service_code, s.category AS service_category,
             u.name AS vle_name, u.csc_id AS vle_csc_id, u.email AS vle_email, u.center_name, u.state AS vle_state
      FROM applications a
      JOIN services s ON a.service_id = s.id
      JOIN users u ON a.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    // Enforce role separation: Users can NEVER see other users' data
    if (!isSuperAdmin) {
      query += ' AND a.user_id = ?';
      params.push(req.user.id);
    }

    if (status && status !== 'All') {
      query += ' AND a.status = ?';
      params.push(status);
    }

    if (search) {
      query += ' AND (a.application_no LIKE ? OR a.citizen_name LIKE ? OR a.citizen_phone LIKE ? OR s.name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY a.created_at DESC';

    const [applications] = await pool.query(query, params);

    return res.json({
      success: true,
      role: req.user.role,
      count: applications.length,
      applications
    });
  } catch (error) {
    console.error('Error fetching applications:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Create Application (VLE Operator)
exports.createApplication = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { service_id, citizen_name, citizen_phone, citizen_id_number, application_data } = req.body;

    if (!service_id || !citizen_name || !citizen_phone) {
      return res.status(400).json({
        success: false,
        message: 'Service, Citizen Name, and Mobile Number are required.'
      });
    }

    await connection.beginTransaction();

    // 1. Fetch Service details
    const [services] = await connection.query('SELECT * FROM services WHERE id = ? AND is_active = 1', [service_id]);
    if (services.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Selected service is inactive or not found.' });
    }
    const service = services[0];
    const fee = parseFloat(service.fee);
    const commission = parseFloat(service.vle_commission);

    // 2. Fetch User's live wallet balance
    const [userRows] = await connection.query('SELECT wallet_balance FROM users WHERE id = ? FOR UPDATE', [req.user.id]);
    const currentBalance = parseFloat(userRows[0].wallet_balance);

    if (fee > 0 && currentBalance < fee) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Insufficient wallet balance. Service requires ₹${fee.toFixed(2)}, your balance is ₹${currentBalance.toFixed(2)}. Please recharge your wallet.`
      });
    }

    // 3. Calculate new balance: Deduct fee, add instant commission
    const netDeduction = fee - commission;
    const finalBalance = currentBalance - netDeduction;

    // Update user's wallet
    await connection.query('UPDATE users SET wallet_balance = ? WHERE id = ?', [finalBalance, req.user.id]);

    // 4. Generate Application record
    const applicationNo = generateApplicationNo();
    const [appResult] = await connection.query(
      `INSERT INTO applications (application_no, user_id, service_id, citizen_name, citizen_phone, citizen_id_number, service_fee, commission_earned, status, admin_notes, application_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 'Application received and submitted to department queue', ?)`,
      [
        applicationNo,
        req.user.id,
        service.id,
        citizen_name.trim(),
        citizen_phone.trim(),
        citizen_id_number ? citizen_id_number.trim() : null,
        fee,
        commission,
        application_data ? JSON.stringify(application_data) : null
      ]
    );

    // 5. Record wallet ledger transactions
    if (fee > 0) {
      const balanceAfterDebit = currentBalance - fee;
      await connection.query(
        `INSERT INTO wallet_transactions (txn_id, user_id, type, category, amount, balance_after, reference_id, description, status)
         VALUES (?, ?, 'debit', 'service_fee', ?, ?, ?, ?, 'success')`,
        [`TXN-DEB-${Date.now()}`, req.user.id, fee, balanceAfterDebit, applicationNo, `Govt Fee for ${service.name}`]
      );

      if (commission > 0) {
        await connection.query(
          `INSERT INTO wallet_transactions (txn_id, user_id, type, category, amount, balance_after, reference_id, description, status)
           VALUES (?, ?, 'credit', 'commission', ?, ?, ?, ?, 'success')`,
          [`TXN-COM-${Date.now()}`, req.user.id, commission, finalBalance, applicationNo, `VLE Commission credited for ${service.name}`]
        );
      }
    }

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: `Application ${applicationNo} submitted successfully!`,
      applicationNo,
      applicationId: appResult.insertId,
      newWalletBalance: finalBalance
    });
  } catch (error) {
    await connection.rollback();
    console.error('Application creation error:', error);
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    connection.release();
  }
};

// Update Application Status (Super Admin Only)
exports.updateApplicationStatus = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { status, admin_notes, refund } = req.body;
    const { id } = req.params;

    if (!['Pending', 'In Progress', 'Approved', 'Rejected', 'Completed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value.' });
    }

    await connection.beginTransaction();

    const [apps] = await connection.query('SELECT * FROM applications WHERE id = ?', [id]);
    if (apps.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Application not found.' });
    }
    const app = apps[0];

    // If Rejected with refund requested
    if (status === 'Rejected' && refund && app.service_fee > 0) {
      const [u] = await connection.query('SELECT wallet_balance FROM users WHERE id = ? FOR UPDATE', [app.user_id]);
      const newBal = parseFloat(u[0].wallet_balance) + (parseFloat(app.service_fee) - parseFloat(app.commission_earned));
      await connection.query('UPDATE users SET wallet_balance = ? WHERE id = ?', [newBal, app.user_id]);
      await connection.query(
        `INSERT INTO wallet_transactions (txn_id, user_id, type, category, amount, balance_after, reference_id, description, status)
         VALUES (?, ?, 'credit', 'refund', ?, ?, ?, 'Service Application Rejection Refund', 'success')`,
        [`TXN-REF-${Date.now()}`, app.user_id, app.service_fee - app.commission_earned, newBal, app.application_no]
      );
    }

    await connection.query(
      'UPDATE applications SET status = ?, admin_notes = COALESCE(?, admin_notes) WHERE id = ?',
      [status, admin_notes, id]
    );

    await connection.commit();

    return res.json({
      success: true,
      message: `Application ${app.application_no} status updated to ${status}.`
    });
  } catch (error) {
    await connection.rollback();
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    connection.release();
  }
};
