const express = require('express');
const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

const router = express.Router();

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
  const filePath = path.join(__dirname, '..', 'uploads', filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('File not found');

  const ext = path.extname(filename).toLowerCase();
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
