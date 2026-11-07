/**
 * Topographic contour and route geometry. Pure functions returning SVG path
 * strings, shared by the web visuals and the PDF certificate renderer.
 */
import { createRng } from "@/services/rng";

export interface Pt {
  x: number;
  y: number;
}

/** Closed Catmull-Rom spline through points → cubic Bézier path. */
export function closedSpline(pts: Pt[]): string {
  const n = pts.length;
  const f = (v: number) => v.toFixed(1);
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p2.x)} ${f(p2.y)}`;
  }
  return d + " Z";
}

/** Cubic segments of an open Catmull-Rom spline (one per gap between points). */
export function splineSegments(pts: Pt[]): string[] {
  const f = (v: number) => v.toFixed(1);
  const out: string[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    out.push(`C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p2.x)} ${f(p2.y)}`);
  }
  return out;
}

/** Open spline through all points, or only through the first `upTo` + 1 points of the same curve. */
export function openSpline(pts: Pt[], upTo = pts.length - 1): string {
  const f = (v: number) => v.toFixed(1);
  return `M${f(pts[0].x)} ${f(pts[0].y)} ${splineSegments(pts).slice(0, upTo).join(" ")}`;
}

export interface ContourOptions {
  width: number;
  height: number;
  seed: number;
  peaks?: { x: number; y: number; r: number }[];
  levels?: number;
}

/** Concentric irregular rings around a few peaks — reads as a terrain map. */
export function contourPaths({ width, height, seed, peaks, levels = 9 }: ContourOptions): string[] {
  const rng = createRng(seed);
  const centers = peaks ?? [
    { x: width * 0.72, y: height * 0.32, r: Math.min(width, height) * 0.55 },
    { x: width * 0.18, y: height * 0.85, r: Math.min(width, height) * 0.35 },
  ];
  const out: string[] = [];
  for (const c of centers) {
    const phases = Array.from({ length: 4 }, () => rng.range(0, Math.PI * 2));
    const amps = [0.12, 0.07, 0.045, 0.025].map((a) => a * rng.range(0.7, 1.3));
    for (let lv = 1; lv <= levels; lv++) {
      const radius = (c.r * lv) / levels;
      const pts: Pt[] = [];
      const steps = 28;
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        let k = 1;
        for (let h = 0; h < 4; h++) k += amps[h] * Math.sin((h + 2) * a + phases[h] + lv * 0.18);
        pts.push({ x: c.x + Math.cos(a) * radius * k * 1.25, y: c.y + Math.sin(a) * radius * k * 0.82 });
      }
      out.push(closedSpline(pts));
    }
  }
  return out;
}

/** Route from lower-left to upper-right through `n` waypoints. */
export function routeGeometry(n: number, width: number, height: number, pad = 0.08): { d: string; points: Pt[] } {
  const points: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    const x = width * (pad + (1 - 2 * pad) * t);
    const wave = Math.sin(t * Math.PI * 1.6) * height * 0.07;
    const y = height * (1 - pad - (1 - 2 * pad) * (t ** 1.15)) + wave;
    points.push({ x, y });
  }
  return { d: openSpline(points), points };
}

export const MONOGRAM = {
  viewBox: 48,
  legs: "M12 38 L24 9.5 L36 38",
  contour: "M15.8 29 C20.5 26.2 26.5 31.8 32.2 29",
  dot: { cx: 24, cy: 20.5, r: 2.5 },
};
