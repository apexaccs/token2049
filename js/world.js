// ═══════════════════════════════════════════════════════════════════════════
//  APEX AUDIT — the live 3D layer
//
//  The page scrolls normally and the camera never moves. Every object is
//  anchored to a DOM element: each frame it reads its anchor's box and turns
//  those pixels into world units, so a prop sits where its section is at any
//  window size. Scrolling moves the props because scrolling moves the page.
//
//  Two canvases:
//   • back — opaque, behind the page. Draws the moving grey streak field and
//     the props that sit in open stages. Real transmissive glass lives here,
//     because glass needs an opaque backdrop to refract.
//   • top  — transparent, above the cards. Numerals and small props that sit
//     ON glass cards, so they stay crisp instead of blurring behind them.
//
//  Anchors are declared in the markup: <div data-3d="gauge" data-fit=".7">.
// ═══════════════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { FontLoader } from '../vendor/FontLoader.js';
import * as Models from './models.js';

const CAM_Z = 10, FOV = 34;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── environment: area light only, cool neutral studio ──────────────────────
function buildEnvironment(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0xf0f1f4);
  {
    const c = document.createElement('canvas'); c.width = 4; c.height = 256;
    const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgb(255,255,255)'); g.addColorStop(0.42, 'rgb(220,224,230)');
    g.addColorStop(0.55, 'rgb(200,204,210)'); g.addColorStop(1, 'rgb(180,184,192)');
    x.fillStyle = g; x.fillRect(0, 0, 4, 256);
    env.add(new THREE.Mesh(new THREE.SphereGeometry(40, 32, 24), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), side: THREE.BackSide })));
  }
  const soft = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, 256, 256);
    const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    const sm = t => { const u = Math.min(Math.max((t - 0.3) / 0.7, 0), 1); return 1 - u * u * (3 - 2 * u); };
    for (let i = 0; i <= 24; i++) { const t = i / 24, v = Math.round(sm(t) * 255); g.addColorStop(t, `rgb(${v},${v},${v})`); }
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  })();
  const panel = (w, h, color, k, pos, rot, feather = true) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), map: feather ? soft : null, side: THREE.DoubleSide }));
    m.position.set(...pos); m.rotation.set(...rot); env.add(m);
  };
  panel(6, 3.4, 0xffffff, 9, [-3.2, 6.5, 3.4], [-Math.PI / 2, 0, -0.5]);   // key
  panel(1.6, 18, 0xffffff, 18, [-7, 2.2, 2], [0, Math.PI / 2, 0]);        // strip left
  panel(1.2, 18, 0xeef3ff, 13, [7, 3, -1], [0, -Math.PI / 2, 0]);         // strip right, cool
  panel(16, 4.5, 0xffffff, 4.5, [0, 1.2, -8], [0, 0, 0]);                 // back fill
  panel(16, 4.5, 0xffffff, 3, [0, 0.8, 8], [0, Math.PI, 0]);              // front fill
  panel(18, 18, 0xc8ccd4, 1, [0, -5, 0], [Math.PI / 2, 0, 0], false);      // lifted floor
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(env, 0.035).texture;
  pm.dispose(); soft.dispose();
  env.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return tex;
}

