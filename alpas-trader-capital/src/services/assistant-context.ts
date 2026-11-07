/**
 * Builds the only account data the Assistant may see: accounts owned by the
 * signed-in user, reduced to the numbers needed to answer. No e-mail, legal
 * name, trade list or other user's data is included.
 */
import type { AssistantContext } from "@/domain/assistant";
import { buildKnowledgeBase } from "@/domain/knowledge";
import { eligibilityFor } from "./actions";
import { evaluateAccount, getChallenge, getUser, type DemoState } from "./state";

export function buildAssistantContext(s: DemoState, userId: string | null, now: number): AssistantContext | null {
  const user = getUser(s, userId);
  if (!user) return null;
  const accounts = s.accounts
    .filter((a) => a.userId === user.id)
    .map((a) => {
      const ch = getChallenge(s, a.challengeId)!;
      const ev = evaluateAccount(s, a.id, now);
      const phase = ch.ruleSnapshot.phases[a.phaseIndex];
      const elig = a.kind === "funded" ? eligibilityFor(s, a.id, now) : null;
      const review = s.reviews.find((r) => r.accountId === a.id);
      const paid = s.payouts.filter((p) => p.accountId === a.id && p.status === "paid");
      return {
        id: a.id,
        programId: a.programId,
        kind: a.kind,
        status: a.status,
        size: a.size,
        ruleSetId: ch.ruleSetId,
        version: ch.ruleSnapshot.version,
        challengeStatus: ch.status,
        contractStatus: ch.contract.status,
        risk: {
          balance: ev.balance,
          equity: ev.equity,
          openPnl: ev.openPnl,
          dayReference: ev.dayReference,
          dailyLossAmount: ev.dailyLossAmount,
          dailyFloor: ev.dailyFloor,
          dailyRemaining: ev.dailyRemaining,
          maxFloor: ev.maxFloor,
          maxRemaining: ev.maxRemaining,
          headroom: ev.headroom,
          bindingLimit: ev.bindingLimit,
          nextReset: ev.nextReset,
          profit: ev.profit,
          profitTarget: ev.profitTarget,
          tradingDays: ev.tradingDays,
          minTradingDays: phase.minTradingDays,
          breach: a.breach ? { type: a.breach.type, at: a.breach.at } : null,
          closedAt: a.closedAt,
        },
        payout: elig
          ? {
              eligible: elig.eligible,
              eligibleFrom: elig.eligibleFrom,
              isFirst: elig.isFirst,
              requestable: elig.requestable,
              minRequest: elig.minRequest,
              failing: elig.checks.filter((c) => c.status !== "met").map((c) => c.id),
              pending: elig.pending ? { id: elig.pending.id, status: elig.pending.status } : null,
              lastPaidAt: paid.length ? Math.max(...paid.map((p) => p.timeline.find((e) => e.status === "paid")?.at ?? p.requestedAt)) : null,
            }
          : undefined,
        review: review ? { openedAt: review.openedAt, status: review.status } : undefined,
      };
    });
  return { firstName: user.name.split(" ")[0], kycStatus: user.kyc.status, accounts };
}

export function knowledgeFor(s: DemoState) {
  return buildKnowledgeBase(s.catalog.programs, s.catalog.ruleSets, s.articles);
}
