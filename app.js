/* =====================================================================
   CONFIG — fill these two in (both are safe to keep in public code).
   Access is controlled by Google: only accounts the sheet is shared
   with can read it, and only Editors can save changes.
   ===================================================================== */
const CLIENT_ID = '677982929742-kmp13d15p1qa6tn4539vauaelq8rbh70.apps.googleusercontent.com';
const SHEET_ID  = '1TZILXsDwkAQQvo8An_L_xce-dRALl4wINy2odC_gTPA';

/* Sheet layout (matches anson_portfollio_2026) */
let DASH = 'Dash Temp', MEM = 'mem', CAGR = 'CAGR';   // real tab names are looked up when the sheet loads
const TX_FIRST = 5, TX_LAST = 30;          // transaction rows on each stock sheet
const CF_FIRST = 3, CF_LAST = 27;          // CAGR rows (C30 sums B3:B27)
const DASH_FIRST = 2, DASH_LAST = 31;      // Dash Temp name rows
let NON_STOCK = new Set([DASH, MEM, CAGR, 'Temp Sheet', 'Dash Board']);

/* ---------------- utilities ---------------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const q = name => `'${String(name).replace(/'/g, "''")}'`;               // quote sheet name for A1 ranges
const isNum = v => typeof v === 'number' && isFinite(v);
const n0 = v => isNum(v) ? v : 0;
const num = v => parseFloat(String(v ?? '').replace(/[,\s₹]/g, ''));   // "1,000" must not parse as 1
const inr = (v, d = 0) => isNum(v) ? '₹' + v.toLocaleString('en-IN', {minimumFractionDigits: d, maximumFractionDigits: d}) : '—';
const inr2 = v => inr(v, 2);
const signed = (v, f = inr) => isNum(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + f(Math.abs(v)) : '—';
const pct = v => isNum(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v * 100).toFixed(2) + '%' : '—';
const cls = v => isNum(v) ? (v > 0 ? 'up' : v < 0 ? 'down' : '') : '';
const qty = v => isNum(v) ? v.toLocaleString('en-IN', {maximumFractionDigits: 4}) : '—';
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function serialToParts(s){ const d = new Date(Date.UTC(1899, 11, 30) + Math.round(s * 86400000)); return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]; }
function parseAnyDate(v){                    // -> [y,m,d] or null
  if (isNum(v)) return serialToParts(v);
  const m = String(v ?? '').trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);   // dd/mm/yyyy (as typed in the sheet)
  if (m) { let y = +m[3]; if (y < 100) y += 2000; if (+m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) return [y, +m[2], +m[1]]; }
  return null;
}
const showDate = v => { const p = parseAnyDate(v); return p ? `${p[2]} ${MON[p[1]-1]} ${p[0]}` : esc(v); };
const isoDate = v => { const p = parseAnyDate(v); return p ? `${p[0]}-${String(p[1]).padStart(2,'0')}-${String(p[2]).padStart(2,'0')}` : ''; };
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const dateFormula = iso => { const [y, m, d] = iso.split('-').map(Number); return `=DATE(${y},${m},${d})`; };  // locale-proof

function toast(msg, err = false){ const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (err ? ' err' : ''); clearTimeout(toast._t); toast._t = setTimeout(() => t.className = 'toast', err ? 5000 : 2600); }
const busy = on => $('#busy').classList.toggle('show', on);

/* ---------------- auth (Google OAuth 2.0, full-page redirect) ----------------
   One sign-in path, the same on every browser and device: a full-page trip to
   Google that comes back with the token in the URL fragment. No popup (blocked
   or broken in Brave, Safari and in-app browsers) and no gsi/client dependency,
   so nothing can silently pick a different method.
   This page's own address must be listed under "Authorized redirect URIs" on
   the OAuth client in Google Cloud. */
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets email';
let token = null, tokenExp = 0, userEmail = '';
function loadToken(){ try { const s = JSON.parse(sessionStorage.getItem('tok') || 'null'); if (s && s.exp > Date.now() + 60000) { token = s.t; tokenExp = s.exp; } } catch {} }
function saveToken(){ try { sessionStorage.setItem('tok', JSON.stringify({t: token, exp: tokenExp})); } catch {} }

/* No token, or an expired one: raise instead of redirecting from here. Google
   tokens last an hour, and leaving mid-edit would throw away what was typed,
   so the caller shows the sign-in screen and the user chooses when to go. */
const authError = () => Object.assign(new Error('session_expired'), {auth: true});
async function ensureToken(){ if (!token || Date.now() > tokenExp) throw authError(); }

