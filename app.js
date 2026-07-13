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
let DEFAULT_IMGBB_KEY = '';
let DEFAULT_CLAUDE_KEY = '';
let _keysLoaded = false;
// Load keys from Railway on startup
(async function loadKeys() {
  try {
    const r = await fetch(SAVVY_CONFIG + '/config');
    if (r.ok) {
      const d = await r.json();
      if (d.imgbb)      DEFAULT_IMGBB_KEY  = d.imgbb;
      if (d.claude)     DEFAULT_CLAUDE_KEY = d.claude;
      if (d.sheets_url) localStorage.setItem('cl_sheets_url', d.sheets_url);
      // drive_url: NO sobrescribir — usamos URL fija hardcodeada
    }
  } catch(e) { console.warn('Could not load keys from Railway savvy-config'); }
  // Fallback hardcoded (always applies if Railway didn't provide)
  const _k = [
    ['DEFAULT_IMGBB_KEY', atob('MWU4ZWNlYTJmYzJlYTkxOGNhY2E3NDM2OTkyOGVmNjM=')],
  ];
  _k.forEach(([k, v]) => { if (!window[k]) window[k] = v; });
  // Drive URL fija — siempre la correcta
  localStorage.setItem('cl_drive_url', 'https://script.google.com/macros/s/AKfycbyVgEEID8dqZMymlqQMpjO7fLBMYkfj0mmcWk2ImudTy9evKGlOi4oHUc9vhcdmpFeDDQ/exec');
  _keysLoaded = true;
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
    localStorage.setItem('savvy_user', user);
    document.getElementById('login-screen').style.display = 'none';
    // Show username in header
    const hdrUser = document.getElementById('hdr-user');
    if (hdrUser) hdrUser.textContent = '👤 ' + user;
  } else {
    if(errEl) errEl.style.display='block';
    document.getElementById('login-pass').value='';
  }
}

function checkLogin() {
  // Auto-login - no authentication required
  SAVVY_CURRENT_USER = 'demo';
  const hdrUser = document.getElementById('hdr-user');
  if (hdrUser) hdrUser.textContent = '👤 demo';
}

function doLogout() {
  localStorage.removeItem('savvy_user');
  SAVVY_CURRENT_USER = null;
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-user').value='';
  document.getElementById('login-pass').value='';
  const errEl = document.getElementById('login-err');
  if(errEl) errEl.style.display='none';
}

// Check login on load
window.addEventListener('load', checkLogin);
// Initialize Zebra printer IP if not set
if (!localStorage.getItem('savvy_printer_ip')) {
  localStorage.setItem('savvy_printer_ip', '192.168.1.25');
}

let bulk=[],cur=null;
let _lastBundleUrl = ''; // URL pública de ImgBB del último bundle generado

function screen(n){document.querySelectorAll('.scr').forEach(s=>s.classList.remove('on'));$('scr-'+n).classList.add('on');}
let _tt;
function toast(msg,ms=2600){const t=$('toast');t.textContent=msg;t.classList.add('on');clearTimeout(_tt);_tt=setTimeout(()=>t.classList.remove('on'),ms);}
function stat(m){const e=$('ls');if(e)e.textContent=m;}

// SKU: 3 letras marca (o primera palabra del título) + UPC + Npk
function makeSKU(brand,upc,packs,title){
  packs=packs||2; title=title||'';
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

  // ── PET SUPPLIES ─────────────────────────────────────────────
  if(/dog food|cat food|pet food|kibble|pedigree|purina|iams|blue buffalo|friskies|fancy feast|whiskas|royal canin|hill.s science/i.test(t))return'1281';
  if(/dog treat|cat treat|milk bone|greenies|temptations treat|beggin strip/i.test(t))return'1281';
  if(/cat toy|dog toy|catnip|scratching post|chew toy|dog chew|pet toy|kong toy/i.test(t))return'1281';
  if(/pet shampoo|dog shampoo|cat shampoo|flea|tick collar|frontline|heartgard|advantage flea|pet medicine/i.test(t))return'1281';
  if(/cat litter|kitty litter|tidy cats|fresh step|arm hammer litter/i.test(t))return'1281';
  if(/leash|dog collar|pet bed|pet carrier|aquarium|hamster|bird seed|puppy|kitten/i.test(t))return'1281';

  // ── BABY ─────────────────────────────────────────────────────
  if(/pampers|huggies|luvs|honest diaper|baby dry|swaddler/i.test(t))return'2984';
  if(/baby wipe|huggies wipe|pampers wipe|baby cleaning/i.test(t))return'2984';
  if(/baby formula|infant formula|similac|enfamil|gerber formula|baby food|pureed|beechnut/i.test(t))return'2984';
  if(/johnson.s baby|desitin|aquaphor baby|baby lotion|baby wash|baby shampoo|baby oil|baby powder|baby cream/i.test(t))return'2984';
  if(/diaper|infant|toddler|pacifier|teething|stroller|baby monitor|baby bottle/i.test(t))return'2984';

  // ── FOOD & BEVERAGES ─────────────────────────────────────────
  // ── HAIR CARE — antes que Food para evitar que "gum" matchee dental ─
  if(/head.shoulders|pantene|dove shampoo|tresemme|garnier shampoo|herbal essence|ogx shampoo|suave shampoo|aussie shampoo|old spice shampoo/i.test(t))return'131689';
  if(/shampoo|conditioner|hair mask|hair treatment|hair oil|argan oil|hair serum/i.test(t))return'131689';
  if(/hair color|hair dye|hair bleach|root touch|clairol|loreal hair|revlon colorsilk|dark and lovely|just for men/i.test(t))return'31085';
  if(/hair spray|hairspray|hair mousse|hair gel|pomade|hair wax|got2b|kenra|bed head/i.test(t))return'45258';
  if(/hair brush|hair comb|detangling brush|wide tooth comb|curling iron|flat iron|hair straightener|hair dryer|blow dryer/i.test(t))return'45258';

  // ── DENTAL CARE — antes que Food para que "gum" no matchee comida ──
  if(/crest toothpaste|colgate|sensodyne|arm.hammer toothpaste|hello toothpaste|charcoal toothpaste/i.test(t))return'67602';
  if(/teeth whitening|whitening strip|whitening kit|crest strip|whitening pen/i.test(t))return'67602';
  if(/oral.b toothbrush|colgate toothbrush|sonicare|electric toothbrush|toothbrush/i.test(t))return'67602';
  if(/dental floss|floss pick|flosser|interdental|waterpik|oral irrigator|gum floss|gum flosser|gum pick/i.test(t))return'67602';
  if(/listerine|scope mouthwash|act mouthwash|crest rinse|oral rinse|mouthwash|mouth rinse/i.test(t))return'67602';
  if(/toothpaste|whitening/i.test(t))return'67602';

  // ── CLEANING / HOME — antes que Skin Care ────────────────────
  if(/compression glove|compression sleeve|compression sock|arthritis glove|arthritis support|copper fit|copper compression/i.test(t))return'181';
  if(/stainless steel cleaner|stainless steel polish|stainless spray|appliance cleaner/i.test(t))return'20625';
  if(/tide|gain detergent|arm.hammer laundry|all detergent|persil|xtra detergent|laundry detergent|laundry pod/i.test(t))return'20625';
  if(/downy|bounce dryer|dryer sheet|fabric softener|snuggle/i.test(t))return'20625';
  if(/dawn dish|palmolive|dawn ultra|dish soap|dishwashing liquid|cascade dishwasher/i.test(t))return'20625';
  if(/lysol|clorox|windex|mr.clean|pine.sol|fabuloso|409|fantastik|comet cleanser|ajax cleanser/i.test(t))return'20625';
  if(/febreze|glade|air freshener|car freshener|room spray|odor eliminator/i.test(t))return'20625';
  if(/paper towel|bounty|scott towel|viva towel|brawny/i.test(t))return'20625';
  if(/toilet paper|charmin|cottonelle|scott tissue|angel soft/i.test(t))return'20625';
  if(/tissue|kleenex|puffs|facial tissue/i.test(t))return'20625';
  if(/trash bag|garbage bag|hefty|glad bag|ziploc|plastic wrap|aluminum foil|sandwich bag/i.test(t))return'20625';
  if(/sponge|scrub brush|mop|broom|dustpan|rubber glove|cleaning glove/i.test(t))return'20625';
  if(/candle|yankee candle|bath.body candle|wax melt|diffuser/i.test(t))return'20625';
  if(/laundry|bleach|disinfectant|cleaner|cleaning|polish|degreaser/i.test(t))return'20625';

  // ── FOOD & BEVERAGES ─────────────────────────────────────────
  if(/k.cup|keurig pod|nescafe|folgers|starbucks coffee|maxwell house|dunkin coffee|coffee pod/i.test(t))return'14308';
  if(/coffee|espresso|cold brew/i.test(t))return'14308';
  if(/tea bag|green tea|herbal tea|lipton|bigelow|celestial seasonings|chamomile|sleepytime/i.test(t))return'14308';
  if(/monster|red bull|5.hour energy|bang energy|celsius drink|rockstar energy|reign energy/i.test(t))return'14308';
  if(/gatorade|powerade|liquid iv|pedialyte|nuun|electrolyte|sports drink/i.test(t))return'14308';
  if(/protein bar|kind bar|clif bar|larabar|rxbar|quest bar|fiber bar|nature valley|nutri.grain/i.test(t))return'14308';
  if(/snack|popcorn|chip|pretzel|granola|trail mix|mixed nut|peanut|cashew|almond|sunflower seed/i.test(t))return'14308';
  if(/candy|chocolate|sour patch|skittles|m&m|reese|hershey|starburst|haribo/i.test(t))return'14308';
  if(/breath mint|tic tac|altoid|trident gum|orbit gum|extra gum|chewing gum/i.test(t))return'14308';
  if(/sauce|ketchup|mustard|mayo|mayonnaise|salad dressing|ranch|hot sauce|sriracha|tabasco|buffalo sauce/i.test(t))return'14308';
  if(/cereal|oatmeal|quaker oat|cream of wheat|breakfast bar|pop tart/i.test(t))return'14308';
  if(/soup|broth|ramen|instant noodle|cup noodle|bouillon/i.test(t))return'14308';
  if(/seasoning|spice|garlic powder|onion powder|cumin|paprika|chili powder|mrs.dash/i.test(t))return'14308';

  // ── CLEANING / HOME ──────────────────────────────────────────
  if(/tide|gain detergent|arm.hammer laundry|all detergent|persil|xtra detergent|laundry detergent|laundry pod/i.test(t))return'20625';
  if(/downy|bounce dryer|dryer sheet|fabric softener|snuggle/i.test(t))return'20625';
  if(/dawn dish|palmolive|dawn ultra|dish soap|dishwashing liquid|cascade dishwasher/i.test(t))return'20625';
  if(/lysol|clorox|windex|mr.clean|pine.sol|fabuloso|409|fantastik|comet cleanser|ajax cleanser/i.test(t))return'20625';
  if(/febreze|glade|air freshener|car freshener|room spray|odor eliminator/i.test(t))return'20625';
  if(/paper towel|bounty|scott towel|viva towel|brawny/i.test(t))return'20625';
  if(/toilet paper|charmin|cottonelle|scott tissue|angel soft/i.test(t))return'20625';
  if(/tissue|kleenex|puffs|facial tissue/i.test(t))return'20625';
  if(/trash bag|garbage bag|hefty|glad bag|ziploc|plastic wrap|aluminum foil|sandwich bag/i.test(t))return'20625';
  if(/sponge|scrub brush|mop|broom|dustpan|rubber glove|cleaning glove/i.test(t))return'20625';
  if(/candle|yankee candle|bath.body candle|wax melt|diffuser/i.test(t))return'20625';
  if(/detergent|laundry|bleach|disinfect|disinfectant/i.test(t))return'20625';

  // ── ELECTRONICS ──────────────────────────────────────────────
  if(/duracell|energizer|rayovac|aa battery|aaa battery|9v battery|c battery|d battery|lithium battery/i.test(t))return'48619';
  if(/usb.c cable|lightning cable|iphone cable|android charger|phone charger|wireless charger|power bank|charging pad/i.test(t))return'44867';
  if(/earphone|earbuds|airpod|galaxy bud|wireless earphone|in.ear headphone/i.test(t))return'112529';
  if(/headphone|over.ear|on.ear|noise cancelling headphone/i.test(t))return'112529';
  if(/bluetooth speaker|portable speaker|wireless speaker|jbl|bose speaker/i.test(t))return'14969';
  if(/phone case|iphone case|samsung case|screen protector|tempered glass|tablet case|ipad case/i.test(t))return'9394';
  if(/led bulb|smart bulb|light bulb|cfl bulb|light strip|led strip/i.test(t))return'48619';
  if(/battery|batteries|charger|cable|usb|bluetooth/i.test(t))return'293';

  // ── AUTOMOTIVE ───────────────────────────────────────────────
  if(/castrol|mobil.1|pennzoil|valvoline|quaker state|motor oil|engine oil|synthetic oil/i.test(t))return'6000';
  if(/car wash|turtle wax|meguiar|armor all|rain.x|windshield washer|wiper blade|bosch blade|anco blade/i.test(t))return'6000';

  // ── OFFICE / SCHOOL ──────────────────────────────────────────
  if(/ballpoint pen|gel pen|sharpie|expo marker|dry erase|highlighter pen|pencil|mechanical pencil/i.test(t))return'16486';
  if(/notebook|composition book|spiral notebook|legal pad|sticky note|post.it/i.test(t))return'16486';
  if(/stapler|staple|tape dispenser|scotch tape|binder clip|paper clip|folder|binder/i.test(t))return'16486';

  // ── SPORTING GOODS ───────────────────────────────────────────
  if(/yoga mat|resistance band|dumbbell|weight plate|jump rope|foam roller|exercise ball/i.test(t))return'888';
  if(/creatine|pre.workout|bcaa|amino acid|workout supplement|gym supplement/i.test(t))return'180959';
  if(/yoga mat bag|yoga bag|gym bag|sport bag|duffel bag|workout bag/i.test(t))return'75655';
  if(/yoga mat|yoga block|yoga strap|yoga wheel/i.test(t))return'75655';
  if(/exercise|workout|fitness equipment/i.test(t))return'75655';

  // ── BOOKS ────────────────────────────────────────────────────
  if(/board book|children.s book|kids book|baby book|picture book|coloring book|activity book|workbook|novel|cookbook|bible|prayer book|devotional book/i.test(t))return'261186';
  if(/isbn|hardcover|paperback|softcover/i.test(t))return'261186';

  // ── BBQ / OUTDOOR COOKING ────────────────────────────────────
  if(/grill tool|bbq tool|barbecue tool|spatula set|grill set|grilling set|tongs.*grill|grill.*tongs/i.test(t))return'26677';
  if(/grill|barbecue|bbq/i.test(t))return'26677';

  // ── KITCHEN / HOME ────────────────────────────────────────────
  if(/mug|cup|tumbler|travel mug|coffee mug|ceramic mug|mason jar/i.test(t))return'20695';
  if(/knife|knives|santoku|chef knife|paring knife|bread knife|steak knife/i.test(t))return'177005';
  if(/pan|pot|skillet|wok|dutch oven|casserole|bakeware|cookware/i.test(t))return'20654';
  if(/blender|mixer|toaster|air fryer|instant pot|slow cooker|pressure cooker|coffee maker|juicer/i.test(t))return'168763';
  if(/plate|bowl|dish|platter|serving|dinnerware|flatware|silverware/i.test(t))return'20650';

  // ── TOYS & GAMES ─────────────────────────────────────────────
  if(/lego/i.test(t))return'19006';
  if(/play.doh|nerf|hot wheels|matchbox|barbie|action figure|funko pop|pokemon card|trading card/i.test(t))return'261068';
  if(/board game|card game|puzzle|jigsaw|jenga|uno|monopoly|scrabble/i.test(t))return'220';
  if(/fidget|slime|kinetic sand|silly putty|squish|pop it/i.test(t))return'220';
  if(/toy|doll/i.test(t))return'220';

  // ── INSECT REPELLENT ─────────────────────────────────────────
  if(/insect repellent|bug spray|mosquito repellent|off! deep|off deep woods|deet|picaridin|repel bug|cutter bug|bug repel/i.test(t))return'1232';

  // ── FOOT CARE ────────────────────────────────────────────────
  if(/foot cream|foot lotion|heel balm|callus|corn remover|gold bond foot|dr. scholl|athlete.s foot|tinactin|lamisil/i.test(t))return'67169';

  // ── SUNCARE ──────────────────────────────────────────────────
  if(/sunscreen|sun screen|spf|sunblock|sun block|sun protection|tanning lotion|after sun|coppertone|banana boat sun|neutrogena sun/i.test(t))return'31786';

  // ── SKIN CARE ────────────────────────────────────────────────
  if(/jergens|body lotion|hand lotion|body cream|hand cream|body butter|cetaphil|aveeno|lubriderm|cocoa butter|shea butter|vaseline lotion|moisturizing lotion|daily moisturizer|ultra healing|deep conditioning|dry skin moisturizer|skin moisturizer|moisturizer lotion|original scent moisturizer/i.test(t))return'31788';
  if(/moisturizer|moisturising/i.test(t))return'31788';
  if(/face wash|facial cleanser|face scrub|face mask|facial mask|serum|toner|retinol|hyaluronic|niacinamide|eye cream|acne cream|salicylic|benzoyl|proactiv/i.test(t))return'31786';
  if(/lotion|moisturizer|body wash skin|skin care|skin cream/i.test(t))return'31786';

  // ── LIP CARE ─────────────────────────────────────────────────
  if(/lip balm|chapstick|lip butter|lip care|lip repair|blistex|carmex|aquaphor lip|eos lip/i.test(t))return'36870';

  // ── MAKEUP ───────────────────────────────────────────────────
  if(/foundation|concealer|contour|blush|bronzer|highlighter|setting powder|setting spray|bb cream|cc cream|tinted moisturizer/i.test(t))return'60496';
  if(/mascara|eyeliner|eye liner|eyeshadow|eye shadow|eyebrow pencil|brow gel|false lash/i.test(t))return'60496';
  if(/lipstick|lip gloss|lip liner|lip stain|lip color|lip tint/i.test(t))return'60496';
  if(/makeup remover|micellar water|makeup wipe|face wipe|bioderma/i.test(t))return'60496';
  if(/maybelline|l.oreal|loreal|covergirl|nyx cosmetic|elf cosmetic|revlon|rimmel|wet n wild|milani|physicians formula/i.test(t))return'60496';

  // ── NAIL CARE ────────────────────────────────────────────────
  if(/nail polish|nail color|nail lacquer|nail gel|nail remover|acetone|nail file|nail clipper|cuticle|opi nail|essie nail|sally hansen/i.test(t))return'36478';

  // ── DEODORANT ────────────────────────────────────────────────
  if(/old spice deo|old spice anti|dove deo|secret deo|degree deo|speed stick|axe deodorant|arm.hammer deo|sure deo|ban deo|mitchum|drysol/i.test(t))return'11838';
  if(/deodorant|antiperspirant/i.test(t))return'11838';

  // ── BODY WASH / SOAP ─────────────────────────────────────────
  if(/body wash|shower gel|bath gel|irish spring|dial soap|olay body|softsoap|caress|suave body|dove body wash/i.test(t))return'11840';
  if(/bar soap|liquid hand soap|hand soap|antibacterial soap|castile soap|ivory soap|safeguard soap/i.test(t))return'11840';

  // ── SHAVING ──────────────────────────────────────────────────
  if(/gillette|schick hydro|bic disposable|venus razor|daisy razor|harry.s razor/i.test(t))return'26683';
  if(/shaving cream|shaving gel|shave foam|aftershave|after shave|edge shave|barbasol/i.test(t))return'26683';
  if(/razor|shaving/i.test(t))return'26683';

  // ── FRAGRANCES ───────────────────────────────────────────────
  if(/perfume|cologne|eau de toilette|eau de parfum|body mist|body spray|fragrance|scent/i.test(t))return'180345';

  // ── EYE / EAR CARE ───────────────────────────────────────────
  if(/eye drop|eye wash|visine|clear eyes|rohto|contact solution|contact lens|renu solution|opti.free/i.test(t))return'57041';
  if(/ear drop|ear wax|earwax|ear cleaner|ear rinse|debrox|similasan ear/i.test(t))return'57041';

  // ── VITAMINS & SUPPLEMENTS ───────────────────────────────────
  if(/centrum|one.a.day|nature made|gummy vitamin|prenatal vitamin|folic acid|iron supplement|calcium supplement/i.test(t))return'180959';
  if(/vitamin c|vitamin d|vitamin b|vitamin e|vitamin k|vitamin a|vitamin multi/i.test(t))return'180959';
  if(/probiotic|prebiotic|digestive enzyme|collagen|biotin|melatonin|ashwagandha|turmeric|elderberry|echinacea/i.test(t))return'180959';
  if(/fish oil|omega.?3|krill oil|flaxseed|coq10|magnesium supplement|zinc|potassium|selenium|saw palmetto/i.test(t))return'180959';
  if(/fiber supplement|metamucil|benefiber|psyllium husk|miralax|colace|stool softener|laxative|fiber gumm/i.test(t))return'180959';
  if(/whey protein|protein powder|protein shake|mass gainer|weight gainer/i.test(t))return'180959';
  if(/vitamin|supplement|multivitamin/i.test(t))return'180959';

  // ── OTC MEDICINE ─────────────────────────────────────────────
  if(/ibuprofen|tylenol|advil|motrin|aspirin|acetaminophen|naproxen|aleve|pain relief|pain killer/i.test(t))return'67169';
  if(/nyquil|dayquil|theraflu|mucinex|robitussin|delsym|vicks dayquil|coricidin|cold flu/i.test(t))return'67169';
  if(/zyrtec|claritin|benadryl|allegra|flonase|xyzal|antihistamine|allergy relief/i.test(t))return'67169';
  if(/tums|pepcid|prilosec|nexium|maalox|rolaids|gas.x|gas relief|pepto|immodium|antacid|heartburn/i.test(t))return'67169';
  if(/unisom|zzzquil|sleep aid|diphenhydramine|sleep tablet|pm sleep/i.test(t))return'67169';
  if(/cough|sore throat|cold medicine|sinus|decongestant|sudafed|afrin nasal/i.test(t))return'67169';

  // ── FIRST AID ────────────────────────────────────────────────
  if(/band.aid|bandage|adhesive bandage|gauze|medical tape|wound care|neosporin|bacitracin|triple antibiotic/i.test(t))return'51227';
  if(/hydrogen peroxide|rubbing alcohol|isopropyl alcohol|antiseptic|betadine/i.test(t))return'51227';
  if(/thermometer|blood pressure monitor|glucometer|glucose meter|pulse oximeter|heating pad|ice pack|hot pack/i.test(t))return'51227';
  if(/first aid|bandage|wound/i.test(t))return'51227';

  // ── FEMININE CARE ────────────────────────────────────────────
  if(/tampon|always pad|tampax|playtex|kotex|stayfree|menstrual cup|period pad|feminine hygiene/i.test(t))return'67167';

  // ── INCONTINENCE ─────────────────────────────────────────────
  if(/depend|poise|tena|adult diaper|incontinence pad|bladder leak/i.test(t))return'105070';

  // ── FACE MOISTURIZERS / CREAMS ───────────────────────────────
  if(/olay|olay regenerist|face cream|facial cream|face moisturizer|face lotion|facial moisturizer|anti-aging cream|anti aging|wrinkle cream|retinol cream|night cream|day cream/i.test(t))return'32062';

  // ── DEFAULT — Skin Care (categoría leaf segura) ───────────────
  return'31786';
}
const catNm=id=>({'31786':'Skin Care','60496':'Makeup','180959':'Vitamins & Supplements','67602':'Dental Care','36870':'Lip Care','11854':'Hair Care','131689':'Shampoo & Conditioner','32062':'Face Moisturizers','75655':'Yoga & Pilates','31085':'Hair Color','45258':'Hair Styling','11838':'Deodorant','11840':'Body Wash','26683':'Shaving','180345':'Fragrances','67169':'OTC Medicine','51227':'First Aid','67167':'Feminine Care','105070':'Incontinence','36478':'Nail Care','57041':'Eye & Ear Care','48619':'Batteries','44867':'Phone Cables','112529':'Headphones','14969':'Speakers','9394':'Phone Cases','293':'Consumer Electronics','20625':'Home & Garden','14308':'Food & Beverages','1281':'Pet Supplies','2984':'Baby','6000':'Automotive','888':'Sporting Goods','220':'Toys & Hobbies','19006':'LEGO Building Sets','261186':'Books','20695':'Mugs','177005':'Kitchen Knives','20654':'Cookware','20650':'Dinnerware','261068':'Toys','31788':'Body Lotions','168763':'Small Kitchen Appliances','16486':'Office Supplies','19264':'Braces & Supports','181':'Sporting Goods','1232':'Insect Repellent','261844':'Insect Repellent','26677':'BBQ & Grill Tools','20725':'Outdoor Cooking'}[id]||'Skin Care');

