// אחסון מקומי (offline-first). המבנה בנוי כך שאפשר להעביר אותו כמו שהוא ל-Postgres/Supabase בשלב F.
const KEY = 'ea2';
const today = () => new Date().toLocaleDateString('sv'); // YYYY-MM-DD מקומי
const DEFAULT = {
  v: 2, xp: 0, streak: 0, best: 0, lastDay: '', animal: 'fox',
  settings: { voice: '', rate: 0.9, pitch: 0, accent: 'en-US', goal: 20, azureKey: '', azureRegion: '', azureTTS: true, azureVoice: '', claudeKey: '', claudeModel: '', aiProvider: 'claude', geminiKey: '', geminiModel: 'gemini-2.5-flash' },
  cards: {},          // id -> { ease, ivl, reps, lapses, due }
  ear: {},            // 'ɪ / i' -> { ok, n }
  phon: {},           // ipa -> { n, best }
  pacc: {},           // ipa -> { s, n } ממוצע דיוק לפי Azure
  daily: { date: '', review: 0, ear: 0, learn: 0, speak: 0, rhythm: 0, shadow: 0, xp: 0 }
};
let S;
try { S = { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; S.settings = { ...DEFAULT.settings, ...S.settings }; S.daily = { ...DEFAULT.daily, ...S.daily }; } catch { S = structuredClone(DEFAULT); }

export const state = S;
export const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
export const dayKey = today;

export function rollDay() {
  const t = today();
  if (S.daily.date !== t) {
    const y = new Date(Date.now() - 864e5).toLocaleDateString('sv');
    if (S.lastDay && S.lastDay !== y && S.lastDay !== t) S.streak = 0;
    S.daily = { ...DEFAULT.daily, date: t };
    save();
  }
}
export function addXP(n, kind) {
  rollDay();
  S.xp += n; S.daily.xp += n; if (kind) S.daily[kind] = (S.daily[kind] || 0) + 1;
  if (S.lastDay !== today()) { S.streak += 1; S.best = Math.max(S.best, S.streak); S.lastDay = today(); }
  save();
}
export const level = () => Math.floor(Math.sqrt(S.xp / 40)) + 1;
export const levelProgress = () => { const L = level(), a = 40*(L-1)**2, b = 40*L**2; return { L, pct: (S.xp - a) / (b - a), next: b - S.xp }; };
export function reset() { localStorage.removeItem(KEY); location.reload(); }

// גיבוי/שחזור התקדמות (בלי מפתחות) – תחליף לסנכרון עד שיהיה שרת
export function exportData() { const { settings, ...rest } = S; const { azureKey, claudeKey, geminiKey, ...safe } = settings; return JSON.stringify({ ...rest, settings: safe }); }
export function importData(txt) { const d = JSON.parse(txt); if (!d || typeof d !== 'object' || !('cards' in d)) throw new Error('bad'); const keep = { azureKey: S.settings.azureKey, claudeKey: S.settings.claudeKey, geminiKey: S.settings.geminiKey }; Object.assign(S, d); S.settings = { ...DEFAULT.settings, ...d.settings, ...keep }; save(); }
