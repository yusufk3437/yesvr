/**
 * Certificate layout as a list of drawing operations (A4 landscape, points,
 * y down). Rendered by the SVG share preview and by the PDF generator, so both
 * outputs are the same design.
 */
import QRCode from "qrcode";
import type { Messages } from "@/i18n/messages";
import { fnv1a } from "@/domain/certificates";
import { fmt, type Locale } from "@/domain/l10n";
import { formatMoney } from "@/domain/money";
import { formatInZone } from "@/domain/time";
import type { Certificate } from "@/domain/types";
import { contourPaths, MONOGRAM, openSpline } from "./topo";

export const PAGE = { w: 842, h: 595 };

export type FontKey = "display" | "displayHeavy" | "sans" | "sansMedium" | "serif" | "serifItalic" | "mono";

export type Op =
  | { k: "rect"; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; sw?: number; opacity?: number }
  | { k: "path"; d: string; tx: number; ty: number; scale?: number; stroke?: string; fill?: string; sw?: number; opacity?: number }
  | { k: "circle"; cx: number; cy: number; r: number; fill?: string; stroke?: string; sw?: number; opacity?: number }
  | { k: "text"; x: number; y: number; text: string; font: FontKey; size: number; color: string; anchor?: "start" | "middle" | "end"; tracking?: number; opacity?: number; rotate?: number }
  | { k: "qr"; x: number; y: number; size: number; modules: boolean[][]; color: string };

const THEMES = {
  challenge_passed: { band: "#0e3a42", accent: "#b5653c", accentSoft: "#dba27e", reach: 2 },
  funded_trader: { band: "#22272c", accent: "#2f8f73", accentSoft: "#8fd0bb", reach: 3 },
  payout: { band: "#3a2717", accent: "#c98a4f", accentSoft: "#e9c39b", reach: 4 },
} as const;

/** Rough advance widths (em) for fitting; both renderers use the same numbers. */
const EM: Record<FontKey, number> = { display: 0.62, displayHeavy: 0.66, sans: 0.53, sansMedium: 0.55, serif: 0.5, serifItalic: 0.47, mono: 0.6 };
export const approxWidth = (text: string, font: FontKey, size: number, tracking = 0) => text.length * (EM[font] * size + tracking);

export interface CertificateContext {
  locale: Locale;
  copy: Messages["certs"];
  programName: string;
  verifyUrl: string;
  verifyDisplay: string;
}

