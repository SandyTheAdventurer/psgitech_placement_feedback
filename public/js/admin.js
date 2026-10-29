import { api } from './api.js';
import { h, icon, clear, brand, modal, confirmBox, toast, chipsInput, fmtDate, fmtDateTime, fmtSize, countUp, themeToggle, colorStyle } from './ui.js';
import { avatar } from './student.js';
import { state, logout, promptPasswordChange } from './main.js';

export async function renderAdmin(root, hash) {
  const [, , section = '', id] = hash.split('/');
  const nav = (href, ic, label, active) => h('a', { class: `nav ${active ? 'active' : ''}`, href }, icon(ic), label);
  const main = h('main', { class: 'main' });
  root.append(h('div', { class: 'admin' },
    h('aside', { class: 'side' }, brand(state.college),
      nav('#/admin', 'chart', 'Overview', section === ''),
      nav('#/admin/companies', 'folder', 'Companies & guides', section === 'companies' || section === 'company'),
      nav('#/admin/students', 'users', 'Students', section === 'students'),
      nav('#/', 'eye', 'Student view', false),
      h('div', { class: 'grow' }),
      h('div', { class: 'me' }, h('b', null, state.user.name), h('span', { class: 'muted' }, 'Administrator'),
        h('div', { style: { display: 'flex', gap: '6px', marginTop: '10px' } },
          themeToggle(), h('button', { class: 'btn sm outline', onclick: () => promptPasswordChange(false) }, icon('key')),
          h('button', { class: 'btn sm outline', onclick: logout }, icon('logout'), 'Sign out')))),
    main));
  main.append(h('p', { class: 'muted' }, 'Loading…'));
  try {
    if (section === 'companies') await companiesView(main);
    else if (section === 'company') await companyView(main, Number(id));
    else if (section === 'students') await studentsView(main);
    else await overviewView(main);
  } catch (e) { clear(main); main.append(h('div', { class: 'form-error' }, e.message)); }
}

/* ------------------------------------------------------------- overview */
async function overviewView(main) {
  const s = await api.get('/api/admin/stats');
  const t = s.totals;
  clear(main);
  const tile = (ic, val, label) => { const b = h('b', null, '0'); countUp(b, val); return h('div', { class: 'tile' }, h('div', { class: 'ic' }, icon(ic)), b, h('span', null, label)); };
  const max = Math.max(1, ...s.daily.map((d) => d.n));
  const maxTop = Math.max(1, ...s.top.map((x) => x.hits));
  main.append(
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Overview'), h('p', null, 'How the placement guides are being used.')),
      h('a', { class: 'btn accent', href: '#/admin/companies' }, icon('plus'), 'Add company or guide')),
    h('div', { class: 'tiles' },
      tile('folder', t.companies, 'Companies'), tile('file', t.guides, 'PDF guides'), tile('eye', t.views, 'Guide views'), tile('users', t.students, `Students (${t.activeStudents} active in 30 days)`)),
    h('div', { class: 'cols' },
      h('div', { class: 'panel' }, h('h3', null, 'Guide activity — last 14 days', h('span', { class: 'muted tiny' }, `${t.views} ${t.views === 1 ? 'view' : 'views'}`)),
        s.daily.length ? h('div', { class: 'bars' }, s.daily.map((d) => h('div', { title: `${d.n} on ${d.day}` }, h('i', { style: { height: `${(d.n / max) * 100}%` } }), d.day.slice(5)))) : h('p', { class: 'muted' }, 'No student activity yet.')),
      h('div', { class: 'panel' }, h('h3', null, 'Most read guides'),
        s.top.length ? h('div', { class: 'rank' }, s.top.map((x) => h('div', { class: 'row' }, h('span', null, `${x.company} ${x.year}`), h('b', null, x.hits), h('div', { class: 'meter' }, h('i', { style: { width: `${(x.hits / maxTop) * 100}%` } })))))
          : h('p', { class: 'muted' }, 'Upload a guide to get started.'))),
    h('div', { class: 'panel' }, h('h3', null, 'Recent activity', h('span', { class: 'muted tiny' }, `Storage used: ${fmtSize(t.storage)}`)),
      s.recent.length ? h('div', { class: 'feed' }, s.recent.map((r) => h('div', null, h('span', null, h('b', null, r.student || 'A student'), ' opened ', `${r.company} ${r.year}`), h('span', { class: 'muted' }, fmtDateTime(r.at)))))
        : h('p', { class: 'muted' }, 'Nothing yet — activity appears when students open guides.')));
}

