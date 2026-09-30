// ═══════════════════════════════════════════════════════════════════════════
//  APEX AUDIT — model library
//
//  Every object on the page is built here from primitives and extruded
//  outlines. No external models. Materials come in as a set (M) so the same
//  object can be drawn on the opaque back layer (real glass) or on the
//  transparent overlay (glass faked with a frosted metal).
//
//  Each builder returns a Group centred on its own bounding box, so props spin
//  about themselves. A builder may put `userData.tick(t, dt)` on the group for
//  its own small animation (a needle sweeping, a cursor blinking).
// ═══════════════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { mergeVertices } from '../vendor/BufferGeometryUtils.js';
import { TextGeometry } from '../vendor/TextGeometry.js';
import { drawBadge } from './badge.js';

// ── shared helpers ─────────────────────────────────────────────────────────
export function centre(g) {
  const b = new THREE.Box3().setFromObject(g), c = new THREE.Vector3();
  b.getCenter(c);
  g.children.forEach(ch => ch.position.sub(c));
  return g;
}
const wrap = inner => { const g = new THREE.Group(); g.add(inner); return g; };
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };

/** Rounded slab: flat faces, quarter-round edges. Thin axis is Y. */
export function roundedSlab(width, thickness, cornerR, filletR, cornerSeg = 24, bevelSeg = 12) {
  const w = width / 2 - filletR, rc = Math.max(0.0001, cornerR - filletR);
  const pts = [];
  for (const [cx, cy, a0] of [[w - rc, -w + rc, -Math.PI / 2], [w - rc, w - rc, 0], [-w + rc, w - rc, Math.PI / 2], [-w + rc, -w + rc, Math.PI]]) {
    for (let i = 0; i <= cornerSeg; i++) {
      const a = a0 + (i / cornerSeg) * (Math.PI / 2);
      pts.push(new THREE.Vector2(cx + Math.cos(a) * rc, cy + Math.sin(a) * rc));
    }
  }
  const clean = pts.filter((p, i) => p.distanceTo(pts[(i + 1) % pts.length]) > 1e-9);
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(clean), {
    depth: Math.max(0.0001, thickness - 2 * filletR), bevelEnabled: true, bevelThickness: filletR,
    bevelSize: filletR, bevelOffset: 0, bevelSegments: bevelSeg, curveSegments: 1, steps: 1
  });
  geo.center();
  geo.rotateX(-Math.PI / 2);
  geo.deleteAttribute('normal'); geo.deleteAttribute('uv');
  const solid = mergeVertices(geo, 1e-4);
  solid.computeVertexNormals();
  const pos = solid.attributes.position, nor = solid.attributes.normal;
  const capY = thickness / 2, wallY = thickness / 2 - filletR, E = 1e-5;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (Math.abs(Math.abs(y) - capY) < E) nor.setXYZ(i, 0, Math.sign(y), 0);
    else if (Math.abs(Math.abs(y) - wallY) < E) {
      const nx = nor.getX(i), nz = nor.getZ(i), L = Math.hypot(nx, nz) || 1;
      nor.setXYZ(i, nx / L, 0, nz / L);
    }
  }
  nor.needsUpdate = true;
  return solid;
}
/** A slab stood up to face the camera: w wide, h tall, d deep. */
function panel(w, h, d, r, f, mat) {
  const m = new THREE.Mesh(roundedSlab(w, d, r, f), mat);
  m.rotation.x = Math.PI / 2;
  m.scale.z = h / w;
  return m;
}
const ext = (shape, depth, bevel, seg = 6, curve = 24) => {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: seg, curveSegments: curve });
  g.translate(0, 0, -depth / 2);
  return g;
};