function signIn(prompt = 'select_account'){
  const st = Math.random().toString(36).slice(2) + Date.now().toString(36);
  try { sessionStorage.setItem('oauthState', st); } catch {}
  const p = new URLSearchParams({client_id: CLIENT_ID, redirect_uri: location.origin + location.pathname,
    response_type: 'token', scope: SCOPES, include_granted_scopes: 'true', state: st});
  if (prompt) p.set('prompt', prompt);                        // account chooser on a deliberate sign-in
  else if (userEmail) p.set('login_hint', userEmail);         // re-auth: straight back to the same account
  location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + p;
}
function readRedirectToken(){            // returns null, {ok:true} or {error}
  if (!/(^|[#&])(access_token|error)=/.test(location.hash)) return null;
  const p = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', location.pathname + location.search + '#/');
  let st = null; try { st = sessionStorage.getItem('oauthState'); sessionStorage.removeItem('oauthState'); } catch {}
  if (p.get('error')) return {error: p.get('error')};
  if (!st || p.get('state') !== st) return {error: 'state_mismatch'};
  token = p.get('access_token'); tokenExp = Date.now() + ((+p.get('expires_in') || 3600) - 60) * 1000; saveToken();
  return {ok: true};
}
function signOut(){
  // no-cors: the reply is not readable, and does not need to be
  if (token) { try { fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(token), {method: 'POST', mode: 'no-cors', keepalive: true}); } catch {} }
  token = null; tokenExp = 0; userEmail = '';            // hint must go, or the next sign-in is pinned to this account
  try { sessionStorage.removeItem('tok'); } catch {}
  Object.assign(state, {sheets: [], stocks: [], totals: {}, cash: [], cashSum: {},
                        memC4: 0, dashNames: [], readOnly: false, stock: null});
  // replaceState, not location.hash: assigning the hash queues a hashchange that
  // would route() straight back into the cached portfolio over the sign-in screen.
  history.replaceState(null, '', location.pathname + location.search + '#/');
  renderSignIn();
}

/* ---------------- Sheets API ---------------- */
const BASE = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`;
async function api(path, {method = 'GET', body} = {}, retried = false){
  await ensureToken();
  const res = await fetch(path.startsWith('http') ? path : BASE + path, {
    method, headers: {Authorization: `Bearer ${token}`, ...(body ? {'Content-Type': 'application/json'} : {})},
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 401 && !retried) { token = null; return api(path, {method, body}, true); }
  if (!res.ok) {
    let msg = res.statusText; try { msg = (await res.json()).error.message; } catch {}
    const e = new Error(msg); e.status = res.status; e.write = method !== 'GET'; throw e;
  }
  return res.json();
}
function friendly(e){
  if (e.auth) return 'Your session has expired. Sign in again to continue.';
  if (e.status === 403 && e.write) { state.readOnly = true; return 'You have view-only access. Ask the owner to share the sheet with you as Editor.'; }
  if (/has not been used|is disabled|SERVICE_DISABLED/i.test(e.message)) return 'The Google Sheets API is not enabled in your Google Cloud project. Enable it under APIs & Services → Library, wait 2 minutes, then try again.';
  if (/insufficient.*scope|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(e.message)) return 'Sheets permission was not granted at sign-in. Sign out, sign in again and tick the "See, edit, create and delete your Google Sheets" box.';
  if (/not supported for this document/i.test(e.message)) return 'SHEET_ID points to an Excel (.xlsx) file. Open it in Drive, use File → Save as Google Sheets, and use the new sheet\'s ID.';
  if (e.status === 404) return 'Sheet not found. Check SHEET_ID in app.js. (Google says: ' + e.message + ')';
  if (e.status === 403) return 'This Google account does not have access to the portfolio sheet. (Google says: ' + e.message + ')';
  return e.message || 'Something went wrong';
}
async function batchGet(ranges){
  const qs = ranges.map(r => 'ranges=' + encodeURIComponent(r)).join('&');
  const r = await api(`/values:batchGet?${qs}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`);
  return r.valueRanges.map(v => v.values || []);
}
const writeValues = data => api('/values:batchUpdate', {method: 'POST', body: {valueInputOption: 'USER_ENTERED', data}});
const batchUpdate = requests => api(':batchUpdate', {method: 'POST', body: {requests}});

/* ---------------- state + loading ---------------- */
const state = {sheets: [], stocks: [], totals: {}, cash: [], cashSum: {}, memC4: 0, dashNames: [], readOnly: false, stock: null};
const sheetId = title => (state.sheets.find(s => s.title === title) || {}).sheetId;

async function loadAll(){
  state.readOnly = false;            // re-tested by the next write; otherwise one 403 sticks for the session
  const meta = await api('?fields=sheets.properties(sheetId,title,index)');
  state.sheets = meta.sheets.map(s => s.properties);
  // match tab names loosely (ignores case and spaces, e.g. "CAGR " or "Cagr")
  const norm = s => String(s).toLowerCase().replace(/\s+/g, '');
  const find = want => (state.sheets.find(s => norm(s.title) === norm(want)) || {}).title || null;
  DASH = find('Dash Temp'); MEM = find('mem'); CAGR = find('CAGR');
  NON_STOCK = new Set([DASH, MEM, CAGR, find('Temp Sheet'), find('Dash Board')].filter(Boolean));
  if (!DASH) throw new Error(`No "Dash Temp" tab in this spreadsheet. Tabs found: ${state.sheets.map(s => s.title).join(', ')}. Check SHEET_ID.`);
  const ranges = [`${q(DASH)}!A${DASH_FIRST}:J${DASH_LAST}`, `${q(DASH)}!F32:J32`, `${q(DASH)}!M1:N5`];
  if (CAGR) ranges.push(`${q(CAGR)}!A${CF_FIRST}:C${CF_LAST}`, `${q(CAGR)}!A28:D32`);
  if (MEM) ranges.push(`${q(MEM)}!C4`);
  const vals = await batchGet(ranges);
  let k = 3;
  const [dash, dashTot, net] = vals;
  const cf = CAGR ? vals[k++] : [], cfSum = CAGR ? vals[k++] : [], mem = MEM ? vals[k++] : [];
  state.dashNames = [];
  state.stocks = [];
  for (let i = 0; i <= DASH_LAST - DASH_FIRST; i++) {
    const r = dash[i] || [];
    state.dashNames.push(r[0] == null ? '' : String(r[0]));
    const name = r[0] == null ? '' : String(r[0]).trim();
    if (!name || /^\d+$/.test(name) || !sheetId(name)) continue;           // skip empty slots
    state.stocks.push({row: DASH_FIRST + i, name, code: r[1], qty: r[2], avg: r[3], live: r[4], invested: r[5], value: r[6], perShare: r[7], pl: r[8], gain: r[9]});
  }
  const t = dashTot[0] || [], nv = net || [];
  state.totals = {invested: t[0], value: t[1], pl: t[3], gain: t[4],
                  net: (nv[0] || [])[0], capital: (nv[2] || [])[0], profit: (nv[4] || [])[0], profitPct: (nv[4] || [])[1]};
  state.cash = [];
  for (let i = 0; i <= CF_LAST - CF_FIRST; i++) {
    const r = cf[i] || [];
    if (r[0] == null && r[1] == null && r[2] == null) continue;
    if (r.every(v => v === '' || v == null)) continue;
    state.cash.push({row: CF_FIRST + i, date: r[0], amount: r[1], type: String(r[2] ?? '').trim()});
  }
  state.cashSum = {net: (cfSum[0] || [])[2], capital: (cfSum[2] || [])[2], profit: (cfSum[4] || [])[2], pct: (cfSum[4] || [])[3]};
  state.memC4 = parseInt((mem[0] || [])[0], 10) || (DASH_FIRST - 1 + state.dashNames.reduce((last, v, i) => v.trim() ? i + 1 : last, 0));
}

async function loadStock(name){
  const [head, tx, fin] = await batchGet([`${q(name)}!A1:M1`, `${q(name)}!B${TX_FIRST}:M${TX_LAST}`, `${q(name)}!L32`]);
  const h = head[0] || [];
  const rows = [];
  let lastUsed = TX_FIRST - 1;
  for (let i = 0; i <= TX_LAST - TX_FIRST; i++) {
    const r = tx[i] || [];
    const [date, bq, br, sq, sr] = r;
    const has = [date, bq, br, sq, sr].some(v => v !== '' && v != null && v !== 0);
    if (!has) continue;
    lastUsed = TX_FIRST + i;
    rows.push({row: TX_FIRST + i, date, bq: n0(bq), br: n0(br), sq: n0(sq), sr: n0(sr), held: r[5], avgAfter: r[9], profit: r[10]});
  }
  state.stock = {name, code: h[3], live: h[5], avg: h[7], qty: h[9], margin: h[11], realised: (fin[0] || [])[0], rows, nextRow: lastUsed + 1};
}

/* ---------------- routing / rendering ---------------- */
const app = $('#app');
function setChrome({title, back = false, tabs = true, fab = null, edit = false}){
  $('#title').textContent = title;
  $('#backBtn').hidden = !back;
  $('#tabs').hidden = !tabs;
  $('#refreshBtn').hidden = false;
  $('#editStockBtn').hidden = !edit || state.readOnly;
  const f = $('#fab'); f.hidden = !fab || state.readOnly; f.onclick = fab;
  document.querySelectorAll('nav.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === (location.hash.startsWith('#/cash') ? 'cash' : 'portfolio')));
}
function loading(){ app.innerHTML = '<div class="center"><div class="spinner"></div></div>'; }
const roNote = () => state.readOnly ? '<div class="ro">View-only: this account can see the sheet but not edit it.</div>' : '';
const footer = () => `<div class="who">${userEmail ? 'Signed in as ' + esc(userEmail) + ' · ' : ''}<a id="so">Sign out</a> · <a href="https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit" target="_blank" rel="noopener">Open sheet</a></div>`;
function bindFooter(){ const s = $('#so'); if (s) s.onclick = signOut; }

async function route(force = false){
  const h = location.hash || '#/';
  try {
    if (force || !state.sheets.length) { loading(); await loadAll(); }
    if (h.startsWith('#/stock/')) {
      const name = decodeURIComponent(h.slice(8));
      // gone (renamed, or a stale entry): replace it, so Back doesn't bounce here forever
      if (!sheetId(name)) { history.replaceState(null, '', location.pathname + location.search + '#/'); renderPortfolio(); return; }
      if (force || !state.stock || state.stock.name !== name) { loading(); await loadStock(name); }
      renderStock();
    } else if (h.startsWith('#/cash')) renderCash();
    else renderPortfolio();
  } catch (e) {
    if (e.auth) return renderSignIn('Your session has expired. Sign in again to continue.', '');
    app.innerHTML = `<div class="center"><h2>Couldn't load</h2><p>${esc(friendly(e))}</p><button class="btn" id="retry">Try again</button>${footer()}</div>`;
    $('#retry').onclick = () => route(true); bindFooter();
  }
}
window.addEventListener('hashchange', () => route());
$('#backBtn').onclick = () => history.length > 1 ? history.back() : (location.hash = '#/');
$('#refreshBtn').onclick = () => route(true);

