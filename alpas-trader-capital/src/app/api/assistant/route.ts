import { z } from "zod";
import { MAX_QUESTION_LENGTH } from "@/domain/assistant";
import { getLLMAdapter } from "@/server/llm";

/** Mode probe: lets the UI label answers honestly before the first question. */
export async function GET() {
  const llm = getLLMAdapter();
  return Response.json({ mode: llm ? "llm" : "rules", provider: llm?.name ?? null, model: llm?.model ?? null });
}

const Body = z.object({
  question: z.string().min(1).max(MAX_QUESTION_LENGTH),
  locale: z.enum(["en", "tr"]),
  draft: z.object({
    paragraphs: z.array(z.string().max(3000)).min(1).max(8),
    facts: z.array(z.object({ label: z.string().max(80), value: z.string().max(80) })).max(8),
    notes: z.array(z.string().max(1500)).max(6),
    sources: z.array(z.object({ id: z.string().max(120), title: z.string().max(200), body: z.string().max(2500) })).max(6),
  }),
  refusal: z.boolean(),
});

// Best-effort per-instance rate limit (a real deployment uses a shared store).
const hits = new Map<string, { n: number; reset: number }>();
function limited(key: string) {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) {
    hits.set(key, { n: 1, reset: now + 60_000 });
    return false;
  }
  h.n++;
  return h.n > 30;
}

/**
 * POST: optional language-model rewrite of a grounded draft. The draft is
 * produced by the deterministic engine from the signed-in user's own data.
 * Refusals are never rewritten. Without a provider, the draft stands.
 */
export async function POST(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > 64_000) return Response.json({ error: "too_large" }, { status: 413 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(ip)) return Response.json({ error: "rate_limited" }, { status: 429 });
  let parsed;
  try {
    parsed = Body.safeParse(await req.json());
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });
  const llm = getLLMAdapter();
  if (!llm || parsed.data.refusal) return Response.json({ mode: "rules" });
  const rewrite = await llm.rewrite({ question: parsed.data.question, locale: parsed.data.locale, draft: parsed.data.draft });
  if (!rewrite) return Response.json({ mode: "rules" });
  return Response.json({ mode: "llm", paragraphs: rewrite.paragraphs, citedSourceIds: rewrite.cited_source_ids });
}
