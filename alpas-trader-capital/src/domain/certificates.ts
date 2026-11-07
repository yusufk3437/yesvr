/**
 * Certificate issuance rules and verification codes.
 * A certificate is a registry record first; the PDF is a rendering of it.
 */
import type { Account, Certificate, CertificateType, Challenge, Payout, ReviewRecord, User } from "./types";

export const CERT_PREFIX: Record<CertificateType, string> = {
  challenge_passed: "CP",
  funded_trader: "FT",
  payout: "PO",
};

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** FNV-1a 32-bit; deterministic, NOT cryptographic. A real registry signs server-side. */
export function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function verificationCode(certId: string, issuedAt: number): string {
  let a = fnv1a(`${certId}|${issuedAt}|alpas-demo-registry`);
  let b = fnv1a(`${issuedAt}|${certId}|v1`);
  let out = "";
  for (let i = 0; i < 8; i++) {
    const src = i < 4 ? a : b;
    out += CROCKFORD[src & 31];
    if (i < 4) a = a >>> 5;
    else b = b >>> 5;
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

export function certificateId(type: CertificateType, issuedAt: number, seq: number): string {
  const yy = String(new Date(issuedAt).getUTCFullYear()).slice(2);
  return `ATC-${CERT_PREFIX[type]}-${yy}-${String(seq).padStart(6, "0")}`;
}

export const maskAccount = (id: string) => `${id.slice(0, 4)}••${id.slice(-4)}`;

export type IssueBlocker =
  | "challenge_not_passed"
  | "review_not_approved"
  | "phase_not_passed"
  | "account_not_active"
  | "kyc_not_verified"
  | "contract_not_signed"
  | "payout_not_paid"
  | "already_issued";

export function challengePassedBlockers(
  challenge: Challenge,
  accounts: Account[],
  review: ReviewRecord | undefined,
  existing: Certificate[],
): IssueBlocker[] {
  const out: IssueBlocker[] = [];
  if (challenge.status !== "passed" && challenge.status !== "funded") out.push("challenge_not_passed");
  if (!review || review.status !== "approved") out.push("review_not_approved");
  const evalAccounts = accounts.filter((a) => a.challengeId === challenge.id && a.kind !== "funded");
  if (evalAccounts.length === 0 || evalAccounts.some((a) => a.status !== "passed")) out.push("phase_not_passed");
  if (existing.some((c) => c.type === "challenge_passed" && c.sourceId === challenge.id && c.status === "valid"))
    out.push("already_issued");
  return out;
}

export function fundedBlockers(
  account: Account,
  challenge: Challenge,
  user: User,
  existing: Certificate[],
): IssueBlocker[] {
  const out: IssueBlocker[] = [];
  if (account.kind !== "funded" || account.status !== "active") out.push("account_not_active");
  if (user.kyc.status !== "verified") out.push("kyc_not_verified");
  if (challenge.contract.status !== "signed") out.push("contract_not_signed");
  if (existing.some((c) => c.type === "funded_trader" && c.sourceId === account.id && c.status === "valid"))
    out.push("already_issued");
  return out;
}

export function payoutBlockers(payout: Payout, existing: Certificate[]): IssueBlocker[] {
  const out: IssueBlocker[] = [];
  if (payout.status !== "paid") out.push("payout_not_paid");
  if (existing.some((c) => c.type === "payout" && c.sourceId === payout.id && c.status === "valid"))
    out.push("already_issued");
  return out;
}

/** The only fields a public verification page may show. */
export interface PublicCertificateView {
  id: string;
  type: CertificateType;
  traderName: string;
  programId: Certificate["programId"];
  accountRef: string;
  amount: number;
  amountKind: Certificate["amountKind"];
  issuedAt: number;
  status: Certificate["status"];
  revokedAt?: number;
  revokedReason?: string;
  specimen: boolean;
}

export type VerifyResult =
  | { state: "valid"; cert: PublicCertificateView }
  | { state: "revoked"; cert: PublicCertificateView }
  | { state: "not_found" }
  | { state: "code_mismatch" };

export function verifyCertificate(registry: Certificate[], id: string, code?: string | null): VerifyResult {
  const cert = registry.find((c) => c.id.toUpperCase() === id.trim().toUpperCase());
  if (!cert) return { state: "not_found" };
  if (code && code.replace(/[^0-9A-Z]/gi, "").toUpperCase() !== cert.verificationCode.replace("-", ""))
    return { state: "code_mismatch" };
  const view: PublicCertificateView = {
    id: cert.id,
    type: cert.type,
    traderName: cert.traderName,
    programId: cert.programId,
    accountRef: cert.accountRef,
    amount: cert.amount,
    amountKind: cert.amountKind,
    issuedAt: cert.issuedAt,
    status: cert.status,
    revokedAt: cert.revokedAt,
    revokedReason: cert.revokedReason,
    specimen: cert.specimen,
  };
  return cert.status === "revoked" ? { state: "revoked", cert: view } : { state: "valid", cert: view };
}