function renderPortfolio(){
  const T = state.totals;
  const stocks = [...state.stocks].sort((a, b) => (n0(b.qty) > 0) - (n0(a.qty) > 0) || n0(b.value) - n0(a.value));
  setChrome({title: 'Portfolio', fab: () => openStockForm(null)});
  // colour follows the stock (by its dashboard row), never its rank; 9th+ stock is grey
  const byRow = [...state.stocks].sort((a, b) => a.row - b.row);
  const colorOf = s => { const i = byRow.indexOf(s); return i < 8 ? `var(--s${i + 1})` : 'var(--s-other)'; };
  const darkText = s => byRow.indexOf(s) === 3;   // yellow needs dark text
  const held = byRow.filter(s => n0(s.qty) > 0 && n0(s.value) > 0);
  const totalV = held.reduce((t, s) => t + s.value, 0);
  const initials = n => n.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || n.slice(0, 2).toUpperCase();
  const allocHtml = totalV > 0 ? `
    <div class="sec-h"><h2>Allocation</h2></div>
    <div class="card alloc">
      <div class="alloc-bar" role="img" aria-label="Allocation by current value">
        ${held.map(s => `<span style="--c:${colorOf(s)};flex:${s.value}" data-tip="${esc(s.name)}: ${inr(s.value)} · ${(s.value / totalV * 100).toFixed(1)}%"></span>`).join('')}
      </div>
      <div class="alloc-tip" id="allocTip">Tap a colour for details</div>
      <div class="alloc-leg">
        ${[...held].sort((a, b) => b.value - a.value).map(s => `<div><i style="--c:${colorOf(s)}"></i><b>${esc(s.name)}</b><em class="num">${(s.value / totalV * 100).toFixed(1)}%</em></div>`).join('')}
      </div>
    </div>` : '';
  app.innerHTML = `
    ${roNote()}
    <section class="hero ${n0(T.pl) < 0 ? 'loss' : ''}">
      <div class="lbl">Current value</div>
      <div class="big num">${inr(T.value)}</div>
      <div class="grid">
        <div><div class="k">Invested</div><div class="v num">${inr(T.invested)}</div></div>
        <div><div class="k">Unrealised P/L</div><div class="v num">${signed(T.pl)}</div></div>
        <div><div class="k">Return</div><div class="v num">${pct(T.gain)}</div></div>
      </div>
    </section>
    ${allocHtml}
    <div class="sec-h"><h2>Holdings · ${stocks.filter(s => n0(s.qty) > 0).length}</h2></div>
    <div class="card list">
      ${stocks.length ? stocks.map(s => `
        <a class="row ${n0(s.qty) > 0 ? '' : 'closed'}" href="#/stock/${encodeURIComponent(s.name)}">
          <span class="badge ${darkText(s) ? 'dk' : ''}" style="--c:${colorOf(s)}">${esc(initials(s.name))}</span>
          <div class="main"><div class="t">${esc(s.name)}</div>
            <div class="s num">${n0(s.qty) > 0 ? `${qty(s.qty)} × ${inr2(s.avg)} · LTP ${inr2(s.live)}` : 'No holding'}</div></div>
          <div class="end"><div class="t num">${inr(s.value)}</div>
            <div class="s num"><span class="pill ${cls(s.pl)}">${signed(s.pl)} · ${pct(s.gain)}</span></div></div>
        </a>`).join('') : '<div class="empty">No stocks yet. Tap + to add one.</div>'}
    </div>
    <div class="sec-h"><h2>Overall</h2></div>
    <div class="stats" style="margin-top:0">
      <div class="card stat" style="border-left:4px solid var(--s1)"><div class="k">Capital invested</div><div class="v num">${inr(T.capital)}</div></div>
      <div class="card stat ${n0(T.profit) < 0 ? 'down-bg' : 'up-bg'}"><div class="k">Net profit</div><div class="v num ${cls(T.profit)}">${signed(T.profit)}</div><div class="k num ${cls(T.profitPct)}">${pct(T.profitPct)}</div></div>
    </div>
    ${footer()}`;
  app.querySelectorAll('.alloc-bar span').forEach(sp => {
    const show = () => { app.querySelectorAll('.alloc-bar span').forEach(x => x.classList.toggle('hl', x === sp)); $('#allocTip').textContent = sp.dataset.tip; };
    sp.onmouseenter = show; sp.onclick = show;
  });
  bindFooter();
}

