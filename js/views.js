import { state, save, addXP, rollDay, levelProgress, reset } from './store.js';
import * as srs from './srs.js';
import { say, listen, compare, norm, SR, listVoices, stopSpeaking } from './speech.js';
import { ANIMALS } from './stage.js';
import { PHONEMES, PAIRS } from '../data/phonemes.js';
import { SCENARIOS, REACTS, FIXES } from '../data/talk.js';

const WORDS = await fetch('data/words.json').then(r => r.json());
const ALL = WORDS.units.flatMap(u => u.words.map(w => ({ ...w, unit: u.id })));
const BYW = Object.fromEntries(ALL.map(w => [w.w, w]));
const cid = (w) => 'w:' + w;
const pick = (a) => a[Math.random() * a.length | 0];
const shuffle = (a) => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);
const hl = (ex, w) => ex.replace(new RegExp(`\\b(${w}\\w*)`, 'i'), '<b>$1</b>');

export { ALL, hl, pick, shuffle, trySpeak };
let ctx, V;
export const init = (c) => { ctx = c; V = c.view; };
const $ = (s, el = V) => el.querySelector(s);
const on = (s, fn, el = V) => el.querySelectorAll(s).forEach(b => b.onclick = () => fn(b));

// ---------- מעטפת דיבור משותפת ----------
async function trySpeak(btn, target, out, { kind = 'speak', xp = 3 } = {}) {
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
const speakBtns = (w) => `<div class="row"><button class="btn b" data-say="${w}">🔊 שמע</button><button class="btn g" data-slow="${w}">🐢 לאט</button><button class="btn o" data-mic="${w}">🎤 אמור</button></div><div class="res" id="res"></div>`;
function bindSpeak(el = V, opts) {
  on('[data-say]', b => say(b.dataset.say), el); on('[data-slow]', b => say(b.dataset.slow, { rate: .5 }), el);
  on('[data-mic]', b => trySpeak(b, b.dataset.mic, $('#res', el), opts), el);
}

// ---------- היום ----------
export function today() {
  rollDay(); const d = state.daily, due = srs.dueIds().length, A = ANIMALS[state.animal], lp = levelProgress();
  const tasks = [
    { ic: '🔁', t: 'חזרות מרווחות', s: due ? `${due} מילים מחכות לך` : 'אין חזרות כרגע – כל הכבוד', cur: d.review, tgt: 10, go: startReview },
    { ic: '👂', t: 'אימון אוזן', s: '10 זוגות – מה שומעים?', cur: d.ear, tgt: 10, go: () => startEar() },
    { ic: '📚', t: 'מילים חדשות', s: '5 מילים + הגייה + משפט', cur: d.learn, tgt: 5, go: () => startLearn() },
    { ic: '🥁', t: 'מקצב ו-Shadowing', s: 'הטעמה + משפטים בקצב טבעי', cur: d.rhythm + d.shadow, tgt: 6, go: () => ctx.go('rhythm') },
    { ic: '🎤', t: 'תרגול דיבור', s: '5 משפטים בקול', cur: d.speak, tgt: 5, go: startSentences }
  ];
  const known = Object.keys(state.cards).length;
  V.innerHTML = `
    <div class="hello"><div class="big">${A.emoji}</div><div><b>${greet()}! אני ${A.name}.</b><div class="sub" style="margin:2px 0 0">היום צברת ${d.xp} XP · עוד ${lp.next} XP לרמה ${lp.L + 1}</div></div></div>
    <h2>התוכנית של היום</h2><p class="sub">כ-30 דקות. עקביות חשובה יותר מכמות.</p>
    ${tasks.map((t, i) => { const p = Math.min(1, t.cur / t.tgt); return `<button class="task ${p >= 1 ? 'done' : ''}" data-t="${i}"><div class="ic">${t.ic}</div><div class="t"><b>${t.t}</b><small>${t.s}</small><div class="prog"><i style="width:${p * 100}%"></i></div></div><div class="st">${p >= 1 ? '✅' : '‹'}</div></button>`; }).join('')}
    <h3>ההתקדמות שלך</h3>
    <div class="stats"><div class="stat"><b>${known}</b><small>מילים בלמידה</small></div><div class="stat"><b>${srs.mature()}</b><small>מילים בשליטה</small></div><div class="stat"><b>${state.best}</b><small>שיא רצף ימים</small></div></div>
    <h3>מסלול Native Path</h3>
    <div class="path">
      <div class="step on"><i>S0</i><span><b>בסיס הצלילים</b> · 44 פונמות + אימון אוזן</span></div>
      <div class="step on"><i>S1</i><span><b>1,000 מילים ראשונות</b> · ${ALL.length} זמינות עכשיו</span></div>
      <div class="step on"><i>S2</i><span><b>מקצב, הטעמה וחיבורים</b> · לשונית מקצב</span></div>
      <div class="step lock"><i>S3</i><span>3,000 מילים + phrasal verbs 🔒</span></div>
      <div class="step on"><i>S4</i><span><b>Shadowing</b> · הקלטה וניתוח קצב</span></div>
      <div class="step lock"><i>S5</i><span>שיחה חופשית עם AI 🔒</span></div>
      <div class="step lock"><i>S6–7</i><span>אידיומות, סלנג, שפת אם 🔒</span></div>
    </div>`;
  on('.task', b => tasks[+b.dataset.t].go());
}
const greet = () => { const h = new Date().getHours(); return h < 5 ? 'לילה טוב' : h < 12 ? 'בוקר טוב' : h < 18 ? 'צהריים טובים' : 'ערב טוב'; };

// ---------- מילים ----------
export function words(uid) {
  if (uid) return unitView(uid);
  V.innerHTML = `<h2>מילים</h2><p class="sub">${ALL.length} מילים ב-${WORDS.units.length} נושאים. כל מילה עם הגייה מדויקת (IPA), תרגום ומשפט.</p>
    <input id="q" class="srch" placeholder="🔍 חפש מילה באנגלית או בעברית…" autocomplete="off"><div id="hits"></div>
    <div class="units" id="ul">${WORDS.units.map(u => { const n = u.words.filter(w => srs.get(cid(w.w))).length; return `<button class="unit" data-u="${u.id}"><div class="ic">${u.icon}</div><b>${u.title}</b><small>${n}/${u.words.length}</small><div class="prog"><i style="width:${n / u.words.length * 100}%"></i></div></button>`; }).join('')}</div>`;
  on('.unit', b => unitView(+b.dataset.u));
  $('#q').oninput = (e) => {
    const t = e.target.value.trim().toLowerCase(), h = $('#hits');
    $('#ul').hidden = !!t; if (!t) { h.innerHTML = ''; return; }
    const r = ALL.filter(w => w.w.toLowerCase().includes(t) || w.he.includes(t)).slice(0, 40);
    h.innerHTML = r.length ? `<div class="wlist">${r.map(w => `<div class="wr"><button class="round" data-say="${w.w}">🔊</button><div class="l"><b>${w.w}</b> ${srs.get(cid(w.w)) ? '✅' : ''}<div>/${w.ipa}/</div></div><div class="r">${w.he}</div></div>`).join('')}</div>` : '<p class="sub center">לא נמצא</p>';
    on('[data-say]', b => say(b.dataset.say), h);
  };
}
function unitView(uid) {
  const u = WORDS.units.find(x => x.id === uid);
  V.innerHTML = `<button class="back" id="bk">→ חזרה</button><h2>${u.icon} ${u.title}</h2>
    <div class="row" style="margin:10px 0"><button class="btn o" id="go">📚 למד מילים חדשות</button></div>
    <div class="wlist">${u.words.map(w => `<div class="wr"><button class="round" data-say="${w.w}">🔊</button><div class="l"><b>${w.w}</b> ${srs.get(cid(w.w)) ? '✅' : ''}<div>/${w.ipa}/</div></div><div class="r">${w.he}</div></div>`).join('')}</div>`;
  $('#bk').onclick = () => words(); $('#go').onclick = () => startLearn(uid);
  on('[data-say]', b => say(b.dataset.say));
}

function startLearn(uid) {
  const pool = ALL.filter(w => !srs.get(cid(w.w)) && (!uid || w.unit === uid));
  const q = pool.slice(0, 5);
  if (!q.length) { ctx.toast('כבר למדת את כל המילים כאן 🎉'); return words(); }
  let i = 0;
  const card = () => {
    const w = q[i];
    V.innerHTML = `<button class="back" id="bk">→ יציאה</button><div class="dots">${q.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>
      <div class="wcard"><div class="word">${w.w}</div><div class="ipa">/${w.ipa}/</div><div class="he">${w.he}</div>
      <div class="ex">${hl(w.ex, w.w)}</div><div class="row c"><button class="btn g" data-say="${w.ex}" style="flex:0 0 auto">🔊 המשפט</button><span class="pill">${w.syl} הברות · הטעמה ${w.st}</span></div></div>
      ${speakBtns(w.w)}<button class="btn full" id="nx">${i < q.length - 1 ? 'הבנתי, הבא ←' : 'סיימתי ✔'}</button>`;
    $('#bk').onclick = words; bindSpeak(V, { kind: 'speak' });
    on('[data-say]', b => say(b.dataset.say));
    ctx.stage.celebrate(); say(w.w, { show: false }); ctx.bubble(w.w);
    $('#nx').onclick = () => { srs.learn(cid(w.w)); addXP(3, 'learn'); ctx.refreshTop(); if (++i < q.length) card(); else done(); };
  };
  const done = () => {
    ctx.stage.celebrate(); ctx.bubble('You learned ' + q.length + ' new words! 🎉');
    V.innerHTML = `<div class="center"><div style="font-size:3rem">🎉</div><h2>למדת ${q.length} מילים!</h2><p class="sub">הן נכנסו לחזרות המרווחות. כדי שיישארו – תחזור אליהן מחר.</p>
      <div class="row c">${q.map(w => `<span class="w ok">${w.w}</span>`).join('')}</div><br><div class="row"><button class="btn o" id="m">עוד מילים</button><button class="btn g" id="h">למסך הבית</button></div></div>`;
    $('#m').onclick = () => startLearn(uid); $('#h').onclick = () => ctx.go('today');
  };
  card();
}

// ---------- חזרות ----------
function startReview() {
  const q = srs.dueIds().slice(0, 15);
  if (!q.length) { V.innerHTML = `<div class="center"><div style="font-size:3rem">✨</div><h2>אין חזרות כרגע</h2><p class="sub">למד מילים חדשות כדי למלא את הסל.</p><button class="btn o" id="l">📚 מילים חדשות</button></div>`; $('#l').onclick = () => startLearn(); return; }
  let i = 0, ok = 0;
  const front = () => {
    const w = BYW[q[i].slice(2)];
    V.innerHTML = `<button class="back" id="bk">→ יציאה</button><div class="dots">${q.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>
      <div class="wcard"><p class="sub">איך אומרים באנגלית?</p><div class="he" style="font-size:2rem">${w.he}</div></div>
      <div class="res" id="res"></div><div class="row"><button class="btn o" id="mic">🎤 אמור</button><button class="btn b" id="show">הצג תשובה</button></div>`;
    $('#bk').onclick = () => ctx.go('today');
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
  const fin = () => { V.innerHTML = `<div class="center"><div style="font-size:3rem">🔁</div><h2>סיימת ${q.length} חזרות</h2><p class="sub">זכרת ${ok} מתוכן.</p><button class="btn o full" id="h">לתוכנית היום</button></div>`; $('#h').onclick = () => ctx.go('today'); };
  front();
}

// ---------- משפטים (דיבור) ----------
function startSentences() {
  const learned = ALL.filter(w => srs.get(cid(w.w)));
  const q = shuffle(learned.length >= 3 ? learned : ALL).slice(0, 5); let i = 0;
  const card = () => {
    const w = q[i];
    V.innerHTML = `<button class="back" id="bk">→ יציאה</button><div class="dots">${q.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>
      <p class="sub center">שמע, ואז חזור אחרי המשפט בקול</p><div class="ex" style="font-size:1.35rem;text-align:center">${hl(w.ex, w.w)}</div><div class="he center mut" style="font-size:1rem">מילת המפתח: ${w.w} – ${w.he}</div><br>
      ${speakBtns(w.ex)}<button class="btn g full" id="nx">${i < q.length - 1 ? 'הבא ←' : 'סיום'}</button>`;
    $('#bk').onclick = () => ctx.go('today'); bindSpeak(V, { kind: 'speak', xp: 3 }); say(w.ex);
    $('#nx').onclick = () => { if (++i < q.length) card(); else ctx.go('today'); };
  };
  card();
}

// ---------- צלילים ----------
export function sounds(sub = 'map') {
  V.innerHTML = `<div class="seg"><button data-s="map" class="${sub === 'map' ? 'on' : ''}">מפת הצלילים</button><button data-s="ear" class="${sub === 'ear' ? 'on' : ''}">אימון אוזן</button><button data-s="me" class="${sub === 'me' ? 'on' : ''}">הנקודות שלי</button></div><div id="sv"></div>`;
  on('.seg button', b => sounds(b.dataset.s));
  const sv = $('#sv');
  if (sub === 'map') {
    const row = (type) => `<div class="grid">${PHONEMES.filter(p => p[1] === type || (type === 'תנועה' && p[1] === 'דיפתונג')).map(p => `<button class="ph ${p[4] ? 'hard' : ''} ${state.phon[p[0]] ? 'dn' : ''}" data-p="${p[0]}">${p[0]}<small>${p[2].split(' · ')[0]}</small></button>`).join('')}</div>`;
    sv.innerHTML = `<h2>44 הצלילים</h2><p class="sub">🔥 = קשה במיוחד לדוברי עברית. התחל משם.</p><h3>תנועות</h3>${row('תנועה')}<h3>עיצורים</h3>${row('עיצור')}`;
    on('.ph', b => phoneme(b.dataset.p));
  } else if (sub === 'ear') {
    sv.innerHTML = `<h2>אימון אוזן 👂</h2><p class="sub">מי שלא שומע את ההבדל – לא יפיק אותו. שומעים מילה, ובוחרים מה נאמר. 10 שאלות.</p>
      <button class="btn o full" id="all">התחל אימון</button><h3>לפי תחום</h3><div class="chips"><button data-f="vowel">תנועות</button><button data-f="cons">עיצורים</button><button data-f="th">TH</button><button data-f="vb">V / B</button><button data-f="rl">R / L</button></div>`;
    $('#all').onclick = () => startEar();
    on('[data-f]', b => startEar(b.dataset.f));
  } else {
    const rows = Object.entries(state.ear).map(([k, v]) => ({ k, acc: v.ok / v.n, n: v.n })).sort((a, b) => a.acc - b.acc);
    sv.innerHTML = `<h2>הנקודות שלי</h2><p class="sub">מדד הדיוק שלך בזיהוי צלילים. התחל מהחלשים.</p>` + (rows.length ? rows.map(r => `<div class="card"><div class="row" style="justify-content:space-between"><b class="ltr">${r.k}</b><span class="pill ${r.acc >= .85 ? 'ok' : r.acc < .6 ? 'hot' : ''}">${Math.round(r.acc * 100)}% · ${r.n} שאלות</span></div><div class="prog"><i style="width:${r.acc * 100}%"></i></div></div>`).join('') : '<div class="card center">עוד אין נתונים – התחל אימון אוזן 👂</div>');
  }
}
function phoneme(ipa) {
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

function startEar(filter) {
  let pool = PAIRS;
  if (filter === 'vowel') pool = PAIRS.filter(p => p[3] === 'vowel'); else if (filter === 'cons') pool = PAIRS.filter(p => p[3] === 'cons');
  else if (filter === 'th') pool = PAIRS.filter(p => /θ|ð/.test(p[2])); else if (filter === 'vb') pool = PAIRS.filter(p => /v/.test(p[2]) && /b|w/.test(p[2]));
  else if (filter === 'rl') pool = PAIRS.filter(p => /ɹ/.test(p[2])); else if (filter?.startsWith('p:')) pool = PAIRS.filter(p => p[2].split(' / ').includes(filter.slice(2)));
  if (!pool.length) pool = PAIRS;
  const N = 10; let i = 0, ok = 0;
  const weak = Object.entries(state.ear).filter(([, v]) => v.n >= 2 && v.ok / v.n < .7).map(([k]) => k);
  const q = Array.from({ length: N }, () => { const wp = pool.filter(p => weak.includes(p[2])); const p = (wp.length && Math.random() < .5) ? pick(wp) : pick(pool); const t = Math.random() < .5 ? 0 : 1; return { p, t, order: Math.random() < .5 }; });
  const ask = () => {
    const { p, t, order } = q[i], target = p[t], opts = order ? [p[0], p[1]] : [p[1], p[0]];
    V.innerHTML = `<button class="back" id="bk">→ יציאה</button><div class="dots">${q.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>
      <p class="sub center">איזו מילה שמעת?</p><button class="speaker" id="spk">🔊</button>
      ${opts.map(o => `<button class="choice" data-c="${o}">${o}</button>`).join('')}<div id="fb"></div>`;
    $('#bk').onclick = () => sounds('ear'); const play = () => say(target, { rate: .75, show: false }); $('#spk').onclick = play; setTimeout(play, 250);
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
  const sum = () => { const pc = Math.round(ok / N * 100); ctx.stage.celebrate(); V.innerHTML = `<div class="center"><div style="font-size:3rem">${pc >= 80 ? '🏆' : '💪'}</div><h2>${ok}/${N} נכון (${pc}%)</h2><p class="sub">${pc >= 90 ? 'אוזן חדה! עכשיו אפשר להתמקד בהפקה.' : 'האוזן מתחדדת עם חזרות – נסה שוב מחר.'}</p><div class="row"><button class="btn o" id="r">שוב</button><button class="btn g" id="h">סיום</button></div></div>`; $('#r').onclick = () => startEar(filter); $('#h').onclick = () => ctx.go('today'); };
  ask();
}

// ---------- שיחה ----------
let scen = SCENARIOS[0];
export function talk() {
  V.innerHTML = `<h2>שיחה 💬</h2><p class="sub">דבר חופשי. ${ANIMALS[state.animal].name} שואל/ת ומתקן/ת ניסוחים נפוצים. (בשלב הבא: שיחה חכמה עם AI.)</p>
    <div class="chips">${SCENARIOS.map(s => `<button data-s="${s.id}" class="${s.id === scen.id ? 'on' : ''}">${s.icon} ${s.title}</button>`).join('')}</div>
    <div class="chat" id="log"></div><div id="fx"></div>
    <div class="row" style="margin-top:10px"><button class="btn o full" id="mic">🎤 ענה בקול</button></div>
    <div class="input"><input id="txt" placeholder="או הקלד באנגלית…" autocomplete="off" autocapitalize="sentences"><button class="btn" id="send" style="min-height:44px;padding:0 16px">שלח</button></div>`;
  on('.chips button', b => { scen = SCENARIOS.find(s => s.id === b.dataset.s); talk(); });
  const log = $('#log'); let q = 0, busy = false;
  const add = (c, t) => { log.insertAdjacentHTML('beforeend', `<div class="msg ${c}">${t}</div>`); log.scrollTop = log.scrollHeight; };
  const ask = () => { if (q >= scen.qs.length) { add('a', 'That was a great conversation! 🎉'); say('That was a great conversation!'); addXP(10, 'speak'); ctx.refreshTop(); ctx.stage.celebrate(); q = 0; return; } const t = scen.qs[q++]; add('a', t); return say(t); };
  const answer = async (txt) => {
    txt = txt.trim(); if (!txt || busy) return; busy = true; add('u', txt); $('#txt').value = '';
    const f = FIXES.find(x => x[0].test(txt));
    $('#fx').innerHTML = f ? `<div class="tip">💡 ${f[2]}<div class="ltr"><b>${txt.replace(f[0], f[1])}</b></div></div>` : '';
    addXP(f ? 1 : 4, 'speak'); ctx.refreshTop();
    await say(pick(REACTS)); busy = false; ask();
  };
  $('#send').onclick = () => answer($('#txt').value); $('#txt').onkeydown = e => { if (e.key === 'Enter') answer($('#txt').value); };
  $('#mic').onclick = async (e) => { try { const a = await listen(e.currentTarget); if (a[0]) answer(a[0]); } catch { $('#fx').innerHTML = '<div class="tip">זיהוי דיבור לא זמין בדפדפן הזה – אפשר להקליד.</div>'; } };
  ask();
}

// ---------- הגדרות וחברים ----------
export function openSheet(html) { const s = document.getElementById('sheet'); document.getElementById('sheetBody').innerHTML = html; s.hidden = false; return document.getElementById('sheetBody'); }
export const closeSheet = () => { document.getElementById('sheet').hidden = true; };

export function friends() {
  const b = openSheet(`<h2>בחר חבר ללמידה</h2><p class="sub">כל חבר עם קול ברירת מחדל שונה. אפשר לשנות בהגדרות.</p><div class="pick">${Object.entries(ANIMALS).map(([k, a]) => `<button data-a="${k}" class="${k === state.animal ? 'on' : ''}"><i>${a.emoji}</i>${a.name}<br><span class="mut" style="font-weight:500">${a.desc}</span></button>`).join('')}</div>`);
  on('[data-a]', x => { closeSheet(); ctx.setAnimal(x.dataset.a, true); }, b);
}
export function settings() {
  const voices = listVoices(), s = state.settings;
  const b = openSheet(`<h2>הגדרות</h2>
    <label class="field">מבטא יעד<select id="acc"><option value="en-US">אמריקאי (General American)</option><option value="en-GB">בריטי (RP)</option><option value="en-AU">אוסטרלי</option></select></label>
    <label class="field">קול<select id="voice">${voices.length ? voices.map(v => `<option value="${v.voiceURI}" ${v.voiceURI === s.voice ? 'selected' : ''}>${/natural|neural|online/i.test(v.name) ? '⭐ ' : ''}${v.name} (${v.lang})</option>`).join('') : '<option value="">לא נמצאו קולות באנגלית במכשיר</option>'}</select></label>
    <label class="field">מהירות דיבור: <span id="rv">${s.rate}</span><input type="range" id="rate" min="0.5" max="1.2" step="0.05" value="${s.rate}"></label>
    <label class="field">גובה קול: <span id="pv">${s.pitch || 'אוטומטי לפי החבר'}</span><input type="range" id="pitch" min="0" max="1.8" step="0.05" value="${s.pitch}"></label>
    <div class="row"><button class="btn b" id="test">🔊 נסה קול</button><button class="btn g" id="close">סגור</button></div>
    <p class="mut" style="font-size:.8rem;margin-top:14px">טיפ: קולות עם ⭐ (Natural/Neural) נשמעים הכי טבעי. ב-Android מומלץ להתקין "Google TTS" ולהוריד קול באנגלית; ב-iPhone: הגדרות › נגישות › תוכן מדובר › קולות.</p>
    <button class="btn g full" id="rst" style="margin-top:10px;color:#b3254a">איפוס כל ההתקדמות</button>`);
  $('#acc', b).value = s.accent;
  const upd = () => { s.accent = $('#acc', b).value; s.voice = $('#voice', b).value; s.rate = +$('#rate', b).value; s.pitch = +$('#pitch', b).value; $('#rv', b).textContent = s.rate; $('#pv', b).textContent = s.pitch || 'אוטומטי'; save(); };
  ['acc', 'voice', 'rate', 'pitch'].forEach(id => $('#' + id, b).onchange = $('#' + id, b).oninput = upd);
  $('#acc', b).onchange = () => { upd(); s.voice = ''; save(); settings(); };
  $('#test', b).onclick = () => say(`Hello! I'm ${ANIMALS[state.animal].name}. Nice to meet you!`); $('#close', b).onclick = closeSheet;
  $('#rst', b).onclick = () => { if (confirm('למחוק את כל ההתקדמות?')) reset(); };
}
