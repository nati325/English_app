// מבחן רמה התחלתי (אדפטיבי, ~8 דקות): אוצר מילים · דקדוק · שמיעה · אוזן · דיבור (אופציונלי)
import { state, save, addXP } from './store.js';
import { say, listen, compare, stopSpeaking } from './speech.js';
import * as azure from './azure.js';
import { ALL } from './views.js';
import { LEVELS, SELF, YESNO, PSEUDO, GRAMMAR, LISTEN, EAR, SPEAK } from '../data/placement.js';

let ctx, V;
export const init = (c) => { ctx = c; V = c.view; };
const $ = (s) => V.querySelector(s);
const shuf = (a) => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);
const esc = (t) => String(t).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const PARTS = ['אוצר מילים', 'דקדוק', 'שמיעה', 'אוזן', 'דיבור'];

// רצועות שכיחות לבדיקת תרגום (מילים שיש להן תרגום באפליקציה)
const BANDS = [[0, 1000], [1000, 2000], [2000, 3500]];
// היקף אוצר מילים → רמה (קירוב מקובל)
const vocabLevel = (n) => n < 300 ? 0 : n < 800 ? 1 : n < 1600 ? 2 : n < 3000 ? 3 : n < 5000 ? 4 : n < 8000 ? 5 : 6;

let T; // מצב המבחן הנוכחי
function frame(part, html, prog) {
  V.innerHTML = `<div class="ptest">
    <div class="ptop"><button class="back" id="pq">✕ יציאה</button><span>${part ? `חלק ${PARTS.indexOf(part) + 1}/5 · <b>${part}</b>` : ''}</span></div>
    ${prog != null ? `<div class="prog" style="margin-bottom:14px"><i style="width:${Math.round(prog * 100)}%"></i></div>` : ''}${html}</div>`;
  $('#pq').onclick = () => { if (confirm('לצאת מהמבחן? ההתקדמות בו לא תישמר.')) { stopSpeaking(); ctx.go('today'); } };
}

export function start() {
  T = { self: 1, vocab: { bands: [], yes: { hits: [0, 0, 0, 0], n: [0, 0, 0, 0], fa: 0, pn: 0 }, correct: [] }, gram: { passed: 0, wrong: [] }, lis: { level: 0 }, ear: [], speak: null };
  frame(null, `<div class="center"><div style="font-size:3.2rem">🎯</div><h2>מבחן רמה</h2>
    <p class="sub">כ-8 דקות. המבחן מתאים את עצמו אליך: שאלות קלות יותר או קשות יותר לפי התשובות. אין ציון "נכשל" – המטרה היא לדעת מאיפה להתחיל.</p></div>
    <div class="card"><b>מה נבדוק:</b><div style="margin-top:6px;line-height:1.9">📚 כמה מילים אתה מכיר<br>✍️ דקדוק<br>👂 הבנת דיבור במהירויות שונות<br>🔊 צלילים שקשים לדוברי עברית<br>🎤 דיבור (אופציונלי)</div></div>
    <p class="sub">💡 אל תנחש. "לא יודע" עדיף על ניחוש – ככה התוצאה מדויקת יותר. מומלץ אוזניות.</p>
    <button class="btn big full" id="go">בוא נתחיל</button>`);
  $('#go').onclick = selfStep;
}

function selfStep() {
  frame(null, `<h2>איך היית מתאר את האנגלית שלך?</h2><p class="sub">זה רק כדי לבחור את השאלה הראשונה.</p>
    ${SELF.map(([t, l], i) => `<button class="opt" data-l="${l}">${t}</button>`).join('')}`);
  V.querySelectorAll('.opt').forEach(b => b.onclick = () => { T.self = +b.dataset.l; vocabMCQ(0); });
}

// ---------- 1. אוצר מילים: בחירת תרגום לפי רצועות שכיחות ----------
function vocabMCQ(bi) {
  const [a, b] = BANDS[bi]; const N = 6;
  const pool = ALL.filter(w => w.fr > a && w.fr <= b), items = shuf(pool).slice(0, N);
  const res = { n: 0, ok: 0 }; T.vocab.bands[bi] = res; let i = 0;
  const ask = () => {
    const w = items[i];
    const wrong = shuf(ALL.filter(x => x.he !== w.he && x.w !== w.w)).slice(0, 3).map(x => x.he);
    const opts = shuf([w.he, ...wrong]);
    frame('אוצר מילים', `<p class="sub center">מה פירוש המילה?</p><div class="word center">${esc(w.w)}</div>
      <div class="center" style="margin:6px 0 14px"><button class="btn g" id="hear" style="min-height:44px">🔊 שמע</button></div>
      ${opts.map(o => `<button class="opt" data-o="${esc(o)}">${esc(o)}</button>`).join('')}
      <button class="opt idk" data-o="">🤷 לא יודע</button>`, (bi * N + i) / (BANDS.length * N));
    $('#hear').onclick = () => say(w.w, { show: false }); say(w.w, { show: false });
    V.querySelectorAll('.opt').forEach(btn => btn.onclick = () => {
      stopSpeaking(); res.n++; if (btn.dataset.o === w.he) { res.ok++; T.vocab.correct.push(w.w); }
      if (++i < items.length) return ask();
      const p = res.ok / res.n;
      if (p >= .5 && bi < BANDS.length - 1) return vocabMCQ(bi + 1);
      if (p >= .5 && bi === BANDS.length - 1) return yesNo();
      grammar();
    });
  };
  ask();
}