/** Canvas texture with centred lines of type — prints on merch and plates. */
export function printTexture(lines, { w = 1024, h = 512, bg = null, color = '#E9EBEE', font = '"Geist", "Inter", Arial, sans-serif' } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); }
  const total = lines.reduce((a, l) => a + l.size * 1.18, 0);
  let y = (h - total) / 2;
  for (const l of lines) {
    x.font = `${l.weight || 700} ${l.size}px ${font}`;
    x.fillStyle = l.color || color;
    x.textAlign = 'center'; x.textBaseline = 'top';
    if (l.track) {
      const chars = [...l.text], ws = chars.map(ch => x.measureText(ch).width);
      const tw = ws.reduce((a, b) => a + b, 0) + l.track * (chars.length - 1);
      let cx = (w - tw) / 2; x.textAlign = 'left';
      chars.forEach((ch, i) => { x.fillText(ch, cx, y); cx += ws[i] + l.track; });
    } else x.fillText(l.text, w / 2, y);
    y += l.size * 1.18;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ── THE APEX MARK ──────────────────────────────────────────────────────────
// Two pieces traced from the logo: a leaning blade on the left, a notched
// wedge on the right, a clean split between them. [x, y, cornerRadius].
export const LOGO = [
  [[-0.096, 1.03, .2], [0.265, 0.943, .08], [-0.357, -0.557, .05], [-1.19, -1.02, .06]],
  [[0.291, 0.843, .05], [1.187, -1.02, .06], [-0.074, -0.6, .04], [-0.17, -0.47, .12]]
];
export function logoCorners(pts) {
  const n = pts.length;
  return pts.map(([x, y, r], i) => {
    const p = pts[(i - 1 + n) % n], q = pts[(i + 1) % n];
    const d1 = Math.hypot(p[0] - x, p[1] - y), d2 = Math.hypot(q[0] - x, q[1] - y);
    const rr = Math.min(r, d1 / 2, d2 / 2);
    return { a: [x + (p[0] - x) / d1 * rr, y + (p[1] - y) / d1 * rr], c: [x, y], b: [x + (q[0] - x) / d2 * rr, y + (q[1] - y) / d2 * rr] };
  });
}
export function logoSvgPath() {
  const f = v => v.toFixed(4);
  return LOGO.map(pts => logoCorners(pts).map((k, i) =>
    (i ? 'L' : 'M') + f(k.a[0]) + ' ' + f(-k.a[1]) + ' Q' + f(k.c[0]) + ' ' + f(-k.c[1]) + ' ' + f(k.b[0]) + ' ' + f(-k.b[1])).join(' ') + ' Z').join(' ');
}
export function apexMark(mat, { depth = 0.3, bevel = 0.07 } = {}) {
  const shapes = LOGO.map(pts => {
    const cs = logoCorners(pts), s = new THREE.Shape();
    s.moveTo(cs[0].a[0], cs[0].a[1]);
    cs.forEach((k, i) => { if (i) s.lineTo(k.a[0], k.a[1]); s.quadraticCurveTo(k.c[0], k.c[1], k.b[0], k.b[1]); });
    s.closePath(); return s;
  });
  const geo = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.65, bevelSegments: 10, curveSegments: 28 });
  geo.center(); geo.computeVertexNormals();
  return wrap(new THREE.Mesh(geo, mat));
}

// ── LIQUID GLASS BLOB ──────────────────────────────────────────────────────
// A sphere whose surface breathes. Displacement runs in the vertex shader and
// the normal is rebuilt from two neighbouring displaced points, so the glass
// refracts and reflects as a true liquid surface, not a lit sphere.
const NOISE = /* glsl */`
vec3 m289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 m289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 perm(vec4 x){return m289(((x*34.)+1.)*x);}
vec4 tis(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=m289(i);
  vec4 p=perm(perm(perm(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=tis(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
uniform float uT; uniform float uAmp;
vec3 blobDisp(vec3 p){
  vec3 n=normalize(p);
  float d=snoise(n*.85+vec3(uT*.16,uT*.1,-uT*.12))*.78+snoise(n*1.6-vec3(uT*.2))*.16;
  return p+n*d*uAmp;
}`;
export function liquidBlob(mat, { radius = 1, detail = 64, amp = 0.16 } = {}) {
  const geo = new THREE.SphereGeometry(radius, detail * 2, detail);
  const m = mat.clone();
  const uniforms = { uT: { value: 0 }, uAmp: { value: amp } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + NOISE)
      .replace('#include <beginnormal_vertex>', `
        vec3 bT=normalize(abs(normal.y)>.99?cross(normal,vec3(1.,0.,0.)):cross(normal,vec3(0.,1.,0.)));
        vec3 bB=normalize(cross(normal,bT));
        float e=.012;
        vec3 bp0=blobDisp(position);
        vec3 bp1=blobDisp(position+bT*e);
        vec3 bp2=blobDisp(position+bB*e);
        vec3 objectNormal=normalize(cross(bp1-bp0,bp2-bp0));
        if(dot(objectNormal,normal)<0.)objectNormal=-objectNormal;
        #ifdef USE_TANGENT
          vec3 objectTangent=vec3(tangent.xyz);
        #endif`)
      .replace('#include <begin_vertex>', 'vec3 transformed=bp0;');
  };
  m.customProgramCacheKey = () => 'liquid-blob';
  const blob = new THREE.Mesh(geo, m);
  const g = wrap(blob);
  g.userData.tick = t => { uniforms.uT.value = t; };
  return g;
}

// ── HERO: the mark in front of a pool of liquid glass ──────────────────────
export function heroPiece(M) {
  const g = new THREE.Group();
  const mark = apexMark(M.chrome, { depth: 0.34, bevel: 0.08 });
  // Mark and glass turn together as one piece, so whether they touch depends only
  // on their spacing here. The blob is a lens (flattened in depth): its front sits just
  // behind the mark's back face (z ≈ 0.51) with a small gap, never through it.
  mark.position.z = 0.75;
  g.add(mark);
  const blob = liquidBlob(M.glass, { radius: 1.2, amp: 0.14 });
  blob.position.set(0.05, 0.02, -0.3);
  blob.scale.z = 0.55;                 // front = -0.3 + (1.2 + 0.14) * 0.55 ≈ 0.44
  g.add(blob);
  // a hairline orbit with three beads riding it
  const orbit = new THREE.Group();
  orbit.add(new THREE.Mesh(new THREE.TorusGeometry(1.78, 0.011, 12, 220), M.chrome));
  const beadGeo = new THREE.SphereGeometry(0.06, 24, 16);
  const beads = [0, 2.1, 4.2].map((a, i) => {
    const b = new THREE.Mesh(beadGeo, i === 0 ? M.lime : M.chrome);
    b.userData.a = a; orbit.add(b); return b;
  });
  orbit.rotation.set(1.18, 0.18, 0.2);
  orbit.position.z = -0.3;
  g.add(orbit);
  const orbit2 = new THREE.Mesh(new THREE.TorusGeometry(2.02, 0.006, 8, 220), M.satin);
  orbit2.rotation.set(1.32, -0.35, -0.4);
  orbit2.position.z = -0.3;
  g.add(orbit2);
  g.userData.mark = mark;
  g.userData.tick = (t) => {
    blob.userData.tick(t);
    beads.forEach(b => { const a = b.userData.a + t * 0.35; b.position.set(Math.cos(a) * 1.78, Math.sin(a) * 1.78, 0); });
    orbit.rotation.z = 0.2 + t * 0.05;
    orbit2.rotation.z = -0.4 - t * 0.03;
  };
  return g;
}

