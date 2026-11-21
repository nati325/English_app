// מסך הבית (מסלול) ונגן השיעור: למידה פעילה, טעויות חוזרות בסוף, חזרות לפי ביצוע אמיתי
import { state, save, addXP, fresh } from './store.js';
import * as srs from './srs.js';
import { say, listen, compare, stopSpeaking, SR } from './speech.js';
import * as azure from './azure.js';
import { ALL, WORDS } from './views.js';
import { ANIMALS } from './stage.js';
import { PAIRS, byIPA } from '../data/phonemes.js';
import { icon, iconFill } from './icons.js';
import * as T from './teacher.js';

let ctx, V;
export const init = (c) => { ctx = c; V = c.view; };
const $ = (s, el = V) => el.querySelector(s);
const esc = (t) => String(t).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const shuf = (a) => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);
const pick = (a) => a[Math.random() * a.length | 0];
const cid = (w) => 'w:' + w;
const BYW = Object.fromEntries(ALL.map(w => [w.w, w]));
const isDone = (w) => !!srs.get(cid(w.w)) || !!state.known?.[w.w];
const hl = (ex, w) => esc(ex).replace(new RegExp(`\\b(${w}\\w*)`, 'i'), '<b>$1</b>');
const canSpeak = () => (azure.enabled() || !!SR) && !(state.noSpeakUntil > Date.now());
const today = () => new Date().toLocaleDateString('sv');

// ---------- צלילי משוב ----------
let ac;
function chime(good) {
  navigator.vibrate?.(good ? 25 : [60, 40, 60]);
  if (state.settings.sounds === false) return;
  try {
    ac ||= new (window.AudioContext || window.webkitAudioContext)();
    const notes = good ? [784, 1047] : [330, 262];
    notes.forEach((f, i) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(ac.destination); const t = ac.currentTime + i * .11; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.18, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .22); o.start(t); o.stop(t + .25); });
  } catch {}
}

