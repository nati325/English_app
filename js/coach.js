// אימון דיבור עם AI: "תרגם ודבר", שיחה קולית עם משימה ודוח, ומחברת טעויות שנכנסת לחזרות.
// עובד עם Gemini או Claude (המפתח של המשתמש). בלי מפתח: תרגום ממאגר מקומי ובדיקה מקומית.
import { state, save, addXP, fresh } from './store.js';
import * as srs from './srs.js';
import * as tutor from './tutor.js';
import * as azure from './azure.js';
import { say, stopSpeaking, SR } from './speech.js';
import { icon } from './icons.js';
import { LEVELS } from '../data/placement.js';
import { SCENARIOS, DRILL } from '../data/coach.js';
import * as T from './teacher.js';
import { ANIMALS } from './stage.js';
import { settings as openSettings } from './views.js';

let ctx, V;
export const init = (c) => { ctx = c; V = c.view; };
const $ = (s, el = V) => el.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const shuf = (a) => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);
const lvl = () => state.placement?.overall ?? 2;
const lvlName = () => LEVELS[lvl()];
const teacherName = () => state.settings.teacher === 'animal' ? (ANIMALS[state.animal]?.name || 'Fox') : T.info().name;
export const canHear = () => azure.enabled() || !!SR;

// ================== השוואת משפטים (בלי AI) ==================
const EXP = [[/\bi'm\b/g, 'i am'], [/\b(\w+)'re\b/g, '$1 are'], [/\b(\w+)'ve\b/g, '$1 have'], [/\b(\w+)'ll\b/g, '$1 will'], [/\b(\w+)'d\b/g, '$1 would'], [/\bcan't\b/g, 'can not'], [/\bwon't\b/g, 'will not'], [/\b(\w+)n't\b/g, '$1 not'], [/\b(it|that|he|she|what|there|who|here)'s\b/g, '$1 is'], [/\bcannot\b/g, 'can not'], [/\bokay\b/g, 'ok']];
export const normS = (s) => { let t = String(s).toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z0-9' ]/g, ' '); EXP.forEach(([r, x]) => { t = t.replace(r, x); }); return t.replace(/\s+/g, ' ').trim(); };
function tokSim(a, b) {
  const x = normS(a).split(' ').filter(Boolean), y = normS(b).split(' ').filter(Boolean); if (!x.length || !y.length) return 0;
  const d = Array.from({ length: x.length + 1 }, (_, i) => [i]); for (let j = 1; j <= y.length; j++) d[0][j] = j;
  for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
  return 1 - d[x.length][y.length] / Math.max(x.length, y.length);
}
export const sim = (ans, alts) => Math.max(0, ...alts.map(a => tokSim(ans, a)));

// ================== מחברת טעויות ==================
// כל טעות היא כרטיס חזרה 'm:<id>'. o = מה שאמרת (ריק = ביטוי ללמוד), b = הנכון, why = הסבר, he = ההקשר בעברית
export function addMistake({ o = '', b, why = '', he = '', src = 'drill' }) {
  if (!b || (o && normS(o) === normS(b))) return null;
  const M = state.mistakes ||= {};
  const dup = Object.entries(M).find(([, m]) => normS(m.b) === normS(b));
  if (dup) { const c = srs.get('m:' + dup[0]); if (c) c.due = Math.min(c.due, Date.now() + 864e5); save(); return dup[0]; }
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  M[id] = { o: o.trim(), b: b.trim(), why, he, src, t: Date.now() };
  srs.learn('m:' + id); state.cards['m:' + id].due = Date.now() + 3 * 3600e3; // חוזר בפעם הראשונה בעוד כמה שעות
  save(); return id;
}
export const dueMistakes = () => srs.dueIds('m:').map(id => id.slice(2)).filter(id => state.mistakes?.[id]);
export const mistakeCount = () => Object.keys(state.mistakes || {}).length;

// ================== בדיקת תשובה ==================
const GRADE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['correct', 'minor', 'wrong'], description: 'correct = natural and right; minor = understandable and grammatical enough but a native would phrase it differently or a small slip; wrong = grammar error, wrong meaning, or missing parts.' },
    natural: { type: 'string', description: 'The most natural way a native American would say it. If the learner answer is already natural, repeat it.' },
    why_he: { type: 'string', description: 'One short Hebrew sentence explaining the main issue. Empty if correct.' },
    mistakes: { type: 'array', description: 'Up to 2 specific issues.', items: { type: 'object', additionalProperties: false, properties: { original: { type: 'string' }, better: { type: 'string' }, why_he: { type: 'string' } }, required: ['original', 'better', 'why_he'] } }
  },
  required: ['verdict', 'natural', 'why_he', 'mistakes']
};
const GRADE_SYS = `You are a precise but encouraging American English coach for a Hebrew speaker (CEFR level about LEVEL).
You get a Hebrew sentence, a reference translation, and the learner's English answer. The answer may come from speech recognition, so ignore capitalization, punctuation and obvious recognition glitches (homophones, a missing article the recognizer dropped).
Accept any correct, natural translation, not only the reference. Contractions and synonyms are fine. Judge the meaning and naturalness for everyday American speech.
Typical Hebrew-speaker errors to catch: "I am agree", "open/close the light", "I have 30", wrong prepositions, since/for, missing present perfect, word-for-word translation, false friends.
Write why_he in simple Hebrew.`;

export async function grade({ he, ref, ans }) {
  if (tutor.enabled()) {
    try {
      const r = await tutor.ask(GRADE_SYS.replace('LEVEL', lvlName()), JSON.stringify({ hebrew: he, reference: ref, learner: ans }), GRADE_SCHEMA);
      if (r && r.verdict) return { ...r, ai: true };
    } catch (e) { console.warn('grade AI failed', e); }
  }
  const alts = Array.isArray(ref) ? ref : [ref], s = sim(ans, alts);
  const verdict = s >= .95 ? 'correct' : s >= .75 ? 'minor' : 'wrong';
  return { verdict, natural: alts[0], why_he: '', mistakes: [], ai: false, score: s };
}

