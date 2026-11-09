// Loads the unpacked MV3 extension in Chromium and checks a real GitHub PR page.
import { chromium } from "playwright-core";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const ext = resolve("extension");
const exe = process.env.CHROMIUM_PATH;
// Usage: node tests/e2e-extension.mjs [url] [zh|en]  (second arg = language the fold is in)
const url = process.argv[2] || "https://github.com/cheaper-inference/OmniRoute/pull/17307";
const foldLang = process.argv[3] || "zh";
async function run(locale) {
  const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "ghb-")), {
    executablePath: exe, headless: true, locale,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, `--lang=${locale}`, "--headless=new"],
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".markdown-body", { timeout: 30000 });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => ({
    langs: navigator.languages,
    bars: [...document.querySelectorAll(".ghb-bar")].map((b) => b.textContent.trim()),
    hidden: document.querySelectorAll(".ghb-hidden").length,
  }));
  await ctx.close();
  return r;
}
const zh = await run("zh-CN");
const en = await run("en-US");
console.log(JSON.stringify({ zh, en }));
const [hit, miss] = foldLang === "zh" ? [zh, en] : [en, zh];
if (!(hit.bars.length >= 1 && hit.hidden > 0 && miss.bars.length === 0 && miss.hidden === 0)) process.exit(1);
console.log("E2E OK");
