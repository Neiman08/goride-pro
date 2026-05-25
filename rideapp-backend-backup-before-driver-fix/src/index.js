require('dotenv').config();
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');

const connectDB = require('./config/db');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const AppError = require('./utils/AppError');
const initSocket = require('./socket/socketHandler');
const seedAdmin = require('./services/seedAdmin');

// Routes
const authRoutes = require('./routes/auth');
const ridesRoutes = require('./routes/rides');
const usersRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');

// ── App setup ─────────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// ── Socket.io ─────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL || 'http://localhost:3000', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

initSocket(io);

// ── Security middleware ───────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true }));
app.use(mongoSanitize()); // prevent NoSQL injection
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: { status: 'fail', message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// Stricter limit on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { status: 'fail', message: 'Too many login attempts. Try again in 15 minutes.' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// ── General middleware ────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' })); // cap body size
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Inject socket.io into every request (used in controllers)
app.use((req, _res, next) => { req.io = io; next(); });

// ── Health check ──────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date(), env: process.env.NODE_ENV });
});

// ── Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/rides', ridesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/admin', adminRoutes);

// ── 404 handler ───────────────────────────────────────────────────────────
app.all('*', (req, _res, next) => {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
});

// ── Global error handler ──────────────────────────────────────────────────
app.use(errorHandler);

// ── Unhandled rejections / exceptions ────────────────────────────────────
process.on('unhandledRejection', (err) => {
  logger.error('UNHANDLED REJECTION:', { message: err.message, stack: err.stack });
  server.close(() => process.exit(1));
});
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION:', { message: err.message, stack: err.stack });
  process.exit(1);
});

// ── Boot ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

connectDB()
  .then(async () => {
    await seedAdmin();
    server.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT} [${process.env.NODE_ENV}]`);
    });
  })
  .catch((err) => {
    logger.error('Failed to start server:', err);
    process.exit(1);
  });
