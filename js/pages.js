// מסכים ראשיים: תרגול (כל סוגי האימון לפי מיומנות), אני (פרופיל, רמה, הגדרות), ומסכי פתיחה למשתמש חדש
import { state, save, levelProgress } from './store.js';
import * as srs from './srs.js';
import { ANIMALS, animalImg } from './stage.js';
import { say, listVoices, listen, SR, stopSpeaking } from './speech.js';
import * as azure from './azure.js';
import * as Vw from './views.js';
import * as R from './rhythm.js';
import { LEVELS } from '../data/placement.js';
import { icon } from './icons.js';

let ctx, V;
export const init = (c) => { ctx = c; V = c.view; };
const $ = (s) => V.querySelector(s);
const row = (act, ic, t, s) => `<button class="prow" data-act="${act}"><span class="ic">${icon(ic)}</span><span class="t"><b>${t}</b><small>${s}</small></span><span class="st">${icon('chevron')}</span></button>`;

// ---------- תרגול ----------
export function practice() {
  const due = srs.dueIds().length, left = Vw.ALL.filter(w => !state.cards['w:' + w.w] && !state.known?.[w.w]).length;
  V.innerHTML = `<h2>תרגול</h2><p class="sub">בחר מה לתרגל. השיעור היומי כבר משלב את כל אלה.</p>
    <div class="psec"><h3>${icon('book')} מילים</h3>
      ${row('learn', 'sparkle', 'מילים חדשות', `${left.toLocaleString('en')} מילים שעוד לא למדת`)}
      ${row('review', 'repeat', 'חזרות חכמות', due ? `${due} מילים מחכות לחזרה` : 'אין חזרות כרגע')}
      ${row('words', 'list', 'כל המילים', 'רשימה לפי רמות + חיפוש')}</div>
    <div class="psec"><h3>${icon('ear')} הגייה</h3>
      ${row('ear', 'ear', 'אימון אוזן', 'שומעים מילה ובוחרים – ship או sheep?')}
      ${row('hard', 'grid', 'הצלילים הקשים', '20 צלילים שדוברי עברית מתקשים בהם')}
      ${row('lab', 'target', 'בדיקת הגייה', 'כותבים משפט, אומרים אותו, ומקבלים ציון לכל מילה')}</div>
    <div class="psec"><h3>${icon('mic')} דיבור</h3>
      ${row('speak', 'mic', 'חזור אחריי', 'שומעים משפט ואומרים אותו')}
      ${row('shadow', 'mirror', 'חיקוי דובר', 'מקליטים את עצמך ומקבלים ציון על הקצב')}
      ${row('talk', 'chat', `שיחה עם ${ANIMALS[state.animal].name}`, 'שיחה חופשית עם תיקונים')}</div>
    <div class="psec"><h3>${icon('music')} מקצב ומנגינה</h3><p class="sub" style="margin:-4px 0 8px">רוב ה"מבטא" בא מהקצב: אילו מילים חזקות ואילו נבלעות.</p>
      ${row('stressw', 'bolt', 'איפה הדגש במילה?', 'WAter או waTER?')}
      ${row('stresss', 'music', 'מילים חזקות במשפט', 'מה מדגישים ומה "בולעים"')}
      ${row('link', 'link', 'חיבור בין מילים', 'turn it on ← "tur-ni-ton"')}
      ${row('flap', 'sound', 'ה-T האמריקאית', 'water ← "wadder"')}
      ${row('red', 'wave', 'קיצורים בדיבור', 'gonna · wanna · lemme')}
      ${row('weak', 'volume', 'מילים שנבלעות', 'to · for · and · of')}
      ${row('intonation', 'music', 'מנגינת המשפט', 'מתי הקול עולה ומתי יורד')}</div>`;
  const A = {
    learn: () => ctx.learn.startLesson(), review: () => ctx.learn.startLesson(null, { review: true }), words: () => ctx.go('words'),
    ear: () => Vw.startEar(), hard: () => ctx.go('sounds'), lab: () => { ctx.go('sounds'); Vw.sounds('lab'); },
    speak: () => Vw.startSentences(), shadow: () => R.shadow(), talk: () => ctx.go('talk'),
    stressw: () => R.stressWords(), stresss: () => R.stressSentence()
  };
  V.querySelectorAll('.prow').forEach(b => b.onclick = () => (A[b.dataset.act] || (() => R.lesson(b.dataset.act)))());
}

