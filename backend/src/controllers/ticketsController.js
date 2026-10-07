const { pool } = require('../config/db');

// Helper to generate ticket ID
function generateTicketNo() {
  return `TCK-${Date.now().toString().slice(-6)}`;
}

// Get support tickets (Role-based: Admin gets all, User gets own)
exports.getTickets = async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === 'admin';
    const { status, category } = req.query;

    let query = `
      SELECT t.*, u.name AS user_name, u.csc_id, u.email AS user_email, u.phone AS user_phone
      FROM support_tickets t
      JOIN users u ON t.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (!isSuperAdmin) {
      query += ' AND t.user_id = ?';
      params.push(req.user.id);
    }

    if (status && status !== 'all') {
      query += ' AND t.status = ?';
      params.push(status);
    }

    if (category && category !== 'all') {
      query += ' AND t.category = ?';
      params.push(category);
    }

    query += ' ORDER BY t.created_at DESC';

    const [tickets] = await pool.query(query, params);

    return res.json({
      success: true,
      count: tickets.length,
      tickets
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Create new support ticket (User)
exports.createTicket = async (req, res) => {
  try {
    const { subject, category, message, priority } = req.body;

    if (!subject || !message || !category) {
      return res.status(400).json({ success: false, message: 'Subject, Category, and Message are required.' });
    }

    const ticketNo = generateTicketNo();
    await pool.query(
      `INSERT INTO support_tickets (ticket_no, user_id, subject, category, message, status, priority)
       VALUES (?, ?, ?, ?, ?, 'open', ?)`,
      [ticketNo, req.user.id, subject, category, message, priority || 'medium']
    );

    return res.status(201).json({
      success: true,
      message: `Support ticket ${ticketNo} created successfully.`,
      ticketNo
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Respond / Update Ticket (Admin)
exports.updateTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, admin_response } = req.body;

    await pool.query(
      `UPDATE support_tickets SET 
       status = COALESCE(?, status),
       admin_response = COALESCE(?, admin_response)
       WHERE id = ?`,
      [status, admin_response, id]
    );

    return res.json({ success: true, message: 'Ticket updated successfully.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
