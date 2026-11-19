import { Stage, ANIMALS } from './stage.js';
import { state, save, levelProgress, rollDay } from './store.js';
import { onSpeech, say, listVoices } from './speech.js';
import * as views from './views.js';
import * as rhythm from './rhythm.js';
import * as placement from './placement.js';
import * as pages from './pages.js';

const $ = (s) => document.querySelector(s);
rollDay();
if (!ANIMALS[state.animal]) { state.animal = 'fox'; save(); } // מעבר מהחיות הישנות
const stage = new Stage($('#c')); window.__stage = stage;

const bubble = (t) => { $('#bubble').textContent = t; };
let toastT;
const toast = (t) => { const e = $('#toast'); e.textContent = t; e.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => e.hidden = true, 1600); };
const refreshTop = () => { const lp = levelProgress(); $('#lv').textContent = lp.L; $('#xpbar').style.width = Math.round(lp.pct * 100) + '%'; $('#streak').textContent = state.streak; };

onSpeech({
  bubble, voices: () => {},
  speaking: (v) => { stage.speaking = v; },
  pulse: () => { stage.pulse = 1; },
  defaultPitch: () => ANIMALS[state.animal]?.pitch ?? 1,
  animalVoice: () => ANIMALS[state.animal]?.voice,
  azureFail: (e) => toast(e.message === 'azure-auth' ? 'מפתח Azure לא תקין – חוזר לקול הדפדפן' : 'Azure לא זמין כרגע – קול הדפדפן')
});
stage.onTap = () => say(['Hello!', 'Hi there!', "Let's practice!", 'You can do it!', 'Great job!'][Math.random() * 5 | 0], { show: true });

async function setAnimal(k, greet) {
  state.animal = k; save(); $('#friendName').textContent = ANIMALS[k].name;
  await stage.setAnimal(k);
  if (greet) { if (curTab === 'today') views.today(); say(`Hi! I'm ${ANIMALS[k].name}. Let's learn English together!`, { show: true }); }
}

const tabs = { today: views.today, practice: pages.practice, me: pages.me, sounds: () => views.sounds('map'), words: () => views.words(), rhythm: rhythm.menu, talk: views.talk };
const NAV = { today: 'today', me: 'me' }; // כל השאר שייך ללשונית 'תרגול'
let hub = 'today';
let curTab = 'today';
function go(tab) {
  curTab = tab;
  if (tab === 'today' || tab === 'practice' || tab === 'me') hub = tab;
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === (NAV[tab] || 'practice')));
  views.clearFlow(); stopSpeakingSafe(); $('#view').scrollTop = 0; tabs[tab]();
}
const stopSpeakingSafe = () => { try { speechSynthesis.cancel(); } catch {} stage.speaking = false; };
document.querySelectorAll('#nav button').forEach(b => b.onclick = () => go(b.dataset.tab));
$('#btnSettings').onclick = () => go('me');
$('#view').addEventListener('click', (e) => { if (e.target.closest('[data-back]')) go('practice'); });
$('#btnFriend').onclick = () => views.friends();
document.querySelector('[data-close]').onclick = views.closeSheet;

const C = { stage, view: $('#view'), bubble, toast, refreshTop, go, setAnimal, R: rhythm, back: () => go(hub) };
C.placement = placement; C.pages = pages;
views.init(C); rhythm.init(C); placement.init(C); pages.init(C);
refreshTop();
await setAnimal(state.animal, false);
go('today');
bubble('Hi! Ready to speak like a native? 🌟');

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
