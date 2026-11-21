// סיפורים שנכתבים בשבילך: AI כותב טקסט שכמעט כולו מוכר לך + כמה מילים חדשות (i+1),
// על נושאים שמעניינים אותך, עם הקראה, סימון מילים ושאלות הבנה. נשמר כ"הכנה" (deck) ונקרא בקורא.
import { state, save, addXP } from './store.js';
import * as srs from './srs.js';
import * as tutor from './tutor.js';
import { icon } from './icons.js';
import { LEVELS } from '../data/placement.js';
import * as mine from './mine.js';
import * as vocab from './vocab.js';
import { frame } from './coach.js';

let ctx, V;
export const init = (c) => { ctx = c; V = c.view; };
const $ = (s, el = V) => el.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

const TOPICS = ['טכנולוגיה', 'ספורט', 'כסף והשקעות', 'טיולים', 'אוכל', 'מדע', 'פסיכולוגיה', 'היסטוריה', 'עסקים וסטארטאפים', 'מתח ופשע', 'קומדיה', 'מערכות יחסים', 'בריאות וכושר', 'סרטים וסדרות', 'מוזיקה', 'רכבים'];
const KINDS = [['story', 'סיפור'], ['news', 'כתבה'], ['dialog', 'שיחה בין אנשים'], ['podcast', 'מונולוג של פודקאסט']];
const LENS = [[180, 'קצר'], [350, 'בינוני'], [600, 'ארוך']];

export function newStory() {
  if (!tutor.enabled()) { ctx.toast('סיפורים אישיים דורשים מפתח Gemini (חינם) – בהגדרות'); return ctx.views.settings(); }
  const s = state.settings, sel = new Set(s.interests || []);
  let kind = s.storyKind || 'story', len = s.storyLen || 350;
  V.innerHTML = `<button class="back" data-go>${icon('chevron', 18, 'style="transform:scaleX(-1)"')} סדרות וטקסטים</button>
    <h2>סיפור בשבילך</h2><p class="sub">AI כותב טקסט ברמה שלך: כמעט כל המילים מוכרות לך, ועוד כמה חדשות שתבין מההקשר. זו הדרך הכי יעילה להגדיל אוצר מילים.</p>
    <div class="card"><b>מה מעניין אותך?</b><div class="chips" id="tp" style="margin-top:8px">${TOPICS.map(t => `<button class="${sel.has(t) ? 'on' : ''}" data-t="${t}">${t}</button>`).join('')}</div>
      <input id="own" class="srch" placeholder="או כתוב נושא משלך…" style="margin:8px 0 0"></div>
    <div class="card"><b>סוג</b><div class="chips" id="kd" style="margin-top:8px">${KINDS.map(([k, l]) => `<button class="${k === kind ? 'on' : ''}" data-k="${k}">${l}</button>`).join('')}</div>
      <b style="display:block;margin-top:12px">אורך</b><div class="chips" id="ln" style="margin-top:8px">${LENS.map(([n, l]) => `<button class="${n === len ? 'on' : ''}" data-n="${n}">${l}</button>`).join('')}</div></div>
    <button class="btn o big full" id="go">${icon('sparkle')} כתוב לי</button>`;
  $('[data-go]').onclick = () => ctx.go('mine');
  V.querySelectorAll('#tp button').forEach(b => b.onclick = () => { const t = b.dataset.t; sel.has(t) ? sel.delete(t) : sel.add(t); b.classList.toggle('on'); });
  V.querySelectorAll('#kd button').forEach(b => b.onclick = () => { kind = b.dataset.k; V.querySelectorAll('#kd button').forEach(x => x.classList.toggle('on', x === b)); });
  V.querySelectorAll('#ln button').forEach(b => b.onclick = () => { len = +b.dataset.n; V.querySelectorAll('#ln button').forEach(x => x.classList.toggle('on', x === b)); });
  $('#go').onclick = () => { s.interests = [...sel]; s.storyKind = kind; s.storyLen = len; save(); const own = $('#own').value.trim(); const pool = own ? [own] : sel.size ? [...sel] : TOPICS; write({ topic: pool[Math.random() * pool.length | 0], kind, len }); };
}

const SCHEMA = { type: 'object', additionalProperties: false, properties: {
  title: { type: 'string' }, text: { type: 'string', description: 'The text in English. Paragraphs separated by blank lines. For dialogs: "Name: line" per line.' },
  new_words: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { w: { type: 'string', description: 'base form' }, he: { type: 'string', description: 'Hebrew meaning as used in the text, 1-4 words' }, ipa: { type: 'string' } }, required: ['w', 'he', 'ipa'] } },
  questions: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { q_he: { type: 'string' }, options_he: { type: 'array', items: { type: 'string' } }, answer: { type: 'integer', description: 'index 0-3' } }, required: ['q_he', 'options_he', 'answer'] } }
}, required: ['title', 'text', 'new_words', 'questions'] };