// ── DRIFTERS: small pieces floating deep behind the sections ───────────────
export function driftRing(M) {
  const inner = new THREE.Group();
  inner.add(mesh(new THREE.TorusGeometry(0.8, 0.13, 32, 120), M.chrome));
  inner.add(mesh(new THREE.TorusGeometry(0.8, 0.02, 10, 120), M.lime, 0, 0, 0.13));
  inner.rotation.x = 0.9;
  return wrap(inner);
}
export function capsule(M) {
  const inner = new THREE.Group();
  const a = mesh(new THREE.CapsuleGeometry(0.3, 0.7, 12, 32), M.chrome, 0, 0.35, 0);
  const b = mesh(new THREE.CapsuleGeometry(0.3, 0.7, 12, 32), M.graphite, 0, -0.35, 0);
  // two halves of a pill, joined by a hairline band
  a.scale.y = 0.5; b.scale.y = 0.5; a.position.y = 0.3; b.position.y = -0.3;
  inner.add(a, b, mesh(new THREE.CylinderGeometry(0.305, 0.305, 0.04, 32), M.lime));
  inner.rotation.z = 0.7;
  return wrap(inner);
}
export function glassCube(M) {
  const inner = new THREE.Group();
  inner.add(mesh(roundedSlab(1, 1, 0.22, 0.16), M.glass));
  const core = apexMark(M.chrome, { depth: 0.2, bevel: 0.05 }); core.scale.setScalar(0.28); inner.add(core);
  inner.rotation.set(0.5, 0.6, 0.2);
  return wrap(inner);
}

// ── TOOLS ──────────────────────────────────────────────────────────────────
export function gauge(M) {            // Token Risk Scanner
  const inner = new THREE.Group();
  const face = mesh(new THREE.CylinderGeometry(0.98, 0.98, 0.14, 72), M.graphite);
  face.rotation.x = Math.PI / 2; inner.add(face);
  const bezel = mesh(new THREE.TorusGeometry(0.98, 0.06, 18, 96), M.chrome); inner.add(bezel);
  const arc = mesh(new THREE.TorusGeometry(0.7, 0.055, 16, 96, Math.PI * 1.5), M.satin, 0, 0, 0.1);
  arc.rotation.z = -Math.PI / 4; inner.add(arc);
  const hot = mesh(new THREE.TorusGeometry(0.7, 0.062, 16, 40, Math.PI * 0.32), M.lime, 0, 0, 0.1);
  hot.rotation.z = -Math.PI / 4; inner.add(hot);
  const tickGeo = new THREE.BoxGeometry(0.035, 0.13, 0.04);
  for (let i = 0; i <= 12; i++) {
    const a = -Math.PI / 4 + (i / 12) * Math.PI * 1.5;
    const tk = mesh(tickGeo, M.chrome, Math.cos(a) * 0.52, Math.sin(a) * 0.52, 0.1);
    tk.rotation.z = a - Math.PI / 2; inner.add(tk);
  }
  const needle = new THREE.Group();
  const blade = mesh(new THREE.BoxGeometry(0.05, 0.62, 0.05), M.chrome, 0, 0.28, 0);
  needle.add(blade);
  needle.add(mesh(new THREE.SphereGeometry(0.04, 16, 12), M.lime, 0, 0.6, 0));
  needle.position.z = 0.16; inner.add(needle);
  inner.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.12, 32).rotateX(Math.PI / 2), M.chrome, 0, 0, 0.17));
  const g = wrap(inner);
  g.userData.tick = t => { needle.rotation.z = -0.9 + Math.sin(t * 0.9) * 0.55 + Math.sin(t * 2.3) * 0.08; };
  return g;
}

