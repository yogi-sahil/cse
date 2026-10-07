const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DB_PORT, 10) || 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'digital_seva_csc';

async function initDatabase() {
  console.log('🔄 Initializing CSC Digital Seva MySQL Database...');

  let serverConn;
  try {
    // 1. Connect to MySQL Server (no DB selected)
    serverConn = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD
    });

    console.log(` Connected to MySQL server at ${DB_HOST}:${DB_PORT}`);

    // 2. Create database if it does not exist
    await serverConn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    console.log(` Database '${DB_NAME}' ensured.`);
  } catch (err) {
    console.error(' Error connecting to MySQL server:', err.message);
    throw err;
  } finally {
    if (serverConn) await serverConn.end();
  }

  // 3. Connect to the specific database
  const db = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    multipleStatements: true
  });

  try {
    // 4. Read schema.sql and execute
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await db.query(schemaSql);
    console.log(' Database tables verified & created.');

    // 5. Seed Official CSC Digital Seva Services
    const officialServices = [
      {
        service_code: 'CSC-FIN-001',
        name: 'DigiPay - AEPS (Cash Withdrawal & Balance Enquiry)',
        category: 'Financial & Banking',
        department: 'National Payments Corporation of India (NPCI)',
        fee: 0.00,
        vle_commission: 15.00,
        description: 'Aadhaar biometric cash withdrawal, balance check, and mini-statement across partner banks: State Bank of India (SBI), Bank of Baroda (BOB), Punjab National Bank (PNB), HDFC Bank, ICICI Bank, Union Bank, Canara Bank.',
        required_docs: 'Aadhaar Number, Bank Name, Biometric Fingerprint / Iris',
        icon: 'dollar-sign'
      },
      {
        service_code: 'CSC-FIN-002',
        name: 'Bank Account Opening (Instant Savings & Current)',
        category: 'Financial & Banking',
        department: 'Indian Banks Association (IBA) & CSC CSP',
        fee: 0.00,
        vle_commission: 50.00,
        description: 'Instant digital zero-balance savings & current bank account opening with instant debit card. Partner Banks: State Bank of India (SBI), Bank of Baroda (BOB), Punjab National Bank (PNB), HDFC Bank, ICICI Bank, Axis Bank, Airtel Payments Bank.',
        required_docs: 'Aadhaar Card, PAN Card, Mobile Linked with Aadhaar, Nominee Details',
        icon: 'credit-card'
      },
      {
        service_code: 'CSC-UTL-001',
        name: 'Mobile Recharge (Prepaid & Postpaid)',
        category: 'Bill Payments & BBPS',
        department: 'Telecom Regulatory Authority of India (TRAI)',
        fee: 0.00,
        vle_commission: 3.50,
        description: 'Instant 24x7 prepaid plan recharge, unlimited voice packs, 4G/5G data add-ons, and postpaid bill payment for Reliance Jio, Bharti Airtel, Vodafone Idea (Vi), and BSNL.',
        required_docs: 'Mobile Number, Operator / Telecom Circle, Plan Selection',
        icon: 'zap'
      },
      {
        service_code: 'CSC-UTL-002',
        name: 'DTH Recharge (All Satellite TV Providers)',
        category: 'Bill Payments & BBPS',
        department: 'Direct-To-Home Broadcasting Network',
        fee: 0.00,
        vle_commission: 3.00,
        description: 'Instant DTH subscription renewals, monthly channel pack activation, and HD balance top-ups for Tata Play, Airtel Digital TV, Dish TV, Sun Direct, and Videocon D2H.',
        required_docs: 'Subscriber ID / VC Number, DTH Operator, Recharge Amount',
        icon: 'zap'
      },
      {
        service_code: 'CSC-BBPS-001',
        name: 'Electricity & Utility Bill Payment (BBPS)',
        category: 'Bill Payments & BBPS',
        department: 'Bharat Bill Payment System (NPCI)',
        fee: 0.00,
        vle_commission: 5.00,
        description: 'Real-time electricity, water, piped gas, and broadband bill fetch and payment for all state electricity discoms across India with authorized BBPS receipt.',
        required_docs: 'Consumer / CA Number, State Discom / Utility Provider Selection',
        icon: 'zap'
      },
      {
        service_code: 'CSC-UID-001',
        name: 'Aadhaar Seva Kendra (e-KYC, Address Update & PVC Card)',
        category: 'G2C Central',
        department: 'Unique Identification Authority of India (UIDAI)',
        fee: 50.00,
        vle_commission: 20.00,
        description: 'Aadhaar demographic update, official address correction, Aadhaar PVC smart card ordering, and biometric eKYC verification for government welfare schemes.',
        required_docs: 'Aadhaar Number, Proof of Identity (POI), Proof of Address (POA), Mobile OTP',
        icon: 'fingerprint'
      },
      {
        service_code: 'CSC-G2C-003',
        name: 'PAN Card Application (UTI / NSDL)',
        category: 'Financial & Banking',
        department: 'Income Tax Department (Protean / UTIITSL)',
        fee: 107.00,
        vle_commission: 18.00,
        description: 'Instant biometric e-PAN generation in 2 hours, new physical PAN Card (Form 49A), reprint lost PAN, and name/DOB correction with instant acknowledgement.',
        required_docs: 'Aadhaar Card, Proof of Date of Birth, Passport Size Photograph',
        icon: 'credit-card'
      },
      {
        service_code: 'CSC-FIN-003',
        name: 'Domestic Money Transfer (DMT 24x7 IMPS)',
        category: 'Financial & Banking',
        department: 'Reserve Bank of India (RBI) / IMPS',
        fee: 10.00,
        vle_commission: 6.00,
        description: 'Direct bank transfer to any bank account in India 24x7 via IMPS / NEFT. Instant SMS confirmation to remitter and receiver with 100% bank settlement guarantee.',
        required_docs: 'Remitter Mobile Number, Beneficiary Account Number, IFSC Code, Account Holder Name',
        icon: 'dollar-sign'
      },
      {
        service_code: 'CSC-BBPS-002',
        name: 'FASTag Issuance & Instant Toll Recharge',
        category: 'Travel & Transport',
        department: 'National Electronic Toll Collection (NETC / NHAI)',
        fee: 100.00,
        vle_commission: 25.00,
        description: 'Commercial and private vehicle FASTag issuance, RFID barcode activation, and instant toll balance recharge across SBI, ICICI, Bank of Baroda, and IDFC First Bank.',
        required_docs: 'Vehicle RC Book Copy, Aadhaar Card, Mobile Number',
        icon: 'truck'
      },
      {
        service_code: 'CSC-FIN-004',
        name: 'Micro ATM (mATM Debit Card Cash Out)',
        category: 'Financial & Banking',
        department: 'National Payments Corporation of India (NPCI)',
        fee: 0.00,
        vle_commission: 12.00,
        description: 'Portable Bluetooth Micro-ATM debit card cash withdrawal and PIN-based balance enquiry supporting RuPay, Visa, and MasterCard of all Indian banks.',
        required_docs: 'Active Debit / ATM Card, 4-Digit Security PIN',
        icon: 'credit-card'
      },
      {
        service_code: 'CSC-G2C-001',
        name: 'PM-KISAN Samman Nidhi Yojana',
        category: 'G2C Central',
        department: 'Ministry of Agriculture & Farmers Welfare',
        fee: 15.00,
        vle_commission: 15.00,
        description: 'Farmer welfare registration, biometric Aadhaar eKYC, land record / Khatauni linking, and quarterly installment ₹2,000 status verification.',
        required_docs: 'Aadhaar Card, Land Record / Khatauni, Bank Passbook, Mobile Number',
        icon: 'agriculture'
      },
      {
        service_code: 'CSC-G2C-002',
        name: 'Ayushman Bharat - PMJAY Golden Card',
        category: 'Health & Insurance',
        department: 'National Health Authority (NHA)',
        fee: 30.00,
        vle_commission: 15.00,
        description: 'Free ₹5 Lakh annual cashless hospitalization card enrollment, beneficiary family verification, and high-quality waterproof PVC print.',
        required_docs: 'Ration Card / PM Letter, Aadhaar Card, Active Mobile OTP',
        icon: 'health'
      },
      {
        service_code: 'CSC-G2C-004',
        name: 'PM Vishwakarma Yojana Registration',
        category: 'G2C Central',
        department: 'Ministry of Micro, Small & Medium Enterprises',
        fee: 0.00,
        vle_commission: 30.00,
        description: 'Free onboarding, verification and toolkit credit scheme for 18 traditional artisans and craftspeople with ₹15,000 toolkit grant and 5% subsidized credit.',
        required_docs: 'Aadhaar Card, Mobile Linked with Aadhaar, Bank Details, Trade Details',
        icon: 'hammer'
      },
      {
        service_code: 'CSC-G2C-005',
        name: 'e-Shram National Worker Card',
        category: 'G2C Central',
        department: 'Ministry of Labour & Employment',
        fee: 0.00,
        vle_commission: 20.00,
        description: 'National database registration for unorganized workers, construction labor, street vendors, and gig workers with ₹2 Lakh accidental insurance cover.',
        required_docs: 'Aadhaar Card, Bank Account Details, Mobile Number',
        icon: 'briefcase'
      },
      {
        service_code: 'CSC-G2C-008',
        name: 'Voter ID Card Online Services (ECI / NVSP)',
        category: 'G2C Central',
        department: 'Election Commission of India (ECI)',
        fee: 25.00,
        vle_commission: 10.00,
        description: 'New voter enrollment (Form 6), address or name correction (Form 8), assembly constituency shifting, and instant digital e-EPIC card download.',
        required_docs: 'Passport Photograph, Proof of Age, Proof of Address',
        icon: 'globe'
      }
    ];

    for (const s of officialServices) {
      await db.query(
        `INSERT INTO services (service_code, name, category, department, fee, vle_commission, description, required_docs, icon, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE 
         name=VALUES(name), category=VALUES(category), department=VALUES(department), 
         fee=VALUES(fee), vle_commission=VALUES(vle_commission), description=VALUES(description),
         required_docs=VALUES(required_docs), icon=VALUES(icon)`,
        [s.service_code, s.name, s.category, s.department, s.fee, s.vle_commission, s.description, s.required_docs, s.icon]
      );
    }
    console.log(` Official CSC services catalog seeded (${officialServices.length} services).`);

    // 6. Seed Default Users (Super Admin and VLE Operators)
    const adminHash = await bcrypt.hash('Admin@12345', 10);
    const vle1Hash = await bcrypt.hash('Vle@12345', 10);
    const vle2Hash = await bcrypt.hash('Vle@12345', 10);

    // Admin user
    await db.query(
      `INSERT INTO users (csc_id, name, email, phone, password, role, center_name, state, district, status, wallet_balance)
       VALUES (?, ?, ?, ?, ?, 'admin', ?, ?, ?, 'active', 25000.00)
       ON DUPLICATE KEY UPDATE name=VALUES(name), password=VALUES(password), role='admin', status='active'`,
      ['CSC-ADMIN-01', 'CSC National Admin HQ', 'admin@digitalseva.gov.in', '011-49754975', adminHash, 'CSC e-Governance India HQ', 'Delhi', 'New Delhi']
    );

    // VLE Operator 1 (Delhi VLE)
    await db.query(
      `INSERT INTO users (csc_id, name, email, phone, password, role, center_name, state, district, status, wallet_balance)
       VALUES (?, ?, ?, ?, ?, 'user', ?, ?, ?, 'active', 3840.50)
       ON DUPLICATE KEY UPDATE name=VALUES(name), password=VALUES(password), role='user'`,
      ['CSC982144701', 'Rajesh Sharma', 'vle.delhi@digitalseva.gov.in', '9876543210', vle1Hash, 'Sharma Digital Seva Kendra', 'Delhi', 'Central Delhi']
    );

    // VLE Operator 2 (Bihar VLE)
    await db.query(
      `INSERT INTO users (csc_id, name, email, phone, password, role, center_name, state, district, status, wallet_balance)
       VALUES (?, ?, ?, ?, ?, 'user', ?, ?, ?, 'active', 1920.00)
       ON DUPLICATE KEY UPDATE name=VALUES(name), password=VALUES(password), role='user'`,
      ['CSC883109283', 'Anita Kumari', 'vle.bihar@digitalseva.gov.in', '9812345678', vle2Hash, 'Anita CSC Suvidha Kendra', 'Bihar', 'Patna']
    );

    console.log(' Default Users Seeded:');
    console.log('   Super Admin: admin@digitalseva.gov.in / Admin@12345 (CSC-ADMIN-01)');
    console.log('   VLE Operator 1: vle.delhi@digitalseva.gov.in / Vle@12345 (CSC982144701)');
    console.log('   VLE Operator 2: vle.bihar@digitalseva.gov.in / Vle@12345 (CSC883109283)');

    console.log(' Database initialization completed: Users and official services ready without mock data.');
  } catch (error) {
    console.error(' Database initialization error:', error);
    throw error;
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  initDatabase().then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error('Failed to init DB:', err);
    process.exit(1);
  });
}

module.exports = initDatabase;
