/**
 * Knowledge base for the rules center, help center and ALPAS Assistant.
 * Rule articles are generated from the versioned rule sets, so published text
 * can never drift from what the engine enforces.
 */
import { CONTRACT_VERSION, RESTRICTED_COUNTRIES } from "./catalog";
import type { L10n } from "./l10n";
import { applyBps, formatBps, formatMoney, formatSize, usd } from "./money";
import { dailyFloorFor, trailingFloorFor } from "./risk";
import type { PhaseKind, PhaseRules, Program, ProgramId, RuleSet } from "./types";

export type Topic =
  | "profit_target"
  | "daily_loss"
  | "max_loss"
  | "trading_days"
  | "consistency"
  | "per_trade_risk"
  | "news"
  | "weekend"
  | "reset"
  | "breach"
  | "inactivity"
  | "ea"
  | "copy_trading"
  | "prohibited"
  | "leverage"
  | "payout_schedule"
  | "payout_split"
  | "payout_minimum"
  | "payout_refund"
  | "payout_consistency"
  | "payout_process"
  | "scaling"
  | "activation"
  | "kyc"
  | "platform"
  | "regions"
  | "certificates"
  | "pricing"
  | "simulated_capital"
  | "demo"
  | "faq";

export interface KnowledgeArticle {
  id: string;
  anchor: string;
  href: string;
  category: "rule" | "payout" | "help" | "faq";
  topic: Topic;
  programId?: ProgramId;
  phase?: PhaseKind;
  ruleSetId?: string;
  version?: string;
  title: L10n;
  body: L10n;
  example?: L10n;
  keywords: string[];
  updatedAt: string;
  flagged?: boolean;
}

const m = (c: number, loc: "en" | "tr") => formatMoney(c, loc, { decimals: 0 });
const p = (bps: number, loc: "en" | "tr") => formatBps(bps, loc);
const both = (f: (loc: "en" | "tr") => string): L10n => ({ en: f("en"), tr: f("tr") });

const phaseSlug = (k: PhaseKind) => (k === "phase1" ? "phase-1" : k === "phase2" ? "phase-2" : "funded");
const anchorOf = (rs: RuleSet, phase: PhaseKind | "all", topic: string) =>
  `${rs.programId}-v${rs.version.replace(".", "-")}-${phase === "all" ? "all" : phaseSlug(phase)}-${topic.replace(/_/g, "-")}`;
const rulesHref = (rs: RuleSet, phase: PhaseKind | "all", anchor: string) =>
  `/rules?program=${rs.programId}&stage=${phase}&version=${rs.version}#${anchor}`;

const EXAMPLE_SIZE = usd(100_000);

