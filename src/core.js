/*
 * github-bilingual core
 *
 * Shows the half of a bilingual GitHub issue / PR / comment body that matches
 * the reader's language. A bilingual body is ordinary Markdown:
 *
 *     <main text in language A>
 *
 *     <details>
 *     <summary>中文说明</summary>      <- or "English"
 *
 *     <the same text in language B>
 *
 *     </details>
 *
 * The <summary> text is the marker. GitHub strips HTML comments and data
 * attributes, so the marker has to be visible text. Bodies without a marker
 * are never touched.
 */
(function (root) {
  "use strict";

  // Canonical fold labels -> language of the folded half.
  // Matching is exact after trimming, so ordinary <details> blocks
  // ("Logs", "Screenshots", bot summaries) never match.
  var MARKERS = {
    "中文说明": "zh",
    "English": "en"
  };
  var LANGS = ["zh", "en"];
  var LANG_NAMES = {
    zh: { zh: "中文", en: "Chinese" },
    en: { zh: "英文", en: "English" }
  };
  var PREF_KEY = "github-bilingual:lang"; // "auto" | "zh" | "en"
  var DONE = "ghbDone";
  var CLS_HIDDEN = "ghb-hidden";
  var CLS_BAR = "ghb-bar";

  function baseLang(tag) {
    var t = String(tag || "").toLowerCase();
    for (var i = 0; i < LANGS.length; i++) {
      if (t === LANGS[i] || t.indexOf(LANGS[i] + "-") === 0) return LANGS[i];
    }
    return null;
  }

  function readPref(storage) {
    try {
      var v = storage && storage.getItem(PREF_KEY);
      return v === "zh" || v === "en" ? v : "auto";
    } catch (e) {
      return "auto";
    }
  }

  // Reader language: explicit choice first, then the browser's ordered
  // language list. Returns null when no supported language is preferred.
  function preferredLang(languages, storage) {
    var p = readPref(storage);
    if (p !== "auto") return p;
    var list = languages || [];
    for (var i = 0; i < list.length; i++) {
      var b = baseLang(list[i]);
      if (b) return b;
    }
    return null;
  }

  function summaryOf(details) {
    for (var i = 0; i < details.children.length; i++) {
      var c = details.children[i];
      if (c.tagName === "SUMMARY") return c;
    }
    return null;
  }

  // The marker fold must be the last top-level <details> of the body, and
  // its summary must be exactly a canonical label. Folds after it, or a
  // marker nested elsewhere, disqualify the body.
  function findFold(body) {
    var kids = body.children;
    for (var i = kids.length - 1; i >= 0; i--) {
      var el = kids[i];
      if (el.tagName !== "DETAILS") continue;
      var s = summaryOf(el);
      var lang = s ? MARKERS[s.textContent.trim()] : null;
      return lang ? { el: el, lang: lang } : null;
    }
    return null;
  }

  // Authors editing a body see the GitHub preview; never rewrite drafts.
  var EDIT_SURFACES = [
    "form", "[role=tabpanel]", ".js-preview-body", ".js-previewable-comment-form",
    ".comment-form-textarea", "[class*=MarkdownEditor]", "[class*=markdown-editor]",
    "[data-testid*=preview]", "[class*=Preview]"
  ].join(",");

  function isEditSurface(body) {
    return !!(body.closest && body.closest(EDIT_SURFACES));
  }

  // Fingerprint of the body as GitHub rendered it, ignoring our own bar:
  // a 32-bit FNV-1a hash of each child's tag and text.
  function signature(body) {
    var h = 0x811c9dc5;
    function mix(str) {
      for (var k = 0; k < str.length; k++) {
        h ^= str.charCodeAt(k);
        h = Math.imul(h, 0x01000193);
      }
    }
    for (var i = 0; i < body.children.length; i++) {
      var c = body.children[i];
      if (c.classList && c.classList.contains(CLS_BAR)) continue;
      mix("<" + c.tagName + ">");
      mix(c.textContent);
    }
    return (h >>> 0).toString(36);
  }


  function otherLang(lang) {
    return lang === "zh" ? "en" : "zh";
  }

  function makeBar(doc, shown, hidden, uiLang, onToggle) {
    var bar = doc.createElement("div");
    bar.className = CLS_BAR;
    bar.setAttribute("role", "note");
    var msg = doc.createElement("span");
    var btn = doc.createElement("button");
    btn.type = "button";
    btn.className = "ghb-toggle";
    if (uiLang === "zh") {
      msg.textContent = "🌐 已按你的语言显示" + LANG_NAMES[shown].zh + "版";
      btn.textContent = "查看" + LANG_NAMES[hidden].zh + "原文";
    } else {
      msg.textContent = "🌐 Showing the " + LANG_NAMES[shown].en + " version for your language";
      btn.textContent = "Show " + LANG_NAMES[hidden].en + " original";
    }
    btn.addEventListener("click", onToggle);
    bar.appendChild(msg);
    bar.appendChild(doc.createTextNode(" "));
    bar.appendChild(btn);
    return bar;
  }

  // Swap one body to the fold language. Returns true when the body changed.
  function swapBody(body, fold, doc) {
    var mainNodes = [];
    for (var i = 0; i < body.children.length; i++) {
      var c = body.children[i];
      if (c !== fold.el && !(c.classList && c.classList.contains(CLS_BAR))) mainNodes.push(c);
    }
    if (!mainNodes.length) return false;
    var foldLang = fold.lang;
    var mainLang = otherLang(foldLang);
    var summary = summaryOf(fold.el);
    var wasOpen = fold.el.open;
    var swapped = false;

    function apply(toFold) {
      swapped = toFold;
      for (var j = 0; j < mainNodes.length; j++) {
        mainNodes[j].classList.toggle(CLS_HIDDEN, toFold);
      }
      fold.el.open = toFold ? true : wasOpen;
      if (summary) summary.classList.toggle(CLS_HIDDEN, toFold);
      fold.el.classList.toggle("ghb-unfolded", toFold);
    }

    var bar = makeBar(doc, foldLang, mainLang, foldLang, function () {
      apply(!swapped);
      var shown = swapped ? foldLang : mainLang;
      var hidden = otherLang(shown);
      var fresh = makeBar(doc, shown, hidden, foldLang, null);
      bar.firstChild.textContent = fresh.firstChild.textContent;
      bar.lastChild.textContent = fresh.lastChild.textContent;
    });
    body.insertBefore(bar, body.firstChild);
    apply(true);
    return true;
  }

  function resetBody(body) {
    var bars = body.querySelectorAll(":scope > ." + CLS_BAR);
    for (var i = 0; i < bars.length; i++) body.removeChild(bars[i]);
    var hidden = body.querySelectorAll("." + CLS_HIDDEN);
    for (var j = 0; j < hidden.length; j++) hidden[j].classList.remove(CLS_HIDDEN);
  }

  // Process every rendered Markdown body under `scope`. A body is processed
  // again only when GitHub re-renders it with different content.
  function processAll(scope, env) {
    var doc = env.document;
    var want = preferredLang(env.languages, env.storage);
    var changed = 0;
    if (!want) return 0;
    var bodies = scope.querySelectorAll(".markdown-body");
    if (scope.classList && scope.classList.contains("markdown-body")) bodies = [scope].concat([].slice.call(bodies));
    for (var i = 0; i < bodies.length; i++) {
      var body = bodies[i];
      var sig = signature(body);
      if (body.dataset[DONE] === sig) continue;
      if (body.dataset[DONE]) resetBody(body);
      body.dataset[DONE] = sig;
      if (isEditSurface(body)) continue;
      var fold = findFold(body);
      if (!fold) continue;
      if (fold.lang === want && swapBody(body, fold, doc)) {
        changed++;
        body.dataset[DONE] = signature(body);
      }
    }
    return changed;
  }

  var CSS =
    ".ghb-hidden{display:none !important}" +
    ".ghb-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;" +
    "margin:0 0 12px;padding:6px 10px;border-radius:6px;font-size:12px;" +
    "color:var(--fgColor-muted,#59636e);background:var(--bgColor-muted,#f6f8fa);" +
    "border:1px solid var(--borderColor-muted,#d1d9e0)}" +
    ".ghb-toggle{font:inherit;color:var(--fgColor-accent,#0969da);background:none;" +
    "border:0;padding:0;cursor:pointer;text-decoration:underline}" +
    "details.ghb-unfolded{margin-top:0}";

  function start(env) {
    var doc = env.document;
    if (!doc.getElementById("ghb-style")) {
      var st = doc.createElement("style");
      st.id = "ghb-style";
      st.textContent = CSS;
      (doc.head || doc.documentElement).appendChild(st);
    }
    var pending = false;
    function run() {
      pending = false;
      processAll(doc, env);
    }
    function relevant(records) {
      for (var i = 0; i < records.length; i++) {
        var r = records[i];
        var t = r.target;
        if (t.classList && t.classList.contains(CLS_BAR)) continue;
        for (var j = 0; j < r.addedNodes.length; j++) {
          var n = r.addedNodes[j];
          if (n.nodeType !== 1) continue;
          if (n.classList.contains(CLS_BAR)) continue;
          if (n.classList.contains("markdown-body") || n.querySelector(".markdown-body") ||
              (t.closest && t.closest(".markdown-body"))) return true;
        }
      }
      return false;
    }
    run();
    var Obs = env.MutationObserver;
    if (Obs) {
      new Obs(function (records) {
        if (!pending && relevant(records)) {
          pending = true;
          (env.schedule || setTimeout)(run, 100);
        }
      }).observe(doc.body || doc.documentElement, { childList: true, subtree: true });
    }
  }

  var api = {
    MARKERS: MARKERS,
    PREF_KEY: PREF_KEY,
    baseLang: baseLang,
    preferredLang: preferredLang,
    findFold: findFold,
    processAll: processAll,
    start: start
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.GithubBilingual = api;
  }
})(typeof window !== "undefined" ? window : this);
