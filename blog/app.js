/* ============================================================
   Blog Generator — UI shell behavior (no model wired yet)

   Drives the chat *surface* only:
   • On load, plays a short "typing → greeting" entrance so the AI
     appears to greet the visitor. The greeting itself is static
     content pre-seeded in index.html (no model call) — the typing
     dots are purely a presentational entrance.
   • Sending echoes a user bubble (there is NO assistant reply yet).
   • "New blog" replays the greeting entrance.
   • The blog-card Copy button works; Download/voice are wired later.
   ============================================================ */
(function () {
  'use strict';

  var thread = document.getElementById('thread');
  var form   = document.getElementById('composer');
  var input  = document.getElementById('input');
  var micBtn = document.getElementById('micBtn');
  var newBtn = document.getElementById('newBtn');

  // Snapshot the greeting markup before we touch the thread, so we can
  // replay it on load and on "New blog".
  var greetingHTML = document.getElementById('greeting').outerHTML;

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- textarea auto-grow ---- */
  function autoGrow() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
  }
  input.addEventListener('input', autoGrow);

  /* ---- scroll helper ---- */
  function scrollToEnd() { thread.scrollTop = thread.scrollHeight; }

  /* ---- build the typing indicator turn ---- */
  function typingTurn() {
    var t = document.createElement('div');
    t.className = 'turn assistant';
    t.innerHTML =
      '<div class="avatar" aria-hidden="true"></div>' +
      '<div class="typing" role="status" aria-label="Assistant is typing">' +
      '<span></span><span></span><span></span></div>';
    return t;
  }

  /* ---- greeting entrance: typing dots, then the greeting fades in ----
     This is the "illusion" — on every load / reset the AI appears to
     greet the visitor, then waits. No network, no model. */
  function showGreeting() {
    thread.innerHTML = '';

    function reveal() {
      var tmp = document.createElement('div');
      tmp.innerHTML = greetingHTML;
      var g = tmp.firstElementChild;
      if (!reduceMotion) g.classList.add('enter');
      thread.appendChild(g);
      scrollToEnd();
    }

    if (reduceMotion) { reveal(); return; }

    var typing = typingTurn();
    thread.appendChild(typing);
    scrollToEnd();
    setTimeout(function () { typing.remove(); reveal(); }, 750);
  }

  /* ---- append a user turn (pure UI echo — no model reply yet) ---- */
  function addUserMessage(text) {
    var turn = document.createElement('div');
    turn.className = 'turn user' + (reduceMotion ? '' : ' enter');
    var bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = text;
    turn.appendChild(bubble);
    thread.appendChild(turn);
    scrollToEnd();
  }

  /* ---- send ---- */
  function send() {
    var text = input.value.trim();
    if (!text) return;
    addUserMessage(text);
    input.value = '';
    autoGrow();
    input.focus();
    // The assistant response gets wired to the Cloudflare Worker in a later phase.
  }
  form.addEventListener('submit', function (e) { e.preventDefault(); send(); });
  input.addEventListener('keydown', function (e) {
    // Enter sends; Shift+Enter inserts a newline.
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });

  /* ---- New blog: replay the greeting entrance ---- */
  newBtn.addEventListener('click', function () {
    input.value = '';
    autoGrow();
    showGreeting();
    input.focus();
  });

  /* ---- mic: visual placeholder for now ---- */
  micBtn.addEventListener('click', function () {
    toast('Voice input turns on in a later phase.');
  });

  /* ---- blog-card actions (Copy works today; Download is wired up later) ---- */
  thread.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var card = btn.closest('.blog-card');
    if (!card) return;

    var action = btn.getAttribute('data-action');
    if (action === 'copy') {
      var body = card.querySelector('.blog-body');
      var text = body ? body.innerText.trim() : '';
      if (text && navigator.clipboard) {
        navigator.clipboard.writeText(text).then(
          function () { toast('Copied to clipboard'); },
          function () { toast('Copy failed — select and copy manually.'); }
        );
      } else {
        toast('Copy not available in this browser.');
      }
    } else if (action === 'download') {
      toast('Word export turns on when we wire the backend.');
    }
  });

  /* ---- tiny toast ---- */
  var toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }

  /* ---- init: play the greeting entrance ---- */
  autoGrow();
  showGreeting();
})();
