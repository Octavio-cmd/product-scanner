// #21A — /sb/update-inventory sends the existing session (Authorization: Bearer).
// Runs the REAL functions from app.js (extracted by name) in a vm sandbox with
// fetch/DOM/sessionStorage stubs. Run: node test-inventory-session-auth.js
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { execSync } = require('child_process');

const SRC = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS ' + name); } else { fail++; console.log('  FAIL ' + name); } }

function extract(name, src = SRC) {
  const m = new RegExp('^(async )?function ' + name + '\\s*\\(', 'm').exec(src);
  if (!m) throw new Error('function not found: ' + name);
  const end = src.indexOf('\n}\n', m.index);
  return src.slice(m.index, end + 2);
}

const TOKEN = 'tok-abc.def-123';
const URL = 'https://savvy-ebay-prices-production.up.railway.app/sb/update-inventory';

function makeSandbox({ token = TOKEN, status = 200, body = { status: 'success', previous_available: 4, available: 10, mode: 'add' } } = {}) {
  const els = {};
  const el = id => (els[id] = els[id] || { id, innerHTML: '', textContent: '', value: '', disabled: false, style: {} });
  const store = token ? { savvy_session_token: token, savvy_session_user: 'tester' } : {};
  const calls = [], toasts = [], logs = [];
  const sb = {
    calls, toasts, logs, els, store,
    loginShown: 0,
    sessionStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
    document: { getElementById: id => el(id) },
    console: { log: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')) },
    toast: m => toasts.push(m),
    esc: s => String(s),
    $: id => el(id),
    psCheckShipStationLocation: async () => {},
    SAVVY_CURRENT_USER: 'tester',
    window: {},
    fetch: async (url, opts) => {
      calls.push({ url, opts });
      const isInv = url.endsWith('/sb/update-inventory');
      const st = isInv ? status : 200;
      return { ok: st >= 200 && st < 300, status: st, json: async () => (isInv ? body : { status: 'success' }) };
    },
  };
  sb.ensureLoginScreen = () => { sb.loginShown++; return { style: {} }; };
  vm.createContext(sb);
  const code = ['savvyToken', 'savvyBorrarSesion', 'savvyInventoryHeaders', 'savvySesionCaducada', 'savvyLocationFetch',
    'psPersistLocation', 'psUpdateSellbriteInventory'].map(n => extract(n)).join('\n');
  vm.runInContext(code + '\nthis._psSellbriteProducts = { 0: { sku: "IRW-710363598525-2", warehouse_uuid: "wh-1", inputId: "qty-0" } };', sb);
  vm.runInContext('var _psSellbriteProducts = this._psSellbriteProducts;', sb);
  el('qty-0').value = '6';
  return sb;
}
const invCalls = sb => sb.calls.filter(c => c.url.endsWith('/sb/update-inventory'));

(async () => {
  console.log('#21A product-scanner — inventory session auth');

  // 1. psPersistLocation sends Bearer
  let s = makeSandbox();
  await s.psPersistLocation(0, 'E/P1');
  let c = invCalls(s)[0];
  ok(c && c.opts.headers['Authorization'] === 'Bearer ' + TOKEN, '1 psPersistLocation sends Authorization: Bearer <session token>');
  ok(c && c.opts.method === 'POST' && c.opts.headers['Content-Type'] === 'application/json', '1b psPersistLocation method/Content-Type unchanged');
  ok(c && c.url === URL, '3a psPersistLocation URL unchanged');
  ok(c && c.opts.body === JSON.stringify({ sku: 'IRW-710363598525-2', warehouse_uuid: 'wh-1', bin_location: 'E/P1' }), '4a psPersistLocation body unchanged');
  // #21F-A: /ss/create-product now sends the same session.
  ok((s.calls.find(x => x.url.endsWith('/ss/create-product')) || { opts: { headers: {} } }).opts.headers['Authorization'] === 'Bearer ' + TOKEN,
     '1c /ss/create-product sends the session (#21F-A)');

  // 2. psUpdateSellbriteInventory sends Bearer (add + set)
  for (const modo of ['add', 'set']) {
    s = makeSandbox({ body: { status: 'success', previous_available: 4, available: modo === 'add' ? 10 : 6, mode: modo } });
    await s.psUpdateSellbriteInventory(0, modo);
    c = invCalls(s)[0];
    ok(c && c.opts.headers['Authorization'] === 'Bearer ' + TOKEN, '2 psUpdateSellbriteInventory(' + modo + ') sends Bearer');
    ok(c && c.url === URL && c.opts.method === 'POST', '3b URL/method unchanged (' + modo + ')');
    const b = JSON.parse(c.opts.body);
    ok(JSON.stringify(Object.keys(b)) === JSON.stringify(['sku', 'warehouse_uuid', 'quantity', 'mode']) && b.sku === 'IRW-710363598525-2' && b.quantity === 6,
       '4b body keys/values unchanged (' + modo + ')');
    ok(b.mode === modo, '5 mode unchanged (' + modo + ')');
    ok(b.warehouse_uuid === 'wh-1', '6 warehouse_uuid unchanged (' + modo + ')');
    // 8. success handling unchanged
    const want = modo === 'add' ? '4 + 6 = <strong>10</strong>' : '<strong>6</strong> (reemplazado, antes 4)';
    ok(s.els['ps-sbqty-confirm-0'].innerHTML.includes(want) && s.els['qty-0'].value === 0 && s.loginShown === 0,
       '8 success confirmation/input reset unchanged, no login prompt (' + modo + ')');
  }
  // Unknown modo still maps to set; missing uuid fallback unchanged.
  s = makeSandbox(); s.window._psLastWarehouseUuid = 'wh-last';
  vm.runInContext('_psSellbriteProducts[0].warehouse_uuid = ""; var window = this.window;', s);
  await s.psUpdateSellbriteInventory(0, undefined);
  c = JSON.parse(invCalls(s)[0].opts.body);
  ok(c.mode === 'set' && c.warehouse_uuid === 'wh-last', '5b/6b default mode set + session warehouse fallback unchanged');

  // 7. 401 → savvySesionCaducada (clears session, shows login), error still shown
  s = makeSandbox({ status: 401, body: { error: 'no_autorizado' } });
  await s.psUpdateSellbriteInventory(0, 'add');
  ok(s.loginShown === 1 && !('savvy_session_token' in s.store), '7a update 401 → savvySesionCaducada (session cleared, login shown)');
  ok(s.els['ps-sbqty-confirm-0'].innerHTML.includes('no_autorizado') && !s.els['ps-sbqty-avail-0'],
     '7b update 401 → error shown, quantity not reported as changed');
  s = makeSandbox({ status: 401, body: { error: 'no_autorizado' } });
  await s.psPersistLocation(0, 'E/P1');
  ok(s.loginShown === 1 && !('savvy_session_token' in s.store), '7c location 401 → savvySesionCaducada');
  // #21F-A: /ss/create-product also needs the session now — after the 401 the
  // session is gone, so the ShipStation write is not attempted either.
  ok(s.toasts.some(t => t.includes('ShipStation (Sellbrite falló)') || t.includes('No se pudo guardar la ubicación'))
     && !s.calls.some(k => k.url.includes('/ss/create-product')), '7d location 401 → Sellbrite reported as failed (sbOk=false), no write without session');
  // Non-401 errors do NOT log the user out.
  s = makeSandbox({ status: 409, body: { status: 'error', error: 'current_quantity_unavailable' } });
  await s.psUpdateSellbriteInventory(0, 'add');
  ok(s.loginShown === 0 && s.store.savvy_session_token === TOKEN, '7e 409 does not end the session');

  // 9. token never in URL / query / body / logs
  for (const fn of ['psPersistLocation', 'psUpdateSellbriteInventory']) {
    s = makeSandbox();
    await (fn === 'psPersistLocation' ? s.psPersistLocation(0, 'A/1') : s.psUpdateSellbriteInventory(0, 'add'));
    const leak = s.calls.some(x => x.url.includes(TOKEN) || String(x.opts.body).includes(TOKEN)) || s.logs.some(l => l.includes(TOKEN));
    ok(!leak && s.calls.every(x => !x.url.includes('?')), '9 ' + fn + ': token not in URL/query/body/console');
  }

  // No token in storage → no Authorization header (no "Bearer " with empty value); request shape unchanged.
  s = makeSandbox({ token: '' });
  await s.psUpdateSellbriteInventory(0, 'set');
  c = invCalls(s)[0];
  ok(c && !('Authorization' in c.opts.headers) && c.opts.headers['Content-Type'] === 'application/json', '9b no session → no empty Bearer header');

  // 10. no hardcoded token/secret introduced
  const diff = execSync('git diff origin/main -- app.js', { cwd: __dirname }).toString();
  const added = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).join('\n');
  ok(!/(Bearer\s+['"][A-Za-z0-9._-]{8,})|(secret|password|api[_-]?key)\s*[:=]/i.test(added) && /savvyToken\(\)/.test(added),
     '10 no hardcoded token/secret; header value comes from savvyToken()');
  ok((SRC.match(/'\/sb\/update-inventory'/g) || []).length === 2 && (SRC.match(/headers: savvyInventoryHeaders\(\)/g) || []).length === 2,
     '10b exactly the two /sb/update-inventory calls use savvyInventoryHeaders()');

  // 11. existing login/session code unchanged vs origin/main
  const MAIN = execSync('git show origin/main:app.js', { cwd: __dirname, maxBuffer: 64 << 20 }).toString();
  const same = ['savvyToken', 'savvyGuardarSesion', 'savvyBorrarSesion', 'savvyClaude', 'savvySesionCaducada', 'ensureLoginScreen']
    .every(n => extract(n) === extract(n, MAIN));
  ok(same && SRC.includes("fetch(SAVVY_API + '/auth/login'"), '11 login/session functions byte-identical to main');
  const removed = diff.split('\n').filter(l => l.startsWith('-') && !l.startsWith('---'));
  ok(removed.length === 2 && removed.every(l => l.includes("headers: {'Content-Type': 'application/json'}")),
     '11b only the two header lines replaced; nothing else removed');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
