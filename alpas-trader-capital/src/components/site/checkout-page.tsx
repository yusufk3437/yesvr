"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, Lock } from "lucide-react";
import { COUNTRIES, RESTRICTED_COUNTRIES } from "@/domain/catalog";
import { formatSize } from "@/domain/money";
import type { PlatformId, ProgramId } from "@/domain/types";
import { useI18n } from "@/i18n/provider";
import { useCatalog, useSessionUser } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { purchaseChallenge, quoteOrder, setCart } from "@/services/actions";
import { Button, Card, Checkbox, Field, Input, LinkButton, LoadingBlock, Notice, Segmented, Select, cx, useToast } from "../ui";
import { evaluationRows, fundedRows } from "./rule-rows";

export function CheckoutPage() {
  const { m, t, l, f, locale } = useI18n();
  const c = m.checkout;
  const { state, ready, run, actor, now } = useStore();
  const user = useSessionUser();
  const { programs, current } = useCatalog();
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [billing, setBilling] = useState({ name: "", country: "TR", city: "" });
  const [payment, setPayment] = useState<"card_demo" | "bank_demo">("card_demo");
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<string | undefined>();
  const [promoError, setPromoError] = useState<string | null>(null);
  const [accept, setAccept] = useState({ terms: false, risk: false });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ orderId: string; accountId: string; version: string } | null>(null);

  // URL selection → persisted cart (survives sign-in), otherwise the stored cart.
  useEffect(() => {
    if (!ready) return;
    const p = params.get("program") as ProgramId | null;
    const size = Number(params.get("size")) * 100;
    if (p && programs.some((x) => x.id === p) && size) {
      const platform = (params.get("platform") as PlatformId) || "mt5";
      run((s) => setCart(s, { programId: p, size, platform }));
    } else if (!state?.cart) run((s) => setCart(s, { programId: "ascent", size: 10_000_000, platform: "mt5" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  if (user && prefilledFor !== user.id) {
    setPrefilledFor(user.id);
    setBilling((b) => ({ ...b, name: b.name || (user.kyc.legalName ?? user.name), country: user.country }));
  }

  if (!ready || (!state?.cart && !done)) return <LoadingBlock label={m.common.loading} rows={6} />;

  if (done)
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <Card className="p-8 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-gain-100 text-gain">
            <Check className="size-7" aria-hidden />
          </div>
          <h1 className="mt-5 font-display text-2xl font-extrabold">{c.successTitle}</h1>
          <p className="mt-2 text-muted">{t(c.successBody, { order: done.orderId, account: done.accountId })}</p>
          <p className="num mt-1 text-sm text-muted">{t(c.successRule, { v: done.version })}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <LinkButton href={`/dashboard?account=${done.accountId}`} variant="primary">
              {c.openDashboard}
            </LinkButton>
            <LinkButton href={`/dashboard/orders?invoice=${done.orderId}`} variant="outline">
              {c.viewInvoice}
            </LinkButton>
          </div>
          <p className="mt-6 text-xs text-muted">{c.credentialsNote}</p>
        </Card>
      </div>
    );

  const cart = state!.cart!;
  const program = programs.find((p) => p.id === cart.programId)!;
  const rs = current(cart.programId);
  const q = quoteOrder(state!, cart.programId, cart.size, promo, now);
  const quote = q.ok ? q.value : null;
  const restricted = RESTRICTED_COUNTRIES.includes(billing.country);
  const steps = [c.steps.select, c.steps.account, c.steps.billing, c.steps.review];
  const sizeError = !q.ok && q.error.startsWith("size_") ? (m.errors[q.error as keyof typeof m.errors] ?? m.errors.generic) : null;
  const isCustom = !program.sizes.some((o) => o.size === cart.size);
  const canNext = [!sizeError, !!user, billing.name.trim().length >= 2 && !restricted, true][step] && !sizeError;

  const confirm = () => {
    setError(null);
    const r = run((s, n) =>
      purchaseChallenge(
        s,
        actor ?? { role: "trader", id: "" },
        { programId: cart.programId, size: cart.size, platform: cart.platform, promoCode: promo, billing: { name: billing.name, country: billing.country, city: billing.city }, paymentMethod: payment, acceptTerms: accept.terms, acceptRisk: accept.risk },
        n,
      ),
    );
    if (!r.ok) {
      setError(m.errors[r.error as keyof typeof m.errors] ?? m.errors.generic);
      return;
    }
    setDone({ orderId: r.value.orderId, accountId: r.value.accountId, version: rs.version });
    toast("gain", c.successTitle);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-10 sm:px-6">
      <h1 className="font-serif text-[2.2rem] font-semibold">{c.title}</h1>
      <Notice tone="warn" className="mt-4">
        {c.demoNotice}
      </Notice>
      <ol className="mt-6 grid grid-cols-4 gap-2" aria-label={c.title}>
        {steps.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined} className="min-w-0">
            <div className={cx("h-1 rounded-full", i <= step ? "bg-brass" : "bg-line")} />
            <p className={cx("mt-2 truncate text-xs font-medium sm:text-sm", i === step ? "text-ink" : "text-muted")}>
              <span className="num mr-1">{i + 1}.</span>
              {s}
            </p>
          </li>
        ))}
      </ol>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="p-5 sm:p-6">
          {step === 0 && (
            <div className="space-y-5">
              <h2 className="font-display text-xl font-bold">{c.selectTitle}</h2>
              <div>
                <p className="mb-2 text-sm font-medium">{m.site.selector.program}</p>
                <Segmented
                  value={cart.programId}
                  onChange={(v) => {
                    const p = programs.find((x) => x.id === v)!;
                    const fits = p.sizes.some((s) => s.size === cart.size) || (cart.size >= p.customSizing.minSize && cart.size <= p.customSizing.maxSize && cart.size % p.customSizing.step === 0);
                    const size = fits ? cart.size : p.sizes[0].size;
                    run((s) => setCart(s, { ...cart, programId: v, size }));
                    setPromo(undefined);
                  }}
                  label={m.site.selector.program}
                  options={programs.map((p) => ({ value: p.id, label: l(p.name) }))}
                />
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">{m.site.selector.size}</p>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={m.site.selector.size}>
                  {program.sizes.map((o) => (
                    <button
                      key={o.size}
                      type="button"
                      role="radio"
                      aria-checked={cart.size === o.size}
                      onClick={() => run((s) => setCart(s, { ...cart, size: o.size }))}
                      className={cx("num h-10 rounded-[10px] border px-3 font-display text-sm font-bold", cart.size === o.size ? "border-ink bg-ink text-paper" : "border-line bg-white")}
                    >
                      {formatSize(o.size)} · {f.money(o.price, { decimals: 0 })}
                    </button>
                  ))}
                  {isCustom && (
                    <button type="button" role="radio" aria-checked className="num h-10 rounded-[10px] border border-brass bg-brass-100 px-3 font-display text-sm font-bold text-brass-700">
                      {formatSize(cart.size)}
                      {quote ? ` · ${f.money(quote.listPrice, { decimals: 0 })}` : ""} · {c.customTag}
                    </button>
                  )}
                </div>
                {sizeError && (
                  <Notice tone="loss" className="mt-3">
                    {sizeError}
                  </Notice>
                )}
                <Link href="/challenges#budget" className="mt-2 inline-block text-sm text-brass-700 hover:underline">
                  {isCustom ? c.changeCustom : m.site.budget.teaser} →
                </Link>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">{m.site.challenges.platform}</p>
                <Segmented value={cart.platform} onChange={(v) => run((s) => setCart(s, { ...cart, platform: v }))} label={m.site.challenges.platform} options={program.platforms.map((p) => ({ value: p, label: m.labels.platform[p] }))} />
                <p className="mt-1 text-xs text-muted">{m.site.challenges.platformNote}</p>
              </div>
              {renderRules()}
            </div>
          )}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="font-display text-xl font-bold">{c.accountTitle}</h2>
              {user ? (
                <Notice tone="gain">{t(c.accountSignedIn, { email: user.email })}</Notice>
              ) : (
                <>
                  <p className="text-sm text-muted">{c.accountNeed}</p>
                  <div className="flex flex-wrap gap-3">
                    <LinkButton href="/login?next=/checkout" variant="primary">
                      {m.common.signIn}
                    </LinkButton>
                    <LinkButton href="/register?next=/checkout" variant="outline">
                      {m.common.register}
                    </LinkButton>
                  </div>
                </>
              )}
            </div>
          )}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="font-display text-xl font-bold">{c.billingTitle}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={c.billingName} htmlFor="b-name">
                  <Input id="b-name" value={billing.name} onChange={(e) => setBilling({ ...billing, name: e.target.value })} autoComplete="name" />
                </Field>
                <Field label={c.billingCountry} htmlFor="b-country" error={restricted ? c.restricted : null}>
                  <Select id="b-country" value={billing.country} onChange={(e) => setBilling({ ...billing, country: e.target.value })} aria-invalid={restricted}>
                    {COUNTRIES.map((x) => (
                      <option key={x.code} value={x.code}>
                        {x[locale]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={c.billingCity} htmlFor="b-city" optional={m.common.optional}>
                  <Input id="b-city" value={billing.city} onChange={(e) => setBilling({ ...billing, city: e.target.value })} autoComplete="address-level2" />
                </Field>
              </div>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">{c.paymentTitle}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(["card_demo", "bank_demo"] as const).map((p) => (
                    <label key={p} className={cx("flex cursor-pointer items-center gap-3 rounded-[12px] border p-3 text-sm", payment === p ? "border-navy-700 bg-navy-100/50" : "border-line bg-white")}>
                      <input type="radio" name="pay" className="accent-navy-700" checked={payment === p} onChange={() => setPayment(p)} />
                      {p === "card_demo" ? c.payCard : c.payBank}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div>
                <Field label={c.promo} htmlFor="b-promo" error={promoError} optional={m.common.optional} hint={promo && quote?.promo ? t(c.promoApplied, { label: l(quote.promo.label), date: quote.promo.validUntil }) : undefined}>
                  <div className="flex gap-2">
                    <Input id="b-promo" value={promoInput} onChange={(e) => setPromoInput(e.target.value)} placeholder="ASCENT10" autoCapitalize="characters" />
                    <Button
                      variant="outline"
                      onClick={() => {
                        const r = quoteOrder(state!, cart.programId, cart.size, promoInput, now);
                        if (r.ok && r.value.promo) {
                          setPromo(promoInput);
                          setPromoError(null);
                        } else {
                          setPromo(undefined);
                          setPromoError(!r.ok ? (m.errors[r.error as keyof typeof m.errors] ?? m.errors.generic) : null);
                        }
                      }}
                    >
                      {c.promoApply}
                    </Button>
                  </div>
                </Field>
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="font-display text-xl font-bold">{c.reviewTitle}</h2>
              {renderRules()}
              <div className="space-y-3">
                <Checkbox id="acc-terms" checked={accept.terms} onChange={(e) => setAccept({ ...accept, terms: e.target.checked })} label={t(c.acceptTerms, { program: l(program.name), v: rs.version })} />
                <Checkbox id="acc-risk" checked={accept.risk} onChange={(e) => setAccept({ ...accept, risk: e.target.checked })} label={c.acceptRisk} />
              </div>
              {error && <Notice tone="loss">{error}</Notice>}
            </div>
          )}

          <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-line-2 pt-5">
            <Button variant="ghost" onClick={() => (step === 0 ? router.push("/challenges") : setStep(step - 1))}>
              {m.common.back}
            </Button>
            {step < 3 ? (
              <Button variant="primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
                {m.common.continue}
              </Button>
            ) : (
              <Button variant="accent" disabled={!accept.terms || !accept.risk} onClick={confirm}>
                <Lock className="size-4" aria-hidden /> {c.pay}
              </Button>
            )}
          </div>
        </Card>

        <aside>
          <Card className="sticky top-24 p-5">
            <p className="eyebrow text-muted">{m.site.challenges.summary}</p>
            <p className="mt-2 font-display text-lg font-bold">{t(c.lineChallenge, { program: l(program.name), size: formatSize(cart.size) })}</p>
            {quote?.custom && (
              <p className="mt-1 text-xs text-brass-700">
                {c.customTag} · {t(c.customNote, { premium: f.bps(program.customSizing.premiumBps) })}
              </p>
            )}
            <p className="text-sm text-muted">
              {l(program.model)} · {m.labels.platform[cart.platform]}
            </p>
            {quote && (
              <dl className="num mt-4 divide-y divide-line-2 text-sm">
                <div className="flex justify-between py-2">
                  <dt className="text-muted">{c.listPrice}</dt>
                  <dd>{f.money(quote.listPrice)}</dd>
                </div>
                {quote.discount > 0 && (
                  <div className="flex justify-between py-2 text-gain">
                    <dt>
                      {c.discount} ({quote.promo?.code} · {f.bps(quote.promoBps)})
                    </dt>
                    <dd>−{f.money(quote.discount)}</dd>
                  </div>
                )}
                {quote.custom && quote.promo && <p className="pb-2 text-xs text-muted">{t(c.promoReduced, { pct: f.bps(quote.promoBps) })}</p>}
                <div className="flex justify-between py-2 text-base font-semibold">
                  <dt>{c.total}</dt>
                  <dd>{f.money(quote.total)}</dd>
                </div>
              </dl>
            )}
            <p className="mt-3 text-xs text-muted">{m.site.selector.sizeNote}</p>
            <p className="mt-1 text-xs text-muted">{t(c.ruleLock, { v: rs.version })}</p>
            <Link href={`/rules?program=${cart.programId}&version=${rs.version}`} className="mt-3 inline-block text-xs text-navy-700 hover:underline">
              {m.nav.rules} →
            </Link>
          </Card>
        </aside>
      </div>
    </div>
  );

  function renderRules() {
    const ev = evaluationRows(rs, cart.size, m, locale);
    const fu = fundedRows(rs, cart.size, m, locale);
    const evals = rs.phases.filter((p) => p.kind !== "funded");
    return (
      <div className="rounded-[12px] border border-line-2 bg-paper/60 p-4">
        <p className="text-sm font-semibold">
          {c.rulesInline} · v{rs.version}
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="eyebrow text-navy-700">{m.site.selector.evalStage}</p>
            <dl className="mt-1 space-y-1 text-sm">
              {ev.map((r) => (
                <div key={r.key} className="flex justify-between gap-3">
                  <dt className="text-muted">{r.label}</dt>
                  <dd className="num text-right">{evals.length > 1 ? r.values.join(" / ") : r.values[0]}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <p className="eyebrow text-navy-700">{m.site.selector.fundedStage}</p>
            <dl className="mt-1 space-y-1 text-sm">
              {fu.map((r) => (
                <div key={r.key} className="flex justify-between gap-3">
                  <dt className="text-muted">{r.label}</dt>
                  <dd className="num text-right">{r.values[0]}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    );
  }
}
