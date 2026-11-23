/**
 * Pen-ink stable-fluids sim for the Ink homepage (WebGL2): one field from the hero down.
 * Physics: 80-cell velocity grid, 12 pressure iterations, curl 7, velocity
 * dissipation 0.9. The hero's `Tuning`: 256-cell dye, dye dissipation 0.26, drawn
 * at half CSS resolution at up to 60 fps, DPR capped at 1.5.
 *
 * Old ink dies like ink in water: it diffuses (spreads and thins) and loses a little
 * density per second, so faint tails reach zero instead of lingering as a film. Nothing
 * is culled and the drawn alpha follows density, so nothing pops.
 *
 * The canvas size is cached from a ResizeObserver, so the frame loop makes no
 * DOM reads. Coordinates passed to `splat` are normalized canvas units with y
 * pointing up (GL convention): (0, 0) is bottom left, (1, 1) top right.
 */

export type InkMode = "light" | "dark";

export interface Fluid {
  /**
   * Queues a splat; applied on the next frame or `step`. `dx`/`dy` is velocity in sim units.
   * `pen` forces the pen-blue dye (otherwise the current tint window decides).
   */
  splat(x: number, y: number, dx: number, dy: number, strength?: number, radius?: number, pen?: boolean): void;
  /** Queues a soft eraser: scales the dye down by up to `amount` (0..1) over a gaussian of `radius`. */
  erase(x: number, y: number, radius: number, amount: number): void;
  /** Colour mode of the hero palette and (default: the same) of the body palette. Eased while running. */
  setMode(m: InkMode, body?: InkMode): void;
  /**
   * Where the hero ends, in canvas units (y up): above it the hero palette, below it the body
   * palette, blended over a soft band. Below 0 the whole field is hero; above 1 it is all body.
   */
  setEdge(y: number): void;
  /** Moves the whole field up by `dy` canvas heights on the next frame (scroll); ink leaving the edge is gone. */
  carry(dy: number): void;
  pause(): void;
  resume(): void;
  /** Advances `n` frames at 60 fps synchronously, then draws once (static frame, capture). */
  step(n: number): void;
  /** Empties the field (dye and velocity). */
  clear(): void;
  destroy(): void;
}

