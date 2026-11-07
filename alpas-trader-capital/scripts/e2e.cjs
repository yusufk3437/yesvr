/* End-to-end walkthrough of the full ALPAS demo flow in a real browser.
 *
 *   BASE_URL=http://localhost:3000 npm run e2e
 *
 * Uses Playwright (falls back to a globally installed copy). All actions go
 * through the UI; demo state is read from localStorage only to assert results.
 */
const fs = require("node:fs");
const path = require("node:path");
let playwright;
try {
  playwright = require("playwright");
} catch {
  playwright = require("/opt/node-tools/node_modules/playwright");
}

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = process.env.E2E_OUT || path.join(__dirname, "..", "artifacts", "e2e");
fs.mkdirSync(OUT, { recursive: true });
const KEY = "alpas.demo.v5";
let step = 0;
const results = [];

function check(cond, label) {
  results.push({ ok: !!cond, label });
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) throw new Error(`Check failed: ${label}`);
}

(async () => {
  const browser = await playwright.chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 200)));
  const state = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
  const shot = (name) => page.screenshot({ path: path.join(OUT, `${String(++step).padStart(2, "0")}-${name}.png`), fullPage: false });
  const go = async (p) => {
    await page.goto(BASE + p, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
  };
  const toOps = async () => {
    await go("/admin");
    const enter = page.getByRole("button", { name: "Enter operations view (demo)" });
    if (await enter.isVisible().catch(() => false)) await enter.click();
    await page.getByRole("tab", { name: /Overview/ }).waitFor();
  };
  const toTrader = async () => {
    await page.getByRole("button", { name: "Back to trader view" }).click();
    await page.waitForURL(/\/dashboard/);
  };

  try {
    // 0. "What is your budget?" custom-size planner (no purchase).
    await go("/challenges#budget");
    await page.getByLabel("Simulated account size (USD)").fill("35000");
    await page.getByText("$241").first().waitFor();
    check(true, "budget planner: custom Ascent 35K priced at $241 (curve + 8%)");
    await page.getByLabel("Simulated account size (USD)").fill("95000");
    await page.getByRole("button", { name: /Choose standard 100K instead/ }).waitFor();
    check(true, "budget planner suggests the cheaper standard 100K for a 95K request");

    // 1. Package selection on the challenges page.
    await go("/challenges");
    await page.getByRole("radio", { name: /10K/ }).first().click();
    await page.getByRole("button", { name: /Continue with Ascent 10K/ }).click();
    await page.waitForURL(/\/checkout/);
    await page.getByRole("heading", { name: "Confirm your challenge" }).waitFor();
    await shot("checkout-select");
    let s = await state();
    check(s.cart && s.cart.programId === "ascent" && s.cart.size === 1000000, "selection stored in cart (Ascent 10K)");

    // 2. Account step requires sign-in; register keeps the cart.
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("link", { name: "Create account" }).first().click();
    await page.waitForURL(/\/register/);
    await page.getByText(/Your selection is kept/).waitFor();
    await page.getByLabel("Full name").fill("E2E Trader");
    await page.getByLabel("E-mail").fill(`e2e.${Date.now()}@example.com`);
    await page.getByLabel("Password").fill("e2e-password");
    await page.locator("#r-accept").check();
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/checkout/);
    s = await state();
    check(s.cart && s.cart.size === 1000000, "cart survived registration");

    // 3. Checkout steps → demo purchase.
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByText(/Signed in as/).waitFor();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("heading", { name: "Billing details" }).waitFor();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("heading", { name: "Review and confirm" }).waitFor();
    await page.locator("#acc-terms").check();
    await page.locator("#acc-risk").check();
    await shot("checkout-review");
    await page.getByRole("button", { name: /Confirm demo purchase/ }).click();
    await page.getByRole("heading", { name: "Your challenge is ready" }).waitFor();
    await shot("checkout-success");
    s = await state();
    const me = s.users.find((u) => u.id === s.session.userId);
    const ch = s.challenges.find((c) => c.userId === me.id);
    const p1 = ch.accountIds[0];
    check(ch.ruleSnapshot.version === "1.1" && s.orders[0].total === 8900, `order created, rule snapshot v1.1 locked, total $89 (${p1})`);

    // 4. Phase 1 via demo tools → Phase 2 account, no funded account.
    await go(`/dashboard/demo?account=${p1}`);
    await page.getByRole("button", { name: /Complete objectives/ }).click();
    await page.waitForTimeout(500);
    s = await state();
    let c = s.challenges.find((x) => x.id === ch.id);
    const acc1 = s.accounts.find((a) => a.id === p1);
    check(acc1.status === "passed", "phase 1 passed after simulated trading days");
    check(c.accountIds.length === 2 && s.accounts.find((a) => a.id === c.accountIds[1]).kind === "phase2" && !c.fundedAccountId, "phase 1 opened Phase 2 — no funded account created");
    const p2 = c.accountIds[1];
    await go(`/dashboard?account=${p1}`);
    await shot("phase1-passed");

    // 5. Phase 2 → under review.
    await go(`/dashboard/demo?account=${p2}`);
    await page.getByRole("button", { name: /Complete objectives/ }).click();
    await page.waitForTimeout(500);
    s = await state();
    check(s.accounts.find((a) => a.id === p2).status === "under_review", "phase 2 objectives met → under review");
    check(!s.certificates.some((x) => x.challengeId === ch.id), "no certificate before review approval");

    // 6. Operations approves the review (engine-verified).
    await toOps();
    await page.getByRole("tab", { name: /Challenge reviews/ }).click();
    const reviewCard = page.locator("section", { hasText: p2 }).first();
    await reviewCard.getByRole("button", { name: "Approve challenge" }).click();
    await page.waitForTimeout(300);
    await shot("ops-review-approved");
    s = await state();
    c = s.challenges.find((x) => x.id === ch.id);
    check(c.status === "passed" && s.certificates.some((x) => x.challengeId === ch.id && x.type === "challenge_passed"), "review approved → Challenge Passed certificate issued");
    await toTrader();

    // 7. KYC (demo) → ops verifies → trader signs agreement → funded account.
    await go("/dashboard/verification");
    await page.getByLabel("Legal name").fill("E2E Trader");
    await page.getByLabel("Date of birth").fill("1990-01-01");
    await page.locator("#k-confirm").check();
    await page.getByRole("button", { name: "Submit for verification" }).click();
    await page.waitForTimeout(300);
    await toOps();
    await page.getByRole("tab", { name: /KYC/ }).click();
    await page.getByRole("button", { name: "Verify" }).first().click();
    await page.waitForTimeout(300);
    await toTrader();
    await go("/dashboard/verification");
    await page.locator(`#sign-${ch.id}`).fill("E2E Trader");
    await page.locator(`#acc-${ch.id}`).check();
    await shot("contract");
    await page.getByRole("button", { name: /Sign and activate funded account/ }).click();
    await page.waitForTimeout(400);
    s = await state();
    c = s.challenges.find((x) => x.id === ch.id);
    check(c.status === "funded" && c.fundedAccountId, `contract signed → funded account ${c.fundedAccountId} active`);
    check(s.certificates.some((x) => x.sourceId === c.fundedAccountId && x.type === "funded_trader"), "Funded Trader certificate issued on activation");
    const funded = c.fundedAccountId;

    // 8. Funded trading, clock, payout eligibility.
    await go(`/dashboard/demo?account=${funded}`);
    for (let i = 0; i < 5; i++) {
      await page.getByRole("button", { name: "Profitable session" }).click();
      await page.waitForTimeout(150);
      await page.getByRole("button", { name: "+1 day" }).click();
      await page.waitForTimeout(150);
    }
    await page.getByRole("button", { name: "+14 days" }).click();
    await page.waitForTimeout(300);
    await go(`/dashboard/payouts?account=${funded}`);
    await page.getByText("Eligible now").first().waitFor();
    await page.getByRole("button", { name: "Max" }).click();
    await shot("payout-request");
    await page.getByRole("button", { name: "Submit request" }).click();
    await page.waitForTimeout(300);
    s = await state();
    const po = s.payouts.find((x) => x.accountId === funded);
    check(po && po.status === "requested", `payout ${po && po.id} requested (not auto-paid)`);
    check(s.ledger.some((l) => l.payoutId === po.id && l.type === "payout_reserve"), "gross amount reserved from balance");
    check(po.feeRefund === 8900, "fee refund ($89) added to first payout");

    // 9. Operations moves the payout to Paid.
    await toOps();
    await page.getByRole("tab", { name: /Payouts/ }).click();
    for (const st of ["Under review", "Approved", "Processing", "Paid"]) {
      await page.locator("section", { hasText: po.id }).first().getByRole("button", { name: `Move to: ${st}` }).click();
      await page.waitForTimeout(250);
    }
    s = await state();
    const paid = s.payouts.find((x) => x.id === po.id);
    check(paid.status === "paid" && paid.timeline.length === 5, "payout passed Under review → Approved → Processing → Paid");
    const poCert = s.certificates.find((x) => x.sourceId === po.id && x.type === "payout");
    check(!!poCert, "Payout certificate issued only after Paid");
    await toTrader();

    // 10. Certificates page + PDF download.
    await go("/dashboard/certificates");
    const cards = await page.locator("article").count();
    check(cards >= 3, `three certificates listed for the new trader (${cards})`);
    await shot("certificates");
    const [download] = await Promise.all([page.waitForEvent("download"), page.locator("article", { hasText: poCert.id }).getByRole("button", { name: /Download PDF/ }).click()]);
    const pdfPath = path.join(OUT, `${poCert.id}.pdf`);
    await download.saveAs(pdfPath);
    const head = fs.readFileSync(pdfPath).subarray(0, 5).toString();
    check(head === "%PDF-" && fs.statSync(pdfPath).size > 20000, `payout certificate PDF downloaded (${fs.statSync(pdfPath).size} bytes)`);

    // 11. QR target: public verification page.
    await go(`/verify/${poCert.id}?c=${poCert.verificationCode}`);
    await page.getByText("Valid certificate").waitFor();
    const body = await page.locator("main").innerText();
    check(!body.includes("@") && !body.includes(funded), "verification page shows no e-mail or full account number");
    await shot("verify-valid");
    await go(`/verify/ATC-CP-26-999999`);
    await page.getByText("Certificate not found").waitFor();
    check(true, "unknown certificate → not found");

    // 12. Assistant: sourced answer and authorization boundary.
    await go("/dashboard/assistant");
    await page.getByLabel("Ask a question…").fill("When is my first payout?");
    await page.getByLabel("Ask a question…").press("Enter");
    await page.getByText("Sources").first().waitFor();
    await page.getByLabel("Ask a question…").fill("What is the balance of ATC-310882?");
    await page.getByLabel("Ask a question…").press("Enter");
    await page.getByText(/I can only use data from accounts on your own profile/).waitFor();
    check(true, "Assistant cites sources and refuses another trader's account");
    await page.getByText("Demo: rule-based answers").first().waitFor();
    check(true, "Assistant labelled as rule-based demo (no LLM key)");
    await shot("assistant");

    // 13. Language switch.
    await page.getByRole("button", { name: "Türkçe" }).first().click();
    await page.getByRole("link", { name: "Genel bakış" }).waitFor();
    check(true, "language switch to Turkish updates navigation");
    await shot("turkish");
  } catch (e) {
    console.error(e.message);
    await shot("failure").catch(() => {});
  }
  const failed = results.filter((r) => !r.ok).length;
  const relevantErrors = consoleErrors.filter((e) => !/Download the React DevTools|favicon/.test(e));
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  if (relevantErrors.length) console.log(`Console errors (${relevantErrors.length}):\n` + [...new Set(relevantErrors)].slice(0, 8).join("\n"));
  await browser.close();
  process.exit(failed || results.length < 24 ? 1 : 0);
})();
