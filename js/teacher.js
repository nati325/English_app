// המורה: דמות אנושית תלת־ממדית (TalkingHead, MIT + אווטאר CC0) עם סנכרון שפתיים, הבעות, מבט ומחוות.
// נטענת בעצלות; אם אין WebGL או שהטעינה נכשלת – האפליקציה חוזרת לחבר-החיה.
import { state } from './store.js';

let head = null, box = null, loading = null, failed = false, mounted = false;
const webgl = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })();
export const wanted = () => state.settings.teacher !== 'animal' && webgl && !failed;
export const isReady = () => !!head && !failed;

export function ensure() {
  if (loading) return loading;
  box = document.createElement('div'); box.className = 'teacher'; box.setAttribute('role', 'img'); box.setAttribute('aria-label', 'המורה שלך');
  loading = (async () => {
    const { TalkingHead } = await import('../vendor/talkinghead/talkinghead.mjs');
    head = new TalkingHead(box, {
      ttsEndpoint: null, lipsyncModules: ['en'], lipsyncLang: 'en', cameraView: 'upper', cameraRotateEnable: false, cameraZoomEnable: false, cameraPanEnable: false,
      modelFPS: 30, modelPixelRatio: Math.min(devicePixelRatio || 1, 2), lightAmbientIntensity: 2.2, lightDirectIntensity: 28, avatarMood: 'happy'
    });
    await head.showAvatar({ url: 'assets/teacher/teacher.glb', body: 'F', avatarMood: 'happy', lipsyncLang: 'en' });
    const wake = () => head?.audioCtx?.state === 'suspended' && head.audioCtx.resume();
    addEventListener('pointerdown', wake, { passive: true });
  })().catch(e => { failed = true; head = null; console.warn('teacher failed', e); throw e; });
  return loading;
}

export function mount(slot, view = 'upper') {
  if (!head || !slot) return false;
  if (box.parentNode !== slot) { slot.appendChild(box); head.setView(view, { cameraDistance: view === 'head' ? .1 : 0 }); }
  if (!mounted) { head.start(); mounted = true; }
  return true;
}
export function park() { if (head && mounted) { head.stop(); mounted = false; } }

// ---------- סנכרון שפתיים ----------
function silent(sec) { const ac = head.audioCtx; return ac.createBuffer(1, Math.max(1, Math.ceil(sec * ac.sampleRate)), ac.sampleRate); }
const syl = (w) => Math.max(1, (w.toLowerCase().replace(/[^a-z]/g, '').replace(/e$/, '').match(/[aeiouy]+/g) || []).length);

// קול הדפדפן: אין תזמונים אמיתיים – מעריכים לפי הברות ומהירות
export function lipText(text, rate = 1) {
  if (!head || !mounted) return;
  const words = text.split(/\s+/).filter(Boolean); if (!words.length) return;
  const unit = 190 / Math.max(.5, rate); let t = 80; const wtimes = [], wdurations = [];
  words.forEach(w => { const d = syl(w) * unit + 40; wtimes.push(t); wdurations.push(d); t += d + (/[.,!?]$/.test(w) ? 180 : 50); });
  try { head.stopSpeaking(); head.speakAudio({ audio: silent(t / 1000 + .3), words, wtimes, wdurations }, { lipsyncLang: 'en' }); } catch {}
}

// Azure: מזהי viseme אמיתיים ותזמוני מילים
const AZ = ['sil', 'aa', 'aa', 'O', 'E', 'E', 'I', 'U', 'O', 'aa', 'O', 'I', 'kk', 'RR', 'nn', 'SS', 'CH', 'TH', 'FF', 'DD', 'kk', 'PP'];
export function lipVisemes({ visemes = [], words = [], dur = 0 }) {
  if (!head || !mounted || !visemes.length) return;
  const vs = [], vt = [], vd = [];
  visemes.forEach((v, i) => { const next = visemes[i + 1]?.t ?? v.t + 120; vs.push(AZ[v.id] || 'sil'); vt.push(v.t); vd.push(Math.max(40, next - v.t)); });
  try {
    head.stopSpeaking();
    head.speakAudio({ audio: silent(Math.max(dur, (vt.at(-1) || 0) / 1000 + .4)), visemes: vs, vtimes: vt, vdurations: vd,
      words: words.map(w => w.text), wtimes: words.map(w => w.t), wdurations: words.map(w => w.d) }, { lipsyncLang: 'en' });
  } catch {}
}
export function stopTalk() { try { head?.stopSpeaking(); } catch {} }

// ---------- תגובות ----------
export function react(good) {
  if (!head || !mounted) return;
  try {
    if (good) { head.setMood('happy'); head.playGesture(Math.random() < .5 ? 'thumbup' : 'ok', 1.6); }
    else { head.setMood('neutral'); head.playGesture('index', 1.4); setTimeout(() => head?.setMood('happy'), 1800); }
    head.lookAtCamera(1500);
  } catch {}
}