function renderStock(){
  const S = state.stock;
  const full = S.nextRow > TX_LAST;
  setChrome({title: S.name, back: true, tabs: false, edit: true, fab: full ? null : () => openTxForm(null)});
  const unreal = isNum(S.qty) && isNum(S.live) && isNum(S.avg) ? (S.live - S.avg) * S.qty : null;
  app.innerHTML = `
    ${roNote()}
    <div class="stats">
      <div class="card stat"><div class="k">Holding</div><div class="v num">${qty(S.qty)}</div><div class="k">${esc(S.code || '')}</div></div>
      <div class="card stat"><div class="k">Live price</div><div class="v num">${inr2(S.live)}</div><div class="k num ${cls(S.margin)}">${signed(S.margin, inr2)} vs avg</div></div>
      <div class="card stat"><div class="k">Average price</div><div class="v num">${inr2(S.avg)}</div></div>
      <div class="card stat"><div class="k">Unrealised P/L</div><div class="v num ${cls(unreal)}">${signed(unreal)}</div></div>
      <div class="card stat" style="grid-column:1/-1"><div class="k">Realised profit (all sells)</div><div class="v num ${cls(S.realised)}">${signed(S.realised, inr2)}</div></div>
    </div>
    <div class="sec-h"><h2>Transactions · ${S.rows.length}</h2>${full ? '<span class="chip warn">Sheet full (rows 5–30)</span>' : ''}</div>
    <div class="card list">
      ${S.rows.length ? [...S.rows].reverse().map(r => {
        const isBuy = r.bq > 0, isSell = r.sq > 0;
        const lines = [];
        if (isBuy) lines.push(`<span class="chip buy">BUY</span> <span class="num">${qty(r.bq)} × ${inr2(r.br)}</span>`);
        if (isSell) lines.push(`<span class="chip sell">SELL</span> <span class="num">${qty(r.sq)} × ${inr2(r.sr)}</span>`);
        return `<button class="row" data-row="${r.row}">
          <div class="main"><div class="t">${lines.join(' ') || '<span class="chip">Empty</span>'}</div>
            <div class="s">${showDate(r.date)} · holding after: <span class="num">${qty(r.held)}</span></div></div>
          <div class="end"><div class="t num">${inr(r.bq * r.br + r.sq * r.sr)}</div>
            ${isSell ? `<div class="s num ${cls(r.profit)}">${signed(r.profit)}</div>` : ''}</div>
        </button>`;}).join('') : '<div class="empty">No transactions yet. Tap + to add a buy or sell.</div>'}
    </div>
    ${footer()}`;
  app.querySelectorAll('[data-row]').forEach(b => b.onclick = () => openTxForm(S.rows.find(r => r.row === +b.dataset.row)));
  $('#editStockBtn').onclick = () => openStockForm(S);
  bindFooter();
}

