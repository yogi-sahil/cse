const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { pool, testConnection } = require('./config/db');

// Route Imports
const authRoutes = require('./routes/authRoutes');
const servicesRoutes = require('./routes/servicesRoutes');
const applicationsRoutes = require('./routes/applicationsRoutes');
const walletRoutes = require('./routes/walletRoutes');
const usersRoutes = require('./routes/usersRoutes');
const ticketsRoutes = require('./routes/ticketsRoutes');
const statsRoutes = require('./routes/statsRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Permissive CORS Configuration for local development & cross-port calls
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With']
}));
app.options('*', cors());

// Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve Frontend Static Files
const frontendPath = path.join(__dirname, '../../frontend');
app.use(express.static(frontendPath));
app.use('/frontend', express.static(frontendPath));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/applications', applicationsRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/stats', statsRoutes);

// Health Check Endpoint
app.get('/api/health', async (req, res) => {
  const isDbConnected = await testConnection();
  res.json({
    status: 'online',
    platform: 'CSC Digital Seva Portal API',
    database: isDbConnected ? 'MySQL Connected' : 'MySQL Disconnected',
    timestamp: new Date().toISOString()
  });
});

// JSON 404 Handler for any unhandled /api/* route
app.all('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint ${req.method} ${req.originalUrl} not found.`
  });
});

// Direct Page Routes for Panel Multi-Page Architecture
app.get(['/panel', '/panel.html', '/dashboard'], (req, res) => {
  res.sendFile(path.join(frontendPath, 'dashboard.html'));
});
app.get('/applications', (req, res) => res.sendFile(path.join(frontendPath, 'applications.html')));
app.get('/services', (req, res) => res.sendFile(path.join(frontendPath, 'services.html')));
app.get('/wallet', (req, res) => res.sendFile(path.join(frontendPath, 'wallet.html')));
app.get('/recharge', (req, res) => res.sendFile(path.join(frontendPath, 'recharge.html')));
app.get('/vles', (req, res) => res.sendFile(path.join(frontendPath, 'vles.html')));
app.get('/tickets', (req, res) => res.sendFile(path.join(frontendPath, 'tickets.html')));
app.get('/profile', (req, res) => res.sendFile(path.join(frontendPath, 'profile.html')));

app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Global JSON Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// Start Server
async function startServer() {
  const isDbReady = await testConnection();
  if (isDbReady) {
    console.log('✅ MySQL Database connection verified.');
    try {
      const initDatabase = require('./db/initDb');
      await initDatabase();
      console.log('✅ Database schema and official services initialized.');
    } catch (dbInitErr) {
      console.warn('⚠️ Auto-init schema note:', dbInitErr.message);
    }
  } else {
    console.warn('⚠️ Warning: MySQL database could not be reached. Ensure MySQL is running and run `npm run init-db`');
  }

  const server = app.listen(PORT, () => {
    console.log(`🚀 Digital Seva CSC Portal running at: http://localhost:${PORT}`);
    console.log(`📡 Backend API available at: http://localhost:${PORT}/api`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ Error: Port ${PORT} is already in use by another process.`);
      console.error(`👉 Tip: Stop the other process with: npx kill-port ${PORT} (or: lsof -ti :${PORT} | xargs kill -9)\n`);
      process.exit(1);
    } else {
      console.error('Unhandled server error:', err);
      process.exit(1);
    }
  });

  // Graceful shutdown on reload or termination
  const shutdown = () => {
    server.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 1500).unref();
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

startServer();