/* ------------------------------------------------------------ companies */
async function companiesView(main) {
  const { companies } = await api.get('/api/companies');
  clear(main);
  const q = h('input', { class: 'input', style: { maxWidth: '320px', margin: 0 }, type: 'search', placeholder: 'Search companies…', 'aria-label': 'Search companies' });
  const grid = h('div', { class: 'folders' });
  const draw = () => {
    clear(grid);
    grid.append(h('button', { class: 'folder add', style: { '--c': '#8a98ae' }, onclick: () => companyForm(null, companies, () => renderAdminAgain()) },
      h('div', { class: 'body' }, h('div', null, h('div', { style: { fontSize: '30px', lineHeight: 1 } }, '+'), h('b', null, 'Add new company'), h('div', { class: 'small' }, 'Create a folder, then upload yearly PDFs')))));
    companies.filter((c) => c.name.toLowerCase().includes(q.value.trim().toLowerCase())).forEach((c) => {
      grid.append(h('a', { class: 'folder', href: `#/admin/company/${c.id}`, style: { '--c': c.color, textDecoration: 'none', color: 'inherit', display: 'block' } },
        h('span', { class: 'tab' }),
        h('div', { class: 'body' }, h('h4', null, c.name), h('div', { class: 'role' }, c.role || '—'),
          h('div', { class: 'yrs' }, c.guides.length ? c.guides.map((g) => h('span', null, g.year)) : h('span', { class: 'none' }, 'No PDF yet — hidden from students')))));
    });
  };
  q.addEventListener('input', draw);
  main.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Companies & guides'), h('p', null, 'One folder per company, one PDF per year. Changes are live for students immediately.')), q), grid);
  draw();
}
const renderAdminAgain = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

async function companyView(main, id) {
  const { companies } = await api.get('/api/companies');
  const c = companies.find((x) => x.id === id);
  clear(main);
  if (!c) { main.append(h('p', null, 'Company not found. '), h('a', { href: '#/admin/companies' }, 'Back to companies')); return; }
  const files = h('div', { class: 'files' });
  c.guides.forEach((g) => files.append(h('div', { class: 'file' },
    h('div', { class: 'pdf' }, 'PDF'),
    h('div', { class: 'meta' }, h('b', null, g.year), ' ', g.batchLabel && h('span', { class: 'tag' }, g.batchLabel),
      h('div', null, `${fmtSize(g.size)} · updated ${fmtDate(g.updatedAt)}`),
      h('div', null, g.originalName)),
    h('div', { class: 'acts' },
      h('a', { class: 'btn sm outline', href: `#/read/${g.id}` }, icon('eye'), 'Preview'),
      h('button', { class: 'btn sm outline', onclick: () => guideForm(c, g) }, icon('edit'), 'Edit / replace'),
      h('button', { class: 'btn sm danger', 'aria-label': `Delete ${g.year} guide`, onclick: async () => {
        if (await confirmBox({ title: `Delete the ${g.year} guide?`, message: `The PDF for ${c.name} ${g.year} will be removed permanently and students will no longer see it.` })) {
          await api.del(`/api/admin/guides/${g.id}`); toast('Guide deleted.'); renderAdminAgain();
        }
      } }, icon('trash'))))));
  if (!c.guides.length) files.append(h('div', { class: 'empty panel' }, h('div', { class: 'big' }, '📄'), h('p', null, 'No PDFs yet. Upload the first one to publish this company to students.')));

  const logo = c.logo ? h('div', { class: 'logo img' }, h('img', { src: c.logo, alt: '' })) : h('div', { class: 'logo', style: colorStyle(c.color) }, c.name[0].toUpperCase());
  main.append(
    h('a', { class: 'back', href: '#/admin/companies' }, icon('arrow'), 'All companies'),
    h('div', { class: 'page-head' },
      h('div', { class: 'company-head' }, logo, h('div', null, h('h1', null, c.name), h('p', null, c.role || 'No role set'),
        h('div', { class: 'tags', style: { marginTop: '8px' } }, [...c.departments.map((d) => h('span', { class: 'tag' }, d)), ...c.topics.map((t) => h('span', { class: 'tag topic' }, t))]))),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        h('button', { class: 'btn outline', onclick: () => companyForm(c, companies, renderAdminAgain) }, icon('edit'), 'Edit details'),
        h('button', { class: 'btn danger', onclick: async () => {
          if (await confirmBox({ title: `Delete ${c.name}?`, message: `This removes the company and all ${c.guides.length} uploaded PDF(s). This cannot be undone.` })) {
            await api.del(`/api/admin/companies/${c.id}`); toast('Company deleted.'); location.hash = '#/admin/companies';
          }
        } }, icon('trash'), 'Delete'),
        h('button', { class: 'btn accent', onclick: () => guideForm(c, null) }, icon('upload'), 'Upload year PDF'))),
    h('div', { class: 'panel' }, h('h3', null, `${c.name} folder`, h('span', { class: 'muted tiny' }, `${c.guides.length} file${c.guides.length === 1 ? '' : 's'}`)), files));
}

