// Ubicaciones múltiples por SKU: agregar, quitar y reemplazar con las funciones REALES de app.js.
// Sandbox vm con persistencia simulada: no hay red ni escrituras reales.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS ' + name); } else { fail++; console.log('  FAIL ' + name); } }
function extract(name) {
  const m = new RegExp('^(async )?function ' + name + '\\s*\\(', 'm').exec(SRC);
  if (!m) throw new Error('no encontrada: ' + name);
  const end = SRC.indexOf('\n}\n', m.index);
  return SRC.slice(m.index, end + 2);
}

function sandbox(productos) {
  const persistidos = [], toasts = [], confirm = {};
  const els = {};
  const sb = {
    console: { log() {}, error() {}, warn() {} },
    $: id => els[id] || (id.startsWith('ps-ssloc-confirm-') ? (confirm[id] = confirm[id] || { innerHTML: '' }) : null),
    toast: m => toasts.push(m),
    esc: s => String(s),
    persistidos, toasts, confirm, els,
    _psSellbriteProducts: productos,
    psPersistLocation: async (idx, loc) => { persistidos.push([idx, loc]); },
    setTimeout, Promise,
  };
  vm.createContext(sb);
  const code = "var PS_LOC_SEP = '/';\n" + ['psParseLocs', 'psJoinLocs', 'psAddLocs', 'psSaveShipStationLocation', 'psRemoveLocation']
    .map(extract).join('\n');
  vm.runInContext(code, sb);
  return sb;
}

async function agregar(sb, idx, texto) {
  sb.els['ps-ssloc-input-' + idx] = { value: texto };
  await vm.runInContext(`psSaveShipStationLocation(${idx}, 'append')`, sb);
}

