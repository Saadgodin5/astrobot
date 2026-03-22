require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { initDB } = require('./db/index');

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Security Middleware ────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// ─── CORS ──────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ─── Rate Limiting ─────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests. Please try again later.',
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many authentication attempts. Please try again later.',
  },
});

const chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Message limit reached. Please wait a moment before sending more.',
  },
});

app.use(globalLimiter);

// ─── Body Parsing ─────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ─── Static Files ─────────────────────────────────────────────────────────
// In Docker, frontend is copied to ./public
// In development, serve from ../frontend relative to backend dir
const isDev = process.env.NODE_ENV !== 'production';
const frontendPath = isDev
  ? path.join(__dirname, '..', 'frontend')
  : path.join(__dirname, 'public');

app.use(express.static(frontendPath));
console.log(`[SERVER] Serving frontend from: ${frontendPath}`);

// ─── API Routes ───────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/chat', chatLimiter, chatRoutes);

// ─── Health Check ─────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'operational',
    timestamp: new Date().toISOString(),
    service: 'AstroBot API',
    version: '1.0.0',
  });
});

// ─── SPA Fallback ────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      error: 'API endpoint not found.',
    });
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ─── Global Error Handler ────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[SERVER] Unhandled error:', err.stack);
  res.status(500).json({
    success: false,
    error: 'An unexpected error occurred.',
  });
});

// ─── Start Server ────────────────────────────────────────────────────────
const startServer = async () => {
  try {
    await initDB();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🚀 AstroBot server running on port ${PORT}`);
      console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`   Frontend:    ${frontendPath}`);
      console.log(`   API Base:    http://localhost:${PORT}/api\n`);
    });
  } catch (err) {
    console.error('[SERVER] Failed to start:', err.message);
    process.exit(1);
  }
};

startServer();

module.exports = app;
