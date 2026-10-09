import { useEffect, useRef, useState } from 'react';
import './LessonPlanGenerator.css';

export default function LessonPlanGenerator({ user }) {
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
  const contentRef = useRef(null);
  const resultRef = useRef(null);

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

  const generate = (e) => {
    e.preventDefault();
    const err = validate();
    setError(err);
    if (err) return;
    setShowResult(true);
  };

  const copyToWord = () => {
    const node = contentRef.current;
    if (!node) return;
    const range = document.createRange();
    range.selectNode(node);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    try {
      document.execCommand('copy');
      alert('✅ Lesson plan copied!\n\nNow:\n1. Open Microsoft Word\n2. Press Ctrl+V (or Cmd+V on Mac) to paste\n3. Save your file');
    } catch (err) {
      alert('Please select the content manually and press Ctrl+C to copy');
    }
    sel.removeAllRanges();
  };

  const dur = Number(form.duration) || 0;
  const introDuration = form.introMin !== '' ? Number(form.introMin) : 5;
  const devDuration = form.devMin !== '' ? Number(form.devMin) : Math.floor(dur * 0.6);
  const concDuration = form.concMin !== '' ? Number(form.concMin) : Math.floor(dur * 0.25);

  const planHtml = `
    <div class="lp-text-center lp-bold" style="font-size: 12pt; margin-bottom: 10px;">LESSON PLAN</div>
    <div style="margin-bottom: 5px; font-size: 10pt;">
      <span class="lp-bold">School Name:</span> ${form.schoolName}
      <span style="margin-left: 80px;" class="lp-bold">Teacher's name:</span> ${form.teacherName}
    </div>
    <table>
      <tr>
        <td class="lp-bold">Term</td>
        <td class="lp-bold">Date</td>
        <td class="lp-bold">Subject</td>
        <td class="lp-bold">Class</td>
        <td class="lp-bold">Unit N°</td>
        <td class="lp-bold">Lesson N°</td>
        <td class="lp-bold">Duration</td>
        <td class="lp-bold">Class size</td>
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
    <table>
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
    <table>
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
        <td>
          <ul>
            <li>Greets learners and checks attendance</li>
            <li>Reviews previous lesson related to ${form.unitTitle}</li>
            <li>Asks learners: "What do you remember about ${form.unitTitle}?"</li>
            <li>Introduces today's topic: "${form.lessonTitle}"</li>
            <li>Shares the lesson objectives with learners</li>
          </ul>
        </td>
        <td>
          <ul>
            <li>Respond to greetings and settle down</li>
            <li>Recall and share what they learned in previous lesson</li>
            <li>Listen attentively to the new topic</li>
            <li>Write lesson title in their exercise books</li>
            <li>Ask questions if they need clarification</li>
          </ul>
        </td>
        <td>
          <strong>Communication:</strong> Learners express their prior knowledge clearly<br/><br/>
          <strong>Peace and values education:</strong> Respectful participation in class discussions
        </td>
      </tr>
      <tr>
        <td class="lp-bold">Development of the lesson<br/>${devDuration} min</td>
        <td>
          <ul>
            <li>Organizes learners into groups of 5</li>
            <li>Distributes learning materials to each group</li>
            <li>Explains the key concepts of ${form.lessonTitle} using examples</li>
            <li>Demonstrates the main concept on the board with step-by-step explanation</li>
            <li>Guides groups to work on practice activities related to the topic</li>
            <li>Moves around the classroom observing and assisting learners</li>
            <li>Asks probing questions to check understanding</li>
            <li>Invites group representatives to present their work</li>
            <li>Provides constructive feedback and clarifies misconceptions</li>
            <li>Gives additional practice exercises for individual work</li>
          </ul>
        </td>
        <td>
          <ul>
            <li>Form groups as instructed by the teacher</li>
            <li>Collect and handle learning materials carefully</li>
            <li>Listen to teacher's explanation and take notes</li>
            <li>Follow the demonstration and ask questions</li>
            <li>Work collaboratively in groups to complete activities</li>
            <li>Discuss and share ideas with group members</li>
            <li>Record findings on Manila paper or in exercise books</li>
            <li>Present group work to the class</li>
            <li>Listen to feedback and make corrections</li>
            <li>Complete individual practice exercises</li>
          </ul>
        </td>
        <td>
          <strong>Critical thinking:</strong> Learners analyze concepts and solve problems independently<br/><br/>
          <strong>Cooperation:</strong> Working in groups develops teamwork and interpersonal skills<br/><br/>
          <strong>Inclusive education:</strong> Mixed-ability groups ensure all learners participate actively<br/><br/>
          <strong>Creativity and innovation:</strong> Learners explore different approaches to solve problems
        </td>
      </tr>
      <tr>
        <td class="lp-bold">Conclusion<br/>${concDuration} min</td>
        <td>
          <ul>
            <li>Guides learners to summarize the main points about ${form.lessonTitle}</li>
            <li>Reinforces key concepts through questions and answers</li>
            <li>Conducts a quick oral assessment with 2-3 questions</li>
            <li>Assigns homework: Practice exercises on ${form.lessonTitle} from textbook</li>
            <li>Links to the next lesson and explains what will be covered</li>
            <li>Appreciates learners for their active participation and good work</li>
          </ul>
        </td>
        <td>
          <ul>
            <li>Participate in summarizing what they have learned</li>
            <li>Answer teacher's questions to demonstrate understanding</li>
            <li>Self-assess their learning progress</li>
            <li>Write down homework assignment clearly</li>
            <li>Ask final questions for clarification</li>
            <li>Pack their materials and prepare for the next lesson</li>
          </ul>
        </td>
        <td>
          <strong>Self-confidence:</strong> Learners gain confidence through successful practice and participation<br/><br/>
          <strong>Communication:</strong> Summarizing helps consolidate and articulate learning<br/><br/>
          <strong>Lifelong learning:</strong> Reflection on learning promotes continuous improvement
        </td>
      </tr>
      <tr>
        <td class="lp-bold">Teacher self-evaluation</td>
        <td colspan="3">
          <em>To be completed after lesson delivery:</em><br/>
          • Did all learners achieve the lesson objective?<br/>
          • Which activities worked well and which need improvement?<br/>
          • Were the learning materials adequate and effective?<br/>
          • How many learners need additional support?<br/>
          • What adjustments are needed for the next lesson?
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
        <button type="submit" className="lp-generate-btn">✨ Generate Complete Lesson Plan</button>
        {error && <div className="lp-error">{error}</div>}
      </form>

      {showResult && (
        <div className="lp-result" ref={resultRef}>
          <div className="lp-download-buttons">
            <button type="button" className="lp-download-btn lp-btn-word" onClick={copyToWord}>📄 Copy to Word</button>
            <button type="button" className="lp-download-btn lp-btn-pdf" onClick={() => window.print()}>📑 Print / Save as PDF</button>
          </div>
          <div className="lp-content" ref={contentRef} dangerouslySetInnerHTML={{ __html: planHtml }} />
        </div>
      )}
    </div>
  );
}
