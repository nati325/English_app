// Azure Speech: הערכת הגייה ברמת פונמה (IPA) + קולות עצביים. מצב "המפתח שלי": המפתח נשמר רק במכשיר.
import { state } from './store.js';

export const AZURE_VOICES = [
  ['en-US-AvaMultilingualNeural', 'Ava · אישה, חמה וטבעית'], ['en-US-AndrewMultilingualNeural', 'Andrew · גבר, חם'],
  ['en-US-EmmaMultilingualNeural', 'Emma · אישה, ברורה'], ['en-US-BrianMultilingualNeural', 'Brian · גבר, רגוע'],
  ['en-US-JennyNeural', 'Jenny · אישה, ידידותית'], ['en-US-AriaNeural', 'Aria · אישה, אקספרסיבית'],
  ['en-US-GuyNeural', 'Guy · גבר, שיחתי'], ['en-US-DavisNeural', 'Davis · גבר, עמוק'],
  ['en-US-JaneNeural', 'Jane · אישה'], ['en-US-JasonNeural', 'Jason · גבר'], ['en-US-TonyNeural', 'Tony · גבר, קליל'], ['en-US-NancyNeural', 'Nancy · אישה']
];

export const enabled = () => !!(state.settings.azureKey && state.settings.azureRegion);
export const ttsEnabled = () => enabled() && state.settings.azureTTS !== false;

let sdkP;
export function loadSDK() {
  if (window.SpeechSDK) return Promise.resolve(window.SpeechSDK);
  return sdkP ||= new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'vendor/sdk/speech-sdk.js';
    s.onload = () => window.SpeechSDK ? res(window.SpeechSDK) : rej(new Error('sdk-missing'));
    s.onerror = () => { sdkP = null; rej(new Error('sdk-load')); }; document.head.appendChild(s);
  });
}
const baseCfg = (SDK) => { const c = SDK.SpeechConfig.fromSubscription(state.settings.azureKey.trim(), state.settings.azureRegion.trim()); c.speechRecognitionLanguage = 'en-US'; return c; };

// ---------- פענוח תוצאת ההערכה (פונקציה טהורה – נבדקת בנפרד) ----------
export function parseAssessment(json) {
  const nb = json?.NBest?.[0]; if (!nb) return null;
  const pa = nb.PronunciationAssessment || {};
  const words = (nb.Words || []).map(w => ({
    w: w.Word, acc: w.PronunciationAssessment?.AccuracyScore ?? 0, err: w.PronunciationAssessment?.ErrorType || 'None',
    ph: (w.Phonemes || []).map(p => ({ p: p.Phoneme, acc: p.PronunciationAssessment?.AccuracyScore ?? 0 }))
  }));
  return { text: nb.Display || nb.Lexical || '', accuracy: pa.AccuracyScore ?? 0, fluency: pa.FluencyScore ?? 0, completeness: pa.CompletenessScore ?? 0, pron: pa.PronScore ?? 0, prosody: pa.ProsodyScore ?? null, words };
}

// ---------- הערכת הגייה ----------
export async function assess(referenceText, { stream } = {}) {
  const SDK = await loadSDK(); const cfg = baseCfg(SDK);
  const audio = stream ? SDK.AudioConfig.fromStreamInput(stream) : SDK.AudioConfig.fromDefaultMicrophoneInput();
  const pc = new SDK.PronunciationAssessmentConfig(referenceText, SDK.PronunciationAssessmentGradingSystem.HundredMark, SDK.PronunciationAssessmentGranularity.Phoneme, true);
  pc.phonemeAlphabet = 'IPA'; pc.enableProsodyAssessment = true; pc.nbestPhonemeCount = 1;
  const rec = new SDK.SpeechRecognizer(cfg, audio); pc.applyTo(rec);
  return new Promise((resolve, reject) => {
    const done = (fn, v) => { try { rec.close(); } catch {} fn(v); };
    rec.recognizeOnceAsync(r => {
      if (r.reason === SDK.ResultReason.NoMatch) return done(resolve, { nomatch: true });
      if (r.reason === SDK.ResultReason.Canceled) { const d = SDK.CancellationDetails.fromResult(r); return done(reject, new Error(mapErr(d.errorDetails || ''))); }
      try { const j = JSON.parse(r.properties.getProperty(SDK.PropertyId.SpeechServiceResponse_JsonResult)); const p = parseAssessment(j); done(resolve, p || { nomatch: true }); }
      catch (e) { done(reject, e); }
    }, err => done(reject, new Error(mapErr(String(err)))));
  });
}
const mapErr = (m) => /401|403|Authentication|subscription|key/i.test(m) ? 'azure-auth' : /1006|network|websocket|connection/i.test(m) ? 'azure-network' : /Microphone|permission|NotAllowed/i.test(m) ? 'not-allowed' : m || 'azure-unknown';

