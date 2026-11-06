// One-time/periodic migration: push every file under uploads/ to R2.
// Run on the VPS: node scripts/migrate-to-r2.js
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const r2 = require('../lib/r2');
const { getUploadsRoot } = require('../lib/uploads');

async function main() {
  if (!r2.enabled) { console.log('R2 not configured — set R2_* env vars.'); process.exit(1); }
  const root = getUploadsRoot();
  let count = 0, bytes = 0, errors = 0;

  async function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) { await walk(full); continue; }
      const rel = path.relative(root, full).split(path.sep).join('/');
      try {
        if (await r2.existsInR2(rel)) continue;
        await r2.uploadLocalToR2(full, rel);
        count++; bytes += fs.statSync(full).size;
        if (count % 50 === 0) console.log(`...${count} files, ${(bytes / 1048576).toFixed(1)} MB`);
      } catch (e) { errors++; console.error('fail', rel, e.message); }
    }
  }

  await walk(root);
  console.log(`Done: ${count} new files uploaded (${(bytes / 1048576).toFixed(1)} MB), ${errors} errors.`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
