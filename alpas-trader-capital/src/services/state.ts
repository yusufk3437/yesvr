import type { L10n } from "@/domain/l10n";
import { evaluateRisk, type RiskEvaluation } from "@/domain/risk";
import type {
  Account,
  AssistantFeedback,
  AuditEntry,
  Certificate,
  Challenge,
  JournalEntry,
  LedgerEntry,
  Notification,
  Order,
  Payout,
  PlatformId,
  Program,
  ProgramId,
  PromoCode,
  ReviewRecord,
  RuleSet,
  SupportTicket,
  Trade,
  User,
} from "@/domain/types";

export const SCHEMA_VERSION = 4;

export interface CartSelection {
  programId: ProgramId;
  size: number;
  platform: PlatformId;
  promoCode?: string;
}

export interface CustomArticle {
  id: string;
  category: "faq";
  title: L10n;
  body: L10n;
  keywords: string[];
  updatedAt: number;
  flagged: boolean;
}

export interface DemoState {
  schemaVersion: number;
  seededAt: number;
  clockOffsetMs: number;
  session: { userId: string | null; role: "trader" | "ops" };
  cart: CartSelection | null;
  catalog: { programs: Program[]; ruleSets: RuleSet[]; promos: PromoCode[] };
  users: User[];
  orders: Order[];
  challenges: Challenge[];
  accounts: Account[];
  trades: Trade[];
  ledger: LedgerEntry[];
  reviews: ReviewRecord[];
  payouts: Payout[];
  certificates: Certificate[];
  notifications: Notification[];
  journal: JournalEntry[];
  tickets: SupportTicket[];
  audit: AuditEntry[];
  feedback: AssistantFeedback[];
  articles: CustomArticle[];
  resetTokens: { token: string; userId: string; expiresAt: number }[];
  counters: Record<"account" | "trade" | "order" | "cert" | "payout" | "misc", number>;
}

export const nowOf = (s: Pick<DemoState, "clockOffsetMs">) => Date.now() + s.clockOffsetMs;

export function getUser(s: DemoState, id: string | null | undefined) {
  return s.users.find((u) => u.id === id) ?? null;
}
export const sessionUser = (s: DemoState) => getUser(s, s.session.userId);

export function getAccount(s: DemoState, id: string) {
  return s.accounts.find((a) => a.id === id) ?? null;
}
export function getChallenge(s: DemoState, id: string) {
  return s.challenges.find((c) => c.id === id) ?? null;
}

export const userAccounts = (s: DemoState, userId: string) =>
  s.accounts.filter((a) => a.userId === userId).sort((a, b) => b.createdAt - a.createdAt);

export const isFrozen = (a: Account) =>
  !["ready", "active"].includes(a.status);

/** Evaluate an account with the rule snapshot bound to its challenge. */
export function evaluateAccount(s: DemoState, accountId: string, now: number): RiskEvaluation {
  const account = getAccount(s, accountId);
  if (!account) throw new Error(`Unknown account ${accountId}`);
  const challenge = getChallenge(s, account.challengeId);
  if (!challenge) throw new Error(`Unknown challenge ${account.challengeId}`);
  const phase = challenge.ruleSnapshot.phases[account.phaseIndex];
  const at = isFrozen(account) && account.closedAt ? Math.min(now, account.closedAt) : now;
  return evaluateRisk({
    ruleSet: challenge.ruleSnapshot,
    phase,
    initialBalance: account.size,
    startedAt: account.startedAt,
    trades: s.trades.filter((t) => t.accountId === accountId),
    ledger: s.ledger.filter((e) => e.accountId === accountId),
    now: at,
  });
}

export function phaseRulesOf(s: DemoState, account: Account) {
  const challenge = getChallenge(s, account.challengeId)!;
  return { challenge, ruleSet: challenge.ruleSnapshot, phase: challenge.ruleSnapshot.phases[account.phaseIndex] };
}

export function orderOf(s: DemoState, challenge: Challenge) {
  return s.orders.find((o) => o.id === challenge.orderId) ?? null;
}
