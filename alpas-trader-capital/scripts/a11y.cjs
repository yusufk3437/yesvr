/* Accessibility audit with axe-core (WCAG 2.1 A/AA) on key pages, EN and TR.
 *   BASE_URL=http://localhost:3000 node scripts/a11y.cjs
 */
const fs = require("node:fs");
let playwright;
try {
  playwright = require("playwright");
} catch {
  playwright = require("/opt/node-tools/node_modules/playwright");
}
const BASE = process.env.BASE_URL || "http://localhost:3000";
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const PUBLIC = ["/", "/challenges", "/rules", "/payouts", "/help", "/contact", "/login", "/checkout", "/verify/ATC-CP-26-000041"];
const PRIVATE = ["/dashboard?account=ATC-207514", "/dashboard/trades", "/dashboard/payouts", "/dashboard/certificates", "/dashboard/verification", "/dashboard/demo"];

(async () => {
  const browser = await playwright.chromium.launch();
  let total = 0;
  for (const locale of ["en", "tr"]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addCookies([{ name: "alpas-locale", value: locale, url: BASE }]);
    const page = await ctx.newPage();
    const audit = async (p) => {
      await page.goto(BASE + p, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      await page.addScriptTag({ content: axeSource });
      const res = await page.evaluate(async () => {
        const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
        return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) , count: v.nodes.length }));
      });
      total += res.length;
      console.log(`${res.length ? "FAIL" : "PASS"}  [${locale}] ${p}${res.length ? "" : ""}`);
      for (const v of res) console.log(`   - ${v.id} (${v.impact}, ${v.count}x): ${v.help}\n     ${v.nodes.join(" | ")}`);
    };
    for (const p of PUBLIC) await audit(p);
    await page.goto(BASE + "/login", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Defne/ }).click();
    await page.waitForURL(/dashboard|checkout/);
    for (const p of PRIVATE) await audit(p);
    await ctx.close();
  }
  await browser.close();
  console.log(`\n${total} violation group(s)`);
  process.exit(total ? 1 : 0);
})();
