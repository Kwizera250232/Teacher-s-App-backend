const express = require('express');
const { loadShareByToken, sharePageUrl } = require('../lib/quizShares');
const pool = require('../db');

const router = express.Router();

router.get('/:token', async (req, res) => {
  const token = String(req.params.token || '').trim();
  if (!token || token.length < 16) {
    return res.status(400).json({ error: 'Invalid link.' });
  }
  try {
    const share = await loadShareByToken(token);
    if (!share) {
      return res.status(404).json({ error: 'This quiz link has expired or was removed.' });
    }
    const quizCount = await pool.query(
      'SELECT COUNT(*)::int AS n FROM quizzes WHERE class_id = $1',
      [share.class_id]
    );
    res.json({
      share_token: token,
      share_url: sharePageUrl(token),
      quiz_id: share.quiz_id,
      class_id: share.class_id,
      quiz_title: share.quiz_title,
      quiz_description: share.quiz_description,
      class_name: share.class_name,
      class_subject: share.class_subject,
      teacher_name: share.teacher_name,
      school_id: share.school_id || null,
      quizzes_in_class: quizCount.rows[0]?.n || 0,
    });
  } catch (err) {
    console.error('[public/quizzes]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
