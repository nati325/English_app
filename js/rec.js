// הקלטה וניתוח שטף: משך, קצב הברות/שנייה, הפסקות. הכל מקומי בדפדפן.
export const canRecord = !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const rec = new MediaRecorder(stream); const chunks = []; const t0 = performance.now();
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  rec.start();
  return {
    stream,
    stop: () => new Promise(res => {
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        let analysis = null; try { analysis = await analyze(blob); } catch {}
        res({ blob, url: URL.createObjectURL(blob), dur: (performance.now() - t0) / 1000, analysis });
      };
      rec.stop();
    })
  };
}

async function analyze(blob) {
  const AC = window.AudioContext || window.webkitAudioContext; const ac = new AC();
  const buf = await ac.decodeAudioData(await blob.arrayBuffer()); ac.close?.();
  const d = buf.getChannelData(0), sr = buf.sampleRate, hop = Math.floor(sr * .02);
  const env = []; for (let i = 0; i + hop < d.length; i += hop) { let s = 0; for (let k = 0; k < hop; k++) s += d[i + k] ** 2; env.push(Math.sqrt(s / hop)); }
  const sorted = [...env].sort((a, b) => a - b), peak = sorted[Math.floor(sorted.length * .95)] || 0, th = Math.max(.008, peak * .18);
  const voiced = env.map(v => v > th);
  const first = voiced.indexOf(true), last = voiced.lastIndexOf(true);
  if (first < 0) return { speech: 0, total: buf.duration, pauses: 0, longest: 0, ok: false };
  let pauses = 0, longest = 0, run = 0, speech = 0;
  for (let i = first; i <= last; i++) { if (voiced[i]) { speech++; if (run * .02 >= .35) pauses++; longest = Math.max(longest, run * .02); run = 0; } else run++; }
  return { speech: speech * .02, span: (last - first + 1) * .02, total: buf.duration, pauses, longest, ok: true };
}

export const countSyllables = (text) => text.toLowerCase().replace(/[^a-z ]/g, '').split(' ').filter(Boolean)
  .reduce((n, w) => n + Math.max(1, (w.replace(/e$/, '').match(/[aeiouy]+/g) || []).length), 0);
