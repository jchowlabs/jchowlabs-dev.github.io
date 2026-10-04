# jchowlabs — project overview

A living reference for this repo. Read this first in a new session to get oriented before building a
feature. It covers **what the site is, how each page works, and how the voice agents work** at a high
level. Keep it current when the shape of the project changes.

---

## What this is

**jchowlabs** is a personal **prototypes hub** — a small collection of browser-based tools and
voice-agent demos, mostly built around Proofpoint sales/enablement use cases.

- **Live site:** https://jchowlabs.dev
- **Repo:** `jchowlabs/jchowlabs-dev.github.io` (GitHub Pages)
- **Nature:** a static site. No framework, no build step, no backend. Each tool is a self-contained
  folder of plain HTML/CSS/JS that is served as-is.

The home page is a directory of tiles; each tile links into one tool's folder.

---

## Tech & conventions

- **Static + vanilla.** Plain HTML, CSS, and ES-module JavaScript. No bundler, no npm install, no
  server. You can open most pages by serving the folder over `http(s)` (not `file://` — ES-module
  imports are blocked on `file://`, which breaks the voice SDK).
- **Self-contained pages.** Each tool lives in its own top-level folder (`/teacher/`, `/falcon/`,
  `/alliances/`) and owns its markup, styles, and scripts. There is no shared CSS/JS bundle — a
  change in one tool can't break another.
- **Third-party code is vendored, not CDN-loaded.** The ElevenLabs voice SDK is pinned and committed
  at `vendor/elevenlabs-client-0.15.2.js` inside each voice-enabled folder, and imported
  same-origin. No runtime CDN dependency.
- **Deploy on push.** Any push to `main` triggers the GitHub Actions workflow
  (`.github/workflows/deploy.yml`) which uploads the repo root to GitHub Pages. No Jekyll
  (`.nojekyll` is present); `CNAME` pins the custom domain.
- **Theme.** Pages share an Inter-based, mostly-dark aesthetic (home: bg `#1c2230`, surface
  `#252c3d`, ink `#e6e8ec`, accent `#5c9ced`). Each voice tool has a small circular "back to home"
  arrow top-left linking to `../`.

---

## Directory layout

```
/
├── index.html              # Home — the tile directory (self-contained, dark)
├── CNAME                   # Custom domain (jchowlabs.dev)
├── .nojekyll               # Tell Pages not to run Jekyll
├── .github/workflows/      # deploy.yml — push-to-main → GitHub Pages
│
├── teacher/                # "Proofpoint Companion" voice agent (orb + call button)
│   ├── index.html
│   ├── app.js              # voice session lifecycle
│   ├── styles.css
│   └── vendor/             # pinned ElevenLabs SDK
│
├── falcon/                 # "Falcon Presentation" — slide deck viewer + voice coach
│   ├── index.html
│   ├── app.js              # deck viewer (slides, nav, swipe) + window.DeckViewer API
│   ├── voice.js            # voice coach widget that drives the deck via client tools
│   ├── styles.css
│   ├── slides/             # slide-01.png … slide-23.png
│   └── vendor/
│
├── alliances/              # "Proofpoint Alliances" notebook (large self-contained page) + voice
│   ├── index.html          # ~1.9 MB, fully self-contained
│   └── vendor/
│
├── elevenlabs/             # SOURCE OF TRUTH for the voice agents' dashboard config (not served)
│   ├── teacher/            # system-prompt, greeting, + proofpoint-*.md knowledge base articles
│   ├── falcon/             # elevenlabs.md (setup), greeting, version-N/{system-prompt,kb,tool-calls}
│   └── alliances/          # elevenlabs.md, tool-calls, version-N/ configs
│
└── example/                # scratch/reference material (git-ignored where noted); not part of the site
```

