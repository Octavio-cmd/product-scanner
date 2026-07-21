// ── ON-SCREEN DEBUG CONSOLE — para ver errores directo en el iPhone,
// sin necesitar Mac ni Safari Web Inspector. Toca el logo 5 veces para abrir/cerrar. ──
(function setupDebugConsole(){
  var logs = [];
  var maxLogs = 80;
  var panel = null;

  function ensurePanel(){
    if(panel) return panel;
    panel = document.createElement('div');
    panel.id = 'debug-console-panel';
    panel.style.cssText = 'display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.96);z-index:999999;overflow-y:auto;padding:12px;font-family:monospace;font-size:11px;color:#0f0;white-space:pre-wrap;word-break:break-all';
    var closeBtn = document.createElement('button');
    closeBtn.textContent = '✕ Cerrar Debug Console';
    closeBtn.style.cssText = 'position:sticky;top:0;width:100%;padding:12px;background:#c0392b;color:#fff;border:none;border-radius:8px;font-weight:800;margin-bottom:10px;z-index:2';
    closeBtn.onclick = function(){ panel.style.display = 'none'; };
    panel.appendChild(closeBtn);
    var logsDiv = document.createElement('div');
    logsDiv.id = 'debug-console-logs';
    panel.appendChild(logsDiv);
    document.body.appendChild(panel);
    return panel;
  }

  function render(){
    ensurePanel();
    var logsDiv = document.getElementById('debug-console-logs');
    if(logsDiv) logsDiv.textContent = logs.join('\n\n');
  }

  function push(type, args){
    try{
      var msg = Array.prototype.map.call(args, function(a){
        if(typeof a === 'object'){ try{ return JSON.stringify(a); }catch(e){ return String(a); } }
        return String(a);
      }).join(' ');
      var time = new Date().toLocaleTimeString();
      var line = '[' + time + '] ' + type + ': ' + msg;
      logs.push(line);
      if(logs.length > maxLogs) logs.shift();
      if(panel && panel.style.display !== 'none') render();

      // También lo escribe en el cuadro de debug SIEMPRE VISIBLE junto al botón de packs,
      // si existe en pantalla en este momento — sin necesitar ningún gesto especial.
      var miniLog = document.getElementById('ps-debug-log');
      if(miniLog){
        miniLog.textContent = (miniLog.textContent === 'Esperando acción...' ? '' : miniLog.textContent + '\n') + line;
        miniLog.scrollTop = miniLog.scrollHeight;
      }
    }catch(e){}
  }

  var origLog = console.log, origErr = console.error, origWarn = console.warn;
  console.log   = function(){ push('LOG',  arguments); origLog.apply(console, arguments); };
  console.error = function(){ push('ERROR', arguments); origErr.apply(console, arguments); };
  console.warn  = function(){ push('WARN', arguments); origWarn.apply(console, arguments); };

  // Capturar también errores no atrapados (uncaught) y promesas rechazadas
  window.addEventListener('error', function(e){
    push('UNCAUGHT ERROR', [e.message + ' @ ' + (e.filename||'') + ':' + (e.lineno||'')]);
  });
  window.addEventListener('unhandledrejection', function(e){
    push('UNHANDLED PROMISE', [e.reason && e.reason.message ? e.reason.message : String(e.reason)]);
  });

  window.toggleDebugConsole = function(){
    ensurePanel();
    panel.style.display = (panel.style.display === 'none') ? 'block' : 'none';
    if(panel.style.display === 'block') render();
  };

  // Toca el logo del header 5 veces seguidas para abrir la consola de debug
  document.addEventListener('DOMContentLoaded', function(){
    var logo = document.querySelector('.hdr') || document.querySelector('.lg') || document.body;
    var tapCount = 0, tapTimer = null;
    logo.addEventListener('click', function(){
      tapCount++;
      clearTimeout(tapTimer);
      tapTimer = setTimeout(function(){ tapCount = 0; }, 1500);
      if(tapCount >= 5){ tapCount = 0; window.toggleDebugConsole(); }
    });
  });
})();

// Función directa y a prueba de fallos — escribe inmediatamente en el cuadro
// visible junto al botón de packs, sin depender de nada más.
window._psDebug = function(msg){
  try{
    var box = document.getElementById('ps-debug-log');
    if(box){
      var time = new Date().toLocaleTimeString();
      var line = '[' + time + '] ' + msg;
      box.textContent = (box.textContent === 'Esperando acción...' ? '' : box.textContent + '\n') + line;
      box.scrollTop = box.scrollHeight;
    }
  }catch(e){}
  try{ console.log('_psDebug:', msg); }catch(e){}
};


// ── HELPER FUNCTIONS ──────────────────────────────────────────
const $=id=>document.getElementById(id);
const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');
const fmt=n=>(!n||isNaN(n))?'—':'$'+Number(n).toFixed(2);

const WORKER='https://savvy-ebay.octavio-9e2.workers.dev';
const SAVVY_CONFIG='https://savvy-config-production.up.railway.app';
const DEF_EBAY='StevenGa-SavvySca-PRD-81addb012-655f2649';
// ── Default API keys (loaded from Railway savvy-config)
let DEFAULT_PHOTOROOM_KEY = '';
let DEFAULT_RBG_KEY = '';
// KEY NUEVA asignada DIRECTO a la variable — nadie puede sobrescribirla.
// (El bug de todo el día: Railway savvy-config servía la key VIEJA BORRADA
// y la línea "if (d.imgbb) DEFAULT_IMGBB_KEY = d.imgbb" la sobrescribía
// 2 segundos después de cargar → "Invalid API v1 key" intermitente.)
let DEFAULT_IMGBB_KEY = atob('YzhhNDhjZTRlNWU1MzZmMGE4MzQ1MTYxOTk3ZGNmZTM=');
let DEFAULT_CLAUDE_KEY = '';
let _keysLoaded = false;
// Load keys from Railway on startup — EXCEPTO imgbb (queda fija arriba)
(async function loadKeys() {
  try {
    const r = await fetch(SAVVY_CONFIG + '/config');
    if (r.ok) {
      const d = await r.json();
      // ⛔ NUNCA sobrescribir DEFAULT_IMGBB_KEY desde Railway:
      // if (d.imgbb) DEFAULT_IMGBB_KEY = d.imgbb;   ← DESACTIVADO PERMANENTE
      if (d.claude)     DEFAULT_CLAUDE_KEY = d.claude;
      if (d.sheets_url) localStorage.setItem('cl_sheets_url', d.sheets_url);
      // drive_url: NO sobrescribir — usamos URL fija hardcodeada
    }
  } catch(e) { console.warn('Could not load keys from Railway savvy-config'); }
  // Drive URL fija — siempre la correcta
  localStorage.setItem('cl_drive_url', 'https://script.google.com/macros/s/AKfycbyVgEEID8dqZMymlqQMpjO7fLBMYkfj0mmcWk2ImudTy9evKGlOi4oHUc9vhcdmpFeDDQ/exec');
  _keysLoaded = true;
  if (window._psDebug) window._psDebug('🔑 ImgBB key fija activa: ' + DEFAULT_IMGBB_KEY.substring(0,8) + '...');
})();
// ── Login System ──────────────────────────────────────────────
const SAVVY_USERS = {
  "robles":  "cf7df3a0895be4d16e781d20ae0cd883a49ec76952d12cfc0c64e75265ee1eda",
  "yazmin":  "67cba96e3aca1502869bfafc595eb3fbc8452a0be4c2dac3a205f0d2a988ce27",
  "noelia":  "a8e030f97d4c339d60b842b472ac7b9ac600a135647e7eda88d4d24b301991b0",
  "ana":     "e82827b00b2ca8620beb37f879778c082b292a52270390cff35b6fe3157f4e8b",
  "irene":   "d5bd3bb7e0fd656483ed8de410ff706c50c0f69dd89f34718729c2094e3948fb",
  "danny":   "a79938ab5392c8024dff98a44cf776f4cbbb47be9ff78e4997a4920ec262b320",
  "angelo":  "5f20cd035f6330b88fdd8abd1455cf80493be4640912c35a00905c9d610cee9d",
  "ernesto": "881b476539c517af8fbbaddb0d754fb50de8d43cf554d85bfb7e79c0e4bad8c3",
};

let SAVVY_CURRENT_USER = null;

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

