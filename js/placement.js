// מבחן רמה v2 – מדויק: אוצר מילים *פעיל* (השלמת מילה במשפט, כמו Productive Vocabulary Levels Test),
// דקדוק (4 שאלות לרמה, מעבר ב-3/4), שמיעה (בחירה + הכתבה), אוזן, דיבור. אדפטיבי, ~10 דקות.
import { state, save, addXP } from './store.js';
import { say, listen, compare, stopSpeaking } from './speech.js';
import * as azure from './azure.js';
import * as srs from './srs.js';
import { ALL } from './views.js';
import { LEVELS, SELF, YESNO, PSEUDO, GRAMMAR, LISTEN, EAR, SPEAK } from '../data/placement.js';
import { icon } from './icons.js';

let ctx, V;
export const init = (c) => { ctx = c; V = c.view; };
const $ = (s) => V.querySelector(s);
const shuf = (a) => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);
const esc = (t) => String(t).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const reEsc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PARTS = ['אוצר מילים', 'דקדוק', 'שמיעה', 'אוזן', 'דיבור'];

// רצועות שכיחות (לפי דיבור אמיתי) שבהן יש לנו מילים עם תרגום ומשפט
const VB = [[0, 500], [500, 1000], [1000, 2000], [2000, 3500], [3500, 5000], [5000, 8000]];
const vocabLevel = (n) => n < 300 ? 0 : n < 800 ? 1 : n < 1600 ? 2 : n < 3000 ? 3 : n < 5000 ? 4 : n < 8000 ? 5 : 6;
const lev = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
const okWord = (ans, tok, base) => { const a = ans.trim().toLowerCase().replace(/[^a-z']/g, ''); if (!a) return false; const t = tok.toLowerCase(), b = base.toLowerCase(); return a === t || a === b || (t.length >= 6 && lev(a, t) <= 1); };

// פריט: משפט עם המילה חסרה + פירוש בעברית + אות ראשונה
function item(w) {
  const m = w.ex.match(new RegExp(`\\b(${reEsc(w.w)}\\w*)\\b`, 'i')); if (!m) return null;
  const tok = m[1]; if (tok.length < 3) return null;
  return { w, tok, before: w.ex.slice(0, m.index), after: w.ex.slice(m.index + tok.length) };
}
const poolFor = ([a, b]) => shuf(ALL.filter(w => w.fr > a && w.fr <= b)).map(item).filter(Boolean);

let T;
function frame(part, html, prog) {
  V.innerHTML = `<div class="ptest">
    <div class="ptop"><button class="back" id="pq">${icon('x', 20)} יציאה</button><span>${part ? `חלק ${PARTS.indexOf(part) + 1}/5 · <b>${part}</b>` : ''}</span></div>
    ${prog != null ? `<div class="prog" style="margin-bottom:16px"><i style="width:${Math.round(prog * 100)}%"></i></div>` : ''}${html}</div>`;
  $('#pq').onclick = () => { if (confirm('לצאת מהמבחן? ההתקדמות בו לא תישמר.')) { stopSpeaking(); ctx.go('today'); } };
}

export function start() {
  T = { self: 1, vb: [], used: new Set(), correct: [], wrongWords: [], yes: { hits: [0, 0], n: [0, 0], fa: 0, pn: 0 }, gram: { passed: 0, wrong: [] }, lis: { level: 0 }, ear: [], speak: null, prodSpeak: null, asked: 0 };
  frame(null, `<div class="center"><div style="color:var(--brand-ink)">${icon('target', 56)}</div><h2>מבחן רמה</h2>
    <p class="sub">כ-10 דקות. המבחן מתאים את עצמו אליך ובודק מה אתה <b>באמת</b> יודע להפיק – לא רק לזהות.</p></div>
    <div class="card"><b>מה נבדוק:</b><div style="margin-top:6px;line-height:1.9">${icon('book', 18)} כמה מילים אתה יודע להשתמש בהן<br>${icon('sparkle', 18)} דקדוק<br>${icon('ear', 18)} הבנת דיבור + הכתבה<br>${icon('sound', 18)} צלילים שקשים לדוברי עברית<br>${icon('mic', 18)} דיבור</div></div>
    <div class="tip">${icon('bulb', 18)} אל תנחש. "לא יודע" נותן תוצאה מדויקת יותר – וככה התרגול יתאים בדיוק לרמה שלך.</div>
    <button class="btn o big full" id="go">בוא נתחיל</button>`);
  $('#go').onclick = selfStep;
}

function selfStep() {
  frame(null, `<h2>איך היית מתאר את האנגלית שלך?</h2><p class="sub">רק כדי לבחור מאיפה להתחיל.</p>
    ${SELF.map(([t, l]) => `<button class="opt" data-l="${l}">${t}</button>`).join('')}`);
  V.querySelectorAll('.opt').forEach(b => b.onclick = () => { T.self = +b.dataset.l; const sb = [0, 0, 1, 2, 3][T.self] ?? 0; T.vstart = sb; vocabBand(sb, false); });
}

// ---------- 1. אוצר מילים פעיל: השלם את המילה ----------
function vocabBand(bi, wentDown) {
  const r = T.vb[bi] ||= { ok: 0, n: 0 };
  const pool = poolFor(VB[bi]).filter(it => !T.used.has(it.w.w));
  let i = 0, extra = false; const target = () => (extra ? 10 : 6);
  const ask = () => {
    const it = pool[i]; if (!it) return decide();
    T.used.add(it.w.w);
    const hint = it.tok[0] + ' ' + '_ '.repeat(it.tok.length - 1).trim();
    frame('אוצר מילים', `<p class="sub center">כתוב את המילה החסרה באנגלית</p>
      <div class="card center" style="font-size:1.25rem;font-weight:700">${esc(it.w.he)}</div>
      <div class="ex" style="font-size:1.2rem;line-height:1.9">${esc(it.before)}<span class="ltr" style="color:var(--brand-ink);font-weight:800;letter-spacing:2px">${esc(hint)}</span>${esc(it.after)}</div>
      <input id="ans" class="srch ltr" style="font-size:1.25rem;text-align:left" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" lang="en" enterkeyhint="done" placeholder="${esc(it.tok[0])}…" aria-label="המילה החסרה">
      <div class="row"><button class="btn o big" id="ok" style="flex:2">בדוק</button><button class="btn g" id="idk" style="flex:1">לא יודע</button></div>`, Math.min(.95, T.asked / 30));
    const inp = $('#ans'); setTimeout(() => inp.focus(), 50);
    const next = (ans) => {
      T.asked++; r.n++;
      if (okWord(ans, it.tok, it.w.w)) { r.ok++; T.correct.push(it.w.w); } else T.wrongWords.push(it.w.w);
      i++; if (r.n >= target()) return decide(); ask();
    };
    $('#ok').onclick = () => next(inp.value); $('#idk').onclick = () => next('');
    inp.onkeydown = (e) => { if (e.key === 'Enter' && inp.value.trim()) next(inp.value); };
  };
  const decide = () => {
    const p = r.n ? r.ok / r.n : 0;
    if (!extra && r.n >= 6 && p > .34 && p < .84 && pool.length > i) { extra = true; return ask(); } // לא חד-משמעי: עוד 4 שאלות
    if (p >= .6 && bi < VB.length - 1) return vocabBand(bi + 1, wentDown);
    if (p >= .6 && bi === VB.length - 1) return yesNo();
    if (p < .5 && bi > 0 && !wentDown && !T.vb[bi - 1]) return vocabBand(bi - 1, true); // התחלנו גבוה מדי
    grammar();
  };
  ask();
}

// ---------- 1ב. מעבר ל-8,000: מכיר/לא מכיר עם מילים מומצאות (רק למתקדמים מאוד) ----------
function yesNo() {
  const bands = YESNO.slice(2); // 8-12K, 12-16K
  const items = shuf([...bands.flatMap((b, bi) => shuf(b.words).slice(0, 6).map(w => ({ w, bi }))), ...shuf(PSEUDO).slice(0, 6).map(w => ({ w, bi: -1 }))]);
  let i = 0; const Y = T.yes;
  const ask = () => {
    const it = items[i];
    frame('אוצר מילים', `<p class="sub center">אתה יודע מה המילה אומרת?</p><p class="sub center" style="font-size:.82rem">חלק מהמילים מומצאות – סמן "יודע" רק אם אתה בטוח.</p>
      <div class="word center" style="margin:18px 0 24px">${esc(it.w)}</div>
      <div class="row"><button class="btn" id="y">יודע</button><button class="btn g" id="n">לא יודע</button></div>`, .9);
    const ans = (yes) => { if (it.bi < 0) { Y.pn++; if (yes) Y.fa++; } else { Y.n[it.bi]++; if (yes) Y.hits[it.bi]++; } if (++i < items.length) ask(); else grammar(); };
    $('#y').onclick = () => ans(true); $('#n').onclick = () => ans(false);
  };
  ask();
}

// ---------- 2. דקדוק: 4 שאלות לרמה, מעבר ב-3 ----------
function grammar() {
  const byL = (l) => shuf(GRAMMAR.filter(g => g[0] === l));
  let L = T.self >= 3 ? 2 : 1, wentDown = false, items = byL(L), i = 0, ok = 0, asked = 0; const G = T.gram;
  const ask = () => {
    const [, q, opts, a, why] = items[i];
    frame('דקדוק', `<p class="sub center">בחר את המילה החסרה</p><div class="ex center ltr" style="font-size:1.3rem">${esc(q).replace('___', '<b>_____</b>')}</div>
      ${opts.map((o, k) => `<button class="opt ltr" data-k="${k}">${esc(o)}</button>`).join('')}<button class="opt idk" data-k="-1">לא יודע</button>`, Math.min(.95, asked / 16));
    V.querySelectorAll('.opt').forEach(btn => btn.onclick = () => {
      asked++; if (+btn.dataset.k === a) ok++; else G.wrong.push({ q, ans: opts[a], why, lvl: L });
      if (++i < items.length) return ask();
      if (ok >= 3) { G.passed = L; if (L < 5) { L++; items = byL(L); i = 0; ok = 0; return ask(); } return listening(); }
      if (!wentDown && L > 1 && G.passed === 0) { wentDown = true; L--; items = byL(L); i = 0; ok = 0; return ask(); }
      listening();
    });
  };
  ask();
}

// ---------- 3. שמיעה: בחירה (2/2) + הכתבה של מילה מהמשפט (מרמה A2) ----------
function listening() {
  let L = 1, i = 0, ok = 0, asked = 0;
  const lvItems = (l) => LISTEN.filter(x => x[0] === l);
  let items = lvItems(1);
  const ask = () => {
    const [, text, rate, opts, a] = items[i]; let plays = 0;
    frame('שמיעה', `<p class="sub center">הקשב ובחר מה נאמר (עד 2 השמעות)</p><button class="speaker" id="spk" aria-label="השמע">${icon('sound', 44)}</button><div class="center sub" id="pl"></div>
      ${opts.map((o, k) => `<button class="opt ltr" data-k="${k}">${esc(o)}</button>`).join('')}<button class="opt idk" data-k="-1">לא הבנתי</button>`, Math.min(.95, asked / 12));
    const play = () => { const pl = $('#pl'); if (!pl || plays >= 2) return; plays++; pl.textContent = `השמעה ${plays}/2`; say(text, { rate }); };
    $('#spk').onclick = play; const tm = setTimeout(play, 300);
    V.querySelectorAll('.opt').forEach(btn => btn.onclick = () => {
      clearTimeout(tm); stopSpeaking(); asked++; if (+btn.dataset.k === a) ok++;
      if (++i < items.length) return ask();
      if (ok < items.length) { if (ok) T.lis.level = Math.max(T.lis.level, L - .5); return ear(); }
      if (L === 1) return levelUp();
      dictation(items[0], (good) => { if (good) levelUp(); else { T.lis.level = Math.max(T.lis.level, L - .5); ear(); } });
    });
  };
  const levelUp = () => { T.lis.level = L; if (L < 5) { L++; items = lvItems(L); i = 0; ok = 0; return ask(); } ear(); };
  ask();
}
function dictation(it, done) {
  const [, text, rate] = it; const words = text.replace(/[.,!?]/g, '').split(' ');
  const k = words.map((w, i) => ({ w, i })).filter(x => x.w.length >= 4 && !/'/.test(x.w)).sort((a, b) => b.w.length - a.w.length)[0] || { w: words[0], i: 0 };
  let plays = 0;
  frame('שמיעה', `<p class="sub center">הקשב והשלם את המילה החסרה</p><button class="speaker" id="spk" aria-label="השמע">${icon('sound', 44)}</button><div class="center sub" id="pl"></div>
    <div class="ex" style="font-size:1.2rem">${words.map((w, i) => i === k.i ? '<b>_____</b>' : esc(w)).join(' ')}</div>
    <input id="ans" class="srch ltr" style="font-size:1.2rem" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" lang="en" aria-label="המילה החסרה">
    <div class="row"><button class="btn o big" id="ok" style="flex:2">בדוק</button><button class="btn g" id="idk" style="flex:1">לא הבנתי</button></div>`, .6);
  const play = () => { const pl = $('#pl'); if (!pl || plays >= 2) return; plays++; pl.textContent = `השמעה ${plays}/2`; say(text, { rate }); };
  $('#spk').onclick = play; setTimeout(play, 300);
  $('#ok').onclick = () => { stopSpeaking(); done(okWord($('#ans').value, k.w, k.w)); };
  $('#idk').onclick = () => { stopSpeaking(); done(false); };
}

// ---------- 4. אוזן ----------
function ear() {
  const items = shuf(EAR).map(p => ({ p, t: Math.random() < .5 ? 0 : 1 })); let i = 0;
  const ask = () => {
    const { p, t } = items[i], order = shuf([p[0], p[1]]);
    frame('אוזן', `<p class="sub center">איזו מילה שמעת?</p><button class="speaker" id="spk" aria-label="השמע">${icon('sound', 44)}</button>
      ${order.map(o => `<button class="opt ltr" data-o="${o}" style="font-size:1.5rem;font-weight:800;text-align:center">${o}</button>`).join('')}`, i / items.length);
    const play = () => say(p[t], { rate: .8 }); $('#spk').onclick = play; const tm = setTimeout(play, 300);
    V.querySelectorAll('.opt').forEach(btn => btn.onclick = () => {
      clearTimeout(tm); const good = btn.dataset.o === p[t]; T.ear.push({ c: p[2], good });
      const st = state.ear[p[2]] ||= { ok: 0, n: 0 }; st.n++; if (good) st.ok++;
      if (++i < items.length) ask(); else speak();
    });
  };
  ask();
}

// ---------- 5. דיבור: קריאה + משפט מעברית (הפקה) ----------
const PROD = [{ he: 'אני גר כאן כבר חמש שנים.', keys: [['have', "i've", 've', 'been'], ['lived', 'living'], ['here'], ['for'], ['five', '5'], ['years']] },
  { he: 'אם היה לי זמן, הייתי לומד יותר.', keys: [['if'], ['had'], ['time'], ['would', "i'd"], ['study', 'learn', 'studying', 'learning'], ['more']] }];
function speak() {
  const tasks = [...SPEAK.map(s => ({ s })), ...PROD.map(x => ({ prod: x }))]; let i = 0; const read = [], prod = [];
  const ask = () => {
    const t = tasks[i];
    const q = t.prod ? `<p class="sub center">איך אומרים את זה באנגלית? אמור בקול</p><div class="card center" style="font-size:1.25rem;font-weight:700">${esc(t.prod.he)}</div>`
      : `<p class="sub center">קרא את המשפט בקול, בקצב טבעי</p><div class="ex center" style="font-size:1.3rem">${esc(t.s)}</div>`;
    frame('דיבור', q + `<div class="row"><button class="btn o big" id="mic" style="flex:2">${icon('mic', 22)} דבר</button><button class="btn g" id="sk" style="flex:1">דלג</button></div><div class="res" id="res"></div>`, i / tasks.length);
    const next = () => { if (++i < tasks.length) ask(); else { T.speak = read.length ? Math.round(read.reduce((a, b) => a + b, 0) / read.length) : null; T.prodSpeak = prod.length ? Math.round(prod.reduce((a, b) => a + b, 0) / prod.length) : null; result(); } };
    $('#sk').onclick = next;
    $('#mic').onclick = async (e) => {
      const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'מקשיב…';
      try {
        if (t.prod) {
          const alts = await listen(); const said = (alts[0] || '').toLowerCase().replace(/[^a-z' ]/g, ' ').split(/\s+/);
          const sc = Math.round(t.prod.keys.filter(k => k.some(x => said.includes(x))).length / t.prod.keys.length * 100);
          prod.push(sc); $('#res').textContent = alts[0] ? `שמעתי: "${alts[0]}"` : 'לא שמעתי';
        } else if (azure.enabled()) { const r = await azure.assess(t.s); if (!r.nomatch) { read.push(r.pron); $('#res').textContent = `ציון הגייה: ${Math.round(r.pron)}`; } }
        else { const alts = await listen(); if (alts.length) { const c = compare(t.s, alts); read.push(Math.round(c.score * 100)); $('#res').textContent = `זוהו ${Math.round(c.score * 100)}% מהמילים`; } }
      } catch { $('#res').textContent = 'המיקרופון לא זמין – אפשר לדלג.'; }
      setTimeout(next, 1100);
    };
  };
  ask();
}

// ---------- תוצאה ----------
function result() {
  // אוצר מילים: רצועות שנבדקו לפי p; מתחת לרצועה הנמוכה שנבדקה – לפי הביצוע בה; מעל הגבוהה – 0
  const tested = VB.map((b, i) => T.vb[i] && T.vb[i].n ? { i, p: T.vb[i].ok / T.vb[i].n, n: T.vb[i].n } : null).filter(Boolean);
  const lo = tested[0], hi = tested.at(-1);
  let size = 0, varSum = 0; const bandP = [];
  VB.forEach(([a, b], i) => {
    const t = tested.find(x => x.i === i), w = b - a; let p;
    if (t) { p = t.p; varSum += (p * (1 - p) / t.n) * w * w; }
    else if (lo && i < lo.i) p = Math.min(.95, Math.max(lo.p, .85));
    else p = 0;
    bandP[i] = p; size += p * w;
  });
  const Y = T.yes, f = Y.pn ? Y.fa / Y.pn : 0;
  YESNO.slice(2).forEach((band, i) => { if (!Y.n[i]) return; const h = Y.hits[i] / Y.n[i]; const p = f >= .99 ? 0 : Math.max(0, Math.min(1, (h - f) / (1 - f))) * .8; size += p * (band.to - band.from); });
  const sd = Math.sqrt(varSum); size = Math.round(size / 50) * 50;
  const range = [Math.max(0, Math.round((size - sd) / 50) * 50), Math.round((size + sd) / 50) * 50];
  const v = vocabLevel(size), g = T.gram.passed, l = T.lis.level;
  const overall = Math.min(Math.round(v * .4 + g * .35 + l * .25), Math.min(v, g, Math.floor(l)) + 1);

  // מילים מוכרות: רק מה שהוכח; רצועה שלמה רק ב-90%+ עם 6+ פריטים (ו-10% מהן נכנסות לחזרת אימות)
  const known = state.known ||= {}; let marked = 0;
  const mark = (w) => { if (!known[w] && !state.cards['w:' + w]) { known[w] = 1; marked++; } };
  T.correct.forEach(mark);
  VB.forEach(([a, b], i) => { const t = T.vb[i]; if (t && t.n >= 6 && t.ok / t.n >= .9) ALL.filter(w => w.fr > a && w.fr <= b).forEach(w => { mark(w.w); if (Math.random() < .1) { srs.learn('w:' + w.w); const c = state.cards['w:' + w.w]; c.ivl = 7; c.due = Date.now() + (3 + Math.random() * 20) * 864e5; } }); });
  if (lo && lo.i > 0 && lo.p >= .85) VB.slice(0, lo.i).forEach(([a, b]) => ALL.filter(w => w.fr > a && w.fr <= b).forEach(w => mark(w.w)));
  T.wrongWords.forEach(w => { delete known[w]; });
  state.settings.newPerDay = 4;
  state.placement = { v2: true, date: new Date().toLocaleDateString('sv'), overall, v, g, l, size, range, speak: T.speak, prod: T.prodSpeak, ear: T.ear.filter(x => !x.good).map(x => x.c), wrong: T.gram.wrong.slice(0, 6), marked, items: T.asked };
  save(); addXP(20, null); ctx.refreshTop(); ctx.stage.celebrate();
  showResult(state.placement);
}

const DESC = ['מתחיל ממש מהבסיס', 'מבין ומשתמש במשפטים פשוטים מאוד', 'מסתדר במצבים יומיומיים פשוטים', 'מסתדר ברוב המצבים, מדבר על נושאים מוכרים', 'מדבר בשטף יחסי עם דוברי שפת אם', 'שולט היטב, כמעט בלי מאמץ', 'רמת דובר שפת אם'];
export function showResult(P) {
  const bar = (lab, lv, extra = '') => `<div class="skill"><div class="h"><span>${lab}</span><span class="pill ${lv >= 3 ? 'ok' : lv <= 1 ? 'hot' : ''}"><span dir="ltr">${LEVELS[Math.floor(lv)]}</span>${extra}</span></div><div class="prog"><i style="width:${Math.max(5, lv / 6 * 100)}%"></i></div></div>`;
  const recs = [];
  if (P.v <= P.g) recs.push('אוצר מילים הוא המנוף הכי גדול שלך עכשיו – שיעור יומי עם 4 מילים חדשות + חזרות.');
  if (P.wrong?.length) recs.push('דקדוק: חזק את הנושאים שמופיעים למטה.');
  if (P.l < Math.min(P.v, 5)) recs.push('השמיעה מאחורי הידע – תרגל "חיקוי דובר" והכתבה במהירות טבעית.');
  if (P.ear?.length) recs.push(`צלילים לאמן: <span dir="ltr">${[...new Set(P.ear)].join(' · ')}</span>`);
  if (P.prod != null && P.prod < 70) recs.push('הפקה בדיבור: קשה לך עדיין לבנות משפט מעברית – נתרגל משפטים שלמים בקול.');
  V.innerHTML = `<div class="ptest flowfin">
    <div class="center"><p class="sub" style="margin:8px 0 0">הרמה המשוערת שלך</p><div class="lvlbig ltr">${LEVELS[P.overall]}</div><p class="sub">${DESC[P.overall]}</p></div>
    <div class="card">${bar('אוצר מילים פעיל', P.v, ` · ~${P.size.toLocaleString('en')}`)}
      ${P.range ? `<div class="mut" style="font-size:.82rem;margin-top:4px">טווח סביר: ${P.range[0].toLocaleString('en')}–${P.range[1].toLocaleString('en')} מילים שאתה יודע <b>להפיק</b> (לזהות – בדרך כלל יותר)</div>` : ''}
      ${bar('דקדוק', P.g)}${bar('שמיעה', P.l)}
      ${P.speak != null ? `<div class="skill"><div class="h"><span>הגייה</span><span class="pill">${P.speak}/100</span></div></div>` : ''}
      ${P.prod != null ? `<div class="skill"><div class="h"><span>בניית משפט בדיבור</span><span class="pill">${P.prod}/100</span></div></div>` : ''}</div>
    <h3>מה עכשיו</h3>${recs.map(r => `<div class="tip">${r}</div>`).join('')}
    ${P.marked ? `<div class="tip">סימנתי ${P.marked.toLocaleString('en')} מילים שהוכחת שאתה יודע – הן לא יופיעו כ"חדשות". מילים שטעית בהן ייכנסו ראשונות לשיעורים.</div>` : ''}
    ${P.wrong?.length ? `<h3>דקדוק לחזק</h3>${P.wrong.map(w => `<div class="card" style="padding:10px 14px"><div class="ltr">${esc(w.q).replace('___', `<b>${esc(w.ans)}</b>`)}</div><div class="mut" style="font-size:.88rem;margin-top:4px">${esc(w.why)}</div></div>`).join('')}` : ''}
    <button class="btn o big full" id="go" style="margin-top:10px">התחל ללמוד</button>
    <button class="btn g full" id="home" style="margin-top:10px">לבית</button></div>`;
  V.querySelector('#go').onclick = () => { ctx.go('today'); setTimeout(() => document.getElementById('go')?.click(), 60); };
  V.querySelector('#home').onclick = () => ctx.go('today');
}
