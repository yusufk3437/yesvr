"use client";

import type { FontKey, Op } from "@/lib/certificate-layout";
import { PAGE } from "@/lib/certificate-layout";

const FAMILY: Record<FontKey, { family: string; weight: number; style?: string }> = {
  display: { family: "var(--font-archivo)", weight: 700 },
  displayHeavy: { family: "var(--font-archivo)", weight: 800 },
  sans: { family: "var(--font-plex)", weight: 400 },
  sansMedium: { family: "var(--font-plex)", weight: 500 },
  serif: { family: "var(--font-newsreader)", weight: 600 },
  serifItalic: { family: "var(--font-newsreader)", weight: 400, style: "italic" },
  mono: { family: "var(--font-plex)", weight: 500 },
};

/** Share preview: the same drawing operations as the PDF. */
export function CertificateSvg({ ops, title, className }: { ops: Op[]; title: string; className?: string }) {
  return (
    <svg viewBox={`0 0 ${PAGE.w} ${PAGE.h}`} className={className} role="img" aria-label={title}>
      {ops.map((op, i) => {
        switch (op.k) {
          case "rect":
            return <rect key={i} x={op.x} y={op.y} width={op.w} height={op.h} fill={op.fill ?? "none"} stroke={op.stroke} strokeWidth={op.sw} opacity={op.opacity} />;
          case "path":
            return (
              <path
                key={i}
                d={op.d}
                transform={`translate(${op.tx} ${op.ty}) scale(${op.scale ?? 1})`}
                fill={op.fill ?? "none"}
                stroke={op.stroke}
                strokeWidth={op.sw}
                opacity={op.opacity}
                strokeLinecap="butt"
                strokeLinejoin="miter"
              />
            );
          case "circle":
            return <circle key={i} cx={op.cx} cy={op.cy} r={op.r} fill={op.fill ?? "none"} stroke={op.stroke} strokeWidth={op.sw} opacity={op.opacity} />;
          case "qr": {
            const n = op.modules.length;
            const cell = op.size / n;
            const d: string[] = [];
            op.modules.forEach((row, r) => row.forEach((on, c) => on && d.push(`M${op.x + c * cell} ${op.y + r * cell}h${cell}v${cell}h-${cell}z`)));
            return <path key={i} d={d.join("")} fill={op.color} shapeRendering="crispEdges" />;
          }
          case "text": {
            const f = FAMILY[op.font];
            return (
              <text
                key={i}
                x={op.x}
                y={op.y}
                fontFamily={f.family}
                fontWeight={f.weight}
                fontStyle={f.style}
                fontSize={op.size}
                fill={op.color}
                opacity={op.opacity}
                letterSpacing={op.tracking}
                textAnchor={op.anchor ?? "start"}
                transform={op.rotate ? `rotate(${op.rotate} ${op.x} ${op.y})` : undefined}
              >
                {op.text}
              </text>
            );
          }
        }
      })}
    </svg>
  );
}
