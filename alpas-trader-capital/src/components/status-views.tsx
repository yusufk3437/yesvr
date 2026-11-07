"use client";

import { useI18n } from "@/i18n/provider";
import { Contours, Monogram } from "./brand";
import { Button, LinkButton } from "./ui";

export function NotFoundView() {
  const { m } = useI18n();
  return (
    <main id="main" className="relative isolate grid min-h-[70vh] place-items-center overflow-hidden px-4">
      <Contours className="absolute inset-0 -z-10 h-full w-full text-navy-700" opacity={0.1} seed={404} />
      <div className="text-center">
        <Monogram className="mx-auto size-12" />
        <p className="num mt-6 font-display text-6xl font-extrabold text-brass-700">404</p>
        <h1 className="mt-2 font-display text-2xl font-extrabold">{m.common.notFoundTitle}</h1>
        <p className="mt-2 text-muted">{m.common.notFoundBody}</p>
        <LinkButton href="/" className="mt-6">
          {m.common.goHome}
        </LinkButton>
      </div>
    </main>
  );
}

export function ErrorView({ onRetry }: { onRetry: () => void }) {
  const { m } = useI18n();
  return (
    <main id="main" className="grid min-h-[60vh] place-items-center px-4 text-center">
      <div>
        <Monogram className="mx-auto size-12" />
        <h1 className="mt-6 font-display text-2xl font-extrabold">{m.common.errorTitle}</h1>
        <p className="mt-2 text-muted">{m.common.errorBody}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={onRetry}>{m.common.retry}</Button>
          <LinkButton href="/" variant="outline">
            {m.common.goHome}
          </LinkButton>
        </div>
      </div>
    </main>
  );
}