// Settings
function saveKey(){const v=$('keyIn').value.trim();if(!v)return;localStorage.setItem('savvy_api_key',v);renderSt();toast('✅ API Key saved');setTimeout(closeCfg,700);}
function saveEbay(){const v=$('ebayIn').value.trim();if(!v)return;localStorage.setItem('savvy_ebay_id',v);renderSt();toast('✅ eBay ID saved');setTimeout(closeCfg,700);}
function renderSt(){
  const k=(localStorage.getItem('savvy_api_key') || DEFAULT_CLAUDE_KEY),e=localStorage.getItem('savvy_ebay_id');
  $('stSt').innerHTML=`<div class="str"><div class="sd ${k?'ok':'no'}"></div><span>Claude API: ${k?'✓ Configurado':'✗ No configurado'}</span></div><div class="str"><div class="sd ${e?'ok':'no'}"></div><span>eBay App ID: ${e?'✓ Configurado':'✗ No configurado'}</span></div>`;
  if(k)$('keyIn').placeholder='••••••••••••'+k.slice(-6);
  if(e)$('ebayIn').value=e;
}
// Settings PIN Protection (1977)
let settingsPinAttempts = 0;
let settingsPinBlockedUntil = 0;
const SETTINGS_PIN = '1977';
const PIN_MAX_ATTEMPTS = 3;
const PIN_BLOCK_DURATION = 5 * 60 * 1000; // 5 minutos

function openCfgWithPin() {
  const now = Date.now();
  
  // Verificar si está bloqueado
  if (settingsPinBlockedUntil > now) {
    const remainingSeconds = Math.ceil((settingsPinBlockedUntil - now) / 1000);
    toast(`🔒 Settings bloqueados. Intenta en ${remainingSeconds}s`);
    return;
  }
  
  // Resetear intentos si pasó el tiempo de bloqueo
  if (settingsPinBlockedUntil <= now && settingsPinBlockedUntil > 0) {
    settingsPinAttempts = 0;
  }
  
  // Mostrar modal para PIN
  showPinModal();
}

