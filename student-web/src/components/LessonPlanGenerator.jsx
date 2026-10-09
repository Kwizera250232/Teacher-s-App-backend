import { useEffect, useRef, useState } from 'react';
import { api, API_BASE } from '../api';
import './LessonPlanGenerator.css';

export default function LessonPlanGenerator({ user, token }) {
  const [form, setForm] = useState({
    schoolName: user?.school_name || '',
    teacherName: user?.name || '',
    term: '',
    date: new Date().toISOString().split('T')[0],
    subject: '',
    class: '',
    unitNo: '',
    lessonNo: '',
    totalLessons: '',
    duration: '',
    introMin: '',
    devMin: '',
    concMin: '',
    classSize: '',
    unitTitle: '',
    lessonTitle: '',
    specialNeeds: '',
    references: '',
  });
  const [error, setError] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [payInfo, setPayInfo] = useState(null); // {paid, amount_rwf, duration_days, expires_at}
  const [showPay, setShowPay] = useState(false);
  const [payPhone, setPayPhone] = useState('');
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [payFail, setPayFail] = useState('');
  const [payStatus, setPayStatus] = useState(null);
  const [referenceId, setReferenceId] = useState(null);
  const [downloading, setDownloading] = useState('');
  const [generating, setGenerating] = useState(false);
  const [aiSections, setAiSections] = useState(null);
  const [genCount, setGenCount] = useState(0);
  const [savedPlans, setSavedPlans] = useState([]);
  const [savedHtml, setSavedHtml] = useState(null);
  const [savedLoading, setSavedLoading] = useState(0);
  const pollRef = useRef(null);
  const contentRef = useRef(null);
  const resultRef = useRef(null);
  const savedRef = useRef(null);

  useEffect(() => {
    if (!token) return;
    api.get('/lesson-plan/my-access', token).then(setPayInfo).catch(() => {});
  }, [token]);

  const isPaidEarly = Boolean(payInfo?.paid);
  const loadSaved = () => {
    if (!token) return;
    api.get('/lesson-plan/my', token).then(r => setSavedPlans(r.plans || [])).catch(() => {});
  };
  useEffect(() => { loadSaved(); }, [token]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  useEffect(() => {
    if (showResult && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [showResult]);

  const handleChange = (field) => (e) => {
    setForm(f => ({ ...f, [field]: e.target.value }));
  };

  const validate = () => {
    const required = ['schoolName', 'teacherName', 'term', 'date', 'subject', 'class', 'unitNo', 'lessonNo', 'totalLessons', 'duration', 'classSize', 'unitTitle', 'lessonTitle'];
    for (const key of required) {
      if (!String(form[key] || '').trim()) return 'Please fill in all mandatory fields.';
    }
    return '';
  };

  const generate = async (e) => {
    e.preventDefault();
    const err = validate();
    setError(err);
    if (err) return;
    setGenerating(true);
    try {
      const r = await api.post('/lesson-plan/generate', {
        subject: form.subject,
        className: form.class,
        unitTitle: form.unitTitle,
        lessonTitle: form.lessonTitle,
        lessonNo: form.lessonNo,
        totalLessons: form.totalLessons,
        duration: form.duration,
        classSize: form.classSize,
        introMin: introDuration,
        devMin: devDuration,
        concMin: concDuration,
        sen: form.specialNeeds,
        refs: form.references,
      }, token);
      setAiSections(r?.ai && r.sections ? r.sections : null);
    } catch {
      setAiSections(null); // fall back to local template
    }
    setGenerating(false);
    setGenCount(c => c + 1);
    setShowResult(true);
  };

  // Auto-save every generated plan for paid teachers (they can re-open it later)
  useEffect(() => {
    if (!genCount || !showResult || !isPaidEarly || !token) return;
    api.post('/lesson-plan/my', {
      title: form.lessonTitle,
      subject: form.subject,
      class_name: form.class,
      html: planHtml,
    }, token).then(loadSaved).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genCount]);

  const viewSaved = async (id) => {
    setSavedLoading(id);
    try {
      const p = await api.get(`/lesson-plan/my/${id}`, token);
      setSavedHtml({ id: p.id, title: p.title, html: p.html });
      setTimeout(() => savedRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch { /* ignore */ }
    setSavedLoading(0);
  };

  const isPaid = Boolean(payInfo?.paid);

  const brandBlock = `
    <div style="margin-top:24px;border-top:2px solid #667eea;padding-top:8px;display:flex;justify-content:space-between;align-items:center;font-size:9pt;color:#475569;">
      <span><strong style="color:#667eea;">UClass</strong> — AI-Powered CBC Lesson Plan Generator</span>
      <span>student.umunsi.com</span>
    </div>`;

  const buildDoc = (withBrand) => `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Lesson Plan - ${form.lessonTitle}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:10pt;line-height:1.4;margin:24px;}
      table{width:100%;border-collapse:collapse;margin-bottom:5px;}
      td{border:1px solid #000;padding:5px;vertical-align:top;}
      ul{margin:5px 0;padding-left:22px;}
      li{margin:2px 0;}
      .bold,.lp-bold{font-weight:bold;}
      .text-center,.lp-text-center{text-align:center;}
    </style></head><body>${planHtml}${withBrand ? brandBlock : ''}</body></html>`;

  // Server-side export: free → watermarked protected PDF; paid → clean .doc
  const downloadServer = async (mode, htmlOverride, titleOverride) => {
    setError('');
    setDownloading(mode);
    const htmlToSend = htmlOverride || planHtml;
    const titleToUse = titleOverride || form.lessonTitle;
    try {
      const res = await fetch(`${API_BASE}/lesson-plan/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ html: htmlToSend, mode, title: titleToUse }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safe = (titleToUse || 'plan').replace(/[^\w]+/g, '-');
      a.href = url;
      a.download = mode === 'doc' ? `Lesson-Plan-${safe}.doc` : `Lesson-Plan-${safe}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    } finally {
      setDownloading('');
    }
  };

  const printPlan = (withBrand) => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(buildDoc(withBrand));
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  };

  const startLpPolling = (ref) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const s = await api.get(`/lesson-plan/pay-status/${ref}`, token);
        setPayStatus(s.status);
        if (s.status === 'SUCCESSFUL') {
          clearInterval(pollRef.current);
          setPayInfo(p => ({ ...(p || {}), paid: true, expires_at: s.expires_at }));
          setShowPay(false); setReferenceId(null); setPayStatus(null); setPayPhone('');
        } else if (['FAILED', 'REJECTED', 'EXPIRED'].includes(s.status)) {
          clearInterval(pollRef.current);
          setPayFail(s.reason_message || 'Ubwishyu ntibwashobotse. Gerageza ukundi. (Payment was not completed — try again)');
        }
      } catch { /* keep polling */ }
    }, 5000);
  };

  const doPay = async () => {
    setPayError('');
    if (!payPhone.trim()) { setPayError('Andika numero yawe hano.'); return; }
    setPaying(true);
    try {
      const r = await api.post('/lesson-plan/pay', { phone: payPhone.trim() }, token);
      if (r.already_paid) {
        setPayInfo(p => ({ ...(p || {}), paid: true }));
        setShowPay(false); return;
      }
      setReferenceId(r.reference_id);
      setPayStatus(r.status);
      if (r.status === 'SUCCESSFUL') {
        setPayInfo(p => ({ ...(p || {}), paid: true }));
        setShowPay(false);
      } else {
        startLpPolling(r.reference_id);
      }
    } catch (e) {
      const msg = e.message || 'Payment failed. Try again.';
      if (/mafaranga|not approved|not allowed|rejected|limit|not registered/i.test(msg)) {
        setPayFail(msg);
      } else {
        setPayError(msg);
      }
    } finally {
      setPaying(false);
    }
  };

  const dur = Number(form.duration) || 0;
  const introDuration = form.introMin !== '' ? Number(form.introMin) : 5;
  const devDuration = form.devMin !== '' ? Number(form.devMin) : Math.floor(dur * 0.6);
  const concDuration = form.concMin !== '' ? Number(form.concMin) : Math.floor(dur * 0.25);

  // ── Content: AI-generated if available, else the built-in template ──
  const escHtml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ul = (items) => `<ul>${(items || []).map((b) => `<li>${escHtml(b)}</li>`).join('')}</ul>`;
  const aiCompCell = (step) => {
    const gen = String(step?.genericComp || '')
      .split(/[\n;]+/).map((l) => l.trim()).filter(Boolean)
      .map((l) => {
        const m = l.match(/^([^:]{1,60}):\s*(.+)$/);
        return m ? `<strong>${escHtml(m[1])}:</strong> ${escHtml(m[2])}` : escHtml(l);
      }).join('<br/><br/>');
    const cross = step?.crossCut
      ? `<strong>${escHtml(step.crossCut)}:</strong> ${escHtml(step.crossCutDesc || '')}`
      : '';
    return [gen, cross].filter(Boolean).join('<br/><br/>');
  };

  const TPL_INTRO_T = [
    'Greets learners and checks attendance',
    `Reviews previous lesson related to ${form.unitTitle}`,
    `Asks learners: "What do you remember about ${form.unitTitle}?"`,
    `Introduces today's topic: "${form.lessonTitle}"`,
    'Shares the lesson objectives with learners',
  ];
  const TPL_INTRO_L = [
    'Respond to greetings and settle down',
    'Recall and share what they learned in previous lesson',
    'Listen attentively to the new topic',
    'Write lesson title in their exercise books',
    'Ask questions if they need clarification',
  ];
  const TPL_INTRO_C = `<strong>Communication:</strong> Learners express their prior knowledge clearly<br/><br/><strong>Peace and values education:</strong> Respectful participation in class discussions`;

  const TPL_DEV_T = [
    'Organizes learners into groups of 5',
    'Distributes learning materials to each group',
    `Explains the key concepts of ${form.lessonTitle} using examples`,
    'Demonstrates the main concept on the board with step-by-step explanation',
    'Guides groups to work on practice activities related to the topic',
    'Moves around the classroom observing and assisting learners',
    'Asks probing questions to check understanding',
    'Invites group representatives to present their work',
    'Provides constructive feedback and clarifies misconceptions',
    'Gives additional practice exercises for individual work',
  ];
  const TPL_DEV_L = [
    'Form groups as instructed by the teacher',
    'Collect and handle learning materials carefully',
    "Listen to teacher's explanation and take notes",
    'Follow the demonstration and ask questions',
    'Work collaboratively in groups to complete activities',
    'Discuss and share ideas with group members',
    'Record findings on Manila paper or in exercise books',
    'Present group work to the class',
    'Listen to feedback and make corrections',
    'Complete individual practice exercises',
  ];
  const TPL_DEV_C = `<strong>Critical thinking:</strong> Learners analyze concepts and solve problems independently<br/><br/><strong>Cooperation:</strong> Working in groups develops teamwork and interpersonal skills<br/><br/><strong>Inclusive education:</strong> Mixed-ability groups ensure all learners participate actively<br/><br/><strong>Creativity and innovation:</strong> Learners explore different approaches to solve problems`;

  const TPL_CONC_T = [
    `Guides learners to summarize the main points about ${form.lessonTitle}`,
    'Reinforces key concepts through questions and answers',
    'Conducts a quick oral assessment with 2-3 questions',
    `Assigns homework: Practice exercises on ${form.lessonTitle} from textbook`,
    'Links to the next lesson and explains what will be covered',
    'Appreciates learners for their active participation and good work',
  ];
  const TPL_CONC_L = [
    'Participate in summarizing what they have learned',
    "Answer teacher's questions to demonstrate understanding",
    'Self-assess their learning progress',
    'Write down homework assignment clearly',
    'Ask final questions for clarification',
    'Pack their materials and prepare for the next lesson',
  ];
  const TPL_CONC_C = `<strong>Self-confidence:</strong> Learners gain confidence through successful practice and participation<br/><br/><strong>Communication:</strong> Summarizing helps consolidate and articulate learning<br/><br/><strong>Lifelong learning:</strong> Reflection on learning promotes continuous improvement`;

  const step = (key, fbT, fbL, fbC) => {
    const s = aiSections?.[key];
    if (s && Array.isArray(s.teacher) && s.teacher.length && Array.isArray(s.learner) && s.learner.length) {
      return { teacher: s.teacher, learner: s.learner, comp: aiCompCell(s) };
    }
    return { teacher: fbT, learner: fbL, comp: fbC };
  };
  const intro = step('intro', TPL_INTRO_T, TPL_INTRO_L, TPL_INTRO_C);
  const dev = step('dev', TPL_DEV_T, TPL_DEV_L, TPL_DEV_C);
  const conc = step('conc', TPL_CONC_T, TPL_CONC_L, TPL_CONC_C);

  const TPL_EVAL = [
    'Did all learners achieve the lesson objective?',
    'Which activities worked well and which need improvement?',
    'Were the learning materials adequate and effective?',
    'How many learners need additional support?',
    'What adjustments are needed for the next lesson?',
  ];
  const evalLines = (aiSections?.selfEval?.length ? aiSections.selfEval : TPL_EVAL)
    .map((b) => `• ${escHtml(b)}`).join('<br/>');

  const planHtml = `
    <div class="lp-text-center lp-bold" style="font-size: 12pt; margin-bottom: 10px;">LESSON PLAN</div>
    <div style="margin-bottom: 5px; font-size: 10pt;">
      <span class="lp-bold">School Name:</span> ${form.schoolName}
      <span style="margin-left: 80px;" class="lp-bold">Teacher's name:</span> ${form.teacherName}
    </div>
    <table class="lp-meta">
      <colgroup>
        <col width="9%"/><col width="14%"/><col width="12%"/><col width="9%"/><col width="11%"/><col width="12%"/><col width="12%"/><col width="11%"/>
      </colgroup>
      <tr>
        <td class="lp-hdr">Term</td>
        <td class="lp-hdr">Date</td>
        <td class="lp-hdr">Subject</td>
        <td class="lp-hdr">Class</td>
        <td class="lp-hdr">Unit N°</td>
        <td class="lp-hdr">Lesson N°</td>
        <td class="lp-hdr">Duration</td>
        <td class="lp-hdr">Class size</td>
      </tr>
      <tr>
        <td>${form.term}</td>
        <td>${form.date}</td>
        <td>${form.subject}</td>
        <td>${form.class}</td>
        <td>${form.unitNo}</td>
        <td>${form.lessonNo} of ${form.totalLessons}</td>
        <td>${form.duration} min</td>
        <td>${form.classSize}</td>
      </tr>
    </table>
    <table class="lp-info">
      <tr>
        <td class="lp-bold" style="width: 33%;">Type of Special Educational Needs</td>
        <td>${form.specialNeeds || 'No specific special educational needs identified in this class'}</td>
      </tr>
      <tr>
        <td class="lp-bold">Unit title</td>
        <td>${form.unitTitle}</td>
      </tr>
      <tr>
        <td class="lp-bold">Key Unit Competence</td>
        <td>Be able to understand and apply ${form.lessonTitle} concepts accurately in ${form.subject}</td>
      </tr>
      <tr>
        <td class="lp-bold">Title of the lesson</td>
        <td>${form.lessonTitle}</td>
      </tr>
      <tr>
        <td class="lp-bold">Instructional Objective</td>
        <td>By the end of this lesson, learners should be able to explain and demonstrate ${form.lessonTitle} with accuracy and confidence</td>
      </tr>
      <tr>
        <td class="lp-bold">Plan for this Class</td>
        <td>Inside the classroom - learners arranged in groups of 5</td>
      </tr>
      <tr>
        <td class="lp-bold">Learning Materials</td>
        <td>${form.subject} textbook, charts, Manila paper, markers, learner's exercise books, chalk/whiteboard markers, demonstration materials</td>
      </tr>
      <tr>
        <td class="lp-bold">References</td>
        <td>${form.references || `${form.subject} book for ${form.class}, Rwanda Education Board curriculum`}</td>
      </tr>
    </table>
    <table class="lp-acts">
      <tr>
        <td class="lp-bold" style="width: 15%;">Timing for each step</td>
        <td colspan="2" class="lp-bold lp-text-center">Description of teaching and learning activity</td>
        <td class="lp-bold" style="width: 30%;">Generic competences and Cross cutting issues to be addressed + a short explanation</td>
      </tr>
      <tr>
        <td></td>
        <td class="lp-bold" style="width: 27.5%;">Teacher activities</td>
        <td class="lp-bold" style="width: 27.5%;">Learner activities</td>
        <td></td>
      </tr>
      <tr>
        <td class="lp-bold">Introduction<br/>${introDuration} min</td>
        <td>${ul(intro.teacher)}</td>
        <td>${ul(intro.learner)}</td>
        <td>${intro.comp}</td>
      </tr>
      <tr>
        <td class="lp-bold">Development of the lesson<br/>${devDuration} min</td>
        <td>${ul(dev.teacher)}</td>
        <td>${ul(dev.learner)}</td>
        <td>${dev.comp}</td>
      </tr>
      <tr>
        <td class="lp-bold">Conclusion<br/>${concDuration} min</td>
        <td>${ul(conc.teacher)}</td>
        <td>${ul(conc.learner)}</td>
        <td>${conc.comp}</td>
      </tr>
      <tr>
        <td class="lp-bold">Teacher self-evaluation</td>
        <td colspan="3">
          <em>To be completed after lesson delivery:</em><br/>
          ${evalLines}
        </td>
      </tr>
    </table>
  `;

  return (
    <div className="lesson-plan-generator">
      <div className="lp-header">
        <h1>🤖 AI-Powered CBC Lesson Plan Generator</h1>
        <p>Fill in the mandatory fields below, and AI will generate a complete, professional lesson plan for you!</p>
      </div>

      {savedPlans.length > 0 && (
        <div className="lp-saved">
          <h3>📁 My saved lesson plans ({savedPlans.length})</h3>
          {savedPlans.map(p => (
            <div key={p.id} className="lp-saved-row">
              <span className="lp-saved-meta">
                <strong>{p.title || 'Untitled'}</strong> — {p.subject} ({p.class_name})
                <br/><small>{new Date(p.created_at).toLocaleString()}</small>
              </span>
              <button type="button" className="lp-btn lp-btn-primary" disabled={savedLoading === p.id} onClick={() => viewSaved(p.id)}>
                {savedLoading === p.id ? '…' : '👁 View'}
              </button>
            </div>
          ))}
        </div>
      )}

      {savedHtml && (
        <div className="lp-result" ref={savedRef}>
          <div className="lp-result-header">
            <h2>📋 {savedHtml.title || 'Saved lesson plan'}</h2>
            <div className="lp-download-buttons">
              {isPaid ? (
                <>
                  <button type="button" className="lp-btn lp-btn-paid" onClick={() => downloadServer('doc', savedHtml.html, savedHtml.title)}>⬇️ Word (.doc)</button>
                  <button type="button" className="lp-btn lp-btn-paid" onClick={() => downloadServer('pdf', savedHtml.html, savedHtml.title)}>⬇️ PDF</button>
                </>
              ) : (
                <button type="button" className="lp-btn lp-btn-primary" onClick={() => downloadServer('free', savedHtml.html, savedHtml.title)}>📄 FREE PDF</button>
              )}
              <button type="button" className="lp-btn" onClick={() => setSavedHtml(null)}>✖ Close</button>
            </div>
          </div>
          <div className="lp-content" dangerouslySetInnerHTML={{ __html: savedHtml.html }} />
        </div>
      )}

      <form className="lp-form" onSubmit={generate}>
        <div className="lp-grid">
          <div className="lp-group">
            <label className="lp-required">School Name</label>
            <input type="text" value={form.schoolName} onChange={handleChange('schoolName')} placeholder="e.g., G.S. Liba" required />
          </div>
          <div className="lp-group">
            <label className="lp-required">Teacher's Name</label>
            <input type="text" value={form.teacherName} onChange={handleChange('teacherName')} placeholder="e.g., HAKIZIMANA Faustin" required />
          </div>
          <div className="lp-group">
            <label className="lp-required">Term</label>
            <select value={form.term} onChange={handleChange('term')} required>
              <option value="">Select Term</option>
              <option value="I">Term I</option>
              <option value="II">Term II</option>
              <option value="III">Term III</option>
            </select>
          </div>
          <div className="lp-group">
            <label className="lp-required">Date</label>
            <input type="date" value={form.date} onChange={handleChange('date')} required />
          </div>
          <div className="lp-group">
            <label className="lp-required">Subject</label>
            <input type="text" value={form.subject} onChange={handleChange('subject')} placeholder="e.g., Mathematics, Science" required />
          </div>
          <div className="lp-group">
            <label className="lp-required">Class</label>
            <input type="text" value={form.class} onChange={handleChange('class')} placeholder="e.g., P4, S1, S2, L3, L4" required />
          </div>
          <div className="lp-group">
            <label className="lp-required">Unit No</label>
            <input type="number" value={form.unitNo} onChange={handleChange('unitNo')} placeholder="e.g., 4" required />
          </div>
          <div className="lp-group">
            <label className="lp-required">Lesson No / Total</label>
            <div className="lp-double-input">
              <input type="number" value={form.lessonNo} onChange={handleChange('lessonNo')} placeholder="3" required />
              <input type="number" value={form.totalLessons} onChange={handleChange('totalLessons')} placeholder="6" required />
            </div>
          </div>
          <div className="lp-group">
            <label className="lp-required">Duration (minutes)</label>
            <input type="number" value={form.duration} onChange={handleChange('duration')} placeholder="e.g., 40" required />
          </div>
          <div className="lp-group lp-full-width">
            <label className="lp-optional">Timing for each step (Optional — teacher chooses; leave blank for automatic)</label>
            <div className="lp-double-input">
              <input type="number" value={form.introMin} onChange={handleChange('introMin')} placeholder="Introduction min (auto: 5)" />
              <input type="number" value={form.devMin} onChange={handleChange('devMin')} placeholder="Development min (auto: 60%)" />
              <input type="number" value={form.concMin} onChange={handleChange('concMin')} placeholder="Conclusion min (auto: 25%)" />
            </div>
          </div>
          <div className="lp-group">
            <label className="lp-required">Class Size</label>
            <input type="number" value={form.classSize} onChange={handleChange('classSize')} placeholder="e.g., 35" required />
          </div>
          <div className="lp-group lp-full-width">
            <label className="lp-required">Unit Title</label>
            <input type="text" value={form.unitTitle} onChange={handleChange('unitTitle')} placeholder="e.g., Fractions with the same denominator" required />
          </div>
          <div className="lp-group lp-full-width">
            <label className="lp-required">Lesson Title</label>
            <input type="text" value={form.lessonTitle} onChange={handleChange('lessonTitle')} placeholder="e.g., Simplifying Fractions" required />
          </div>
          <div className="lp-group lp-full-width">
            <label className="lp-optional">Special Educational Needs (Optional)</label>
            <input type="text" value={form.specialNeeds} onChange={handleChange('specialNeeds')} placeholder="Leave blank if none" />
          </div>
          <div className="lp-group lp-full-width">
            <label className="lp-optional">References (Optional)</label>
            <input type="text" value={form.references} onChange={handleChange('references')} placeholder="e.g., Mathematics book for primary 4" />
          </div>
        </div>
        <button type="submit" className="lp-generate-btn" disabled={generating}>
          {generating ? '⏳ AI is writing your lesson plan…' : '✨ Generate Complete Lesson Plan'}
        </button>
        {error && <div className="lp-error">{error}</div>}
      </form>

      {showResult && (
        <div className="lp-result" ref={resultRef}>
          <div className="lp-download-buttons">
            <button type="button" className="lp-download-btn lp-btn-word" disabled={downloading === 'free'} onClick={() => downloadServer('free')}>
              {downloading === 'free' ? '⏳ Building PDF…' : '📄 FREE Download — protected PDF + UClass signature'}
            </button>
            {isPaid ? (
              <>
                <button type="button" className="lp-download-btn lp-btn-pay" disabled={downloading === 'doc'} onClick={() => downloadServer('doc')}>
                  {downloading === 'doc' ? '⏳ Building…' : '⬇️ Word (.doc) — no signature'}
                </button>
                <button type="button" className="lp-download-btn lp-btn-pay" disabled={downloading === 'pdf'} onClick={() => downloadServer('pdf')}>
                  {downloading === 'pdf' ? '⏳ Building…' : '⬇️ PDF — no signature'}
                </button>
              </>
            ) : (
              <button type="button" className="lp-download-btn lp-btn-pay" onClick={() => setShowPay(true)}>
                💎 Pay {payInfo?.amount_rwf ? `${payInfo.amount_rwf.toLocaleString()} RWF` : 'RWF'} / Term — editable .doc, no signature
              </button>
            )}
            <button type="button" className="lp-download-btn lp-btn-pdf" onClick={() => printPlan(!isPaid)}>
              🖨️ Print / Save as PDF
            </button>
          </div>
          {payInfo?.paid && (
            <p style={{ textAlign: 'center', fontSize: 12, color: '#16a34a', fontWeight: 600, marginTop: -8, marginBottom: 12 }}>
              ✅ Term active — your downloads have no UClass signature{payInfo.expires_at ? ` until ${new Date(payInfo.expires_at).toLocaleDateString()}` : ''}.
            </p>
          )}
          <div className="lp-content" ref={contentRef} dangerouslySetInnerHTML={{ __html: planHtml }} />
        </div>
      )}

      {showPay && (
        <div className="lp-pay-overlay">
          <div className="lp-pay-card">
            <button className="lp-pay-close" onClick={() => setShowPay(false)}>✕</button>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', background: '#ede9fe',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
            }}>
              <span style={{ fontSize: 26 }}>💎</span>
            </div>
            <h3 style={{ margin: '0 0 4px', fontSize: 18, color: '#111827', textAlign: 'center' }}>Lesson Plan — Whole Term</h3>
            <p style={{ color: '#6b7280', fontSize: 13, margin: '0 0 14px', textAlign: 'center' }}>
              Pay {payInfo?.amount_rwf ? `${payInfo.amount_rwf.toLocaleString()} RWF` : 'RWF'} once and download lesson plans without the UClass signature for {payInfo?.duration_days || 120} days.
            </p>
            {payStatus && referenceId ? (
              <div style={{ textAlign: 'center' }}>
                <span className="paywall-spinner" style={{
                  width: 16, height: 16, border: '2px solid #e2e8f0', borderTopColor: '#5A3FFF',
                  borderRadius: '50%', display: 'inline-block', animation: 'spin 1s linear infinite',
                }} />
                <p style={{ fontSize: 13, color: '#6b7280', marginTop: 10 }}>Waiting for your approval on MTN…</p>
                <p style={{ fontSize: 12, color: '#854d0e' }}>If you don't see the prompt, dial <strong>*182#</strong>.</p>
                <button type="button" onClick={() => { setReferenceId(null); setPayStatus(null); }}
                  style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>
                  Cancel and go back
                </button>
              </div>
            ) : (
              <>
                <label style={{ display: 'block', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  MTN MoMo number
                </label>
                <input
                  type="tel"
                  placeholder="Andika numero yawe hano."
                  value={payPhone}
                  onChange={e => setPayPhone(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') doPay(); }}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 15, outline: 'none' }}
                  onFocus={e => e.target.style.borderColor = '#5A3FFF'}
                  onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                />
                <button
                  onClick={doPay}
                  disabled={paying}
                  style={{
                    width: '100%', marginTop: 14, padding: '14px', borderRadius: 10, border: 'none',
                    background: paying ? '#a5b4fc' : '#ffcc00', color: '#1e1e1e', fontWeight: 800,
                    fontSize: 15, cursor: paying ? 'not-allowed' : 'pointer',
                  }}
                >
                  {paying ? 'Requesting…' : `📱 Pay ${payInfo?.amount_rwf ? `${payInfo.amount_rwf.toLocaleString()} RWF` : 'RWF'} with MTN MoMo`}
                </button>
              </>
            )}
            {payError && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 10, textAlign: 'center' }}>{payError}</div>}

            {payFail && (
              <div style={{
                position: 'absolute', inset: 0, borderRadius: 16, background: 'rgba(15,23,42,0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 10,
              }}>
                <div style={{
                  background: '#fff', borderRadius: 16, padding: '28px 24px', maxWidth: 300, width: '100%',
                  textAlign: 'center', boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
                }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: '50%', background: '#fef2f2',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px',
                  }}>
                    <span style={{ fontSize: 28 }}>⚠️</span>
                  </div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 17, color: '#111827' }}>Ubwishyu ntibwashobotse</h3>
                  <p style={{ color: '#dc2626', fontSize: 14, fontWeight: 600, margin: '0 0 20px', lineHeight: 1.5 }}>{payFail}</p>
                  <button
                    onClick={() => { setPayFail(''); setReferenceId(null); setPayStatus(null); setPayError(''); }}
                    style={{
                      width: '100%', padding: '12px', borderRadius: 10, border: 'none',
                      background: '#5A3FFF', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                    }}
                  >
                    Gerageza ukundi
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
