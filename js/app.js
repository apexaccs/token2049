import { drawBadge } from './badge.js';
// ═══════════════════════════════════════════════════════════════════════════
//  DON'T GET PLAYED — page behaviour. The 3D layer is loaded last and optional:
//  without WebGL the page still works and shows flat chrome marks instead.
// ═══════════════════════════════════════════════════════════════════════════
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── the mark as SVG (same outline the 3D model is extruded from) ───────── */
const LOGO = [
  [[-0.096, 1.03, .2], [0.265, 0.943, .08], [-0.357, -0.557, .05], [-1.19, -1.02, .06]],
  [[0.291, 0.843, .05], [1.187, -1.02, .06], [-0.074, -0.6, .04], [-0.17, -0.47, .12]]
];
const logoPath = LOGO.map(pts => pts.map(([x, y, r], i) => {
  const n = pts.length, p = pts[(i - 1 + n) % n], q = pts[(i + 1) % n];
  const d1 = Math.hypot(p[0] - x, p[1] - y), d2 = Math.hypot(q[0] - x, q[1] - y), rr = Math.min(r, d1 / 2, d2 / 2);
  const a = [x + (p[0] - x) / d1 * rr, y + (p[1] - y) / d1 * rr], b = [x + (q[0] - x) / d2 * rr, y + (q[1] - y) / d2 * rr];
  const f = v => v.toFixed(4);
  return (i ? 'L' : 'M') + f(a[0]) + ' ' + f(-a[1]) + ' Q' + f(x) + ' ' + f(-y) + ' ' + f(b[0]) + ' ' + f(-b[1]);
}).join(' ') + ' Z').join(' ');
$$('.logo-path').forEach(p => p.setAttribute('d', logoPath));

/* ── loader ─────────────────────────────────────────────────────────────── */
const loader = $('#loader'), prog = $('#loaderProg');
let loaded = false;
requestAnimationFrame(() => prog.style.width = '45%');
function dismiss() {
  if (loaded) return; loaded = true;
  prog.style.width = '100%';
  setTimeout(() => loader.classList.add('done'), 250);
}
setTimeout(dismiss, 6000);

/* ── tools data ─────────────────────────────────────────────────────────── */
const I = {
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  honey: '<path d="M12 3l7 4v10l-7 4-7-4V7z"/><path d="M12 8.5c1.6 2 2.5 3.3 2.5 4.5a2.5 2.5 0 01-5 0c0-1.2.9-2.5 2.5-4.5z"/>',
  wallet: '<path d="M3 7h15a3 3 0 013 3v7a3 3 0 01-3 3H3z"/><path d="M3 7l12-3v3M16 13.5h2"/>',
  social: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0M16 11l2 2 4-4"/>',
  rug: '<path d="M3 7l6 6 4-4 8 8"/><path d="M21 11v6h-6"/>',
  whale: '<path d="M2 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 13c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pie: '<path d="M21 12A9 9 0 1112 3v9z"/><path d="M15 3.5A9 9 0 0120.5 9H15z"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  key: '<circle cx="7.5" cy="15.5" r="3.5"/><path d="M10 13l9-9M16 7l2 2M14 9l2 2"/>',
  scope: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4M11 8v6M8 11h6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  doc: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
  compare: '<path d="M8 4v16M16 4v16M4 8l4-4 4 4M12 16l4 4 4-4"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14"/>',
  diff: '<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M6 15.8V4M18 8.2c0 6-12 2-12 7.6"/>'
};
const TOOLS = [
  ['consumer', 'target', 'Token Risk Scanner', 'SAFE / WARN / DANGER verdict with a 0–100 score, multichain'],
  ['consumer', 'honey', 'Honeypot Detector', 'Simulates a sell before you buy to catch exit scams'],
  ['consumer', 'wallet', 'Wallet Risk Check', 'Dangerous approvals, drainers, scam contacts'],
  ['consumer', 'social', 'Social Authenticity', 'Bots vs real followers, deepfakes, impersonators'],
  ['consumer', 'rug', 'Rug Pull Probability', 'LP lock, insider supply, dump pattern analysis'],
  ['consumer', 'whale', 'Whale Tracker', 'Top holder movements and concentration signals'],
  ['consumer', 'clock', 'Creator History', 'Past scams by the contract deployer across all chains'],
  ['consumer', 'pie', 'LP & Tokenomics', 'Unlocks in 90 days, taxes, liquidity lock status'],
  ['consumer', 'eye', 'Deepfake Check', 'Flags fake accounts impersonating projects or execs'],
  ['pro', 'shield', 'Full Contract Audit', 'Slither + static analysis, 15+ vulnerability classes'],
  ['pro', 'key', 'Access Control Check', 'Mint, pause and upgrade key holders, multisig status'],
  ['pro', 'scope', 'On-chain Forensics', 'Transaction tracing and wallet cluster mapping'],
  ['pro', 'globe', 'Jurisdiction Ranker', '28 jurisdictions ranked for your project profile'],
  ['pro', 'doc', 'Audit Report Gen', 'PDF report ready for investor due diligence'],
  ['pro', 'compare', 'Contract Compare', 'Detects forks of known scam contracts'],
  ['pro', 'link', 'Fund Match', '400+ Web3 funds matched to your project profile'],
  ['pro', 'code', 'Token Security API', 'GoPlus + Slither + CertiK aggregated at one endpoint'],
  ['pro', 'diff', 'Audit Diff Checker', 'What changed in the contract since the last audit']
];
const esc = s => s.replace(/&/g, '&amp;');
$('#toolGrid').innerHTML = TOOLS.map(([k, ic, name, desc]) => `
  <article class="tool glass ${k}" data-kind="${k}">
    <div class="t-top"><span class="ico"><svg class="i" viewBox="0 0 24 24">${I[ic]}</svg></span><span class="kind">${k === 'pro' ? 'PRO' : 'CONSUMER'}</span></div>
    <b>${esc(name)}</b><p>${esc(desc)}</p>
  </article>`).join('');

