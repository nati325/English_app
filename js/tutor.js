// מורה AI: שיחה עם Claude (דרך ה-SDK הרשמי, מקובץ ל-vendor), עם תיקוני ניסוח בעברית. המפתח נשמר רק במכשיר.
import { state } from './store.js';

export const MODELS = [
  ['claude-opus-5-5', 'Claude Opus 5.5 · החכם ביותר (ברירת מחדל)'],
  ['claude-sonnet-5-5', 'Claude Sonnet 5.5 · מהיר וחכם'],
  ['claude-haiku-5-5', 'Claude Haiku 5.5 · הכי מהיר וזול']
];
export const enabled = () => !!state.settings.claudeKey;

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
async function call(params) {
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
  if (s === 401 || /authentication|invalid x-api-key/i.test(m)) return 'מפתח Claude לא תקין. בדוק בהגדרות.';
  if (s === 429) return 'עומס או מכסה – נסה שוב בעוד רגע.';
  if (s === 404 || /model/i.test(m) && s === 400) return 'המודל לא זמין לחשבון שלך – בחר מודל אחר בהגדרות.';
  if (m === 'refusal') return 'הבקשה נדחתה מסיבות בטיחות. נסה לנסח אחרת.';
  return 'שגיאת רשת או API: ' + m.slice(0, 120);
};
export async function test() { return call({ system: 'Reply with exactly: OK', messages: [{ role: 'user', content: 'ping' }] }); }