const VS = `#version 300 es
in vec2 aPos;uniform vec2 uTexel;out vec2 vUv,vL,vR,vT,vB;
void main(){vUv=aPos*.5+.5;vL=vUv-vec2(uTexel.x,0.);vR=vUv+vec2(uTexel.x,0.);vT=vUv+vec2(0.,uTexel.y);vB=vUv-vec2(0.,uTexel.y);gl_Position=vec4(aPos,0.,1.);}`;
const HEAD = `#version 300 es
precision highp float;precision highp sampler2D;in vec2 vUv,vL,vR,vT,vB;out vec4 o;`;
const FS = {
  splat: `uniform sampler2D uTarget;uniform float uAspect,uRadius,uErase;uniform vec3 uColor;uniform vec2 uPoint;
    void main(){vec2 p=vUv-uPoint;p.x*=uAspect;float g=exp(-dot(p,p)/uRadius);o=vec4(texture(uTarget,vUv).xyz*(1.-uErase*g)+g*uColor,1.);}`,
  // A non-finite value would spread over the whole field in a few frames (the sim goes black); drop it.
  // uFloor: a constant loss per second on top of the proportional one, so thin ink ends at zero.
  // uShift carries the field with the page; nothing flows in from outside it.
  advect: `uniform sampler2D uVel,uSrc;uniform vec2 uTexel,uShift;uniform float uDt,uDiss,uFloor;
    void main(){vec2 c=vUv-uDt*texture(uVel,vUv).xy*uTexel-uShift;vec4 v=texture(uSrc,c)/(1.+uDiss*uDt);
    v=sign(v)*max(abs(v)-uFloor*uDt,0.);if(c.y<0.||c.y>1.)v=vec4(0.);
    o=any(isnan(v))||any(isinf(v))?vec4(0.):v;}`,
  // One explicit diffusion step (uK <= .25): edges soften and peaks thin out as the ink ages.
  diffuse: `uniform sampler2D uSrc;uniform float uK;
    void main(){vec4 C=texture(uSrc,vUv);o=C+uK*(texture(uSrc,vL)+texture(uSrc,vR)+texture(uSrc,vT)+texture(uSrc,vB)-4.*C);}`,
  div: `uniform sampler2D uVel;
    void main(){float L=texture(uVel,vL).x,R=texture(uVel,vR).x,T=texture(uVel,vT).y,B=texture(uVel,vB).y;vec2 C=texture(uVel,vUv).xy;
    if(vL.x<0.)L=-C.x;if(vR.x>1.)R=-C.x;if(vT.y>1.)T=-C.y;if(vB.y<0.)B=-C.y;o=vec4(.5*(R-L+T-B),0.,0.,1.);}`,
  curl: `uniform sampler2D uVel;
    void main(){float L=texture(uVel,vL).y,R=texture(uVel,vR).y,T=texture(uVel,vT).x,B=texture(uVel,vB).x;o=vec4(.5*(R-L-T+B),0.,0.,1.);}`,
  vort: `uniform sampler2D uVel,uCurl;uniform float uCurlS,uDt;
    void main(){float L=texture(uCurl,vL).x,R=texture(uCurl,vR).x,T=texture(uCurl,vT).x,B=texture(uCurl,vB).x,C=texture(uCurl,vUv).x;
    vec2 f=.5*vec2(abs(T)-abs(B),abs(R)-abs(L));f/=length(f)+1e-4;f*=uCurlS*C;f.y*=-1.;o=vec4(texture(uVel,vUv).xy+f*uDt,0.,1.);}`,
  press: `uniform sampler2D uP,uDiv;
    void main(){o=vec4((texture(uP,vL).x+texture(uP,vR).x+texture(uP,vT).x+texture(uP,vB).x-texture(uDiv,vUv).x)*.25,0.,0.,1.);}`,
  grad: `uniform sampler2D uP,uVel;
    void main(){o=vec4(texture(uVel,vUv).xy-vec2(texture(uP,vR).x-texture(uP,vL).x,texture(uP,vT).x-texture(uP,vB).x),0.,1.);}`,
  scale: `uniform sampler2D uTex;uniform float uVal;void main(){o=uVal*texture(uTex,vUv);}`,
  // Dye R = pen blue (A), G = blue-black (B). Output is premultiplied so the paper shows through.
  // Below uEdge the body palette (uA2..); the hero palette (uA..) blends in over uBand above it,
  // so text below the hero never sits on hero-strength ink.
  // uGain: how fast density reaches the palette's alpha. The output is dithered by one 8-bit
  // step: thin ink spans only a few levels, and undithered it fades in stepped contour rings.
  show: `uniform sampler2D uDye;uniform vec3 uA,uB,uA2,uB2;uniform float uAlpha,uDeep,uGain,uAlpha2,uDeep2,uGain2,uEdge,uBand;
    void main(){vec3 d=max(texture(uDye,vUv).rgb,0.);float s=d.r+d.g;
    float k=1.-smoothstep(uEdge,uEdge+uBand,vUv.y),a=1.-exp(-s*mix(uGain,uGain2,k));
    vec3 c=(d.r*mix(uA,uA2,k)+d.g*mix(uB,uB2,k))/max(s,1e-4);c=mix(c,c*mix(uDeep,uDeep2,k),smoothstep(.55,1.,a));
    float al=a*mix(uAlpha,uAlpha2,k);
    al=al>0.?clamp(al+(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5)/127.5,0.,1.):0.;o=vec4(c*al,al);}`,
};
type Pass = keyof typeof FS;

interface Target {
  t: WebGLTexture;
  f: WebGLFramebuffer;
  w: number;
  h: number;
  tx: [number, number];
}
interface Double {
  readonly r: Target;
  readonly w: Target;
  swap(): void;
  tx: [number, number];
}
type Uniform = number | number[] | Target;

const DYE_A = [1, 0, 0];
const DYE_B = [0, 1, 0];
/** Splat velocity cap in sim units (the hero's fastest stroke is about a fifth of it). */
const MAX_V = 3000;

