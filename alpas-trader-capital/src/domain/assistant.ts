/**
 * ALPAS Assistant — deterministic, source-grounded answering.
 *
 * Guarantees:
 *  - User text is untrusted data: it is matched, never executed.
 *  - Only the AuthorizedContext (accounts owned by the signed-in user) is ever
 *    read. References to any other account are refused without confirming
 *    whether it exists.
 *  - All numbers come from the risk/payout engines via the context; nothing is
 *    estimated.
 *  - The Assistant cannot change rules, pass challenges or approve payouts.
 *  - If nothing in the published sources answers the question, it says so.
 */
import { addBusinessDays, formatInZone } from "./time";
import { fmt, type L10n, type Locale } from "./l10n";
import { formatBps, formatMoney, formatSize } from "./money";
import { diffRuleSets, type KnowledgeArticle, type Topic } from "./knowledge";
import type { AccountStatus, ChallengeStatus, KycStatus, PhaseKind, Program, ProgramId, RuleSet } from "./types";
import type { PayoutCheckId } from "./payout";

export interface AssistantAccountContext {
  id: string;
  programId: ProgramId;
  kind: PhaseKind;
  status: AccountStatus;
  size: number;
  ruleSetId: string;
  version: string;
  challengeStatus: ChallengeStatus;
  contractStatus: "not_available" | "ready" | "signed";
  risk: {
    balance: number;
    equity: number;
    openPnl: number;
    dayReference: number;
    dailyLossAmount: number;
    dailyFloor: number;
    dailyRemaining: number;
    maxFloor: number;
    maxRemaining: number;
    headroom: number;
    bindingLimit: "daily" | "max";
    nextReset: number;
    profit: number;
    profitTarget: number | null;
    tradingDays: number;
    minTradingDays: number;
    breach: { type: string; at: number } | null;
    closedAt?: number;
  };
  payout?: {
    eligible: boolean;
    eligibleFrom: number | null;
    isFirst: boolean;
    requestable: number;
    minRequest: number;
    failing: PayoutCheckId[];
    pending: { id: string; status: string } | null;
    lastPaidAt: number | null;
  };
  review?: { openedAt: number; status: "open" | "approved" | "rejected" };
}

export interface AssistantContext {
  firstName: string;
  kycStatus: KycStatus;
  accounts: AssistantAccountContext[];
}

export interface Citation {
  id: string;
  title: string;
  href: string;
  label: string;
}

export type Intent =
  | "injection"
  | "action_request"
  | "unauthorized"
  | "remaining_loss"
  | "payout_timing"
  | "activation"
  | "news"
  | "weekend"
  | "price"
  | "lookup"
  | "unknown";

export interface AssistantAnswer {
  intent: Intent;
  paragraphs: string[];
  facts: { label: string; value: string }[];
  citations: Citation[];
  notes: string[];
  suggestions: string[];
  refusal?: "injection" | "unauthorized" | "action" | "not_found" | "sign_in";
  usedAccountIds: string[];
  escalate: boolean;
}

export interface AssistantInput {
  question: string;
  locale: Locale;
  kb: KnowledgeArticle[];
  programs: Program[];
  ruleSets: RuleSet[];
  context: AssistantContext | null;
  now: number;
  timeZone?: string;
}

export const MAX_QUESTION_LENGTH = 800;

/* ───────────── text normalisation ───────────── */

export function normalize(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9.%\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set(
  "the a an is are am i my me to of in on for and or can do does what when how much many with at be it this that be ben bir ve ile mi mu mı mü ne bu su o da de ki icin gibi var yok olan olarak ya veya hangi nasil kac nedir midir misin miyim acaba lutfen please use used using there any about have has get im ive need want know tell is it's its kullanabilir kullanabilir miyim kullan yapabilir yapabilirmiyim hakkinda bilgi ver soyle istiyorum benim bana".split(" "),
);
export const tokens = (s: string) => normalize(s).split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOP.has(t));

const has = (q: string, ...phrases: string[]) => phrases.some((p) => q.includes(normalize(p)));

/* ───────────── detectors ───────────── */

const INJECTION = [
  /(ignore|disregard|forget|override)\s+(all\s+|the\s+|your\s+|any\s+)?(previous|prior|above|earlier|system)?\s*(instructions|rules|prompts?|messages|guidelines)/,
  /system prompt|developer mode|jailbreak|you are now|act as (an? )?(admin|administrator|operator|ops|developer)|reveal (your|the) (prompt|instructions)|pretend (to be|you are)/,
  /onceki (talimat|komut|mesaj)|talimatlari (yok say|unut|gormezden gel)|kurallari (yok say|unut|gormezden gel)|sistem (istemi|promptu|talimat)|yonetici (gibi|olarak) davran|admin (gibi|olarak) davran|gizli talimat/,
];
const BULK_DATA = /(all|every|other) (users?|traders?|accounts?|customers?)|(tum|butun|diger|baska) (kullanici|trader|hesap|musteri)/;
const ACTIONS = [
  "approve my", "approve the", "approve it", "pass my challenge", "pass the challenge", "mark my payout", "mark it as paid", "mark as paid",
  "increase my limit", "raise my limit", "reset my account", "remove the breach", "remove my breach", "undo the breach", "change the rule",
  "change my rule", "change the daily", "send me my payout", "pay me now", "release my payout", "waive the", "extend my",
  "onayla", "onaylar misin", "onaylayabilir misin", "gecir", "gecirir misin", "odendi yap", "odendi olarak", "limitimi artir", "limiti artir",
  "hesabimi sifirla", "ihlali kaldir", "ihlali sil", "ihlalimi kaldir", "kurali degistir", "kurallari degistir", "parami gonder",
  "odememi gonder", "hemen ode", "payoutumu onayla",
];

