/* ============================================================
   Falcon Deck — presentation prep viewer + voice coach

   • Shows the deck as slide images with simple prev/next nav.
   • A voice coach (ElevenLabs) can walk the presenter through the
     deck AND drive the slides, via "client tools" the agent calls:
         go_to_slide({ slide })  next_slide()  previous_slide()  current_slide()
     It is also told the current slide on connect and whenever the
     user navigates manually (sendContextualUpdate).

   TO ACTIVATE THE VOICE COACH:
     1. Create an ElevenLabs Conversational AI agent for this deck.
        - Put the slide content + your prep/talking notes in its
          Knowledge Base (keep sensitive notes there, NOT on this page).
     2. Register these Client Tools on the agent (names must match):
          go_to_slide      — param: slide (number)
          next_slide       — (no params)
          previous_slide   — (no params)
          current_slide    — (no params)
     3. Paste the agent id into AGENT_ID below.
   ============================================================ */
(function () {
  // ── Config ────────────────────────────────────────────────
  var SLIDE_COUNT = 23;
  var SLIDE_PATH  = 'slides/';
  function slideSrc(n) { return SLIDE_PATH + 'slide-' + String(n).padStart(2, '0') + '.png'; }

  // Leave '' until the ElevenLabs deck-coach agent exists (see header).
  var AGENT_ID = '';

  // ── Slide state ───────────────────────────────────────────
  var current = 1;
  var img       = document.getElementById('slide');
  var counter   = document.getElementById('counter');
  var prevBtn   = document.getElementById('prevBtn');
  var nextBtn   = document.getElementById('nextBtn');
  var preloaded = {};

  function clamp(n) { return Math.max(1, Math.min(SLIDE_COUNT, n)); }

  function preload(n) {
    if (n >= 1 && n <= SLIDE_COUNT && !preloaded[n]) {
      var i = new Image(); i.src = slideSrc(n); preloaded[n] = i;
    }
  }

  function render() {
    img.src = slideSrc(current);
    img.alt = 'Slide ' + current + ' of ' + SLIDE_COUNT;
    counter.textContent = current + ' / ' + SLIDE_COUNT;
    prevBtn.disabled = current <= 1;
    nextBtn.disabled = current >= SLIDE_COUNT;
    preload(current + 1);
    preload(current - 1);
    notifyAgentSlide();
  }

  function goToSlide(n) { var c = clamp(n); if (c !== current) { current = c; render(); } else { current = c; } }
  function next() { goToSlide(current + 1); }
  function prev() { goToSlide(current - 1); }

  nextBtn.addEventListener('click', next);
  prevBtn.addEventListener('click', prev);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); }
    else if (e.key === 'Home') { e.preventDefault(); goToSlide(1); }
    else if (e.key === 'End')  { e.preventDefault(); goToSlide(SLIDE_COUNT); }
  });

  // ── Voice coach (ElevenLabs) ──────────────────────────────
  var btn        = document.getElementById('voice-btn');
  var toast      = document.getElementById('toast');
  var status     = 'idle';   // idle | connecting | listening | speaking | error
  var conversation = null;
  var sessionGen = 0;
  var sdkPromise = AGENT_ID
    ? import('https://cdn.jsdelivr.net/npm/@elevenlabs/client@0.15.2/+esm')
    : null;

  function isActive(s) { return s === 'listening' || s === 'speaking'; }
  function renderBtn() {
    var visual = status === 'connecting' ? 'connecting' : (isActive(status) ? 'active' : 'idle');
    btn.dataset.status = visual;
    btn.setAttribute('aria-label', visual === 'active' ? 'End voice coach' : 'Start voice coach');
  }
  function setStatus(s) { status = s; renderBtn(); }

  var toastTimer;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 3200);
  }

  // Keep the agent aware of which slide the presenter is viewing.
  function notifyAgentSlide() {
    if (conversation && typeof conversation.sendContextualUpdate === 'function') {
      try {
        conversation.sendContextualUpdate('The presenter is now viewing slide ' + current + ' of ' + SLIDE_COUNT + '.');
      } catch (e) {}
    }
  }

  // Tools the agent invokes to drive the deck. Each returns a short
  // string the agent can read back as confirmation.
  var clientTools = {
    go_to_slide: function (params) {
      var raw = params && (params.slide != null ? params.slide : (params.number != null ? params.number : params.index));
      goToSlide(parseInt(raw, 10) || current);
      return 'Now showing slide ' + current + ' of ' + SLIDE_COUNT + '.';
    },
    next_slide: function () { next(); return 'Now showing slide ' + current + ' of ' + SLIDE_COUNT + '.'; },
    previous_slide: function () { prev(); return 'Now showing slide ' + current + ' of ' + SLIDE_COUNT + '.'; },
    current_slide: function () { return 'The presenter is on slide ' + current + ' of ' + SLIDE_COUNT + '.'; }
  };

  async function startSession() {
    if (!AGENT_ID) { showToast('Voice coach coming soon — add the agent to enable it.'); return; }
    if (conversation || status === 'connecting') return;

    if (typeof navigator.onLine !== 'undefined' && !navigator.onLine) {
      setStatus('error');
      setTimeout(function () { if (status === 'error') setStatus('idle'); }, 2500);
      return;
    }

    sessionGen++;
    var myGen = sessionGen;
    setStatus('connecting');

    try {
      if (!sdkPromise) sdkPromise = import('https://cdn.jsdelivr.net/npm/@elevenlabs/client@0.15.2/+esm');
      var mod;
      try { mod = await sdkPromise; } catch (e) { sdkPromise = null; throw e; }
      var Conversation = mod.Conversation;
      if (myGen !== sessionGen) return;

      var conv = await Conversation.startSession({
        agentId: AGENT_ID,
        clientTools: clientTools,

        // The agent can use these in its prompt (e.g. "{{current_slide}} of {{total_slides}}").
        dynamicVariables: {
          total_slides: String(SLIDE_COUNT),
          current_slide: String(current)
        },

        onConnect: function () {
          if (myGen !== sessionGen) return;
          setStatus('listening');
          notifyAgentSlide();
        },
        onDisconnect: function () {
          if (myGen !== sessionGen) return;
          conversation = null;
          setStatus('idle');
        },
        onModeChange: function (data) {
          if (myGen !== sessionGen) return;
          setStatus(data && data.mode === 'speaking' ? 'speaking' : 'listening');
        },
        onError: function () {
          if (myGen !== sessionGen) return;
          conversation = null;
          setStatus('error');
          setTimeout(function () { if (status === 'error') setStatus('idle'); }, 2500);
        }
      });

      if (myGen !== sessionGen) { try { conv.endSession(); } catch (e) {} return; }
      conversation = conv;
      notifyAgentSlide();

    } catch (e) {
      if (myGen !== sessionGen) return;
      conversation = null;
      setStatus('error');
      setTimeout(function () { if (status === 'error') setStatus('idle'); }, 2500);
    }
  }

  function endSession() {
    sessionGen++;
    var conv = conversation;
    conversation = null;
    if (conv) { try { conv.endSession(); } catch (e) {} }
    setStatus('idle');
  }

  btn.addEventListener('click', function () {
    if (isActive(status)) endSession();
    else if (status === 'idle' || status === 'error') startSession();
    // 'connecting' → ignore taps
  });

  if (!AGENT_ID) btn.classList.add('pending');

  // ── Init ──────────────────────────────────────────────────
  render();
  renderBtn();
})();
