/* SKIN DRIVER: melt-dichro glass (fc145) — WebGL2 mount per the gallery
   metal-core precedent, adapted to a single document-anchored canvas
   (the page-metal pattern): one fixed full-viewport canvas at z-index:-1,
   a scene built per-frame from sampled [data-skin] element rects, and the
   farm variant's shade() verbatim on top of a mini harness (SHARED-lite +
   DOM-rect scene + FOOTER, from the author's private gallery harness).

   Contract honoured:
   · mount gated on a WebGL2 probe; gating class html.glass-live added only
     on success — all shader-dressing CSS is scoped under it, so on failure
     the flat-CSS glass in glass.css stands untouched.
   · sampler checked LIVE per frame: html.skin-glass gone → clear + idle.
   · per-frame idempotent canvas sizing (no ResizeObserver), dpr capped 2.
   · teardown = unschedule + lose context + canvas.remove(). */

const MAX_RECTS = 32;
const HAIRLINE = 1.4; // px, the slab chamfer width from the panel scene

/* Response law (gallery plan 28 / CONTRACT-shell): scroll must never
   translate light. fc145 is a panel-era egg whose uniforms CAN pan the env;
   the egg stays verbatim — the LAW is enforced here, in what the venue
   feeds the uniforms:
   · 'shell' (default): uScroll pinned 0.5 (env orbit frozen), uScrollVel 0,
     uBandY parked at -500 (bandGlow renders as a no-op, per the contract).
     The melt keeps flowing on uTime; the dichroic film responds to angle.
   · 'archival': the panel-era response (scroll orbits the env, band flash
     sweeps) — the look of the farm capture, kept one flag away for A/B.
   Select with ?response=archival (stamped pre-paint in index.html). */
const RESPONSE = document.documentElement.dataset.vcbResponse === 'archival'
  ? 'archival' : 'shell';

const GLSL = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2  uRes;        // CSS px
uniform float uScale;      // dpr
uniform float uTime;
uniform float uTheme;      // 0 light .. 1 dark (eased)
uniform float uScroll;     // eased page progress 0..1
uniform float uScrollVel;  // smoothed |d scroll|, 0..1
uniform float uBandY;      // CSS px
uniform int   uCount;
uniform vec4  uRect[${MAX_RECTS}];  // x, y, w, h (CSS px, viewport space)
uniform vec4  uMeta[${MAX_RECTS}];  // radius, faceH, state, kindHint

const vec3 ACCENT_L = vec3(0.184, 0.427, 0.941); // #2f6df0
const vec3 ACCENT_D = vec3(0.435, 0.643, 1.000); // #6fa4ff

float themeMix(float a, float b){ return mix(a, b, uTheme); }
vec3  themeMix(vec3 a, vec3 b){ return mix(a, b, uTheme); }
mat2  h_rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }

float h_hash(vec2 q){ return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453123); }
float vnoise(vec2 q){
  vec2 i = floor(q), f = fract(q);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h_hash(i), h_hash(i + vec2(1, 0)), u.x),
             mix(h_hash(i + vec2(0, 1)), h_hash(i + vec2(1, 1)), u.x), u.y);
}
float grain(vec2 q, float aniso){ return h_hash(floor(q * 1.7)) - 0.5; }
float fresnel(vec3 N, vec3 V, float f0){
  return f0 + (1.0 - f0) * pow(clamp(1.0 - max(dot(N, V), 0.0), 0.0, 1.0), 5.0);
}
float bandGlow(vec2 p, float sig){ float d = (p.y - uBandY) / sig; return exp(-d * d); }
vec3 viewDir(vec2 p){
  vec2 q = (p - uRes * 0.5) / uRes.y;
  return normalize(vec3(q * 0.55, 1.0));
}
/* envMap verbatim from harness.js (scroll-orbited room + 3 softboxes) */
vec3 envMap(vec3 dir){
  vec3 d = normalize(dir);
  float yaw = (uScroll - 0.5) * 3.0 + uTime * 0.08;
  float pit = (uScroll - 0.5) * 0.6;
  d.xz = h_rot(yaw) * d.xz;
  d.yz = h_rot(pit) * d.yz;
  float v = d.y * 0.5 + 0.5;
  vec3 sky    = themeMix(vec3(0.92, 0.94, 0.98), vec3(0.10, 0.13, 0.20));
  vec3 ground = themeMix(vec3(0.46, 0.47, 0.50), vec3(0.03, 0.035, 0.05));
  vec3 c = mix(ground, sky, smoothstep(0.20, 0.80, v));
  float hb = d.y * 6.0; c += themeMix(vec3(0.22), vec3(0.09)) * exp(-hb * hb);
  float ke = pow(max(dot(d, normalize(vec3( 0.15, 0.92, 0.36))), 0.0), 60.0);
  float se = pow(max(dot(d, normalize(vec3(-0.80, 0.10, 0.59))), 0.0), 90.0);
  float fe = pow(max(dot(d, normalize(vec3( 0.55,-0.30, 0.78))), 0.0), 40.0);
  c += themeMix(vec3(1.20, 1.12, 0.98), vec3(0.85, 0.78, 0.62)) * ke;
  c += themeMix(vec3(0.85, 0.92, 1.10), vec3(0.45, 0.58, 0.95)) * se;
  c += themeMix(vec3(0.70, 0.74, 0.80), vec3(0.20, 0.24, 0.34)) * fe;
  return c;
}