// ---------- אני ----------
const TH = [0, 300, 800, 1600, 3000, 5000, 8000, 16000];
const sw = (id, on, label) => `<button class="setrow" id="${id}" role="switch" aria-checked="${on}"><span class="t">${label}</span><span class="switch" aria-checked="${on}"></span></button>`;
export function me() {
  const P = state.placement, A = ANIMALS[state.animal], s = state.settings;
  const learned = Object.keys(state.cards).length + Object.keys(state.known || {}).length;
  const lvl = P ? P.overall : null, size = Math.max(P?.size || 0, learned);
  const pct = lvl == null ? 0 : Math.max(.04, Math.min(1, (size - TH[lvl]) / ((TH[lvl + 1] || TH[lvl] * 2) - TH[lvl])));
  const C = 2 * Math.PI * 38, mins = Object.values(state.hist || {}).reduce((a, h) => a + (h.min || 0), 0);
  const goal = s.goal || 20, days = [...Array(7)].map((_, i) => { const d = new Date(Date.now() - (6 - i) * 864e5); return { k: d.toLocaleDateString('sv'), l: 'אבגדהוש'[d.getDay()] }; });
  const vals = days.map(d => state.hist?.[d.k]?.min || 0), mx = Math.max(goal, ...vals);
  const skill = (lab, lv, txt) => `<div class="skill"><div class="h"><span>${lab}</span><span class="ltr" style="color:${lv >= 3 ? 'var(--good-ink)' : 'var(--brand-ink)'}">${txt}</span></div><div class="prog"><i style="width:${Math.max(6, lv / 6 * 100)}%;background:${lv >= 3 ? 'var(--good)' : 'var(--brand)'}"></i></div></div>`;
  const weak = Object.entries(state.ear).filter(([, v]) => v.n >= 2).map(([k, v]) => ({ k, a: Math.round(v.ok / v.n * 100) })).sort((a, b) => a.a - b.a).slice(0, 3);
  V.innerHTML = `<h2 style="font-size:1.6rem">אני</h2>
    <div class="hero"><div class="row" style="flex-wrap:nowrap;gap:12px"><img class="av" src="${animalImg(state.animal)}" alt=""><div style="flex:1"><div class="mut" style="font-size:.85rem;font-weight:700">החבר שלך</div><b style="font-size:1.15rem">${A.name}</b></div><button class="btn g" id="fr" style="min-height:46px;padding:0 16px">החלף</button></div></div>
    <div class="card">${P ? `<div class="row" style="flex-wrap:nowrap;gap:16px"><div class="ring"><svg width="92" height="92" viewBox="0 0 92 92" role="img" aria-label="${Math.round(pct * 100)}% בדרך לרמה הבאה"><circle cx="46" cy="46" r="38" fill="none" stroke="var(--neu)" stroke-width="10"/><circle cx="46" cy="46" r="38" fill="none" stroke="var(--brand)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(C * pct).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 46 46)"/></svg><div class="v">${LEVELS[lvl]}</div></div>
      <div style="flex:1"><div class="mut" style="font-size:.85rem;font-weight:700">הרמה שלי</div><div style="font-size:1.15rem;font-weight:800">${Math.round(pct * 100)}% בדרך ל-<span dir="ltr">${LEVELS[Math.min(6, lvl + 1)]}</span></div><div class="mut" style="font-size:.88rem">~${size.toLocaleString('en')} מילים</div></div></div>
      ${skill('אוצר מילים', P.v, LEVELS[P.v])}${skill('דקדוק', P.g, LEVELS[P.g])}${skill('שמיעה', P.l, LEVELS[Math.floor(P.l)])}${P.speak != null ? skill('הגייה', P.speak / 17, P.speak + '/100') : ''}
      <div class="row" style="margin-top:14px"><button class="btn g" id="res">פרטים</button><button class="btn b" id="pt">בדיקה חוזרת</button></div>`
      : `<b>הרמה שלי</b><p class="sub" style="margin:6px 0 12px">עוד לא בדקנו. 8 דקות, וחוסך ללמוד מה שכבר יודעים.</p><button class="btn o full" id="pt">${icon('target')} בדיקת רמה</button>`}</div>
    <div class="stats"><div class="stat"><b>${state.streak}</b><small>ימים ברצף</small></div><div class="stat"><b>${learned.toLocaleString('en')}</b><small>מילים שאני מכיר</small></div><div class="stat"><b>${mins}</b><small>דקות למידה</small></div></div>
    <div class="card"><div class="row" style="justify-content:space-between"><b>השבוע</b><span class="mut" style="font-size:.85rem">מטרה: ${goal} דקות ביום</span></div>
      <div class="week" role="img" aria-label="דקות למידה ב-7 הימים האחרונים: ${vals.join(', ')}">${vals.map(v => `<i class="${v >= goal ? 'ok' : v ? 'lo' : ''}" style="height:${Math.max(4, v / mx * 100)}%"></i>`).join('')}</div>
      <div class="wdays">${days.map(d => `<span>${d.l}</span>`).join('')}</div></div>
    ${weak.length ? `<div class="card"><b>צלילים לשפר</b>${weak.map(w => `<button class="setrow" data-weak><span class="t ltr" style="text-align:start">${w.k}</span><span class="v">${w.a}%</span>${icon('chevron')}</button>`).join('')}</div>` : ''}
    <div class="card" style="padding:4px 16px"><b style="display:block;padding-top:12px">נוחות ונגישות</b>
      ${sw('swDark', (s.theme || 'dark') !== 'light', `${icon('moon')} מצב כהה`)}
      ${sw('swBig', !!s.bigText, `${icon('text')} טקסט גדול`)}
      ${sw('swMotion', !!s.reduceMotion, `${icon('motion')} פחות תנועה`)}
      ${sw('swSnd', s.sounds !== false, `${icon('volume')} צלילי משוב ורטט`)}
      <div class="setrow"><span class="t">${icon('clock')} מטרה יומית</span><span class="chips" style="margin:0">${[10, 20, 30].map(m => `<button data-g="${m}" class="${goal === m ? 'on' : ''}" aria-pressed="${goal === m}">${m}</button>`).join('')}</span></div>
      <button class="setrow" id="set"><span class="t">${icon('sliders')} קול, מהירות וחיבורי AI</span>${icon('chevron')}</button></div>`;
  $('#fr').onclick = () => Vw.friends();
  $('#pt').onclick = () => ctx.placement.start();
  if ($('#res')) $('#res').onclick = () => ctx.placement.showResult(P);
  V.querySelectorAll('[data-weak]').forEach(b => b.onclick = () => Vw.startEar());
  const tog = (id, fn) => { $('#' + id).onclick = () => { fn(); save(); ctx.applyLook(); me(); }; };
  tog('swDark', () => { s.theme = (s.theme || 'dark') === 'light' ? 'dark' : 'light'; });
  tog('swBig', () => { s.bigText = !s.bigText; });
  tog('swMotion', () => { s.reduceMotion = !s.reduceMotion; });
  tog('swSnd', () => { s.sounds = s.sounds === false; });
  $('#set').onclick = () => Vw.settings();
  V.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { state.settings.goal = +b.dataset.g; state.settings.newPerDay = +b.dataset.g >= 30 ? 5 : 4; save(); me(); });
}

