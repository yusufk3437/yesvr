import { Contours } from "../brand";

export function PageHero({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro?: string; children?: React.ReactNode }) {
  return (
    <section className="relative isolate overflow-hidden border-b border-line-2 bg-paper-2/60">
      <Contours className="absolute inset-0 -z-10 h-full w-full text-petrol-700" opacity={0.09} seed={23} />
      <div className="mx-auto max-w-[1320px] px-4 pb-12 pt-14 sm:px-6 sm:pt-16">
        <p className="eyebrow text-copper">{eyebrow}</p>
        <h1 className="mt-3 max-w-3xl font-display text-[2.2rem] font-extrabold leading-[1.05] tracking-[-0.025em] sm:text-[3rem]">{title}</h1>
        {intro && <p className="mt-4 max-w-2xl text-[1.02rem] leading-relaxed text-muted">{intro}</p>}
        {children}
      </div>
    </section>
  );
}
