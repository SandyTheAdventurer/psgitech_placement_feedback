import { api } from './api.js';
import { h, icon, mountScene, themeToggle, brand } from './ui.js';
import { state } from './main.js';

let gsiPromise = null;
function loadGoogle() {
  if (!gsiPromise) {
    gsiPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve(window.google);
      s.onerror = () => { gsiPromise = null; reject(new Error('Could not reach Google. Check your connection and try again.')); };
      document.head.append(s);
    });
  }
  return gsiPromise;
}

export function renderLogin(root, onLoggedIn) {
  const { googleClientId, domain } = state.config;
  let portal = 'student';
  const canvas = h('canvas', { class: 'scene', 'aria-hidden': 'true' });
  const err = h('div', { class: 'form-error', role: 'alert', hidden: true });
  const showErr = (m) => { err.textContent = m; err.hidden = false; card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); };
  const title = h('h2', null, 'Welcome back');
  const sub = h('p', { class: 'muted small' }, `Sign in with your @${domain} Google account.`);
  const sBtn = h('button', { type: 'button', class: 'active' }, 'Student');
  const aBtn = h('button', { type: 'button' }, 'Admin');
  const seg = h('div', { class: 'seg', 'data-i': '0' }, h('span', { class: 'thumb' }), sBtn, aBtn);
  const card = h('div', { class: 'login-card' });

  /* ---- student: Google single sign-on ---- */
  const gbtn = h('div');
  const gnote = h('p', { class: 'gnote' });
  const studentPane = h('div', { class: 'gwrap' }, gbtn, gnote);
  async function startGoogle() {
    if (!googleClientId) {
      gnote.replaceChildren(h('b', null, 'Google sign-in is not set up yet.'), ' Please ask CDC to finish the setup.');
      return;
    }
    gnote.textContent = 'Loading Google sign-in…';
    try {
      const google = await loadGoogle();
      google.accounts.id.initialize({
        client_id: googleClientId, hd: domain, ux_mode: 'popup', auto_select: false, cancel_on_tap_outside: true,
        callback: async ({ credential }) => {
          err.hidden = true;
          gnote.textContent = 'Signing you in…';
          try { onLoggedIn((await api.post('/api/auth/google', { credential })).user); }
          catch (e) { showErr(e.message); gnote.replaceChildren('Only ', h('b', null, `@${domain}`), ' accounts can sign in.'); }
        },
      });
      gbtn.replaceChildren();
      google.accounts.id.renderButton(gbtn, { theme: 'filled_blue', size: 'large', shape: 'pill', text: 'continue_with', width: 300, logo_alignment: 'left' });
      gnote.replaceChildren('Only ', h('b', null, `@${domain}`), ' accounts can sign in.');
    } catch (e) { gnote.textContent = ''; showErr(e.message); }
  }

  /* ---- admin: password ---- */
  const login = h('input', { class: 'input', name: 'login', autocomplete: 'username', required: true, autocapitalize: 'none', spellcheck: 'false' });
  const pw = h('input', { class: 'input', name: 'password', type: 'password', autocomplete: 'current-password', required: true });
  const submit = h('button', { class: 'btn accent block', type: 'submit' }, 'Sign in');
  const eye = h('button', { type: 'button', 'aria-label': 'Show password' }, icon('eye'));
  eye.onclick = () => {
    const show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    eye.replaceChildren(icon(show ? 'eyeoff' : 'eye'));
    eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  };
  const adminPane = h('form', {
    hidden: true,
    onsubmit: async (e) => {
      e.preventDefault(); err.hidden = true; submit.disabled = true;
      submit.replaceChildren(h('span', { class: 'spin' }), 'Signing in…');
      try { onLoggedIn((await api.post('/api/auth/login', { login: login.value, password: pw.value })).user); }
      catch (ex) { showErr(ex.message); submit.disabled = false; submit.replaceChildren('Sign in'); }
    },
  }, h('label', { class: 'field' }, 'Admin username', login), h('label', { class: 'field' }, 'Password', h('div', { class: 'pw' }, pw, eye)), submit);

  function setPortal(p) {
    portal = p;
    seg.dataset.i = p === 'admin' ? '1' : '0';
    sBtn.classList.toggle('active', p === 'student'); aBtn.classList.toggle('active', p === 'admin');
    studentPane.hidden = p === 'admin'; adminPane.hidden = p !== 'admin';
    title.textContent = p === 'admin' ? 'Admin sign in' : 'Welcome back';
    sub.textContent = p === 'admin' ? 'Manage companies, guides and student access.' : `Sign in with your @${domain} Google account.`;
    err.hidden = true;
    if (p === 'admin') login.focus();
  }
  sBtn.onclick = () => setPortal('student');
  aBtn.onclick = () => setPortal('admin');

  card.append(title, sub, seg, studentPane, adminPane, err,
    h('p', { class: 'login-foot' }, portal === 'student' ? `Trouble signing in? Contact the CDC office.` : ''));

  root.append(h('main', { class: 'login-page' }, canvas, h('div', { class: 'login-brand' }, brand(state.college)), h('div', { class: 'login-theme' }, themeToggle()),
    h('div', { class: 'login-layout' },
      h('div', { class: 'login-copy' },
        h('span', { class: 'eyebrow' }, `${state.college} · Placement Preparation`),
        h('h1', null, 'Learn from the seniors who ', h('em', null, 'cracked it.')),
        h('p', null, 'Round-by-round interview experiences and a preparation plan for each company — compiled by the Career Development Centre from post-drive debriefs.')),
      card)));

  let scene = null;
  mountScene(canvas, 'login').then((s) => { scene = s; });
  state.cleanup = () => scene?.dispose();
  startGoogle();
}
