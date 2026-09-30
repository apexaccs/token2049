// ═══════════════════════════════════════════════════════════════════════════
//  The guest pass, drawn to a canvas. One drawing serves both the 3D glass
//  ticket (as its printed face) and the badge the guest downloads.
//  No three.js here, so the download works even without WebGL.
// ═══════════════════════════════════════════════════════════════════════════
export const BADGE_W = 2048, BADGE_H = 1152;

export function shortAddr(a) { return a && a.length > 12 ? a.slice(0, 6) + '...' + a.slice(-4) : (a || ''); }

/** @param {{name?:string, company?:string, role?:string, type?:string, wallet?:string}} d */
export function drawBadge(d = {}, canvas = document.createElement('canvas')) {
  const W = BADGE_W, H = BADGE_H;
  canvas.width = W; canvas.height = H;
  const x = canvas.getContext('2d');
  const font = '"PP Pangram Sans", "Inter", Arial, sans-serif', mono = '"Geist Mono", "JetBrains Mono", Consolas, monospace';
  const empty = !d.name || !d.name.trim();

  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#2a2d33'); g.addColorStop(0.45, '#15161a'); g.addColorStop(1, '#0a0b0d');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(255,255,255,.035)'; x.lineWidth = 2;
  for (let i = -H; i < W; i += 26) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + H * 0.6, H); x.stroke(); }

  const stub = W * 0.72;
  x.setLineDash([14, 16]); x.strokeStyle = 'rgba(255,255,255,.22)'; x.lineWidth = 4;
  x.beginPath(); x.moveTo(stub, 60); x.lineTo(stub, H - 60); x.stroke(); x.setLineDash([]);
  const lg = x.createLinearGradient(0, 0, stub, 0);
  lg.addColorStop(0, 'rgba(198,242,78,0)'); lg.addColorStop(0.5, 'rgba(198,242,78,.95)'); lg.addColorStop(1, 'rgba(198,242,78,0)');
  x.fillStyle = lg; x.fillRect(0, H * 0.5 - 2, stub, 4);

  x.textAlign = 'left';
  x.fillStyle = 'rgba(255,255,255,.55)'; x.font = `500 40px ${mono}`;
  x.fillText("DON'T GET PLAYED · TOKEN2049 SECURITY ROOM · OCT 6 2026", 110, 150);

  // name: shrink to fit the space left of the stub
  const name = empty ? 'Your name' : d.name.trim();
  let size = 190;
  x.font = `600 ${size}px ${font}`;
  while (x.measureText(name).width > stub - 200 && size > 80) { size -= 6; x.font = `600 ${size}px ${font}`; }
  if (empty) { x.fillStyle = 'rgba(255,255,255,.18)'; }
  else {
    const sg = x.createLinearGradient(0, 430 - size, 0, 430);
    sg.addColorStop(0, '#ffffff'); sg.addColorStop(0.45, '#cfd3d8'); sg.addColorStop(0.55, '#8a9098'); sg.addColorStop(1, '#eceef1');
    x.fillStyle = sg;
  }
  x.fillText(name, 104, 430);

  const sub = [d.company, d.role].filter(Boolean).join(' · ');
  x.fillStyle = sub ? '#A9AEB6' : 'rgba(255,255,255,.18)'; x.font = `500 60px ${font}`;
  x.fillText(sub || 'Company · Role', 110, 520);

  const type = (d.type || 'STANDARD').toUpperCase();
  x.font = `600 46px ${mono}`;
  const tw = x.measureText(type).width + 60;
  x.strokeStyle = 'rgba(255,255,255,.3)'; x.lineWidth = 3; x.strokeRect(110, 640, tw, 92);
  x.fillStyle = '#E9EBEE'; x.fillText(type, 140, 702);

  x.fillStyle = 'rgba(255,255,255,.45)'; x.font = `500 36px ${mono}`;
  x.fillText('VENUE', 110, 880); x.fillText('TIME', 800, 880);
  x.fillStyle = '#EDEEF0'; x.font = `600 58px ${font}`;
  x.fillText('The Singapore EDITION', 110, 950); x.fillText('16:00 – 21:00 SGT', 800, 950);
  if (!empty) { x.fillStyle = '#C6F24E'; x.font = `500 38px ${mono}`; x.fillText('✓ REGISTERED GUEST · FREE ENTRY', 110, 1062); }

  // QR placeholder, seeded by the guest's email so each pass gets its own pattern
  const q = 380, qx = stub + (W - stub - q) / 2, qy = 300;
  x.fillStyle = '#E9EBEE'; x.fillRect(qx - 24, qy - 24, q + 48, q + 48);
  let seed = 0x1a2b3c4d;
  const key = d.seed || d.wallet || 'apex';
  for (const ch of key) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const code = (seed >>> 0).toString(16).toUpperCase().padStart(8, '0').slice(0, 6);
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const N = 25, cs = q / N; x.fillStyle = '#0B0C0E';
  const inF = (i, j) => (i < 8 && j < 8) || (i > 16 && j < 8) || (i < 8 && j > 16);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (!inF(i, j) && rnd() > 0.52) x.fillRect(qx + i * cs, qy + j * cs, cs + 0.5, cs + 0.5);
  [[0, 0], [18, 0], [0, 18]].forEach(([i, j]) => {
    x.fillStyle = '#0B0C0E'; x.fillRect(qx + i * cs, qy + j * cs, cs * 7, cs * 7);
    x.fillStyle = '#E9EBEE'; x.fillRect(qx + (i + 1) * cs, qy + (j + 1) * cs, cs * 5, cs * 5);
    x.fillStyle = '#0B0C0E'; x.fillRect(qx + (i + 2) * cs, qy + (j + 2) * cs, cs * 3, cs * 3);
  });
  x.fillStyle = 'rgba(255,255,255,.45)'; x.font = `500 34px ${mono}`; x.textAlign = 'center';
  x.fillText('SCAN AT ENTRANCE', stub + (W - stub) / 2, qy + q + 110);
  x.fillText(empty ? '#------' : '#' + code, stub + (W - stub) / 2, qy + q + 160);
  return canvas;
}