function renderCash(){
  const C = state.cashSum;
  if (!CAGR) {
    setChrome({title: 'Cash flow'});
    app.innerHTML = `<div class="center"><h2>No CAGR tab</h2><p>Cash flow needs a tab named “CAGR”. Tabs in this spreadsheet: ${esc(state.sheets.map(s => s.title).join(', '))}</p>${footer()}</div>`;
    bindFooter(); return;
  }
  const full = (state.cash.at(-1)?.row ?? CF_FIRST - 1) >= CF_LAST;
  setChrome({title: 'Cash flow', fab: full ? null : () => openCashForm(null)});
  app.innerHTML = `
    ${roNote()}
    <section class="hero">
      <div class="lbl">Net value today</div>
      <div class="big num">${inr(C.net)}</div>
      <div class="grid">
        <div><div class="k">Capital invested</div><div class="v num">${inr(C.capital)}</div></div>
        <div><div class="k">Profit</div><div class="v num">${signed(C.profit)}</div></div>
        <div><div class="k">Return</div><div class="v num">${pct(C.pct)}</div></div>
      </div>
    </section>
    <div class="sec-h"><h2>Deposits &amp; withdrawals</h2>${full ? '<span class="chip warn">Full (rows 3–27)</span>' : ''}</div>
    <div class="card list">
      ${state.cash.length ? [...state.cash].reverse().map(c => {
        const bad = !isNum(c.amount);
        const dep = isNum(c.amount) ? c.amount < 0 : /^DEP/i.test(c.type);
        return `<button class="row" data-row="${c.row}">
          <div class="main"><div class="t"><span class="chip ${dep ? 'buy' : 'sell'}">${dep ? 'DEPOSIT' : 'WITHDRAW'}</span>
            ${bad ? '<span class="chip warn">Not a number – tap to fix</span>' : ''}</div>
            <div class="s">${showDate(c.date)}</div></div>
          <div class="end"><div class="t num">${bad ? esc(c.amount) : inr(Math.abs(c.amount))}</div></div>
        </button>`;}).join('') : '<div class="empty">No entries yet.</div>'}
    </div>
    ${footer()}`;
  app.querySelectorAll('[data-row]').forEach(b => b.onclick = () => openCashForm(state.cash.find(c => c.row === +b.dataset.row)));
  bindFooter();
}