> **`elevenlabs/` is config, not code.** Nothing in it is served to the browser. It holds the
> version-controlled source for each agent's system prompt, greeting, knowledge base, and tool
> definitions, which are pasted/uploaded into the ElevenLabs dashboard. `version-N/` folders keep
> rollback copies; the `elevenlabs.md` / `README.md` in each says which version is current.

---

## The pages

### Home — `/` (`index.html`)

A single self-contained page. A header ("Tools") over a responsive grid of **tiles** (3 across on
desktop, wrapping to 2 then 1 on smaller screens). Each tile has a two-digit index label and a title.

- A **live tool** is an `<a class="tile" href="…/">`.
- A **placeholder** (not built yet) is a `<div class="tile">` with no link.

Currently live: **01 Proofpoint Companion** (`teacher/`), **02 Proofpoint Alliances**
(`alliances/`), **03 Falcon Presentation** (`falcon/`). Placeholders exist for future generators
(Blog, Deck, Solution Brief, Diagrams, Web Content Template, Joint Value Messaging).

To add a tool: copy a tile block, bump the number, and point `href` at the new folder. To activate a
placeholder, change its `<div class="tile">` to `<a class="tile" href="…/">`.

### Proofpoint Companion — `/teacher/`

A minimal voice-chat page: a decorative animated **orb** and a single circular **call button** below
it. It's a straight voice conversation with an ElevenLabs agent that acts as a Proofpoint
"teacher"/companion — ask it about Proofpoint products, positioning, competitors, etc.

- `app.js` runs the whole session lifecycle. The button cycles through states: **idle** (phone icon)
  → **connecting** (spinner) → **active** (red end-call, while listening or speaking). Errors and
  mic denial reset silently to idle (it's single-user, so there's no error UI).
- The agent's actual knowledge lives in `elevenlabs/teacher/` — a system prompt, a greeting, and
  ~16 `proofpoint-*.md` knowledge-base articles uploaded to the dashboard.
- No client tools — it's a pure conversation (it does pass `current_date`/`current_time` as dynamic
  variables so the agent can reference "today").

### Falcon Presentation — `/falcon/`

A **slide-deck viewer with an optional voice coach**. The deck is 23 PNG slides
(`slides/slide-01.png` … `slide-23.png`, exported from a PowerPoint → PDF → `pdftoppm`).

- `app.js` is the **viewer**: shows one slide at a time, with prev/next buttons, keyboard nav
  (arrows, space, Home/End), mobile swipe, and image preloading. It exposes a small API on
  **`window.DeckViewer`** (`current()`, `goToSlide()`, `next()`, `prev()`, `title()`, `onChange()`)
  and a per-slide title list used for alt text and the coach's spoken confirmations.
- `voice.js` is the **voice coach** — a self-building widget (desktop pill → dock, mobile toast)
  that connects to an ElevenLabs agent and can **drive the deck**. It calls `window.DeckViewer`
  through client tools and keeps the agent in sync when the presenter navigates manually. (See the
  voice section below.)
- Agent behavior (the deck walkthrough script, talk tracks, knowledge base) is version-controlled in
  `elevenlabs/falcon/` — `version-2/` is current.

### Proofpoint Alliances — `/alliances/`

A large (~1.9 MB) **self-contained "notebook"** page — the Proofpoint alliances/partners reference,
brought over whole from an earlier site. Everything (content, styles, voice widget markup) is inline
in `index.html`. It has the same voice toggle pattern as Falcon (desktop `va-pill` + mobile
`va-toast`) wired to its own ElevenLabs agent. Config source lives in `elevenlabs/alliances/`
(`version-3/` is the latest there).

---

## How the voice agents work (high level)

All three voice experiences use the **ElevenLabs Conversational AI** SDK, and they share one
architecture:

1. **No backend.** The browser talks directly to ElevenLabs. There's no proxy or server of ours in
   the loop. The page only runs the **UI** and, where applicable, the **client-side tool handlers**.
