/* ============================================================
   Falcon deck coach — voice widget (ElevenLabs)
   Ported from the alliances notebook widget: Pill (desktop idle) +
   Dock (desktop active) + Toast (mobile). Builds its own DOM and
   appends it to <body>, so it's independent of the slide viewer.

   It drives the deck through window.DeckViewer (defined in app.js) via
   four client tools the agent calls — go_to_slide, next_slide,
   previous_slide, current_slide — plus end_session. When the presenter
   navigates manually, it sends the agent a contextual update so the
   coach always knows which slide is on screen.

   The ElevenLabs agent id is set in VOICE_AGENT_ID below. Agent config
   (system prompt / greeting / knowledge base, the four client tools, and
   the origin allowlist) lives on the ElevenLabs dashboard. See
   ../elevenlabs/falcon/elevenlabs.md.

   Must be served over http(s) — file:// blocks ES-module imports, so the
   vendored SDK won't load from a double-clicked file.
   ============================================================ */
(function () {
  'use strict';
  var VOICE_AGENT_ID = 'agent_0801m424tv5hfqk8sqd50100wrqg'; // ElevenLabs agent id — Falcon deck coach
  var SDK_URL = './vendor/elevenlabs-client-0.15.2.js';      // vendored, pinned, same-origin (no runtime CDN)

  var isMobile = /Mobi|Android.*Mobile|iPhone|iPod/i.test(navigator.userAgent || '');
  var LABELS = { idle: 'Ask Anything', connecting: 'Connecting…', listening: 'Listening…', speaking: 'Speaking…', error: 'Unavailable', 'mic-blocked': 'Allow Mic' };
  var WAVE_BINS = [3, 4, 5, 6, 8, 10, 12, 14, 18, 22, 27, 33, 40, 49, 60, 74, 91, 112, 137, 169];
  var DOCK_BINS = [3, 5, 8, 12, 18, 27, 40, 60, 91, 137];
  var MIN_H = 3, MAX_H = 22, SMOOTH = 0.35;

  var status = 'idle', conversation = null, sessionGen = 0, sdkPromise = null;
  var ending = false, endingTimer = null, previewing = false, toastReady = false;
  var raf = null, dockRaf = null;
  var smoothed = new Float32Array(20).fill(4), dockSmoothed = new Float32Array(10).fill(4);

  function deck() { return window.DeckViewer || null; }

  /* ---- build DOM once ---- */
  var MIC = '<svg class="va-mic-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect fill="rgba(255,255,255,.85)" x="9" y="1" width="6" height="13" rx="3"/><path stroke="rgba(255,255,255,.85)" stroke-width="1.8" stroke-linecap="round" d="M5 10v2a7 7 0 0 0 14 0v-2"/><line stroke="rgba(255,255,255,.85)" stroke-width="1.8" stroke-linecap="round" x1="12" y1="19" x2="12" y2="23"/><line stroke="rgba(255,255,255,.85)" stroke-width="1.8" stroke-linecap="round" x1="8" y1="23" x2="16" y2="23"/></svg>';
  var root = document.createElement('div');
  root.id = 'voice';
  root.innerHTML =
    '<div class="va-wrap"><div class="va-pill idle-orb" role="button" tabindex="0" aria-label="Open deck coach"><div class="va-pill-orb">' + MIC + '</div><span class="va-pill-label">Ask Anything</span></div></div>' +
    '<div class="va-dock" role="status" aria-label="Deck coach active"><div class="va-dock-handle"><span></span></div><div class="va-dock-row"><div class="va-dock-mic">' + MIC + '</div><span class="va-dock-label"></span><div class="va-dock-wave">' + '<span></span>'.repeat(10) + '</div><button class="va-dock-close" aria-label="End session">×</button></div></div>' +
    '<div class="va-toast" role="button" tabindex="0" aria-label="Open deck coach"><div class="va-toast-handle"><span></span></div><div class="va-toast-card"><div class="va-toast-card-row"><div class="va-toast-orb">' + MIC + '</div><div class="va-toast-card-text"><span class="va-toast-card-primary">Deck Coach</span><span class="va-toast-card-secondary">(Swipe ↑ to speak)</span></div></div><div class="va-toast-wave">' + '<span></span>'.repeat(20) + '</div><button class="va-toast-close" aria-label="End session">×</button></div></div>';
  document.body.appendChild(root);

  var wrap = root.querySelector('.va-wrap'), pill = root.querySelector('.va-pill'), pillLabel = root.querySelector('.va-pill-label');
  var dock = root.querySelector('.va-dock'), dockLabel = root.querySelector('.va-dock-label'), dockWave = root.querySelector('.va-dock-wave'), dockClose = root.querySelector('.va-dock-close');
  var toast = root.querySelector('.va-toast'), toastWave = root.querySelector('.va-toast-wave'), toastClose = root.querySelector('.va-toast-close'), toastSecondary = root.querySelector('.va-toast-card-secondary');

  function isOn() { return status === 'connecting' || status === 'listening' || status === 'speaking'; }

  function apply() {
    var err = status === 'error' || status === 'mic-blocked';
    wrap.className = 'va-wrap' + ((!isMobile && !isOn()) ? '' : ' va-hidden');
    pill.className = 'va-pill' + (status === 'idle' ? ' idle-orb' : '') + (err ? ' error' : '') + (previewing ? ' preview-expand' : '');
    pillLabel.textContent = LABELS[status] || LABELS.idle;
    dock.className = 'va-dock' + ((isOn() && !isMobile) ? ' va-dock--visible' : '') + (status === 'connecting' ? ' connecting' : '') + (status === 'speaking' ? ' speaking' : '') + (status === 'listening' ? ' listening' : '');
    dockLabel.textContent = LABELS[status] || '';
    toast.className = 'va-toast va-toast--visible' + ((toastReady && !isOn()) ? ' va-toast--ready' : '') + (isOn() ? ' session-active active' : '') + (status === 'connecting' ? ' connecting' : '') + (status === 'speaking' ? ' speaking' : '') + (err ? ' error' : '');
    toastSecondary.textContent = isOn() ? '(Swipe ↓ to end)' : (status === 'mic-blocked' ? 'Allow microphone access' : '(Swipe ↑ to speak)');
    // Hide the slide-nav dock while a session is live, so it never collides with the coach dock/toast.
    document.body.classList.toggle('va-session', isOn());
  }
  function setStatus(s) { status = s; apply(); }

  /* ---- wave animation (reads live mic / agent frequency data from the SDK) ---- */
  function makeWave(waveEl, bins, buf, isToast) {
    function stop() { var h = isToast ? raf : dockRaf; if (h) { cancelAnimationFrame(h); if (isToast) raf = null; else dockRaf = null; } buf.fill(4); if (waveEl) waveEl.querySelectorAll('span').forEach(function (b) { b.style.height = '4px'; }); }
    function start() {
      if (!waveEl) return; var bars = waveEl.querySelectorAll('span'); if (!bars.length) return;
      var tick = function () {
        if (!isOn()) { stop(); return; }
        var f = null;
        try { f = status === 'speaking' ? (conversation && conversation.getOutputByteFrequencyData && conversation.getOutputByteFrequencyData()) : (conversation && conversation.getInputByteFrequencyData && conversation.getInputByteFrequencyData()); } catch (e) { f = null; }
        if (f && f.length) { bins.forEach(function (bin, i) { var raw = bin < f.length ? f[bin] : 0; var target = MIN_H + (raw / 255) * (MAX_H - MIN_H); buf[i] = buf[i] * (1 - SMOOTH) + target * SMOOTH; if (bars[i]) bars[i].style.height = buf[i].toFixed(1) + 'px'; }); }
        var id = requestAnimationFrame(tick); if (isToast) raf = id; else dockRaf = id;
      };
      var id = requestAnimationFrame(tick); if (isToast) raf = id; else dockRaf = id;
    }
    return { start: start, stop: stop };
  }
  var toastWaveAnim = makeWave(toastWave, WAVE_BINS, smoothed, true);
  var dockWaveAnim = makeWave(dockWave, DOCK_BINS, dockSmoothed, false);
  function startWaves() { if (isMobile) toastWaveAnim.start(); else dockWaveAnim.start(); }
  function stopWaves() { toastWaveAnim.stop(); dockWaveAnim.stop(); }

  /* ---- keep the agent aware of which slide is on screen ---- */
  function notifySlide() {
    if (conversation && typeof conversation.sendContextualUpdate === 'function') {
      var d = deck(); if (!d) return;
      var n = d.current();
      try { conversation.sendContextualUpdate('The presenter is now on slide ' + n + ' of ' + d.count + ': ' + d.title(n) + '.'); } catch (e) {}
    }
  }
  // Fire a contextual update whenever the presenter navigates manually (arrows / dock / swipe).
  if (deck() && deck().onChange) { deck().onChange(function () { notifySlide(); }); }

  /* ---- client tools (handlers for the ElevenLabs agent's tool calls) ---- */
  // Every tool is wrapped so it ALWAYS resolves to a string and NEVER throws into the SDK.
  // With window.__voiceDebug = true it logs each call + result.
  function tool(name, fn) {
    return function (args) {
      return Promise.resolve().then(function () { return fn(args || {}); }).then(function (r) {
        if (typeof r !== 'string') r = JSON.stringify(r);
        if (window.__voiceDebug) console.log('[voice]', name, args || {}, '→', r);
        return r;
      }, function (e) {
        if (window.__voiceDebug) console.warn('[voice]', name, 'failed', e);
        return 'The ' + name + ' action hit an error and did not complete.';
      });
    };
  }
  function where(n) { var d = deck(); return 'Now on slide ' + n + ' of ' + d.count + ': ' + d.title(n) + '.'; }
  var clientTools = {
    go_to_slide: tool('go_to_slide', function (a) {
      var d = deck(); if (!d) return 'The deck is not ready yet.';
      var raw = (a.slide != null) ? a.slide : (a.number != null ? a.number : a.index);
      var n = parseInt(raw, 10);
      if (isNaN(n)) return 'I could not tell which slide you meant — say a number from 1 to ' + d.count + '.';
      return where(d.goToSlide(n));
    }),
    next_slide: tool('next_slide', function () { var d = deck(); if (!d) return 'The deck is not ready yet.'; return where(d.next()); }),
    previous_slide: tool('previous_slide', function () { var d = deck(); if (!d) return 'The deck is not ready yet.'; return where(d.prev()); }),
    current_slide: tool('current_slide', function () { var d = deck(); if (!d) return 'The deck is not ready yet.'; var n = d.current(); return 'The presenter is on slide ' + n + ' of ' + d.count + ': ' + d.title(n) + '.'; }),
    end_session: tool('end_session', function () { ending = true; setTimeout(function () { if (ending) endSession(); }, 15000); return 'Ending the session.'; })
  };

  /* ---- session lifecycle ---- */
  function startSession() {
    if (conversation || status === 'connecting') return;
    if (!VOICE_AGENT_ID) { console.warn('[voice] VOICE_AGENT_ID is empty — set the ElevenLabs agent id in voice.js.'); setStatus('error'); setTimeout(function () { if (status === 'error') setStatus('idle'); }, 4000); return; }
    if (typeof navigator.onLine !== 'undefined' && !navigator.onLine) { setStatus('error'); setTimeout(function () { if (status === 'error') setStatus('idle'); }, 4000); return; }
    sessionGen++; var gen = sessionGen; ending = false; setStatus('connecting');
    if (!sdkPromise) sdkPromise = import(SDK_URL);
    sdkPromise.then(function (mod) {
      if (gen !== sessionGen) return;
      var d = deck();
      return mod.Conversation.startSession({
        agentId: VOICE_AGENT_ID,
        dynamicVariables: { total_slides: String(d ? d.count : 23), current_slide: String(d ? d.current() : 1) },
        onConnect: function () { if (gen !== sessionGen) return; setStatus('listening'); notifySlide(); },
        onDisconnect: function () { if (gen !== sessionGen) return; stopWaves(); var wasSpeaking = status === 'speaking'; var done = function () { conversation = null; setStatus('idle'); }; wasSpeaking ? setTimeout(done, 2000) : done(); },
        onModeChange: function (m) { if (gen !== sessionGen) return; var mode = m && m.mode; setStatus(mode === 'speaking' ? 'speaking' : 'listening'); if (mode === 'speaking' && endingTimer) { clearTimeout(endingTimer); endingTimer = null; } if (mode === 'listening' && ending) { endingTimer = setTimeout(function () { if (ending) endSession(); }, 1500); } },
        onStatusChange: function (s) { if (gen !== sessionGen) return; if (s && s.status === 'connecting') setStatus('connecting'); },
        onError: function () { if (gen !== sessionGen) return; conversation = null; setStatus('error'); setTimeout(function () { if (status === 'error') setStatus('idle'); }, 4000); },
        clientTools: clientTools
      });
    }).then(function (conv) {
      if (!conv) return;
      if (gen !== sessionGen) { try { conv.endSession(); } catch (e) {} return; }
      conversation = conv; startWaves();
    }).catch(function (err) {
      if (gen !== sessionGen) return;
      sdkPromise = null;
      var micDenied = err && (err.name === 'NotAllowedError' || err.name === 'NotFoundError' || (err.message && /microphone|permission|not allowed/i.test(err.message)));
      if (micDenied) { setStatus('mic-blocked'); }
      else { console.error('[voice] start failed:', err); setStatus('error'); setTimeout(function () { if (status === 'error') setStatus('idle'); }, 4000); }
    });
  }
  function endSession() {
    sessionGen++; ending = false; stopWaves();
    if (endingTimer) { clearTimeout(endingTimer); endingTimer = null; }
    var conv = conversation; conversation = null;
    if (conv) { try { conv.endSession(); } catch (e) {} }
    setStatus('idle');
  }
  function toggle() { if (isOn()) endSession(); else startSession(); }

  /* ---- events ---- */
  pill.addEventListener('click', function () { if (status === 'idle' || status === 'mic-blocked') startSession(); });
  pill.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (status === 'idle' || status === 'mic-blocked') startSession(); } });
  dock.addEventListener('click', endSession);
  dockClose.addEventListener('click', function (e) { e.stopPropagation(); endSession(); });
  toast.addEventListener('click', function () { if (isOn()) return; if (status === 'idle' || status === 'mic-blocked') startSession(); });
  toastClose.addEventListener('click', function (e) { e.stopPropagation(); if (isOn()) endSession(); });
  if (isMobile) {
    var sy = 0, dragging = false;
    toast.addEventListener('touchstart', function (e) { if (e.target.closest('.va-toast-close')) return; sy = e.touches[0].clientY; dragging = true; }, { passive: true });
    toast.addEventListener('touchend', function (e) { if (!dragging) return; dragging = false; var dy = e.changedTouches[0].clientY - sy; if (dy < -45) { if (!isOn()) startSession(); } else if (dy > 45) { if (isOn()) endSession(); } }, { passive: true });
  }

  // Expose a toggle (for a future on-page "Talk to the deck" button) and the tools for console testing.
  window.__voiceToggle = toggle;
  window.__voiceTools = clientTools;

  // One-time desktop nudge: briefly expand the pill label a few seconds after load.
  if (!isMobile) { setTimeout(function () { if (status !== 'idle') return; previewing = true; apply(); setTimeout(function () { previewing = false; apply(); }, 4500); }, 5000); }

  // Only fires on a real document teardown.
  window.addEventListener('pagehide', function () { if (conversation) { try { conversation.endSession(); } catch (e) {} conversation = null; } });

  // Mobile toast starts in its "ready" peek state so the swipe affordance is visible.
  if (isMobile) toastReady = true;
  apply();
})();
