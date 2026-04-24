const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Ensure student_personal_notes table exists
pool.query(`
  CREATE TABLE IF NOT EXISTS student_personal_notes (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL DEFAULT 'Untitled',
    content TEXT,
    color VARCHAR(20) DEFAULT '#ffffff',
    pinned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )
`).catch(console.error);

// GET all notes for this student
router.get('/notes', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM student_personal_notes WHERE student_id = $1 ORDER BY pinned DESC, updated_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error.' }); }
});

// POST create note
router.post('/notes', authenticateToken, requireRole('student'), async (req, res) => {
  const { title, content, color } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required.' });
  try {
    const result = await pool.query(
      `INSERT INTO student_personal_notes (student_id, title, content, color)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, title, content || '', color || '#ffffff']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error.' }); }
});

// PUT update note
router.put('/notes/:id', authenticateToken, requireRole('student'), async (req, res) => {
  const { title, content, color, pinned } = req.body;
  try {
    const result = await pool.query(
      `UPDATE student_personal_notes
       SET title=$1, content=$2, color=$3, pinned=$4, updated_at=NOW()
       WHERE id=$5 AND student_id=$6 RETURNING *`,
      [title, content, color, pinned, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Note not found.' });
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error.' }); }
});

// DELETE note
router.delete('/notes/:id', authenticateToken, requireRole('student'), async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM student_personal_notes WHERE id=$1 AND student_id=$2`,
      [req.params.id, req.user.id]
    );
    res.json({ message: 'Deleted.' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error.' }); }
});

module.exports = router;
