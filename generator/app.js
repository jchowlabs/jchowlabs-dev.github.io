/* ============================================================
   Blog Generator — chat UI

   • On load, plays a short "typing dots → streamed greeting" entrance
     so the AI appears to type out its greeting like Claude/ChatGPT.
     The greeting is static (pre-seeded in index.html); app.js reveals
     it with a fast typewriter that preserves inline formatting.
   • The composer echoes the user's message; the mic fills the input
     via in-page dictation (Web Speech API).
   • "New blog" replays the greeting entrance.
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
    stopDictation();
    addUserMessage(text);
    input.value = '';
    autoGrow();
    input.focus();
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

  /* ---- mic: in-page dictation via the Web Speech API ----
     Supported in Chrome/Edge (desktop + Android) and Safari (macOS + iOS).
     Where it isn't (e.g. Firefox), the button points users at their own
     device dictation instead. Requires https (or localhost) + mic access. */
  var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recognition = null, listening = false, speechBase = '';

  function setListening(on) {
    listening = on;
    micBtn.classList.toggle('listening', on);
    micBtn.setAttribute('aria-label', on ? 'Stop dictation' : 'Dictate');
  }

  function stopDictation() {
    if (recognition && listening) { try { recognition.stop(); } catch (e) {} }
    setListening(false);
  }

  function startDictation() {
    if (!recognition) {
      recognition = new SpeechRec();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || 'en-US';

      recognition.onresult = function (e) {
        var finalText = speechBase, interim = '';
        for (var i = e.resultIndex; i < e.results.length; i++) {
          var t = e.results[i][0].transcript;
          if (e.results[i].isFinal) finalText += t; else interim += t;
        }
        speechBase = finalText;             // keep finalized words as the new base
        input.value = finalText + interim;  // finalized text + live interim words
        autoGrow();
      };
      recognition.onerror = function (e) {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          toast('Allow microphone access to dictate.');
        } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
          toast('Dictation stopped — tap the mic to try again.');
        }
        setListening(false);
      };
      recognition.onend = function () { setListening(false); };
    }
    // Seed with whatever's already typed so speech appends to it.
    var existing = input.value.replace(/\s+$/, '');
    speechBase = existing ? existing + ' ' : '';
    try { recognition.start(); setListening(true); input.focus(); } catch (e) {}
  }

  micBtn.addEventListener('click', function () {
    if (!SpeechRec) {
      toast("In-page dictation isn't supported in this browser — use your device's dictation (keyboard mic, or press the ⌘ key twice on Mac).");
      return;
    }
    if (listening) stopDictation(); else startDictation();
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
