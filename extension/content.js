/* global chrome, GithubBilingual */
(function () {
  "use strict";
  var KEY = GithubBilingual.PREF_KEY;
  chrome.storage.sync.get(KEY, function (got) {
    var pref = (got && got[KEY]) || "auto";
    GithubBilingual.start({
      document: document,
      languages: navigator.languages || [navigator.language],
      storage: { getItem: function () { return pref; } },
      MutationObserver: window.MutationObserver
    });
  });
  chrome.storage.onChanged.addListener(function (changes) {
    if (changes[KEY]) location.reload();
  });
})();
