const { pool } = require('../config/db');

// Get all active services (or all services for admin)
exports.getAllServices = async (req, res) => {
  try {
    const { category, search } = req.query;
    let query = 'SELECT * FROM services WHERE 1=1';
    const params = [];

    // If not admin, only show active services
    if (!req.user || req.user.role !== 'admin') {
      query += ' AND is_active = 1';
    }

    if (category && category !== 'All') {
      query += ' AND category = ?';
      params.push(category);
    }

    if (search) {
      query += ' AND (name LIKE ? OR service_code LIKE ? OR department LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY id ASC';

    const [services] = await pool.query(query, params);

    return res.json({
      success: true,
      count: services.length,
      services
    });
  } catch (error) {
    console.error('Error fetching services:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Get single service
exports.getServiceById = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM services WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    return res.json({ success: true, service: rows[0] });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Create new service (Admin only)
exports.createService = async (req, res) => {
  try {
    const { service_code, name, category, department, fee, vle_commission, description, required_docs, icon } = req.body;

    if (!service_code || !name || !category) {
      return res.status(400).json({ success: false, message: 'Service code, Name, and Category are required.' });
    }

    const [result] = await pool.query(
      `INSERT INTO services (service_code, name, category, department, fee, vle_commission, description, required_docs, icon, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [service_code, name, category, department, fee || 0, vle_commission || 0, description, required_docs, icon || 'file-text']
    );

    return res.status(201).json({
      success: true,
      message: 'Service added successfully to CSC Portal',
      serviceId: result.insertId
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Update service (Admin only)
exports.updateService = async (req, res) => {
  try {
    const { name, category, department, fee, vle_commission, description, required_docs, is_active } = req.body;
    await pool.query(
      `UPDATE services SET 
       name = COALESCE(?, name),
       category = COALESCE(?, category),
       department = COALESCE(?, department),
       fee = COALESCE(?, fee),
       vle_commission = COALESCE(?, vle_commission),
       description = COALESCE(?, description),
       required_docs = COALESCE(?, required_docs),
       is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [name, category, department, fee, vle_commission, description, required_docs, is_active, req.params.id]
    );

    return res.json({ success: true, message: 'Service details updated' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Delete / Deactivate service (Admin only)
exports.deleteService = async (req, res) => {
  try {
    const { id } = req.params;
    // Check if applications exist for this service
    const [apps] = await pool.query('SELECT id FROM applications WHERE service_id = ? LIMIT 1', [id]);
    if (apps.length > 0) {
      // Soft deactivate so historical applications remain intact
      await pool.query('UPDATE services SET is_active = 0 WHERE id = ?', [id]);
      return res.json({ success: true, message: 'Service has active application records. Deactivated service from catalog.' });
    }
    await pool.query('DELETE FROM services WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Service removed successfully.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

