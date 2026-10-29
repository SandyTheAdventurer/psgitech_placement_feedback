import { api } from './api.js';
import { put, h, icon, clear, toast, confirmBox } from './ui.js';
import { state as app, setReaderCloser, getReturnHash } from './main.js';

let pdfjs = null;
async function loadPdfjs() {
  if (!pdfjs) {
    pdfjs = await import('/vendor/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';
  }
  return pdfjs;
}

const COLORS = { yellow: '#fff04d', green: '#8bf5ae', pink: '#ffa3c4', blue: '#8fd0ff' };

let current = null;
function close() {
  if (!current) return;
  current.destroy();
  current = null;
}
setReaderCloser(close);

export async function openReader(guideId) {
  close();
  let company = null, guide = null;
  try {
    const { companies } = await api.get('/api/companies');
    for (const c of companies) { const g = c.guides.find((x) => x.id === guideId); if (g) { company = c; guide = g; } }
  } catch { /* handled below */ }

  const goBack = () => { location.hash = getReturnHash(); };

  const pagesEl = h('div', { class: 'reader-pages' });
  const scroller = h('div', { class: 'reader-scroll', tabindex: '0' }, pagesEl);
  const pgLabel = h('span', { class: 'pg' }, '–');
  const zoomLabel = h('span', { class: 'pg' }, '100%');
  const closeBtn = h('button', { class: 'btn', type: 'button', 'aria-label': 'Close reader', onclick: goBack }, icon('close'), 'Close');
  const bar = h('div', { class: 'reader-bar' },
    h('h3', { style: { '--c': company?.color || '#1b3fa8' } }, h('span', { class: 'dot' }), company ? company.name : 'Guide',
      guide && h('em', null, guide.batchLabel && guide.batchLabel.includes(String(guide.year)) ? guide.batchLabel : `${guide.batchLabel || 'Interview guide'} · ${guide.year}`)));
  const progBar = h('i');
  const overlay = h('div', { class: 'reader', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Guide reader' }, bar, h('div', { class: 'reader-prog' }, progBar), scroller);
  document.body.append(overlay);
  document.body.style.overflow = 'hidden';

  let flushHl = () => {};
  const s = { scale: 1, fit: true, doc: null, pages: [], tasks: new Map(), task: null, dead: false, io: null, base: null };
  const onKey = (e) => {
    if (e.key === 'Escape') { if (tool) setTool(null); else goBack(); }
    else if (e.key === '+' || e.key === '=') zoomBy(0.15);
    else if (e.key === '-') zoomBy(-0.15);
  };
  const onResize = () => { if (s.fit) relayout(); };
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);
  const onHide = () => flushHl();
  window.addEventListener('pagehide', onHide);
  current = {
    destroy() {
      s.dead = true;
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pagehide', onHide);
      flushHl();
      s.io?.disconnect();
      s.tasks.forEach((t) => t.cancel());
      try { s.task?.destroy(); } catch { /* already gone */ }
      overlay.remove();
      document.body.style.overflow = '';
    },
  };

  if (!guide) {
    scroller.replaceChildren(h('div', { class: 'reader-msg' }, 'This guide could not be found.'));
    bar.append(closeBtn);
    return;
  }

  /* ---------------- highlighter ----------------
     Highlights belong to the signed-in account only. They are stored on the server against the
     user's id (nobody else can read them) so they survive sign-out, new sessions and other devices.
     A copy is kept in this browser as an offline backup. */
  const HL_KEY = `hl:${app.user.id}:${guide.id}`;
  const hlUrl = `/api/guides/${guide.id}/highlights`;
  const persist = app.user.role !== 'admin'; // the admin preview never saves highlights
  let marks = {};
  let saveTimer = null, dirty = false;
  const readLocal = () => { try { return JSON.parse(localStorage.getItem(HL_KEY)) || {}; } catch { return {}; } };
  const flush = () => {
    clearTimeout(saveTimer); saveTimer = null;
    if (!dirty) return;
    dirty = false;
    fetch(hlUrl, { method: 'PUT', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }, body: JSON.stringify({ marks }) })
      .then((r) => { if (!r.ok) dirty = true; }).catch(() => { dirty = true; });
  };
  flushHl = flush;
  const save = () => {
    if (!persist) return;
    try { localStorage.setItem(HL_KEY, JSON.stringify(marks)); } catch { /* storage blocked */ }
    dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(flush, 600);
  };
  const marksReady = (async () => {
    if (!persist) return;
    try {
      marks = (await api.get(hlUrl)).marks || {};
      const local = readLocal();
      if (!Object.keys(marks).length && Object.keys(local).length) { marks = local; save(); } // move older on-device highlights to the account
    } catch { marks = readLocal(); }
  })();
  const history = [];
  let tool = null, color = 'yellow';

  const swatches = Object.entries(COLORS).map(([name, hex]) => h('button', {
    class: `hl-swatch ${name === color ? 'sel' : ''}`, type: 'button', style: { '--sw': hex }, 'aria-label': `${name} highlighter`, title: name,
    onclick: () => { color = name; if (tool !== 'mark') setTool('mark'); swatches.forEach((b) => b.classList.toggle('sel', b === swatches[Object.keys(COLORS).indexOf(name)])); },
  }));
  const markBtn = h('button', { class: 'btn', type: 'button', title: 'Highlight important text', onclick: () => setTool(tool === 'mark' ? null : 'mark') }, icon('marker'), h('span', null, 'Highlight'));
  const eraseBtn = h('button', { class: 'btn', type: 'button', title: 'Remove a highlight', 'aria-label': 'Eraser', onclick: () => setTool(tool === 'erase' ? null : 'erase') }, icon('eraser'));
  const undoBtn = h('button', { class: 'btn', type: 'button', title: 'Undo last highlight', 'aria-label': 'Undo', onclick: undo }, icon('undo'));
  const clearBtn = h('button', { class: 'btn', type: 'button', title: 'Clear all highlights', onclick: async () => {
    if (!Object.keys(marks).length) { toast('There are no highlights to clear.'); return; }
    if (await confirmBox({ title: 'Clear all highlights?', message: 'All your highlights in this guide will be removed.', confirm: 'Clear all' })) { marks = {}; history.length = 0; save(); s.pages.forEach(paintMarks); }
  } }, 'Clear');
  const tools = h('div', { class: 'hl-tools' }, markBtn, h('div', { class: 'hl-swatches' }, swatches), eraseBtn, undoBtn, clearBtn);

  function setTool(t) {
    tool = t;
    markBtn.classList.toggle('on', t === 'mark');
    eraseBtn.classList.toggle('on', t === 'erase');
    tools.classList.toggle('active', t === 'mark');
    if (t) scroller.dataset.tool = t; else delete scroller.dataset.tool;
    if (t === 'mark' && !sessionStorage.getItem('hl-hint')) {
      toast(persist ? 'Drag across the text to highlight it. Highlights are private and saved to your account.' : 'Preview mode: you can try the highlighter, but admin highlights are not saved.');
      try { sessionStorage.setItem('hl-hint', '1'); } catch { /* ignore */ }
    }
  }
  function undo() {
    const last = history.pop();
    if (!last) { toast('Nothing to undo.'); return; }
    marks[last.n] = (marks[last.n] || []).filter((m) => m !== last.m);
    if (!marks[last.n].length) delete marks[last.n];
    save(); paintMarks(s.pages[last.n - 1]);
  }
  function paintMarks(p) {
    if (!p) return;
    p.layer.querySelectorAll('.hl:not(.draft)').forEach((n) => n.remove());
    for (const m of marks[p.n] || []) {
      const el = h('div', { class: 'hl', style: { left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${m.w * 100}%`, height: `${m.h * 100}%`, background: COLORS[m.c] || COLORS.yellow } });
      el.addEventListener('click', () => {
        if (tool !== 'erase') return;
        marks[p.n] = marks[p.n].filter((x) => x !== m);
        if (!marks[p.n].length) delete marks[p.n];
        save(); paintMarks(p);
      });
      p.layer.append(el);
    }
  }
  function attachDrawing(p) {
    let start = null, draft = null;
    p.layer.addEventListener('pointerdown', (e) => {
      if (tool !== 'mark' || e.button > 0) return;
      const r = p.layer.getBoundingClientRect();
      start = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, r };
      draft = h('div', { class: 'hl draft', style: { background: COLORS[color] } });
      p.layer.append(draft);
      p.layer.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    p.layer.addEventListener('pointermove', (e) => {
      if (!start) return;
      const x = Math.min(1, Math.max(0, (e.clientX - start.r.left) / start.r.width));
      const y = Math.min(1, Math.max(0, (e.clientY - start.r.top) / start.r.height));
      Object.assign(draft.style, { left: `${Math.min(start.x, x) * 100}%`, top: `${Math.min(start.y, y) * 100}%`, width: `${Math.abs(x - start.x) * 100}%`, height: `${Math.abs(y - start.y) * 100}%` });
    });
    const finish = (e) => {
      if (!start) return;
      const x = Math.min(1, Math.max(0, (e.clientX - start.r.left) / start.r.width));
      const y = Math.min(1, Math.max(0, (e.clientY - start.r.top) / start.r.height));
      const m = { x: Math.min(start.x, x), y: Math.min(start.y, y), w: Math.abs(x - start.x), h: Math.abs(y - start.y), c: color };
      draft.remove(); draft = null; start = null;
      if (m.w < 0.01 || m.h < 0.004) return; // ignore accidental taps
      (marks[p.n] = marks[p.n] || []).push(m);
      history.push({ n: p.n, m });
      save(); paintMarks(p);
    };
    p.layer.addEventListener('pointerup', finish);
    p.layer.addEventListener('pointercancel', () => { draft?.remove(); draft = null; start = null; });
  }

  /* ---------------- toolbar ---------------- */
  const yearSel = company.guides.length > 1 && h('select', { 'aria-label': 'Year', onchange: (e) => { location.replace(`#/read/${e.target.value}`); } },
    company.guides.map((g) => h('option', { value: g.id, selected: g.id === guide.id }, g.year)));
  const zoomBy = (d) => { s.fit = false; s.scale = Math.min(3, Math.max(0.4, s.scale + d)); relayout(); };
  put(bar, yearSel, tools,
    h('button', { class: 'btn', type: 'button', 'aria-label': 'Zoom out', onclick: () => zoomBy(-0.15) }, icon('zoomout')), zoomLabel,
    h('button', { class: 'btn', type: 'button', 'aria-label': 'Zoom in', onclick: () => zoomBy(0.15) }, icon('zoomin')),
    h('button', { class: 'btn', type: 'button', title: 'Fit to width', 'aria-label': 'Fit to width', onclick: () => { s.fit = true; relayout(); } }, icon('fit')),
    pgLabel, closeBtn);

  scroller.addEventListener('contextmenu', (e) => e.preventDefault());
  scroller.append(h('div', { class: 'reader-msg' }, 'Opening guide…'));

  try {
    const lib = await loadPdfjs();
    s.task = lib.getDocument({ url: `/api/guides/${guide.id}/file`, withCredentials: true });
    const doc = await s.task.promise;
    if (s.dead) return;
    s.doc = doc;
    const first = await doc.getPage(1);
    s.base = first.getViewport({ scale: 1 });
    await marksReady;
    if (s.dead) return;
    clear(scroller); scroller.append(pagesEl);
    for (let i = 1; i <= doc.numPages; i++) {
      const layer = h('div', { class: 'hl-layer' });
      const el = h('div', { class: 'pdf-page loading', dataset: { n: i } }, layer);
      const p = { n: i, el, layer, canvas: null, rendered: 0 };
      attachDrawing(p); paintMarks(p);
      pagesEl.append(el); s.pages.push(p);
    }
    s.io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) render(s.pages[Number(e.target.dataset.n) - 1]); }), { root: scroller, rootMargin: '900px 0px' });
    relayout();
    let tick = false;
    scroller.addEventListener('scroll', () => {
      if (tick) return; tick = true;
      requestAnimationFrame(() => {
        tick = false;
        const m = scroller.scrollHeight - scroller.clientHeight;
        progBar.style.width = `${m > 0 ? (scroller.scrollTop / m) * 100 : 0}%`;
        const mid = scroller.getBoundingClientRect().top + scroller.clientHeight * 0.35;
        for (const p of s.pages) { if (p.el.getBoundingClientRect().bottom > mid) { pgLabel.textContent = `${p.n} / ${doc.numPages}`; break; } }
      });
    }, { passive: true });
    pgLabel.textContent = `1 / ${doc.numPages}`;
  } catch {
    if (s.dead) return;
    scroller.replaceChildren(h('div', { class: 'reader-msg' }, 'Sorry, this guide could not be displayed. Please try again, or contact the Career Development Centre.'));
  }

  function relayout() {
    if (!s.doc) return;
    if (s.fit) s.scale = Math.min(1.25, Math.max(0.4, (scroller.clientWidth - 24) / s.base.width));
    zoomLabel.textContent = `${Math.round(s.scale * 100)}%`;
    const w = s.base.width * s.scale, hh = s.base.height * s.scale;
    s.tasks.forEach((t) => t.cancel()); s.tasks.clear();
    for (const p of s.pages) {
      p.el.style.width = `${w}px`; p.el.style.height = `${hh}px`;
      p.rendered = 0; p.el.classList.add('loading'); p.canvas?.remove(); p.canvas = null;
      s.io.unobserve(p.el); s.io.observe(p.el);
    }
  }

  async function render(p) {
    if (s.dead || p.rendered === s.scale) return;
    const scale = s.scale;
    p.rendered = scale;
    try {
      const page = await s.doc.getPage(p.n);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const vp = page.getViewport({ scale: scale * dpr });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
      const task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
      s.tasks.set(p.n, task);
      await task.promise;
      if (s.dead || p.rendered !== scale) return;
      p.canvas?.remove(); p.canvas = canvas; p.el.prepend(canvas); p.el.classList.remove('loading');
      p.el.style.height = `${vp.height / dpr}px`;
    } catch (e) { if (e?.name !== 'RenderingCancelledException') p.rendered = 0; }
  }
}