export function honeypot(M) {         // Honeypot Detector
  const inner = new THREE.Group();
  const jar = mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.05, 6), M.graphite);
  jar.rotation.y = Math.PI / 6; inner.add(jar);
  const band = mesh(new THREE.CylinderGeometry(0.615, 0.615, 0.07, 6), M.chrome, 0, 0.36, 0);
  band.rotation.y = Math.PI / 6; inner.add(band);
  const lid = mesh(new THREE.CylinderGeometry(0.68, 0.66, 0.16, 6), M.chrome, 0, 0.62, 0);
  lid.rotation.y = Math.PI / 6; inner.add(lid);
  inner.add(mesh(new THREE.SphereGeometry(0.1, 24, 16), M.chrome, 0, 0.78, 0));
  // honeycomb struck on the front face
  const cell = new THREE.CylinderGeometry(0.1, 0.1, 0.05, 6).rotateX(Math.PI / 2).rotateZ(Math.PI / 6);
  const apo = 0.6 * Math.cos(Math.PI / 6) - 0.01;
  [[-0.18, 0.05], [0, 0.05], [0.18, 0.05], [-0.09, -0.11], [0.09, -0.11], [0, -0.27], [-0.09, 0.21], [0.09, 0.21]].forEach(([x, y], i) =>
    inner.add(mesh(cell, i === 5 ? M.lime : M.satin, x, y, apo + 0.012)));
  // a single liquid drip escaping the lid
  const drip = new THREE.Group();
  drip.add(mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.3, 16), M.chrome, 0, -0.1, 0));
  const drop = mesh(new THREE.SphereGeometry(0.075, 20, 14), M.chrome, 0, -0.28, 0); drop.scale.y = 1.25; drip.add(drop);
  drip.position.set(0.2, 0.55, apo + 0.05); inner.add(drip);
  const g = wrap(inner);
  g.userData.tick = t => { const k = (t * 0.45) % 1; drop.position.y = -0.28 - k * 0.22; drop.scale.setScalar(1 - k * 0.3); drop.scale.y = 1.25 + k * 0.4; };
  return g;
}

export function wallet(M) {           // Wallet Risk Check
  const inner = new THREE.Group();
  // cards peeking out of the top
  const c1 = panel(1.2, 0.72, 0.04, 0.08, 0.018, M.chrome); c1.position.set(-0.12, 0.42, -0.06); c1.rotation.y = 0; c1.rotation.z = 0.06; inner.add(c1);
  const c2 = panel(1.2, 0.72, 0.04, 0.08, 0.018, M.satin); c2.position.set(0.08, 0.36, 0.04); c2.rotation.z = -0.05; inner.add(c2);
  inner.add(panel(1.6, 1.08, 0.42, 0.2, 0.1, M.graphite));
  const flap = panel(1.64, 0.5, 0.1, 0.12, 0.045, M.chrome); flap.position.set(0, 0.12, 0.2); inner.add(flap);
  const clasp = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 32).rotateX(Math.PI / 2), M.lime, 0.5, -0.06, 0.27); inner.add(clasp);
  const stitch = mesh(new THREE.BoxGeometry(1.36, 0.012, 0.01), M.satin, 0, -0.36, 0.215); inner.add(stitch);
  return wrap(inner);
}

export function rugBars(M) {          // Rug Pull Probability
  const inner = new THREE.Group();
  inner.add(mesh(roundedSlab(2.1, 0.08, 0.08, 0.03).scale(1, 1, 0.42), M.graphite, 0, -0.62, 0));
  [1.25, 0.95, 0.62, 0.3].forEach((h, i) => {
    const b = mesh(roundedSlab(0.3, h, 0.08, 0.06), i === 3 ? M.lime : (i % 2 ? M.satin : M.chrome), -0.66 + i * 0.44, -0.58 + h / 2, 0);
    if (i === 3) { b.rotation.z = -0.5; b.position.x += 0.12; b.position.y -= 0.06; }
    inner.add(b);
  });
  // the arrow falling across them
  const s = new THREE.Shape();
  s.moveTo(-1.0, 0.05); s.lineTo(0.62, 0.05); s.lineTo(0.62, 0.17); s.lineTo(0.95, 0); s.lineTo(0.62, -0.17); s.lineTo(0.62, -0.05); s.lineTo(-1.0, -0.05); s.closePath();
  const arrow = mesh(ext(s, 0.08, 0.025), M.chrome, 0.05, 0.28, 0.32);
  arrow.rotation.z = -0.52; inner.add(arrow);
  return wrap(inner);
}

export function shield(M) {           // Full Contract Audit
  const outline = sc => {
    const s = new THREE.Shape();
    s.moveTo(-0.82 * sc, 0.78 * sc); s.quadraticCurveTo(0, 1.02 * sc, 0.82 * sc, 0.78 * sc);
    s.lineTo(0.82 * sc, 0.12 * sc); s.quadraticCurveTo(0.8 * sc, -0.62 * sc, 0, -1.02 * sc);
    s.quadraticCurveTo(-0.8 * sc, -0.62 * sc, -0.82 * sc, 0.12 * sc); s.closePath();
    return s;
  };
  const inner = new THREE.Group();
  inner.add(mesh(ext(outline(1), 0.2, 0.07, 8), M.chrome));
  inner.add(mesh(ext(outline(0.8), 0.12, 0.03, 5), M.graphite, 0, 0, 0.12));
  const ck = new THREE.Shape();
  ck.moveTo(-0.4, 0.04); ck.lineTo(-0.12, -0.26); ck.lineTo(0.42, 0.32); ck.lineTo(0.31, 0.43); ck.lineTo(-0.12, -0.04); ck.lineTo(-0.29, 0.15); ck.closePath();
  inner.add(mesh(ext(ck, 0.08, 0.03, 5, 4), M.lime, 0, -0.02, 0.24));
  return wrap(inner);
}

