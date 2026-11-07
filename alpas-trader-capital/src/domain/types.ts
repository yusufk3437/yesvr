import type { Cents } from "./money";
import type { L10n, Locale } from "./l10n";

/* ───────────── Catalog ───────────── */

export type ProgramId = "ascent" | "ridge";
export type PhaseKind = "phase1" | "phase2" | "funded";
export type PlatformId = "mt5" | "ctrader";

export type MaxLossRule =
  | { type: "static"; bps: number }
  | { type: "trailing_eod"; bps: number; lockAt: "initial_balance" };

export interface ConsistencyRule {
  /** Best day net P&L may be at most this share of total net profit. */
  bestDayMaxBps: number;
  scope: "phase" | "payout_cycle";
  effect: "blocks_completion" | "blocks_payout";
}

export interface PhaseRules {
  kind: PhaseKind;
  label: L10n;
  profitTargetBps: number | null;
  dailyLossBps: number;
  dailyReference: "higher_of_balance_equity_at_reset";
  maxLoss: MaxLossRule;
  minTradingDays: number;
  consistency: ConsistencyRule | null;
  /** Max (entry − stop) × volume as share of initial size; soft rule. */
  perTradeRiskBps: number | null;
  newsTrading: "allowed" | "restricted_2min";
  weekendHolding: boolean;
  timeLimitDays: number | null;
  inactivityDays: number;
  leverage: L10n;
}

export interface PayoutPolicy {
  profitSplitBps: number;
  scaledProfitSplitBps: number;
  firstPayoutAfterDays: number;
  cycleDays: number;
  minRequestBps: number;
  minTradingDaysPerCycle: number;
  requireFlatPositions: boolean;
  feeRefund: "with_first_paid_payout";
  consistency: ConsistencyRule | null;
  newsProfitExcluded: boolean;
  reviewTargetBusinessDays: number;
  processingTargetBusinessDays: number;
}

export interface ScalingPolicy {
  reviewEveryMonths: number;
  minNetProfitBps: number;
  minPaidPayouts: number;
  increaseBps: number;
  maxCombinedNominal: Cents;
}

export interface RuleSet {
  /** e.g. "ascent@1.1" */
  id: string;
  programId: ProgramId;
  version: string;
  publishedAt: string; // ISO date
  changelog: L10n[];
  timezone: string; // IANA
  dailyResetHour: number;
  breachOnEqual: true;
  phases: PhaseRules[]; // evaluation phases in order, then funded
  payout: PayoutPolicy;
  scaling: ScalingPolicy;
  copyTradingMaxCombined: Cents;
  eaMaxServerRequestsPerDay: number;
}

export interface SizeOption {
  size: Cents;
  price: Cents;
}

export interface Program {
  id: ProgramId;
  code: "ASC" | "RDG";
  name: L10n;
  model: L10n;
  steps: 1 | 2;
  tagline: L10n;
  summary: L10n;
  currency: "USD";
  sizes: SizeOption[];
  currentRuleSetId: string;
  platforms: PlatformId[];
}

export interface PromoCode {
  code: string;
  bps: number;
  programIds: ProgramId[];
  validUntil: string; // ISO date
  label: L10n;
}

/* ───────────── Users ───────────── */

export type KycStatus = "not_started" | "submitted" | "verified" | "rejected";

export interface User {
  id: string;
  name: string;
  email: string;
  country: string; // ISO-3166 alpha-2
  locale: Locale;
  createdAt: number;
  /** Demo-only hash. Not a security mechanism. */
  passwordHash: string;
  kyc: {
    status: KycStatus;
    submittedAt?: number;
    decidedAt?: number;
    rejectionReason?: string;
    legalName?: string;
    dateOfBirth?: string;
    documentType?: "passport" | "id_card" | "driving_licence";
  };
  twoFactorEnabled: boolean;
  marketingOptIn: boolean;
}

/* ───────────── Trading ───────────── */

export type AccountStatus =
  | "ready"
  | "active"
  | "passed"
  | "under_review"
  | "review_rejected"
  | "breached"
  | "expired"
  | "pending_activation"
  | "closed";

export type BreachType = "daily_loss" | "max_loss" | "inactivity";

export interface Breach {
  type: BreachType;
  at: number;
  equity: Cents;
  limit: Cents;
}

export interface Account {
  id: string; // ATC-123456
  userId: string;
  challengeId: string;
  programId: ProgramId;
  kind: PhaseKind;
  phaseIndex: number; // index into ruleSnapshot.phases
  size: Cents;
  currency: "USD";
  platform: PlatformId;
  login: string;
  server: string;
  status: AccountStatus;
  createdAt: number;
  startedAt: number;
  closedAt?: number;
  breach?: Breach;
}

export type Side = "buy" | "sell";

export interface Trade {
  id: string;
  accountId: string;
  symbol: string;
  side: Side;
  volume: number; // lots
  openTime: number;
  closeTime?: number;
  openPrice: number;
  closePrice?: number;
  /** Mark price for open trades (simulated). */
  markPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  /** Realised gross P&L (closed) or floating gross P&L at mark (open). */
  grossPnl: Cents;
  commission: Cents; // ≤ 0, charged at open
  swap: Cents;
  /** Most adverse gross P&L reached during the trade (≤ 0). */
  mae: Cents;
  status: "open" | "closed";
  closeReason?: "manual" | "tp" | "sl" | "breach" | "weekend" | "system";
  /** Opened or closed within ±2 min of a high-impact release (simulated flag). */
  newsWindow?: boolean;
}