/** Show-pass colors per mode: dye A, dye B, max alpha, and how far dense ink darkens (1 = not). */
export type InkPalette = Record<InkMode, { a: number[]; b: number[]; alpha: number; deep: number; gain?: number }>;
/**
 * The hero's pen ink. Dye B keeps its chroma (a blue-black thinned over paper reads grey), and
 * dense ink only darkens in light mode: on dark paper a darker core rings the stroke like a bubble.
 */
const PEN: InkPalette = {
  light: { a: [0.16, 0.25, 0.82], b: [0.1, 0.14, 0.52], alpha: 0.48, deep: 0.82 },
  dark: { a: [0.42, 0.52, 1], b: [0.27, 0.33, 0.78], alpha: 0.38, deep: 1 },
};
type Look = InkPalette[InkMode];
const lerpLook = (c: Look, t: Look, f: number) => {
  for (let i = 0; i < 3; i++) {
    c.a[i] += (t.a[i] - c.a[i]) * f;
    c.b[i] += (t.b[i] - c.b[i]) * f;
  }
  c.alpha += (t.alpha - c.alpha) * f;
  c.deep += (t.deep - c.deep) * f;
  c.gain = t.gain;
};
const copyLook = (l: Look): Look => ({ ...l, a: [...l.a], b: [...l.b] });

/**
 * Cost and rest of a field: drawing scale (of the CSS size, times DPR capped at 1.5), dye grid
 * (short side), frame cap; dye dissipation per second, and the idle stroke (every `every` s after
 * `quiet` s without input, at `strength` / `radius`, `speed` in sim units, starting within `x` / `y`).
 * With a `body`, the field's size comes from the hero tuning; the frame cap and idle drops follow
 * whichever part covers more of the canvas, and the dissipation blends by share.
 */
export type Tuning = {
  scale: number;
  dyeRes: number;
  fps: number;
  dyeDiss: number;
  every: number;
  quiet: number;
  strength: number;
  radius: number;
  speed: number;
  x: [number, number];
  y: [number, number];
};
const HERO: Tuning = { scale: 0.5, dyeRes: 256, fps: 60, dyeDiss: 0.26, every: 2.6, quiet: 3, strength: 0.28, radius: 0.006, speed: 160, x: [0.35, 0.95], y: [0.35, 0.9] };
/** Diffusion per second (times the dye texel, see `diffuse`) and the constant density loss per second. */
const SPREAD = 1.5;
const FLOOR = 0.025;
/** Height of the hero/body blend, in canvas heights; palette changes ease with this time constant (s). */
export const BAND = 0.25;
const EASE = 0.22;
/** Idle stroke: duration (s) and speed of its tip (canvas units per second). */
const STROKE_S = 0.6;
const STROKE_V = 0.28;

/**
 * Returns `null` when WebGL2, `EXT_color_buffer_float` or shader compilation is unavailable.
 * After a context loss the field is empty: `onRestore` fires once it is rebuilt (re-bloom there),
 * `onFail` if it cannot be rebuilt.
 */