// ---------- 1ב. אוצר מילים מתקדם: מכיר / לא מכיר + מילים מומצאות ----------
function yesNo() {
  const items = shuf([...YESNO.flatMap((band, bi) => shuf(band.words).slice(0, 5).map(w => ({ w, bi }))), ...shuf(PSEUDO).slice(0, 6).map(w => ({ w, bi: -1 }))]);
  let i = 0; const Y = T.vocab.yes;
  const ask = () => {
    const it = items[i];
    frame('אוצר מילים', `<p class="sub center">אתה מכיר את המילה ויודע מה היא אומרת?</p><p class="sub center" style="font-size:.8rem">⚠️ חלק מהמילים מומצאות – סמן "מכיר" רק אם אתה באמת יודע.</p>
      <div class="word center" style="margin:18px 0 24px">${esc(it.w)}</div>
      <div class="row"><button class="btn" id="y" style="flex:1">✓ מכיר</button><button class="btn g" id="n" style="flex:1">✗ לא מכיר</button></div>`, i / items.length);
    const ans = (yes) => { if (it.bi < 0) { Y.pn++; if (yes) Y.fa++; } else { Y.n[it.bi]++; if (yes) Y.hits[it.bi]++; } if (++i < items.length) ask(); else grammar(); };
    $('#y').onclick = () => ans(true); $('#n').onclick = () => ans(false);
  };
  ask();
}

// ---------- 2. דקדוק: אדפטיבי לפי רמות ----------
function grammar() {
  const byL = (l) => shuf(GRAMMAR.filter(g => g[0] === l)).slice(0, 3);
  let L = Math.max(1, Math.min(4, T.self)), wentDown = false, items = byL(L), i = 0, ok = 0, asked = 0;
  const G = T.gram;
  const ask = () => {
    const [lvl, q, opts, a, why] = items[i];
    frame('דקדוק', `<p class="sub center">בחר את המילה החסרה</p><div class="ex center ltr" style="font-size:1.3rem">${esc(q).replace('___', '<b>_____</b>')}</div>
      ${opts.map((o, k) => `<button class="opt ltr" data-k="${k}">${esc(o)}</button>`).join('')}<button class="opt idk" data-k="-1">🤷 לא יודע</button>`, Math.min(.95, asked / 12));
    V.querySelectorAll('.opt').forEach(btn => btn.onclick = () => {
      asked++; if (+btn.dataset.k === a) ok++; else G.wrong.push({ q, ans: opts[a], why, lvl });
      if (++i < items.length) return ask();
      const pass = ok >= 2;
      if (pass) { G.passed = L; if (L < 5) { L++; items = byL(L); i = 0; ok = 0; return ask(); } return listening(); }
      if (!wentDown && L > 1 && G.passed === 0) { wentDown = true; L--; items = byL(L); i = 0; ok = 0; return ask(); } // התחלנו גבוה מדי
      listening();
    });
  };
  ask();
}

// ---------- 3. שמיעה: מהירות ורמה עולות ----------
function listening() {
  let L = 1, i = 0, ok = 0, items = LISTEN.filter(x => x[0] === 1), plays = 0, asked = 0;
  const ask = () => {
    const [lvl, text, rate, opts, a] = items[i]; plays = 0;
    frame('שמיעה', `<p class="sub center">הקשב ובחר מה נאמר. אפשר להשמיע עד 2 פעמים.</p>
      <button class="speaker" id="spk">🔊</button><div class="center sub" id="pl">השמעה 1/2</div>
      ${opts.map((o, k) => `<button class="opt ltr" data-k="${k}">${esc(o)}</button>`).join('')}<button class="opt idk" data-k="-1">🤷 לא הבנתי</button>`, Math.min(.95, asked / 10));
    const play = () => { const pl = $('#pl'); if (!pl || plays >= 2) return; plays++; pl.textContent = `השמעה ${plays}/2`; say(text, { rate, show: false }); };
    $('#spk').onclick = play; const tm = setTimeout(play, 300);
    V.querySelectorAll('.opt').forEach(btn => btn.onclick = () => {
      clearTimeout(tm); stopSpeaking(); asked++; if (+btn.dataset.k === a) ok++;
      if (++i < items.length) return ask();
      if (ok === items.length) { T.lis.level = L; if (L < 5) { L++; items = LISTEN.filter(x => x[0] === L); i = 0; ok = 0; return ask(); } }
      else if (ok > 0) T.lis.level = Math.max(T.lis.level, L - .5);
      ear();
    });
  };
  ask();
}

