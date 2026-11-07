"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BadgeCheck, CircleSlash, SearchX, ShieldAlert } from "lucide-react";
import { verifyCertificate } from "@/domain/certificates";
import { useI18n } from "@/i18n/provider";
import { useCatalog } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { Monogram } from "../brand";
import { Button, Card, Field, Input, LoadingBlock, Notice, cx } from "../ui";
import { PageHero } from "./page-hero";

export function VerifyForm({ initialId = "", initialCode = "" }: { initialId?: string; initialCode?: string }) {
  const { m } = useI18n();
  const v = m.site.verify;
  const router = useRouter();
  const [id, setId] = useState(initialId);
  const [code, setCode] = useState(initialCode);
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1.4fr_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        if (id.trim()) router.push(`/verify/${encodeURIComponent(id.trim().toUpperCase())}${code.trim() ? `?c=${encodeURIComponent(code.trim().toUpperCase())}` : ""}`);
      }}
    >
      <Field label={v.number} htmlFor="v-id">
        <Input id="v-id" value={id} onChange={(e) => setId(e.target.value)} placeholder="ATC-CP-26-000041" autoCapitalize="characters" />
      </Field>
      <Field label={v.code} htmlFor="v-code" optional={m.common.optional}>
        <Input id="v-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX" autoCapitalize="characters" />
      </Field>
      <Button type="submit">{v.check}</Button>
    </form>
  );
}

export function VerifyLanding() {
  const { m } = useI18n();
  const v = m.site.verify;
  return (
    <>
      <PageHero eyebrow={v.eyebrow} title={v.title} intro={v.intro} />
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Card className="p-6">
          <VerifyForm />
        </Card>
        <p className="mt-4 text-sm text-muted">{v.privacy}</p>
      </div>
    </>
  );
}

export function VerifyResult({ id, code }: { id: string; code: string | null }) {
  const { m, l, f } = useI18n();
  const v = m.site.verify;
  const { state, ready } = useStore();
  const { programs } = useCatalog();
  const result = state ? verifyCertificate(state.certificates, id, code) : null;
  const tone = result?.state === "valid" ? "gain" : result?.state === "revoked" ? "loss" : "warn";
  const Icon = result?.state === "valid" ? BadgeCheck : result?.state === "revoked" ? CircleSlash : result?.state === "code_mismatch" ? ShieldAlert : SearchX;
  return (
    <>
      <PageHero eyebrow={v.eyebrow} title={v.title} />
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-12 sm:px-6">
        {!ready || !result ? (
          <Card>
            <LoadingBlock label={m.common.loading} />
          </Card>
        ) : (
          <Card className={cx("overflow-hidden border-2", tone === "gain" ? "border-gain/40" : tone === "loss" ? "border-loss/40" : "border-warn-500/40")}>
            <div className={cx("flex items-center gap-3 px-6 py-4", tone === "gain" ? "bg-gain-100" : tone === "loss" ? "bg-loss-100" : "bg-warn-100")} role="status">
              <Icon className={cx("size-7", tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : "text-warn")} aria-hidden />
              <div>
                <p className="font-display text-lg font-extrabold">{result.state === "valid" ? v.valid : result.state === "revoked" ? v.revoked : result.state === "code_mismatch" ? v.mismatch : v.notFound}</p>
                <p className="num text-sm text-graphite-2">{id}</p>
              </div>
            </div>
            {"cert" in result ? (
              <div className="grid gap-6 p-6 sm:grid-cols-[auto_1fr]">
                <Monogram className="size-14" />
                <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                  {[
                    [v.type, m.labels.certType[result.cert.type]],
                    [v.holder, result.cert.traderName],
                    [v.program, l(programs.find((p) => p.id === result.cert.programId)?.name ?? { en: result.cert.programId, tr: result.cert.programId })],
                    [v.account, result.cert.accountRef],
                    [result.cert.amountKind === "nominal_size" ? v.nominal : v.payoutAmount, f.money(result.cert.amount, { decimals: result.cert.amountKind === "nominal_size" ? 0 : 2 })],
                    [v.issued, f.date(result.cert.issuedAt)],
                  ].map(([k, val]) => (
                    <div key={k}>
                      <dt className="text-xs uppercase tracking-[0.08em] text-muted">{k}</dt>
                      <dd className="num mt-0.5 font-medium">{val}</dd>
                    </div>
                  ))}
                </dl>
                {result.state === "revoked" && (
                  <Notice tone="loss" className="sm:col-span-2" title={v.revokedOn.replace("{date}", f.date(result.cert.revokedAt ?? 0))}>
                    {result.cert.revokedReason}
                  </Notice>
                )}
                {result.cert.specimen && <p className="text-xs text-muted sm:col-span-2">{v.specimen}</p>}
              </div>
            ) : (
              <p className="p-6 text-sm text-graphite">{result.state === "code_mismatch" ? v.mismatchBody : v.notFoundBody}</p>
            )}
          </Card>
        )}
        <Card className="p-6">
          <VerifyForm initialId={id} initialCode={code ?? ""} />
        </Card>
        <p className="text-xs text-muted">{v.privacy}</p>
        <p className="text-xs text-muted">{v.registryNote}</p>
      </div>
    </>
  );
}