function showPinModal() {
  const pinOverlay = document.createElement('div');
  pinOverlay.id = 'pin-overlay';
  pinOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.95);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 99999;
  `;
  
  const pinBox = document.createElement('div');
  pinBox.style.cssText = `
    background: #1a1a1a;
    border: 2px solid #ff6b35;
    border-radius: 12px;
    padding: 24px;
    text-align: center;
    max-width: 320px;
    font-family: inherit;
  `;
  
  let pinInput = '';
  
  pinBox.innerHTML = `
    <div style="color: #fff; font-size: 18px; font-weight: bold; margin-bottom: 16px;">
      🔐 Settings Password
    </div>
    <div style="color: #aaa; font-size: 13px; margin-bottom: 20px;">
      Enter PIN to access Settings
    </div>
    <input 
      type="password" 
      id="pin-input" 
      placeholder="••••" 
      inputmode="numeric"
      maxlength="4"
      style="
        width: 100%;
        padding: 12px;
        font-size: 18px;
        text-align: center;
        background: #2a2a2a;
        color: #ff6b35;
        border: 1px solid #ff6b35;
        border-radius: 6px;
        margin-bottom: 16px;
        letter-spacing: 4px;
      "
    >
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px;">
      ${[1,2,3,4,5,6,7,8,9,'←',0,'✓'].map(n => {
        if (n === '←') {
          return `<button style="
            padding: 12px;
            background: #ff6b35;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            cursor: pointer;
            font-weight: bold;
          " onclick="document.getElementById('pin-input').value = document.getElementById('pin-input').value.slice(0, -1); document.getElementById('pin-input').focus();">←</button>`;
        } else if (n === '✓') {
          return `<button style="
            padding: 12px;
            background: #4caf50;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            cursor: pointer;
            font-weight: bold;
          " onclick="validateSettingsPin();">✓</button>`;
        } else {
          return `<button style="
            padding: 12px;
            background: #333;
            color: #fff;
            border: 1px solid #555;
            border-radius: 6px;
            font-size: 16px;
            cursor: pointer;
          " onclick="document.getElementById('pin-input').value += '${n}'; document.getElementById('pin-input').focus();">${n}</button>`;
        }
      }).join('')}
    </div>
    <div style="color: #888; font-size: 12px;">
      Attemps: ${settingsPinAttempts}/${PIN_MAX_ATTEMPTS}
    </div>
  `;
  
  pinOverlay.appendChild(pinBox);
  document.body.appendChild(pinOverlay);
  
  setTimeout(() => {
    const inp = document.getElementById('pin-input');
    if (inp) inp.focus();
  }, 100);
  
  // Enter key
  document.getElementById('pin-input').addEventListener('keypress', e => {
    if (e.key === 'Enter') validateSettingsPin();
  });
}

function validateSettingsPin() {
  const pinInput = document.getElementById('pin-input')?.value || '';
  const overlay = document.getElementById('pin-overlay');
  
  if (pinInput === SETTINGS_PIN) {
    // PIN correcto
    settingsPinAttempts = 0;
    settingsPinBlockedUntil = 0;
    if (overlay) overlay.remove();
    toast('✅ PIN correcto');
    setTimeout(() => {
      renderSt();
      $('cfgOv').classList.add('on');
    }, 300);
  } else {
    // PIN incorrecto
    settingsPinAttempts++;
    
    if (settingsPinAttempts >= PIN_MAX_ATTEMPTS) {
      // Bloquear por 5 minutos
      settingsPinBlockedUntil = Date.now() + PIN_BLOCK_DURATION;
      if (overlay) overlay.remove();
      toast('🔒 Bloqueado por 5 minutos');
    } else {
      // Mostrar error
      toast(`❌ PIN incorrecto (${settingsPinAttempts}/${PIN_MAX_ATTEMPTS})`);
      const inp = document.getElementById('pin-input');
      if (inp) {
        inp.value = '';
        inp.style.borderColor = '#ff0000';
        setTimeout(() => {
          inp.style.borderColor = '#ff6b35';
        }, 500);
      }
    }
  }
}

function openCfg(){renderSt();$('cfgOv').classList.add('on');}
function closeCfg(){$('cfgOv').classList.remove('on');}

// ── Savvy Universal Scanner (html5-qrcode) ───────────────────
var _savvyScanners = {};

const SAVVY_SCAN_CONFIG = {
  fps: 20,
  qrbox: { width: 280, height: 120 },  // cajita horizontal para barcodes
  aspectRatio: 1.7,
  disableFlip: false,
  experimentalFeatures: {
    useBarCodeDetectorIfSupported: true
  },
  formatsToSupport: [
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.QR_CODE,
    Html5QrcodeSupportedFormats.DATA_MATRIX,
  ]
};

async function savvyStartScan(videoElementId, onResult) {
  console.log('📷 savvyStartScan starting for element:', videoElementId);
  await savvyStopScan(videoElementId);
  
  const videoEl = document.getElementById(videoElementId);
  if(!videoEl){
    console.error('❌ Video element not found:', videoElementId);
    toast('❌ Camera container not found');
    return;
  }
  
  console.log('✅ Video element found:', videoEl);
  
  var scanner = new Html5Qrcode(videoElementId, {
    formatsToSupport: SAVVY_SCAN_CONFIG.formatsToSupport,
    experimentalFeatures: SAVVY_SCAN_CONFIG.experimentalFeatures,
    verbose: false
  });
  _savvyScanners[videoElementId] = scanner;
  try {
    console.log('📱 Requesting camera access...');
    await scanner.start(
      { facingMode: 'environment' },
      {
        fps: SAVVY_SCAN_CONFIG.fps,
        qrbox: SAVVY_SCAN_CONFIG.qrbox,
        aspectRatio: SAVVY_SCAN_CONFIG.aspectRatio,
        disableFlip: SAVVY_SCAN_CONFIG.disableFlip,
      },
      (decoded) => {
        console.log('✅ QR Code found:', decoded);
        savvyStopScan(videoElementId);
        onResult(decoded);
      },
      () => {}
    );
    console.log('✅ Camera started successfully');
  } catch(e) {
    console.error('❌ Camera error:', e.message);
    toast('❌ No camera access: ' + e.message);
    delete _savvyScanners[videoElementId];
  }
}

async function savvyStopScan(videoElementId) {
  if (_savvyScanners[videoElementId]) {
    try { await _savvyScanners[videoElementId].stop(); } catch(e) {}
    delete _savvyScanners[videoElementId];
  }
}

// Camera — main scanner
async function startCam(){
  screen('cam');
  savvyStopScan('qr-video');
  savvyStartScan('qr-video', async txt => {
    analyze(txt.replace(/\D/g,''));
  });
}

// Sync wrapper for HTML onclick handler
function startCamSync(){
  console.log('📷 startCamSync called');
  try {
    startCam().catch(e => console.error('startCam error:', e));
  } catch(e) {
    console.error('Error calling startCam:', e);
    toast('⚠️ Error starting camera');
  }
}
async function stopCam(){
  savvyStopScan('qr-video');
  screen('idle');
}


// ── BUNDLE IMAGE GENERATOR — Professional eBay/Amazon style ──

// ── BACKGROUND REMOVAL (sin API) ────────────────────────────
// Muestrea el borde completo para detectar el color de fondo,
// luego hace flood-fill + segunda pasada para limpiar residuos.
// Mejor resultado con fondo de color (cartón, gris) que con blanco.
async function removeBgCanvas(dataUrl) {
  return new Promise(function(resolve) {
    var img = new Image();
    img.onload = function() {
      var W=img.width, H=img.height;
      var c=document.createElement('canvas'); c.width=W; c.height=H;
      var ctx=c.getContext('2d'); ctx.drawImage(img,0,0);
      var id=ctx.getImageData(0,0,W,H), px=id.data;

      function pix(x,y){var i=(y*W+x)*4;return[px[i],px[i+1],px[i+2]];}
      function dist(a,b){
        return Math.sqrt((a[0]-b[0])*(a[0]-b[0])+(a[1]-b[1])*(a[1]-b[1])+(a[2]-b[2])*(a[2]-b[2]));
      }

      // ── 1. Detectar color de fondo desde TODO el borde (15px) ───
      var edge=[], STRIP=15;
      for(var x=0;x<W;x++){
        for(var y=0;y<STRIP;y++) edge.push(pix(x,y));
        for(var y=H-STRIP;y<H;y++) edge.push(pix(x,y));
      }
      for(var y=STRIP;y<H-STRIP;y++){
        for(var x=0;x<STRIP;x++) edge.push(pix(x,y));
        for(var x=W-STRIP;x<W;x++) edge.push(pix(x,y));
      }
      // Mediana de brightness para evitar outliers (sombras, producto en borde)
      edge.sort(function(a,b){return (a[0]+a[1]+a[2])-(b[0]+b[1]+b[2]);});
      var bg=edge[Math.floor(edge.length/2)];
      var bgBright=(bg[0]+bg[1]+bg[2])/3;

      // Tolerancia basada en el fondo
      // Blanco puro → conservador; cartón/gris → agresivo
      var TOL = bgBright>230 ? 36 : bgBright>200 ? 58 : bgBright>150 ? 72 : 85;

      // ── 2. Flood-fill BFS desde todos los bordes ─────────────────
      var vis=new Uint8Array(W*H);
      var q=new Int32Array(W*H*2); var qh=0,qt=0;
      function enq(x,y){if(x>=0&&x<W&&y>=0&&y<H&&!vis[y*W+x]){vis[y*W+x]=1;q[qt++]=x;q[qt++]=y;}}
      for(var x=0;x<W;x++){enq(x,0);enq(x,H-1);}
      for(var y=1;y<H-1;y++){enq(0,y);enq(W-1,y);}

      while(qh<qt){
        var cx=q[qh++],cy=q[qh++];
        if(dist(pix(cx,cy),bg)<TOL){
          px[(cy*W+cx)*4+3]=0;
          enq(cx+1,cy);enq(cx-1,cy);enq(cx,cy+1);enq(cx,cy-1);
        }
      }

      // ── 3. Segunda pasada: eliminar "islas" de fondo no conectadas ─
      // Reconstruir máscara de pixels eliminados
      var removed=new Uint8Array(W*H);
      for(var i=0;i<W*H;i++) if(px[i*4+3]===0) removed[i]=1;

      // Eliminar pixels adyacentes a borde removido que también son similares al fondo
      for(var pass=0;pass<2;pass++){
        for(var y=1;y<H-1;y++) for(var x=1;x<W-1;x++){
          if(removed[y*W+x]) continue;
          var adj=removed[(y-1)*W+x]+removed[(y+1)*W+x]+removed[y*W+(x-1)]+removed[y*W+(x+1)];
          if(adj>=1 && dist(pix(x,y),bg)<TOL*1.3){
            px[(y*W+x)*4+3]=0; removed[y*W+x]=1;
          }
        }
      }

      // ── 4. Erosionar borde duro 1px ───────────────────────────────
      for(var y=1;y<H-1;y++) for(var x=1;x<W-1;x++){
        if(removed[y*W+x]) continue;
        var hard=removed[(y-1)*W+x]+removed[(y+1)*W+x]+removed[y*W+(x-1)]+removed[y*W+(x+1)];
        if(hard>=3) { px[(y*W+x)*4+3]=0; }
      }

      ctx.putImageData(id,0,0);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror=function(){resolve(dataUrl);};
    img.src=dataUrl;
  });
}

// ── RECORTAR AL PRODUCTO (sin espacio vacío) ───────────────────
async function cropToProduct(dataUrl) {
  return new Promise(function(resolve) {
    var img = new Image();
    img.onload = function() {
      var W=img.width, H=img.height;
      var c=document.createElement('canvas'); c.width=W; c.height=H;
      var ctx=c.getContext('2d'); ctx.drawImage(img,0,0);
      var d=ctx.getImageData(0,0,W,H).data;
      var x0=W,x1=0,y0=H,y1=0;
      for (var y=0;y<H;y++) for (var x=0;x<W;x++) {
        var i=(y*W+x)*4;
        // alpha>180: solo pixels sólidos del producto, ignora bordes suaves de PhotoRoom
        var notTransp=d[i+3]>180;
        var notWhite=d[i]<240||d[i+1]<240||d[i+2]<240;
        if (notTransp && notWhite) {
          if(x<x0)x0=x; if(x>x1)x1=x;
          if(y<y0)y0=y; if(y>y1)y1=y;
        }
      }
      if(x0>=x1||y0>=y1){resolve(dataUrl);return;}
      var M=10;
      x0=Math.max(0,x0-M); y0=Math.max(0,y0-M);
      x1=Math.min(W,x1+M); y1=Math.min(H,y1+M);
      var oc=document.createElement('canvas');
      oc.width=x1-x0; oc.height=y1-y0;
      oc.getContext('2d').drawImage(img,x0,y0,oc.width,oc.height,0,0,oc.width,oc.height);
      resolve(oc.toDataURL('image/png'));
    };
    img.onerror=function(){resolve(dataUrl);};
    img.src=dataUrl;
  });
}

// ── BADGE CIRCULAR ─────────────────────────────────────────────
function drawPackBadge(ctx, n, SZ) {
  var R=Math.round(SZ*0.075);
  var cx=SZ-R-Math.round(SZ*0.025), cy=R+Math.round(SZ*0.025);
  ctx.save();
  ctx.shadowColor='rgba(0,0,0,0.28)'; ctx.shadowBlur=16;
  ctx.fillStyle='rgba(173,216,240,0.97)';
  ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.fill();
  ctx.restore();
  ctx.strokeStyle='rgba(20,100,160,0.5)'; ctx.lineWidth=Math.round(SZ*0.003);
  ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.stroke();
  var big=Math.round(R*0.68), small=Math.round(R*0.30);
  ctx.fillStyle='#0A3566'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.font='bold '+big+'px -apple-system,Arial,sans-serif';
  ctx.fillText(String(n),cx,cy-R*0.15);
  ctx.font='bold '+small+'px -apple-system,Arial,sans-serif';
  ctx.fillText('PACK',cx,cy+R*0.48);
  ctx.textAlign='start';
}



// Detectar color promedio del fondo muestreando las 4 esquinas (franja 10%)
async function detectBgColor(dataUrl) {
  return new Promise(function(resolve) {
    var img = new Image();
    img.onload = function() {
      var W=img.width, H=img.height;
      var c=document.createElement('canvas'); c.width=W; c.height=H;
      var ctx=c.getContext('2d'); ctx.drawImage(img,0,0);
      var px=ctx.getImageData(0,0,W,H).data;
      var rs=0,gs=0,bs=0,n=0;
      var strip=Math.round(Math.min(W,H)*0.10);
      [[0,0],[W-strip,0],[0,H-strip],[W-strip,H-strip]].forEach(function(p){
        for(var dy=0;dy<strip;dy++) for(var dx=0;dx<strip;dx++){
          var i=((p[1]+dy)*W+(p[0]+dx))*4;
          rs+=px[i]; gs+=px[i+1]; bs+=px[i+2]; n++;
        }
      });
      resolve([Math.round(rs/n), Math.round(gs/n), Math.round(bs/n)]);
    };
    img.onerror=function(){resolve([180,140,90]);};
    img.src=dataUrl;
  });
}

// Limpiar PNG transparente de PhotoRoom:
// 1. Quitar borde 8%
// 2. Eliminar píxeles que coinciden con el color del fondo original (cartón, etc.)
// 3. Componentes conectados → conservar solo el componente más grande
async function cleanTransparentEdges(dataUrl, bgColor) {
  return new Promise(function(resolve) {
    var img = new Image();
    img.onload = function() {
      var W=img.width, H=img.height, N=W*H;
      var c=document.createElement('canvas'); c.width=W; c.height=H;
      var ctx=c.getContext('2d'); ctx.drawImage(img,0,0);
      var id=ctx.getImageData(0,0,W,H), px=id.data;

      // Paso 1: quitar borde del 8% (artefactos de esquina)
      var mX=Math.round(W*0.08), mY=Math.round(H*0.08);
      for(var y=0;y<H;y++) for(var x=0;x<W;x++){
        if(x<mX||x>=W-mX||y<mY||y>=H-mY) px[(y*W+x)*4+3]=0;
      }

      // Paso 1b: eliminar píxeles que coinciden con el color del fondo original
      // Esto limpia el cartón conectado a la base del producto
      if(bgColor && bgColor.length===3){
        var br=bgColor[0], bg2=bgColor[1], bb=bgColor[2];
        var TOL=55; // tolerancia en distancia RGB
        for(var y=0;y<H;y++) for(var x=0;x<W;x++){
          var pi=(y*W+x)*4;
          if(px[pi+3]<10) continue; // ya transparente
          var dr=px[pi]-br, dg=px[pi+1]-bg2, db2=px[pi+2]-bb;
          var dist=Math.sqrt(dr*dr+dg*dg+db2*db2);
          if(dist<TOL) px[pi+3]=0; // coincide con fondo → transparente
        }
      }

      // Paso 2: componentes conectados (BFS) sobre pixeles con alpha > 40
      var vis=new Uint8Array(N);
      var q=new Int32Array(N);
      var components=[]; // cada componente = array de indices planos

      for(var sy=0;sy<H;sy++) for(var sx=0;sx<W;sx++){
        var si=sy*W+sx;
        if(vis[si]||px[si*4+3]<=40) continue;
        // BFS
        var comp=[], qh=0, qt=0;
        q[qt++]=si; vis[si]=1;
        while(qh<qt){
          var ci=q[qh++];
          comp.push(ci);
          var cy=Math.floor(ci/W), cx=ci-cy*W;
          // 4-vecinos
          var ns=[ci-1,ci+1,ci-W,ci+W];
          for(var k=0;k<4;k++){
            var ni=ns[k];
            if(ni<0||ni>=N||vis[ni]) continue;
            // Validar que no cruza bordes horizontales
            if(k===0&&cx===0) continue;
            if(k===1&&cx===W-1) continue;
            if(px[ni*4+3]>40){vis[ni]=1; q[qt++]=ni;}
          }
        }
        components.push(comp);
      }

      // Ordenar por tamaño — el más grande = el producto real
      components.sort(function(a,b){return b.length-a.length;});

      // Eliminar todos los componentes pequeños (islas de cartón)
      // Umbral: conservar solo componentes que sean >5% del más grande
      var bigSize = components.length>0 ? components[0].length : 0;
      for(var ci2=1;ci2<components.length;ci2++){
        if(components[ci2].length < bigSize*0.05){
          for(var pi=0;pi<components[ci2].length;pi++){
            px[components[ci2][pi]*4+3]=0;
          }
        }
      }

      ctx.putImageData(id,0,0);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror=function(){resolve(dataUrl);};
    img.src=dataUrl;
  });
}


// Convertir PNG transparente a JPEG con fondo blanco

// Eliminar píxeles del fondo que quedaron en la imagen con fondo blanco
// Aplica DESPUÉS de pngToWhiteJpeg para limpiar artefactos residuales
async function removeResidualBg(dataUrl, bgColor) {
  if (!bgColor || bgColor.length < 3) return dataUrl;
  return new Promise(function(resolve) {
    var img = new Image();
    img.onload = function() {
      var W=img.width, H=img.height;
      var c=document.createElement('canvas'); c.width=W; c.height=H;
      var ctx=c.getContext('2d'); ctx.drawImage(img,0,0);
      var id=ctx.getImageData(0,0,W,H), px=id.data;
      var br=bgColor[0], bg2=bgColor[1], bb=bgColor[2];
      // Tolerancia alta — necesaria para capturar bordes sucios
      var TOL=80;
      // Aún más agresivo en el borde exterior del 30% de la imagen
      for(var y=0;y<H;y++) for(var x=0;x<W;x++){
        var i=(y*W+x)*4;
        var r=px[i],g=px[i+1],b=px[i+2];
        var dist=Math.sqrt((r-br)*(r-br)+(g-bg2)*(g-bg2)+(b-bb)*(b-bb));
        var inBorder=(x<W*0.20||x>W*0.80||y<H*0.20||y>H*0.80);
        var tol=inBorder?TOL:TOL*0.65; // más agresivo en bordes
        if(dist<tol){ px[i]=255; px[i+1]=255; px[i+2]=255; } // → blanco
      }
      ctx.putImageData(id,0,0);
      resolve(c.toDataURL('image/jpeg',0.93));
    };
    img.onerror=function(){resolve(dataUrl);};
    img.src=dataUrl;
  });
}

async function pngToWhiteJpeg(pngDataUrl) {
  return new Promise(function(resolve) {
    var img = new Image();
    img.onload = function() {
      var c=document.createElement('canvas'); c.width=img.width; c.height=img.height;
      var ctx=c.getContext('2d');
      ctx.fillStyle='#FFFFFF'; ctx.fillRect(0,0,c.width,c.height);
      ctx.drawImage(img,0,0);
      resolve(c.toDataURL('image/jpeg',0.92));
    };
    img.onerror=function(){resolve(pngDataUrl);};
    img.src=pngDataUrl;
  });
}

// ── GENERAR BUNDLE IMAGE ─────────────────────────────────────────
// Input: imagen con FONDO BLANCO (de PhotoRoom v2) sobre canvas blanco
// Layout: grid limpio sin overlap — profesional y sin artefactos
async function generateBundleImage(productDataUrl, packSize) {
  var SZ = 1200;
  var img = new Image(); img.src = productDataUrl;
  await new Promise(function(r){img.onload=r;img.onerror=r;});

  var canvas=document.createElement('canvas');
  canvas.width=SZ; canvas.height=SZ;
  var ctx=canvas.getContext('2d');
  ctx.fillStyle='#FFFFFF'; ctx.fillRect(0,0,SZ,SZ);

  // Grid exacto por pack size (suma = packSize)
  // [cols, rows] donde cols*rows >= packSize
  var GRID = {
    1:[1,1], 2:[2,1], 3:[3,1], 4:[2,2],
    5:[3,2], 6:[3,2], 7:[4,2], 8:[4,2],
    9:[3,3], 10:[5,2], 11:[4,3], 12:[4,3]
  };
  var g = GRID[packSize] || [Math.ceil(Math.sqrt(packSize)), Math.ceil(packSize/Math.ceil(Math.sqrt(packSize)))];
  var cols=g[0], rows=g[1];

  var GAP = Math.round(SZ*0.018); // 2.2% de separación
  var PAD = Math.round(SZ*0.045); // 4.5% padding exterior

  var cellW = Math.floor((SZ - PAD*2 - GAP*(cols-1)) / cols);
  var cellH = Math.floor((SZ - PAD*2 - GAP*(rows-1)) / rows);
  var cell  = Math.min(cellW, cellH); // celda cuadrada

  // Centrar la grilla
  var gridW = cols*cell + (cols-1)*GAP;
  var gridH = rows*cell + (rows-1)*GAP;
  var ox = Math.round((SZ-gridW)/2);
  var oy = Math.round((SZ-gridH)/2);

  for(var i=0; i<packSize; i++){
    var col=i%cols, row=Math.floor(i/cols);
    var x=ox+col*(cell+GAP);
    var y=oy+row*(cell+GAP);
    ctx.drawImage(img, x, y, cell, cell);
  }

  drawPackBadge(ctx, packSize, SZ);
  return canvas.toDataURL('image/jpeg', 0.93);
}

function downloadBundleImg(src) {
  var a = document.createElement('a');
  a.href = src;
  a.download = 'bundle-' + ((window.cur && cur.upc) || 'product') + '.jpg';
  a.click();
}

// ── BUNDLE PHOTO CAPTURE → TRANSPARENT → COMPOSE ─────────────
// Flujo: foto → PhotoRoom/Remove.bg → PNG transparente limpio → bundle
async function openBundlePhoto() {
  var input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*'; input.capture = true;
  input.onchange = async function(e) {
    var file = e.target.files[0]; if(!file) return;
    var genDiv = document.getElementById('bundle-generating');
    var preDiv = document.getElementById('bundle-preview');
    if(genDiv){genDiv.style.display='block'; genDiv.textContent='📷 Comprimiendo...';}
    if(preDiv) preDiv.style.display='none';

    var dataUrl = await clCompressImage(file, 1600, 1.0);

    // Subir a ImgBB
    var imgbbKey = localStorage.getItem('cl_imgbb_key') || DEFAULT_IMGBB_KEY;
    var photoUrl = dataUrl;
    if (imgbbKey) {
      if(genDiv) genDiv.textContent='📤 Subiendo a ImgBB...';
      var up = await clUploadPhotoToImgBB(dataUrl, imgbbKey);
      if (up) photoUrl = up;
    }

    // Subir imagen JPG real a Google Drive
    var driveUrl = localStorage.getItem('cl_drive_url') || 'https://script.google.com/macros/s/AKfycbyVgEEID8dqZMymlqQMpjO7fLBMYkfj0mmcWk2ImudTy9evKGlOi4oHUc9vhcdmpFeDDQ/exec';
    if (driveUrl) {
      try {
        if(genDiv) genDiv.textContent='☁️ Subiendo foto a Google Drive...';
        var sku = (window.cur && cur.upc) ? cur.upc : 'foto';
        var fname = sku + '-' + Date.now() + '.jpg';
        // Enviar imagen base64 directamente al Apps Script
        var b64 = dataUrl.split(',')[1];
        var res = await fetch(driveUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: fname, csvData: b64, isImage: true })
        });
        toast('✅ Foto .jpg subida a Drive — carpeta eBay Listings');
        if(genDiv) genDiv.textContent='✅ Foto en Drive';
      } catch(e2) {
        toast('⚠️ Drive no disponible');
      }
    }

    if(window.cur) { cur._rawPhoto = photoUrl; cur._imgUrl = photoUrl; }

    if(genDiv) genDiv.style.display='none';
    if(preDiv) {
      preDiv.style.display='block';
      preDiv.innerHTML='<img src="'+dataUrl+'" style="width:100%;border-radius:8px;opacity:0.7">'
        +'<div style="text-align:center;font-size:12px;color:var(--mu);margin-top:6px">📁 Foto en Drive — edítala y usa el botón verde ↑</div>';
    }
  };
  input.click();
}

// Subir foto ya lista (bundle hecho manualmente)
async function openReadyPhoto() {
  var input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*';
  input.onchange = async function(e) {
    var file = e.target.files[0]; if(!file) return;
    var genDiv = document.getElementById('bundle-generating');
    var preDiv = document.getElementById('bundle-preview');
    if(genDiv){genDiv.style.display='block'; genDiv.textContent='📤 Subiendo foto lista...';}
    if(preDiv) preDiv.style.display='none';

    var dataUrl = await clCompressImage(file, 1600, 1.0);

    // Subir a ImgBB
    var imgbbKey = localStorage.getItem('cl_imgbb_key') || DEFAULT_IMGBB_KEY;
    var finalUrl = dataUrl;
    if (imgbbKey) {
      if(genDiv) genDiv.textContent='📤 Subiendo a ImgBB...';
      var uploaded = await clUploadPhotoToImgBB(dataUrl, imgbbKey);
      if (uploaded) {
        finalUrl = uploaded;
        toast('✅ Foto lista — ready for eBay');
      }
    }

    if(window.cur) {
      cur._bundleImg = finalUrl;
      cur._imgUrl = finalUrl;
      cur._singleProductImg = dataUrl;
    }
    _lastBundleUrl = finalUrl;

    if(genDiv) genDiv.style.display='none';
    if(preDiv) {
      preDiv.style.display='block';
      preDiv.innerHTML='<div style="position:relative">'
        +'<img src="'+dataUrl+'" style="width:100%;border-radius:8px">'
        +'<div style="position:absolute;bottom:8px;left:0;right:0;text-align:center">'
        +'<span style="background:rgba(0,230,118,.95);color:#000;padding:5px 14px;border-radius:20px;font-size:12px;font-weight:800">✅ Photo uploaded — ready for eBay</span>'
        +'</div></div>';
    }
  };
  input.click();
}



// ── PRODUCT LOOKUP — eBay Catalog + Browse + Finding ──────────
// Single unified call replacing UPCitemdb + separate eBay calls
async function lookupProduct(upc) {
  // Try eBay twice before giving up
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      stat(attempt === 1 ? 'Searching eBay...' : 'Retrying eBay search...');
      const ctrl = new AbortController();
      const timer = setTimeout(()=>ctrl.abort(), 15000);
      const r = await fetch(WORKER + '/?upc=' + upc, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      // If eBay found pricing data, return immediately
      if (d.found || d.prices?.low || d.pricing?.sold?.count) return d;
      // If no pricing but product found, return on first attempt
      if (d.product?.name && attempt === 1) return d;
    } catch(e) {
      if (attempt === 2) console.warn('eBay lookup failed both attempts:', e.message);
      else await new Promise(r => setTimeout(r, 1000)); // wait 1s before retry
    }
  }
  return { found: false, product: null, pricing: {}, topTitles: [], prices: null };
}

// Kept as fallback if eBay Catalog finds nothing
async function lookupUPCitemdb(upc) {
  let p = { name:'', brand:'', found:false };
  try {
    const r = await fetch('https://api.upcitemdb.com/prod/trial/lookup?upc=' + upc);
    const d = await r.json();
    if (d.items && d.items[0]) {
      const it = d.items[0];
      p.name = it.title || it.description || '';
      p.brand = it.brand || '';
      p.found = !!p.name;
    }
  } catch(e) {}
  if (!p.found) {
    try {
      const r = await fetch('https://world.openfoodfacts.org/api/v2/product/' + upc + '.json');
      const d = await r.json();
      if (d.status === 1 && d.product) {
        const pr = d.product;
        p.name = pr.product_name_en || pr.product_name || '';
        p.brand = pr.brands || '';
        p.found = !!p.name;
      }
    } catch(e) {}
  }
  return p;
}

// Price calculation
function calcBundlePrice(ebay,packs){
  packs=packs||2;
  // Priority: sold avg (real) > sold low > active low > active avg
  const soldAvg = ebay?.pricing?.sold?.avg || 0;
  const soldLow = ebay?.pricing?.sold?.low || 0;
  const actLow  = ebay?.prices?.low || 0;
  const actAvg  = ebay?.prices?.avg || 0;
  const base = soldAvg||soldLow||actLow||actAvg||0;
  if(base>0) return (base*packs*0.88).toFixed(2); // 12% below market for fast sales
  return(packs===2?'14.99':packs===3?'19.99':packs===4?'24.99':'29.99');
}

// Pack optimizer


// ── DATE PICKER — Month + Year chips ─────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const CUR_YEAR = new Date().getFullYear();
const YEARS = Array.from({length:12}, function(_,i){return CUR_YEAR-1+i;});
var _dateState = { monthIdx: new Date().getMonth(), yearIdx: 1 };
var _dateSelected = false; // true solo cuando usuario toca un chip


function toggleExpDate() {
  var picker = document.getElementById('exp-date-picker');
  var btn    = document.getElementById('exp-toggle-btn');
  if (!picker) return;
  var showing = picker.style.display !== 'none';
  if (showing) {
    clearExpDate();
  } else {
    picker.style.display = 'block';
    btn.style.background = 'rgba(255,107,0,.15)';
    btn.style.borderColor = 'var(--ac)';
    btn.style.color = 'var(--ac)';
    initDateWheel(); // render chips now
  }
}

function clearExpDate() {
  var picker = document.getElementById('exp-date-picker');
  var btn    = document.getElementById('exp-toggle-btn');
  if (picker) picker.style.display = 'none';
  if (btn) {
    btn.style.background = 'var(--sf2)';
    btn.style.borderColor = 'var(--bd)';
    btn.style.color = 'var(--mu)';
  }
  _dateSelected = false;
  if (window._packState) window._packState.expDate = '';
  if (window.cur) { cur._expDate = ''; cur._selectedTitle = ''; }
  var el = document.getElementById('date-result-display');
  if (el) el.innerHTML = '';
  // Regenerar título sin fecha
  rebuildAndApplyTitle(window._packState ? window._packState.curPack : 2);
}

function initDateWheel() {
  renderDateChips();
  updateDateDisplay();
}

function renderDateChips() {
  var mWrap = document.getElementById('month-chips');
  var yWrap = document.getElementById('year-chips');
  if (!mWrap || !yWrap) return;

  mWrap.innerHTML = MONTHS.map(function(m, i) {
    return '<button class="date-chip' + (i===_dateState.monthIdx?' sel':'') +
      '" onclick="pickMonth(' + i + ')">' + m + '</button>';
  }).join('');

  yWrap.innerHTML = YEARS.map(function(y, i) {
    return '<button class="date-chip' + (i===_dateState.yearIdx?' sel':'') +
      '" onclick="pickYear(' + i + ')">' + y + '</button>';
  }).join('');
}

function pickMonth(i) {
  _dateSelected = true;
  _dateState.monthIdx = i;
  document.querySelectorAll('#month-chips .date-chip').forEach(function(el,j){
    el.classList.toggle('sel', j===i);
  });
  updateDateDisplay();
  if (typeof playTick === 'function') playTick();
}

function pickYear(i) {
  _dateSelected = true;
  _dateState.yearIdx = i;
  document.querySelectorAll('#year-chips .date-chip').forEach(function(el,j){
    el.classList.toggle('sel', j===i);
  });
  updateDateDisplay();
  if (typeof playTick === 'function') playTick();
}

function getExpDate() {
  return MONTHS[_dateState.monthIdx] + ' ' + YEARS[_dateState.yearIdx];
}

function updateDateDisplay() {
  var el = document.getElementById('date-result-display');
  // Solo mostrar fecha si el usuario seleccionó algo
  if (!_dateSelected) {
    if (el) el.innerHTML = '<span style="color:var(--mu);font-size:12px">Toca mes y año para seleccionar</span>';
    return;
  }
  var exp = getExpDate();
  if (el) el.innerHTML = '📅 <strong style="color:var(--ac)">' + exp + '</strong>';
  // Guardar en _packState y reconstruir título (incluye shade + expDate juntos)
  if (window.cur) cur._expDate = exp; // siempre guardar en cur
  if (window._packState) {
    window._packState.expDate = exp;
    rebuildAndApplyTitle(window._packState.curPack);
  }
}



// ── RECONSTRUIR TÍTULO CON TODOS LOS CAMPOS ──────────────────
function rebuildAndApplyTitle(n) {
  var state = window._packState;
  if (!state) return;
  var shade   = state.shade   || '';
  var expDate = state.expDate || '';
  var title   = rebuildTitle(state.baseTitle, n || state.curPack, shade, expDate);
  var titleEl = document.getElementById('pack-title-display');
  if (titleEl) { titleEl.textContent = title; titleEl.dataset.val = title; }
  if (window.cur) cur._selectedTitle = title;
  // Actualizar botón y regenerar si ya hay imagen
  var genBtn = document.getElementById('bundle-gen-btn');
  if (genBtn) genBtn.textContent = '📷 Take Product Photo → Generate Pack of ' + (n || state.curPack);
  // Si ya hay imagen guardada, regenerar con nuevo pack
  if (window.cur && cur._singleProductImg) {
    var newPack = n || state.curPack;
    var genDiv  = document.getElementById('bundle-generating');
    var preDiv  = document.getElementById('bundle-preview');
    if (genDiv) { genDiv.style.display = 'block'; genDiv.textContent = '⚙️ Generating Pack of ' + newPack + '...'; }
    if (preDiv) preDiv.style.display = 'none';
    generateBundleImage(cur._singleProductImg, newPack).then(async function(bundleImg) {
      if (preDiv && bundleImg) {
        cur._bundleImg = bundleImg; // guardar base64 mientras sube
        // Comprimir y subir a ImgBB
        var imgbbKey = (localStorage.getItem('cl_imgbb_key') || DEFAULT_IMGBB_KEY);
        if (imgbbKey) {
          if (genDiv) { genDiv.style.display = 'block'; genDiv.textContent = '📤 Uploading to ImgBB...'; }
          try {
            const img2 = new Image(); img2.src = bundleImg;
            await new Promise(r => { img2.onload = r; img2.onerror = r; });
            const c2 = document.createElement('canvas');
            c2.width = 800; c2.height = 800;
            c2.getContext('2d').fillStyle = '#fff';
            c2.getContext('2d').fillRect(0,0,800,800);
            c2.getContext('2d').drawImage(img2, 0, 0, 800, 800);
            const compressed = c2.toDataURL('image/jpeg', 0.85);
            const url = await clUploadPhotoToImgBB(compressed, imgbbKey);
            if (url) {
              _lastBundleUrl = url;
              cur._bundleImg = url;
              cur._imgUrl    = url;
              if (genDiv) genDiv.style.display = 'none';
              preDiv.style.display = 'block';
              preDiv.innerHTML = '<img src="' + bundleImg + '" style="width:100%;border-radius:10px">'
                + '<div style="font-size:11px;color:var(--sv);text-align:center;margin-top:6px">✅ Photo uploaded — ready for eBay</div>';
              return;
            }
          } catch(e) { console.error('Pack regen upload error:', e); }
        }
        // Fallback — mostrar sin URL
        if (genDiv) genDiv.style.display = 'none';
        preDiv.style.display = 'block';
        preDiv.innerHTML = '<img src="' + bundleImg + '" style="width:100%;border-radius:10px">'
          + '<div style="font-size:11px;color:#e74c3c;text-align:center;margin-top:6px">⚠️ Not uploaded to ImgBB</div>';
      } else {
        if (genDiv) genDiv.style.display = 'none';
      }
    });
  }
  return title;
}

// ── PACK SIZE WHEEL ──────────────────────────────────────────
const PACK_SIZES = [1, 2, 3, 4, 5, 6, 8, 10, 12];

// Rebuild title with correct format: Brand Product Count Pack of N New
// Convierte "May 2027" → "Exp 05/27" (compacto para el título)
function formatExpForTitle(expDate) {
  if (!expDate) return '';
  var months = {Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
                Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};
  var parts = expDate.split(' '); // ["May", "2027"]
  if (parts.length !== 2) return '';
  var mo = months[parts[0]] || '';
  var yr = String(parts[1]).slice(-2); // "2027" → "27"
  return mo && yr ? 'Exp ' + mo + '/' + yr : '';
}

function rebuildTitle(base, n, shade, expDate) {
  shade   = shade   || '';
  expDate = expDate || '';
  if (!base) return (shade?shade+' ':'') + 'Pack of ' + n + ' New';
  // Strip existing pack / new / exp references
  var t = base
    .replace(/\bexp\s+\d{2}\/\d{2}\b/gi, '')
    .replace(/\bpack of \d+\b/gi, '').replace(/\b\d+[-\s]?pack\b/gi, '')
    .replace(/\b\d+[\s]?x\b/gi, '').replace(/\bset of \d+\b/gi, '')
    .replace(/\bbundle of \d+\b/gi, '').replace(/\bnew sealed\b/gi, '')
    .replace(/\bnew\b\s*$/gi, '').replace(/\s{2,}/g, ' ').trim()
    .replace(/[·\-,\.]+\s*$/, '').trim();
  var expStr = formatExpForTitle(expDate);
  // Order: base [shade] [Exp MM/YY] Pack of N New
  if (shade)  t = t + ' ' + shade;
  if (expStr) t = t + ' ' + expStr;
  t = t + ' Pack of ' + n + ' New';
  if (t.length > 80) t = t.substring(0, 77).replace(/\s+\S*$/, '...');
  return t;
}

function initPackWheel(currentPacks, ebayPricesObj, baseTitle, baseUPC, baseBrand) {
  // Store state globally for pickPack
  window._packState = {
    sizes:    PACK_SIZES,
    ebayBase: (ebayPricesObj && (ebayPricesObj.low || ebayPricesObj.avg)) || 0,
    baseTitle: baseTitle,
    baseUPC:   baseUPC,
    baseBrand: baseBrand,
    curPack:   Number(currentPacks) || 2,
    shade:     '',
    expDate:   '',
    discount:  0.95,  // 5% below market
  };
  // Apply initial selection visually
  pickPack(window._packState.curPack);
}

// Called by each chip onclick AND by shade input
function pickPack(n) {
  var state = window._packState;
  if (!state) return;
  state.curPack = n;
  var ebayBase  = state.ebayBase;
  var price     = ebayBase ? '$' + (ebayBase * n * (state.discount || 0.95)).toFixed(2) : '';
  var pfx       = (state.baseBrand || 'GEN').replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase() || 'GEN';
  var sku       = pfx + '-' + state.baseUPC + '-' + n + 'pk';
  // Guardar pack y reconstruir título desde _packState (incluye shade + expDate)
  state.curPack = n;

  // Highlight selected chip
  document.querySelectorAll('.pack-chip').forEach(function(el) {
    var chipN = parseInt(el.querySelector('.pc-n').textContent);
    el.classList.toggle('sel', chipN === n);
  });

  // Update label
  var display = document.getElementById('pack-sel-display');
  if (display) display.innerHTML = 'Selected: <strong style="color:var(--ac)">Pack of ' + n + '</strong>' +
    (price ? ' &nbsp;·&nbsp; <strong style="color:var(--gd)">' + price + '</strong>' : '');

  // Update bundle price
  var priceEl = document.getElementById('pack-bundle-price');
  if (priceEl) priceEl.textContent = price || '—';

  // Update SKU — use stored ref first, then getElementById as fallback
  var els    = (window._packState && window._packState.els) || {};
  var skuEl  = els.sku   || document.getElementById('pack-sku-display');
  var titleEl= els.title || document.getElementById('pack-title-display');
  var priceEl= els.price || document.getElementById('pack-bundle-price');
  var dispEl = els.display|| document.getElementById('pack-sel-display');

  if (skuEl)  { skuEl.textContent  = sku;   skuEl.dataset.val   = sku;   }
  rebuildAndApplyTitle(n);

  // Save on cur
  if (window.cur) {
    cur._selectedPack  = n;
    cur._selectedPrice = price ? parseFloat(price.replace('$', '')) : null;
    cur._selectedSKU   = sku;
    // _selectedTitle se actualiza en rebuildAndApplyTitle
  }
  if (typeof playTick === 'function') playTick();

  // ── Actualizar badge SAVVY/DWI en tiempo real ─────────────
  var bundleAmt = ebayBase ? ebayBase * n * 0.95 : 0;
  var badge = document.querySelector('.badge');
  var addBtn = document.getElementById('addBtn');
  if (badge && ebayBase > 0) {
    if (bundleAmt >= 15) {
      badge.className = 'badge sv';
      badge.innerHTML = '✅ SAVVY';
      if (addBtn) { addBtn.className = 'add-btn'; addBtn.textContent = '➕ ADD TO CSV'; }
      if (window.cur) cur.verdict = 'SAVVY';
    } else {
      badge.className = 'badge dw';
      badge.innerHTML = '✗ DWI';
      if (addBtn) { addBtn.className = 'ov-add-btn'; addBtn.textContent = '➕ Add anyway (DWI override)'; }
      if (window.cur) cur.verdict = 'DWI';
    }
  }
}

function updateShadeColor(shade) {
  var state = window._packState;
  if (!state) return;
  state.shade = shade;                   // guardar en _packState
  if (window.cur) cur._shade = shade;
  rebuildAndApplyTitle(state.curPack);   // reconstruye con shade + expDate juntos
}


function calcPacks(ebayLow,costPerUnit){
  const sizes=[2,3,4,6,8,10,12];
  const FEE=0.1325,FEE_F=0.30;
  function ship(n){return n<=2?5.50:n<=4?7.50:n<=6?9.50:n<=8?11.50:13.50;}
  return sizes.map(n=>{
    const rev=parseFloat((ebayLow*n*0.92).toFixed(2));
    const fee=parseFloat((rev*FEE+FEE_F).toFixed(2));
    const shp=ship(n);
    const cst=parseFloat((costPerUnit*n).toFixed(2));
    const pft=parseFloat((rev-fee-shp-cst).toFixed(2));
    const roi=cst>0?parseFloat((pft/cst*100).toFixed(0)):0;
    return{n,rev,fee,shp,cst,pft,roi};
  });
}
function renderPackTable(ebayLow){
  const cv=parseFloat($('costIn').value)||0;
  if(!cv||cv<=0){toast('⚠️ Enter your cost per unit');return;}
  const rows=calcPacks(ebayLow,cv);
  const best=rows.filter(r=>r.pft>0).reduce((a,b)=>b.pft>a.pft?b:a,{pft:-999,n:0});
  let t=`<table class="pack-table"><tr><th>Pack</th><th>Sale</th><th>Fee</th><th>Shipping</th><th>Cost</th><th>Profit</th><th>ROI</th></tr>`;
  rows.forEach(r=>{
    const b=r.n===best.n&&r.pft>0;
    t+=`<tr class="${b?'best':''}"><td>${b?'⭐ ':''}${r.n}pk</td><td>$${r.rev}</td><td>$${r.fee}</td><td>$${r.shp}</td><td>$${r.cst}</td><td style="color:${r.pft>0?'var(--sv)':'var(--dw)'}">${r.pft>0?'+':''}$${r.pft}</td><td style="color:${r.roi>0?'var(--sv)':'var(--dw)'}">${r.roi}%</td></tr>`;
  });
  $('packResult').innerHTML=t+'</table>';
}


// ── SMART TITLE — nunca usa UPC, siempre usa marca + producto ──
function buildSmartTitle(prod, packs) {
  packs = packs || 2;
  if (!prod || (!prod.name && !prod.brand)) return '';
  const brand    = (prod.brand || '').trim();
  const name     = (prod.name  || '').trim();
  // Remove brand from start of name to avoid "Neutrogena Neutrogena..."
  const cleanName = (brand && name.toLowerCase().startsWith(brand.toLowerCase()))
    ? name.substring(brand.length).trim()
    : name;
  // Extract size/count if present (oz, ct, ml, lb, mg, g, fl oz)
  const sizeMatch = cleanName.match(/\b(\d+\.?\d*\s*(?:oz|fl oz|ct|count|ml|l|lb|lbs|mg|g|kg|pack|pc|pcs|pieces?))\b/i);
  const sizeStr   = sizeMatch ? sizeMatch[0] : '';
  // Build clean name without the size (to reorder: brand + name + size + pack + new)
  const nameNoSize = sizeStr ? cleanName.replace(sizeStr, '').replace(/\s{2,}/g,' ').trim() : cleanName;
  const packStr = packs > 1 ? 'Pack of ' + packs : '';
  const parts = [brand, nameNoSize, sizeStr, packStr, 'New'].filter(Boolean);
  let title = parts.join(' ').replace(/\s{2,}/g,' ').trim();
  if (title.length > 80) title = title.substring(0, 77).replace(/\s+\S*$/, '') + '...';
  return title;
}

// Claude
async function callClaude(upc,prod,ebay){
  stat('Analyzing with Claude...');
  const key=(localStorage.getItem('savvy_api_key') || DEFAULT_CLAUDE_KEY);
  if(!key)return fallback(upc,prod,ebay);

  const low     = ebay?.prices?.low || ebay?.pricing?.active?.low || 0;
  const avg     = ebay?.prices?.avg || ebay?.pricing?.active?.avg || 0;
  const sold    = ebay?.pricing?.sold;
  const soldCount = sold?.count || ebay?.soldCount || 0;
  const soldAvg   = sold?.avg || sold?.median || 0;
  const activeListings = ebay?.activeListings || 0;

  // ── Pricing logic: eBay is always the source of truth ────────
  // Use the cheapest active price as the market reference
  const marketLow = low || soldAvg || avg || 0;

  // ── Bundle optimizer: find smallest pack that makes it profitable
  // Min bundle revenue = $15 (after $6.50 shipping + 13% eBay fees)
  const MIN_BUNDLE = 15;
  const MAX_PACK   = 12;
  let optimalPack = 1;
  if (marketLow > 0) {
    for (let p = 1; p <= MAX_PACK; p++) {
      if (marketLow * p * 0.95 >= MIN_BUNDLE) { optimalPack = p; break; }
    }
  }
  const bundlePrice = marketLow > 0 ? (marketLow * optimalPack * 0.95).toFixed(2) : 0;
  const bundleViable = bundlePrice >= MIN_BUNDLE;

  const eInfo = ebay?.found ? [
    `eBay activos: ${activeListings} listings.`,
    `Precio más bajo activo: $${low} | Avg: $${avg}`,
    soldCount > 0 ? `Vendidos (90d): ${soldCount} unidades. Precio vendido avg: $${soldAvg}` : 'Sin ventas registradas en 90 días.',
    marketLow > 0 ? `Bundle óptimo: Pack de ${optimalPack} × $${marketLow} = $${bundlePrice} (precio de venta sugerido -5% del más barato)` : '',
  ].filter(Boolean).join('\n') : 'No encontrado en eBay.';

  // eBay Catalog aspects (item specifics ya detectados)
  const aspectsStr = prod.aspects && Object.keys(prod.aspects).length > 0
    ? 'Atributos eBay Catalog: ' + Object.entries(prod.aspects).map(([k,v])=>`${k}: ${v}`).join(', ')
    : '';

  // Category de eBay Catalog
  const catalogCat = ebay.category ? `Category eBay Catalog: ID ${ebay.category.id} (${ebay.category.name})` : '';

  // Top titles de eBay como plantillas de referencia SEO
  const topRef=ebay&&ebay.topTitles&&ebay.topTitles.length>0
    ?`\n\nTÍTULOS QUE ESTÁN VENDIENDO EN EBAY AHORA (úsalos como referencia de keywords y estructura):\n`+
      ebay.topTitles.slice(0,5).map((t,i)=>`${i+1}. ${typeof t==='object'?t.title:t}`).join('\n')
    :'';

  const prompt=`Eres un experto en resale/liquidation para eBay con 10 años de experiencia. Tu trabajo es decidir si un producto es rentable (SAVVY) o no (DWI) y crear el listing perfecto.

