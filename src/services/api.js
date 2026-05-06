const API_BASE = '/api';

async function request(url, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(res.ok ? 'Invalid response from server' : `Server error (${res.status})`);
  }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.data = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

async function downloadBlob(url) {
  const token = localStorage.getItem('token');
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${url}`, { headers });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {}
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return await res.blob();
}

export const api = {
  get: (url) => request(url),
  post: (url, body) => request(url, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) }),
  put: (url, body) => request(url, { method: 'PUT', body: body instanceof FormData ? body : JSON.stringify(body) }),
  delete: (url) => request(url, { method: 'DELETE' }),
  downloadBlob,
};

export default api;
