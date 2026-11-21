// "מצב סדרה" ו"שמור מילה": מעלים כתוביות או מדביקים טקסט → האפליקציה מוצאת מה עוד לא מכירים,
// מחשבת כמה מהטקסט תבינו, ומלמדת את המילים החסרות (עם המשפט המקורי) לפני הצפייה/הקריאה.
import { state, save } from './store.js';
import * as srs from './srs.js';
import * as tutor from './tutor.js';
import { say } from './speech.js';
import { icon } from './icons.js';
import { ALL } from './views.js';

let ctx, V;
export const init = (c) => { ctx = c; V = c.view; };
const $ = (s, el = V) => el.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const BYW = Object.fromEntries(ALL.map(w => [w.w, w]));
export const wordOf = (w) => BYW[w] || state.extra?.[w];
const back = (to = 'mine') => `<button class="back" data-go="${to}">${icon('chevron', 18, 'style="transform:scaleX(-1)"')} ${to === 'mine' ? 'סדרות וטקסטים' : 'תרגול'}</button>`;

// ================== שכיחות ובסיס מילה ==================
let RANK = null;
async function loadRank() {
  if (RANK) return RANK;
  const t = await fetch('data/rank.txt').then(r => r.text());
  RANK = new Map(); t.split('\n').forEach((w, i) => { if (w && !RANK.has(w)) RANK.set(w, i + 1); });
  return RANK;
}
const rk = (w) => RANK.get(w) ?? (BYW[w]?.fr || Infinity);
const IRR = Object.fromEntries(('was:be were:be been:be is:be are:be am:be had:have has:have did:do done:do does:do went:go gone:go goes:go made:make said:say saw:see seen:see took:take taken:take got:get gotten:get came:come knew:know known:know thought:think told:tell gave:give given:give found:find felt:feel left:leave brought:bring began:begin begun:begin kept:keep held:hold wrote:write written:write stood:stand heard:hear meant:mean met:meet ran:run paid:pay sat:sit spoke:speak spoken:speak lay:lie led:lead grew:grow grown:grow lost:lose fell:fall fallen:fall sent:send built:build understood:understand drew:draw drawn:draw broke:break broken:break spent:spend rose:rise risen:rise drove:drive driven:drive bought:buy wore:wear worn:wear chose:choose chosen:choose sought:seek threw:throw thrown:throw caught:catch dealt:deal won:win forgot:forget forgotten:forget sold:sell fought:fight taught:teach ate:eat eaten:eat slept:sleep flew:fly flown:fly hid:hide hidden:hide bit:bite bitten:bite shook:shake shaken:shake stole:steal stolen:steal swam:swim sang:sing sung:sing rang:ring rung:ring drank:drink drunk:drink froze:freeze frozen:freeze woke:wake woken:wake forgave:forgive forgiven:forgive hung:hang struck:strike swore:swear sworn:swear tore:tear torn:tear fed:feed fled:flee bent:bend lent:lend shot:shoot slid:slide stuck:stick stung:sting swung:swing wept:weep wound:wind bled:bleed bred:breed dug:dig sank:sink sunk:sink spun:spin sprang:spring blew:blow blown:blow lit:light mistook:mistake overcame:overcome rode:ride ridden:ride shone:shine shrank:shrink stank:stink strove:strive withdrew:withdraw men:man women:woman children:child feet:foot teeth:tooth mice:mouse geese:goose wives:wife lives:life knives:knife leaves:leaf wolves:wolf halves:half shelves:shelf thieves:thief better:good best:good worse:bad worst:bad').split(' ').map(p => p.split(':')));
const NT = { "can't": 'can', "won't": 'will', "shan't": 'shall', "ain't": 'be' };
function cands(t) {
  const c = [t];
  if (IRR[t]) c.unshift(IRR[t]);
  if (/ies$/.test(t)) c.push(t.slice(0, -3) + 'y');
  if (/ied$/.test(t)) c.push(t.slice(0, -3) + 'y');
  if (/(s|x|z|ch|sh)es$/.test(t)) c.push(t.slice(0, -2));
  if (/s$/.test(t) && !/ss$/.test(t)) c.push(t.slice(0, -1));
  if (/ed$/.test(t)) { c.push(t.slice(0, -2), t.slice(0, -1)); if (/(.)\1ed$/.test(t)) c.push(t.slice(0, -3)); }
  if (/ing$/.test(t)) { c.push(t.slice(0, -3), t.slice(0, -3) + 'e'); if (/(.)\1ing$/.test(t)) c.push(t.slice(0, -4)); }
  if (/ly$/.test(t)) c.push(t.slice(0, -2), t.slice(0, -3) + 'y');
  if (/er$/.test(t)) c.push(t.slice(0, -2), t.slice(0, -1));
  if (/est$/.test(t)) c.push(t.slice(0, -3), t.slice(0, -2));
  return c;
}
// בסיס המילה: אם הצורה עצמה במאגר – היא; אחרת צורת בסיס שקיימת ושכיחה יותר
export function lemma(t) {
  if (IRR[t]) return IRR[t];
  if (BYW[t] || state.extra?.[t]) return t;
  for (const c of cands(t).slice(1)) if (c.length > 2 && (BYW[c] || state.extra?.[c])) return c;
  const r0 = rk(t);
  if (/(ly|er|est)$/.test(t) && RANK.has(t)) return t; // quickly / teacher – מילים בפני עצמן
  for (const c of cands(t).slice(1)) if (c.length > 2 && RANK.has(c) && rk(c) < r0) return c;
  return t;
}
// כמה מילים "סביר שמכירים" לפי בדיקת הרמה (משמש רק כהערכה; המשתמש מתקן ב"אני מכיר")
const baseKnown = () => Math.max(600, Math.round((state.placement?.size || 1500) * .8));
export const isKnown = (w) => !!state.known?.[w] || (!!srs.get('w:' + w) && (srs.get('w:' + w).ivl || 0) >= 3) || (rk(w) <= baseKnown() && !state.unknownW?.[w] && !srs.get('w:' + w));
const isLearning = (w) => !!srs.get('w:' + w) && !isKnown(w);

