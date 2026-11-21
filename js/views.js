import { state, save, addXP, rollDay, levelProgress, reset, exportData, importData, fresh } from './store.js';
import * as azure from './azure.js';
import * as tutor from './tutor.js';
import * as srs from './srs.js';
import { say, listen, compare, norm, SR, listVoices, stopSpeaking } from './speech.js';
import { ANIMALS, animalImg } from './stage.js';
import { PHONEMES, PAIRS, byIPA } from '../data/phonemes.js';
import { SCENARIOS, REACTS, FIXES } from '../data/talk.js';

const WORDS = await fetch('data/words.json').then(r => r.json());
const ALL = WORDS.units.flatMap(u => u.words.map(w => ({ ...w, unit: u.id })));
const BYW = Object.fromEntries(ALL.map(w => [w.w, w]));
const cid = (w) => 'w:' + w;
const isDone = (w) => !!srs.get(cid(w.w)) || !!state.known?.[w.w]; // נלמדה או סומנה כמוכרת במבחן הרמה
const pick = (a) => a[Math.random() * a.length | 0];
const shuffle = (a) => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);
const hl = (ex, w) => ex.replace(new RegExp(`\\b(${w}\\w*)`, 'i'), '<b>$1</b>');

export { ALL, WORDS, hl, pick, shuffle, trySpeak, fresh };
let ctx, V;
export const init = (c) => {
  ctx = c; V = c.view; c.flowNext = flowNext;
  // מצב "מיקוד": בזמן תרגיל הבמה מתכווצת והתוכן מקבל את רוב המסך. סרגל התקדמות לשיעור היומי נוסף אוטומטית.
  new MutationObserver(() => {
    document.body.classList.toggle('compact', !V.querySelector('[data-big]')); // הדמות גדולה רק במסך הבית
    if (flow && !V.querySelector('.flowbar') && !V.querySelector('.flowfin')) V.insertAdjacentHTML('afterbegin', `<div class="flowbar"><span>שלב ${flow.i + 1} מתוך ${flow.steps.length} · <b>${flow.names[flow.i]}</b></span><i style="width:${(flow.i + .5) / flow.steps.length * 100}%"></i></div>`);
  }).observe(V, { childList: true });
};
// ---------- שיעור יומי מודרך: סדרת פעילויות אחת אחרי השנייה ----------
let flow = null;
export const clearFlow = () => { flow = null; };
function flowNext(fallback) {
  if (!flow) return fallback ? fallback() : ctx.back();
  flow.i++; if (flow.i >= flow.steps.length) { flow = null; return dailyDone(); } flow.steps[flow.i]();
}
function startDaily() {
  const st = [];
  if (srs.dueIds().length) st.push(['חזרות', () => startReview()]);
  st.push(['מילים חדשות', () => startLearn()]); st.push(['אימון אוזן', () => startEar(null, 6)]); st.push(['דיבור', () => startSentences(3)]);
  flow = { steps: st.map(x => x[1]), names: st.map(x => x[0]), i: 0 }; flow.steps[0]();
}
function dailyDone() {
  ctx.stage.celebrate(); addXP(10, null); ctx.refreshTop(); ctx.bubble('You did it! 🎉');
  V.innerHTML = `<div class="center flowfin"><div style="font-size:3.5rem">🏆</div><h2>סיימת את השיעור היומי!</h2><p class="sub">+10 XP. עוד תרגול חופשי? או נתראה מחר 🔥</p><button class="btn full" id="h">חזרה לבית</button></div>`;
  $('#h').onclick = () => ctx.go('today');
}
const $ = (s, el = V) => el.querySelector(s);
const on = (s, fn, el = V) => el.querySelectorAll(s).forEach(b => b.onclick = () => fn(b));