export function lens(M, glassMat) {   // On-chain Forensics
  const inner = new THREE.Group();
  const glass = mesh(new THREE.SphereGeometry(0.58, 48, 32), glassMat || M.frost); glass.scale.z = 0.18; inner.add(glass);
  inner.add(mesh(new THREE.TorusGeometry(0.6, 0.065, 20, 88), M.chrome));
  inner.add(mesh(new THREE.TorusGeometry(0.54, 0.016, 12, 80), M.satin));
  const dir = -Math.PI / 4, LEN = 0.95;
  const grip = mesh(new THREE.CylinderGeometry(0.075, 0.09, LEN, 28), M.graphite, Math.cos(dir) * (0.6 + LEN / 2), Math.sin(dir) * (0.6 + LEN / 2), 0);
  grip.rotation.z = dir - Math.PI / 2; inner.add(grip);
  const fer = mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.16, 24), M.chrome, Math.cos(dir) * 0.68, Math.sin(dir) * 0.68, 0);
  fer.rotation.z = dir - Math.PI / 2; inner.add(fer);
  inner.add(mesh(new THREE.SphereGeometry(0.1, 24, 18), M.chrome, Math.cos(dir) * (0.6 + LEN), Math.sin(dir) * (0.6 + LEN), 0));
  inner.rotation.x = 0.16;
  return wrap(centre(inner));
}

export function key(M) {              // Access Control Check
  const inner = new THREE.Group();
  inner.add(mesh(new THREE.TorusGeometry(0.34, 0.1, 20, 64), M.chrome, -0.72, 0, 0));
  inner.add(mesh(new THREE.SphereGeometry(0.1, 20, 14), M.lime, -0.72, 0, 0));
  inner.add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 1.25, 28).rotateZ(Math.PI / 2), M.chrome, 0.2, 0, 0));
  [[0.55, 0.26], [0.72, 0.18], [0.84, 0.3]].forEach(([x, h]) => inner.add(mesh(new THREE.BoxGeometry(0.1, h, 0.12), M.satin, x, -h / 2 - 0.02, 0)));
  inner.add(mesh(new THREE.TorusGeometry(0.1, 0.03, 12, 32).rotateY(Math.PI / 2), M.satin, -0.3, 0, 0));
  return wrap(centre(inner));
}

// ── SETUP ──────────────────────────────────────────────────────────────────
export function terminal(M) {
  const inner = new THREE.Group();
  inner.add(panel(1.7, 1.06, 0.12, 0.12, 0.04, M.graphite));
  const bar = panel(1.7, 0.16, 0.13, 0.06, 0.03, M.satin); bar.position.set(0, 0.46, 0.005); inner.add(bar);
  [[-0.72, M.lime], [-0.62, M.satin], [-0.52, M.satin]].forEach(([x, m]) => inner.add(mesh(new THREE.SphereGeometry(0.028, 12, 10), m, x, 0.46, 0.08)));
  const rows = [[0.62, 0.22, M.chrome], [0.9, 0.08, M.satin], [0.7, -0.06, M.satin], [0.46, -0.2, M.satin]];
  inner.add(mesh(new THREE.BoxGeometry(0.08, 0.06, 0.02), M.lime, -0.72, 0.22, 0.07));
  rows.forEach(([w, y, m]) => inner.add(mesh(new THREE.BoxGeometry(w, 0.05, 0.02), m, -0.64 + w / 2, y, 0.07)));
  const cursor = mesh(new THREE.BoxGeometry(0.07, 0.1, 0.02), M.lime, -0.66, -0.34, 0.07); inner.add(cursor);
  const g = wrap(inner);
  g.userData.tick = t => { cursor.visible = (t % 1.1) < 0.6; };
  return g;
}
export function plug(M) {
  const inner = new THREE.Group();
  inner.add(mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.72, 40), M.graphite));
  inner.add(mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.12, 40), M.chrome, 0, 0.36, 0));
  [-0.13, 0.13].forEach(x => inner.add(mesh(roundedSlab(0.08, 0.42, 0.02, 0.015), M.chrome, x, 0.62, 0)));
  inner.add(mesh(new THREE.TorusGeometry(0.3, 0.02, 10, 48).rotateX(Math.PI / 2), M.lime, 0, -0.1, 0));
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.36, 0), new THREE.Vector3(0, -0.75, 0.05), new THREE.Vector3(0.35, -1.05, 0.1), new THREE.Vector3(0.9, -1.0, 0)]);
  inner.add(mesh(new THREE.TubeGeometry(curve, 48, 0.07, 14), M.graphite));
  inner.rotation.z = -0.5;
  return wrap(centre(inner));
}