function companyForm(c, all, done) {
  const name = h('input', { class: 'input', value: c?.name || '', required: true, maxlength: 80 });
  const role = h('input', { class: 'input', value: c?.role || '', placeholder: 'e.g. Summer Intern – Software Development Engineer', maxlength: 120 });
  const color = h('input', { class: 'input', type: 'color', value: c?.color || '#1f5c99', style: { padding: '4px', height: '44px' } });
  const logo = h('input', { class: 'input', type: 'file', accept: 'image/png,image/jpeg,image/webp' });
  const removeLogo = h('input', { type: 'checkbox' });
  const depts = chipsInput(c?.departments || [], 'Add department & press Enter', [...new Set(all.flatMap((x) => x.departments))]);
  const topics = chipsInput(c?.topics || [], 'Add topic & press Enter');
  const err = h('div', { class: 'form-error', hidden: true });
  modal({
    title: c ? `Edit ${c.name}` : 'Add a company', wide: true,
    body: [
      h('div', { class: 'form-grid' },
        h('label', { class: 'field' }, 'Company name', name),
        h('label', { class: 'field' }, 'Accent colour', color),
        h('label', { class: 'field full' }, 'Role / programme', role),
        h('label', { class: 'field full' }, 'Departments', h('span', { class: 'hint' }, 'used for the student filter chips'), depts.el),
        h('label', { class: 'field full' }, 'Key topics', h('span', { class: 'hint' }, 'shown as tags on the card'), topics.el),
        h('label', { class: 'field full' }, 'Logo', h('span', { class: 'hint' }, 'optional — PNG, JPG or WebP; a coloured initial is used otherwise'), logo),
        c?.logo && h('label', { class: 'field full', style: { fontWeight: 400 } }, removeLogo, ' Remove current logo')),
      err,
    ],
    actions: [
      { label: 'Cancel', cls: 'outline', onClick: ({ close }) => close() },
      { label: c ? 'Save changes' : 'Create company', onClick: async ({ close, button }) => {
        err.hidden = true;
        if (!name.value.trim()) { err.textContent = 'Please enter the company name.'; err.hidden = false; return; }
        const fd = new FormData();
        fd.append('name', name.value); fd.append('role', role.value); fd.append('color', color.value);
        fd.append('departments', JSON.stringify(depts.get())); fd.append('topics', JSON.stringify(topics.get()));
        if (logo.files[0]) fd.append('logo', logo.files[0]);
        if (removeLogo.checked) fd.append('removeLogo', '1');
        button.disabled = true;
        try {
          const r = await api.upload(c ? 'PUT' : 'POST', c ? `/api/admin/companies/${c.id}` : '/api/admin/companies', fd);
          close(); toast(c ? 'Company updated.' : 'Company created — now upload its PDF.');
          if (!c) location.hash = `#/admin/company/${r.company.id}`; else done();
        } catch (e) { err.textContent = e.message; err.hidden = false; button.disabled = false; }
      } },
    ],
  });
}

