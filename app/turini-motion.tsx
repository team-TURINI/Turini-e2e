"use client";

import { useEffect, useRef } from "react";

/**
 * 투리니 관절 애니메이션
 *
 * 정면 기본 그림(`worn-front/turini-base-front.png`)을 부위별로 잘라 둔 파츠
 * (`public/assets/turini-motion/*.webp`)를 SVG 안에서 관절마다 돌려 움직입니다.
 * 파츠는 모두 1024×1024 기준 좌표에 놓여 있어서, 그냥 겹치면 원래 그림과 같습니다.
 *
 *   머리(뿔 포함) · 귀 2 · 눈 2 · 눈썹 2 · 입 · 몸통 · 팔 2(손 포함) · 다리 2(발 포함)
 *
 * - 뿔은 머리에 붙어 있어 따로 흔들리지 않습니다.
 * - 팔은 어깨에서만 통째로 돌아갑니다(팔꿈치 없음).
 * - 표정(웃는 눈·감은 눈·벌린 입·시무룩한 입)과 O/X 팻말은 SVG로 그립니다.
 * - 프레임마다 React를 다시 그리지 않고 DOM 속성만 바꿉니다.
 * - 화면 밖에 있거나 탭이 가려지면 그리기를 쉬고, '동작 줄이기' 설정이면 한 장면으로 멈춥니다.
 */

export type TuriniMotionName =
  | "idle"
  | "greet"
  | "thinking"
  | "reading"
  | "correct"
  | "wrong"
  | "celebrate"
  | "loading"
  // 상황별 소품 동작
  | "study" // 안경 쓰고 책 읽기 (오늘의 학습)
  | "go" // 화살표 쪽을 가리키며 폴짝 (시작하기)
  | "coach" // 지시봉으로 파이차트 설명 (포트폴리오 코칭)
  | "inspect" // 돋보기로 살펴보기 (위험등급 분석)
  | "gauge" // 계기판 팻말 (위험등급 표시)
  | "save" // 돼지저금통에 동전 넣기 (자산 플래너)
  | "grow" // 물뿌리개로 돈나무 키우기 (자산 플래너)

const SRC = "/assets/turini-motion";

/** 파츠 위치(1024 기준)와 회전 중심 */
const PART = {
  earL: { x: 232, y: 184, w: 154, h: 148, pivot: [347, 262] },
  earR: { x: 652, y: 186, w: 153, h: 145, pivot: [690, 262] },
  head: { x: 297, y: 66, w: 443, h: 512, pivot: [518, 575] },
  eyeL: { x: 355, y: 350, w: 113, h: 117, pivot: [411, 408] },
  eyeR: { x: 569, y: 350, w: 113, h: 117, pivot: [625, 408] },
  browL: { x: 385, y: 298, w: 59, h: 35, pivot: [415, 316] },
  browR: { x: 592, y: 299, w: 59, h: 34, pivot: [622, 316] },
  mouth: { x: 465, y: 468, w: 107, h: 40, pivot: [518, 488] },
  armL: { x: 249, y: 602, w: 180, h: 219, pivot: [402, 628] },
  armR: { x: 609, y: 602, w: 178, h: 219, pivot: [635, 628] },
  legL: { x: 347, y: 810, w: 160, h: 189, pivot: [437, 840] },
  legR: { x: 530, y: 810, w: 160, h: 189, pivot: [597, 840] },
  body: { x: 360, y: 546, w: 318, h: 310, pivot: [518, 860] },
} as const;

type PartName = keyof typeof PART;
type Pt = readonly [number, number];

const ROOT: Pt = [518, 1000];
const TORSO: Pt = [518, 860];
/** 오른손(화면 기준) 쥐는 자리 — 팻말 막대가 여기서 위로 섭니다 */
const GRIP: Pt = [731, 770];
/** 오른손 바닥(팔 기준 좌표) — 지시봉·돋보기·물뿌리개를 이 점에 쥡니다 */
const PAW_R: Pt = [735, 785];
const PAW_L: Pt = [300, 785];
const CHART: Pt = [945, 372];
const CHART_R = 74;
const SLICES = [
  { key: "sA", from: 0, frac: 0.5, color: "#31b66a" },
  { key: "sB", from: 0.5, frac: 0.3, color: "#ffc800" },
  { key: "sC", from: 0.8, frac: 0.2, color: "#1cb0f6" },
] as const;
const PLANT_BASE: Pt = [905, 905];

const DEF = {
  x: 0, y: 0, sx: 1, sy: 1, torso: 0,
  head: 0, headY: 0, headX: 0,
  earL: 0, earR: 0, armL: 0, armR: 0,
  legL: 0, legR: 0, legLY: 0, legRY: 0,
  eyeSY: 1, eyeDX: 0, eyeDY: 0, browY: 0, browL: 0, browR: 0,
  sign: 0, signTilt: 0,
  // 소품 (0 = 숨김, 1 = 보임)
  glass: 0, book: 0, page: 0, stick: 0, chart: 0, sA: 0, sB: 0, sC: 0,
  mag: 0, eyeRS: 1, bookTilt: 0, canTilt: 0, cover: 0, coverY: 0, coverT: 0, board: 0, chalk: 0, chalk2: 0, tick: 0, needle: 0, pig: 0, pigS: 1, plant: 0, grow: 0, bloom: 0, can: 0,
};
type Pose = typeof DEF;
type PoseKey = keyof Pose;
type Partial2 = Partial<Pose>;
type Face = "normal" | "happy" | "sad" | "surprise" | "talk";
type EaseName = "linear" | "in" | "out" | "inout" | "back" | "elastic";

const EASE: Record<EaseName, (t: number) => number> = {
  linear: (t) => t,
  in: (t) => t * t * t,
  out: (t) => 1 - Math.pow(1 - t, 3),
  inout: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t) => {
    const c1 = 1.9;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  elastic: (t) =>
    t === 0 || t === 1 ? t : Math.pow(2, -9 * t) * Math.sin(((t * 10 - 0.75) * (2 * Math.PI)) / 3) + 1,
};

const rot = (a: number, p: Pt) => `rotate(${a.toFixed(2)} ${p[0]} ${p[1]})`;
const scl = (sx: number, sy: number, p: Pt) =>
  `translate(${p[0]} ${p[1]}) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(${-p[0]} ${-p[1]})`;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

function PartImage({ name }: { name: PartName }) {
  const p = PART[name];
  return <image href={`${SRC}/${name}.webp`} x={p.x} y={p.y} width={p.w} height={p.h} preserveAspectRatio="none" />;
}

export type TuriniMotionProps = {
  motion?: TuriniMotionName;
  /** 값이 바뀌면 같은 동작이라도 처음부터 다시 재생합니다 */
  replayKey?: string | number;
  /** 정답·오답 팻말을 든 채로 계속 유지합니다 */
  holdLast?: boolean;
  /** false 면 한 장면으로 멈춥니다 */
  animated?: boolean;
  className?: string;
  /** gauge 동작의 바늘 위치 (0 = 낮음, 1 = 높음) */
  level?: number;
};