async function doLogin() {
  const user = (document.getElementById('login-user')?.value||'').trim().toLowerCase();
  const pass = document.getElementById('login-pass')?.value||'';
  const errEl = document.getElementById('login-err');
  if (!user || !pass) { if(errEl) errEl.style.display='block'; return; }
  const hash = await sha256(pass);
  if (SAVVY_USERS[user] && SAVVY_USERS[user] === hash) {
    SAVVY_CURRENT_USER = user;
    // sessionStorage: dura mientras la pestaña esté abierta.
    // Al cerrar Safari/la pestaña se borra sola → vuelve a pedir login.
    try { sessionStorage.setItem('savvy_session_user', user); } catch(e) {}
    var scr = document.getElementById('login-screen');
    if (scr) scr.style.display = 'none';
    // Show username in header
    const hdrUser = document.getElementById('hdr-user');
    if (hdrUser) hdrUser.textContent = '👤 ' + user;
  } else {
    if(errEl) errEl.style.display='block';
    document.getElementById('login-pass').value='';
  }
}

// Crea la pantalla de login dinámicamente (el HTML de Product Scanner no la trae)
function ensureLoginScreen() {
  var scr = document.getElementById('login-screen');
  if (scr) return scr;
  scr = document.createElement('div');
  scr.id = 'login-screen';
  scr.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#222;z-index:999999;display:flex;align-items:center;justify-content:center;flex-direction:column';
  scr.innerHTML = `
    <div style="background:#333;padding:40px;border-radius:16px;text-align:center;max-width:350px;border:1px solid #555">
      <div style="font-size:28px;font-weight:900;color:#00e676;margin-bottom:24px">🔐 Savvy Scanner</div>
      <input id="login-user" type="text" placeholder="Username" style="width:100%;padding:12px;margin-bottom:12px;border:1px solid #555;border-radius:8px;background:#222;color:#fff;font-size:16px">
      <input id="login-pass" type="password" placeholder="Password" style="width:100%;padding:12px;margin-bottom:12px;border:1px solid #555;border-radius:8px;background:#222;color:#fff;font-size:16px">
      <button onclick="doLogin()" style="width:100%;padding:14px;background:#00e676;color:#000;border:none;border-radius:8px;font-weight:900;font-size:16px;cursor:pointer">LOGIN</button>
      <div id="login-err" style="display:none;color:#ff5252;margin-top:16px;font-size:14px">❌ Invalid credentials</div>
    </div>
  `;
  document.body.appendChild(scr);
  return scr;
}

document.addEventListener('DOMContentLoaded', function() {
  try { SAVVY_CURRENT_USER = sessionStorage.getItem('savvy_session_user'); } catch(e) {}
  if (!SAVVY_CURRENT_USER) {
    ensureLoginScreen();
  }
});

// UNIFIED PARENT_CATEGORIES LIST — used everywhere
// Esta es la FUENTE DE VERDAD única para categorías que eBay rechaza con Error 87
// ⚠️ NUNCA enviar estos IDs a eBay — siempre reemplazar con una leaf category
var ALL_PARENT_CATS = ['26395','31786','293','888','220','1281','2984','14308','20625','6000','16486','11854','20725','36447','67716','11838','184630'];

// FIXED: psSafeCategory ahora usa la lista UNIFICADA
// devuelve el fallback — evita el Error 87 de eBay (CategoryID es parent category).
function psSafeCategory(cat, fallback){
  var c = String(cat == null ? '' : cat).trim();
  if (!c || c === 'undefined' || c === 'null' || !/^\d+$/.test(c) || ALL_PARENT_CATS.indexOf(c) >= 0) {
    return fallback || '31786'; // 31786 = Skin Care (leaf válida, safe default)
  }
  return c;
}

// SKU: 3 letras marca (o primera palabra del título) + UPC + Npk
function makeSKU(brand,upc,packs,title){
  packs=packs||1; title=title||'';
  let src=(brand||'').trim();
  if(!src||src.toLowerCase()==='generic') src='';
  if(!src&&title){
    const skip=new Set(['2x','bundle','pack','new','of','the','and','for','set','lot','value']);
    const words=title.replace(/[^a-zA-Z\s]/g,' ').trim().split(/\s+/);
    src=words.find(w=>w.length>1&&!skip.has(w.toLowerCase()))||'';
  }
  const pfx=src.replace(/[^a-zA-Z]/g,'').substring(0,3).toUpperCase()||'GEN';
  return pfx+'-'+upc+'-'+packs+'pk';
}

