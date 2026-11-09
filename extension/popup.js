/* global chrome */
(function () {
  "use strict";
  var KEY = "github-bilingual:lang";
  var zh = /^zh\b/i.test(navigator.language);
  if (zh) {
    document.querySelector('[data-i18n="auto"]').textContent = "跟随浏览器语言";
    document.querySelector('[data-i18n="hint"]').textContent = "只对带「中文说明 / English」折叠段的正文生效。";
  }
  chrome.storage.sync.get(KEY, function (got) {
    var cur = (got && got[KEY]) || "auto";
    document.querySelectorAll('input[name="lang"]').forEach(function (r) {
      r.checked = r.value === cur;
      r.addEventListener("change", function () {
        var o = {}; o[KEY] = r.value; chrome.storage.sync.set(o);
      });
    });
  });
})();
