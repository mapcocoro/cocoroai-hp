/* ============================================================
   teal ink fluid — WebGL2 Navier-Stokes 流体シミュレーション
   紙の上をティールの墨がぬるぬる流れる。なぞると流れが生まれる。
   (semi-Lagrangian advection + Jacobi pressure + vorticity confinement)
   ============================================================ */
(function () {
  "use strict";

  var canvas = document.getElementById("fluid");
  if (!canvas) return;
  var hero = canvas.parentElement;

  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var MOBILE = window.matchMedia("(max-width: 760px)").matches;

  var SIM_RES = MOBILE ? 96 : 144;
  var DYE_RES = MOBILE ? 360 : 640;
  var PRESSURE_ITER = MOBILE ? 14 : 20;
  var CURL = 14;
  var VEL_DISS = 0.22;
  var DYE_DISS = 0.48;   // インクは1〜2秒で淡く消えていく（濁る前に流れる）

  // 紙とインク（表示は paper - dye なので補色を滴下する）
  var PAPER = [0.992, 0.988, 0.984];

  // 時間帯でインクの色が変わる。どれも透明感のあるパステルで、重なっても濁らない
  var P_AQUA = [0.451, 0.820, 0.910];  // #73D1E8 みずいろ
  var P_MINT = [0.549, 0.902, 0.800];  // #8CE6CC ミント
  var P_SKY  = [0.620, 0.780, 0.950];  // #9EC7F2 そらいろ
  var P_LAV  = [0.780, 0.740, 0.950];  // #C7BDF2 ラベンダー
  var P_PINK = [0.969, 0.780, 0.860];  // #F7C7DB さくら
  var P_LEMON = [0.976, 0.906, 0.660]; // #F9E7A8 レモン
  var PALETTES = {
    morning: { inks: [P_MINT, P_AQUA, [0.72, 0.93, 0.85], P_LEMON], gold: P_LEMON },
    day:     { inks: [P_AQUA, P_MINT, P_SKY, P_LAV, P_PINK],        gold: P_LEMON },
    evening: { inks: [[0.97, 0.84, 0.62], P_PINK, [0.98, 0.78, 0.70], P_AQUA], gold: [0.96, 0.85, 0.45] },
    night:   { inks: [P_SKY, P_LAV, P_AQUA, P_MINT],                gold: P_LEMON }
  };
  var hour = new Date().getHours();
  var period = hour >= 5 && hour < 10 ? "morning"
             : hour >= 10 && hour < 16 ? "day"
             : hour >= 16 ? "evening"      // 16時〜24時
             : "night";                    // 0時〜5時（よふかしさん）
  // プレビュー用: ?ink=morning|day|evening|night で時間帯を強制
  var forced = new URLSearchParams(location.search).get("ink");
  if (forced && PALETTES[forced]) period = forced;
  var pal = PALETTES[period];
  var INKS = pal.inks;
  var GOLD = pal.gold;

  // 紙の色も時間帯でほんのり変わる（暗くはしない）
  if (period === "morning")      PAPER = [0.988, 0.992, 0.984]; // ほんのり若葉
  else if (period === "evening") PAPER = [0.992, 0.980, 0.957]; // ほんのり茜
  else if (period === "night")   PAPER = [0.965, 0.973, 0.988]; // ほんのり夜の青白さ

  // ロボちゃんのあいさつも時間帯で変わる
  var GREETS = {
    morning: "おはよう！なぞって あそんでね",
    day: "なぞって あそんでね！",
    evening: "おつかれさま！なぞって ひとやすみ",
    night: "こんばんは、よふかしさん？"
  };
  var bubble = document.querySelector(".hero .bubble");
  if (bubble) bubble.textContent = GREETS[period];

  function staticFallback() {
    var ctx = canvas.getContext("2d");
    if (!ctx) return;
    var w = canvas.width = canvas.clientWidth;
    var h = canvas.height = canvas.clientHeight;
    var spots = [[0.72, 0.32, 0.30], [0.85, 0.62, 0.22], [0.58, 0.75, 0.18], [0.40, 0.2, 0.14]];
    spots.forEach(function (s, i) {
      var g = ctx.createRadialGradient(s[0] * w, s[1] * h, 0, s[0] * w, s[1] * h, s[2] * Math.min(w, h));
      g.addColorStop(0, i === 1 ? "rgba(0,164,198,.20)" : "rgba(0,91,123,.16)");
      g.addColorStop(1, "rgba(0,91,123,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
  }

  var gl = canvas.getContext("webgl2", { alpha: false, depth: false, stencil: false, antialias: false });
  if (!gl || !gl.getExtension("EXT_color_buffer_float")) { staticFallback(); return; }

  /* ---------- GL helpers ---------- */
  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(s);
    return s;
  }
  var VERT = compile(gl.VERTEX_SHADER,
    "attribute vec2 aPos; varying vec2 vUv;" +
    "void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.,1.); }");

  function program(fragSrc) {
    var p = gl.createProgram();
    gl.attachShader(p, VERT);
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw gl.getProgramInfoLog(p);
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) { var info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p: p, u: u };
  }

  var quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  function createFBO(w, h) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex: tex, fbo: fbo, w: w, h: h, attach: function (id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, this.tex); return id; } };
  }
  function doubleFBO(w, h) {
    var a = createFBO(w, h), b = createFBO(w, h);
    return {
      w: w, h: h,
      get read() { return a; }, get write() { return b; },
      swap: function () { var t = a; a = b; b = t; }
    };
  }
  function blit(target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, target ? target.w : gl.drawingBufferWidth, target ? target.h : gl.drawingBufferHeight);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /* ---------- shaders ---------- */
  var P = "precision highp float; precision highp sampler2D; varying vec2 vUv;";

  var splatProg = program(P +
    "uniform sampler2D uTarget; uniform float aspectRatio; uniform vec3 color;" +
    "uniform vec2 point; uniform float radius;" +
    "void main(){" +
    " vec2 d = vUv - point; d.x *= aspectRatio;" +
    " vec3 splat = exp(-dot(d,d)/radius) * color;" +
    " gl_FragColor = vec4(texture2D(uTarget, vUv).rgb + splat, 1.0); }");

  var advProg = program(P +
    "uniform sampler2D uVelocity; uniform sampler2D uSource;" +
    "uniform vec2 texelSize; uniform float dt; uniform float dissipation;" +
    "void main(){" +
    " vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;" +
    " gl_FragColor = texture2D(uSource, coord) / (1.0 + dissipation * dt); }");

  var curlProg = program(P +
    "uniform sampler2D uVelocity; uniform vec2 texelSize;" +
    "void main(){" +
    " float L = texture2D(uVelocity, vUv - vec2(texelSize.x,0.)).y;" +
    " float R = texture2D(uVelocity, vUv + vec2(texelSize.x,0.)).y;" +
    " float B = texture2D(uVelocity, vUv - vec2(0.,texelSize.y)).x;" +
    " float T = texture2D(uVelocity, vUv + vec2(0.,texelSize.y)).x;" +
    " gl_FragColor = vec4(0.5*(R-L-T+B), 0., 0., 1.); }");

  var vortProg = program(P +
    "uniform sampler2D uVelocity; uniform sampler2D uCurl;" +
    "uniform vec2 texelSize; uniform float curl; uniform float dt;" +
    "void main(){" +
    " float L = texture2D(uCurl, vUv - vec2(texelSize.x,0.)).x;" +
    " float R = texture2D(uCurl, vUv + vec2(texelSize.x,0.)).x;" +
    " float B = texture2D(uCurl, vUv - vec2(0.,texelSize.y)).x;" +
    " float T = texture2D(uCurl, vUv + vec2(0.,texelSize.y)).x;" +
    " float C = texture2D(uCurl, vUv).x;" +
    " vec2 force = 0.5 * vec2(abs(T)-abs(B), abs(R)-abs(L));" +
    " force /= length(force) + 0.0001;" +
    " force *= curl * C; force.y *= -1.0;" +
    " vec2 vel = texture2D(uVelocity, vUv).xy;" +
    " gl_FragColor = vec4(vel + force * dt, 0., 1.); }");

  var divProg = program(P +
    "uniform sampler2D uVelocity; uniform vec2 texelSize;" +
    "void main(){" +
    " float L = texture2D(uVelocity, vUv - vec2(texelSize.x,0.)).x;" +
    " float R = texture2D(uVelocity, vUv + vec2(texelSize.x,0.)).x;" +
    " float B = texture2D(uVelocity, vUv - vec2(0.,texelSize.y)).y;" +
    " float T = texture2D(uVelocity, vUv + vec2(0.,texelSize.y)).y;" +
    " gl_FragColor = vec4(0.5*(R-L+T-B), 0., 0., 1.); }");

  var pressProg = program(P +
    "uniform sampler2D uPressure; uniform sampler2D uDivergence; uniform vec2 texelSize;" +
    "void main(){" +
    " float L = texture2D(uPressure, vUv - vec2(texelSize.x,0.)).x;" +
    " float R = texture2D(uPressure, vUv + vec2(texelSize.x,0.)).x;" +
    " float B = texture2D(uPressure, vUv - vec2(0.,texelSize.y)).x;" +
    " float T = texture2D(uPressure, vUv + vec2(0.,texelSize.y)).x;" +
    " float div = texture2D(uDivergence, vUv).x;" +
    " gl_FragColor = vec4((L+R+B+T-div)*0.25, 0., 0., 1.); }");

  var gradProg = program(P +
    "uniform sampler2D uPressure; uniform sampler2D uVelocity; uniform vec2 texelSize;" +
    "void main(){" +
    " float L = texture2D(uPressure, vUv - vec2(texelSize.x,0.)).x;" +
    " float R = texture2D(uPressure, vUv + vec2(texelSize.x,0.)).x;" +
    " float B = texture2D(uPressure, vUv - vec2(0.,texelSize.y)).x;" +
    " float T = texture2D(uPressure, vUv + vec2(0.,texelSize.y)).x;" +
    " vec2 vel = texture2D(uVelocity, vUv).xy;" +
    " gl_FragColor = vec4(vel - 0.5*vec2(R-L, T-B), 0., 1.); }");

  var dispProg = program(P +
    "uniform sampler2D uDye; uniform vec3 paper;" +
    "void main(){" +
    " vec3 ink = texture2D(uDye, vUv).rgb;" +
    " gl_FragColor = vec4(clamp(paper - ink, 0.0, 1.0), 1.0); }");

  /* ---------- state ---------- */
  var velocity, dye, pressure, divergence, curlFBO;
  var simTexel, dyeTexel;

  function initFBOs() {
    var ar = canvas.clientWidth / Math.max(canvas.clientHeight, 1);
    var sw = ar >= 1 ? Math.round(SIM_RES * ar) : SIM_RES;
    var sh = ar >= 1 ? SIM_RES : Math.round(SIM_RES / ar);
    var dw = ar >= 1 ? Math.round(DYE_RES * ar) : DYE_RES;
    var dh = ar >= 1 ? DYE_RES : Math.round(DYE_RES / ar);
    velocity = doubleFBO(sw, sh);
    dye = doubleFBO(dw, dh);
    pressure = doubleFBO(sw, sh);
    divergence = createFBO(sw, sh);
    curlFBO = createFBO(sw, sh);
    simTexel = [1 / sw, 1 / sh];
    dyeTexel = [1 / dw, 1 / dh];
  }

  function resizeCanvas() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.round(canvas.clientWidth * dpr);
    var h = Math.round(canvas.clientHeight * dpr);
    if (w < 2 || h < 2) return false;  // 非表示・レイアウト前はスキップ
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      initFBOs();
    }
    return true;
  }
  resizeCanvas();
  window.addEventListener("resize", function () { resizeCanvas(); });

  /* ---------- splat ---------- */
  function splat(x, y, dx, dy, color, radius, intensity) {
    intensity = intensity || 0.25;
    var ar = canvas.clientWidth / Math.max(canvas.clientHeight, 1);
    gl.useProgram(splatProg.p);
    gl.uniform1i(splatProg.u.uTarget, velocity.read.attach(0));
    gl.uniform1f(splatProg.u.aspectRatio, ar);
    gl.uniform2f(splatProg.u.point, x, y);
    gl.uniform3f(splatProg.u.color, dx, dy, 0);
    gl.uniform1f(splatProg.u.radius, radius / 100);
    blit(velocity.write); velocity.swap();

    gl.uniform1i(splatProg.u.uTarget, dye.read.attach(0));
    // 表示は paper - dye。インク色cを出すには (paper - c) を滴下する
    gl.uniform3f(splatProg.u.color,
      (PAPER[0] - color[0]) * intensity,
      (PAPER[1] - color[1]) * intensity,
      (PAPER[2] - color[2]) * intensity);
    blit(dye.write); dye.swap();
  }

  /* ---------- simulation step ---------- */
  function step(dt) {
    gl.disable(gl.BLEND);

    gl.useProgram(curlProg.p);
    gl.uniform2f(curlProg.u.texelSize, simTexel[0], simTexel[1]);
    gl.uniform1i(curlProg.u.uVelocity, velocity.read.attach(0));
    blit(curlFBO);

    gl.useProgram(vortProg.p);
    gl.uniform2f(vortProg.u.texelSize, simTexel[0], simTexel[1]);
    gl.uniform1i(vortProg.u.uVelocity, velocity.read.attach(0));
    gl.uniform1i(vortProg.u.uCurl, curlFBO.attach(1));
    gl.uniform1f(vortProg.u.curl, CURL);
    gl.uniform1f(vortProg.u.dt, dt);
    blit(velocity.write); velocity.swap();

    gl.useProgram(divProg.p);
    gl.uniform2f(divProg.u.texelSize, simTexel[0], simTexel[1]);
    gl.uniform1i(divProg.u.uVelocity, velocity.read.attach(0));
    blit(divergence);

    gl.useProgram(pressProg.p);
    gl.uniform2f(pressProg.u.texelSize, simTexel[0], simTexel[1]);
    gl.uniform1i(pressProg.u.uDivergence, divergence.attach(0));
    for (var i = 0; i < PRESSURE_ITER; i++) {
      gl.uniform1i(pressProg.u.uPressure, pressure.read.attach(1));
      blit(pressure.write); pressure.swap();
    }

    gl.useProgram(gradProg.p);
    gl.uniform2f(gradProg.u.texelSize, simTexel[0], simTexel[1]);
    gl.uniform1i(gradProg.u.uPressure, pressure.read.attach(0));
    gl.uniform1i(gradProg.u.uVelocity, velocity.read.attach(1));
    blit(velocity.write); velocity.swap();

    gl.useProgram(advProg.p);
    gl.uniform2f(advProg.u.texelSize, simTexel[0], simTexel[1]);
    gl.uniform1i(advProg.u.uVelocity, velocity.read.attach(0));
    gl.uniform1i(advProg.u.uSource, velocity.read.attach(0));
    gl.uniform1f(advProg.u.dt, dt);
    gl.uniform1f(advProg.u.dissipation, VEL_DISS);
    blit(velocity.write); velocity.swap();

    gl.uniform1i(advProg.u.uVelocity, velocity.read.attach(0));
    gl.uniform1i(advProg.u.uSource, dye.read.attach(1));
    gl.uniform1f(advProg.u.dissipation, DYE_DISS);
    blit(dye.write); dye.swap();
  }

  function render() {
    gl.useProgram(dispProg.p);
    gl.uniform1i(dispProg.u.uDye, dye.read.attach(0));
    gl.uniform3f(dispProg.u.paper, PAPER[0], PAPER[1], PAPER[2]);
    blit(null);
  }

  /* ---------- ambient ink（自動演出） ---------- */
  var T = 0, inkIdx = 0, pulseTimer = 0;
  function ambient(dt) {
    T += dt * 0.21;
    // 右側をゆっくり旋回する見えない筆
    var x = 0.70 + 0.21 * Math.sin(T * 0.9) * Math.cos(T * 0.31);
    var y = 0.45 + 0.30 * Math.sin(T * 0.53 + 1.4);
    var vx = Math.cos(T * 0.9) * 24;
    var vy = Math.sin(T * 0.53 + 1.4) * 24;
    var c = INKS[inkIdx % INKS.length];
    splat(x, y, vx, vy, [c[0], c[1], c[2]], 0.12, 0.13);

    pulseTimer += dt;
    if (pulseTimer > 3.2) {
      pulseTimer = 0;
      inkIdx++;
      var pc = (inkIdx % 11 === 7) ? GOLD : INKS[inkIdx % INKS.length];
      var px = 0.55 + Math.random() * 0.4;
      var py = 0.2 + Math.random() * 0.6;
      var a = Math.random() * Math.PI * 2;
      splat(px, py, Math.cos(a) * 140, Math.sin(a) * 140, pc, 0.5 + Math.random() * 0.5, 0.65);
    }
  }

  /* ---------- pointer ---------- */
  var pointer = { x: 0, y: 0, dx: 0, dy: 0, down: false, moved: false, color: INKS[0] };
  function updatePointer(e) {
    var rect = canvas.getBoundingClientRect();
    var cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    var cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    var nx = cx / rect.width, ny = 1 - cy / rect.height;
    pointer.dx = (nx - pointer.x) * 900;
    pointer.dy = (ny - pointer.y) * 900;
    pointer.x = nx; pointer.y = ny;
    if (nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1 && (Math.abs(pointer.dx) + Math.abs(pointer.dy)) > 1) pointer.moved = true;
  }
  hero.addEventListener("pointermove", function (e) { updatePointer(e); }, { passive: true });
  hero.addEventListener("touchmove", function (e) { updatePointer(e); }, { passive: true });
  hero.addEventListener("pointerdown", function (e) {
    updatePointer(e);
    pointer.color = INKS[(Math.random() * INKS.length) | 0];
    splat(pointer.x, pointer.y, 0, 0, pointer.color, 0.9, 0.7);
  }, { passive: true });

  var moveCount = 0;

  /* ---------- ここロボちゃんがインクを「ふーっ」と吹く ---------- */
  var roboImg = document.querySelector(".hero__robo img");
  if (roboImg && !REDUCED) {
    setInterval(function () {
      if (!visible || document.hidden) return;
      var hr = canvas.getBoundingClientRect();
      var rr = roboImg.getBoundingClientRect();
      if (!hr.width || !rr.width) return;
      // ロボの口元あたりから、画面中央へ向けてやわらかくひと吹き
      var x = (rr.left + rr.width * 0.32 - hr.left) / hr.width;
      var y = 1 - (rr.top + rr.height * 0.42 - hr.top) / hr.height;
      var c = INKS[(Math.random() * INKS.length) | 0];
      splat(x, y, -(70 + Math.random() * 70), 20 + Math.random() * 40, c, 0.28, 0.4);
    }, 5200);

    // ロボちゃんをクリックすると、おおきくひと吹き
    roboImg.addEventListener("pointerdown", function (e) {
      e.stopPropagation();
      var hr = canvas.getBoundingClientRect();
      var rr = roboImg.getBoundingClientRect();
      if (!hr.width || !rr.width) return;
      var x = (rr.left + rr.width * 0.32 - hr.left) / hr.width;
      var y = 1 - (rr.top + rr.height * 0.42 - hr.top) / hr.height;
      for (var i = 0; i < 3; i++) {
        var ang = Math.PI + (i - 1) * 0.45;  // 左方向に扇形
        var c2 = (i === 1 && Math.random() < 0.4) ? GOLD : INKS[(Math.random() * INKS.length) | 0];
        splat(x, y, Math.cos(ang) * 320, Math.sin(ang) * -180, c2, 0.8 + Math.random() * 0.6, 0.55);
      }
    });
  }

  /* ---------- main loop ---------- */
  // ヒーローが画面外・タブ非表示の間はシミュレーションを止める（省電力）
  var visible = true;
  new IntersectionObserver(function (entries) {
    visible = entries[0].isIntersecting;
  }, { threshold: 0 }).observe(hero);

  var last = performance.now();
  function frame(now) {
    var dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    if (!visible || document.hidden || window.__fluidPause || !resizeCanvas()) {
      requestAnimationFrame(frame);
      return;
    }
    ambient(dt);
    if (pointer.moved) {
      pointer.moved = false;
      // ときどき金の一筋が混ざる
      if (++moveCount % 6 === 0) {
        pointer.color = Math.random() < 0.12 ? GOLD : INKS[(Math.random() * INKS.length) | 0];
      }
      splat(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color, 0.22, 0.45);
    }
    step(dt);
    render();
    requestAnimationFrame(frame);
  }

  // 初期演出：インクをいくつか落としておく
  for (var i = 0; i < 5; i++) {
    var c = (i === 3) ? GOLD : INKS[i % INKS.length];
    var a = Math.random() * Math.PI * 2;
    splat(0.55 + Math.random() * 0.4, 0.2 + Math.random() * 0.6,
      Math.cos(a) * 130, Math.sin(a) * 130, c, 0.6 + Math.random() * 0.7, 0.6);
  }

  if (REDUCED) {
    // 動きを抑える設定：少しだけ流して静止画に
    for (var k = 0; k < 40; k++) step(1 / 60);
    render();
  } else {
    requestAnimationFrame(frame);
  }
})();