function detectProgram(q: string): ProgramId | null {
  if (has(q, "ascent", "iki asama", "iki asamali", "two-step", "two step", "2-step", "2 step", "2 asama")) return "ascent";
  if (has(q, "ridge", "tek asama", "tek asamali", "one-step", "one step", "1-step", "1 step", "1 asama")) return "ridge";
  return null;
}
function detectPhase(q: string): PhaseKind | null {
  if (has(q, "funded", "fonlu", "canli hesap", "master")) return "funded";
  if (has(q, "phase 2", "phase two", "asama 2", "2. asama", "ikinci asama", "verification", "dogrulama asamasi")) return "phase2";
  if (has(q, "phase 1", "phase one", "asama 1", "1. asama", "birinci asama", "ilk asama", "evaluation", "degerlendirme")) return "phase1";
  return null;
}
function detectSize(q: string): number | null {
  const mm = q.match(/\b(10|25|50|100|200)\s?(k|bin)\b/) ?? q.match(/\b(10|25|50|100|200)[.,]?000\b/);
  return mm ? Number(mm[1]) * 1000 * 100 : null;
}
function detectVersion(q: string): string | null {
  const mm = q.match(/\b(?:v|version|surum|versiyon)\s?(\d+\.\d+)\b/) ?? q.match(/\bv(\d+\.\d+)\b/);
  return mm ? mm[1] : null;
}
const accountRefs = (q: string) => [...q.matchAll(/\batc[-\s]?(\d{6})\b/g)].map((x) => `ATC-${x[1]}`);

function classify(q: string): Intent {
  if (INJECTION.some((r) => r.test(q))) return "injection";
  if (BULK_DATA.test(q)) return "unauthorized";
  if (ACTIONS.some((a) => q.includes(normalize(a)))) return "action_request";
  const loseWords = has(q, "kaybedebilir", "kaybedebil", "kayip", "kaybim", "zarar edebilir", "zarar hakk", "lose", "loss left", "drawdown left", "room left", "kalan zarar", "kalan risk", "remaining risk", "remaining loss", "how much more");
  const quantity = has(q, "bugun", "today", "kalan", "remaining", "ne kadar", "how much", "daha", "more", "left");
  if (loseWords && quantity) return "remaining_loss";
  const payoutWords = has(q, "payout", "odeme", "cekim", "withdraw", "reward", "odul", "para cek");
  if (payoutWords && has(q, "when", "ne zaman", "ilk", "first", "next", "sonraki", "eligible", "uygun", "talep edebilir", "can i request", "kac gun")) return "payout_timing";
  if ((has(q, "gectim", "passed", "i pass", "gecince", "gectikten") && has(q, "hesap", "account", "funded", "ne zaman", "when", "acil")) || has(q, "ne zaman acilir", "when will my account", "when is my funded", "funded account open", "aktivasyon", "activation", "hesabim acilir"))
    return "activation";
  if (has(q, "haber", "news", "nfp", "cpi", "fomc", "non-farm")) return "news";
  if (has(q, "hafta sonu", "haftasonu", "weekend")) return "weekend";
  if (has(q, "fiyat", "price", "pricing", "cost", "ucret", "kac para", "kac dolar", "how much is", "how much does", "how much are")) return "price";
  return "lookup";
}

/* ───────────── copy ───────────── */