DATOS DEL PRODUCTO:
- UPC: ${upc}
- Nombre: ${prod.name||'No identificado'}
- Marca: ${prod.brand||'Desconocida'}
- ${eInfo}
- ${catalogCat}
- ${aspectsStr}${topRef}

REGLAS DE DECISIÓN SAVVY vs DWI (aplica EN ESTE ORDEN):
1. Si NO está en eBay o no tiene precio → DWI (no podemos saber si vende)
2. Si está en eBay pero tiene 0 ventas en 90 días → DWI (no se vende)
3. Si el bundle de ${optimalPack} unidad(es) a $${bundlePrice} es MENOR a $${MIN_BUNDLE} → DWI (no cubre envío+fees)
4. Si tiene ventas Y el bundle es viable (≥$${MIN_BUNDLE}) → SAVVY
5. Si el precio unitario ya es ≥$${MIN_BUNDLE} → SAVVY con pack de 1 o 2

PACK SIZE RECOMENDADO: ${optimalPack} unidades a $${bundlePrice} precio total
(Este es el pack mínimo para ser rentable. Puedes sugerir un pack mayor si tiene muchas ventas)

INSTRUCCIONES PARA EL TÍTULO (LO MÁS IMPORTANTE):
FÓRMULA: [Marca] [Nombre Producto] [Tamaño/Count] [Atributo Clave] [Pack de N] New

