const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const { getUploadsRoot } = require('../lib/uploads');

const router = express.Router();

const OFFICE_EXTS = ['.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx'];

// Convert an office file to a cached PDF using LibreOffice headless.
function convertOfficeToPdf(inputPath) {
  return new Promise((resolve, reject) => {
    const ext = path.extname(inputPath).toLowerCase();
    if (!OFFICE_EXTS.includes(ext)) return reject(new Error('Not an office file'));

    const dir = path.dirname(inputPath);
    const base = path.basename(inputPath, ext);
    const cached = path.join(dir, `${base}.view.pdf`);
    const originalStat = fs.statSync(inputPath);

    if (fs.existsSync(cached)) {
      const cachedStat = fs.statSync(cached);
      if (cachedStat.mtime >= originalStat.mtime) return resolve(cached);
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uclass-office-'));
    const outName = `${base}.pdf`;
    const produced = path.join(tempDir, outName);

    const child = spawn('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', tempDir, inputPath]);
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      reject(new Error('LibreOffice conversion timed out'));
    }, 60000);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('exit', (code) => {
      clearTimeout(timer);
      if (killed) return;
      if (code !== 0) return reject(new Error(`LibreOffice exited with code ${code}`));
      if (!fs.existsSync(produced)) return reject(new Error('PDF not produced'));
      try {
        fs.copyFileSync(produced, cached);
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {
        return reject(e);
      }
      resolve(cached);
    });
  });
}

// Helper to add header to every page of a PDF
async function addHeaderToPdf(inputPath, res, inline = false) {
  const pdfBytes = fs.readFileSync(inputPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const headerText = 'student.umunsi.com   Tel: 0783450859';

  pdfDoc.getPages().forEach(page => {
    const { width } = page.getSize();
    page.drawText(headerText, {
      x: 40,
      y: page.getHeight() - 30,
      size: 12,
      font,
      color: rgb(0.1, 0.2, 0.6),
    });
  });

  const outBytes = await pdfDoc.save();
  const disposition = inline ? 'inline' : 'attachment; filename="stamped.pdf"';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', disposition);
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  res.setHeader('Content-Security-Policy', "frame-ancestors *");
  res.send(Buffer.from(outBytes));
}

// Download with header for PDF files
// ?inline=1 → show in browser/iframe; default → force download
router.get('/:type/:filename', async (req, res) => {
  const { type, filename } = req.params;
  const inline = req.query.inline === '1';
  const view = req.query.view === '1';
  const filePath = path.join(getUploadsRoot(), filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('File not found');

  const ext = path.extname(filename).toLowerCase();

  // Office files can be converted to PDF for in-browser preview.
  if (view && OFFICE_EXTS.includes(ext)) {
    try {
      const pdfPath = await convertOfficeToPdf(filePath);
      await addHeaderToPdf(pdfPath, res, true);
    } catch (e) {
      console.error('[download office->pdf]', e.message);
      res.status(500).send('Could not convert document to preview. Please download it and open in Microsoft Word or WPS Office.');
    }
    return;
  }

  if (ext === '.pdf') {
    try {
      await addHeaderToPdf(filePath, res, inline);
    } catch (e) {
      res.status(500).send('Failed to stamp PDF');
    }
  } else {
    // For DOC/DOCX just stream as is
    if (inline) {
      res.setHeader('X-Frame-Options', 'ALLOWALL');
      res.setHeader('Content-Security-Policy', "frame-ancestors *");
      res.sendFile(filePath);
    } else {
      res.download(filePath);
    }
  }
});

module.exports = router;
