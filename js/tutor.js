// מורה AI: שיחה עם Claude (דרך ה-SDK הרשמי, מקובץ ל-vendor), עם תיקוני ניסוח בעברית. המפתח נשמר רק במכשיר.
import { state } from './store.js';

export const MODELS = [
  ['claude-opus-5-5', 'Claude Opus 5.5 · החכם ביותר (ברירת מחדל)'],
  ['claude-sonnet-5-5', 'Claude Sonnet 5.5 · מהיר וחכם'],
  ['claude-haiku-5-5', 'Claude Haiku 5.5 · הכי מהיר וזול']
];
export const provider = () => state.settings.aiProvider === 'gemini' ? 'gemini' : 'claude';
export const enabled = () => provider() === 'gemini' ? !!state.settings.geminiKey : !!state.settings.claudeKey;

let client, clientKey, SDKP;
async function getClient() {
  const k = state.settings.claudeKey.trim();
  if (!client || clientKey !== k) {
    const { Anthropic } = await (SDKP ||= import('../vendor/sdk/anthropic.js'));
    client = new Anthropic({ apiKey: k, dangerouslyAllowBrowser: true }); clientKey = k; // מפתח אישי, שמור רק בדפדפן שלך
  }
  return client;
}

const SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    reply: { type: 'string', description: 'Your spoken reply, 1-2 short sentences, then one follow-up question.' },
    original: { type: 'string', description: "The learner's phrase that needs fixing, or empty string." },
    better: { type: 'string', description: 'A more natural native American way to say it, or empty string.' },
    why_he: { type: 'string', description: 'A short Hebrew explanation of the difference, or empty string.' }
  },
  required: ['reply', 'original', 'better', 'why_he']
};

const system = (animal, scenario) => `You are ${animal}, a warm, playful animal tutor helping a Hebrew-speaking adult reach native-level American English.
Scenario: ${scenario}.
Rules:
- Speak natural, casual General American English, with contractions. Keep "reply" to 1-2 short sentences plus ONE follow-up question, so the learner talks most of the time.
- Match the learner's level but stretch it slightly. Never switch to Hebrew inside "reply".
- Look at the learner's last message. If it has a real grammar error, wrong word, or an unnatural phrasing a native would not use, fill "original", "better" and "why_he" (a one-sentence Hebrew explanation). Correct at most ONE thing per turn, the most useful one. If it was fine, leave those three as empty strings.
- Do not praise excessively and do not repeat the correction inside "reply".`;

const refusalModels = (m) => !/haiku/i.test(m);

// ---------- Gemini (REST ישיר מהדפדפן; מפתח אישי מ-Google AI Studio) ----------
const GBASE = 'https://generativelanguage.googleapis.com/v1beta';
const toGSchema = (n) => Array.isArray(n) ? n.map(toGSchema) : n && typeof n === 'object'
  ? Object.fromEntries(Object.entries(n).filter(([k]) => k !== 'additionalProperties').map(([k, v]) => [k, k === 'type' ? String(v).toUpperCase() : toGSchema(v)])) : n;
