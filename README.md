# CSC Digital Seva Portal — Enterprise e-Governance Platform

A production-ready e-Governance & Citizen Services Platform modeled on the official Government of India **CSC Digital Seva Portal** ([digitalseva.csc.gov.in](https://digitalseva.csc.gov.in/)), built with a modern **Node.js + Express** backend, **MySQL** relational database, and responsive frontend architecture.

---

## 🏛️ Platform Highlights & Architecture

- **Public Portal**: Exact visual and operational model of `https://digitalseva.csc.gov.in/`:
  - Government of India & CSC emblem branding, Digital India badges.
  - Accessibility tools (Font scaling: A-, A, A+).
  - Live Advisory Marquee ticker with fraud prevention alerts.
  - Over 400 Central & State Government and B2C schemes catalog (PM-KISAN, Ayushman Bharat, PAN Card UTI/NSDL, BBPS Electricity, FASTag, DigiPay, PM-Vishwakarma, etc.).
  - Interactive State-wise service filtering and VLE testimonials.
  - Dynamic Security Captcha verification on Sign In.
  - "Join Us as a VLE" self-service registration onboarding with instant ₹500 welcome credit.

- **Role-Based Authenticated Panel**:
  - **VLE Operator (`user`)**:
    - **Strict Data Segregation**: A VLE can **ONLY** view their own citizen applications, their own wallet ledger, their own support tickets, and their personal performance metrics.
    - **Live CSC Wallet & Passbook**: Real-time balance deduction for government service fees, instant VLE commission crediting, and wallet top-up via UPI / NetBanking.
    - **Citizen Application Submission**: Direct modal launcher with fee breakdown, document verification, and automatic issuance of printable **CSC Digitally Stamped Acknowledgement Slips**.
    - **Grievance / Support Desk**: Submit issue tickets with priority tracking.
  - **Super Admin (`admin`)**:
    - **Global Network Oversight**: Aggregated metrics across all registered VLE centers (Total VLEs, Network Wallet Holding, System Applications, Disbursed Commissions).
    - **All Applications Queue**: Review, Approve, Reject (with automated wallet refund), or Mark Completed with official remarks.
    - **VLE Management Directory**: View all VLE operators, activate/suspend accounts, and execute manual ledger balance adjustments with audit justification.
    - **Service Catalog Master**: Manage scheme fees and commission structures across departments.
    - **Support Ticket Resolution**: Investigate and resolve operator queries.

- **Zero Mock Data**:
  - All data is read from and written to a real **MySQL** database (`digital_seva_csc`).
  - Passwords hashed using `bcryptjs`.
  - Secure stateful sessions with `jsonwebtoken` (JWT).

---

## 📂 Directory Structure

```
cs_platform/
├── backend/
│   ├── .env                    # Private environment credentials (NOT committed)
│   ├── .env.example            # Environment template
│   ├── package.json            # Node.js dependencies (express, mysql2, bcryptjs, jwt, cors)
│   └── src/
│       ├── config/
│       │   └── db.js           # MySQL connection pool
│       ├── controllers/
│       │   ├── authController.js
│       │   ├── servicesController.js
│       │   ├── applicationsController.js
│       │   ├── walletController.js
│       │   ├── usersController.js
│       │   ├── ticketsController.js
│       │   └── statsController.js
│       ├── middleware/
│       │   └── authMiddleware.js # JWT & Role authorization
│       ├── routes/
│       │   ├── authRoutes.js
│       │   ├── servicesRoutes.js
│       │   ├── applicationsRoutes.js
│       │   ├── walletRoutes.js
│       │   ├── usersRoutes.js
│       │   ├── ticketsRoutes.js
│       │   └── statsRoutes.js
│       ├── db/
│       │   ├── schema.sql      # MySQL DDL (tables: users, services, applications, wallet_transactions, support_tickets)
│       │   └── initDb.js       # Auto database migration and official CSC services seed script
│       └── server.js           # Express app & static frontend server
├── frontend/
│   ├── index.html              # Public CSC Digital Seva Portal Landing
│   ├── panel.html              # Role-Based Authenticated Portal Dashboard
│   ├── css/
│   │   ├── portal.css          # CSC Public aesthetics & Gov color tokens
│   │   └── panel.css           # Government Enterprise VLE Panel styling
│   └── js/
│       ├── api.js              # Centralized fetch client with JWT handling
│       ├── portal.js           # Public landing logic, search, captcha & auth
│       └── panel.js            # Role-based dashboard, ledger, applications & receipt generator
├── .gitignore                  # Excludes .env, node_modules, logs
├── index.html                  # Root redirection forwarder
└── README.md
```

---

## ⚡ Quick Start & Setup

### 1. MySQL Database Configuration
Make sure MySQL is running on your machine:
```bash
brew services start mysql   # On macOS
# or sudo systemctl start mysql on Linux
```

Review or edit `backend/.env`:
```env
PORT=5000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=digital_seva_csc
JWT_SECRET=csc_digital_seva_secret_key_2026_super_secure_token_jwt
JWT_EXPIRES_IN=7d
```

### 2. Run Database Migration & Official CSC Seeder
```bash
cd backend
npm run init-db
```
*This automatically creates the `digital_seva_csc` database, creates all relational tables with foreign keys and indexes, and seeds the official services and pre-configured accounts.*

### 3. Start the Server
```bash
npm start
```
The server will be live at:
- **Web Portal**: [http://localhost:5000](http://localhost:5000)
- **Unified Panel**: [http://localhost:5000/panel](http://localhost:5000/panel)
- **API Health**: [http://localhost:5000/api/health](http://localhost:5000/api/health)

---

## 🔑 Default Pre-Seeded Credentials

| Role | Username / Email | CSC ID | Password | Access Level |
|---|---|---|---|---|
| **Super Admin** | `admin@digitalseva.gov.in` | `CSC-ADMIN-01` | `Admin@12345` | Global oversight, all applications, VLE audit & wallet adjustment, master catalog |
| **VLE Operator (Delhi)** | `vle.delhi@digitalseva.gov.in` | `CSC982144701` | `Vle@12345` | Only personal applications, wallet ledger, citizen onboarding |
| **VLE Operator (Bihar)** | `vle.bihar@digitalseva.gov.in` | `CSC883109283` | `Vle@12345` | Only personal applications, wallet ledger, citizen onboarding |