// Categorys — mapa completo de categorías leaf de eBay
function catId(n){
  const t=(n||'').toLowerCase();

  // ── MASSAGERS / MASSAGE DEVICES (leaf: 36449 = Body Massagers) ──
  if(/massager|deep.tissue massag|percussion massag|massage gun|theragun|hypervolt|homedics|shiatsu|foot spa|foot massag|neck massag|back massag|scalp massag/i.test(t))return'36449';
  if(/sharper image.*(massag|deep.tissue|percussion|swappable head)/i.test(t))return'36449';

  // ── HOME HEALTH DEVICES (leaf 20676 = Blood Pressure Monitors) ──
  if(/blood pressure monitor|omron|withings bp/i.test(t))return'20676';
  if(/pulse oximeter|thermometer digital|glucometer|glucose meter|blood glucose/i.test(t))return'20676';
  if(/nebulizer|humidifier|vaporizer.*(vicks|cool.mist)|steam inhaler/i.test(t))return'20676';

  // ── HEATING PADS / HOT-COLD PACKS (leaf 32835 = Heating Pads) ──
  if(/heating pad|electric heating|heat wrap|hot.cold pack|thermacare/i.test(t))return'32835';

  // ── PET SUPPLIES ─────────────────────────────────────────────
  if(/dog food|cat food|pet food|kibble|pedigree|purina|iams|blue buffalo|friskies|fancy feast|whiskas|royal canin|hill.s science/i.test(t))return'1281';
  if(/dog treat|cat treat|milk bone|greenies|temptations treat|beggin strip/i.test(t))return'1281';
  if(/cat toy|dog toy|catnip|scratching post|chew toy|dog chew|pet toy|kong toy/i.test(t))return'1281';
  if(/pet shampoo|dog shampoo|cat shampoo|flea|tick collar|frontline|heartgard|advantage flea|pet medicine/i.test(t))return'1281';
  if(/cat litter|kitty litter|tidy cats|fresh step|arm hammer litter/i.test(t))return'1281';
  if(/leash|dog collar|pet bed|pet carrier|aquarium|hamster|bird seed|puppy|kitten/i.test(t))return'1281';

  // ── BABY ──────────────────────────────────────────────────────
  if(/baby carrier|baby stroller|crib|bassinet|infant seat|baby monitor|baby gate|baby walker|teething ring|pacifier|diaper|baby wipe|baby formula|nursery|crib sheet|baby blanket|baby cloth/i.test(t))return'1281';

  // ── KITCHEN & FOOD PREP (leaf 11116 = Small Kitchen Appliances) ──
  if(/blender|food processor|juicer|coffee maker|espresso|toaster|waffle|griddle|rice cooker|slow cooker|instant pot|pressure cooker|air fryer|immersion blender|hand mixer/i.test(t))return'11116';

  // ── HOME ELECTRO (leaf 58054 = Vacuum Cleaners) ──
  if(/vacuum|dyson|shark|robot vacuum|roomba|bissell|eureka|hoover/i.test(t))return'58054';

  // ── PERSONAL CARE / BEAUTY (leaf 26398 = Hair Care Tools) ──
  if(/hair dryer|straightener|curling iron|hair brush|comb|ionic|t3|dyson|ghd|revlon|hot tool/i.test(t))return'26398';

  // ── SKIN CARE PRODUCTS (leaf 31786 = Skin Care) ──
  if(/lotion|moisturizer|sunscreen|spf|face wash|serum|toner|cleanser|face cream|eye cream|night cream|anti.aging|retinol|vitamin c|hyaluronic|peptide|collagen|clay mask|charcoal mask/i.test(t))return'31786';

  // ── LIP CARE (leaf 26872 = Lip Care) ──
  if(/lip balm|lip gloss|lip stick|lipstick|lip tint|lip plumper|lip mask|lip scrub|burt|chapstick|carmex/i.test(t))return'26872';

  // ── VITAMINS & SUPPLEMENTS (leaf 182053 = Vitamins & Dietary Supplements) ──
  if(/vitamin|supplement|multivitamin|omega|fish oil|collagen|probiotic|melatonin|cbd|cbd oil|ashwagandha|turmeric|ginger|ginseng|echinacea/i.test(t))return'182053';

  // ── PAIN RELIEF (leaf 180959 = Pain Relief Aids) ──
  if(/pain relief|ibuprofen|acetaminophen|aspirin|bengay|icy hot|tiger balm|muscle rub|voltaren|lidocaine|cream|gel/i.test(t))return'180959';

  // ── ALLERGY & COLD (leaf 51227 = Cold & Flu Relief) ──
  if(/cold medicine|flu medicine|antihistamine|allergy relief|allergy medicine|decongestant|cough|cough syrup|cough drop|throat lozenge|nasal spray|saline rinse/i.test(t))return'51227';

  // ── DIGESTION (leaf 57041 = Digestive Aids) ──
  if(/digestive|antacid|tums|rolaids|prilosec|nexium|laxative|stool softener|fiber|gas relief|enzyme|probiotic/i.test(t))return'57041';

  // ── FIRST AID & SAFETY (leaf 15712 = First Aid Kits & Supplies) ──
  if(/first aid|band aid|gauze|ace bandage|elastic wrap|ointment|antiseptic|hydrogen peroxide|rubbing alcohol|cotton swab|thermometer|blood pressure cuff|pulse oximeter/i.test(t))return'15712';

  // ── EXERCISE & FITNESS (leaf 64317 = Other Fitness Equipment) ──
  if(/dumbbell|barbell|kettlebell|yoga mat|resistance band|jump rope|exercise bike|treadmill|rowing machine|weight bench|foam roller|ab roller|pull up bar|suspension trainer/i.test(t))return'64317';

  // ── SPORTS EQUIPMENT (leaf 888 will get filtered; fallback to leaf 181004 = Other Sports Equipment) ──
  if(/soccer|football|basketball|baseball|tennis|golf|badminton|volleyball|frisbee|ping pong|table tennis|racket|paddle|bat|glove|cleats|shin guard|helmet|elbow pad|knee pad/i.test(t))return'181004';

  // ── OUTDOOR & CAMPING (leaf 51828 = Camping & Hiking Gear) ──
  if(/tent|sleeping bag|backpack|hiking|camping|trail|outdoor|compass|flashlight|headlamp|lantern|cooler|thermos|water bottle|carabiner|rope/i.test(t))return'51828';

  // ── GAMING (leaf 11232 = Video Game Consoles) ──
  if(/playstation|xbox|nintendo|gaming|console|controller|game|ps5|ps4|xbox series|switch|gaming pc|game cartridge/i.test(t))return'11232';

  // ── TOYS & GAMES (leaf 220 will get filtered; fallback to leaf 14308 will also filter; use 1281) ──
  if(/lego|action figure|puzzle|board game|card game|collectible|toy|doll|puzzle|game|playset|building block|marble run|train set/i.test(t))return'1281';

  // ── BOOKS (leaf 377 = Books & Magazines) ──
  if(/book|novel|textbook|hardcover|paperback|ebook|isbn/i.test(t))return'377';

  // ── MEDIA (leaf 597 = CDs & Music) ──
  if(/cd|dvd|blu.ray|blu ray|vinyl|record|album|music|movie|film/i.test(t))return'597';

  // ── ELECTRONICS GENERAL (leaf 78524 = Tablets) ──
  if(/tablet|ipad|samsung galaxy|microsoft surface|android tablet|kindle/i.test(t))return'78524';

  // ── OFFICE SUPPLIES (leaf 1311 = Office Supplies) ──
  if(/paper|pen|pencil|notebook|folder|binder|stapler|highlighter|marker|whiteboard|printer|ink cartridge|toner/i.test(t))return'1311';

  // ── TOOLS (leaf 2247 = Hand Tools) ──
  if(/hammer|screwdriver|wrench|pliers|saw|drill|level|tape measure|utility knife|socket|ratchet|allen key|hex key|crowbar|pry bar|chisel/i.test(t))return'2247';

  // ── AUTOMOTIVE (leaf 6024 = Replacement Parts) ──
  if(/car|automotive|vehicle|truck|auto|battery|alternator|starter|oil filter|air filter|spark plug|brake pad|tire|wheel|seat cover|floor mat|car wash|wax|polish/i.test(t))return'6024';

  // ── CLEANING SUPPLIES (leaf 1265 = Cleaning Supplies) ──
  if(/cleaning|detergent|soap|disinfectant|bleach|wipe|mop|broom|sponge|microfiber|trash|trash bag|vacuum bag|air freshener|deodorizer/i.test(t))return'1265';

  // ── LAUNDRY (leaf 1264 = Laundry Supplies) ──
  if(/laundry|detergent|fabric softener|stain remover|bleach|washer|dryer|iron|ironing board|lint|dryer sheet|laundry basket|clothesline/i.test(t))return'1264';

  // ── GARDEN (leaf 2984 will filter; use 1281) ──
  if(/garden|plant|seed|soil|fertilizer|shovel|rake|hoe|pruner|gardening|lawn mower|hedge trimmer|weed whacker|patio|flower|outdoor furniture/i.test(t))return'1281';

  // ── LIGHTING (leaf 11116 = Small Kitchen Appliances — fallback to 181 = Lamps & Lighting) ──
  if(/lamp|light|bulb|led|fluorescent|pendant|chandelier|desk lamp|floor lamp|string light|fairy light/i.test(t))return'181';

  // ── STORAGE (leaf 1311 = Office Supplies; fallback better) ──
  if(/storage|box|shelf|cabinet|drawer|organizer|closet|container|bin|rack|shelving/i.test(t))return'1311';

  // ── DECOR (leaf 181 = Lamps & Lighting; fallback generic) ──
  if(/decor|wall|poster|picture|frame|mirror|wallpaper|sticker|tapestry|throw pillow|cushion|blanket|rug|carpet|curtain|blind/i.test(t))return'181';

  // DEFAULT: Skin Care
  return '31786';
}

// ── CLOTHES (Clothing & Shoes) ──────────────────────────────────────────────
var cl=null;
function renderCL(){
  if(!cl) cl={};
  const clH = document.getElementById('cl-sku');
  if(!clH) return;
}

// ── HELPER: Convert (description object OR text string) to plain text ──
function descToText(desc) {
  if (!desc) return '';
  if (typeof desc === 'string') return desc;
  if (desc.intro) {
    var parts = [desc.intro];
    if (desc.benefits && Array.isArray(desc.benefits)) {
      parts = parts.concat(desc.benefits);
    }
    if (desc.package_contents) parts.push(desc.package_contents);
    if (desc.disclaimer) parts.push(desc.disclaimer);
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }
  return '';
}

// ── HELPER: Convert (description object OR text string) to eBay HTML ──
function descToEbayHTML(desc) {
  if (!desc) return '<p>New, Factory Sealed</p>';
  if (typeof desc === 'string') return '<p>' + esc(desc) + '</p>';
  if (desc.intro) {
    var html = '<p>' + esc(desc.intro) + '</p>';
    if (desc.benefits && Array.isArray(desc.benefits)) {
      html += '<ul>';
      desc.benefits.forEach(function(b) {
        html += '<li>' + esc(b) + '</li>';
      });
      html += '</ul>';
    }
    if (desc.package_contents) {
      html += '<p><strong>Package Contents:</strong> ' + esc(desc.package_contents) + '</p>';
    }
    if (desc.disclaimer) {
      html += '<p style="font-size:small;color:gray">' + esc(desc.disclaimer) + '</p>';
    }
    return html;
  }
  return '<p>New, Factory Sealed</p>';
}

// ── PRODUCT SCANNER ANALYSIS ──────────────────────────────────────────────

// ── Namespaced getCategory + titleBasedName for ambiguous UPC results
function buildSmartTitle(prod,packs){
  const n=(prod.name||'').substring(0,65);
  if(n.length>5&&!/pack|bundle|qty/i.test(n)) return n+' - Pack of '+packs+' New';
  if(/pack|bundle/i.test(n)) return n.replace(/pack.*of.*\d+/i,'').replace(/quantity.*\d+/i,'')+' - Pack of '+packs+' New';
  return 'Pack of '+packs+' New';
}

function catNm(cid){
  const mapping={
    '36449':'Body Massagers',
    '20676':'Home Health Monitors',
    '32835':'Heating Pads',
    '11116':'Small Appliances',
    '58054':'Vacuum Cleaners',
    '26398':'Hair Care Tools',
    '31786':'Skin Care',
    '26872':'Lip Care',
    '182053':'Vitamins & Supplements',
    '180959':'Pain Relief',
    '51227':'Cold & Flu Relief',
    '57041':'Digestive Aids',
    '15712':'First Aid Supplies',
    '64317':'Fitness Equipment',
    '181004':'Sports Equipment',
    '51828':'Camping & Hiking',
    '11232':'Gaming Consoles',
    '377':'Books',
    '597':'Media',
    '78524':'Tablets',
    '1311':'Office Supplies',
    '2247':'Hand Tools',
    '6024':'Auto Parts',
    '1265':'Cleaning Supplies',
    '1264':'Laundry Supplies',
    '181':'Lighting',
    '1281':'Other'
  };
  return mapping[String(cid)]||'Other';
}

function calcBundlePrice(ebay,packs){
  if(!ebay||!ebay.pricing)return;
  const p=ebay.pricing;
  const bundlePrice=packs*(p.unitPrice||p.suggestedPrice||9.99)+10+1+10;
  return Number((bundlePrice/0.87).toFixed(2));
}