// ---------- 4. אוזן: זוגות מינימליים ----------
function ear() {
  const items = shuf(EAR).map(p => ({ p, t: Math.random() < .5 ? 0 : 1 })); let i = 0;
  const ask = () => {
    const { p, t } = items[i], order = shuf([p[0], p[1]]);
    frame('אוזן', `<p class="sub center">איזו מילה שמעת?</p><button class="speaker" id="spk">🔊</button>
      ${order.map(o => `<button class="opt ltr" data-o="${o}" style="font-size:1.5rem;font-weight:800;text-align:center">${o}</button>`).join('')}`, i / items.length);
    const play = () => say(p[t], { rate: .8, show: false }); $('#spk').onclick = play; const tm = setTimeout(play, 300);
    V.querySelectorAll('.opt').forEach(btn => btn.onclick = () => {
      clearTimeout(tm); const good = btn.dataset.o === p[t]; T.ear.push({ c: p[2], good });
      const st = state.ear[p[2]] ||= { ok: 0, n: 0 }; st.n++; if (good) st.ok++;
      if (++i < items.length) ask(); else speak();
    });
  };
  ask();
}

// ---------- 5. דיבור (אופציונלי) ----------
function speak() {
  let i = 0; const scores = [];
  const ask = () => {
    const s = SPEAK[i];
    frame('דיבור', `<p class="sub center">קרא את המשפט בקול, בקצב טבעי. (אפשר לדלג)</p><div class="ex center" style="font-size:1.3rem">${esc(s)}</div>
      <div class="row"><button class="btn o" id="mic" style="flex:1">🎤 התחל לדבר</button><button class="btn g" id="sk" style="flex:0 0 auto">דלג</button></div><div class="res" id="res"></div>`, i / SPEAK.length);
    const next = () => { if (++i < SPEAK.length) ask(); else { T.speak = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null; result(); } };
    $('#sk').onclick = next;
    $('#mic').onclick = async (e) => {
      const btn = e.currentTarget; btn.disabled = true; btn.textContent = '🎙️ מקשיב…';
      try {
        if (azure.enabled()) { const r = await azure.assess(s); if (!r.nomatch) { scores.push(r.pron); $('#res').textContent = `ציון הגייה: ${Math.round(r.pron)}`; } }
        else { const alts = await listen(); if (alts.length) { const c = compare(s, alts); scores.push(Math.round(c.score * 100)); $('#res').textContent = `זוהו ${Math.round(c.score * 100)}% מהמילים`; } }
      } catch { $('#res').textContent = 'המיקרופון לא זמין – אפשר לדלג.'; }
      setTimeout(next, 900);
    };
  };
  ask();
}

// ---------- תוצאה, ניתוח והתאמת התוכנית ----------
function result() {
  const vb = T.vocab.bands, widths = [1000, 1000, 1500];
  let size = 0; const bandP = [];
  vb.forEach((r, i) => { const p = r.n ? r.ok / r.n : 0; bandP[i] = p; size += p * widths[i]; });
  const Y = T.vocab.yes, f = Y.pn ? Y.fa / Y.pn : 0; const yesP = [];
  YESNO.forEach((band, i) => { if (!Y.n[i]) return; const h = Y.hits[i] / Y.n[i]; const p = f >= 1 ? 0 : Math.max(0, Math.min(1, (h - f) / (1 - f))); yesP[i] = p; size += p * (band.to - band.from); });
  size = Math.round(size / 50) * 50;
  const v = vocabLevel(size), g = T.gram.passed, l = T.lis.level;
  const overall = Math.round(v * .4 + g * .35 + l * .25);
  const earBad = T.ear.filter(x => !x.good).map(x => x.c);

  // סימון מילים מוכרות: רצועה שנענתה ב-80%+ → כל המילים בה; אחרת רק המילים שנענו נכון
  const known = state.known ||= {}; let marked = 0;
  const mark = (w) => { if (!known[w] && !state.cards['w:' + w]) { known[w] = 1; marked++; } };
  BANDS.forEach(([a, b], i) => { if (bandP[i] >= .8) ALL.filter(w => w.fr > a && w.fr <= b).forEach(w => mark(w.w)); });
  if ((yesP[0] ?? 0) >= .8) ALL.filter(w => w.fr > 3500 && w.fr <= 5000).forEach(w => mark(w.w));
  T.vocab.correct.forEach(mark);
  state.settings.newPerDay = overall >= 4 ? 10 : overall >= 3 ? 8 : 5;
  state.placement = { date: new Date().toLocaleDateString('sv'), overall, v, g, l, size, speak: T.speak, ear: earBad, wrong: T.gram.wrong.slice(0, 6), marked };
  save(); addXP(20, null); ctx.refreshTop(); ctx.stage.celebrate();
  ctx.bubble(`Your level: ${LEVELS[overall]}! Let's go! 🎉`);
  showResult(state.placement);
}

