/* ============================================================
   Proofpoint learning agent — ElevenLabs voice session

   Single circular call button below the orb:
     idle        → phone icon      (press to start)
     connecting  → spinner
     listening   → red end-call    (press to end)
     speaking    → red end-call
     error       → silently resets to idle (single-user; no error UI)
   ============================================================ */
(function () {
  // ─── Replace with your ElevenLabs Agent ID ───────────────────────────────
  var AGENT_ID = 'agent_8501kwhz7amrft48eb44mtmh2gyy';
  // ─────────────────────────────────────────────────────────────────────────

  var btn = document.getElementById('voice-btn');

  var status = 'idle'; // idle | connecting | listening | speaking | error
  var conversation = null;
  var sessionGen = 0;  // bumped on every start/end so stale callbacks bail out

  // Preload the SDK at page load so the first tap is instant (keeps the mic
  // request inside the tap gesture on mobile).
  var sdkPromise = import('https://cdn.jsdelivr.net/npm/@elevenlabs/client@0.15.2/+esm');

  function isActive(s) { return s === 'listening' || s === 'speaking'; }

  function render() {
    // Map internal status to the three visible button states.
    var visual = status === 'connecting' ? 'connecting' : (isActive(status) ? 'active' : 'idle');
    btn.dataset.status = visual;
    btn.setAttribute('aria-label', visual === 'active' ? 'End call' : 'Start call');
  }

  function setStatus(s) { status = s; render(); }

  async function startSession() {
    if (conversation || status === 'connecting') return;

    // No network at all — fail fast.
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

      if (myGen !== sessionGen) return; // ended/restarted while SDK loaded

      var conv = await Conversation.startSession({
        agentId: AGENT_ID,

        // Resolve {{current_date}} / {{current_time}} in the agent's prompt.
        dynamicVariables: {
          current_date: new Date().toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
          }),
          current_time: new Date().toLocaleTimeString('en-US', {
            hour: 'numeric', minute: '2-digit', hour12: true
          })
        },

        onConnect: function () {
          if (myGen !== sessionGen) return;
          setStatus('listening');
        },

        onDisconnect: function () {
          if (myGen !== sessionGen) return;
          conversation = null;
          setStatus('idle');
        },

        // Agent switches between listening and speaking — both read as "active".
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

      // Session established — make sure it wasn't cancelled while connecting.
      if (myGen !== sessionGen) {
        try { conv.endSession(); } catch (e) {}
        return;
      }
      conversation = conv;

    } catch (e) {
      if (myGen !== sessionGen) return;
      conversation = null;
      // Mic denial and every other failure reset silently to idle.
      setStatus('error');
      setTimeout(function () { if (status === 'error') setStatus('idle'); }, 2500);
    }
  }

  function endSession() {
    sessionGen++; // cancel any in-flight connection
    var conv = conversation;
    conversation = null;
    if (conv) {
      try { conv.endSession(); } catch (e) {}
    }
    setStatus('idle');
  }

  // Single click handler — reliable for both mouse and touch, and a real
  // <button> fires this on Enter/Space too, so no separate key/touch handlers.
  btn.addEventListener('click', function () {
    if (isActive(status)) {
      endSession();
    } else if (status === 'idle' || status === 'error') {
      startSession();
    }
    // 'connecting' → ignore taps until it resolves
  });

  render();
})();
