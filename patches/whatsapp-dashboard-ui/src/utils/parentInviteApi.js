import { api } from '../api';

function isMissingRouteError(err) {
  const msg = String(err?.message || '');
  return /404/.test(msg) || /not found/i.test(msg) || /Cannot (GET|POST)/i.test(msg);
}

function isRetryableStudentInviteError(err) {
  const msg = String(err?.message || '');
  if (isMissingRouteError(err)) return true;
  if (/insufficient role/i.test(msg)) return true;
  if (/Forbidden/i.test(msg)) return true;
  return false;
}

async function tryInviteCalls(calls) {
  let lastError;
  for (const call of calls) {
    try {
      return await call();
    } catch (err) {
      lastError = err;
      if (!isRetryableStudentInviteError(err)) throw err;
    }
  }
  throw lastError;
}

/** Create or fetch parent invite link — student routes only (never teacher parent-link for self). */
export async function createParentInviteLink({ token, studentId, selfStudentId }) {
  if (studentId) {
    return api.post(`/parent/students/${studentId}/parent-link`, {}, token);
  }

  const studentOnlyCalls = [
    () => api.get('/auth/parent-invite', token),
    () => api.get('/student/parent-invite', token),
    () => api.get('/parent/my/parent-invite', token),
    () => api.post('/auth/parent-invite', {}, token),
    () => api.post('/student/parent-invite', {}, token),
    () => api.post('/parent/my/parent-invite', {}, token),
  ];

  if (selfStudentId) {
    studentOnlyCalls.push(() =>
      api.post(`/parent/students/${selfStudentId}/parent-link`, {}, token)
    );
  }

  try {
    return await tryInviteCalls(studentOnlyCalls);
  } catch (lastError) {
    const msg = String(lastError?.message || '');
    if (/insufficient role/i.test(msg) || /404/.test(msg)) {
      throw new Error(
        'Parent invite needs the latest API on studentapi.umunsi.com. Ask your school to run: git pull, npm ci --omit=dev, pm2 restart studentapi.'
      );
    }
    throw new Error(msg || 'Could not create parent invite.');
  }
}

export function formatParentInviteCode(inviteToken) {
  if (!inviteToken) return '';
  const t = String(inviteToken).replace(/[^a-f0-9]/gi, '');
  return t.slice(0, 8).toUpperCase();
}

export async function loadInvitableStudents(token) {
  try {
    const rows = await api.get('/parent/invitable-students', token);
    if (Array.isArray(rows) && rows.length) return rows;
  } catch (e) {
    if (!isMissingRouteError(e)) throw e;
  }

  const classes = await api.get('/classes', token);
  const list = Array.isArray(classes) ? classes : [];
  const merged = [];
  const seen = new Set();

  await Promise.all(
    list.map(async (cls) => {
      try {
        const students = await api.get(`/classes/${cls.id}/students`, token);
        (students || []).forEach((s) => {
          const key = `${cls.id}-${s.id}`;
          if (seen.has(key)) return;
          seen.add(key);
          merged.push({
            id: s.id,
            name: s.name,
            class_id: cls.id,
            class_name: cls.name,
          });
        });
      } catch {
        /* skip */
      }
    })
  );

  merged.sort((a, b) => {
    const c = (a.class_name || '').localeCompare(b.class_name || '');
    return c !== 0 ? c : (a.name || '').localeCompare(b.name || '');
  });

  return merged;
}
