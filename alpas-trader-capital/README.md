# ALPAS Trader Capital — product prototype

Original website and trader dashboard for the **ALPAS Trader Capital** prop-trading evaluation brand. Package selection, demo checkout, challenge tracking, the move to a funded account, payouts, the rules center, a source-citing Q&A assistant and downloadable certificates all run on **the same rule engine and the same dataset**.

> **This is a prototype.** Purchases, payments, KYC, the platform connection and payouts are simulated. No real money moves. All account sizes are simulated, nominal balances.

English is the default language; the full Turkish option is switched with the EN/TR button in the header (`?lang=tr` links also work).

---

## Quick start

```bash
cd alpas-trader-capital
npm install
npm run dev          # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build && npm start` | Production build and server |
| `npm test` | Vitest: rule engine, payout, lifecycle, pricing, certificates, Assistant (64 tests) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (Next + React Compiler rules) |
| `npm run e2e` | Full flow in a real browser with Playwright (`BASE_URL=http://localhost:3000`). Run `npx playwright install chromium` once if needed. |

Requirements: Node.js ≥ 20.9. No `.env` is required. To use a real LLM, see [`.env.example`](./.env.example).

## Demo sign-in and scenarios

On the `/login` page you can sign in with one click as either demo trader (password: `demo-trader`):

| Trader | E-mail | Purpose |
|---|---|---|
| Defne Yıldırım | `defne.yildirim@example.com` | All six scenarios |
| Jonah Reyes | `jonah.reyes@example.com` | Second trader, for testing cross-account access |

| Scenario | Account | State |
|---|---|---|
| New account | `ATC-104210` | Ascent 25K, Phase 1, not yet traded |
| Challenge in progress | `ATC-104377` | Ascent 100K, Phase 1, +4.3%, 6 trading days |
| Close to the loss limit | `ATC-207514` | Ridge 50K; open XAUUSD position, ≈ $215 left of the daily limit |
| Passed, under review | `ATC-104455` | Ascent 50K Phase 2 objectives met (Phase 1 `ATC-104120` passed) |
| Funded + payout eligible | `ATC-500318` | Ascent 100K **rules v1.0** (first payout after 21 days); one paid payout, eligible again |
| Closed by a rule breach | `ATC-207301` | Ridge 25K, daily loss limit breach |

**Demo tools** (`/dashboard/demo`, also in the top banner): scenario switcher, profitable/losing/mixed session simulation, forced breach, open position / move market / close all, "Complete objectives (simulated days)", clock advance (+1h/+1d/+7d/+14d), switch to operations view, **reset demo data**.

### Full flow (also checked automatically by the `e2e` test)
1. `/challenges` → Ascent 10K → checkout (the selection is kept through sign-in) → demo purchase
2. Demo tools → Phase 1 objectives → **only a Phase 2 account opens**
3. Phase 2 objectives → under review
4. Operations view (`/admin`) → approve the review (blocked unless the engine verifies the objectives) → **Challenge Passed certificate**
5. Verification → demo KYC → operations approves → sign the trader agreement → **funded account + Funded Trader certificate**
6. Funded session + clock → payout eligibility → request (amount reserved)
7. Operations: Under review → Approved → Processing → Paid → **Payout certificate**
8. Certificates → PDF download, QR → `/verify/<no>` (valid / revoked / not found / code mismatch)

## Product decisions (draft)

Details: [`docs/product-decisions.md`](./docs/product-decisions.md) · Competitor research: [`docs/benchmark.md`](./docs/benchmark.md)

- Programme names carry no brand prefix: **Ascent** and **Ridge** (the brand is on the logo, site and certificates).
- **Ascent** (two-step): 8% → 5%, daily 5%, overall 10% **static**, 4 + 4 trading days. Fees $89–$899 (10K–200K).
- **Ridge** (one-step): 10%, daily 3%, overall 6% **end-of-day trailing (locks at the starting balance)**, best day ≤ 50%, per-trade risk ≤ 2%. Fees $109–$559 (10K–100K).
- No instant model (the reasoning is in the doc). No permanent discounts; campaigns use a code with an end date (`ASCENT10`).
- **"What is your budget?" custom sizes** (`/challenges#budget`): any size between the plans in $5,000 steps (Ascent 10K–200K, Ridge 10K–100K), or the largest plan that fits a fee budget. Price = standard price curve + 8% (e.g. Ascent 35K → $241), so the advantage stays slightly below the standard plans; promotion codes apply at 70% of their rate; a cheaper larger standard plan is suggested when one exists. Same rules and percentage limits as the standard plans.
- Daily reset **17:00 `America/New_York`**; reference = the higher of balance and equity; **equity ≤ floor = breach**; open P&L, commission and swap are included.
- Payout: 80% (90% with scaling), first payout 14 days after the first funded trade (v1.0: 21), then every 14 days; minimum 0.5% of size. The gross amount is reserved at request time and released on rejection or cancellation. The fee is refunded with the first payout that reaches Paid.
- The rule version is **copied into the challenge at purchase**; a new version does not change existing accounts.

