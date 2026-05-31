/** Rwanda Education Board — Primary 1–6 graph templates (drawn on canvas) */

export const PRIMARY_LEVELS = [
  { key: 'p1', label: 'Primary 1', grade: 1 },
  { key: 'p2', label: 'Primary 2', grade: 2 },
  { key: 'p3', label: 'Primary 3', grade: 3 },
  { key: 'p4', label: 'Primary 4', grade: 4 },
  { key: 'p5', label: 'Primary 5', grade: 5 },
  { key: 'p6', label: 'Primary 6', grade: 6 },
];

export const GRAPH_TYPES = [
  { key: 'numberline', label: 'Number line', icon: '↔️' },
  { key: 'bar', label: 'Bar graph', icon: '📊' },
  { key: 'pie', label: 'Pie / circle', icon: '⭕' },
  { key: 'grid', label: 'Table grid', icon: '▦' },
  { key: 'coords', label: 'Coordinates', icon: '📐' },
  { key: 'fraction', label: 'Fraction bars', icon: '▬' },
];

export function drawRebTemplate(ctx, width, height, levelKey, graphKey, titleText = '') {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const grade = parseInt(String(levelKey).replace(/\D/g, ''), 10) || 1;
  const margin = 24;
  const maxNum = grade <= 2 ? 10 : grade <= 4 ? 20 : 100;

  ctx.strokeStyle = '#1e293b';
  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText(titleText || `REB — ${levelKey.toUpperCase()} ${GRAPH_TYPES.find((g) => g.key === graphKey)?.label || graphKey}`, margin, 20);

  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 1.5;

  if (graphKey === 'numberline') {
    const y = height / 2;
    const left = margin + 20;
    const right = width - margin;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    const step = (right - left) / maxNum;
    for (let i = 0; i <= maxNum; i += Math.max(1, Math.floor(maxNum / 10))) {
      const x = left + i * step;
      ctx.beginPath();
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x, y + 6);
      ctx.stroke();
      ctx.font = '11px system-ui';
      ctx.fillText(String(i), x - 4, y + 20);
    }
  } else if (graphKey === 'bar') {
    const baseY = height - margin - 30;
    const left = margin + 40;
    const barW = (width - left - margin) / 6;
    ctx.beginPath();
    ctx.moveTo(left, baseY);
    ctx.lineTo(width - margin, baseY);
    ctx.lineTo(width - margin, margin + 40);
    ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const h = 40 + (i + 1) * 18;
      ctx.fillStyle = ['#2563eb', '#16a34a', '#ca8a04', '#dc2626', '#7c3aed'][i];
      ctx.fillRect(left + 10 + i * barW, baseY - h, barW - 16, h);
    }
    ctx.fillStyle = '#64748b';
    ctx.font = '10px system-ui';
    ['A', 'B', 'C', 'D', 'E'].forEach((l, i) => ctx.fillText(l, left + 10 + i * barW, baseY + 14));
  } else if (graphKey === 'pie') {
    const cx = width / 2;
    const cy = height / 2 + 10;
    const r = Math.min(width, height) / 3;
    const slices = grade <= 3 ? 4 : 6;
    for (let i = 0; i < slices; i++) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, (i * 2 * Math.PI) / slices, ((i + 1) * 2 * Math.PI) / slices);
      ctx.closePath();
      ctx.fillStyle = ['#dbeafe', '#bbf7d0', '#fef08a', '#fecaca', '#e9d5ff', '#fed7aa'][i];
      ctx.fill();
      ctx.stroke();
    }
  } else if (graphKey === 'grid') {
    const cols = grade <= 2 ? 5 : 6;
    const rows = grade <= 2 ? 4 : 5;
    const cell = 36;
    const ox = margin + 20;
    const oy = margin + 36;
    for (let r = 0; r <= rows; r++) {
      ctx.beginPath();
      ctx.moveTo(ox, oy + r * cell);
      ctx.lineTo(ox + cols * cell, oy + r * cell);
      ctx.stroke();
    }
    for (let c = 0; c <= cols; c++) {
      ctx.beginPath();
      ctx.moveTo(ox + c * cell, oy);
      ctx.lineTo(ox + c * cell, oy + rows * cell);
      ctx.stroke();
    }
  } else if (graphKey === 'coords') {
    const ox = width / 2;
    const oy = height / 2 + 10;
    const scale = grade <= 4 ? 22 : 14;
    ctx.beginPath();
    ctx.moveTo(margin, oy);
    ctx.lineTo(width - margin, oy);
    ctx.moveTo(ox, margin + 30);
    ctx.lineTo(ox, height - margin);
    ctx.stroke();
    ctx.font = '11px system-ui';
    ctx.fillText('x', width - margin - 12, oy - 8);
    ctx.fillText('y', ox + 8, margin + 28);
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;
      ctx.strokeRect(ox + i * scale - 3, oy - 3, 6, 6);
    }
  } else if (graphKey === 'fraction') {
    const barH = 28;
    const barW = width - margin * 2 - 40;
    const parts = grade <= 2 ? 4 : grade <= 4 ? 6 : 8;
    for (let row = 0; row < 3; row++) {
      const y = margin + 50 + row * (barH + 16);
      const filled = row + 2;
      for (let p = 0; p < parts; p++) {
        ctx.fillStyle = p < filled ? '#2563eb' : '#e2e8f0';
        ctx.fillRect(margin + 20 + (p * barW) / parts, y, barW / parts - 2, barH);
        ctx.strokeRect(margin + 20 + (p * barW) / parts, y, barW / parts - 2, barH);
      }
      ctx.fillStyle = '#334155';
      ctx.font = '12px system-ui';
      ctx.fillText(`${filled}/${parts}`, margin, y + barH / 2 + 4);
    }
  }
}