// ================== ניתוח טקסט ==================
export function cleanSrt(t) {
  return t.replace(/\r/g, '').replace(/^WEBVTT.*$/m, '')
    .replace(/^\d+\s*$/gm, '').replace(/^\d\d:\d\d(:\d\d)?[.,]\d+\s*-->.*$/gm, '')
    .replace(/<[^>]+>|\{[^}]*\}|\[[^\]]*\]|♪/g, ' ').replace(/^\s*-\s*/gm, '').replace(/\n{2,}/g, '\n').trim();
}
const splitSent = (t) => t.replace(/\n(?=[a-z])/g, ' ').split(/(?<=[.!?…])\s+|\n+/).map(s => s.trim()).filter(s => /[a-z]/i.test(s));
export async function analyze(text) {
  await loadRank();
  const sents = splitSent(text), occ = [];
  const lowSeen = new Set(), midCap = new Set(); // אותיות קטנות = לא שם; אות גדולה באמצע משפט = חשד לשם
  sents.forEach((s, si) => {
    (s.match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g) || []).forEach((raw, ti) => {
      let low = raw.replace('’', "'").toLowerCase();
      if (NT[low]) low = NT[low]; else if (/n't$/.test(low)) low = low.slice(0, -3); else low = low.replace(/'.*$/, '');
      if (!low || low.length < 2 && low !== 'a' && low !== 'i') return;
      if (/^[a-z]/.test(raw)) lowSeen.add(low); else if (ti > 0 && low !== 'i') midCap.add(low);
      occ.push([low, si]);
    });
  });
  const words = new Map(); let total = 0;
  for (const [low, si] of occ) {
    const known = RANK.has(low) || BYW[low] || state.extra?.[low];
    const nm = !lowSeen.has(low) && !BYW[low] && (midCap.has(low) || !known || rk(low) > 1500); // רק באות גדולה → כנראה שם פרטי
    if (!known && (low.length < 4 || /(.)\1\1/.test(low))) continue; // קצרה מדי / רעש
    if (!nm) total++;
    const L = known ? lemma(low) : (cands(low).slice(1).find(c => RANK.has(c)) || low);
    const e = words.get(L) || { w: L, n: 0, forms: new Set(), s: si, nm };
    e.n++; e.forms.add(low); words.set(L, e);
  }
  const list = [...words.values()].map(e => ({ w: e.w, n: e.nm ? 0 : e.n, nm: e.nm, form: [...e.forms][0], r: rk(e.w), ex: sents[e.s] }));
  return { sents, list, total };
}
export function coverage(A, extraKnown = new Set()) {
  if (!A.total) return 1;
  const k = A.list.reduce((a, e) => a + (isKnown(e.w) || extraKnown.has(e.w) ? e.n : 0), 0);
  return k / A.total;
}
const pct = (x) => Math.round(x * 1000) / 10 + '%';
const covMsg = (c) => c >= .98 ? 'תבין כמעט הכול, בכיף' : c >= .95 ? 'תבין טוב, עם כמה מילים חסרות' : c >= .9 ? 'תבין את העיקר, אבל תפספס דברים' : 'יהיה קשה לעקוב';

