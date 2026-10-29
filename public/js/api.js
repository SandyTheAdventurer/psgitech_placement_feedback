export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function parse(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !res.url.includes('/auth/login')) onUnauthorized();
    throw new ApiError(res.status, body.error || 'Request failed.');
  }
  return body;
}
const base = { credentials: 'same-origin', headers: { 'X-Requested-With': 'fetch' } };

export const api = {
  get: (url) => fetch(url, base).then(parse),
  post: (url, data) => fetch(url, { ...base, method: 'POST', headers: { ...base.headers, 'Content-Type': 'application/json' }, body: JSON.stringify(data || {}) }).then(parse),
  put: (url, data) => fetch(url, { ...base, method: 'PUT', headers: { ...base.headers, 'Content-Type': 'application/json' }, body: JSON.stringify(data || {}) }).then(parse),
  del: (url) => fetch(url, { ...base, method: 'DELETE' }).then(parse),
  // multipart upload with progress
  upload(method, url, formData, onProgress) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open(method, url);
      x.setRequestHeader('X-Requested-With', 'fetch');
      x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      x.onerror = () => reject(new ApiError(0, 'Network error — please check your connection.'));
      x.onload = () => {
        let body = {};
        try { body = JSON.parse(x.responseText); } catch { /* ignore */ }
        if (x.status >= 200 && x.status < 300) resolve(body);
        else {
          if (x.status === 401) onUnauthorized();
          reject(new ApiError(x.status, body.error || 'Upload failed.'));
        }
      };
      x.send(formData);
    });
  },
};
