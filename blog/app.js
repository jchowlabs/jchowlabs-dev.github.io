/* ============================================================
   Blog Generator — UI shell behavior (no model wired yet)

   This only drives the chat *surface*: auto-growing input, sending
   a message (which echoes a user bubble — there is NO assistant
   reply yet), "New blog" reset, and the blog-card Copy button.
   The live model, voice dictation, and real .docx export are added
   in later phases.
   ============================================================ */
(function () {
  'use strict';

  var thread = document.getElementById('thread');
  var form   = document.getElementById('composer');
  var input  = document.getElementById('input');
  var micBtn = document.getElementById('micBtn');
  var newBtn = document.getElementById('newBtn');

  // Snapshot the greeting so "New blog" can reset to a clean slate.
  var greetingHTML = document.getElementById('greeting').outerHTML;

  /* ---- textarea auto-grow ---- */
  function autoGrow() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
  }
  input.addEventListener('input', autoGrow);

  /* ---- scroll helper ---- */
  function scrollToEnd() { thread.scrollTop = thread.scrollHeight; }

  /* ---- append a user turn (pure UI echo — no model reply yet) ---- */
  function addUserMessage(text) {
    var turn = document.createElement('div');
    turn.className = 'turn user';
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

  /* ---- New blog: reset the thread to just the greeting ---- */
  newBtn.addEventListener('click', function () {
    thread.innerHTML = greetingHTML;
    input.value = '';
    autoGrow();
    input.focus();
    scrollToEnd();
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

  /* ---- init ---- */
  autoGrow();
  scrollToEnd();
})();
