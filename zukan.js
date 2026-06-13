/* 図鑑の詳細ビュー — View Transitions APIでアイコンがぬるっと拡大する
   （非対応ブラウザではふつうに開閉するだけ） */
(function () {
  "use strict";

  var detail = document.getElementById("zkDetail");
  if (!detail) return;
  var bg = document.getElementById("zkDetailBg");
  var icon = document.getElementById("zkDetailIcon");
  var nameEl = document.getElementById("zkDetailName");
  var metaEl = document.getElementById("zkDetailMeta");
  var descEl = document.getElementById("zkDetailDesc");
  var linksEl = document.getElementById("zkDetailLinks");
  var closeBtn = document.getElementById("zkDetailClose");

  var lastImg = null;

  function transition(update) {
    if (document.startViewTransition &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return document.startViewTransition(update);
    }
    update();
    return null;
  }

  var kodogu = document.getElementById("zkKodogu");

  function openDetail(card) {
    var img = card.querySelector("img");
    var name = card.querySelector(".zk-sat__name");
    var meta = card.querySelector(".zk-sat__meta");
    var links = card.querySelector(".zk-sat__links");
    if (!img || !name) return;

    // しごとの小道具だけ、7ツールの一覧を展開
    var isKodogu = card.dataset.special === "kodogu";
    if (kodogu) kodogu.hidden = !isKodogu;
    document.getElementById("zkDetailCard").classList.toggle("zk-detail__card--wide", isKodogu);

    icon.src = img.src;
    nameEl.innerHTML = name.textContent +
      (card.dataset.kana ? '<span class="zk-item__kana">' + card.dataset.kana + "</span>" : "");
    metaEl.textContent = meta ? meta.textContent : "";
    descEl.textContent = card.dataset.desc || "";
    linksEl.innerHTML = links ? links.innerHTML : "";
    bg.style.backgroundImage = "url(" + img.src + ")";

    lastImg = img;
    img.style.viewTransitionName = "zkhero";
    var lockY = window.scrollY;
    document.body.dataset.lockY = String(lockY);
    var t = transition(function () {
      detail.hidden = false;
      detail.scrollTop = 0;
      document.body.classList.add("zk-lock");
      document.body.style.top = -lockY + "px";
      img.style.viewTransitionName = "";
    });
    if (!t) img.style.viewTransitionName = "";
    var SAY = {
      work:  "「こんな道具ほしい！」も そうだんしてね",
      read:  "こんな世界観のアプリも、いちから作れるよ！",
      learn: "学習アプリも、オーダーメイドで作れるよ！",
      life:  "くらしの道具も、アイデアから作れるよ！"
    };
    var say = detail.querySelector(".zk-detail__say p");
    if (say) {
      say.textContent = SAY[card.dataset.cat] || SAY.work;
      delete say.dataset.typed;
      delete say.dataset.played;
    }
    if (window.__typeIn) setTimeout(function () { window.__typeIn(detail); }, 350);
  }

  function closeDetail() {
    if (detail.hidden) return;
    var img = lastImg;
    var lockY = parseInt(document.body.dataset.lockY || "0", 10);
    var t = transition(function () {
      detail.hidden = true;
      document.body.classList.remove("zk-lock");
      document.body.style.top = "";
      window.scrollTo({ top: lockY, behavior: "instant" });
      if (img) img.style.viewTransitionName = "zkhero";
    });
    var cleanup = function () { if (img) img.style.viewTransitionName = ""; };
    if (t && t.finished) t.finished.finally(cleanup);
    else cleanup();
  }

  document.querySelectorAll(".zk-sat[data-desc]").forEach(function (card) {
    card.addEventListener("click", function (e) {
      if (e.target.closest("a")) return;   // チップは直接リンク
      openDetail(card);
    });
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetail(card); }
    });
  });

  // ホイールを直接スクロールに変換（環境差でネイティブスクロールが効かない問題の保険）
  detail.addEventListener("wheel", function (e) {
    detail.scrollTop += e.deltaY;
    e.preventDefault();
  }, { passive: false });

  closeBtn.addEventListener("click", closeDetail);
  detail.addEventListener("click", function (e) {
    if (e.target.closest(".zk-detail__card") || e.target.closest(".panel-back")) return;
    closeDetail();
  });
  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeDetail();
    if (detail.hidden) return;
    if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") { detail.scrollTop += 80; e.preventDefault(); }
    if (e.key === "ArrowUp" || e.key === "PageUp") { detail.scrollTop -= 80; e.preventDefault(); }
  });

  /* ---------- カテゴリフィルター（切替もぬるっと再配置） ---------- */
  var grid = document.getElementById("zkGrid");
  var chips = document.querySelectorAll(".zk-chip");
  if (grid && chips.length) {
    var tiles = grid.querySelectorAll(".zk-sat");
    // タイルごとに固有のview-transition-nameを与えると、絞り込み時に滑らかに再配置される
    tiles.forEach(function (t, i) { t.style.viewTransitionName = "zktile-" + i; });

    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        chips.forEach(function (c) { c.classList.toggle("is-active", c === chip); });
        var key = chip.dataset.filter;
        var apply = function () {
          tiles.forEach(function (t) {
            t.hidden = key !== "all" && t.dataset.cat !== key;
          });
        };
        if (document.startViewTransition &&
            !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          document.startViewTransition(apply);
        } else {
          apply();
        }
      });
    });
  }
})();
