export function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function downloadWord(filename, data) {
  const percentage = Math.round((data.score / data.total) * 100);
  const grade =
    percentage >= 90 ? 'A' :
    percentage >= 80 ? 'B' :
    percentage >= 70 ? 'C' :
    percentage >= 60 ? 'D' : 'F';
  const gradeColor = percentage >= 60 ? '#16a34a' : '#dc2626';
  const date = new Date(data.attempted_at).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const questionsHtml = data.questions.map(q => {
    const options = [
      { key: 'a', text: q.option_a },
      { key: 'b', text: q.option_b },
      q.option_c ? { key: 'c', text: q.option_c } : null,
      q.option_d ? { key: 'd', text: q.option_d } : null,
    ].filter(Boolean);

    const studentAns = (q.student_answer || '').toLowerCase().replace('no answer', '');
    const correctAns = q.correct_answer.toLowerCase();

    const optionsHtml = options.map(opt => {
      const isCorrect = opt.key === correctAns;
      const isStudentWrong = opt.key === studentAns && !isCorrect;
      let prefix = `${opt.key.toUpperCase()}.`;
      let style = 'margin:3px 0 3px 24px; font-size:13px;';
      let suffix = '';
      if (isCorrect) {
        prefix = `<b style="color:#16a34a">&#10003; ${opt.key.toUpperCase()}.</b>`;
        style += ' color:#16a34a; font-weight:bold;';
        suffix = ' &nbsp;<i style="color:#16a34a">(Correct Answer)</i>';
      }
      if (isStudentWrong) {
        prefix = `<b style="color:#dc2626">&#10007; ${opt.key.toUpperCase()}.</b>`;
        style += ' color:#dc2626; text-decoration:line-through;';
        suffix = ' &nbsp;<i style="color:#dc2626">(You chose this)</i>';
      }
      return `<p style="${style}">${prefix} ${esc(opt.text)}${suffix}</p>`;
    }).join('');

    const resultColor = q.is_correct ? '#16a34a' : '#dc2626';
    const resultBg = q.is_correct ? '#dcfce7' : '#fee2e2';
    const resultIcon = q.is_correct ? '&#10003; CORRECT' : '&#10007; WRONG';
    const studentAnswerLine = q.is_correct
      ? `Answered: <b>${studentAns.toUpperCase()}. ${esc(q.student_answer_text)}</b> &mdash; <span style="color:${resultColor}"><b>${resultIcon}</b></span>`
      : `Answered: <b style="color:#dc2626">${studentAns ? studentAns.toUpperCase() + '. ' + esc(q.student_answer_text) : 'No answer'}</b> &mdash; <span style="color:#dc2626"><b>${resultIcon}</b></span> &nbsp;|&nbsp; Correct: <b style="color:#16a34a">${correctAns.toUpperCase()}. ${esc(q.correct_answer_text)}</b>`;

    return `
      <div style="margin-bottom:18px;padding:12px 14px;border:1px solid #e2e8f0;border-left:4px solid ${resultColor};page-break-inside:avoid;">
        <p style="font-weight:bold;margin:0 0 8px 0;font-size:14px;">Q${q.number}. ${esc(q.question)}</p>
        ${optionsHtml}
        <div style="margin-top:10px;padding:8px 12px;background:${resultBg};border-radius:4px;font-size:13px;">${studentAnswerLine}</div>
      </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office'
      xmlns:w='urn:schemas-microsoft-com:office:word'
      xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset='utf-8'>
  <title>Quiz Result - ${esc(data.student_name)}</title>
  <style>
    @page {
      mso-header: h1;
      mso-header-margin: .5cm;
      margin-top: 2cm;
    }
    div.page-header { mso-element: header; }
    body { font-family: Arial, sans-serif; margin: 36px; color: #1e293b; font-size: 13px; }
    h1 { color: #1a56db; font-size: 20px; margin: 6px 0 2px; }
    table.info { border-collapse: collapse; margin-bottom: 14px; width: 100%; }
    table.info td { padding: 4px 10px 4px 0; font-size: 13px; }
    table.info td.label { font-weight: bold; color: #64748b; width: 140px; }
    .divider { border: none; border-top: 2px solid #1a56db; margin: 10px 0 16px; }
    .score-box { display:inline-block; border:2px solid #1a56db; padding:10px 20px; border-radius:6px; background:#eff6ff; margin-bottom:18px; }
    h2.section { font-size:15px; border-bottom:2px solid #e2e8f0; padding-bottom:6px; margin:20px 0 14px; }
    .footer { margin-top:30px; border-top:1px solid #e2e8f0; padding-top:8px; color:#94a3b8; font-size:11px; }
  </style>
</head>
<body>
  <!-- Word page header repeated on every page -->
  <div class="page-header" id="h1" style="border-bottom:2px solid #1a56db;padding-bottom:4px;margin-bottom:8px;text-align:center;">
    <span style="font-size:12px;font-weight:bold;color:#1a56db;">&#127891; student.umunsi.com</span>
    <span style="font-size:12px;color:#64748b;margin-left:18px;">&#128222; 0783450859</span>
  </div>

  <p style="font-size:16px;font-weight:bold;color:#1a56db;margin:0;">&#127891; student.umunsi.com</p>
  <h1>Official Quiz Result Report</h1>
  <hr class="divider">

  <table class="info">
    <tr><td class="label">School:</td><td>${esc(data.school_name)}</td><td class="label">Teacher:</td><td>${esc(data.teacher_name)}</td></tr>
    <tr><td class="label">Class:</td><td>${esc(data.class_name)}</td><td class="label">Subject:</td><td>${esc(data.class_subject || 'N/A')}</td></tr>
    <tr><td class="label">Quiz #${data.quiz_number}:</td><td colspan="3"><b>${esc(data.quiz_title)}</b></td></tr>
    <tr><td class="label">Student:</td><td colspan="3"><b>${esc(data.student_name)}</b></td></tr>
    <tr><td class="label">Date Taken:</td><td colspan="3">${date}</td></tr>
  </table>

  <div class="score-box">
    <span style="font-size:26px;font-weight:bold;color:#1a56db;">${data.score}/${data.total}</span>
    <span style="font-size:16px;color:#64748b;"> &nbsp;(${percentage}%)</span>
    <span style="font-size:22px;font-weight:bold;color:${gradeColor};margin-left:16px;">Grade: ${grade}</span>
  </div>

  <h2 class="section">Question-by-Question Breakdown</h2>
  ${questionsHtml}

  <div class="footer">Generated by student.umunsi.com &mdash; Tel: 0783450859 &mdash; ${new Date().toLocaleString()}</div>
</body>
</html>`;

  const blob = new Blob(['\uFEFF', html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename + '.doc';
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadCatSheetWord(filename, data) {
  const generatedAt = new Date().toLocaleString();
  const rowsHtml = (data.rows || []).map((r, idx) => {
    const cats = Array.isArray(r.cats) ? r.cats : [];
    const catCells = Array.from({ length: 10 }, (_, i) => `<td>${cats[i] == null || cats[i] === '' ? '' : esc(cats[i])}</td>`).join('');
    return `
      <tr>
        <td>${idx + 1}</td>
        <td style="text-align:left">${esc(r.student_name)}</td>
        ${catCells}
        <td><b>${esc(r.total ?? 0)}</b></td>
        <td><b>${esc(r.percentage ?? 0)}%</b></td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office'
      xmlns:w='urn:schemas-microsoft-com:office:word'
      xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset='utf-8'>
  <title>CAT Report</title>
  <style>
    @page { mso-header: h1; mso-header-margin: .5cm; margin-top: 2cm; }
    div.page-header { mso-element: header; }
    body { font-family: Arial, sans-serif; margin: 28px; color:#1e293b; font-size:12px; }
    h1 { color:#1a56db; margin:6px 0 4px; font-size:20px; }
    .divider { border:none; border-top:2px solid #1a56db; margin:8px 0 14px; }
    table.info { border-collapse:collapse; width:100%; margin-bottom:12px; }
    table.info td { padding:4px 8px 4px 0; }
    table.info td.label { width:130px; color:#64748b; font-weight:bold; }
    table.sheet { width:100%; border-collapse:collapse; font-size:11px; }
    table.sheet th, table.sheet td { border:1px solid #cbd5e1; padding:6px 5px; text-align:center; }
    table.sheet th { background:#eff6ff; color:#1e3a8a; }
    .footer { margin-top:18px; border-top:1px solid #e2e8f0; padding-top:8px; color:#94a3b8; font-size:11px; }
  </style>
</head>
<body>
  <div class="page-header" id="h1" style="border-bottom:2px solid #1a56db;padding-bottom:4px;margin-bottom:8px;text-align:center;">
    <span style="font-size:12px;font-weight:bold;color:#1a56db;">&#127891; student.umunsi.com</span>
    <span style="font-size:12px;color:#64748b;margin-left:18px;">&#128222; 0783450859</span>
  </div>

  <p style="font-size:16px;font-weight:bold;color:#1a56db;margin:0;">&#127891; student.umunsi.com</p>
  <h1>CAT (Continuous Assessment during Term)</h1>
  <hr class="divider">

  <table class="info">
    <tr><td class="label">School:</td><td>${esc(data.school_name || '')}</td><td class="label">Teacher:</td><td>${esc(data.teacher_name || '')}</td></tr>
    <tr><td class="label">Class:</td><td>${esc(data.class_name || '')}</td><td class="label">Subject:</td><td>${esc(data.subject || data.class_subject || '')}</td></tr>
    <tr><td class="label">Lesson Title:</td><td colspan="3"><b>${esc(data.lesson_title || '')}</b></td></tr>
    <tr><td class="label">Lesson Topic:</td><td colspan="3"><b>${esc(data.lesson_topic || '')}</b></td></tr>
  </table>

  <table class="sheet">
    <thead>
      <tr>
        <th>#</th>
        <th>Student Name</th>
        <th>CAT 1</th><th>CAT 2</th><th>CAT 3</th><th>CAT 4</th><th>CAT 5</th>
        <th>CAT 6</th><th>CAT 7</th><th>CAT 8</th><th>CAT 9</th><th>CAT 10</th>
        <th>Total</th>
        <th>%</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="footer">Generated by student.umunsi.com &mdash; Tel: 0783450859 &mdash; ${generatedAt}</div>
</body>
</html>`;

  const blob = new Blob(['\uFEFF', html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename + '.doc';
  a.click();
  URL.revokeObjectURL(url);
}
