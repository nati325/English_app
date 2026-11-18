// שלב D: הטעמת מילים, הטעמת משפט, חיבורים/אינטונציה, Shadowing עם ניתוח הקלטה
import { state, save, addXP } from './store.js';
import { say, listen, compare, measure, listenStart, stopSpeaking } from './speech.js';
import { startRecording, canRecord, countSyllables } from './rec.js';
import { ALL, hl, pick, shuffle, trySpeak } from './views.js';
import { FUNCTION_WORDS, LESSONS } from '../data/rhythm.js';

let ctx, V;
export const init = (c) => { ctx = c; V = c.view; };
const $ = (s, el = V) => el.querySelector(s);
const on = (s, fn, el = V) => el.querySelectorAll(s).forEach(b => b.onclick = () => fn(b));
const words = (t) => t.replace(/[^A-Za-z' ]/g, '').split(' ').filter(Boolean);
const isStressed = (w) => !FUNCTION_WORDS.has(w.toLowerCase().replace(/'.*/, '') ) || /n't$/i.test(w) || w.toLowerCase() === 'not' || w.toLowerCase() === 'no';
const goodSentences = () => ALL.map(w => w.ex).filter(e => { const n = words(e).length; return n >= 4 && n <= 9; });

// ---------- תפריט ----------
export function menu() {
  const d = state.daily;
  V.innerHTML = `<h2>מקצב ואינטונציה 🥁</h2>
    <p class="sub">70% מה"אקסנט" הוא מקצב, הטעמה וחיבורים – לא צלילים בודדים. אנגלית היא stress-timed: ההברות המוטעמות מגיעות בקצב קבוע, והשאר "נמעכות" ביניהן.</p>
    ${[
      ['🥁', 'הטעמת מילים', 'איזו הברה מוטעמת? (water, banana, photograph…)', 'words', d.rhythm],
      ['🎵', 'הטעמת משפט', 'סמן את מילות התוכן – ושמע את הקצב', 'sent', d.rhythm],
      ['🔁', 'Shadowing', 'שמע, הקלט, וקבל ניתוח: קצב, הפסקות ודיוק', 'shadow', d.shadow],
      ['🔗', 'חיבורים בין מילים', 'turn it on → "tur-ni-ton"', 'link'],
      ['🇺🇸', 'T אמריקאית (flap)', 'water → "wadder"', 'flap'],
      ['⚡', 'צורות מקוצרות', 'gonna · wanna · lemme · dunno', 'red'],
      ['🌫️', 'צורות חלשות (schwa)', 'to · for · and · of · can', 'weak'],
      ['📈', 'אינטונציה', 'מתי עולים ומתי יורדים', 'intonation']
    ].map(([ic, t, s, k, n]) => `<button class="task" data-k="${k}"><div class="ic">${ic}</div><div class="t"><b>${t}</b><small>${s}</small></div><div class="st">${n ? '✅' : '‹'}</div></button>`).join('')}`;
  on('.task', b => { const f = { words: stressWords, sent: stressSentence, shadow }[b.dataset.k]; f ? f() : lesson(b.dataset.k); });
}

// ---------- שיעורי חיבורים וכו' ----------
function lesson(kind) {
  const L = LESSONS[kind]; const speakable = (it) => kind === 'intonation' ? it[2] : kind === 'weak' ? it[2].split('→')[0].trim() : it[0];
  V.innerHTML = `<button class="back" id="bk">→ חזרה</button><h2>${L.icon} ${L.title}</h2><div class="card">${L.tip}</div>
    <div class="wlist">${L.items.map((it, i) => `<div class="wr"><button class="round" data-s="${i}">🔊</button><div class="l"><b>${it[0]}</b><div>${kind === 'weak' ? it[1] : '→ ' + it[1]}</div></div><div class="r" style="max-width:36%;text-align:end">${it[2]}</div></div>`).join('')}</div>
    <div class="res" id="res"></div>
    <div class="row"><button class="btn b" id="slow">🐢 שמע לאט</button>${kind === 'link' || kind === 'flap' || kind === 'intonation' ? '<button class="btn o" id="mic">🎤 תרגל</button>' : ''}</div>
    <p class="sub center" style="margin-top:12px">נסה לחקות את הקצב, לא את המילים.</p>`;
  $('#bk').onclick = menu; let cur = 0;
  on('[data-s]', b => { cur = +b.dataset.s; say(speakable(L.items[cur]), { rate: 1 }); });
  $('#slow').onclick = () => say(speakable(L.items[cur]), { rate: .55 });
  const m = $('#mic'); if (m) m.onclick = () => trySpeak(m, speakable(L.items[cur]).replace(/[↗↘]/g, ''), $('#res'), { kind: 'rhythm', xp: 2 });
  addXP(1, 'rhythm'); ctx.refreshTop();
}

// ---------- הטעמת מילים ----------
function stressWords() {
  const pool = shuffle(ALL.filter(w => w.syl >= 2 && w.syl <= 4)).slice(0, 8); let i = 0, ok = 0;
  const ask = () => {
    const w = pool[i]; const sy = w.ipa.split(/(?=[ˈˌ])|\./).filter(Boolean);
    V.innerHTML = `<button class="back" id="bk">→ יציאה</button><div class="dots">${pool.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>
      <p class="sub center">איזו הברה מוטעמת?</p><div class="word center">${w.w}</div><div class="he center">${w.he}</div>
      <div class="row c" style="margin:14px 0">${sy.map((s, k) => `<button class="choice" data-k="${k}" style="width:auto;flex:1;min-width:64px;font-size:1.3rem">${s.replace(/[ˈˌ]/g, '')}</button>`).join('')}</div>
      <div class="row c"><button class="btn g" id="hear" style="flex:0 0 auto">🔊 שמע</button></div><div id="fb"></div>`;
    $('#bk').onclick = menu; $('#hear').onclick = () => say(w.w, { show: false });
    on('.choice', b => {
      const good = +b.dataset.k === w.st - 1; if (good) ok++;
      V.querySelectorAll('.choice').forEach((c, k) => { c.disabled = true; if (k === w.st - 1) c.classList.add('ok'); else if (c === b) c.classList.add('no'); });
      addXP(good ? 2 : 0, 'rhythm'); if (!good) { state.daily.rhythm++; save(); } ctx.refreshTop(); good ? ctx.stage.celebrate() : ctx.stage.sad();
      const pat = sy.map((_, k) => k === w.st - 1 ? '●' : '○').join(' ');
      $('#fb').innerHTML = `<div class="tip center">${good ? '✅ נכון!' : '❌ ההטעמה היא על'} <span class="ltr"><b>${pat}</b></span><br>רק ההברה המוטעמת ארוכה, חזקה וגבוהה. השאר נחלשות (ə).</div><div class="row c"><button class="btn o" data-mic="${w.w}">🎤 אמור</button></div><div class="res" id="res"></div><button class="btn full" id="nx">${i < pool.length - 1 ? 'הבא ←' : 'סיום'}</button>`;
      say(w.w, { show: false }); $('[data-mic]', V).onclick = (e) => trySpeak(e.currentTarget, w.w, $('#res'), { kind: 'rhythm', xp: 2 });
      $('#nx').onclick = () => { if (++i < pool.length) ask(); else { ctx.stage.celebrate(); V.innerHTML = `<div class="center"><div style="font-size:3rem">🥁</div><h2>${ok}/${pool.length} נכון</h2><p class="sub">טיפ לדוברי עברית: בעברית ההטעמה נוטה להיות על הברה אחרונה (מלרע). באנגלית – לרוב על הראשונה או השנייה.</p><button class="btn o full" id="h">חזרה לתפריט</button></div>`; $('#h').onclick = menu; } };
    });
  };
  ask();
}

// ---------- הטעמת משפט ----------
function stressSentence() {
  const q = shuffle(goodSentences()).slice(0, 5); let i = 0;
  const ask = () => {
    const s = q[i], ws = words(s);
    V.innerHTML = `<button class="back" id="bk">→ יציאה</button><div class="dots">${q.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>
      <p class="sub center">לחץ על המילים שמוטעמות (מילות תוכן: שמות, פעלים, תארים…)</p>
      <div class="row c ltr" id="ws" style="gap:6px;margin:12px 0">${ws.map((w, k) => `<button class="choice" data-k="${k}" style="width:auto;min-height:48px;padding:0 14px;font-size:1.2rem;margin:0">${w}</button>`).join('')}</div>
      <div class="row c"><button class="btn g" id="hear" style="flex:0 0 auto">🔊 שמע</button><button class="btn" id="chk" style="flex:0 0 auto">בדוק</button></div><div id="fb"></div>`;
    $('#bk').onclick = menu; $('#hear').onclick = () => say(s, { rate: 1, show: false }); say(s, { rate: 1, show: false });
    const sel = new Set(); on('#ws .choice', b => { const k = +b.dataset.k; sel.has(k) ? sel.delete(k) : sel.add(k); b.style.background = sel.has(k) ? '#ffe0cf' : ''; b.style.borderColor = sel.has(k) ? 'var(--acc)' : ''; });
    $('#chk').onclick = () => {
      const exp = new Set(ws.map((w, k) => isStressed(w) ? k : -1).filter(k => k >= 0)); let hit = 0, wrong = 0;
      ws.forEach((_, k) => { if (exp.has(k) && sel.has(k)) hit++; else if (sel.has(k) !== exp.has(k)) wrong++; });
      const sc = Math.max(0, (hit - wrong * .5) / exp.size);
      V.querySelectorAll('#ws .choice').forEach((b, k) => { b.disabled = true; if (exp.has(k)) b.classList.add('ok'); else if (sel.has(k)) b.classList.add('no'); b.style.fontWeight = exp.has(k) ? 900 : 400; b.style.opacity = exp.has(k) ? 1 : .65; });
      addXP(sc >= .8 ? 3 : 1, 'rhythm'); ctx.refreshTop(); sc >= .8 ? ctx.stage.celebrate() : ctx.stage.sad();
      $('#chk').remove();
      $('#fb').innerHTML = `<div class="tip center ltr" style="direction:ltr">${ws.map((w, k) => exp.has(k) ? `<b style="font-size:1.25em">${w.toUpperCase()}</b>` : w.toLowerCase()).join(' ')}</div>
        <p class="sub center">מילות התוכן בולטות, וכל השאר "נמעכות". אמור את המשפט כך:</p>
        <div class="row c"><button class="btn o" data-mic="${s}">🎤 אמור עם הקצב</button></div><div class="res" id="res"></div><button class="btn full" id="nx">${i < q.length - 1 ? 'הבא ←' : 'סיום'}</button>`;
      $('[data-mic]', V).onclick = (e) => trySpeak(e.currentTarget, s, $('#res'), { kind: 'rhythm', xp: 2 });
      $('#nx').onclick = () => { if (++i < q.length) ask(); else menu(); };
    };
  };
  ask();
}

// ---------- Shadowing ----------
function shadow() {
  const learned = ALL.filter(w => state.cards['w:' + w.w]).map(w => w.ex).filter(e => { const n = words(e).length; return n >= 4 && n <= 9; });
  const q = shuffle(learned.length >= 5 ? learned : goodSentences()).slice(0, 4); let i = 0;
  const card = () => {
    const s = q[i], ws = words(s);
    V.innerHTML = `<button class="back" id="bk">→ יציאה</button><div class="dots">${q.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>
      <p class="sub center">1) שמע פעמיים · 2) הקלט את עצמך באותו קצב ובאותה מנגינה · 3) קבל ניתוח</p>
      <div class="ex center" style="font-size:1.35rem;line-height:1.7">${ws.map(w => isStressed(w) ? `<b style="color:var(--ink);font-size:1.15em">${w}</b>` : `<span class="mut">${w}</span>`).join(' ')}</div>
      <div class="row"><button class="btn b" id="n">🔊 רגיל</button><button class="btn g" id="sl">🐢 לאט</button></div>
      <div class="row" style="margin-top:8px"><button class="btn o" id="rec">🎙️ הקלט</button></div>
      <div id="fb"></div><button class="btn g full" id="nx" style="margin-top:12px">${i < q.length - 1 ? 'הבא ←' : 'סיום'}</button>`;
    $('#bk').onclick = menu; $('#n').onclick = () => say(s, { rate: 1, show: false }); $('#sl').onclick = () => say(s, { rate: .6, show: false });
    say(s, { rate: 1, show: false });
    $('#nx').onclick = () => { if (++i < q.length) card(); else menu(); };
    let session = null;
    $('#rec').onclick = async (e) => {
      const btn = e.currentTarget;
      if (session) { // עצירה וניתוח
        btn.disabled = true; btn.textContent = '⏳ מנתח…'; const { r, st } = session; session = null;
        const [rec, alts] = await Promise.all([r.stop(), st ? st.stop() : Promise.resolve([])]);
        btn.disabled = false; btn.classList.remove('rec'); btn.textContent = '🎙️ הקלט שוב';
        report(s, rec, alts); return;
      }
      stopSpeaking();
      try {
        const r = await (canRecord ? startRecording() : Promise.reject(new Error('norec')));
        const st = listenStart(); session = { r, st }; btn.classList.add('rec'); btn.textContent = '⏹ עצור';
      } catch (err) {
        $('#fb').innerHTML = `<div class="tip">${err.message === 'norec' ? 'הדפדפן לא תומך בהקלטה.' : err.name === 'NotAllowedError' ? 'צריך לאשר גישה למיקרופון.' : 'לא ניתן להקליט: ' + err.message}</div>`;
      }
    };
  };
  const report = async (s, rec, alts) => {
    const fb = $('#fb'); const a = rec.analysis; const syl = countSyllables(s);
    const acc = alts?.length ? compare(s, alts) : null;
    const ref = await measure(s, 1); const refRate = ref ? syl / ref : 4.5;
    let paceScore = 0, pauseScore = 0, rate = 0, ratio = 0;
    if (a?.ok) {
      rate = syl / Math.max(.5, a.span); ratio = rate / refRate;
      paceScore = ratio < .85 ? ratio / .85 : ratio > 1.3 ? 1.3 / ratio : 1; pauseScore = Math.max(0, 1 - a.pauses * .34);
    }
    const accScore = acc ? acc.score : .6; // ללא זיהוי – ניטרלי
    const total = a?.ok ? accScore * .5 + paceScore * .3 + pauseScore * .2 : accScore;
    const pct = (x) => Math.round(x * 100), bar = (v, c = 'var(--acc2)') => `<div class="prog"><i style="width:${pct(v)}%;background:${c}"></i></div>`;
    const tips = [];
    if (a?.ok) { if (ratio < .8) tips.push('איטי מדי – נסה לחבר מילים ולהמעיך מילות פונקציה (to, of, and).'); else if (ratio > 1.4) tips.push('מהר מדי – האט מעט והדגש את מילות התוכן.'); else tips.push('קצב טוב! 👏'); if (a.pauses >= 2) tips.push(`היו ${a.pauses} הפסקות באמצע – בדוק חיבורים (linking) ונסה ברצף אחד.`); }
    if (acc && acc.score < 1) tips.push('חלק מהמילים לא זוהו – שמע שוב והתמקד בהטעמה.');
    fb.innerHTML = `<div class="card" style="margin-top:12px"><div class="row" style="justify-content:space-between"><b>ציון Shadowing</b><span class="pill ${total >= .8 ? 'ok' : total < .55 ? 'hot' : ''}">${pct(total)}%</span></div>
      ${bar(total)}
      <p style="margin:10px 0 2px"><b>דיוק מילים</b> ${acc ? pct(acc.score) + '%' : '(אין זיהוי דיבור במכשיר)'}</p>${acc ? bar(acc.score) : ''}
      ${a?.ok ? `<p style="margin:10px 0 2px"><b>קצב</b> ${rate.toFixed(1)} הברות/שנייה · ייחוס ${refRate.toFixed(1)}</p>${bar(paceScore)}<p style="margin:10px 0 2px"><b>רציפות</b> ${a.pauses} הפסקות</p>${bar(pauseScore)}` : '<p class="mut">לא זוהה קול בהקלטה – התקרב למיקרופון.</p>'}
      ${tips.map(t => `<div class="tip">${t}</div>`).join('')}
      <div class="row" style="margin-top:8px"><button class="btn g" id="me">▶ ההקלטה שלי</button><button class="btn b" id="mod">🔊 המקור</button></div></div>`;
    const au = new Audio(rec.url); $('#me').onclick = () => { stopSpeaking(); au.currentTime = 0; au.play(); }; $('#mod').onclick = () => say(s, { rate: 1, show: false });
    const xp = Math.round(total * 8) + 1; addXP(xp, 'shadow'); ctx.refreshTop(); ctx.toast(`+${xp} XP`); total >= .75 ? ctx.stage.celebrate() : ctx.stage.sad();
  };
  card();
}