// ── EVENT ──────────────────────────────────────────────────────────────────
export function mic(M) {
  const inner = new THREE.Group();
  inner.add(mesh(new THREE.SphereGeometry(0.36, 40, 28), M.satin, 0, 0.5, 0));
  for (let i = -2; i <= 2; i++) {
    const r = Math.sqrt(0.36 * 0.36 - (i * 0.1) ** 2) + 0.01;
    inner.add(mesh(new THREE.TorusGeometry(r, 0.012, 8, 48).rotateX(Math.PI / 2), M.chrome, 0, 0.5 + i * 0.1, 0));
  }
  inner.add(mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.62, 32), M.graphite, 0, 0.0, 0));
  inner.add(mesh(new THREE.TorusGeometry(0.2, 0.03, 12, 40).rotateX(Math.PI / 2), M.lime, 0, 0.18, 0));
  inner.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.6, 16), M.chrome, 0, -0.6, 0));
  inner.add(mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.08, 48), M.chrome, 0, -0.92, 0));
  inner.rotation.z = -0.18;
  return wrap(centre(inner));
}
export function coupe(M, glassMat) {  // networking + bar
  const inner = new THREE.Group();
  const bowl = new THREE.LatheGeometry([
    new THREE.Vector2(0.02, 0), new THREE.Vector2(0.3, 0.06), new THREE.Vector2(0.58, 0.22), new THREE.Vector2(0.66, 0.36), new THREE.Vector2(0.64, 0.38)
  ], 64);
  inner.add(mesh(bowl, glassMat || M.frost, 0, 0.35, 0));
  const liquid = mesh(new THREE.CylinderGeometry(0.56, 0.02, 0.26, 48), M.lime, 0, 0.5, 0); liquid.material = M.lime; inner.add(liquid);
  inner.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.72, 16), M.chrome, 0, -0.02, 0));
  inner.add(mesh(new THREE.CylinderGeometry(0.36, 0.4, 0.05, 48), M.chrome, 0, -0.38, 0));
  inner.add(mesh(new THREE.SphereGeometry(0.08, 20, 14), M.graphite, 0.22, 0.66, 0.1));
  inner.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 8).rotateZ(0.9), M.chrome, 0.1, 0.78, 0.1));
  return wrap(centre(inner));
}
export function pin(M) {
  const inner = new THREE.Group();
  inner.add(mesh(new THREE.SphereGeometry(0.42, 40, 28), M.chrome, 0, 0.5, 0));
  inner.add(mesh(new THREE.ConeGeometry(0.3, 0.72, 40).rotateX(Math.PI), M.chrome, 0, 0.06, 0));
  inner.add(mesh(new THREE.SphereGeometry(0.16, 24, 16), M.graphite, 0, 0.52, 0.3));
  inner.add(mesh(new THREE.TorusGeometry(0.34, 0.022, 10, 64).rotateX(Math.PI / 2), M.lime, 0, -0.3, 0));
  inner.add(mesh(new THREE.TorusGeometry(0.55, 0.012, 8, 64).rotateX(Math.PI / 2), M.satin, 0, -0.3, 0));
  return wrap(centre(inner));
}

