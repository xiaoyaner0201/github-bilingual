const { test } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const core = require("../src/core.js");

function page(bodyHtml) {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${bodyHtml}</body></html>`);
  return dom.window.document;
}

function store(v) {
  const m = new Map(v ? [[core.PREF_KEY, v]] : []);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, x) => m.set(k, x) };
}

function env(doc, languages, pref) {
  return { document: doc, languages, storage: store(pref) };
}

const EN_FIRST = `
<div class="markdown-body" id="b">
  <h2>Summary</h2><p>English text</p>
  <details><summary>中文说明</summary><h2>概述</h2><p>中文正文</p></details>
</div>`;

const ZH_FIRST = `
<div class="markdown-body" id="b">
  <p>中文正文</p>
  <details><summary>English</summary><p>English text</p></details>
</div>`;

const visible = (el) => !el.classList.contains("ghb-hidden");

test("zh reader sees the Chinese fold of an English-first body", () => {
  const doc = page(EN_FIRST);
  assert.equal(core.processAll(doc, env(doc, ["zh-CN", "en"])), 1);
  const b = doc.getElementById("b");
  const [bar, h2, p, details] = b.children;
  assert.ok(bar.classList.contains("ghb-bar"));
  assert.ok(!visible(h2) && !visible(p));
  assert.equal(details.open, true);
  assert.ok(!visible(details.querySelector("summary")));
  assert.match(bar.textContent, /中文版/);
});

test("en reader leaves an English-first body untouched", () => {
  const doc = page(EN_FIRST);
  const before = doc.getElementById("b").innerHTML;
  assert.equal(core.processAll(doc, env(doc, ["en-US"])), 0);
  assert.equal(doc.getElementById("b").innerHTML, before);
});

test("en reader sees the English fold of a Chinese-first body", () => {
  const doc = page(ZH_FIRST);
  assert.equal(core.processAll(doc, env(doc, ["en-GB", "zh"])), 1);
  const b = doc.getElementById("b");
  assert.ok(!visible(b.children[1]));
  assert.equal(b.querySelector("details").open, true);
  assert.match(b.firstElementChild.textContent, /English version/);
});

test("traditional Chinese browsers count as zh", () => {
  const doc = page(EN_FIRST);
  assert.equal(core.processAll(doc, env(doc, ["zh-TW"])), 1);
});

test("toggle restores the original and back", () => {
  const doc = page(EN_FIRST);
  core.processAll(doc, env(doc, ["zh"]));
  const b = doc.getElementById("b");
  const btn = b.querySelector(".ghb-toggle");
  btn.click();
  assert.ok(visible(b.querySelector("h2")));
  assert.equal(b.querySelector("details").open, false);
  assert.ok(visible(b.querySelector("summary")));
  assert.match(btn.textContent, /中文/);
  btn.click();
  assert.ok(!visible(b.querySelector("h2")));
});

test("ordinary details blocks are never touched", () => {
  const doc = page(`
  <div class="markdown-body" id="b"><p>x</p>
    <details><summary>Logs</summary>log</details>
    <details><summary>中文说明图</summary>img</details>
    <details><summary> Chinese </summary>c</details>
  </div>`);
  const before = doc.getElementById("b").innerHTML;
  assert.equal(core.processAll(doc, env(doc, ["zh"])), 0);
  assert.equal(doc.getElementById("b").innerHTML, before);
});

test("nested marker inside another element is not a fold", () => {
  const doc = page(`
  <div class="markdown-body" id="b"><p>x</p>
    <table><tr><td><details><summary>中文说明</summary>c</details></td></tr></table>
  </div>`);
  assert.equal(core.processAll(doc, env(doc, ["zh"])), 0);
});

test("explicit preference overrides the browser language", () => {
  const doc = page(EN_FIRST);
  assert.equal(core.processAll(doc, env(doc, ["zh-CN"], "en")), 0);
  const doc2 = page(EN_FIRST);
  assert.equal(core.processAll(doc2, env(doc2, ["en-US"], "zh")), 1);
});

test("unsupported reader language changes nothing", () => {
  const doc = page(EN_FIRST);
  assert.equal(core.processAll(doc, env(doc, ["ja-JP", "fr"])), 0);
});

test("each comment body is decided on its own and processed once", () => {
  const doc = page(EN_FIRST.replace('id="b"', 'id="b1"') + ZH_FIRST.replace('id="b"', 'id="b2"') +
    `<div class="markdown-body" id="b3"><p>plain</p></div>`);
  const e = env(doc, ["zh-CN"]);
  assert.equal(core.processAll(doc, e), 1);
  assert.equal(core.processAll(doc, e), 0);
  assert.equal(doc.querySelectorAll(".ghb-bar").length, 1);
  assert.equal(doc.getElementById("b2").querySelectorAll(".ghb-hidden").length, 0);
});

test("whitespace around the label is tolerated", () => {
  const doc = page(`<div class="markdown-body"><p>x</p><details><summary>
    中文说明
  </summary>y</details></div>`);
  assert.equal(core.processAll(doc, env(doc, ["zh"])), 1);
});

test("start() handles bodies added later (SPA navigation)", async () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body></body></html>`);
  const doc = dom.window.document;
  core.start({ document: doc, languages: ["zh"], storage: store(), MutationObserver: dom.window.MutationObserver,
    schedule: (fn) => setTimeout(fn, 0) });
  assert.ok(doc.getElementById("ghb-style"));
  doc.body.insertAdjacentHTML("beforeend", EN_FIRST);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(doc.querySelectorAll(".ghb-bar").length, 1);
});

