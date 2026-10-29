import { api } from './api.js';
import { put, h, icon, clear, brand, countUp, mountScene, fmtDate, initials, themeToggle, isNew, colorStyle } from './ui.js';
import { state, logout, promptPasswordChange } from './main.js';

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(`${k}:${state.user.id}`)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`${k}:${state.user.id}`, JSON.stringify(v)); } catch { /* private mode */ } },
};
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';

export function avatar(user) {
  return h('span', { class: 'avatar' }, user.picture ? h('img', { src: user.picture, alt: '', referrerpolicy: 'no-referrer' }) : initials(user.name));
}

export async function renderStudent(root) {
  const isAdmin = state.user.role === 'admin';
  const first = state.user.name.split(/\s+/)[0];
  const canvas = h('canvas', { class: 'scene', 'aria-hidden': 'true' });
  const statEls = { companies: h('b', null, '0'), guides: h('b', null, '0') };
  const grid = h('div', { class: 'grid', 'aria-live': 'polite' }, [1, 2, 3].map(() => h('div', { class: 'skeleton' })));
  const countLine = h('div', { class: 'count-line' }, 'Loading guides…');
  const chips = h('div', { class: 'filters' });
  const recentBox = h('div');
  const latestChip = h('div', { class: 'hero-chip', hidden: true });
  const search = h('input', { type: 'search', placeholder: 'Search by company, role or topic (e.g. DSA, thermodynamics)', 'aria-label': 'Search guides', autocomplete: 'off' });
  const progress = h('div', { class: 'scroll-progress' });
  const toTop = h('button', { class: 'to-top', 'aria-label': 'Back to top', onclick: () => window.scrollTo({ top: 0, behavior: 'smooth' }) }, icon('up'));

  let companies = [];
  const saved = new Set(store.get('saved', []));
  const openPalette = () => palette(companies, saved);
  const top = h('header', { class: 'topbar' }, brand(state.college),
    h('div', { class: 'top-actions' },
      isAdmin && h('a', { class: 'btn ghost sm', href: '#/admin' }, icon('grid'), 'Admin dashboard'),
      themeToggle(),
      h('div', { class: 'user-pill' }, h('span', { class: 'nm' }, state.user.name), avatar(state.user)),
      isAdmin && h('button', { class: 'btn ghost sm', title: 'Change password', 'aria-label': 'Change password', onclick: () => promptPasswordChange(false) }, icon('key')),
      h('button', { class: 'btn ghost sm', onclick: logout }, icon('logout'), h('span', null, 'Sign out'))));

  const hero = h('section', { class: 'hero' }, canvas, top,
    h('div', { class: 'hero-inner' },
      h('div', { class: 'greet' }, '👋 Welcome back, ', h('b', null, first)),
      latestChip,
      h('span', { class: 'eyebrow' }, 'Placement preparation'),
      h('h1', null, 'Company ', h('em', null, 'Preparation'), ' Guides'),
      h('p', { class: 'lead' }, 'Round-by-round interview experiences and a preparation plan for each company — compiled by the Career Development Centre from post-drive debriefs.'),
      h('div', { class: 'hero-stats' },
        h('div', { class: 'hero-stat' }, statEls.companies, h('span', null, 'Companies')),
        h('div', { class: 'hero-stat' }, statEls.guides, h('span', null, 'Guides')))),
    h('div', { class: 'hero-wave', 'aria-hidden': 'true' }));

  root.append(progress, hero,
    h('main', { class: 'wrap' },
      h('div', { class: 'toolbar' }, h('div', { class: 'search' }, icon('search'), search, h('span', { class: 'kbd' }, '/'))),
      chips, recentBox, countLine, grid,
      h('div', { class: 'notice' }, icon('shield'), h('div', null, h('b', null, `For ${state.college} students only. `), 'These guides contain personal interview experiences. Please do not share the files or screenshots outside the college. Patterns change between drives — use the guides to aim your preparation, not limit it.'))),
    toTop);
  if (isAdmin) root.append(h('div', { class: 'preview-banner' }, 'Previewing the student view', h('a', { class: 'btn accent sm', href: '#/admin' }, 'Back to admin')));

  let scene = null, io = null;
  mountScene(canvas, 'hero').then((s) => { scene = s; });
  const onKey = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
    else if (e.key === '/' && !e.target.closest('input,textarea,select')) { e.preventDefault(); search.focus(); }
  };
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
    toTop.classList.toggle('show', scrollY > 700);
  };
  const onHash = () => { if (location.hash.startsWith('#/read/')) remember(Number(location.hash.split('/')[2])); };
  document.addEventListener('keydown', onKey);
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('hashchange', onHash);
  state.cleanup = () => { scene?.dispose(); io?.disconnect(); document.removeEventListener('keydown', onKey); removeEventListener('scroll', onScroll); removeEventListener('hashchange', onHash); };

  try { companies = (await api.get('/api/companies')).companies; }
  catch (e) { clear(grid); grid.append(h('div', { class: 'empty' }, e.message)); countLine.textContent = ''; return; }

  countUp(statEls.companies, companies.length);
  countUp(statEls.guides, companies.reduce((n, c) => n + c.guides.length, 0));
  const newest = companies.flatMap((c) => c.guides.map((g) => ({ c, g }))).sort((a, b) => b.g.updatedAt.localeCompare(a.g.updatedAt))[0];
  if (newest) {
    latestChip.hidden = false;
    latestChip.append(h('span', { class: 'live' }), 'Latest: ', h('a', { href: `#/read/${newest.g.id}` }, `${newest.c.name} ${newest.g.year}`), ` · ${fmtDate(newest.g.updatedAt)}`);
  }

  const f = { q: '', dept: 'All', savedOnly: false, year: 'All', sort: 'az' };
  const depts = ['All', ...new Set(companies.flatMap((c) => c.departments))].sort((a, b) => (a === 'All' ? -1 : b === 'All' ? 1 : a.localeCompare(b)));
  const years = [...new Set(companies.flatMap((c) => c.guides.map((g) => g.year)))].sort((a, b) => b - a);
  const yearSel = h('select', { class: 'input', 'aria-label': 'Filter by year', onchange: (e) => { f.year = e.target.value; draw(); } },
    h('option', { value: 'All' }, 'All years'), years.map((y) => h('option', { value: y }, y)));
  const sortSel = h('select', { class: 'input', 'aria-label': 'Sort guides', onchange: (e) => { f.sort = e.target.value; draw(); } },
    h('option', { value: 'az' }, 'A → Z'), h('option', { value: 'new' }, 'Recently updated'));
  const savedBtn = h('button', { class: 'pill', onclick: () => { f.savedOnly = !f.savedOnly; savedBtn.classList.toggle('active', f.savedOnly); draw(); } }, '♥ Saved');

  const drawChips = () => {
    clear(chips);
    depts.forEach((d) => chips.append(h('button', { class: `pill ${f.dept === d ? 'active' : ''}`, onclick: () => { f.dept = d; drawChips(); draw(); } }, d === 'All' ? 'All departments' : d)));
    put(chips, h('span', { class: 'spacer' }), savedBtn, years.length > 1 ? yearSel : null, sortSel);
  };
  drawChips();
  let t;
  search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { f.q = search.value.trim().toLowerCase(); draw(); }, 120); });

  io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.08 });

  function drawRecent() {
    clear(recentBox);
    const items = store.get('recent', []).map((r) => {
      const c = companies.find((x) => x.id === r.c); const g = c?.guides.find((x) => x.id === r.g);
      return c && g ? { c, g } : null;
    }).filter(Boolean).slice(0, 6);
    if (!items.length) return;
    const forget = (companyId) => { store.set('recent', store.get('recent', []).filter((r) => r.c !== companyId)); drawRecent(); };
    put(recentBox,
      h('div', { class: 'section-title' }, 'Continue where you left off',
        h('button', { class: 'link-btn', type: 'button', onclick: () => { store.set('recent', []); drawRecent(); } }, 'Clear all')),
      h('div', { class: 'recent' }, items.map(({ c, g }) => h('div', { class: 'recent-item', style: colorStyle(c.color) },
        h('a', { href: `#/read/${g.id}` }, h('span', { class: 'dot' }, c.name[0].toUpperCase()), h('div', null, h('b', null, c.name), h('span', null, `${g.year} guide`))),
        h('button', { class: 'recent-x', type: 'button', title: 'Remove from this list', 'aria-label': `Remove ${c.name} from continue reading`, onclick: () => forget(c.id) }, icon('close'))))));
  }
  function remember(gid) {
    const c = companies.find((x) => x.guides.some((g) => g.id === gid));
    if (!c) return;
    store.set('recent', [{ c: c.id, g: gid }, ...store.get('recent', []).filter((r) => r.c !== c.id)].slice(0, 8));
    drawRecent();
  }
  drawRecent();
  onHash();

  function draw() {
    const list = companies.filter((c) => {
      if (f.dept !== 'All' && !c.departments.includes(f.dept)) return false;
      if (f.savedOnly && !saved.has(c.id)) return false;
      if (f.year !== 'All' && !c.guides.some((g) => String(g.year) === f.year)) return false;
      if (!f.q) return true;
      const hay = [c.name, c.role, ...c.topics, ...c.departments, ...c.guides.flatMap((g) => [g.batchLabel, String(g.year)])].join(' ').toLowerCase();
      return f.q.split(/\s+/).every((w) => hay.includes(w));
    });
    const latest = (c) => c.guides.reduce((m, g) => (g.updatedAt > m ? g.updatedAt : m), '');
    if (f.sort === 'new') list.sort((a, b) => latest(b).localeCompare(latest(a)));
    countLine.textContent = `${list.length} of ${companies.length} ${companies.length === 1 ? 'company' : 'companies'}`;
    clear(grid); io.disconnect();
    if (!list.length) {
      grid.append(h('div', { class: 'empty', style: { gridColumn: '1 / -1' } }, h('div', { class: 'big' }, companies.length ? '🔍' : '📂'),
        h('h3', null, companies.length ? 'No guides match your filters' : 'No guides published yet'),
        h('p', null, companies.length ? 'Try a different keyword or clear the filters.' : 'Check back soon — CDC adds guides after every drive.')));
      return;
    }
    list.forEach((c) => { const el = card(c); grid.append(el); io.observe(el); });
  }

  function card(c) {
    let g = (f.year !== 'All' && c.guides.find((x) => String(x.year) === f.year)) || c.guides[0];
    const body = h('div', { class: 'card-body' });
    const el = h('article', { class: 'card', style: colorStyle(c.color) }, h('div', { class: 'bar' }), h('div', { class: 'glare' }), body);
    const paint = () => {
      clear(body);
      const logo = c.logo
        ? h('div', { class: 'logo img' }, h('img', { src: c.logo, alt: `${c.name} logo`, loading: 'lazy' }))
        : h('div', { class: 'logo' }, c.name[0].toUpperCase());
      const saveBtn = h('button', { class: `save ${saved.has(c.id) ? 'on' : ''}`, 'aria-pressed': String(saved.has(c.id)), 'aria-label': `Save ${c.name}`, title: 'Save for later',
        onclick: () => { saved.has(c.id) ? saved.delete(c.id) : saved.add(c.id); store.set('saved', [...saved]); saveBtn.classList.toggle('on'); saveBtn.setAttribute('aria-pressed', String(saved.has(c.id))); if (f.savedOnly) draw(); } }, icon('star'));
      put(body,
        h('div', { class: 'card-head' }, logo, h('div', null, h('h3', null, c.name, isNew(g.updatedAt) && h('span', { class: 'badge-new' }, 'NEW')), h('div', { class: 'role' }, c.role)), saveBtn),
        c.guides.length > 1 && h('div', { class: 'years' }, 'Year', c.guides.map((x) => h('button', { class: x.id === g.id ? 'active' : '', onclick: () => { g = x; paint(); } }, x.year))),
        h('div', { class: 'tags' }, [g.batchLabel].filter(Boolean).map((tg) => h('span', { class: 'tag' }, tg))),
        c.topics.length > 0 && h('div', { class: 'tags' }, c.topics.map((tp) => h('span', { class: 'tag topic' }, tp))),
        h('div', { class: 'card-actions' },
          h('a', { class: 'btn block', href: `#/read/${g.id}` }, icon('book'), 'Read guide')),
        h('div', { class: 'updated' }, `Updated ${fmtDate(g.updatedAt)}`));
    };
    paint();
    if (!matchMedia('(hover: none), (prefers-reduced-motion: reduce)').matches) {
      el.addEventListener('pointermove', (e) => {
        if (!el.classList.contains('in')) return;
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        el.classList.add('tilting');
        el.style.transform = `rotateX(${(0.5 - py) * 9}deg) rotateY(${(px - 0.5) * 11}deg) translateY(-6px)`;
        el.style.setProperty('--mx', `${px * 100}%`); el.style.setProperty('--my', `${py * 100}%`);
      });
      el.addEventListener('pointerleave', () => { el.classList.remove('tilting'); el.style.transform = ''; });
    }
    return el;
  }
  draw();
}

