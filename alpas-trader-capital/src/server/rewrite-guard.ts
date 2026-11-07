/**
 * Validation for language-model rewrites of a deterministic Assistant answer.
 * A rewrite is accepted only if it introduces no number, account id or source
 * that the grounded draft did not already contain.
 */
export interface RewriteDraft {
  paragraphs: string[];
  facts: { label: string; value: string }[];
  notes: string[];
  sources: { id: string; title: string; body: string }[];
}

export interface Rewrite {
  paragraphs: string[];
  cited_source_ids: string[];
}

const NUMBER = /\d[\d.,]*\d|\d/g;
const ACCOUNT = /ATC-\d{6}/gi;

const compact = (s: string) => s.replace(/[\s  ]/g, "");

export function groundingText(d: RewriteDraft) {
  return [...d.paragraphs, ...d.notes, ...d.facts.map((f) => `${f.label} ${f.value}`), ...d.sources.map((s) => `${s.title} ${s.body}`)].join("\n");
}

export function validateRewrite(raw: unknown, draft: RewriteDraft): { ok: true; value: Rewrite } | { ok: false; reason: string } {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "not_object" };
  const r = raw as Partial<Rewrite>;
  if (!Array.isArray(r.paragraphs) || r.paragraphs.length < 1 || r.paragraphs.length > 6) return { ok: false, reason: "paragraphs" };
  if (!r.paragraphs.every((p) => typeof p === "string" && p.trim().length > 0 && p.length <= 1500)) return { ok: false, reason: "paragraph_shape" };
  const cited = Array.isArray(r.cited_source_ids) ? r.cited_source_ids.filter((x): x is string => typeof x === "string") : [];
  const allowedIds = new Set(draft.sources.map((s) => s.id));
  if (cited.some((id) => !allowedIds.has(id))) return { ok: false, reason: "unknown_source" };

  const ground = compact(groundingText(draft));
  const text = r.paragraphs.join("\n");
  for (const n of text.match(NUMBER) ?? []) {
    if (n.replace(/\D/g, "").length < 2) continue; // single digits ("1–2 days", list ordinals)
    if (!ground.includes(compact(n))) return { ok: false, reason: `number:${n}` };
  }
  for (const id of text.match(ACCOUNT) ?? []) {
    if (!ground.toUpperCase().includes(id.toUpperCase())) return { ok: false, reason: `account:${id}` };
  }
  if (/<\/?(system|instructions?|prompt)>/i.test(text)) return { ok: false, reason: "tags" };
  return { ok: true, value: { paragraphs: r.paragraphs.map((p) => p.trim()), cited_source_ids: cited } };
}
