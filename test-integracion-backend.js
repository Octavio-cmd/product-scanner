// Integración: funciones REALES del escáner contra el backend de múltiples ubicaciones.
// Requiere un backend local (BACKEND_URL) con ShipStation y Sellbrite simulados.
// Variables: BACKEND_URL (p. ej. http://127.0.0.1:8765), TOKEN_FILE (archivo con el token de prueba).
// Nunca apunta a producción: las llamadas a Railway se redirigen a BACKEND_URL.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PROD = 'https://savvy-ebay-prices-production.up.railway.app';
// Sin backend local configurado, la prueba se omite (no toca ningún servicio externo).
if (!process.env.BACKEND_URL || !process.env.TOKEN_FILE) {
  console.log('omitida: definir BACKEND_URL (backend local) y TOKEN_FILE (token de prueba)');
  process.exit(0);
}
const BACKEND = process.env.BACKEND_URL;
const TOKEN = fs.readFileSync(process.env.TOKEN_FILE, 'utf8').trim();
const SRC = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS ' + name); } else { fail++; console.log('  FAIL ' + name); } }
function extract(name) {
  const m = new RegExp('^(async )?function ' + name + '\\s*\\(', 'm').exec(SRC);
  if (!m) throw new Error('no encontrada: ' + name);
  const end = SRC.indexOf('\n}\n', m.index);
  return SRC.slice(m.index, end + 2);
}

async function reset() { await fetch(BACKEND + '/__reset', { method: 'POST' }); }
async function estado() { return (await fetch(BACKEND + '/__estado')).json(); }

function escenario(skuLocal) {
  const els = {};
  const el = id => (els[id] = els[id] || { id, innerHTML: '', textContent: '', value: '', disabled: false });
  const toasts = [];
  const store = { savvy_session_token: TOKEN, savvy_session_user: 'tester' };
  const sb = {
    console: { log() {}, error() {}, warn() {} },
    $: id => el(id),
    toast: m => toasts.push(m),
    esc: s => String(s),
    sessionStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } },
    fetch: (url, opts) => fetch(String(url).replace(PROD, BACKEND), opts),   // solo el backend local
    setTimeout, Promise,
    _psSellbriteProducts: { 0: { sku: skuLocal, name: skuLocal, upc: '', warehouse_uuid: 'wh-1', currentLoc: '' } },
  };
  vm.createContext(sb);
  const nombres = ['savvyToken', 'savvyBorrarSesion', 'savvyInventoryHeaders', 'savvySesionCaducada', 'savvyLocationFetch',
    'psParseLocs', 'psJoinLocs', 'psAddLocs', 'psCheckShipStationLocation', 'psSaveShipStationLocation',
    'psRemoveLocation', 'psPersistLocation'];
  vm.runInContext("var PS_LOC_SEP = '/';\n" + nombres.map(extract).join('\n'), sb);
  sb.toasts = toasts; sb.els = els;
  return sb;
}
function chips(sb) {
  const html = sb.els['ps-ssloc-0'] ? sb.els['ps-ssloc-0'].innerHTML : '';
  return [...html.matchAll(/<strong[^>]*>([^<]*)<\/strong>/g)].map(m => m[1]);
}
async function cargar(sb) { await vm.runInContext('psCheckShipStationLocation(_psSellbriteProducts[0].sku, 0)', sb); }
async function agregar(sb, texto) {
  sb.els['ps-ssloc-input-0'] = { value: texto };
  await vm.runInContext("psSaveShipStationLocation(0, 'append')", sb);
}
function ultimaEscritura(est, via, sku) {
  const e = est.escrituras.filter(x => x.via === via);
  if (via === 'sellbrite') return e.length ? e[e.length - 1].data.inventory.bin_location : undefined;
  return e.length ? e[e.length - 1].data.warehouseLocation : undefined;
}