export function certificateLayout(cert: Certificate, ctx: CertificateContext): Op[] {
  const { copy, locale } = ctx;
  const th = THEMES[cert.type];
  const ops: Op[] = [];
  const W = PAGE.w;
  const H = PAGE.h;
  const BAND = 214;
  const ink = "#15181b";
  const muted = "#5f6466";
  const paper = "#f7f4ed";

  // Paper and security pattern (contours seeded by the certificate id).
  ops.push({ k: "rect", x: 0, y: 0, w: W, h: H, fill: paper });
  const seed = fnv1a(cert.id);
  for (const d of contourPaths({ width: W - BAND, height: H, seed, levels: 14, peaks: [{ x: (W - BAND) * 0.78, y: H * 0.22, r: 360 }, { x: (W - BAND) * 0.1, y: H * 0.95, r: 230 }] }))
    ops.push({ k: "path", d, tx: BAND, ty: 0, stroke: th.band, sw: 0.45, opacity: 0.12 });
  // Micro-text guilloche line along the bottom edge.
  const micro = `${cert.id} · ${cert.verificationCode} · ALPAS · `.repeat(14);
  ops.push({ k: "text", x: BAND + 24, y: H - 10, text: micro.slice(0, 160), font: "mono", size: 4.2, color: th.band, opacity: 0.35 });

  // Frame.
  ops.push({ k: "rect", x: BAND + 18, y: 18, w: W - BAND - 36, h: H - 36, stroke: th.band, sw: 0.8, opacity: 0.55 });
  ops.push({ k: "rect", x: BAND + 23, y: 23, w: W - BAND - 46, h: H - 46, stroke: th.accent, sw: 0.4, opacity: 0.7 });

  // Left band with monogram and route stamp.
  ops.push({ k: "rect", x: 0, y: 0, w: BAND, h: H, fill: th.band });
  for (const d of contourPaths({ width: BAND, height: H, seed: seed ^ 0x9e3779b9, levels: 8, peaks: [{ x: BAND * 0.6, y: H * 0.7, r: 260 }] }))
    ops.push({ k: "path", d, tx: 0, ty: 0, stroke: "#f3f0e8", sw: 0.5, opacity: 0.09 });
  const mx = 40;
  const my = 46;
  const ms = 1.35;
  ops.push({ k: "path", d: roundedRect(47, 47, 11), tx: mx + 0.5 * ms, ty: my + 0.5 * ms, scale: ms, fill: "#f3f0e8" });
  ops.push({ k: "path", d: MONOGRAM.legs, tx: mx, ty: my, scale: ms, stroke: th.band, sw: 4.2 });
  ops.push({ k: "path", d: MONOGRAM.contour, tx: mx, ty: my, scale: ms, stroke: th.band, sw: 2.4 });
  ops.push({ k: "circle", cx: mx + MONOGRAM.dot.cx * ms, cy: my + MONOGRAM.dot.cy * ms, r: MONOGRAM.dot.r * ms, fill: th.accent });
  ops.push({ k: "text", x: mx, y: my + 48 * ms + 30, text: "ALPAS", font: "displayHeavy", size: 22, color: "#f3f0e8", tracking: 3.2 });
  ops.push({ k: "text", x: mx, y: my + 48 * ms + 46, text: copy.brandLine, font: "display", size: 7.2, color: "#f3f0e8", tracking: 2.4, opacity: 0.7 });

  // Route stamp: vertical waypoints, filled up to the certified stage.
  const stops = [copy.route.evaluation, copy.route.review, copy.route.funded, copy.route.payout];
  const top = 270;
  const gap = 68;
  const pts = stops.map((_, i) => ({ x: mx + 10 + (i % 2) * 22, y: top + i * gap }));
  ops.push({ k: "path", d: openSpline(pts), tx: 0, ty: 0, stroke: "#f3f0e8", sw: 1, opacity: 0.35 });
  ops.push({ k: "path", d: openSpline(pts, th.reach - 1), tx: 0, ty: 0, stroke: th.accentSoft, sw: 2.2 });
  stops.forEach((label, i) => {
    const reached = i < th.reach;
    ops.push({ k: "circle", cx: pts[i].x, cy: pts[i].y, r: reached ? 6 : 4.5, fill: reached ? th.accentSoft : th.band, stroke: "#f3f0e8", sw: 1.4, opacity: reached ? 1 : 0.6 });
    ops.push({ k: "text", x: pts[i].x + 16, y: pts[i].y + 3.5, text: label.toUpperCase(), font: "display", size: 8, color: "#f3f0e8", tracking: 1.4, opacity: reached ? 0.95 : 0.45 });
  });
  ops.push({ k: "text", x: mx, y: H - 40, text: copy.specimen, font: "display", size: 8, color: th.accentSoft, tracking: 2 });

  // Content.
  const cx = BAND + 54;
  const cw = W - BAND - 108;
  ops.push({ k: "text", x: cx, y: 82, text: copy.eyebrow[cert.type].toUpperCase(), font: "display", size: 8.5, color: th.accent, tracking: 2.2 });
  ops.push({ k: "text", x: cx, y: 128, text: copy.title[cert.type], font: "displayHeavy", size: 40, color: ink, tracking: -0.6 });
  ops.push({ k: "rect", x: cx, y: 146, w: 56, h: 2.4, fill: th.accent });
  ops.push({ k: "text", x: cx, y: 184, text: copy.certifies, font: "sans", size: 11, color: muted });
  const nameSize = Math.min(38, cw / Math.max(1, cert.traderName.length * EM.serif));
  ops.push({ k: "text", x: cx, y: 184 + 14 + nameSize, text: cert.traderName, font: "serif", size: nameSize, color: ink });
  const stY = 184 + 14 + nameSize + 26;
  const statement = fmt(copy.statement[cert.type], { program: ctx.programName });
  for (const [i, line] of wrap(statement, "serifItalic", 13.5, cw).entries())
    ops.push({ k: "text", x: cx, y: stY + i * 19, text: line, font: "serifItalic", size: 13.5, color: "#2e353b" });

  // Key figures.
  const fy = 382;
  const amount = formatMoney(cert.amount, locale, { decimals: cert.amountKind === "nominal_size" ? 0 : 2 });
  const figures: [string, string][] = [
    [cert.amountKind === "nominal_size" ? copy.nominal : copy.payoutAmount, amount],
    [copy.program, ctx.programName],
    [copy.account, cert.accountRef],
    [copy.date, formatInZone(cert.issuedAt, "UTC", locale, { dateStyle: "long" })],
  ];
  const colW = cw / 4;
  ops.push({ k: "rect", x: cx, y: fy - 22, w: cw, h: 0.6, fill: th.band, opacity: 0.35 });
  figures.forEach(([label, value], i) => {
    const x = cx + i * colW;
    ops.push({ k: "text", x, y: fy, text: label.toUpperCase(), font: "display", size: 6.8, color: muted, tracking: 1.2 });
    const vs = Math.min(i === 0 ? 20 : 12.5, (colW - 12) / Math.max(1, value.length * EM.sansMedium));
    ops.push({ k: "text", x, y: fy + 8 + vs, text: value, font: i === 0 ? "displayHeavy" : "sansMedium", size: vs, color: ink });
  });
  ops.push({ k: "rect", x: cx, y: fy + 46, w: cw, h: 0.6, fill: th.band, opacity: 0.35 });

  // Identification + QR.
  const by = 478;
  ops.push({ k: "text", x: cx, y: by, text: copy.number.toUpperCase(), font: "display", size: 6.8, color: muted, tracking: 1.2 });
  ops.push({ k: "text", x: cx, y: by + 16, text: cert.id, font: "mono", size: 12, color: ink });
  ops.push({ k: "text", x: cx + 190, y: by, text: copy.code.toUpperCase(), font: "display", size: 6.8, color: muted, tracking: 1.2 });
  ops.push({ k: "text", x: cx + 190, y: by + 16, text: cert.verificationCode, font: "mono", size: 12, color: ink, tracking: 1 });
  ops.push({ k: "text", x: cx, y: by + 42, text: `${copy.verifyAt} ${ctx.verifyDisplay}`, font: "sans", size: 7.6, color: muted });
  ops.push({ k: "text", x: cx, y: by + 56, text: copy.specimenNote, font: "sans", size: 7.2, color: muted });
  const qr = QRCode.create(ctx.verifyUrl, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const modules = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => !!qr.modules.get(r, c)));
  const qs = 92;
  ops.push({ k: "rect", x: W - 54 - qs - 8, y: by - 20, w: qs + 16, h: qs + 16, fill: "#ffffff" });
  ops.push({ k: "qr", x: W - 54 - qs, y: by - 12, size: qs, modules, color: ink });

  // Specimen watermark across the content area.
  ops.push({ k: "text", x: BAND + (W - BAND) / 2, y: H / 2 + 30, text: copy.specimen, font: "displayHeavy", size: 54, color: th.band, anchor: "middle", tracking: 5, opacity: 0.05, rotate: -18 });
  if (cert.status === "revoked")
    ops.push({ k: "text", x: BAND + (W - BAND) / 2, y: H / 2, text: copy.revoked, font: "displayHeavy", size: 70, color: "#a8323a", anchor: "middle", tracking: 8, opacity: 0.35, rotate: -18 });
  return ops;
}

/** Rounded rectangle as cubic Béziers (renders identically in SVG and pdf-lib). */
function roundedRect(w: number, h: number, r: number) {
  const k = r * 0.5523;
  return [
    `M${r} 0H${w - r}C${w - r + k} 0 ${w} ${r - k} ${w} ${r}`,
    `V${h - r}C${w} ${h - r + k} ${w - r + k} ${h} ${w - r} ${h}`,
    `H${r}C${r - k} ${h} 0 ${h - r + k} 0 ${h - r}`,
    `V${r}C0 ${r - k} ${r - k} 0 ${r} 0Z`,
  ].join("");
}

function wrap(text: string, font: FontKey, size: number, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (approxWidth(next, font, size) > width && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}
