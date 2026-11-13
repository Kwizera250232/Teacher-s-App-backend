const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { userCanManageClass } = require('../lib/classAccess');
const { insertParentNotification, resolveParentRecipients } = require('../lib/parentHub');
const { maybeEmailParent } = require('../lib/parentNotifyEmail');
const { getOrCreateParentInviteToken } = require('../lib/parentInvite');
const { resolveFrontendUrl, buildParentInvitePath } = require('../lib/frontendUrl');

const router = express.Router();

pool.query(`
  CREATE TABLE IF NOT EXISTS cat_marks (
    id SERIAL PRIMARY KEY,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    test_number INTEGER NOT NULL,
    marks_obtained INTEGER NOT NULL,
    total_marks INTEGER NOT NULL DEFAULT 100,
    test_date DATE DEFAULT CURRENT_DATE,
    subject TEXT DEFAULT 'General',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(class_id, student_id, test_number, subject)
  );
  CREATE INDEX IF NOT EXISTS idx_cat_marks_class ON cat_marks(class_id);
  CREATE INDEX IF NOT EXISTS idx_cat_marks_student ON cat_marks(student_id);
  ALTER TABLE cat_marks ADD COLUMN IF NOT EXISTS test_date DATE DEFAULT CURRENT_DATE;
  ALTER TABLE cat_marks ADD COLUMN IF NOT EXISTS subject TEXT DEFAULT 'General';
  ALTER TABLE cat_marks DROP CONSTRAINT IF EXISTS cat_marks_class_id_student_id_test_number_key;

  CREATE TABLE IF NOT EXISTS cat_totals_config (
    id SERIAL PRIMARY KEY,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    test_number INTEGER NOT NULL,
    total_marks INTEGER NOT NULL DEFAULT 100,
    subject TEXT DEFAULT 'General',
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(class_id, test_number, subject)
  );

  -- Term sheets: one ACTIVE sheet per class receives new marks; older sheets are archived/read-only
  -- (name cat_term_sheets — cat_mark_sheets already exists for a different feature)
  CREATE TABLE IF NOT EXISTS cat_term_sheets (
    id SERIAL PRIMARY KEY,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    archived_at TIMESTAMP
  );
  ALTER TABLE cat_marks ADD COLUMN IF NOT EXISTS sheet_id INTEGER;
  CREATE INDEX IF NOT EXISTS idx_cat_marks_sheet ON cat_marks(sheet_id);
`).catch(e => console.error('[cat_marks] migration error:', e.message));

