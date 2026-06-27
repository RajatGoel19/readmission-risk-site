/* fx.js — interaction/animation layer for SafeStay Hospital Check.
   Award-inspired but calm and accessible: a 3D hospital constellation hero,
   scroll-reveal choreography (bound to scroll, no scrolljacking), cursor
   parallax, a scroll-progress bar, count-up stats and micro-interactions.
   Everything is progressive enhancement and respects prefers-reduced-motion;
   if anything here fails, the underlying tool (app.js) keeps working. */
(function () {
  "use strict";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---------- scroll progress bar ---------- */
  function progress() {
    const bar = $("#scroll-progress");
    if (!bar) return;
    const onScroll = () => {
      const h = document.documentElement;
      const p = h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight);
      bar.style.transform = `scaleX(${p})`;
    };
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- scroll-reveal choreography ---------- */
  function reveals() {
    const targets = $$(".section .eyebrow, .section > .container > h2, .section .lead, .card, .figcard, .tool, details.faq, .note, .disclaimer");
    targets.forEach((el) => {
      el.classList.add("reveal");
      const sibs = [...el.parentElement.children].filter((c) => c.classList.contains("reveal"));
      el.style.transitionDelay = Math.min(sibs.indexOf(el), 6) * 55 + "ms";
    });
    if (reduced || !("IntersectionObserver" in window)) {
      targets.forEach((el) => el.classList.add("in")); return;  // never leave content hidden
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.1, rootMargin: "0px 0px -7% 0px" });
    targets.forEach((el) => io.observe(el));
  }

  /* ---------- count-up numbers ---------- */
  function counts() {
    const els = $$("[data-count]");
    const run = (el) => {
      const target = parseFloat(el.dataset.count);
      const dec = +(el.dataset.dec || 0), pre = el.dataset.pre || "", suf = el.dataset.suf || "";
      if (reduced) { el.textContent = pre + target.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suf; return; }
      const dur = 1200, t0 = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        el.textContent = pre + (target * e).toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suf;
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { run(e.target); io.unobserve(e.target); } });
    }, { threshold: 0.6 });
    els.forEach((el) => io.observe(el));
  }

  /* ---------- cursor parallax on hero ---------- */
  function parallax() {
    if (reduced) return;
    const layers = $$("[data-depth]");
    if (!layers.length) return;
    let tx = 0, ty = 0, cx = 0, cy = 0;
    addEventListener("mousemove", (e) => { tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; }, { passive: true });
    (function loop() {
      cx += (tx - cx) * 0.06; cy += (ty - cy) * 0.06;
      layers.forEach((l) => { const d = +l.dataset.depth; l.style.transform = `translate3d(${cx * d * 16}px,${cy * d * 16}px,0)`; });
      requestAnimationFrame(loop);
    })();
  }

  /* ---------- button ripple micro-interaction ---------- */
  function ripples() {
    document.addEventListener("pointerdown", (e) => {
      const b = e.target.closest(".cta, .condbtn, .compare-bar button, .cmp-btn");
      if (!b) return;
      const r = document.createElement("span");
      r.className = "ripple";
      const rect = b.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      r.style.width = r.style.height = size + "px";
      r.style.left = e.clientX - rect.left - size / 2 + "px";
      r.style.top = e.clientY - rect.top - size / 2 + "px";
      b.appendChild(r);
      setTimeout(() => r.remove(), 650);
    });
  }

  /* ---------- 3D hospital constellation (Three.js, optional) ---------- */
  function hero3D() {
    const canvas = $("#hero-canvas");
    if (!canvas || reduced || !window.THREE) return;
    const host = canvas.parentElement;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true }); }
    catch (e) { return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.z = 11;

    // ~1,400 points distributed on a sphere (a "globe of hospitals")
    const N = 1400, R = 6.2, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = Math.PI * (3 - Math.sqrt(5)) * i;
      pos[i * 3] = Math.cos(th) * r * R; pos[i * 3 + 1] = y * R; pos[i * 3 + 2] = Math.sin(th) * r * R;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const dots = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x2dd4bf, size: 0.07, transparent: true, opacity: 0.85 }));
    scene.add(dots);
    // faint outer halo of white points for depth
    const N2 = 500, pos2 = new Float32Array(N2 * 3);
    for (let i = 0; i < N2; i++) { for (let j = 0; j < 3; j++) pos2[i * 3 + j] = (Math.random() - 0.5) * 26; }
    const g2 = new THREE.BufferGeometry(); g2.setAttribute("position", new THREE.BufferAttribute(pos2, 3));
    const haze = new THREE.Points(g2, new THREE.PointsMaterial({ color: 0x9fc7e8, size: 0.04, transparent: true, opacity: 0.35 }));
    scene.add(haze);

    let mx = 0, my = 0;
    addEventListener("mousemove", (e) => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; }, { passive: true });
    const resize = () => {
      const w = host.clientWidth, h = host.clientHeight;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    resize(); addEventListener("resize", resize);

    let raf, running = true;
    const tick = () => {
      dots.rotation.y += 0.0009; dots.rotation.x = -0.15; haze.rotation.y -= 0.0004;
      camera.position.x += (mx * 2.2 - camera.position.x) * 0.035;
      camera.position.y += (-my * 1.4 - camera.position.y) * 0.035;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      if (running) raf = requestAnimationFrame(tick);
    };
    tick();
    document.addEventListener("visibilitychange", () => {
      running = !document.hidden;
      if (running) tick(); else cancelAnimationFrame(raf);
    });
    canvas.classList.add("on");
  }

  function init() {
    try { progress(); } catch (e) {}
    try { reveals(); } catch (e) {}
    try { counts(); } catch (e) {}
    try { parallax(); } catch (e) {}
    try { ripples(); } catch (e) {}
    try { hero3D(); } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