function calcBundleProfit(ebay,packs){
  const bp=calcBundlePrice(ebay,packs);
  if(!bp) return null;
  const cost=(packs*((ebay.pricing?.unitPrice||ebay.pricing?.suggestedPrice||9.99))+10+1+10);
  return bp-cost;
}

// ── Análisis de verdicts (SAVVY vs DWI)
function evaluateBundleProfit(ebay,packs){
  const cost=(packs*((ebay.pricing?.unitPrice||ebay.pricing?.suggestedPrice||9.99))+10+1+10));
  const bundlePrice=Number((cost/0.87).toFixed(2));
  const avgPrice=bundlePrice/packs;
  const minViable=15;
  return{bundlePrice,cost,avgPrice,viable:bundlePrice>=minViable};
}

// ── PACK SPLITTING ──────────────────────────────────────────────

var _splitActive={};

function computeSplit(units, activePacks) {
  activePacks = activePacks || [1, 2, 3, 4, 5, 6, 8, 10, 12];
  var active = activePacks.filter(p => !_splitActive[p]);
  if (active.length === 0) active = activePacks;
  var result = {};
  active.forEach(p => result[p] = 0);
  var remaining = units;
  for (var i = active.length - 1; i >= 0 && remaining > 0; i--) {
    var p = active[i];
    var q = Math.floor(remaining / p);
    if (q > 0) {
      result[p] = q;
      remaining -= q * p;
    }
  }
  if (remaining > 0) {
    var smallest = Math.min.apply(null, active);
    if (!result[smallest]) result[smallest] = 0;
    result[smallest]++;
  }
  return result;
}

function toggleSplitPack(p) {
  _splitActive[p] = !_splitActive[p];
}

function displaySplitCalc(item) {
  var total = (item.quantity || 1) * (item.packs || 1);
  var result = computeSplit(total);
  var html = '<div style="padding:8px;background:#1a1a1a;border-radius:8px;text-align:center">';
  html += '<div style="color:#aaa;font-size:12px;margin-bottom:8px">Split: ' + total + ' units</div>';
  [1, 2, 3, 4, 5, 6, 8, 10, 12].forEach(function(p) {
    var q = result[p] || 0;
    var isActive = !_splitActive[p];
    var style = isActive
      ? 'background:#00e676;color:#000;font-weight:700'
      : 'background:#333;color:#888;text-decoration:line-through;opacity:0.5';
    html += '<button style="margin:4px;padding:6px 10px;border:none;border-radius:4px;' + style + ';font-size:12px;cursor:pointer" onclick="toggleSplitPack(' + p + ')">';
    html += (isActive ? '✕' : '↩') + ' ' + p + 'pk: ' + q + '</button>';
  });
  html += '</div>';
  return html;
}

// ── AMAZON/WALMART FALLBACK PRICING ──────────────────────────────────────
async function lookupPricingFallback(upc) {
  try {
    var r = await fetch(SAVVY_CONFIG + '/pricing?upc=' + encodeURIComponent(upc));
    if (r.ok) {
      var d = await r.json();
      return d;
    }
  } catch (e) { }
  return null;
}

// ── RAILWAY eBay PRICES PROXY ──────────────────────────────────────────────────
async function railwayLookup(upc) {
  try {
    var r = await fetch(SAVVY_CONFIG + '/prices?upc=' + encodeURIComponent(upc), { mode: 'cors' });
    if (!r.ok) return null;
    var data = await r.json();
    if (data.error || !data.product || !data.product.name) return null;
    return data;
  } catch (e) {
    console.warn('railwayLookup error:', e);
    return null;
  }
}

// ── CLOUDFLARE WORKER ──────────────────────────────────────────────────
async function workerLookup(upc) {
  try {
    var r = await fetch(WORKER + '/lookup?upc=' + encodeURIComponent(upc), { mode: 'cors' });
    if (!r.ok) return null;
    var data = await r.json();
    return data;
  } catch (e) {
    console.warn('workerLookup error:', e);
    return null;
  }
}

// ── PARSE EBAY URL ────────────────────────────────────────────────────────
function extractUPCFromTitle(title) {
  if (!title) return '';
  var m = title.match(/\b(\d{8,})\b/);
  return m ? m[1] : '';
}

// ── MAIN PRODUCT ANALYSIS ─────────────────────────────────────────────────

async function analyze(upc) {
  upc = String(upc || '').replace(/\D/g, '');
  if (upc.length < 8) { toast('❌ Invalid UPC — minimum 8 digits'); return; }
  showLoadingInline('UPC: ' + upc);
  try {
    await sleep(100);
    await railwayLookup(upc)
      .then(rwData => {
        if (rwData) return finishAnalyze(upc, rwData.product, {
          found: true,
          product: rwData.product,
          pricing: rwData.pricing || {},
          topTitles: rwData.top_titles || [],
          activeListings: rwData.active || 0,
          soldCount: rwData.sold || 0,
          category: rwData.category,
          priceSource: 'railway'
        });
        return lookupPricingFallback(upc).then(fb => {
          if (fb && fb.product) {
            return finishAnalyze(upc, fb.product, {
              found: true,
              product: fb.product,
              pricing: fb.pricing || {},
              topTitles: [],
              activeListings: 0,
              soldCount: 0,
              category: null,
              priceSource: 'fallback'
            });
          }
          return finishAnalyze(upc, { name: '', brand: '', found: false }, {
            found: false,
            product: null,
            pricing: {},
            topTitles: [],
            activeListings: 0,
            soldCount: 0,
            category: null,
            priceSource: 'none'
          });
        });
      });
  } catch (e) {
    console.error('analyze error:', e);
    hideLoading();
    toast('❌ Error: ' + (e.message || e));
  }
}

async function finishAnalyze(upc, prod, ebay) {
  hideLoading();
  if (!prod) prod = { name: '', brand: '', found: false };
  const found = (prod && prod.name && !prod.name.includes('Unable to create'));
  var packs = 1;
  if (found && /pack.{0,10}(\d+)/i.test(prod.name)) {
    const m = prod.name.match(/pack.{0,10}(\d+)/i);
    packs = Math.min(12, Math.max(1, parseInt(m[1]) || 1));
  }
  let title = '';
  if (found) title = buildSmartTitle(prod, packs);
  else if (ebay && ebay.topTitles && ebay.topTitles[0]) {
    const t = ebay.topTitles[0];
    title = String(typeof t === 'object' ? t.title : t).substring(0, 80);
  } else title = 'New Product Pack of ' + packs + ' New';
  const brand = (prod && prod.brand) || '';
  
  // Build result object
  var result = {
    verdict: found || (ebay && ebay.pricing && ebay.pricing.suggestedPrice > 3) ? 'SAVVY' : 'DWI',
    reason: found ? 'Found on eBay' : 'No sufficient data',
    title: title,
    price: calcBundlePrice(ebay, packs),
    packSize: packs,
    category: psSafeCategory(catId(title || prod.name || ''), '31786'),
    categoryName: catNm(psSafeCategory(catId(title || prod.name || ''), '31786')),
    description: 'Bundle of ' + packs + ' ' + (found ? prod.name : 'items') + '. New sealed. Fast shipping from Lumberton, NC.',
    brand: brand,
    upc: upc,
    ebay: ebay,
    prod: prod
  };

  // FIXED: Validate category here with psSafeCategory using UNIFIED list
  const PARENT_CATS_VALIDATE = ALL_PARENT_CATS;
  const titleBasedCat = catId(result.title || prod.name || '');
  if (!result.category || result.category === 'undefined' || PARENT_CATS_VALIDATE.includes(String(result.category)) || result.category === '31786') {
    const isSkinCare = /lotion|moisturizer|sunscreen|spf|face wash|serum|toner|cleanser/i.test(result.title || '');
    if (!isSkinCare && titleBasedCat !== '31786') {
      result.category = psSafeCategory(titleBasedCat, '31786');
      result.categoryName = catNm(result.category);
    } else if (!result.category || result.category === 'undefined') {
      result.category = psSafeCategory(titleBasedCat || '31786', '31786');
      result.categoryName = catNm(result.category);
    }
  }

  // Ensure category is NEVER a parent
  result.category = psSafeCategory(result.category, '31786');
  result.categoryName = catNm(result.category);

  cur = result;
  showAnalyzeResult(result);
}