// ================== תרגום (AI) ==================
const TR_SCHEMA = { type: 'object', additionalProperties: false, properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { w: { type: 'string' }, he: { type: 'string' }, ipa: { type: 'string' } }, required: ['w', 'he', 'ipa'] } } }, required: ['items'] };
async function translate(items) {
  const out = {};
  for (let i = 0; i < items.length; i += 40) {
    const batch = items.slice(i, i + 40);
    const r = await tutor.ask('You are a precise English-Hebrew dictionary for learners. Output JSON only.',
      `For each English word, give its Hebrew meaning AS USED in the given sentence (1-4 Hebrew words, natural modern Hebrew; for phrasal or idiomatic use, translate the sense), and its General American IPA without slashes.\n${batch.map(x => `- ${x.w} :: ${x.ex}`).join('\n')}`, TR_SCHEMA);
    (r.items || []).forEach(x => { if (x.w && x.he) out[x.w.toLowerCase()] = x; });
  }
  return out;
}
// מוסיף מילה לאוצר האישי (state.extra) – אם היא לא במאגר הקבוע
function addExtra(e, tr, deckId) {
  if (BYW[e.w]) return BYW[e.w];
  const X = state.extra ||= {};
  X[e.w] = { ...(X[e.w] || {}), w: e.w, he: tr?.he || X[e.w]?.he || '', ipa: (tr?.ipa || X[e.w]?.ipa || '').replace(/^\/|\/$/g, ''), ex: X[e.w]?.ex || e.ex, form: e.form, fr: e.r === Infinity ? 99999 : e.r, src: deckId };
  return X[e.w];
}