/* segmented filter with a sliding silver thumb */
const seg = $('#seg'), thumb = $('.seg-thumb', seg);
function setFilter(f) {
  $$('button', seg).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === f)));
  $$('.tool').forEach(t => t.classList.toggle('out', !(f === 'all' || t.dataset.kind === f)));
  moveThumb();
}
function moveThumb() {
  const b = $('button[aria-pressed="true"]', seg); if (!b) return;
  thumb.style.width = b.offsetWidth + 'px';
  thumb.style.transform = `translateX(${b.offsetLeft}px)`;
}
$$('button', seg).forEach(b => b.addEventListener('click', () => setFilter(b.dataset.f)));
addEventListener('resize', moveThumb);
document.fonts?.ready.then(moveThumb);
moveThumb();

/* ── storage (every read/write guarded) ─────────────────────────────────── */
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
const html = document.documentElement;
let world = null;

/* ── sections: each nav item opens its own page ─────────────────────────── */
const PAGES = $$('.page');
const PAGE_OF = {};                  // element id → page name
PAGES.forEach(pg => { PAGE_OF[pg.dataset.page] = pg.dataset.page; $$('[id]', pg).forEach(el => { PAGE_OF[el.id] = pg.dataset.page; }); });
let page = null;

function showPage(name) {
  if (name === page) return false;
  page = name;
  PAGES.forEach(pg => {
    const on = pg.dataset.page === name;
    pg.hidden = !on;
    if (on && !reduce) { pg.classList.remove('enter'); void pg.offsetWidth; pg.classList.add('enter'); }
  });
  $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === name));
  setActive();
  requestAnimationFrame(moveThumb);
  return true;
}
function go(id, { smooth = true } = {}) {
  const name = PAGE_OF[id] || 'home';
  const changed = showPage(name);
  const el = document.getElementById(id);
  // a page opens at its top; an anchor inside the page scrolls to it
  const isPageTop = !el || id === 'top' || id === name || el === document.querySelector(`.page[data-page="${name}"] > section`);
  if (isPageTop) scrollTo({ top: 0, behavior: changed || !smooth ? 'instant' : 'smooth' });
  else el.scrollIntoView({ behavior: changed || !smooth ? 'instant' : 'smooth', block: 'start' });
  try { history.replaceState(null, '', '#' + (id === 'top' ? '' : id)); } catch (e) {}
  closeMenus();
}
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  e.preventDefault();
  go(a.getAttribute('href').slice(1) || 'top');
});
addEventListener('hashchange', () => go(location.hash.slice(1) || 'top', { smooth: false }));

/* ── nav: the liquid bubble sits under the current section ─────────────── */
const links = $$('#navLinks a'), bubble = $('#navBubble');
function bubbleTo(a) {
  if (!a || !a.offsetWidth) { bubble.classList.remove('on'); return; }
  bubble.style.width = a.offsetWidth + 'px';
  bubble.style.transform = `translateX(${a.offsetLeft}px)`;
  bubble.classList.add('on');
}
const activeLink = () => links.find(a => a.dataset.nav === page) || null;
function setActive() { bubbleTo(activeLink()); }
links.forEach(a => {
  a.addEventListener('pointerenter', () => bubbleTo(a));
  a.addEventListener('pointerleave', () => bubbleTo(activeLink()));
});
addEventListener('resize', setActive);
document.fonts?.ready.then(setActive);