function phaseArticles(rs: RuleSet, ph: PhaseRules, programName: L10n): KnowledgeArticle[] {
  const out: KnowledgeArticle[] = [];
  const add = (topic: Topic, title: L10n, body: L10n, keywords: string[], example?: L10n) => {
    const anchor = anchorOf(rs, ph.kind, topic);
    out.push({
      id: `${rs.id}/${ph.kind}/${topic}`,
      anchor,
      href: rulesHref(rs, ph.kind, anchor),
      category: "rule",
      topic,
      programId: rs.programId,
      phase: ph.kind,
      ruleSetId: rs.id,
      version: rs.version,
      title,
      body,
      example,
      keywords,
      updatedAt: rs.publishedAt,
    });
  };
  const stage = (loc: "en" | "tr") => `${programName[loc]} · ${ph.label[loc]}`;
  const daily = applyBps(EXAMPLE_SIZE, ph.dailyLossBps);
  const maxAmt = applyBps(EXAMPLE_SIZE, ph.maxLoss.bps);

  if (ph.profitTargetBps !== null) {
    const target = applyBps(EXAMPLE_SIZE, ph.profitTargetBps);
    add(
      "profit_target",
      both((l) => (l === "en" ? `Profit target — ${stage(l)}` : `Kâr hedefi — ${stage(l)}`)),
      both((l) =>
        l === "en"
          ? `Reach a closed-balance profit of ${p(ph.profitTargetBps!, l)} of the initial account size. The target counts closed trades net of commission and swap; open positions must be closed for the stage to complete.`
          : `Başlangıç hesap büyüklüğünün ${p(ph.profitTargetBps!, l)}'i kadar kapanmış bakiye kârına ulaşın. Hedef, komisyon ve swap düşülmüş kapanmış işlemleri sayar. Aşamanın tamamlanması için açık pozisyonlar kapatılmış olmalıdır.`,
      ),
      ["profit", "target", "kâr", "hedef", "geçmek", "pass", "objective"],
      both((l) =>
        l === "en"
          ? `${formatSize(EXAMPLE_SIZE)} account: target ${m(target, l)} → closed balance must reach ${m(EXAMPLE_SIZE + target, l)}.`
          : `${formatSize(EXAMPLE_SIZE)} hesap: hedef ${m(target, l)} → kapanmış bakiye ${m(EXAMPLE_SIZE + target, l)} olmalı.`,
      ),
    );
  }

  const ref = EXAMPLE_SIZE + usd(2_000);
  add(
    "daily_loss",
    both((l) => (l === "en" ? `Daily loss limit — ${stage(l)}` : `Günlük zarar limiti — ${stage(l)}`)),
    both((l) =>
      l === "en"
        ? `Your daily loss amount is ${p(ph.dailyLossBps, l)} of the initial account size. At each daily reset (${rs.dailyResetHour}:00 ${rs.timezone}) the reference is set to the higher of balance and equity. Equity — including open P&L, commission and swap — must stay above reference minus the daily amount. Touching the floor is a breach.`
        : `Günlük zarar tutarınız başlangıç hesap büyüklüğünün ${p(ph.dailyLossBps, l)}'idir. Her günlük resette (${rs.dailyResetHour}:00 ${rs.timezone}) referans, bakiye ve equity'nin yüksek olanına ayarlanır. Açık P&L, komisyon ve swap dahil equity, referans eksi günlük tutarın üzerinde kalmalıdır. Tabana dokunmak ihlaldir.`,
    ),
    ["daily", "günlük", "loss", "zarar", "kayıp", "kaybedebilirim", "limit", "drawdown", "lose", "today", "bugün", "kalan", "remaining"],
    both((l) =>
      l === "en"
        ? `${formatSize(EXAMPLE_SIZE)}: balance ${m(ref, l)} at the reset → daily floor ${m(dailyFloorFor(ref, EXAMPLE_SIZE, ph.dailyLossBps), l)} (${m(ref, l)} − ${m(daily, l)}).`
        : `${formatSize(EXAMPLE_SIZE)}: resette bakiye ${m(ref, l)} → günlük taban ${m(dailyFloorFor(ref, EXAMPLE_SIZE, ph.dailyLossBps), l)} (${m(ref, l)} − ${m(daily, l)}).`,
    ),
  );

  const isTrailing = ph.maxLoss.type === "trailing_eod";
  add(
    "max_loss",
    both((l) => (l === "en" ? `Maximum loss limit — ${stage(l)}` : `Maksimum zarar limiti — ${stage(l)}`)),
    both((l) =>
      isTrailing
        ? l === "en"
          ? `${p(ph.maxLoss.bps, l)} end-of-day trailing. The floor is min(initial balance, highest balance recorded at a daily reset − ${p(ph.maxLoss.bps, l)} of initial size). Intraday peaks do not move the floor. Once the floor reaches the initial balance it stays there. Withdrawals shift the reference down by the withdrawn amount.`
          : `${p(ph.maxLoss.bps, l)} gün sonu trailing. Taban = min(başlangıç bakiyesi, günlük resetlerde kaydedilen en yüksek bakiye − başlangıcın ${p(ph.maxLoss.bps, l)}'i). Gün içi zirveler tabanı hareket ettirmez. Taban başlangıç bakiyesine ulaştığında orada kilitlenir. Çekimler referansı çekilen tutar kadar aşağı kaydırır.`
        : l === "en"
          ? `${p(ph.maxLoss.bps, l)} static. Equity must stay above initial size − ${p(ph.maxLoss.bps, l)}. The floor never moves, including after payouts. Touching the floor is a breach.`
          : `${p(ph.maxLoss.bps, l)} sabit (static). Equity, başlangıç büyüklüğü − ${p(ph.maxLoss.bps, l)} seviyesinin üzerinde kalmalıdır. Taban payout sonrası dahil hiç değişmez. Tabana dokunmak ihlaldir.`,
    ),
    ["max", "maximum", "maksimum", "toplam", "overall", "trailing", "static", "sabit", "drawdown", "floor", "taban", "loss", "zarar"],
    both((l) =>
      isTrailing
        ? l === "en"
          ? `${formatSize(EXAMPLE_SIZE)}: start floor ${m(EXAMPLE_SIZE - maxAmt, l)}; best reset balance ${m(EXAMPLE_SIZE + usd(3_000), l)} → floor ${m(trailingFloorFor(EXAMPLE_SIZE + usd(3_000), EXAMPLE_SIZE, ph.maxLoss.bps), l)}; at ${m(EXAMPLE_SIZE + maxAmt, l)} or above → locked at ${m(EXAMPLE_SIZE, l)}.`
          : `${formatSize(EXAMPLE_SIZE)}: başlangıç tabanı ${m(EXAMPLE_SIZE - maxAmt, l)}; en yüksek reset bakiyesi ${m(EXAMPLE_SIZE + usd(3_000), l)} → taban ${m(trailingFloorFor(EXAMPLE_SIZE + usd(3_000), EXAMPLE_SIZE, ph.maxLoss.bps), l)}; ${m(EXAMPLE_SIZE + maxAmt, l)} ve üzeri → ${m(EXAMPLE_SIZE, l)}'de kilitli.`
        : l === "en"
          ? `${formatSize(EXAMPLE_SIZE)}: floor ${m(EXAMPLE_SIZE - maxAmt, l)} for the whole life of the account.`
          : `${formatSize(EXAMPLE_SIZE)}: hesap boyunca taban ${m(EXAMPLE_SIZE - maxAmt, l)}.`,
    ),
  );

  if (ph.minTradingDays > 0)
    add(
      "trading_days",
      both((l) => (l === "en" ? `Minimum trading days — ${stage(l)}` : `Minimum işlem günü — ${stage(l)}`)),
      both((l) =>
        l === "en"
          ? `Trade on at least ${ph.minTradingDays} trading days. A trading day is a session (${rs.dailyResetHour}:00–${rs.dailyResetHour}:00 ${rs.timezone}) in which at least one position was opened. Days do not need to be consecutive. There is no time limit.`
          : `En az ${ph.minTradingDays} işlem gününde işlem yapın. İşlem günü, en az bir pozisyonun açıldığı seanstır (${rs.dailyResetHour}:00–${rs.dailyResetHour}:00 ${rs.timezone}). Günlerin ardışık olması gerekmez. Süre sınırı yoktur.`,
      ),
      ["minimum", "trading", "days", "işlem", "günü", "gün", "time", "limit", "süre"],
    );

  if (ph.consistency)
    add(
      "consistency",
      both((l) => (l === "en" ? `Best-day consistency — ${stage(l)}` : `En iyi gün (consistency) — ${stage(l)}`)),
      both((l) =>
        l === "en"
          ? `Your best day's net P&L may be at most ${p(ph.consistency!.bestDayMaxBps, l)} of total net profit when the stage completes. Formula: best day ÷ total net profit. Exceeding it is not a breach: you keep trading until the share is at or below the limit.`
          : `Aşama tamamlanırken en iyi gününüzün net P&L'i toplam net kârın en fazla ${p(ph.consistency!.bestDayMaxBps, l)}'i olabilir. Formül: en iyi gün ÷ toplam net kâr. Aşılması ihlal değildir: oran sınırın altına inene kadar işleme devam edersiniz.`,
      ),
      ["consistency", "best", "day", "en iyi", "gün", "tutarlılık", "oran"],
      both((l) =>
        l === "en"
          ? `Total +${m(usd(10_400), l)}, best day +${m(usd(4_900), l)} → 47.1% ≤ ${p(ph.consistency!.bestDayMaxBps, l)} ✓`
          : `Toplam +${m(usd(10_400), l)}, en iyi gün +${m(usd(4_900), l)} → %47,1 ≤ ${p(ph.consistency!.bestDayMaxBps, l)} ✓`,
      ),
    );

  if (ph.perTradeRiskBps !== null)
    add(
      "per_trade_risk",
      both((l) => (l === "en" ? `Per-trade risk — ${stage(l)}` : `İşlem başına risk — ${stage(l)}`)),
      both((l) =>
        l === "en"
          ? `Each position needs a stop-loss. (Entry − stop) × volume may not exceed ${p(ph.perTradeRiskBps!, l)} of the initial size. A larger risk is recorded as a soft violation; three soft violations trigger a manual review. It is not an automatic breach.`
          : `Her pozisyonda stop-loss olmalıdır. (Giriş − stop) × hacim, başlangıç büyüklüğünün ${p(ph.perTradeRiskBps!, l)}'ini aşamaz. Daha yüksek risk yumuşak ihlal olarak kaydedilir; üç yumuşak ihlal manuel incelemeyi başlatır. Otomatik ihlal değildir.`,
      ),
      ["risk", "stop", "loss", "sl", "per", "trade", "işlem", "başına", "lot"],
    );

  add(
    "news",
    both((l) => (l === "en" ? `News trading — ${stage(l)}` : `Haber işlemleri — ${stage(l)}`)),
    both((l) =>
      ph.newsTrading === "allowed"
        ? l === "en"
          ? "News trading is allowed in this stage. Slippage and gaps around releases still count toward your limits."
          : "Bu aşamada haber işlemleri serbesttir. Veri açıklamaları sırasındaki kayma ve boşluklar yine de limitlerinize sayılır."
        : l === "en"
          ? "Opening or closing positions on an affected instrument within 2 minutes before or after a high-impact release is restricted. Profit from such trades is excluded from the payout calculation. It is not a breach, but repeated cases are reviewed."
          : "Yüksek etkili bir veri açıklamasından 2 dakika önce veya sonra, etkilenen enstrümanda pozisyon açmak veya kapatmak kısıtlıdır. Bu işlemlerden gelen kâr payout hesabından düşülür. İhlal değildir, ancak tekrar eden durumlar incelenir.",
    ),
    ["news", "haber", "nfp", "cpi", "fomc", "release", "açıklama", "veri", "ekonomik"],
  );

  add(
    "weekend",
    both((l) => (l === "en" ? `Weekend holding — ${stage(l)}` : `Hafta sonu taşıma — ${stage(l)}`)),
    both((l) =>
      ph.weekendHolding
        ? l === "en"
          ? "Holding positions over the weekend is allowed. Swap applies and weekend gaps count toward your limits."
          : "Pozisyonları hafta sonuna taşımak serbesttir. Swap uygulanır ve hafta sonu boşlukları limitlere sayılır."
        : l === "en"
          ? "Positions must be closed before the Friday market close. Positions still open at 16:50 New York time are closed by the system. This is not a breach."
          : "Pozisyonlar cuma piyasa kapanışından önce kapatılmalıdır. New York saatiyle 16:50'de açık kalan pozisyonlar sistem tarafından kapatılır. Bu bir ihlal değildir.",
    ),
    ["weekend", "hafta", "sonu", "friday", "cuma", "overnight", "gece", "swap", "hold", "taşıma"],
  );

  add(
    "leverage",
    both((l) => (l === "en" ? `Leverage — ${stage(l)}` : `Kaldıraç — ${stage(l)}`)),
    both((l) => (l === "en" ? `Simulated leverage: ${ph.leverage.en}.` : `Simüle kaldıraç: ${ph.leverage.tr}.`)),
    ["leverage", "kaldıraç", "margin", "teminat"],
  );
  return out;
}

