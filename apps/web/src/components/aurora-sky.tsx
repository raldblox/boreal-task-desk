"use client";

import { useEffect, useRef } from "react";

/*
 * The home page's night sky, rendered from the physics rather than drawn.
 *
 * Geometry. The observer stands on the ground looking north, the camera pitched 10° up, with
 * the Earth's curvature included (R = 6371 km). Each auroral arc is a thin sheet of light
 * hanging along the magnetic field: its foot runs east-west at a northward distance that folds
 * and sways with time, and with altitude it leans back toward the observer along field lines
 * dipping at I = 77° (cot I ≈ 0.23). Rays are field-aligned too, so in perspective they converge
 * toward the magnetic zenith, as they do in the real sky. A ray from the eye finds every place it
 * crosses a sheet; each crossing adds the sheet's column emission there, which grows where the
 * line of sight runs along the sheet (the bright edges of folds).
 *
 * Emission. Precipitating electrons deposit their energy in a Chapman-like layer with a sharp
 * lower border near 100–115 km and a long tail above it. Three lines follow from that:
 *   - O(¹S) 557.7 nm green, the bulk of the light, quenched by collisions below ~96 km;
 *   - N₂⁺ 427.8 nm violet, prompt, a third of the green, lying a little lower;
 *   - O(¹D) 630.0 nm red, from softer electrons higher up, and only above ~200 km, where the
 *     atom lives long enough (110 s) to radiate before a collision takes the energy away.
 * A broad, faint diffuse aurora glows under the arcs.
 *
 * Seeing it. Each line is converted with the CIE 1931 colour-matching functions, dimmed by
 * extinction through the air mass at its elevation (Rayleigh: blue loses most), then mixed with
 * what the rods see (scotopic V′), which is why faint aurora reads pale teal to the eye while
 * bright cores turn yellow-green. The sky behind is airglow, brighter toward the horizon (the
 * van Rhijn effect). Stars are drawn separately at full resolution and added on top, since
 * aurora is optically thin: starlight passes straight through it.
 */

const VERT = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uF;
uniform float uPitch;
uniform float uTime;
uniform float uExposure;
uniform float uCy;
uniform vec2 uPointer;
uniform float uStir;

const float RE = 6371.0;
const float COTI = 0.2309;
const int STEPS = 44;

float hash(float n) { return fract(sin(n) * 43758.5453123); }
float noise(float x) {
  float i = floor(x);
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash(i), hash(i + 1.0), f);
}

// Altitude at distance s along a ray of vertical component dy, on a spherical Earth.
float altAt(float s, float dy) { return sqrt(RE * RE + s * s + 2.0 * RE * s * dy) - RE; }
// Distance along that ray to the altitude h.
float distTo(float h, float dy) {
  float b = RE * dy;
  return -b + sqrt(b * b + (RE + h) * (RE + h) - RE * RE);
}

// Where the pointer is, as a bearing (tan of its azimuth), and how stirred the sky is (0 to 1).
float gBearing = 0.0;
float gStir = 0.0;

// An arc's foot: northward distance (km) as a function of eastward distance x, folding with time.
// Near the pointer's bearing the curtain bulges toward the observer, as a local surge would.
float arcFoot(float x, float Z, float ph, float t, out float slope) {
  float a1 = x * 0.0042 + ph + t * 0.011;
  float a2 = x * 0.0125 - ph * 1.7 - t * 0.026;
  float a3 = x * 0.039 + ph * 3.1 + t * 0.07;
  float u = (x / Z - gBearing) / 0.22;
  float bulge = gStir * 0.18 * Z * exp(-u * u);
  slope = 74.0 * 0.0042 * cos(a1) + 24.0 * 0.0125 * cos(a2) + 6.5 * 0.039 * cos(a3) + bulge * 2.0 * u / (0.22 * Z);
  return Z + 74.0 * sin(a1) + 24.0 * sin(a2) + 6.5 * sin(a3) - bulge;
}

// Brightness along an arc: rays a few km across drifting east at ~2.5 km/s, inside slower
// bright and dark stretches.
float rays(float u, float t, float ph) {
  float d = u + t * 2.5;
  float r = 0.5 * noise(d / 6.5 + ph) + 0.32 * noise(d / 2.6 + ph * 2.3) + 0.18 * noise(d / 18.0 - t * 0.04);
  r = pow(r, 2.4) * 2.6;
  float stretch = smoothstep(0.2, 0.85, noise(u / 170.0 - t * 0.010 + ph * 5.0));
  return r * (0.32 + 0.68 * stretch);
}

