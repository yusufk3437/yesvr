import { describe, expect, it } from "vitest";
import { validateRewrite, type RewriteDraft } from "./rewrite-guard";

const draft: RewriteDraft = {
  paragraphs: ["ATC-104377 · ALPAS Ascent 100K: you can lose $5,000.00 more today before equity reaches the daily floor of $99,298.50."],
  facts: [{ label: "Daily room", value: "$5,000.00" }],
  notes: ["Touching a floor counts as a breach."],
  sources: [{ id: "ascent@1.1/phase1/daily_loss", title: "Daily loss limit", body: "5% of the initial account size" }],
};

describe("LLM rewrite guard", () => {
  it("accepts a rewrite that keeps the draft's numbers and sources", () => {
    const r = validateRewrite({ paragraphs: ["On ATC-104377 you have $5,000.00 of daily room left; the floor is $99,298.50."], cited_source_ids: ["ascent@1.1/phase1/daily_loss"] }, draft);
    expect(r.ok).toBe(true);
  });
  it("rejects invented numbers", () => {
    expect(validateRewrite({ paragraphs: ["You can lose $6,200 today."], cited_source_ids: [] }, draft)).toMatchObject({ ok: false });
  });
  it("rejects unknown sources and other accounts", () => {
    expect(validateRewrite({ paragraphs: ["Fine."], cited_source_ids: ["made/up"] }, draft)).toMatchObject({ ok: false, reason: "unknown_source" });
    expect(validateRewrite({ paragraphs: ["ATC-310882 has room."], cited_source_ids: [] }, draft)).toMatchObject({ ok: false });
  });
  it("rejects malformed output", () => {
    expect(validateRewrite("text", draft).ok).toBe(false);
    expect(validateRewrite({ paragraphs: [] }, draft).ok).toBe(false);
  });
});