function ruleSetArticles(rs: RuleSet, program: Program): KnowledgeArticle[] {
  const out: KnowledgeArticle[] = [];
  const add = (topic: Topic, category: KnowledgeArticle["category"], title: L10n, body: L10n, keywords: string[], example?: L10n) => {
    const anchor = anchorOf(rs, "all", topic);
    out.push({
      id: `${rs.id}/all/${topic}`,
      anchor,
      href: category === "payout" ? `/payouts?version=${rs.programId}@${rs.version}#${anchor}` : rulesHref(rs, "all", anchor),
      category,
      topic,
      programId: rs.programId,
      ruleSetId: rs.id,
      version: rs.version,
      title,
      body,
      example,
      keywords,
      updatedAt: rs.publishedAt,
    });
  };
  const n = (loc: "en" | "tr") => program.name[loc];
  const po = rs.payout;

  add(
    "reset",
    "rule",
    both((l) => (l === "en" ? `Daily reset and time zone — ${n(l)}` : `Günlük reset ve saat dilimi — ${n(l)}`)),
    both((l) =>
      l === "en"
        ? `The trading day resets at ${rs.dailyResetHour}:00 ${rs.timezone} (US daylight saving time applies). That is 00:00 or 01:00 in Istanbul depending on the season. Daily limits, trading days and the trailing reference all use this boundary.`
        : `İşlem günü ${rs.dailyResetHour}:00 ${rs.timezone} saatinde resetlenir (ABD yaz saati uygulanır). Bu, mevsime göre İstanbul'da 00:00 veya 01:00'dır. Günlük limitler, işlem günleri ve trailing referansı bu sınırı kullanır.`,
    ),
    ["reset", "time", "zone", "saat", "dilimi", "midnight", "gece", "yarısı", "new york", "when", "ne zaman", "sıfırlan"],
  );
  add(
    "breach",
    "rule",
    both((l) => (l === "en" ? `What happens at a limit — ${n(l)}` : `Limite ulaşınca ne olur — ${n(l)}`)),
    both((l) =>
      l === "en"
        ? "If equity is equal to or below a floor, the account is breached immediately: open positions are closed, trading stops and the evaluation fails (or the funded account closes). A breach cannot be removed or reversed by support or by the Assistant."
        : "Equity bir tabana eşit veya altındaysa hesap anında ihlal edilmiş sayılır: açık pozisyonlar kapatılır, işlem durur ve değerlendirme başarısız olur (veya funded hesap kapanır). İhlal destek ekibi veya Assistant tarafından kaldırılamaz ya da geri alınamaz.",
    ),
    ["breach", "ihlal", "equal", "eşit", "touch", "dokun", "fail", "kapan", "closed", "limit"],
  );
  add(
    "inactivity",
    "rule",
    both((l) => (l === "en" ? `Inactivity and time limits — ${n(l)}` : `Inactivity ve süre sınırı — ${n(l)}`)),
    both((l) =>
      l === "en"
        ? `There is no time limit for any stage. If no position is opened for ${rs.phases[0].inactivityDays} consecutive calendar days, the account is closed for inactivity (a reminder is sent on day 23).`
        : `Hiçbir aşamada süre sınırı yoktur. ${rs.phases[0].inactivityDays} ardışık takvim günü boyunca pozisyon açılmazsa hesap inactivity nedeniyle kapanır (23. günde hatırlatma gönderilir).`,
    ),
    ["inactivity", "inaktif", "süre", "time", "limit", "deadline", "expire", "30"],
  );
  add(
    "ea",
    "rule",
    both((l) => (l === "en" ? `Expert advisors (EAs) — ${n(l)}` : `Uzman danışmanlar (EA) — ${n(l)}`)),
    both((l) =>
      l === "en"
        ? `EAs are allowed if they do not exploit the simulated environment. More than ${rs.eaMaxServerRequestsPerDay.toLocaleString("en-US")} server requests per day, latency arbitrage and tick scalping are prohibited.`
        : `EA'lar simüle ortamı istismar etmedikçe serbesttir. Günde ${rs.eaMaxServerRequestsPerDay.toLocaleString("tr-TR")}'den fazla sunucu isteği, gecikme arbitrajı ve tick scalping yasaktır.`,
    ),
    ["ea", "eas", "expert", "advisor", "advisors", "bot", "robot", "algo", "otomatik", "hft", "allowed", "serbest", "izin"],
  );
  add(
    "copy_trading",
    "rule",
    both((l) => (l === "en" ? `Copy trading — ${n(l)}` : `Copy trading — ${n(l)}`)),
    both((l) =>
      l === "en"
        ? `Copying is allowed only between your own ALPAS accounts, up to ${m(rs.copyTradingMaxCombined, l)} combined nominal size. Copying third-party signals or other people's accounts is not allowed.`
        : `Kopyalama yalnızca kendi ALPAS hesaplarınız arasında, toplam ${m(rs.copyTradingMaxCombined, l)} nominal büyüklüğe kadar serbesttir. Üçüncü taraf sinyalleri veya başkalarının hesaplarını kopyalamak yasaktır.`,
    ),
    ["copy", "kopya", "signal", "sinyal", "mirror", "trade copier"],
  );
  add(
    "prohibited",
    "rule",
    both((l) => (l === "en" ? `Prohibited practices — ${n(l)}` : `Yasaklı uygulamalar — ${n(l)}`)),
    both((l) =>
      l === "en"
        ? "Latency arbitrage; tick scalping/HFT; opposite positions across accounts or firms (hedging); exploiting simulated price errors; letting third parties trade or manage the account; splitting profit artificially across days to pass consistency rules."
        : "Gecikme arbitrajı; tick scalping/HFT; hesaplar veya firmalar arasında karşı pozisyon (hedge); simüle fiyat hatalarını istismar; hesabı üçüncü kişilere kullandırmak veya yönettirmek; consistency kuralını geçmek için kârı yapay olarak günlere bölmek.",
    ),
    ["prohibited", "yasak", "forbidden", "hedge", "arbitrage", "arbitraj", "allowed", "serbest", "strategy", "strateji"],
  );
  add(
    "payout_schedule",
    "payout",
    both((l) => (l === "en" ? `Payout schedule — ${n(l)}` : `Payout takvimi — ${n(l)}`)),
    both((l) =>
      l === "en"
        ? `First payout: eligible ${po.firstPayoutAfterDays} calendar days after the first trade on the funded account. After that: every ${po.cycleDays} days, counted from your previous request. Each cycle needs at least ${po.minTradingDaysPerCycle} trading days, no open positions, verified KYC and a signed contract.`
        : `İlk payout: funded hesaptaki ilk işlemden ${po.firstPayoutAfterDays} takvim günü sonra talep edilebilir. Sonrasında önceki talebinizden itibaren her ${po.cycleDays} günde bir. Her döngüde en az ${po.minTradingDaysPerCycle} işlem günü, açık pozisyon olmaması, doğrulanmış KYC ve imzalı sözleşme gerekir.`,
    ),
    ["payout", "ödeme", "çekim", "withdraw", "reward", "ödül", "first", "ilk", "when", "ne zaman", "next", "sonraki", "cycle", "döngü"],
  );
  add(
    "payout_split",
    "payout",
    both((l) => (l === "en" ? `Profit split — ${n(l)}` : `Kâr paylaşımı — ${n(l)}`)),
    both((l) =>
      l === "en"
        ? `You receive ${p(po.profitSplitBps, l)} of the gross amount you request; ALPAS retains ${p(10_000 - po.profitSplitBps, l)}. Under the scaling plan the split becomes ${p(po.scaledProfitSplitBps, l)}. The gross amount is removed from the account balance.`
        : `Talep ettiğiniz brüt tutarın ${p(po.profitSplitBps, l)}'ini siz alırsınız, ${p(10_000 - po.profitSplitBps, l)}'i ALPAS'ta kalır. Scaling planında oran ${p(po.scaledProfitSplitBps, l)}'a çıkar. Brüt tutar hesap bakiyesinden düşülür.`,
    ),
    ["split", "paylaşım", "share", "pay", "yüzde", "percent", "80", "90"],
    both((l) =>
      l === "en"
        ? `Request ${m(usd(4_000), l)} gross → you ${m(applyBps(usd(4_000), po.profitSplitBps), l)}, ALPAS ${m(usd(4_000) - applyBps(usd(4_000), po.profitSplitBps), l)}.`
        : `${m(usd(4_000), l)} brüt talep → siz ${m(applyBps(usd(4_000), po.profitSplitBps), l)}, ALPAS ${m(usd(4_000) - applyBps(usd(4_000), po.profitSplitBps), l)}.`,
    ),
  );
  add(
    "payout_minimum",
    "payout",
    both((l) => (l === "en" ? `Minimum request and reserve — ${n(l)}` : `Minimum talep ve rezerv — ${n(l)}`)),
    both((l) =>
      l === "en"
        ? `Minimum gross request: ${p(po.minRequestBps, l)} of nominal size (${m(applyBps(EXAMPLE_SIZE, po.minRequestBps), l)} on ${formatSize(EXAMPLE_SIZE)}). You can request up to the profit above the initial balance. Only one request can be open at a time. The requested gross is reserved from the balance immediately and returned if the request is rejected or cancelled.`
        : `Minimum brüt talep: nominal büyüklüğün ${p(po.minRequestBps, l)}'i (${formatSize(EXAMPLE_SIZE)}'de ${m(applyBps(EXAMPLE_SIZE, po.minRequestBps), l)}). Başlangıç bakiyesinin üzerindeki kâra kadar talep edebilirsiniz. Aynı anda yalnızca bir talep açık olabilir. Talep edilen brüt tutar hemen bakiyeden rezerve edilir ve talep reddedilir veya iptal edilirse geri döner.`,
    ),
    ["minimum", "min", "amount", "tutar", "reserve", "rezerv", "pending", "bekleyen", "request", "talep"],
  );
  add(
    "payout_refund",
    "payout",
    both((l) => (l === "en" ? `Fee refund — ${n(l)}` : `Ücret iadesi — ${n(l)}`)),
    both((l) =>
      l === "en"
        ? "The evaluation fee is refunded once, as a separate line on your first payout that reaches Paid status. It is not subject to the profit split. There is no other refund of the fee."
        : "Değerlendirme ücreti, Paid durumuna ulaşan ilk payout'unuza ayrı bir satır olarak bir kez iade edilir. Kâr paylaşımına tabi değildir. Ücretin başka bir yolla iadesi yoktur.",
    ),
    ["refund", "iade", "fee", "ücret", "back", "geri"],
  );
  if (po.consistency)
    add(
      "payout_consistency",
      "payout",
      both((l) => (l === "en" ? `Payout consistency — ${n(l)}` : `Payout consistency — ${n(l)}`)),
      both((l) =>
        l === "en"
          ? `In each payout cycle your best day may be at most ${p(po.consistency!.bestDayMaxBps, l)} of the cycle's net profit. If it is higher, the payout waits until more trading brings the share down. It is not a breach.`
          : `Her payout döngüsünde en iyi gününüz döngü net kârının en fazla ${p(po.consistency!.bestDayMaxBps, l)}'i olabilir. Daha yüksekse, işlemlerle oran düşene kadar payout bekler. İhlal değildir.`,
      ),
      ["consistency", "best", "day", "payout", "en iyi", "gün"],
    );
  add(
    "scaling",
    "payout",
    both((l) => (l === "en" ? `Scaling plan — ${n(l)}` : `Scaling planı — ${n(l)}`)),
    both((l) =>
      l === "en"
        ? `Every ${rs.scaling.reviewEveryMonths} months: if the period shows at least ${p(rs.scaling.minNetProfitBps, l)} net profit, ${rs.scaling.minPaidPayouts} paid payouts and no soft violations, nominal size grows by ${p(rs.scaling.increaseBps, l)} and the split becomes ${p(po.scaledProfitSplitBps, l)}. Combined nominal is capped at ${m(rs.scaling.maxCombinedNominal, l)} per trader.`
        : `Her ${rs.scaling.reviewEveryMonths} ayda bir: dönemde en az ${p(rs.scaling.minNetProfitBps, l)} net kâr, ${rs.scaling.minPaidPayouts} ödenmiş payout ve hiç yumuşak ihlal yoksa nominal büyüklük ${p(rs.scaling.increaseBps, l)} artar ve paylaşım ${p(po.scaledProfitSplitBps, l)} olur. Trader başına toplam nominal üst sınır ${m(rs.scaling.maxCombinedNominal, l)}'dir.`,
    ),
    ["scaling", "scale", "büyüme", "artış", "increase", "grow", "ölçek"],
  );
  return out;
}

