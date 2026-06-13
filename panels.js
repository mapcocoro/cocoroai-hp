/* 仮想ページ — サービスカードがそのまま全画面に展開する（View Transitions） */
(function () {
  "use strict";

  var layer = document.getElementById("panelLayer");
  if (!layer) return;
  var back = document.getElementById("panelBack");
  var bodies = layer.querySelectorAll("[data-panel-body]");
  var lastCard = null;
  var lastScroll = 0;

  function transition(update) {
    if (document.startViewTransition &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return document.startViewTransition(update);
    }
    update();
    return null;
  }

  function openPanel(card) {
    var key = card.dataset.panel;
    bodies.forEach(function (b) { b.hidden = b.dataset.panelBody !== key; });

    lastCard = card;
    lastScroll = window.scrollY;
    card.style.viewTransitionName = "svcpanel";
    transition(function () {
      layer.hidden = false;
      layer.scrollTop = 0;
      document.body.classList.add("zk-lock");
      document.body.style.top = -lastScroll + "px";
      card.style.viewTransitionName = "";
    });
    // ロボちゃんの吹き出しをタイプライターで
    var body = layer.querySelector('[data-panel-body="' + key + '"]');
    if (window.__typeIn && body) setTimeout(function () { window.__typeIn(body); }, 350);
  }

  function closePanel() {
    if (layer.hidden) return;
    var card = lastCard;
    var t = transition(function () {
      layer.hidden = true;
      document.body.classList.remove("zk-lock");
      document.body.style.top = "";
      window.scrollTo({ top: lastScroll, behavior: "instant" });
      if (card) card.style.viewTransitionName = "svcpanel";
    });
    var cleanup = function () { if (card) card.style.viewTransitionName = ""; };
    if (t && t.finished) t.finished.finally(cleanup);
    else cleanup();
  }

  document.querySelectorAll(".svc-card[data-panel]").forEach(function (card) {
    card.addEventListener("click", function (e) {
      if (e.target.closest("a")) return;
      openPanel(card);
    });
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPanel(card); }
    });
  });

  layer.addEventListener("wheel", function (e) {
    layer.scrollTop += e.deltaY;
    e.preventDefault();
  }, { passive: false });

  back.addEventListener("click", closePanel);
  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closePanel();
    if (layer.hidden) return;
    if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") { layer.scrollTop += 80; e.preventDefault(); }
    if (e.key === "ArrowUp" || e.key === "PageUp") { layer.scrollTop -= 80; e.preventDefault(); }
  });
})();