export default function TuriniMotion({
  motion = "idle",
  replayKey,
  holdLast = false,
  animated = true,
  className = "",
  level = 0.5,
}: TuriniMotionProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const q = <T extends Element = SVGGElement>(sel: string) => svg.querySelector(sel) as T | null;
    const J: Record<string, SVGGElement | null> = {};
    for (const k of ["root", "torso", "head", "earL", "earR", "armL", "armR", "legL", "legR", "eyeL", "eyeR", "browL", "browR", "sign", "armR2"]) {
      J[k] = q(`[data-j="${k}"]`);
    }
    const F: Record<string, SVGGElement | null> = {};
    for (const k of ["eyesHappy", "eyesClosed", "mouthSmile", "mouthOpen", "mouthTalk", "mouthSad", "mouthO", "sweat", "signO", "signX"]) {
      F[k] = q(`[data-f="${k}"]`);
    }
    const Q: Record<string, SVGGElement | null> = {};
    for (const k of ["glass", "book", "page", "stick", "chart", "mag", "needle", "pig", "plant", "stem", "bloom", "can", "signG", "cover", "board"]) {
      Q[k] = q(`[data-p="${k}"]`);
    }
    const chalkEls = ["chalk", "chalk2", "tick"].map((k) => q<SVGPathElement>(`[data-chalk="${k}"]`));
    const sliceEls = SLICES.map((sl) => q<SVGCircleElement>(`[data-slice="${sl.key}"]`));
    const shadow = q<SVGEllipseElement>("[data-shadow]");
    const fxLayer = q<SVGGElement>("[data-fx]");

    const reduce =
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false;
    const live = animated && !reduce;

    // ---------------- 상태 ----------------
    const pose: Pose = { ...DEF };
    let face: Face = "normal";
    let idleT = Math.random() * 10;
    let idleW = 1;
    let blinkV = 1;
    let earTw = 0;
    let talkOpen = false;
    let alive = true;
    let token = 0;
    let visible = true;
    type Tween = { from: Partial2; p: Partial2; d: number; e: EaseName; t0: number; res: () => void; my: number };
    const tweens = new Set<Tween>();
    type Particle = { el: SVGElement; onEnd?: () => void; x: number; y: number; vx: number; vy: number; g: number; life: number; t: number; r: number; vr: number; fade: number };
    const particles: Particle[] = [];
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const show = (el: Element | null, on: boolean) => {
      if (el) el.setAttribute("display", on ? "inline" : "none");
    };
    const setFace = (f: Face) => {
      face = f;
      show(F.eyesHappy, f === "happy");
      show(F.mouthSmile, f === "normal");
      show(F.mouthOpen, f === "happy");
      show(F.mouthTalk, f === "talk" && talkOpen);
      show(F.mouthSad, f === "sad");
      show(F.mouthO, f === "surprise");
      show(F.sweat, f === "sad");
      if (f === "talk" && !talkOpen) show(F.mouthSmile, true);
    };
    const setSign = (k: "O" | "X" | "G") => {
      show(F.signO, k === "O");
      show(F.signX, k === "X");
      show(Q.signG, k === "G");
    };
    /** 소품을 c 점 기준으로 키우거나 숨깁니다 */
    const prop = (el: SVGGElement | null, v: number, c: Pt, extra = "") => {
      if (!el) return;
      if (v < 0.01) { el.setAttribute("display", "none"); return; }
      el.setAttribute("display", "inline");
      el.setAttribute("transform", `${extra} ${scl(v, v, c)}`.trim());
    };

    const apply = () => {
      const t = idleT;
      const w = idleW;
      const br = Math.sin(t * 2.4);
      const P: Pose = { ...pose };
      P.sy *= 1 + 0.01 * br * w;
      P.sx *= 1 - 0.006 * br * w;
      P.headY += -4 * br * w;
      P.head += 1.5 * Math.sin(t * 1.1) * w;
      P.armL += 2.5 * br * w;
      P.armR -= 2.5 * br * w;
      P.earL += (2.5 * Math.sin(t * 1.7) + earTw) * w;
      P.earR -= (2.5 * Math.sin(t * 1.7 + 1) + earTw) * w;
      P.eyeSY *= blinkV;

      J.root?.setAttribute("transform", `translate(${P.x.toFixed(1)} ${P.y.toFixed(1)}) ${scl(P.sx, P.sy, ROOT)}`);
      J.torso?.setAttribute("transform", rot(P.torso, TORSO));
      J.head?.setAttribute("transform", `translate(${P.headX.toFixed(1)} ${P.headY.toFixed(1)}) ${rot(P.head, PART.head.pivot)}`);
      J.earL?.setAttribute("transform", rot(P.earL, PART.earL.pivot));
      J.earR?.setAttribute("transform", rot(P.earR, PART.earR.pivot));
      J.armL?.setAttribute("transform", rot(P.armL, PART.armL.pivot));
      J.armR?.setAttribute("transform", rot(P.armR, PART.armR.pivot));
      J.armR2?.setAttribute("transform", rot(P.armR, PART.armR.pivot));
      J.legL?.setAttribute("transform", `translate(0 ${P.legLY.toFixed(1)}) ${rot(P.legL, PART.legL.pivot)}`);
      J.legR?.setAttribute("transform", `translate(0 ${P.legRY.toFixed(1)}) ${rot(P.legR, PART.legR.pivot)}`);
      const eyeT = `translate(${P.eyeDX.toFixed(1)} ${P.eyeDY.toFixed(1)}) `;
      J.eyeL?.setAttribute("transform", eyeT + scl(1, Math.max(0.06, P.eyeSY), PART.eyeL.pivot));
      J.eyeR?.setAttribute("transform", eyeT + scl(P.eyeRS, Math.max(0.06, P.eyeSY) * P.eyeRS, PART.eyeR.pivot));
      J.browL?.setAttribute("transform", `translate(0 ${P.browY.toFixed(1)}) ${rot(P.browL, PART.browL.pivot)}`);
      J.browR?.setAttribute("transform", `translate(0 ${P.browY.toFixed(1)}) ${rot(P.browR, PART.browR.pivot)}`);
      const closed = P.eyeSY < 0.35;
      const eyesHidden = face === "happy" || (closed && face !== "sad" && face !== "surprise");
      J.eyeL?.setAttribute("opacity", eyesHidden ? "0" : "1");
      J.eyeR?.setAttribute("opacity", eyesHidden ? "0" : "1");
      show(F.eyesClosed, closed && face !== "happy");
      // 팻말은 팔이 돌아간 만큼 되돌려서 늘 위로 서 있습니다
      J.sign?.setAttribute("transform", `${rot(-P.armR + P.signTilt, GRIP)} ${scl(P.sign, P.sign, GRIP)}`);
      // 소품
      prop(Q.glass, P.glass, [518, 408]);
      if (Q.book) {
        if (P.book < 0.01) Q.book.setAttribute("display", "none");
        else {
          Q.book.setAttribute("display", "inline");
          Q.book.setAttribute("transform", `${rot(-P.armL + P.bookTilt, PAW_L)} translate(${PAW_L[0]} ${PAW_L[1]}) scale(${P.book.toFixed(3)}) translate(0 -78)`);
        }
      }
      if (Q.page) {
        const on = P.page > 0.01 && P.page < 0.99;
        Q.page.setAttribute("display", on ? "inline" : "none");
        if (on) Q.page.setAttribute("transform", `scale(${Math.cos(P.page * Math.PI).toFixed(3)} 1)`);
      }
      prop(Q.board, P.board, [970, 480]);
      (["chalk", "chalk2", "tick"] as const).forEach((k, i) => {
        const el = chalkEls[i];
        if (el) el.setAttribute("stroke-dashoffset", (1 - Math.max(0, Math.min(1, P[k]))).toFixed(3));
      });
      prop(Q.cover, P.cover, [518, 712], `translate(0 ${P.coverY.toFixed(1)}) ${rot(P.coverT, [518, 800])}`);
      prop(Q.stick, P.stick, PAW_R);
      prop(Q.mag, P.mag, PAW_R);
      prop(Q.can, P.can, PAW_R, rot(P.canTilt, PAW_R));
      prop(Q.chart, P.chart, CHART);
      const C = 2 * Math.PI * (CHART_R / 2);
      SLICES.forEach((sl, k) => {
        const el = sliceEls[k];
        if (!el) return;
        const v = Math.max(0, Math.min(1, P[sl.key]));
        el.setAttribute("stroke-dasharray", `${(C * sl.frac * v).toFixed(2)} ${C.toFixed(2)}`);
        el.setAttribute("stroke-dashoffset", (-C * sl.from).toFixed(2));
      });
      Q.needle?.setAttribute("transform", rot(-80 + 160 * Math.max(0, Math.min(1, P.needle)), [731, 412]));
      if (Q.pig) {
        if (P.pig < 0.01) Q.pig.setAttribute("display", "none");
        else {
          Q.pig.setAttribute("display", "inline");
          Q.pig.setAttribute("transform", `translate(0 -55) ${scl(P.pig * (2 - P.pigS), P.pig * P.pigS, [518, 850])}`);
        }
      }
      prop(Q.plant, P.plant, [PLANT_BASE[0], 990]);
      Q.stem?.setAttribute("transform", scl(1, Math.max(0.001, P.grow), PLANT_BASE));
      prop(Q.bloom, P.bloom, [PLANT_BASE[0], 905 - 175 * Math.max(0.001, P.grow)], `translate(0 ${(-175 * Math.max(0.001, P.grow) + 175).toFixed(1)})`);
      const lift = Math.max(0, -P.y);
      if (shadow) {
        const s = 1 - Math.min(lift, 300) / 600;
        shadow.setAttribute("transform", scl(s, s, [518, 996]));
        shadow.setAttribute("opacity", (1 - Math.min(lift, 300) / 700).toFixed(3));
      }
      for (const pt of particles) {
        pt.el.setAttribute("transform", `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)}) rotate(${pt.r.toFixed(1)})`);
        pt.el.setAttribute("opacity", Math.max(0, Math.min(1, pt.fade)).toFixed(2));
      }
    };

    // ---------------- 트윈 ----------------
    const to = (p: Partial2, d: number, e: EaseName = "inout") => {
      const my = token;
      return new Promise<void>((res) => {
        const from: Partial2 = {};
        (Object.keys(p) as PoseKey[]).forEach((k) => {
          from[k] = pose[k];
        });
        tweens.add({ from, p, d, e, t0: performance.now(), res, my });
      });
    };
    const wait = (ms: number) =>
      new Promise<void>((res) => {
        const id = setTimeout(() => {
          timers.delete(id);
          res();
        }, ms);
        timers.add(id);
      });
    const ok = (my: number) => alive && my === token;

    // ---------------- 효과 (SVG 글자라 크기에 맞춰 같이 커지고 작아집니다) ----------------
    const spawn = (ch: string, x: number, y: number, vx: number, vy: number, g: number, life: number, size: number) => {
      if (!fxLayer || !live) return;
      const el = document.createElementNS("http://www.w3.org/2000/svg", "text");
      el.textContent = ch;
      el.setAttribute("font-size", String(size));
      el.setAttribute("text-anchor", "middle");
      el.setAttribute("dominant-baseline", "central");
      if (/^\+/.test(ch)) {
        el.setAttribute("fill", "#1f8a4c");
        el.setAttribute("font-weight", "900");
        el.setAttribute("stroke", "#ffffff");
        el.setAttribute("stroke-width", "12");
        el.setAttribute("paint-order", "stroke");
      }
      if (/^[?!.]+$/.test(ch)) {
        el.setAttribute("fill", "#2f8f2a");
        el.setAttribute("font-weight", "800");
        el.setAttribute("stroke", "#ffffff");
        el.setAttribute("stroke-width", "10");
        el.setAttribute("paint-order", "stroke");
      }
      el.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      fxLayer.appendChild(el);
      const still = /^[+?!]/.test(ch);
      particles.push({ el, x, y, vx, vy, g, life, t: 0, r: still ? 0 : rand(-30, 30), vr: still ? 0 : rand(-120, 120), fade: 1 });
    };
    const NS = "http://www.w3.org/2000/svg";
    /** 모양(물방울·동전)을 포물선으로 날립니다 */
    const throwShape = (kind: "drop" | "coin", x: number, y: number, vx: number, vy: number, g: number, life: number, onEnd?: () => void) => {
      if (!fxLayer || !live) return;
      const el = document.createElementNS(NS, "g");
      if (kind === "drop") {
        el.innerHTML = '<path d="M0 -26 Q16 -4 16 6 A16 16 0 1 1 -16 6 Q-16 -4 0 -26 Z" fill="#6ec6ff" stroke="#ffffff" stroke-width="4"/>';
      } else {
        el.innerHTML = '<circle r="34" fill="#f6b318" stroke="#b86e00" stroke-width="5"/><circle r="24" fill="#ffd54a"/><text y="2" font-size="34" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="#b86e00">₩</text>';
      }
      el.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      fxLayer.appendChild(el);
      particles.push({ el, x, y, vx, vy, g, life, t: 0, r: 0, vr: kind === "coin" ? 260 : 0, fade: 1, onEnd });
    };
    const burst = (chars: string[], n = 14) => {
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2);
        const s = rand(380, 720);
        spawn(chars[i % chars.length], 518 + rand(-40, 40), 420, Math.cos(a) * s, Math.sin(a) * s - 380, 900, rand(1.1, 1.6), rand(85, 120));
      }
    };
    const floatUp = (chars: string[], n = 3, x = 518, y = 230) => {
      chars.slice(0, n).forEach((ch, i) => {
        const id = setTimeout(() => {
          timers.delete(id);
          spawn(ch, x + rand(-160, 160), y, rand(-40, 40), -rand(160, 240), 0, 1.5, ch === "?" ? 190 : rand(100, 130));
        }, i * 160);
        timers.add(id);
      });
    };

    // ---------------- 프레임 ----------------
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      if (!alive) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      idleT += dt;
      for (const tw of [...tweens]) {
        if (tw.my !== token) {
          tweens.delete(tw);
          tw.res();
          continue;
        }
        const k = Math.min(1, (now - tw.t0) / tw.d);
        const v = EASE[tw.e](k);
        (Object.keys(tw.p) as PoseKey[]).forEach((key) => {
          const a = tw.from[key] ?? pose[key];
          const b = tw.p[key] ?? a;
          pose[key] = a + (b - a) * v;
        });
        if (k >= 1) {
          tweens.delete(tw);
          tw.res();
        }
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.t += dt;
        pt.vy += pt.g * dt;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        if (!pt.onEnd) pt.vx *= 0.985;
        pt.r += pt.vr * dt;
        pt.fade = pt.onEnd ? 1 : pt.t < pt.life * 0.6 ? 1 : 1 - (pt.t - pt.life * 0.6) / (pt.life * 0.4);
        if (pt.t >= pt.life) {
          pt.el.remove();
          particles.splice(i, 1);
          pt.onEnd?.();
        }
      }
      if (visible) apply();
      raf = requestAnimationFrame(frame);
    };

    // 눈 깜박임 · 귀 쫑긋 · 말하는 입
    const loopTimer = (fn: () => void, min: number, max: number) => {
      const tick = () => {
        if (!alive) return;
        fn();
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, rand(min, max));
        timers.add(id);
      };
      const id = setTimeout(() => {
        timers.delete(id);
        tick();
      }, rand(min, max));
      timers.add(id);
    };
    const pulse = (ms: number, set: (k: number) => void) => {
      const s = performance.now();
      const step = () => {
        if (!alive) return;
        const k = (performance.now() - s) / ms;
        set(Math.min(1, k));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    // ---------------- 동작 ----------------
    async function begin(f: Face = "normal") {
      token++;
      tweens.clear();
      const my = token;
      setFace(f);
      idleW = 0.4;
      return my;
    }

    async function jump(my: number, h = 170, armUp = 62) {
      await to({ sy: 0.84, sx: 1.1, y: 0, headY: 10, armL: -14, armR: 14, earL: -8, earR: 8, legL: 2, legR: -2 }, 190, "out");
      if (!ok(my)) return;
      to({ sy: 1.1, sx: 0.93, armL: armUp, armR: -armUp, earL: -26, earR: 26, headY: -6, legLY: -22, legRY: -22, legL: -6, legR: 6 }, 220, "out");
      await to({ y: -h }, 300, "out");
      if (!ok(my)) return;
      to({ sy: 1.04, sx: 0.97, armL: 20, armR: -20, earL: 16, earR: -16, legLY: 0, legRY: 0, legL: 3, legR: -3 }, 260, "inout");
      await to({ y: 0 }, 240, "in");
      if (!ok(my)) return;
      await to({ sy: 0.86, sx: 1.1, headY: 12, earL: -14, earR: 14, armL: -6, armR: 6 }, 95, "out");
      if (!ok(my)) return;
      await to({ sy: 1, sx: 1, headY: 0, earL: 0, earR: 0, armL: 0, armR: 0, legL: 0, legR: 0 }, 360, "elastic");
    }

    async function settle(my: number) {
      if (!ok(my)) return;
      await to({ ...DEF }, 420, "inout");
      if (ok(my)) idleW = 1;
    }

    async function wave(my: number, times = 3) {
      setFace("happy");
      await to({ armL: 118, head: 8, torso: 2, earL: -10, browY: -5 }, 420, "back");
      for (let i = 0; i < times && ok(my); i++) {
        await to({ armL: 104, head: 10 }, 190, "inout");
        await to({ armL: 130, head: 7 }, 190, "inout");
      }
      if (!ok(my)) return;
      await to({ armL: 0, head: 0, torso: 0, earL: 0, browY: 0 }, 380, "inout");
      if (ok(my)) setFace("normal");
    }

    async function idleGestures(my: number, greetSometimes: boolean) {
      while (ok(my)) {
        await wait(rand(5200, 9000));
        if (!ok(my)) return;
        const r = Math.random();
        idleW = 0.5;
        if (r < 0.25) {
          setFace("happy");
          await jump(my, 80, 30);
          if (ok(my)) setFace("normal");
        } else if (r < 0.5) {
          await to({ eyeDX: -9, head: -5 }, 320, "inout");
          await wait(700);
          if (!ok(my)) return;
          await to({ eyeDX: 9, head: 5 }, 420, "inout");
          await wait(700);
          if (!ok(my)) return;
          await to({ eyeDX: 0, head: 0 }, 320, "inout");
        } else if (r < 0.72 || !greetSometimes) {
          setFace("happy");
          await to({ head: -8, torso: -2, earL: -12, earR: 6, armL: 14 }, 320, "inout");
          await to({ head: 8, torso: 2, earL: -6, earR: 12, armL: 0, armR: -14 }, 320, "inout");
          await to({ head: 0, torso: 0, earL: 0, earR: 0, armR: 0 }, 300, "inout");
          if (ok(my)) setFace("normal");
        } else {
          await wave(my, 2);
        }
        if (ok(my)) idleW = 1;
      }
    }

    async function signUp(my: number, kind: "O" | "X", arm: number) {
      setSign(kind);
      await to({ armR: arm, sign: 1, signTilt: kind === "O" ? 12 : 0 }, 420, "back");
      return ok(my);
    }

    const scripts: Record<TuriniMotionName, (my: number) => Promise<void>> = {
      async idle(my) {
        await settle(my);
        await idleGestures(my, false);
      },

      async greet(my) {
        await settle(my);
        idleW = 0.5;
        await wave(my, 3);
        if (ok(my)) idleW = 1;
        await idleGestures(my, true);
      },

      async thinking(my) {
        await settle(my);
        let side = 1;
        while (ok(my)) {
          idleW = 0.6;
          await to({ head: 9 * side, torso: 1.5 * side, eyeDX: 8 * side, eyeDY: -7, browY: -4, browL: side > 0 ? -6 : 4, browR: side > 0 ? -4 : 6, earL: -6, earR: 6, armL: 10, armR: -6 }, 650, "inout");
          if (!ok(my)) return;
          if (Math.random() < 0.6) floatUp(["?"], 1, 518 + 120 * side, 150);
          await wait(rand(1300, 2100));
          if (!ok(my)) return;
          await to({ head: 2 * side, eyeDX: 0, eyeDY: -2, browL: 0, browR: 0 }, 420, "inout");
          await wait(rand(500, 900));
          side = -side;
        }
      },

      async reading(my) {
        await settle(my);
        idleW = 0.7;
        let open = false;
        const mouthTick = async () => {
          while (ok(my)) {
            if (face === "talk") {
              open = !open;
              talkOpen = open;
              setFace("talk");
            }
            await wait(open ? rand(120, 180) : rand(110, 200));
          }
        };
        void mouthTick();
        while (ok(my)) {
          setFace("talk");
          // 고개 끄덕이며 손짓으로 설명
          for (let i = 0; i < 3 && ok(my); i++) {
            to({ armR: -38, head: -4 }, 360, "inout");
            await to({ headY: 6, browY: -3 }, 360, "inout");
            to({ armR: -18, head: 3 }, 360, "inout");
            await to({ headY: -2, browY: 0 }, 360, "inout");
          }
          if (!ok(my)) return;
          talkOpen = false;
          setFace("normal");
          await to({ armR: 0, head: 0, headY: 0 }, 420, "inout");
          await wait(rand(900, 1600));
          if (!ok(my)) return;
          if (Math.random() < 0.35) {
            setFace("happy");
            await to({ head: 6, earL: -10, earR: 10 }, 300, "inout");
            await wait(500);
            await to({ head: 0, earL: 0, earR: 0 }, 300, "inout");
          }
        }
      },

      async correct(my) {
        setFace("happy");
        if (!(await signUp(my, "O", -110))) return;
        burst(["🎉", "✨", "⭐", "💚"]);
        to({ armL: 55, head: -6, earL: -16, earR: 16, browY: -5 }, 300, "back");
        for (let i = 0; i < 2 && ok(my); i++) {
          await to({ sy: 0.88, sx: 1.07, armL: 25 }, 130, "out");
          to({ sy: 1.07, sx: 0.95, armL: 80, legLY: -20, legRY: -20, earL: -24, earR: 24, signTilt: -10 }, 190, "out");
          await to({ y: -130 }, 240, "out");
          to({ sy: 1, sx: 1, armL: 50, legLY: 0, legRY: 0, earL: 8, earR: -8, signTilt: 12 }, 210, "inout");
          await to({ y: 0 }, 210, "in");
          await to({ sy: 0.92, sx: 1.06 }, 90, "out");
          await to({ sy: 1, sx: 1 }, 150, "out");
        }
        if (!ok(my)) return;
        if (!holdLast) {
          await wait(500);
          await to({ sign: 0, armR: 0, armL: 0, head: 0, signTilt: 0 }, 380, "inout");
          if (ok(my)) setFace("normal");
          await settle(my);
          await idleGestures(my, false);
          return;
        }
        // 팻말을 든 채로 즐겁게 흔들기
        await to({ armL: 10, head: 0, earL: 0, earR: 0 }, 400, "inout");
        idleW = 0.8;
        while (ok(my)) {
          await to({ signTilt: -8, armR: -114, head: -3 }, 520, "inout");
          await to({ signTilt: 12, armR: -106, head: 3 }, 520, "inout");
          if (Math.random() < 0.3 && ok(my)) {
            await to({ sy: 0.92, sx: 1.05 }, 120, "out");
            await to({ y: -60, sy: 1.04, sx: 0.97 }, 170, "out");
            await to({ y: 0, sy: 1, sx: 1 }, 170, "in");
          }
        }
      },

      async wrong(my) {
        setFace("sad");
        to({ browL: -14, browR: 14, browY: 4, earL: -28, earR: 28, sy: 0.96, headY: 8, armL: -8, eyeDY: 6 }, 400, "out");
        if (!(await signUp(my, "X", -100))) return;
        for (let i = 0; i < 3 && ok(my); i++) {
          to({ signTilt: -12 }, 140, "inout");
          await to({ head: -11, torso: -2, eyeDX: -6 }, 140, "inout");
          to({ signTilt: 12 }, 140, "inout");
          await to({ head: 11, torso: 2, eyeDX: 6 }, 140, "inout");
        }
        if (!ok(my)) return;
        await to({ head: 0, torso: 0, eyeDX: 0, signTilt: 0, sy: 0.92, sx: 1.03, headY: 14, eyeSY: 0.75 }, 500, "inout");
        if (!ok(my)) return;
        if (!holdLast) {
          await wait(500);
          await to({ sign: 0, armR: 0, sy: 1, sx: 1, headY: 0, eyeSY: 1 }, 420, "inout");
          if (ok(my)) setFace("normal");
          await settle(my);
          await idleGestures(my, false);
          return;
        }
        await to({ sy: 0.97, sx: 1.01, headY: 8, eyeSY: 1 }, 500, "inout");
        idleW = 0.8;
        while (ok(my)) {
          await wait(rand(1800, 2800));
          if (!ok(my)) return;
          to({ signTilt: -8 }, 260, "inout");
          await to({ head: -6 }, 260, "inout");
          to({ signTilt: 8 }, 260, "inout");
          await to({ head: 6 }, 260, "inout");
          await to({ head: 0, signTilt: 0 }, 260, "inout");
        }
      },

      async celebrate(my) {
        setFace("happy");
        burst(["🎉", "✨", "⭐", "💛"], 16);
        // 양팔을 함께 번쩍 올렸다 내리며 폴짝폴짝
        const hop = async (h: number, up: number, down: number) => {
          // 착지·웅크림: 다리를 모읍니다
          await to({ sy: 0.88, sx: 1.07, armL: down, armR: -down, legLY: 0, legRY: 0, legL: -3, legR: 3 }, 110, "out");
          if (!ok(my)) return;
          to({ sy: 1.07, sx: 0.95, armL: up, armR: -up, earL: -24, earR: 24, legLY: -14, legRY: -14, legL: 10, legR: -10 }, 170, "out"); // 공중: 다리를 벌림
          await to({ y: -h }, 210, "out");
          if (!ok(my)) return;
          to({ sy: 1, sx: 1, armL: down, armR: -down, earL: 10, earR: -10, legLY: 0, legRY: 0, legL: -2, legR: 2 }, 190, "inout");
          await to({ y: 0 }, 190, "in");
        };
        const cheer = async (rounds: number) => {
          for (let i = 0; i < rounds && ok(my); i++) await hop(i === rounds - 1 ? 130 : 90, 72, 18);
          if (!ok(my)) return;
          await to({ sy: 0.9, sx: 1.06 }, 90, "out");
          await to({ sy: 1, sx: 1, armL: 0, armR: 0, earL: 0, earR: 0, legL: 0, legR: 0 }, 320, "elastic");
        };
        await cheer(4);
        while (ok(my)) {
          await wait(rand(2200, 3400));
          if (!ok(my)) return;
          if (Math.random() < 0.5) burst(["✨", "⭐", "💛"], 8);
          else floatUp(["🎵", "✨"], 2);
          await cheer(2);
        }
      },

      async study(my) {
        // 선생님 투리니: 안경 + 뒤 칠판 + 지시봉
        // 처음부터 안경·칠판·지시봉을 갖춘 상태로 시작합니다 (제자리)
        Object.assign(pose, DEF, { glass: 1, board: 1, stick: 1.35 });
        idleW = 0.6;
        setFace("normal");
        await wait(500);
        if (!ok(my)) return;
        while (ok(my)) {
          // 칠판을 돌아보며 가리키기
          await to({ armR: -108, head: 8, eyeDX: 11, eyeDY: -6, torso: 2 }, 420, "back");
          if (!ok(my)) return;
          for (let i = 0; i < 2 && ok(my); i++) {
            await to({ armR: -114 }, 120, "inout");
            await to({ armR: -108 }, 140, "inout");
          }
          // 그래프가 그려져요
          setFace("talk");
          to({ armR: -100 }, 900, "inout");
          await to({ chalk: 1 }, 900, "inout");
          await to({ chalk2: 1, armR: -98 }, 220, "out");
          if (!ok(my)) return;
          await to({ armR: -118, eyeDY: -12 }, 260, "inout");
          await to({ tick: 1 }, 320, "out");
          talkOpen = false;
          // 정면을 보며 "알겠죠?"
          setFace("happy");
          floatUp(["✨"], 1, 960, 200);
          await to({ head: -4, eyeDX: 0, eyeDY: 0, torso: 0, armR: -40, browY: -8, earL: -14, earR: 14 }, 360, "back");
          for (let i = 0; i < 2 && ok(my); i++) {
            await to({ headY: 8 }, 150, "inout");
            await to({ headY: 0 }, 150, "inout");
          }
          await wait(1100);
          if (!ok(my)) return;
          setFace("normal");
          await to({ armR: -20, head: 0, browY: 0, earL: 0, earR: 0, chalk: 0, chalk2: 0, tick: 0 }, 420, "inout");
          await wait(rand(900, 1500));
        }
      },

      async go(my) {
        await settle(my);
        setFace("happy");
        while (ok(my)) {
          idleW = 0.5;
          await jump(my, 90, 40);
          if (!ok(my)) return;
          // 오른쪽(화살표)을 가리키기
          await to({ armR: -88, head: 7, torso: 3, eyeDX: 10, earR: 10 }, 360, "back");
          for (let i = 0; i < 3 && ok(my); i++) {
            await to({ armR: -96, x: 6 }, 170, "inout");
            await to({ armR: -84, x: 0 }, 170, "inout");
          }
          if (!ok(my)) return;
          await wait(700);
          await to({ armR: 0, head: 0, torso: 0, eyeDX: 0, earR: 0 }, 380, "inout");
          idleW = 1;
          await wait(rand(2200, 3400));
        }
      },

      async coach(my) {
        await settle(my);
        idleW = 0.5;
        await to({ stick: 1 }, 260, "back");
        await to({ chart: 1, armR: -95, head: 5, eyeDX: 9, browY: -4 }, 480, "back");
        while (ok(my)) {
          setFace("talk");
          for (const key of ["sA", "sB", "sC"] as const) {
            if (!ok(my)) return;
            await to({ armR: -101 }, 130, "inout");
            to({ armR: -95 }, 160, "inout");
            await to({ [key]: 1 }, 520, "out");
            await wait(220);
          }
          if (!ok(my)) return;
          talkOpen = false;
          setFace("happy");
          await to({ head: -3, eyeDX: 0, armL: 30, earL: -14, earR: 14 }, 320, "back");
          floatUp(["✨"], 1, CHART[0], CHART[1] - 80);
          await wait(1400);
          if (!ok(my)) return;
          setFace("normal");
          await to({ head: 5, eyeDX: 9, armL: 0, earL: 0, earR: 0 }, 360, "inout");
          await wait(rand(1800, 2600));
          if (!ok(my)) return;
          await to({ sA: 0, sB: 0, sC: 0 }, 260, "in");
        }
      },

      async inspect(my) {
        await settle(my);
        idleW = 0.5;
        await to({ mag: 1 }, 260, "back");
        while (ok(my)) {
          // 돋보기를 눈앞으로 — 오른쪽 눈이 크게 보입니다
          await to({ armR: -116, eyeRS: 1.38, head: -4, browY: -5 }, 520, "back");
          if (!ok(my)) return;
          await to({ head: -9, armR: -111, eyeDX: -7 }, 650, "inout");
          await to({ head: 6, armR: -121, eyeDX: 7 }, 800, "inout");
          await to({ head: -2, armR: -116, eyeDX: 0 }, 450, "inout");
          if (!ok(my)) return;
          // 찾았다!
          setFace("happy");
          floatUp(["!"], 1, 640, 170);
          await to({ armR: -55, eyeRS: 1, head: 0, browY: -9, earL: -18, earR: 18, headY: -6 }, 320, "back");
          await wait(900);
          if (!ok(my)) return;
          setFace("normal");
          await to({ browY: 0, earL: 0, earR: 0, headY: 0, armR: -20 }, 360, "inout");
          await wait(rand(1600, 2400));
        }
      },

      async gauge(my) {
        await settle(my);
        setSign("G");
        const target = Math.max(0, Math.min(1, level));
        await to({ armR: -68, sign: 0.8, signTilt: 18, needle: 0, head: -4 }, 440, "back");
        while (ok(my)) {
          // 바늘이 흔들리다가 제자리에
          await to({ needle: 1 }, 520, "out");
          await to({ needle: Math.max(0, target - 0.18) }, 360, "inout");
          await to({ needle: Math.min(1, target + 0.1) }, 260, "inout");
          await to({ needle: target }, 420, "elastic");
          if (!ok(my)) return;
          setFace("happy");
          await to({ head: -8, earL: -14, earR: 14, signTilt: 24 }, 260, "back");
          await to({ head: -4, earL: 0, earR: 0, signTilt: 18 }, 320, "inout");
          await wait(rand(2600, 3600));
          if (!ok(my)) return;
          setFace("normal");
          await to({ needle: 0 }, 420, "inout");
        }
      },

      async save(my) {
        await settle(my);
        idleW = 0.5;
        await to({ pig: 1, armL: -44, armR: 44 }, 460, "back");
        const SLOT: Pt = [518, 635];
        while (ok(my)) {
          for (let i = 0; i < 3 && ok(my); i++) {
            const T = 0.8, g = 1500;
            const sx = 880 + rand(-30, 30), sy = 210;
            const vx = (SLOT[0] - sx) / T, vy = (SLOT[1] - sy - 0.5 * g * T * T) / T;
            await new Promise<void>((res) => {
              throwShape("coin", sx, sy, vx, vy, g, T, () => res());
              to({ eyeDX: 9, eyeDY: -8, head: 5 }, 300, "inout").then(() => to({ eyeDX: 0, eyeDY: 6, head: 0 }, 420, "inout"));
              if (!live) res();
            });
            if (!ok(my)) return;
            setFace("happy");
            spawn("+₩", SLOT[0] + 190, SLOT[1] + 60, 0, -150, 0, 1.1, 92);
            await to({ pigS: 0.86 }, 90, "out");
            await to({ pigS: 1 }, 380, "elastic");
            await wait(260);
            if (ok(my)) setFace("normal");
          }
          if (!ok(my)) return;
          // 저금통 흔들며 좋아하기
          setFace("happy");
          for (let i = 0; i < 2 && ok(my); i++) {
            await to({ torso: -5, head: -6, sy: 0.96 }, 180, "inout");
            await to({ torso: 5, head: 6, sy: 1 }, 180, "inout");
          }
          await to({ torso: 0, head: 0 }, 200, "inout");
          await wait(rand(1500, 2400));
          if (ok(my)) setFace("normal");
        }
      },

      async grow(my) {
        await settle(my);
        idleW = 0.5;
        await to({ plant: 1.25, grow: 0.12 }, 380, "back");
        await to({ can: 1 }, 260, "back");
        const SPOUT: Pt = [929, 737];
        // 화분 쪽으로 몸을 돌려서 (살짝 납작하게 = 옆으로 돈 느낌)
        const TURN = { x: -26, sx: 0.93, torso: 7, head: 11, headX: 14, eyeDX: 13, eyeDY: 9, earL: -10, earR: 12, browY: 3 };
        while (ok(my)) {
          await to({ ...TURN, armR: -48, armL: 14, legL: -3, legR: 3 }, 520, "inout");
          if (!ok(my)) return;
          // 물뿌리개를 기울여 물 주기
          await to({ canTilt: 28 }, 260, "inout");
          for (let i = 0; i < 12 && ok(my); i++) {
            throwShape("drop", SPOUT[0] + rand(-6, 6), SPOUT[1] + 6, rand(-50, 0), rand(60, 140), 1600, 0.42);
            if (i % 3 === 2) await to({ grow: Math.min(1, pose.grow + 0.22), head: 13 }, 300, "out");
            else await to({ head: 10 }, 110, "inout");
          }
          if (!ok(my)) return;
          await to({ canTilt: 0, armR: -20, eyeDY: -4 }, 360, "inout");
          // 동전 꽃이 피면 정면을 보며 기뻐하기
          await to({ bloom: 1 }, 420, "back");
          setFace("happy");
          burst(["✨", "⭐"], 6);
          await to({ x: 0, sx: 1, torso: 0, head: 0, headX: 0, eyeDX: 0, eyeDY: 0, earL: 0, earR: 0, browY: -6, armL: 0, legL: 0, legR: 0 }, 380, "inout");
          await jump(my, 70, 40);
          if (!ok(my)) return;
          await wait(1500);
          if (!ok(my)) return;
          setFace("normal");
          await to({ bloom: 0, grow: 0.12, browY: 0 }, 500, "inout");
          await wait(rand(500, 1000));
        }
      },

      async loading(my) {
        await settle(my);
        setFace("happy");
        let n = 0;
        while (ok(my)) {
          idleW = 0.3;
          const d = n % 2 ? 1 : -1;
          await to({ sy: 0.9, sx: 1.06, head: 4 * d }, 120, "out");
          to({ sy: 1.05, sx: 0.97, armL: d > 0 ? 40 : 15, armR: d > 0 ? -15 : -40, earL: -16, earR: 16, legLY: -10, legRY: -10 }, 160, "out");
          await to({ y: -70 }, 200, "out");
          to({ sy: 1, sx: 1, armL: 5, armR: -5, earL: 8, earR: -8, legLY: 0, legRY: 0 }, 180, "inout");
          await to({ y: 0 }, 180, "in");
          n++;
          if (n % 4 === 0) {
            setFace("normal");
            await to({ sy: 1, sx: 1, head: 0, eyeDX: -8 }, 300, "inout");
            await wait(380);
            await to({ eyeDX: 8 }, 360, "inout");
            await wait(380);
            await to({ eyeDX: 0 }, 260, "inout");
            if (ok(my)) setFace("happy");
          }
        }
      },
    };

    // ---------------- 정지 화면(동작 줄이기) ----------------
    const still = () => {
      const P: Partial2 = {};
      if (motion === "correct") {
        setFace("happy");
        setSign("O");
        Object.assign(P, { armR: -110, sign: 1, signTilt: 6 });
      } else if (motion === "wrong") {
        setFace("sad");
        setSign("X");
        Object.assign(P, { armR: -100, sign: 1, browL: -14, browR: 14, earL: -24, earR: 24 });
      } else if (motion === "celebrate" || motion === "greet" || motion === "loading" || motion === "go") {
        setFace("happy");
        if (motion === "go") Object.assign(P, { armR: -88, head: 6, eyeDX: 10 });
      } else if (motion === "study") {
        setFace("normal");
        Object.assign(P, { glass: 1, board: 1, stick: 1.35, chalk: 1, chalk2: 1, tick: 1, armR: -108, head: 6, eyeDX: 10 });
      } else if (motion === "coach") {
        setFace("happy");
        Object.assign(P, { stick: 1, chart: 1, sA: 1, sB: 1, sC: 1, armR: -95, eyeDX: 9 });
      } else if (motion === "inspect") {
        setFace("normal");
        Object.assign(P, { mag: 1, armR: -116, eyeRS: 1.38 });
      } else if (motion === "gauge") {
        setFace("happy");
        setSign("G");
        Object.assign(P, { armR: -68, sign: 0.8, signTilt: 18, needle: Math.max(0, Math.min(1, level)) });
      } else if (motion === "save") {
        setFace("happy");
        Object.assign(P, { pig: 1, armL: -44, armR: 44 });
      } else if (motion === "grow") {
        setFace("happy");
        Object.assign(P, { plant: 1.25, grow: 1, bloom: 1 });
      } else {
        setFace("normal");
      }
      Object.assign(pose, DEF, P);
      idleW = 0;
      apply();
    };

    if (!live) {
      still();
      return () => {
        alive = false;
      };
    }

    // 화면 밖이면 그리기를 쉽니다
    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver((entries) => {
        visible = entries.some((e) => e.isIntersecting);
      });
      io.observe(svg);
    }

    loopTimer(() => {
      const twice = Math.random() < 0.22;
      pulse(150, (k) => {
        blinkV = k < 0.5 ? 1 - k * 1.9 : Math.min(1, 0.05 + (k - 0.5) * 1.9);
        if (k >= 1 && twice) {
          const id = setTimeout(() => {
            timers.delete(id);
            pulse(140, (k2) => {
              blinkV = k2 < 0.5 ? 1 - k2 * 1.9 : Math.min(1, 0.05 + (k2 - 0.5) * 1.9);
            });
          }, 90);
          timers.add(id);
        }
      });
    }, 2200, 4800);
    loopTimer(() => {
      pulse(500, (k) => {
        earTw = k < 1 ? 13 * Math.sin(k * Math.PI * 3) * (1 - k) : 0;
      });
    }, 3800, 7600);

    setFace("normal");
    apply();
    raf = requestAnimationFrame(frame);
    void (async () => {
      const my = await begin(face);
      await scripts[motion](my);
    })();

    return () => {
      alive = false;
      token++;
      cancelAnimationFrame(raf);
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
      tweens.clear();
      particles.forEach((p) => p.el.remove());
      io?.disconnect();
    };
  }, [motion, replayKey, holdLast, animated, level]);

  return (
    <svg
      ref={svgRef}
      className={`turini-motion ${className}`.trim()}
      viewBox="0 0 1024 1024"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse data-shadow cx="518" cy="996" rx="170" ry="24" fill="rgba(60, 45, 20, 0.16)" />
      {/* 작은 칠판 (캐릭터 뒤) */}
      <g data-p="board" display="none">
        <rect x="958" y="460" width="14" height="150" rx="6" fill="#a86f3e" />
        <rect x="816" y="186" width="308" height="232" rx="22" fill="#a86f3e" />
        <rect x="832" y="202" width="276" height="200" rx="14" fill="#2f5d46" />
        <rect x="832" y="202" width="276" height="200" rx="14" fill="url(#boardShine)" />
        <path d="M 862 240 L 954 240" stroke="#e9f3ec" strokeWidth="9" strokeLinecap="round" opacity=".85" />
        <path d="M 862 264 L 926 264" stroke="#e9f3ec" strokeWidth="7" strokeLinecap="round" opacity=".55" />
        <path d="M 862 372 L 1082 372 M 862 372 L 862 290" stroke="#cfe3d6" strokeWidth="5" strokeLinecap="round" opacity=".7" />
        <path data-chalk="chalk" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1}
          d="M 874 360 L 920 338 L 952 350 L 996 310 L 1030 322 L 1068 278" stroke="#ffe066" strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path data-chalk="chalk2" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1}
          d="M 1048 278 L 1070 276 L 1068 298" stroke="#ffe066" strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path data-chalk="tick" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1}
          d="M 1020 230 L 1036 248 L 1068 218" stroke="#8be3a5" strokeWidth="10" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="860" y="402" width="60" height="12" rx="5" fill="#ffffff" opacity=".9" />
        <rect x="930" y="404" width="30" height="10" rx="4" fill="#ffc800" />
      </g>
      <defs>
        <linearGradient id="boardShine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".12" />
          <stop offset=".5" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* 돈나무 화분 (땅에 놓여 있어 캐릭터와 같이 뛰지 않습니다) */}
      <g data-p="plant" display="none">
        <ellipse cx="905" cy="990" rx="66" ry="10" fill="rgba(60, 45, 20, 0.16)" />
        <g data-p="stem">
          <path d="M905 905 C900 860 912 800 905 730" stroke="#2f9a52" strokeWidth="16" fill="none" strokeLinecap="round" />
          <path d="M904 840 C870 836 846 812 842 786 C872 784 898 804 904 840 Z" fill="#45bb63" stroke="#1f7a3e" strokeWidth="5" />
          <path d="M907 792 C940 786 962 760 964 734 C934 736 910 758 907 792 Z" fill="#5ccc72" stroke="#1f7a3e" strokeWidth="5" />
        </g>
        <g data-p="bloom" display="none">
          <circle cx="905" cy="730" r="40" fill="#f6b318" stroke="#b86e00" strokeWidth="6" />
          <circle cx="905" cy="730" r="28" fill="#ffd54a" />
          <text x="905" y="732" fontSize="40" fontWeight="900" textAnchor="middle" dominantBaseline="central" fill="#b86e00">₩</text>
        </g>
        <path d="M845 905 L965 905 L950 988 L860 988 Z" fill="#d9774b" stroke="#a24f2c" strokeWidth="6" strokeLinejoin="round" />
        <rect x="836" y="893" width="138" height="26" rx="10" fill="#e88d5f" stroke="#a24f2c" strokeWidth="6" />
      </g>
      {/* 포트폴리오 파이차트 */}
      <g data-p="chart" display="none">
        <circle cx={CHART[0]} cy={CHART[1] + 6} r={CHART_R + 12} fill="rgba(20, 60, 40, 0.14)" />
        <circle cx={CHART[0]} cy={CHART[1]} r={CHART_R + 12} fill="#ffffff" stroke="#dfe9e3" strokeWidth="4" />
        <circle cx={CHART[0]} cy={CHART[1]} r={CHART_R} fill="#eef3ef" />
        {SLICES.map((sl) => (
          <circle key={sl.key} data-slice={sl.key} cx={CHART[0]} cy={CHART[1]} r={CHART_R / 2} fill="none"
            stroke={sl.color} strokeWidth={CHART_R} transform={`rotate(-90 ${CHART[0]} ${CHART[1]})`} strokeDasharray="0 999" />
        ))}
        <circle cx={CHART[0]} cy={CHART[1]} r={CHART_R * 0.42} fill="#ffffff" />
      </g>
      <g data-j="root">
        <g data-j="legL"><PartImage name="legL" /></g>
        <g data-j="legR"><PartImage name="legR" /></g>
        <g data-j="torso">
          <PartImage name="body" />
          <g data-j="armL">
            {/* 책 — 왼손으로 펼쳐 들고 있습니다 (팔이 돌아도 책은 바로 섭니다) */}
            <g data-p="book" display="none">
              <path d="M-125 -58 Q-62 -74 0 -54 Q62 -74 125 -58 L125 52 Q62 38 0 58 Q-62 38 -125 52 Z" fill="#1f7a4c" stroke="#154f34" strokeWidth="6" strokeLinejoin="round" />
              <path d="M-114 -62 Q-56 -76 -4 -58 L-4 46 Q-56 32 -114 44 Z" fill="#fffaf0" stroke="#d8cdb4" strokeWidth="3" />
              <path d="M4 -58 Q56 -76 114 -62 L114 44 Q56 32 4 46 Z" fill="#fffaf0" stroke="#d8cdb4" strokeWidth="3" />
              <g stroke="#c9c2b2" strokeWidth="6" strokeLinecap="round">
                <path d="M-94 -40 L-24 -34" /><path d="M-94 -18 L-24 -12" /><path d="M-94 4 L-40 9" />
                <path d="M24 -34 L94 -40" /><path d="M24 -12 L94 -18" /><path d="M24 10 L74 5" />
              </g>
              <path d="M-70 22 L-40 22" stroke="#31b66a" strokeWidth="8" strokeLinecap="round" />
              <g data-p="page" display="none">
                <path d="M4 -58 Q56 -76 114 -62 L114 44 Q56 32 4 46 Z" fill="#fff1d2" stroke="#d8cdb4" strokeWidth="3" />
              </g>
              <path d="M0 -54 L0 58" stroke="#154f34" strokeWidth="6" />
            </g>
            <PartImage name="armL" />
          </g>
          <g data-j="armR">
            <g data-j="sign" transform="scale(0)">
              <rect x="722" y="430" width="18" height="355" rx="9" fill="#A86F3E" />
              <rect x="726" y="430" width="5" height="355" rx="2.5" fill="#C98E57" />
              <rect x="611" y="250" width="240" height="200" rx="34" fill="#E6CFA3" />
              <rect x="621" y="258" width="220" height="182" rx="28" fill="#ffffff" />
              <g data-f="signO">
                <circle cx="731" cy="349" r="62" fill="none" stroke="#58CC02" strokeWidth="28" />
              </g>
              <g data-p="signG" display="none">
                <path d="M651 412 A80 80 0 0 1 691 343" stroke="#31b66a" strokeWidth="26" fill="none" />
                <path d="M691 343 A80 80 0 0 1 771 343" stroke="#ffc800" strokeWidth="26" fill="none" />
                <path d="M771 343 A80 80 0 0 1 811 412" stroke="#ff6b4b" strokeWidth="26" fill="none" />
                <g data-p="needle">
                  <path d="M724 412 L731 338 L738 412 Z" fill="#17372a" />
                </g>
                <circle cx="731" cy="412" r="14" fill="#17372a" />
                <circle cx="731" cy="412" r="5" fill="#ffffff" />
              </g>
              <g data-f="signX" display="none">
                <path d="M676 294 L786 404 M786 294 L676 404" stroke="#FF4B4B" strokeWidth="30" strokeLinecap="round" />
              </g>
            </g>
            {/* 지시봉 */}
            <g data-p="stick" display="none">
              <path d="M735 785 L800 887" stroke="#8a5a32" strokeWidth="16" strokeLinecap="round" />
              <circle cx="802" cy="890" r="13" fill="#ff4b4b" stroke="#ffffff" strokeWidth="4" />
            </g>
            {/* 물뿌리개 */}
            <g data-p="can" display="none">
              <path d="M770 820 L792 905" stroke="#1d9bd8" strokeWidth="18" strokeLinecap="round" />
              <ellipse cx="793" cy="908" rx="16" ry="9" fill="#1d9bd8" />
              <rect x="690" y="760" width="110" height="88" rx="22" fill="#33b5f0" stroke="#1777a8" strokeWidth="6" />
              <path d="M700 772 C680 730 742 724 748 760" stroke="#1777a8" strokeWidth="10" fill="none" />
            </g>
            <PartImage name="armR" />
          </g>
          {/* 책 (표지가 보이게) — 두 손으로 가슴 앞에 들고 읽습니다 */}
          <g data-p="cover" display="none">
            <rect x="406" y="614" width="232" height="196" rx="16" fill="#0f3f28" />
            <rect x="400" y="606" width="232" height="196" rx="16" fill="#1f7a4c" stroke="#154f34" strokeWidth="6" />
            <rect x="400" y="606" width="34" height="196" rx="12" fill="#17613c" />
            <path d="M632 618 L640 624 L640 806 L632 802 Z" fill="#fffaf0" stroke="#d8cdb4" strokeWidth="2" />
            <rect x="458" y="640" width="146" height="44" rx="10" fill="#fffaf0" opacity=".95" />
            <path d="M478 656 L584 656 M478 670 L556 670" stroke="#9ab8a6" strokeWidth="6" strokeLinecap="round" />
            <circle cx="531" cy="738" r="30" fill="#f6b318" stroke="#b86e00" strokeWidth="5" />
            <text x="531" y="740" fontSize="34" fontWeight="900" textAnchor="middle" dominantBaseline="central" fill="#b86e00">₩</text>
            <path d="M590 606 L590 648 L602 638 L614 648 L614 606 Z" fill="#ffc800" />
            <path d="M416 622 L428 622" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" opacity=".35" />
            {/* 책을 받친 두 손 */}
            <ellipse cx="420" cy="790" rx="32" ry="26" fill="#76351a" />
            <ellipse cx="413" cy="782" rx="12" ry="8" fill="#9a5230" opacity=".7" />
            <ellipse cx="616" cy="790" rx="32" ry="26" fill="#76351a" />
            <ellipse cx="609" cy="782" rx="12" ry="8" fill="#9a5230" opacity=".7" />
          </g>
          {/* 돼지저금통 — 두 손으로 안고 있습니다 */}
          <g data-p="pig" display="none">
            <path d="M440 700 L452 650 L486 690 Z" fill="#f58fb0" stroke="#c9577e" strokeWidth="6" strokeLinejoin="round" />
            <path d="M596 700 L584 650 L550 690 Z" fill="#f58fb0" stroke="#c9577e" strokeWidth="6" strokeLinejoin="round" />
            <ellipse cx="518" cy="772" rx="132" ry="96" fill="#f9a9c4" stroke="#c9577e" strokeWidth="7" />
            <ellipse cx="478" cy="726" rx="40" ry="18" fill="#ffffff" opacity=".45" />
            <rect x="486" y="684" width="64" height="12" rx="6" fill="#7a2f4a" />
            <circle cx="476" cy="760" r="10" fill="#3a2314" />
            <circle cx="560" cy="760" r="10" fill="#3a2314" />
            <ellipse cx="518" cy="800" rx="40" ry="28" fill="#f483a7" stroke="#c9577e" strokeWidth="5" />
            <ellipse cx="505" cy="800" rx="7" ry="10" fill="#9c3d60" />
            <ellipse cx="531" cy="800" rx="7" ry="10" fill="#9c3d60" />
            <text x="610" y="830" fontSize="44" fontWeight="900" textAnchor="middle" dominantBaseline="central" fill="#c9577e">₩</text>
          </g>
          <g data-j="head">
            <g data-j="earL"><PartImage name="earL" /></g>
            <g data-j="earR"><PartImage name="earR" /></g>
            <PartImage name="head" />
            <g data-j="browL"><PartImage name="browL" /></g>
            <g data-j="browR"><PartImage name="browR" /></g>
            <g data-j="eyeL"><PartImage name="eyeL" /></g>
            <g data-j="eyeR"><PartImage name="eyeR" /></g>
            <g data-f="eyesHappy" display="none" stroke="#3a2314" strokeWidth="13" fill="none" strokeLinecap="round">
              <path d="M364 428 Q411 360 458 428" />
              <path d="M578 428 Q625 360 672 428" />
            </g>
            <g data-f="eyesClosed" display="none" stroke="#3a2314" strokeWidth="10" fill="none" strokeLinecap="round">
              <path d="M362 406 Q411 438 460 406" />
              <path d="M576 406 Q625 438 674 406" />
            </g>
            {/* 안경 */}
            <g data-p="glass" display="none">
              <rect x="349" y="352" width="124" height="108" rx="40" fill="rgba(255, 255, 255, 0.10)" stroke="#154f34" strokeWidth="9" />
              <rect x="563" y="352" width="124" height="108" rx="40" fill="rgba(255, 255, 255, 0.10)" stroke="#154f34" strokeWidth="9" />
              <path d="M360 362 Q411 346 462 362" stroke="#154f34" strokeWidth="15" fill="none" strokeLinecap="round" />
              <path d="M574 362 Q625 346 676 362" stroke="#154f34" strokeWidth="15" fill="none" strokeLinecap="round" />
              <path d="M473 394 Q518 378 563 394" stroke="#154f34" strokeWidth="8" fill="none" strokeLinecap="round" />
              <path data-p="glint" d="M372 440 L402 372" stroke="#ffffff" strokeWidth="8" strokeLinecap="round" opacity="0.55" />
              <path d="M586 440 L616 372" stroke="#ffffff" strokeWidth="8" strokeLinecap="round" opacity="0.55" />
            </g>
            <g data-f="mouthSmile"><PartImage name="mouth" /></g>
            <g data-f="mouthOpen" display="none">
              <path d="M466 472 Q518 482 570 472 Q564 545 518 547 Q472 545 466 472 Z" fill="#8E1C22" />
              <path d="M488 528 Q518 512 548 528 Q540 545 518 546 Q496 545 488 528 Z" fill="#F07A80" />
              <path d="M474 476 Q518 484 562 476 L560 486 Q518 494 476 486 Z" fill="#fff" opacity=".9" />
            </g>
            <g data-f="mouthTalk" display="none">
              <path d="M484 476 Q518 482 552 476 Q548 516 518 518 Q488 516 484 476 Z" fill="#8E1C22" />
              <path d="M498 506 Q518 498 538 506 Q532 517 518 517 Q504 517 498 506 Z" fill="#F07A80" />
            </g>
            <g data-f="mouthSad" display="none">
              <path d="M480 504 Q518 470 556 504" stroke="#8E1C22" strokeWidth="11" fill="none" strokeLinecap="round" />
            </g>
            <g data-f="mouthO" display="none">
              <ellipse cx="518" cy="492" rx="20" ry="24" fill="#8E1C22" />
            </g>
            <g data-f="sweat" display="none">
              <path d="M712 236 Q740 286 740 304 A28 28 0 1 1 684 304 Q684 286 712 236 Z" fill="#7CC8FF" stroke="#fff" strokeWidth="6" />
            </g>
          </g>
          {/* 얼굴 앞으로 오는 소품은 머리 위에 그립니다 (오른팔과 같이 움직임) */}
          <g data-j="armR2">
              {/* 돋보기 */}
              <g data-p="mag" display="none">
                <path d="M742 780 L790 748" stroke="#8a5a32" strokeWidth="22" strokeLinecap="round" />
                <circle cx="836" cy="717" r="62" fill="rgba(200, 236, 255, 0.28)" stroke="#154f34" strokeWidth="16" />
                <path d="M800 690 A44 44 0 0 1 836 670" stroke="#ffffff" strokeWidth="9" fill="none" strokeLinecap="round" opacity=".85" />
              </g>
          </g>
        </g>
      </g>
      <g data-fx />
    </svg>
  );
}