/* ---------------- bottom sheet helpers ---------------- */
const sheet = $('#sheet');
function openSheet(html, onMount){
  $('#sheetBody').innerHTML = html;
  if (!sheet.open) sheet.showModal();
  onMount && onMount($('#sheetBody'));
}
const closeSheet = () => sheet.open && sheet.close();
sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });
function segment(root, name, onChange){
  const seg = root.querySelector(`[data-seg="${name}"]`);
  seg.querySelectorAll('button').forEach(b => b.onclick = () => {
    seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); seg.dataset.value = b.dataset.v; onChange && onChange(b.dataset.v);
  });
}
async function save(fn, okMsg){
  busy(true);
  try { await fn(); closeSheet(); toast(okMsg); }
  catch (e) {
    if (e.auth) { closeSheet(); renderSignIn('Your session has expired. Sign in again — that change was not saved.', ''); }
    else { toast(friendly(e), true); if (state.readOnly) route(); }
  }
  finally { busy(false); }
}

/* ---------------- transactions (stock sheet rows 5–30, cols B–F) ---------------- */
function openTxForm(tx){
  if (state.readOnly) return toast('View-only access', true);
  const S = state.stock;
  const type = tx ? (tx.sq > 0 && !tx.bq ? 'sell' : 'buy') : 'buy';
  const both = tx && tx.bq > 0 && tx.sq > 0;
  openSheet(`
    <h3>${tx ? 'Edit' : 'Add'} transaction</h3>
    ${both ? '<p class="preview">This row has both a buy and a sell. Saving here keeps only the type you choose.</p>' : ''}
    <div class="seg" data-seg="type" data-value="${type}">
      <button type="button" data-v="buy" class="${type === 'buy' ? 'on' : ''}">Buy</button>
      <button type="button" data-v="sell" class="${type === 'sell' ? 'on' : ''}">Sell</button>
    </div>
    <form id="f">
      <div class="field"><label>Date</label><input type="date" name="date" required value="${tx ? (isoDate(tx.date) || '') : todayIso()}">
        ${tx && !isoDate(tx.date) && tx.date ? `<div class="hint">Sheet has “${esc(tx.date)}”; pick the correct date.</div>` : ''}</div>
      <div class="two">
        <div class="field"><label>Quantity</label><input name="qty" inputmode="decimal" required placeholder="0"
          value="${tx ? (type === 'buy' ? tx.bq : tx.sq) || '' : ''}"></div>
        <div class="field"><label>Price / share (₹)</label><input name="price" inputmode="decimal" required placeholder="0.00"
          value="${tx ? (type === 'buy' ? tx.br : tx.sr) || '' : ''}"></div>
      </div>
      <div class="preview" id="pv"></div>
      <div class="actions">
        ${tx ? '<button type="button" class="btn danger" id="del">Delete</button>' : ''}
        <button class="btn" type="submit">${tx ? 'Save' : 'Add'}</button>
      </div>
    </form>`, root => {
      const f = root.querySelector('#f');
      const seg = root.querySelector('[data-seg="type"]');
      const pv = () => {
        const qv = num(f.qty.value), pr = num(f.price.value);
        root.querySelector('#pv').textContent = qv > 0 && pr > 0 ? `Total ${inr2(qv * pr)} · current holding ${qty(S.qty)}` : `Current holding ${qty(S.qty)}`;
      };
      segment(root, 'type', pv); f.oninput = pv; pv();
      f.onsubmit = e => {
        e.preventDefault();
        const t = seg.dataset.value, qv = num(f.qty.value), pr = num(f.price.value);
        if (!(qv > 0) || !(pr > 0)) return toast('Enter a quantity and price above 0', true);
        if (!f.date.value) return toast('Pick a date', true);
        const held = n0(S.qty) - (tx ? tx.bq - tx.sq : 0);   // holding excluding this row
        if (t === 'sell' && qv > held + 1e-9) return toast(`You can sell at most ${qty(held)}`, true);
        const row = tx ? tx.row : S.nextRow;
        const vals = [dateFormula(f.date.value), t === 'buy' ? qv : '', t === 'buy' ? pr : '', t === 'sell' ? qv : '', t === 'sell' ? pr : ''];
        save(async () => {
          await writeValues([{range: `${q(S.name)}!B${row}:F${row}`, values: [vals]}]);
          await Promise.all([loadStock(S.name), loadAll()]); renderStock();
        }, tx ? 'Transaction updated' : (t === 'buy' ? 'Buy added' : 'Sell added'));
      };
      const d = root.querySelector('#del');
      if (d) d.onclick = () => confirmDelete('Delete this transaction?', () => save(async () => {
        await shiftUp(S.name, tx.row, TX_LAST, 1, 6);
        await Promise.all([loadStock(S.name), loadAll()]); renderStock();
      }, 'Transaction deleted'));
  });
}

/* Remove one row inside a block by copying the rows below it up one, then clearing the last row.
   Copy-paste (not cut) keeps the sheet's own formulas pointing at the right cells. */