EJEMPLOS DE TÍTULOS PERFECTOS:
• "Neutrogena Makeup Remover Cleansing Towelettes 25ct Fragrance Free Pack of 2 New"
• "Centrum Adults Multivitamin Multimineral Supplement 200ct Pack of 2 New"
• "Colgate Total Whitening Toothpaste Fresh Mint Gel 4.8oz Pack of 2 New Sealed"

REGLAS CRÍTICAS DEL TÍTULO:
1. Máximo 80 caracteres EXACTOS
2. SIEMPRE empieza con la BRAND
3. El pack size va ANTES de New, al final
4. NUNCA empieces con "2X", "2-Pack", "Bundle" o números
5. Incluir count/tamaño del producto (oz, ct, ml, lb)
6. Terminar con "New" o "New Sealed"
7. NO usar emojis, signos especiales, ni mayúsculas excesivas

Responde ÚNICAMENTE con este JSON (sin markdown, sin explicación):
{"verdict":"SAVVY o DWI","reason":"1 oración en español explicando el veredicto con el dato clave de eBay","title":"título eBay MAX 80 chars","price":${bundlePrice||'NUMERO_precio'},"packSize":${optimalPack},"category":"ID_categoria_ebay","categoryName":"nombre categoría","description":"Bundle of [N] [product name]. [key benefit/use]. Brand new, factory sealed. Fast shipping from North Carolina.","brand":"marca exacta"}

CRITERIO SAVVY vs DWI:
- SAVVY: producto conocido con demanda real, precio eBay > $5 unidad, categoría con rotación
- DWI: precio eBay < $3 unidad, sin demanda, producto no identificado, o artículo restringido

