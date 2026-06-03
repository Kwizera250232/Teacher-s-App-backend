const CERTIFICATE_ID = 'writing-competition-certificate';

function safeFilename(name) {
  return String(name || 'student')
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'student';
}

function getCertificateElement() {
  const el = document.getElementById(CERTIFICATE_ID);
  if (!el) throw new Error('Certificate preview not found. Open review or refresh the page.');
  return el;
}

async function renderCertificateCanvas(element, scale = 2) {
  const { default: html2canvas } = await import('html2canvas');
  return html2canvas(element, {
    scale,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#fffef9',
    logging: false,
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
  });
}

/**
 * Capture the certificate DOM and return a canvas (admin download flow).
 */
export async function captureCertificateCanvas() {
  const element = getCertificateElement();
  return renderCertificateCanvas(element, 2);
}

export async function downloadCertificatePng(studentName) {
  const canvas = await captureCertificateCanvas();
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create image.'))), 'image/png', 1);
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `UMUNSI-Writing-Certificate-${safeFilename(studentName)}.png`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function downloadCertificatePdf(studentName) {
  const canvas = await captureCertificateCanvas();
  const { jsPDF } = await import('jspdf');
  const imgData = canvas.toDataURL('image/png', 1);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgW = pageW;
  const imgH = (canvas.height * imgW) / canvas.width;
  const y = imgH > pageH ? 0 : (pageH - imgH) / 2;
  pdf.addImage(imgData, 'PNG', 0, y, imgW, Math.min(imgH, pageH));
  pdf.save(`UMUNSI-Writing-Certificate-${safeFilename(studentName)}.pdf`);
}
