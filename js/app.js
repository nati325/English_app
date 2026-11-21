import { Stage, ANIMALS } from './stage.js';
import { state, save, levelProgress, rollDay } from './store.js';
import { onSpeech, say } from './speech.js';
import { icon, iconFill } from './icons.js';
import * as views from './views.js';
import * as rhythm from './rhythm.js';
import * as placement from './placement.js';
import * as pages from './pages.js';
import * as learn from './learn.js';
import * as teacher from './teacher.js';
import * as coach from './coach.js';
import * as mine from './mine.js';
import * as vocab from './vocab.js';
import * as stories from './stories.js';
import { LEVELS } from '../data/placement.js';

const $ = (s) => document.querySelector(s);
rollDay();
if (!ANIMALS[state.animal]) { state.animal = 'fox'; save(); } // מעבר מהחיות הישנות

// ---------- מראה ונגישות ----------
export function applyLook() {
  const s = state.settings, r = document.documentElement;
  const theme = s.theme || 'dark';
  r.dataset.theme = theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
  r.dataset.size = s.bigText ? 'large' : 'normal';
  r.dataset.motion = s.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduce' : 'full';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', r.dataset.theme === 'dark' ? '#12141C' : '#FFF8F1');
}
applyLook();
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyLook);

const stage = new Stage(); window.__stage = stage;
const V = $('#view');
const bubble = (t) => { const b = V.querySelector('.cbub'); if (b) b.textContent = t; };
let toastT;
const toast = (t) => { const e = $('#toast'); e.textContent = t; e.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => e.hidden = true, 1800); };

const refreshTop = () => {
  const P = state.placement, lp = levelProgress();
  $('#top').innerHTML = `<button class="lvchip" id="lvchip" aria-label="הרמה שלי">${P ? `רמה <span dir="ltr">${LEVELS[P.overall]}</span>` : `${icon('target', 18)} מה הרמה שלי?`}</button>
    <div class="stats-r"><span class="st-i fl" aria-label="${state.streak} ימים ברצף">${iconFill('flame', 22, '#F76707')}<span>${state.streak}</span></span>
    <span class="st-i xp" aria-label="${state.xp} נקודות">${iconFill('star', 22, '#FAB005')}<span>${state.xp}</span></span></div>`;
  $('#lvchip').onclick = () => P ? placement.showResult(P) : placement.start();
};
const NAVS = [['today', 'home', 'היום'], ['practice', 'target', 'תרגול'], ['me', 'user', 'אני']];
$('#nav').innerHTML = NAVS.map(([t, ic, l]) => `<button data-tab="${t}">${icon(ic, 26)}<span>${l}</span></button>`).join('');

onSpeech({
  bubble, voices: () => {},
  speaking: (v) => { stage.speaking = v; },
  pulse: () => { stage.pulse = 1; },
  defaultPitch: () => teacher.wanted() ? teacher.info().pitch : (ANIMALS[state.animal]?.pitch ?? 1),
  lip: (m) => { if (!teacher.isReady()) return; m.visemes?.length ? teacher.lipVisemes(m) : teacher.lipText(m.text, m.rate || 1); },
  lipStop: () => teacher.stopTalk(),
  animalVoice: () => teacher.wanted() ? teacher.info().voice : ANIMALS[state.animal]?.voice,
  azureFail: (e) => toast(e.message === 'azure-auth' ? 'מפתח Azure לא תקין – חוזר לקול הדפדפן' : 'Azure לא זמין כרגע – קול הדפדפן')
});
stage.onTap = () => say(['Hello!', 'Hi there!', "Let's practice!", 'You can do it!', 'Great job!'][Math.random() * 5 | 0], { show: true });

async function setAnimal(k, greet) {
  state.animal = k; save();
  await stage.setAnimal(k);
  if (greet) { if (curTab === 'today') learn.home(); if (curTab === 'me') pages.me(); say(`Hi! I'm ${ANIMALS[k].name}. Let's learn English together!`, { show: true }); }
}

const tabs = { today: learn.home, practice: pages.practice, me: pages.me, sounds: () => views.sounds('map'), words: () => views.words(), rhythm: rhythm.menu, talk: views.talk, voice: coach.voice, notebook: coach.notebook, mine: mine.library, fast: vocab.fast };
const NAV = { today: 'today', me: 'me' };
let hub = 'today', curTab = 'today';
function go(tab) {
  curTab = tab;
  if (tab === 'today' || tab === 'practice' || tab === 'me') hub = tab;
  document.querySelectorAll('#nav button').forEach(b => { const on = b.dataset.tab === (NAV[tab] || 'practice'); b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); });
  views.clearFlow(); stopSpeakingSafe(); V.scrollTop = 0; tabs[tab](); refreshTop();
}
const stopSpeakingSafe = () => { try { speechSynthesis.cancel(); } catch {} stage.speaking = false; };
document.querySelectorAll('#nav button').forEach(b => b.onclick = () => go(b.dataset.tab));
V.addEventListener('click', (e) => { if (e.target.closest('[data-back]')) go('practice'); });
document.querySelector('[data-close]').onclick = views.closeSheet;

// תגובות הדמות: גם החיה וגם המורה
const oc = stage.celebrate.bind(stage), os = stage.sad.bind(stage);
stage.celebrate = () => { oc(); teacher.react(true); }; stage.sad = () => { os(); teacher.react(false); };

// הדמות נכנסת אוטומטית ל"חריץ" שבמסך: המורה התלת־ממדית (אם פעילה), ובינתיים/כגיבוי – החיה
function placeChar() {
  const slot = V.querySelector('.cslot');
  document.body.classList.toggle('t3d', teacher.wanted());
  if (!slot) { teacher.park(); return; }
  if (teacher.wanted()) {
    if (teacher.isReady()) { stage.root.remove(); teacher.mount(slot, slot.dataset.view || 'upper'); return; }
    stage.mount(slot); slot.classList.add('loading');
    teacher.ensure().then(() => { const s2 = V.querySelector('.cslot'); if (s2) { stage.root.remove(); s2.classList.remove('loading'); teacher.mount(s2, s2.dataset.view || 'upper'); } })
      .catch(() => { document.body.classList.remove('t3d'); slot.classList.remove('loading'); stage.mount(V.querySelector('.cslot')); });
  } else { teacher.park(); stage.mount(slot); }
}
new MutationObserver(() => {
  placeChar();
  document.body.classList.toggle('focus', !!V.querySelector('.lp,.ptest:not(.flowfin),.onb'));
}).observe(V, { childList: true, subtree: false });

const C = { stage, view: V, bubble, toast, refreshTop, go, setAnimal, R: rhythm, back: () => go(hub), applyLook, teacher, placeChar };
C.placement = placement; C.pages = pages; C.learn = learn; C.coach = coach; C.mine = mine; C.vocab = vocab; C.stories = stories; C.views = views;
views.init(C); rhythm.init(C); placement.init(C); pages.init(C); learn.init(C); coach.init(C); mine.init(C); vocab.init(C); stories.init(C);
await stage.setAnimal(state.animal);
const sp = new URLSearchParams(location.search);
if (sp.get('text') || sp.get('title')) { const tx = [sp.get('text'), sp.get('url')].filter(Boolean).join('\n'); history.replaceState(null, '', location.pathname); go('practice'); mine.pasteScreen(tx, sp.get('title') || ''); }
else go('today');

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