(async () => {
  const SKU2 = 'ZUR-193052033406-2', SKU1 = 'ZUR-193052033406-1', SKULEG = 'LEG-673419373609-1PK';

  console.log('== I1–I3: 1, 2 y 3 ubicaciones con el backend real');
  await reset();
  let sb = escenario(SKU2);
  await agregar(sb, 'RN1:S3:4');
  let est = await estado();
  ok(est.productos[SKU2].warehouseLocation === 'RN1:S3:4', 'I1 ShipStation guarda 1 ubicación');
  ok(est.sellbrite[SKU2] === 'RN1:S3:4', 'I1 Sellbrite guarda la misma ubicación');
  await agregar(sb, 'RN2:S4:1/RN2:S4:2');
  est = await estado();
  ok(est.productos[SKU2].warehouseLocation === 'RN1:S3:4/RN2:S4:1/RN2:S4:2', 'I2 ShipStation: tres ubicaciones con /');
  ok(est.sellbrite[SKU2] === 'RN1:S3:4/RN2:S4:1/RN2:S4:2', 'I2 Sellbrite: el mismo texto, sin pérdida');
  await cargar(sb);
  ok(JSON.stringify(chips(sb)) === JSON.stringify(['RN1:S3:4', 'RN2:S4:1', 'RN2:S4:2']), 'I2 fichas muestran las tres');
  await vm.runInContext('psRemoveLocation(0, 1)', sb);
  est = await estado();
  ok(est.productos[SKU2].warehouseLocation === 'RN1:S3:4/RN2:S4:2', 'I3 quitar la segunda: ShipStation conserva las demás');
  ok(est.sellbrite[SKU2] === 'RN1:S3:4/RN2:S4:2', 'I3 quitar la segunda: Sellbrite igual');

  console.log('== I4: formato antiguo con comas en el backend');
  await reset();
  sb = escenario(SKULEG);
  await cargar(sb);
  ok(JSON.stringify(chips(sb)) === JSON.stringify(['A-1', 'B-9']), 'I4 formato con comas se muestra como dos fichas');
  await agregar(sb, 'C-3');
  est = await estado();
  ok(est.productos[SKULEG].warehouseLocation === 'A-1/B-9/C-3', 'I4 agregar sobre comas: ShipStation con /, nada perdido');
  ok(est.sellbrite[SKULEG] === 'A-1/B-9/C-3', 'I4 agregar sobre comas: Sellbrite con /, nada perdido');

  console.log('== I5: paquetes distintos no se mezclan');
  await reset();
  const s1 = escenario(SKU1), s2 = escenario(SKU2);
  await agregar(s1, 'RN9:S9:9');
  await agregar(s2, 'RN2:S4:1');
  est = await estado();
  ok(est.productos[SKU1].warehouseLocation === 'RN9:S9:9' && est.productos[SKU2].warehouseLocation === 'RN2:S4:1',
     'I5 cada pack conserva solo sus ubicaciones');

  console.log('== I6: duplicados y reemplazo explícito');
  await reset();
  sb = escenario(SKU2);
  await agregar(sb, 'RN1:S3:4');
  const antes = (await estado()).escrituras.length;
  await agregar(sb, 'rn1:s3:4');
  est = await estado();
  ok(est.escrituras.length === antes, 'I6 duplicado sin distinguir mayúsculas no escribe');
  sb.els['ps-ssloc-input-0'] = { value: 'ZZ-9' };
  await vm.runInContext("psSaveShipStationLocation(0, 'replace')", sb);
  est = await estado();
  ok(est.productos[SKU2].warehouseLocation === 'ZZ-9' && est.sellbrite[SKU2] === 'ZZ-9', 'I6 reemplazo explícito escribe en ambos');

  console.log('== I7: límite de 100 caracteres: no escribe nada');
  await reset();
  sb = escenario(SKU2);
  await agregar(sb, 'RN1:S3:4');
  const antes2 = (await estado()).escrituras.length;
  await agregar(sb, 'X'.repeat(101));
  est = await estado();
  ok(est.escrituras.length === antes2, 'I7 texto de más de 100 caracteres no se envía');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
