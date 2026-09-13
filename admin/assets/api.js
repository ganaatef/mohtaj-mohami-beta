const DEFAULT_API = 'https://mohtaj-mohami-api-production.up.railway.app/api/v1';
export const API_BASE = (window.MM_API_BASE || DEFAULT_API).replace(/\/$/, '');

let auth = null;
try {
  auth = JSON.parse(sessionStorage.getItem('mm_admin_v2') || 'null');
} catch {
  auth = null;
}

export const getAuth = () => auth;
export const isPlatformAdmin = () => auth?.role === 'PLATFORM_ADMIN';
export const isStaff = () => ['PLATFORM_ADMIN', 'OPS_AGENT'].includes(auth?.role);

function friendly(status, detail) {
  if (status === 401) return 'انتهت الجلسة أو بيانات الدخول غير صحيحة.';
  if (status === 403) return 'ليس لديك صلاحية لتنفيذ هذا الإجراء.';
  if (status === 404) return 'العنصر المطلوب غير موجود.';
  if (status === 409) return typeof detail === 'string' ? detail : 'الحالة تغيّرت. حدّث الصفحة وحاول مرة أخرى.';
  if (status === 422) return typeof detail === 'string' ? detail : 'راجع البيانات المدخلة.';
  if (status === 429) return 'عدد المحاولات كبير. انتظر قليلًا ثم حاول مرة أخرى.';
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (detail && typeof detail === 'object') return detail.message || JSON.stringify(detail);
  return 'تعذر إتمام الطلب.';
}

export async function login(email, password) {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email: email.trim().toLowerCase(), password}),
  });
  let payload = null;
  try { payload = await response.json(); } catch {}
  if (!response.ok) throw new Error(friendly(response.status, payload?.detail));
  if (!['PLATFORM_ADMIN', 'OPS_AGENT'].includes(payload.role)) {
    throw new Error('هذه الصفحة متاحة لفريق الإدارة والتشغيل فقط.');
  }
  auth = payload;
  sessionStorage.setItem('mm_admin_v2', JSON.stringify(payload));
  return payload;
}

export async function logout() {
  if (auth) {
    try { await request('/auth/logout', {method: 'POST'}); } catch {}
  }
  auth = null;
  sessionStorage.removeItem('mm_admin_v2');
}

export async function request(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(auth?.token ? {Authorization: `Bearer ${auth.token}`} : {}),
    ...(options.headers || {}),
  };
  const response = await fetch(`${API_BASE}${path}`, {...options, headers});
  let payload = null;
  if (response.status !== 204) {
    try { payload = await response.json(); } catch {}
  }
  if (response.status === 401 && auth) {
    auth = null;
    sessionStorage.removeItem('mm_admin_v2');
    window.dispatchEvent(new CustomEvent('admin-session-expired'));
  }
  if (!response.ok) {
    const error = new Error(friendly(response.status, payload?.detail));
    error.status = response.status;
    error.detail = payload?.detail;
    throw error;
  }
  return payload;
}

export async function download(path) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: auth?.token ? {Authorization: `Bearer ${auth.token}`} : {},
  });
  if (!response.ok) throw new Error(friendly(response.status));
  return response.blob();
}

export function qs(params = {}) {
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    result.set(key, String(value));
  }
  const text = result.toString();
  return text ? `?${text}` : '';
}