const DESC = ['מתחיל ממש מהבסיס', 'מבין ומשתמש במשפטים פשוטים מאוד', 'מסתדר במצבים יומיומיים פשוטים', 'מסתדר ברוב המצבים, מדבר על נושאים מוכרים', 'מדבר בשטף יחסי עם דוברי שפת אם', 'שולט היטב, כמעט בלי מאמץ', 'רמת דובר שפת אם'];
export function showResult(P) {
  const bar = (lab, lv, extra = '') => `<div style="margin:10px 0"><div class="row" style="justify-content:space-between"><b>${lab}</b><span class="pill ${lv >= 3 ? 'ok' : lv <= 1 ? 'hot' : ''}">${LEVELS[Math.floor(lv)]}${extra}</span></div><div class="prog"><i style="width:${Math.max(4, lv / 6 * 100)}%"></i></div></div>`;
  const recs = [];
  if (P.v < P.g && P.v < 4) recs.push('📚 אוצר המילים הוא נקודת התורפה – כל יום 5–10 מילים חדשות + חזרות.');
  if (P.wrong?.length && (P.g <= P.v - 1 || P.g < 3)) recs.push('✍️ דקדוק: חזק את הנושאים שמופיעים למטה.');
  if (P.l < Math.min(P.v, 5)) recs.push('👂 השמיעה מפגרת אחרי הידע – תרגל "חיקוי דובר" ומשפטים במהירות טבעית.');
  if (P.ear?.length) recs.push(`🔊 צלילים להתמקד בהם: <span class="ltr">${[...new Set(P.ear)].join(' · ')}</span> (תרגול › אימון אוזן).`);
  if (P.speak != null && P.speak < 70) recs.push('🎤 הגייה: התחל עם 20 הצלילים הקשים ושיעורי המקצב.');
  if (!recs.length) recs.push('💪 בסיס חזק! התמקד במקצב, Shadowing ושיחה כדי להישמע native.');
  V.innerHTML = `<div class="ptest flowfin">
    <div class="center"><div style="font-size:3rem">🏆</div><p class="sub" style="margin:0">הרמה המשוערת שלך</p><div class="lvlbig">${LEVELS[P.overall]}</div><p class="sub">${DESC[P.overall]}</p></div>
    <div class="card">${bar('📚 אוצר מילים', P.v, ` · ~${P.size.toLocaleString('en')}`)}${bar('✍️ דקדוק', P.g)}${bar('👂 שמיעה', P.l)}${P.speak != null ? `<div class="row" style="justify-content:space-between;margin-top:8px"><b>🎤 דיבור</b><span class="pill">${P.speak}/100</span></div>` : ''}</div>
    <h3>מה עכשיו</h3>${recs.map(r => `<div class="tip">${r}</div>`).join('')}
    ${P.marked ? `<div class="tip">✅ סימנתי ${P.marked.toLocaleString('en')} מילים שכבר אתה מכיר – הן לא יופיעו כ"חדשות". אתה תתחיל מהמילים שאתה עוד לא יודע.</div>` : ''}
    ${P.wrong?.length ? `<h3>דקדוק לחזק</h3>${P.wrong.map(w => `<div class="card" style="padding:10px 12px"><div class="ltr">${esc(w.q).replace('___', `<b>${esc(w.ans)}</b>`)}</div><div class="mut" style="font-size:.88rem;margin-top:4px">${esc(w.why)}</div></div>`).join('')}` : ''}
    <button class="btn big full" id="go" style="margin-top:10px">▶ התחל את התוכנית שלי</button>
    <button class="btn g full" id="home" style="margin-top:8px">לבית</button></div>`;
  V.querySelector('#go').onclick = () => { ctx.go('today'); setTimeout(() => document.getElementById('goDaily')?.click(), 50); };
  V.querySelector('#home').onclick = () => ctx.go('today');
}