function guideForm(c, g) {
  const thisYear = new Date().getFullYear();
  const year = h('input', { class: 'input', type: 'number', min: 2000, max: 2100, value: g?.year || thisYear, required: true });
  const batch = h('input', { class: 'input', value: g?.batchLabel || '', placeholder: `e.g. Summer Internship ${thisYear}`, maxlength: 80 });
  const file = h('input', { type: 'file', accept: 'application/pdf,.pdf', hidden: true });
  const dropText = h('div', null);
  const drop = h('div', { class: 'drop', tabindex: '0', role: 'button', 'aria-label': 'Choose PDF file' }, icon('upload', 'icon'), dropText);
  const setFile = (f) => {
    if (f && !/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { toast('Please choose a PDF file.', 'err'); return; }
    picked = f;
    drop.classList.toggle('has', !!f);
    dropText.replaceChildren(f ? h('b', null, f.name, ' · ', fmtSize(f.size)) : g ? `Current: ${g.originalName} — drop a new PDF to replace it` : 'Drag & drop the PDF here, or click to browse');
  };
  let picked = null;
  setFile(null);
  drop.onclick = () => file.click();
  drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } };
  file.onchange = () => setFile(file.files[0]);
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => setFile(e.dataTransfer.files[0]));
  const bar = h('i'); const prog = h('div', { class: 'progress', hidden: true }, bar);
  const err = h('div', { class: 'form-error', hidden: true });

  const m = modal({
    title: g ? `Edit ${c.name} ${g.year}` : `Upload guide for ${c.name}`, wide: true,
    body: [
      drop, file,
      h('div', { class: 'form-grid' },
        h('label', { class: 'field' }, 'Year', year), h('label', { class: 'field' }, 'Batch label', batch)
      ),
      prog, err,
    ],
    actions: [
      { label: 'Cancel', cls: 'outline', onClick: ({ close }) => close() },
      { label: g ? 'Save' : 'Upload & publish', onClick: async ({ close, button }) => {
        err.hidden = true;
        if (!g && !picked) { err.textContent = 'Please choose the PDF for this year.'; err.hidden = false; return; }
        const send = async (replace) => {
          const fd = new FormData();
          fd.append('year', year.value); fd.append('batchLabel', batch.value);
          if (picked) fd.append('pdf', picked);
          if (replace) fd.append('replace', '1');
          prog.hidden = false; bar.style.width = '0';
          m.overlay.dataset.lock = '1'; button.disabled = true;
          return api.upload(g ? 'PUT' : 'POST', g ? `/api/admin/guides/${g.id}` : `/api/admin/companies/${c.id}/guides`, fd, (p) => { bar.style.width = `${Math.round(p * 100)}%`; });
        };
        try {
          try { await send(false); }
          catch (e) {
            if (e.status !== 409 || g) throw e;
            delete m.overlay.dataset.lock; prog.hidden = true; button.disabled = false;
            if (!(await confirmBox({ title: `Replace the ${year.value} PDF?`, message: `${c.name} already has a ${year.value} guide. Uploading will replace it.`, confirm: 'Replace', danger: false }))) return;
            await send(true);
          }
          close(); toast(g ? 'Guide updated.' : 'Guide published — students can see it now.'); renderAdminAgain();
        } catch (e) {
          err.textContent = e.message; err.hidden = false; prog.hidden = true; button.disabled = false; delete m.overlay.dataset.lock;
        }
      } },
    ],
  });
}

/* ------------------------------------------------------------- students */
// Accounts appear automatically the first time a student signs in with their college Google account.
async function studentsView(main) {
  let { students } = await api.get('/api/admin/students');
  clear(main);
  const q = h('input', { class: 'input', style: { maxWidth: '300px', margin: 0 }, type: 'search', placeholder: 'Search students…', 'aria-label': 'Search students' });
  const body = h('tbody');
  const count = h('p', { class: 'muted' });
  const reload = async () => { students = (await api.get('/api/admin/students')).students; draw(); };
  const draw = () => {
    clear(body);
    const term = q.value.trim().toLowerCase();
    const list = students.filter((s) => !term || [s.name, s.login].join(' ').toLowerCase().includes(term));
    count.textContent = `${list.length} of ${students.length} students`;
    if (!list.length) body.append(h('tr', null, h('td', { colspan: 4, class: 'muted', style: { textAlign: 'center', padding: '30px' } }, students.length ? 'No matches.' : 'No students yet — they appear here after their first Google sign-in.')));
    list.forEach((s) => body.append(h('tr', null,
      h('td', null, h('div', { class: 'who' }, avatar(s), h('div', null, h('b', null, s.name), h('div', { class: 'tiny muted' }, s.login)))),
      h('td', null, s.active ? h('span', { class: 'badge' }, 'Active') : h('span', { class: 'badge off' }, 'Disabled')),
      h('td', { class: 'small' }, fmtDateTime(s.lastLogin)),
      h('td', null, h('div', { style: { display: 'flex', gap: '6px', justifyContent: 'flex-end' } },
        h('button', { class: 'btn sm outline', onclick: async () => { await api.put(`/api/admin/students/${s.id}`, { active: !s.active }); toast(s.active ? 'Access disabled.' : 'Access restored.'); reload(); } }, s.active ? 'Disable' : 'Enable'),
        h('button', { class: 'btn sm danger', 'aria-label': `Remove ${s.name}`, onclick: async () => { if (await confirmBox({ title: `Remove ${s.name}?`, message: 'Their account is deleted. They can sign in again with Google, which creates a fresh account — use Disable to block access instead.' })) { await api.del(`/api/admin/students/${s.id}`); toast('Student removed.'); reload(); } } }, icon('trash')))))));
  };
  q.addEventListener('input', draw);
  main.append(
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Students'), h('p', null, `Anyone with a @${state.config.domain} Google account can sign in. Disable an account to block access.`))),
    h('div', { class: 'panel' }, h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' } }, q, count),
      h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, ['Student', 'Status', 'Last sign-in', ''].map((x) => h('th', null, x)))), body))));
  draw();
}