// ── materials ──────────────────────────────────────────────────────────────
function materials(transmissive) {
  const P = o => new THREE.MeshPhysicalMaterial(o);
  const M = {
    chrome:   P({ color: 0xc2c7cd, metalness: 1, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.8 }),
    satin:    P({ color: 0xa9afb8, metalness: 1, roughness: 0.34, clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 1.5 }),
    graphite: P({ color: 0x2a2d33, metalness: 0.85, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.12, envMapIntensity: 1.6 }),
    fabric:   P({ color: 0x1f2125, metalness: 0.05, roughness: 0.82, sheen: 1, sheenColor: new THREE.Color(0x8a8f98), sheenRoughness: 0.45, envMapIntensity: 1.2 }),
    canvas:   P({ color: 0x8e9299, metalness: 0, roughness: 0.92, sheen: 0.6, sheenColor: new THREE.Color(0xd0d4da), sheenRoughness: 0.6 }),
    lime:     new THREE.MeshStandardMaterial({ color: 0xc6f24e, emissive: 0x9fd62a, emissiveIntensity: 0.85, metalness: 0.25, roughness: 0.3 }),
    gold:     P({ color: 0xd8c697, metalness: 1, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.8 }),
    silver:   P({ color: 0xd2d7de, metalness: 1, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.8 }),
    bronze:   P({ color: 0xb48d70, metalness: 1, roughness: 0.24, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.7 }),
    frost:    P({ color: 0xdfe5ec, metalness: 0.15, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 2.4, transparent: true, opacity: 0.42, depthWrite: false })
  };
  M.glass = transmissive
    ? P({ color: 0xffffff, metalness: 0, roughness: 0.02, transmission: 1, thickness: 0.9, ior: 1.42, dispersion: 2.5,
          attenuationColor: new THREE.Color(0xe3e9f1), attenuationDistance: 5, clearcoat: 1, clearcoatRoughness: 0.02,
          envMapIntensity: 1.7, specularIntensity: 1 })
    : M.frost;
  // optical-grade and thin: for things that must stay readable through it
  M.clear = transmissive
    ? P({ color: 0xffffff, metalness: 0, roughness: 0, transmission: 1, thickness: 0.05, ior: 1.5,
          attenuationColor: new THREE.Color(0xeef3f7), attenuationDistance: 18, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2 })
    : M.frost;
  return M;
}

// ── background: long-exposure grey streaks (the surf reference) ────────────
function streakField() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uM: { value: new THREE.Vector2() }, uS: { value: 0 }, uHero: { value: 1 } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: /* glsl */`
      precision highp float; varying vec2 vUv;
      uniform float uT; uniform vec2 uRes; uniform vec2 uM; uniform float uS; uniform float uHero;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
        return mix(mix(h(i),h(i+vec2(1,0)),u.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x),u.y);}
      float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p*=2.03;a*=.5;}return v;}
      void main(){
        vec2 p=(vUv-.5)*vec2(uRes.x/uRes.y,1.);
        float an=-.4+uM.x*.02; mat2 R=mat2(cos(an),-sin(an),sin(an),cos(an)); vec2 q=R*p;
        // the streak texture drifts a little with scroll, so the page feels like it moves through it
        vec2 s=q+vec2(0.,uS*.22);
        float fine=fbm(vec2(s.x*.7-uT*.3, s.y*24.+uM.y*.3));
        float broad=fbm(vec2(s.x*.33-uT*.12+3., s.y*5.2));
        // hero: one broad bright wave. Below it: softer bands that keep rolling past as you scroll.
        float heroBand=smoothstep(-.6,.35,q.y+.24*sin(q.x*1.3+uT*.22))*smoothstep(1.,.05,q.y);
        float yb=q.y+uS*.75;
        float rolling=smoothstep(-.15,.95,sin(yb*2.3+.7*sin(q.x*.8+uT*.18)))*.62;
        float band=mix(rolling,heroBand,uHero);
        float v=pow(mix(broad,fine,.6),2.3)*1.75*band;
        v+=.22*smoothstep(1.,0.,length(p-vec2(.8,.55)))*uHero;
        v*=smoothstep(1.45,.1,length(p*vec2(.72,1.)));
        v*=.62+.38*uHero;
        v+=(h(vUv*uRes+fract(uT))-.5)*.03;
        vec3 base=vec3(.94,.945,.96);
        vec3 c=base-vec3(v)*vec3(.08,.075,.07);
        gl_FragColor=vec4(c,1.);
      }`,
    depthWrite: false
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

// ── one layer: renderer, scene, props anchored to elements ─────────────────
function layer(canvas, { opaque }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: !opaque, powerPreference: 'high-performance' });
  if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 required');
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = opaque ? 1.3 : 1.2;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (!opaque) renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.environment = buildEnvironment(renderer);
  scene.environmentIntensity = 1.25;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
  camera.position.set(0, 0, CAM_Z);
  return { renderer, scene, camera, props: [], drew: true, opaque };
}