2. **Agent "brains" live on the ElevenLabs dashboard** — system prompt, voice, LLM choice, knowledge
   base, and the *definitions* of any tools. Our repo's `elevenlabs/` folder is the version-controlled
   **source of truth** for that config; you author there, then paste/upload to the dashboard.
3. **The page connects by agent id.** Each page hard-codes its ElevenLabs agent id and calls
   `Conversation.startSession({ agentId, … })` from the vendored SDK. The SDK is preloaded at page
   load so the first tap can request the mic inside the user's gesture (important on mobile).
4. **Session state → UI.** SDK callbacks (`onConnect`, `onModeChange`, `onDisconnect`, `onError`)
   drive the button/pill/dock/toast states (idle / connecting / listening / speaking / error). The
   Falcon/Alliances widgets also animate a waveform from live mic/agent frequency data.
5. **Client tools (Falcon only, currently).** The agent can call functions that run **in the
   browser**. Falcon's coach exposes `go_to_slide`, `next_slide`, `previous_slide`, `current_slide`,
   and `end_session`, each implemented in `voice.js` against `window.DeckViewer`. Every handler
   always resolves to a string and never throws into the SDK. When the presenter navigates manually,
   the widget sends the agent a **contextual update** so it always knows which slide is on screen.
   (The Companion agent uses no client tools; Alliances has its own set defined in
   `elevenlabs/alliances/tool-calls.md`.)

### Agent IDs (where each page connects)

| Page | File / location of id | ElevenLabs agent id |
|---|---|---|
| Proofpoint Companion | `teacher/app.js` (`AGENT_ID`) | `agent_8501kwhz7amrft48eb44mtmh2gyy` |
| Falcon deck coach | `falcon/voice.js` (`VOICE_AGENT_ID`) | `agent_0801m424tv5hfqk8sqd50100wrqg` |
| Proofpoint Alliances | `alliances/index.html` (inline) | `agent_5501m3wd6q0mf7zbb5va2p0epgwf` |

> If an agent has an **origin allowlist** on the ElevenLabs dashboard, `https://jchowlabs.dev` must
> be on it or the session won't connect in production.

---

## Deployment

Push to `main` → GitHub Actions (`.github/workflows/deploy.yml`) uploads the repo root and publishes
to GitHub Pages. No build. DNS is at GoDaddy (apex A records → GitHub Pages IPs; `www` CNAME →
jchowlabs.dev); HTTPS is enforced (`.dev` is HSTS-preloaded).

---

## Adding a new tool (the usual pattern)

1. Create a new top-level folder (e.g. `/my-tool/`) with its own `index.html` (+ `styles.css` /
   `app.js` as needed). Keep it self-contained.
2. Add a "back to home" arrow linking to `../`, matching the other tools.
3. If it needs voice, vendor the ElevenLabs SDK into `my-tool/vendor/`, follow the Falcon `voice.js`
   pattern, and keep the agent's prompt/KB/tool config in `elevenlabs/my-tool/`.
4. Wire it into the home grid: turn a placeholder tile into an `<a class="tile" href="my-tool/">`, or
   copy a tile block and bump the index number.
5. Commit and push to `main` — it deploys automatically.

---

## Gotchas worth knowing

- **`file://` breaks voice.** ES-module imports (and thus the vendored SDK) don't load from a
  double-clicked file — serve over `http(s)` when testing voice locally.
- **Agent config vs. code.** Changing `elevenlabs/**` does **not** change the live agents — those
  files must be re-uploaded/pasted into the ElevenLabs dashboard to take effect.
- **Slides are generated assets.** Falcon slides come from a PowerPoint exported to PDF then rendered
  with `pdftoppm`; there's no LibreOffice/automation on the authoring machine, so the PDF export is
  done manually.
- **Watch for accidental nested git clones** appearing in the working tree — they get committed as
  gitlinks. If git warns about an "embedded git repository," remove it (`git rm --cached <dir>`),
  gitignore it, and delete.
```
