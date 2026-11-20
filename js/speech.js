import { state, save } from './store.js';
import * as az from './azure.js';

export const hasTTS = 'speechSynthesis' in window;
export const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let voices = []; let hooks = {};
export const onSpeech = (h) => { hooks = h; };

const score = (v) => (/natural|neural|online/i.test(v.name) ? 100 : 0) + (/google|samantha|aaron|nicky|allison|ava|zoe|daniel|karen|serena/i.test(v.name) ? 30 : 0) + (v.localService ? 0 : 10);
export function listVoices() {
  voices = hasTTS ? speechSynthesis.getVoices().filter(v => /^en[-_]/i.test(v.lang)) : [];
  voices.sort((a, b) => score(b) - score(a));
  return voices;
}
if (hasTTS) { speechSynthesis.onvoiceschanged = () => hooks.voices?.(listVoices()); listVoices(); }
const chosen = () => { const s = state.settings; return voices.find(v => v.voiceURI === s.voice) || voices.find(v => v.lang.replace('_','-') === s.accent) || voices[0]; };

export function say(text, { rate, pitch, show = false } = {}) { // הבועה מציגה רק תגובות, לא את התוכן
  if (show) hooks.bubble?.(text);
  if (az.ttsEnabled()) { // קול עצבי של Azure; נפילה לקול הדפדפן אם נכשל
    return az.speak(text, { voice: az.voiceFor(hooks.animalVoice?.()), rate: rate ?? Math.min(1.3, Math.max(.6, state.settings.rate + .1)),
      onStart: (meta, dur) => { hooks.speaking?.(true); hooks.lip?.({ text, ...meta, dur }); }, onPulse: () => hooks.pulse?.(), onEnd: () => { hooks.speaking?.(false); hooks.lipStop?.(); } })
      .catch(e => { hooks.speaking?.(false); hooks.azureFail?.(e); return browserSay(text, { rate, pitch }); });
  }
  return browserSay(text, { rate, pitch });
}
function browserSay(text, { rate, pitch } = {}) {
  return new Promise(res => {
    if (!hasTTS) return res();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); const v = chosen();
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = state.settings.accent;
    u.rate = rate ?? state.settings.rate; u.pitch = pitch ?? (state.settings.pitch || hooks.defaultPitch?.() || 1);
    u.onstart = () => { hooks.speaking?.(true); hooks.lip?.({ text, rate: u.rate }); };
    u.onboundary = () => hooks.pulse?.();
    const end = () => { hooks.speaking?.(false); hooks.lipStop?.(); res(); };
    u.onend = end; u.onerror = end;
    speechSynthesis.speak(u);
  });
}
export const stopSpeaking = () => { az.stop(); if (hasTTS) speechSynthesis.cancel(); hooks.speaking?.(false); hooks.lipStop?.(); };

// ----- זיהוי דיבור -----
export function listen(btn) {
  return new Promise((res, rej) => {
    if (!SR) return rej(new Error('nosr'));
    stopSpeaking();
    const r = new SR(); r.lang = state.settings.accent; r.maxAlternatives = 5; r.interimResults = false;
    const old = btn?.innerHTML; btn?.classList.add('rec'); if (btn) btn.innerHTML = '🎙️ מקשיב…';
    const done = () => { btn?.classList.remove('rec'); if (btn && old != null) btn.innerHTML = old; };
    let got = false;
    r.onresult = e => { got = true; done(); res([...e.results[0]].map(a => a.transcript)); };
    r.onerror = e => { done(); rej(new Error(e.error)); };
    r.onend = () => { done(); if (!got) res([]); };
    try { r.start(); } catch (e) { done(); rej(e); }
  });
}

export const norm = (s) => s.toLowerCase().replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim();
export function compare(target, alts) {
  const tw = norm(target).split(' ');
  let best = { score: -1, heard: '', marks: [] };
  for (const a of alts) {
    const hw = norm(a).split(' ');
    const marks = tw.map(w => hw.includes(w));
    const sc = marks.filter(Boolean).length / tw.length;
    if (sc > best.score) best = { score: sc, heard: a, marks };
  }
  return best;
}

// משך משפט בקול (שקט) – משמש כייחוס לקצב בשיעורי shadowing
const refCache = new Map();
export function measure(text, rate) {
  const key = text + '|' + rate + '|' + state.settings.voice + az.ttsEnabled();
  if (refCache.has(key)) return Promise.resolve(refCache.get(key));
  if (az.ttsEnabled()) return az.duration(text, { voice: az.voiceFor(hooks.animalVoice?.()), rate: Math.min(1.3, Math.max(.6, rate + .1)) }).then(d => { if (d) refCache.set(key, d); return d; });
  return new Promise(res => {
    if (!hasTTS) return res(null);
    const u = new SpeechSynthesisUtterance(text); const v = chosen(); if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = rate; u.volume = 0; let t0 = 0; const guard = setTimeout(() => res(null), 15000);
    u.onstart = () => { t0 = performance.now(); };
    u.onend = () => { clearTimeout(guard); const d = t0 ? (performance.now() - t0) / 1000 : null; if (d) refCache.set(key, d); res(d); };
    u.onerror = () => { clearTimeout(guard); res(null); };
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  });
}

// זיהוי דיבור שמתחיל ומסתיים ידנית (במקביל להקלטה)
export function listenStart() {
  if (!SR) return null;
  const r = new SR(); r.lang = state.settings.accent; r.maxAlternatives = 5; r.interimResults = false; r.continuous = true;
  let alts = []; let resolve; const done = new Promise(res => { resolve = res; });
  r.onresult = e => { const last = e.results[e.results.length - 1]; alts = alts.length ? alts.map((a, i) => a + ' ' + (last[i]?.transcript ?? last[0].transcript)) : [...last].map(a => a.transcript); };
  r.onerror = () => resolve(alts); r.onend = () => resolve(alts);
  try { r.start(); } catch { return null; }
  return { stop: () => { try { r.stop(); } catch {} return Promise.race([done, new Promise(x => setTimeout(() => x(alts), 1200))]); } };
}
