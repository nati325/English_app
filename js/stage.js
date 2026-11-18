import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// חיות Quaternius (CC0) – קבצי GLB עם שלד ואנימציות
export const ANIMALS = {
  fox:   { name:'Foxy',   emoji:'🦊', file:'fox',       pitch:1.15, desc:'שועל סקרן',     yaw:.55, mult:1.1, voice:'en-US-AriaNeural' },
  shiba: { name:'Shiba',  emoji:'🐕', file:'shiba',     pitch:1.0,  desc:'שיבה שמח',      yaw:.55, mult:1.2, voice:'en-US-GuyNeural' },
  husky: { name:'Storm',  emoji:'🐺', file:'husky',     pitch:0.8,  desc:'האסקי חזק',     yaw:.55, mult:1.1, voice:'en-US-DavisNeural' },
  deer:  { name:'Bambi',  emoji:'🦌', file:'deer',      pitch:1.1,  desc:'צבי רגוע',      yaw:.5,  mult:1.4, voice:'en-US-JennyNeural' },
  frog:  { name:'Ribbit', emoji:'🐸', file:'frog',      pitch:1.2,  desc:'צפרדע קופצנית', yaw:0,   mult:.9, voice:'en-US-TonyNeural' },
  pug:   { name:'Pogo',   emoji:'🐶', file:'pug',       pitch:1.05, desc:'פאג מצחיק',     yaw:.3,  mult:1, voice:'en-US-JasonNeural' },
  wolf:  { name:'Luna',   emoji:'🐾', file:'wolf',      pitch:0.9,  desc:'זאבה חכמה',     yaw:.55, mult:1.1, voice:'en-US-AvaMultilingualNeural' },
};

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