const T = {
  en: {
    signIn: "Sign in to see your own numbers — I only use data from accounts on your profile.",
    unauthorized: "I can only use data from accounts on your own profile, so I can't confirm or share anything about {ref}. If it is yours and you don't see it in your dashboard, contact support.",
    bulk: "I can't share information about other traders or accounts. I only use data from accounts on your own profile.",
    signInForAccount: "Sign in to ask about a specific account. I never share account data with anyone other than its owner.",
    injection: "I can't follow instructions that try to change how I work. I answer only from ALPAS's published rules and help content, and from your own account data.",
    action: "I can't do that. The Assistant can't change rules, pass a challenge, remove a breach, or approve or send a payout. These decisions are made by ALPAS operations through reviewed, logged processes.",
    actionHelp: "I can explain the rule, show your current status, or turn this conversation into a support ticket.",
    notFound: "I couldn't find this in ALPAS's published rules or help content, so I won't guess. You can open a support ticket and the team will answer.",
    versionMissing: "There is no rule version {v}. Published versions: {list}.",
    versionNote: "{id} follows rules v{v}, locked at purchase. The current published version is v{cur}: {diff}. Your account keeps v{v}.",
    remaining: "{acc}: you can lose {daily} more today before equity reaches the daily floor of {floor} ({ref} reference at the reset − {amt}). The overall floor is {max}, {maxLeft} away. The limit that applies first right now is the {binding} limit: {head}.",
    remainingOpen: "Open P&L of {open} (including commission and swap) is already included.",
    remainingFrozen: "{acc} is {status}{when}; it can no longer be traded.",
    noActive: "You have no active account matching that. Your accounts: {list}.",
    remainingGeneric: "For a {size} account under the published rules: {lines}",
    remainingGenericLine: "{prog} — daily {dpct} = {damt} below the day's reference (higher of balance and equity at 17:00 New York); overall floor {mrule}.",
    touching: "Touching a floor counts as a breach.",
    nextReset: "Next daily reset: {time}.",
    newsLine: "{label}: {text}",
    payoutEligible: "{acc}: eligible now. You can request up to {max} gross (minimum {min}).",
    payoutPending: "{acc}: request {id} is {status}. A new request is possible after it is closed.",
    payoutNext: "{acc}: next eligible from {date}.",
    payoutFirstRule: "First payout rule for this account: {days} days after the first funded trade (rules v{v}).",
    payoutBlocked: "Still open: {checks}.",
    payoutLast: "Last payout was paid on {date}.",
    payoutNoFunded: "You don't have a funded account yet. On a funded account the first payout becomes possible {days} days after its first trade (current rules), then every {cycle} days.",
    payoutGeneric: "{prog} (v{v}): first payout {first} days after the first trade on the funded account, then every {cycle} days; at least {mindays} trading days per cycle; split {split}.",
    actReview: "{acc} has been under review since {date}. The target is 1–2 business days (target, not a guarantee), so expect a decision around {eta}. I can't approve or speed up a review.",
    actNext: "After approval: Challenge Passed certificate → identity verification (KYC: {kyc}) → trader agreement → the funded account is activated right after you sign.",
    actPassed: "Challenge {acc} is approved. Next: {steps}.",
    actFunded: "Your funded account {acc} is active.",
    actPhase1: "{acc} is in Phase 1 of a two-step programme: passing it opens Phase 2, not a funded account.",
    actGeneric: "Here is how activation works:",
    priceLine: "{prog}: {list}.",
    priceOne: "{prog} {size}: {price} one-time evaluation fee. The account size is simulated capital, not withdrawable money.",
    kyc: { not_started: "not started", submitted: "submitted, awaiting review", verified: "verified", rejected: "rejected" },
    status: { breached: "closed after a breach", expired: "closed for inactivity", passed: "passed", under_review: "under review", review_rejected: "rejected at review", closed: "closed", pending_activation: "pending activation", ready: "ready", active: "active" },
    binding: { daily: "daily", max: "overall" },
    steps: { kyc: "complete identity verification (KYC)", kycWait: "wait for KYC review", contract: "sign the trader agreement", activate: "activation happens right after signing" },
    checks: { kyc: "KYC", contract: "trader agreement", account_active: "account active", flat: "close open positions", cycle_date: "cycle date", trading_days: "trading days in cycle", consistency: "best-day share", no_pending: "no pending request", min_amount: "minimum amount" },
    suggestions: ["How much more can I lose today on my 100K account?", "Can I trade the news?", "When is my first payout?", "I passed — when is my account opened?"],
    labelAccount: "{id} · {prog} {size} · {phase} · v{v}",
    facts: { daily: "Daily room", max: "Overall room", floor: "Daily floor", eq: "Equity", eligible: "Eligible from" },
  },
  tr: {
    signIn: "Kendi rakamlarınızı görmek için giriş yapın. Yalnızca profilinizdeki hesapların verilerini kullanırım.",
    unauthorized: "Yalnızca kendi profilinizdeki hesapların verilerini kullanabilirim, bu yüzden {ref} hakkında hiçbir bilgiyi doğrulayamam veya paylaşamam. Hesap sizinse ve panelinizde görünmüyorsa destek ekibine yazın.",
    bulk: "Diğer trader'lar veya hesaplar hakkında bilgi paylaşamam. Yalnızca kendi profilinizdeki hesapların verilerini kullanırım.",
    signInForAccount: "Belirli bir hesap hakkında soru sormak için giriş yapın. Hesap verilerini sahibi dışında kimseyle paylaşmam.",
    injection: "Çalışma şeklimi değiştirmeye yönelik talimatları uygulayamam. Yalnızca ALPAS'ın yayımlanmış kuralları, yardım içerikleri ve kendi hesap verileriniz üzerinden yanıt veririm.",
    action: "Bunu yapamam. Assistant kural değiştiremez, challenge geçiremez, ihlal kaldıramaz, payout onaylayamaz veya gönderemez. Bu kararlar ALPAS operasyon ekibi tarafından incelenen ve kayıt altına alınan süreçlerle verilir.",
    actionHelp: "Kuralı açıklayabilir, güncel durumunuzu gösterebilir veya bu konuşmayı destek talebine dönüştürebilirim.",
    notFound: "Bunu ALPAS'ın yayımlanmış kurallarında veya yardım içeriklerinde bulamadım, bu yüzden tahmin yürütmeyeceğim. Destek talebi açarsanız ekip yanıtlayacaktır.",
    versionMissing: "{v} numaralı bir kural sürümü yok. Yayımlanmış sürümler: {list}.",
    versionNote: "{id}, satın alma anında kilitlenen v{v} kurallarına tabidir. Güncel yayımlanmış sürüm v{cur}: {diff}. Hesabınız v{v} ile devam eder.",
    remaining: "{acc}: equity günlük taban olan {floor} seviyesine inmeden önce bugün {daily} daha kaybedebilirsiniz (reset anındaki {ref} referans − {amt}). Toplam taban {max}, buna {maxLeft} mesafe var. Şu anda önce devreye girecek sınır {binding} sınır: {head}.",
    remainingOpen: "Komisyon ve swap dahil {open} tutarındaki açık P&L bu hesaba zaten dahil.",
    remainingFrozen: "{acc} {status}{when}. Artık işlem yapılamaz.",
    noActive: "Buna uyan aktif hesabınız yok. Hesaplarınız: {list}.",
    remainingGeneric: "Yayımlanmış kurallara göre {size} bir hesap için: {lines}",
    remainingGenericLine: "{prog} — günlük {dpct} = günün referansının (17:00 New York'ta bakiye ve equity'nin yüksek olanı) {damt} altı; toplam taban {mrule}.",
    touching: "Tabana dokunmak ihlal sayılır.",
    nextReset: "Sonraki günlük reset: {time}.",
    newsLine: "{label}: {text}",
    payoutEligible: "{acc}: şu anda uygun. En fazla {max} brüt talep edebilirsiniz (minimum {min}).",
    payoutPending: "{acc}: {id} numaralı talep {status} durumunda. Bu talep kapanınca yeni talep açılabilir.",
    payoutNext: "{acc}: {date} tarihinden itibaren uygun.",
    payoutFirstRule: "Bu hesabın ilk payout kuralı: ilk funded işlemden {days} gün sonra (kurallar v{v}).",
    payoutBlocked: "Henüz tamamlanmayan: {checks}.",
    payoutLast: "Son payout {date} tarihinde ödendi.",
    payoutNoFunded: "Henüz funded hesabınız yok. Funded hesapta ilk payout, hesaptaki ilk işlemden {days} gün sonra (güncel kurallar), sonrasında her {cycle} günde bir mümkündür.",
    payoutGeneric: "{prog} (v{v}): ilk payout funded hesaptaki ilk işlemden {first} gün sonra, sonra her {cycle} günde bir. Döngü başına en az {mindays} işlem günü gerekir. Paylaşım {split}.",
    actReview: "{acc} {date} tarihinden beri incelemede. Hedef süre 1–2 iş günü (hedeftir, garanti değildir), bu nedenle {eta} civarında karar bekleyebilirsiniz. İncelemeyi onaylayamam veya hızlandıramam.",
    actNext: "Onaydan sonra: Challenge Passed sertifikası → kimlik doğrulama (KYC: {kyc}) → trader sözleşmesi → imzadan hemen sonra funded hesap aktive edilir.",
    actPassed: "{acc} challenge'ı onaylandı. Sıradaki adım: {steps}.",
    actFunded: "Funded hesabınız {acc} aktif.",
    actPhase1: "{acc} iki aşamalı programın Aşama 1'inde. Bu aşamayı geçmek funded hesap değil, Aşama 2'yi açar.",
    actGeneric: "Aktivasyon şöyle işler:",
    priceLine: "{prog}: {list}.",
    priceOne: "{prog} {size}: tek seferlik değerlendirme ücreti {price}. Hesap büyüklüğü simüle sermayedir, çekilebilir para değildir.",
    kyc: { not_started: "başlamadı", submitted: "gönderildi, inceleme bekliyor", verified: "doğrulandı", rejected: "reddedildi" },
    status: { breached: "bir ihlal sonrası kapandı", expired: "inactivity nedeniyle kapandı", passed: "geçti", under_review: "incelemede", review_rejected: "incelemede reddedildi", closed: "kapandı", pending_activation: "aktivasyon bekliyor", ready: "hazır", active: "aktif" },
    binding: { daily: "günlük", max: "toplam" },
    steps: { kyc: "kimlik doğrulamayı (KYC) tamamlayın", kycWait: "KYC incelemesini bekleyin", contract: "trader sözleşmesini imzalayın", activate: "aktivasyon imzadan hemen sonra gerçekleşir" },
    checks: { kyc: "KYC", contract: "trader sözleşmesi", account_active: "aktif hesap", flat: "açık pozisyonları kapatma", cycle_date: "döngü tarihi", trading_days: "döngüdeki işlem günleri", consistency: "en iyi gün oranı", no_pending: "bekleyen talep olmaması", min_amount: "minimum tutar" },
    suggestions: ["100K hesabımda bugün ne kadar daha kaybedebilirim?", "Haber işlemi yapabilir miyim?", "İlk payout ne zaman?", "Challenge'ı geçtim, hesabım ne zaman açılır?"],
    labelAccount: "{id} · {prog} {size} · {phase} · v{v}",
    facts: { daily: "Günlük alan", max: "Toplam alan", floor: "Günlük taban", eq: "Equity", eligible: "Uygunluk tarihi" },
  },
} as const;

