/* =============================================================
   2026 Portfolio — behaviour
   Only the interactions that Figma actually shows are wired here:
   anchor navigation, the Mobile nav Default <-> Open variant,
   Download, and Contact Us.
   ============================================================= */
(function () {
  'use strict';

  /* ---------------------------------------------------------
     CONFIG — the two values still waiting on real content.
     --------------------------------------------------------- */
  var CONFIG = {
    // TODO: 실제 주소 전달받으면 이 값만 교체하면 됩니다.
    contactEmail: 'temporary@example.com',
    // TODO: 이력서 PDF를 이 경로에 넣어주세요.
    resumeFile: 'assets/docs/resume.pdf',
    resumeDownloadName: 'SinDongju_Resume.pdf'
  };

  /* ---------------------------------------------------------
     Slide stacks
     Each project section is a stack of full-bleed slides read
     straight out of assets/slides/<key>/.

     Files are discovered at runtime (01, 02, 03 ... until one is
     missing), so dropping more exports into a folder is enough —
     no count to keep in sync here. `expected` is only used for the
     empty-state hint and comes from the Figma frame heights
     (10428.75 / 579.375 = 18, 11587.5 / 579.375 = 20,
      19119.375 / 579.375 = 33).
     --------------------------------------------------------- */
  /* `source` picks which files a project may use:
       'auto' — PNG first, JPG where no PNG exists (the normal setting)
       'jpg'  — ignore PNG entirely
       'png'  — PNG only
     All four run on 'auto': 02/03/04 resolve to the 4x PNG exports,
     01 still has only a JPG and falls back to it. */
  var PROJECTS = {
    '01': { label: '학원 ERP 서비스 고도화',      expected: null, source: 'auto' },
    '02': { label: '시니어 AI 케어 서비스 기획', expected: 18,   source: 'auto' },
    '03': { label: '숏폼 OTT 서비스 런칭',        expected: 20,   source: 'auto' },
    '04': { label: '케이크 주문 서비스 구축',     expected: 33,   source: 'auto' }
  };

  /* Probe order only. The slides ship as 4x JPEG, so jpg first means one
     request per slide instead of a wasted 404 on png. Resolution happens
     per slide, not per folder, so a folder that is partly re-exported in
     another format still renders every slide. */
  var EXT_PRIORITY = ['jpg', 'jpeg', 'png', 'webp'];
  var MAX_SLIDES = 99;

  /* ---- loading policy -------------------------------------------------
     The deck is nothing but big bitmaps, so a fast scroll must never out-run
     the loader. Three things keep that from happening:
       1. every slide box is reserved at 16:9 and painted white up front,
       2. the first slides of each project are fetched straight away —
          no lazy attribute anywhere,
       3. everything else is pulled in well before it reaches the viewport
          by an IntersectionObserver with a wide margin plus a lookahead.  */
  var EAGER_PER_PROJECT = 2;                 // fetched immediately, never lazy
  var LOOKAHEAD = 3;                         // extra slides pulled with each hit
  var ROOT_MARGIN = '150% 0px 250% 0px';     // ~2.5 screens of runway downward

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function slidePath(key, n, ext) { return 'assets/slides/' + key + '/' + pad(n) + '.' + ext; }

  function exists(url) {
    return fetch(url, { method: 'HEAD' })
      .then(function (r) { return r.ok; })
      .catch(function () { return false; });
  }

  function extensionsFor(source) {
    if (source === 'png') return ['png'];
    if (source === 'jpg') return ['jpg', 'jpeg'];
    return EXT_PRIORITY;
  }

  /* First existing file for slide n. `primary` (the extension slide 01 used)
     is tried first so a uniform folder costs exactly one request per slide. */
  function resolveSlide(key, n, source, primary) {
    var exts = extensionsFor(source);
    if (primary) {
      exts = [primary].concat(exts.filter(function (e) { return e !== primary; }));
    }
    var i = 0;
    function next() {
      if (i >= exts.length) return Promise.resolve(null);
      var src = slidePath(key, n, exts[i++]);
      return exists(src).then(function (ok) { return ok ? src : next(); });
    }
    return next();
  }

  /* Probe the whole folder at once instead of walking it one slide at a time,
     so the boxes exist (and the page stops growing) almost immediately. */
  function discover(key, meta) {
    return resolveSlide(key, 1, meta.source).then(function (first) {
      if (!first) return [];
      var primary = first.split('.').pop();
      var guess = (meta.expected || 12) + 4;
      var jobs = [];
      for (var n = 2; n <= guess; n++) jobs.push(resolveSlide(key, n, meta.source, primary));
      return Promise.all(jobs).then(function (rest) {
        var out = [first];
        for (var i = 0; i < rest.length; i++) {
          if (!rest[i]) return out;
          out.push(rest[i]);
        }
        return walkTail(key, meta, primary, out);
      });
    });
  }

  function walkTail(key, meta, primary, out) {
    if (out.length >= MAX_SLIDES) return Promise.resolve(out);
    return resolveSlide(key, out.length + 1, meta.source, primary).then(function (src) {
      if (!src) return out;
      out.push(src);
      return walkTail(key, meta, primary, out);
    });
  }

  var slideObserver = null;
  function getObserver() {
    if (slideObserver || !('IntersectionObserver' in window)) return slideObserver;
    slideObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        loadSlide(entry.target);
        var sib = entry.target;
        for (var i = 0; i < LOOKAHEAD && (sib = sib.nextElementSibling); i++) loadSlide(sib);
      });
    }, { rootMargin: ROOT_MARGIN, threshold: 0 });
    return slideObserver;
  }

  /* Safety net for the observer.
     IntersectionObserver delivers at frame boundaries, so a hard fling or a
     jump straight down the page can out-run it. This scan works purely off
     geometry and runs on a plain timer, which nothing can defer. Both paths
     call the same idempotent loadSlide(), so the overlap costs nothing. */
  var allSlides = [];
  var projectSlides = {};
  var scanTimer = null;

  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(function () { scanTimer = null; scanViewport(); }, 50);
  }

  function scanViewport() {
    if (!allSlides.length) return;
    var vh = window.innerHeight || 800;
    var lo = -vh * 1.5;    // keep a screen and a half behind (scrolling up)
    var hi = vh * 2.5;     // and two and a half screens of runway ahead
    var hits = [], i;

    /* read every rect first, write afterwards — mutating mid-loop would
       force a reflow on each iteration */
    for (i = 0; i < allSlides.length; i++) {
      var fig = allSlides[i];
      if (fig.dataset.promoted) continue;
      var r = fig.getBoundingClientRect();
      if (r.bottom >= lo && r.top <= hi) hits.push(i);
    }
    for (i = 0; i < hits.length; i++) {
      for (var j = 0; j <= LOOKAHEAD; j++) loadSlide(allSlides[hits[i] + j]);
    }
  }

  /* Every slide already carries a real src, so this does not "start" the
     load — it promotes the image out of the browser's lazy queue so the
     fetch happens now rather than at the browser's own threshold. */
  function loadSlide(fig) {
    if (!fig || fig.dataset.promoted) return;
    var img = fig.querySelector('img');
    if (!img) return;
    fig.dataset.promoted = '1';
    if (img.getAttribute('loading') === 'lazy') img.setAttribute('loading', 'eager');
    if (slideObserver) slideObserver.unobserve(fig);
  }

  /* priority: 'high' (first project, above the fold), 'low' (other projects'
     opening slides — fetched now, but behind what is actually on screen),
     or null for observer-driven slides. */
  function makeSlide(src, alt, priority) {
    var fig = document.createElement('figure');
    fig.className = 'slide';

    var img = document.createElement('img');
    img.alt = alt;
    /* async decode keeps a 7680px bitmap from blocking the scroll thread */
    img.decoding = 'async';
    /* No opacity transition on purpose: a fade would re-introduce exactly the
       flicker this is meant to remove. White box -> image, nothing else. */
    img.addEventListener('load', function () {
      fig.classList.add('is-loaded');
      /* Re-scan on every completed image. Decoding a slide can nudge the
         layout, and a scroll that has already stopped will not fire again —
         this keeps the chain moving forward until the whole runway is full. */
      scheduleScan();
    });

    if (priority) {
      /* Opening slides: no loading attribute at all, so they are never lazy. */
      fig.dataset.promoted = '1';
      img.setAttribute('fetchpriority', priority);
    } else {
      /* Everything else keeps a real src and leans on native lazy loading as
         the floor. That floor lives in the browser's own scroll machinery and
         cannot be out-run by JS timing, so even with scripting stalled no
         slide is ever left as an empty box. The observer and the scan below
         only pull images in EARLIER than the native threshold. */
      img.setAttribute('loading', 'lazy');
    }
    img.src = src;

    fig.appendChild(img);
    return fig;
  }

  function buildSlides() {
    document.querySelectorAll('[data-slides]').forEach(function (host) {
      var key = host.getAttribute('data-slides');
      var meta = PROJECTS[key];
      if (!meta) return;

      discover(key, meta).then(function (srcs) {
        if (!srcs.length) { host.appendChild(emptyNotice(key, meta)); return; }

        var obs = getObserver();
        var frag = document.createDocumentFragment();
        var figs = [];

        srcs.forEach(function (src, i) {
          var priority = null;
          if (i < EAGER_PER_PROJECT) {
            /* 01 opens the page; the other projects are thousands of pixels
               down, so they load at low priority and stay out of the way of
               the first paint while still never being lazy. */
            priority = (key === '01') ? 'high' : 'low';
          }
          var fig = makeSlide(src, meta.label + ' — ' + (i + 1) + '/' + srcs.length, priority);
          figs.push(fig);
          frag.appendChild(fig);
        });

        host.appendChild(frag);
        projectSlides[key] = figs;
        /* Rebuild from the DOM rather than appending: the four projects
           finish discovery in whatever order the network returns them, and
           the lookahead must walk slides in page order, not arrival order. */
        allSlides = [].slice.call(document.querySelectorAll('.slide'));

        figs.forEach(function (fig) {
          if (fig.dataset.promoted) return;
          if (obs) obs.observe(fig);
        });

        scanViewport();   // catch whatever is already near the viewport
      });
    });
  }

  /* ---------------------------------------------------------
     Download / Contact Us
     --------------------------------------------------------- */
  function wireLinks() {
    document.querySelectorAll('[data-resume]').forEach(function (a) {
      a.href = CONFIG.resumeFile;
      a.setAttribute('download', CONFIG.resumeDownloadName);
      a.setAttribute('type', 'application/pdf');
    });

    document.querySelectorAll('[data-mailto]').forEach(function (a) {
      a.href = 'mailto:' + CONFIG.contactEmail;
    });
  }

  /* ---------------------------------------------------------
     Mobile nav — Expanded = Default <-> Open (Figma 215:73843 / 215:73850)
     --------------------------------------------------------- */
  function wireMobileNav() {
    var panel = document.getElementById('mobileMenu');
    var toggle = document.getElementById('menuToggle');
    var close = document.getElementById('menuClose');
    if (!panel || !toggle || !close) return;

    function setOpen(open) {
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('is-menu-open', open);
      if (open) { close.focus(); } else { toggle.focus(); }
    }

    toggle.addEventListener('click', function () { setOpen(true); });
    close.addEventListener('click', function () { setOpen(false); });

    // Any link inside the panel closes it before jumping.
    panel.addEventListener('click', function (e) {
      if (e.target.closest('a')) { setOpen(false); }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) { setOpen(false); }
    });

    // Leaving the mobile breakpoint must not strand the panel open.
    var mq = window.matchMedia('(min-width: 768px)');
    (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(
      function () { if (mq.matches && !panel.hidden) setOpen(false); }
    );
  }

  /* ---------------------------------------------------------
     Hero cover
     The first screen is one exported PNG. It carries fetchpriority=high
     and no loading attribute, so it is fetched with the document — never
     lazily. The 16:9 box reserved in CSS is released once the real
     dimensions are known, so the PNG's own ratio decides the height.
     --------------------------------------------------------- */
  function wireHeroCover() {
    var hero = document.querySelector('.hero');
    var img = hero && hero.querySelector('.hero__cover');
    if (!img) return;

    function settled() { hero.classList.add('is-loaded'); }
    function failed() { hero.classList.add('is-loaded', 'is-missing'); }

    if (img.complete) {
      (img.naturalWidth ? settled : failed)();
      return;
    }
    img.addEventListener('load', settled, { once: true });
    img.addEventListener('error', failed, { once: true });
  }

  /* ---------------------------------------------------------
     Instant scroll
     Toggling documentElement.style.scrollBehavior is NOT reliable: the style
     change is not flushed before scrollTo() reads it, so the global
     `scroll-behavior: smooth` still wins and the jump animates (or, mid
     animation, does nothing at all). behavior:'instant' is decided at the
     call site and cannot be overridden by CSS.
     --------------------------------------------------------- */
  function scrollToInstant(y) {
    try {
      window.scrollTo({ top: y, left: 0, behavior: 'instant' });
    } catch (e) {
      /* Pre-'instant' browsers: toggle the CSS, but read a layout value in
         between so the change is actually applied first. */
      var root = document.documentElement;
      var prev = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      void root.offsetHeight;
      window.scrollTo(0, y);
      root.style.scrollBehavior = prev;
    }
  }

  /* ---------------------------------------------------------
     Always open at the Hero
     The inline script in <head> disables scroll restoration and drops any
     leftover hash; this is the belt-and-braces pass for browsers that
     restore late or re-anchor once images have laid out. It backs off the
     moment the visitor scrolls, so it can never yank them back.
     --------------------------------------------------------- */
  var userHasScrolled = false;

  function markUserScroll() { userHasScrolled = true; }

  function forceTop() {
    if (userHasScrolled) return;
    if ((window.pageYOffset || document.documentElement.scrollTop) === 0) return;
    scrollToInstant(0);
  }

  function wireStartAtTop() {
    ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(function (ev) {
      window.addEventListener(ev, markUserScroll, { passive: true, once: true });
    });
    forceTop();
    window.addEventListener('load', forceTop);
  }

  /* ---------------------------------------------------------
     Scroll progress bar under the sticky nav
     --------------------------------------------------------- */
  var refreshProgress = null;

  function wireProgress() {
    var fills = [].slice.call(document.querySelectorAll('.progress__fill'));
    if (!fills.length) return;

    function update() {
      var doc = document.documentElement;
      var max = doc.scrollHeight - doc.clientHeight;
      var p = max > 0 ? (window.pageYOffset || doc.scrollTop) / max : 0;
      if (p < 0) p = 0; else if (p > 1) p = 1;
      for (var i = 0; i < fills.length; i++) {
        fills[i].style.transform = 'scaleX(' + p.toFixed(4) + ')';
      }
    }

    /* Updated straight from the scroll event — it is two reads and one style
       write, and the browser already caps scroll events at frame rate. No
       rAF/timer gate, which could stall and leave the bar frozen. */
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    window.addEventListener('load', update);
    refreshProgress = update;
    update();
  }

  /* ---------------------------------------------------------
     Project transition
     Replaces the long smooth scroll between projects. Nothing here waits
     on a timer: the overlay closes as soon as the target project's opening
     slides have actually loaded and decoded, and if they are already in
     memory the overlay never appears at all.
     --------------------------------------------------------- */
  var TRACKED_SLIDES = 2;      // opening slides that must be ready
  var TRANSITION_CAP = 6000;   // never hold the overlay longer than this
  var FADE_MS = 180;

  var overlay, fillEl, barEl;
  var tween = { raf: 0, shown: 0, target: 0, start: 0 };

  /* Height of whatever sticky bar is currently pinned to the top, so the
     first slide lands flush under it instead of behind it. Desktop has a
     side nav and therefore no offset. */
  function stickyOffset() {
    var bars = ['.nav-top', '.nav-mobile'];
    for (var i = 0; i < bars.length; i++) {
      var el = document.querySelector(bars[i]);
      if (el && getComputedStyle(el).display !== 'none') {
        return Math.round(el.getBoundingClientRect().height);
      }
    }
    return 0;
  }

  function jumpTo(el) {
    var y = Math.max(0, Math.round(el.getBoundingClientRect().top + window.pageYOffset - stickyOffset()));
    scrollToInstant(y);
    if (typeof refreshProgress === 'function') refreshProgress();
  }

  function setProgress(p) {
    tween.target = Math.max(tween.target, Math.min(p, 1));
  }

  function runTween() {
    var now = Date.now();
    /* A slow drift toward 0.9 so the bar is never frozen while a 5MB PNG
       is in flight. It only ever moves the bar, never the transition. */
    var drift = 0.9 * (1 - Math.exp(-(now - tween.start) / 1400));
    var goal = Math.max(tween.target, Math.min(drift, 0.9));
    tween.shown += (goal - tween.shown) * 0.18;
    fillEl.style.transform = 'scaleX(' + tween.shown.toFixed(4) + ')';
    barEl.setAttribute('aria-valuenow', Math.round(tween.shown * 100));
    tween.raf = requestAnimationFrame(runTween);
  }

  function openOverlay() {
    overlay.hidden = false;
    overlay.classList.remove('is-out');
    tween.shown = 0; tween.target = 0; tween.start = Date.now();
    fillEl.style.transform = 'scaleX(0)';
    cancelAnimationFrame(tween.raf);
    tween.raf = requestAnimationFrame(runTween);
  }

  function closeOverlay() {
    cancelAnimationFrame(tween.raf);
    tween.shown = 1;
    fillEl.style.transform = 'scaleX(1)';
    barEl.setAttribute('aria-valuenow', 100);
    overlay.classList.add('is-out');
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(function () {
      overlay.hidden = true;
      overlay.classList.remove('is-out');
    }, reduce ? 0 : FADE_MS);
  }

  /* Resolves once the bitmap is downloaded AND decoded, so the paint right
     after the jump is immediate rather than a second white beat. */
  function ready(img) {
    function decode() {
      if (!img.decode) return Promise.resolve();
      return img.decode().catch(function () {});
    }
    if (img.complete && img.naturalWidth) return decode();
    return new Promise(function (resolve) {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    }).then(decode);
  }

  function openingImages(key) {
    var figs = projectSlides[key] || [];
    return figs.slice(0, TRACKED_SLIDES).map(function (fig) {
      loadSlide(fig);                       // promote out of the lazy queue
      return fig.querySelector('img');
    }).filter(Boolean);
  }

  function goToProject(key) {
    var section = document.getElementById('project-' + key);
    if (!section) return;

    var imgs = openingImages(key);
    var settled = imgs.filter(function (i) { return i.complete && i.naturalWidth; });

    /* Already in memory: no overlay, no wait, just go. */
    if (imgs.length && settled.length === imgs.length) {
      jumpTo(section);
      history.replaceState(null, '', '#project-' + key);
      return;
    }

    openOverlay();

    var done = 0;
    var jobs = imgs.map(function (img) {
      return ready(img).then(function () {
        done++;
        setProgress(done / imgs.length);
      });
    });

    var finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      jumpTo(section);
      history.replaceState(null, '', '#project-' + key);
      /* Two frames so the new position is painted before the overlay lifts.
         rAF stops in background tabs, so a short timer guarantees the close
         either way — the overlay must never be able to get stuck. */
      var closed = false;
      function doClose() { if (closed) return; closed = true; closeOverlay(); }
      requestAnimationFrame(function () { requestAnimationFrame(doClose); });
      setTimeout(doClose, 120);
    }

    Promise.all(jobs).then(finish);
    setTimeout(finish, TRANSITION_CAP);      // never hang on a stalled image
  }

  function wireProjectTransition() {
    overlay = document.getElementById('projectTransition');
    if (!overlay) return;
    fillEl = overlay.querySelector('.transition__fill');
    barEl = overlay.querySelector('.transition__bar');

    /* Covers the three navs and the Index cards — every link that targets a
       project section, so the rule is the same wherever it is triggered. */
    document.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a[href^="#project-"]') : null;
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      var key = a.getAttribute('href').replace('#project-', '');
      if (!PROJECTS[key]) return;
      e.preventDefault();
      goToProject(key);
    });
  }

  /* ---------------------------------------------------------
     Logo / Back to the top -> Home
     --------------------------------------------------------- */
  function wireHome() {
    document.querySelectorAll('[data-nav-home]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        /* Instant, like the project jumps. Smooth-scrolling back from deep
           inside project 04 would animate across ~40,000px of slides — the
           same fly-through the project transition exists to avoid. */
        scrollToInstant(0);
        if (history.replaceState) history.replaceState(null, '', location.pathname);
        if (typeof refreshProgress === 'function') refreshProgress();
      });
    });
  }

  function wireScrollPreload() {
    window.addEventListener('scroll', scheduleScan, { passive: true });
    window.addEventListener('resize', scheduleScan, { passive: true });
    window.addEventListener('load', scheduleScan);
  }

  function init() {
    wireHeroCover();
    wireStartAtTop();
    wireScrollPreload();
    buildSlides();
    wireLinks();
    wireMobileNav();
    wireHome();
    wireProjectTransition();
    wireProgress();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
