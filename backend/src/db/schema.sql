-- CSC Digital Seva Portal - Database Schema
-- Charset: utf8mb4

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  csc_id VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  phone VARCHAR(20),
  password VARCHAR(255) NOT NULL,
  role ENUM('admin', 'user') NOT NULL DEFAULT 'user',
  center_name VARCHAR(255) DEFAULT 'CSC Digital Seva Kendra',
  state VARCHAR(100) DEFAULT 'Delhi',
  district VARCHAR(100) DEFAULT 'Central Delhi',
  status ENUM('active', 'pending', 'suspended') NOT NULL DEFAULT 'active',
  wallet_balance DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_role (role),
  INDEX idx_csc_id (csc_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  service_code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  category VARCHAR(100) NOT NULL,
  department VARCHAR(200),
  fee DECIMAL(10, 2) NOT NULL DEFAULT 50.00,
  vle_commission DECIMAL(10, 2) NOT NULL DEFAULT 10.00,
  description TEXT,
  required_docs TEXT,
  icon VARCHAR(100) DEFAULT 'file-text',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_category (category),
  INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS applications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  application_no VARCHAR(50) NOT NULL UNIQUE,
  user_id INT NOT NULL,
  service_id INT NOT NULL,
  citizen_name VARCHAR(150) NOT NULL,
  citizen_phone VARCHAR(20) NOT NULL,
  citizen_id_number VARCHAR(50),
  service_fee DECIMAL(10, 2) NOT NULL,
  commission_earned DECIMAL(10, 2) NOT NULL,
  status ENUM('Pending', 'In Progress', 'Approved', 'Rejected', 'Completed') NOT NULL DEFAULT 'Pending',
  admin_notes TEXT,
  application_data JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_service_id (service_id),
  INDEX idx_status (status),
  CONSTRAINT fk_app_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_app_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  txn_id VARCHAR(60) NOT NULL UNIQUE,
  user_id INT NOT NULL,
  type ENUM('credit', 'debit') NOT NULL,
  category ENUM('wallet_topup', 'service_fee', 'commission', 'refund', 'adjustment') NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  balance_after DECIMAL(12, 2) NOT NULL,
  reference_id VARCHAR(100),
  description VARCHAR(255) NOT NULL,
  status ENUM('success', 'pending', 'failed') NOT NULL DEFAULT 'success',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_txn_user (user_id),
  INDEX idx_txn_type (type),
  CONSTRAINT fk_txn_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_tickets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_no VARCHAR(50) NOT NULL UNIQUE,
  user_id INT NOT NULL,
  subject VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  status ENUM('open', 'in_progress', 'resolved', 'closed') NOT NULL DEFAULT 'open',
  priority ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
  admin_response TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ticket_user (user_id),
  INDEX idx_ticket_status (status),
  CONSTRAINT fk_ticket_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS wallet_recharge_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_no VARCHAR(50) NOT NULL UNIQUE,
  user_id INT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  bonus_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  total_credit DECIMAL(12, 2) NOT NULL,
  payment_mode VARCHAR(50) NOT NULL,
  utr_number VARCHAR(100) NOT NULL,
  remarks TEXT,
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  processed_by INT NULL,
  processed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_req_user (user_id),
  INDEX idx_req_status (status),
  CONSTRAINT fk_req_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
