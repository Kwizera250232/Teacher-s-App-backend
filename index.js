const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const classRoutes = require('./routes/classes');
const noteRoutes = require('./routes/notes');
const homeworkRoutes = require('./routes/homework');
const quizRoutes = require('./routes/quizzes');
const contentRoutes = require('./routes/content');
const adminRoutes = require('./routes/admin');
const studentNotesRoutes = require('./routes/student_notes');
const leaderboardRoutes = require('./routes/leaderboard');
const studentSharesRoutes = require('./routes/student_shares');

const downloadRoutes = require('./routes/download');
const aiRoutes = require('./routes/ai');
const textbookRoutes = require('./routes/textbooks');
const profileRoutes = require('./routes/profile');
const messageRoutes = require('./routes/messages');
const catMarksRoutes = require('./routes/cat_marks');

const app = express();
app.disable('x-powered-by');

const DEFAULT_ALLOWED_ORIGINS = [
  'https://umunsi.com',
  'https://www.umunsi.com',
  'https://student.umunsi.com',
  'https://studentapi.umunsi.com',
  'https://frontend-six-henna-68.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
];

const allowedOrigins = new Set([
  ...DEFAULT_ALLOWED_ORIGINS,
  ...String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean),
]);
const allowVercelPreview = process.env.ALLOW_VERCEL_PREVIEW === 'true';

// Trust Nginx reverse proxy (needed for express-rate-limit behind proxy)
app.set('trust proxy', 1);

// Security headers
app.use(helmet());
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    imgSrc: ["'self'", 'data:', 'blob:'],
    scriptSrc: ["'self'"],
  },
  reportOnly: true, // log only, don't block (API server; no HTML served)
}));

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.has(origin)) return cb(null, true);
    if (allowVercelPreview && /\.vercel\.app$/.test(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX || 300),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again later.' },
});

app.use('/api', apiLimiter);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
// Allow uploads to be embedded in iframes and loaded cross-origin (avatars, PDFs)
app.use('/uploads', (req, res, next) => {
  res.removeHeader('X-Frame-Options');
  res.setHeader('Content-Security-Policy', `frame-ancestors ${process.env.UPLOAD_FRAME_ANCESTORS || "'self'"}`);
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Proxy download route for stamping headers
app.use('/download', downloadRoutes);

app.use('/api/auth', authRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/classes', catMarksRoutes);
app.use('/api/classes', noteRoutes);
app.use('/api/classes', homeworkRoutes);
app.use('/api/classes', quizRoutes);
app.use('/api/classes', contentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/student', studentNotesRoutes);
app.use('/api/classes', leaderboardRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/textbooks', textbookRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/student-shares', studentSharesRoutes);

// Serve avatars
app.use('/uploads/avatars', express.static(require('path').join(__dirname, 'uploads/avatars')));
app.use('/uploads/msg_images', express.static(require('path').join(__dirname, 'uploads/msg_images')));

// PWA install tracking (public, no auth)
app.post('/api/pwa/install', async (req, res) => {
  try {
    const pool = require('./db');
    const ua = (req.body && req.body.user_agent) ? String(req.body.user_agent).slice(0, 500) : null;
    await pool.query('INSERT INTO pwa_installs (user_agent) VALUES ($1)', [ua]);
    res.json({ ok: true });
  } catch {
    res.json({ ok: false });
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

// Central error handler — never leak internal error details to clients
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS blocked this origin.' });
  }
  console.error('[UNHANDLED]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  // One-time cleanup: remove duplicate quiz attempts, keeping only the best score
  // per student per quiz (if equal score, keep the earliest attempt).
  const pool = require('./db');
  pool.query(`
    DELETE FROM quiz_attempts
    WHERE id NOT IN (
      SELECT DISTINCT ON (quiz_id, student_id) id
      FROM quiz_attempts
      ORDER BY quiz_id, student_id, score DESC, attempted_at ASC
    )
  `).then(r => {
    if (r.rowCount > 0) console.log(`[cleanup] Removed ${r.rowCount} duplicate quiz attempt(s).`);
  }).catch(e => console.error('[cleanup] Error removing duplicate quiz attempts:', e.message));
});