async function shiftUp(title, row, lastRow, colStart, colEnd){
  const id = sheetId(title), reqs = [];
  if (row < lastRow) reqs.push({copyPaste: {
    source: {sheetId: id, startRowIndex: row, endRowIndex: lastRow, startColumnIndex: colStart, endColumnIndex: colEnd},
    destination: {sheetId: id, startRowIndex: row - 1, endRowIndex: lastRow - 1, startColumnIndex: colStart, endColumnIndex: colEnd},
    pasteType: 'PASTE_NORMAL'}});
  reqs.push({repeatCell: {range: {sheetId: id, startRowIndex: lastRow - 1, endRowIndex: lastRow, startColumnIndex: colStart, endColumnIndex: colEnd},
    cell: {}, fields: 'userEnteredValue'}});
  await batchUpdate(reqs);
}
function confirmDelete(msg, go){
  openSheet(`<h3>${esc(msg)}</h3><p class="preview">This also removes it from the Google Sheet.</p>
    <div class="actions"><button class="btn ghost" id="no">Cancel</button><button class="btn danger" id="yes">Delete</button></div>`, r => {
    r.querySelector('#no').onclick = closeSheet; r.querySelector('#yes').onclick = go;
  });
}

/* ---------------- add / rename stock (mirrors the Apps Script onEdit + writeToDash) ---------------- */
function openStockForm(S){
  if (state.readOnly) return toast('View-only access', true);
  openSheet(`
    <h3>${S ? 'Edit stock' : 'Add stock'}</h3>
    <form id="f">
      <div class="field"><label>Name (becomes the sheet tab name)</label><input name="name" required autocapitalize="characters" value="${esc(S ? S.name : '')}" placeholder="e.g. INFY"></div>
      <div class="field"><label>Google Finance code</label><input name="code" required autocapitalize="characters" value="${esc(S ? (S.code || '') : '')}" placeholder="e.g. NSE:INFY">
        <div class="hint">Used for the live price, e.g. NSE:INFY or BOM:500209.</div></div>
      <div class="actions"><button type="button" class="btn ghost" id="cancel">Cancel</button><button class="btn" type="submit">Save</button></div>
    </form>`, root => {
      root.querySelector('#cancel').onclick = closeSheet;
      const f = root.querySelector('#f');
      f.onsubmit = e => {
        e.preventDefault();
        const name = f.name.value.trim(), code = f.code.value.trim().toUpperCase();
        if (!name || !code) return;
        if (/^\d+$/.test(name)) return toast('Use letters in the name (number-only names are kept for empty slots)', true);
        if (/^[=+@']/.test(name) || /^[=+@']/.test(code)) return toast('Name and code cannot start with =, +, @ or an apostrophe', true);
        if ([...NON_STOCK].some(t => t.toLowerCase() === name.toLowerCase())) return toast('That name is reserved', true);
        const clash = state.sheets.find(s => s.title.toLowerCase() === name.toLowerCase() && s.title !== (S && S.name));
        if (clash) return toast(`A sheet called “${clash.title}” already exists`, true);
        save(async () => {
          const finalName = await saveStock(S ? S.name : null, name, code);
          await loadAll(); await loadStock(finalName);
          const h = '#/stock/' + encodeURIComponent(finalName);
          if (location.hash === h) renderStock();
          else if (S) { history.replaceState(null, '', location.pathname + location.search + h); renderStock(); }  // rename: old entry is dead
          else location.hash = h;                                                                                  // new stock: normal push from the list
        }, S ? 'Stock updated' : 'Stock added');
      };
  });
}

async function saveStock(oldName, name, code){
  await loadAll();                                   // fresh sheet list + dashboard
  let target = oldName;
  if (!target) {
    // use an empty slot sheet (tabs named 7, 8, 9 ...) if there is one
    const slot = state.sheets.filter(s => /^\d+$/.test(s.title)).sort((a, b) => a.index - b.index)[0];
    if (slot) target = slot.title;
    else {
      // no empty slot: copy an existing stock sheet and clear its transactions
      const src = state.stocks[0];
      if (!src) throw new Error('No template sheet to copy. Add an empty slot sheet in Google Sheets.');
      const lastIdx = Math.max(...state.sheets.filter(s => !NON_STOCK.has(s.title)).map(s => s.index));
      await batchUpdate([{duplicateSheet: {sourceSheetId: sheetId(src.name), insertSheetIndex: lastIdx + 1, newSheetName: name}}]);
      await api('/values:batchClear', {method: 'POST', body: {ranges: [`${q(name)}!B${TX_FIRST}:F${TX_LAST}`]}});
      await loadAll();
    }
  }
  if (target && target !== name) {
    await batchUpdate([{updateSheetProperties: {properties: {sheetId: sheetId(target), title: name}, fields: 'title'}}]);
  }
  // find the dashboard row for this stock (by old name), else the next free row from mem!C4
  const lookFor = target || name;
  let idx = state.dashNames.findIndex(v => v.trim() === lookFor);
  let row = idx >= 0 ? DASH_FIRST + idx : state.memC4 + 1;
  if (row > DASH_LAST) throw new Error(`Dashboard is full (rows ${DASH_FIRST}–${DASH_LAST}).`);
  const A = `A${row}`;
  const data = [
    {range: `${q(name)}!B1`, values: [[name]]},
    {range: `${q(name)}!D1`, values: [[code]]},
    {range: `${q(DASH)}!A${row}:D${row}`, values: [[name,
      `=INDIRECT("'" & ${A} & "'!D1")`, `=INDIRECT("'" & ${A} & "'!J1")`, `=INDIRECT("'" & ${A} & "'!H1")`]]}
  ];
  if (MEM && row > state.memC4) data.push({range: `${q(MEM)}!C4`, values: [["'" + row]]});   // keep mem in sync for the Apps Script
  await writeValues(data);
  return name;
}