// ================== מיקרופון: האזנה רציפה עם עצירה אוטומטית בשקט ==================
// onText(טקסט חלקי) · מחזיר { done: Promise<string>, stop() }
export async function hear({ onText = () => {}, silence = 2200, maxWait = 12000 } = {}) {
  stopSpeaking();
  let finals = [], partial = '', timer, resolveDone, stopped = false;
  const done = new Promise(r => { resolveDone = r; });
  const text = () => [...finals, partial].filter(Boolean).join(' ').trim();
  let stopFn = () => {};
  const bump = () => { clearTimeout(timer); timer = setTimeout(() => { if (text()) stopFn(); }, silence); };
  const guard = setTimeout(() => { if (!text()) stopFn(); }, maxWait);
  const finish = () => { if (stopped) return; stopped = true; clearTimeout(timer); clearTimeout(guard); resolveDone(text()); };

  if (azure.enabled()) {
    const { SDK, rec, mapErr } = await azure.recognizer();
    rec.recognizing = (_, e) => { partial = e.result.text || ''; onText(text()); bump(); };
    rec.recognized = (_, e) => { if (e.result.reason === SDK.ResultReason.RecognizedSpeech && e.result.text) { finals.push(e.result.text); partial = ''; onText(text()); bump(); } };
    rec.canceled = (_, e) => { if (e.errorDetails) console.warn('azure', mapErr(e.errorDetails)); finish(); };
    stopFn = () => { if (stopped) return; rec.stopContinuousRecognitionAsync(() => { try { rec.close(); } catch {} finish(); }, () => { try { rec.close(); } catch {} finish(); }); setTimeout(finish, 2500); };
    await new Promise((res, rej) => rec.startContinuousRecognitionAsync(res, (e) => rej(new Error(mapErr(String(e))))));
  } else if (SR) {
    const r = new SR(); r.lang = state.settings.accent || 'en-US'; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
    r.onresult = (e) => { finals = []; partial = ''; for (const res of e.results) { if (res.isFinal) finals.push(res[0].transcript.trim()); else partial += res[0].transcript; } partial = partial.trim(); onText(text()); bump(); };
    r.onerror = (e) => { if (e.error === 'not-allowed') { finals = []; partial = ''; } finish(); };
    r.onend = finish;
    stopFn = () => { if (stopped) return; try { r.stop(); } catch { finish(); } setTimeout(finish, 1500); };
    try { r.start(); } catch { finish(); }
  } else finish();
  return { done, stop: () => stopFn() };
}

