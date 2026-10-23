/* ヘッダー・メニュー・リビール・カウントアップ・レールのドラッグ・カスタムカーソル */
(function () {
  "use strict";

  // ヘッダー
  var header = document.getElementById("siteHeader");
  var onScroll = function () {
    header.classList.toggle("scrolled", window.scrollY > 24);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // モバイルメニュー
  var btn = document.getElementById("menuBtn");
  var drawer = document.getElementById("drawer");
  if (btn && drawer) {
    btn.addEventListener("click", function () {
      var open = drawer.classList.toggle("open");
      btn.setAttribute("aria-expanded", String(open));
      btn.querySelectorAll("span").forEach(function (s) { s.style.background = open ? "#fff" : ""; });
    });
    drawer.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        drawer.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");
        btn.querySelectorAll("span").forEach(function (s) { s.style.background = ""; });
      }
    });
  }

  // スクロールリビール
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) {
        en.target.classList.add("in");
        io.unobserve(en.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });

  // 40+ カウントアップ
  var num = document.getElementById("countNum");
  if (num) {
    var done = false;
    var io2 = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting || done) return;
      done = true;
      var start = null, dur = 1400, target = 40;
      var step = function (ts) {
        if (!start) start = ts;
        var p = Math.min((ts - start) / dur, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        num.textContent = String(Math.round(eased * target));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      io2.disconnect();
    }, { threshold: 0.4 });
    io2.observe(num);
  }

  // 実績レール：つかんでドラッグ
  var rail = document.getElementById("worksRail");
  if (rail) {
    var isDown = false, startX = 0, startLeft = 0, moved = false;
    rail.addEventListener("pointerdown", function (e) {
      isDown = true; moved = false;
      startX = e.clientX;
      startLeft = rail.scrollLeft;
      rail.classList.add("dragging");
    });
    window.addEventListener("pointermove", function (e) {
      if (!isDown) return;
      var dx = e.clientX - startX;
      if (Math.abs(dx) > 4) moved = true;
      rail.scrollLeft = startLeft - dx;
    });
    window.addEventListener("pointerup", function () {
      isDown = false;
      rail.classList.remove("dragging");
    });
    // ドラッグ後のクリック誤爆防止
    rail.addEventListener("click", function (e) {
      if (moved) { e.preventDefault(); e.stopPropagation(); }
    }, true);
  }

  /* ============================================================
     マイクロインタラクション集
     ============================================================ */
  var FINE = window.matchMedia("(pointer: fine)").matches;
  var REDUCED2 = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // --- ロボちゃんの吹き出しタイプライター（AIストリーミング風） ---
  var TYPE_SEL = ".robo-say__bubble, .hero .bubble, .cta__bubble, .chat__robo p, .zk-detail__say p";
  function prepType(el) {
    if (el.dataset.typed) return;
    el.dataset.typed = "1";
    var text = el.textContent;
    el.setAttribute("aria-label", text);
    var frag = document.createDocumentFragment();
    text.split("").forEach(function (ch) {
      var s = document.createElement("span");
      s.textContent = ch;
      s.className = "tch";
      s.setAttribute("aria-hidden", "true");
      frag.appendChild(s);
    });
    el.textContent = "";
    el.appendChild(frag);
  }
  function playType(el) {
    if (el.dataset.played) return;
    el.dataset.played = "1";
    var chars = el.querySelectorAll(".tch");
    var caret = document.createElement("span");
    caret.className = "tcaret";
    caret.setAttribute("aria-hidden", "true");
    el.appendChild(caret);
    chars.forEach(function (s, i) {
      setTimeout(function () { s.classList.add("on"); }, 120 + i * 42);
    });
    setTimeout(function () { caret.remove(); }, 300 + chars.length * 42 + 500);
  }
  window.__typeIn = function (root) {
    (root || document).querySelectorAll(TYPE_SEL).forEach(function (el) {
      prepType(el);
      playType(el);
    });
  };
  if (!REDUCED2) {
    var tio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { playType(en.target); tio.unobserve(en.target); }
      });
    }, { threshold: 0.6 });
    document.querySelectorAll(TYPE_SEL).forEach(function (el) {
      if (el.closest("[hidden]")) return; // 仮想ページ内は開いた時に
      prepType(el);
      tio.observe(el);
    });
  }

  // --- スポットライトホバー（カーソルを追う光） ---
  if (FINE) {
    document.querySelectorAll(".svc-card, .rail-card, .tool, .zk-tool, .demo-btn").forEach(function (card) {
      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty("--mx", (e.clientX - r.left) + "px");
        card.style.setProperty("--my", (e.clientY - r.top) + "px");
      }, { passive: true });
    });
  }

  // --- マグネットボタン ---
  if (FINE && !REDUCED2) {
    document.querySelectorAll(".btn--primary, .btn--light, .btn--sun, .header-cta").forEach(function (btn) {
      btn.addEventListener("pointermove", function (e) {
        var r = btn.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2);
        var dy = e.clientY - (r.top + r.height / 2);
        btn.style.translate = (dx * 0.16) + "px " + (dy * 0.3) + "px";
      }, { passive: true });
      btn.addEventListener("pointerleave", function () { btn.style.translate = ""; });
    });
  }

  // --- 実績カードの3Dティルト ---
  if (FINE && !REDUCED2) {
    document.querySelectorAll(".rail-card").forEach(function (card) {
      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect();
        var dx = (e.clientX - r.left) / r.width - 0.5;
        var dy = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = "perspective(700px) rotateX(" + (-dy * 5) + "deg) rotateY(" + (dx * 6) + "deg) translateY(-6px)";
      }, { passive: true });
      card.addEventListener("pointerleave", function () { card.style.transform = ""; });
    });
  }

  // --- お知らせの新着表示（公開から30日はNEW） ---
  var NEW_DAYS = 30;
  var newsTimes = document.querySelectorAll(".news-list time");
  if (newsTimes.length) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var isNew = function (t) {
      var m = (t.getAttribute("datetime") || t.textContent).match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/);
      if (!m) return false;
      var days = (today - new Date(+m[1], m[2] - 1, +m[3])) / 864e5;
      return days >= 0 && days < NEW_DAYS;
    };
    var anyNew = false;
    newsTimes.forEach(function (t) {
      if (!isNew(t)) return;
      anyNew = true;
      var b = document.createElement("span");
      b.className = "news-new";
      b.textContent = "NEW";
      t.insertAdjacentElement("afterend", b);
    });

    // ヒーローの1行を、お知らせ欄の先頭と同じ内容にそろえる
    var hero = document.getElementById("heroNews");
    var first = document.querySelector("#news .news-list li");
    if (hero && first) {
      var fa = first.querySelector("a");
      var ft = first.querySelector("time");
      var ht = hero.querySelector("time");
      hero.href = fa ? fa.getAttribute("href") : "news.html";
      if (fa && fa.target) { hero.target = fa.target; hero.rel = fa.rel; }
      else { hero.removeAttribute("target"); hero.removeAttribute("rel"); }
      if (ft && ht) {
        if (ft.getAttribute("datetime")) ht.setAttribute("datetime", ft.getAttribute("datetime"));
        else ht.removeAttribute("datetime");
        ht.textContent = ft.textContent;
      }
      hero.querySelector(".hero-news__text").textContent = first.querySelector("p").textContent;
      if (ft && isNew(ft)) {
        hero.classList.add("is-new");
        hero.querySelector(".hero-news__label").textContent = "NEW";
      }
    }

    if (anyNew) {
      document.querySelectorAll('.gnav a[href$="#news"], .gnav a[href$="news.html"]').forEach(function (a) {
        a.classList.add("has-new");
      });
      document.querySelectorAll('.drawer a[href$="#news"], .drawer a[href$="news.html"]').forEach(function (a) {
        var b = document.createElement("span");
        b.className = "news-new news-new--drawer";
        b.textContent = "NEW";
        a.appendChild(b);
      });
    }
  }
})();