// Sheets constraint + backfill: marks now unique per (class, student, cat#, subject, sheet)
(async () => {
  try {
    await pool.query(`ALTER TABLE cat_marks ADD COLUMN IF NOT EXISTS sheet_id INTEGER`);
    await pool.query(`ALTER TABLE cat_marks DROP CONSTRAINT IF EXISTS cat_marks_class_id_student_id_test_number_subject_key`);
    await pool.query(`ALTER TABLE cat_marks DROP CONSTRAINT IF EXISTS cat_marks_sheet_unique`);
    await pool.query(`ALTER TABLE cat_marks ADD CONSTRAINT cat_marks_sheet_unique UNIQUE (class_id, student_id, test_number, subject, sheet_id)`);
    const orphan = await pool.query(`SELECT DISTINCT class_id FROM cat_marks WHERE sheet_id IS NULL`);
    for (const r of orphan.rows) {
      let sid = (await pool.query(`SELECT id FROM cat_term_sheets WHERE class_id = $1 ORDER BY id LIMIT 1`, [r.class_id])).rows[0]?.id;
      if (!sid) sid = (await pool.query(`INSERT INTO cat_term_sheets (class_id, name, active) VALUES ($1, 'Term I', TRUE) RETURNING id`, [r.class_id])).rows[0].id;
      await pool.query(`UPDATE cat_marks SET sheet_id = $2 WHERE class_id = $1 AND sheet_id IS NULL`, [r.class_id, sid]);
    }
    // Self-heal: collapse duplicate active sheets (keep lowest id), re-point marks
    // whose sheet belongs to a different class, then enforce one active sheet/class
    await pool.query(`UPDATE cat_term_sheets s SET active = FALSE, archived_at = NOW()
      WHERE s.active = TRUE AND EXISTS (
        SELECT 1 FROM cat_term_sheets o WHERE o.class_id = s.class_id AND o.active = TRUE AND o.id < s.id)`);
    await pool.query(`UPDATE cat_marks m SET sheet_id = s.id
      FROM cat_term_sheets s
      WHERE s.class_id = m.class_id AND s.active = TRUE
      AND NOT EXISTS (SELECT 1 FROM cat_term_sheets x WHERE x.id = m.sheet_id AND x.class_id = m.class_id)`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS cat_term_sheets_one_active
      ON cat_term_sheets(class_id) WHERE active`);
  } catch (e) { console.error('[cat_marks sheets] migration error:', e.message); }
})();

/** Active sheet for a class — creates 'Term I' on first use and adopts legacy marks. */
async function getActiveSheet(classId) {
  let sheet = (await pool.query(
    `SELECT * FROM cat_term_sheets WHERE class_id = $1 AND active = TRUE ORDER BY id DESC LIMIT 1`, [classId]
  )).rows[0];
  if (!sheet) {
    try {
      sheet = (await pool.query(
        `INSERT INTO cat_term_sheets (class_id, name, active) VALUES ($1, 'Term I', TRUE) RETURNING *`, [classId]
      )).rows[0];
      await pool.query(`UPDATE cat_marks SET sheet_id = $2 WHERE class_id = $1 AND sheet_id IS NULL`, [classId, sheet.id]);
    } catch {
      sheet = (await pool.query(
        `SELECT * FROM cat_term_sheets WHERE class_id = $1 AND active = TRUE ORDER BY id DESC LIMIT 1`, [classId]
      )).rows[0];
    }
  }
  return sheet;
}

// ═══════════════════════════════════════════════════════════════════════════
// REPORT FOLDER — emailed reports live in ONE folder the recipient opens like a
// computer folder: press the link → a folder page lists every Word report →
// press a file → it downloads to the PC/phone and opens in Word. No ZIP.
// ═══════════════════════════════════════════════════════════════════════════
const REPORT_FOLDERS_DIR = path.join(__dirname, '..', 'report-folders');
const REPORT_FOLDER_TTL_MS = 45 * 24 * 60 * 60 * 1000; // folders live 45 days

function publicApiBase(req) {
  return (process.env.PUBLIC_API_URL || process.env.API_PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}

function saveReportFolder(files, meta) {
  const token = crypto.randomBytes(16).toString('hex');
  const dir = path.join(REPORT_FOLDERS_DIR, token);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of files) fs.writeFileSync(path.join(dir, f.name), f.data);
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ ...meta, created: Date.now() }));
  // lazy cleanup of expired folders
  try {
    for (const d of fs.readdirSync(REPORT_FOLDERS_DIR)) {
      const mp = path.join(REPORT_FOLDERS_DIR, d, 'meta.json');
      try {
        const m = JSON.parse(fs.readFileSync(mp, 'utf8'));
        if (Date.now() - (m.created || 0) > REPORT_FOLDER_TTL_MS) fs.rmSync(path.join(REPORT_FOLDERS_DIR, d), { recursive: true, force: true });
      } catch { /* keep folders without meta */ }
    }
  } catch { /* ignore */ }
  return token;
}

function loadReportFolder(token) {
  if (!/^[a-f0-9]{32}$/.test(String(token || ''))) return null;
  const dir = path.join(REPORT_FOLDERS_DIR, token);
  if (!fs.existsSync(dir)) return null;
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')); } catch { /* ok */ }
  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.doc')).sort();
  return { dir, meta, files };
}

// Minimal stored (uncompressed) ZIP writer — used so the whole folder can be
// fetched as ONE file; on Windows it opens exactly like a normal folder.
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zipStore(entries) {
  const chunks = []; const central = []; let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12); local.writeUInt16LE(0, 14);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, data);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(0, 10); cd.writeUInt16LE(0, 12); cd.writeUInt16LE(0, 14); cd.writeUInt16LE(0, 16);
    cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28); cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, cdBuf, eocd]);
}

// GET /report-folder/:token/all — the whole folder as ONE file (opens like a folder on PC)
router.get('/report-folder/:token/all', (req, res) => {
  const folder = loadReportFolder(req.params.token);
  if (!folder) return res.status(404).send('Folder expired.');
  const entries = folder.files.map((f) => ({ name: f, data: fs.readFileSync(path.join(folder.dir, f)) }));
  const zipName = `${(folder.meta.className || 'Reports')}-MidTerm-${folder.meta.term || ''}-Reports`.replace(/[^\w .-]+/g, '-') + '.zip';
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);
  res.send(zipStore(entries));
});

// GET /report-folder/:token — the "computer folder" page listing all Word reports
router.get('/report-folder/:token', (req, res) => {
  const folder = loadReportFolder(req.params.token);
  if (!folder) return res.status(404).send('<h3 style="font-family:Arial">This reports folder has expired or does not exist.</h3>');
  const { meta, files } = folder;
  const base = publicApiBase(req);
  const tiles = files.map((f) => {
    const sizeKb = Math.max(1, Math.round(fs.statSync(path.join(folder.dir, f)).size / 1024));
    const href = `${base}/api/catmarks/report-folder/${req.params.token}/${encodeURIComponent(f)}`;
    return `<a class="file" href="${href}" download title="${escHtml(f)} — ${sizeKb} KB — press to download">
      <span class="doc">
        <span class="doc-lines"></span>
        <span class="w">W</span>
      </span>
      <span class="fname">${escHtml(f)}</span>
      <span class="fsize">${sizeKb} KB</span>
    </a>`;
  }).join('');
  res.type('html').send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>📁 ${escHtml(meta.className || 'Reports')} — Mid-Term ${escHtml(meta.term || '')}</title>
<style>
  body{margin:0;font-family:'Segoe UI',Arial,sans-serif;background:#eceff4;}
  .bar{background:#f5f6f7;border-bottom:1px solid #d0d7de;padding:12px 18px;display:flex;align-items:center;gap:12px;}
  .folder-ico{font-size:32px;}
  .bar h1{font-size:16px;margin:0;color:#1f2937;}
  .bar p{margin:2px 0 0;font-size:12.5px;color:#6b7280;}
  .crumb{max-width:1080px;margin:14px auto 0;padding:0 14px;font-size:12.5px;color:#6b7280;}
  .win{max-width:1080px;margin:8px auto 18px;background:#fff;border:1px solid #d0d7de;border-radius:8px;min-height:200px;box-shadow:0 2px 8px rgba(0,0,0,.08);padding:18px;display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:6px;align-content:start;}
  .file{display:flex;flex-direction:column;align-items:center;gap:7px;padding:12px 6px 10px;border-radius:5px;text-decoration:none;color:#111;text-align:center;}
  .file:hover{background:#cce4fc;outline:1px solid #99d1ff;}
  .file:active{background:#b3d9fd;}
  .doc{position:relative;width:56px;height:66px;background:linear-gradient(160deg,#ffffff 0%,#e9eef5 100%);border:1px solid #c3ccd9;border-radius:4px 10px 4px 4px;box-shadow:1px 2px 3px rgba(0,0,0,.15);}
  .doc:after{content:'';position:absolute;top:-1px;right:-1px;border-style:solid;border-width:0 12px 12px 0;border-color:transparent #c3ccd9 transparent transparent;border-radius:0 0 0 3px;}
  .doc-lines{position:absolute;top:10px;left:8px;right:10px;height:22px;background:repeating-linear-gradient(180deg,#d6dde8 0 2px,transparent 2px 5px);}
  .w{position:absolute;left:8px;bottom:6px;background:#2b579a;color:#fff;font-weight:700;font-size:13px;width:20px;height:20px;border-radius:3px;display:flex;align-items:center;justify-content:center;font-family:Georgia,serif;}
  .fname{font-size:12px;line-height:1.25;word-break:break-word;max-height:45px;overflow:hidden;}
  .fsize{font-size:10.5px;color:#8a94a6;}
  .note{max-width:1080px;margin:0 auto 26px;padding:0 14px;font-size:12.5px;color:#6b7280;}
  .dlall{background:#075e54;color:#fff;border:none;border-radius:7px;padding:10px 18px;font-size:13.5px;font-weight:700;cursor:pointer;white-space:nowrap;text-decoration:none;font-family:inherit;}
  .dlall:hover{background:#0a7a6c;}
  .dlall:disabled{opacity:.6;cursor:default;}
</style></head><body>
  <div class="bar"><span class="folder-ico">📁</span><div>
    <h1>${escHtml(meta.className || 'Class')} — Mid-Term ${escHtml(meta.term || '')} Reports</h1>
    <p>${escHtml(meta.schoolName || '')} · ${files.length} Word documents</p>
  </div><a class="dlall" style="margin-left:auto;display:inline-block;" href="${base}/api/catmarks/report-folder/${req.params.token}/all" download>⬇ Download folder</a></div>
  <p class="crumb">📁 Reports folder — press a file to download it to this device, then open it in Word and print.</p>
  <div class="win">${tiles}</div>
  <p class="note">On a computer the downloaded folder opens directly in Explorer and every file inside opens in Microsoft Word — nothing to unzip.</p>
</body></html>`);
});

// GET /report-folder/:token/:file — download one Word report from the folder
router.get('/report-folder/:token/:file', (req, res) => {
  const folder = loadReportFolder(req.params.token);
  if (!folder) return res.status(404).send('Folder expired.');
  const fname = path.basename(String(req.params.file || ''));
  if (!fname.toLowerCase().endsWith('.doc') || !folder.files.includes(fname)) return res.status(404).send('File not found.');
  res.setHeader('Content-Type', 'application/msword');
  res.setHeader('Content-Disposition', `attachment; filename="${fname.replace(/"/g, '')}"`);
  fs.createReadStream(path.join(folder.dir, fname)).pipe(res);
});

// List sheets for a class (active + archived) with mark counts
router.get('/:classId/sheets', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = req.params.classId;
  try {
    const access = await userCanManageClass(req.user, classId);
    if (!access?.ok) return res.status(403).json({ error: 'Not your class.' });
    const active = await getActiveSheet(classId);
    const sheets = (await pool.query(
      `SELECT s.id, s.name, s.active, s.created_at, s.archived_at,
              (SELECT COUNT(*) FROM cat_marks m WHERE m.sheet_id = s.id)::int AS mark_count
       FROM cat_term_sheets s WHERE s.class_id = $1 ORDER BY s.id`,
      [classId]
    )).rows;
    res.json({ sheets, active_id: active.id });
  } catch (err) {
    console.error('[cat_marks sheets] list error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Create a new sheet — the current active one is archived immediately
router.post('/:classId/sheets', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = req.params.classId;
  try {
    const access = await userCanManageClass(req.user, classId);
    if (!access?.ok) return res.status(403).json({ error: 'Not your class.' });
    const count = (await pool.query(
      `SELECT COUNT(*)::int AS n FROM cat_term_sheets WHERE class_id = $1`, [classId]
    )).rows[0].n;
    const name = String(req.body?.name || '').trim()
      || `Term ${['I', 'II', 'III', 'IV', 'V', 'VI'][count] || count + 1}`;
    await pool.query(
      `UPDATE cat_term_sheets SET active = FALSE, archived_at = NOW() WHERE class_id = $1 AND active = TRUE`, [classId]
    );
    const sheet = (await pool.query(
      `INSERT INTO cat_term_sheets (class_id, name, active) VALUES ($1, $2, TRUE) RETURNING *`, [classId, name]
    )).rows[0];
    res.json({ sheet });
  } catch (err) {
    console.error('[cat_marks sheets] create error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/:classId/overview', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = req.params.classId;
  const subject = req.query.subject || '';
  try {
    // Sheet to display: requested archived sheet, else the active one
    let sheet;
    if (req.query.sheet_id) {
      sheet = (await pool.query(
        `SELECT * FROM cat_term_sheets WHERE id = $1 AND class_id = $2`, [req.query.sheet_id, classId]
      )).rows[0] || (await getActiveSheet(classId));
    } else {
      sheet = await getActiveSheet(classId);
    }
    const sid = sheet.id;

    const roster = await pool.query(
      `SELECT u.id AS student_id, u.name
       FROM class_members cm
       JOIN users u ON cm.student_id = u.id
       WHERE cm.class_id = $1
       ORDER BY u.name`,
      [classId]
    );

    // Get marks for this sheet — optionally filtered by subject
    let marksRows;
    if (subject) {
      marksRows = await pool.query(
        `SELECT student_id, test_number, marks_obtained, total_marks, subject
         FROM cat_marks WHERE class_id = $1 AND subject = $2 AND sheet_id = $3`,
        [classId, subject, sid]
      );
    } else {
      marksRows = await pool.query(
        `SELECT student_id, test_number, marks_obtained, total_marks, subject
         FROM cat_marks WHERE class_id = $1 AND sheet_id = $2`,
        [classId, sid]
      );
    }

    // Get list of subjects that have marks in this sheet
    const subjectsResult = await pool.query(
      `SELECT DISTINCT subject FROM cat_marks WHERE class_id = $1 AND sheet_id = $2 ORDER BY subject`,
      [classId, sid]
    );

    const marksByStudent = new Map();
    const catTotals = {}; // { test_number: total_marks } — the "out of" for each CAT

    // First, load configured totals from cat_totals_config (teacher-set totals)
    const configRows = await pool.query(
      `SELECT test_number, total_marks FROM cat_totals_config WHERE class_id = $1 AND subject = $2`,
      [classId, subject || 'General']
    );
    for (const row of configRows.rows) {
      catTotals[row.test_number] = Number(row.total_marks) || 100;
    }

    for (const row of marksRows.rows) {
      if (!marksByStudent.has(row.student_id)) marksByStudent.set(row.student_id, {});
      marksByStudent.get(row.student_id)[row.test_number] = {
        marks: Number(row.marks_obtained),
        total: Number(row.total_marks) || catTotals[row.test_number] || 100,
      };
      // Fall back to marks if no config entry
      if (!catTotals[row.test_number]) catTotals[row.test_number] = Number(row.total_marks) || 100;
    }

    const students = roster.rows.map((s) => {
      const tests = marksByStudent.get(s.student_id) || {};
      const cat = {};
      let sumMarks = 0;
      let sumTotal = 0;
      let testCount = 0;
      for (let n = 1; n <= 10; n += 1) {
        if (tests[n]) {
          cat[n] = tests[n].marks;
          sumMarks += tests[n].marks;
          sumTotal += tests[n].total;
          testCount += 1;
        } else {
          cat[n] = null;
        }
      }
      const percentage = sumTotal > 0 ? Math.round((1000 * sumMarks) / sumTotal) / 10 : 0;
      const avg_percentage = testCount > 0
        ? Math.round(
          (Object.values(tests).reduce((acc, t) => acc + (100 * t.marks) / (t.total || 100), 0) / testCount) * 10
        ) / 10
        : 0;
      return {
        student_id: s.student_id,
        name: s.name,
        cat,
        test_count: testCount,
        total_marks: sumMarks,
        percentage,
        avg_percentage,
      };
    });

    const classAvg = await pool.query(
      `SELECT COALESCE(ROUND(AVG(100.0 * marks_obtained / NULLIF(total_marks, 1)), 1), 0) AS avg
       FROM cat_marks WHERE class_id = $1 AND sheet_id = $2`,
      [classId, sid]
    );

    res.json({
      students,
      class_average: classAvg.rows[0]?.avg || 0,
      subjects: subjectsResult.rows.map(r => r.subject),
      cat_totals: catTotals,
      sheet: { id: sheet.id, name: sheet.name, active: sheet.active },
    });
  } catch (err) {
    console.error('[cat_marks] summary error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/:classId/student/:studentId', authenticateToken, async (req, res) => {
  const { classId, studentId } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM cat_marks WHERE class_id = $1 AND student_id = $2 ORDER BY test_number`,
      [classId, studentId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/:classId/entry', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const { student_id, test_number, marks_obtained, total_marks, subject } = req.body;
  const classId = req.params.classId;
  if (!student_id || !test_number || marks_obtained === undefined) {
    return res.status(400).json({ error: 'student_id, test_number, marks_obtained required.' });
  }
  const subj = subject || 'General';
  try {
    // If no total_marks provided, look up from config or default to 100
    let finalTotal = total_marks;
    if (!finalTotal) {
      const configRes = await pool.query(
        `SELECT total_marks FROM cat_totals_config WHERE class_id = $1 AND test_number = $2 AND subject = $3`,
        [classId, test_number, subj]
      );
      finalTotal = configRes.rows[0]?.total_marks || 100;
    }
    // Marks always land in the ACTIVE sheet — archived sheets are read-only
    const sheet = await getActiveSheet(classId);
    const result = await pool.query(
      `INSERT INTO cat_marks (class_id, student_id, test_number, marks_obtained, total_marks, subject, sheet_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (class_id, student_id, test_number, subject, sheet_id)
       DO UPDATE SET marks_obtained = $4, total_marks = $5, updated_at = NOW()
       RETURNING *`,
      [classId, student_id, test_number, marks_obtained, finalTotal, subj, sheet.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[cat_marks] save error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Set/change the "out of" (total_marks) for a specific CAT number across all students in a class+subject
router.put('/:classId/cat-total', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const { test_number, total_marks, subject } = req.body;
  const classId = req.params.classId;
  if (!test_number || !total_marks || total_marks < 1) {
    return res.status(400).json({ error: 'test_number and total_marks (>=1) required.' });
  }
  const subj = subject || 'General';
  try {
    // Save to config table (persists even if no marks exist yet)
    await pool.query(
      `INSERT INTO cat_totals_config (class_id, test_number, total_marks, subject)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (class_id, test_number, subject)
       DO UPDATE SET total_marks = $3, updated_at = NOW()`,
      [classId, test_number, total_marks, subj]
    );
    // Also update existing marks for this CAT — only on the ACTIVE sheet (archived sheets stay untouched)
    const sheet = await getActiveSheet(classId);
    const result = await pool.query(
      `UPDATE cat_marks SET total_marks = $4, updated_at = NOW()
       WHERE class_id = $1 AND test_number = $2 AND subject = $3 AND sheet_id = $5`,
      [classId, test_number, subj, total_marks, sheet.id]
    );
    res.json({ updated: result.rowCount, test_number, total_marks, subject: subj });
  } catch (err) {
    console.error('[cat_marks] set-cat-total error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/:classId/fromquiz', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const { quiz_id, test_number, subject } = req.body;
  const classId = req.params.classId;
  if (!quiz_id || !test_number) {
    return res.status(400).json({ error: 'quiz_id and test_number required.' });
  }
  const subj = subject || 'General';
  try {
    const attempts = await pool.query(
      `SELECT DISTINCT ON (qa.student_id) qa.student_id, qa.score, qa.total
       FROM quiz_attempts qa
       JOIN class_members cm ON qa.student_id = cm.student_id
       WHERE qa.quiz_id = $1 AND cm.class_id = $2
       ORDER BY qa.student_id, qa.score DESC, qa.attempted_at ASC`,
      [quiz_id, classId]
    );

    const sheet = await getActiveSheet(classId);
    for (const att of attempts.rows) {
      await pool.query(
        `INSERT INTO cat_marks (class_id, student_id, test_number, marks_obtained, total_marks, subject, sheet_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (class_id, student_id, test_number, subject, sheet_id)
         DO UPDATE SET marks_obtained = $4, total_marks = $5, updated_at = NOW()`,
        [classId, att.student_id, test_number, att.score, att.total, subj, sheet.id]
      );
    }

    res.json({ migrated: attempts.rows.length });
  } catch (err) {
    console.error('[cat_marks] from-quiz error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/:classId/entry/:markId', authenticateToken, requireRole('teacher'), async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM cat_marks WHERE id = $1 AND class_id = $2`,
      [req.params.markId, req.params.classId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/:classId/entry/:studentId/:testNumber', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  try {
    const subject = req.query.subject || 'General';
    const sheet = await getActiveSheet(req.params.classId);
    await pool.query(
      `DELETE FROM cat_marks WHERE class_id = $1 AND student_id = $2 AND test_number = $3 AND subject = $4 AND sheet_id = $5`,
      [req.params.classId, req.params.studentId, req.params.testNumber, subject, sheet.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /:classId/notify-parents — send the Marks Sheet to every student's parent.
 * In-app notification with the full marks text, plus optional email carrying a
 * downloadable Word (.doc) document containing the teacher CAT table and the
 * class UClass quiz marks for that child only.
 * Body: { also_email?: boolean, subject?: string }
 */
router.post('/:classId/notify-parents', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = req.params.classId;
  const { also_email, subject } = req.body || {};
  const subj = (subject || '').trim();
  try {
    const access = await userCanManageClass(req.user, classId);
    if (!access.ok) return res.status(403).json({ error: 'Not allowed for this class.' });

    const classInfo = await pool.query(
      `SELECT c.name, c.class_code, s.name AS school_name
       FROM classes c LEFT JOIN schools s ON s.id = c.school_id WHERE c.id = $1`,
      [classId]
    );
    const className = classInfo.rows[0]?.name || '';
    const classCode = classInfo.rows[0]?.class_code || '';
    const schoolName = classInfo.rows[0]?.school_name || '';

    const roster = await pool.query(
      `SELECT u.id AS student_id, u.name, cm.parent_email
       FROM class_members cm JOIN users u ON cm.student_id = u.id
       WHERE cm.class_id = $1 ORDER BY u.name`,
      [classId]
    );

    // Only the ACTIVE sheet goes to parents — archived sheets never leak into reports
    const sheet = await getActiveSheet(classId);
    const marksRes = subj
      ? await pool.query(
          `SELECT student_id, test_number, marks_obtained, total_marks, subject, test_date
           FROM cat_marks WHERE class_id = $1 AND subject = $2 AND sheet_id = $3 ORDER BY subject, test_number`,
          [classId, subj, sheet.id]
        )
      : await pool.query(
          `SELECT student_id, test_number, marks_obtained, total_marks, subject, test_date
           FROM cat_marks WHERE class_id = $1 AND sheet_id = $2 ORDER BY subject, test_number`,
          [classId, sheet.id]
        );
    const marksByStudent = {};
    for (const m of marksRes.rows) {
      if (!marksByStudent[m.student_id]) marksByStudent[m.student_id] = [];
      marksByStudent[m.student_id].push(m);
    }

    const quizRes = await pool.query(
      `SELECT qa.student_id, q.title, qa.score, qa.total, qa.attempted_at,
              COALESCE(q.subject, 'General') AS subject
       FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id
       WHERE q.class_id = $1 ORDER BY qa.attempted_at DESC`,
      [classId]
    );
    const quizzesByStudent = {};
    for (const q of quizRes.rows) {
      if (!quizzesByStudent[q.student_id]) quizzesByStudent[q.student_id] = [];
      quizzesByStudent[q.student_id].push(q);
    }

    const frontendBase = resolveFrontendUrl(req);
    let notified = 0;
    let emailed = 0;
    let noParent = 0;
    let noMarks = 0;
    let emailFailReason = '';

    for (const s of roster.rows) {
      const marks = marksByStudent[s.student_id] || [];
      const quizzes = (quizzesByStudent[s.student_id] || []).slice(0, 15);
      if (!marks.length && !quizzes.length) { noMarks++; continue; }

      const parents = await resolveParentRecipients({
        senderId: req.user.id,
        senderRole: req.user.role,
        studentId: s.student_id,
      });
      const savedEmail = s.parent_email || '';
      if (!parents.length && !savedEmail) { noParent++; continue; }

      // Group CAT marks by subject
      const bySubj = {};
      for (const m of marks) {
        const key = m.subject || 'General';
        if (!bySubj[key]) bySubj[key] = [];
        bySubj[key].push(m);
      }
      const grandObt = marks.reduce((sum, m) => sum + Number(m.marks_obtained), 0);
      const grandMax = marks.reduce((sum, m) => sum + Number(m.total_marks), 0);
      const grandPct = grandMax ? ((grandObt / grandMax) * 100).toFixed(1) : '0';

      // ---------- Text body (in-app notification) ----------
      const title = `📊 REBA AMANOTA AMAZE KUGIRA MU MYITOZO YO MU ISHURI — ${s.name}`;
      let body = `REBA AMANOTA AMAZE KUGIRA MU MYITOZO YO MU ISHURI
(Amanota y'umwana wawe yagize mu myitozo yo mu ishuri)
School: ${schoolName}
Student: ${s.name}
Class: ${className}${classCode ? ` (Code: ${classCode})` : ''}
${subj ? `Subject: ${subj}\n` : ''}
MARKS ADDED BY TEACHER (Marks Sheet):`;
      for (const [sname, items] of Object.entries(bySubj)) {
        const tot = items.reduce((a, i) => a + Number(i.marks_obtained), 0);
        const mx = items.reduce((a, i) => a + Number(i.total_marks), 0);
        const pct = mx ? ((tot / mx) * 100).toFixed(0) : '0';
        const detail = items.map(i => `CAT ${i.test_number}: ${i.marks_obtained}/${i.total_marks}`).join(', ');
        body += `\n  ${sname}: ${detail}  → Total: ${tot}/${mx} (${pct}%)`;
      }
      body += `\n  GRAND TOTAL: ${grandObt}/${grandMax} (${grandPct}%)`;
      if (quizzes.length) {
        body += '\n\nUCLASS QUIZ MARKS:';
        for (const q of quizzes) {
          body += `\n  ${q.title} [${q.subject}]: ${q.score}${q.total ? '/' + q.total : '%'}`;
        }
      }

      // ---------- Word document (attachment + same structure as ParentHub download) ----------
      const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const docRows = Object.entries(bySubj).map(([sname, items]) => {
        const tot = items.reduce((a, i) => a + Number(i.marks_obtained), 0);
        const mx = items.reduce((a, i) => a + Number(i.total_marks), 0);
        const pct = mx ? ((tot / mx) * 100).toFixed(0) : '0';
        const detail = items.map(i => `CAT ${i.test_number}: ${i.marks_obtained}/${i.total_marks}`).join('<br>');
        return `<tr><td>${esc(sname)}</td><td>${detail}</td><td style="text-align:center">${tot}/${mx}</td><td style="text-align:center">${pct}%</td></tr>`;
      }).join('');
      const quizRows = quizzes.map(q =>
        `<tr><td>${esc(q.title)}</td><td>${esc(q.subject)}</td><td style="text-align:center">${q.score}${q.total ? '/' + q.total : '%'}</td><td style="text-align:center">${q.attempted_at ? new Date(q.attempted_at).toLocaleDateString() : ''}</td></tr>`
      ).join('');
      const docHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>Marks</title></head><body>
<h1 style="color:#075e54">REBA AMANOTA AMAZE KUGIRA MU MYITOZO YO MU ISHURI</h1>
<p><b>School:</b> ${esc(schoolName)} &nbsp; <b>Student:</b> ${esc(s.name)} &nbsp; <b>Class:</b> ${esc(className)}${classCode ? ` (${esc(classCode)})` : ''}${subj ? ` &nbsp; <b>Subject:</b> ${esc(subj)}` : ''}</p>
<h2>Marks added by teacher (Marks Sheet)</h2>
<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%">
<tr style="background:#ede9fe"><th>Subject</th><th>CATs</th><th>Total</th><th>%</th></tr>
${docRows || '<tr><td colspan="4">No marks yet</td></tr>'}
<tr style="background:#f1f5f9"><td colspan="2"><b>GRAND TOTAL</b></td><td style="text-align:center"><b>${grandObt}/${grandMax}</b></td><td style="text-align:center"><b>${grandPct}%</b></td></tr>
</table>
${quizRows ? `<h2>UClass quiz marks</h2>
<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%">
<tr style="background:#f0fdf4"><th>Quiz</th><th>Subject</th><th>Score</th><th>Date</th></tr>
${quizRows}
</table>` : ''}
<p style="color:#64748b;font-size:12px">Report sent via UClass by the teacher.</p>
</body></html>`;
      const docName = `AMANOTA-${s.name.replace(/[^a-zA-Z0-9]+/g, '_')}.doc`;
      const attachments = [{ filename: docName, content: Buffer.from(docHtml, 'utf8'), type: 'application/msword' }];

      // ---------- HTML email ----------
      let inviteLink = '';
      try {
        const inviteToken = await getOrCreateParentInviteToken(s.student_id, req.user.id);
        inviteLink = `${frontendBase}${buildParentInvitePath(inviteToken)}`;
      } catch (e) {
        console.error('[cat notify invite]', e.message);
      }
      const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f0f2f5;font-family:'Segoe UI',Tahoma,sans-serif;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:0 0 16px 16px;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:24px 28px;text-align:center;">
    <div style="font-size:32px;">🎓</div>
    <h1 style="color:#fff;font-size:19px;margin:8px 0 4px;">REBA AMANOTA AMAZE KUGIRA MU MYITOZO YO MU ISHURI</h1>
    <p style="color:rgba(255,255,255,0.9);font-size:13px;margin:0;">${esc(schoolName)} · ${esc(className)}${classCode ? ` · ${esc(classCode)}` : ''}${subj ? ` · ${esc(subj)}` : ''}</p>
    <p style="color:rgba(255,255,255,0.85);font-size:13px;margin:4px 0 0;">Student: <b>${esc(s.name)}</b></p>
  </div>
  <div style="padding:20px 28px 0;">
    <div style="background:#fefce8;border:1px solid #facc15;border-radius:10px;padding:12px 16px;">
      <p style="margin:0;font-size:14px;color:#713f12;font-weight:600;">📎 WORD DOCUMENT ATTACHED — <b>${esc(docName)}</b>. Download it from the attachment above and open it in Word to see the full marks report.</p>
    </div>
  </div>
  <div style="padding:16px 28px;">
    <h3 style="color:#075e54;font-size:15px;margin:0 0 10px;">📝 Marks added by teacher (Marks Sheet)</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="background:#ede9fe;">
        <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #c4b5fd;">Subject</th>
        <th style="padding:8px 8px;text-align:left;border-bottom:2px solid #c4b5fd;">CATs</th>
        <th style="padding:8px 8px;text-align:center;border-bottom:2px solid #c4b5fd;">Total</th>
        <th style="padding:8px 8px;text-align:center;border-bottom:2px solid #c4b5fd;">%</th>
      </tr></thead>
      <tbody>
        ${Object.entries(bySubj).map(([sname, items]) => {
          const tot = items.reduce((a, i) => a + Number(i.marks_obtained), 0);
          const mx = items.reduce((a, i) => a + Number(i.total_marks), 0);
          const pct = mx ? ((tot / mx) * 100).toFixed(0) : '0';
          const color = pct >= 70 ? '#16a34a' : pct >= 50 ? '#b45309' : '#e11d48';
          const detail = items.map(i => `CAT ${i.test_number}: ${i.marks_obtained}/${i.total_marks}`).join(', ');
          return `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-weight:600;">${esc(sname)}</td>
            <td style="padding:8px 8px;border-bottom:1px solid #f1f5f9;font-size:12px;">${esc(detail)}</td>
            <td style="padding:8px 8px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:600;">${tot}/${mx}</td>
            <td style="padding:8px 8px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:700;color:${color};">${pct}%</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    <div style="margin-top:14px;background:linear-gradient(135deg,#1e293b 0%,#334155 100%);border-radius:12px;padding:14px 18px;text-align:center;">
      <div style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Grand Total</div>
      <div style="font-size:26px;font-weight:800;color:#fff;">${grandObt}<span style="font-size:15px;color:#94a3b8;">/${grandMax}</span></div>
      <div style="font-size:15px;font-weight:700;color:${grandPct >= 70 ? '#4ade80' : grandPct >= 50 ? '#facc15' : '#f87171'};">${grandPct}%</div>
    </div>
    ${quizzes.length ? `
    <h3 style="color:#075e54;font-size:15px;margin:20px 0 10px;">💻 UClass quiz marks</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="background:#f0fdf4;">
        <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #bbf7d0;">Quiz</th>
        <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #bbf7d0;">Score</th>
      </tr></thead>
      <tbody>${quizzes.map(q => `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">${esc(q.title)} <span style="font-size:11px;color:#7c3aed;">[${esc(q.subject)}]</span></td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;">${q.score}${q.total ? '/' + q.total : '%'}</td>
      </tr>`).join('')}</tbody>
    </table>` : ''}
    <p style="margin-top:16px;font-size:13px;color:#475569;">📎 The full marks document (<b>${esc(docName)}</b>) is attached to this email — download and open it in Word.</p>
    ${inviteLink ? `<div style="margin-top:16px;text-align:center;"><a href="${inviteLink}" style="display:inline-block;background:linear-gradient(135deg,#25d366,#128c7e);color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:14px;font-weight:700;">🔐 Sign up to view all progress</a></div>` : ''}
  </div>
  <div style="padding:14px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;">
    <p style="font-size:12px;color:#64748b;margin:0;text-align:center;">Sent by your child's teacher via UClass. Reply to reach the school.</p>
  </div>
</div></body></html>`;

      // ---------- Deliver ----------
      const emailSubject = `REBA AMANOTA — ${s.name} (${className}${subj ? ' · ' + subj : ''})`;
      for (const p of parents) {
        await insertParentNotification({
          parentId: p.id,
          studentId: s.student_id,
          senderId: req.user.id,
          type: 'marks_sheet',
          title,
          body,
          payload: { classId: Number(classId), studentId: s.student_id, subject: subj || null },
        });
        if (also_email && p.email) {
          const r = await maybeEmailParent({
            parentEmail: p.email, subject: emailSubject, text: body, html,
            alsoEmail: true, attachments,
          });
          if (r.sent) emailed++; else if (!emailFailReason) emailFailReason = r.reason || 'unknown';
        }
      }
      if (also_email && savedEmail) {
        const alreadyEmailed = parents.some(p => p.email === savedEmail);
        if (!alreadyEmailed) {
          const r = await maybeEmailParent({
            parentEmail: savedEmail, subject: emailSubject, text: body, html,
            alsoEmail: true, attachments,
          });
          if (r.sent) emailed++; else if (!emailFailReason) emailFailReason = r.reason || 'unknown';
        }
      }
      notified++;
    }

    let message = `Marks Sheet sent to ${notified} student parent(s). ${emailed} emailed with the Word document.`;
    if (noParent) message += ` ${noParent} student(s) have no linked parent/email.`;
    if (noMarks) message += ` ${noMarks} student(s) had no marks yet (skipped).`;
    if (also_email && emailed === 0 && notified > 0) {
      message += emailFailReason === 'not_configured'
        ? ' Emails not sent: email service not configured on server.'
        : ` Email failed: ${emailFailReason}`;
    }
    res.json({ notified, emailed, no_parent: noParent, no_marks: noMarks, message });
  } catch (err) {
    console.error('[cat_marks] notify-parents error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// MID-TERM REPORT CARD (.doc) — uses ONLY teacher-recorded cat_marks
// ═══════════════════════════════════════════════════════════════════════════
const { sendMail } = require('../lib/optionalMailer');

pool.query(`
  CREATE TABLE IF NOT EXISTS midterm_report_settings (
    class_id INTEGER PRIMARY KEY REFERENCES classes(id) ON DELETE CASCADE,
    school_name TEXT, district TEXT, level TEXT DEFAULT 'Primary',
    academic_year TEXT, term TEXT DEFAULT 'I', authority_email TEXT,
    subjects JSONB, logo TEXT, updated_at TIMESTAMP DEFAULT NOW()
  );
  ALTER TABLE midterm_report_settings ADD COLUMN IF NOT EXISTS authority_email TEXT;
  ALTER TABLE midterm_report_settings ADD COLUMN IF NOT EXISTS removed_subjects JSONB;
`).catch(e => console.error('[midterm settings] migration error:', e.message));

const DEFAULT_SUBJECTS = {
  Primary: ['Mathematics', 'SET', 'Kinyarwanda', 'SRS', 'English', 'French', 'Creative Arts', 'Physical Education'],
  Secondary: ['Geography', 'History', 'Literature in English', 'Entrepreneurship', 'English', 'French', 'Kinyarwanda',
    'General Studies and Communication', 'Computer', 'Library', 'Sports / Clubs'],
};

const gradeFor = (pct) => (pct >= 80 ? 'A' : pct >= 65 ? 'B' : pct >= 50 ? 'C' : pct >= 40 ? 'D' : 'E');
const normSubj = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Per-subject score out of 100 from cat_marks — ACTIVE sheet only (archived sheets never count). */
async function subjectScores(classId, studentId) {
  const sheet = await getActiveSheet(classId);
  const rows = (await pool.query(
    `SELECT subject, SUM(marks_obtained)::float AS m, SUM(COALESCE(NULLIF(total_marks,0),100))::float AS t
     FROM cat_marks WHERE class_id = $1 AND student_id = $2 AND sheet_id = $3 GROUP BY subject`, [classId, studentId, sheet.id]
  )).rows;
  const out = {};
  for (const r of rows) out[canonSubj(r.subject)] = { name: r.subject, score: Math.round((r.m / r.t) * 1000) / 10 };
  return out;
}

/** Ordered union: items in refOrder first (in that order), then the rest alphabetically. */
function orderByRef(items, refOrder) {
  return [...items].sort((a, b) => {
    const ia = refOrder.findIndex((d) => canonSubj(d) === canonSubj(a));
    const ib = refOrder.findIndex((d) => canonSubj(d) === canonSubj(b));
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    return a.localeCompare(b);
  });
}

async function loadSettings(classId) {
  const saved = (await pool.query('SELECT * FROM midterm_report_settings WHERE class_id = $1', [classId])).rows[0];
  // classes link to schools through the owning teacher's school_id
  const cls = (await pool.query(
    `SELECT c.name AS class_name, c.class_code, s.name AS school_name, s.district
     FROM classes c
     LEFT JOIN users t ON t.id = c.teacher_id
     LEFT JOIN schools s ON s.id = t.school_id
     WHERE c.id = $1`, [classId]
  )).rows[0] || {};
  const y = new Date().getFullYear();
  const level = saved?.level || (/^s|sec/i.test(cls.class_name || '') ? 'Secondary' : 'Primary');
  const levelDefaults = DEFAULT_SUBJECTS[level] || [];

  // Subjects the teacher actually recorded marks for — ACTIVE sheet only
  const activeSheet = await getActiveSheet(classId);
  const recorded = (await pool.query(
    `SELECT DISTINCT subject FROM cat_marks WHERE class_id = $1 AND subject IS NOT NULL AND sheet_id = $2 ORDER BY subject`, [classId, activeSheet.id]
  )).rows.map((r) => r.subject).filter(Boolean);

  const savedList = (Array.isArray(saved?.subjects) ? saved.subjects : [])
    .filter((s) => s && normSubj(s) !== 'general');
  const removedSaved = new Set((Array.isArray(saved?.removed_subjects) ? saved.removed_subjects : []).map(canonSubj));
  const recordedOrdered = orderByRef(recorded.filter((r) => normSubj(r) !== 'general'), levelDefaults);

  // Default authority email = the school's head teacher (auto-filled, editable)
  const htEmail = (await pool.query(
    `SELECT u.email FROM classes c
     JOIN users t ON t.id = c.teacher_id
     JOIN users u ON u.school_id = t.school_id AND u.role = 'head_teacher'
     WHERE c.id = $1 LIMIT 1`, [classId]
  )).rows[0]?.email || '';

  // Subject list rule:
  //  - fresh class → the FULL standard list for the level + any recorded extras (arranged like the shared report card)
  //  - after teacher edits → their list is kept, but any newly-recorded subject is appended (marks never drop silently)
  let subjects;
  if (savedList.length) {
    subjects = [...savedList];
    for (const r of recordedOrdered) {
      if (removedSaved.has(canonSubj(r))) continue;
      if (!subjects.some((s) => canonSubj(s) === canonSubj(r))) subjects.push(r);
    }
  } else {
    subjects = orderByRef([...levelDefaults, ...recordedOrdered.filter((r) => !levelDefaults.some((d) => canonSubj(d) === canonSubj(r)))], levelDefaults);
  }
  // dedupe canonical duplicates (e.g. "SET" + "Science and Elementary Technology (SET)")
  subjects = subjects.filter((s, i) => subjects.findIndex((x) => canonSubj(x) === canonSubj(s)) === i);

  return {
    class_name: cls.class_name || '',
    school_name: saved?.school_name || cls.school_name || '',
    district: saved?.district || cls.district || '',
    level,
    academic_year: saved?.academic_year || `${y}-${y + 1}`,
    term: saved?.term || 'I',
    authority_email: saved?.authority_email || htEmail,
    subjects,
    recorded_subjects: recordedOrdered,
    logo: saved?.logo || null,
    defaults: DEFAULT_SUBJECTS,
  };
}

/** Grade bands printed on the comprehensive report: A 80-100, B 60-79, C 0-59. */
const gradeABC = (pct) => (pct >= 80 ? 'A' : pct >= 60 ? 'B' : 'C');
/** 1-2 word teacher comment matching the mark, printed in Short comments. */
const commentFor = (pct) => (pct >= 90 ? 'Outstanding' : pct >= 80 ? 'Excellent' : pct >= 70 ? 'Good' : pct >= 60 ? 'Fair' : pct >= 50 ? 'Improve' : pct >= 40 ? 'Weak' : 'Needs help');
/** Canonical subject key — variants recorded under different names map to one report row. */
const canonSubj = (n) => {
  const k = normSubj(n);
  if (k === 'ssr' || k === 'sst' || k === 'srs' || k.startsWith('socialandreligious')) return 'srs';
  if (k === 'set' || k.startsWith('scienceandelementary')) return 'set';
  if (k.startsWith('physicaleducation') || k === 'pheducation' || k === 'pes') return 'physicaleducation';
  return k.replace(/s$/, '');
};
/** Printed subject name — variants render as the short report name. */
const displaySubj = (n) => ({ srs: 'SRS', set: 'SET', physicaleducation: 'Physical Education' }[canonSubj(n)] || n);
/** Auto NEXT STEPS sentences from the recorded marks (weakest subjects first). */
function nextStepLines(subjects, scores, comment) {
  const withMarks = subjects
    .map((n) => ({ n: displaySubj(n), s: scores[canonSubj(n)]?.score }))
    .filter((x) => x.s != null)
    .sort((a, b) => a.s - b.s);
  const lines = [];
  if (comment) lines.push(comment.replace(/\n/g, ' '));
  for (const x of withMarks) {
    if (lines.length >= 3) break;
    lines.push(x.s < 60 ? `Needs help in ${x.n} (${x.s}%).` : x.s < 80 ? `Improve ${x.n}.` : `Keep up ${x.n}.`);
  }
  const fill = ['Continue practising all subjects daily.', 'Monitor homework and class participation.', 'Encourage regular reading and revision.'];
  for (const f of fill) { if (lines.length >= 3) break; lines.push(f); }
  return lines.slice(0, 3);
}

/** Build the two-page (front + back) Mid term comprehensive assessment report for one student. */
function buildReportHtml({ student, teacherName, schoolName, district, level, year, term, logo, comment, subjects, scores }) {
  let total = 0;
  let counted = 0;
  const rowsHtml = subjects.map((name, i) => {
    const sc = scores[canonSubj(name)];
    const mark = sc ? sc.score : null;
    if (mark !== null) { total += mark; counted += 1; }
    const markTxt = mark === null ? '' : (Number.isInteger(mark) ? mark : mark.toFixed(1));
    return `<tr>
      <td class="b">${i + 1}</td>
      <td class="b">${escHtml(displaySubj(name))}</td>
      <td class="c">${markTxt}</td>
      <td class="c">${mark === null ? '' : gradeABC(mark)}</td>
      <td>${mark === null ? '&nbsp;' : escHtml(commentFor(mark))}</td>
    </tr>`;
  }).join('');
  const outOf = subjects.length * 100;
  const totalTxt = Number.isInteger(total) ? total : total.toFixed(1);
  const pct = outOf ? Math.round((total / outOf) * 1000) / 10 : 0;
  const dots = (n) => '.'.repeat(n);
  const box = '&#9744;';
  const nextSteps = nextStepLines(subjects, scores, comment).map((l) => escHtml(l));

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Mid term comprehensive assessment report</title><style>
    @page { size: A4; margin: 1.6cm 1.8cm; }
    body{font-family:'Times New Roman',Times,serif;font-size:11pt;color:#000;margin:0;}
    @media screen { .page{max-width:800px;margin:0 auto;padding:10px 0 24px;} .page.last{border-top:3px dashed #94a3b8;padding-top:24px;} .page.last:before{content:'BACK PAGE';display:block;text-align:center;color:#94a3b8;font:bold 10pt Arial;margin-bottom:12px;} }
    .hdr{width:100%;border-collapse:collapse;}
    .hdr td{border:none;vertical-align:top;padding:0;}
    .hdr .lines{font-weight:bold;font-size:11.5pt;line-height:1.3;}
    .hdr .names{font-size:13pt;}
    h2{text-align:center;text-decoration:underline;font-size:13pt;font-weight:bold;margin:14px 0 4px;}
    h3{font-size:12pt;font-weight:bold;margin:2px 0 2px 30px;}
    table.t{border-collapse:collapse;width:100%;font-size:10.5pt;}
    table.t th,table.t td{border:1px solid #000;padding:4px 6px;vertical-align:top;}
    table.t th{font-weight:bold;text-align:left;}
    table.t td.c{text-align:center;}
    table.t td.b{font-weight:bold;}
    .sec{text-align:center;font-weight:bold;font-size:11.5pt;margin:18px 0 0;}
    .sub{font-size:10.5pt;margin:0 0 4px 30px;}
    .lbl{font-weight:bold;font-size:11pt;margin:16px 0 2px;text-align:center;}
    .ns{margin:16px 0 0 30px;font-size:11pt;}
    .ns ol{margin:8px 0 0 20px;padding-left:20px;}
    .ns li{margin-bottom:10px;line-height:1.5;}
    .sig{margin:18px 0 0 30px;font-size:11pt;}
    .sig p{margin:0 0 6px;}
    .sig .ln{margin:4px 0 16px;}
  </style></head><body>

  <!-- ===================== FRONT ===================== -->
  <div class="page">
    <table class="hdr"><tr>
      <td style="width:120px;">${logo ? `<img src="${logo}" alt="logo" width="100" style="width:100px;max-height:110px;"/>` : ''}</td>
      <td class="lines">
        ${escHtml((district || '').toUpperCase())}${district ? ' DISTRICT' : ''}<br/>
        ${escHtml((schoolName || 'SCHOOL NAME').toUpperCase())}<br/>
        Academic Year: ${year ? escHtml(year) : dots(28)} &nbsp;Term: ${term ? escHtml(term) : dots(28)}<br/>
        <span class="names">Names: ${student?.name ? escHtml(student.name) : dots(60)}</span>
      </td>
    </tr></table>

    <h2>Mid term comprehensive assessment report</h2>
    <h3>Grades</h3>
    <table class="t" width="100%" style="margin-bottom:16px;table-layout:fixed;">
      <tr><td width="22%" style="width:22%;background:#00b050;">&nbsp;</td><td width="10%" style="width:10%" class="b">(80-100)</td><td width="6%" style="width:6%" class="b">A</td><td width="62%" style="width:62%" class="b">Above expectation/Birahebuje</td></tr>
      <tr><td style="background:#ffff00;">&nbsp;</td><td class="b">(60-79)</td><td class="b">B</td><td class="b">On target/Yakoze neza</td></tr>
      <tr><td style="background:#ff0000;">&nbsp;<br/>&nbsp;</td><td class="b">(0-59)</td><td class="b">C</td><td class="b">Below exoectation/Akeneye ubufasha bwisumbuyeho</td></tr>
    </table>

    <table class="t" width="100%" style="table-layout:fixed;">
      <tr><th width="7%" style="width:7%">#</th><th width="19%" style="width:19%">Subjects</th><th width="21%" style="width:21%">Marks out of 100</th><th width="12%" style="width:12%">Grade</th><th width="41%" style="width:41%">Short comments</th></tr>
      ${rowsHtml}
      <tr><td class="b">#</td><td class="b">Total</td><td class="c b">${counted ? `${totalTxt} / ${outOf}` : ''}</td><td class="c b">${counted ? gradeABC(pct) : ''}</td><td>&nbsp;</td></tr>
      <tr><td></td><td class="b">%</td><td class="c b">${counted ? `${pct}%` : ''}</td><td></td><td>&nbsp;</td></tr>
    </table>

    <div class="sec">LEARNER DEVELOPMENT AND PARTICIPATION</div>
    <div class="sub">(Imyitwarire n&rsquo;iterambere by&rsquo;umunyeshuri mu myigire) <i>Tick (&#10003;) the statement that best describes the learner</i></div>
    <table class="t" width="100%" style="table-layout:fixed;">
      <tr><td width="22%" style="width:22%" class="c">Area</td><td width="24%" style="width:24%">Positive (Bimeze neza)</td><td width="26%" style="width:26%">Developing(birimo gutera imbere)</td><td width="28%" style="width:28%">Needs Support (Akeneye ubufasha)</td></tr>
      <tr><td>Attitude to Learning/ <i>Uko yitwara mu myigire</i></td><td>Curious, attentive and actively participates in learning.</td><td>Participates and remains attentive with occasional prompting.</td><td>Needs support to remain focused and engaged in learning.</td></tr>
      <tr><td>Collaboration <i>Gukorana n&rsquo;abandi</i></td><td>Cooperates, shares ideas and supports others.</td><td>Participates in group activities with encouragement.</td><td>Needs support to cooperate and participate effectively with others.</td></tr>
      <tr><td>Communication <i>Itumanaho</i></td><td>Expresses ideas clearly and listens to others.</td><td>Shares ideas with some encouragement.</td><td>Needs support to express ideas and communicate with others.</td></tr>
    </table>
  </div>

  <!-- ===================== BACK ===================== -->
  <br clear="all" style="page-break-before:always;mso-break-type:page-break;" />
  <div class="page last">
    <table class="t" width="100%" style="table-layout:fixed;">
      <tr><td width="22%" style="width:22%">Independence <i>Kwikorera/kwigenga</i></td><td width="24%" style="width:24%">Works independently and completes tasks confidently.</td><td width="26%" style="width:26%">Completes tasks with some support.</td><td width="28%" style="width:28%">Needs regular support to complete learning tasks.</td></tr>
      <tr><td>Attendance &amp; Punctuality<i>Ubwitabire n&rsquo;igihe</i></td><td>Consistently attends and arrives on time.</td><td>Generally attends and arrives on time.</td><td>Frequent absence or lateness affects learning.</td></tr>
    </table>

    <div class="lbl">Areas of Progress</div>
    <table class="t" width="100%" style="table-layout:fixed;">
      <tr><td width="50%" style="width:50%">Progress observed</td><td width="50%" style="width:50%" class="c">Priority for development</td></tr>
      <tr>
        <td>${box} Mathematics ${box} Kinyarwanda ${box} Science ${box} social studies ${box} English other:____________</td>
        <td>${box} Mathematics ${box} Kinyarwanda ${box} Science ${box} social studies ${box} English ${box} Other: ___________</td>
      </tr>
    </table>

    <div class="ns">
      <b>NEXT STEPS(Intambwe ikurikira mu iterambere ry&rsquo;umunyeshuri)</b><br/>
      <i>What should the learner focus on during the next half of the term?</i><br/>
      <i>Ni iki umunyeshuri akwiriye kwibandaho mu gice gikurikira cy&rsquo;igihembwe?</i>
      <ol>
        <li>${nextSteps || dots(95)}<br/>${dots(100)}</li>
        <li>${dots(95)}<br/>${dots(100)}</li>
        <li>${dots(95)}<br/>${dots(100)}</li>
      </ol>
    </div>

    <div class="sig">
      <p>Teachers&rsquo; name and signature</p>
      <div class="ln">${teacherName ? `${escHtml(teacherName)} &nbsp;` : ''}${dots(teacherName ? 50 : 75)}</div>
      <p>Parent&rsquo;s name and signature</p>
      <div class="ln">${dots(75)}</div>
      <p>School stamp and &nbsp;Signature</p>
      <div class="ln">${dots(75)}</div>
    </div>
  </div>
  </body></html>`;
}

async function resolveReportParams(classId, body) {
  const b = body || {};
  const prev = await loadSettings(classId);
  const level = ['Primary', 'Secondary'].includes(b.level) ? b.level : prev.level;
  const subjects = (Array.isArray(b.subjects) ? b.subjects : prev.subjects)
    .map((s) => String(s || '').trim()).filter(Boolean).slice(0, 30);
  const kept = new Set(subjects.map(canonSubj));
  const removedSubjects = (prev.recorded_subjects || []).filter((r) => !kept.has(canonSubj(r)));
  return {
    level,
    subjects,
    schoolName: String(b.school_name ?? prev.school_name).trim(),
    district: String(b.district ?? prev.district).trim(),
    year: String(b.academic_year ?? prev.academic_year).trim(),
    term: String(b.term ?? prev.term).trim() || 'I',
    authorityEmail: String(b.authority_email ?? prev.authority_email).trim(),
    logo: b.logo === null ? null : (typeof b.logo === 'string' && /^data:image\/(png|jpe?g|gif|webp);base64,/.test(b.logo) && b.logo.length < 700000 ? b.logo : prev.logo),
    comment: String(b.teacher_comment || '').trim(),
    className: prev.class_name,
    removedSubjects,
  };
}

async function saveSettings(classId, p) {
  await pool.query(
    `INSERT INTO midterm_report_settings (class_id, school_name, district, level, academic_year, term, authority_email, subjects, logo, removed_subjects, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
     ON CONFLICT (class_id) DO UPDATE SET school_name=$2, district=$3, level=$4, academic_year=$5, term=$6, authority_email=$7, subjects=$8, logo=$9, removed_subjects=$10, updated_at=NOW()`,
    [classId, p.schoolName, p.district, p.level, p.year, p.term, p.authorityEmail, JSON.stringify(p.subjects), p.logo, JSON.stringify(p.removedSubjects || [])]
  );
}

function buildClassSummaryHtml({ teacherName, schoolName, district, level, year, term, logo, className, subjects, students }) {
  const outOf = subjects.length * 100;
  const rowsHtml = students.map((s, i) => {
    const g = s.pct === null ? '' : gradeFor(s.pct);
    return `<tr>
      <td class="c">${i + 1}</td>
      <td>${escHtml(s.name)}</td>
      <td class="c">${s.total === null ? '' : s.total}</td>
      <td class="c">${s.pct === null ? '' : s.pct + '%'}</td>
      <td class="c b">${g}</td>
    </tr>`;
  }).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 1.2cm; }
    body{font-family:'Times New Roman',Times,serif;font-size:12pt;color:#000;margin:0;}
    .frame{border:3px double #000;padding:16px 22px;}
    .hdr{width:100%;border-collapse:collapse;}
    .hdr td{border:none;vertical-align:top;padding:0;}
    .hdr .lines{font-weight:bold;font-size:13pt;line-height:1.4;text-transform:uppercase;}
    h2{text-align:center;text-decoration:underline;font-size:14pt;margin:14px 0 10px;font-family:Arial,Helvetica,sans-serif;}
    table.m{border-collapse:collapse;margin:0 auto;width:100%;font-size:11pt;table-layout:fixed;}
    table.m th,table.m td{border:1px solid #000;padding:5px 7px;}
    table.m th{font-weight:bold;text-align:center;}
    table.m td.c{text-align:center;}
    table.m td.b{font-weight:bold;}
    .foot{width:100%;margin-top:26px;border-collapse:collapse;font-size:10.5pt;}
    .foot td{border:none;padding-top:26px;width:50%;}
    .foot .ln{border-top:1px solid #000;width:220px;padding-top:4px;}
  </style></head><body>
  <div class="frame">
    <table class="hdr"><tr>
      <td class="lines">
        ${escHtml(district || '')} DISTRICT<br/>
        ${escHtml(schoolName || '')}<br/>
        ${escHtml(level)} ${escHtml(year)}<br/>
        ${escHtml(className)} — CLASS MARKS LIST
      </td>
      <td style="width:110px;text-align:right;">${logo ? `<img src="${logo}" alt="logo" width="90" style="width:90px;max-height:110px;"/>` : ''}</td>
    </tr></table>
    <h2>MID-TERM ${escHtml(term)} — STUDENTS RANKED BY MARKS</h2>
    <table class="m">
      <colgroup><col style="width:8%"/><col/><col style="width:16%"/><col style="width:14%"/><col style="width:12%"/></colgroup>
      <tr><th>#</th><th>Student Name</th><th>Total /${outOf}</th><th>Average</th><th>Grade</th></tr>
      ${rowsHtml}
    </table>
    <table class="foot"><tr>
      <td><div class="ln">Class Teacher<br/>${escHtml(teacherName)}</div></td>
      <td style="text-align:right;"><div class="ln" style="margin-left:auto;">Head Teacher &amp; Stamp</div></td>
    </tr></table>
  </div>
  </body></html>`;
}

// GET /:classId/midterm-report/prefill?student_id=  → settings + detected subject scores
router.get('/:classId/midterm-report/prefill', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = req.params.classId;
  try {
    const manage = await userCanManageClass(req.user, classId);
    if (!manage?.ok) return res.status(403).json({ error: 'Not your class.' });
    const settings = await loadSettings(classId);
    const studentId = parseInt(req.query.student_id, 10);
    const scores = studentId ? await subjectScores(classId, studentId) : {};
    const roster = (await pool.query(
      `SELECT u.id, u.name FROM class_members cm JOIN users u ON u.id = cm.student_id
       WHERE cm.class_id = $1 ORDER BY u.name`, [classId]
    )).rows;
    res.json({ ...settings, scores: Object.values(scores), roster });
  } catch (err) {
    console.error('[midterm prefill]', err.message);
    res.status(500).json({ error: 'Could not load report settings.' });
  }
});

// POST /:classId/midterm-report → .doc download (or HTML preview with preview:true)
router.post('/:classId/midterm-report', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = req.params.classId;
  const studentId = parseInt(req.body.student_id, 10);
  if (!studentId) return res.status(400).json({ error: 'student_id is required.' });
  try {
    const manage = await userCanManageClass(req.user, classId);
    if (!manage?.ok) return res.status(403).json({ error: 'You cannot generate reports for this class.' });

    const student = (await pool.query(
      `SELECT u.id, u.name FROM class_members cm JOIN users u ON u.id = cm.student_id
       WHERE cm.class_id = $1 AND u.id = $2`, [classId, studentId]
    )).rows[0];
    if (!student) return res.status(404).json({ error: 'Student not found in this class.' });

    const p = await resolveReportParams(classId, req.body);
    await saveSettings(classId, p);

    const scores = await subjectScores(classId, studentId);
    const teacherName = (await pool.query('SELECT name FROM users WHERE id=$1', [req.user.id])).rows[0]?.name || '';
    const doc = buildReportHtml({ student, teacherName, schoolName: p.schoolName, district: p.district, level: p.level, year: p.year, term: p.term, logo: p.logo, comment: p.comment, subjects: p.subjects, scores });

    if (req.body.preview) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(doc);
    }
    const safe = String(student.name || 'student').replace(/[^\w]+/g, '-').slice(0, 60);
    res.setHeader('Content-Type', 'application/msword');
    res.setHeader('Content-Disposition', `attachment; filename="MidTerm-${p.term}-Report-${safe}.doc"`);
    res.send('﻿' + doc);
  } catch (err) {
    console.error('[midterm report]', err.message);
    res.status(500).json({ error: 'Could not build the report right now.' });
  }
});

/** Build every report file for the class: proclamation + marks list + one .doc per student. */
async function collectReportFiles(classId, body, user) {
  const manage = await userCanManageClass(user, classId);
  if (!manage?.ok) return { error: 'You cannot generate reports for this class.', status: 403 };

  const p = await resolveReportParams(classId, body);
  let roster = (await pool.query(
    `SELECT u.id, u.name FROM class_members cm JOIN users u ON u.id = cm.student_id
     WHERE cm.class_id = $1 ORDER BY u.name`, [classId]
  )).rows;
  const picked = Array.isArray(body.student_ids) ? body.student_ids.map((x) => parseInt(x, 10)).filter(Boolean) : null;
  if (picked) roster = roster.filter((s) => picked.includes(s.id));
  if (!roster.length) return { error: 'No students selected.', status: 400 };

  const teacherName = (await pool.query('SELECT name FROM users WHERE id=$1', [user.id])).rows[0]?.name || '';
  const files = [];
  const summary = [];
  for (const student of roster) {
    const scores = await subjectScores(classId, student.id);
    const doc = buildReportHtml({ student, teacherName, schoolName: p.schoolName, district: p.district, level: p.level, year: p.year, term: p.term, logo: p.logo, comment: p.comment, subjects: p.subjects, scores });
    const safe = String(student.name || 'student').replace(/[^\w]+/g, '-').slice(0, 60);
    files.push({ name: `MidTerm-${p.term}-Report-${safe}.doc`, data: Buffer.from('﻿' + doc, 'utf8') });
    let total = 0; let marked = 0;
    for (const s of p.subjects) {
      const sc = scores[canonSubj(s)];
      if (sc) { total += sc.score; marked += 1; }
    }
    summary.push({ name: student.name, total: marked ? Math.round(total * 10) / 10 : null, pct: marked ? Math.round(total / (p.subjects.length * 100) * 1000) / 10 : null });
  }
  summary.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
  const summaryDoc = buildClassSummaryHtml({
    teacherName, schoolName: p.schoolName, district: p.district, level: p.level, year: p.year,
    term: p.term, logo: p.logo, className: p.className, subjects: p.subjects, students: summary,
  });
  files.unshift({ name: `01-Class-Marks-List-MidTerm-${p.term}.doc`, data: Buffer.from('﻿' + summaryDoc, 'utf8') });

  const sheet = await getActiveSheet(classId);
  const procRows = await proclamationRows(classId, p.subjects, picked);
  const procDoc = buildProclamationHtml({
    teacherName, schoolName: p.schoolName, district: p.district, level: p.level,
    year: p.year, term: p.term, logo: p.logo, className: p.className,
    sheetName: sheet.name, subjects: p.subjects, students: procRows, classAvg: classAvgOf(procRows),
  });
  files.unshift({ name: `00-Proclamation-${p.className.replace(/[^\w]+/g, '-')}-MidTerm-${p.term}.doc`, data: Buffer.from('﻿' + procDoc, 'utf8') });

  return { files, roster, p, teacherName, picked };
}

// POST /:classId/midterm-report/folder — build the reports folder and return its link (no email)
router.post('/:classId/midterm-report/folder', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = req.params.classId;
  try {
    const out = await collectReportFiles(classId, req.body, req.user);
    if (out.error) return res.status(out.status || 500).json({ error: out.error });
    await saveSettings(classId, out.p);
    const folderToken = saveReportFolder(out.files, { className: out.p.className, term: out.p.term, schoolName: out.p.schoolName });
    res.json({ ok: true, count: out.files.length, students: out.roster.length, folder_url: `${publicApiBase(req)}/api/catmarks/report-folder/${folderToken}` });
  } catch (err) {
    console.error('[midterm folder]', err.message);
    res.status(500).json({ error: 'Could not build the reports folder right now.' });
  }
});

// POST /:classId/midterm-report/send-all — emails every student's report to the school authority
router.post('/:classId/midterm-report/send-all', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = req.params.classId;
  try {
    // Multiple recipients: authority_emails[] and/or comma/semicolon list in authority_email
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const recipients = [...new Set(
      (Array.isArray(req.body.authority_emails) ? req.body.authority_emails : [])
        .concat(String(req.body.authority_email || '').split(/[,;\s]+/))
        .map((e) => String(e).trim().toLowerCase())
        .filter((e) => emailRx.test(e))
    )];
    if (!recipients.length) {
      return res.status(400).json({ error: 'Add at least one valid email address.' });
    }

    const out = await collectReportFiles(classId, req.body, req.user);
    if (out.error) return res.status(out.status || 500).json({ error: out.error });
    const { files, roster, p, teacherName } = out;
    p.authorityEmail = recipients.join(', '); // persisted so the list is remembered next time
    await saveSettings(classId, p);

    // ONE folder holding every Word report — the email carries a single folder link.
    // Recipient presses it → a folder page opens (like a folder on a PC) → each
    // file downloads straight to their device and opens in Word. No ZIP at all.
    const folderToken = saveReportFolder(files, { className: p.className, term: p.term, schoolName: p.schoolName });
    const folderUrl = `${publicApiBase(req)}/api/catmarks/report-folder/${folderToken}`;

    const subject = `Mid-Term ${p.term} Reports — ${p.className} (${roster.length} students)`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;">
      <h2 style="color:#075e54;margin-bottom:6px;">Mid-Term ${escHtml(p.term)} Report Cards</h2>
      <p style="color:#334155;">
        <strong>${escHtml(p.schoolName || 'School')}</strong>${p.district ? ` · ${escHtml(p.district)} District` : ''}<br/>
        Class: <strong>${escHtml(p.className)}</strong> · Academic Year: <strong>${escHtml(p.year)}</strong>
      </p>
      <p style="color:#334155;"><strong>${escHtml(teacherName)}</strong> prepared <strong>${files.length} Word documents</strong>: the <strong>class proclamation</strong> (ranked marks list), a class marks summary, and <strong>${roster.length}</strong> mid-term report cards — all inside <strong>one folder</strong>.</p>
      <p style="text-align:center;margin:26px 0;">
        <a href="${folderUrl}" style="background:#075e54;color:#ffffff;padding:14px 26px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;display:inline-block;">📁 Open the reports folder</a>
      </p>
      <p style="color:#334155;font-size:14px;">Press the button — the folder opens like a folder on a computer. Inside, press any report to download it to your phone or PC, then open and print it in Word. <strong>No ZIP file</strong> — nothing to extract.</p>
      <p style="color:#64748b;font-size:12.5px;word-break:break-all;">Folder link: <a href="${folderUrl}" style="color:#0b5cad;">${folderUrl}</a><br/>The folder stays available for 45 days.</p>
      <p style="color:#64748b;font-size:13px;margin-top:22px;">Sent from UClass — this is an automated delivery, please do not reply.</p>
    </div>`;
    const text = `Mid-Term ${p.term} reports for ${p.className} — open the folder (${files.length} Word documents inside, no ZIP): ${folderUrl}`;
    let sentTo = 0; let lastReason = '';
    for (const to of recipients) {
      const r = await sendMail({ to, subject, html, text });
      if (r?.sent) sentTo += 1; else lastReason = r?.reason || '';
    }
    if (!sentTo) return res.status(502).json({ error: lastReason || 'Email could not be sent. Check the school email settings.' });
    res.json({ ok: true, sent: roster.length, to: recipients.join(', '), delivered: sentTo, total_recipients: recipients.length, folder_url: folderUrl });
  } catch (err) {
    console.error('[midterm send-all]', err.message);
    res.status(500).json({ error: 'Could not email the reports right now.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PROCLAMATION — class marks board (ranked students, per-subject /100, total, %, class avg)
// Uses ONLY the ACTIVE marks sheet — same data source as the mid-term report.
// ═══════════════════════════════════════════════════════════════════════════

function parseStudentIds(raw) {
  if (raw == null || raw === '') return null; // null = whole class
  const ids = String(raw).split(',').map((x) => parseInt(x, 10)).filter(Boolean);
  return ids;
}

/** Ranked proclamation rows for a class: per-subject /100, total, percentage — ACTIVE sheet only. */
async function proclamationRows(classId, subjects, ids) {
  const roster = (await pool.query(
    `SELECT u.id, u.name FROM class_members cm JOIN users u ON u.id = cm.student_id
     WHERE cm.class_id = $1 ORDER BY u.name`, [classId]
  )).rows.filter((s) => ids === null || ids.includes(s.id));
  const outOf = Math.max(subjects.length, 1) * 100;
  const rows = [];
  for (const st of roster) {
    const scores = await subjectScores(classId, st.id);
    const per = subjects.map((s) => (scores[canonSubj(s)] || {}).score ?? null);
    const marked = per.filter((x) => x !== null);
    const sum = marked.reduce((a, b) => a + b, 0);
    rows.push({
      id: st.id, name: st.name, scores: per,
      total: marked.length ? Math.round(sum * 10) / 10 : null,
      pct: marked.length ? Math.round((sum / outOf) * 1000) / 10 : null,
    });
  }
  rows.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || a.name.localeCompare(b.name));
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

function classAvgOf(rows) {
  const marked = rows.filter((r) => r.pct !== null);
  return marked.length ? Math.round((marked.reduce((a, r) => a + r.pct, 0) / marked.length) * 10) / 10 : null;
}

function buildProclamationHtml({ teacherName, schoolName, district, level, year, term, logo, className, sheetName, subjects, students, classAvg }) {
  const outOf = subjects.length * 100;
  const subjHeads = subjects.map((s) => `<th>${escHtml(s)}<br/><span style="font-weight:normal;font-size:8.5pt;">/100</span></th>`).join('');
  const colW = Math.max(6, Math.floor(58 / Math.max(subjects.length, 1)));
  const rowsHtml = students.map((s) => `<tr>
      <td class="c b">${s.rank}</td>
      <td>${escHtml(s.name)}</td>
      ${s.scores.map((v) => `<td class="c">${v === null ? '—' : v}</td>`).join('')}
      <td class="c b">${s.total === null ? '—' : s.total}</td>
      <td class="c b">${s.pct === null ? '—' : s.pct + '%'}</td>
    </tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { size: A4 landscape; margin: 1.1cm; }
    body{font-family:'Times New Roman',Times,serif;font-size:11pt;color:#000;margin:0;}
    .frame{border:3px double #000;padding:14px 20px;}
    .hdr{width:100%;border-collapse:collapse;}
    .hdr td{border:none;vertical-align:top;padding:0;}
    .hdr .lines{font-weight:bold;font-size:12.5pt;line-height:1.4;text-transform:uppercase;}
    h2{text-align:center;text-decoration:underline;font-size:13.5pt;margin:12px 0 8px;font-family:Arial,Helvetica,sans-serif;}
    table.m{border-collapse:collapse;margin:0 auto;width:100%;font-size:10.5pt;table-layout:fixed;}
    table.m th,table.m td{border:1px solid #000;padding:4px 5px;word-wrap:break-word;}
    table.m th{font-weight:bold;text-align:center;}
    table.m td.c{text-align:center;}
    table.m td.b{font-weight:bold;}
    table.m tr.avg td{background:#eee;font-weight:bold;}
    .foot{width:100%;margin-top:24px;border-collapse:collapse;font-size:10.5pt;}
    .foot td{border:none;padding-top:24px;width:50%;}
    .foot .ln{border-top:1px solid #000;width:220px;padding-top:4px;}
  </style></head><body>
  <div class="frame">
    <table class="hdr"><tr>
      <td class="lines">
        ${escHtml(district || '')} DISTRICT<br/>
        ${escHtml(schoolName || '')}<br/>
        ${escHtml(level)} ${escHtml(year)}<br/>
        ${escHtml(className)} — PROCLAMATION (sheet: ${escHtml(sheetName)})
      </td>
      <td style="width:110px;text-align:right;">${logo ? `<img src="${logo}" alt="logo" width="90" style="width:90px;max-height:110px;"/>` : ''}</td>
    </tr></table>
    <h2>PROCLAMATION — MID-TERM ${escHtml(term)}</h2>
    <table class="m">
      <colgroup><col style="width:5%"/><col style="width:18%"/>${subjects.map(() => `<col style="width:${colW}%"/>`).join('')}<col style="width:9%"/><col style="width:8%"/></colgroup>
      <tr><th>#</th><th>Student Name</th>${subjHeads}<th>Total /${outOf}</th><th>%</th></tr>
      ${rowsHtml}
      <tr class="avg"><td colspan="${2 + subjects.length}">CLASS AVERAGE</td><td class="c"></td><td class="c">${classAvg === null ? '—' : classAvg + '%'}</td></tr>
    </table>
    <table class="foot"><tr>
      <td><div class="ln">Class Teacher<br/>${escHtml(teacherName)}</div></td>
      <td style="text-align:right;"><div class="ln" style="margin-left:auto;">Head Teacher &amp; Stamp</div></td>
    </tr></table>
  </div>
  </body></html>`;
}

// GET /:classId/proclamation?student_ids=1,2 — ranked proclamation data (JSON)
router.get('/:classId/proclamation', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = req.params.classId;
  try {
    const manage = await userCanManageClass(req.user, classId);
    if (!manage?.ok) return res.status(403).json({ error: 'Not your class.' });
    const settings = await loadSettings(classId);
    const sheet = await getActiveSheet(classId);
    const rows = await proclamationRows(classId, settings.subjects, parseStudentIds(req.query.student_ids));
    res.json({
      class_name: settings.class_name, school_name: settings.school_name,
      district: settings.district, level: settings.level, term: settings.term,
      academic_year: settings.academic_year, logo: settings.logo,
      subjects: settings.subjects, total_max: settings.subjects.length * 100,
      sheet: { name: sheet.name },
      students: rows, class_average: classAvgOf(rows),
    });
  } catch (err) {
    console.error('[proclamation]', err.message);
    res.status(500).json({ error: 'Could not build the proclamation right now.' });
  }
});

// GET /:classId/proclamation.doc?student_ids=1,2 — Word proclamation download
router.get('/:classId/proclamation.doc', authenticateToken, requireRole('teacher', 'head_teacher'), async (req, res) => {
  const classId = req.params.classId;
  try {
    const manage = await userCanManageClass(req.user, classId);
    if (!manage?.ok) return res.status(403).json({ error: 'Not your class.' });
    const settings = await loadSettings(classId);
    const sheet = await getActiveSheet(classId);
    const rows = await proclamationRows(classId, settings.subjects, parseStudentIds(req.query.student_ids));
    if (!rows.length) return res.status(400).json({ error: 'No students selected.' });
    const teacherName = (await pool.query('SELECT name FROM users WHERE id=$1', [req.user.id])).rows[0]?.name || '';
    const doc = buildProclamationHtml({
      teacherName, schoolName: settings.school_name, district: settings.district,
      level: settings.level, year: settings.academic_year, term: settings.term,
      logo: settings.logo, className: settings.class_name, sheetName: sheet.name,
      subjects: settings.subjects, students: rows, classAvg: classAvgOf(rows),
    });
    const safe = String(settings.class_name || 'class').replace(/[^\w]+/g, '-').slice(0, 40);
    res.setHeader('Content-Type', 'application/msword; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Proclamation-MidTerm-${settings.term}-${safe}.doc"`);
    res.send('﻿' + doc);
  } catch (err) {
    console.error('[proclamation doc]', err.message);
    res.status(500).json({ error: 'Could not build the proclamation right now.' });
  }
});

module.exports = router;
