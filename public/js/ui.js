// Tiny DOM helpers. Data is only ever inserted as text nodes — never as HTML.
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') for (const [p, val] of Object.entries(v)) p.startsWith('--') ? el.style.setProperty(p, val) : (el.style[p] = val);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, kids);
  return el;
}
export function put(el, ...kids) { append(el, kids); return el; }
function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const clear = (el) => { while (el.firstChild) el.firstChild.remove(); return el; };

const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 5.5v16"/><path d="M9 8h7"/>',
  download: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.5 3.3-5.5 6.5-5.5s5.9 2 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .6 3.2 2.3 3.5 5.2"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M3 3l18 18M10.6 6.2A9.8 9.8 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.8M6.5 7.6C3.9 9.4 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.3-1"/>',
  logout: '<path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5"/><path d="m16 8 4 4-4 4M20 12H9"/>',
  arrow: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l3 3"/>',
  zoomin: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M11 8v6M8 11h6"/>',
  zoomout: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
  moon: '<path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z"/>',
  up: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  shield: '<path d="M12 3 5 6v5.5c0 4.3 3 7.6 7 9.5 4-1.9 7-5.2 7-9.5V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  cmd: '<path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"/>',
  marker: '<path d="m4 20 4-1 11-11a2.1 2.1 0 0 0-3-3L5 16z"/><path d="M13.5 7.5l3 3"/><path d="M4 20h7"/>',
  eraser: '<path d="M8 20h12"/><path d="m4.5 14.5 8-8a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L11.5 19H8z"/><path d="m8 10 6 6"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  cap: '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5"/>',
};
export function icon(name, cls = 'icon') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', cls);
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.9');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name] || '';
  return s;
}

export function toast(msg, type = 'ok') {
  const t = h('div', { class: `toast ${type}`, role: 'status' }, msg);
  $('#toasts').append(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, type === 'err' ? 5200 : 3200);
}

export function modal({ title, body, actions = [], wide = false, onClose }) {
  const prevFocus = document.activeElement;
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); prevFocus?.focus?.(); onClose?.(); };
  const onKey = (e) => { if (e.key === 'Escape' && !overlay.dataset.lock) close(); };
  const foot = actions.length ? h('div', { class: 'modal-foot' }, actions.map((a) => {
    const b = h('button', { class: `btn ${a.cls || ''}`, type: 'button' }, a.label);
    b.addEventListener('click', () => a.onClick({ close, button: b, overlay }));
    return b;
  })) : null;
  const overlay = h('div', { class: 'overlay', onmousedown: (e) => { if (e.target === overlay && !overlay.dataset.lock) close(); } },
    h('div', { class: `modal ${wide ? 'wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'modal-head' }, h('h3', null, title), h('button', { class: 'x', type: 'button', 'aria-label': 'Close', onclick: close }, icon('close'))),
      h('div', { class: 'modal-body' }, body), foot));
  document.body.append(overlay);
  document.addEventListener('keydown', onKey);
  setTimeout(() => overlay.querySelector('input:not([type=hidden]), select, textarea')?.focus(), 30);
  return { close, overlay };
}

export function confirmBox({ title, message, confirm = 'Delete', danger = true }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    modal({
      title, body: h('p', { class: 'muted' }, message), onClose: () => finish(false),
      actions: [
        { label: 'Cancel', cls: 'outline', onClick: ({ close }) => close() },
        { label: confirm, cls: danger ? 'danger' : '', onClick: ({ close }) => { finish(true); close(); } },
      ],
    });
  });
}

// Chip/tag input — returns { el, get() }
export function chipsInput(initial = [], placeholder = 'Type and press Enter', suggestions = []) {
  let items = [...initial];
  const input = h('input', { type: 'text', placeholder, 'aria-label': placeholder, list: suggestions.length ? 'dl-' + placeholder : null });
  const wrap = h('div', { class: 'chips-input' });
  const dl = suggestions.length ? h('datalist', { id: 'dl-' + placeholder }, suggestions.map((s) => h('option', { value: s }))) : null;
  const render = () => {
    clear(wrap);
    items.forEach((it, i) => wrap.append(h('span', { class: 'chip' }, it, h('button', { type: 'button', 'aria-label': `Remove ${it}`, onclick: () => { items.splice(i, 1); render(); } }, '×'))));
    wrap.append(input, dl);
    if (dl == null) wrap.lastChild?.remove?.();
  };
  const commit = () => {
    const v = input.value.replace(/,/g, '').trim();
    if (v && !items.some((x) => x.toLowerCase() === v.toLowerCase())) items.push(v);
    input.value = '';
    render();
    input.focus();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
    else if (e.key === 'Backspace' && !input.value && items.length) { items.pop(); render(); input.focus(); }
  });
  input.addEventListener('blur', () => { if (input.value.trim()) commit(); });
  wrap.addEventListener('click', () => input.focus());
  render();
  return { el: wrap, get: () => { if (input.value.trim()) commit(); return items; } };
}

export const fmtDate = (s) => {
  if (!s) return '—';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
export const fmtDateTime = (s) => {
  if (!s) return 'Never';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};
export const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
export const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join('');

export function countUp(el, to, ms = 1100) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || to === 0) { el.textContent = to.toLocaleString(); return; }
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / ms);
    el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))).toLocaleString();
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// readable text colour (white or near-black) for an arbitrary company colour
export function inkOn(hex) {
  const n = parseInt((hex || '#1b3fa8').slice(1), 16);
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
  return L > 0.4 ? '#0a1226' : '#ffffff';
}
export const colorStyle = (hex, extra = {}) => ({ '--c': hex, '--ink': inkOn(hex), ...extra });

export const isNew = (s) => (Date.now() - new Date(s.replace(' ', 'T') + 'Z')) < 7 * 864e5;

export function mountScene(canvas, variant) {
  return import('/js/scene.js').then((m) => m.mountScene(canvas, { variant })).catch(() => null);
}

export function brand(college) {
  return h('a', { class: 'brand', href: '#/' },
    h('span', { class: 'mark' }, h('img', { src: '/img/logo.png?v=2', alt: 'PSG iTech' })),
    h('span', null, `${college} Placement Guides`, h('small', null, 'Career Development Centre')));
}

export function themeToggle(solid = false) {
  const b = h('button', { class: `theme-btn ${solid ? 'solid' : ''}`, type: 'button', title: 'Switch light / dark theme', 'aria-label': 'Switch light or dark theme' },
    icon('sun', 'sun'), icon('moon', 'moon'));
  b.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch { /* ignore */ }
  });
  return b;
}