REGLA CRÍTICA DEL TÍTULO: NUNCA incluyas el UPC, código de barras, o frases como "2-Pack Bundle UPC 12345". El título DEBE empezar con la BRAND seguida del NOMBRE del producto.
Para el precio: usa (precio_min_ebay × packSize × 0.92) si hay datos. Si no hay datos eBay, usa estimado conservador por categoría.`;
  try{
    // 15-second timeout so we never hang forever
    const ctrl = new AbortController();
    const timer = setTimeout(()=>ctrl.abort(), 15000);
    stat('Analyzing with Claude AI...');
    const r=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      signal: ctrl.signal,
      headers:{
        'Content-Type':'application/json',
        'x-api-key':key,
        'anthropic-version':'2023-06-01',
        'anthropic-dangerous-direct-browser-access':'true'
      },
      body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:500,messages:[{role:'user',content:prompt}]}) // ⚠️ HAIKU LOCKED - NEVER CHANGE
    });
    clearTimeout(timer);
    // Rate limited → just use fallback, don't wait
    if(r.status===429){toast('⏳ eBay rate limit — using fast estimate');return fallback(upc,prod,ebay);}
    if(!r.ok)return fallback(upc,prod,ebay);
    const d=await r.json();
    const txt=(d.content&&d.content[0]&&d.content[0].text||'').replace(/```json|```/g,'').trim();
    const res=JSON.parse(txt);
    res.upc=upc;res.ebay=ebay;res.prod=prod;
    if(!res.brand||res.brand.toLowerCase()==='generic')res.brand=prod.brand||'';
    return res;
  }catch(e){
    if(e.name==='AbortError') toast('⚠️ Claude timeout — using fast estimate');
    return fallback(upc,prod,ebay);
  }
}

function fallback(upc,prod,ebay){
  const avg=ebay&&ebay.prices&&ebay.prices.avg||0;
  const found=prod&&prod.found;
  const packs=2;
  const cid=catId((prod&&prod.name)||'');
  // Smart title — never expose UPC
  let title='';
  if(found) title=buildSmartTitle(prod,packs);
  else if(ebay&&ebay.topTitles&&ebay.topTitles[0]){
    const t=ebay.topTitles[0];
    title=String(typeof t==='object'?t.title:t).substring(0,80);
  } else title='New Product Pack of '+packs+' New';
  const brand=(prod&&prod.brand)||'';
  return{verdict:found||(avg>3)?'SAVVY':'DWI',
    reason:found?'Estimado sin API':'No data suficientes',
    title,price:calcBundlePrice(ebay,packs),packSize:packs,
    category:cid,categoryName:catNm(cid),
    description:`Bundle of ${packs} ${found?prod.name:'items'}. New sealed. Fast shipping from Lumberton, NC.`,
    brand,upc,ebay,prod};
}

// Main
async function analyze(upc){
  upc=String(upc||'').replace(/\D/g,'');
  if(upc.length<8){toast('❌ Invalid UPC — minimum 8 digits');return;}
  screen('load');$('lp').textContent='UPC: '+upc;

  let step='init', prod={name:'',brand:'',found:false}, ebay={found:false}, res=null;
  try{
    // ── Single call to eBay: Catalog + Browse + Finding ──────
    step='ebay_catalog';
    stat('Querying eBay Catalog...');
    const ebayFull = await lookupProduct(upc);

    // Extract product info from Catalog response
    if (ebayFull.product && ebayFull.product.name) {
      prod = {
        name:        ebayFull.product.name,
        brand:       ebayFull.product.brand || '',
        description: ebayFull.product.description || '',
        aspects:     ebayFull.product.aspects || {},
        found:       true,
        source:      'ebay_catalog'
      };
      $('lp').textContent = prod.name.substring(0, 50);
    } else {
      // Fallback to UPCitemdb if Catalog found nothing
      step='upcitemdb_fallback';
      stat('Searching UPCitemdb...');
      prod = await lookupUPCitemdb(upc);
      if(prod.found) $('lp').textContent = prod.name.substring(0, 50);
    }

    // ── KEYWORD PRICE FALLBACK: run whenever we don't have real price data yet ──
    // This runs REGARDLESS of whether Catalog found a product name — a name match
    // does not guarantee active/sold pricing came back with it.
    const _hasPriceAlready = !!(ebayFull.prices?.low || ebayFull.pricing?.sold?.count);
    if (!_hasPriceAlready) {
      try {
        stat('Searching eBay by keyword...');
        const kwCtrl = new AbortController();
        const kwTimer = setTimeout(()=>kwCtrl.abort(), 10000);
        const kwR = await fetch(WORKER + '/?keywords=' + upc, { signal: kwCtrl.signal });
        clearTimeout(kwTimer);
        if (kwR.ok) {
          const kwD = await kwR.json();
          // Merge prices if keyword search found better data
          if (kwD.prices?.low || kwD.topTitles?.length) {
            if (!ebayFull.prices && kwD.prices) ebayFull.prices = kwD.prices;
            if (!ebayFull.pricing?.sold && kwD.pricing) ebayFull.pricing = kwD.pricing;
            if (!ebayFull.topTitles?.length && kwD.topTitles?.length) ebayFull.topTitles = kwD.topTitles;
            if (!ebayFull.activeListings && kwD.activeListings) ebayFull.activeListings = kwD.activeListings;
            if (!ebayFull.soldCount && kwD.soldCount) ebayFull.soldCount = kwD.soldCount;
            ebayFull.priceSource = 'keyword_upc';
            if (!ebayFull.found) ebayFull.found = kwD.found || false;
          }
          // Extract product name from top eBay title ONLY if we still don't have one
          if (!prod.found && kwD.topTitles && kwD.topTitles[0]) {
            const topT = typeof kwD.topTitles[0] === 'object' ? kwD.topTitles[0].title : kwD.topTitles[0];
            if (topT) {
              prod.name = topT.substring(0, 120);
              prod.found = true;
              prod.source = 'ebay_keyword';
              // Extract brand from title (first word usually)
              const firstWord = topT.trim().split(/\s+/)[0];
              if (firstWord && firstWord.length > 1) prod.brand = firstWord;
              $('lp').textContent = prod.name.substring(0, 50);
            }
          }
        }
      } catch(e) { /* keyword search failed silently */ }
    }

    // Map ebayFull to legacy ebay format expected by callClaude
    ebay = {
      found:          ebayFull.found,
      activeListings: ebayFull.activeListings || 0,
      soldCount:      ebayFull.soldCount || 0,
      cheapestPrice:  ebayFull.cheapestPrice || 0,
      cheapestTitle:  ebayFull.cheapestTitle || '',
      prices:         ebayFull.prices || null,
      topTitles:      ebayFull.topTitles || [],
      pricing:        ebayFull.pricing || {},
      category:       ebayFull.category || null,
      priceSource:    ebayFull.priceSource || 'keyword', // 'gtin_exact' = most accurate
    };

    step='claude';
    stat('Analyzing with Claude...');
    res=await callClaude(upc,prod,ebay);

    step='render';
    if(!res.brand||res.brand.toLowerCase()==='generic'||res.brand.trim()===''){
      res.brand = prod.brand||'';
    }
    if(!res.title||res.title.includes(upc)||res.title.toLowerCase().includes(' upc ')){
      res.title = buildSmartTitle(prod, res.packSize||2) || res.title;
    }
    // Validar categoría — si Claude pone categoría padre o default, recalcular desde título
    const PARENT_CATS = ['26395','293','888','220','1281','2984','14308','20625','6000','16486','11854','31786','20725'];
    const titleBasedCat = catId(res.title || prod.name || '');
    if (!res.category || PARENT_CATS.includes(String(res.category)) || res.category === '31786') {
      // Solo usar 31786 si el título realmente es skin care
      const isSkinCare = /lotion|moisturizer|sunscreen|spf|face wash|serum|toner|cleanser/i.test(res.title||'');
      if (!isSkinCare && titleBasedCat !== '31786') {
        res.category = titleBasedCat;
        res.categoryName = catNm(titleBasedCat);
      }
    }

    // ── OVERRIDE VERDICT MATEMÁTICAMENTE ─────────────────────
    // Recalcular aquí en scope local de analyze()
    const _low      = ebay?.prices?.low || ebay?.pricing?.active?.low || 0;
    const _soldAvg  = ebay?.pricing?.sold?.avg || ebay?.pricing?.sold?.median || 0;
    const _avg      = ebay?.prices?.avg || 0;
    const _mBase    = _low || _soldAvg || _avg || 0;
    const _soldCnt  = ebay?.pricing?.sold?.count || ebay?.soldCount || 0;
    const _MIN      = 15;
    let   _optPack  = 1;
    if (_mBase > 0) {
      for (let p = 1; p <= 12; p++) {
        if (_mBase * p * 0.95 >= _MIN) { _optPack = p; break; }
      }
    }
    const _bPrice   = (_mBase * _optPack * 0.95).toFixed(2);
    const _viable   = parseFloat(_bPrice) >= _MIN;

    if (ebay.found && _mBase > 0) {
      if (_viable) {
        res.verdict  = 'SAVVY';
        res.price    = _bPrice;
        res.packSize = _optPack;
        res.reason   = _soldCnt > 0
          ? `$${_low||_avg} más barato en eBay. ${_soldCnt} ventas en 90 días. Bundle de ${_optPack} a $${_bPrice}.`
          : `Precio activo $${_low||_avg}. Bundle de ${_optPack} a $${_bPrice}. Sin ventas registradas — monitorear.`;
      } else {
        res.verdict = 'DWI';
        res.reason  = `Precio en eBay $${_low||_avg}. Ni con 12 unidades ($${(_mBase*12*0.95).toFixed(2)}) llega a $${_MIN} mínimo.`;
      }
    } else if (!ebay.found || _mBase === 0) {
      res.verdict = 'DWI';
      res.reason  = 'No se encontró precio activo en eBay. Sin datos de mercado.';
    }

    cur=res;
    cur._singleProductImg=null; // limpiar foto anterior al escanear nuevo producto
    cur._bundleImg=null;
    _lastBundleUrl = '';
    try {
      renderResult(res);
      screen('res');
    } catch(renderErr) {
      console.error('renderResult error:', renderErr);
      $('resBody').innerHTML='<div style="padding:20px"><div class="badge dw">❌ Render Error</div>'
        +'<div class="card" style="margin-top:12px"><div class="lbl">Error Message</div>'
        +'<div class="val" style="font-size:13px;color:#ff5252;word-break:break-all">'+renderErr.message+'</div></div>'
        +'<div class="card"><div class="lbl">Where</div>'
        +'<div class="val" style="font-size:11px;color:var(--mu)">'+String(renderErr.stack||'').substring(0,200)+'</div></div>'
        +'<button class="ag-btn" id="agBtnErr">🔄 SCAN ANOTHER</button></div>';
      screen('res');
      var eb=$('agBtnErr');
      if(eb) eb.addEventListener('click',function(){ scanAnother(); });
    }
  }catch(e){
    console.error('Error en paso ['+step+']:',e);
    // Mostrar error en pantalla (no solo toast)
    screen('res');
    $('resBody').innerHTML=`
      <div class="badge dw">❌ ERROR</div>
      <div class="card">
        <div class="lbl">Failed step</div>
        <div class="val" style="font-family:monospace;color:var(--dw)">${step}</div>
      </div>
      <div class="card">
        <div class="lbl">Error message</div>
        <div class="val" style="font-size:12px;word-break:break-all">${e.message||'Error desconocido'}</div>
      </div>
      <div class="card">
        <div class="lbl">Scanned UPC</div>
        <div class="val" style="font-family:monospace">${upc}</div>
      </div>
      <div class="card">
        <div class="lbl">Product found</div>
        <div class="val">${prod.found?prod.name:'Not found in UPCitemdb'}</div>
      </div>
      <div class="card">
        <div class="lbl">eBay Worker</div>
        <div class="val">${ebay.found?'✅ '+ebay.activeListings+' listings':'❌ No data'}</div>
      </div>
      <div class="card">
        <div class="lbl">Claude API Key</div>
        <div class="val">${(localStorage.getItem('savvy_api_key') || DEFAULT_CLAUDE_KEY)?'✅ Configurada':'❌ Not configured'}</div>
      </div>
      <button class="ag-btn" id="agBtn" style="margin-top:10px">🔄 TRY AGAIN</button>`;
    $('agBtn').addEventListener('touchend',e=>{e.preventDefault();scanAnother();});
    $('agBtn').addEventListener('click',scanAnother);
  }
}


// ── ADD TO BULK CSV ───────────────────────────────────────────

function updateFAB(){
  const n=bulk.length;
  const fab=$('fab');
  const fabN=$('fabN');
  if(fab) fab.classList.toggle('on', n>0);
  if(fabN) fabN.textContent=n;
}

async function addBulk() {
  var EXP_REQ = ['67169','180959','75037','51227','57041','2984','67167','105070'];
  if (EXP_REQ.includes(String(cur.category||''))) {
    // Check both cur._expDate and DOM display (in case _packState wasn't set)
    var expVal = cur._expDate || '';
    if (!expVal) {
      var dateDisplay = document.getElementById('date-result-display');
      if (dateDisplay && dateDisplay.textContent && dateDisplay.textContent.trim() !== '' 
          && !dateDisplay.textContent.includes('Toca mes')) {
        expVal = dateDisplay.textContent.replace('📅','').trim();
        cur._expDate = expVal; // save it
      }
    }
    if (!expVal) {
      toast('⚠️ Este producto requiere fecha de expiración — toca 📅 para agregarla');
      var expBtn = document.getElementById('exp-toggle-btn');
      if (expBtn) {
        expBtn.style.borderColor = '#e74c3c';
        expBtn.style.background = 'rgba(231,76,60,.15)';
        expBtn.scrollIntoView({behavior:'smooth', block:'center'});
      }
      return;
    }
  }

  if (!cur) return;
  const packs = cur._selectedPack || cur.packSize || 2;
  var skuEl   = document.getElementById('pack-sku-display');
  var titleEl = document.getElementById('pack-title-display');
  var usedTitle = cur._selectedTitle || (titleEl && titleEl.dataset.val) || rebuildTitle(cur.title||'', packs);
  var usedSKU   = cur._selectedSKU   || (skuEl   && skuEl.dataset.val)   || makeSKU(cur.brand, cur.upc, packs, cur.title);
  var usedPrice = cur._selectedPrice || parseFloat(cur.price) || 9.99;
  var shade     = (cur._shade   || '').trim();
  var expDate   = cur._expDate  || '';
  var location  = cur.location  || '';

  if (bulk.find(function(b){ return b.upc === cur.upc; })) {
    toast('⚠️ Already in CSV'); return;
  }

  // ── FOTO REQUERIDA — eBay rechaza listings sin foto ──────────
  // Verificar en múltiples lugares donde puede estar guardada la foto
  var bundlePreviewImg = document.querySelector('#bundle-preview img');
  var hasPhoto = !!(
    _lastBundleUrl ||
    (cur._bundleImg && cur._bundleImg.length > 100) ||
    cur._imgUrl ||
    cur._singleProductImg ||
    (bundlePreviewImg && bundlePreviewImg.src && bundlePreviewImg.src.length > 100)
  );
  // Si hay imagen en el DOM, guardarla en cur para que _doAddBulk la use
  if (!cur._bundleImg && bundlePreviewImg && bundlePreviewImg.src && bundlePreviewImg.src.length > 100) {
    cur._bundleImg = bundlePreviewImg.src;
  }
  if (!hasPhoto) {
    var _photoWarnOv = document.createElement('div');
    _photoWarnOv.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:99999;'
      + 'display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px;gap:14px;text-align:center';
    _photoWarnOv.innerHTML = '<div style="font-size:50px">📷</div>'
      + '<div style="color:#fff;font-size:18px;font-weight:800">Sin foto — eBay rechazará este listing</div>'
      + '<div style="color:#aaa;font-size:14px;line-height:1.6">eBay requiere al menos 1 foto.<br>Toma la foto antes de agregar al CSV.</div>'
      + '<div style="display:flex;gap:10px;margin-top:6px;width:100%;max-width:320px">'
      + '<button id="_photoWarnCancel" style="flex:1;background:none;border:1px solid #555;border-radius:12px;padding:13px;color:#aaa;font-size:14px;cursor:pointer">Cancelar</button>'
      + '<button id="_photoWarnContinue" style="flex:1;background:#ff6b00;border:none;border-radius:12px;padding:13px;color:#fff;font-size:14px;font-weight:800;cursor:pointer">Agregar igual</button>'
      + '</div>';
    document.body.appendChild(_photoWarnOv);
    document.getElementById('_photoWarnCancel').onclick = function() { _photoWarnOv.remove(); };
    document.getElementById('_photoWarnContinue').onclick = function() {
      _photoWarnOv.remove();
      _doAddBulk(usedTitle, usedSKU, usedPrice, shade, expDate, location, packs, '');
    };
    return;
  }

  // Incluir base64 también — _doAddBulk intentará subir a ImgBB
  var photoUrl = _lastBundleUrl || cur._bundleImg || cur._imgUrl || '';
  await _doAddBulk(usedTitle, usedSKU, usedPrice, shade, expDate, location, packs, photoUrl);
}

async function _doAddBulk(usedTitle, usedSKU, usedPrice, shade, expDate, location, packs, photoUrl) {
  // Si la foto es base64, intentar subir a ImgBB
  if (photoUrl && photoUrl.startsWith('data:')) {
    const imgbbKey = (localStorage.getItem('cl_imgbb_key') || DEFAULT_IMGBB_KEY);
    if (imgbbKey) {
      const addBtn = document.getElementById('addBtn');
      if (addBtn) { addBtn.disabled = true; addBtn.textContent = '📤 Uploading photo...'; }
      let compressed = photoUrl;
      try {
        const img = new Image(); img.src = photoUrl;
        await new Promise(r => { img.onload = r; img.onerror = r; });
        const c = document.createElement('canvas');
        c.width = 800; c.height = 800;
        c.getContext('2d').drawImage(img, 0, 0, 800, 800);
        compressed = c.toDataURL('image/jpeg', 0.82);
      } catch(e) { compressed = photoUrl; }
      const uploaded = await clUploadPhotoToImgBB(compressed, imgbbKey);
      if (uploaded) {
        photoUrl = uploaded;
        if (cur) { cur._bundleImg = uploaded; cur._imgUrl = uploaded; }
        toast('✅ Foto subida — agregando al CSV');
      } else {
        toast('⚠️ ImgBB falló — verifica tu API key en ⚙️. Agregando sin foto.');
        photoUrl = '';
      }
      if (addBtn) { addBtn.disabled = false; addBtn.textContent = '➕ ADD TO CSV'; }
    } else {
      toast('⚠️ Configura ImgBB en ⚙️ para subir fotos. Agregando sin foto.');
      photoUrl = '';
    }
  }

  bulk.push({
    sku:         usedSKU,
    title:       usedTitle || (cur && cur.title) || '',
    price:       usedPrice,
    shade:       shade,
    expDate:     expDate,
    upc:         (cur && cur.upc)         || '',
    brand:       (cur && cur.brand)       || 'Generic',
    category:    (cur && cur.category)    || '26395',
    description: (cur && cur.description) || '',
    location:    location,
    packs:       packs,
    photo:       photoUrl,
    bundleImg:   photoUrl,
    scannedBy:   SAVVY_CURRENT_USER || 'unknown'
  });
  saveBulkToStorage();
  updateFAB();
  toast('✅ Added — ' + bulk.length + ' in CSV');
}

// Render result
function renderResult(r){
  if(!r)return;
  const sv=r.verdict==='SAVVY';
  const ebay=r.ebay||{};
  const low =ebay.prices&&ebay.prices.low||0;
  const avg =ebay.prices&&ebay.prices.avg||0;
  const packs=r.packSize||2;
  const sku=makeSKU(r.brand,r.upc,packs,r.title);
  const bundlePrice=calcBundlePrice(ebay,packs);

  let h=`<div class="badge ${sv?'sv':'dw'}">${sv?'✅ SAVVY':'❌ DWI'}</div>`;

  // ── 1. TITLE ─────────────────────────────────────────────────
  h+=`<div class="card" style="border-left:3px solid var(--ac)">
    <div class="lbl" style="color:var(--ac)">📝 eBay SEO Title</div>
    <div id="pack-title-display" class="val" style="font-size:15px;font-weight:700;line-height:1.5" data-val="${esc(r.title||'')}">${esc(r.title||'')}</div>
    <div style="font-size:11px;color:var(--mu);margin-top:4px">${(r.title||'').length}/80 chars</div>
  </div>`;

  // ── 2. SKU ───────────────────────────────────────────────────
  h+=`<div class="card"><div class="lbl">SKU</div>
    <div id="pack-sku-display" class="val" style="font-family:monospace;font-size:14px" data-val="${esc(sku)}">${esc(sku)}</div></div>`;

  // ── 3. CATEGORY ──────────────────────────────────────────────
  h+=`<div class="card"><div class="lbl">Category</div>
    <div class="val">${esc(r.categoryName||'Health & Beauty')}
      <span style="color:var(--mu);font-size:11px"> · ID ${esc(r.category||'26395')}</span>
    </div></div>`;

  // ── 4. PACK SELECTOR ─────────────────────────────────────────
  h+=`<div class="price-row">
    <div class="pc"><div class="lbl">eBay Lowest<br><span style="font-size:9px;color:var(--mu)">(item+ship, NEW)</span></div><div class="pc-num low">${low>0?fmt(low):'—'}</div></div>
    <div class="pc"><div class="lbl">eBay Avg<br><span style="font-size:9px;color:var(--mu)">(item+ship)</span></div><div class="pc-num avg">${avg>0?fmt(avg):'—'}</div></div>
    <div class="pc"><div class="lbl">Your Bundle</div><div class="pc-num bdl" id="pack-bundle-price">${fmt(bundlePrice)}</div></div>
  </div>`+
  (function(){
    var _cb=low||avg||0;
    var h2='<div class="card"><div class="lbl">📦 SELECT PACK SIZE</div>';
    h2+='<div class="pack-chips" id="pack-chips">';
    PACK_SIZES.forEach(function(n){
      var sel=(n===packs)?' sel':'';
      var cp=_cb>0?'$'+(_cb*n*0.88).toFixed(2):'';
      h2+='<div class="pack-chip'+sel+'" onclick="pickPack('+n+')">'
        +'<div class="pc-n">'+n+'pk</div>'+(cp?'<div class="pc-p">'+cp+'</div>':'')+'</div>';
    });
    h2+='</div>';
    h2+='<div id="pack-sel-display" style="font-size:12px;color:var(--mu);margin-top:4px">Selected: <strong style="color:var(--ac)">Pack of '+packs+'</strong></div>';
    h2+='<div class="extra-field"><div class="extra-label">🎨 Shade / Color (optional)</div><input class="extra-input" id="shade-input" type="text" placeholder="e.g. Cherry Red, #12 Brown..." oninput="updateShadeColor(this.value)"></div>';
    // Categorías que requieren fecha de expiración
    var EXP_REQUIRED_CATS = ['67169','180959','75037','51227','57041','2984','67167','105070'];
    var needsExpDate = EXP_REQUIRED_CATS.includes(String(r.category||''));

    h2+='<div class="extra-field"><div class="extra-label">📅 Expiration Date'
      + (needsExpDate ? ' <span style="color:#e74c3c;font-weight:800">* REQUIRED</span>' : ' (optional)')
      + '</div>';
    if (needsExpDate) {
      h2+='<div style="background:rgba(231,76,60,.1);border:1px solid rgba(231,76,60,.4);border-radius:8px;padding:8px 12px;margin-bottom:6px;font-size:12px;color:#e74c3c">⚠️ Este producto requiere fecha de expiración para listarse en eBay</div>';
    }
    h2+='<div id="exp-toggle-btn" onclick="toggleExpDate()" style="display:inline-flex;align-items:center;gap:8px;background:var(--sf2);border:1.5px solid '+(needsExpDate?'#e74c3c':'var(--bd)')+';border-radius:10px;padding:10px 16px;cursor:pointer;margin-top:6px;font-size:13px;color:'+(needsExpDate?'#e74c3c':'var(--mu)')+'"><span>📅</span><span>'+(needsExpDate?'Ingresar fecha de expiración (REQUERIDO)':'This product has an expiration date')+'</span></div>';
    h2+='<div id="exp-date-picker" style="display:none;margin-top:10px"><div class="extra-label">MONTH</div><div class="pack-chips" id="month-chips" style="gap:6px"></div><div class="extra-label" style="margin-top:10px">YEAR</div><div class="pack-chips" id="year-chips" style="gap:6px"></div><div class="date-result" id="date-result-display" style="text-align:left;margin-top:8px"></div><button onclick="clearExpDate()" style="background:none;border:none;color:var(--mu);font-size:12px;cursor:pointer;margin-top:4px">✕ Remove date</button></div></div>';
    h2+='</div>';
    return h2;
  }());

  // ── 3. BUNDLE PHOTO GENERATOR ────────────────────────────────
  h+=`<div class="bundle-photo-card">
    <div class="lbl">📸 LISTING PHOTO — Bundle Image Generator</div>
    <div style="background:rgba(255,171,0,.1);border:1px solid rgba(255,171,0,.4);border-radius:8px;padding:8px 12px;margin:6px 0 10px;font-size:11px;line-height:1.6">
      💡 <strong>Background tip for best results:</strong><br>
      🖤 Light/white products (vitamins, lotion) → use <strong>BLACK or DARK background</strong><br>
      ⬜ Dark products (dark bottles, sprays) → use <strong>WHITE or LIGHT background</strong>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:4px">
      <button id="bundle-gen-btn" onclick="pgTakePhoto()" style="width:100%;background:linear-gradient(135deg,#FF6B35,#E71D36);border:none;border-radius:10px;padding:13px;color:#fff;font-size:14px;font-weight:800;cursor:pointer">
        📦 Generate Pack with AI (Remove Background + Bundle)
      </button>
      <button onclick="openReadyPhoto()" style="width:100%;background:#1a472a;border:2px solid #2ecc71;border-radius:10px;padding:13px;color:#2ecc71;font-size:14px;font-weight:800;cursor:pointer">
        📦 Generate Pack with AI (Quitar Fondo + Bundle)
      </button>
    </div>
    <div id="bundle-generating" class="bundle-generating" style="display:none">⏳ Processing...</div>
    <div id="bundle-preview" class="bundle-preview" style="display:none"></div>
  </div>`;

  // ── 5. UPC MATCH BADGE ───────────────────────────────────────
  const src=ebay.priceSource||'keyword';
  const srcBadge=src==='gtin_exact'
    ?'<span style="background:rgba(0,230,118,.15);color:var(--sv);font-size:11px;padding:3px 10px;border-radius:10px;font-weight:700">✅ UPC EXACT MATCH</span>'
    :src.includes('gtin')
    ?'<span style="background:rgba(255,171,0,.15);color:var(--gd);font-size:11px;padding:3px 10px;border-radius:10px">⚠️ PARTIAL MATCH</span>'
    :'<span style="background:rgba(255,107,0,.15);color:var(--ac);font-size:11px;padding:3px 10px;border-radius:10px">🔍 KEYWORD ONLY</span>';
  h+=`<div style="text-align:center;margin:8px 0">${srcBadge}</div>`;

  // ── 6. EBAY MARKET DATA ──────────────────────────────────────
  if(ebay.activeListings>0){
    const sold=ebay.pricing&&ebay.pricing.sold;
    h+=`<div class="card"><div class="lbl">eBay — Market Data (NEW, item+ship)</div>
      <div class="val" style="font-size:13px;line-height:2">
        🏷 Active BIN: <strong>${ebay.activeListings}</strong><br>
        💰 Min: <strong>${fmt(low)}</strong> | Avg: <strong>${fmt(avg)}</strong> | Max: ${fmt(ebay.prices&&ebay.prices.high)}
        ${sold?`<br>✅ Sold (90d): <strong>${sold.count}</strong> | Avg: <strong>${fmt(sold.avg)}</strong>`:''}
      </div>
      ${src!=='gtin_exact'?`<div style="font-size:11px;color:var(--mu);margin-top:4px">⚠️ Keyword prices — verify on eBay</div>`:''}
    </div>`;
  }

  // ── 7. DWI REASON ────────────────────────────────────────────
  if(!sv)h+=`<div class="card"><div class="lbl">DWI Reason</div><div class="val">${esc(r.reason||'')}</div></div>`;

  // ── 9. LOCATION ──────────────────────────────────────────────
  const locVal=r.location||'';
  h+=`<div class="card"><div class="lbl">📍 Warehouse Location</div>
    <div style="margin-top:8px">${locVal?locBadgeHTML(locVal,'scanner'):locEmptyHTML('scanner')}</div>
  </div>`;

  h+=sv
    ? `<button class="add-btn" id="addBtn" ${cur && cur._bundleImg===undefined ? '' : ''}>➕ ADD TO CSV</button>`
    : `<button class="ov-add-btn" id="addBtn">➕ Add anyway (DWI override)</button>`;
  h+=`<button class="ag-btn" id="agBtn">🔄 SCAN ANOTHER</button>`;

  $('resBody').innerHTML=h;

  const addB=$('addBtn');
  if(addB){addB.addEventListener('touchend',e=>{e.preventDefault();addBulk();});addB.addEventListener('click',addBulk);}
  const agB=$('agBtn');
  if(agB){agB.addEventListener('touchend',e=>{e.preventDefault();scanAnother();});agB.addEventListener('click',scanAnother);}

  setTimeout(function(){
    var ebayPrices=(r.ebay&&r.ebay.prices)?r.ebay.prices:null;
    initPackWheel(Number(packs)||2,ebayPrices,r.title||'',r.upc||'',r.brand||'',
      {sku:document.getElementById('pack-sku-display'),
       title:document.getElementById('pack-title-display'),
       price:document.getElementById('pack-bundle-price'),
       display:document.getElementById('pack-sel-display')});
    var si=document.getElementById('shade-input');
    if(si&&window.cur&&cur._shade) si.value=cur._shade;
  },80);
}

function clearBulkSession() {
  if (bulk.length === 0) { toast('⚠️ No hay productos'); return; }
  var ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:99999;display:flex;align-items:center;justify-content:center;padding:30px';
  ov.innerHTML = '<div style="background:var(--sf);border-radius:16px;padding:24px;width:100%;max-width:320px;text-align:center">'
    + '<div style="font-size:18px;font-weight:800;margin-bottom:8px">🗑 Clear Session</div>'
    + '<div style="font-size:14px;color:var(--mu);margin-bottom:20px">Borrar ' + bulk.length + ' producto(s)?</div>'
    + '<button onclick="bulk=[];updateFAB();renderBulk();saveBulkToStorage();document.querySelectorAll(\'.clear-ov\').forEach(e=>e.remove());toast(\'✅ Sesión limpiada\')" '
    + 'style="width:100%;padding:12px;background:#e74c3c;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:800;cursor:pointer;margin-bottom:8px;display:block">Sí, borrar todo</button>'
    + '<button onclick="document.querySelectorAll(\'.clear-ov\').forEach(e=>e.remove())" '
    + 'style="width:100%;padding:10px;background:none;border:1px solid #555;border-radius:10px;color:#888;cursor:pointer;display:block">Cancelar</button>'
    + '</div>';
  ov.className = 'clear-ov';
  document.body.appendChild(ov);
}

function scanAnother() {
  const upcInput = document.getElementById('upcIn');
  if (upcInput) { upcInput.value = ''; setTimeout(()=>upcInput.focus(), 100); }
  _lastBundleUrl = '';
  screen('idle');
}

function renderBulk(){
  const el=$('bulkList');
  if(!el)return;
  if(!bulk.length){el.innerHTML='<p style="text-align:center;color:var(--mu);padding:20px">No items yet.</p>';return;}
  el.innerHTML=bulk.map((it,i)=>`<div class="bi"><div class="bin"><div class="bit">${esc(it.title.substring(0,50))}</div><div class="bis">${esc(it.sku)}</div></div><div class="bip">${fmt(it.price)}</div><button class="bdel" data-i="${i}">✕</button></div>`).join('');
  el.querySelectorAll('.bdel').forEach(b=>b.addEventListener('click',()=>{bulk.splice(+b.dataset.i,1);updateFAB();renderBulk();}));
}

// CSV Export
function exportCSV(){
  try {
  if(!bulk.length){toast('⚠️ No products');return;}

  function q(v) {
    v = String(v==null?'':v);
    return (v.indexOf(',')>=0||v.indexOf('"')>=0||v.indexOf('\n')>=0)
      ? '"'+v.replace(/"/g,'""')+'"' : v;
  }

  var SHIP = 'Flat:Standard Shipp(Free),Same business day';
  var RET  = '30 Day return Copy';
  var PAY  = 'eBay Payments';

  var HDR = [
    '*Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8)',
    'CustomLabel','*Category','*Title','*ConditionID','*Description',
    'PicURL','*Format','*Duration','*StartPrice','*Quantity',
    'ImmediatePayRequired','*Location','*DispatchTimeMax',
    'ShippingProfileName','ReturnProfileName','PaymentProfileName',
    '*C:Brand','C:Type','C:EPA Registration Number','C:Model',
    'C:Color','C:Language','C:Book Title','C:Author','ISBN',
    'C:Expiration Date','C:Dosage'
  ];

  var lines = ['Info,Version=1.0.0,Template=fx_category_template_EBAY_US', HDR.join(',')];
  var skipped = 0;

  // Category → required Type value
  var CAT_TYPE = {
    '36870': 'Lip Balm',
    '36870': 'Lip Balm',
    '11838': 'Deodorant',
    '11840': 'Body Wash',
    '26683': 'Razor',
    '67167': 'Pads',
    '105070': 'Underwear',
    '36478': 'Nail Polish',
    '60496': 'Foundation',
    '180345': 'Perfume',
    '57041': 'Eye Drops',
    '11854': 'Shampoo',
    '1232':  'Insect Repellent',
    '261844':'Insect Repellent',
    '19264': 'Brace',
    '51227': 'Bandage',
    '67169': 'Pain Reliever',
    '180959':'Vitamin',
    '31786': 'Lotion',
    '11840': 'Body Wash',
  };

  // Detectar tipo desde título
  function detectType(category, title) {
    const mapped = CAT_TYPE[String(category)];
    if (mapped) return mapped;
    const t = (title||'').toLowerCase();
    if(/lip balm|chapstick|lip butter/.test(t)) return 'Lip Balm';
    if(/body wash|shower gel/.test(t)) return 'Body Wash';
    if(/lotion|moisturizer/.test(t)) return 'Lotion';
    if(/shampoo/.test(t)) return 'Shampoo';
    if(/conditioner/.test(t)) return 'Conditioner';
    if(/hair color|hair dye/.test(t)) return 'Hair Color';
    if(/mascara/.test(t)) return 'Mascara';
    if(/foundation|concealer/.test(t)) return 'Foundation';
    if(/lipstick|lip gloss/.test(t)) return 'Lipstick';
    if(/eyeshadow/.test(t)) return 'Eye Shadow';
    if(/deodorant|antiperspirant/.test(t)) return 'Deodorant';
    if(/razor/.test(t)) return 'Razor';
    if(/shaving cream|shave gel/.test(t)) return 'Shaving Cream';
    if(/nail polish|nail color/.test(t)) return 'Nail Polish';
    if(/perfume|cologne|eau de/.test(t)) return 'Perfume';
    if(/gummy|gummies/.test(t)) return 'Gummy';
    if(/capsule|softgel/.test(t)) return 'Capsule';
    if(/powder/.test(t)) return 'Powder';
    if(/tablet|pill/.test(t)) return 'Tablet';
    if(/insect|mosquito|bug spray|repellent/.test(t)) return 'Insect Repellent';
    if(/glove|sleeve|brace|wrap|support/.test(t)) return 'Brace';
    if(/bandage|gauze/.test(t)) return 'Bandage';
    if(/sunscreen|spf/.test(t)) return 'Sunscreen';
    return 'Other';
  }

  // EPA Registration Number — solo para insect repellents
  function getEpaNumber(category, title) {
    const t = (title||'').toLowerCase();
    if(String(category)==='1232' || String(category)==='261844' ||
       /insect|mosquito|bug spray|repellent|deet/.test(t)) {
      return '4822-547'; // OFF! generic EPA registration
    }
    return '';
  }

  var EPA_BLOCKED = ['046500221545','046500047452','046500017087'];
  var APPLIANCE_C = ['168763','14284','75655','293','112529','44867','14969','9394','48619','20625'];
  var COLOR_C     = ['20695','20694','20696','36903','37558','261068','220'];
  var BOOK_C      = ['261186','171228','377','267','2228','69'];

  bulk.forEach(function(it) {
    // Saltar productos no identificados o restringidos por EPA
    if (EPA_BLOCKED.some(function(u){ return (it.sku||'').includes(u); })) {
      skipped++; toast('⚠️ ' + it.sku + ' — Bloqueado por EPA'); return;
    }
    if (!it.title || it.title.includes('UNABLE TO CREATE') || it.title.includes('UNIDENTIFIED') || it.brand === 'UNKNOWN') {
      skipped++; return;
    }
    // Saltar productos sin título real (solo "Pack of N New" sin nombre de producto)
    var titleWords = (it.title||'').replace(/pack of \d+/gi,'').replace(/\bnew\b/gi,'').replace(/\bsealed\b/gi,'').trim();
    if (titleWords.length < 8) {
      skipped++;
      toast('⚠️ SKU ' + (it.sku||'') + ' — sin título válido, omitido del CSV');
      return;
    }
    var pics = it.bundleImg || it.photo || it.imgUrl || '';
    var typeVal   = detectType(String(it.category), it.title);
    var epaVal    = getEpaNumber(String(it.category), it.title);
    var modelVal  = '';
    var colorVal  = '';
    var langVal   = '';
    var bookTitle = '';
    var authorVal = '';
    var isbnVal    = '';
    var expDateVal = it.expDate || '';
    var dosageVal  = '';
    // Extract dosage from title for health products
    var EXP_CATS_D = ['67169','180959','75037','51227','57041','2984','67167','105070'];
    if (EXP_CATS_D.includes(String(it.category))) {
      var doseMatch = (it.title||'').match(/(\d+\.?\d*\s*(?:mg|mcg|iu|ml|oz|g|ct|count|capsule|tablet|softgel|serving))/i);
      dosageVal = doseMatch ? doseMatch[0] : 'See product label';
    }

    // Auto-fix brand for known brands in title
    var brandFix = it.brand || 'Generic';
    const titleLower = (it.title||'').toLowerCase();
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

    var cleanTitle = (it.title||'').replace(/[\u{1F300}-\u{1FFFF}\u{2600}-\u{27FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FEFF}✳️⭐🔥💊📦✅❌⚠️🌟💰📊🏷️]/gu, '').replace(/\s+/g,' ').trim().substring(0,80);

    // Model — required for Electronics & Appliances
    if (APPLIANCE_C.includes(String(it.category))) {
      var titleWords = (it.title||'').split(/,/)[0].trim();
      modelVal = brandFix ? titleWords.replace(new RegExp('^'+brandFix+'\\s*','i'),'').trim().substring(0,65) : titleWords.substring(0,65);
    }

    // Color — required for mugs, kitchenware
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

    // Override type for books
    if (BOOK_C.includes(String(it.category))) {
      typeVal = 'Fiction'; // eBay accepts Fiction/Non-Fiction for books
    }
    if (BOOK_C.includes(String(it.category))) {
      langVal   = 'English';
      // Book Title max 65 chars
      var rawBookTitle = cleanTitle.replace(/\s*Pack of \d+\s*/gi,'').replace(/\s*New\s*$/i,'').trim();
      bookTitle = rawBookTitle.length > 65 ? rawBookTitle.substring(0,62).replace(/\s+\S*$/,'').trim() + '...' : rawBookTitle;
      authorVal = (it.brand && it.brand !== 'Generic') ? it.brand : 'Unknown';
      // ISBN = last 13 digits from SKU (UPCs for books are ISBNs)
      const upcStr = (it.sku||'').replace(/[^0-9]/g,'');
      // Try to get 13-digit number from the SKU
      const isbnMatch = (it.sku||'').match(/(\d{13})/);
      isbnVal = isbnMatch ? isbnMatch[1] : (upcStr.length >= 13 ? upcStr.substring(0,13) : '');
    }

    lines.push([
      'Add',
      it.sku||'',
      it.category||'31786',
      cleanTitle,
      '1000',
      it.description || ('<p>' + cleanTitle + '</p>'),
      pics,
      'FixedPrice','GTC',
      it.price||'9.99',
      '1','1',
      'Lumberton, NC','1',
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

  var csv  = lines.join('\r\n');
  var now  = new Date();
  var stamp = now.getFullYear()+'-'
    + String(now.getMonth()+1).padStart(2,'0')+'-'
    + String(now.getDate()).padStart(2,'0')+'-'
    + String(now.getHours()).padStart(2,'0')
    + String(now.getMinutes()).padStart(2,'0');
  var exportedCount = bulk.length - skipped;
  var fname = 'eBay-FX-'+stamp+'-'+exportedCount+'items.csv';
  if (skipped > 0) toast('⚠️ ' + skipped + ' producto(s) no identificados omitidos del CSV');

  var driveUrl = localStorage.getItem('cl_drive_url');
  if (driveUrl) {
    toast('📤 Subiendo a Google Drive...');
    fetch(driveUrl, {
      method: 'POST',
      mode: 'no-cors',
      body: JSON.stringify({csv: csv, filename: fname}),
      headers: {'Content-Type': 'text/plain'}
    }).then(function() {
      var ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:99999;'
        +'display:flex;flex-direction:column;align-items:center;justify-content:center;'
        +'padding:30px;gap:16px;text-align:center';
      ov.innerHTML = '<div style="font-size:60px">✅</div>'
        +'<div style="color:#fff;font-size:22px;font-weight:800">CSV en Google Drive</div>'
        +'<div style="color:#aaa;font-size:14px">'+fname+'</div>'
        +'<div style="color:#aaa;font-size:13px;line-height:1.6">'
        +'En Windows abre <b style="color:#fff">drive.google.com</b><br>'
        +'Carpeta <b style="color:#fff">eBay Listings</b><br>'
        +'Descarga el CSV → sube a eBay</div>'
        +'<a href="https://drive.google.com/drive/folders" target="_blank" '
        +'style="background:#1a73e8;border-radius:12px;padding:14px 28px;color:#fff;'
        +'font-weight:800;font-size:16px;text-decoration:none">📁 Abrir Google Drive</a>'
        +'<button onclick="this.parentElement.remove()" '
        +'style="background:none;border:1px solid #555;border-radius:10px;padding:10px 24px;'
        +'color:#888;cursor:pointer;font-size:14px">Cerrar</button>';
      document.body.appendChild(ov);
    }).catch(function() {
      savvyShowExportOptions(csv, fname, bulk.length);
    });
  } else {
    savvyShowExportOptions(csv, fname, bulk.length);
  }
  } catch(exportErr) {
    console.error('exportCSV error:', exportErr);
    toast('❌ Export error: ' + exportErr.message);
    // Show full error for debugging
    var errOv = document.createElement('div');
    errOv.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;gap:12px;text-align:center';
    errOv.innerHTML = '<div style="font-size:32px">❌</div>'
      + '<div style="color:#fff;font-size:16px;font-weight:800">Export Error</div>'
      + '<div style="color:#ff5252;font-size:13px;word-break:break-all;max-width:340px;background:#1a1a1a;padding:12px;border-radius:8px">' + exportErr.message + '</div>'
      + '<button onclick="this.parentElement.remove()" style="background:linear-gradient(135deg,#FF6B35,#E71D36);border:none;border-radius:10px;padding:12px 24px;color:#fff;cursor:pointer;font-weight:800">Cerrar</button>';
    document.body.appendChild(errOv);
  }
}

function savvyShowExportOptions(csv, fname, count) {
  var blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'});
  var url  = URL.createObjectURL(blob);
  var ov   = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:99999;'
    +'display:flex;flex-direction:column;align-items:center;justify-content:center;padding:30px;gap:12px;text-align:center';
  ov.innerHTML = '<div style="font-size:40px">📄</div>'
    +'<div style="color:#fff;font-size:18px;font-weight:800">'+fname+'</div>'
    +'<div style="color:#aaa;font-size:13px">'+count+' producto(s) listos para eBay</div>'
    +'<a href="'+url+'" download="'+fname+'" '
    +'style="background:linear-gradient(135deg,#FF6B35,#E71D36);border-radius:12px;padding:14px 28px;color:#fff;'
    +'font-weight:800;font-size:16px;text-decoration:none;margin-top:8px">⬇️ Descargar CSV</a>'
    +'<div style="color:#666;font-size:11px;margin-top:4px">Configura Google Drive URL en ⚙️ para subida directa</div>'
    +'<button onclick="this.parentElement.remove()" '
    +'style="background:none;border:1px solid #555;border-radius:10px;padding:10px 24px;'
    +'color:#888;cursor:pointer;font-size:14px;margin-top:4px">Cerrar</button>';
  document.body.appendChild(ov);
}

// Init
document.addEventListener('DOMContentLoaded',()=>{
  if(!localStorage.getItem('savvy_ebay_id'))localStorage.setItem('savvy_ebay_id',DEF_EBAY);

  const cfgBtn=$('cfgBtn');
  cfgBtn.addEventListener('touchend',e=>{e.preventDefault();openCfgWithPin();});
  cfgBtn.addEventListener('click',openCfgWithPin);
  $('cfgX').addEventListener('click',closeCfg);

  const camBtn=$('camBtn');
  if(camBtn){
    camBtn.addEventListener('touchend',e=>{e.preventDefault();startCam();});
    camBtn.addEventListener('click',startCam);
  }else{
    console.warn('⚠️ camBtn not found in DOM');
  }
  const stopBtn=$('camStop');
  if(stopBtn){
    stopBtn.addEventListener('touchend',e=>{e.preventDefault();stopCam();});
    stopBtn.addEventListener('click',stopCam);
  }

  const ui=$('upcIn'),sb=$('srchBtn');
  function chk(){sb.classList.toggle('on',ui.value.trim().replace(/\D/g,'').length>=8);}
  ui.addEventListener('input',chk);ui.addEventListener('change',chk);ui.addEventListener('paste',()=>setTimeout(chk,50));
  function doSearch(){const v=ui.value.trim().replace(/\D/g,'');if(v.length>=8)analyze(v);}
  sb.addEventListener('touchend',e=>{e.preventDefault();doSearch();});
  sb.addEventListener('click',doSearch);
  ui.addEventListener('keydown',e=>{if(e.key==='Enter')doSearch();});

  function openBulk(){renderBulk();$('bulkOv').classList.add('on');}
  $('fab').addEventListener('touchend',e=>{e.preventDefault();openBulk();});
  $('fab').addEventListener('click',openBulk);
  $('bulkX').addEventListener('click',()=>$('bulkOv').classList.remove('on'));
  $('expBtn').addEventListener('touchend',e=>{e.preventDefault();exportCSV();});
  $('expBtn').addEventListener('click',exportCSV);
  $('clrBtn').addEventListener('touchend',e=>{
    e.preventDefault();
    if(bulk.length===0){toast('⚠️ No hay productos en el CSV');return;}
    // No usar confirm() en iOS — usar overlay propio
    var ov=document.createElement('div');
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:99999;display:flex;align-items:center;justify-content:center;padding:30px';
    ov.innerHTML='<div style="background:var(--sf);border-radius:16px;padding:24px;width:100%;max-width:320px;text-align:center">'
      +'<div style="font-size:18px;font-weight:800;margin-bottom:8px">🗑 Clear Session</div>'
      +'<div style="font-size:14px;color:var(--mu);margin-bottom:20px">Vas a borrar '+bulk.length+' producto(s). ¿Confirmas?</div>'
      +'<button onclick="bulk=[];updateFAB();renderBulk();saveBulkToStorage();this.closest(\'div[style*=fixed]\').remove();toast(\'✅ Sesión limpiada\')" style="width:100%;padding:12px;background:#e74c3c;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:800;cursor:pointer;margin-bottom:8px">Sí, borrar todo</button>'
      +'<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="width:100%;padding:10px;background:none;border:1px solid var(--bd);border-radius:10px;color:var(--mu);cursor:pointer">Cancelar</button>'
      +'</div>';
    document.body.appendChild(ov);
  });
  $('clrBtn').addEventListener('click',function(){
    if(bulk.length===0){toast('⚠️ No hay productos en el CSV');return;}
    if(confirm('¿Borrar '+bulk.length+' producto(s) de la sesión?')){
      bulk=[];updateFAB();renderBulk();saveBulkToStorage();toast('✅ Sesión limpiada');
    }
  });

  renderSt();
  checkSavedSession();
  const su = localStorage.getItem('cl_sheets_url');
  if ($('sheetsIn') && su) $('sheetsIn').value = su;
  const rk = localStorage.getItem('rbg_key') || DEFAULT_RBG_KEY;
  if ($('rbgKeyIn') && rk) $('rbgKeyIn').placeholder = '••••••••' + rk.slice(-4);
  const pk = localStorage.getItem('photoroom_key') || DEFAULT_PHOTOROOM_KEY;
  // Clothing keys
  const clRbg = localStorage.getItem('cl_rbg_key') || DEFAULT_RBG_KEY;
  const clPr  = localStorage.getItem('cl_photoroom_key');
  if (document.getElementById('cl-rbg-key-in') && clRbg)
    document.getElementById('cl-rbg-key-in').placeholder = '••••••••' + clRbg.slice(-4);
  if (document.getElementById('cl-pr-key-in') && clPr)
    document.getElementById('cl-pr-key-in').placeholder = '••••••••' + clPr.slice(-4);
  const scannerRbg = localStorage.getItem('rbg_key') || DEFAULT_RBG_KEY;
  const scannerPr  = localStorage.getItem('photoroom_key') || DEFAULT_PHOTOROOM_KEY;
  // Google Drive URL
  const driveEl = document.getElementById('drive-url-input');
  const driveUrl = localStorage.getItem('cl_drive_url');
  if (driveEl && driveUrl) {
    driveEl.value = driveUrl;
    document.getElementById('drive-status').textContent = '✅ Google Drive conectado';
    document.getElementById('drive-status').style.color = 'var(--sv)';
  }
  // ImgBB key
  const imgbbKey = (localStorage.getItem('cl_imgbb_key') || DEFAULT_IMGBB_KEY);
  if (document.getElementById('imgbb-key-in') && imgbbKey) {
    document.getElementById('imgbb-key-in').placeholder = '••••••••' + imgbbKey.slice(-4);
    document.getElementById('imgbb-status').textContent = '✅ ImgBB configured — photos will auto-upload for eBay URLs';
  }

  if (clRbg) {
    clShowBgStatus('✅ Clothing Remove.bg key active — no watermark on clothing photos', 'var(--sv)');
  } else if (scannerRbg) {
    clShowBgStatus('✅ Using Scanner Remove.bg key for clothing (no watermark). You can set a separate key above.', 'var(--sv)');
  } else if (clPr || scannerPr) {
    clShowBgStatus('⚠️ Using PhotoRoom — photos will have watermark. Add a Remove.bg key above for clean photos.', 'var(--gd)');
  }
  if ($('phroomKeyIn') && pk) {
    $('phroomKeyIn').placeholder = '••••••••' + pk.slice(-4);
    showRbgStatus('✅ PhotoRoom configured — tap "Test Background Removal" to verify', 'var(--sv)');
  } else if (rk) {
    showRbgStatus('✅ Remove.bg configured — consider also adding PhotoRoom (75 free/month)', 'var(--gd)');
  }

  // Clothing FAB
  const clFab = $('cl-fab');
  if (clFab) {
    clFab.addEventListener('touchend', e => { e.preventDefault(); clShowSession(); });
    clFab.addEventListener('click', clShowSession);
  }

  // Restore session badge on page reload
  setTimeout(function() {
    if (typeof clUpdateSessionBadge === 'function') clUpdateSessionBadge();
    if (typeof clUpdateClFAB === 'function') clUpdateClFAB();
    // Update cl-fab badge number
    const sess = JSON.parse(localStorage.getItem('cl_ebay_session') || '[]');
    const fabN = document.getElementById('cl-fab-n');
    if (fabN && sess.length > 0) fabN.textContent = sess.length;
  }, 500);
});

function clShowSession() {
  const ebayCount = JSON.parse(localStorage.getItem('cl_ebay_session')||'[]').length;
  const oldCount  = clBulk.length;
  if (!ebayCount && !oldCount) { toast('No items in session'); return; }

  // Mostrar modal con opciones de export
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:999;display:flex;align-items:flex-end';
  modal.innerHTML = `
    <div style="background:var(--bg);border-radius:18px 18px 0 0;padding:24px;width:100%;max-width:480px;margin:0 auto">
      <div style="font-size:16px;font-weight:800;margin-bottom:4px">📦 Clothing Session</div>
      <div style="font-size:13px;color:var(--mu);margin-bottom:12px">${ebayCount} item(s) ready</div>
      <button onclick="clPreviewSession()" style="width:100%;background:none;border:1px solid #555;border-radius:8px;padding:8px;color:var(--mu);font-size:12px;cursor:pointer;margin-bottom:10px">🔍 Preview CSV content (debug)</button>
      <div id="cl-url-check" style="background:var(--sf2);border-radius:10px;padding:10px;margin-bottom:12px;font-size:12px;color:var(--mu)">⏳ Checking photo URLs...</div>

      <button onclick="this.closest('div[style]').remove();setTimeout(clExportEbayCSV,50)" style="width:100%;background:var(--sv);border:none;border-radius:12px;padding:15px;color:#000;font-size:14px;font-weight:800;cursor:pointer;margin-bottom:10px">
        📥 Export for eBay (.csv)
        <div style="font-size:11px;font-weight:400;margin-top:2px">Upload to eBay → Reports → Try it now → Upload template</div>
      </button>

      <button onclick="clClearSession();this.closest('div[style]').remove()" ontouchend="event.preventDefault();clClearSession();this.closest('div[style]').remove()" style="width:100%;background:none;border:1px solid var(--dw);border-radius:10px;padding:10px;color:var(--dw);font-size:13px;cursor:pointer;margin-bottom:8px">🗑 Clear Session (start fresh)</button>
      <button onclick="this.closest('div[style]').remove()" style="width:100%;background:none;border:none;padding:10px;color:var(--mu);font-size:14px;cursor:pointer">Cancel</button>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

  // Verify photo URLs immediately
  setTimeout(function() {
    const checkEl = document.getElementById('cl-url-check');
    if (!checkEl) return;
    const sess = JSON.parse(localStorage.getItem('cl_ebay_session') || '[]');
    const withPhotos = sess.filter(r => r.photos && r.photos.startsWith('https://'));
    const noPhotos   = sess.filter(r => !r.photos || !r.photos.startsWith('https://'));
    if (sess.length === 0) {
      checkEl.innerHTML = '⚠️ No items in session';
      checkEl.style.color = 'var(--dw)';
    } else if (noPhotos.length === 0) {
      checkEl.innerHTML = '✅ All ' + sess.length + ' items have photo URLs — ready for eBay!';
      checkEl.style.color = 'var(--sv)';
    } else {
      checkEl.innerHTML = '⚠️ ' + noPhotos.length + ' item(s) missing photo URLs (ImgBB not set up when scanned). '
        + 'Clear session below and re-scan to get photos. ' + withPhotos.length + ' item(s) have photos ✅';
      checkEl.style.color = 'var(--gd)';
    }
  }, 100);
}