test("marker fold followed by another fold is not switched", () => {
  const doc = page(`<div class="markdown-body" id="b"><p>x</p>
    <details><summary>中文说明</summary>c</details>
    <details><summary>Logs</summary>l</details></div>`);
  assert.equal(core.processAll(doc, env(doc, ["zh"])), 0);
  assert.equal(doc.querySelectorAll(".ghb-hidden").length, 0);
});

test("editor preview is never rewritten", () => {
  const doc = page(`<form><div class="js-preview-body"><div class="markdown-body"><p>x</p>
    <details><summary>中文说明</summary>c</details></div></div></form>`);
  assert.equal(core.processAll(doc, env(doc, ["zh"])), 0);
  const doc2 = page(`<div class="MarkdownEditor-module__preview"><div class="markdown-body"><p>x</p>
    <details><summary>中文说明</summary>c</details></div></div>`);
  assert.equal(core.processAll(doc2, env(doc2, ["zh"])), 0);
});

test("a body re-rendered with new content is processed again", () => {
  const doc = page(EN_FIRST);
  const e = env(doc, ["zh"]);
  core.processAll(doc, e);
  const b = doc.getElementById("b");
  b.innerHTML = `<p>edited english</p><p>more</p><details><summary>中文说明</summary><p>新中文</p></details>`;
  assert.equal(core.processAll(doc, e), 1);
  assert.equal(b.querySelectorAll(".ghb-bar").length, 1);
  assert.ok(b.querySelector("p").classList.contains("ghb-hidden"));
});

test("a body that did not switch is re-checked after its content changes", () => {
  const doc = page(`<div class="markdown-body" id="b"><p>plain</p></div>`);
  const e = env(doc, ["zh"]);
  assert.equal(core.processAll(doc, e), 0);
  doc.getElementById("b").insertAdjacentHTML("beforeend", `<details><summary>中文说明</summary>c</details>`);
  assert.equal(core.processAll(doc, e), 1);
});

test("observer ignores unrelated DOM churn and its own bar", async () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${EN_FIRST}<div id="other"></div></body></html>`);
  const doc = dom.window.document;
  let runs = 0;
  const realQSA = doc.querySelectorAll.bind(doc);
  doc.querySelectorAll = (sel) => { if (sel === ".markdown-body") runs++; return realQSA(sel); };
  core.start({ document: doc, languages: ["zh"], storage: store(), MutationObserver: dom.window.MutationObserver,
    schedule: (fn) => setTimeout(fn, 0) });
  assert.equal(runs, 1);
  for (let i = 0; i < 50; i++) doc.getElementById("other").appendChild(doc.createElement("span"));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(runs, 1);
  assert.equal(doc.querySelectorAll(".ghb-bar").length, 1);
});

test("large page: 300 bodies processed once, quickly", () => {
  const html = Array.from({ length: 300 }, (_, i) => EN_FIRST.replace('id="b"', `id="b${i}"`)).join("");
  const doc = page(html);
  const t = Date.now();
  assert.equal(core.processAll(doc, env(doc, ["zh"])), 300);
  assert.equal(core.processAll(doc, env(doc, ["zh"])), 0);
  assert.ok(Date.now() - t < 2000);
});

test("same-length, same-structure content change is reprocessed", () => {
  const doc = page(`<div class="markdown-body" id="b"><p>aaaa</p></div>`);
  const e = env(doc, ["zh"]);
  assert.equal(core.processAll(doc, e), 0);
  const b = doc.getElementById("b");
  b.innerHTML = `<p>bbbb</p>`;
  assert.equal(core.processAll(doc, e), 0);
  b.innerHTML = `<p>x</p><details><summary>中文说明</summary>c</details>`;
  assert.equal(core.processAll(doc, e), 1);
  b.innerHTML = `<p>y</p><details><summary>中文说明</summary>d</details>`;
  assert.equal(core.processAll(doc, e), 1);
  assert.equal(b.querySelectorAll(".ghb-bar").length, 1);
});

test("toggling the bar does not trigger reprocessing", () => {
  const doc = page(EN_FIRST);
  const e = env(doc, ["zh"]);
  core.processAll(doc, e);
  doc.querySelector(".ghb-toggle").click();
  assert.equal(core.processAll(doc, e), 0);
  assert.ok(!doc.querySelector("h2").classList.contains("ghb-hidden"));
});