const G_FALLBACK = 'gemini-flash-lite-latest';
const gModel = () => { const m = (state.settings.geminiModel || G_FALLBACK).replace(/^models\//, ''); return /^gemini-2\.5-flash$/.test(m) ? G_FALLBACK : m; }; // 2.5-flash הוסר למשתמשים חדשים
async function gcall(params) {
  const body = { systemInstruction: { parts: [{ text: params.system }] },
    contents: params.messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    generationConfig: { maxOutputTokens: 1024, ...(params.format ? { responseMimeType: 'application/json', responseSchema: toGSchema(params.format.schema) } : {}) } };
  const once = async (model) => {
    const r = await fetch(`${GBASE}/models/${model}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': state.settings.geminiKey.trim() }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j?.error?.message || 'gemini ' + r.status); e.status = r.status; throw e; }
    if (j.promptFeedback?.blockReason || j.candidates?.[0]?.finishReason === 'SAFETY') throw new Error('refusal');
    return j.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') ?? '';
  };
  const model = gModel();
  try { return await once(model); }
  catch (e) {
    if (e.status === 503) { await new Promise(r => setTimeout(r, 1500)); try { return await once(model); } catch (e2) { e = e2; } } // עומס זמני: ניסיון נוסף
    if ((e.status === 503 || e.status === 404) && model !== G_FALLBACK) return once(G_FALLBACK); // מעבר למודל הקל והיציב
    throw e;
  }
}
export async function listGeminiModels() {
  const r = await fetch(`${GBASE}/models?pageSize=200`, { headers: { 'x-goog-api-key': state.settings.geminiKey.trim() } });
  const j = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(j?.error?.message || 'gemini ' + r.status); e.status = r.status; throw e; }
  return (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace(/^models\//, '')).filter(n => /^gemini/.test(n));
}

async function call(params) {
  if (provider() === 'gemini') return gcall(params);
  const c = await getClient(); const model = state.settings.claudeModel || MODELS[0][0];
  const base = { model, max_tokens: 1024, output_config: { effort: 'low', ...(params.format ? { format: params.format } : {}) }, system: params.system, messages: params.messages };
  // ברירת מחדל מומלצת למודלים אלה: מעבר אוטומטי למודל חלופי אם נדחתה הבקשה (פעולת בטיחות בצד השרת)
  const res = refusalModels(model)
    ? await c.beta.messages.create({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
    : await c.messages.create(base);
  if (res.stop_reason === 'refusal') throw new Error('refusal');
  const t = res.content.find(b => b.type === 'text'); return t?.text ?? '';
}

export function session(animalName, scenarioTitle) {
  const hist = []; const sys = system(animalName, scenarioTitle);
  const turn = async (userText) => {
    hist.push({ role: 'user', content: userText });
    let out;
    try { out = JSON.parse(await call({ system: sys, messages: hist, format: { type: 'json_schema', schema: SCHEMA } })); }
    catch (e) { hist.pop(); throw e; }
    hist.push({ role: 'assistant', content: out.reply });
    return out;
  };
  return {
    start: () => turn('(The learner just opened the chat. Greet them in one short sentence and ask your first question for this scenario.)'),
    send: (t) => turn(t),
    summary: async () => call({ system: 'You are an English coach for a Hebrew speaker. Write in Hebrew (keep English examples in English).', messages: [...hist, { role: 'user', content: 'Conversation over. In Hebrew, as a short bullet list: 1) the 3 most important mistakes or unnatural phrases I made, each with the better version, 2) two things I did well, 3) one thing to practice tomorrow. Be specific and brief.' }] })
  };
}

export const errMsg = (e) => {
  const s = e?.status, m = String(e?.message || e);
  if (provider() === 'gemini') {
    if (s === 400 && /api key/i.test(m) || s === 403) return 'מפתח Gemini לא תקין או ללא הרשאה. בדוק בהגדרות.';
    if (s === 503) return 'Gemini עמוס כרגע – נסה שוב בעוד רגע.';
    if (s === 404) return 'המודל לא קיים. לחץ "הצג מודלים זמינים" בהגדרות ובחר אחד.';
    if (s === 429) return 'חרגת ממכסת Gemini החינמית – נסה שוב בעוד דקה.';
    if (m === 'refusal') return 'Gemini חסם את התשובה. נסה לנסח אחרת.';
    return 'שגיאת Gemini: ' + m.slice(0, 120);
  }
  if (s === 401 || /authentication|invalid x-api-key/i.test(m)) return 'מפתח Claude לא תקין. בדוק בהגדרות.';
  if (s === 429) return 'עומס או מכסה – נסה שוב בעוד רגע.';
  if (s === 404 || /model/i.test(m) && s === 400) return 'המודל לא זמין לחשבון שלך – בחר מודל אחר בהגדרות.';
  if (m === 'refusal') return 'הבקשה נדחתה מסיבות בטיחות. נסה לנסח אחרת.';
  return 'שגיאת רשת או API: ' + m.slice(0, 120);
};
export async function test() { return call({ system: 'Reply with exactly: OK', messages: [{ role: 'user', content: 'ping' }] }); }