// ================== מסך הבית ==================
export function home() {
  const known = Object.keys(state.cards).length;
  if (!state.onboarded && !known && !state.placement) return ctx.pages.onboarding(0);
  const A = ANIMALS[state.animal], units = WORDS.units;
  const next = ALL.find(w => !isDone(w)), curId = next?.unit ?? units.at(-1).id;
  const ci = units.findIndex(u => u.id === curId), cur = units[ci];
  const per = Math.min(state.settings.newPerDay || 5, 5), cDone = cur.words.filter(isDone).length;
  const lessons = Math.max(1, Math.ceil(cur.words.length / per)), lessonsDone = Math.min(lessons, Math.floor(cDone / per));
  const h = new Date().getHours(), hi = h < 12 ? 'Good morning!' : h < 18 ? 'Good afternoon!' : 'Good evening!';
  const due = srs.dueIds().length, doneToday = state.daily.lessons || 0;
  const win = units.slice(Math.max(0, ci - 2), ci + 4);
  const offs = [150, 70, 120, 40, 110, 60];
  V.innerHTML = `
    <div class="say" style="margin-top:4px"><div class="cslot" style="--s:78px"></div><div class="bub" style="margin-bottom:16px"><div class="cbub ltr" style="font-weight:800;text-align:left">${hi}</div><div class="mut" style="font-size:.92rem">${doneToday ? 'כל הכבוד! עוד שיעור?' : state.settings.teacher === 'animal' ? `אני ${A.name}. מוכן לשיעור של היום?` : `אני ${T.info().name}, ${T.info().body === 'M' ? 'המורה' : 'המורה'} שלך. מוכן לשיעור?`}</div></div></div>
    ${!state.placement && !state.skipPlacement && !known ? `<button class="prow" id="pt" style="margin-top:10px"><span class="ic">${icon('target')}</span><span class="t"><b>בדיקת רמה (8 דק')</b><small>כדי לא ללמוד מה שכבר יודעים</small></span><span class="st">${icon('chevron')}</span></button>` : ''}
    <div class="hero today" data-big>
      <div class="lbl">${icon('clock', 16)}<span>השיעור של היום · כ-8 דקות${due ? ` · ${due} לחזרה` : ''}</span></div>
      <div class="ttl">יחידה ${ci + 1} · ${esc(cur.title)}</div>
      <div class="segs" aria-label="שיעור ${lessonsDone + 1} מתוך ${lessons}">${Array.from({ length: lessons }, (_, i) => `<i class="${i < lessonsDone ? 'on' : ''}"></i>`).join('')}</div>
      <button class="btn o big full" id="go" style="margin-top:16px">${doneToday ? 'עוד שיעור' : lessonsDone ? 'המשך ללמוד' : 'התחל שיעור'} ${icon('chevron', 20)}</button>
    </div>
    <div class="row" style="justify-content:space-between;margin-top:18px"><b style="font-size:1.1rem">המסלול שלך</b><span class="mut" style="font-size:.85rem">יחידה ${ci + 1} מתוך ${units.length}</span></div>
    <div class="trail">${win.map((u, k) => {
      const idx = units.indexOf(u), done = u.words.every(isDone), now = u.id === curId;
      const cls = now ? 'now' : done ? 'done' : 'lock', ic = now ? iconFill('star', 32, '#fff') : done ? icon('check', 28, 'stroke-width="3"') : icon('lock', 24);
      return `<div class="node-row" style="padding-inline-start:${offs[k % offs.length]}px"><button class="node ${cls}" data-u="${u.id}" aria-label="יחידה ${idx + 1}: ${esc(u.title)} – ${now ? 'כאן עכשיו' : done ? 'הושלמה' : 'נעולה'}">${ic}</button>
        <div class="nl">${now ? `<b>${esc(u.title)}</b><span class="here">אתה כאן</span>` : esc(u.title)}</div></div>`;
    }).join('')}</div>`;
  $('#go').onclick = () => startLesson(curId);
  if ($('#pt')) $('#pt').onclick = () => ctx.placement.start();
  V.querySelectorAll('.node').forEach(b => b.onclick = () => {
    const u = units.find(x => x.id === +b.dataset.u);
    if (b.classList.contains('now')) startLesson(u.id);
    else if (b.classList.contains('done')) startLesson(u.id, { review: true });
    else ctx.toast('קודם מסיימים את היחידה הנוכחית 🙂');
  });
}

// ================== בניית שיעור ==================
function buildLesson(unitId, review) {
  const n = Math.min(state.settings.newPerDay || 4, 4);
  let pool = ALL.filter(w => !isDone(w) && (!unitId || w.unit === unitId));
  if (pool.length < n) pool = pool.concat(ALL.filter(w => !isDone(w) && !pool.includes(w)));
  const newW = review ? [] : pool.slice(0, n);
  let rev = srs.dueIds().map(id => BYW[id.slice(2)]).filter(Boolean).slice(0, review ? 6 : 3);
  if (review && rev.length < 4) rev = rev.concat(fresh(ALL.filter(w => w.unit === unitId && isDone(w) && !rev.includes(w)), 'rev:' + unitId, 6 - rev.length, w => w.w));
  if (!newW.length && !rev.length) rev = fresh(ALL.filter(isDone), 'rev:any', 5, w => w.w);
  const ex = [];
  // 1) היכרות עם רווח: לא שואלים על מילה מיד אחרי שהוצגה
  newW.forEach((w, i) => { ex.push({ t: 'intro', w }); if (i) ex.push({ t: 'meaning', w: newW[i - 1] }); });
  if (newW.length) ex.push({ t: 'meaning', w: newW.at(-1) });
  // 2) שליפה: בחירה עם מסיחים קשים ← הקלדה מהזיכרון ← דיבור מעברית בלבד
  shuf(newW).forEach(w => ex.push({ t: 'english', w }));
  shuf(newW).forEach(w => ex.push({ t: 'type', w }));
  newW.slice(0, 2).forEach(w => ex.push({ t: 'say', w, mode: 'recall' }));
  // 3) חזרות: רק הפקה (הקלדה/דיבור), לא זיהוי
  rev.forEach((w, i) => ex.push(i % 2 ? { t: 'say', w, mode: 'recall', rev: true } : { t: 'type', w, rev: true }));
  const sw = [...newW, ...rev].find(w => { const k = w.ex.split(' ').length; return k >= 3 && k <= 8; });
  if (sw) ex.push({ t: 'build', w: sw });
  const weak = Object.entries(state.ear).filter(([, v]) => v.n >= 2).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n)[0]?.[0];
  const pair = (weak && PAIRS.find(p => p[2] === weak)) || pick(PAIRS);
  ex.push({ t: 'ear', p: pair, tg: Math.random() < .5 ? 0 : 1 });
  const lw = newW[1] || newW[0] || rev[0];
  if (lw) ex.push({ t: 'sayex', w: lw });
  return { ex, newW, rev, others: [...newW, ...rev] };
}

// ================== נגן ==================
let L;
export function startLesson(unitId, { review = false } = {}) {
  const b = buildLesson(unitId, review);
  if (!b.ex.length) { ctx.toast('אין מה לתרגל כרגע 🎉'); return; }
  L = { ...b, i: 0, ok: 0, n: 0, res: {}, t0: Date.now(), xp: 0, tries: 0 };
  show();
}
const total = () => L.ex.length;
function frame(label, lblIcon, body, foot, cls = '') {
  V.innerHTML = `<div class="lp">
    <div class="lp-top"><button class="lp-x" id="lpx" aria-label="סגור את השיעור">${icon('x', 26)}</button>
      <div class="lp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${total()}" aria-valuenow="${L.i}" aria-label="התקדמות בשיעור"><i style="width:${Math.round(L.i / total() * 100)}%"></i></div></div>
    <div class="lp-body"><div class="lp-lbl ${cls}">${icon(lblIcon, 20)}<span>${label}</span></div>${body}</div>
    <div class="lp-foot">${foot}</div></div>`;
  $('#lpx').onclick = () => { if (confirm('לצאת מהשיעור? ההתקדמות בשיעור הזה לא תישמר.')) { stopSpeaking(); ctx.go('today'); } };
  V.scrollTop = 0;
}
const audioBtn = (txt, id = 'aud') => `<button class="lp-audio" id="${id}" data-t="${esc(txt)}">${icon('sound', 18)} שמע</button> <button class="lp-audio" id="${id}s" data-t="${esc(txt)}" aria-label="שמע לאט">${icon('turtle', 18)}</button>`;
function bindAudio() { V.querySelectorAll('.lp-audio').forEach(b => b.onclick = () => say(b.dataset.t, { rate: b.id.endsWith('s') ? .55 : undefined })); }
function checkBtn(label = 'בדוק') { return `<button class="btn big full" id="chk" disabled>${label}</button>`; }

function show() {
  if (L.i >= L.ex.length) return finish();
  let e = L.ex[L.i];
  if ((e.t === 'say' || e.t === 'sayex') && !canSpeak()) e = L.ex[L.i] = { ...e, t: e.t === 'say' ? 'type' : 'build' };
  if (e.skip) { L.i++; return show(); }
  ({ intro, meaning, english, type: typeEx, say: sayEx, sayex: sayEx, build, ear })[e.t](e);
}

function record(e, ok) {
  if (e.t === 'intro') return;
  L.n++; if (ok) { L.ok++; L.xp += 2; }
  const k = e.w?.w; if (k) { const r = L.res[k] ||= { ok: 0, bad: 0 }; ok ? r.ok++ : r.bad++; const m = state.mastery ||= {}; m[k] = Math.max(0, Math.min(5, (m[k] || 0) + (ok ? 1 : -1))); }
  if (!ok && !e.again) L.ex.push({ ...e, again: true }); // טעות: נתרגל שוב בסוף השיעור
}

// גיליון המשוב שעולה מלמטה
function sheet(ok, { answer, audio, tip, retry } = {}) {
  record(L.ex[L.i], ok); chime(ok); ok ? ctx.stage.celebrate() : ctx.stage.sad();
  const t = ok ? pick(['מעולה!', 'יופי!', 'בדיוק!', 'כל הכבוד!']) : pick(['כמעט!', 'לא נורא!', 'עוד קצת!']);
  const div = document.createElement('div');
  div.className = `lp-sheet ${ok ? 'good' : 'bad'}`; div.setAttribute('role', 'status');
  div.innerHTML = `<div class="h"><span class="badge">${icon(ok ? 'check' : 'x', 22, 'stroke-width="3"')}</span><span>${t}</span></div>
    ${!ok && answer ? `<div style="margin-top:10px;font-size:.95rem">התשובה הנכונה:</div><div class="ans">${answer}</div>` : ''}
    ${tip ? `<div class="tipl">${icon('bulb', 20)}<span>${tip}</span></div>` : ''}
    <div class="row" style="margin-top:14px">${audio ? `<button class="btn g" id="sha" style="flex:0 0 auto" aria-label="שמע את התשובה">${icon('sound', 20)}</button>` : ''}${retry ? `<button class="btn g" id="shr">נסה שוב</button>` : ''}<button class="btn ${ok ? '' : 'r'} big" id="shn" style="flex:2">המשך</button></div>`;
  V.appendChild(div); $('#chk')?.setAttribute('disabled', '');
  if (audio) { $('#sha', div).onclick = () => say(audio); if (!ok) say(audio); }
  if (retry) $('#shr', div).onclick = () => { div.remove(); L.n--; L.ex.pop(); show(); };
  $('#shn', div).onclick = () => { stopSpeaking(); L.i++; show(); };
  $('#shn', div).focus();
}

// ---------- 1. היכרות ----------
function intro(e) {
  const w = e.w; srs.learn(cid(w.w)); // נכנס לחזרות מרגע שהוצג
  frame('מילה חדשה', 'sparkle', `
    <div class="say"><div class="cslot" data-view="head" style="--s:84px"></div><div class="bub" style="flex:1;margin-bottom:14px">
      <div class="lp-q en">${esc(w.w)}</div><div class="ipa" style="text-align:left">/${esc(w.ipa)}/</div><div class="he" style="font-weight:700">${esc(w.he)}</div>
      <div>${audioBtn(w.w)}</div></div></div>
    <div class="ex">${hl(w.ex, w.w)}</div><button class="lp-audio" id="exa" data-t="${esc(w.ex)}">${icon('sound', 18)} שמע את המשפט</button>`,
    `<button class="btn o big full" id="nx">הבנתי, המשך</button><button class="lp-skip" id="know">אני כבר יודע את המילה</button>`);
  bindAudio(); say(w.w);
  $('#nx').onclick = () => { L.i++; show(); };
  $('#know').onclick = () => knowCheck(w);
}

// ---------- הקלדה מהזיכרון (הפקה) ----------
const reEsc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const levD = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
function blankOf(w) { const m = w.ex.match(new RegExp(`\\b(${reEsc(w.w)}\\w*)\\b`, 'i')); return m ? { tok: m[1], before: w.ex.slice(0, m.index), after: w.ex.slice(m.index + m[1].length) } : { tok: w.w, before: '', after: '' }; }
const typedOk = (ans, tok, base) => { const a = ans.trim().toLowerCase().replace(/[^a-z' ]/g, ''); const t = tok.toLowerCase(), b = base.toLowerCase(); return !!a && (a === t || a === b || (t.length >= 6 && levD(a, t) <= 1)); };
function typeEx(e, { onDone } = {}) {
  const w = e.w, bl = blankOf(w);
  frame('כתוב באנגלית', 'text', `
    <div class="say"><div class="cslot" data-view="head" style="--s:76px"></div><div class="bub" style="flex:1;margin-bottom:14px"><div class="lp-q">${esc(w.he)}</div></div></div>
    <div class="ex" style="font-size:1.15rem;line-height:1.9">${esc(bl.before)}<b class="ltr">${esc(bl.tok[0])}${'_'.repeat(Math.max(2, bl.tok.length - 1))}</b>${esc(bl.after)}</div>
    <input id="ans" class="srch ltr" style="font-size:1.25rem" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" lang="en" enterkeyhint="done" placeholder="${esc(bl.tok[0])}…" aria-label="המילה באנגלית">`, checkBtn());
  const inp = $('#ans'), chk = $('#chk'); setTimeout(() => inp.focus(), 60);
  inp.oninput = () => { chk.disabled = !inp.value.trim(); };
  const go = () => { if (!inp.value.trim()) return; const ok = typedOk(inp.value, bl.tok, w.w); inp.disabled = true; if (onDone) return onDone(ok); sheet(ok, ok ? { audio: w.ex } : { answer: esc(bl.tok), audio: w.w }); if (ok) say(w.w); };
  chk.onclick = go; inp.onkeydown = (ev) => { if (ev.key === 'Enter') go(); };
}
// "אני כבר יודע": בדיקה מיידית בהקלדה; הצלחה → המילה מסומנת כידועה ותרגיליה מדולגים
function knowCheck(w) {
  typeEx({ w }, { onDone: (ok) => {
    if (ok) { srs.grade(cid(w.w), 3); (state.known ||= {})[w.w] = 1; L.ex.forEach((x, k) => { if (k > L.i && x.w === w) x.skip = true; }); L.newW = L.newW.filter(x => x !== w); save(); chime(true); ctx.toast('מעולה! דילגנו על המילה'); L.i++; show(); }
    else { chime(false); ctx.toast('נלמד אותה ביחד 🙂'); intro({ w }); }
  } });
}
// מסיחים קשים: דומים בכתיב/אורך, מאותה יחידה
function nearWords(w, n) {
  const sc = (x) => levD(x.w.toLowerCase(), w.w.toLowerCase()) + Math.abs(x.w.length - w.w.length) * .5 + (x.unit === w.unit ? -1 : 0) + (x.w[0] === w.w[0] ? -1 : 0);
  return shuf(ALL.filter(x => x.w !== w.w && x.he !== w.he)).slice(0, 400).sort((a, b) => sc(a) - sc(b)).slice(0, n);
}

// ---------- 2. זיהוי: מה זה אומר? ----------
function meaning(e) {
  const w = e.w, opts = shuf([w.he, ...nearWords(w, 3).map(x => x.he)]); // מסיחים: מילים שנראות דומה
  frame('מה זה אומר?', 'ear', `
    <div class="say"><div class="cslot" data-view="head" style="--s:76px"></div><div class="bub" style="flex:1;margin-bottom:14px"><div class="lp-q en">${esc(w.w)}</div><div>${audioBtn(w.w)}</div></div></div>
    <div class="lp-opts">${opts.map(o => `<button class="lp-opt" data-o="${esc(o)}">${esc(o)}</button>`).join('')}</div>`, checkBtn(), 'info');
  bindAudio(); say(w.w);
  choose(o => o === w.he, () => ({ answer: `<span dir="rtl">${esc(w.he)}</span>`, audio: w.w }));
}

// ---------- 3. שליפה: איך אומרים באנגלית? ----------
function english(e) {
  const w = e.w, opts = shuf([w.w, ...nearWords(w, 3).map(x => x.w)]); // מסיחים קשים: כתיב דומה
  frame('איך אומרים באנגלית?', 'chat', `
    <div class="say"><div class="cslot" data-view="head" style="--s:76px"></div><div class="bub" style="flex:1;margin-bottom:14px"><div class="lp-q">${esc(w.he)}</div></div></div>
    <div class="lp-opts">${opts.map(o => `<button class="lp-opt en" data-o="${esc(o)}">${esc(o)}</button>`).join('')}</div>`, checkBtn());
  choose(o => o === w.w, () => ({ answer: esc(w.w), audio: w.w }), (o) => say(o));
}

// בחירה + בדיקה
function choose(isRight, fail, onPick) {
  let sel = null; const chk = $('#chk');
  V.querySelectorAll('.lp-opt').forEach(b => b.onclick = () => {
    V.querySelectorAll('.lp-opt').forEach(x => x.classList.toggle('sel', x === b)); sel = b; chk.disabled = false; onPick?.(b.dataset.o);
  });
  chk.onclick = () => {
    if (!sel) return; const ok = isRight(sel.dataset.o);
    V.querySelectorAll('.lp-opt').forEach(x => { x.disabled = true; if (isRight(x.dataset.o)) x.classList.add('right'); else if (x === sel) x.classList.add('wrong'); });
    sheet(ok, ok ? {} : fail());
  };
}

// ---------- 4. דיבור: מילה (חזור אחריי / שליפה) ומשפט ----------
function sayEx(e) {
  const w = e.w, sentence = e.t === 'sayex', target = sentence ? w.ex : w.w, recall = e.mode === 'recall';
  const lbl = sentence ? 'חזור אחריי' : recall ? 'אמור באנגלית' : 'אמור את המילה';
  const q = sentence ? `<div class="lp-q en" style="font-size:1.25rem">${hl(w.ex, w.w)}</div><div>${audioBtn(w.ex)}</div>`
    : recall ? `<div class="lp-q">${esc(w.he)}</div><button class="lp-audio" id="hint">${icon('bulb', 18)} רמז</button><div id="hintv" class="ltr mut" style="text-align:left"></div>`
    : `<div class="lp-q en">${esc(w.w)}</div><div class="mut">${esc(w.he)}</div><div>${audioBtn(w.w)}</div>`;
  frame(lbl, 'mic', `
    <div class="say"><div class="cslot" data-view="head" style="--s:76px"></div><div class="bub" style="flex:1;margin-bottom:14px">${q}</div></div>
    <button class="lp-mic" id="mic" aria-label="לחץ ודבר">${icon('mic', 46)}</button><div class="lp-hint" id="mh">לחץ ודבר</div><div id="heard"></div>`,
    `<button class="lp-skip" id="cant">לא יכול לדבר עכשיו</button>`);
  bindAudio(); if (!recall) say(target);
  if ($('#hint')) $('#hint').onclick = () => { $('#hintv').textContent = w.w.slice(0, Math.ceil(w.w.length / 2)) + '…'; };
  $('#cant').onclick = () => { state.noSpeakUntil = Date.now() + 15 * 60e3; save(); ctx.toast('בסדר! 15 דקות בלי דיבור'); show(); };
  $('#mic').onclick = async () => {
    const mic = $('#mic'), mh = $('#mh'); mic.classList.add('on'); mh.textContent = 'מקשיב…'; stopSpeaking();
    try {
      let ok, heard = '', chips = '', tip = '';
      if (azure.enabled()) {
        const r = await azure.assess(target);
        if (r.nomatch) { mic.classList.remove('on'); mh.textContent = 'לא שמעתי – נסה שוב, קרוב יותר'; return; }
        heard = r.text; ok = r.pron >= 65 && r.completeness >= 60;
        chips = r.words.map(x => `<span class="w ${x.acc >= 80 ? 'ok' : x.acc >= 60 ? 'mid' : 'no'}">${esc(x.w)}</span>`).join('');
        const worst = r.words.flatMap(x => x.ph.map(p => ({ ...p, w: x.w }))).sort((a, b) => a.acc - b.acc)[0];
        if (worst && worst.acc < 70 && byIPA[worst.p]) tip = `הצליל <b dir="ltr">/${esc(worst.p)}/</b> ב-<b dir="ltr">${esc(worst.w)}</b>: ${esc(byIPA[worst.p][3])}`;
      } else {
        const alts = await listen();
        if (!alts.length) { mic.classList.remove('on'); mh.textContent = 'לא שמעתי – נסה שוב, קרוב יותר'; return; }
        const c = compare(target, alts); heard = c.heard; ok = sentence ? c.score >= .75 : c.score === 1;
        const toks = target.replace(/[^A-Za-z' ]/g, '').split(' ');
        chips = toks.map((t, i) => `<span class="w ${c.marks[i] ? 'ok' : 'no'}">${esc(t)}</span>`).join('');
      }
      mic.classList.remove('on'); mh.textContent = 'לחץ כדי לנסות שוב';
      $('#heard').innerHTML = `<div class="lp-heard"><div class="mut" style="font-size:.85rem;direction:rtl;text-align:right">שמעתי:</div>${chips || esc(heard)}</div>`;
      L.tries++;
      sheet(ok, ok ? { tip } : { answer: esc(target), audio: target, tip: tip || (sentence ? 'הקשב לקצב: מילים חשובות חזקות, השאר קצרות.' : ''), retry: L.tries < 2 });
      if (ok) L.tries = 0;
    } catch (err) {
      mic.classList.remove('on'); mh.textContent = err.message === 'not-allowed' ? 'צריך לאשר מיקרופון בדפדפן' : 'המיקרופון לא זמין';
    }
  };
}

// ---------- 5. הקשב וסדר את המשפט ----------
function build(e) {
  const w = e.w, toks = w.ex.replace(/[.,!?]/g, '').split(' ');
  const extra = shuf(L.others.filter(x => !toks.map(t => t.toLowerCase()).includes(x.w.toLowerCase())).map(x => x.w)).slice(0, 2);
  const bank = shuf([...toks, ...extra].map((t, i) => ({ t, i })));
  frame('הקשב וסדר את המילים', 'sound', `
    <div class="say"><div class="cslot" data-view="head" style="--s:76px"></div><div class="bub" style="flex:1;margin-bottom:14px"><div class="lp-q" style="font-size:1.1rem">מה הוא אמר?</div><div>${audioBtn(w.ex)}</div></div></div>
    <div class="lp-ans" id="bAns" aria-label="התשובה שלך"></div>
    <div class="lp-bank" id="bank">${bank.map(b => `<button class="tile" data-i="${b.i}">${esc(b.t)}</button>`).join('')}</div>`, checkBtn(), 'info');
  bindAudio(); say(w.ex);
  const ans = [], chk = $('#chk'), A = $('#bAns');
  const redraw = () => { A.innerHTML = ans.map((b, k) => `<button class="tile" data-k="${k}">${esc(b.t)}</button>`).join(''); A.querySelectorAll('.tile').forEach(t => t.onclick = () => { const b = ans.splice(+t.dataset.k, 1)[0]; V.querySelector(`#bank .tile[data-i="${b.i}"]`).classList.remove('used'); redraw(); }); chk.disabled = !ans.length; };
  V.querySelectorAll('#bank .tile').forEach(t => t.onclick = () => { if (t.classList.contains('used')) return; t.classList.add('used'); ans.push(bank.find(b => b.i === +t.dataset.i)); redraw(); });
  chk.onclick = () => { const ok = ans.map(b => b.t.toLowerCase()).join(' ') === toks.map(t => t.toLowerCase()).join(' '); sheet(ok, ok ? {} : { answer: esc(w.ex), audio: w.ex }); };
}

// ---------- 6. אוזן ----------
function ear(e) {
  const p = e.p, target = p[e.tg], opts = shuf([p[0], p[1]]);
  frame('איזו מילה שמעת?', 'ear', `
    <button class="speaker" id="spk" aria-label="השמע שוב">${icon('sound', 44)}</button>
    <div class="lp-opts" style="grid-template-columns:1fr 1fr">${opts.map(o => `<button class="lp-opt en" data-o="${o}" style="font-size:1.5rem">${o}</button>`).join('')}</div>`, checkBtn(), 'info');
  const play = () => say(target, { rate: .8 }); $('#spk').onclick = play; setTimeout(play, 250);
  choose(o => o === target, () => ({ answer: esc(target), audio: target, tip: byIPA[p[2].split(' / ')[0]] ? `ההבדל: <b dir="ltr">${esc(p[2])}</b>. ${esc(byIPA[p[2].split(' / ')[0]][3])}` : '' }));
  const old = $('#chk').onclick; $('#chk').onclick = () => { const sel = V.querySelector('.lp-opt.sel'); if (sel) { const st = state.ear[p[2]] ||= { ok: 0, n: 0 }; st.n++; if (sel.dataset.o === target) st.ok++; save(); } old(); };
}

// ================== סוף שיעור ==================
function finish() {
  const mins = Math.max(1, Math.round((Date.now() - L.t0) / 60000)), acc = L.n ? Math.round(L.ok / L.n * 100) : 100;
  // חזרות לפי ביצוע אמיתי (לא לפי דירוג עצמי)
  for (const w of [...L.newW, ...L.rev]) { const r = L.res[w.w] || { ok: 1, bad: 0 }; srs.learn(cid(w.w)); srs.grade(cid(w.w), r.bad ? (L.rev.includes(w) ? 0 : 1) : 2); }
  const xp = L.xp + 10; addXP(xp, null);
  const d = state.daily; d.learn = (d.learn || 0) + L.newW.length; d.review = (d.review || 0) + L.rev.length; d.lessons = (d.lessons || 0) + 1;
  const hst = state.hist ||= {}; const hd = hst[today()] ||= { xp: 0, min: 0 }; hd.xp += xp; hd.min += mins;
  save(); ctx.refreshTop(); ctx.stage.celebrate(); chime(true);
  const missed = Object.entries(L.res).filter(([, r]) => r.bad).map(([k]) => k);
  V.innerHTML = `<div class="lp lp-end">
    <div class="say" style="justify-content:center;margin-top:12px"><div class="cslot" style="--s:120px"></div></div>
    <h2 class="center" style="font-size:1.7rem;margin-top:10px">השיעור הושלם!</h2>
    <p class="sub center"><span class="cbub ltr">Great job!</span></p>
    <div class="stats"><div class="stat"><b style="color:var(--brand-ink)">+${xp}</b><small>נקודות</small></div><div class="stat"><b style="color:var(--good-ink)">${acc}%</b><small>דיוק</small></div><div class="stat"><b>${mins}</b><small>דקות</small></div></div>
    ${L.newW.length ? `<div class="card"><b>מילים חדשות</b><div style="margin-top:8px">${L.newW.map(w => `<span class="w ok">${esc(w.w)}</span>`).join('')}</div></div>` : ''}
    ${missed.length ? `<div class="card"><b>נחזור עליהן בקרוב</b><div class="mut" style="font-size:.88rem;margin:4px 0 8px">טעית בהן – הן יחזרו מוקדם יותר</div>${missed.map(w => `<span class="w mid">${esc(w)}</span>`).join('')}</div>` : ''}
    <div class="lp-foot"><button class="btn o big full" id="h">המשך</button></div></div>`;
  $('#h').onclick = () => ctx.go('today');
}
