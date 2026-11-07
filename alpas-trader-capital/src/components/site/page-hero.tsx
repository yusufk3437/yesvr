import { Contours } from "../brand";

export function PageHero({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro?: string; children?: React.ReactNode }) {
  return (
    <section className="relative isolate overflow-hidden border-b border-line-2 bg-paper-2/60">
      <Contours className="absolute inset-0 -z-10 h-full w-full text-navy-700" opacity={0.09} seed={23} />
      <div className="mx-auto max-w-[1320px] px-4 pb-12 pt-14 sm:px-6 sm:pt-16">
        <p className="eyebrow text-brass-700">{eyebrow}</p>
        <h1 className="mt-3 max-w-3xl font-serif text-[2.4rem] font-semibold leading-[1.08] tracking-[-0.01em] sm:text-[3.2rem]">{title}</h1>
        {intro && <p className="mt-4 max-w-2xl text-[1.02rem] leading-relaxed text-muted">{intro}</p>}
        {children}
      </div>
    </section>
  );
}