// ================== מסגרת מסך (כמו נגן השיעור) ==================
function frame({ i, n, label, ic, body, foot, onExit }) {
  V.innerHTML = `<div class="lp">
    <div class="lp-top"><button class="lp-x" id="lpx" aria-label="יציאה">${icon('x', 26)}</button>
      ${n ? `<div class="lp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="${i}"><i style="width:${Math.round(i / n * 100)}%"></i></div>` : '<div style="flex:1"></div>'}</div>
    <div class="lp-body">${label ? `<div class="lp-lbl">${icon(ic || 'mic', 20)}<span>${label}</span></div>` : ''}${body}</div>
    <div class="lp-foot">${foot || ''}</div></div>`;
  $('#lpx').onclick = () => { stopSpeaking(); (onExit || (() => ctx.go('practice')))(); };
  V.scrollTop = 0;
}
// בלוק תשובה: מיקרופון גדול + הקלדה
export const answerBlock = (ph = 'כתוב באנגלית…') => `
  <button class="lp-mic" id="mic" aria-label="לחץ ודבר">${icon('mic', 46)}</button><div class="lp-hint" id="mh">${canHear() ? 'לחץ ודבר' : 'כתוב את התשובה'}</div>
  <div class="lp-heard" id="heard" hidden></div>
  <div class="input" id="kb" ${canHear() ? 'hidden' : ''}><input id="txt" lang="en" autocomplete="off" autocapitalize="sentences" spellcheck="false" enterkeyhint="send" placeholder="${ph}" aria-label="התשובה באנגלית"><button class="btn" id="send" style="min-height:48px;padding:0 16px">בדוק</button></div>
  ${canHear() ? `<button class="lp-skip" id="kbt">${icon('text', 16)} להקליד במקום</button>` : ''}`;
// מחבר את בלוק התשובה: קורא ל-submit(טקסט)
export function bindAnswer(submit) {
  let h = null; const mic = $('#mic'), mh = $('#mh'), heard = $('#heard');
  if (!canHear()) { mic.hidden = true; setTimeout(() => $('#txt')?.focus(), 60); }
  const send = () => { const t = $('#txt').value.trim(); if (t) submit(t); };
  $('#send').onclick = send; $('#txt').onkeydown = (e) => { if (e.key === 'Enter') send(); };
  if ($('#kbt')) $('#kbt').onclick = () => { $('#kb').hidden = false; $('#kbt').hidden = true; $('#txt').focus(); };
  mic.onclick = async () => {
    if (h) { h.stop(); return; }
    mic.classList.add('on'); mh.textContent = 'מקשיב… לחץ שוב כשסיימת'; heard.hidden = false; heard.textContent = '…';
    try {
      h = await hear({ onText: (t) => { heard.textContent = t || '…'; } });
      const t = await h.done; h = null; mic.classList.remove('on');
      if (!t) { mh.textContent = 'לא שמעתי. נסה שוב, קרוב יותר למיקרופון'; heard.hidden = true; return; }
      mh.textContent = 'בודק…'; heard.textContent = t; submit(t);
    } catch (e) { h = null; mic.classList.remove('on'); mh.textContent = /not-allowed/.test(e.message) ? 'צריך לאשר מיקרופון בדפדפן' : 'המיקרופון לא זמין, אפשר להקליד'; $('#kb').hidden = false; }
  };
}
let ac;
function chime(good) {
  navigator.vibrate?.(good ? 25 : [60, 40, 60]); if (state.settings.sounds === false) return;
  try { ac ||= new (window.AudioContext || window.webkitAudioContext)(); (good ? [784, 1047] : [330, 262]).forEach((f, i) => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f; o.connect(g); g.connect(ac.destination); const t = ac.currentTime + i * .11; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.18, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .22); o.start(t); o.stop(t + .25); }); } catch {}
}
function sheet(kind, html, { onNext, onRetry } = {}) {
  const good = kind !== 'wrong';
  const t = kind === 'correct' ? 'מעולה! בדיוק ככה' : kind === 'minor' ? 'נכון! אפשר טבעי יותר' : 'עוד לא. ככה אומרים:';
  chime(good); good ? ctx.stage.celebrate() : ctx.stage.sad();
  const d = document.createElement('div'); d.className = `lp-sheet ${good ? 'good' : 'bad'}`; d.setAttribute('role', 'status');
  d.innerHTML = `<div class="h"><span class="badge">${icon(good ? 'check' : 'x', 22, 'stroke-width="3"')}</span><span>${t}</span></div>${html}
    <div class="row" style="margin-top:14px">${onRetry ? '<button class="btn g" id="shr">נסה שוב</button>' : ''}<button class="btn ${good ? '' : 'r'} big" id="shn" style="flex:2">המשך</button></div>`;
  V.appendChild(d);
  d.querySelectorAll('[data-say]').forEach(b => b.onclick = () => say(b.dataset.say));
  if (onRetry) $('#shr', d).onclick = () => { d.remove(); onRetry(); };
  $('#shn', d).onclick = () => { stopSpeaking(); onNext(); }; $('#shn', d).focus();
}
const sayBtn = (t) => `<button class="lp-audio" data-say="${esc(t)}" aria-label="שמע">${icon('sound', 18)}</button>`;
const fixList = (ms) => ms.length ? `<div class="fixes">${ms.map(m => `<div class="fx"><div class="ltr"><s>${esc(m.original)}</s> ← <b>${esc(m.better)}</b></div>${m.why_he ? `<small>${esc(m.why_he)}</small>` : ''}</div>`).join('')}</div>` : '';

// ================== 1. תרגם ודבר ==================
const GEN_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { he: { type: 'string' }, en: { type: 'string' }, focus_he: { type: 'string' } }, required: ['he', 'en', 'focus_he'] } } },
  required: ['items']
};
async function genItems(n, topic) {
  const words = Object.keys(state.cards).filter(k => k.startsWith('w:')).slice(-30).map(k => k.slice(2));
  const recentBad = Object.values(state.mistakes || {}).slice(-6).map(m => m.b);
  const sys = 'You write translation drills that train Hebrew speakers to speak natural American English. Output JSON only.';
  const user = `Create ${n} different Hebrew sentences for a learner at CEFR ${lvlName()} to say out loud in English${topic ? `, about: ${topic}` : ''}.
- Everyday spoken situations (work, friends, errands, feelings, plans). 5-14 words each. Natural modern Hebrew, the way Israelis actually talk.
- Each sentence must target something Hebrew speakers get wrong or translate word-for-word: prepositions, tenses (present perfect, past, future), since/for, articles, word order in questions, phrasal verbs, collocations (make/do/take), idioms and chunks natives use.
- Slightly above the learner's level, mixed difficulty, no two on the same point.
${words.length ? `- Where it fits, reuse some of these words the learner is studying: ${words.join(', ')}.` : ''}
${recentBad.length ? `- Also revisit these phrases the learner got wrong: ${recentBad.join(' | ')}.` : ''}
- "en": the most natural American English version (contractions ok). "focus_he": what it trains, 2-5 Hebrew words.`;
  const r = await tutor.ask(sys, user, GEN_SCHEMA);
  return (r.items || []).filter(x => x.he && x.en).slice(0, n).map(x => ({ he: x.he, en: [x.en], f: x.focus_he }));
}
function offlineItems(n) {
  const L = lvl(), pool = DRILL.filter(x => x.lv <= L + 1 && x.lv >= L - 2);
  return fresh(pool.length >= n ? pool : DRILL, 'drill', n, x => x.he);
}

let D;
export async function drill({ n = 8, topic = '' } = {}) {
  frame({ label: 'תרגם ודבר', ic: 'chat', body: `<div class="center" style="padding:40px 0"><div class="spin" aria-hidden="true"></div><p class="sub" style="margin-top:14px">${tutor.enabled() ? 'מכין לך משפטים ברמה שלך…' : 'מכין משפטים…'}</p></div>` });
  let items, ai = false;
  if (tutor.enabled()) { try { items = await genItems(n, topic); ai = items.length >= 3; } catch (e) { console.warn('gen failed', e); ctx.toast(tutor.errMsg(e)); } }
  if (!ai) items = offlineItems(n);
  D = { items, i: 0, res: [], t0: Date.now(), ai };
  drillShow();
}
function drillShow() {
  if (D.i >= D.items.length) return drillEnd();
  const it = D.items[D.i];
  frame({ i: D.i, n: D.items.length, label: 'אמור את זה באנגלית', ic: 'chat', body: `
    <div class="say"><div class="cslot" data-view="head" style="--s:76px"></div><div class="bub" style="flex:1;margin-bottom:14px"><div class="lp-q">${esc(it.he)}</div>
      ${it.f ? `<button class="lp-audio" id="hint">${icon('bulb', 18)} רמז</button><div id="hv" class="mut" style="font-size:.9rem;margin-top:6px"></div>` : ''}</div></div>
    ${answerBlock()}`, foot: `<button class="lp-skip" id="skip">אני לא יודע, תראה לי</button>` });
  if ($('#hint')) $('#hint').onclick = () => { $('#hv').innerHTML = `מה המשפט מאמן: <b>${esc(it.f)}</b>`; };
  $('#skip').onclick = () => drillResult(it, '', { verdict: 'wrong', natural: it.en[0], why_he: it.f ? `נקודה לזכור: ${it.f}` : '', mistakes: [] });
  bindAnswer(async (ans) => {
    V.querySelectorAll('#mic,#send').forEach(b => b.disabled = true); $('#mh').textContent = 'בודק…';
    const r = await grade({ he: it.he, ref: it.en, ans }); drillResult(it, ans, r);
  });
}
function drillResult(it, ans, r) {
  const nat = r.natural || it.en[0];
  D.res[D.i] = { he: it.he, ans, v: r.verdict, nat };
  if (r.verdict === 'correct') addXP(4, 'speak'); else if (r.verdict === 'minor') addXP(3, 'speak'); else addXP(1, 'speak');
  // טעויות → מחברת
  let added = 0;
  if (r.verdict !== 'correct') {
    (r.mistakes || []).forEach(m => { if (addMistake({ o: m.original, b: m.better, why: m.why_he, he: it.he, src: 'drill' })) added++; });
    if (!added && (r.verdict === 'wrong' || !r.ai)) if (addMistake({ o: ans, b: nat, why: r.why_he || (it.f ? `נקודה: ${it.f}` : ''), he: it.he, src: 'drill' })) added++;
  }
  D.res[D.i].added = added; ctx.refreshTop();
  const body = `${ans ? `<div style="margin-top:10px;font-size:.9rem">אמרת:</div><div class="ltr" style="font-weight:700">${esc(ans)}</div>` : ''}
    ${r.verdict !== 'correct' || nat.toLowerCase() !== ans.toLowerCase() ? `<div style="margin-top:8px;font-size:.9rem">${r.verdict === 'correct' ? 'גם ככה אומרים:' : 'ככה אמריקאי היה אומר:'}</div><div class="ans">${esc(nat)} ${sayBtn(nat)}</div>` : ''}
    ${r.why_he ? `<div class="tipl">${icon('bulb', 20)}<span>${esc(r.why_he)}</span></div>` : ''}
    ${fixList(r.mistakes || [])}
    ${added ? `<div class="mut" style="font-size:.85rem;margin-top:8px">${icon('book', 16)} נוסף למחברת הטעויות. נחזור על זה בקרוב.</div>` : ''}`;
  if (r.verdict !== 'correct') say(nat);
  sheet(r.verdict, body, { onNext: () => { D.i++; drillShow(); }, onRetry: ans && r.verdict === 'wrong' ? () => drillShow() : null });
}
function drillEnd() {
  const ok = D.res.filter(x => x.v === 'correct').length, minor = D.res.filter(x => x.v === 'minor').length, added = D.res.reduce((a, x) => a + (x.added || 0), 0);
  addXP(10, 'speak'); const d = state.daily; d.speak = (d.speak || 0) + D.items.length;
  const hd = (state.hist ||= {})[new Date().toLocaleDateString('sv')] ||= { xp: 0, min: 0 }; hd.min += Math.max(1, Math.round((Date.now() - D.t0) / 60000));
  save(); ctx.refreshTop(); ctx.stage.celebrate();
  frame({ body: `<div class="lp-end">
    <div class="say" style="justify-content:center;margin-top:12px"><div class="cslot" style="--s:110px"></div></div>
    <h2 class="center" style="font-size:1.6rem;margin-top:10px">סיימת ${D.items.length} משפטים!</h2>
    <div class="stats"><div class="stat"><b style="color:var(--good-ink)">${ok}</b><small>מושלם</small></div><div class="stat"><b style="color:var(--warn-ink)">${minor}</b><small>כמעט</small></div><div class="stat"><b style="color:var(--bad-ink)">${D.items.length - ok - minor}</b><small>ללמוד</small></div></div>
    <div class="card">${D.res.map(x => `<div class="drow"><span class="dot ${x.v}"></span><div><div style="font-size:.9rem">${esc(x.he)}</div><div class="ltr" style="font-weight:700">${esc(x.nat)}</div></div></div>`).join('')}</div>
    ${added ? `<p class="sub center">${added} דברים נוספו למחברת הטעויות</p>` : ''}
    ${!D.ai ? `<div class="tip">${icon('bulb', 18)} עם מפתח Gemini (חינם) המשפטים מותאמים אישית והבדיקה מבינה כל ניסוח נכון. הגדרות ← חיבורי AI.</div>` : ''}</div>`,
    foot: `<button class="btn o big full" id="again">עוד סבב</button><button class="btn g full" id="home">סיום</button>` });
  $('#again').onclick = () => drill(); $('#home').onclick = () => ctx.go('practice');
}

// ================== 2. מחברת טעויות ==================
export function notebook() {
  const M = state.mistakes || {}, ids = Object.keys(M).sort((a, b) => M[b].t - M[a].t), due = dueMistakes();
  const src = { drill: 'תרגום', talk: 'שיחה', phrase: 'ביטוי', lesson: 'שיעור' };
  V.innerHTML = `<button class="back" data-back>${icon('chevron', 18, 'style="transform:scaleX(-1)"')} תרגול</button>
    <h2>מחברת טעויות</h2><p class="sub">כל טעות שעשית בתרגום ובשיחה נשמרת כאן וחוזרת אליך בדיוק כשאתה עלול לשכוח.</p>
    ${ids.length ? `<button class="btn o big full" id="rev" ${ids.length ? '' : 'disabled'}>${icon('repeat')} ${due.length ? `תרגל ${Math.min(10, due.length)} שמחכות` : 'תרגל עכשיו'}</button>
      <div class="stats" style="margin-top:12px"><div class="stat"><b>${ids.length}</b><small>בסך הכול</small></div><div class="stat"><b>${due.length}</b><small>לחזרה</small></div><div class="stat"><b>${ids.filter(id => (srs.get('m:' + id)?.ivl || 0) >= 7).length}</b><small>נלמדו</small></div></div>
      ${ids.map(id => { const m = M[id], c = srs.get('m:' + id); return `<div class="card mrow"><div style="flex:1">${m.o ? `<div class="ltr"><s>${esc(m.o)}</s></div>` : m.he ? `<div>${esc(m.he)}</div>` : ''}<div class="ltr" style="font-weight:800">${esc(m.b)} ${sayBtn(m.b)}</div>${m.why ? `<small class="mut">${esc(m.why)}</small>` : ''}
        <div class="mut" style="font-size:.78rem;margin-top:4px">${src[m.src] || ''}${c && c.ivl >= 7 ? ' · נלמד ✓' : ''}</div></div><button class="lp-x" data-del="${id}" aria-label="מחק">${icon('x', 18)}</button></div>`; }).join('')}`
      : `<div class="card center" style="padding:28px 16px"><div style="color:var(--brand-ink)">${icon('book', 40)}</div><b style="display:block;margin-top:8px">המחברת ריקה</b><p class="sub">עשה סבב "תרגם ודבר" או שיחה קולית, והטעויות יופיעו כאן.</p><button class="btn o full" id="dr">התחל "תרגם ודבר"</button></div>`}`;
  V.querySelectorAll('[data-say]').forEach(b => b.onclick = () => say(b.dataset.say));
  V.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { delete state.mistakes[b.dataset.del]; delete state.cards['m:' + b.dataset.del]; save(); notebook(); });
  if ($('#rev')) $('#rev').onclick = () => reviewMistakes();
  if ($('#dr')) $('#dr').onclick = () => drill();
}

// תרגיל "תקן" (משמש גם בשיעור היומי)
export async function checkFix(m, ans) {
  const s = sim(ans, [m.b]); if (s >= .9) return { ok: true };
  if (tutor.enabled() && s >= .3) { const r = await grade({ he: m.he || '(fix the phrase)', ref: m.b, ans }); return { ok: r.verdict !== 'wrong', r }; }
  return { ok: false };
}
export const fixPrompt = (m) => m.o
  ? `<div class="mut" style="font-size:.9rem">המשפט הזה לא נכון או לא טבעי. אמור אותו נכון:</div><div class="lp-q en" style="font-size:1.3rem;color:var(--bad-ink)">${esc(m.o)}</div>${m.he ? `<div class="mut" style="font-size:.9rem;margin-top:4px">${esc(m.he)}</div>` : ''}`
  : `<div class="mut" style="font-size:.9rem">איך אומרים באנגלית?</div><div class="lp-q">${esc(m.he || m.why)}</div>`;

let RM;
export function reviewMistakes(ids) {
  const M = state.mistakes || {};
  ids ||= dueMistakes();
  if (!ids.length) ids = Object.keys(M).sort((a, b) => (srs.get('m:' + a)?.ivl || 0) - (srs.get('m:' + b)?.ivl || 0));
  ids = ids.filter(id => M[id]).slice(0, 10);
  if (!ids.length) return notebook();
  RM = { ids, i: 0, ok: 0 }; rmShow();
}
function rmShow() {
  if (RM.i >= RM.ids.length) {
    addXP(5, 'review'); ctx.refreshTop();
    frame({ body: `<div class="lp-end"><div class="say" style="justify-content:center;margin-top:12px"><div class="cslot" style="--s:110px"></div></div><h2 class="center">תיקנת ${RM.ok} מתוך ${RM.ids.length}</h2><p class="sub center">מה שעוד לא יושב יחזור אליך בקרוב.</p></div>`, foot: `<button class="btn o big full" id="h">המשך</button>`, onExit: notebook });
    $('#h').onclick = () => notebook(); return;
  }
  const id = RM.ids[RM.i], m = state.mistakes[id];
  frame({ i: RM.i, n: RM.ids.length, label: m.o ? 'תקן את הטעות' : 'אמור באנגלית', ic: 'repeat', onExit: notebook, body: `
    <div class="say"><div class="cslot" data-view="head" style="--s:76px"></div><div class="bub" style="flex:1;margin-bottom:14px">${fixPrompt(m)}
      ${m.why && m.o ? `<button class="lp-audio" id="hint">${icon('bulb', 18)} רמז</button><div id="hv" class="mut" style="font-size:.9rem;margin-top:6px"></div>` : ''}</div></div>${answerBlock()}`,
    foot: `<button class="lp-skip" id="skip">תראה לי</button>` });
  if ($('#hint')) $('#hint').onclick = () => { $('#hv').textContent = m.why; };
  const done = (ok, ans) => {
    srs.grade('m:' + id, ok ? 2 : 0); if (ok) RM.ok++; addXP(ok ? 3 : 1, 'review');
    say(m.b);
    sheet(ok ? 'correct' : 'wrong', `${!ok ? `<div class="ans">${esc(m.b)} ${sayBtn(m.b)}</div>` : ''}${m.why ? `<div class="tipl">${icon('bulb', 20)}<span>${esc(m.why)}</span></div>` : ''}`, { onNext: () => { RM.i++; rmShow(); } });
  };
  $('#skip').onclick = () => done(false, '');
  bindAnswer(async (ans) => { V.querySelectorAll('#mic,#send').forEach(b => b.disabled = true); const r = await checkFix(m, ans); done(r.ok, ans); });
}

// ================== 3. שיחה קולית ==================
const TURN_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    reply: { type: 'string', description: 'What you say out loud: 1-2 short spoken sentences (max ~30 words) ending with a question or prompt that keeps the learner talking.' },
    reply_he: { type: 'string', description: 'Hebrew translation of reply.' },
    original: { type: 'string', description: "The part of the learner's last message that was wrong or unnatural, or empty string." },
    better: { type: 'string', description: 'How a native American would say that part, or empty string.' },
    why_he: { type: 'string', description: 'One short simple Hebrew sentence explaining, or empty string.' },
    goal_done: { type: 'boolean', description: 'True once the learner has completed the scenario task.' }
  },
  required: ['reply', 'reply_he', 'original', 'better', 'why_he', 'goal_done']
};
const REPORT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    fluency: { type: 'integer', description: '1-10' }, grammar: { type: 'integer', description: '1-10' }, vocabulary: { type: 'integer', description: '1-10' },
    level: { type: 'string', description: 'Estimated CEFR level of the learner speech in this conversation, e.g. B1' },
    summary_he: { type: 'string', description: 'Two short Hebrew sentences: overall feedback.' },
    mistakes: { type: 'array', description: 'Up to 5 most important mistakes or unnatural phrases.', items: { type: 'object', additionalProperties: false, properties: { original: { type: 'string' }, better: { type: 'string' }, why_he: { type: 'string' } }, required: ['original', 'better', 'why_he'] } },
    strengths_he: { type: 'array', items: { type: 'string' }, description: 'Up to 2 things done well, Hebrew.' },
    phrases: { type: 'array', description: '3 natural native phrases that would have helped in this scenario.', items: { type: 'object', additionalProperties: false, properties: { en: { type: 'string' }, he: { type: 'string' } }, required: ['en', 'he'] } },
    tip_he: { type: 'string', description: 'One concrete thing to practice next time, Hebrew.' }
  },
  required: ['fluency', 'grammar', 'vocabulary', 'level', 'summary_he', 'mistakes', 'strengths_he', 'phrases', 'tip_he']
};
const voiceSys = (sc) => `You are ${teacherName()}, a warm, witty American English teacher, doing a SPOKEN role-play with a Hebrew-speaking adult (level about ${lvlName()}) who wants to sound like a native speaker.
Role-play: ${sc.ai}
The learner's task: ${sc.goal}
Rules:
- This is spoken audio. Talk like a real American in this situation: contractions, natural fillers, everyday phrasal verbs and idioms, but keep it understandable for ${lvlName()} and stretch them slightly.
- Keep "reply" short (1-2 sentences, max ~30 words) and always end with a question or prompt. The learner should talk more than you.
- Stay in character. Never switch to Hebrew in "reply". If the learner is stuck or writes Hebrew, give them the English phrase to use and continue.
- The learner's text comes from speech recognition: ignore punctuation/capitalization and obvious recognition glitches.
- If their last message has a real grammar error, wrong word, or something a native wouldn't say, fill original/better/why_he for the single most useful fix. Otherwise leave them empty. Never mention the correction inside "reply".
- When the task is done, set goal_done true, wrap up naturally, and you may keep chatting.`;

export function voice() {
  if (!tutor.enabled()) {
    V.innerHTML = `<button class="back" data-back>${icon('chevron', 18, 'style="transform:scaleX(-1)"')} תרגול</button><h2>שיחה קולית</h2>
      <div class="card"><b>צריך חיבור ל-AI</b><p class="sub" style="margin:6px 0 12px">שיחה אמיתית עם תיקונים ודוח דורשת מפתח Gemini (חינמי) או Claude. מכניסים אותו פעם אחת בהגדרות.</p>
      <button class="btn o full" id="set">${icon('sliders')} לחיבור AI</button><button class="btn g full" id="basic" style="margin-top:10px">שיחה בסיסית בלי AI</button></div>`;
    $('#set').onclick = () => openSettings(); $('#basic').onclick = () => ctx.go('talk'); return;
  }
  const L = lvl(), last = (state.convos || [])[0];
  V.innerHTML = `<button class="back" data-back>${icon('chevron', 18, 'style="transform:scaleX(-1)"')} תרגול</button>
    <h2>שיחה קולית עם ${esc(teacherName())}</h2><p class="sub">בחר מצב. לכל שיחה יש משימה, ובסוף תקבל דוח: מה אמרת טוב, מה לתקן, וביטויים של דוברי שפת אם.</p>
    ${last ? `<div class="card" style="padding:12px 16px"><div class="mut" style="font-size:.85rem">השיחה האחרונה · ${esc(last.title)}</div><b>שטף ${last.fluency}/10 · דקדוק ${last.grammar}/10 · אוצר מילים ${last.vocabulary}/10</b></div>` : ''}
    ${SCENARIOS.map(s => `<button class="prow" data-sc="${s.id}"><span class="ic">${icon(s.ic)}</span><span class="t"><b>${esc(s.title)} ${s.lv <= L && s.lv >= L - 1 ? '<span class="pill ok">מתאים לך</span>' : s.lv > L ? '<span class="pill hot">אתגר</span>' : ''}</b><small>${esc(s.goal)}</small></span><span class="st">${icon('chevron')}</span></button>`).join('')}`;
  V.querySelectorAll('[data-sc]').forEach(b => b.onclick = () => convo(SCENARIOS.find(s => s.id === b.dataset.sc)));
}

function convo(sc) {
  const C = { sc, hist: [], turns: 0, words: 0, t0: Date.now(), fixes: [], busy: false, h: null, alive: true, goal: false };
  const caps = () => state.settings.vcCaps !== false;
  V.innerHTML = `<div class="lp vc">
    <div class="lp-top"><button class="lp-x" id="lpx" aria-label="יציאה">${icon('x', 26)}</button>
      <div class="vc-t"><b>${esc(sc.title)}</b><small id="goal">${icon('target', 14)} ${esc(sc.goal)}</small></div>
      <button class="lp-x" id="cc" aria-pressed="${caps()}" aria-label="כתוביות">${icon('text', 22)}</button></div>
    <div class="vc-stage"><div class="say"><div class="cslot" data-view="upper" style="--s:150px"></div></div></div>
    <div class="vc-cap" id="cap" aria-live="polite"><span class="mut">…</span></div>
    <div class="vc-you" id="you" aria-live="polite"></div>
    <div id="fx"></div>
    <div class="vc-ctl">
      <button class="vc-side" id="kbt" aria-label="הקלדה">${icon('text', 24)}</button>
      <button class="lp-mic" id="mic" aria-label="לחץ ודבר" style="margin:0">${icon('mic', 46)}</button>
      <button class="vc-side" id="end" aria-label="סיים וקבל דוח">${icon('check', 24)}<small>סיום</small></button></div>
    <div class="lp-hint" id="mh">רגע…</div>
    <div class="input" id="kb" hidden><input id="txt" lang="en" autocomplete="off" autocapitalize="sentences" enterkeyhint="send" placeholder="כתוב באנגלית…"><button class="btn" id="send" style="min-height:48px;padding:0 16px">שלח</button></div>
  </div>`;
  const mic = $('#mic'), mh = $('#mh'), cap = $('#cap'), you = $('#you');
  const alive = () => C.alive && V.contains(mic);
  let last = null;
  const showCap = () => { if (!last) return; cap.innerHTML = caps() ? `<div class="ltr">${esc(last.reply)}</div><button class="lp-skip" id="tr" style="padding:2px 0;min-height:30px">מה זה אומר?</button><div id="trv" hidden>${esc(last.reply_he)}</div>` : `<button class="lp-skip" id="sc2">הצג מה ${esc(teacherName())} אמר/ה</button>`;
    if ($('#tr')) $('#tr').onclick = () => { $('#trv').hidden = !$('#trv').hidden; };
    if ($('#sc2')) $('#sc2').onclick = () => { state.settings.vcCaps = true; save(); showCap(); }; };
  $('#cc').onclick = () => { state.settings.vcCaps = !caps(); save(); $('#cc').setAttribute('aria-pressed', caps()); showCap(); };
  const exit = () => { C.alive = false; C.h?.stop(); stopSpeaking(); };
  $('#lpx').onclick = () => { if (C.turns >= 2 && confirm('לסיים ולקבל דוח על השיחה?')) return report(C); exit(); voice(); };
  $('#kbt').onclick = () => { $('#kb').hidden = !$('#kb').hidden; if (!$('#kb').hidden) $('#txt').focus(); };
  $('#end').onclick = () => { if (C.turns < 1) return ctx.toast('דבר לפחות פעם אחת 🙂'); C.alive = false; C.h?.stop(); stopSpeaking(); report(C); };
  const setMic = (st) => { mic.classList.toggle('on', st === 'listen'); mic.disabled = st === 'busy'; mh.textContent = st === 'listen' ? 'מקשיב… (לחץ כשסיימת)' : st === 'busy' ? 'חושב…' : st === 'speak' ? '' : canHear() ? 'לחץ ודבר' : 'כתוב את התשובה'; };

  const listen = async () => {
    if (!alive() || C.busy || C.h || !canHear()) return;
    setMic('listen'); you.innerHTML = '<span class="mut">…</span>';
    try {
      C.h = await hear({ onText: (t) => { you.textContent = t || '…'; }, silence: 2400, maxWait: 15000 });
      const t = await C.h.done; C.h = null; if (!alive()) return;
      if (!t) { setMic('idle'); you.innerHTML = ''; mh.textContent = 'לא שמעתי. לחץ ודבר'; return; }
      send(t);
    } catch (e) { C.h = null; setMic('idle'); mh.textContent = 'המיקרופון לא זמין, אפשר להקליד'; $('#kb').hidden = false; }
  };
  mic.onclick = () => { if (C.h) C.h.stop(); else { stopSpeaking(); listen(); } };
  const sendTxt = () => { const t = $('#txt').value.trim(); if (t) { $('#txt').value = ''; send(t); } };
  $('#send').onclick = sendTxt; $('#txt').onkeydown = (e) => { if (e.key === 'Enter') sendTxt(); };

  const turn = async (userMsg) => {
    C.busy = true; setMic('busy');
    C.hist.push({ role: 'user', content: userMsg });
    let out;
    try { out = await tutor.chat(voiceSys(sc), C.hist.slice(-30), TURN_SCHEMA); }
    catch (e) { C.hist.pop(); C.busy = false; setMic('idle'); $('#fx').innerHTML = `<div class="tip">${esc(tutor.errMsg(e))}</div>`; return; }
    if (!alive()) return;
    C.hist.push({ role: 'assistant', content: out.reply }); C.busy = false; last = out; showCap();
    if (out.better && out.original) {
      C.fixes.push({ original: out.original, better: out.better, why_he: out.why_he });
      $('#fx').innerHTML = `<button class="vc-fix" id="fxb">${icon('bulb', 18)}<span class="ltr"><s>${esc(out.original)}</s> ← <b>${esc(out.better)}</b></span></button><div id="fxw" class="mut" style="font-size:.88rem;padding:4px 8px" hidden>${esc(out.why_he)}</div>`;
      $('#fxb').onclick = () => { $('#fxw').hidden = !$('#fxw').hidden; say(out.better); };
    } else $('#fx').innerHTML = '';
    if (out.goal_done && !C.goal) { C.goal = true; $('#goal').innerHTML = `${icon('check', 14)} המשימה הושלמה!`; ctx.stage.celebrate(); chime(true); }
    setMic('speak'); await say(out.reply);
    if (!alive()) return; setMic('idle');
    if (state.settings.vcAuto !== false) listen();
  };
  const send = (t) => { if (C.busy) return; C.turns++; C.words += t.split(/\s+/).filter(Boolean).length; you.textContent = t; addXP(3, 'speak'); ctx.refreshTop(); turn(t); };
  turn('(Start now: greet the learner in character and ask your first question.)');
}

async function report(C) {
  C.alive = false; stopSpeaking();
  frame({ label: 'הדוח שלך', ic: 'trophy', body: `<div class="center" style="padding:40px 0"><div class="spin" aria-hidden="true"></div><p class="sub" style="margin-top:14px">מנתח את השיחה…</p></div>`, onExit: voice });
  const mins = Math.max(1, Math.round((Date.now() - C.t0) / 60000));
  let r;
  try { r = await tutor.chat(voiceSys(C.sc) + '\n\nNow act as an expert evaluator instead of the role-play character.', [...C.hist.slice(-40), { role: 'user', content: "(The conversation is over. Evaluate ONLY the learner's messages for spoken American English. Be honest and specific; scores 1-10 where 10 = indistinguishable from a native. Hebrew for all *_he fields.)" }], REPORT_SCHEMA); }
  catch (e) { r = { fluency: 0, grammar: 0, vocabulary: 0, level: '', summary_he: tutor.errMsg(e), mistakes: C.fixes, strengths_he: [], phrases: [], tip_he: '' }; }
  // מחברת: טעויות מהשיחה + ביטויים מומלצים
  const R = r.mistakes || [], all = [...R, ...C.fixes.filter(f => !R.some(m => normS(m.better) === normS(f.better) || normS(m.original).includes(normS(f.original)) || normS(f.original).includes(normS(m.original))))];
  let added = 0; all.forEach(m => { if (addMistake({ o: m.original, b: m.better, why: m.why_he, src: 'talk' })) added++; });
  (r.phrases || []).forEach(p => { if (addMistake({ o: '', b: p.en, he: p.he, why: p.he, src: 'phrase' })) added++; });
  addXP(10 + C.turns * 2, 'speak');
  const hd = (state.hist ||= {})[new Date().toLocaleDateString('sv')] ||= { xp: 0, min: 0 }; hd.min += mins;
  (state.convos ||= []).unshift({ d: Date.now(), id: C.sc.id, title: C.sc.title, fluency: r.fluency, grammar: r.grammar, vocabulary: r.vocabulary, level: r.level, turns: C.turns, words: C.words });
  state.convos = state.convos.slice(0, 30); save(); ctx.refreshTop();
  const bar = (lab, v) => `<div class="skill"><div class="h"><span>${lab}</span><span class="ltr">${v || '–'}/10</span></div><div class="prog"><i style="width:${(v || 0) * 10}%;background:${v >= 7 ? 'var(--good)' : 'var(--brand)'}"></i></div></div>`;
  frame({ label: 'הדוח שלך', ic: 'trophy', onExit: voice, body: `
    <div class="card"><div class="row" style="justify-content:space-between"><b>${esc(C.sc.title)}</b>${r.level ? `<span class="pill hot ltr">${esc(r.level)}</span>` : ''}</div>
      <p style="margin:8px 0">${esc(r.summary_he)}</p>${bar('שטף', r.fluency)}${bar('דקדוק', r.grammar)}${bar('אוצר מילים', r.vocabulary)}</div>
    <div class="stats"><div class="stat"><b>${C.turns}</b><small>תורות</small></div><div class="stat"><b>${C.words}</b><small>מילים שאמרת</small></div><div class="stat"><b>${C.turns ? Math.round(C.words / C.turns) : 0}</b><small>מילים בתור</small></div></div>
    ${all.length ? `<div class="card"><b>מה לתקן</b>${fixList(all)}</div>` : ''}
    ${(r.phrases || []).length ? `<div class="card"><b>ביטויים של דוברי שפת אם</b>${r.phrases.map(p => `<div class="fx"><div class="ltr"><b>${esc(p.en)}</b> ${sayBtn(p.en)}</div><small>${esc(p.he)}</small></div>`).join('')}</div>` : ''}
    ${(r.strengths_he || []).length ? `<div class="card"><b>מה עשית טוב</b><ul style="margin:6px 0 0;padding-inline-start:18px">${r.strengths_he.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}
    ${r.tip_he ? `<div class="tip">${icon('bulb', 18)} <b>לפעם הבאה:</b> ${esc(r.tip_he)}</div>` : ''}
    ${added ? `<p class="sub center">${icon('book', 16)} ${added} פריטים נוספו למחברת הטעויות</p>` : ''}`,
    foot: `${added ? '<button class="btn o big full" id="pr">תרגל אותם עכשיו</button>' : ''}<button class="btn g full" id="again">שיחה נוספת</button>` });
  V.querySelectorAll('[data-say]').forEach(b => b.onclick = () => say(b.dataset.say));
  if ($('#pr')) $('#pr').onclick = () => reviewMistakes(Object.keys(state.mistakes).sort((a, b) => state.mistakes[b].t - state.mistakes[a].t).slice(0, added));
  $('#again').onclick = () => voice();
}