export type LedgerType = "payout_reserve" | "payout_release" | "payout_paid";

export interface LedgerEntry {
  id: string;
  accountId: string;
  ts: number;
  type: LedgerType;
  amount: Cents; // positive magnitude
  payoutId: string;
}

/* ───────────── Challenges ───────────── */

export type ChallengeStatus = "in_progress" | "under_review" | "passed" | "funded" | "failed" | "rejected";

export interface ReviewRecord {
  id: string;
  challengeId: string;
  accountId: string;
  openedAt: number;
  status: "open" | "approved" | "rejected";
  decidedAt?: number;
  decidedBy?: string;
  reason?: string;
}

export interface Challenge {
  id: string;
  userId: string;
  orderId: string;
  programId: ProgramId;
  size: Cents;
  ruleSetId: string;
  /** Frozen copy of the rule set at purchase time. Never re-read from the catalog. */
  ruleSnapshot: RuleSet;
  status: ChallengeStatus;
  accountIds: string[];
  createdAt: number;
  passedAt?: number;
  fundedAccountId?: string;
  contract: {
    status: "not_available" | "ready" | "signed";
    signedAt?: number;
    signerName?: string;
    version?: string;
  };
  feeRefunded: boolean;
}

export interface Order {
  id: string; // ORD-…
  invoiceNo: string;
  userId: string;
  programId: ProgramId;
  size: Cents;
  platform: PlatformId;
  ruleSetId: string;
  listPrice: Cents;
  discount: Cents;
  total: Cents;
  promoCode?: string;
  status: "paid_demo" | "refunded_demo";
  createdAt: number;
  billing: { name: string; country: string; city?: string; address?: string };
  paymentMethod: "card_demo" | "bank_demo";
  challengeId: string;
}

/* ───────────── Payouts ───────────── */

export type PayoutStatus =
  | "requested"
  | "under_review"
  | "approved"
  | "processing"
  | "paid"
  | "rejected"
  | "cancelled";

export interface PayoutEvent {
  status: PayoutStatus;
  at: number;
  actor: "trader" | "ops" | "system";
  note?: string;
}

export interface Payout {
  id: string; // PO-…
  userId: string;
  accountId: string;
  challengeId: string;
  requestedAt: number;
  gross: Cents;
  splitBps: number;
  traderShare: Cents;
  companyShare: Cents;
  feeRefund: Cents;
  processingFee: Cents;
  netToTrader: Cents;
  method: "bank_transfer_demo" | "stablecoin_demo";
  methodLabel: string; // masked, demo
  status: PayoutStatus;
  timeline: PayoutEvent[];
  rejectionReason?: string;
  certificateId?: string;
  receiptNo?: string;
}

/* ───────────── Certificates ───────────── */

export type CertificateType = "challenge_passed" | "funded_trader" | "payout";

export interface Certificate {
  id: string; // ATC-CP-26-000041
  type: CertificateType;
  userId: string;
  traderName: string;
  programId: ProgramId;
  accountRef: string; // masked
  challengeId: string;
  /** Nominal account size (CP, FT) or trader payout amount (PO). */
  amount: Cents;
  amountKind: "nominal_size" | "payout_amount";
  issuedAt: number;
  verificationCode: string;
  status: "valid" | "revoked";
  revokedAt?: number;
  revokedReason?: string;
  sourceId: string; // challenge / account / payout id
  specimen: boolean;
}

/* ───────────── Engagement ───────────── */

export type NotificationKind =
  | "order_confirmed"
  | "phase_passed"
  | "review_started"
  | "challenge_approved"
  | "challenge_rejected"
  | "kyc_verified"
  | "kyc_rejected"
  | "funded_activated"
  | "breach"
  | "payout_status"
  | "certificate_issued"
  | "daily_limit_warning"
  | "support_reply";

export interface Notification {
  id: string;
  userId: string;
  ts: number;
  kind: NotificationKind;
  params: Record<string, string>;
  read: boolean;
  /** Email template rendered from the same data, shown as a sample. */
  email: boolean;
}

export interface JournalEntry {
  id: string;
  userId: string;
  accountId: string;
  tradeId?: string;
  dayKey?: string;
  note: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface SupportMessage {
  from: "trader" | "ops" | "system";
  at: number;
  body: string;
}

export interface SupportTicket {
  id: string;
  userId: string | null;
  email?: string;
  subject: string;
  category: "general" | "rules" | "payout" | "kyc" | "technical" | "assistant";
  status: "open" | "answered" | "closed";
  createdAt: number;
  messages: SupportMessage[];
  source: "contact_form" | "dashboard" | "assistant";
  assistantTranscript?: { question: string; answer: string; sources: string[] };
}

export interface AuditEntry {
  id: string;
  ts: number;
  actor: { role: "trader" | "ops" | "system"; id: string };
  action: string;
  entity: string;
  entityId: string;
  reason?: string;
  details?: Record<string, string | number | boolean>;
}

export interface AssistantFeedback {
  id: string;
  ts: number;
  userId: string | null;
  question: string;
  intent: string;
  rating: "up" | "down";
}