function showAnalyzeResult(r) {
  var h = '';
  h += '<div class="card" style="border-top:3px solid ' + (r.verdict === 'SAVVY' ? '#00e676' : '#ff9800') + '">';
  h += '<div style="font-size:24px;font-weight:900;color:' + (r.verdict === 'SAVVY' ? '#00e676' : '#ff9800') + '">' + r.verdict + '</div>';
  h += '<div style="color:#aaa;font-size:13px;margin-top:4px">' + r.reason + '</div>';
  h += '</div>';
  h += '<div class="card"><div class="lbl">UPC</div><div class="val" style="font-family:monospace">' + r.upc + '</div></div>';
  h += '<div class="card"><div class="lbl">Title (80 char max)</div><div class="val">' + esc(r.title.substring(0, 80)) + '</div></div>';
  h += '<div class="card"><div class="lbl">Brand</div><div class="val">' + esc(r.brand || 'Unknown') + '</div></div>';
  h += '<div class="card"><div class="lbl">Category</div><div class="val">' + esc(r.categoryName || 'Other') + '<span style="color:var(--mu);font-size:11px"> · ID ' + esc(r.category || '31786') + '</span></div></div>';
  h += '<div class="card"><div class="lbl">Pack Size</div><div class="val">' + r.packSize + '</div></div>';
  h += '<div class="card"><div class="lbl">Bundle Price</div><div class="val" style="color:#00e676">' + fmt(r.price) + '</div></div>';
  var bundleDesc = r.description.replace(/Bundle of \d+ /, 'Bundle of [N] ');
  h += '<div class="card" style="padding:12px;background:#1a1a1a;border-left:3px solid #ff9800"><div class="lbl">Description</div><div class="val" style="font-size:13px;line-height:1.4;white-space:pre-wrap">' + esc(bundleDesc) + '</div></div>';
  h += '<div class="card"><button onclick="doPhotos()" style="width:100%;padding:16px;background:#00e676;color:#000;border:none;border-radius:8px;font-weight:900;font-size:16px;cursor:pointer">📷 TAKE PHOTOS</button></div>';
  $('res-el').innerHTML = h;
  $('scr-res').scrollTop = 0;
}

var cur = null;
var bulk = [];
var _splitActive = {};

function saveBulkToStorage() {
  try { localStorage.setItem('ps_bulk_' + (SAVVY_CURRENT_USER || 'guest'), JSON.stringify(bulk)); } catch (e) { }
}

function loadBulkFromStorage() {
  try {
    var stored = localStorage.getItem('ps_bulk_' + (SAVVY_CURRENT_USER || 'guest'));
    if (stored) {
      bulk = JSON.parse(stored);
      if (!Array.isArray(bulk)) bulk = [];
    }
  } catch (e) { bulk = []; }
}

// ── PHOTOS ────────────────────────────────────────────────────

var photo = {};
var photoUrls = {};

function doPhotos() {
  if (!cur) { toast('❌ No product selected'); return; }
  photo = {};
  photoUrls = {};
  showScreen('scr-photos');
}

async function takePhoto(slot) {
  if (!slot || !['front', 'back', 'tag', 'detail', 'meas1', 'meas2'].includes(slot)) { toast('❌ Invalid slot'); return; }
  var video = document.createElement('video');
  video.id = 'camera-feed-' + slot;
  video.setAttribute('playsinline', '');
  video.setAttribute('autoplay', '');
  var canvas = document.createElement('canvas');
  var stream = null;
  var overlay = document.createElement('div');
  overlay.id = 'camera-overlay-' + slot;
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;z-index:1000;display:flex;align-items:center;justify-content:center;flex-direction:column';
  overlay.innerHTML = '<div style="color:#fff;font-size:18px;font-weight:900;margin-bottom:16px">📷 ' + slot.toUpperCase() + '</div><video id="camera-feed-' + slot + '" playsinline autoplay style="width:90vw;max-height:70vh;border-radius:8px;margin-bottom:16px"></video><div style="display:flex;gap:8px"><button id="snap-' + slot + '" style="flex:1;padding:16px;background:#00e676;color:#000;border:none;border-radius:8px;font-weight:900;font-size:16px;cursor:pointer">📸 SNAP</button><button id="cancel-' + slot + '" style="flex:1;padding:16px;background:#ff5252;color:#fff;border:none;border-radius:8px;font-weight:900;font-size:16px;cursor:pointer">✕ CANCEL</button></div>';
  document.body.appendChild(overlay);
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    video = document.getElementById('camera-feed-' + slot);
    if (video) video.srcObject = stream;
  } catch (e) { toast('❌ Camera access denied'); try { overlay.parentNode.removeChild(overlay); } catch (e) { } return; }
  document.getElementById('snap-' + slot).onclick = function() {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    var imgDataUrl = canvas.toDataURL('image/jpeg', 0.85);
    photo[slot] = imgDataUrl;
    if (stream) { stream.getTracks().forEach(t => t.stop()); }
    try { overlay.parentNode.removeChild(overlay); } catch (e) { }
    uploadPhoto(slot, imgDataUrl);
  };
  document.getElementById('cancel-' + slot).onclick = function() {
    if (stream) { stream.getTracks().forEach(t => t.stop()); }
    try { overlay.parentNode.removeChild(overlay); } catch (e) { }
  };
}

async function compressImage(dataUrl, maxSize = 800000) {
  return new Promise(function(resolve) {
    var img = new Image();
    img.onload = function() {
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      var w = img.width;
      var h = img.height;
      var scale = 1;
      if (img.width > 1920) {
        scale = 1920 / img.width;
      }
      canvas.width = w * scale;
      canvas.height = h * scale;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      var quality = 0.85;
      var blob = null;
      var tries = 0;
      function compress() {
        tries++;
        canvas.toBlob(function(b) {
          blob = b;
          if (blob.size > maxSize && quality > 0.3 && tries < 5) {
            quality -= 0.15;
            compress();
          } else {
            blob.arrayBuffer().then(function(ab) {
              var u8 = new Uint8Array(ab);
              var b64 = btoa(String.fromCharCode.apply(null, u8));
              resolve('data:image/jpeg;base64,' + b64);
            });
          }
        }, 'image/jpeg', quality);
      }
      compress();
    };
    img.src = dataUrl;
  });
}

async function uploadPhoto(slot, dataUrl) {
  try {
    toast('⏳ Uploading ' + slot + '...');
    var compressed = await compressImage(dataUrl, 800000);
    var boundary = '----Boundary' + Math.random().toString(36);
    var body = '--' + boundary + '\r\nContent-Disposition: form-data; name="image"\r\n\r\n';
    var base64 = compressed.split(',')[1];
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    var blobData = new Blob([body, bytes, '\r\n--' + boundary + '--'], { type: 'multipart/form-data; boundary=' + boundary });
    var fd = new FormData();
    fd.append('image', new Blob([bytes], { type: 'image/jpeg' }));
    fd.append('expiration', 86400);
    var r = await fetch('https://api.imgbb.com/1/upload?key=' + DEFAULT_IMGBB_KEY, { method: 'POST', body: fd });
    if (!r.ok) {
      console.error('ImgBB error:', r.status, r.statusText);
      toast('❌ ImgBB upload failed');
      return;
    }
    var d = await r.json();
    if (d.success && d.data.url) {
      photoUrls[slot] = d.data.url + '?t=' + Date.now();
      toast('✅ ' + slot + ' uploaded');
      updatePhotoUI(slot);
    } else {
      console.error('ImgBB response:', d);
      toast('❌ ImgBB error: ' + (d.error?.message || 'unknown'));
    }
  } catch (e) {
    console.error('uploadPhoto error:', e);
    toast('❌ Upload error: ' + (e.message || e));
  }
}

function updatePhotoUI(slot) {
  var btn = document.getElementById('btn-' + slot);
  if (btn) {
    if (photoUrls[slot]) {
      btn.textContent = '✅ ' + slot.toUpperCase();
      btn.style.background = '#00e676';
      btn.style.color = '#000';
    } else {
      btn.textContent = '📷 ' + slot.toUpperCase();
      btn.style.background = '#ff9800';
      btn.style.color = '#fff';
    }
  }
}

function validatePhotos() {
  var required = ['front', 'back', 'tag', 'detail'];
  for (var i = 0; i < required.length; i++) {
    if (!photoUrls[required[i]]) {
      toast('❌ Missing ' + required[i] + ' photo');
      return false;
    }
  }
  return true;
}

// ── LOCATION SCANNER ──────────────────────────────────────────────────────

var _locTarget = null;