// ================== ספרייה ==================
export function library() {
  const D = Object.values(state.decks || {}).sort((a, b) => b.t - a.t);
  V.innerHTML = `${back('practice')}<h2>סדרות וטקסטים</h2>
    <p class="sub">מעלים כתוביות של פרק שרוצים לראות (או מדביקים כתבה, שיר, הודעה). האפליקציה מוצאת את המילים שעוד לא מכירים ומלמדת אותן לפני הצפייה.</p>
    <label class="prow" for="srt" style="cursor:pointer"><span class="ic">${icon('play')}</span><span class="t"><b>העלה כתוביות של פרק</b><small>קובץ srt / vtt / txt</small></span><span class="st">${icon('chevron')}</span></label>
    <input type="file" id="srt" accept=".srt,.vtt,.txt,.ass,text/plain" hidden>
    <button class="prow" id="paste"><span class="ic">${icon('text')}</span><span class="t"><b>הדבק טקסט</b><small>כתבה, תמליל מיוטיוב, שיר, מייל</small></span><span class="st">${icon('chevron')}</span></button>
    <details class="card" style="padding:12px 16px"><summary><b>איפה משיגים כתוביות?</b></summary><p class="sub" style="margin:8px 0 0">מחפשים בגוגל: <span class="ltr">"שם הסדרה S01E01 english srt"</span>. אתרים נפוצים: OpenSubtitles, Subdl, Addic7ed. מורידים את קובץ ה-srt באנגלית ומעלים כאן.</p></details>
    ${D.length ? `<h3 style="margin-top:18px">ההכנות שלי</h3>${D.map(d => { const left = d.words.filter(w => !isKnown(w) && !isLearning(w)).length, learn = d.words.filter(isLearning).length; return `<button class="prow" data-deck="${d.id}"><span class="ic">${icon(d.type === 'srt' ? 'play' : 'book')}</span><span class="t"><b>${esc(d.title)}</b><small>${left ? `${left} מילים ללמוד` : 'מוכן! ✓'}${learn ? ` · ${learn} בתרגול` : ''} · הבנה ${pct(d.cov0)} ← ${pct(deckCov(d))}</small></span><span class="st">${icon('chevron')}</span></button>`; }).join('')}` : ''}`;
  V.querySelectorAll('[data-go]').forEach(b => b.onclick = () => ctx.go(b.dataset.go));
  $('#srt').onchange = async (ev) => { const f = ev.target.files[0]; if (!f) return; const t = await f.text(); open({ title: f.name.replace(/\.(srt|vtt|txt|ass)$/i, '').replace(/[._]+/g, ' ').slice(0, 60), text: cleanSrt(t), type: 'srt' }); };
  $('#paste').onclick = () => pasteScreen();
  V.querySelectorAll('[data-deck]').forEach(b => b.onclick = () => deck(b.dataset.deck));
}
function deckCov(d) { const A = { list: d.stats, total: d.total }; return coverage(A, new Set(d.words.filter(w => srs.get('w:' + w)))); }

export function pasteScreen(pre = '', title = '') {
  V.innerHTML = `${back()}<h2>הדבק טקסט</h2>
    <input id="ttl" class="srch" placeholder="שם (לא חובה)" value="${esc(title)}">
    <textarea id="tx" class="srch ltr" rows="10" placeholder="הדבק כאן טקסט באנגלית…" style="resize:vertical;font-size:1rem;line-height:1.5">${esc(pre)}</textarea>
    <button class="btn o big full" id="go" ${pre ? '' : 'disabled'}>נתח את הטקסט</button>`;
  V.querySelectorAll('[data-go]').forEach(b => b.onclick = () => ctx.go(b.dataset.go));
  const tx = $('#tx'); tx.oninput = () => { $('#go').disabled = tx.value.trim().length < 20; };
  $('#go').onclick = () => open({ title: $('#ttl').value.trim() || tx.value.trim().split(/\s+/).slice(0, 5).join(' '), text: tx.value, type: 'text' });
}

