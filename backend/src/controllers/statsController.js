const { pool } = require('../config/db');

exports.getDashboardStats = async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === 'admin';

    if (isSuperAdmin) {
      // 1. SUPER ADMIN STATS (Aggregated across the whole CSC platform)
      const [[{ total_vles }]] = await pool.query("SELECT COUNT(*) AS total_vles FROM users WHERE role = 'user'");
      const [[{ active_vles }]] = await pool.query("SELECT COUNT(*) AS active_vles FROM users WHERE role = 'user' AND status = 'active'");
      const [[{ total_apps }]] = await pool.query("SELECT COUNT(*) AS total_apps FROM applications");
      const [[{ pending_apps }]] = await pool.query("SELECT COUNT(*) AS pending_apps FROM applications WHERE status = 'Pending'");
      const [[{ approved_apps }]] = await pool.query("SELECT COUNT(*) AS approved_apps FROM applications WHERE status IN ('Approved', 'Completed')");
      const [[{ total_wallet_balance }]] = await pool.query("SELECT COALESCE(SUM(wallet_balance), 0) AS total_wallet_balance FROM users WHERE role = 'user'");
      const [[{ total_commissions }]] = await pool.query("SELECT COALESCE(SUM(commission_earned), 0) AS total_commissions FROM applications");
      const [[{ total_services }]] = await pool.query("SELECT COUNT(*) AS total_services FROM services WHERE is_active = 1");
      const [[{ open_tickets }]] = await pool.query("SELECT COUNT(*) AS open_tickets FROM support_tickets WHERE status = 'open'");

      // Service Category distribution
      const [categoryBreakdown] = await pool.query(`
        SELECT s.category, COUNT(a.id) as app_count, COALESCE(SUM(a.service_fee), 0) as total_volume
        FROM services s
        LEFT JOIN applications a ON s.id = a.service_id
        GROUP BY s.category
      `);

      return res.json({
        success: true,
        role: 'admin',
        stats: {
          total_vles: parseInt(total_vles, 10),
          active_vles: parseInt(active_vles, 10),
          total_applications: parseInt(total_apps, 10),
          pending_applications: parseInt(pending_apps, 10),
          approved_applications: parseInt(approved_apps, 10),
          total_network_wallet: parseFloat(total_wallet_balance),
          total_commission_disbursed: parseFloat(total_commissions),
          active_services_count: parseInt(total_services, 10),
          open_tickets_count: parseInt(open_tickets, 10)
        },
        category_breakdown: categoryBreakdown
      });
    } else {
      // 2. USER / VLE OPERATOR STATS (Strictly only their own metrics)
      const userId = req.user.id;
      const [[{ current_balance }]] = await pool.query('SELECT wallet_balance FROM users WHERE id = ?', [userId]);
      const [[{ total_apps }]] = await pool.query('SELECT COUNT(*) AS total_apps FROM applications WHERE user_id = ?', [userId]);
      const [[{ pending_apps }]] = await pool.query("SELECT COUNT(*) AS pending_apps FROM applications WHERE user_id = ? AND status = 'Pending'", [userId]);
      const [[{ completed_apps }]] = await pool.query("SELECT COUNT(*) AS completed_apps FROM applications WHERE user_id = ? AND status IN ('Approved', 'Completed')", [userId]);
      const [[{ total_commissions }]] = await pool.query('SELECT COALESCE(SUM(commission_earned), 0) AS total_commissions FROM applications WHERE user_id = ?', [userId]);
      const [[{ total_spent }]] = await pool.query("SELECT COALESCE(SUM(amount), 0) AS total_spent FROM wallet_transactions WHERE user_id = ? AND type = 'debit'", [userId]);

      // VLE's top used services
      const [topServices] = await pool.query(`
        SELECT s.name, COUNT(a.id) as count, SUM(a.commission_earned) as earnings
        FROM applications a
        JOIN services s ON a.service_id = s.id
        WHERE a.user_id = ?
        GROUP BY s.id
        ORDER BY count DESC
        LIMIT 5
      `, [userId]);

      return res.json({
        success: true,
        role: 'user',
        stats: {
          wallet_balance: parseFloat(current_balance),
          total_applications: parseInt(total_apps, 10),
          pending_applications: parseInt(pending_apps, 10),
          completed_applications: parseInt(completed_apps, 10),
          total_commission_earned: parseFloat(total_commissions),
          total_spent: parseFloat(total_spent)
        },
        top_services: topServices
      });
    }
  } catch (error) {
    console.error('Stats error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