const short = (c) => c.name.toLowerCase().split('|').pop();
const pickClip = (clips, ...keys) => { // התאמה מדויקת קודם, ואז חלקית
  for (const k of keys) { const c = clips.find(c => short(c) === k) || clips.find(c => short(c).includes(k)); if (c) return c; }
  return null;
};

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.r.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.r.toneMapping = THREE.ACESFilmicToneMapping; this.r.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(32, 1, .1, 100);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb8d8a8, 1.6));
    const sun = new THREE.DirectionalLight(0xfff2dd, 2.2); sun.position.set(3, 5, 4); this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0xbfe0ff, 1.0); rim.position.set(-4, 3, -3); this.scene.add(rim);
    this.group = new THREE.Group(); this.scene.add(this.group);
    // צל רך מתחת לחיה
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const rg = g.createRadialGradient(64,64,4,64,64,62); rg.addColorStop(0,'rgba(0,0,0,.35)'); rg.addColorStop(1,'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0,0,128,128);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.4,3.4), new THREE.MeshBasicMaterial({ map:new THREE.CanvasTexture(c), transparent:true, depthWrite:false }));
    this.shadow.rotation.x = -Math.PI/2; this.shadow.position.y = .01; this.scene.add(this.shadow);

    this.cache = new Map(); this.cur = null; this.mixer = null; this.actions = {}; this.active = null;
    this.speaking = false; this.yaw = 0; this.pulse = 0; this.t = 0; this.react = 0; this.reactT = 0; this.head = null; this.baseHeadRot = null;
    this.ptr = { x:0, y:0 }; this.clock = new THREE.Clock();
    const move = (e) => { const b = canvas.getBoundingClientRect(); const p = e.touches?.[0] ?? e; this.ptr.x = ((p.clientX-b.left)/b.width-.5)*2; this.ptr.y = ((p.clientY-b.top)/b.height-.5)*2; };
    canvas.addEventListener('pointermove', move); canvas.addEventListener('touchmove', move, { passive:true });
    canvas.addEventListener('pointerdown', (e) => { move(e); this.celebrate(); this.onTap?.(); });
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement); this.resize();
    this.loop = this.loop.bind(this); this.loop();
  }
  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight; if (!w || !h) return;
    this.r.setSize(w, h, false); this.cam.aspect = w/h; this.cam.updateProjectionMatrix(); this.frame();
  }
  frame() { // מרחק מצלמה לפי גודל וגובה הבמה
    const h = 4.4, dist = (h/2) / Math.tan(THREE.MathUtils.degToRad(this.cam.fov/2)) / Math.min(1, this.cam.aspect*0.9);
    this.cam.position.set(0, 2.0, dist + 1.3); this.cam.lookAt(0, 1.45, 0);
  }
  async load(key) {
    if (this.cache.has(key)) return this.cache.get(key);
    const a = ANIMALS[key];
    const gltf = await loader.loadAsync(`models/${a.file}.glb`);
    const root = gltf.scene;
    // מדידה לפי עצמות (bounding box של סקיני+meshopt לא אמין). הארמטורה בקנה מידה 100 והגיאומטריה קטנה – היחידות כבר סבירות.
    const tmp = new THREE.AnimationMixer(root); if (gltf.animations[0]) tmp.clipAction(gltf.animations[0]).play(); tmp.update(0.01);
    root.updateWorldMatrix(true, true);
    const bb = new THREE.Box3(), v = new THREE.Vector3();
    root.traverse(o => { if (o.isBone && !/pole|target|ik/i.test(o.name)) { o.getWorldPosition(v); bb.expandByPoint(v); } });
    const size = bb.getSize(new THREE.Vector3());
    const s = THREE.MathUtils.clamp(2.2 / size.y, .5, 1.6) * (a.mult ?? 1); root.scale.setScalar(s);
    const ctr = bb.getCenter(new THREE.Vector3());
    root.position.set(-ctr.x * s, -bb.min.y * s, -ctr.z * s); tmp.stopAllAction(); tmp.uncacheRoot(root);
    root.traverse(o => { if (o.isMesh) o.frustumCulled = false; }); // סקיני + קוונטיזציה = bounding sphere שגוי
    const holder = new THREE.Group(); holder.add(root);
    const item = { holder, root, clips: gltf.animations };
    this.cache.set(key, item); return item;
  }
  async setAnimal(key) {
    const item = await this.load(key);
    if (this.cur) this.group.remove(this.cur.holder);
    this.cur = item; this.yaw = ANIMALS[key].yaw ?? 0; this.group.add(item.holder);
    this.mixer = new THREE.AnimationMixer(item.root); this.actions = {};
    const cl = item.clips;
    const defs = { idle: pickClip(cl,'idle'), idle2: pickClip(cl,'idle_2','idle2','headlow'), jump: pickClip(cl,'jump_toidle','jump','gallop_jump'), hit: pickClip(cl,'hitreact_left','hitrecieve','hit'), walk: pickClip(cl,'walk'), yes: pickClip(cl,'yes'), no: pickClip(cl,'no') };
    for (const [k, c] of Object.entries(defs)) if (c) this.actions[k] = this.mixer.clipAction(c);
    this.play('idle'); this.head = null;
    item.root.traverse(o => { if (o.isBone && /^head$/i.test(o.name)) this.head = o; });
    this.celebrate();
  }
  play(name, { once=false, fade=.25 } = {}) {
    const a = this.actions[name] ?? this.actions.idle; if (!a) return;
    if (this.active === a && !once) return;
    a.reset(); a.enabled = true; a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat); a.clampWhenFinished = true;
    if (this.active && this.active !== a) this.active.crossFadeTo(a, fade, false);
    a.play(); this.active = a;
    if (once) { this.mixer.addEventListener('finished', this._fin = () => { this.mixer.removeEventListener('finished', this._fin); this.play('idle'); }); }
  }
  celebrate() { this.react = 1; this.reactT = 0; if (this.actions.jump && this.cur) this.play('jump', { once:true }); }
  sad() { if (this.actions.hit) this.play('hit', { once:true }); }
  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), .05); this.t += dt;
    this.mixer?.update(dt);
    if (this.cur) {
      const h = this.cur.holder, t = this.t;
      // הסתכלות לעבר האצבע/העכבר + נדנוד קל
      h.rotation.y += ((this.yaw + this.ptr.x*.5 + Math.sin(t*.6)*.08) - h.rotation.y) * .08;
      this.pulse = Math.max(0, this.pulse - dt*4);
      const talk = this.speaking ? (.5 + .5*Math.sin(t*13)) * (.5 + .5*this.pulse) : 0;
      h.position.y = talk * .05 + (this.react>0 ? Math.abs(Math.sin(this.reactT*9))*.35*this.react : 0);
      h.scale.y += ((1 + talk*.035) - h.scale.y) * .4;
      if (this.head && this.speaking) { this.head.rotation.x += Math.sin(t*12)*.06*(.6+this.pulse); this.head.rotation.z += Math.sin(t*7)*.04; }
      if (this.react > 0) { this.reactT += dt; this.react = Math.max(0, this.react - dt*1.2); }
    }
    this.r.render(this.scene, this.cam);
  }
}