// ---------- מסכי פתיחה ----------
const DOTS = (i) => `<div class="dots" style="margin-bottom:14px">${[0, 1, 2, 3, 4].map(k => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>`;
export function onboarding(step = 0) {
  const A = ANIMALS[state.animal], next = () => onboarding(step + 1);
  const done = () => { state.onboarded = true; save(); ctx.go('today'); };
  if (step === 0) {
    V.innerHTML = `<div class="onb">${DOTS(0)}<img class="av big" src="${animalImg(state.animal)}" alt=""><h2 class="center">היי! אני ${A.name} 👋</h2>
      <p class="sub center">אני אעזור לך לדבר אנגלית בביטחון – עם מבטא אמריקאי טבעי.</p>
      <div class="card" style="line-height:2">📅 כל יום: <b>שיעור של כ-10 דקות</b>, בלחיצה אחת<br>🎤 מדברים <b>בקול</b> – ככה לומדים לדבר<br>👂 מאמנים את האוזן לצלילים של אנגלית<br>🔁 מילים חוזרות בדיוק כשעומדים לשכוח אותן</div>
      <button class="btn big full" id="n">בוא נתחיל</button></div>`;
    $('#n').onclick = () => { say(`Hi! I'm ${A.name}. Let's learn English together!`, { show: true }); next(); };
  } else if (step === 1) {
    V.innerHTML = `<div class="onb">${DOTS(1)}<h2>בחר חבר ללמידה</h2><p class="sub">לכל אחד קול ואופי משלו. אפשר להחליף בכל רגע.</p>
      <div class="pick">${Object.entries(ANIMALS).map(([k, a]) => `<button data-a="${k}" class="${k === state.animal ? 'on' : ''}"><img src="${animalImg(k)}" alt="" loading="lazy">${a.name}</button>`).join('')}</div>
      <button class="btn big full" id="n" style="margin-top:14px">המשך</button></div>`;
    V.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => { V.querySelectorAll('[data-a]').forEach(x => x.classList.toggle('on', x === b)); await ctx.setAnimal(b.dataset.a, false); say(`Hi! I'm ${ANIMALS[b.dataset.a].name}!`, { show: true }); });
    $('#n').onclick = next;
  } else if (step === 2) {
    const vs = listVoices().slice(0, 4);
    if (azure.ttsEnabled() || !vs.length) return next();
    const name = ANIMALS[state.animal].name;
    V.innerHTML = `<div class="onb">${DOTS(2)}<h2>איזה קול נשמע לך הכי טבעי?</h2><p class="sub">לחץ כדי לשמוע, ובחר את הקול שנעים לך. (הקולות תלויים במכשיר שלך.)</p>
      ${vs.map((v, i) => `<button class="opt" data-v="${i}">🔊 ${v.name.replace(/Microsoft |Google |\(.*\)/g, '').trim()} <span class="mut" style="font-size:.8rem">${v.lang}</span></button>`).join('')}
      <button class="btn big full" id="n" style="margin-top:6px">המשך</button></div>`;
    V.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { const v = vs[+b.dataset.v]; state.settings.voice = v.voiceURI; save(); V.querySelectorAll('[data-v]').forEach(x => x.style.borderColor = x === b ? 'var(--acc)' : ''); say(`Hi! I'm ${name}. Nice to meet you!`, { show: true }); });
    $('#n').onclick = next;
  } else if (step === 3) {
    V.innerHTML = `<div class="onb">${DOTS(3)}<h2>כמה זמן ביום?</h2><p class="sub">עקביות חשובה יותר מכמות. 10 דקות כל יום עדיפות על שעה פעם בשבוע.</p>
      ${[[10, '🙂 קליל', '5 מילים חדשות ביום'], [20, '💪 רציני', '6 מילים + יותר דיבור'], [30, '🚀 אינטנסיבי', '10 מילים + הכל']].map(([m, t, s]) => `<button class="opt" data-m="${m}"><b>${m} דקות · ${t}</b><br><span class="mut" style="font-size:.85rem">${s}</span></button>`).join('')}</div>`;
    V.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { const m = +b.dataset.m; state.settings.goal = m; state.settings.newPerDay = m >= 30 ? 10 : m >= 20 ? 6 : 5; save(); next(); });
  } else if (step === 4) {
    V.innerHTML = `<div class="onb">${DOTS(4)}<h2>בדיקת מיקרופון 🎤</h2><p class="sub">באפליקציה מדברים בקול. בוא נוודא שהמיקרופון שומע אותך.</p>
      <div class="meter"><i id="lvl"></i></div><div class="center sub" id="mst">לחץ ואמור משהו, למשל "Hello!"</div>
      <button class="btn big full" id="mic">🎤 בדוק מיקרופון</button>
      <div id="tips"></div>
      <button class="btn g full" id="n" style="margin-top:10px">המשך</button></div>`;
    $('#mic').onclick = () => micCheck();
    $('#n').onclick = () => { stopSpeaking(); done(); };
  }
}