function locOpen(target) {
  _locTarget = target;
  var ov = document.createElement('div');
  ov.id = 'loc-overlay';
  ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:1001;display:flex;align-items:center;justify-content:center';
  ov.dataset.openedAt = String(Date.now());

  var swallowEarly = function(e) {
    var age = Date.now() - parseInt(ov.dataset.openedAt || '0', 10);
    if (age < 500) {
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (window._psDebug) window._psDebug('🛡️ LOC: touch blocked (' + age + 'ms)');
    }
  };
  ov.addEventListener('touchstart', swallowEarly, true);
  ov.addEventListener('touchend', swallowEarly, true);
  ov.addEventListener('click', swallowEarly, true);

  ov.innerHTML =
    '<div style="color:#fff;font-size:20px;font-weight:900;text-align:center">📍 Warehouse Location</div>' +
    '<div style="color:#aaa;font-size:13px;text-align:center;margin-bottom:8px">Escribe la ubicación del producto</div>' +
    '<input id="loc-input-v2" type="text" placeholder="Ej: K/P6, RN3:S3:4" autocapitalize="characters" autocomplete="off" spellcheck="false" style="width:100%;max-width:420px;padding:20px;border-radius:12px;border:2px solid #00e676;background:#111;color:#fff;font-size:22px;text-align:center;font-weight:700">' +
    '<button id="loc-ok-v2" style="width:100%;max-width:420px;padding:20px;background:#00e676;color:#000;border:none;border-radius:12px;font-size:18px;font-weight:900;cursor:pointer">✔ GUARDAR UBICACIÓN</button>' +
    '<button id="loc-cancel-v2" style="width:100%;max-width:420px;padding:16px;background:transparent;color:#ff5252;border:2px solid #ff5252;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer">✕ CANCELAR</button>';
  document.body.appendChild(ov);

  var input = document.getElementById('loc-input-v2');
  var okBtn = document.getElementById('loc-ok-v2');
  var cnBtn = document.getElementById('loc-cancel-v2');

  var closeMe = function() {
    try { ov.parentNode.removeChild(ov); } catch (e) { }
  };

  var saveMe = function(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    var age = Date.now() - parseInt(ov.dataset.openedAt || '0', 10);
    if (age < 500) return;
    var v = (input.value || '').trim();
    if (!v) { input.focus(); return; }
    closeMe();
    locCapture(v);
  };

  okBtn.addEventListener('touchend', saveMe);
  okBtn.addEventListener('click', saveMe);

  var cancelMe = function(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    var age = Date.now() - parseInt(ov.dataset.openedAt || '0', 10);
    if (age < 500) return;
    closeMe();
  };
  cnBtn.addEventListener('touchend', cancelMe);
  cnBtn.addEventListener('click', cancelMe);

  input.addEventListener('keydown', function(e) { if (e.key === 'Enter') saveMe(); });

  setTimeout(function() {
    var i = document.getElementById('loc-input-v2');
    if (i) i.focus();
  }, 600);
}

async function locClose() {
  var el = document.getElementById('loc-overlay');
  if (el) { try { el.parentNode.removeChild(el); } catch (e) { } }
}

function locCapture(code) {
  try { savvyStopScan('loc-qr-video'); } catch (e) { }
  ['loc-overlay', 'loc-manual-panel'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) {
      try { el.parentNode.removeChild(el); }
      catch (e) { el.style.display = 'none'; el.style.pointerEvents = 'none'; el.style.zIndex = '-1'; }
    }
  });
  if (window._psDebug) window._psDebug('📍 LOC: overlay eliminated');
  try { locClose(); } catch (e) { console.warn('locClose:', e); }
  try {
    if (_locTarget === 'scanner' || _locTarget === 'product' || (!_locTarget && typeof cur !== 'undefined' && cur)) {
      if (typeof cur !== 'undefined' && cur) {
        cur.location = code;
        if (typeof bulk !== 'undefined' && Array.isArray(bulk)) {
          for (var bi = 0; bi < bulk.length; bi++) {
            if (bulk[bi].upc === cur.upc) bulk[bi].location = code;
          }
        }
        try { if (typeof saveBulkToStorage === 'function') saveBulkToStorage(); } catch (e) { }
        var badge1 = document.getElementById('loc-badge-scanner');
        if (badge1 && typeof locBadgeHTML === 'function') {
          try { badge1.outerHTML = locBadgeHTML(code, 'scanner'); } catch (e) { }
        }
      }
    } else if (_locTarget === 'clothing') {
      if (typeof cl !== 'undefined' && cl) {
        cl.location = code;
        var badge2 = document.getElementById('loc-badge-clothing');
        if (badge2 && typeof locBadgeHTML === 'function') {
          try { badge2.outerHTML = locBadgeHTML(code, 'clothing'); } catch (e) { }
        }
      }
    }
    toast('📍 Location: ' + code);
  } catch (err) {
    console.error('locCapture error:', err);
    toast('⚠️ Error saving location: ' + (err.message || err));
  }
}

function locClear(target) {
  try {
    if ((target === 'scanner' || target === 'product') && typeof cur !== 'undefined' && cur) {
      cur.location = '';
      var badge = document.getElementById('loc-badge-scanner');
      if (badge && typeof locEmptyHTML === 'function') {
        try { badge.outerHTML = locEmptyHTML('scanner'); } catch (e) { }
      }
    } else if (target === 'clothing' && typeof cl !== 'undefined' && cl) {
      cl.location = '';
      var badge2 = document.getElementById('loc-badge-clothing');
      if (badge2 && typeof locEmptyHTML === 'function') {
        try { badge2.outerHTML = locEmptyHTML('clothing'); } catch (e) { }
      }
    }
  } catch (err) { console.warn('locClear:', err); }
}

function locBadgeHTML(code, target) {
  return `<span class="loc-badge" id="loc-badge-${target}">
    <span class="loc-scan-icon">📍</span>
    <span>${code}</span>
    <span class="loc-clear" onclick="locClear('${target}')" title="Borrar">✕</span>
  </span>`;
}

function locEmptyHTML(target) {
  return `<span class="loc-empty" id="loc-badge-${target}" onclick="locOpen('${target}')">
    <span>📦</span><span>Scan location (optional)</span>
  </span>`;
}

// ── MODULE NAVIGATION ─────────────────────────────────────────────────
function toDash() {
  document.querySelectorAll('.scr').forEach(s => s.classList.remove('on'));
  $('scr-dash').classList.add('on');
  const hdrBack = $('hdr-back');
  if (hdrBack) hdrBack.style.display = 'none';
}

function openScanner() {
  document.querySelectorAll('.scr').forEach(s => s.classList.remove('on'));
  $('scr-res').classList.add('on');
}

function openClothing() {
  document.querySelectorAll('.scr').forEach(s => s.classList.remove('on'));
  $('cl-sku').classList.add('on');
  clRenderSKU();
}

function saveSheetsUrl() {
  const v = $('sheetsIn')?.value?.trim();
  if (!v) return;
  localStorage.setItem('cl_sheets_url', v);
  toast('✅ Sheets URL saved');
  setTimeout(closeCfg, 700);
}

function showScreen(id) {
  document.querySelectorAll('.scr').forEach(s => s.classList.remove('on'));
  var el = $(id);
  if (el) el.classList.add('on');
  const hdrBack = $('hdr-back');
  if (hdrBack) {
    hdrBack.style.display = (id === 'scr-dash' || id === 'scr-res') ? 'none' : 'block';
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function toast(msg) {
  var el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:12px 20px;border-radius:8px;z-index:1000;font-size:14px;max-width:80vw';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.style.display = 'none'; }, 3000);
}

function showLoadingInline(msg) {
  var el = document.getElementById('loading-inline');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loading-inline';
    el.style.cssText = 'text-align:center;padding:40px;color:#aaa;font-size:16px';
    el.innerHTML = '<div>⏳</div>';
    document.body.appendChild(el);
  }
  el.innerHTML = '<div>⏳ ' + msg + '</div>';
  el.style.display = 'block';
}

function hideLoading() {
  var el = document.getElementById('loading-inline');
  if (el) el.style.display = 'none';
}

// ── GENERATE BUNDLE IMAGE ─────────────────────────────────────────────────

async function generateBundleImage() {
  if (!cur) { toast('❌ No product'); return; }
  if (!validatePhotos()) return;
  toast('⏳ Generating bundle image...');
  try {
    var front = photoUrls.front || '';
    var back = photoUrls.back || '';
    if (!front) { toast('❌ Need front photo'); return; }
    var r = await fetch(SAVVY_CONFIG + '/collage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ front: front, back: back, upc: cur.upc })
    });
    if (!r.ok) { toast('❌ Collage failed'); return; }
    var d = await r.json();
    if (d.url) {
      cur.bundleImg = d.url;
      toast('✅ Bundle image ready');
      updateBundleImageUI();
    } else {
      toast('❌ No image returned');
    }
  } catch (e) {
    toast('❌ ' + (e.message || e));
  }
}

function updateBundleImageUI() {
  var el = document.getElementById('bundle-img-preview');
  if (el && cur.bundleImg) {
    el.innerHTML = '<img src="' + cur.bundleImg + '" style="max-width:100%;border-radius:8px;margin:12px 0">';
  }
}

// ── SPLIT & ADD TO CSV ────────────────────────────────────────────────────

