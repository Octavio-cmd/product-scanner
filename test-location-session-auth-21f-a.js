// #21F-A — /ss/location and /ss/create-product send the existing Savvy session
// (Authorization: Bearer <savvyToken()>), like /sb/update-inventory.
// Runs the REAL functions from app.js (extracted by name) in a vm sandbox with
// fetch/DOM/sessionStorage stubs. Run: node test-location-session-auth-21f-a.js
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { execSync } = require('child_process');

const SRC = fs.readFileSync(process.env.PS_APP || path.join(__dirname, 'app.js'), 'utf8');
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS ' + name); } else { fail++; console.log('  FAIL ' + name); } }
function extract(name, src = SRC) {
  const m = new RegExp('^(async )?function ' + name + '\\s*\\(', 'm').exec(src);
  if (!m) return null;
  const end = src.indexOf('\n}\n', m.index);
  return src.slice(m.index, end + 2);
}

const TOKEN = 'tok-abc.def-123';
const BASE = 'https://savvy-ebay-prices-production.up.railway.app';
const SKU = 'LEG-673419373609-1pk';

function makeSandbox({ token = TOKEN, locStatus = 200, loc = 'oficina', saveStatus = 200 } = {}) {
  const els = {};
  const el = id => (els[id] = els[id] || { id, innerHTML: '', textContent: '', value: '', disabled: false, style: {} });
  const store = token ? { savvy_session_token: token, savvy_session_user: 'tester' } : {};
  const calls = [], toasts = [], logs = [];
  const sb = {
    calls, toasts, logs, els, store, loginShown: 0,
    sessionStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    document: { getElementById: id => el(id), querySelectorAll: () => [] },
    console: { log: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.map(String).join(' ')) },
    toast: m => toasts.push(m), esc: s => String(s), $: id => el(id),
    SAVVY_CURRENT_USER: 'tester', window: {},
    fetch: async (url, opts = {}) => {
      calls.push({ url, opts });
      if (url.includes('/ss/location')) return { ok: locStatus < 300, status: locStatus, json: async () => (locStatus === 200 ? { exists: true, product_id: 1, warehouse_location: loc } : { error: 'no_autorizado' }) };
      if (url.includes('/ss/create-product')) return { ok: saveStatus < 300, status: saveStatus, json: async () => (saveStatus === 200 ? { status: 'success' } : { status: 'error', error: saveStatus === 401 ? 'no_autorizado' : 'boom' }) };
      if (url.includes('/sb/update-inventory')) return { ok: true, status: 200, json: async () => ({ status: 'success' }) };
      return { ok: false, status: 404, json: async () => ({}) };
    },
  };
  sb.ensureLoginScreen = () => { sb.loginShown++; return { style: {} }; };
  vm.createContext(sb);
  const names = ['savvyToken', 'savvyBorrarSesion', 'savvyInventoryHeaders', 'savvySesionCaducada', 'savvyLocationFetch',
    'psCheckShipStationLocation', 'psSaveShipStationLocation', 'psRemoveLocation', 'psPersistLocation'];
  const code = names.map(n => extract(n)).filter(Boolean).join('\n');
  vm.runInContext(code, sb);
  vm.runInContext('var _psSellbriteProducts = { 0: { sku: "' + SKU + '", name: "LEGO", upc: "673419373609", warehouse_uuid: "wh-1", currentLoc: "oficina" } };', sb);
  el('ps-ssloc-0'); // location container exists
  return sb;
}
const hdr = c => (c.opts.headers || {});
const byPath = (sb, p) => sb.calls.filter(c => c.url.includes(p));

