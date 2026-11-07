"use client";

import Link from "next/link";
import { useState } from "react";
import { Copy, Download, ExternalLink } from "lucide-react";
import type { Certificate } from "@/domain/types";
import { useI18n } from "@/i18n/provider";
import { useCatalog, useSessionUser } from "@/lib/hooks";
import { certificateLayout } from "@/lib/certificate-layout";
import { useStore } from "@/lib/store";
import { CertificateSvg } from "../certificate-svg";
import { Button, Card, EmptyState, Pill, useToast } from "../ui";
import { PageTitle } from "./common";

export function useCertificateOps() {
  const { m, l, locale } = useI18n();
  const { programs } = useCatalog();
  return (cert: Certificate) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://alpas.example";
    const url = `${origin}/verify/${cert.id}?c=${cert.verificationCode}&lang=${locale}`;
    return {
      url,
      ops: certificateLayout(cert, {
        locale,
        copy: m.certs,
        programName: l(programs.find((p) => p.id === cert.programId)!.name),
        verifyUrl: url,
        verifyDisplay: `${origin.replace(/^https?:\/\//, "")}/verify/${cert.id}`,
      }),
    };
  };
}

export async function downloadCertificatePdf(cert: Certificate, ops: ReturnType<ReturnType<typeof useCertificateOps>>["ops"], title: string) {
  const [{ loadFontBytes, renderCertificatePdf }] = await Promise.all([import("@/lib/certificate-pdf")]);
  const fonts = await loadFontBytes(async (file) => (await fetch(`/fonts/${file}`)).arrayBuffer());
  const bytes = await renderCertificatePdf(ops, fonts, { title: `${title} — ${cert.id}`, subject: "ALPAS certificate (demo specimen)" });
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${cert.id}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function CertificatesPage() {
  const { m, t, f } = useI18n();
  const { state } = useStore();
  const user = useSessionUser();
  const make = useCertificateOps();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  if (!state || !user) return null;
  const c = m.dash.certificates;
  const mine = state.certificates.filter((x) => x.userId === user.id).sort((a, b) => b.issuedAt - a.issuedAt);
  return (
    <div>
      <PageTitle title={c.title} sub={c.sub} />
      {mine.length === 0 ? (
        <Card>
          <EmptyState title={c.empty} body={c.emptyBody} />
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {mine.map((cert) => {
            const { ops, url } = make(cert);
            const title = m.labels.certType[cert.type];
            return (
              <Card key={cert.id} as="article" className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-2 px-5 py-3">
                  <div>
                    <h2 className="font-display font-bold">{title}</h2>
                    <p className="num text-xs text-muted">
                      {cert.id} · {t(c.issued, { date: f.date(cert.issuedAt) })}
                    </p>
                  </div>
                  <Pill tone={cert.status === "valid" ? "gain" : "loss"}>{cert.status === "valid" ? m.site.verify.valid : m.site.verify.revoked}</Pill>
                </div>
                <div className="bg-paper-2/60 p-4">
                  <p className="mb-2 text-xs font-medium text-muted">{c.share}</p>
                  <CertificateSvg ops={ops} title={`${title} ${cert.id}`} className="w-full rounded-md shadow-[var(--shadow-card)]" />
                </div>
                {cert.status === "revoked" && <p className="border-t border-line-2 px-5 py-2 text-sm text-loss">{t(c.revoked, { reason: cert.revokedReason ?? "" })}</p>}
                <div className="flex flex-wrap gap-2 border-t border-line-2 px-5 py-3">
                  <Button
                    size="sm"
                    disabled={busy === cert.id}
                    onClick={async () => {
                      setBusy(cert.id);
                      try {
                        await downloadCertificatePdf(cert, ops, title);
                        toast("gain", c.ready);
                      } catch {
                        toast("loss", m.errors.generic);
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    <Download className="size-4" aria-hidden /> {busy === cert.id ? c.generating : m.common.downloadPdf}
                  </Button>
                  <Link href={`/verify/${cert.id}?c=${cert.verificationCode}`} className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-line px-3 text-[0.82rem] hover:bg-white">
                    <ExternalLink className="size-4" aria-hidden /> {c.verifyPage}
                  </Link>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void navigator.clipboard?.writeText(url);
                      toast("info", m.common.copied);
                    }}
                  >
                    <Copy className="size-4" aria-hidden /> {c.copyLink}
                  </Button>
                  <span className="num ml-auto self-center text-xs text-muted">
                    {c.code}: {cert.verificationCode}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