function helpArticles(programs: Program[], ruleSets: RuleSet[]): KnowledgeArticle[] {
  const add = (topic: Topic, title: L10n, body: L10n, keywords: string[], category: KnowledgeArticle["category"] = "help"): KnowledgeArticle => ({
    id: `help/${topic}`,
    anchor: `help-${topic.replace(/_/g, "-")}`,
    href: `/help#help-${topic.replace(/_/g, "-")}`,
    category,
    topic,
    title,
    body,
    keywords,
    updatedAt: "2026-10-15",
  });
  const current = (pid: ProgramId) => ruleSets.find((r) => r.id === programs.find((x) => x.id === pid)!.currentRuleSetId)!;
  const review = current("ascent").payout.reviewTargetBusinessDays;
  const processing = current("ascent").payout.processingTargetBusinessDays;
  const priceLine = (loc: "en" | "tr") =>
    programs
      .map((pr) => `${pr.name[loc]}: ${pr.sizes.map((s) => `${formatSize(s.size)} ${m(s.price, loc)}`).join(" · ")}`)
      .join(loc === "en" ? ". " : ". ");
  return [
    add(
      "activation",
      { en: "I passed — when is my funded account opened?", tr: "Geçtim — funded hesabım ne zaman açılır?" },
      {
        en: `After the final evaluation stage meets every objective (and positions are closed) it goes to review. The target review time is 1–2 business days; it is a target, not a guarantee. After approval you receive the Challenge Passed certificate, complete identity verification (KYC) and sign the trader agreement (${CONTRACT_VERSION}). The funded account is activated immediately after signing. In a two-step programme, passing Phase 1 opens Phase 2, not a funded account.`,
        tr: `Son değerlendirme aşaması tüm hedefleri sağladığında (ve pozisyonlar kapatıldığında) incelemeye alınır. Hedef inceleme süresi 1–2 iş günüdür. Bu bir hedeftir, garanti değildir. Onaydan sonra Challenge Passed sertifikasını alır, kimlik doğrulamasını (KYC) tamamlar ve trader sözleşmesini (${CONTRACT_VERSION}) imzalarsınız. Funded hesap imzadan hemen sonra aktive edilir. İki aşamalı programda Aşama 1'i geçmek funded hesap değil, Aşama 2'yi açar.`,
      },
      ["passed", "geçtim", "funded", "account", "hesap", "açılır", "open", "activation", "aktivasyon", "review", "inceleme", "when", "ne zaman", "onay"],
    ),
    add(
      "kyc",
      { en: "Identity verification (KYC)", tr: "Kimlik doğrulama (KYC)" },
      {
        en: "KYC is required before the trader agreement and before any payout. In this prototype KYC is a demo form; no documents are uploaded or checked, and an operations user approves it in the demo admin panel.",
        tr: "KYC, trader sözleşmesinden ve her payout'tan önce zorunludur. Bu prototipte KYC bir demo formdur. Belge yüklenmez veya kontrol edilmez, demo yönetim panelindeki operasyon kullanıcısı onaylar.",
      },
      ["kyc", "identity", "kimlik", "verification", "doğrulama", "document", "belge", "passport", "pasaport"],
    ),
    add(
      "payout_process",
      { en: "Payout statuses and timing", tr: "Payout durumları ve süreleri" },
      {
        en: `Requested → Under review → Approved → Processing → Paid. A request can also end as Rejected (always with a reason) or Cancelled (by you, while Requested). Target times: review ${review} business days, processing ${processing} business days after approval. Requests are never paid automatically. In this prototype no money is moved.`,
        tr: `Requested → Under review → Approved → Processing → Paid. Talep ayrıca Rejected (her zaman gerekçeli) veya Cancelled (siz, Requested durumundayken) olarak sonlanabilir. Hedef süreler: inceleme ${review} iş günü, onaydan sonra işleme ${processing} iş günü. Talepler asla otomatik ödenmez. Bu prototipte para transferi yapılmaz.`,
      },
      ["payout", "status", "durum", "review", "inceleme", "paid", "processing", "rejected", "ret", "how long", "ne kadar sürer"],
      "payout",
    ),
    add(
      "simulated_capital",
      { en: "Simulated capital, fee and reward", tr: "Simüle sermaye, ücret ve ödül" },
      {
        en: "The account size (for example 100K) is a simulated, nominal balance used for evaluation. It is not money you own and it cannot be withdrawn. The evaluation fee is what you pay for the evaluation service. A performance reward is the share of simulated profit paid to you in the funded stage after a payout is approved.",
        tr: "Hesap büyüklüğü (ör. 100K) değerlendirme için kullanılan simüle, nominal bir bakiyedir. Size ait bir para değildir ve çekilemez. Değerlendirme ücreti, değerlendirme hizmeti için ödediğiniz bedeldir. Performans ödülü, funded aşamada payout onaylandıktan sonra simüle kârdan size ödenen paydır.",
      },
      ["simulated", "simüle", "capital", "sermaye", "real", "gerçek", "withdraw", "çek", "nominal", "money", "para"],
    ),
    add(
      "pricing",
      { en: "Prices", tr: "Fiyatlar" },
      {
        en: `One-time evaluation fees (USD). ${priceLine("en")}. Promotions only apply through an explicit code shown at checkout with its end date.`,
        tr: `Tek seferlik değerlendirme ücretleri (USD). ${priceLine("tr")}. Kampanyalar yalnızca checkout'ta bitiş tarihiyle gösterilen açık bir kodla uygulanır.`,
      },
      ["price", "fiyat", "cost", "ücret", "fee", "how much", "kaç", "para", "usd", "dolar", "promo", "kampanya", "indirim", "discount"],
    ),
    add(
      "platform",
      { en: "Trading platforms", tr: "İşlem platformları" },
      {
        en: "Planned integrations: MetaTrader 5 and cTrader. In this prototype the platform connection is simulated: login and server details are placeholders and no trades reach a real server.",
        tr: "Planlanan entegrasyonlar: MetaTrader 5 ve cTrader. Bu prototipte platform bağlantısı simüledir. Giriş ve sunucu bilgileri yer tutucudur ve hiçbir işlem gerçek bir sunucuya ulaşmaz.",
      },
      ["platform", "mt5", "metatrader", "ctrader", "login", "server", "sunucu", "terminal"],
    ),
    add(
      "regions",
      { en: "Where ALPAS is available", tr: "ALPAS'ın sunulduğu bölgeler" },
      {
        en: `ALPAS is not offered where sanctions or local law prohibit it. The prototype blocks an illustrative list (${RESTRICTED_COUNTRIES.join(", ")}); the final list is subject to legal review.`,
        tr: `Yaptırımların veya yerel mevzuatın yasakladığı yerlerde ALPAS sunulmaz. Prototip örnek bir listeyi (${RESTRICTED_COUNTRIES.join(", ")}) engeller. Nihai liste hukuk incelemesine bağlıdır.`,
      },
      ["country", "ülke", "region", "bölge", "available", "restricted", "kısıt", "usa", "abd", "turkey", "türkiye"],
    ),
    add(
      "certificates",
      { en: "Certificates and verification", tr: "Sertifikalar ve doğrulama" },
      {
        en: "Three certificates exist: Challenge Passed (after every evaluation stage and the review), Funded Trader (after KYC, contract and activation) and Payout (only when a payout is Paid). Each has a number, a verification code and a QR code that opens the public verification page. That page shows only the name, programme, amount, date and status. Certificates can be revoked; a revoked certificate shows as revoked.",
        tr: "Üç sertifika vardır: Challenge Passed (tüm değerlendirme aşamaları ve inceleme sonrası), Funded Trader (KYC, sözleşme ve aktivasyon sonrası) ve Payout (yalnızca payout Paid olduğunda). Her birinin numarası, doğrulama kodu ve açık doğrulama sayfasını açan bir QR kodu vardır. Bu sayfa yalnızca adı, programı, tutarı, tarihi ve durumu gösterir. Sertifikalar iptal edilebilir ve iptal edilen sertifika iptal edilmiş olarak görünür.",
      },
      ["certificate", "sertifika", "verify", "doğrula", "qr", "pdf", "download", "indir"],
    ),
    add(
      "demo",
      { en: "About this prototype", tr: "Bu prototip hakkında" },
      {
        en: "This is a product prototype. Purchases, payments, KYC, platform connections and payouts are simulated. Demo data is stored in your browser and can be reset from Demo tools.",
        tr: "Bu bir ürün prototipidir. Satın alma, ödeme, KYC, platform bağlantısı ve payout'lar simüledir. Demo verileri tarayıcınızda saklanır ve Demo araçlarından sıfırlanabilir.",
      },
      ["demo", "prototype", "prototip", "real", "gerçek", "test"],
    ),
  ];
}

