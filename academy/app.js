/* ============================================================
   Academy Deck — presentation viewer

   • Shows the deck as slide images with prev/next nav, keyboard, and
     mobile swipe.
   • Exposes window.DeckViewer so the voice coach (voice.js) can drive
     the deck (go_to_slide / next / previous / current) and stay in
     sync — the coach lives in voice.js, not here.

   This is the "Sales Academy" GTM deck (Sept 2026) — 20 slides.
   ============================================================ */
(function () {
  // ── Config ────────────────────────────────────────────────
  var SLIDE_COUNT = 20;
  var SLIDE_PATH  = 'slides/';
  function slideSrc(n) { return SLIDE_PATH + 'slide-' + String(n).padStart(2, '0') + '.png'; }

  // Short slide titles — used for the <img> alt text and for the voice
  // coach's spoken confirmations + contextual updates ("…slide 8: why Proofpoint…").
  var SLIDE_TITLES = [
    "Title: Proofpoint's GTM — Sales Academy (Sept 2026)",
    'Platform for securing the agentic workspace',
    'AI introduces new security risk and business risk',
    'Where AI risks are taking shape',
    'Platform for securing the agentic workspace: architecture',
    'Chapter: Protect against AI threats — prevent advanced attacks',
    'Four outcomes the new reality requires',
    'Why Proofpoint Collaboration Security is the ideal solution',
    "How Proofpoint's multi-model behavioral AI works",
    "How Proofpoint's multi-model behavioral AI works: trained, enriched, self-learning",
    'Comprehensive protection for the agentic workspace',
    'Chapter: Safe adoption of AI — control data risks, govern AI behavior',
    'Proofpoint: staying ahead of AI risk',
    'Two security conversations, one customer problem',
    'Data Security solutions deep dive: mapping to customer needs',
    'Why Proofpoint?',
    'Thank you',
    'Appendix',
    'Key discovery questions',
    "Endpoint and network solutions can't solve this"
  ];
  function titleOf(n) { return SLIDE_TITLES[n - 1] || ('Slide ' + n); }

  // ── Slide state ───────────────────────────────────────────
  var current = 1;
  var img       = document.getElementById('slide');
  var counter   = document.getElementById('counter');
  var prevBtn   = document.getElementById('prevBtn');
  var nextBtn   = document.getElementById('nextBtn');
  var preloaded = {};
  var changeCb  = null;   // voice.js registers here to hear manual navigation

  function clamp(n) { return Math.max(1, Math.min(SLIDE_COUNT, n)); }

  function preload(n) {
    if (n >= 1 && n <= SLIDE_COUNT && !preloaded[n]) {
      var i = new Image(); i.src = slideSrc(n); preloaded[n] = i;
    }
  }

  function render() {
    img.src = slideSrc(current);
    img.alt = 'Slide ' + current + ' of ' + SLIDE_COUNT + ': ' + titleOf(current);
    counter.textContent = current + ' / ' + SLIDE_COUNT;
    prevBtn.disabled = current <= 1;
    nextBtn.disabled = current >= SLIDE_COUNT;
    preload(current + 1);
    preload(current - 1);
    if (changeCb) { try { changeCb(current); } catch (e) {} }
  }

  // All navigation funnels through here. Returns the slide actually shown.
  function goToSlide(n) { var c = clamp(n); if (c !== current) { current = c; render(); } return current; }
  function next() { return goToSlide(current + 1); }
  function prev() { return goToSlide(current - 1); }

  nextBtn.addEventListener('click', next);
  prevBtn.addEventListener('click', prev);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); }
    else if (e.key === 'Home') { e.preventDefault(); goToSlide(1); }
    else if (e.key === 'End')  { e.preventDefault(); goToSlide(SLIDE_COUNT); }
  });

  // ── Touch swipe (mobile): swipe left → next slide, swipe right → previous ──
  // Passive listeners + a single-touch guard, so pinch-zoom and taps are unaffected.
  var stage = document.querySelector('.stage');
  if (stage) {
    var tsX = 0, tsY = 0, tsT = 0, tracking = false;
    stage.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { tracking = false; return; }
      var t = e.touches[0];
      tsX = t.clientX; tsY = t.clientY; tsT = Date.now(); tracking = true;
    }, { passive: true });
    stage.addEventListener('touchend', function (e) {
      if (!tracking) return;
      tracking = false;
      var t = e.changedTouches[0];
      var dx = t.clientX - tsX, dy = t.clientY - tsY, dt = Date.now() - tsT;
      // Require a deliberate, mostly-horizontal flick (not a tap, long-press, or vertical drag).
      if (dt < 800 && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) next(); else prev();
      }
    }, { passive: true });
  }

  // ── Deck API for the voice coach (voice.js) ───────────────
  // The coach's client tools call these; onChange lets it hear manual
  // navigation (arrows / dock / swipe) so it can keep the agent in sync.
  window.DeckViewer = {
    count: SLIDE_COUNT,
    current: function () { return current; },
    title: function (n) { return titleOf(n == null ? current : clamp(n)); },
    goToSlide: goToSlide,
    next: next,
    prev: prev,
    onChange: function (cb) { changeCb = cb; }
  };

  // ── Init ──────────────────────────────────────────────────
  render();
})();