// ---------- קול עצבי ----------
let cur = null;
export function stop() { if (cur) { try { cur.pause(); } catch {} cur = null; } }
const key = (text, voice, rate) => `https://tts.local/${voice}/${rate}/${encodeURIComponent(text).slice(0, 400)}`;
async function synth(text, voice, rate) {
  const k = key(text, voice, rate); let cache;
  try { cache = await caches.open('np-tts'); const hit = await cache.match(k), hm = await cache.match(k + '#meta'); if (hit) return { blob: await hit.blob(), meta: hm ? await hm.json() : { visemes: [], words: [] } }; } catch {}
  const SDK = await loadSDK(); const cfg = baseCfg(SDK); cfg.speechSynthesisVoiceName = voice; cfg.speechSynthesisOutputFormat = SDK.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3;
  const syn = new SDK.SpeechSynthesizer(cfg, null);
  const meta = { visemes: [], words: [] }; // תנועות פה ותזמוני מילים – למורה התלת־ממדית
  syn.visemeReceived = (s, e) => meta.visemes.push({ id: e.visemeId, t: e.audioOffset / 1e4 });
  syn.wordBoundary = (s, e) => meta.words.push({ text: e.text, t: e.audioOffset / 1e4, d: (e.duration || 0) / 1e4 });
  const pct = Math.round((rate - 1) * 100), esc = text.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><voice name="${voice}"><prosody rate="${pct >= 0 ? '+' : ''}${pct}%">${esc}</prosody></voice></speak>`;
  const buf = await new Promise((res, rej) => syn.speakSsmlAsync(ssml, r => {
    syn.close(); r.reason === SDK.ResultReason.SynthesizingAudioCompleted ? res(r.audioData) : rej(new Error(mapErr(r.errorDetails || '')));
  }, e => { syn.close(); rej(new Error(mapErr(String(e)))); }));
  const blob = new Blob([buf], { type: 'audio/mpeg' });
  try { await cache?.put(k, new Response(blob)); await cache?.put(k + '#meta', new Response(JSON.stringify(meta))); } catch {}
  return { blob, meta };
}
export function voiceFor(animalVoice) { return state.settings.azureVoice || animalVoice || 'en-US-AvaMultilingualNeural'; }

export async function speak(text, { voice, rate = 1, onStart, onPulse, onEnd } = {}) {
  stop(); const { blob, meta } = await synth(text, voice, rate); const a = new Audio(URL.createObjectURL(blob)); cur = a;
  let t; return new Promise((res) => {
    const end = () => { clearInterval(t); if (cur === a) cur = null; onEnd?.(); res(); };
    a.onplay = () => { onStart?.(meta, a.duration); t = setInterval(() => onPulse?.(), 170); }; a.onended = end; a.onerror = end; a.onpause = end;
    a.play().catch(end);
  });
}
export async function duration(text, { voice, rate = 1 }) {
  const { blob } = await synth(text, voice, rate); const a = new Audio(URL.createObjectURL(blob));
  return new Promise(res => { a.onloadedmetadata = () => res(a.duration); a.onerror = () => res(null); });
}