const menu = $('#navMenu'), sheet = $('#navSheet');
function closeMenus() { menu.setAttribute('aria-expanded', 'false'); sheet.hidden = true; }
menu.addEventListener('click', e => { e.stopPropagation(); const open = sheet.hidden; closeMenus(); menu.setAttribute('aria-expanded', String(open)); sheet.hidden = !open; });
document.addEventListener('click', e => { if (!e.target.closest('#navSheet, #navMenu')) closeMenus(); });

/* ── liquid glass: a specular highlight that follows the pointer ───────── */
document.addEventListener('pointermove', e => {
  const g = e.target.closest?.('.glass'); if (!g) return;
  const r = g.getBoundingClientRect();
  g.style.setProperty('--mx', (e.clientX - r.left) + 'px');
  g.style.setProperty('--my', (e.clientY - r.top) + 'px');
}, { passive: true });

/* ── cards lean towards the pointer, like panes of glass on a pivot ─────── */
if (!reduce && matchMedia('(hover: hover)').matches) {
  $$('.tool, .spk, .mcard, .num-cell, .counter, .partner, .chat, .sophos-stat, .sophos-perk').forEach(el => {
    el.classList.add('tilt');
    const max = el.matches('.num-cell, .mcard, .chat') ? 5 : 8;
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      el.classList.add('tilting');
      el.style.transform = `perspective(1000px) rotateX(${(-y * max).toFixed(2)}deg) rotateY(${(x * max).toFixed(2)}deg) translateY(-4px)`;
    });
    el.addEventListener('pointerleave', () => { el.classList.remove('tilting'); el.style.transform = ''; });
  });
}

/* ── reveal: park what sits below the fold of its page, glide it in ─────── */
let io = null;
if (!reduce && 'IntersectionObserver' in window) {
  io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.classList.remove('pre'); io.unobserve(e.target);
  }), { rootMargin: '0px 0px -8% 0px' });
}
function armReveal() {
  if (!io) return;
  $$('.page:not([hidden]) .rv:not(.seen)').forEach(el => {
    el.classList.add('seen');
    const r = el.getBoundingClientRect();
    if (!r.height || r.top < innerHeight) return;
    const sib = [...el.parentElement.children].filter(c => c.classList.contains('rv'));
    el.style.transitionDelay = Math.min(sib.indexOf(el), 5) * 0.07 + 's';
    el.classList.add('pre'); io.observe(el);
  });
}

/* ── countdown ──────────────────────────────────────────────────────────── */
const EVENT = new Date('2026-10-06T16:00:00+08:00').getTime();
const pad = n => String(n).padStart(2, '0');
const cd = { d: $('[data-cd="d"]'), h: $('[data-cd="h"]'), m: $('[data-cd="m"]'), s: $('[data-cd="s"]') };
function countdown() {
  const ms = Math.max(0, EVENT - Date.now());
  const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
  cd.d.textContent = pad(d); cd.h.textContent = pad(h); cd.m.textContent = pad(m); cd.s.textContent = pad(s);
  const d3 = $('#days3d'); if (d3 && d3.textContent !== String(d)) d3.textContent = d;
  $('#clock').textContent = ms ? `${d}d ${pad(h)}:${pad(m)}:${pad(s)} to doors · 16:00 SGT` : 'Doors are open';
}
countdown(); setInterval(countdown, 1000);

/* ── copy + toast ───────────────────────────────────────────────────────── */
const toastEl = $('#toast'); let tt;
function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => toastEl.classList.remove('on'), 2600); }
document.addEventListener('click', e => {
  const b = e.target.closest('[data-copy]'); if (!b || !b.dataset.copy) return;
  const text = b.dataset.copy;
  const fallback = () => {
    const code = b.closest('.cmd')?.querySelector('code');
    if (code) { const r = document.createRange(); r.selectNodeContents(code); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('Selected — press Ctrl/⌘ + C'); }
    else toast(text);
  };
  try { navigator.clipboard.writeText(text).then(() => toast('Copied'), fallback); } catch (err) { fallback(); }
});

