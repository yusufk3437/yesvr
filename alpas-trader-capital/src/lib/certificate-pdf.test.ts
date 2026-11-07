import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getProgram } from "@/domain/catalog";
import { messages } from "@/i18n/messages";
import { createSeedState } from "@/services/seed";
import { certificateLayout } from "./certificate-layout";
import { loadFontBytes, renderCertificatePdf } from "./certificate-pdf";

const fontsDir = path.resolve(__dirname, "../../public/fonts");
const outDir = process.env.SAMPLES_DIR;

describe("certificate PDFs", () => {
  it("renders all three types in both languages with embedded fonts and the specimen mark", async () => {
    const s = createSeedState(Date.parse("2026-11-10T14:00:00Z"));
    const fonts = await loadFontBytes(async (f) => readFileSync(path.join(fontsDir, f)));
    const types = ["challenge_passed", "funded_trader", "payout"] as const;
    for (const locale of ["en", "tr"] as const) {
      for (const type of types) {
        const cert = s.certificates.find((c) => c.type === type && c.status === "valid" && c.userId === "U-DEFNE")!;
        expect(cert).toBeTruthy();
        const ops = certificateLayout(cert, {
          locale,
          copy: messages[locale].certs,
          programName: getProgram(cert.programId).name[locale],
          verifyUrl: `https://alpas.example/verify/${cert.id}?c=${cert.verificationCode}&lang=${locale}`,
          verifyDisplay: `alpas.example/verify/${cert.id}`,
        });
        expect(ops.some((o) => o.k === "qr")).toBe(true);
        expect(ops.some((o) => o.k === "text" && o.text === messages[locale].certs.specimen)).toBe(true);
        const bytes = await renderCertificatePdf(ops, fonts, { title: cert.id, subject: type });
        const head = Buffer.from(bytes.slice(0, 5)).toString();
        expect(head).toBe("%PDF-");
        const body = Buffer.from(bytes).toString("latin1");
        expect(body).toContain("/FontFile2");
        if (outDir) {
          mkdirSync(outDir, { recursive: true });
          writeFileSync(path.join(outDir, `${type}_${locale}.pdf`), bytes);
        }
      }
    }
  }, 60_000);
});
