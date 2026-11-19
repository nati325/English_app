// במת הדמות: חיות Microsoft Fluent Emoji 3D (MIT) עם אנימציה קלה ב-DOM (בלי WebGL – חוסך סוללה וטעינה).
export const ANIMALS = {
  fox:     { name: 'Foxy',   img: 'fox',     emoji: '🦊', desc: 'שועל סקרן',      pitch: 1.15, voice: 'en-US-AriaNeural' },
  cat:     { name: 'Mimi',   img: 'cat',     emoji: '🐱', desc: 'חתולה שמחה',     pitch: 1.35, voice: 'en-US-JennyNeural' },
  panda:   { name: 'Bao',    img: 'panda',   emoji: '🐼', desc: 'פנדה רגועה',     pitch: .95,  voice: 'en-US-AndrewMultilingualNeural' },
  dog:     { name: 'Buddy',  img: 'dog',     emoji: '🐶', desc: 'כלב נאמן',       pitch: 1.0,  voice: 'en-US-GuyNeural' },
  rabbit:  { name: 'Bun',    img: 'rabbit',  emoji: '🐰', desc: 'ארנבת קופצנית', pitch: 1.4,  voice: 'en-US-AvaMultilingualNeural' },
  owl:     { name: 'Olly',   img: 'owl',     emoji: '🦉', desc: 'ינשוף חכם',      pitch: .85,  voice: 'en-US-DavisNeural' },
  frog:    { name: 'Ribbit', img: 'frog',    emoji: '🐸', desc: 'צפרדע מצחיקה',   pitch: 1.2,  voice: 'en-US-TonyNeural' },
  bear:    { name: 'Bruno',  img: 'bear',    emoji: '🐻', desc: 'דוב חמוד',       pitch: .75,  voice: 'en-US-BrianMultilingualNeural' },
  koala:   { name: 'Kiki',   img: 'koala',   emoji: '🐨', desc: 'קואלה רגועה',    pitch: 1.1,  voice: 'en-US-EmmaMultilingualNeural' },
  tiger:   { name: 'Tigo',   img: 'tiger',   emoji: '🐯', desc: 'נמר אמיץ',       pitch: .9,   voice: 'en-US-JasonNeural' },
  monkey:  { name: 'Momo',   img: 'monkey',  emoji: '🐵', desc: 'קוף שובב',       pitch: 1.25, voice: 'en-US-SaraNeural' },
  penguin: { name: 'Pingu',  img: 'penguin', emoji: '🐧', desc: 'פינגווין מנומס', pitch: 1.05, voice: 'en-US-NancyNeural' },
  lion:    { name: 'Leo',    img: 'lion',    emoji: '🦁', desc: 'אריה מנהיג',     pitch: .8,   voice: 'en-US-GuyNeural' },
  unicorn: { name: 'Luna',   img: 'unicorn', emoji: '🦄', desc: 'חד-קרן קסום',    pitch: 1.3,  voice: 'en-US-AriaNeural' }
};
export const animalImg = (key) => `assets/animals/${(ANIMALS[key] || ANIMALS.fox).img}.png`;

export class Stage {
  constructor(root) {
    this.root = root;
    root.innerHTML = `<div class="char" id="char"><div class="rings"><i></i><i></i></div><img id="charImg" alt="" draggable="false"><div class="cshadow"></div></div><div class="cfx" id="cfx"></div>`;
    this.box = root.querySelector('#char'); this.img = root.querySelector('#charImg'); this.fx = root.querySelector('#cfx');
    this.speaking = false; this.pulse = 0; this.t = 0; this.react = 0; this.rt = 0; this.kind = ''; this.ptr = 0; this.key = null;
    const move = (e) => { const b = root.getBoundingClientRect(); const p = e.touches?.[0] ?? e; this.ptr = ((p.clientX - b.left) / b.width - .5) * 2; };
    root.addEventListener('pointermove', move);
    this.box.addEventListener('pointerdown', (e) => { move(e); this.celebrate(); this.onTap?.(); });
    this.last = performance.now(); this.loop = this.loop.bind(this); requestAnimationFrame(this.loop);
  }
  async setAnimal(key) {
    if (!ANIMALS[key]) key = 'fox';
    if (this.key === key) return;
    const src = animalImg(key);
    await new Promise(res => { const im = new Image(); im.onload = im.onerror = res; im.src = src; }); // טעינה מראש בלי הבהוב
    this.key = key; this.img.src = src; this.box.classList.remove('pop'); void this.box.offsetWidth; this.box.classList.add('pop');
    this.celebrate();
  }
  celebrate() { this.kind = 'happy'; this.react = 1; this.rt = 0; this.burst(['⭐', '✨', '🎉', '💛']); }
  sad() { this.kind = 'sad'; this.react = 1; this.rt = 0; this.burst(['💭']); }
  burst(set) {
    for (let i = 0; i < (set.length > 1 ? 7 : 1); i++) {
      const s = document.createElement('span'); s.textContent = set[i % set.length];
      s.style.setProperty('--dx', `${(Math.random() - .5) * 220}px`); s.style.setProperty('--dy', `${-60 - Math.random() * 90}px`); s.style.animationDelay = `${i * 30}ms`;
      this.fx.appendChild(s); setTimeout(() => s.remove(), 1100);
    }
  }
  loop(now) {
    requestAnimationFrame(this.loop);
    if (document.hidden) { this.last = now; return; }
    const dt = Math.min((now - this.last) / 1000, .05); this.last = now; this.t += dt; const t = this.t;
    this.pulse = Math.max(0, this.pulse - dt * 4);
    let y = Math.sin(t * 1.7) * 5, sx = 1 + Math.sin(t * 2.2) * .012, sy = 1 - Math.sin(t * 2.2) * .012, rot = this.ptr * 5 + Math.sin(t * .9) * 2;
    if (this.speaking) { // "מדבר": מתכווץ ומתמתח בקצב הדיבור
      const q = (.5 + .5 * Math.sin(t * 15)) * (.55 + .45 * this.pulse);
      sy += q * .07; sx -= q * .04; y -= q * 7; rot += Math.sin(t * 7) * 2.5;
    }
    if (this.react > 0) {
      this.rt += dt; this.react = Math.max(0, this.react - dt * 1.4);
      if (this.kind === 'happy') { y -= Math.abs(Math.sin(this.rt * 9)) * 46 * this.react; rot += Math.sin(this.rt * 18) * 7 * this.react; }
      else { rot += Math.sin(this.rt * 38) * 9 * this.react; y += 4 * this.react; }
    }
    this.img.style.transform = `translateY(${y}px) rotate(${rot}deg) scale(${sx},${sy})`;
    this.box.classList.toggle('talk', this.speaking);
    this.box.style.setProperty('--sh', 1 - Math.min(.5, Math.max(0, -y) / 90));
  }
}