## Architecture

```
src/
  domain/       Pure, framework-free business logic (tested)
    catalog.ts        Programmes, prices, versioned rule sets, promo codes (single source)
    risk.ts           Risk and objectives engine + trade statistics
    payout.ts         Eligibility, quotes, state machine
    certificates.ts   Issuance conditions, verification codes, public view
    knowledge.ts      Knowledge base generated from the rule sets (rules center + Assistant)
    assistant.ts      Rule-based, source-citing Assistant engine
    time.ts, money.ts Time zone / trading day, integer cents
  services/     Demo service layer: (state, actor, input, now) → result
    actions.ts        Every mutation, ownership/role checks, audit log
    seed.ts           Six deterministic scenarios (relative to "now")
    assistant-context.ts  Authorized context (only the signed-in user's accounts)
  server/       Server-only: LLM adapter (Anthropic SDK) + rewrite guard
  app/          Next.js App Router pages (site, dashboard, admin, api/assistant)
  components/   UI (design system, charts, certificate SVG, site, dashboard, admin)
  lib/          Store (localStorage), PDF renderer, topographic geometry, hooks
  i18n/         EN/TR dictionaries (tsc rejects missing keys)
```

- **One dataset:** dashboard metrics, charts, the calendar, objectives, payout eligibility and Assistant numbers are all computed from the same `trades` + `ledger` records. No independent random figures are used.
- **Money:** integer cents, banker's rounding; profit split shares always add up exactly.
- **Intraday equity:** the demo reconstructs it from each trade's MAE (maximum adverse excursion). In production the engine's `EquityPoint` input is fed from a platform equity stream.
- **Assistant:** without a key it is labelled "Demo: rule-based answers"; the answer is generated by deterministic retrieval plus the engine. When a key is present, `/api/assistant` only rewrites the wording. The rewrite is rejected if it contains a new number, account ID or source, and refusal answers are never sent to the LLM. Prompt-injection and action-request detection, cross-account refusal, and a "not found" answer instead of a guess are covered by tests.
- **Certificates:** a single layout spec renders both the SVG share preview and the A4-landscape PDF (pdf-lib, embedded subset fonts, vector QR). Sample PDFs: [`docs/samples/`](./docs/samples).
- **Next.js 16:** `cacheComponents` is intentionally off; user-specific views are rendered from the client store, and the language comes from a cookie.
- **Brand:** "stepped summit" seal logo — a seal ring with an A-shaped summit whose left face climbs in three steps (Phase 1 → Phase 2 → Funded) and a brass apex. One geometry (`src/lib/topo.ts` → `MONOGRAM`) drives the web mark, favicon and certificates. Serif wordmark and marketing headings (Newsreader), Archivo/IBM Plex for data.
- **Design:** deep navy, warm off-white and brass for an institutional, trustworthy feel; brass text on light backgrounds uses a darker tone (5.5:1 contrast). The "route to capital" language (topographic contours + waypoints) carries across the hero, stage diagrams, dashboard progress and certificates. The chart palette was checked with a colour-blindness validator. Reduced motion, keyboard use and focus styles are supported.

## Verification (at time of delivery)

- `npm test` → **64/64** (risk boundary values, equality = breach, DST reset, open position, trailing lock, reserve/release, phase transitions, snapshot immutability, custom-size pricing, certificate conditions, Assistant scenarios, LLM rewrite guard, PDF generation)
- `npm run typecheck`, `npm run lint` → clean
- `npm run build` → successful (34 routes)
- `npm run e2e` → **24/24** checks on the production server, with no console errors (includes the budget planner)
- 390 px, 768 px and 1440 px screenshots, EN and TR: no horizontal overflow
- PDFs rasterized with `pdftoppm` and inspected visually; QR codes decoded with `jsQR` and confirmed to point to the verification URL

## What is needed for real services

[`docs/integrations.md`](./docs/integrations.md): authentication, database, payments, KYC, e-signature, trading platform, economic calendar, payout rails, e-mail, server-side certificate registry, LLM, helpdesk, legal/licensing.

## Known limitations

- Demo data lives only in the browser; certificates issued in a different browser show as "not found" on the verification page (the seeded examples verify everywhere).
- Demo sign-in and the operations role switch are not real authorization.
- Competitor figures were compiled from search summaries of the official domains, because the session's network blocked direct access to the sites; they are marked "unverified" (see `docs/benchmark.md`).
- No dark theme. No automated accessibility audit (axe) was run; keyboard navigation and contrast were checked manually.
- The real LLM mode could not be called without a key in this environment; the adapter and validation guard are covered by unit tests.

## Moving to a separate repository

This project lives in the `alpas-trader-capital/` folder of the `yusufk3437/yesvr` repository (the original YES VR files were not touched). To move it with its history into its own private repository:

```bash
git subtree split --prefix=alpas-trader-capital -b alpas-only
# after creating an empty private repo named alpas-trader-capital:
git push git@github.com:<user>/alpas-trader-capital.git alpas-only:main
```
