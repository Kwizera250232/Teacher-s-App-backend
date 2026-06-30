#!/bin/bash

BACKEND=/root/Teacher-s-App-frontent/Teacher-s-App-backend
ROUTES=$BACKEND/routes/alumni.js

# Replace the /join route to also change role and return new token
sed -i "/router.post('\/join', authenticateToken, async (req, res) => {/,/^});$/c\
router.post('/join', authenticateToken, async (req, res) => {\n  try {\n    await pool.query(\"UPDATE users SET is_alumni = TRUE, role = 'alumni', graduated_at = NOW(), alumni_status = 'active' WHERE id = \\\$1\", [req.user.id]);\n    const result = await pool.query('SELECT id, name, email, role, school_id, is_approved, email_confirmed FROM users WHERE id = \\\$1', [req.user.id]);\n    const user = result.rows[0];\n    const jwt = require('jsonwebtoken');\n    const newToken = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });\n    res.json({ success: true, message: 'Welcome to Alumni!', token: newToken, user });\n  } catch (err) {\n    console.error('[alumni/join]', err);\n    res.status(500).json({ error: 'Could not join alumni network.' });\n  }\n});" "$ROUTES"

echo "Backend join route fixed"
grep -n -A15 "router.post('/join'" "$ROUTES"