// Chapman-like layer: a sharp bottom (scale lo), a lengthening tail above (scale hi growing with height).
float layer(float h, float hm, float lo, float hi) {
  float y = h < hm ? (h - hm) / lo : (h - hm) / (hi + 0.16 * (h - hm));
  return exp(1.0 - y - exp(-y));
}

// Kasten-Young air mass for an elevation (radians).
float airMass(float el) {
  float deg = max(degrees(el), 0.0);
  return 1.0 / (sin(max(el, 0.0)) + 0.50572 * pow(deg + 6.07995, -1.6364));
}

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

void main() {
  vec2 c = gl_FragCoord.xy - vec2(0.5 * uRes.x, uCy);
  vec3 cam = normalize(vec3(c.x, c.y, uF));
  float cp = cos(uPitch), sp = sin(uPitch);
  vec3 d = vec3(cam.x, cam.y * cp + cam.z * sp, -cam.y * sp + cam.z * cp);
  float dy = d.y;
  float el = asin(clamp(dy, -1.0, 1.0));
  float t = uTime;

  // The pointer, through the same lens.
  vec2 pc = uPointer - vec2(0.5 * uRes.x, uCy);
  vec3 pcam = normalize(vec3(pc.x, pc.y, uF));
  vec3 pd = vec3(pcam.x, pcam.y * cp + pcam.z * sp, -pcam.y * sp + pcam.z * cp);
  gBearing = pd.x / max(pd.z, 0.1);
  gStir = uStir;

  // Airglow sky: van Rhijn brightening toward the horizon, layer at 95 km.
  float k = RE / (RE + 95.0);
  float vr = 1.0 / sqrt(max(1.0 - k * k * (1.0 - dy * dy), 0.02));
  vec3 sky = vec3(0.0055, 0.0185, 0.0235) * (0.6 + 0.1 * vr);

  float L428 = 0.0, L557 = 0.0, L630 = 0.0;
  if (dy > -0.02) {
    float s0 = distTo(86.0, dy);
    float s1 = min(distTo(430.0, dy), 2200.0);
    float ds = (s1 - s0) / float(STEPS);
    float act = 0.85 + 0.15 * sin(t * 0.05) + 0.1 * sin(t * 0.13 + 1.3);

    float pA = 0.0, pB = 0.0, pC = 0.0;
    for (int i = 0; i <= STEPS; i++) {
      float s = s0 + ds * float(i);
      float h = altAt(s, dy);
      float x = s * d.x;
      float zf = s * d.z + h * COTI; // the field line's footprint
      float slA, slB, slC;
      float fA = zf - arcFoot(x, 250.0, 0.0, t, slA);
      float fB = zf - arcFoot(x, 430.0, 2.1, t, slB);
      float fC = zf - arcFoot(x, 690.0, 4.4, t, slC);

      // Diffuse aurora: a broad, faint glow under the arcs.
      float diff = exp(-pow((zf - 560.0) / 240.0, 2.0)) * layer(h, 112.0, 5.0, 16.0);
      L557 += diff * ds * 0.0016;
      L428 += diff * ds * 0.0005;

      if (i > 0) {
        for (int a = 0; a < 3; a++) {
          float fp = a == 0 ? pA : (a == 1 ? pB : pC);
          float fc = a == 0 ? fA : (a == 1 ? fB : fC);
          if (fp * fc < 0.0) {
            float sx = s - ds + ds * fp / (fp - fc);
            float hx = altAt(sx, dy);
            float xx = sx * d.x;
            float Z = a == 0 ? 250.0 : (a == 1 ? 430.0 : 690.0);
            float ph = a == 0 ? 0.0 : (a == 1 ? 2.1 : 4.4);
            float strength = a == 0 ? 1.0 : (a == 1 ? 0.62 : 0.4);
            float sl;
            arcFoot(xx, Z, ph, t, sl);
            // Column emission through a sheet ~4 km thick, seen at this angle.
            vec3 n = normalize(vec3(-sl, COTI, 1.0));
            float col = 4.0 / max(abs(dot(n, d)), 0.25);
            float r = rays(xx, t, ph);
            float near = (xx / Z - gBearing) / 0.22;
            float surge = gStir * exp(-near * near);
            r *= 1.0 + 1.4 * surge;
            float hm = 104.0 + 9.0 * noise(xx / 45.0 + ph + t * 0.01) + 7.0 * noise(xx / 160.0 - ph) - 8.0 * surge;
            float tall = 0.6 + 1.3 * clamp(r, 0.0, 1.5);
            float q = layer(hx, hm, 4.2, 6.0 * tall);
            float quench = 1.0 / (1.0 + exp(-(hx - 96.0) / 2.5));
            float red = layer(hx, 235.0, 26.0, 40.0) / (1.0 + exp(-(hx - 205.0) / 18.0));
            float e = col * strength * act * r;
            L557 += e * q * quench;
            L428 += e * 0.33 * layer(hx, hm - 3.0, 3.8, 5.0 * tall);
            L630 += e * 0.11 * red * (0.4 + 0.6 * r);
          }
        }
      }
      pA = fA; pB = fB; pC = fC;
    }
  }

  // Extinction through the air mass (Rayleigh-dominated: violet loses the most).
  float X = airMass(max(el, 0.0));
  float T428 = exp(-0.30 * X), T557 = exp(-0.14 * X), T630 = exp(-0.09 * X);
  L428 *= T428; L557 *= T557; L630 *= T630;

  // CIE 1931 2° colour matching at each line, then XYZ to linear sRGB.
  vec3 XYZ = L428 * vec3(0.2535, 0.0097, 1.2346) + L557 * vec3(0.5566, 0.9973, 0.0047) + L630 * vec3(0.6424, 0.2650, 0.0);
  mat3 toRGB = mat3(3.2406, -0.9689, 0.0557, -1.5372, 1.8758, -0.2040, -0.4986, 0.0415, 1.0570);
  vec3 cone = toRGB * XYZ;
  // What the rods add (scotopic V′ at each line); they win where the light is faint.
  float rod = L428 * 0.177 + L557 * 0.364 + L630 * 0.0033;
  float Y = XYZ.y * uExposure;
  float w = 1.0 / (1.0 + Y / 0.35);
  vec3 seen = (cone * (1.0 - w) + vec3(0.34, 0.66, 0.74) * rod * 2.1 * w) * uExposure;
  // Pure spectral green lies outside sRGB: pull it toward its own luminance until it fits.
  float lum = dot(seen, vec3(0.2126, 0.7152, 0.0722));
  float lo = min(seen.r, min(seen.g, seen.b));
  if (lo < 0.0) seen = lum + (seen - lum) * (lum / max(lum - lo, 1e-5));

  vec3 col = sky + aces(max(seen, 0.0));
  col = pow(col, vec3(1.0 / 2.2));
  col += (hash(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

/** Where the horizon (elevation 0) falls, as a fraction of the height from the top. */
const HORIZON = 0.62;
/** The sky is soft: render it at most this many pixels across and let the browser scale it. */
const MAX_WIDTH = 760;

/**
 * The lens: pitched 10° up on wide screens; on narrow ones a wider lens (at least 64° across),
 * tilted further up so the horizon stays at the same height on the screen.
 */
function camera(width: number, height: number) {
  const tall = ((HORIZON - 0.5) * height) / Math.tan((10 * Math.PI) / 180);
  const f = Math.min(tall, width / (2 * Math.tan((32 * Math.PI) / 180)));
  return { f, pitch: Math.atan(((HORIZON - 0.5) * height) / f) };
}

/*
 * One sky clock for the whole site, in seconds of aurora time. The live sky advances it while it
 * is on screen; the still sky on other pages draws the moment it stopped, so both show the same
 * aurora, and coming back home resumes from there. Kept in memory across client navigations and
 * in sessionStorage across reloads; it starts at a moment with a full arc across the sky.
 */
const SKY_KEY = "boreal-sky-time";
const SKY_PAUSED = "boreal:sky-paused";
let skyClock: number | null = null;

function skyTime(): number {
  if (skyClock !== null) return skyClock;
  try {
    const saved = Number(sessionStorage.getItem(SKY_KEY));
    if (saved > 0) return (skyClock = saved);
  } catch {
    // Storage blocked: start fresh.
  }
  return (skyClock = 525);
}

function setSkyTime(t: number, persist: boolean) {
  skyClock = t;
  if (!persist) return;
  try {
    sessionStorage.setItem(SKY_KEY, t.toFixed(2));
  } catch {
    // Storage blocked: memory still carries it within this visit.
  }
}

type Star = { x: number; y: number; z: number; flux: number; tint: string; phase: number; speed: number };

/** Naked-eye stars in front of the observer: uniform over the sky, counts rising 10^0.5 per magnitude. */
function catalog(): Star[] {
  let seed = 9001;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const tints = ["#cfe0ff", "#e8efff", "#ffffff", "#fff4e0", "#ffe2bf"];
  const stars: Star[] = [];
  for (let i = 0; i < 1100; i++) {
    const az = (rand() - 0.5) * 2 * 1.45;
    const sinEl = -0.03 + rand() * 0.95;
    const el = Math.asin(sinEl);
    const m = Math.log10(Math.pow(10, 0.5 * 1) + rand() * (Math.pow(10, 0.5 * 6.2) - Math.pow(10, 0.5 * 1))) / 0.5;
    stars.push({
      x: Math.cos(el) * Math.sin(az),
      y: sinEl,
      z: Math.cos(el) * Math.cos(az),
      flux: Math.pow(10, -0.4 * (m - 6.2)),
      tint: tints[Math.floor(rand() * tints.length)],
      phase: rand() * Math.PI * 2,
      speed: 6 + rand() * 9,
    });
  }
  return stars;
}

/** w, h: the canvas; screen: the height of the first screen in the same pixels (the camera's frame). */
function drawStars(ctx: CanvasRenderingContext2D, stars: Star[], w: number, h: number, screen: number, dpr: number, t: number) {
  ctx.clearRect(0, 0, w, h);
  const { f, pitch } = camera(w, screen);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  for (const s of stars) {
    // World to camera: undo the pitch.
    const v = s.y * cp - s.z * sp;
    const depth = s.y * sp + s.z * cp;
    if (depth <= 0) continue;
    const px = w / 2 + (f * s.x) / depth;
    const py = screen / 2 - (f * v) / depth;
    if (px < -2 || px > w + 2 || py < -2 || py > h + 2) continue;
    const el = Math.asin(Math.max(s.y, 0.001));
    const X = 1 / (Math.sin(el) + 0.50572 * Math.pow((el * 180) / Math.PI + 6.07995, -1.6364));
    // Extinction (0.2 mag per air mass) and scintillation (stronger low down).
    const twinkle = 1 + Math.min(0.06 * Math.pow(X, 1.75), 0.6) * Math.sin(t * s.speed + s.phase);
    const flux = s.flux * Math.pow(10, -0.08 * X) * twinkle;
    const a = Math.min(0.9, 0.09 * flux);
    if (a < 0.05) continue;
    ctx.globalAlpha = a;
    ctx.fillStyle = s.tint;
    const r = (0.4 + 0.16 * Math.sqrt(flux)) * Math.sqrt(dpr);
    ctx.beginPath();
    ctx.arc(px, py, Math.min(r, 1.6 * dpr), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/**
 * The night sky and its stars. Live (the home hero): up to 30 frames a second while it's on screen
 * and the tab is visible, and the pointer stirs the aurora. Still (every other page), and for
 * people who ask for less motion: one frame, at the shared clock's moment. The CSS night gradient
 * behind it stays when WebGL isn't available.
 */
export function AuroraSky({ live = false, className = "" }: { live?: boolean; className?: string }) {
  const glRef = useRef<HTMLCanvasElement>(null);
  const starRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = glRef.current;
    const starCanvas = starRef.current;
    if (!canvas || !starCanvas) return;
    const calm = !live || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    const ctx = starCanvas.getContext("2d");
    const stars = catalog();

    let program: WebGLProgram | null = null;
    const uni: Record<string, WebGLUniformLocation | null> = {};
    if (gl) {
      const shader = (type: number, src: string) => {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
      };
      const vs = shader(gl.VERTEX_SHADER, VERT);
      const fs = shader(gl.FRAGMENT_SHADER, FRAG);
      if (vs && fs) {
        program = gl.createProgram()!;
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) program = null;
      }
      if (program) {
        gl.useProgram(program);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(program, "p");
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        for (const name of ["uRes", "uF", "uPitch", "uTime", "uExposure", "uCy", "uPointer", "uStir"]) uni[name] = gl.getUniformLocation(program, name);
        canvas.dataset.ready = "1";
      }
    }

    let cssW = 0;
    let cssH = 0;
    let screenH = 0;
    let scale = 1;
    let dpr = 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      cssW = Math.max(1, rect.width);
      cssH = Math.max(1, rect.height);
      // The camera frames the first screen; a taller hero (phones) continues below its horizon.
      screenH = Math.min(cssH, window.innerHeight);
      scale = Math.min(1, MAX_WIDTH / cssW);
      canvas.width = Math.round(cssW * scale);
      canvas.height = Math.round(cssH * scale);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      starCanvas.width = Math.round(cssW * dpr);
      starCanvas.height = Math.round(cssH * dpr);
    };

    // Pointer and stir, in canvas pixels (GL's y runs up). The live sky eases toward them.
    let pointerX = canvas.width / 2;
    let pointerY = canvas.height * 0.7;
    let targetX = pointerX;
    let targetY = pointerY;
    let stir = 0;

    const draw = (t: number, starT: number) => {
      if (gl && program) {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(uni.uRes, canvas.width, canvas.height);
        const cam = camera(canvas.width, screenH * scale);
        gl.uniform1f(uni.uCy, canvas.height - (screenH * scale) / 2);
        gl.uniform1f(uni.uF, cam.f);
        gl.uniform1f(uni.uPitch, cam.pitch);
        gl.uniform1f(uni.uTime, t);
        gl.uniform1f(uni.uExposure, 0.13);
        gl.uniform2f(uni.uPointer, pointerX, pointerY);
        gl.uniform1f(uni.uStir, stir);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      if (ctx) drawStars(ctx, stars, starCanvas.width, starCanvas.height, screenH * dpr, dpr, starT);
    };

    resize();
    draw(skyTime(), 0);

    // Still (other pages, or less motion): the sky as it was when the live one last stopped.
    if (calm) {
      const ro = new ResizeObserver(() => {
        resize();
        draw(skyTime(), 0);
      });
      ro.observe(canvas);
      const onPause = () => draw(skyTime(), 0);
      window.addEventListener(SKY_PAUSED, onPause);
      return () => {
        ro.disconnect();
        window.removeEventListener(SKY_PAUSED, onPause);
      };
    }

    // Live: the clock only runs while the sky is on screen, so leaving and coming back resumes it.
    let t = skyTime();
    const ro = new ResizeObserver(() => {
      resize();
      draw(t, performance.now() / 1000);
    });
    ro.observe(canvas);
    let visible = true;
    const pause = () => {
      setSkyTime(t, true);
      window.dispatchEvent(new Event(SKY_PAUSED));
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (!visible) pause();
    });
    io.observe(canvas);

    // The pointer stirs the aurora (mouse and pen; a tap on touch screens does too).
    let lastMove = 0;
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (e.clientY > rect.bottom || e.clientY < rect.top) return;
      const k = canvas.width / Math.max(rect.width, 1);
      const x = (e.clientX - rect.left) * k;
      const y = (rect.bottom - e.clientY) * k;
      const now = performance.now();
      const speed = Math.hypot(x - targetX, y - targetY) / Math.max(now - lastMove, 8);
      lastMove = now;
      targetX = x;
      targetY = y;
      stir = Math.min(1, stir + Math.min(speed, 2) * 0.12);
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden) {
        last = 0;
        return;
      }
      if (last && now - last < 33) return;
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      t += dt;
      setSkyTime(t, false);
      // Ease toward the pointer; the stir dies away over a couple of seconds.
      pointerX += (targetX - pointerX) * Math.min(1, dt * 4);
      pointerY += (targetY - pointerY) * Math.min(1, dt * 4);
      stir *= Math.exp(-dt / 1.8);
      draw(t, now / 1000);
    };
    raf = requestAnimationFrame(loop);
    const onHide = () => document.hidden && pause();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onHide);
      pause();
    };
  }, [live]);

  return (
    <div className={className}>
      <canvas ref={glRef} className="absolute inset-0 size-full" />
      <canvas ref={starRef} className="absolute inset-0 size-full" style={{ mixBlendMode: "plus-lighter" }} />
    </div>
  );
}