function addSplitPacksToCSV() {
  if (!cur) { toast('❌ No product'); return; }
  if (!validatePhotos()) return;

  var qtyInput = $('qty-input') ? $('qty-input').value : '1';
  var qty = parseInt(qtyInput) || 1;
  if (qty < 1) qty = 1;

  var split = computeSplit(qty, [1, 2, 3, 4, 5, 6, 8, 10, 12]);
  var added = 0;

  for (var p in split) {
    if (split[p] > 0) {
      var entry = {
        upc: cur.upc,
        sku: makeSKU(cur.brand, cur.upc, parseInt(p)),
        brand: cur.brand || 'Generic',
        title: cur.title || 'New Product',
        category: psSafeCategory(cur.category, '31786'),
        categoryName: cur.categoryName || 'Other',
        price: cur.price || 9.99,
        packs: parseInt(p),
        quantity: split[p],
        description: cur.description || '',
        bundleImg: cur.bundleImg || photoUrls.front || '',
        photo: photoUrls.front || '',
        location: cur.location || '',
        expDate: cur.expDate || '',
        scannedBy: SAVVY_CURRENT_USER || 'unknown'
      };
      bulk.push(entry);
      added++;
    }
  }

  saveBulkToStorage();
  psSendToRegistroSheet(bulk);
  toast('✅ Added ' + added + ' pack(s) to CSV');
  updateBulkUI();
}

var PS_SHEET_URL = 'https://script.google.com/macros/s/AKfycbxhvH830MoVocWM6ieN_mnsi5uYCVaX1kt37_J38f0LehvUFQvRpFXX7hGpGJOUbPU2mw/exec';

function psSendToRegistroSheet(items) {
  if (!items || !items.length) return;

  var rows = items.map(function(it) {
    var p = Number(it.packs) || 1;
    var q = Number(it.quantity) || 1;
    var cat = it.category;
    if (!cat || cat === 'undefined' || cat === 'null') cat = '';
    return {
      tipo: 'product',
      upc: it.upc || '',
      fecha: new Date().toISOString().slice(0, 19).replace('T', ' '),
      marca: it.brand || '',
      categoria: cat,
      titulo: it.title || '',
      paquete: p + 'pk',
      unidades: p * q,
      listados: q,
      precio: it.price || '',
      expDate: it.expDate || '',
      ubicacion: it.location || '',
      fotos: it.bundleImg || it.photo || '',
      descripcion: descToText(it.description),
      escaneadoPor: it.scannedBy || 'unknown'
    };
  });

  fetch(PS_SHEET_URL, {
    method: 'POST',
    mode: 'no-cors',
    body: JSON.stringify({ tipo: 'product', items: rows }),
    headers: { 'Content-Type': 'text/plain' }
  }).catch(function(e) { console.warn('Error enviando a Sheet de registro:', e); });
}