// ================== ניתוח ובחירת מילים ==================
let CUR;
async function open({ title, text, type }) {
  V.innerHTML = `<div class="center" style="padding:60px 0"><div class="spin"></div><p class="sub" style="margin-top:14px">מנתח…</p></div>`;
  const A = await analyze(text);
  if (A.total < 15) { ctx.toast('לא מצאתי מספיק טקסט באנגלית'); return library(); }
  const unk = A.list.filter(e => !isKnown(e.w) && e.w.length > 2).sort((a, b) => (a.nm - b.nm) || b.n - a.n || a.r - b.r);
  const sel = new Set(unk.filter(e => !e.nm).filter(e => e.n >= 2 || e.r <= 20000 || e.r === Infinity).slice(0, 40).map(e => e.w));
  CUR = { title, text: text.slice(0, 80000), type, A, unk, sel };
  pickScreen();
}
function pickScreen() {
  const { A, unk, sel, title } = CUR;
  const c0 = coverage(A), c1 = coverage(A, sel);
  V.innerHTML = `${back()}<h2 style="margin-bottom:4px">${esc(title)}</h2>
    <div class="card"><div class="row" style="flex-wrap:nowrap;gap:14px">
      <div class="cov"><b>${pct(c0)}</b><small>מבין עכשיו</small></div>${icon('chevron', 22, 'style="transform:scaleX(-1);color:var(--mut)"')}
      <div class="cov good"><b id="c1">${pct(c1)}</b><small>אחרי ההכנה</small></div></div>
      <p class="sub" style="margin:10px 0 0">${A.total.toLocaleString('en')} מילים בטקסט · ${unk.length} שאתה כנראה לא מכיר. <b id="cm">${covMsg(c1)}</b></p></div>
    <div class="row" style="justify-content:space-between;margin:14px 0 6px"><b>מה ללמוד? (<span id="ns">${sel.size}</span>)</b><button class="lp-skip" id="all" style="padding:0">${sel.size ? 'נקה הכול' : 'בחר הכול'}</button></div>
    <p class="mut" style="font-size:.85rem;margin:0 0 8px">מסומן = נלמד. "מכיר" = לא יופיע שוב באף טקסט. המספר = כמה פעמים זה מופיע.</p>
    <div id="ul">${unk.slice(0, 150).map(e => `<div class="urow ${sel.has(e.w) ? 'on' : ''}" data-w="${esc(e.w)}"><button class="uchk" aria-pressed="${sel.has(e.w)}" aria-label="ללמוד את ${esc(e.w)}">${icon('check', 18, 'stroke-width="3"')}</button>
      <div class="t"><b class="ltr">${esc(e.w)}</b> ${e.nm ? '<span class="pill">אולי שם</span>' : `<span class="pill">×${e.n}</span>`}${BYW[e.w] ? ` <span class="mut" style="font-size:.85rem">${esc(BYW[e.w].he)}</span>` : ''}<div class="ltr mut ex1">${esc(e.ex.slice(0, 110))}</div></div>
      <button class="ukn" aria-label="אני מכיר את ${esc(e.w)}">מכיר</button></div>`).join('')}</div>
    <div class="lp-foot"><button class="btn o big full" id="mk" ${sel.size ? '' : 'disabled'}>צור הכנה · ${sel.size} מילים</button>${!tutor.enabled() ? '<div class="mut center" style="font-size:.82rem">בלי מפתח AI אפשר ללמוד רק מילים שיש להן תרגום במאגר.</div>' : ''}</div>`;
  V.querySelectorAll('[data-go]').forEach(b => b.onclick = () => ctx.go(b.dataset.go));
  const upd = () => { const c = coverage(A, sel); $('#c1').textContent = pct(c); $('#cm').textContent = covMsg(c); $('#ns').textContent = sel.size; $('#mk').textContent = `צור הכנה · ${sel.size} מילים`; $('#mk').disabled = !sel.size; };
  V.querySelectorAll('.urow').forEach(r => {
    const w = r.dataset.w;
    $('.uchk', r).onclick = () => { sel.has(w) ? sel.delete(w) : sel.add(w); r.classList.toggle('on', sel.has(w)); $('.uchk', r).setAttribute('aria-pressed', sel.has(w)); upd(); };
    $('.ukn', r).onclick = () => { (state.known ||= {})[w] = 1; save(); sel.delete(w); r.remove(); CUR.unk = CUR.unk.filter(e => e.w !== w); const c0n = coverage(A); V.querySelector('.cov b').textContent = pct(c0n); upd(); };
  });
  $('#all').onclick = () => { if (sel.size) sel.clear(); else unk.slice(0, 150).forEach(e => sel.add(e.w)); pickScreen(); };
  $('#mk').onclick = () => create();
}
async function create() {
  const { A, sel, title, type, text } = CUR;
  const items = A.list.filter(e => sel.has(e.w));
  V.innerHTML = `<div class="center" style="padding:60px 0"><div class="spin"></div><p class="sub" style="margin-top:14px">מתרגם ${items.length} מילים לפי ההקשר…</p></div>`;
  let tr = {};
  const need = items.filter(e => !BYW[e.w] && !state.extra?.[e.w]?.he);
  if (need.length && tutor.enabled()) { try { tr = await translate(need); } catch (e) { ctx.toast(tutor.errMsg(e)); } }
  const id = Date.now().toString(36);
  const words = [];
  items.forEach(e => { const w = addExtra(e, tr[e.w], id); if (w.he) { words.push(e.w); (state.unknownW ||= {})[e.w] = 1; } });
  const D = state.decks ||= {};
  const cx = Object.fromEntries(items.filter(e => words.includes(e.w)).map(e => [e.w, { ex: e.ex.slice(0, 220), form: e.form }]));
  D[id] = { id, title, type, t: Date.now(), words, cx, total: A.total, cov0: coverage(A), stats: A.list.map(e => ({ w: e.w, n: e.n })), text };
  // שומרים טקסט מלא רק ל-8 האחרונים (מקום באחסון)
  Object.values(D).sort((a, b) => b.t - a.t).slice(8).forEach(d => { delete d.text; });
  state.activeDeck = id; save();
  if (words.length < items.length) ctx.toast(`${items.length - words.length} מילים בלי תרגום דולגו`);
  deck(id);
}

