/* Yoni's Stream · portada: motor de escenas por desplazamiento.
   Un solo bucle requestAnimationFrame que solo corre cuando hay desplazamiento; cada escena lee su posición
   (todas las lecturas primero, luego las escrituras) y solo toca transform, opacity, clip-path y variables CSS.
   En escritorio la rueda del ratón se suaviza; en el móvil el desplazamiento es el nativo del sistema. */
(function () {
  "use strict";
  var root = document.documentElement;
  var YS = window.YS || {};
  var FX = root.classList.contains("fx");
  var RTL = root.dir === "rtl";
  var vw = window.innerWidth, vh = window.innerHeight;
  var clamp = function (v, a, b) { a = a === undefined ? 0 : a; b = b === undefined ? 1 : b; return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var span = function (a, b, v) { return clamp((v - a) / (b - a)); };
  var inOut = function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var out = function (t) { return 1 - Math.pow(1 - t, 3); };
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  /* ---------- idioma: selector y aviso ---------- */
  var sel = document.getElementById("lang");
  if (sel) sel.addEventListener("change", function () {
    store("ys-lang", sel.options[sel.selectedIndex].getAttribute("data-l"));
    location.href = sel.value;
  });
  (function suggest() {
    var box = document.querySelector(".suggest");
    if (!box || !YS.sug || store("ys-lang")) return;
    var langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""];
    var pref = null;
    for (var i = 0; i < langs.length; i++) {
      var c = String(langs[i]).toLowerCase().split("-")[0];
      if (YS.sug[c]) { pref = c; break; }
    }
    if (!pref || pref === YS.lang) return;
    var s = YS.sug[pref];
    box.setAttribute("lang", s[4]);
    box.setAttribute("dir", pref === "ar" ? "rtl" : "ltr");
    box.querySelector("p").textContent = s[0];
    var go = box.querySelector("a");
    go.textContent = s[1]; go.href = s[3];
    go.addEventListener("click", function () { store("ys-lang", pref); });
    var x = box.querySelector("button");
    x.setAttribute("aria-label", s[2]);
    x.addEventListener("click", function () { store("ys-lang", YS.lang); box.hidden = true; });
    box.hidden = false;
  })();

  /* ---------- capturas en otro idioma ---------- */
  var segBtns = Array.prototype.slice.call(document.querySelectorAll("[data-shots]"));
  function shots(l) {
    segBtns.forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-shots") === l ? "true" : "false"); });
    Array.prototype.forEach.call(document.querySelectorAll("img[data-cap]"), function (im) {
      var src = "cap-" + l + "-" + im.getAttribute("data-cap") + ".webp";
      if (im.getAttribute("src") !== src) im.src = src;
    });
  }
  segBtns.forEach(function (b) { b.addEventListener("click", function () { var l = b.getAttribute("data-shots"); store("ys-shots", l); shots(l); }); });
  var savedShots = store("ys-shots");
  if (savedShots && /^(es|en|pt)$/.test(savedShots) && savedShots !== YS.shots) shots(savedShots);

  /* ---------- medidor de audio: solo se mueve si se ve ---------- */
  if ("IntersectionObserver" in window) {
    var vuIO = new IntersectionObserver(function (es) { es.forEach(function (e) { e.target.classList.toggle("on", e.isIntersecting && FX); }); });
    Array.prototype.forEach.call(document.querySelectorAll(".vu"), function (el) { vuIO.observe(el); });
  }

  var top = document.querySelector(".top"), bar = document.querySelector(".progress i");
  function chrome(y) {
    var max = Math.max(1, document.documentElement.scrollHeight - vh);
    top.classList.toggle("solid", y > 8);
    bar.style.transform = "scaleX(" + clamp(y / max).toFixed(4) + ")";
  }
  if (!FX) {
    var t0 = false;
    window.addEventListener("scroll", function () { if (!t0) { t0 = true; requestAnimationFrame(function () { t0 = false; chrome(window.scrollY); }); } }, { passive: true });
    chrome(window.scrollY);
    return;
  }

  /* ================= escenas ================= */
  var scenes = [];
  function scene(el, kind, read, write) { if (el) scenes.push({ el: el, kind: kind, read: read, write: write, on: true, r: null }); }

  /* ---- héroe: el lienzo sale del teléfono a pantalla completa y luego hace un paneo ---- */
  var hero = document.querySelector(".hero");
  var hPhone = hero && hero.querySelector(".phone"), hWrap = hero && hero.querySelector(".hero-phone");
  var hCopy = hero && hero.querySelector(".hero-copy"), cv = hero && hero.querySelector(".canvas");
  var hud = hero && hero.querySelector(".hud"), lower = hero && hero.querySelector(".lower"), hint = hero && hero.querySelector(".hint");
  var clock = hero && hero.querySelector(".tally time"), clockT = null, clockS = 0;
  var endW = 0, endH = 0;
  function heroSize() {
    endW = vh * 16 / 9; endH = vh;
    if (endW < vw) { endW = vw; endH = vw * 9 / 16; }
    cv.style.width = endW + "px"; cv.style.height = endH + "px";
  }
  function tick() { clockS++; var h = Math.floor(clockS / 3600), m = Math.floor(clockS / 60) % 60, s = clockS % 60;
    clock.textContent = (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s; }
  if (hero) {
    heroSize();
    var phoneBox = null;
    scene(hero, "sticky", function () { phoneBox = hPhone.getBoundingClientRect(); }, function (p) {
      var pr = phoneBox; if (!pr.width) return;
      var k = pr.height / 937, kx = pr.width / 434;                 // marco del teléfono: 434 × 937
      var x0 = pr.left + 23 * kx, y0 = pr.top + 105 * k, w0 = 388 * kx; // vista previa del lienzo dentro de la app
      var pan = Math.max(0, endW - vw);
      var xs = pan > 0 ? (RTL ? -pan : 0) : (vw - endW) / 2, xe = pan > 0 ? (RTL ? 0 : -pan) : xs;
      var e = inOut(span(.14, .58, p)), pp = inOut(span(.6, 1, p));
      var w = lerp(w0, endW, e), s = w / endW;
      var x = lerp(x0, xs, e) + (xe - xs) * pp, y = lerp(y0, (vh - endH) / 2, e);
      cv.style.transform = "translate3d(" + x.toFixed(1) + "px," + y.toFixed(1) + "px,0) scale(" + s.toFixed(5) + ")";
      cv.style.borderRadius = (lerp(20 * kx, 0, e) / s).toFixed(1) + "px";
      cv.classList.add("ready");
      var c = span(.04, .3, p);
      hCopy.style.opacity = (1 - c).toFixed(3);
      hCopy.style.transform = "translate3d(0," + (-70 * out(c)).toFixed(1) + "px,0)";
      hWrap.style.opacity = (1 - span(.32, .52, p)).toFixed(3);
      var a = span(.58, .68, p), b = span(.8, .92, p);
      hud.style.opacity = a.toFixed(3); hud.style.transform = "translateY(" + ((1 - a) * -10).toFixed(1) + "px)";
      lower.style.opacity = b.toFixed(3); lower.style.transform = "translateY(" + ((1 - out(b)) * 24).toFixed(1) + "px)";
      hint.style.opacity = (1 - span(0, .05, p)).toFixed(3);
      if (a > .5 && !clockT) { clockT = setInterval(tick, 1000); }
      if (a < .2 && clockT) { clearInterval(clockT); clockT = null; clockS = 0; clock.textContent = "00:00:00"; }
    });
  }

  /* ---- cintas de palabras e idiomas: se mueven con el desplazamiento ---- */
  Array.prototype.forEach.call(document.querySelectorAll("[data-marquee]"), function (row) {
    var speed = parseFloat(row.getAttribute("data-marquee")), half = 0;
    function measure() { half = row.scrollWidth / 2; }
    measure(); window.addEventListener("resize", measure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    scene(row, "view", null, function (p, y) {
      if (!half) return;
      var d = ((y * Math.abs(speed)) % half + half) % half;
      var x = speed > 0 ? -d : d - half;
      row.style.transform = "translate3d(" + (RTL ? -x : x).toFixed(1) + "px,0,0)";
    });
  });

  /* ---- mazo de capturas: cada una se abre como el iris de una cámara ---- */
  var deck = document.querySelector(".deck");
  if (deck) {
    var cards = Array.prototype.slice.call(deck.querySelectorAll(".card"));
    var n = cards.length, capBox = deck.querySelector(".caps"), dotBox = deck.querySelector(".dots");
    deck.style.setProperty("--n", n);
    var caps = cards.map(function (c, i) {
      var f = c.querySelector("figcaption"), d = document.createElement("div");
      d.className = "cap"; d.setAttribute("aria-hidden", "true");
      d.innerHTML = '<span class="count"><em>' + String(i + 1).padStart(2, "0") + "</em> / " + String(n).padStart(2, "0") + "</span>" + f.innerHTML;
      capBox.appendChild(d); return d;
    });
    var dots = cards.map(function (c, i) {
      var b = document.createElement("button");
      b.type = "button"; b.setAttribute("aria-label", c.querySelector("figcaption b").textContent);
      b.addEventListener("click", function () {
        var r = deck.getBoundingClientRect(), p = (i + .6) / (n - 1 + .6);
        smoothTo(window.scrollY + r.top + p * (deck.offsetHeight - vh) + 2);
      });
      dotBox.appendChild(b); return b;
    });
    var cw = 0, ch = 0, active = -1;
    var deckSize = function () { cw = cards[0].offsetWidth; ch = cards[0].offsetHeight; };
    deckSize();
    var parts = cards.map(function (c) { return { el: c, shade: c.querySelector(".shade"), ring: c.querySelector(".ring"), shot: c.querySelector(".shot") }; });
    scene(deck, "sticky", null, function (p) {
      var T = lerp(-.6, n - 1, p), dir = RTL ? 1 : -1;
      var ref = Math.sqrt(cw * cw + ch * ch) / Math.SQRT2;
      parts.forEach(function (o, i) {
        var t = T - i, st = o.el.style;
        if (t < -1 || t >= 2.6) { if (st.visibility !== "hidden") st.visibility = "hidden"; return; }
        st.visibility = "visible"; st.zIndex = String(10 + i);
        if (t < 0) {
          var u = inOut(t + 1), R = lerp(5, 82, u);
          st.transform = "translate3d(0," + ((1 - u) * vh * .42).toFixed(1) + "px,0) rotateX(" + ((1 - u) * 16).toFixed(2) + "deg) scale(" + (.82 + .18 * u).toFixed(4) + ")";
          o.shot.style.clipPath = u >= .999 ? "none" : "circle(" + R.toFixed(2) + "% at 50% 45%)";
          var d = 2 * R / 100 * ref;
          o.ring.style.width = o.ring.style.height = d.toFixed(1) + "px";
          o.ring.style.opacity = (Math.sin(u * Math.PI) * .95).toFixed(3);
          o.shade.style.opacity = "0"; st.opacity = "1";
        } else {
          var v = inOut(Math.min(t, 1)), w = t > 1 ? (t - 1) / 1.6 : 0;
          var sc = 1 - .1 * v - .08 * w, tx = dir * (9 * v + 6 * w), rz = dir * (4 * v + 2 * w);
          st.transform = "translate3d(" + tx.toFixed(2) + "%," + (-3 * v).toFixed(2) + "%,0) rotate(" + rz.toFixed(2) + "deg) scale(" + sc.toFixed(4) + ")";
          o.shot.style.clipPath = "none"; o.ring.style.opacity = "0";
          o.shade.style.opacity = (.45 * v + .4 * w).toFixed(3);
          st.opacity = (1 - span(.6, 1, w)).toFixed(3);
        }
      });
      var a = clamp(Math.round(T), 0, n - 1);
      if (a !== active) {
        active = a;
        caps.forEach(function (c, i) { c.classList.toggle("on", i === a); });
        dots.forEach(function (b, i) { b.setAttribute("aria-current", i === a ? "true" : "false"); });
      }
    });
    window.addEventListener("resize", deckSize);
  }

  /* ---- funciones: la imagen se abre desde una rendija y el texto entra ---- */
  Array.prototype.forEach.call(document.querySelectorAll(".feat"), function (f) {
    var m = f.querySelector(".media");
    scene(f, "view", null, function (p) {
      var r = 1 - out(span(.04, .42, p));
      m.style.setProperty("--r", r.toFixed(4));
      m.style.setProperty("--y", ((p - .5) * -36).toFixed(1));
      if (p > .08) f.classList.add("in");
    });
  });

  /* ---- tableta: pista horizontal; la del centro se agranda ---- */
  var tab = document.querySelector(".tablet");
  if (tab) {
    var track = tab.querySelector(".track"), figs = Array.prototype.slice.call(track.querySelectorAll("figure"));
    var cx = [];
    var tabLayout = function () {
      track.style.transform = "none";
      figs.forEach(function (f) { f.style.transform = "none"; });
      cx = figs.map(function (f) { var r = f.getBoundingClientRect(); return r.left + r.width / 2; });
      tab.style.setProperty("--th", (Math.abs(cx[cx.length - 1] - cx[0]) + vh) + "px");
    };
    tabLayout();
    window.addEventListener("load", tabLayout);
    figs.forEach(function (f) { var im = f.querySelector("img"); if (!im.complete) im.addEventListener("load", tabLayout); });
    scene(tab, "sticky", null, function (p) {
      var c = lerp(cx[0], cx[cx.length - 1], inOut(p)), tx = vw / 2 - c;
      track.style.transform = "translate3d(" + tx.toFixed(1) + "px,0,0)";
      figs.forEach(function (f, i) {
        var d = Math.min(1, Math.abs(cx[i] + tx - vw / 2) / (vw * .55));
        f.style.transform = "scale(" + (1 - .22 * d).toFixed(4) + ")";
        f.style.opacity = (1 - .55 * d).toFixed(3);
      });
    });
    window.addEventListener("resize", tabLayout);
  }

  /* ---- final: el iris se abre ---- */
  var iris = document.querySelector(".iris");
  scene(iris, "view", null, function (p) {
    var k = out(span(.02, .5, p));
    iris.style.setProperty("--c", lerp(12, 100, k).toFixed(2));
    iris.style.setProperty("--k", k.toFixed(3));
  });

  /* ---------- bucle ---------- */
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { scenes.forEach(function (s) { if (s.el === e.target) s.on = e.isIntersecting; }); });
      req();
    }, { rootMargin: "30% 0px" });
    scenes.forEach(function (s) { io.observe(s.el); });
  }
  var pending = false;
  function frame() {
    pending = false;
    var y = window.scrollY;
    var live = scenes.filter(function (s) { return s.on; });
    live.forEach(function (s) { s.r = s.el.getBoundingClientRect(); if (s.read) s.read(); });
    live.forEach(function (s) {
      var r = s.r, p;
      if (s.kind === "sticky") p = clamp(-r.top / Math.max(1, r.height - vh));
      else p = clamp((vh - r.top) / (vh + r.height));
      s.write(p, y);
    });
    chrome(y);
  }
  function req() { if (!pending) { pending = true; requestAnimationFrame(frame); } }
  window.addEventListener("scroll", req, { passive: true });
  window.addEventListener("resize", function () {
    vw = window.innerWidth; vh = window.innerHeight;
    if (hero) heroSize();
    req();
  });
  window.addEventListener("load", req);
  req();

  /* ---------- desplazamiento suave (rueda del ratón y enlaces internos) ---------- */
  var fine = window.matchMedia && matchMedia("(pointer: fine)").matches;
  var target = window.scrollY, cur = window.scrollY, anim = false;
  function maxY() { return document.documentElement.scrollHeight - vh; }
  function step() {
    cur += (target - cur) * .11;
    if (Math.abs(target - cur) < .6) { cur = target; anim = false; }
    window.scrollTo(0, cur);
    if (anim) requestAnimationFrame(step);
  }
  function smoothTo(y) {
    if (!fine) { window.scrollTo({ top: y, behavior: "smooth" }); return; }
    if (!anim) { cur = window.scrollY; }
    target = clamp(y, 0, maxY());
    if (!anim) { anim = true; requestAnimationFrame(step); }
  }
  if (fine) {
    window.addEventListener("wheel", function (e) {
      if (e.ctrlKey || e.defaultPrevented || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (e.target.closest && e.target.closest("select, textarea, input")) return;
      e.preventDefault();
      var d = e.deltaY * (e.deltaMode === 1 ? 36 : e.deltaMode === 2 ? vh : 1);
      if (!anim) cur = target = window.scrollY;
      target = clamp(target + d, 0, maxY());
      if (!anim) { anim = true; requestAnimationFrame(step); }
    }, { passive: false });
    window.addEventListener("scroll", function () { if (!anim) cur = target = window.scrollY; }, { passive: true });
    ["keydown", "pointerdown", "touchstart"].forEach(function (ev) { window.addEventListener(ev, function () { anim = false; }, { passive: true }); });
  }
  Array.prototype.forEach.call(document.querySelectorAll('a[href^="#"]'), function (a) {
    a.addEventListener("click", function (e) {
      var id = a.getAttribute("href").slice(1), el = id && document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      smoothTo(window.scrollY + el.getBoundingClientRect().top);
      if (history.replaceState) history.replaceState(null, "", "#" + id);
      if (id === "main") el.focus({ preventScroll: true });
    });
  });
})();