// ---------- מעטפת דיבור משותפת ----------
async function trySpeak(btn, target, out, { kind = 'speak', xp = 3 } = {}) {
  if (azure.enabled()) return trySpeakAzure(btn, target, out, { kind, xp });
  try {
    const alts = await listen(btn);
    if (!alts.length) { out.innerHTML = '<div class="mut">לא שמעתי 🙈 נסה שוב, קרוב יותר למיקרופון</div>'; return null; }
    const r = compare(target, alts);
    const words = target.replace(/[^A-Za-z' ]/g, '').split(' ');
    out.innerHTML = words.map((w, i) => `<span class="w ${r.marks[i] ? 'ok' : 'no'}">${w}</span>`).join('') + `<div class="mut ltr" style="font-size:.8rem">שמעתי: "${r.heard}" · ${Math.round(r.score * 100)}%</div>`;
    if (r.score === 1) { addXP(xp, kind); ctx.stage.celebrate(); ctx.bubble(pick(['Perfect! 🎉', 'Excellent!', 'That sounded great!'])); ctx.toast(`+${xp} XP`); }
    else if (r.score >= .5) { addXP(1, kind); ctx.bubble('Almost! Listen once more and try again.'); }
    else { ctx.stage.sad(); ctx.bubble('Listen carefully… and try again 👂'); }
    ctx.refreshTop(); return r;
  } catch (e) {
    out.innerHTML = `<div class="mut">${e.message === 'nosr' ? 'זיהוי דיבור זמין ב-Chrome / Edge / Safari. אפשר להאזין ולחזור בקול.' : e.message === 'not-allowed' ? 'צריך לאשר גישה למיקרופון בדפדפן.' : 'שגיאת זיהוי: ' + e.message}</div>`; return null;
  }
}

// ---------- הערכת הגייה ברמת פונמה (Azure) ----------
const IPAFIX = { r: 'ɹ', g: 'ɡ', 'ɜ': 'ɝ', 'ɹ̩': 'ɝ', 'ʧ': 'tʃ', 'ʤ': 'dʒ' };
const normP = (p) => IPAFIX[p] || p;
const cls = (a) => a >= 80 ? 'ok' : a >= 60 ? 'mid' : 'no';
export const azureErr = (e) => ({ 'azure-auth': 'מפתח Azure לא תקין או שהאזור שגוי. בדוק בהגדרות.', 'azure-network': 'אין חיבור ל-Azure כרגע.', 'not-allowed': 'צריך לאשר גישה למיקרופון בדפדפן.', 'sdk-load': 'לא הצלחתי לטעון את רכיב Azure (אינטרנט?).' }[e.message] || 'שגיאת Azure: ' + e.message.slice(0, 100));
export function recordPhonemes(r) {
  for (const w of r.words) for (const p of w.ph) { const k = normP(p.p), t = state.pacc[k] ||= { s: 0, n: 0 }; t.s += p.acc; t.n++; }
  save();
}
export function renderAssess(out, r) {
  const pills = [['ציון כולל', r.pron], ['דיוק', r.accuracy], ['שטף', r.fluency], ['קצב ומנגינה', r.prosody], ['שלמות', r.completeness]].filter(x => x[1] != null)
    .map(([l, v]) => `<span class="pill ${v >= 80 ? 'ok' : v < 60 ? 'hot' : ''}">${l} ${Math.round(v)}</span>`).join(' ');
  const worst = r.words.flatMap(w => w.ph.map(p => ({ ...p, w: w.w }))).filter(p => p.acc < 70).sort((a, b) => a.acc - b.acc)[0];
  const tip = worst && byIPA[normP(worst.p)] ? `<div class="tip"><b class="ltr">/${normP(worst.p)}/ במילה ${worst.w}</b> (${Math.round(worst.acc)}): ${byIPA[normP(worst.p)][3]}</div>` : '';
  out.innerHTML = `<div class="row c" style="margin-bottom:6px">${pills}</div>
    <div class="ltr">${r.words.map((w, i) => `<button class="w ${cls(w.acc)}" data-i="${i}">${w.w}${w.err === 'Omission' ? ' (חסרה)' : w.err === 'Insertion' ? ' (מיותרת)' : ''} <small>${Math.round(w.acc)}</small></button>`).join('')}</div>
    <div id="ph" class="ltr" style="margin-top:6px"></div>${tip}`;
  out.querySelectorAll('.w[data-i]').forEach(b => b.onclick = () => { const w = r.words[+b.dataset.i]; out.querySelector('#ph').innerHTML = `<b>${w.w}</b> ` + (w.ph.length ? w.ph.map(p => `<span class="w ${cls(p.acc)}">/${normP(p.p)}/ ${Math.round(p.acc)}</span>`).join('') : '<span class="mut">אין פירוט</span>'); });
}
async function trySpeakAzure(btn, target, out, { kind, xp }) {
  const old = btn.innerHTML; btn.classList.add('rec'); btn.innerHTML = '🎙️ מקשיב…'; stopSpeaking();
  try {
    const r = await azure.assess(target);
    if (r.nomatch) { out.innerHTML = '<div class="mut">לא שמעתי 🙈 נסה שוב, קרוב יותר למיקרופון</div>'; return null; }
    renderAssess(out, r); recordPhonemes(r);
    if (r.pron >= 85) { addXP(xp, kind); ctx.stage.celebrate(); ctx.bubble(pick(['Perfect! 🎉', 'Excellent!', 'That sounded great!'])); ctx.toast(`+${xp} XP`); }
    else if (r.pron >= 60) { addXP(1, kind); ctx.bubble('Good! Tap the red words to see which sounds to fix.'); }
    else { ctx.stage.sad(); ctx.bubble('Listen again, then try once more 👂'); }
    ctx.refreshTop(); return r;
  } catch (e) { out.innerHTML = `<div class="mut">${azureErr(e)}</div>`; return null; }
  finally { btn.classList.remove('rec'); btn.innerHTML = old; }
}

const speakBtns = (w) => `<div class="row"><button class="btn b" data-say="${w}">🔊 שמע</button><button class="btn g" data-slow="${w}">🐢 לאט</button><button class="btn o" data-mic="${w}">🎤 אמור</button></div><div class="res" id="res"></div>`;
function bindSpeak(el = V, opts) {
  on('[data-say]', b => say(b.dataset.say), el); on('[data-slow]', b => say(b.dataset.slow, { rate: .5 }), el);
  on('[data-mic]', b => trySpeak(b, b.dataset.mic, $('#res', el), opts), el);
}

// ---------- היום ----------
export function today() {
  rollDay(); const d = state.daily, due = srs.dueIds().length, A = ANIMALS[state.animal], lp = levelProgress();
  const goals = [[d.review, due ? 10 : 0], [d.learn, 5], [d.ear, 6], [d.speak, 3]].filter(g => g[1] > 0);
  const pct = Math.round(goals.reduce((a, g) => a + Math.min(1, g[0] / g[1]), 0) / goals.length * 100);
  const known = Object.keys(state.cards).length, left = ALL.filter(w => !isDone(w)).length;
  if (!state.onboarded && !known && !state.placement) return ctx.pages.onboarding(0);
  if (!state.placement && !known && !state.skipPlacement) { // משתמש חדש: קודם מבחן רמה
    V.innerHTML = `<div class="hero center" data-big><img class="av big" src="${animalImg(state.animal)}" alt=""><h2>ברוך הבא! אני ${A.name}</h2>
      <p class="sub">כדי לא לבזבז לך זמן על מה שאתה כבר יודע, בוא נבדוק את הרמה שלך. לוקח כ-8 דקות.</p>
      <button class="btn big full" id="pt">🎯 התחל מבחן רמה</button>
      <button class="btn g full" id="skip" style="margin-top:10px">אני מתחיל מאפס – דלג</button></div>`;
    $('#pt').onclick = () => ctx.placement.start();
    $('#skip').onclick = () => { state.skipPlacement = true; save(); today(); };
    return;
  }
  const P = state.placement, LV = ['Pre-A1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  V.innerHTML = `
    <div class="hero" data-big><div class="row" style="flex-wrap:nowrap;gap:12px"><img class="av" src="${animalImg(state.animal)}" alt=""><div style="flex:1"><b style="font-size:1.1rem">${greet()}! אני ${A.name}</b><div class="sub" style="margin:2px 0 6px">${P ? `<button class="pill ok" id="lvl" style="border:0">רמה ${LV[P.overall]}</button> · ` : ''}היום ${pct}%</div><div class="prog"><i style="width:${pct}%"></i></div></div></div>
      <button class="btn big full" id="goDaily" style="margin-top:14px">▶ ${pct >= 100 ? 'עוד שיעור' : pct > 0 ? 'המשך לשיעור היומי' : 'התחל את השיעור היומי'}</button>
      <div class="sub center" style="margin:8px 0 0">${due ? 'חזרות · ' : ''}5 מילים חדשות · אימון אוזן · דיבור · כ-10 דקות</div></div>
    <h3>תרגול חופשי</h3>
    <div class="quick">
      <button data-q="review"><i>🔁</i><b>חזרות</b><small>${due ? due + ' ממתינות' : 'אין כרגע'}</small></button>
      <button data-q="learn"><i>📚</i><b>מילים חדשות</b><small>${left} נותרו</small></button>
      <button data-q="ear"><i>👂</i><b>אימון אוזן</b><small>שומעים ובוחרים</small></button>
      <button data-q="speak"><i>🎤</i><b>דיבור</b><small>חוזרים אחרי משפט</small></button>
      <button data-q="rhythm"><i>🥁</i><b>מקצב</b><small>הטעמה וחיקוי דובר</small></button>
      <button data-q="talk"><i>💬</i><b>שיחה</b><small>עם ${A.name}</small></button>
    </div>
    <div class="stats"><div class="stat"><b>${known}</b><small>מילים נלמדו</small></div><div class="stat"><b>${srs.mature()}</b><small>בשליטה</small></div><div class="stat"><b>${state.streak}🔥</b><small>ימים ברצף</small></div></div>
    <details class="card"><summary><b>המסלול שלי</b> <span class="mut">(לאן אנחנו הולכים)</span></summary><div class="path" style="margin-top:8px">
      <div class="step on"><i>S0</i><span><b>צלילים</b> · 44 צלילים + אוזן</span></div>
      <div class="step on"><i>S1</i><span><b>אוצר מילים</b> · ${ALL.length} מילים</span></div>
      <div class="step on"><i>S2</i><span><b>מקצב וחיבורים</b></span></div>
      <div class="step on"><i>S4</i><span><b>חיקוי דובר</b></span></div>
      <div class="step on"><i>S5</i><span><b>שיחה עם AI</b></span></div>
      <div class="step lock"><i>S6–7</i><span>אידיומות וסלנג 🔒</span></div></div></details>`;
  $('#goDaily').onclick = startDaily;
  if ($('#lvl')) $('#lvl').onclick = () => ctx.placement.showResult(state.placement);
  if (!P) V.insertAdjacentHTML('beforeend', `<button class="task" id="pt2"><div class="ic">🎯</div><div class="t"><b>מבחן רמה</b><small>8 דקות – כדי לדלג על מה שאתה כבר יודע</small></div><div class="st">‹</div></button>`), $('#pt2').onclick = () => ctx.placement.start();
  on('[data-q]', b => ({ review: startReview, learn: () => startLearn(), ear: () => startEar(), speak: () => startSentences(), rhythm: () => ctx.go('rhythm'), talk: () => ctx.go('talk') })[b.dataset.q]());
}
const greet = () => { const h = new Date().getHours(); return h < 5 ? 'לילה טוב' : h < 12 ? 'בוקר טוב' : h < 18 ? 'צהריים טובים' : 'ערב טוב'; };

// ---------- מילים ----------
export function words(uid) {
  if (uid) return unitView(uid);
  const nextW = ALL.find(w => !isDone(w)); const nextU = nextW && nextW.unit;
  const levels = [...new Set(WORDS.units.map(u => u.lvl))];
  const done = ALL.length - ALL.filter(w => !isDone(w)).length;
  V.innerHTML = `<button class="back" data-back>→ תרגול</button><h2>מילים</h2>
    <button class="btn big full" id="go">▶ ${nextW ? 'המשך ללמוד: 5 מילים הבאות' : 'למדת הכול! 🎉'}</button>
    <div class="sub center" style="margin:8px 0 12px">${done} מתוך ${ALL.length} · כל מילה נלמדת פעם אחת ואז חוזרת רק בזמן החזרות</div>
    <input id="q" class="srch" placeholder="🔍 חפש מילה באנגלית או בעברית…" autocomplete="off"><div id="hits"></div>
    <div id="ul">${levels.map(l => { const us = WORDS.units.filter(u => u.lvl === l), tot = us.reduce((a, u) => a + u.words.length, 0), n = us.reduce((a, u) => a + u.words.filter(w => isDone(w)).length, 0);
      return `<details class="lvl" ${us.some(u => u.id === nextU) ? 'open' : ''}><summary><b>רמה ${l}</b><span class="mut">${n}/${tot}</span></summary>${us.map(u => { const k = u.words.filter(w => isDone(w)).length; return `<button class="urow" data-u="${u.id}"><span class="ic">${u.icon}</span><b>${u.title}</b><small>${k}/${u.words.length}</small></button>`; }).join('')}</details>`; }).join('')}</div>`;
  $('#go').onclick = () => startLearn();
  on('.urow', b => unitView(+b.dataset.u));
  $('#q').oninput = (e) => {
    const t = e.target.value.trim().toLowerCase(), h = $('#hits');
    $('#ul').hidden = !!t; if (!t) { h.innerHTML = ''; return; }
    const r = ALL.filter(w => w.w.toLowerCase().includes(t) || w.he.includes(t)).slice(0, 40);
    h.innerHTML = r.length ? `<div class="wlist">${r.map(w => `<div class="wr"><button class="round" data-say="${w.w}">🔊</button><div class="l"><b>${w.w}</b> ${isDone(w) ? '✅' : ''}<div>/${w.ipa}/</div></div><div class="r">${w.he}</div></div>`).join('')}</div>` : '<p class="sub center">לא נמצא</p>';
    on('[data-say]', b => say(b.dataset.say), h);
  };
}
function unitView(uid) {
  const u = WORDS.units.find(x => x.id === uid);
  V.innerHTML = `<button class="back" id="bk">→ חזרה</button><h2>${u.icon} ${u.title}</h2>
    <div class="row" style="margin:10px 0"><button class="btn o" id="go">📚 למד מילים חדשות</button></div>
    <div class="wlist">${u.words.map(w => `<div class="wr"><button class="round" data-say="${w.w}">🔊</button><div class="l"><b>${w.w}</b> ${isDone(w) ? '✅' : ''}<div>/${w.ipa}/</div></div><div class="r">${w.he}</div></div>`).join('')}</div>`;
  $('#bk').onclick = () => words(); $('#go').onclick = () => startLearn(uid);
  on('[data-say]', b => say(b.dataset.say));
}

export function startLearn(uid) {
  const pool = ALL.filter(w => !isDone(w) && (!uid || w.unit === uid));
  const q = pool.slice(0, state.settings.newPerDay || 5);
  if (!q.length) { ctx.toast('כבר למדת את כל המילים כאן 🎉'); return words(); }
  let i = 0;
  const card = () => {
    const w = q[i];
    V.innerHTML = `<button class="back" id="bk">→ יציאה</button><div class="dots">${q.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>
      <div class="wcard"><div class="word">${w.w}</div><div class="ipa">/${w.ipa}/</div><div class="he">${w.he}</div>
      <div class="ex">${hl(w.ex, w.w)}</div><div class="row c"><button class="btn g" data-say="${w.ex}" style="flex:0 0 auto">🔊 המשפט</button><span class="pill">${w.syl} הברות · הטעמה ${w.st}</span></div></div>
      ${speakBtns(w.w)}<button class="btn full" id="nx">${i < q.length - 1 ? 'הבנתי, הבא ←' : 'סיימתי ✔'}</button>`;
    $('#bk').onclick = () => ctx.back(); bindSpeak(V, { kind: 'speak' });
    on('[data-say]', b => say(b.dataset.say));
    srs.learn(cid(w.w)); // נכנס לחזרות מרגע שהוצג: לא יוצג שוב כ'חדש' גם אם יצאת באמצע
    ctx.stage.celebrate(); say(w.w, { show: false });
    $('#nx').onclick = () => { addXP(3, 'learn'); ctx.refreshTop(); if (++i < q.length) card(); else done(); };
  };
  const done = () => {
    ctx.stage.celebrate(); ctx.bubble('You learned ' + q.length + ' new words! 🎉');
    V.innerHTML = `<div class="center"><div style="font-size:3rem">🎉</div><h2>למדת ${q.length} מילים!</h2><p class="sub">הן נכנסו לחזרות המרווחות. כדי שיישארו – תחזור אליהן מחר.</p>
      <div class="row c">${q.map(w => `<span class="w ok">${w.w}</span>`).join('')}</div><br>${flow ? '<button class="btn full" id="fl">המשך ←</button>' : '<div class="row"><button class="btn o" id="m">עוד מילים</button><button class="btn g" id="h">למסך הבית</button></div>'}</div>`;
    if (flow) $('#fl').onclick = () => flowNext(); else { $('#m').onclick = () => startLearn(uid); $('#h').onclick = () => ctx.back(); }
  };
  card();
}

// ---------- חזרות ----------
export function startReview() {
  const q = srs.dueIds().filter(id => BYW[id.slice(2)] || state.extra?.[id.slice(2)]).slice(0, 15);
  if (!q.length) { if (flow) return flowNext(); V.innerHTML = `<div class="center"><div style="font-size:3rem">✨</div><h2>אין חזרות כרגע</h2><p class="sub">למד מילים חדשות כדי למלא את הסל.</p><button class="btn o" id="l">📚 מילים חדשות</button></div>`; $('#l').onclick = () => startLearn(); return; }
  let i = 0, ok = 0;
  const front = () => {
    const w = BYW[q[i].slice(2)] || state.extra?.[q[i].slice(2)]; if (!w) { i++; return i < q.length ? front() : fin(); }
    V.innerHTML = `<button class="back" id="bk">→ יציאה</button><div class="dots">${q.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>
      <div class="wcard"><p class="sub">איך אומרים באנגלית?</p><div class="he" style="font-size:2rem">${w.he}</div></div>
      <div class="res" id="res"></div><div class="row"><button class="btn o" id="mic">🎤 אמור</button><button class="btn b" id="show">הצג תשובה</button></div>`;
    $('#bk').onclick = () => ctx.back();
    $('#mic').onclick = (e) => trySpeak(e.currentTarget, w.w, $('#res'), { kind: 'speak', xp: 1 });
    $('#show').onclick = () => back(w);
  };
  const back = (w) => {
    const pv = srs.preview(cid(w.w)); say(w.w, { show: false }); ctx.bubble(w.w);
    V.innerHTML = `<div class="dots">${q.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>
      <div class="wcard"><div class="word">${w.w}</div><div class="ipa">/${w.ipa}/</div><div class="he">${w.he}</div><div class="ex">${hl(w.ex, w.w)}</div></div>
      <div class="row c"><button class="btn g" data-say="${w.w}" style="flex:0 0 auto">🔊</button><button class="btn g" data-slow="${w.w}" style="flex:0 0 auto">🐢</button></div><br>
      <p class="sub center">עד כמה זכרת?</p>
      <div class="row">${['שוב', 'קשה', 'טוב', 'קל'].map((l, g) => `<button class="btn ${g === 0 ? 'o' : g === 3 ? 'b' : g === 1 ? 'g' : ''}" data-g="${g}" style="flex-direction:column;min-height:58px;padding:0 4px">${l}<small style="font-weight:500;opacity:.85">${pv[g]}</small></button>`).join('')}</div>`;
    on('[data-say]', b => say(b.dataset.say)); on('[data-slow]', b => say(b.dataset.slow, { rate: .5 }));
    on('[data-g]', b => { const g = +b.dataset.g; srs.grade(cid(w.w), g); if (g >= 2) { ok++; ctx.stage.celebrate(); } addXP(g >= 2 ? 2 : 1, 'review'); ctx.refreshTop(); if (++i < q.length) front(); else fin(); });
  };
  const fin = () => { V.innerHTML = `<div class="center"><div style="font-size:3rem">🔁</div><h2>סיימת ${q.length} חזרות</h2><p class="sub">זכרת ${ok} מתוכן.</p><button class="btn o full" id="h">${flow ? 'המשך ←' : 'חזרה לבית'}</button></div>`; $('#h').onclick = () => flowNext(); };
  front();
}

// ---------- משפטים (דיבור) ----------
export function startSentences(n = 5) {
  const learned = ALL.filter(w => isDone(w));
  const q = fresh(learned.length >= 40 ? learned : ALL, 'sent', n, w => w.w); let i = 0;
  const card = () => {
    const w = q[i];
    V.innerHTML = `<button class="back" id="bk">→ יציאה</button><div class="dots">${q.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>
      <p class="sub center">שמע, ואז חזור אחרי המשפט בקול</p><div class="ex" style="font-size:1.35rem;text-align:center">${hl(w.ex, w.w)}</div><div class="he center mut" style="font-size:1rem">מילת המפתח: ${w.w} – ${w.he}</div><br>
      ${speakBtns(w.ex)}<button class="btn g full" id="nx">${i < q.length - 1 ? 'הבא ←' : 'סיום'}</button>`;
    $('#bk').onclick = () => ctx.back(); bindSpeak(V, { kind: 'speak', xp: 3 }); say(w.ex);
    $('#nx').onclick = () => { if (++i < q.length) card(); else flowNext(); };
  };
  card();
}

// ---------- צלילים ----------
export function sounds(sub = 'map') {
  V.innerHTML = `<button class="back" data-back>→ תרגול</button><div class="seg"><button data-s="map" class="${sub === 'map' ? 'on' : ''}">מפת הצלילים</button><button data-s="ear" class="${sub === 'ear' ? 'on' : ''}">אימון אוזן</button><button data-s="lab" class="${sub === 'lab' ? 'on' : ''}">מעבדה 🎯</button><button data-s="me" class="${sub === 'me' ? 'on' : ''}">הנקודות שלי</button></div><div id="sv"></div>`;
  on('.seg button', b => sounds(b.dataset.s));
  const sv = $('#sv');
  if (sub === 'map') {
    const tile = (p) => `<button class="ph ${p[4] ? 'hard' : ''} ${state.phon[p[0]] ? 'dn' : ''}" data-p="${p[0]}">${p[0]}<small>${p[2].split(' · ')[0]}</small></button>`;
    const hard = PHONEMES.filter(p => p[4]), easy = PHONEMES.filter(p => !p[4]);
    sv.innerHTML = `<h2>הצלילים שחשוב לשפר</h2><p class="sub">אלה ${hard.length} הצלילים שדוברי עברית מתקשים בהם. לחץ על צליל כדי לשמוע, לראות איך מפיקים אותו ולתרגל.</p>
      <div class="grid3">${hard.map(tile).join('')}</div>
      <details class="card" style="margin-top:14px"><summary><b>שאר הצלילים</b> <span class="mut">(${easy.length}, קלים יותר)</span></summary><div class="grid3" style="margin-top:10px">${easy.map(tile).join('')}</div></details>`;
    on('.ph', b => phoneme(b.dataset.p));
  } else if (sub === 'ear') {
    sv.innerHTML = `<h2>אימון אוזן 👂</h2><p class="sub">מי שלא שומע את ההבדל – לא יפיק אותו. שומעים מילה, ובוחרים מה נאמר. 10 שאלות.</p>
      <button class="btn o full" id="all">התחל אימון</button><h3>לפי תחום</h3><div class="chips"><button data-f="vowel">תנועות</button><button data-f="cons">עיצורים</button><button data-f="th">TH</button><button data-f="vb">V / B</button><button data-f="rl">R / L</button></div>`;
    $('#all').onclick = () => startEar();
    on('[data-f]', b => startEar(b.dataset.f));
  } else if (sub === 'lab') {
    sv.innerHTML = `<h2>מעבדת הגייה 🎯</h2><p class="sub">כתוב כל משפט באנגלית, אמור אותו, וקבל ציון לכל מילה ולכל צליל, כולל קצב ומנגינה.</p>
      ${azure.enabled() ? '' : '<div class="tip">צריך לחבר Azure כדי להשתמש במעבדה (הגדרות ⚙️ › שירותים מתקדמים). בלי זה אפשר לתרגל עם הזיהוי הרגיל.</div>'}
      <textarea id="labtxt" class="srch ltr" rows="2" placeholder="Type a sentence… e.g. I would like a glass of water, please.">I would like a glass of water, please.</textarea>
      <div class="row"><button class="btn b" id="labhear">🔊 שמע</button><button class="btn o" id="labmic">🎤 אמור</button></div><div class="res" id="res"></div>`;
    $('#labhear').onclick = () => say($('#labtxt').value.trim() || 'Hello');
    $('#labmic').onclick = (e) => { const t = $('#labtxt').value.trim(); if (t) trySpeak(e.currentTarget, t, $('#res'), { kind: 'speak', xp: 3 }); };
  } else {
    const weak = Object.entries(state.pacc).filter(([, v]) => v.n >= 3).map(([k, v]) => ({ k, avg: v.s / v.n, n: v.n })).sort((a, b) => a.avg - b.avg).slice(0, 8);
    const rows = Object.entries(state.ear).map(([k, v]) => ({ k, acc: v.ok / v.n, n: v.n })).sort((a, b) => a.acc - b.acc);
    sv.innerHTML = `<h2>הנקודות שלי</h2>` + (weak.length ? `<h3>צלילים להתמקד בהם (מדידת Azure)</h3>${weak.map(w => `<button class="task" data-ph="${w.k}"><div class="ic ltr" style="font-weight:800">/${w.k}/</div><div class="t"><b>${Math.round(w.avg)}/100</b><small>${w.n} מדידות · ${byIPA[w.k] ? byIPA[w.k][2] : ''}</small><div class="prog"><i style="width:${w.avg}%;background:${w.avg >= 80 ? 'var(--good)' : w.avg < 60 ? 'var(--bad)' : 'var(--gold)'}"></i></div></div><div class="st">‹</div></button>`).join('')}` : '') + `<h3>זיהוי צלילים (אימון אוזן)</h3>` + (rows.length ? rows.map(r => `<div class="card"><div class="row" style="justify-content:space-between"><b class="ltr">${r.k}</b><span class="pill ${r.acc >= .85 ? 'ok' : r.acc < .6 ? 'hot' : ''}">${Math.round(r.acc * 100)}% · ${r.n} שאלות</span></div><div class="prog"><i style="width:${r.acc * 100}%"></i></div></div>`).join('') : '<div class="card center">עוד אין נתונים – התחל אימון אוזן 👂</div>');
    on('[data-ph]', b => { if (byIPA[b.dataset.ph]) phoneme(b.dataset.ph); }, sv);
  }
}
export function phoneme(ipa) {
  const p = PHONEMES.find(x => x[0] === ipa), ex = p[2].split(' · ');
  const rel = PAIRS.filter(x => x[2].split(' / ').includes(ipa));
  V.innerHTML = `<button class="back" id="bk">→ חזרה</button>
    <div class="center"><div class="word" style="font-size:4rem">/${ipa}/</div><span class="pill">${p[1]}</span> ${p[4] ? '<span class="pill hot">🔥 קשה לדוברי עברית</span>' : ''}</div>
    <div class="card" style="margin-top:12px"><b>איך מפיקים?</b><p style="margin:6px 0 0">${p[3]}</p></div>
    <h3>מילים לתרגול</h3><div class="wlist">${ex.map(w => `<div class="wr"><button class="round" data-say="${w}">🔊</button><div class="l"><b>${w}</b></div><button class="btn o" data-mic="${w}" style="min-height:40px;padding:0 14px">🎤</button></div>`).join('')}</div><div class="res" id="res"></div>
    ${rel.length ? `<h3>זוגות להבחנה</h3><div class="row">${rel.map(r => `<button class="btn g" data-pair="${r[0]}|${r[1]}" style="flex:0 0 auto">${r[0]} · ${r[1]}</button>`).join('')}</div>` : ''}
    <br><button class="btn b full" id="ear">👂 אימון אוזן על הצליל הזה</button>`;
  $('#bk').onclick = () => sounds('map'); bindSpeak(V, { kind: 'speak', xp: 2 });
  on('[data-pair]', b => { const [x, y] = b.dataset.pair.split('|'); say(x, { rate: .7 }).then(() => say(y, { rate: .7 })); });
  state.phon[ipa] = state.phon[ipa] || { n: 0 }; state.phon[ipa].n++; save();
  $('#ear').onclick = () => startEar('p:' + ipa);
}

export function startEar(filter, n = 10) {
  let pool = PAIRS;
  if (filter === 'vowel') pool = PAIRS.filter(p => p[3] === 'vowel'); else if (filter === 'cons') pool = PAIRS.filter(p => p[3] === 'cons');
  else if (filter === 'th') pool = PAIRS.filter(p => /θ|ð/.test(p[2])); else if (filter === 'vb') pool = PAIRS.filter(p => /v/.test(p[2]) && /b|w/.test(p[2]));
  else if (filter === 'rl') pool = PAIRS.filter(p => /ɹ/.test(p[2])); else if (filter?.startsWith('p:')) pool = PAIRS.filter(p => p[2].split(' / ').includes(filter.slice(2)));
  if (!pool.length) pool = PAIRS;
  const N = Math.min(n, pool.length); let i = 0, ok = 0;
  const q = fresh(pool, 'ear:' + (filter || 'all'), N, p => p[0] + '|' + p[1]).map(p => ({ p, t: Math.random() < .5 ? 0 : 1, order: Math.random() < .5 })); // בלי חזרות
  const ask = () => {
    const { p, t, order } = q[i], target = p[t], opts = order ? [p[0], p[1]] : [p[1], p[0]];
    V.innerHTML = `<button class="back" id="bk">→ יציאה</button><div class="dots">${q.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>
      <p class="sub center">איזו מילה שמעת?</p><button class="speaker" id="spk">🔊</button>
      ${opts.map(o => `<button class="choice" data-c="${o}">${o}</button>`).join('')}<div id="fb"></div>`;
    $('#bk').onclick = () => ctx.back(); const play = () => say(target, { rate: .75, show: false }); $('#spk').onclick = play; setTimeout(play, 250);
    on('.choice', b => {
      const good = b.dataset.c === target, st = state.ear[p[2]] = state.ear[p[2]] || { ok: 0, n: 0 }; st.n++; if (good) { st.ok++; ok++; } save();
      V.querySelectorAll('.choice').forEach(c => { c.disabled = true; if (c.dataset.c === target) c.classList.add('ok'); else if (c === b) c.classList.add('no'); });
      addXP(good ? 2 : 0, 'ear'); if (!good) { state.daily.ear++; save(); } ctx.refreshTop(); good ? ctx.stage.celebrate() : ctx.stage.sad();
      $('#fb').innerHTML = `<div class="tip ltr">${good ? '✅ נכון!' : '❌ זו הייתה'} <b>${target}</b> · ניגוד: ${p[2]}</div>
        <div class="row"><button class="btn g" id="a">🔊 ${p[0]}</button><button class="btn g" id="b">🔊 ${p[1]}</button><button class="btn o" data-mic="${target}">🎤 אמור</button></div><div class="res" id="res"></div><button class="btn full" id="nx">${i < N - 1 ? 'הבא ←' : 'סיום'}</button>`;
      $('#a').onclick = () => say(p[0], { rate: .7, show: false }); $('#b').onclick = () => say(p[1], { rate: .7, show: false });
      bindSpeak($('#fb'), { kind: 'speak', xp: 2 });
      $('#nx').onclick = () => { if (++i < N) ask(); else sum(); };
    });
  };
  const sum = () => { const pc = Math.round(ok / N * 100); ctx.stage.celebrate(); V.innerHTML = `<div class="center"><div style="font-size:3rem">${pc >= 80 ? '🏆' : '💪'}</div><h2>${ok}/${N} נכון (${pc}%)</h2><p class="sub">${pc >= 90 ? 'אוזן חדה! עכשיו אפשר להתמקד בהפקה.' : 'האוזן מתחדדת עם חזרות – נסה שוב מחר.'}</p>${flow ? '<button class="btn full" id="fl">המשך ←</button>' : '<div class="row"><button class="btn o" id="r">עוד סבב</button><button class="btn g" id="h">סיום</button></div>'}</div>`; if (flow) $('#fl').onclick = () => flowNext(); else { $('#r').onclick = () => startEar(filter); $('#h').onclick = () => ctx.back(); } };
  ask();
}

// ---------- שיחה ----------
let scen = SCENARIOS[0];
export function talk() {
  const ai = tutor.enabled();
  V.innerHTML = `<button class="back" data-back>→ תרגול</button><h2>שיחה 💬 ${ai ? '<span class="pill ok">AI</span>' : ''}</h2><p class="sub">${ai ? `${ANIMALS[state.animal].name} מנהל/ת איתך שיחה אמיתית ומתקן/ת ניסוחים לא טבעיים.` : 'שיחה מבוססת כללים. לשיחה חכמה עם AI – הוסף מפתח Claude בהגדרות ⚙️.'}</p>
    <div class="chips">${SCENARIOS.map(s => `<button data-s="${s.id}" class="${s.id === scen.id ? 'on' : ''}">${s.icon} ${s.title}</button>`).join('')}</div>
    <div class="chat" id="log"></div><div id="fx"></div>
    <div class="row" style="margin-top:10px"><button class="btn o full" id="mic">🎤 ענה בקול</button>${ai ? '<button class="btn g" id="sum" style="flex:0 0 auto">📋 סיכום</button>' : ''}</div>
    <div class="input"><input id="txt" placeholder="או הקלד באנגלית…" autocomplete="off" autocapitalize="sentences"><button class="btn" id="send" style="min-height:44px;padding:0 16px">שלח</button></div>`;
  on('.chips button', b => { scen = SCENARIOS.find(s => s.id === b.dataset.s); talk(); });
  const log = $('#log'); let busy = false;
  const add = (c, t) => { log.insertAdjacentHTML('beforeend', `<div class="msg ${c}">${t}</div>`); log.scrollTop = log.scrollHeight; return log.lastElementChild; };
  const fix = (html) => { $('#fx').innerHTML = html ? `<div class="tip">${html}</div>` : ''; };
  const micPress = async (e, handler) => {
    const btn = e.currentTarget;
    if (azure.enabled()) { // Azure: תמלול + הערכת הגייה במעבר אחד (ללא טקסט ייחוס – מצב חופשי)
      try { const SDK = await azure.loadSDK(); const c = SDK.SpeechConfig.fromSubscription(state.settings.azureKey.trim(), state.settings.azureRegion.trim()); c.speechRecognitionLanguage = 'en-US';
        const old = btn.innerHTML; btn.classList.add('rec'); btn.innerHTML = '🎙️ מקשיב…'; stopSpeaking();
        const rec = new SDK.SpeechRecognizer(c, SDK.AudioConfig.fromDefaultMicrophoneInput());
        rec.recognizeOnceAsync(r => { rec.close(); btn.classList.remove('rec'); btn.innerHTML = old; if (r.text) handler(r.text); }, () => { rec.close(); btn.classList.remove('rec'); btn.innerHTML = old; fix('לא הצלחתי להקשיב – בדוק מיקרופון/Azure.'); });
      } catch (err) { fix(azureErr(err)); }
      return;
    }
    try { const a = await listen(btn); if (a[0]) handler(a[0]); } catch { fix('זיהוי דיבור לא זמין בדפדפן הזה – אפשר להקליד.'); }
  };

  if (ai) {
    const sess = tutor.session(ANIMALS[state.animal].name, `${scen.title} (${scen.qs[0]})`);
    const run = async (p) => {
      busy = true; const dots = add('a', '…');
      try { const out = await p; dots.textContent = out.reply; fix(out.better ? `💡 ${out.why_he}<div class="ltr"><s>${out.original}</s> → <b>${out.better}</b></div>` : ''); await say(out.reply); return out; }
      catch (e) { dots.remove(); fix(tutor.errMsg(e)); return null; } finally { busy = false; }
    };
    const answer = async (txt) => { txt = txt.trim(); if (!txt || busy) return; add('u', txt); $('#txt').value = ''; const o = await run(sess.send(txt)); if (o) { addXP(o.better ? 2 : 5, 'speak'); ctx.refreshTop(); } };
    $('#sum').onclick = async () => { if (busy) return; busy = true; fix('מכין סיכום…'); try { const t = await sess.summary(); $('#fx').innerHTML = `<div class="tip" style="white-space:pre-wrap">${t.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</div>`; addXP(8, 'speak'); ctx.refreshTop(); } catch (e) { fix(tutor.errMsg(e)); } busy = false; };
    $('#send').onclick = () => answer($('#txt').value); $('#txt').onkeydown = e => { if (e.key === 'Enter') answer($('#txt').value); };
    $('#mic').onclick = (e) => micPress(e, answer);
    run(sess.start());
    return;
  }

  let q = 0;
  const ask = () => { if (q >= scen.qs.length) { add('a', 'That was a great conversation! 🎉'); say('That was a great conversation!'); addXP(10, 'speak'); ctx.refreshTop(); ctx.stage.celebrate(); q = 0; return; } const t = scen.qs[q++]; add('a', t); return say(t); };
  const answer = async (txt) => {
    txt = txt.trim(); if (!txt || busy) return; busy = true; add('u', txt); $('#txt').value = '';
    const f = FIXES.find(x => x[0].test(txt));
    fix(f ? `💡 ${f[2]}<div class="ltr"><b>${txt.replace(f[0], f[1])}</b></div>` : '');
    addXP(f ? 1 : 4, 'speak'); ctx.refreshTop();
    await say(pick(REACTS)); busy = false; ask();
  };
  $('#send').onclick = () => answer($('#txt').value); $('#txt').onkeydown = e => { if (e.key === 'Enter') answer($('#txt').value); };
  $('#mic').onclick = (e) => micPress(e, answer);
  ask();
}

// ---------- הגדרות וחברים ----------
export function openSheet(html) { const s = document.getElementById('sheet'); document.getElementById('sheetBody').innerHTML = html; s.hidden = false; return document.getElementById('sheetBody'); }
export const closeSheet = () => { document.getElementById('sheet').hidden = true; };

export function friends() {
  const b = openSheet(`<h2>בחר חבר ללמידה</h2><p class="sub">לכל חבר קול משלו. לחץ כדי לבחור.</p><div class="pick">${Object.entries(ANIMALS).map(([k, a]) => `<button data-a="${k}" class="${k === state.animal ? 'on' : ''}"><img src="${animalImg(k)}" alt="" loading="lazy">${a.name}<br><span class="mut" style="font-weight:500">${a.desc}</span></button>`).join('')}</div>`);
  on('[data-a]', x => { closeSheet(); ctx.setAnimal(x.dataset.a, true); }, b);
}
export function settings() {
  const voices = listVoices(), s = state.settings;
  const b = openSheet(`<h2>הגדרות</h2>
    <label class="field">מבטא יעד<select id="acc"><option value="en-US">אמריקאי (General American)</option><option value="en-GB">בריטי (RP)</option><option value="en-AU">אוסטרלי</option></select></label>
    <label class="field">קול הדפדפן (כשאין Azure)<select id="voice">${voices.length ? voices.map(v => `<option value="${v.voiceURI}" ${v.voiceURI === s.voice ? 'selected' : ''}>${/natural|neural|online/i.test(v.name) ? '⭐ ' : ''}${v.name} (${v.lang})</option>`).join('') : '<option value="">לא נמצאו קולות באנגלית במכשיר</option>'}</select></label>
    <label class="field">מהירות דיבור: <span id="rv">${s.rate}</span><input type="range" id="rate" min="0.5" max="1.2" step="0.05" value="${s.rate}"></label>
    <label class="field">גובה קול (קול הדפדפן): <span id="pv">${s.pitch || 'אוטומטי לפי החבר'}</span><input type="range" id="pitch" min="0" max="1.8" step="0.05" value="${s.pitch}"></label>
    <div class="row"><button class="btn b" id="test">🔊 נסה קול</button><button class="btn g" id="close">סגור</button></div>

    <details class="card" style="margin-top:18px"><summary><b>⚡ מתקדם: חיבורי AI</b> <span class="mut">(אופציונלי)</span></summary>
    <p class="mut" style="font-size:.82rem;margin:0 0 10px">המפתחות נשמרים <b>רק במכשיר הזה</b> ולא נשלחים לשום מקום מלבד השירות עצמו. השתמש במפתחות ייעודיים עם מגבלת הוצאה. מדריך: SETUP.md בריפו.</p>
    <div class="card"><b>🎯 Azure Speech</b> <span class="mut">(הערכת הגייה ברמת פונמה + קולות עצביים; שכבה חינמית F0)</span>
      <label class="field" style="margin-top:8px">מפתח (Key 1)<input id="azk" type="password" class="srch ltr" style="margin:0" autocomplete="off" value="${s.azureKey}"></label>
      <label class="field">אזור (Region)<input id="azr" list="regions" class="srch ltr" style="margin:0" placeholder="westeurope" value="${s.azureRegion}"><datalist id="regions"><option>westeurope</option><option>northeurope</option><option>eastus</option><option>uksouth</option><option>uaenorth</option><option>israelcentral</option></datalist></label>
      <label class="field"><span><input type="checkbox" id="azt" ${s.azureTTS !== false ? 'checked' : ''}> קול עצבי של Azure (במקום קול הדפדפן)</span></label>
      <label class="field">קול (ריק = קול ייחודי לכל חבר)<select id="azv"><option value="">אוטומטי לפי החבר</option>${azure.AZURE_VOICES.map(([id, l]) => `<option value="${id}" ${id === s.azureVoice ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <button class="btn g full" id="azt1">בדוק חיבור Azure</button><div class="res" id="azres"></div></div>
    <label class="field" style="margin-top:12px">ספק שיחת AI<select id="aip"><option value="claude" ${s.aiProvider !== 'gemini' ? 'selected' : ''}>Claude</option><option value="gemini" ${s.aiProvider === 'gemini' ? 'selected' : ''}>Gemini (Google)</option></select></label>
    <div class="card"><b>✨ Gemini</b> <span class="mut">(שכבה חינמית ב-Google AI Studio)</span>
      <label class="field" style="margin-top:8px">מפתח API<input id="gmk" type="password" class="srch ltr" style="margin:0" autocomplete="off" placeholder="AIza..." value="${s.geminiKey || ''}"></label>
      <label class="field">מודל<input id="gmm" list="gmodels" class="srch ltr" style="margin:0" value="${s.geminiModel || 'gemini-flash-lite-latest'}"><datalist id="gmodels"><option>gemini-flash-lite-latest</option><option>gemini-flash-latest</option><option>gemini-pro-latest</option></datalist></label>
      <div class="row"><button class="btn g" id="gmt">בדוק חיבור</button><button class="btn g" id="gml">הצג מודלים זמינים</button></div><div class="res" id="gmres"></div></div>
    <div class="card"><b>🧠 Claude</b> <span class="mut">(שיחה חכמה ותיקוני ניסוח)</span>
      <label class="field" style="margin-top:8px">מפתח API<input id="clk" type="password" class="srch ltr" style="margin:0" autocomplete="off" placeholder="sk-ant-..." value="${s.claudeKey}"></label>
      <label class="field">מודל<select id="clm">${tutor.MODELS.map(([id, l]) => `<option value="${id}" ${id === (s.claudeModel || tutor.MODELS[0][0]) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <button class="btn g full" id="clt">בדוק חיבור Claude</button><div class="res" id="clres"></div></div>

    </details>
    <button class="btn b full" id="ptst" style="margin-top:14px">🎯 מבחן רמה ${state.placement ? '(מחדש)' : ''}</button>
    <h3>💾 גיבוי התקדמות</h3><p class="mut" style="font-size:.82rem;margin:0 0 8px">כדי להעביר בין מכשירים (בלי מפתחות).</p>
    <div class="row"><button class="btn g" id="exp">⬇ ייצוא</button><button class="btn g" id="imp">⬆ ייבוא</button></div><input type="file" id="impf" accept="application/json" hidden>
    <button class="btn g full" id="rst" style="margin-top:14px;color:#b3254a">איפוס כל ההתקדמות</button>`);
  $('#acc', b).value = s.accent;
  const upd = () => { s.accent = $('#acc', b).value; s.voice = $('#voice', b).value; s.rate = +$('#rate', b).value; s.pitch = +$('#pitch', b).value; $('#rv', b).textContent = s.rate; $('#pv', b).textContent = s.pitch || 'אוטומטי'; save(); };
  ['acc', 'voice', 'rate', 'pitch'].forEach(id => $('#' + id, b).onchange = $('#' + id, b).oninput = upd);
  $('#acc', b).onchange = () => { upd(); s.voice = ''; save(); settings(); };
  $('#test', b).onclick = () => say(`Hello! I'm ${ANIMALS[state.animal].name}. Nice to meet you!`); $('#close', b).onclick = closeSheet;
  const adv = () => { s.aiProvider = $('#aip', b).value; s.geminiKey = $('#gmk', b).value.trim(); s.geminiModel = $('#gmm', b).value.trim() || 'gemini-flash-lite-latest'; s.azureKey = $('#azk', b).value.trim(); s.azureRegion = $('#azr', b).value.trim().toLowerCase(); s.azureTTS = $('#azt', b).checked; s.azureVoice = $('#azv', b).value; s.claudeKey = $('#clk', b).value.trim(); s.claudeModel = $('#clm', b).value; save(); };
  ['azk', 'azr', 'azt', 'azv', 'clk', 'clm', 'aip', 'gmk', 'gmm'].forEach(id => $('#' + id, b).onchange = adv);
  $('#azt1', b).onclick = async () => { adv(); const o = $('#azres', b); if (!azure.enabled()) { o.textContent = 'הכנס מפתח ואזור.'; return; } o.textContent = '⏳ בודק…';
    try { await azure.speak('Connection successful. Nice to meet you!', { voice: azure.voiceFor(ANIMALS[state.animal].voice), onStart: () => ctx.stage.speaking = true, onPulse: () => ctx.stage.pulse = 1, onEnd: () => ctx.stage.speaking = false }); o.innerHTML = '<span class="pill ok">✅ מחובר</span>'; } catch (e) { o.innerHTML = `<span class="pill hot">${azureErr(e)}</span>`; } };
  $('#clt', b).onclick = async () => { adv(); const o = $('#clres', b); if (!tutor.enabled()) { o.textContent = 'הכנס מפתח.'; return; } o.textContent = '⏳ בודק…';
    try { const t = await tutor.test(); o.innerHTML = `<span class="pill ok">✅ מחובר (${t.slice(0, 20)})</span>`; } catch (e) { o.innerHTML = `<span class="pill hot">${tutor.errMsg(e)}</span>`; } };
  $('#gmt', b).onclick = async () => { adv(); const o = $('#gmres', b); if (!s.geminiKey) { o.textContent = 'הכנס מפתח.'; return; } o.textContent = '⏳ בודק…'; const prev = s.aiProvider; s.aiProvider = 'gemini';
    try { const t = await tutor.test(); o.innerHTML = `<span class="pill ok">✅ מחובר (${t.slice(0, 20)})</span>`; } catch (e) { o.innerHTML = `<span class="pill hot">${tutor.errMsg(e)}</span>`; } s.aiProvider = prev; };
  $('#gml', b).onclick = async () => { adv(); const o = $('#gmres', b); if (!s.geminiKey) { o.textContent = 'הכנס מפתח.'; return; } o.textContent = '⏳ מביא רשימה…';
    try { const l = await tutor.listGeminiModels(); $('#gmodels', b).innerHTML = l.map(n => `<option>${n}</option>`).join(''); o.innerHTML = `<span class="pill ok">${l.length} מודלים</span><div class="ltr mut" style="font-size:.78rem;margin-top:4px">${l.slice(0, 12).join(' · ')}</div>`; } catch (e) { s.aiProvider = 'gemini'; o.innerHTML = `<span class="pill hot">${tutor.errMsg(e)}</span>`; s.aiProvider = $('#aip', b).value; } };
  $('#ptst', b).onclick = () => { closeSheet(); ctx.placement.start(); };
  $('#exp', b).onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([exportData()], { type: 'application/json' })); a.download = `native-path-${new Date().toLocaleDateString('sv')}.json`; a.click(); };
  $('#imp', b).onclick = () => $('#impf', b).click();
  $('#impf', b).onchange = async (e) => { try { importData(await e.target.files[0].text()); ctx.toast('שוחזר ✔'); ctx.refreshTop(); closeSheet(); ctx.go('today'); } catch { ctx.toast('קובץ לא תקין'); } };
  $('#rst', b).onclick = () => { if (confirm('למחוק את כל ההתקדמות?')) reset(); };
}