/* ── badge: the guest fills it in, the glass ticket reprints as they type ── */
const form = $('#badgeForm'), fErr = $('#fErr'), dl = $('#dlBadge'), state = $('#badgeState');
const F = { name: $('#fName'), company: $('#fCompany'), role: $('#fRole'), email: $('#fEmail'), telegram: $('#fTg') };
const BADGE_KEY = 'apex.badge';
const formData = () => Object.fromEntries(Object.entries(F).map(([k, el]) => [k, el.value.trim()]));
const badgeData = d => ({ name: d.name, company: d.company, role: d.role, type: 'STANDARD', seed: (d.email || d.name || '').toLowerCase() });
let saved = store.get(BADGE_KEY);
function paint() {
  const d = badgeData(formData());
  world?.setTicket(d);
  drawBadge(d, $('#badgeFallback'));
}
function setState() {
  const isSaved = saved && JSON.stringify(saved) === JSON.stringify(formData());
  state.textContent = isSaved ? 'Saved — your badge is ready' : saved ? 'Unsaved changes' : 'Draft — fill in your details';
  state.classList.toggle('ok', !!isSaved);
  dl.disabled = !isSaved;
}
Object.entries(F).forEach(([k, el]) => { el.value = saved?.[k] || ''; });
let painter;
form.addEventListener('input', () => { clearTimeout(painter); painter = setTimeout(paint, 120); setState(); });
form.addEventListener('submit', e => {
  e.preventDefault();
  const d = formData(), problems = [];
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email);
  F.name.setAttribute('aria-invalid', String(!d.name));
  F.email.setAttribute('aria-invalid', String(!emailOk));
  if (!d.name) problems.push('your full name');
  if (!emailOk) problems.push('a valid email');
  if (problems.length) { fErr.textContent = 'Add ' + problems.join(' and ') + ' to save the badge.'; fErr.hidden = false; (d.name ? F.email : F.name).focus(); return; }
  if (d.telegram && !d.telegram.startsWith('@')) { d.telegram = '@' + d.telegram; F.telegram.value = d.telegram; }
  fErr.hidden = true;
  saved = d; store.set(BADGE_KEY, d);
  paint(); setState();
  toast('Badge saved');
});
dl.addEventListener('click', () => {
  const c = drawBadge(badgeData(saved || formData()));
  c.toBlob(b => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = 'dgp-badge-' + (saved?.name || 'guest').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, 'image/png');
});
setState();

/* ── Sophos subscription form ──────────────────────────────────────────── */
const sForm = $('#sophosForm'), sErr = $('#sErr'), sPending = $('#sophosPending');
const SF = { name: $('#sName'), email: $('#sEmail'), company: $('#sCompany') };
const SOPHOS_KEY = 'apex.sophos';
if (store.get(SOPHOS_KEY)) {
  sForm.querySelectorAll('input, button[type="submit"]').forEach(el => el.disabled = true);
  sPending.hidden = false;
}
sForm.addEventListener('submit', e => {
  e.preventDefault();
  const d = { name: SF.name.value.trim(), email: SF.email.value.trim(), company: SF.company.value.trim() };
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email);
  SF.name.setAttribute('aria-invalid', String(!d.name));
  SF.email.setAttribute('aria-invalid', String(!emailOk));
  const problems = [];
  if (!d.name) problems.push('your full name');
  if (!emailOk) problems.push('a valid email');
  if (problems.length) { sErr.textContent = 'Add ' + problems.join(' and ') + '.'; sErr.hidden = false; (d.name ? SF.email : SF.name).focus(); return; }
  sErr.hidden = true;
  store.set(SOPHOS_KEY, { ...d, status: 'pending', ts: Date.now() });
  sForm.querySelectorAll('input, button[type="submit"]').forEach(el => el.disabled = true);
  sPending.hidden = false;
  toast('Sophos subscription request submitted');
});

/* ── boot ───────────────────────────────────────────────────────────────── */
go(location.hash.slice(1) || 'top', { smooth: false });
new MutationObserver(armReveal).observe($('#site'), { subtree: true, attributes: true, attributeFilter: ['hidden'] });
armReveal();
document.fonts?.ready.then(paint);

/* ── 3D ─────────────────────────────────────────────────────────────────── */
(async () => {
  try {
    const { createWorld } = await import('./world.js');
    prog.style.width = '75%';
    world = createWorld({ back: $('#w3d'), top: $('#w3dtop'), onReady: dismiss });
    world.setBrackets($('#brackets'));
    paint();
  } catch (err) {
    console.warn('3D layer unavailable:', err);
    html.classList.add('no-webgl');
    $('#w3d').style.display = 'none'; $('#w3dtop').style.display = 'none';
    dismiss();
  }
})();
