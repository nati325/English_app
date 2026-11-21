// הרחבת אוצר מילים מהירה (הבנה): 22,000 מילים לפי שכיחות בדיבור, מעבר ל-3,235 מילות הליבה.
// כרטיס 'r:' = הבנה בלבד: רואים מילה במשפט ובוחרים פירוש. מהיר, כדי שאפשר יהיה ללמוד הרבה.
// התרגום והמשפטים נוצרים ב-AI לפי הצורך ונשמרים במכשיר.
import { state, save, addXP } from './store.js';
import * as srs from './srs.js';
import * as tutor from './tutor.js';
import { say, stopSpeaking } from './speech.js';
import { icon } from './icons.js';
import { ALL } from './views.js';
import { frame, sheet, chime } from './coach.js';

let ctx, V;
export const init = (c) => { ctx = c; V = c.view; };
const $ = (s, el = V) => el.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const shuf = (a) => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);
const BYW = new Set(ALL.map(w => w.w));

let TIER = null;
export async function loadTier() {
  if (TIER) return TIER;
  const t = await fetch('data/tier.txt').then(r => r.text());
  TIER = t.split('\n').filter(Boolean).map(l => { const [w, r] = l.split(' '); return { w, r: +r }; });
  return TIER;
}
export const TIER_SIZE = 22102;
const skip = () => (state.vskip ||= {});
const taken = (w) => !!state.known?.[w] || !!srs.get('r:' + w) || !!srs.get('w:' + w) || !!skip()[w] || BYW.has(w);
export async function nextCandidates(n) { await loadTier(); const out = []; for (const x of TIER) { if (!taken(x.w)) out.push(x); if (out.length >= n) break; } return out; }
export const dueFast = () => srs.dueIds('r:').map(id => id.slice(2)).filter(w => state.extra?.[w]?.he);
export const fastCount = () => Object.keys(state.cards).filter(k => k.startsWith('r:')).length;

// הערכת היקף אוצר המילים: תוצאת הבדיקה + מילים שנלמדו/סומנו מעבר לה
export function vocabSize() {
  const base = state.placement?.size || 0; let add = 0;
  const seen = new Set();
  for (const k of Object.keys(state.cards)) { const w = k.slice(2); if (seen.has(w) || k[0] === 'm') continue; seen.add(w); const fr = state.extra?.[w]?.fr || ALL.find(x => x.w === w)?.fr || 0; if (fr > base) add++; }
  for (const w of Object.keys(state.known || {})) { if (seen.has(w)) continue; const fr = state.extra?.[w]?.fr || 0; if (fr > base) add++; }
  return base + add;
}

// ---------- תרגום באצוות ----------
const SCHEMA = { type: 'object', additionalProperties: false, properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
  w: { type: 'string' }, skip: { type: 'boolean', description: 'true if a proper noun/name/brand, not a real standalone English word, an inflected form, or a slur' },
  he: { type: 'string', description: 'Most common meaning(s) in natural Hebrew, 1-5 words; separate two senses with /' },
  ipa: { type: 'string', description: 'General American IPA, no slashes' },
  ex: { type: 'string', description: 'Short natural American sentence (6-12 words) using the word in its most common sense' } }, required: ['w', 'skip', 'he', 'ipa', 'ex'] } } }, required: ['items'] };
export async function fetchWords(cands) {
  const need = cands.filter(c => !state.extra?.[c.w]?.he);
  for (let i = 0; i < need.length; i += 30) {
    const b = need.slice(i, i + 30);
    const r = await tutor.ask('You are an English-Hebrew learner dictionary. Output JSON only.', `Words (from a frequency list of spoken American English):\n${b.map(x => x.w).join(', ')}`, SCHEMA);
    (r.items || []).forEach(x => {
      const w = String(x.w || '').toLowerCase(), c = b.find(y => y.w === w); if (!c) return;
      if (x.skip || !x.he) { skip()[w] = 1; return; }
      (state.extra ||= {})[w] = { ...(state.extra[w] || {}), w, he: x.he, ipa: (x.ipa || '').replace(/^\/|\/$/g, ''), ex: x.ex, fr: c.r, tier: c.r <= 9000 ? 2 : 3 };
    });
    save();
  }
  return cands.filter(c => state.extra?.[c.w]?.he && !skip()[c.w]);
}