// ── SESSION PERSISTENCE ───────────────────────────────────────
// Auto-save scanner bulk to localStorage on every change
function saveBulkToStorage() {
  try {
    if (bulk.length > 0) {
      localStorage.setItem('savvy_bulk_backup', JSON.stringify(bulk));
      localStorage.setItem('savvy_bulk_backup_ts', new Date().toISOString());
    }
  } catch(e) {}
}

// Auto-save clothing bulk
function saveClBulkToStorage() {
  try {
    if (clBulk.length > 0) {
      // Save without full photo data (too large) — save metadata only
      const lite = clBulk.map(it => ({...it, photos: {
        front:  it.photos?.front  ? '[foto]' : null,
        back:   it.photos?.back   ? '[foto]' : null,
        tag:    it.photos?.tag    ? '[foto]' : null,
        detail: it.photos?.detail ? '[foto]' : null,
      }}));
      localStorage.setItem('savvy_cl_backup', JSON.stringify(lite));
      localStorage.setItem('savvy_cl_backup_ts', new Date().toISOString());
    }
  } catch(e) {}
}

// Restore session on page load
function checkSavedSession() {
  const bulkBackup = localStorage.getItem('savvy_bulk_backup');
  const clBackup   = localStorage.getItem('savvy_cl_backup');
  const bulkTs     = localStorage.getItem('savvy_bulk_backup_ts');
  const clTs       = localStorage.getItem('savvy_cl_backup_ts');

  const hasBulk = bulkBackup && JSON.parse(bulkBackup).length > 0;
  const hasCl   = clBackup   && JSON.parse(clBackup).length > 0;

  if (!hasBulk && !hasCl) return;

  // Build restore banner
  let msg = '📦 Saved Session detectada: ';
  const parts = [];
  if (hasBulk) parts.push(JSON.parse(bulkBackup).length + ' scanner product(s)');
  if (hasCl)   parts.push(JSON.parse(clBackup).length + ' clothing item(s)');
  msg += parts.join(' + ');

  const ts = bulkTs || clTs;
  if (ts) {
    const d = new Date(ts);
    msg += ' · ' + d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  }

  // Show in dashboard panel instead of a floating banner
  const panel = document.getElementById('dash-session-panel');
  const desc  = document.getElementById('dash-session-desc');
  if (panel) panel.style.display = 'block';
  if (desc)  desc.textContent = msg;
}