/* Ctrl/⌘ + K quick-find */
function palette(companies, saved) {
  if (document.querySelector('.palette')) return;
  let sel = 0, results = [];
  const input = h('input', { type: 'text', placeholder: 'Jump to a company or topic…', 'aria-label': 'Quick find', autocomplete: 'off' });
  const ul = h('ul', { role: 'listbox' });
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey, true); };
  const go = (c) => { if (c) { close(); location.hash = `#/read/${c.guides[0].id}`; } };
  const render = () => {
    const q = input.value.trim().toLowerCase();
    results = companies.filter((c) => !q || [c.name, c.role, ...c.topics, ...c.departments].join(' ').toLowerCase().includes(q))
      .sort((a, b) => Number(saved.has(b.id)) - Number(saved.has(a.id))).slice(0, 8);
    sel = Math.min(sel, Math.max(0, results.length - 1));
    clear(ul);
    if (!results.length) ul.append(h('li', { style: { color: 'var(--muted)', cursor: 'default' } }, 'No matches'));
    results.forEach((c, i) => ul.append(h('li', { role: 'option', 'aria-selected': String(i === sel), style: colorStyle(c.color), onmousemove: () => { if (sel !== i) { sel = i; render(); } }, onclick: () => go(c) },
      h('span', { class: 'dot' }, c.name[0].toUpperCase()), h('div', null, h('b', null, c.name, saved.has(c.id) ? ' ♥' : ''), h('small', null, c.role)), h('span', { class: 'go' }, 'Open ↵'))));
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.max(1, results.length); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + results.length) % Math.max(1, results.length); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[sel]); }
  };
  const ov = h('div', { class: 'overlay palette', onmousedown: (e) => { if (e.target === ov) close(); } },
    h('div', { class: 'pal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Quick find' }, input, ul,
      h('div', { class: 'foot' }, h('span', null, h('span', { class: 'kbd' }, '↑↓'), ' navigate'), h('span', null, h('span', { class: 'kbd' }, '↵'), ' open'), h('span', null, h('span', { class: 'kbd' }, 'esc'), ' close'))));
  document.body.append(ov);
  document.addEventListener('keydown', onKey, true);
  input.addEventListener('input', () => { sel = 0; render(); });
  render(); input.focus();
}