struct Surf { float h; vec3 N; int kind; int id; float state; float aniso; };

float sdRR(vec2 q, vec2 b, float r){
  vec2 d = abs(q) - b + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

/* Scene from DOM rects. Later rects win (JS sorts plates before caps). */
float gH; int gKind; int gId; float gState; float gAniso;
void scene(vec2 p){
  gH = 0.0; gKind = 0; gId = 0; gState = 0.0; gAniso = 0.0;
  for (int i = 0; i < ${MAX_RECTS}; i++){
    if (i >= uCount) break;
    vec4 rc = uRect[i];
    vec2 half_ = rc.zw * 0.5;
    float sd = sdRR(p - rc.xy - half_, half_, uMeta[i].x);
    if (sd < 0.0){
      float FACE = uMeta[i].y;
      float HL = ${HAIRLINE.toFixed(1)};
      if (sd > -HL){ float t = (sd + HL) / HL; gH = FACE - t * HL; gKind = 2; }
      else         { gH = FACE; gKind = 1; }
      gId = i + 1; gState = uMeta[i].z;
    }
  }
}
float heightAt(vec2 p){ scene(p); return gH; }

/* ── variant: fc145 Melt Dichro Blue, verbatim ── */
vec2 fc_meltAdvect(vec2 p, Surf s) {
  float drift = uScroll * 92.0 + uTime * 9.0;
  float bandPull = bandGlow(p, 48.0) * 22.0 * uScrollVel;
  float ripple = vnoise(p * 0.014 + vec2(s.aniso * 0.4, -drift * 0.018));
  float meltY = -drift - bandPull;
  float meltX = (ripple - 0.5) * 16.0 * (0.35 + uScroll * 0.65);
  meltX += sin(p.y * 0.028 + uTime * 0.7) * 3.5 * uScrollVel;
  return p + vec2(meltX, meltY);
}
vec3 fc_dichroicTint(vec3 V, vec3 N, vec3 R, vec2 flow) {
  float cosT = clamp(abs(dot(N, V)), 0.02, 1.0);
  float phase = cosT * 4.2 + dot(R.xy, vec2(1.7, 2.3)) * 0.65;
  phase += (flow.x + flow.y) * 0.003 + uScroll * 1.8;
  float film = 0.5 + 0.5 * cos(phase * 6.283);
  vec3 orderLo = themeMix(vec3(0.04, 0.22, 0.38), vec3(0.01, 0.07, 0.18));
  vec3 orderMid = themeMix(vec3(0.12, 0.48, 0.62), vec3(0.08, 0.42, 0.78));
  vec3 orderHi = themeMix(vec3(0.86, 0.93, 0.97), vec3(0.62, 0.82, 1.0));
  float t = clamp(film, 0.0, 1.0);
  vec3 tint = mix(orderLo, orderMid, smoothstep(0.0, 0.55, t));
  tint = mix(tint, orderHi, smoothstep(0.45, 1.0, t));
  return tint;
}
float fc_silhouetteGate(vec2 p, Surf s, vec3 V) {
  float rim = fresnel(s.N, V, 0.88);
  float kindEdge = 0.0;
  if (s.kind == 2) kindEdge = 1.0;
  else if (s.kind == 3) kindEdge = 0.55;
  else if (s.kind == 4 || s.kind == 5) kindEdge = 0.32;
  float hR = heightAt(p + vec2(2.5, 0.0));
  float hU = heightAt(p + vec2(0.0, -2.5));
  float slope = clamp(abs(hR - s.h) + abs(hU - s.h), 0.0, 2.8) / 2.8;
  float band = bandGlow(p, 32.0);
  float gate = max(rim * 0.75, kindEdge);
  gate = max(gate, slope * 0.55);
  gate += band * (0.35 + kindEdge * 0.55 + rim * 0.35);
  return clamp(gate, 0.0, 1.0);
}
float fc_interiorCalm(Surf s) {
  float calm = 0.42;
  if (s.kind == 1) calm = 0.88;
  else if (s.kind == 6 || s.kind == 7) calm = 0.72;
  else if (s.kind == 4 || s.kind == 5) calm = 0.58;
  else if (s.kind == 0) calm = 0.95;
  return calm;
}
vec3 fc_cyanotypeBase(vec2 flow, Surf s) {
  vec2 fuv = flow * 0.011;
  float hatch = abs(sin(fuv.x * 38.0 + fuv.y * 22.0 + s.h * 0.35));
  hatch = smoothstep(0.82, 0.98, hatch);
  float contour = abs(fract(s.h * 0.24 + flow.y * 0.0055) - 0.5);
  contour = 1.0 - smoothstep(0.0, 0.11, contour);
  float paper = grain(flow, s.aniso) * 0.09;
  float ink = max(hatch * 0.35, contour * 0.55);
  vec3 cyanGround = themeMix(vec3(0.05, 0.30, 0.44), vec3(0.02, 0.09, 0.20));
  vec3 inkWhite = themeMix(vec3(0.91, 0.95, 0.98), vec3(0.48, 0.74, 0.96));
  vec3 base = mix(cyanGround, inkWhite, clamp(ink + paper, 0.0, 0.72));
  if (s.kind == 0) base = themeMix(vec3(0.04, 0.26, 0.40), vec3(0.01, 0.06, 0.15));
  return base;
}
vec3 shade(vec2 p, Surf s) {
  if (s.kind == 8) return themeMix(ACCENT_L, ACCENT_D);
  vec2 flow = fc_meltAdvect(p, s);
  vec3 V = viewDir(p);
  vec3 R = reflect(-V, s.N);
  vec3 envCol = envMap(R);
  vec3 Nedge = normalize(s.N + vec3((flow.x - p.x) * 0.007, (flow.y - p.y) * 0.007, 0.0));
  vec3 Redge = reflect(-V, Nedge);
  vec3 envEdge = envMap(Redge);
  vec3 dichro = fc_dichroicTint(V, s.N, R, flow);
  float sil = fc_silhouetteGate(p, s, V);
  float calm = fc_interiorCalm(s);
  vec3 mirrorBody = envCol * dichro;
  vec3 mirrorEdge = envEdge * fc_dichroicTint(V, Nedge, Redge, flow);
  vec3 mirrorMix = mix(mirrorBody, mirrorEdge, sil * 0.65);
  float reflW = (1.0 - calm) * 0.55 + sil * 0.72;
  reflW = clamp(reflW, 0.0, 1.0);
  vec3 base = fc_cyanotypeBase(flow, s);
  vec3 col = mix(base, mirrorMix, reflW);
  float darkGlow = themeMix(0.0, 0.28);
  if (uTheme > 0.5 && (s.kind == 4 || s.kind == 5 || s.kind == 6)) {
    col += base * darkGlow * (1.0 - sil * 0.6);
  }
  float lineFlash = bandGlow(p, 26.0) * sil;
  vec3 flashWhite = themeMix(vec3(0.94, 0.97, 1.0), vec3(0.70, 0.88, 1.0));
  col = mix(col, flashWhite, lineFlash * 0.55);
  if (s.state > 0.01) {
    vec3 accent = themeMix(ACCENT_L, ACCENT_D);
    col = mix(col, accent, clamp(s.state * 0.68, 0.0, 1.0));
  }
  return clamp(col, 0.0, 1.0);
}

/* FOOTER — pixel mapping + Surf assembly, verbatim pattern from harness.js */
void main(){
  vec2 p = vec2(gl_FragCoord.x, uRes.y * uScale - gl_FragCoord.y) / uScale;
  float H = heightAt(p);
  Surf s; s.h = H; s.kind = gKind; s.id = gId; s.state = gState; s.aniso = gAniso;
  float k = 0.9;
  s.N = normalize(vec3(-dFdx(H) * k * uScale, -dFdy(H) * k * uScale * -1.0, 1.0));
  vec3 c = shade(p, s);
  if (any(isnan(c)) || any(isinf(c))) c = vec3(1.0, 0.0, 1.0);
  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

const VERT = `#version 300 es
void main(){ vec2 v = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(v * 2.0 - 1.0, 0.0, 1.0); }`;

/* role → face height (px). Plates are slabs; caps sit proud (+2.4). */
const FACE_H = { bar: 9, face: 9, btn: 11.4, chip: 11.4 };
const ROLE_ORDER = { bar: 0, face: 0, btn: 1, chip: 1 };

let st = null; // driver state

function hasWebGL2() {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch { return false; }
}

const radiusCache = new WeakMap();
function readRadius(el) {
  let r = radiusCache.get(el);
  if (r === undefined) {
    r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    radiusCache.set(el, r);
  }
  return Math.min(r, el.offsetHeight / 2);
}

/* Region cache — geometry is read ONLY here, on observer/events (resize,
   mutation, font load), never on the frame hot path (plan 30 Locked #6:
   'zero per-frame layout reads'). The chrome lives in the sticky topbar,
   so cached viewport rects are scroll-invariant; per-frame work is just
   cheap state matches + uniform writes. */
let regions = [];

/* Interaction state is EVENT-driven, never queried per frame — matches()
   on the hot path forces style recalcs against a tree the CSS melt
   animation keeps perpetually dirty (measured ~500ms/frame). Pointer
   events maintain hover/press; latched state (.active / aria-pressed /
   aria-selected) is read at rebuild time, and attribute mutations queue
   a rebuild. */
const pointerState = new WeakMap(); // el → { hover: 0|1, press: 0|1 }

function buildRegions() {
  regions = [];
  const els = [...document.querySelectorAll('[data-skin]')];
  els.sort((a, b) => (ROLE_ORDER[a.dataset.skin] || 0) - (ROLE_ORDER[b.dataset.skin] || 0));
  for (const el of els) {
    if (regions.length >= MAX_RECTS) break;
    if (el.closest('[hidden]') || el.offsetWidth === 0) continue;
    const r = el.getBoundingClientRect();
    regions.push({
      el, x: r.left, y: r.top, w: r.width, h: r.height,
      radius: readRadius(el), faceH: FACE_H[el.dataset.skin] ?? 9,
      latch: el.matches('.active,[aria-pressed="true"],[aria-selected="true"]') ? 1 : 0,
    });
  }
}

function regionState(r) {
  const p = pointerState.get(r.el);
  if (p?.press || r.latch) return 1;
  return p?.hover ? 0.4 : 0;
}

function wirePointerState(listeners) {
  const upd = (el, patch) => {
    const s = pointerState.get(el) || { hover: 0, press: 0 };
    pointerState.set(el, Object.assign(s, patch));
  };
  const on = (ev, fn) => {
    document.addEventListener(ev, fn, { passive: true, capture: true });
    listeners.push([ev, fn, document, true]);
  };
  on('pointerover', e => { const el = e.target.closest?.('[data-skin]'); if (el) upd(el, { hover: 1 }); });
  on('pointerout', e => { const el = e.target.closest?.('[data-skin]'); if (el) upd(el, { hover: 0, press: 0 }); });
  on('pointerdown', e => { const el = e.target.closest?.('[data-skin]'); if (el) upd(el, { press: 1 }); });
  on('pointerup', e => { const el = e.target.closest?.('[data-skin]'); if (el) upd(el, { press: 0 }); });
}

export function mount() {
  if (st || !hasWebGL2()) return false;
  const canvas = document.createElement('canvas');
  canvas.id = 'glass-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;display:block;';
  document.body.insertBefore(canvas, document.body.firstChild);
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false });
  if (!gl) { canvas.remove(); return false; }

  const prog = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, GLSL]]) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn('[glass] shader compile failed:', gl.getShaderInfoLog(sh));
      canvas.remove();
      return false;
    }
    gl.attachShader(prog, sh);
  }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.remove(); return false; }
  gl.useProgram(prog);
  const U = {};
  for (const n of ['uRes', 'uScale', 'uTime', 'uTheme', 'uScroll', 'uScrollVel', 'uBandY', 'uCount', 'uRect', 'uMeta'])
    U[n] = gl.getUniformLocation(prog, n);

  const rectBuf = new Float32Array(MAX_RECTS * 4);
  const metaBuf = new Float32Array(MAX_RECTS * 4);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const t0 = performance.now();
  let scroll = 0, scrollVel = 0, lastScroll = 0, theme = document.documentElement.classList.contains('theme-dark') ? 1 : 0;

  st = { canvas, gl, raf: 0, observers: [], listeners: [] };

  // Geometry refresh on events only, debounced to one rebuild per burst.
  let rebuildQueued = false;
  const queueRebuild = () => {
    if (rebuildQueued) return;
    rebuildQueued = true;
    requestAnimationFrame(() => { rebuildQueued = false; buildRegions(); });
  };
  const mo = new MutationObserver(queueRebuild);
  mo.observe(document.body, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['hidden', 'class', 'aria-pressed', 'aria-selected'],
  });
  st.observers.push(mo);
  const onResize = queueRebuild;
  addEventListener('resize', onResize);
  st.listeners.push(['resize', onResize]);
  document.fonts?.ready.then(queueRebuild);
  wirePointerState(st.listeners);
  buildRegions();

  const loop = () => {
    st.raf = requestAnimationFrame(loop);
    const root = document.documentElement;
    if (!root.classList.contains('skin-glass')) { gl.clear(gl.COLOR_BUFFER_BIT); return; }
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      canvas.style.width = innerWidth + 'px';   // replaced element: intrinsic
      canvas.style.height = innerHeight + 'px'; // size wins unless pinned
      gl.viewport(0, 0, w, h);
    }
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const target = Math.min(1, Math.max(0, scrollY / max));
    scrollVel = Math.min(1, Math.abs(target - lastScroll) * 60) * 0.3 + scrollVel * 0.7;
    lastScroll = target;
    scroll += (target - scroll) * 0.12;
    const themeTarget = root.classList.contains('theme-dark') ? 1 : 0;
    theme += (themeTarget - theme) * 0.15;

    let n = 0;
    for (const r of regions) {
      if (!r.el.isConnected) { queueRebuild(); continue; }
      rectBuf.set([r.x, r.y, r.w, r.h], n * 4);
      metaBuf.set([r.radius, r.faceH, regionState(r), 0], n * 4);
      n++;
    }
    // Response law: 'shell' pins the orbit and parks the band (see RESPONSE).
    const uScroll = RESPONSE === 'archival' ? scroll : 0.5;
    const uBandY = RESPONSE === 'archival' ? -120 + scroll * (innerHeight + 240) : -500;
    gl.uniform2f(U.uRes, innerWidth, innerHeight);
    gl.uniform1f(U.uScale, dpr);
    gl.uniform1f(U.uTime, reduced ? 10 : (performance.now() - t0) / 1000);
    gl.uniform1f(U.uTheme, theme);
    gl.uniform1f(U.uScroll, uScroll);
    gl.uniform1f(U.uScrollVel, RESPONSE === 'archival' && !reduced ? scrollVel : 0);
    gl.uniform1f(U.uBandY, uBandY);
    gl.uniform1i(U.uCount, n);
    gl.uniform4fv(U.uRect, rectBuf);
    gl.uniform4fv(U.uMeta, metaBuf);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  // Demand gating: the melt is a named animation hold that runs only while
  // the tab is visible; hidden = zero GPU work (plan 30 idle doctrine).
  const onVisibility = () => {
    if (document.hidden) { cancelAnimationFrame(st.raf); }
    else { cancelAnimationFrame(st.raf); loop(); }
  };
  document.addEventListener('visibilitychange', onVisibility);
  st.listeners.push(['visibilitychange', onVisibility, document]);

  loop();
  document.documentElement.classList.add('glass-live');
  return true;
}

export function unmount() {
  if (!st) return;
  cancelAnimationFrame(st.raf);
  for (const o of st.observers) o.disconnect();
  for (const [ev, fn, target, capture] of st.listeners)
    (target || window).removeEventListener(ev, fn, { capture: !!capture });
  document.documentElement.classList.remove('glass-live');
  st.gl.getExtension('WEBGL_lose_context')?.loseContext();
  st.canvas.remove();
  st = null; // true idle: 0 contexts, 0 rAF, 0 observers (plan 30 §4)
}