// ── MERCH ──────────────────────────────────────────────────────────────────
export function hoodie(M) {
  const s = new THREE.Shape();
  s.moveTo(-0.26, 0.92);
  s.quadraticCurveTo(-0.46, 0.9, -0.64, 0.82);
  s.quadraticCurveTo(-0.86, 0.66, -0.98, 0.3);
  s.lineTo(-1.1, -0.36); s.quadraticCurveTo(-1.02, -0.44, -0.84, -0.42);
  s.lineTo(-0.7, 0.14);
  s.lineTo(-0.66, -0.9); s.quadraticCurveTo(0, -0.98, 0.66, -0.9);
  s.lineTo(0.7, 0.14);
  s.lineTo(0.84, -0.42); s.quadraticCurveTo(1.02, -0.44, 1.1, -0.36);
  s.lineTo(0.98, 0.3);
  s.quadraticCurveTo(0.86, 0.66, 0.64, 0.82);
  s.quadraticCurveTo(0.46, 0.9, 0.26, 0.92);
  s.quadraticCurveTo(0.36, 1.32, 0, 1.36);
  s.quadraticCurveTo(-0.36, 1.32, -0.26, 0.92);
  const inner = new THREE.Group();
  inner.add(mesh(ext(s, 0.22, 0.12, 6, 20), M.fabric));
  // hood opening
  const hole = new THREE.Shape(); hole.absellipse(0, 0, 0.2, 0.2, 0, Math.PI * 2);
  const op = mesh(ext(hole, 0.04, 0.02, 3), M.graphite, 0, 1.06, 0.23); op.scale.y = 0.85; inner.add(op);
  // pocket
  const p = new THREE.Shape();
  p.moveTo(-0.42, -0.2); p.lineTo(0.42, -0.2); p.lineTo(0.5, -0.66); p.lineTo(-0.5, -0.66); p.closePath();
  inner.add(mesh(ext(p, 0.04, 0.02, 3, 4), M.fabric, 0, 0, 0.225));
  // drawstrings
  [-0.12, 0.12].forEach(x => {
    inner.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.42, 10), M.satin, x, 0.66, 0.25));
    inner.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 12), M.chrome, x, 0.43, 0.25));
  });
  // "DO YOUR AUDIT" across the chest
  const tex = printTexture([{ text: 'DO YOUR AUDIT', size: 104, track: 14 }], { w: 1024, h: 180 });
  const print = mesh(new THREE.PlaneGeometry(0.9, 0.16), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }), 0, 0.22, 0.237);
  inner.add(print);
  return wrap(centre(inner));
}
export function cap(M) {
  const inner = new THREE.Group();
  const crown = mesh(new THREE.SphereGeometry(0.62, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), M.fabric);
  crown.scale.y = 0.82; inner.add(crown);
  inner.add(mesh(new THREE.CircleGeometry(0.62, 48).rotateX(Math.PI / 2), M.graphite));
  for (let i = 0; i < 6; i++) {
    const seam = mesh(new THREE.TorusGeometry(0.625, 0.006, 6, 40, Math.PI / 2), M.satin);
    seam.rotation.y = i * Math.PI / 3; seam.scale.y = 0.82; inner.add(seam);
  }
  inner.add(mesh(new THREE.SphereGeometry(0.05, 16, 12), M.chrome, 0, 0.51, 0));
  // brim: the front half of an ellipse, laid flat and pointing forward
  const bs = new THREE.Shape(); bs.moveTo(-0.6, 0); bs.absellipse(0, 0, 0.6, 0.74, Math.PI, 2 * Math.PI, false); bs.lineTo(-0.6, 0);
  const brim = new THREE.Mesh(new THREE.ExtrudeGeometry(bs, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 3, curveSegments: 32 }), M.graphite);
  brim.rotation.x = -Math.PI / 2 - 0.1; brim.position.set(0, 0.0, 0.02); inner.add(brim);
  // the green scan line on the brim
  const scan = mesh(new THREE.TorusGeometry(0.6, 0.012, 6, 60, Math.PI), M.lime);
  scan.rotation.x = Math.PI / 2 - 0.1; scan.scale.y = 0.74 / 0.6 * 0.86; scan.position.set(0, 0.035, 0.02); inner.add(scan);
  const mark = apexMark(M.chrome, { depth: 0.06, bevel: 0.02 }); mark.scale.setScalar(0.13); mark.position.set(0, 0.26, 0.545); mark.rotation.x = -0.5; inner.add(mark);
  inner.rotation.x = 0.28;
  return wrap(centre(inner));
}
export function tote(M) {
  const inner = new THREE.Group();
  inner.add(panel(1.3, 1.34, 0.16, 0.08, 0.05, M.canvas));
  [-1, 1].forEach(side => {
    const h = mesh(new THREE.TorusGeometry(0.28, 0.035, 12, 40, Math.PI), M.graphite, side * 0.3, 0.64, side * 0.03);
    inner.add(h);
  });
  const tex = printTexture([
    { text: 'CHECK BEFORE', size: 92, track: 8, color: '#101114' },
    { text: 'YOU INVEST', size: 92, track: 8, color: '#101114' }
  ], { w: 1024, h: 300 });
  inner.add(mesh(new THREE.PlaneGeometry(1.0, 0.3), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }), 0, -0.12, 0.085));
  const mark = apexMark(M.chrome, { depth: 0.05, bevel: 0.015 }); mark.scale.setScalar(0.12); mark.position.set(0, 0.26, 0.09); inner.add(mark);
  return wrap(centre(inner));
}

// ── PEOPLE, RANKS ──────────────────────────────────────────────────────────
export function medallion(M, font, initials) {
  const inner = new THREE.Group();
  inner.add(mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.16, 80).rotateX(Math.PI / 2), M.graphite));
  inner.add(mesh(new THREE.TorusGeometry(0.9, 0.07, 20, 96), M.chrome));
  inner.add(mesh(new THREE.TorusGeometry(0.74, 0.012, 8, 96), M.satin, 0, 0, 0.085));
  inner.add(mesh(new THREE.TorusGeometry(0.74, 0.012, 8, 96), M.satin, 0, 0, -0.085));
  if (font) {
    const geo = new TextGeometry(initials, { font, size: 0.52, depth: 0.08, curveSegments: 10, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.014, bevelSegments: 3 });
    geo.computeBoundingBox(); const b = geo.boundingBox;
    geo.translate(-(b.max.x + b.min.x) / 2, -(b.max.y + b.min.y) / 2, 0);
    inner.add(mesh(geo, M.chrome, 0, 0, 0.07));
    const back = mesh(geo, M.chrome, 0, 0, -0.07); back.rotation.y = Math.PI; inner.add(back);
  }
  return wrap(inner);
}
export function podium(M, font) {
  const inner = new THREE.Group();
  const spots = [[-1.05, 0.78, M.silver, '2'], [0, 1.12, M.gold, '1'], [1.05, 0.56, M.bronze, '3']];
  inner.add(mesh(roundedSlab(3.4, 0.08, 0.2, 0.03).scale(1, 1, 0.42), M.graphite, 0, -0.04, 0));
  const markers = [];
  spots.forEach(([x, h, mat, n]) => {
    inner.add(mesh(roundedSlab(0.96, h, 0.12, 0.07), mat, x, h / 2, 0));
    const mk = new THREE.Object3D(); mk.position.set(x, h + (n === '1' ? 0.3 : 0.12), 0); mk.userData.rank = +n;
    inner.add(mk); markers.push(mk);
    if (font) {
      const geo = new TextGeometry(n, { font, size: 0.34, depth: 0.06, curveSegments: 10, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 3 });
      geo.computeBoundingBox(); const b = geo.boundingBox;
      geo.translate(-(b.max.x + b.min.x) / 2, -(b.max.y + b.min.y) / 2, 0);
      inner.add(mesh(geo, M.graphite, x, h * 0.55, 0.48));
    }
  });
  inner.add(mesh(new THREE.TorusGeometry(0.2, 0.03, 12, 48).rotateX(Math.PI / 2), M.lime, 0, 1.3, 0));
  inner.rotation.x = 0.05;          // just enough to see the tops, no forward lean
  const g = wrap(centre(inner)); g.userData.markers = markers;
  return g;
}

