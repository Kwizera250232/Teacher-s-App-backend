const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ override: true });

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
const compositionStatusRoutes = require('./routes/composition_status');
const catMarksRoutes = require('./routes/cat_marks');
const classroomFeedRoutes = require('./routes/classroom_feed');
const parentPortalRoutes = require('./routes/parent_portal');
const parentHubRoutes = require('./routes/parent_hub');
const donateRoutes = require('./routes/donate');
const { ensureFeedTables } = require('./lib/feedSchema');

const downloadRoutes = require('./routes/download');
const aiRoutes = require('./routes/ai');
const textbookRoutes = require('./routes/textbooks');
const profileRoutes = require('./routes/profile');
const messageRoutes = require('./routes/messages');

const app = express();

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
  origin: [
    'https://umunsi.com',
    'https://www.umunsi.com',
    'https://student.umunsi.com',
    'https://studentapi.umunsi.com',
    'https://frontend-six-henna-68.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173',
    /\.vercel\.app$/
  ],
  credentials: true
}));
app.use(express.json());
// Allow uploads to be embedded in iframes and loaded cross-origin (avatars, PDFs)
app.use('/uploads', (req, res, next) => {
  res.removeHeader('X-Frame-Options');
  res.setHeader('Content-Security-Policy', "frame-ancestors *");
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});
const { ensureUploadsRoot } = require('./lib/uploads');
const ensureDirectory = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};
const uploadsRoot = ensureUploadsRoot();
ensureDirectory(path.join(uploadsRoot, 'avatars'));
ensureDirectory(path.join(uploadsRoot, 'msg_images'));
ensureDirectory(path.join(uploadsRoot, 'feed'));
ensureDirectory(path.join(uploadsRoot, 'moments'));

app.use('/uploads', express.static(uploadsRoot));
app.use('/uploads/avatars', express.static(path.join(uploadsRoot, 'avatars')));
app.use('/uploads/msg_images', express.static(path.join(uploadsRoot, 'msg_images')));

// Proxy download route for stamping headers
app.use('/download', downloadRoutes);

app.use('/api/auth', authRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/classes', noteRoutes);
app.use('/api/classes', homeworkRoutes);
app.use('/api/classes', quizRoutes);
app.use('/api/classes', contentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/school', adminRoutes);
app.use('/api/student', studentNotesRoutes);
app.use('/api/classes', leaderboardRoutes);
app.use('/api/catmarks', catMarksRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/textbooks', textbookRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/student-shares', studentSharesRoutes);
app.use('/api/composition-status', compositionStatusRoutes);
app.use('/api/classroom-feed', classroomFeedRoutes);
app.use('/api/class-moments', require('./routes/class_moments'));
app.use('/api/presence', require('./routes/presence'));
app.use('/api/public', require('./routes/public_moments'));
app.use('/share', require('./routes/share_moment_page'));
app.use('/api/parent', parentPortalRoutes);
app.use('/api/parent', parentHubRoutes);
app.use('/api/donate', donateRoutes);
app.use('/api/hooks', require('./routes/hooks'));
app.use('/api/mail', require('./routes/mail'));

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

app.get('/api/health', (req, res) => {
  let build = process.env.BUILD_ID || null;
  if (!build) {
    try {
      build = require('fs').readFileSync(path.join(__dirname, 'VERSION'), 'utf8').trim();
    } catch {
      build = null;
    }
  }
  res.json({ status: 'ok', build });
});

// Student web UI (built React app) — https://studentapi.umunsi.com/app/
const studentUiDist = path.join(__dirname, 'student-web-dist');
const STUDENT_WEB_HOSTS = new Set(['student.umunsi.com', 'www.student.umunsi.com']);

function isStudentWebHost(hostname) {
  return STUDENT_WEB_HOSTS.has(String(hostname || '').toLowerCase());
}

if (fs.existsSync(studentUiDist)) {
  app.use('/app', express.static(studentUiDist, { index: 'index.html', maxAge: '1h' }));
  // Express 5: named wildcard (not /app/*)
  app.get('/app/{*splat}', (req, res) => {
    res.sendFile(path.join(studentUiDist, 'index.html'));
  });

  // student.umunsi.com on VPS (DNS → 93.127.186.217): serve SPA at /, not only /app/
  app.use((req, res, next) => {
    if (!isStudentWebHost(req.hostname)) return next();
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const rel = req.path === '/' ? 'index.html' : req.path.replace(/^\//, '');
    if (rel.includes('..')) return res.status(400).end();
    const filePath = path.join(studentUiDist, rel);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return res.sendFile(filePath);
    }
    return res.sendFile(path.join(studentUiDist, 'index.html'));
  });

  app.get('/', (req, res, next) => {
    const host = String(req.hostname || '');
    if (host.includes('studentapi.') && !req.path.startsWith('/api')) {
      return res.redirect(302, '/app/');
    }
    return next();
  });
}

// Central error handler — never leak internal error details to clients
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (
    err &&
    (err.code === 'LIMIT_FILE_SIZE' ||
      err.name === 'MulterError' ||
      /file too large/i.test(String(err.message)))
  ) {
    return res.status(413).json({
      error: 'File is too large. Maximum upload is 50MB — try a smaller photo or compress the image.',
    });
  }
  if (err && err.message && err.message.toLowerCase().includes('invalid file type')) {
    return res.status(400).json({ error: err.message });
  }
  console.error('[UNHANDLED]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  ensureFeedTables().catch((e) => console.error('[startup] feed schema:', e.message));
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
