const PRODUCTION_API = 'https://studentapi.umunsi.com/api';
const PRODUCTION_UPLOADS = 'https://studentapi.umunsi.com';

function getDefaultApiBase() {
  if (typeof window === 'undefined') return 'http://localhost:5000/api';
  const host = window.location.hostname;
  if (host === 'student.umunsi.com' || host.endsWith('.vercel.app')) {
    return PRODUCTION_API;
  }
  return `${window.location.origin}/api`;
}

function getDefaultUploadsBase(apiBase) {
  if (typeof window === 'undefined') return 'http://localhost:5000';
  const host = window.location.hostname;
  if (host === 'student.umunsi.com' || host.endsWith('.vercel.app')) {
    return PRODUCTION_UPLOADS;
  }
  return apiBase.replace(/\/api$/, '');
}

const API_BASE = import.meta.env.VITE_API_URL || getDefaultApiBase();
export const UPLOADS_BASE = import.meta.env.VITE_UPLOADS_URL || getDefaultUploadsBase(API_BASE);

function normalizeLegacySchoolDomainError(message) {
  const text = String(message || '');
  if (/school email domain is not configured/i.test(text)) {
    return 'School email is now auto-generated from school name as schoolname.edu. Please try creating the account again.';
  }
  return text;
}

async function request(method, endpoint, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Server returned ${res.status} — check that the API URL is correct.`);
  }
  const data = await res.json();
  if (!res.ok) throw new Error(normalizeLegacySchoolDomainError(data.error || 'Request failed'));
  return data;
}

export const api = {
  get: (endpoint, token) => request('GET', endpoint, null, token),
  post: (endpoint, body, token) => request('POST', endpoint, body, token),
  put: (endpoint, body, token) => request('PUT', endpoint, body, token),
  patch: (endpoint, body, token) => request('PATCH', endpoint, body, token),
  delete: (endpoint, token) => request('DELETE', endpoint, null, token),
};

export async function uploadFile(endpoint, formData, token) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers,
    body: formData,
  });
  const contentType = res.headers.get('content-type') || '';
  let data = {};
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    const text = await res.text();
    throw new Error(text || `Upload failed (${res.status})`);
  }
  if (!res.ok) throw new Error(normalizeLegacySchoolDomainError(data.error || 'Upload failed'));
  return data;
}