/* ───────────── engine ───────────── */

export function answerQuestion(input: AssistantInput): AssistantAnswer {
  const { locale, kb, programs, ruleSets, context, now } = input;
  const t = T[locale];
  const raw = input.question.slice(0, MAX_QUESTION_LENGTH).replace(/[\u0000-\u001f\u007f]/g, " ");
  const q = normalize(raw);
  const money = (c: number) => formatMoney(c, locale, { decimals: 2 });
  const tz = input.timeZone;
  const when = (ts: number) => {
    const ny = formatInZone(ts, "America/New_York", locale, { dateStyle: "medium", timeStyle: "short" });
    const local = tz && tz !== "America/New_York" ? formatInZone(ts, tz, locale, { timeStyle: "short" }) : null;
    return local ? `${ny} New York (${local} ${locale === "en" ? "your time" : "sizin saatinizle"})` : `${ny} New York`;
  };
  const day = (ts: number) => formatInZone(ts, "America/New_York", locale, { dateStyle: "medium" });
  const progName = (id: ProgramId) => programs.find((p) => p.id === id)?.name[locale] ?? id;
  const ruleSet = (id: string) => ruleSets.find((r) => r.id === id);
  const currentOf = (pid: ProgramId) => ruleSet(programs.find((p) => p.id === pid)!.currentRuleSetId)!;
  const phaseLabel = (rsId: string, kind: PhaseKind) => ruleSet(rsId)?.phases.find((p) => p.kind === kind)?.label[locale] ?? kind;
  const accLabel = (a: AssistantAccountContext) =>
    fmt(t.labelAccount, { id: a.id, prog: progName(a.programId), size: formatSize(a.size), phase: phaseLabel(a.ruleSetId, a.kind), v: a.version });

  const cite = (a: KnowledgeArticle): Citation => {
    const prog = a.programId ? progName(a.programId) : "ALPAS";
    const parts = [prog];
    if (a.phase) parts.push(phaseLabel(a.ruleSetId!, a.phase));
    if (a.version) parts.push(`v${a.version}`);
    return { id: a.id, title: a.title[locale], href: a.href, label: parts.join(" · ") };
  };
  const find = (rsId: string, phase: PhaseKind | "all", topic: Topic) => kb.find((a) => a.ruleSetId === rsId && (phase === "all" ? !a.phase : a.phase === phase) && a.topic === topic);
  const help = (topic: Topic) => kb.find((a) => a.id === `help/${topic}`);
  const uniqCites = (list: (KnowledgeArticle | undefined)[]) => {
    const seen = new Set<string>();
    return list.filter((a): a is KnowledgeArticle => !!a && !seen.has(a.id) && !!seen.add(a.id)).map(cite);
  };

  const base: AssistantAnswer = {
    intent: "unknown",
    paragraphs: [],
    facts: [],
    citations: [],
    notes: [],
    suggestions: [...t.suggestions],
    usedAccountIds: [],
    escalate: false,
  };

  const versionNote = (a: AssistantAccountContext) => {
    const cur = currentOf(a.programId);
    if (cur.version === a.version) return null;
    const snap = ruleSet(a.ruleSetId);
    if (!snap) return null;
    const diff = diffRuleSets(snap, cur)
      .map((d) => {
        const label = { minTradingDays: locale === "en" ? "minimum trading days" : "minimum işlem günü", firstPayoutAfterDays: locale === "en" ? "first payout after (days)" : "ilk payout (gün)", dailyLossBps: locale === "en" ? "daily loss" : "günlük zarar", maxLossBps: locale === "en" ? "maximum loss" : "maksimum zarar", profitTargetBps: locale === "en" ? "profit target" : "kâr hedefi", profitSplitBps: locale === "en" ? "profit split" : "kâr paylaşımı" }[d.key] ?? d.key;
        const f = (v: number | string) => (d.key.endsWith("Bps") && typeof v === "number" ? formatBps(v, locale) : String(v));
        return `${label}${d.phase && d.key === "minTradingDays" ? ` (${phaseLabel(a.ruleSetId, d.phase)})` : ""} ${f(d.from)} → ${f(d.to)}`;
      })
      .join("; ");
    return fmt(t.versionNote, { id: a.id, v: a.version, cur: cur.version, diff: diff || "—" });
  };

  // 1. Safety gates.
  const intent = classify(q);
  if (intent === "injection")
    return { ...base, intent, refusal: "injection", paragraphs: [t.injection, t.actionHelp] };
  if (intent === "action_request")
    return { ...base, intent, refusal: "action", paragraphs: [t.action, t.actionHelp], escalate: true };
  if (intent === "unauthorized") return { ...base, intent, refusal: "unauthorized", paragraphs: [t.bulk] };

  const refs = accountRefs(q);
  const owned = new Set(context?.accounts.map((a) => a.id) ?? []);
  const foreign = refs.find((r) => !owned.has(r));
  if (foreign) {
    if (!context) return { ...base, intent: "unauthorized", refusal: "sign_in", paragraphs: [t.signInForAccount] };
    return { ...base, intent: "unauthorized", refusal: "unauthorized", paragraphs: [fmt(t.unauthorized, { ref: foreign })] };
  }

  // 2. Filters from the question.
  const program = detectProgram(q);
  const phase = detectPhase(q);
  const size = detectSize(q);
  const version = detectVersion(q);
  const notes: string[] = [];
  let versionFilter: string | null = null;
  if (version) {
    const pool = ruleSets.filter((r) => !program || r.programId === program);
    if (pool.some((r) => r.version === version)) versionFilter = version;
    else
      notes.push(
        fmt(t.versionMissing, {
          v: version,
          list: ruleSets.map((r) => `${progName(r.programId)} v${r.version}`).join(", "),
        }),
      );
  }

  const accounts = (context?.accounts ?? []).filter(
    (a) => (!refs.length || refs.includes(a.id)) && (!program || a.programId === program) && (!size || a.size === size),
  );
  const isLive = (a: AssistantAccountContext) => a.status === "active" || a.status === "ready";

  switch (intent) {
    case "remaining_loss": {
      if (!context) {
        const sz = size ?? 100_000 * 100;
        const progs = program ? [program] : (["ascent", "ridge"] as ProgramId[]);
        const lines = progs.map((pid) => {
          const rs = currentOf(pid);
          const ph = rs.phases.find((p) => p.kind === (phase ?? "phase1")) ?? rs.phases[0];
          const damt = Math.round((sz * ph.dailyLossBps) / 10_000);
          const mamt = Math.round((sz * ph.maxLoss.bps) / 10_000);
          const mrule =
            ph.maxLoss.type === "static"
              ? `${money(sz - mamt)} (${locale === "en" ? "static" : "sabit"})`
              : locale === "en"
                ? `${formatBps(ph.maxLoss.bps, locale)} end-of-day trailing, locks at ${money(sz)}`
                : `${formatBps(ph.maxLoss.bps, locale)} gün sonu trailing, ${money(sz)}'de kilitlenir`;
          return fmt(t.remainingGenericLine, { prog: progName(pid), dpct: formatBps(ph.dailyLossBps, locale), damt: money(damt), mrule });
        });
        return {
          ...base,
          intent,
          refusal: "sign_in",
          paragraphs: [fmt(t.remainingGeneric, { size: formatSize(sz), lines: "" }).trim(), ...lines, t.signIn],
          notes: [t.touching, ...notes],
          citations: uniqCites(progs.flatMap((pid) => [find(currentOf(pid).id, phase ?? "phase1", "daily_loss"), find(currentOf(pid).id, phase ?? "phase1", "max_loss")])),
        };
      }
      const live = accounts.filter(isLive);
      if (!live.length) {
        const frozen = accounts.filter((a) => !isLive(a));
        const paragraphs = frozen.length
          ? frozen.slice(0, 3).map((a) =>
              fmt(t.remainingFrozen, {
                acc: accLabel(a),
                status: t.status[a.status as keyof typeof t.status] ?? a.status,
                when: a.risk.breach ? ` (${day(a.risk.breach.at)})` : "",
              }),
            )
          : [fmt(t.noActive, { list: context.accounts.filter(isLive).map(accLabel).join("; ") || "—" })];
        return { ...base, intent, paragraphs, usedAccountIds: frozen.map((a) => a.id), notes };
      }
      const chosen = live.slice(0, 3);
      const paragraphs: string[] = [];
      const facts: AssistantAnswer["facts"] = [];
      for (const a of chosen) {
        const r = a.risk;
        paragraphs.push(
          fmt(t.remaining, {
            acc: accLabel(a),
            daily: money(r.dailyRemaining),
            floor: money(r.dailyFloor),
            ref: money(r.dayReference),
            amt: money(r.dailyLossAmount),
            max: money(r.maxFloor),
            maxLeft: money(r.maxRemaining),
            binding: t.binding[r.bindingLimit],
            head: money(r.headroom),
          }),
        );
        if (r.openPnl !== 0) paragraphs.push(fmt(t.remainingOpen, { open: formatMoney(r.openPnl, locale, { sign: true }) }));
        const vn = versionNote(a);
        if (vn) notes.push(vn);
        if (chosen.length === 1)
          facts.push(
            { label: t.facts.daily, value: money(r.dailyRemaining) },
            { label: t.facts.max, value: money(r.maxRemaining) },
            { label: t.facts.floor, value: money(r.dailyFloor) },
            { label: t.facts.eq, value: money(r.equity) },
          );
      }
      notes.unshift(t.touching, fmt(t.nextReset, { time: when(chosen[0].risk.nextReset) }));
      return {
        ...base,
        intent,
        paragraphs,
        facts,
        notes,
        usedAccountIds: chosen.map((a) => a.id),
        citations: uniqCites(chosen.flatMap((a) => [find(a.ruleSetId, a.kind, "daily_loss"), find(a.ruleSetId, a.kind, "max_loss"), find(a.ruleSetId, "all", "reset")])),
      };
    }

    case "news":
    case "weekend": {
      const topic: Topic = intent;
      type Target = { rsId: string; kind: PhaseKind };
      let targets: Target[] = [];
      if (program || phase || versionFilter) {
        const progs = program ? [program] : (["ascent", "ridge"] as ProgramId[]);
        for (const pid of progs) {
          const rs = versionFilter ? ruleSets.find((r) => r.programId === pid && r.version === versionFilter) ?? currentOf(pid) : currentOf(pid);
          const kinds = phase ? [phase] : [...new Set(rs.phases.map((p) => (p.kind === "funded" ? "funded" : "phase1")))];
          for (const k of kinds) if (rs.phases.some((p) => p.kind === k)) targets.push({ rsId: rs.id, kind: k as PhaseKind });
        }
      } else if (context && context.accounts.some(isLive)) {
        const seen = new Set<string>();
        for (const a of context.accounts.filter(isLive)) {
          const key = `${a.ruleSetId}/${a.kind}`;
          if (!seen.has(key)) {
            seen.add(key);
            targets.push({ rsId: a.ruleSetId, kind: a.kind });
          }
        }
      } else {
        for (const pid of ["ascent", "ridge"] as ProgramId[]) {
          const rs = currentOf(pid);
          targets.push({ rsId: rs.id, kind: "phase1" }, { rsId: rs.id, kind: "funded" });
        }
      }
      targets = targets.slice(0, 4);
      const arts = targets.map((tg) => find(tg.rsId, tg.kind, topic)).filter((a): a is KnowledgeArticle => !!a);
      if (!arts.length) return { ...base, intent: "unknown", refusal: "not_found", paragraphs: [t.notFound], escalate: true, notes };
      return {
        ...base,
        intent,
        paragraphs: arts.map((a) => fmt(t.newsLine, { label: cite(a).label, text: a.body[locale] })),
        citations: uniqCites(arts),
        notes,
      };
    }

    case "payout_timing": {
      const funded = (context?.accounts ?? []).filter((a) => a.kind === "funded" && (!refs.length || refs.includes(a.id)) && (!program || a.programId === program));
      if (funded.length) {
        const paragraphs: string[] = [];
        const facts: AssistantAnswer["facts"] = [];
        for (const a of funded.slice(0, 3)) {
          const po = a.payout;
          const rs = ruleSet(a.ruleSetId)!;
          if (!po) continue;
          if (po.pending) paragraphs.push(fmt(t.payoutPending, { acc: accLabel(a), id: po.pending.id, status: po.pending.status }));
          else if (po.eligible) paragraphs.push(fmt(t.payoutEligible, { acc: accLabel(a), max: money(po.requestable), min: money(po.minRequest) }));
          else {
            paragraphs.push(po.eligibleFrom ? fmt(t.payoutNext, { acc: accLabel(a), date: when(po.eligibleFrom) }) : accLabel(a));
            const failing = po.failing.filter((c) => c !== "cycle_date");
            if (failing.length) paragraphs.push(fmt(t.payoutBlocked, { checks: failing.map((c) => t.checks[c]).join(", ") }));
          }
          if (po.isFirst) paragraphs.push(fmt(t.payoutFirstRule, { days: rs.payout.firstPayoutAfterDays, v: a.version }));
          if (po.lastPaidAt) paragraphs.push(fmt(t.payoutLast, { date: day(po.lastPaidAt) }));
          if (po.eligibleFrom && funded.length === 1) facts.push({ label: t.facts.eligible, value: day(po.eligibleFrom) });
          const vn = versionNote(a);
          if (vn) notes.push(vn);
        }
        return {
          ...base,
          intent,
          paragraphs,
          facts,
          notes,
          usedAccountIds: funded.map((a) => a.id),
          citations: uniqCites(funded.flatMap((a) => [find(a.ruleSetId, "all", "payout_schedule"), find(a.ruleSetId, "all", "payout_minimum")])),
        };
      }
      const progs = program ? [program] : (["ascent", "ridge"] as ProgramId[]);
      const paragraphs = context
        ? [fmt(t.payoutNoFunded, { days: currentOf(progs[0]).payout.firstPayoutAfterDays, cycle: currentOf(progs[0]).payout.cycleDays })]
        : [];
      for (const pid of progs) {
        const rs = currentOf(pid);
        paragraphs.push(
          fmt(t.payoutGeneric, {
            prog: progName(pid),
            v: rs.version,
            first: rs.payout.firstPayoutAfterDays,
            cycle: rs.payout.cycleDays,
            mindays: rs.payout.minTradingDaysPerCycle,
            split: formatBps(rs.payout.profitSplitBps, locale),
          }),
        );
      }
      if (!context) notes.push(t.signIn);
      return { ...base, intent, paragraphs, notes, citations: uniqCites(progs.map((pid) => find(currentOf(pid).id, "all", "payout_schedule"))) };
    }

    case "activation": {
      const paragraphs: string[] = [];
      const used: string[] = [];
      const kycLabel = context ? t.kyc[context.kycStatus] : "";
      if (context) {
        for (const a of context.accounts) {
          if (a.status === "under_review" && a.review?.status === "open") {
            paragraphs.push(fmt(t.actReview, { acc: accLabel(a), date: day(a.review.openedAt), eta: day(addBusinessDays(a.review.openedAt, 2)) }));
            paragraphs.push(fmt(t.actNext, { kyc: kycLabel }));
            used.push(a.id);
          } else if (a.challengeStatus === "passed" && a.kind !== "funded" && a.status === "passed" && a.review?.status === "approved") {
            const steps =
              context.kycStatus === "verified"
                ? [t.steps.contract, t.steps.activate]
                : context.kycStatus === "submitted"
                  ? [t.steps.kycWait, t.steps.contract, t.steps.activate]
                  : [t.steps.kyc, t.steps.contract, t.steps.activate];
            paragraphs.push(fmt(t.actPassed, { acc: a.id, steps: steps.join(" → ") }));
            used.push(a.id);
          }
        }
        const fundedActive = context.accounts.filter((a) => a.kind === "funded" && a.status === "active");
        for (const f of fundedActive.slice(0, 2)) {
          paragraphs.push(fmt(t.actFunded, { acc: accLabel(f) }));
          used.push(f.id);
        }
        const p1 = context.accounts.find((a) => a.kind === "phase1" && a.programId === "ascent" && isLive(a));
        if (p1) {
          paragraphs.push(fmt(t.actPhase1, { acc: p1.id }));
          used.push(p1.id);
        }
      }
      const art = help("activation");
      if (!paragraphs.length && art) paragraphs.push(t.actGeneric, art.body[locale]);
      if (!context) notes.push(t.signIn);
      return { ...base, intent, paragraphs, notes, usedAccountIds: used, citations: uniqCites([art, help("kyc")]) };
    }

    case "price": {
      const progs = program ? programs.filter((p) => p.id === program) : programs;
      const paragraphs = progs.map((p) => {
        const opt = size ? p.sizes.find((s) => s.size === size) : null;
        if (opt) return fmt(t.priceOne, { prog: p.name[locale], size: formatSize(opt.size), price: formatMoney(opt.price, locale, { decimals: 0 }) });
        return fmt(t.priceLine, { prog: p.name[locale], list: p.sizes.map((s) => `${formatSize(s.size)} ${formatMoney(s.price, locale, { decimals: 0 })}`).join(" · ") });
      });
      return { ...base, intent, paragraphs, notes, citations: uniqCites([help("pricing"), help("simulated_capital")]) };
    }

    default: {
      // Retrieval over the knowledge base.
      const qTokens = tokens(raw);
      if (!qTokens.length) return { ...base, intent: "unknown", refusal: "not_found", paragraphs: [t.notFound], escalate: true, notes };
      const liveVersions = new Set((context?.accounts ?? []).map((a) => a.ruleSetId));
      const current = new Set(programs.map((p) => p.currentRuleSetId));
      const pool = kb.filter((a) => {
        if (a.flagged) return false;
        if (program && a.programId && a.programId !== program) return false;
        if (phase && a.phase && a.phase !== phase) return false;
        if (a.ruleSetId) {
          if (versionFilter) return a.version === versionFilter;
          return current.has(a.ruleSetId) || liveVersions.has(a.ruleSetId);
        }
        return true;
      });
      const prefix = (x: string) => (x.length >= 5 ? x.slice(0, 5) : x);
      const qPrefixes = [...new Set(qTokens.map(prefix))];
      const scoreOf = (a: KnowledgeArticle) => {
        const title = new Set(tokens(a.title[locale]).concat(tokens(a.title.en)).map(prefix));
        const kw = new Set(a.keywords.flatMap((k) => tokens(k)).map(prefix));
        const body = new Set(tokens(a.body[locale]).map(prefix));
        let score = 0;
        let matched = 0;
        for (const tk of qPrefixes) {
          const hit = title.has(tk) || kw.has(tk) || body.has(tk);
          if (title.has(tk)) score += 3;
          if (kw.has(tk)) score += 2;
          if (body.has(tk)) score += 1;
          if (hit) matched++;
        }
        if (a.ruleSetId && current.has(a.ruleSetId)) score += 0.5;
        return { score, coverage: matched / qPrefixes.length };
      };
      const ranked = pool
        .map((a) => ({ a, ...scoreOf(a) }))
        .filter((r) => r.coverage >= 0.5)
        .map((r) => ({ a: r.a, s: r.score }))
        .sort((x, y) => y.s - x.s);
      const best = ranked[0];
      if (!best || best.s < Math.min(3, 1 + qPrefixes.length)) return { ...base, intent: "unknown", refusal: "not_found", paragraphs: [t.notFound], escalate: true, notes };
      const picks = ranked.filter((r) => r.s >= best.s * 0.8 && r.a.topic === best.a.topic).slice(0, 2).map((r) => r.a);
      const paragraphs = picks.map((a) => (picks.length > 1 ? `${cite(a).label}: ${a.body[locale]}` : a.body[locale]));
      if (picks.length === 1 && picks[0].example) paragraphs.push(picks[0].example[locale]);
      return { ...base, intent: "lookup", paragraphs, citations: uniqCites(picks), notes };
    }
  }
}
