// node tools/build-words.mjs  →  data/words.json
// מקור הגייה: CMUdict (קוד פתוח). מקור תוכן: data/core.txt
import fs from 'node:fs';

const cmu = new Map();
for (const line of fs.readFileSync('data/cmudict.dict','utf8').split('\n')) {
  if (!line || line.startsWith(';')) continue;
  const [w, ...ph] = line.split(' ');
  if (/\(\d+\)$/.test(w)) continue; // רק ההגייה הראשונה
  if (!cmu.has(w)) cmu.set(w, ph);
}

const V = { AA:'ɑ', AE:'æ', AH:'ʌ', AO:'ɔ', AW:'aʊ', AY:'aɪ', EH:'ɛ', ER:'ɝ', EY:'eɪ', IH:'ɪ', IY:'i', OW:'oʊ', OY:'ɔɪ', UH:'ʊ', UW:'u' };
const C = { B:'b', CH:'tʃ', D:'d', DH:'ð', F:'f', G:'ɡ', HH:'h', JH:'dʒ', K:'k', L:'l', M:'m', N:'n', NG:'ŋ', P:'p', R:'ɹ', S:'s', SH:'ʃ', T:'t', TH:'θ', V:'v', W:'w', Y:'j', Z:'z', ZH:'ʒ' };
const isV = (p) => /\d$/.test(p);

function toIPA(ph) {
  // פיצול להברות (onset מקסימלי פשוט)
  const syl = []; let cur = { on: [], nu: null, co: [] };
  const toks = ph.map(p => ({ b: p.replace(/\d/, ''), s: isV(p) ? +p.slice(-1) : null }));
  const vIdx = toks.map((t,i)=> t.s!==null ? i : -1).filter(i=>i>=0);
  if (!vIdx.length) return { ipa: toks.map(t=>C[t.b]).join(''), n:1, stress:1 };
  const sylls = vIdx.map(() => ({ on:[], v:null, co:[] }));
  vIdx.forEach((vi,k) => {
    sylls[k].v = toks[vi];
    const prev = k ? vIdx[k-1] : -1;
    const between = toks.slice(prev+1, vi);
    if (!k) sylls[k].on = between;
    else {
      const L = between.map(t=>t.b); let on = Math.min(L.length, 1);
      const n = L.length;
      const stopsEtc = ['P','B','T','D','K','G','F','V','TH','SH'], liq = ['L','R','W','Y'];
      if (n >= 3 && L[n-3]==='S' && ['P','T','K'].includes(L[n-2]) && ['L','R','W'].includes(L[n-1])) on = 3;
      else if (n >= 2 && ((stopsEtc.includes(L[n-2]) && liq.includes(L[n-1])) || (L[n-2]==='S' && ['P','T','K','M','N','L','W','F','V'].includes(L[n-1])))) on = 2;
      sylls[k-1].co = between.slice(0, between.length - on);
      sylls[k].on = between.slice(between.length - on);
    }
  });
  sylls[sylls.length-1].co = toks.slice(vIdx[vIdx.length-1]+1);
  let stressIdx = sylls.findIndex(s => s.v.s === 1); if (stressIdx < 0) stressIdx = 0;
  const parts = sylls.map((s,i) => {
    let v = V[s.v.b];
    if (s.v.b === 'AH' && s.v.s === 0) v = 'ə';
    if (s.v.b === 'ER' && s.v.s === 0) v = 'ɚ';
    if (s.v.b === 'IH' && s.v.s === 0 && false) v = 'ɪ';
    const mark = s.v.s === 1 ? 'ˈ' : s.v.s === 2 ? 'ˌ' : '';
    return mark + s.on.map(t=>C[t.b]).join('') + v + s.co.map(t=>C[t.b]).join('');
  });
  return { ipa: parts.join('.').replace(/\.([ˈˌ])/g,'$1'), n: sylls.length, stress: stressIdx+1 };
}

const units = []; const seen = new Set(); const missing = [];
for (const line of fs.readFileSync('data/core.txt','utf8').split('\n')) {
  if (!line.trim()) continue;
  if (line.startsWith('## ')) { const [id,title,icon] = line.slice(3).split('|'); units.push({ id:+id, title, icon, words:[] }); continue; }
  const [w, he, ex] = line.split('|');
  if (seen.has(w)) continue; seen.add(w);
  const ph = cmu.get(w.toLowerCase());
  if (!ph) { missing.push(w); continue; }
  const r = toIPA(ph);
  units.at(-1).words.push({ w, he, ex, ipa: r.ipa, syl: r.n, st: r.stress });
}
fs.writeFileSync('data/words.json', JSON.stringify({ units }));
const total = units.reduce((a,u)=>a+u.words.length,0);
console.log('words:', total, 'missing:', missing.join(','));
console.log(['comfortable','schedule','through','water','library','vegetable','very','world'].map(w=>w+' '+(units.flatMap(u=>u.words).find(x=>x.w===w)?.ipa)).join('\n'));