async function targets() {
  // חיזוק: מילים בלמידה (עוד לא יציבות) · חדשות: הבאות ברשימת השכיחות
  const learning = Object.entries(state.cards).filter(([k, c]) => (k.startsWith('w:') || k.startsWith('r:')) && (c.ivl || 0) < 10).map(([k]) => k.slice(2)).slice(-40);
  const reinforce = learning.sort(() => Math.random() - .5).slice(0, 8);
  const fresh = (await vocab.nextCandidates(12)).map(x => x.w).slice(0, 6);
  return { reinforce, fresh };
}

async function write({ topic, kind, len }) {
  frame({ label: 'כותב בשבילך', ic: 'sparkle', onExit: () => ctx.go('mine'), body: `<div class="center" style="padding:40px 0"><div class="spin"></div><p class="sub" style="margin-top:14px">כותב ${KINDS.find(k => k[0] === kind)[1]} על "${esc(topic)}"…</p></div>` });
  const lvl = LEVELS[state.placement?.overall ?? 3], size = Math.max(1200, vocab.vocabSize());
  const { reinforce, fresh } = await targets();
  const kindTxt = { story: 'an engaging short story with a twist', news: 'a news-style article', dialog: 'a natural conversation between 2-3 people (Name: line format)', podcast: 'a casual podcast monologue, spoken style with fillers' }[kind];
  const user = `Write ${kindTxt} about: ${topic}. About ${len} words, modern American English, natural and genuinely interesting (not a textbook).
The reader is a Hebrew speaker at CEFR ${lvl} who knows roughly the ${size.toLocaleString('en')} most common English words.
- Keep at least 96% of the words within that range so it reads comfortably.
- Naturally include these NEW words so their meaning is clear from context: ${fresh.join(', ') || '(choose 5 useful new words slightly above the level)'}. You may add up to 3 more useful words or phrasal verbs/idioms slightly above the level.
${reinforce.length ? `- Also reuse some of these words the reader is learning: ${reinforce.join(', ')}.` : ''}
- new_words: every word you used that is likely new for this reader (base form) with Hebrew meaning as used.
- questions: 3 comprehension questions in Hebrew with 4 Hebrew options each, testing understanding of the text (one should hinge on a new word).`;
  let r;
  try { r = await tutor.ask('You are a skilled writer of graded readers for language learners. Output JSON only.', user, SCHEMA); }
  catch (e) { ctx.toast(tutor.errMsg(e)); return ctx.go('mine'); }
  if (!r?.text) { ctx.toast('לא הצלחתי לכתוב, נסה שוב'); return ctx.go('mine'); }
  // הוספה כ"הכנה" מסוג סיפור
  const A = await mine.analyze(r.text);
  const id = Date.now().toString(36);
  const words = [];
  const X = state.extra ||= {};
  (r.new_words || []).forEach(nw => {
    const w = String(nw.w || '').toLowerCase().trim(); if (!w || state.known?.[w]) return;
    const e = A.list.find(x => x.w === w || x.form === w) || A.list.find(x => x.w.startsWith(w.slice(0, Math.max(4, w.length - 2))));
    const word = mine.wordOf(w);
    if (!word) X[w] = { w, he: nw.he, ipa: (nw.ipa || '').replace(/^\/|\/$/g, ''), ex: e?.ex || '', form: e?.form || w, fr: e?.r === Infinity ? 99999 : e?.r || 99999, src: id };
    words.push(w);
  });
  const cx = Object.fromEntries(words.map(w => { const e = A.list.find(x => x.w === w); return [w, e ? { ex: e.ex.slice(0, 220), form: e.form } : {}]; }));
  (state.decks ||= {})[id] = { id, title: r.title || topic, type: 'story', t: Date.now(), words, cx, total: A.total, cov0: mine.coverage(A), stats: A.list.map(e => ({ w: e.w, n: e.n })), text: r.text, q: (r.questions || []).filter(q => q.options_he?.length >= 2).slice(0, 3) };
  save();
  mine.reader(id);
}

// שאלות הבנה אחרי הקריאה
export function quiz(id) {
  const d = state.decks[id], Q = d.q || []; let i = 0, ok = 0;
  const showQ = () => {
    if (i >= Q.length) return done();
    const q = Q[i];
    frame({ i, n: Q.length, label: 'הבנת הנקרא', ic: 'book', onExit: () => mine.reader(id), body: `<div class="lp-q" style="margin-bottom:12px">${esc(q.q_he)}</div>
      <div class="lp-opts">${q.options_he.map((o, k) => `<button class="lp-opt" data-k="${k}">${esc(o)}</button>`).join('')}</div>`, foot: '' });
    V.querySelectorAll('.lp-opt').forEach(b => b.onclick = () => {
      const k = +b.dataset.k, good = k === q.answer; if (good) ok++;
      V.querySelectorAll('.lp-opt').forEach(x => { x.disabled = true; if (+x.dataset.k === q.answer) x.classList.add('right'); else if (x === b) x.classList.add('wrong'); });
      setTimeout(() => { i++; showQ(); }, good ? 700 : 1600);
    });
  };
  const done = () => { d.qScore = `${ok}/${Q.length}`; addXP(ok * 3, 'review'); save(); ctx.refreshTop(); if (ok === Q.length) ctx.stage.celebrate(); mine.deck(id); ctx.toast(`הבנת ${ok} מתוך ${Q.length}`); };
  showQ();
}