export function createWorld({ back, top, onReady } = {}) {
  const B = layer(back, { opaque: true });
  const T = layer(top, { opaque: false });
  const MB = materials(true), MT = materials(false);

  const bg = streakField();
  B.scene.add(bg);

  // The canvases are NOT fixed to the screen. A fixed canvas is repainted by
  // script, but the page is scrolled by the compositor on its own thread, so
  // during a fast scroll the cards move a frame or two before the 3D catches
  // up — the props visibly jump off their anchors. Instead each canvas lives
  // in the document, scrolls together with the cards, and is moved back to
  // cover the viewport once per frame. It is taller than the screen by OV on
  // each side, so the compositor never scrolls past its edge.
  const OV = 0.2;
  let vpW = innerWidth, vpH = innerHeight, CH = vpH * (1 + 2 * OV);
  const planeSize = z => { const h = 2 * Math.tan(FOV / 2 * Math.PI / 180) * (CAM_Z - z); return { h, w: h * (vpW / CH) }; };
  function resize() {
    vpW = document.documentElement.clientWidth; vpH = innerHeight; CH = Math.round(vpH * (1 + 2 * OV));
    for (const L of [B, T]) {
      L.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));   // full sharpness; the overscan was trimmed to pay for it
      L.renderer.setSize(vpW, CH, false);
      L.renderer.domElement.style.height = CH + 'px';
      L.camera.aspect = vpW / CH; L.camera.updateProjectionMatrix();
    }
    const { w, h } = planeSize(-30);
    bg.position.z = -30; bg.scale.set(w * 1.02, h * 1.02, 1);
    bg.material.uniforms.uRes.value.set(vpW, CH);
  }
  addEventListener('resize', resize);

  // ── attach ──────────────────────────────────────────────────────────────
  function attach(L, el, obj, o = {}) {
    const box = new THREE.Box3().setFromObject(obj), size = new THREE.Vector3();
    box.getSize(size);
    const holder = new THREE.Group();
    holder.add(obj);
    holder.visible = false;
    L.scene.add(holder);
    const p = {
      el, obj, holder, L,
      w: size.x || 1, h: size.y || 1,
      fit: o.fit ?? 0.8, z: o.z ?? (L.opaque ? -2.6 : -0.6),
      ox: o.ox ?? 0, oy: o.oy ?? 0,
      spin: o.spin ?? 0.25, sway: o.sway ?? 0, tilt: o.tilt ?? 0,
      turn: o.turn ?? 0.7, lean: o.lean ?? 0.18, grow: o.grow ?? true, px: o.px ?? 0.12, par: o.par ?? 0,
      phase: o.phase ?? Math.random() * Math.PI * 2,
      dragY: 0, dragX: 0, vY: 0, vX: 0, spinAcc: 0, hx: 0, hy: 0, relS: null, growS: null,
      onFrame: o.onFrame
    };
    L.props.push(p);
    if (o.drag) enableDrag(p);
    return p;
  }
  function enableDrag(p) {
    let down = false, lx = 0, ly = 0;
    p.el.style.cursor = 'grab'; p.el.style.touchAction = 'pan-y';
    p.el.addEventListener('pointerdown', e => { down = true; lx = e.clientX; ly = e.clientY; p.vY = p.vX = 0; p.el.setPointerCapture(e.pointerId); p.el.style.cursor = 'grabbing'; });
    p.el.addEventListener('pointermove', e => {
      if (!down) return;
      const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
      p.vY = dx * 0.008; p.vX = dy * 0.005;
      p.dragY += p.vY; p.dragX = Math.max(-0.9, Math.min(0.9, p.dragX + p.vX));
    });
    const up = () => { down = false; p.el.style.cursor = 'grab'; };
    p.el.addEventListener('pointerup', up); p.el.addEventListener('pointercancel', up);
    p.dragging = () => down;
  }

  // ── pointer ─────────────────────────────────────────────────────────────
  // Only the prop under the cursor answers to it; the rest keep still.
  let mx = -1e5, my = -1e5, px = 0, py = 0, cx = 0, cy = 0;
  addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; px = (mx / innerWidth - 0.5) * 2; py = (my / innerHeight - 0.5) * 2; }, { passive: true });
  document.addEventListener('pointerleave', () => { mx = my = -1e5; });

  // ── hero brackets: lime scan frame projected around the mark ───────────
  let bracketEl = null, bracketTarget = null, bracketHolder = null;
  const bb = new THREE.Box3(), v = new THREE.Vector3();
  function placeBrackets() {
    if (!bracketEl || !bracketTarget || !bracketHolder?.visible) { if (bracketEl) bracketEl.style.opacity = 0; return; }
    bb.setFromObject(bracketTarget);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).project(B.camera);
      const sx = (v.x + 1) / 2 * vpW, sy = (1 - v.y) / 2 * CH + canvasTop;   // document coordinates
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    const pad = 18;
    bracketEl.style.transform = `translate(${x0 - pad}px,${y0 - pad}px)`;
    bracketEl.style.width = (x1 - x0 + pad * 2) + 'px';
    bracketEl.style.height = (y1 - y0 + pad * 2) + 'px';
    bracketEl.style.opacity = 1;
  }

  // Labels that follow points on a model (the podium's wallet tags).
  const mv = new THREE.Vector3();
  function placeTags(p) {
    const box = document.querySelector(p.el.dataset.tags); if (!box) return;
    const br = box.getBoundingClientRect();
    p.holder.updateMatrixWorld(true);
    for (const mk of p.obj.userData.markers) {
      const tag = box.querySelector(`[data-rank="${mk.userData.rank}"]`); if (!tag) continue;
      mk.getWorldPosition(mv).project(p.L.camera);
      const x = (mv.x + 1) / 2 * vpW, y = (1 - mv.y) / 2 * CH - vpH * OV;   // viewport px
      tag.style.transform = `translate(${(x - br.left).toFixed(1)}px,${(y - br.top).toFixed(1)}px) translate(-50%,-100%)`;
      tag.style.opacity = 1;
    }
  }

  // ── loop ────────────────────────────────────────────────────────────────
  let t = 0, last = performance.now(), active = true, ready = false, canvasTop = 0;
  const ease = k => 1 - Math.pow(1 - k, 3);

  function place(p, dt) {
    const r = p.el.getBoundingClientRect();
    const m = p.holder.visible ? 0.45 : 0.25;
    if (!r.width || r.bottom < -vpH * m || r.top > vpH * (1 + m) || p.el.closest('[hidden]')) { p.holder.visible = false; p.relS = null; return false; }
    p.holder.visible = true;
    const { w, h } = planeSize(p.z);
    const aw = r.width / vpW * w, ah = r.height / CH * h;
    const scale = Math.min(aw * p.fit / p.w, ah * p.fit / p.h);
    // where the anchor sits relative to the middle of the screen: -1 above, +1 below.
    // Eased, so a fast flick turns the props smoothly instead of snapping them.
    const rel = ((r.top + r.height / 2) / vpH - 0.5) * 2;
    const growT = p.grow ? ease(Math.min(1, Math.max(0, (vpH - r.top) / (vpH * 0.45)))) : 1;
    if (p.relS === null) { p.relS = rel; p.growS = growT; }
    p.relS += (rel - p.relS) * 0.08; p.growS += (growT - p.growS) * 0.08;
    const grow = p.growS;
    // hover: only when the cursor is over this prop's own box
    const inside = mx >= r.left && mx <= r.right && my >= r.top && my <= r.bottom;
    const tx = inside ? Math.max(-1, Math.min(1, (mx - r.left - r.width / 2) / (r.width / 2))) : 0;
    const ty = inside ? Math.max(-1, Math.min(1, (my - r.top - r.height / 2) / (r.height / 2))) : 0;
    p.hx += (tx - p.hx) * 0.07; p.hy += (ty - p.hy) * 0.07;
    // position: welded to the anchor, in canvas space (the canvas starts OV above the screen)
    p.holder.position.set(
      ((r.left + r.width / 2) / vpW - 0.5) * w + aw * p.ox,
      -((r.top + vpH * OV + r.height / 2) / CH - 0.5) * h + ah * p.oy + Math.sin(t * 0.8 + p.phase) * ah * 0.012,
      p.z
    );
    p.holder.scale.setScalar(scale * (0.72 + 0.28 * grow));
    // rotation: idle spin or sway, a turn that follows scroll, drag with inertia
    if (!p.dragging || !p.dragging()) { p.dragY += p.vY; p.vY *= 0.94; p.dragX += p.vX; p.vX *= 0.94; p.dragX *= 0.985; }
    p.spinAcc += dt * p.spin;
    const idle = p.sway ? Math.sin(t * 0.55 + p.phase) * p.sway : p.spin ? p.spinAcc + p.phase : 0;
    p.holder.rotation.set(
      p.tilt + p.relS * p.lean + p.hy * 0.3 + p.dragX + (p.sway ? Math.sin(t * 0.42 + p.phase) * p.sway * 0.25 : 0),
      idle + p.relS * -p.turn + p.hx * 0.5 + p.dragY + (1 - grow) * 1.2,
      p.sway ? Math.sin(t * 0.31 + p.phase) * 0.04 : 0
    );
    p.obj.userData.tick?.(t, dt, p);
    if (p.obj.userData.markers && p.el.dataset.tags) placeTags(p);
    p.onFrame?.(p, r);
    return true;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (!active) return;
    t += dt * (reduce ? 0.15 : 1);
    cx += (px - cx) * 0.05; cy += (py - cy) * 0.05;
    const u = bg.material.uniforms;
    u.uT.value = t; u.uM.value.set(cx, cy);
    // move both canvases back over the viewport; they scroll with the page in between
    canvasTop = scrollY - vpH * OV;
    const tf = `translate3d(0,${canvasTop}px,0)`;
    B.renderer.domElement.style.transform = tf; T.renderer.domElement.style.transform = tf;
    u.uS.value = scrollY / vpH;
    u.uHero.value = Math.max(0, 1 - scrollY / (vpH * 0.9));
    for (const p of B.props) place(p, dt);
    B.renderer.render(B.scene, B.camera);
    let shown = false;
    for (const p of T.props) shown = place(p, dt) || shown;
    if (shown || T.drew) T.renderer.render(T.scene, T.camera);
    T.drew = shown;
    placeBrackets();
    if (!ready) { ready = true; onReady?.(); }
  }

  // ── build everything declared in the markup ─────────────────────────────
  const fontP = new Promise(res => new FontLoader().load('./vendor/helvetiker_bold.typeface.json', res, undefined, () => res(null)));
  const roomy = innerWidth >= 760;
  const num = (el, k, d) => el.dataset[k] !== undefined ? +el.dataset[k] : d;

  let ticketData = {}, ticketObj = null;
  const BUILD = {
    hero:      (M) => Models.heroPiece(M),
    mark:      (M) => Models.apexMark(M.chrome, { depth: 0.34, bevel: 0.08 }),
    gauge:     (M) => Models.gauge(M),
    honeypot:  (M) => Models.honeypot(M),
    wallet:    (M) => Models.wallet(M),
    rug:       (M) => Models.rugBars(M),
    shield:    (M) => Models.shield(M),
    lens:      (M) => Models.lens(M, M.glass),
    key:       (M) => Models.key(M),
    terminal:  (M) => Models.terminal(M),
    plug:      (M) => Models.plug(M),
    mic:       (M) => Models.mic(M),
    coupe:     (M) => Models.coupe(M, M.glass),
    pin:       (M) => Models.pin(M),
    hoodie:    (M) => Models.hoodie(M),
    cap:       (M) => Models.cap(M),
    tote:      (M) => Models.tote(M),
    orb:       (M) => Models.liquidBlob(M.chrome, { radius: 1, detail: 48, amp: 0.13 }),
    ring:      (M) => Models.driftRing(M),
    minimark:  (M) => Models.apexMark(M.chrome, { depth: 0.3, bevel: 0.07 }),
    capsule:   (M) => Models.capsule(M),
    cube:      (M) => Models.glassCube(M),
    ticket:    (M) => Models.ticket(M, Models.ticketTexture(ticketData)),
  };
  const FONT_BUILD = {
    medallion: (M, el, f) => Models.medallion(M, f, el.dataset.text || 'AA'),
    podium:    (M, el, f) => Models.podium(M, f),
    numeral:   (M, el, f) => Models.numeral(M, f, el.dataset.text || el.textContent.trim(), num(el, 'depth', 0.34))
  };

  function optsFrom(el) {
    return {
      fit: num(el, 'fit', undefined), z: num(el, 'z', undefined), ox: num(el, 'ox', 0), oy: num(el, 'oy', 0),
      spin: num(el, 'spin', undefined), sway: num(el, 'sway', 0), tilt: num(el, 'tilt', 0), turn: num(el, 'turn', undefined),
      px: num(el, 'px', undefined), par: num(el, 'par', 0), lean: num(el, 'lean', undefined), drag: el.hasAttribute('data-drag'), grow: el.dataset.grow !== 'off'
    };
  }
  function mount(el, font) {
    const kind = el.dataset['3d'];
    const L = el.dataset.layer === 'top' ? T : B, M = L === T ? MT : MB;
    if (!roomy && el.dataset.mobile === 'off') return;
    let obj;
    if (BUILD[kind]) obj = BUILD[kind](M, el);
    else if (FONT_BUILD[kind] && font) obj = FONT_BUILD[kind](M, el, font);
    if (!obj) return;
    const p = attach(L, el, obj, optsFrom(el));
    if (kind === 'ticket') ticketObj = obj;
    if (kind === 'hero') { bracketTarget = obj.userData.mark; bracketHolder = p.holder; }
    if (kind === 'numeral') {
      // live numerals (the countdown): rebuild when the text in the DOM changes
      p.text = el.dataset.text || el.textContent.trim();
      p.onFrame = pp => {
        const now = el.dataset.text || el.textContent.trim();
        if (now === pp.text) return;
        pp.text = now;
        pp.holder.remove(pp.obj);
        pp.obj.traverse(o => o.geometry?.dispose());
        pp.obj = Models.numeral(M, font, now, num(el, 'depth', 0.34));
        const s = new THREE.Vector3(); new THREE.Box3().setFromObject(pp.obj).getSize(s);
        pp.w = s.x || 1; pp.h = s.y || 1;
        pp.holder.add(pp.obj);
      };
    }
    el.classList.add('has-3d');
  }

  const els = [...document.querySelectorAll('[data-3d]')];
  els.filter(el => BUILD[el.dataset['3d']]).forEach(el => { try { mount(el, null); } catch (e) { console.warn('3D', el.dataset['3d'], e); } });
  fontP.then(font => {
    els.filter(el => FONT_BUILD[el.dataset['3d']]).forEach(el => { try { mount(el, font); } catch (e) { console.warn('3D', el.dataset['3d'], e); } });
    if (!font) document.documentElement.classList.add('no-3d-type');
  });

  resize();
  requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => { active = !document.hidden; last = performance.now(); });

  return {
    setBrackets(el) { bracketEl = el; },
    /** Reprint the glass ticket with the guest's details. */
    setTicket(data) {
      ticketData = data;
      const face = ticketObj?.userData.face; if (!face) return;
      const old = face.material.map;
      face.material.map = Models.ticketTexture(data); face.material.needsUpdate = true;
      old?.dispose();
    },
    resize
  };
}
