import { contourPaths, MONOGRAM, openSpline, routeGeometry } from "@/lib/topo";
import { cx } from "./ui";

export function Monogram({ className, tone = "dark", title = "ALPAS Trader Capital" }: { className?: string; tone?: "dark" | "light"; title?: string }) {
  const bg = tone === "dark" ? "var(--color-petrol-800)" : "var(--color-paper)";
  const fg = tone === "dark" ? "var(--color-paper)" : "var(--color-petrol-900)";
  return (
    <svg viewBox="0 0 48 48" className={cx("shrink-0", className)} role="img" aria-label={title}>
      <rect x="0.5" y="0.5" width="47" height="47" rx="11" fill={bg} />
      <path d={MONOGRAM.legs} fill="none" stroke={fg} strokeWidth="4.2" strokeLinejoin="miter" strokeLinecap="square" />
      <path d={MONOGRAM.contour} fill="none" stroke={fg} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx={MONOGRAM.dot.cx} cy={MONOGRAM.dot.cy} r={MONOGRAM.dot.r} fill="var(--color-copper)" />
    </svg>
  );
}

export function Wordmark({ className, tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <Monogram className="size-9" tone={tone === "dark" ? "dark" : "light"} title="" />
      <span className="flex flex-col leading-none">
        <span className={cx("font-display text-[1.06rem] font-extrabold tracking-[0.14em]", tone === "dark" ? "text-ink" : "text-paper")}>ALPAS</span>
        <span className={cx("mt-1 font-display text-[0.55rem] font-semibold tracking-[0.32em]", tone === "dark" ? "text-muted" : "text-paper/65")}>TRADER CAPITAL</span>
      </span>
    </span>
  );
}

export function Contours({ className, seed = 7, width = 1200, height = 700, stroke = "currentColor", opacity = 0.18, levels }: { className?: string; seed?: number; width?: number; height?: number; stroke?: string; opacity?: number; levels?: number }) {
  const paths = contourPaths({ width, height, seed, levels });
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid slice" className={cx("pointer-events-none", className)} aria-hidden>
      <g fill="none" stroke={stroke} strokeWidth="1" opacity={opacity}>
        {paths.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}

export interface RouteStop {
  label: string;
  sub?: string;
  state: "done" | "current" | "next";
}

/** The ALPAS "route to capital": waypoints on a climbing path. */
export function RouteMap({ stops, className, animate = false, tone = "light", height = 260, compact = false }: { stops: RouteStop[]; className?: string; animate?: boolean; tone?: "light" | "dark"; height?: number; compact?: boolean }) {
  const width = 1000;
  const { d, points } = routeGeometry(stops.length, width, height, compact ? 0.06 : 0.09);
  const lastDone = stops.reduce((m, s, i) => (s.state !== "next" ? i : m), -1);
  const ink = tone === "light" ? "var(--color-paper)" : "var(--color-petrol-800)";
  const faint = tone === "light" ? "rgb(243 240 232 / 0.32)" : "rgb(14 58 66 / 0.25)";
  return (
    <svg viewBox={`0 0 ${width} ${height + 40}`} className={cx("w-full overflow-visible", className)} role="img" aria-label={stops.map((s) => `${s.label}: ${s.state}`).join(", ")}>
      <path d={d} fill="none" stroke={faint} strokeWidth="2" strokeDasharray="2 9" strokeLinecap="round" />
      {lastDone > 0 && (
        <path
          d={openSpline(points, lastDone)}
          fill="none"
          stroke="var(--color-copper)"
          strokeWidth="3"
          strokeLinecap="round"
          className={animate ? "route-draw" : undefined}
          style={animate ? ({ "--route-length": 1400 } as React.CSSProperties) : undefined}
        />
      )}
      {points.map((p, i) => {
        const s = stops[i];
        const above = i % 2 === 1;
        return (
          <g key={i} transform={`translate(${p.x} ${p.y})`}>
            {s.state === "current" && <circle r="7" fill="none" stroke="var(--color-copper)" strokeWidth="2" className="pulse-ring" />}
            <circle r={s.state === "next" ? 6 : 8} fill={s.state === "next" ? (tone === "light" ? "var(--color-petrol-900)" : "var(--color-card)") : "var(--color-copper)"} stroke={s.state === "next" ? faint : ink} strokeWidth="2.5" />
            <text
              y={above ? -22 : 30}
              textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
              className="font-display"
              fontSize={compact ? 26 : 22}
              fontWeight={700}
              fill={s.state === "next" ? faint : ink}
              letterSpacing="0.04em"
            >
              {s.label}
            </text>
            {s.sub && !compact && (
              <text y={above ? -46 : 54} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} fontSize={17} fill={faint} className="num">
                {s.sub}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