/** A 3D numeral string, centred. */
export function numeral(M, font, text, depth = 0.34) {
  const geo = new TextGeometry(text, { font, size: 1, depth, curveSegments: 12, bevelEnabled: true, bevelThickness: depth * 0.12, bevelSize: depth * 0.07, bevelSegments: 5 });
  geo.computeBoundingBox(); const b = geo.boundingBox;
  geo.translate(-(b.max.x + b.min.x) / 2, -(b.max.y + b.min.y) / 2, -(b.max.z + b.min.z) / 2);
  const m = new THREE.Mesh(geo, M.chrome);
  const g = wrap(m);
  g.userData.w = b.max.x - b.min.x; g.userData.h = b.max.y - b.min.y;
  return g;
}

// ── TICKET — a glass pass with the badge printed inside ────────────────────
export function ticketTexture(data) {
  const t = new THREE.CanvasTexture(drawBadge(data)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true;
  return t;
}
/** A rounded rectangle slab (true proportions, not a scaled square): w × l footprint, t thick along Y. */
export function roundedBox(w, l, t, cornerR, filletR, cornerSeg = 24, bevelSeg = 10) {
  const hx = w / 2 - filletR, hz = l / 2 - filletR, rc = Math.max(0.0001, cornerR - filletR);
  const pts = [];
  for (const [cx, cy, a0] of [[hx - rc, -hz + rc, -Math.PI / 2], [hx - rc, hz - rc, 0], [-hx + rc, hz - rc, Math.PI / 2], [-hx + rc, -hz + rc, Math.PI]])
    for (let i = 0; i <= cornerSeg; i++) { const a = a0 + (i / cornerSeg) * (Math.PI / 2); pts.push(new THREE.Vector2(cx + Math.cos(a) * rc, cy + Math.sin(a) * rc)); }
  const clean = pts.filter((p, i) => p.distanceTo(pts[(i + 1) % pts.length]) > 1e-9);
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(clean), {
    depth: Math.max(0.0001, t - 2 * filletR), bevelEnabled: true, bevelThickness: filletR, bevelSize: filletR,
    bevelOffset: 0, bevelSegments: bevelSeg, curveSegments: 1, steps: 1 });
  geo.center(); geo.rotateX(-Math.PI / 2);
  geo.deleteAttribute('normal'); geo.deleteAttribute('uv');
  const solid = mergeVertices(geo, 1e-4); solid.computeVertexNormals();
  const pos = solid.attributes.position, nor = solid.attributes.normal, capY = t / 2, wallY = t / 2 - filletR, E = 1e-5;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (Math.abs(Math.abs(y) - capY) < E) nor.setXYZ(i, 0, Math.sign(y), 0);
    else if (Math.abs(Math.abs(y) - wallY) < E) { const nx = nor.getX(i), nz = nor.getZ(i), L = Math.hypot(nx, nz) || 1; nor.setXYZ(i, nx / L, 0, nz / L); }
  }
  nor.needsUpdate = true;
  return solid;
}
/** Flat rounded rectangle in XY, with UVs spanning 0..1 so a texture fills it exactly. */
function roundedPlane(w, h, r, seg = 16) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ShapeGeometry(s, seg);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - x) / w, (p.getY(i) - y) / h);
  uv.needsUpdate = true;
  return g;
}
export function ticket(M, tex) {
  const inner = new THREE.Group();
  // the printed face keeps the badge's exact 16:9 proportions; the glass is a hair larger all round
  const FW = 2.32, FH = FW * 1152 / 2048, INSET = 0.045, TW = FW + INSET * 2, TH = FH + INSET * 2, TD = 0.09, R = 0.17;
  const body = new THREE.Mesh(roundedBox(TW, TH, TD, R, 0.035), M.clear || M.glass);
  body.rotation.x = Math.PI / 2; inner.add(body);
  const face = new THREE.Mesh(roundedPlane(FW, FH, R - INSET), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  face.position.z = TD / 2 + 0.002; inner.add(face);
  const back = new THREE.Mesh(roundedPlane(FW, FH, R - INSET), new THREE.MeshStandardMaterial({ color: 0x15161a, metalness: 0.6, roughness: 0.35 }));
  back.rotation.y = Math.PI; back.position.z = -TD / 2 - 0.002; inner.add(back);
  const mark = apexMark(M.chrome, { depth: 0.05, bevel: 0.015 }); mark.scale.setScalar(0.3); mark.rotation.y = Math.PI; mark.position.z = -TD / 2 - 0.03; inner.add(mark);
  const g = wrap(inner); g.userData.face = face;
  return g;
}
