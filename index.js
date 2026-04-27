const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
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

const downloadRoutes = require('./routes/download');
const aiRoutes = require('./routes/ai');
const textbookRoutes = require('./routes/textbooks');

const app = express();

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
// Allow uploads to be embedded in iframes (for PDF preview)
app.use('/uploads', (req, res, next) => {
  res.removeHeader('X-Frame-Options');
  res.setHeader('Content-Security-Policy', "frame-ancestors *");
  next();
});
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Proxy download route for stamping headers
app.use('/download', downloadRoutes);

app.use('/api/auth', authRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/classes', noteRoutes);
app.use('/api/classes', homeworkRoutes);
app.use('/api/classes', quizRoutes);
app.use('/api/classes', contentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/student', studentNotesRoutes);
app.use('/api/classes', leaderboardRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/textbooks', textbookRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Central error handler — never leak internal error details to clients
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[UNHANDLED]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
