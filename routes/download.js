const express = require('express');
const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

const router = express.Router();

// Helper to add header to every page of a PDF
async function addHeaderToPdf(inputPath, res) {
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
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="stamped.pdf"');
  res.send(Buffer.from(outBytes));
}

// Download with header for PDF files
router.get('/:type/:filename', async (req, res) => {
  const { type, filename } = req.params;
  const filePath = path.join(__dirname, '..', 'uploads', filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('File not found');

  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf') {
    try {
      await addHeaderToPdf(filePath, res);
    } catch (e) {
      res.status(500).send('Failed to stamp PDF');
    }
  } else {
    // For DOC/DOCX just stream as is (header stamping for Word is more complex)
    res.download(filePath);
  }
});

module.exports = router;
