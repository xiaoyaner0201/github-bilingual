// Builds extension/core.js (copy) and userscript/github-bilingual.user.js from src/core.js.
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
copyFileSync("src/core.js", "extension/core.js");
const manifest = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
manifest.version = pkg.version;
writeFileSync("extension/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
const core = readFileSync("src/core.js", "utf8");
const header = `// ==UserScript==
// @name         GitHub Bilingual
// @name:zh-CN   GitHub 中英双语自动切换
// @namespace    https://github.com/xiaoyaner0201/github-bilingual
// @version      ${pkg.version}
// @description  Show the half of a bilingual issue/PR body that matches your language.
// @description:zh-CN  中英双语的 Issue/PR 正文，按你的语言自动显示对应版本。
// @author       xiaoyaner0201
// @license      MIT
// @match        https://github.com/*
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @homepageURL  https://github.com/xiaoyaner0201/github-bilingual
// @downloadURL  https://raw.githubusercontent.com/xiaoyaner0201/github-bilingual/main/userscript/github-bilingual.user.js
// @updateURL    https://raw.githubusercontent.com/xiaoyaner0201/github-bilingual/main/userscript/github-bilingual.user.js
// ==/UserScript==
// Generated from src/core.js by scripts/build.mjs. Do not edit by hand.
`;
const boot = `
;(function () {
  "use strict";
  var G = window.GithubBilingual;
  var KEY = G.PREF_KEY;
  if (typeof GM_registerMenuCommand === "function") {
    [["auto", "Follow browser language / 跟随浏览器"], ["zh", "Always 中文"], ["en", "Always English"]].forEach(function (o) {
      GM_registerMenuCommand(o[1], function () { localStorage.setItem(KEY, o[0]); location.reload(); });
    });
  }
  G.start({ document: document, languages: navigator.languages || [navigator.language],
    storage: window.localStorage, MutationObserver: window.MutationObserver });
})();
`;
writeFileSync("userscript/github-bilingual.user.js", header + core + boot);
console.log("built", pkg.version);