(async () => {
  console.log('#21F-A product-scanner — location session auth');
  ok(typeof extract('savvyLocationFetch') === 'string', 'helper present');

  // 1, 3, 7, 10: GET /ss/location with Bearer from savvyToken(), same URL/method
  let s = makeSandbox();
  await s.psCheckShipStationLocation(SKU, 0);
  let c = byPath(s, '/ss/location')[0];
  ok(c && hdr(c)['Authorization'] === 'Bearer ' + TOKEN, '1 /ss/location sends Authorization: Bearer');
  ok(c && c.url === BASE + '/ss/location?sku=' + encodeURIComponent(SKU), '10 SKU query unchanged (exact SKU, same URL)');
  ok(c && (c.opts.method === undefined || c.opts.method === 'GET') && !('body' in c.opts), '7 GET unchanged (no method override, no body)');
  ok(s.els['ps-ssloc-0'].innerHTML.includes('oficina') && s.els['ps-ssloc-0'].innerHTML.includes('➕ Añadir'), '7b location UI unchanged (chips + Añadir)');
  s.store.savvy_session_token = 'rotated-token';
  await s.psCheckShipStationLocation(SKU, 0);
  ok(hdr(byPath(s, '/ss/location')[1])['Authorization'] === 'Bearer rotated-token', '3 token comes from savvyToken() at call time');

  // 2, 8, 9: POST /ss/create-product with Bearer, same body
  s = makeSandbox();
  s.els['ps-ssloc-input-0'] = { value: 'A-12' };
  await s.psSaveShipStationLocation(0, 'append');
  c = byPath(s, '/ss/create-product')[0];
  ok(c && hdr(c)['Authorization'] === 'Bearer ' + TOKEN, '2 /ss/create-product sends Authorization: Bearer');
  ok(c && c.url === BASE + '/ss/create-product' && c.opts.method === 'POST' && hdr(c)['Content-Type'] === 'application/json', '8 POST / URL / Content-Type unchanged');
  ok(c && c.opts.body === JSON.stringify({ sku: SKU, name: 'LEGO', warehouse_location: 'oficina, A-12', upc: '673419373609' }), '9 create-product payload unchanged');
  // 16 append unchanged
  ok(JSON.parse(byPath(s, '/sb/update-inventory')[0].opts.body).bin_location === 'oficina, A-12', '16 append → "oficina, A-12" (unchanged)');
  // 17 replace
  s = makeSandbox(); s.els['ps-ssloc-input-0'] = { value: 'B-4' };
  await s.psSaveShipStationLocation(0, 'replace');
  ok(JSON.parse(byPath(s, '/ss/create-product')[0].opts.body).warehouse_location === 'B-4', '17 replace → "B-4" (unchanged)');
  // 18 delete
  s = makeSandbox();
  vm.runInContext('_psSellbriteProducts[0].currentLoc = "oficina, A-12, B-4";', s);
  await s.psRemoveLocation(0, 1);
  ok(JSON.parse(byPath(s, '/ss/create-product')[0].opts.body).warehouse_location === 'oficina, B-4', '18 delete one → "oficina, B-4" (unchanged)');
  // 19 /sb/update-inventory unchanged
  const inv = byPath(s, '/sb/update-inventory')[0];
  ok(inv && hdr(inv)['Authorization'] === 'Bearer ' + TOKEN && hdr(inv)['Content-Type'] === 'application/json' && JSON.parse(inv.opts.body).sku === SKU && !inv.url.includes('?'), '19 /sb/update-inventory still authenticated, same shape');

  // 4, 5, 6: token never in URL / body / console
  let leak = false;
  for (const fn of [async x => x.psCheckShipStationLocation(SKU, 0), async x => { x.els['ps-ssloc-input-0'] = { value: 'A-1' }; await x.psSaveShipStationLocation(0, 'append'); }]) {
    const t = makeSandbox(); await fn(t);
    if (t.calls.some(k => k.url.includes(TOKEN) || String(k.opts.body || '').includes(TOKEN))) leak = true;
    ok(!t.logs.some(l => l.includes(TOKEN)), '6 token not logged');
  }
  ok(!leak, '4/5 token not in URL or body');

  // 11: location 401
  s = makeSandbox({ locStatus: 401 });
  await s.psCheckShipStationLocation(SKU, 0);
  ok(s.loginShown === 1 && !('savvy_session_token' in s.store), '11 /ss/location 401 → savvySesionCaducada');
  // 12: create 401
  s = makeSandbox({ saveStatus: 401 }); s.els['ps-ssloc-input-0'] = { value: 'A-12' };
  await s.psSaveShipStationLocation(0, 'append');
  ok(s.loginShown === 1 && !('savvy_session_token' in s.store), '12 /ss/create-product 401 → savvySesionCaducada');
  // 15: non-401 errors do not log out
  s = makeSandbox({ locStatus: 500 });
  await s.psCheckShipStationLocation(SKU, 0);
  const s2 = makeSandbox({ saveStatus: 500 }); s2.els['ps-ssloc-input-0'] = { value: 'A-12' };
  await s2.psSaveShipStationLocation(0, 'append');
  ok(s.loginShown === 0 && s.store.savvy_session_token === TOKEN && s2.loginShown === 0 && s2.store.savvy_session_token === TOKEN, '15 non-401 errors keep the session');

  // 13, 14: no session → no request
  s = makeSandbox({ token: '' });
  await s.psCheckShipStationLocation(SKU, 0);
  ok(byPath(s, '/ss/location').length === 0 && s.els['ps-ssloc-0'].innerHTML.includes('No se pudo consultar ubicación'), '13 no session → no GET, existing error UI');
  s = makeSandbox({ token: '' }); s.els['ps-ssloc-input-0'] = { value: 'A-12' };
  await s.psSaveShipStationLocation(0, 'append');
  ok(byPath(s, '/ss/create-product').length === 0, '14 no session → no ShipStation write');

  // Source checks against origin/main
  const MAIN = (() => { try { return execSync('git show 6aeaa3c:app.js', { cwd: __dirname, maxBuffer: 64 << 20 }).toString(); } catch (e) { return null; } })();
  ok(!/fetch\(RAILWAY_SB \+ '\/ss\/(location|create-product)/.test(SRC) && (SRC.match(/savvyLocationFetch\(RAILWAY_SB \+ '\/ss\/(location\?upc=|location\?sku=|create-product)/g) || []).length === 3,
     '1b all three /ss/* calls (location?upc, location?sku, create-product) go through savvyLocationFetch');
  if (MAIN) {
    const same = ['savvyToken', 'savvyGuardarSesion', 'savvyBorrarSesion', 'savvyClaude', 'savvySesionCaducada', 'ensureLoginScreen', 'savvyInventoryHeaders', 'psUpdateSellbriteInventory']
      .every(n => extract(n) === extract(n, MAIN));
    ok(same, '20 login/session functions and inventory update byte-identical to 6aeaa3c');
    const norm = t => t.replace(/savvyLocationFetch\(/g, 'fetch(');
    ok(['psCheckShipStationLocation', 'psSaveShipStationLocation', 'psRemoveLocation', 'psPersistLocation'].every(n => norm(extract(n)) === extract(n, MAIN)),
       '16–18 location functions identical to 6aeaa3c except fetch → savvyLocationFetch');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
