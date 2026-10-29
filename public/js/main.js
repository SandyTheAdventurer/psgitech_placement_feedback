import { api, setUnauthorizedHandler } from './api.js';
import { $, clear, h, modal, toast, icon } from './ui.js';

const app = $('#app');
export const state = { user: null, college: 'PSG iTech', config: { googleClientId: '', domain: 'psgitech.ac.in' }, cleanup: null };

function swap(render) {
  state.cleanup?.(); state.cleanup = null;
  closeReader();
  document.querySelectorAll('.overlay:not([data-pwmodal])').forEach((o) => o.remove());
  clear(app);
  window.scrollTo(0, 0);
  return render(app);
}

let closeReader = () => {};
export const setReaderCloser = (fn) => { closeReader = fn; };

let returnHash = '#/';
export const getReturnHash = () => returnHash;

async function route() {
  const hash = location.hash || '#/';
  if (!hash.startsWith('#/read/')) returnHash = hash; else if (!returnHash || returnHash.startsWith('#/read/')) returnHash = '#/';
  if (!state.user) {
    const { renderLogin } = await import('./login.js');
    return swap((root) => renderLogin(root, onLoggedIn));
  }
  if (state.user.mustChange) promptPasswordChange(true);

  if (hash.startsWith('#/admin')) {
    if (state.user.role !== 'admin') { location.hash = '#/'; return; }
    const { renderAdmin } = await import('./admin.js');
    return swap((root) => renderAdmin(root, hash));
  }
  if (hash.startsWith('#/read/')) {
    // keep the catalogue behind the reader
    if (!$('.hero')) await showStudent();
    const { openReader } = await import('./reader.js');
    return openReader(Number(hash.split('/')[2]));
  }
  if ($('.hero')) { closeReader(); return; } // returning from the reader — keep the catalogue as is
  await showStudent();
}
async function showStudent() {
  const { renderStudent } = await import('./student.js');
  swap((root) => renderStudent(root));
}

function onLoggedIn(user) {
  state.user = user;
  location.hash = user.role === 'admin' ? '#/admin' : '#/';
  route();
}

export async function logout() {
  try { await api.post('/api/auth/logout'); } catch { /* ignore */ }
  state.user = null;
  location.hash = '#/';
  route();
}

export function promptPasswordChange(forced = false) {
  if (document.querySelector('[data-pwmodal]')) return;
  const cur = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', required: true });
  const nw = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', minlength: 8, required: true });
  const nw2 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', required: true });
  const err = h('div', { class: 'form-error', hidden: true });
  const m = modal({
    title: forced ? 'Set a new password' : 'Change password',
    body: [
      forced && h('p', { class: 'muted small' }, 'For your security, please choose your own password before continuing.'),
      h('label', { class: 'field' }, forced ? 'Temporary password' : 'Current password', cur),
      h('label', { class: 'field' }, 'New password', h('span', { class: 'hint' }, 'min. 8 characters'), nw),
      h('label', { class: 'field' }, 'Confirm new password', nw2), err,
    ],
    actions: [
      !forced && { label: 'Cancel', cls: 'outline', onClick: ({ close }) => close() },
      {
        label: 'Update password',
        onClick: async ({ close, button }) => {
          err.hidden = true;
          if (nw.value !== nw2.value) { err.textContent = 'The new passwords do not match.'; err.hidden = false; return; }
          button.disabled = true;
          try {
            const r = await api.post('/api/auth/change-password', { current: cur.value, next: nw.value });
            state.user = r.user; close(); toast('Password updated.');
          } catch (e) { err.textContent = e.message; err.hidden = false; button.disabled = false; }
        },
      },
    ].filter(Boolean),
  });
  m.overlay.dataset.pwmodal = '1';
  if (forced) m.overlay.dataset.lock = '1';
}

setUnauthorizedHandler(() => {
  if (!state.user) return;
  state.user = null;
  toast('Your session has expired — please sign in again.', 'err');
  route();
});
window.addEventListener('hashchange', route);

(async function boot() {
  try { const c = await api.get('/api/config'); state.config = c; state.college = c.college; } catch { /* defaults */ }
  try { state.user = (await api.get('/api/auth/me')).user; } catch { /* not signed in */ }
  route();
})();

export { icon };
