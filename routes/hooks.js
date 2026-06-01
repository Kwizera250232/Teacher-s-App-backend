const express = require('express');
const { execFile } = require('child_process');
const path = require('path');

const router = express.Router();
const APP_ROOT = path.join(__dirname, '..');

function runDeploy(cb) {
  const script = path.join(APP_ROOT, 'scripts', 'deploy-production.sh');
  execFile('bash', [script], { cwd: APP_ROOT, timeout: 120000, env: process.env }, (err, stdout, stderr) => {
    if (err) return cb(err, { stdout, stderr });
    cb(null, { stdout, stderr });
  });
}

/** POST /api/hooks/redeploy — pull main + restart (requires X-Deploy-Secret header). */
router.post('/redeploy', (req, res) => {
  const secret = process.env.DEPLOY_HOOK_SECRET;
  if (!secret) {
    return res.status(503).json({ error: 'Deploy hook is not configured on this server.' });
  }
  const provided = req.get('X-Deploy-Secret') || req.body?.secret || '';
  if (provided !== secret) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  runDeploy((err, out) => {
    if (err) {
      console.error('[hooks/redeploy]', err.message, out?.stderr);
      return res.status(500).json({ error: 'Deploy script failed.', detail: String(out?.stderr || err.message).slice(0, 500) });
    }
    res.json({ ok: true, message: 'Deploy completed.', log: String(out.stdout || '').slice(-2000) });
  });
});

module.exports = router;
