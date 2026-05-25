#!/usr/bin/env node
/**
 * One-time / deploy helper: create classroom feed tables on the server DB.
 * Run: node scripts/ensure-feed-db.js
 */
require('dotenv').config({ override: true });
const { ensureFeedTables } = require('../lib/feedSchema');

ensureFeedTables()
  .then(() => {
    console.log('OK: feed tables ensured');
    process.exit(0);
  })
  .catch((e) => {
    console.error('FAILED:', e.message);
    process.exit(1);
  });