// ================== דף הכנה ==================
export function deck(id) {
  const d = state.decks?.[id]; if (!d) return library();
  const ws = d.words.map(wordOf).filter(Boolean);
  const todo = ws.filter(w => !srs.get('w:' + w.w) && !state.known?.[w.w]), learning = ws.filter(w => srs.get('w:' + w.w));
  const c = deckCov(d), done = !todo.length;
  V.innerHTML = `${back()}<h2 style="margin-bottom:4px">${esc(d.title)}</h2>
    <div class="card"><div class="row" style="flex-wrap:nowrap;gap:14px"><div class="cov"><b>${pct(d.cov0)}</b><small>בהתחלה</small></div>${icon('chevron', 22, 'style="transform:scaleX(-1);color:var(--mut)"')}<div class="cov good"><b>${pct(c)}</b><small>עכשיו</small></div></div>
      <div class="prog" style="margin-top:12px"><i style="width:${ws.length ? Math.round(learning.length / ws.length * 100) : 100}%"></i></div>
      <p class="sub" style="margin:8px 0 0">${learning.length} מתוך ${ws.length} מילים נלמדו. <b>${covMsg(c)}</b></p></div>
    ${done ? `<div class="hero center"><b style="font-size:1.2rem">מוכן לצפייה! 🎬</b><p class="sub" style="margin:6px 0 0">המילים ימשיכו לחזור בחזרות היומיות.</p></div>`
      : `<button class="btn o big full" id="learn">${icon('sparkle')} למד ${Math.min(6, todo.length)} מילים הבאות</button>`}
    ${d.text ? `<button class="btn g full" id="read" style="margin-top:10px">${icon('book')} קרא את הטקסט (מילים מסומנות)</button>` : ''}
    <div class="card" style="margin-top:12px"><b>המילים</b><div style="margin-top:8px">${ws.map(w => `<button class="w ${srs.get('w:' + w.w) ? 'ok' : 'mid'}" data-say="${esc(w.w)}">${esc(w.w)} <small>${esc(w.he)}</small></button>`).join('')}</div></div>
    <button class="lp-skip" id="del" style="margin:8px auto;display:block">מחק את ההכנה</button>`;
  V.querySelectorAll('[data-go]').forEach(b => b.onclick = () => ctx.go(b.dataset.go));
  V.querySelectorAll('[data-say]').forEach(b => b.onclick = () => say(b.dataset.say));
  if ($('#learn')) $('#learn').onclick = () => { state.activeDeck = id; save(); ctx.learn.startLesson(null, { words: todo.slice(0, 6).map(w => ({ ...w, ...(d.cx?.[w.w] || {}) })), deck: id }); }; // המשפט מהפרק עצמו
  if ($('#read')) $('#read').onclick = () => reader(id);
  $('#del').onclick = () => { if (!confirm('למחוק את ההכנה? (מילים שכבר למדת יישארו בחזרות)')) return; delete state.decks[id]; if (state.activeDeck === id) state.activeDeck = null; save(); library(); };
}
export function activeDeck() {
  const d = state.decks?.[state.activeDeck]; if (!d) return null;
  const left = d.words.filter(w => !srs.get('w:' + w) && !state.known?.[w]).length;
  return { d, left };
}