// ================== סשן מהיר ==================
let S;
export async function fast() {
  if (!tutor.enabled()) {
    V.innerHTML = `<button class="back" data-back>${icon('chevron', 18, 'style="transform:scaleX(-1)"')} תרגול</button><h2>הרחבת אוצר מילים</h2>
      <div class="card"><b>צריך חיבור ל-AI</b><p class="sub" style="margin:6px 0 12px">22,000 המילים הנוספות מתורגמות בזמן אמת עם Gemini (חינם). מכניסים את המפתח פעם אחת.</p><button class="btn o full" id="set">${icon('sliders')} לחיבור AI</button></div>`;
    $('#set').onclick = () => ctx.views.settings(); return;
  }
  const due = dueFast().slice(0, 25);
  const per = state.settings.fastPerDay || 10;
  frame({ label: 'הרחבת אוצר מילים', ic: 'bolt', body: `<div class="center" style="padding:40px 0"><div class="spin"></div><p class="sub" style="margin-top:14px">מכין מילים…</p></div>` });
  let cands = [];
  try { cands = await fetchWords(await nextCandidates(per + 8)); } // קודם מתרגמים: שמות ולא-מילים מסוננים
  catch (e) { if (!due.length) { ctx.toast(tutor.errMsg(e)); return ctx.go('practice'); } }
  S = { due, per, cands, ex: [], i: 0, ok: 0, n: 0, t0: Date.now(), newW: [], bad: new Set() };
  if (!cands.length) return prepare([], new Set());
  screen();
}