export function createFluid(
  canvas: HTMLCanvasElement,
  opts: {
    mode: InkMode;
    palette?: InkPalette;
    tune?: Tuning;
    /** The part of the field below the hero (`setEdge`): its palette and tuning. */
    body?: { palette: InkPalette; tune: Tuning };
    onFail?: () => void;
    onRestore?: () => void;
  },
): Fluid | null {
  const palette = opts.palette ?? PEN;
  const heroTune = opts.tune ?? HERO;
  const body = opts.body ?? { palette, tune: heroTune };
  let tune = heroTune;
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "low-power",
  });
  if (!gl || !gl.getExtension("EXT_color_buffer_float")) return null;

  const P = {} as Record<Pass, { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> }>;
  let shaders: WebGLShader[] = [];
  let buf: WebGLBuffer | null = null;
  const freeProgs = () => {
    for (const k of Object.keys(P) as Pass[]) {
      gl.deleteProgram(P[k].p);
      delete P[k];
    }
    for (const s of shaders) gl.deleteShader(s);
    shaders = [];
    gl.deleteBuffer(buf);
    buf = null;
  };
  /** Compiles every pass and uploads the quad. On failure frees whatever was created and returns false. */
  const build = (): boolean => {
    const progs: WebGLProgram[] = [];
    try {
      const sh = (type: number, src: string) => {
        const s = gl.createShader(type)!;
        shaders.push(s);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
        return s;
      };
      const vs = sh(gl.VERTEX_SHADER, VS);
      for (const k of Object.keys(FS) as Pass[]) {
        const p = gl.createProgram()!;
        progs.push(p);
        gl.attachShader(p, vs);
        gl.attachShader(p, sh(gl.FRAGMENT_SHADER, HEAD + FS[k]));
        gl.bindAttribLocation(p, 0, "aPos");
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link");
        const u: Record<string, WebGLUniformLocation | null> = {};
        for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) {
          const nm = gl.getActiveUniform(p, i)!.name;
          u[nm] = gl.getUniformLocation(p, nm);
        }
        P[k] = { p, u };
      }
      buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      return true;
    } catch {
      for (const p of progs) gl.deleteProgram(p);
      for (const k of Object.keys(P) as Pass[]) delete P[k];
      for (const s of shaders) gl.deleteShader(s);
      shaders = [];
      return false;
    }
  };
  if (!build()) return null;

  let targets: Target[] = [];
  const fbo = (w: number, h: number): Target => {
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    const f = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const target = { t, f, w, h, tx: [1 / w, 1 / h] as [number, number] };
    targets.push(target);
    return target;
  };
  const dbl = (w: number, h: number): Double => {
    let a = fbo(w, h);
    let b = fbo(w, h);
    return {
      get r() {
        return a;
      },
      get w() {
        return b;
      },
      swap() {
        [a, b] = [b, a];
      },
      tx: a.tx,
    };
  };

  let vel!: Double, dye!: Double, pres!: Double, divF!: Target, curlF!: Target;
  let W = 0;
  let H = 0;
  // Cached CSS size from the ResizeObserver; applied lazily at the next frame/step.
  let cssW = canvas.clientWidth;
  let cssH = canvas.clientHeight;
  let mode = opts.mode;
  let bodyMode = opts.mode;
  let edge = -1;
  let shift = 0;
  const look = copyLook(palette[mode]);
  const look2 = copyLook(body.palette[mode]);

  const res = (base: number): [number, number] => {
    const ar = W / H;
    return ar > 1 ? [Math.round(base * ar), base] : [base, Math.round(base / ar)];
  };
  /** Reallocates the field when the canvas size changed. Returns true if it did (the field is empty). */
  const resize = () => {
    const k = Math.min(devicePixelRatio || 1, 1.5) * heroTune.scale;
    const w = Math.max(2, (cssW * k) | 0);
    const h = Math.max(2, (cssH * k) | 0);
    // A small height change (mobile URL bar) keeps the field; the canvas stretches under 10%.
    if (w === W && H && Math.abs(h - H) / H < 0.1) return false;
    if (w === W && h === H) return false;
    for (const o of targets) {
      gl.deleteTexture(o.t);
      gl.deleteFramebuffer(o.f);
    }
    targets = [];
    canvas.width = W = w;
    canvas.height = H = h;
    const [sw, shh] = res(80);
    const [dw, dh] = res(heroTune.dyeRes);
    vel = dbl(sw, shh);
    dye = dbl(dw, dh);
    divF = fbo(sw, shh);
    curlF = fbo(sw, shh);
    pres = dbl(sw, shh);
    return true;
  };

  const run = (k: Pass, target: Target | null, uni: Record<string, Uniform>) => {
    const { p, u } = P[k];
    gl.useProgram(p);
    let unit = 0;
    for (const n in uni) {
      const v = uni[n];
      if (!(n in u)) continue;
      if (typeof v === "number") gl.uniform1f(u[n], v);
      else if ("t" in v) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, v.t);
        gl.uniform1i(u[n], unit++);
      } else if (v.length === 2) gl.uniform2fv(u[n], v);
      else gl.uniform3fv(u[n], v);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.f : null);
    gl.viewport(0, 0, target ? target.w : W, target ? target.h : H);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
  };

  // Every third 2.8 s window draws in the darker dye, so strokes stay one color.
  const tintNow = () => ((performance.now() / 2800) | 0) % 3 === 2 ? DYE_B : DYE_A;
  const applySplat = (x: number, y: number, dx: number, dy: number, color: number[], amt: number, r: number, erase = 0) => {
    const ar = W / H;
    const rad = r * (ar > 1 ? ar : 1);
    run("splat", vel.w, { uTarget: vel.r, uAspect: ar, uPoint: [x, y], uColor: [dx, dy, 0], uRadius: rad, uErase: 0, uTexel: vel.tx });
    vel.swap();
    run("splat", dye.w, { uTarget: dye.r, uAspect: ar, uPoint: [x, y], uColor: color.map((c) => c * amt), uRadius: rad, uErase: erase, uTexel: dye.tx });
    dye.swap();
  };
  const advance = (dt: number) => {
    const t = vel.tx;
    const sh: [number, number] = [0, shift];
    shift = 0;
    run("curl", curlF, { uVel: vel.r, uTexel: t });
    run("vort", vel.w, { uVel: vel.r, uCurl: curlF, uCurlS: 7, uDt: dt, uTexel: t });
    vel.swap();
    run("div", divF, { uVel: vel.r, uTexel: t });
    run("scale", pres.w, { uTex: pres.r, uVal: 0.8, uTexel: t });
    pres.swap();
    for (let i = 0; i < 12; i++) {
      run("press", pres.w, { uP: pres.r, uDiv: divF, uTexel: t });
      pres.swap();
    }
    run("grad", vel.w, { uP: pres.r, uVel: vel.r, uTexel: t });
    vel.swap();
    run("advect", vel.w, { uVel: vel.r, uSrc: vel.r, uDt: dt, uDiss: 0.9, uFloor: 0, uShift: sh, uTexel: t });
    vel.swap();
    run("advect", dye.w, { uVel: vel.r, uSrc: dye.r, uDt: dt, uDiss: dyeDiss, uFloor: FLOOR, uShift: sh, uTexel: t });
    dye.swap();
    run("diffuse", dye.w, { uSrc: dye.r, uK: Math.min(SPREAD * dt, 0.2), uTexel: dye.tx });
    dye.swap();
  };
  const show = () => {
    run("show", null, {
      uDye: dye.r,
      uA: look.a,
      uB: look.b,
      uAlpha: look.alpha,
      uDeep: look.deep,
      uGain: look.gain ?? 1.7,
      uA2: look2.a,
      uB2: look2.b,
      uAlpha2: look2.alpha,
      uDeep2: look2.deep,
      uGain2: look2.gain ?? 1.7,
      uEdge: edge,
      uBand: BAND,
      uTexel: [1 / W, 1 / H],
    });
  };

  type Queued = [number, number, number, number, number[], number, number, number?];
  const queue: Queued[] = [];
  const flush = () => {
    for (const q of queue) applySplat(...q);
    queue.length = 0;
  };

  let dyeDiss = heroTune.dyeDiss;
  let lastSplat = performance.now();
  let idleT = 0;
  let stroke: { x: number; y: number; a: number; turn: number; left: number; t: Tuning; c: number[] } | null = null;
  let raf = 0;
  let prev = 0;
  let running = false;
  const frame = (now: number) => {
    if (lost) return;
    raf = requestAnimationFrame(frame);
    if (now - prev < 1000 / tune.fps - 1.7) return; // frame cap (60: ~15 ms) on high-refresh screens
    const dt = Math.min((now - prev) / 1000, 1 / 30);
    prev = now;
    resize();
    flush();
    const f = 1 - Math.exp(-dt / EASE);
    lerpLook(look, palette[mode], f);
    lerpLook(look2, body.palette[bodyMode], f);
    // Hero share of the canvas: 1 at the top of the page, 0 once the hero has left.
    const share = Math.min(Math.max(1 - edge, 0), 1);
    tune = share >= 0.5 ? heroTune : body.tune;
    dyeDiss = body.tune.dyeDiss + (heroTune.dyeDiss - body.tune.dyeDiss) * share;
    // Idle: now and then an unseen hand draws a short curved stroke, so the field keeps breathing
    // with streams like the pointer's (a single drop reads as a bubble that sits and fades).
    if (!stroke && now - lastSplat > tune.quiet * 1000 && (idleT += dt) > tune.every) {
      idleT = 0;
      const at = (r: [number, number]) => r[0] + Math.random() * (r[1] - r[0]);
      stroke = { x: at(tune.x), y: at(tune.y), a: Math.random() * 6.283, turn: (Math.random() - 0.5) * 5, left: STROKE_S, t: tune, c: tintNow() };
    }
    if (stroke) {
      const k = stroke;
      k.a += k.turn * dt;
      k.x += Math.cos(k.a) * STROKE_V * dt;
      k.y += Math.sin(k.a) * STROKE_V * dt;
      // The same amount of dye as one drop of the tuning, spread along the stroke.
      const amt = (k.t.strength * 2 * dt) / STROKE_S;
      applySplat(k.x, k.y, Math.cos(k.a) * k.t.speed, Math.sin(k.a) * k.t.speed, k.c, amt, k.t.radius / 2);
      if ((k.left -= dt) <= 0) stroke = null;
    }
    advance(dt);
    show();
  };

  const ro = new ResizeObserver(([e]) => {
    cssW = e.contentRect.width;
    cssH = e.contentRect.height;
  });
  ro.observe(canvas);
  resize();

  // Context loss: stop drawing, keep the canvas (preventDefault allows restore), rebuild on restore.
  let lost = false;
  let wanted = false;
  let giveUp: ReturnType<typeof setTimeout> | undefined;
  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    // No restore in time: hand over to the pre-rendered image (a late restore then changes nothing visible).
    giveUp = setTimeout(() => opts.onFail?.(), 4000);
    wanted = running;
    running = false;
    cancelAnimationFrame(raf);
    queue.length = 0;
    targets = [];
    W = H = 0;
  };
  const onRestored = () => {
    clearTimeout(giveUp);
    // The old objects died with the context; drop the stale handles and rebuild.
    shaders = [];
    for (const k of Object.keys(P) as Pass[]) delete P[k];
    // Extensions must be enabled again on the new context.
    if (!gl.getExtension("EXT_color_buffer_float") || !build()) {
      opts.onFail?.();
      return;
    }
    lost = false;
    resize();
    if (wanted) api.resume();
    else show();
    opts.onRestore?.();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  const api: Fluid = {
    splat(x, y, dx, dy, strength = 0.16, radius = 0.003, pen = false) {
      if (lost || !Number.isFinite(x + y + dx + dy)) return;
      // A pointer jump (leaving and re-entering the window) must not become a shock in half floats.
      const v = (d: number) => Math.max(-MAX_V, Math.min(MAX_V, d));
      if (queue.length < 16) queue.push([x, y, v(dx), v(dy), pen ? DYE_A : tintNow(), strength, radius]);
      // A dye-free push (scroll wake) is not input: the field keeps its idle strokes.
      if (strength > 0) lastSplat = performance.now();
    },
    erase(x, y, radius, amount) {
      if (lost) return;
      if (queue.length < 16) queue.push([x, y, 0, 0, [0, 0, 0], 0, radius, amount]);
    },
    setMode(m, b = m) {
      mode = m;
      bodyMode = b;
      if (running || lost) return;
      lerpLook(look, palette[mode], 1);
      lerpLook(look2, body.palette[bodyMode], 1);
      show();
    },
    setEdge(y) {
      edge = y;
    },
    carry(dy) {
      shift = Math.max(-1, Math.min(1, shift + dy));
    },
    pause() {
      wanted = false;
      running = false;
      cancelAnimationFrame(raf);
    },
    resume() {
      if (lost) {
        wanted = true;
        return;
      }
      if (running) return;
      running = true;
      prev = performance.now();
      raf = requestAnimationFrame(frame);
    },
    step(n) {
      if (lost) return;
      resize();
      flush();
      for (let i = 0; i < n; i++) advance(1 / 60);
      show();
    },
    clear() {
      if (lost) return;
      gl.clearColor(0, 0, 0, 0);
      for (const t of targets) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.f);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      queue.length = 0;
    },
    destroy() {
      running = false;
      clearTimeout(giveUp);
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      if (lost) return;
      for (const o of targets) {
        gl.deleteTexture(o.t);
        gl.deleteFramebuffer(o.f);
      }
      freeProgs();
      // ponytail: no loseContext(); a remount (React Strict Mode) gets the same context back.
    },
  };
  return api;
}