export interface CustomArticleInput {
  id: string;
  title: L10n;
  body: L10n;
  keywords: string[];
  updatedAt: number;
  flagged: boolean;
}

export function buildKnowledgeBase(programs: Program[], ruleSets: RuleSet[], custom: CustomArticleInput[] = []): KnowledgeArticle[] {
  const out: KnowledgeArticle[] = [];
  for (const rs of ruleSets) {
    const program = programs.find((x) => x.id === rs.programId)!;
    for (const ph of rs.phases) out.push(...phaseArticles(rs, ph, program.name));
    out.push(...ruleSetArticles(rs, program));
  }
  out.push(...helpArticles(programs, ruleSets));
  for (const c of custom)
    out.push({
      id: c.id,
      anchor: c.id,
      href: `/help#${c.id}`,
      category: "faq",
      topic: "faq",
      title: c.title,
      body: c.body,
      keywords: c.keywords,
      updatedAt: new Date(c.updatedAt).toISOString().slice(0, 10),
      flagged: c.flagged,
    });
  return out;
}

/** Human-readable differences between two rule sets of the same programme. */
export function diffRuleSets(a: RuleSet, b: RuleSet): { key: string; from: number | string; to: number | string; phase?: PhaseKind }[] {
  const out: { key: string; from: number | string; to: number | string; phase?: PhaseKind }[] = [];
  a.phases.forEach((pa, i) => {
    const pb = b.phases[i];
    if (!pb) return;
    if (pa.minTradingDays !== pb.minTradingDays) out.push({ key: "minTradingDays", from: pa.minTradingDays, to: pb.minTradingDays, phase: pa.kind });
    if (pa.dailyLossBps !== pb.dailyLossBps) out.push({ key: "dailyLossBps", from: pa.dailyLossBps, to: pb.dailyLossBps, phase: pa.kind });
    if (pa.maxLoss.bps !== pb.maxLoss.bps) out.push({ key: "maxLossBps", from: pa.maxLoss.bps, to: pb.maxLoss.bps, phase: pa.kind });
    if (pa.profitTargetBps !== pb.profitTargetBps) out.push({ key: "profitTargetBps", from: pa.profitTargetBps ?? "-", to: pb.profitTargetBps ?? "-", phase: pa.kind });
  });
  if (a.payout.firstPayoutAfterDays !== b.payout.firstPayoutAfterDays) out.push({ key: "firstPayoutAfterDays", from: a.payout.firstPayoutAfterDays, to: b.payout.firstPayoutAfterDays });
  if (a.payout.profitSplitBps !== b.payout.profitSplitBps) out.push({ key: "profitSplitBps", from: a.payout.profitSplitBps, to: b.payout.profitSplitBps });
  return out;
}