/* ---------------- cash flow (CAGR rows 3–27) ---------------- */
function openCashForm(c){
  if (state.readOnly) return toast('View-only access', true);
  const type = c ? ((isNum(c.amount) ? c.amount < 0 : /^DEP/i.test(c.type)) ? 'DEP' : 'WIT') : 'DEP';
  const amt = c ? (isNum(c.amount) ? Math.abs(c.amount) : (parseFloat(String(c.amount).replace(/[^\d.]/g, '')) || '')) : '';
  openSheet(`
    <h3>${c ? 'Edit entry' : 'Add deposit / withdrawal'}</h3>
    <div class="seg" data-seg="type" data-value="${type}">
      <button type="button" data-v="DEP" class="${type === 'DEP' ? 'on' : ''}">Deposit</button>
      <button type="button" data-v="WIT" class="${type === 'WIT' ? 'on' : ''}">Withdraw</button>
    </div>
    <form id="f">
      <div class="field"><label>Date</label><input type="date" name="date" required value="${c ? isoDate(c.date) : todayIso()}"></div>
      <div class="field"><label>Amount (₹)</label><input name="amt" inputmode="decimal" required placeholder="0" value="${amt}">
        ${c && !isNum(c.amount) ? `<div class="hint">Sheet has “${esc(c.amount)}”, which isn't counted in totals.</div>` : ''}</div>
      <div class="actions">
        ${c ? '<button type="button" class="btn danger" id="del">Delete</button>' : ''}
        <button class="btn" type="submit">${c ? 'Save' : 'Add'}</button>
      </div>
    </form>`, root => {
      segment(root, 'type');
      const f = root.querySelector('#f'), seg = root.querySelector('[data-seg="type"]');
      f.onsubmit = e => {
        e.preventDefault();
        const a = num(f.amt.value), t = seg.dataset.value;
        if (!(a > 0)) return toast('Enter an amount above 0', true);
        const row = c ? c.row : (state.cash.at(-1)?.row ?? CF_FIRST - 1) + 1;
        save(async () => {
          await writeValues([{range: `${q(CAGR)}!A${row}:C${row}`, values: [[dateFormula(f.date.value), t === 'DEP' ? -a : a, t]]}]);
          await loadAll(); renderCash();
        }, c ? 'Entry updated' : 'Entry added');
      };
      const d = root.querySelector('#del');
      if (d) d.onclick = () => confirmDelete('Delete this entry?', () => save(async () => {
        await shiftUp(CAGR, c.row, CF_LAST, 0, 3); await loadAll(); renderCash();
      }, 'Entry deleted'));
  });
}

/* ---------------- sign-in screen + boot ---------------- */
function renderSignIn(msg = '', prompt = 'select_account'){
  ['#tabs', '#fab', '#backBtn', '#refreshBtn', '#editStockBtn'].forEach(s => $(s).hidden = true);
  $('#title').textContent = 'Portfolio';
  app.innerHTML = `<div class="center">
    <div class="logo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg></div>
    <h2>Stock portfolio</h2>
    <p>Sign in with the Google account the portfolio sheet is shared with. Editors can add and change entries; viewers can only look.</p>
    ${msg ? `<div class="ro" style="max-width:360px;text-align:left">${esc(msg)}</div>` : ''}
    <button class="btn gbtn" id="signin"><svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Sign in with Google</button>
  </div>`;
  $('#signin').onclick = () => signIn(prompt);
}
const REDIRECT_ERRORS = {
  access_denied: 'Sign-in was cancelled, or the Google Sheets permission was not allowed. Try again and tick the Google Sheets box.',
  redirect_uri_mismatch: 'This page’s address is not allowed by the OAuth client. Add ' + location.origin + location.pathname + ' under “Authorized redirect URIs” in Google Cloud, wait a minute, then try again.',
  state_mismatch: 'Sign-in could not be verified. Please try again.'
};
async function afterSignIn(){
  api('https://www.googleapis.com/oauth2/v3/userinfo').then(u => { userEmail = u.email || ''; const w = document.querySelector('.who'); if (w && userEmail && !w.textContent.includes('@')) route(); }).catch(() => {});
  await route(true);
}
function boot(){
  if (CLIENT_ID.startsWith('YOUR_') || SHEET_ID.startsWith('YOUR_')) {
    app.innerHTML = `<div class="center"><h2>Almost there</h2><p>Open <b>app.js</b> and set <code>CLIENT_ID</code> and <code>SHEET_ID</code> at the top. See README.md.</p></div>`;
    return;
  }
  try { localStorage.removeItem('authMode'); } catch {}   // left over from the old popup/redirect switch
  const red = readRedirectToken();
  if (red && red.error) { renderSignIn(REDIRECT_ERRORS[red.error] || 'Sign-in failed: ' + red.error); return; }
  if (!red) loadToken();
  if (token) afterSignIn(); else renderSignIn();
}
boot();
