import { Stage, ANIMALS } from './stage.js';
import { state, save, levelProgress, rollDay } from './store.js';
import { onSpeech, say, listVoices } from './speech.js';
import * as views from './views.js';
import * as rhythm from './rhythm.js';

const $ = (s) => document.querySelector(s);
rollDay();
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
stage.onTap = () => say(['Hello!', 'Hi there!', "Let's practice!", 'You can do it!', 'Great job!'][Math.random() * 5 | 0]);

async function setAnimal(k, greet) {
  state.animal = k; save(); $('#friendName').textContent = ANIMALS[k].name;
  await stage.setAnimal(k);
  if (greet) say(`Hi! I'm ${ANIMALS[k].name}. Let's learn English together!`);
}

const tabs = { today: views.today, sounds: () => views.sounds('map'), words: () => views.words(), rhythm: rhythm.menu, talk: views.talk };
function go(tab) {
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  stopSpeakingSafe(); $('#view').scrollTop = 0; tabs[tab]();
}
const stopSpeakingSafe = () => { try { speechSynthesis.cancel(); } catch {} stage.speaking = false; };
document.querySelectorAll('#nav button').forEach(b => b.onclick = () => go(b.dataset.tab));
$('#btnSettings').onclick = () => views.settings();
$('#btnFriend').onclick = () => views.friends();
document.querySelector('[data-close]').onclick = views.closeSheet;

const C = { stage, view: $('#view'), bubble, toast, refreshTop, go, setAnimal, R: rhythm };
views.init(C); rhythm.init(C);
refreshTop();
await setAnimal(state.animal, false);
go('today');
bubble('Hi! Ready to speak like a native? 🌟');

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
