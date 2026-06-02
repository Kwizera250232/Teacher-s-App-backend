#!/usr/bin/env node
/** Quick module + health smoke test (no DB required for module load). */
const http = require('http');

const modules = [
  '../lib/enrichUser',
  '../lib/messagingAccess',
  '../lib/parentHub',
  '../lib/parentReminders',
  '../lib/parentClassNotify',
  '../lib/optionalMailer',
  '../lib/schoolEmailCapabilities',
  '../lib/emailValidate',
  '../lib/schoolMail',
  '../lib/classMomentsSchema',
  '../lib/classMomentReactions',
  '../lib/expoPush',
  '../lib/expoPushSchema',
  '../routes/mobile_push',
  '../routes/parent_hub',
];

let failed = 0;
for (const m of modules) {
  try {
    require(m);
    console.log('ok', m);
  } catch (e) {
    console.error('fail', m, e.message);
    failed += 1;
  }
}

const port = process.env.PORT || 5000;
const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
  let body = '';
  res.on('data', (c) => { body += c; });
  res.on('end', () => {
    if (res.statusCode === 200) {
      console.log('health', body);
    } else {
      console.warn('health status', res.statusCode, '(start server for full check)');
    }
    process.exit(failed > 0 ? 1 : 0);
  });
});
req.on('error', () => {
  console.warn('health: server not running on port', port, '(optional)');
  process.exit(failed > 0 ? 1 : 0);
});
req.setTimeout(2000, () => {
  req.destroy();
  console.warn('health: timeout (optional)');
  process.exit(failed > 0 ? 1 : 0);
});
