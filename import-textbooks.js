// Run on server: node import-textbooks.js
// Downloads P6 REB textbooks and inserts extracted text into the textbooks table.
require('dotenv').config({ override: true });
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Pool } = require('pg');
const pdfParse = require('pdf-parse');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BOOKS = [
  // PB
  { title: 'P6 Mathematics PB',    subject: 'Mathematics',   grade_level: 'P6', book_type: 'PB', url: 'https://elearning.reb.rw/pluginfile.php/177278/mod_folder/content/0/PB/P6%20Mathematics%20PB.pdf?forcedownload=1' },
  { title: 'P6 English PB',        subject: 'English',       grade_level: 'P6', book_type: 'PB', url: 'https://elearning.reb.rw/pluginfile.php/177278/mod_folder/content/0/PB/P6-ENGLISH-PB.pdf?forcedownload=1' },
  { title: 'P6 French PB',         subject: 'French',        grade_level: 'P6', book_type: 'PB', url: 'https://elearning.reb.rw/pluginfile.php/177278/mod_folder/content/0/PB/P6-French-PB.pdf?forcedownload=1' },
  { title: 'P6 Kinyarwanda PB',    subject: 'Kinyarwanda',   grade_level: 'P6', book_type: 'PB', url: 'https://elearning.reb.rw/pluginfile.php/177278/mod_folder/content/0/PB/P6-Kinyarwanda-PB.pdf?forcedownload=1' },
  { title: 'P6 SET PB',            subject: 'SET',           grade_level: 'P6', book_type: 'PB', url: 'https://elearning.reb.rw/pluginfile.php/177278/mod_folder/content/0/PB/P6-SET-PB.pdf?forcedownload=1' },
  { title: 'P6 SST PB',            subject: 'SST',           grade_level: 'P6', book_type: 'PB', url: 'https://elearning.reb.rw/pluginfile.php/177278/mod_folder/content/0/PB/P6-SST-PB%20%281%29.pdf?forcedownload=1' },
  { title: 'P6 Creative Arts PB',  subject: 'Creative Arts', grade_level: 'P6', book_type: 'PB', url: 'https://elearning.reb.rw/pluginfile.php/177278/mod_folder/content/0/PB/P6-Creative%20Arts-PB.pdf?forcedownload=1' },
  // TG
  { title: 'P6 Mathematics TG',    subject: 'Mathematics',   grade_level: 'P6', book_type: 'TG', url: 'https://elearning.reb.rw/pluginfile.php/177278/mod_folder/content/0/TG/P6%20Mathematics%20TG.pdf?forcedownload=1' },
  { title: 'P6 English TG',        subject: 'English',       grade_level: 'P6', book_type: 'TG', url: 'https://elearning.reb.rw/pluginfile.php/177278/mod_folder/content/0/TG/P6-ENGLISH-TG.pdf?forcedownload=1' },
  { title: 'P6 French TG',         subject: 'French',        grade_level: 'P6', book_type: 'TG', url: 'https://elearning.reb.rw/pluginfile.php/177278/mod_folder/content/0/TG/P6-French-TG.pdf?forcedownload=1' },
  { title: 'P6 Kinyarwanda TG',    subject: 'Kinyarwanda',   grade_level: 'P6', book_type: 'TG', url: 'https://elearning.reb.rw/pluginfile.php/177278/mod_folder/content/0/TG/P6-Kinyarwanda-TG.pdf?forcedownload=1' },
  { title: 'P6 PES TG',            subject: 'PES',           grade_level: 'P6', book_type: 'TG', url: 'https://elearning.reb.rw/pluginfile.php/177278/mod_folder/content/0/TG/P6-PES-TG.pdf?forcedownload=1' },
  { title: 'P6 SET TG',            subject: 'SET',           grade_level: 'P6', book_type: 'TG', url: 'https://elearning.reb.rw/pluginfile.php/177278/mod_folder/content/0/TG/P6-SET-TG.pdf?forcedownload=1' },
  { title: 'P6 SST TG',            subject: 'SST',           grade_level: 'P6', book_type: 'TG', url: 'https://elearning.reb.rw/pluginfile.php/177278/mod_folder/content/0/TG/P6-SST-TG%20%284%29.pdf?forcedownload=1' },
  { title: 'P6 Creative Arts TG',  subject: 'Creative Arts', grade_level: 'P6', book_type: 'TG', url: 'https://elearning.reb.rw/pluginfile.php/177278/mod_folder/content/0/TG/P6-Creative%20Arts-TG.pdf?forcedownload=1' },
];

// Use curl to avoid Node's strict HTTP header parser rejecting non-ASCII headers
function download(url) {
  const tmpFile = path.join(os.tmpdir(), `reb_tb_${Date.now()}.pdf`);
  try {
    execSync(
      `curl -sS -L --max-time 120 -A "Mozilla/5.0" -o "${tmpFile}" "${url}"`,
      { stdio: ['ignore', 'ignore', 'pipe'] }
    );
    const buffer = fs.readFileSync(tmpFile);
    return buffer;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
}

async function main() {
  console.log('=== REB P6 Textbook Importer ===\n');

  for (const book of BOOKS) {
    console.log(`[${BOOKS.indexOf(book) + 1}/${BOOKS.length}] ${book.title}`);
    try {
      const exists = await pool.query(
        'SELECT id FROM textbooks WHERE title = $1',
        [book.title]
      );
      if (exists.rows.length > 0) {
        console.log(`  → SKIP (already in DB, id=${exists.rows[0].id})\n`);
        continue;
      }

      process.stdout.write('  → Downloading... ');
      const buffer = download(book.url);
      console.log(`${(buffer.length / 1024).toFixed(0)} KB`);

      process.stdout.write('  → Parsing PDF... ');
      const data = await pdfParse(buffer);
      // Collapse whitespace but keep paragraph breaks
      const content = data.text
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      console.log(`${content.length} chars, ${data.numpages} pages`);

      await pool.query(
        `INSERT INTO textbooks (title, subject, grade_level, book_type, file_name, content)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [book.title, book.subject, book.grade_level, book.book_type, book.title + '.pdf', content]
      );
      console.log(`  → INSERTED ✓\n`);
    } catch (err) {
      console.error(`  → ERROR: ${err.message}\n`);
    }
  }

  const { rows } = await pool.query(
    "SELECT subject, book_type, LEFT(title,40) as title FROM textbooks WHERE grade_level='P6' ORDER BY subject, book_type"
  );
  console.log('\n=== Textbooks in DB ===');
  rows.forEach(r => console.log(`  ${r.book_type}  ${r.subject.padEnd(14)} ${r.title}`));

  await pool.end();
  console.log('\nDone!');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
