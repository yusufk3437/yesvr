import { contourPaths, MONOGRAM, openSpline, routeGeometry } from "@/lib/topo";
import { cx } from "./ui";

export function Monogram({ className, tone = "dark", title = "ALPAS Trader Capital" }: { className?: string; tone?: "dark" | "light"; title?: string }) {
  const seal = tone === "dark" ? "var(--color-logo)" : "var(--color-paper)";
  const summit = tone === "dark" ? "var(--color-paper)" : "var(--color-logo)";
  const metal = tone === "dark" ? "var(--color-brass)" : "var(--color-brass-700)";
  return (
    <svg viewBox="0 0 64 64" className={cx("shrink-0", className)} role={title ? "img" : undefined} aria-label={title || undefined} aria-hidden={title ? undefined : true}>
      <circle cx={MONOGRAM.seal.cx} cy={MONOGRAM.seal.cy} r={MONOGRAM.seal.r} fill={seal} />
      <circle cx={MONOGRAM.seal.cx} cy={MONOGRAM.seal.cy} r={MONOGRAM.ring.r} fill="none" stroke={metal} strokeWidth={MONOGRAM.ring.width} />
      <path d={MONOGRAM.summit} fill={summit} />
      <path d={MONOGRAM.counter} fill={seal} />
      <path d={MONOGRAM.diamond} fill={metal} />
    </svg>
  );
}

export function Wordmark({ className, tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <Monogram className="size-9" tone={tone === "dark" ? "dark" : "light"} title="" />
      <span className="flex flex-col leading-none">
        <span className={cx("font-serif text-[1.18rem] font-semibold tracking-[0.16em]", tone === "dark" ? "text-ink" : "text-paper")}>ALPAS</span>
        <span className={cx("mt-1 font-display text-[0.52rem] font-semibold tracking-[0.34em]", tone === "dark" ? "text-muted" : "text-paper/65")}>TRADER CAPITAL</span>
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
  const ink = tone === "light" ? "var(--color-paper)" : "var(--color-navy-800)";
  const faint = tone === "light" ? "rgb(244 242 237 / 0.32)" : "rgb(15 34 64 / 0.25)";
  return (
    <svg viewBox={`0 -40 ${width} ${height + 84}`} className={cx("w-full overflow-visible", className)} role="img" aria-label={stops.map((s) => `${s.label}: ${s.state}`).join(", ")}>
      <path d={d} fill="none" stroke={faint} strokeWidth="2" strokeDasharray="2 9" strokeLinecap="round" />
      {lastDone > 0 && (
        <path
          d={openSpline(points, lastDone)}
          fill="none"
          stroke="var(--color-brass)"
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
            {s.state === "current" && <circle r="7" fill="none" stroke="var(--color-brass)" strokeWidth="2" className="pulse-ring" />}
            <circle r={compact ? (s.state === "next" ? 5 : 6.5) : s.state === "next" ? 6 : 8} fill={s.state === "next" ? (tone === "light" ? "var(--color-navy-900)" : "var(--color-card)") : "var(--color-brass)"} stroke={s.state === "next" ? faint : ink} strokeWidth="2.5" />
            <text
              y={above ? (compact ? -16 : -22) : compact ? 26 : 30}
              textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
              className="font-display"
              fontSize={compact ? 17 : 22}
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
