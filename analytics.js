/* ============================================================
   analytics.js — jchowlabs.dev lightweight analytics client.

   Posts events to the proofpoint-analytics Cloudflare Worker.
   No cookies. Anonymous per-tab session id in sessionStorage.
   Everything fails silently — analytics must never break the site.

   Auto-fires:
     page_view    on load
     session_end  on leave (dwell time on this page)

   Voice hooks (call from each site's ElevenLabs lifecycle):
     window.jcl.voiceStart()   on onConnect
     window.jcl.voiceEnd()     on onDisconnect
     window.jcl.voiceError()   on onError / mic denied
   ============================================================ */
(function () {
  'use strict';

  var ENDPOINT = 'https://proofpoint-analytics.jchow-a27.workers.dev/api/event';

  /* ---- anonymous per-tab session id ---- */
  function sid() {
    try {
      var k = '_jcl_sid', id = sessionStorage.getItem(k);
      if (!id) {
        id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
          : String(Date.now()) + '-' + Math.random().toString(16).slice(2);
        sessionStorage.setItem(k, id);
      }
      return id;
    } catch (e) { return null; }
  }

  /* ---- device + bot detection (client-side, basic) ---- */
  function device() {
    var ua = navigator.userAgent || '';
    if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
    if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile|wpdesktop/i.test(ua)) return 'mobile';
    return 'desktop';
  }

  function bot() {
    var ua = (navigator.userAgent || '').toLowerCase();
    var ai = ['gptbot', 'chatgpt-user', 'claudebot', 'anthropic', 'cohere-ai', 'perplexitybot', 'bytespider', 'oai-searchbot'];
    var cr = ['bot', 'crawl', 'spider', 'slurp', 'mediapartners', 'facebookexternalhit', 'linkedinbot', 'twitterbot',
      'whatsapp', 'telegrambot', 'discordbot', 'bingpreview', 'googlebot', 'yandex', 'baidu', 'duckduckbot', 'ccbot', 'amazonbot'];
    var isAi = ai.some(function (p) { return ua.indexOf(p) > -1; });
    var isCr = !isAi && cr.some(function (p) { return ua.indexOf(p) > -1; });
    var isHl = !isAi && !isCr && (navigator.webdriver === true || !navigator.languages || navigator.languages.length === 0);
    var is = isAi || isCr || isHl;
    return { is_bot: is ? 1 : 0, bot_category: isAi ? 'ai_agent' : isCr ? 'crawler' : isHl ? 'headless_browser' : null };
  }

  /* ---- core emitter ---- */
  function send(type, opts) {
    try {
      opts = opts || {};
      var b = bot();
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: type,
          slug: opts.slug || location.pathname,
          session_id: sid(),
          device_type: device(),
          referrer: document.referrer || null,
          user_agent: navigator.userAgent || null,
          is_bot: b.is_bot,
          bot_category: b.bot_category,
          payload: opts.payload || null
        }),
        keepalive: true
      }).catch(function () {});
    } catch (e) { /* never break the site */ }
  }

  /* ---- page view + dwell time ---- */
  var pageStart = Date.now();
  var ended = false;
  function endPage() {
    if (ended) return; ended = true;
    send('session_end', { payload: { duration_ms: Date.now() - pageStart } });
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') endPage();
  });
  window.addEventListener('pagehide', endPage);

  send('page_view');

  /* ---- voice lifecycle hooks ---- */
  var voiceTs = 0;
  window.jcl = {
    voiceStart: function () { voiceTs = Date.now(); send('voice_start'); },
    voiceEnd: function () {
      var d = voiceTs ? Date.now() - voiceTs : 0; voiceTs = 0;
      send('voice_end', d ? { payload: { duration_ms: d } } : {});
    },
    voiceError: function () { voiceTs = 0; send('voice_error'); },
    track: send
  };
})();