function restoreSession() {
  try {
    const bulkData = localStorage.getItem('savvy_bulk_backup');
    if (bulkData) {
      bulk = JSON.parse(bulkData);
      updateFAB();
    }
    const clData = localStorage.getItem('savvy_cl_backup');
    if (clData) {
      clBulk = JSON.parse(clData);
      clUpdateClFAB();
    }
    toast('✅ Session restored');
  } catch(e) {
    toast('❌ Restore failed');
  }
  dismissRestoreBanner();
}

function discardSession() {
  localStorage.removeItem('savvy_bulk_backup');
  localStorage.removeItem('savvy_bulk_backup_ts');
  localStorage.removeItem('savvy_cl_backup');
  localStorage.removeItem('savvy_cl_backup_ts');
  dismissRestoreBanner();
}

function dismissRestoreBanner() {
  const panel = document.getElementById('dash-session-panel');
  if (panel) panel.style.display = 'none';
}

// ── WARN BEFORE LEAVING PAGE ──────────────────────────────────
window.addEventListener('beforeunload', function(e) {
  if (bulk.length > 0 || clBulk.length > 0) {
    // Auto-save before leaving
    saveBulkToStorage();
    saveClBulkToStorage();
    // Show browser warning
    e.preventDefault();
    e.returnValue = '¿Seguro que quieres salir? Tus escaneos se guardarán automáticamente.';
    return e.returnValue;
  }
});


// ═══════════════════════════════════════════════════════════
// LOCATION SCANNER MODULE — shared between Scanner + Clothing
// ═══════════════════════════════════════════════════════════
let _locCallback = null;
let _locTarget = null; // 'scanner' or 'clothing'

async function locOpen(target) {
  _locTarget = target;
  document.getElementById('loc-overlay').classList.add('on');
  savvyStopScan('loc-qr-video');
  savvyStartScan('loc-qr-video', async (code) => {
    locCapture(code.trim());
  });
}

async function locClose() {
  savvyStopScan('loc-qr-video');
  document.getElementById('loc-overlay').classList.remove('on');
}

function locCapture(code) {
  locClose();
  if (_locTarget === 'scanner') {
    if (cur) {
      cur.location = code;
      // Update location badge in result screen
      const badge = document.getElementById('loc-badge-scanner');
      if (badge) badge.outerHTML = locBadgeHTML(code, 'scanner');
    }
    toast('📍 Location: ' + code);
  } else if (_locTarget === 'clothing') {
    cl.location = code;
    // Update location badge in review screen
    const badge = document.getElementById('loc-badge-clothing');
    if (badge) badge.outerHTML = locBadgeHTML(code, 'clothing');
    toast('📍 Location: ' + code);
  }
}

function locClear(target) {
  if (target === 'scanner' && cur) {
    cur.location = '';
    const badge = document.getElementById('loc-badge-scanner');
    if (badge) badge.outerHTML = locEmptyHTML('scanner');
  } else if (target === 'clothing') {
    cl.location = '';
    const badge = document.getElementById('loc-badge-clothing');
    if (badge) badge.outerHTML = locEmptyHTML('clothing');
  }
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
  // Update header back button visibility
  const hdrBack = $('hdr-back');
  if (hdrBack) hdrBack.style.display = 'none';
}

function openScanner() {
  document.querySelectorAll('.scr').forEach(s => s.classList.remove('on'));
  $('scr-idle').classList.add('on');
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