function exportCSV() {
  try {
    if (!bulk.length) { toast('⚠️ No products'); return; }

    if (window._exportLock) { toast('⏳ Export in progress...'); return; }
    window._exportLock = true;
    setTimeout(function() { window._exportLock = false; }, 5000);

    var expBtnEl = document.getElementById('expBtn');
    if (expBtnEl) {
      var expBtnOldHTML = expBtnEl.innerHTML;
      expBtnEl.innerHTML = '⏳ Exporting...';
      expBtnEl.style.opacity = '0.55';
      expBtnEl.style.pointerEvents = 'none';
      setTimeout(function() {
        expBtnEl.innerHTML = expBtnOldHTML;
        expBtnEl.style.opacity = '';
        expBtnEl.style.pointerEvents = '';
      }, 5000);
    }

    psSendToRegistroSheet(bulk);

    function q(v) {
      v = String(v == null ? '' : v);
      return (v.indexOf(',') >= 0 || v.indexOf('"') >= 0 || v.indexOf('\n') >= 0)
        ? '"' + v.replace(/"/g, '""') + '"' : v;
    }

    var SHIP = 'Flat:Standard Shipp(Free),Same business day';
    var RET = '30 Day return Copy';
    var PAY = 'eBay Payments';

    var HDR = [
      '*Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8)',
      'CustomLabel', '*Category', '*Title', '*ConditionID', '*Description',
      'PicURL', '*Format', '*Duration', '*StartPrice', '*Quantity',
      'ImmediatePayRequired', '*Location', '*DispatchTimeMax',
      'ShippingProfileName', 'ReturnProfileName', 'PaymentProfileName',
      '*C:Brand', 'C:Type', 'C:EPA Registration Number', 'C:Model',
      'C:Color', 'C:Language', 'C:Book Title', 'C:Author', 'ISBN',
      'C:Expiration Date', 'C:Dosage'
    ];

    var lines = ['Info,Version=1.0.0,Template=fx_category_template_EBAY_US', HDR.join(',')];
    var skipped = 0;

    var CAT_TYPE = {
      '36870': 'Lip Balm',
      '26872': 'Lip Care',
      '31786': 'Moisturizer',
      '182053': 'Vitamin & Dietary Supplement',
      '180959': 'Pain Relief',
      '51227': 'Cold & Cough',
      '57041': 'Digestive',
      '20676': 'Medical Monitor'
    };

    var EXP_REQUIRED_CATS_TOP = ['182053', '180959', '51227', '57041', '20676', '26872', '36870'];
    var EXP_CATS_D = ['67169', '180959', '75037', '51227', '57041', '2984', '67167', '105070'];
    var APPLIANCE_C = ['11116', '58054'];
    var COLOR_C = ['15727'];
    var BOOK_C = ['377'];
    var EPA_BLOCKED = ['OTC', 'DRUG'];

    function detectType(category, title) {
      const mapped = CAT_TYPE[String(category)];
      if (mapped) return mapped;
      const titleLower = (title || '').toLowerCase();
      if (/lotion|moisturizer/i.test(titleLower)) return 'Moisturizer';
      if (/serum|toner/i.test(titleLower)) return 'Serum';
      if (/cleanser|face wash/i.test(titleLower)) return 'Cleanser';
      if (/lip/i.test(titleLower)) return 'Lip Balm';
      return '';
    }

    function getEpaNumber(category, title) {
      var def = '';
      if (String(category) === '1232' || String(category) === '261844' ||
        /sunscreen|spf/i.test(title)) {
        return '67000200100';
      }
      if (String(category) === '182053' && /vitamin/i.test(title)) {
        return 'Dietary Supplement';
      }
      return def;
    }

    bulk.forEach(function(it) {
      if (EPA_BLOCKED.some(function(u) { return (it.sku || '').includes(u); })) {
        skipped++;
        toast('⚠️ ' + it.sku + ' — Blocked by EPA');
        return;
      }
      if (!it.title || it.title.includes('UNABLE TO CREATE') || it.title.includes('UNIDENTIFIED') || it.brand === 'UNKNOWN') {
        skipped++;
        return;
      }
      var titleWords = (it.title || '').replace(/pack of \d+/gi, '').replace(/\bnew\b/gi, '').replace(/\bsealed\b/gi, '').trim();
      if (titleWords.length < 8) {
        skipped++;
        toast('⚠️ SKU ' + (it.sku || '') + ' — invalid title, skipped');
        return;
      }
      var pics = it.bundleImg || it.photo || it.imgUrl || '';
      var typeVal = detectType(String(it.category), it.title);
      var epaVal = getEpaNumber(String(it.category), it.title);
      var modelVal = '';
      var colorVal = '';
      var langVal = '';
      var bookTitle = '';
      var authorVal = '';
      var isbnVal = '';
      var expDateVal = it.expDate || '';
      var dosageVal = '';
      if (EXP_CATS_D.includes(String(it.category))) {
        var doseMatch = (it.title || '').match(/(\d+\.?\d*\s*(?:mg|mcg|iu|ml|oz|g|ct|count|capsule|tablet|softgel|serving))/i);
        dosageVal = doseMatch ? doseMatch[0] : 'See product label';
      }

      var brandFix = it.brand || 'Generic';
      const titleLower = (it.title || '').toLowerCase();
      if (/\blego\b/.test(titleLower)) { brandFix = 'LEGO'; }
      else if (/\bdash\b/.test(titleLower) && /waffle|maker|blender|toaster/.test(titleLower)) { brandFix = 'Dash'; }
      else if (/\bjergens\b/.test(titleLower)) { brandFix = 'Jergens'; }
      else if (/\bolay\b/.test(titleLower)) { brandFix = 'Olay'; }
      else if (/\bneutrogena\b/.test(titleLower)) { brandFix = 'Neutrogena'; }
      else if (/\bdove\b/.test(titleLower)) { brandFix = 'Dove'; }
      else if (/\bold spice\b/.test(titleLower)) { brandFix = 'Old Spice'; }
      else if (/\bcolgate\b/.test(titleLower)) { brandFix = 'Colgate'; }
      else if (/\bcrest\b/.test(titleLower)) { brandFix = 'Crest'; }
      else if (/\bpantene\b/.test(titleLower)) { brandFix = 'Pantene'; }
      else if (/\bmetamucil\b/.test(titleLower)) { brandFix = 'Metamucil'; }
      else if (/\bcentrum\b/.test(titleLower)) { brandFix = 'Centrum'; }

      var cleanTitle = (it.title || '').replace(/[\u{1F300}-\u{1FFFF}\u{2600}-\u{27FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FEFF}✳️⭐🔥💊📦✅❌⚠️🌟💰📊🏷️]/gu, '').replace(/\s+/g, ' ').trim().substring(0, 80);

      if (APPLIANCE_C.includes(String(it.category))) {
        var titleWords = (it.title || '').split(/,/)[0].trim();
        modelVal = brandFix ? titleWords.replace(new RegExp('^' + brandFix + '\\s*', 'i'), '').trim().substring(0, 65) : titleWords.substring(0, 65);
      }

      if (COLOR_C.includes(String(it.category))) {
        const tl = titleLower;
        if (/white/i.test(tl)) colorVal = 'White';
        else if (/black/i.test(tl)) colorVal = 'Black';
        else if (/red/i.test(tl)) colorVal = 'Red';
        else if (/blue/i.test(tl)) colorVal = 'Blue';
        else if (/green/i.test(tl)) colorVal = 'Green';
        else if (/gray|grey/i.test(tl)) colorVal = 'Gray';
        else if (/silver/i.test(tl)) colorVal = 'Silver';
        else if (/clear|transparent/i.test(tl)) colorVal = 'Clear';
        else colorVal = 'Multicolor';
      }

      if (BOOK_C.includes(String(it.category))) {
        const titleParts = (it.title || '').split(/[|—-]/);
        if (titleParts.length > 0) bookTitle = titleParts[0].trim();
        if (titleParts.length > 1) authorVal = titleParts[1].trim();
      }

      if (BOOK_C.includes(String(it.category)) || String(it.category) === '597') {
        const upcStr = (it.sku || '').replace(/[^0-9]/g, '');
        const isbnMatch = (it.sku || '').match(/(\d{13})/);
        isbnVal = isbnMatch ? isbnMatch[1] : (upcStr.length >= 13 ? upcStr.substring(0, 13) : '');
      }

      // CRITICAL FIX: Use psSafeCategory here to ensure NO parent categories slip into CSV
      var finalCat = psSafeCategory(it.category, '31786');

      lines.push([
        'Add',
        it.sku || '',
        finalCat,  // ← FIXED: Uses psSafeCategory to block all parent categories
        cleanTitle,
        '1000',
        descToEbayHTML(it.description) || ('<p>' + cleanTitle + '</p>'),
        pics,
        'FixedPrice', 'GTC',
        it.price || '9.99',
        String(it.quantity || 1), '1',
        'Lumberton, NC', '1',
        SHIP, RET, PAY,
        brandFix,
        typeVal,
        epaVal,
        modelVal,
        colorVal,
        langVal,
        bookTitle,
        authorVal,
        isbnVal,
        expDateVal,
        dosageVal
      ].map(q).join(','));
    });

    var csv = lines.join('\r\n');
    var now = new Date();
    var stamp = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0') + '-' +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0');
    var exportedCount = bulk.length - skipped;
    var fname = 'eBay-FX-' + stamp + '-' + exportedCount + 'items.csv';
    if (skipped > 0) toast('⚠️ ' + skipped + ' product(s) skipped');

    var driveUrl = localStorage.getItem('cl_drive_url');
    if (driveUrl) {
      toast('📤 Uploading to Google Drive...');
      fetch(driveUrl, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({ csv: csv, filename: fname }),
        headers: { 'Content-Type': 'text/plain' }
      }).then(function() {
        toast('✅ CSV exported: ' + fname);
        bulk = [];
        saveBulkToStorage();
        updateBulkUI();
      }).catch(function(e) {
        toast('⚠️ Drive upload error: ' + (e.message || e));
      });
    } else {
      var blob = new Blob([csv], { type: 'text/csv' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('✅ CSV downloaded: ' + fname);
      bulk = [];
      saveBulkToStorage();
      updateBulkUI();
    }
  } catch (e) {
    console.error('exportCSV error:', e);
    toast('❌ Export error: ' + (e.message || e));
  }
}

function updateBulkUI() {
  var el = document.getElementById('bulk-list');
  if (!el) return;
  if (!bulk.length) {
    el.innerHTML = '<div style="color:#aaa;text-align:center;padding:20px">No items added</div>';
    return;
  }
  var h = '';
  bulk.forEach(function(it, i) {
    h += '<div class="card" style="display:flex;justify-content:space-between;align-items:center">';
    h += '<div><div style="font-weight:700">' + esc(it.sku) + '</div><div style="color:#aaa;font-size:12px">' + it.packs + 'pk × ' + it.quantity + ' = ' + (it.packs * it.quantity) + ' units</div></div>';
    h += '<button onclick="removeBulkItem(' + i + ')" style="padding:8px 12px;background:#ff5252;color:#fff;border:none;border-radius:4px;cursor:pointer">✕</button>';
    h += '</div>';
  });
  el.innerHTML = h;
}

function removeBulkItem(i) {
  bulk.splice(i, 1);
  saveBulkToStorage();
  updateBulkUI();
}

function ensureBulkOverlay() {
  var ov = document.getElementById('bulk-exp-overlay');
  if (ov) return ov;
  ov = document.createElement('div');
  ov.id = 'bulk-exp-overlay';
  ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:998;display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML = `
    <div style="background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:20px;max-width:500px;max-height:80vh;overflow-y:auto">
      <div style="font-size:20px;font-weight:900;color:#00e676;margin-bottom:12px">📦 CSV EXPORT</div>
      <div id="bulk-list" style="margin-bottom:16px;max-height:40vh;overflow-y:auto"></div>
      <div style="display:flex;gap:8px">
        <button id="expBtn" onclick="exportCSV()" style="flex:1;padding:14px;background:#00e676;color:#000;border:none;border-radius:8px;font-weight:900;cursor:pointer">📤 EXPORT</button>
        <button onclick="closeBulkOverlay()" style="flex:1;padding:14px;background:#333;color:#fff;border:none;border-radius:8px;font-weight:900;cursor:pointer">✕ CLOSE</button>
      </div>
    </div>
  `;
  document.body.appendChild(ov);
  updateBulkUI();
  return ov;
}

function closeBulkOverlay() {
  var ov = document.getElementById('bulk-exp-overlay');
  if (ov) { try { ov.parentNode.removeChild(ov); } catch (e) { } }
}

function openBulkOverlay() {
  ensureBulkOverlay().style.display = 'flex';
}

// ── UPC INPUT ──────────────────────────────────────────────────────────────

function scanUPC() {
  var input = $('upc-input');
  if (!input || !input.value.trim()) { toast('❌ Enter UPC'); return; }
  analyze(input.value.trim());
  input.value = '';
}

// ── INIT ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
  // Cargar datos guardados
  loadBulkFromStorage();
  updateBulkUI();

  // FAB para CSV (moved to start to avoid crashes)
  var fab = document.getElementById('fab-bulk');
  if (fab) {
    fab.addEventListener('click', openBulkOverlay);
  }

  // UPC input
  var upcInp = $('upc-input');
  if (upcInp) {
    upcInp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') scanUPC();
    });
  }

  // Botones de foto
  ['front', 'back', 'tag', 'detail', 'meas1', 'meas2'].forEach(function(slot) {
    var btn = $('btn-' + slot);
    if (btn) {
      btn.addEventListener('click', function() { takePhoto(slot); });
    }
  });

  // Botón generar bundle image
  var genBtn = $('gen-bundle-btn');
  if (genBtn) {
    genBtn.addEventListener('click', generateBundleImage);
  }

  // Botón ADD TO CSV
  var addBtn = $('add-packs-btn');
  if (addBtn) {
    addBtn.addEventListener('click', addSplitPacksToCSV);
  }

  // Botones de navegación
  var dashBtn = $('btn-dash');
  if (dashBtn) dashBtn.addEventListener('click', toDash);
  var scanBtn = $('btn-scan');
  if (scanBtn) scanBtn.addEventListener('click', openScanner);
  var clothBtn = $('btn-cloth');
  if (clothBtn) clothBtn.addEventListener('click', openClothing);

  // Config button
  var cfgBtn = $('cfgBtn');
  if (cfgBtn) {
    cfgBtn.addEventListener('click', function() {
      var cfg = $('cfg-panel');
      if (cfg) cfg.style.display = cfg.style.display === 'none' ? 'block' : 'none';
    });
  }

  // Start at dashboard
  toDash();
});