(async () => {
  console.log('== Parseo (acepta "/" y ",", sin duplicados, sin distinguir mayúsculas)');
  let sb = sandbox({});
  ok(JSON.stringify(vm.runInContext("psParseLocs('RN1:S3:4/RN2:S4:1/RN2:S4:2')", sb)) === '["RN1:S3:4","RN2:S4:1","RN2:S4:2"]', 'formato del almacén');
  ok(JSON.stringify(vm.runInContext("psParseLocs('A-1, B-9')", sb)) === '["A-1","B-9"]', 'formato antiguo con coma');
  ok(JSON.stringify(vm.runInContext("psParseLocs('A-1/a-1, B-9/ , ')", sb)) === '["A-1","B-9"]', 'mezcla, duplicado en mayúsculas, vacíos');
  ok(JSON.stringify(vm.runInContext("psParseLocs('')", sb)) === '[]', 'vacío');

  console.log('== Agregar: 1, 2, 3 y 4 ubicaciones, conservando todas');
  const casos = [
    ['', 'RN1:S3:4', 'RN1:S3:4'],
    ['RN1:S3:4', 'RN2:S4:1', 'RN1:S3:4/RN2:S4:1'],
    ['RN1:S3:4/RN2:S4:1', 'RN2:S4:2', 'RN1:S3:4/RN2:S4:1/RN2:S4:2'],
    ['RN1:S3:4/RN2:S4:1/RN2:S4:2', 'RN3:S1:9', 'RN1:S3:4/RN2:S4:1/RN2:S4:2/RN3:S1:9'],
  ];
  for (const [actual, nueva, esperado] of casos) {
    sb = sandbox({ 0: { currentLoc: actual, sku: 'ZUR-193052033406-2' } });
    await agregar(sb, 0, nueva);
    ok(sb.persistidos.length === 1 && sb.persistidos[0][1] === esperado, `agregar ${nueva} a "${actual || 'vacío'}" → ${esperado}`);
  }

  console.log('== Agregar: sin duplicados y formatos mixtos');
  sb = sandbox({ 0: { currentLoc: 'RN1:S3:4/RN2:S4:1', sku: 'X' } });
  await agregar(sb, 0, 'rn1:s3:4');
  ok(sb.persistidos.length === 0 && sb.toasts.some(t => t.includes('ya está')), 'duplicado en minúsculas no se agrega');
  sb = sandbox({ 0: { currentLoc: 'RN1:S3:4, RN2:S4:1', sku: 'X' } });
  await agregar(sb, 0, 'RN2:S4:1/RN2:S4:2');
  ok(sb.persistidos[0] && sb.persistidos[0][1] === 'RN1:S3:4/RN2:S4:1/RN2:S4:2', 'formato con coma + nuevas separadas por "/" (sin duplicar)');
  sb = sandbox({ 0: { currentLoc: 'A-1, B-9', sku: 'X' } });
  await agregar(sb, 0, 'C-3');
  ok(sb.persistidos[0] && sb.persistidos[0][1] === 'A-1/B-9/C-3', 'formato antiguo con coma: nada se pierde (pasa a "/")');

  console.log('== Quitar: solo la elegida, conservando las demás');
  sb = sandbox({ 0: { currentLoc: 'RN1:S3:4/RN2:S4:1/RN2:S4:2', sku: 'X' } });
  await vm.runInContext('psRemoveLocation(0, 1)', sb);
  ok(sb.persistidos[0][1] === 'RN1:S3:4/RN2:S4:2', 'quitar la del medio de 3');
  sb = sandbox({ 0: { currentLoc: 'A-1, B-9, C-3', sku: 'X' } });
  await vm.runInContext('psRemoveLocation(0, 1)', sb);
  ok(sb.persistidos[0][1] === 'A-1/C-3', 'formato con coma: quitar una deja las demás (no se vuelve una sola)');
  sb = sandbox({ 0: { currentLoc: 'A-1/B-9', sku: 'X' } });
  await vm.runInContext('psRemoveLocation(0, 0)', sb);
  ok(sb.persistidos[0][1] === 'B-9', 'quitar de 2 deja 1 (sin convertir a otro formato)');
  sb = sandbox({ 0: { currentLoc: 'A-1', sku: 'X' } });
  await vm.runInContext('psRemoveLocation(0, 0)', sb);
  ok(sb.persistidos[0][1] === '', 'quitar la última deja vacío (borrado explícito)');
  sb = sandbox({ 0: { currentLoc: 'A-1/B-9', sku: 'X' } });
  await vm.runInContext('psRemoveLocation(0, 5)', sb);
  ok(sb.persistidos.length === 0, 'índice fuera de rango no escribe');

  console.log('== Reemplazar: solo por acción explícita, sin convertir ubicaciones múltiples');
  sb = sandbox({ 0: { currentLoc: 'A-1/B-9/C-3', sku: 'X' } });
  sb.els['ps-ssloc-input-0'] = { value: 'D-4' };
  await vm.runInContext("psSaveShipStationLocation(0, 'replace')", sb);
  ok(sb.persistidos[0][1] === 'D-4', 'reemplazar escribe lo que el usuario indicó (acción explícita)');
  sb = sandbox({ 0: { currentLoc: 'A-1', sku: 'X' } });
  sb.els['ps-ssloc-input-0'] = { value: 'D-4, E-5/F-6' };
  await vm.runInContext("psSaveShipStationLocation(0, 'replace')", sb);
  ok(sb.persistidos[0][1] === 'D-4/E-5/F-6', 'reemplazar con varias usa "/"');

  console.log('== Entrada vacía y límite provisional de 100 caracteres');
  sb = sandbox({ 0: { currentLoc: 'A-1', sku: 'X' } });
  sb.els['ps-ssloc-input-0'] = { value: ' , / ' };
  await vm.runInContext("psSaveShipStationLocation(0, 'append')", sb);
  ok(sb.persistidos.length === 0, 'entrada solo con separadores no escribe nada (no vacía la ubicación)');
  const larga = Array.from({ length: 5 }, (_, i) => 'ZONA-' + i + '-' + 'X'.repeat(14)).join('/');
  sb = sandbox({ 0: { currentLoc: larga.slice(0, 80), sku: 'X' } });
  await agregar(sb, 0, 'ZONA-9-' + 'X'.repeat(20));
  ok(sb.persistidos.length === 0 && sb.toasts.some(t => t.includes('límite')), 'más de 100 caracteres: rechaza y alerta, sin truncar');

  console.log('== Paquetes: cada producto se guarda por separado');
  sb = sandbox({
    0: { currentLoc: 'RN1:S3:4/RN2:S4:1', sku: 'ZUR-193052033406-1' },
    1: { currentLoc: 'RN9:S9:9', sku: 'ZUR-193052033406-2' },
  });
  await vm.runInContext('psRemoveLocation(0, 0)', sb);
  ok(sb.persistidos.length === 1 && sb.persistidos[0][0] === 0 && sb.persistidos[0][1] === 'RN2:S4:1',
     'quitar en el paquete 1 no toca el paquete 2');
  await agregar(sb, 1, 'RN2:S4:2');
  ok(sb.persistidos[1][0] === 1 && sb.persistidos[1][1] === 'RN9:S9:9/RN2:S4:2', 'agregar al paquete 2 no mezcla con el paquete 1');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
