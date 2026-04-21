const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const classRoutes = require('./routes/classes');
const noteRoutes = require('./routes/notes');
const homeworkRoutes = require('./routes/homework');
const quizRoutes = require('./routes/quizzes');
const contentRoutes = require('./routes/content');

const app = express();

app.use(cors({
  origin: [
    'https://student.umunsi.com',
    'https://frontend-six-henna-68.vercel.app',
    'http://localhost:3000',
    /\.vercel\.app$/
  ],
  credentials: true
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/classes', noteRoutes);
app.use('/api/classes', homeworkRoutes);
app.use('/api/classes', quizRoutes);
app.use('/api/classes', contentRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
