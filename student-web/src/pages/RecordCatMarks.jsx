import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import '../pages/Dashboard.css';

const CAT_NUMS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export default function RecordCatMarks() {
  const { id: routeClassId } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState(routeClassId || '');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recordForm, setRecordForm] = useState({ test_number: 1, student_id: '', marks_obtained: '' });
  const [quizzes, setQuizzes] = useState([]);
  const [migrateQuiz, setMigrateQuiz] = useState({ quiz_id: '', test_number: '' });
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const location = useLocation();
  const basePath = location.pathname.startsWith('/head-teacher') ? '/head-teacher' : '/teacher';

  useEffect(() => {
    api.get('/classes', token).then((list) => {
      setClasses(list);
      if (!classId && list.length > 0) setClassId(String(routeClassId || list[0].id));
    }).catch((e) => setError(e.message));
  }, [token]);

  const loadData = () => {
    if (!classId) return;
    setLoading(true);
    Promise.all([
      api.get(`/catmarks/${classId}/overview`, token).then(setStats),
      api.get(`/classes/${classId}/quizzes`, token).then(setQuizzes),
    ]).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, [classId, token]);

  const handleClassChange = (nextId) => {
    setClassId(nextId);
    setRecordForm({ test_number: 1, student_id: '', marks_obtained: '' });
    navigate(`${basePath}/classes/${nextId}/record-marks`, { replace: true });
  };

  const saveCellMark = async (studentId, testNumber, marksRaw) => {
    if (marksRaw === '' || marksRaw === '—') return;
    const marks = parseInt(marksRaw, 10);
    if (Number.isNaN(marks) || marks < 0 || marks > 100) {
      setError('Marks must be 0–100.');
      return;
    }
    setSaving(true);
    try {
      await api.post(`/catmarks/${classId}/entry`, {
        student_id: studentId,
        test_number: testNumber,
        marks_obtained: marks,
        total_marks: 100,
      }, token);
      setEditing(null);
      setError('');
      loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const roster = stats?.students || [];
  const n = roster.length || 1;
  const classTotals = roster.reduce(
    (acc, s) => {
      acc.totalMarks += s.total_marks || 0;
      acc.pctSum += s.percentage || 0;
      acc.avgSum += s.avg_percentage || 0;
      return acc;
    },
    { totalMarks: 0, pctSum: 0, avgSum: 0 }
  );

  return (
    <section className="class-page">
      <header className="dash-header">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate(-1)}>Back</button>
        <span className="dash-brand">Record CAT Marks</span>
      </header>
      <main className="class-main">
        {error && <p className="alert alert-error">{error}</p>}

        <section className="cat-panel">
          <h2>Migrate quiz to CAT</h2>
          <form className="cat-form-row" onSubmit={async (e) => {
            e.preventDefault();
            if (!migrateQuiz.quiz_id || !migrateQuiz.test_number) return setError('Select quiz and CAT number.');
            setSaving(true);
            try {
              const res = await api.post(`/catmarks/${classId}/fromquiz`, {
                quiz_id: parseInt(migrateQuiz.quiz_id, 10),
                test_number: parseInt(migrateQuiz.test_number, 10),
              }, token);
              setMigrateQuiz({ quiz_id: '', test_number: '' });
              setError('');
              loadData();
              alert(`Migrated ${res.migrated} scores.`);
            } catch (err) { setError(err.message); } finally { setSaving(false); }
          }}>
            <label>Class<select value={classId} onChange={(e) => handleClassChange(e.target.value)}>
              <option value="">Select class</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></label>
            <select value={migrateQuiz.quiz_id} onChange={(e) => setMigrateQuiz({ ...migrateQuiz, quiz_id: e.target.value })}>
              <option value="">Select quiz</option>
              {quizzes.map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}
            </select>
            <input type="number" min="1" max="10" placeholder="CAT #" value={migrateQuiz.test_number} onChange={(e) => setMigrateQuiz({ ...migrateQuiz, test_number: e.target.value })} />
            <button type="submit" className="btn btn-primary" disabled={saving}>Migrate</button>
          </form>
        </section>

        <section className="cat-panel">
          <h2>Record mark</h2>
          <form className="cat-form-grid" onSubmit={async (e) => {
            e.preventDefault();
            if (!recordForm.student_id || recordForm.marks_obtained === '') return setError('Select student and marks.');
            setSaving(true);
            try {
              await api.post(`/catmarks/${classId}/entry`, {
                student_id: parseInt(recordForm.student_id, 10),
                test_number: parseInt(recordForm.test_number, 10),
                marks_obtained: parseInt(recordForm.marks_obtained, 10),
                total_marks: 100,
              }, token);
              setRecordForm({ ...recordForm, student_id: '', marks_obtained: '' });
              setError('');
              loadData();
            } catch (err) { setError(err.message); } finally { setSaving(false); }
          }}>
            <label>Class<select value={classId} onChange={(e) => handleClassChange(e.target.value)}>
              <option value="">Select class</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></label>
            <label>Student<select value={recordForm.student_id} onChange={(e) => setRecordForm({ ...recordForm, student_id: e.target.value })}>
              <option value="">Select student</option>
              {roster.map((s) => <option key={s.student_id} value={s.student_id}>{s.name}</option>)}
            </select></label>
            <label>CAT #<input type="number" min="1" max="10" value={recordForm.test_number} onChange={(e) => setRecordForm({ ...recordForm, test_number: e.target.value })} /></label>
            <label>Marks<input type="number" min="0" max="100" value={recordForm.marks_obtained} onChange={(e) => setRecordForm({ ...recordForm, marks_obtained: e.target.value })} /></label>
            <button type="submit" className="btn btn-primary" disabled={saving}>Record</button>
          </form>
        </section>

        <section className="cat-panel cat-table-wrap">
          <h2>Class CAT marks (CAT 1–10)</h2>
          {loading ? <p>Loading...</p> : roster.length === 0 ? <p>No students in this class.</p> : (
            <>
              <p className="cat-class-avg"><strong>Class average:</strong> {stats?.class_average ?? 0}%</p>
              <table className="cat-marks-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    {CAT_NUMS.map((num) => <th key={num}>CAT {num}</th>)}
                    <th>Total</th>
                    <th>%</th>
                    <th>Avg %</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((s) => (
                    <tr key={s.student_id}>
                      <td className="cat-name">{s.name}</td>
                      {CAT_NUMS.map((num) => {
                        const val = s.cat?.[num];
                        const isEdit = editing?.studentId === s.student_id && editing?.num === num;
                        return (
                          <td
                            key={num}
                            className={!isEdit ? 'cat-cell-clickable' : ''}
                            title="Click to enter mark"
                            onClick={() => !isEdit && setEditing({ studentId: s.student_id, num, value: val != null ? String(val) : '' })}
                          >
                            {isEdit ? (
                              <input
                                className="cat-cell-input"
                                type="number"
                                min={0}
                                max={100}
                                autoFocus
                                value={editing.value}
                                onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                                onBlur={() => saveCellMark(s.student_id, num, editing.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveCellMark(s.student_id, num, editing.value);
                                  if (e.key === 'Escape') setEditing(null);
                                }}
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              val != null ? val : '—'
                            )}
                          </td>
                        );
                      })}
                      <td className="cat-total">{s.total_marks}</td>
                      <td className="cat-pct">{s.percentage}%</td>
                      <td>{s.avg_percentage}%</td>
                    </tr>
                  ))}
                  <tr className="cat-avg-row">
                    <td>Class average</td>
                    {CAT_NUMS.map((num) => <td key={num}>—</td>)}
                    <td>{Math.round(classTotals.totalMarks / n)}</td>
                    <td>{Math.round((classTotals.pctSum / n) * 10) / 10}%</td>
                    <td>{Math.round((classTotals.avgSum / n) * 10) / 10}%</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}
        </section>
      </main>
    </section>
  );
}