async function micCheck() {
  const st = $('#mst'), lvl = $('#lvl'), tips = $('#tips'), btn = $('#mic');
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { tips.innerHTML = `<div class="tip">המיקרופון עובד רק כשהאתר נפתח בכתובת מאובטחת (https). פתח את האפליקציה מהכתובת שלה ב-Vercel או GitHub Pages.</div>`; return; }
  btn.disabled = true; st.textContent = '🎙️ דבר עכשיו… (4 שניות)';
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch (e) { btn.disabled = false; st.textContent = '❌ אין גישה למיקרופון';
    tips.innerHTML = `<div class="tip">${e.name === 'NotAllowedError' ? 'הדפדפן חסם את המיקרופון. לחץ על סמל המנעול ליד הכתובת ← הרשאות ← מיקרופון ← אפשר. ואז נסה שוב.' : 'לא נמצא מיקרופון. בדוק שהוא מחובר ושאף אפליקציה אחרת לא משתמשת בו.'}</div>`; return; }
  const ac = new (window.AudioContext || window.webkitAudioContext)(); const an = ac.createAnalyser(); an.fftSize = 1024;
  ac.createMediaStreamSource(stream).connect(an); const buf = new Float32Array(an.fftSize); let peak = 0; const t0 = performance.now();
  await new Promise(res => { const f = () => { an.getFloatTimeDomainData(buf); let s = 0; for (const x of buf) s += x * x; const rms = Math.sqrt(s / buf.length); peak = Math.max(peak, rms); lvl.style.width = Math.min(100, rms * 600) + '%'; if (performance.now() - t0 < 4000) requestAnimationFrame(f); else res(); }; f(); });
  stream.getTracks().forEach(t => t.stop()); ac.close?.(); lvl.style.width = '0%'; btn.disabled = false;
  if (peak < .015) { st.textContent = '🤔 כמעט לא שמעתי'; tips.innerHTML = `<div class="tip">דבר קרוב יותר לטלפון, או בדוק שהמיקרופון לא מושתק. אפשר לנסות שוב.</div>`; return; }
  st.textContent = '✅ המיקרופון שומע אותך!'; ctx.stage.celebrate();
  if (!SR && !azure.enabled()) tips.innerHTML = `<div class="tip">הדפדפן הזה לא תומך בזיהוי דיבור. מומלץ Chrome (אנדרואיד) או Safari (אייפון), או לחבר Azure בהגדרות.</div>`;
  else if (SR && !azure.enabled()) {
    tips.innerHTML = `<button class="btn b full" id="sr">עכשיו אמור באנגלית: "Hello, how are you?"</button><div class="res" id="srr"></div>`;
    $('#sr').onclick = async (e) => { try { const a = await listen(e.currentTarget); $('#srr').textContent = a[0] ? `✅ שמעתי: "${a[0]}"` : 'לא זוהה – נסה שוב, לאט וברור.'; } catch (err) { $('#srr').textContent = 'זיהוי הדיבור לא זמין: ' + err.message; } };
  }
}