// ================== קורא: מילים מסומנות + "שמור מילה" ==================
export async function reader(id) {
  const d = state.decks[id]; await loadRank();
  const sents = splitSent(d.text).slice(0, 400);
  const cls = (low) => { const L = lemma(low); if (d.words.includes(L)) return srs.get('w:' + L) ? 'rl' : 'rn'; if (!RANK.has(low) && !BYW[low]) return ''; return isKnown(L) ? '' : 'ru'; };
  V.innerHTML = `${back()}<h2 style="margin-bottom:4px">${esc(d.title)}</h2>
    <p class="mut" style="font-size:.85rem"><span class="rn">כתום</span> = ללמוד · <span class="rl">ירוק</span> = בתרגול · <span class="ru">מקווקו</span> = אולי לא מוכר. לחץ על מילה.</p>
    <div class="reader ltr">${sents.map((s, i) => `<p data-s="${i}">${s.replace(/[A-Za-z]+(?:['’][A-Za-z]+)?|[^A-Za-z]+/g, (t) => /^[A-Za-z]/.test(t) ? (() => { const low = t.toLowerCase().replace(/['’].*$/, ''); const c = cls(low); return `<span class="tk ${c}" data-t="${esc(low)}">${esc(t)}</span>`; })() : esc(t))}</p>`).join('')}</div>`;
  V.querySelectorAll('[data-go]').forEach(b => b.onclick = () => ctx.go(b.dataset.go));
  V.querySelector('.reader').onclick = (ev) => { const tk = ev.target.closest('.tk'); if (!tk) return; wordSheet(id, tk.dataset.t, sents[+tk.parentElement.dataset.s], tk); };
}
async function wordSheet(id, low, sent, tk) {
  const d = state.decks[id], L = lemma(low), known = wordOf(L);
  const s = document.getElementById('sheet'); const body = document.getElementById('sheetBody'); s.hidden = false;
  const inDeck = d.words.includes(L);
  const render = (he, ipa) => {
    body.innerHTML = `<div class="ltr" style="text-align:left"><b style="font-size:1.6rem">${esc(L)}</b> ${ipa ? `<span class="ipa">/${esc(ipa)}/</span>` : ''} <button class="lp-audio" id="ws">${icon('sound', 18)}</button></div>
      <div style="font-size:1.2rem;font-weight:700;margin:6px 0">${he ? esc(he) : '<span class="mut">אין תרגום</span>'}</div>
      <div class="ex ltr">${esc(sent)}</div>
      ${inDeck ? `<p class="sub">${srs.get('w:' + L) ? 'כבר בתרגול ✓' : 'כבר ברשימת ההכנה'}</p>` : `<div class="row" style="margin-top:12px"><button class="btn g" id="wk">אני מכיר</button><button class="btn o" id="wa" ${he ? '' : 'disabled'}>${icon('sparkle')} שמור ללמידה</button></div>`}`;
    $('#ws', body).onclick = () => say(L);
    if ($('#wk', body)) $('#wk', body).onclick = () => { (state.known ||= {})[L] = 1; delete state.unknownW?.[L]; save(); s.hidden = true; tk.className = 'tk'; };
    if ($('#wa', body)) $('#wa', body).onclick = () => { addExtra({ w: L, form: low, ex: sent, r: rk(L) }, { he, ipa }, id); d.words.push(L); (d.cx ||= {})[L] = { ex: sent.slice(0, 220), form: low }; (state.unknownW ||= {})[L] = 1; save(); s.hidden = true; ctx.toast('נשמר! יופיע בשיעור הבא של ההכנה'); V.querySelectorAll(`.tk[data-t="${low}"]`).forEach(x => x.className = 'tk rn'); };
  };
  if (known?.he) return render(known.he, known.ipa);
  render('', ''); if (!tutor.enabled()) return;
  body.querySelector('div:nth-child(2)').innerHTML = '<span class="mut">מתרגם…</span>';
  try { const tr = await translate([{ w: L, ex: sent }]); const x = tr[L] || Object.values(tr)[0]; render(x?.he || '', x?.ipa || ''); } catch (e) { render('', ''); ctx.toast(tutor.errMsg(e)); }
}