// שלב 1: סינון מהיר – מה כבר מכירים (עם בדיקה מדגמית, כדי לא "לרמות את עצמנו")
function screen() {
  const c = S.cands, sel = new Set();
  frame({ label: 'סמן מילים שאתה כבר מכיר היטב', ic: 'check', body: `
    <p class="sub" style="margin-top:0">רק מילים שאתה יודע בוודאות מה הן אומרות. נבדוק כמה מהן בהמשך.</p>
    <div class="scr">${c.map(x => `<button class="w" data-w="${esc(x.w)}" aria-pressed="false">${esc(x.w)}</button>`).join('')}</div>`,
    foot: `<button class="btn o big full" id="go">המשך</button>${S.due.length ? `<div class="mut center" style="font-size:.85rem">+ ${S.due.length} חזרות מחכות</div>` : ''}` });
  V.querySelectorAll('.scr .w').forEach(b => b.onclick = () => { const w = b.dataset.w; sel.has(w) ? sel.delete(w) : sel.add(w); b.classList.toggle('ok', sel.has(w)); b.setAttribute('aria-pressed', sel.has(w)); });
  $('#go').onclick = () => prepare(c, sel);
}
function prepare(c, sel) {
  const spot = shuf([...sel]).slice(0, 3);
  const unk = c.filter(x => !sel.has(x.w)), got = c;
  // מה שסומן ולא נבדק – נחשב מוכר
  [...sel].filter(w => !spot.includes(w)).forEach(w => { (state.known ||= {})[w] = 1; });
  const ok = new Set(got.map(x => x.w));
  S.newW = unk.filter(x => ok.has(x.w)).slice(0, S.per).map(x => x.w);
  // תרגילים: חזרות → בדיקה מדגמית → היכרות + זיהוי מרווח
  S.due.forEach(w => S.ex.push({ t: 'mc', w, rev: true }));
  spot.filter(w => ok.has(w)).forEach(w => S.ex.push({ t: 'mc', w, spot: true }));
  S.newW.forEach((w, i) => { S.ex.push({ t: 'intro', w }); if (i >= 2) S.ex.push({ t: 'mc', w: S.newW[i - 2] }); });
  S.newW.slice(-2).forEach(w => S.ex.push({ t: 'mc', w }));
  save();
  if (!S.ex.length) { ctx.toast('אין מילים חדשות כרגע'); return ctx.go('practice'); }
  show();
}
const W = (w) => state.extra[w];
function hlx(ex, w) { const e = esc(ex); const r = e.replace(new RegExp(`\\b(${w}\\w*)`, 'i'), '<b>$1</b>'); return r; }
function show() {
  if (S.i >= S.ex.length) return end();
  const e = S.ex[S.i], x = W(e.w); if (!x) { S.i++; return show(); }
  const n = S.ex.length;
  if (e.t === 'intro') {
    srs.learn('r:' + e.w);
    frame({ i: S.i, n, label: 'מילה חדשה', ic: 'sparkle', body: `
      <div class="card"><div class="ltr" style="text-align:left"><b style="font-size:1.8rem">${esc(e.w)}</b> ${x.ipa ? `<span class="ipa">/${esc(x.ipa)}/</span>` : ''}</div>
      <div style="font-size:1.3rem;font-weight:800;margin:8px 0">${esc(x.he)}</div>
      <div class="ex ltr">${hlx(x.ex, e.w)}</div>
      <button class="lp-audio" id="a1">${icon('sound', 18)} מילה</button> <button class="lp-audio" id="a2">${icon('sound', 18)} משפט</button></div>`,
      foot: `<button class="btn o big full" id="nx">הבנתי</button><button class="lp-skip" id="kn">אני מכיר אותה</button>` });
    say(e.w); $('#a1').onclick = () => say(e.w); $('#a2').onclick = () => say(x.ex);
    $('#nx').onclick = () => { S.i++; show(); };
    $('#kn').onclick = () => { delete state.cards['r:' + e.w]; (state.known ||= {})[e.w] = 1; S.ex.forEach((y, k) => { if (k > S.i && y.w === e.w) y.skip = true; }); S.newW = S.newW.filter(w => w !== e.w); save(); S.i++; show(); };
    return;
  }
  if (e.skip) { S.i++; return show(); }
  // זיהוי: המילה במשפט → בחר פירוש
  const pool = shuf([...Object.values(state.extra || {}).filter(y => y.he && y.w !== e.w && y.he !== x.he), ...shuf(ALL).slice(0, 40)]).map(y => y.he);
  const opts = shuf([x.he, ...[...new Set(pool)].slice(0, 3)]);
  frame({ i: S.i, n, label: e.spot ? 'בדיקה: אמרת שאתה מכיר' : e.rev ? 'חזרה מהירה' : 'מה זה אומר?', ic: e.spot ? 'target' : 'bolt', body: `
    <div class="card"><div class="ltr" style="text-align:left"><b style="font-size:1.6rem">${esc(e.w)}</b> <button class="lp-audio" id="a1" style="margin:0">${icon('sound', 18)}</button></div>
    <div class="ex ltr" style="margin-top:8px">${hlx(x.ex, e.w)}</div></div>
    <div class="lp-opts">${opts.map(o => `<button class="lp-opt" data-o="${esc(o)}">${esc(o)}</button>`).join('')}</div>`,
    foot: `<button class="lp-skip" id="idk">לא יודע</button>` });
  $('#a1').onclick = () => say(e.w);
  const answer = (o) => {
    const ok = o === x.he; S.n++; if (ok) S.ok++;
    V.querySelectorAll('.lp-opt').forEach(b => { b.disabled = true; if (b.dataset.o === x.he) b.classList.add('right'); else if (b.dataset.o === o) b.classList.add('wrong'); });
    if (e.spot) { if (ok) { (state.known ||= {})[e.w] = 1; } else { srs.learn('r:' + e.w); S.newW.push(e.w); S.bad.add(e.w); } }
    else if (!e.again) { srs.learn('r:' + e.w); srs.grade('r:' + e.w, ok ? 2 : 0); if (!ok) S.bad.add(e.w); }
    if (!ok && !e.again && !e.spot) S.ex.push({ ...e, again: true });
    addXP(ok ? 1 : 0, 'review'); save();
    if (ok) { chime(true); setTimeout(() => { S.i++; show(); }, 550); } // נכון → ממשיכים מהר
    else sheet('wrong', `<div class="ans" style="direction:rtl;text-align:right">${esc(x.he)}</div><div class="ex ltr">${hlx(x.ex, e.w)}</div>${e.spot ? '<div class="mut" style="font-size:.88rem;margin-top:6px">נוסיף אותה ללמידה 🙂</div>' : ''}`, { onNext: () => { S.i++; show(); } });
    say(e.w);
  };
  V.querySelectorAll('.lp-opt').forEach(b => b.onclick = () => answer(b.dataset.o));
  $('#idk').onclick = () => answer('');
}
function end() {
  const mins = Math.max(1, Math.round((Date.now() - S.t0) / 60000));
  addXP(8, 'review'); const hd = (state.hist ||= {})[new Date().toLocaleDateString('sv')] ||= { xp: 0, min: 0 }; hd.min += mins;
  save(); ctx.refreshTop(); ctx.stage.celebrate();
  frame({ body: `<div class="lp-end"><div class="say" style="justify-content:center;margin-top:12px"><div class="cslot" style="--s:110px"></div></div>
    <h2 class="center">כל הכבוד!</h2>
    <div class="stats"><div class="stat"><b style="color:var(--good-ink)">+${S.newW.length}</b><small>מילים חדשות</small></div><div class="stat"><b>${S.due.length}</b><small>חזרות</small></div><div class="stat"><b>${S.n ? Math.round(S.ok / S.n * 100) : 100}%</b><small>דיוק</small></div></div>
    <div class="card center"><div class="mut" style="font-size:.85rem">אוצר המילים המשוער שלך</div><b style="font-size:1.8rem">${vocabSize().toLocaleString('en')}</b></div>
    ${S.newW.length ? `<div class="card">${S.newW.map(w => `<span class="w ${S.bad.has(w) ? 'mid' : 'ok'}">${esc(w)} <small>${esc(W(w)?.he)}</small></span>`).join('')}</div>` : ''}</div>`,
    foot: `<button class="btn o big full" id="again">עוד סבב</button><button class="btn g full" id="h">סיום</button>` });
  $('#again').onclick = () => fast(); $('#h').onclick = () => ctx.go('practice');
}
