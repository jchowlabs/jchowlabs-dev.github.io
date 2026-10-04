/* ============================================================
   Blog Generator — UI shell behavior (no model wired yet)

   Drives the chat *surface* only:
   • On load, plays a short "typing dots → streamed greeting" entrance
     so the AI appears to type out its greeting like Claude/ChatGPT.
     The greeting text is static (pre-seeded in index.html, no model
     call); app.js just reveals it with a fast typewriter effect that
     preserves inline formatting (bold words).
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

  // Snapshot the greeting's inner HTML before we touch the thread, so we
  // can re-stream it on load and on "New blog".
  var greetingHTML = document.querySelector('#greeting .content').innerHTML;

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

  /* ---- build an (empty) assistant turn (content only, no avatar) ---- */
  function assistantTurn() {
    var turn = document.createElement('div');
    turn.className = 'turn assistant';
    turn.innerHTML = '<div class="content"></div>';
    return turn;
  }

  /* ---- typing-dots turn ---- */
  function typingTurn() {
    var t = document.createElement('div');
    t.className = 'turn assistant';
    t.innerHTML =
      '<div class="typing" role="status" aria-label="Assistant is typing">' +
      '<span></span><span></span><span></span></div>';
    return t;
  }

  /* ---- fast typewriter that preserves inline formatting ----
     Rebuilds the HTML structure inside `target` with empty text nodes,
     then fills visible text nodes a few chars per tick. Whitespace-only
     nodes (indentation between tags) are shown immediately so spacing
     and bold spans land correctly. */
  function typeHTML(target, html, opts, done) {
    opts = opts || {};
    var speed = opts.speed || 9;   // ms per tick
    var chunk = opts.chunk || 2;   // chars revealed per tick
    var tmp = document.createElement('div');
    tmp.innerHTML = html;

    var queue = []; // visible text nodes to type, in order
    (function clone(src, dest) {
      Array.prototype.forEach.call(src.childNodes, function (child) {
        if (child.nodeType === 3) {               // text node
          var tn = document.createTextNode('');
          dest.appendChild(tn);
          if (child.nodeValue.trim() === '') tn.nodeValue = child.nodeValue; // whitespace now
          else queue.push({ node: tn, text: child.nodeValue });              // visible → type it
        } else if (child.nodeType === 1) {        // element (e.g. <p>, <strong>)
          var el = document.createElement(child.tagName);
          for (var i = 0; i < child.attributes.length; i++) {
            el.setAttribute(child.attributes[i].name, child.attributes[i].value);
          }
          dest.appendChild(el);
          clone(child, el);
        }
      });
    })(tmp, target);

    // A blinking caret that follows the growing text (inserted right after
    // the text node currently being typed, so it stays inline).
    var caret = document.createElement('span');
    caret.className = 'caret';
    caret.setAttribute('aria-hidden', 'true');
    function placeCaret(node) {
      var p = node.parentNode;
      if (node.nextSibling) p.insertBefore(caret, node.nextSibling);
      else p.appendChild(caret);
    }

    var qi = 0, ci = 0;
    (function tick() {
      if (qi >= queue.length) {
        if (caret.parentNode) caret.parentNode.removeChild(caret);
        if (done) done();
        return;
      }
      var item = queue[qi];
      ci += chunk;
      item.node.nodeValue = item.text.slice(0, ci);
      placeCaret(item.node);
      scrollToEnd();
      if (ci >= item.text.length) { qi++; ci = 0; }
      setTimeout(tick, speed);
    })();
  }

  /* ---- greeting entrance: typing dots, then the greeting streams in ----
     This is the "illusion" — on every load / reset the AI appears to type
     out its greeting, then waits. No network, no model. */
  function showGreeting() {
    thread.innerHTML = '';

    function stream() {
      var turn = assistantTurn();
      turn.id = 'greeting';
      thread.appendChild(turn);
      var content = turn.querySelector('.content');
      if (reduceMotion) { content.innerHTML = greetingHTML; scrollToEnd(); return; }
      typeHTML(content, greetingHTML, { speed: 9, chunk: 2 });
    }

    if (reduceMotion) { stream(); return; }
    var typing = typingTurn();
    thread.appendChild(typing);
    scrollToEnd();
    setTimeout(function () { typing.remove(); stream(); }, 650);
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
