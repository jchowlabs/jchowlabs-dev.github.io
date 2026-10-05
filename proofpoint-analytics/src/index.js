/**
 * proofpoint-analytics — Cloudflare Worker
 *
 *   1. Serves the dashboard SPA (static assets, via [assets] in wrangler.toml)
 *   2. POST /api/event        — ingests analytics events into D1 (public, rate-limited)
 *   3. GET  /api/summary       — top cards
 *      GET  /api/visitors      — visitors by day (human vs bot)
 *      GET  /api/voice         — voice usage per site/agent
 *      GET  /api/pages         — page visits per site
 *
 * Bindings:
 *   env.DB           — D1 database (proofpoint-analytics)
 *   env.RATE_LIMITER — KV namespace for IP rate limiting
 *   env.ASSETS       — static assets (dashboard/)
 *
 * "site" is derived from the slug's first path segment at query time
 * (SITE_SQL), so '/teacher/' -> 'teacher', '/' -> 'home', etc.
 */

import { isRateLimited } from './rateLimit.js';

const VALID_EVENTS = ['page_view', 'session_end', 'voice_start', 'voice_end', 'voice_error'];

const ALLOWED_ORIGINS = [
  'https://jchowlabs.dev',
  'https://www.jchowlabs.dev',
  'http://localhost:8787',
];

// Derive the "site" (first path segment) from the stored slug.
const SITE_SQL = `CASE
  WHEN slug IN ('/', '') THEN 'home'
  WHEN instr(substr(slug, 2), '/') > 0 THEN substr(substr(slug, 2), 1, instr(substr(slug, 2), '/') - 1)
  ELSE substr(slug, 2)
END`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    // ── CORS ──
    const origin = request.headers.get('Origin') || '';
    const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    const corsHeaders = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // ── API ──
    if (pathname.startsWith('/api/')) {
      try {
        return await handleApi(pathname, request, env, corsHeaders, url);
      } catch (err) {
        console.error('API error:', err);
        return json({ error: err.message }, 500, corsHeaders);
      }
    }

    // ── Everything else: dashboard SPA (served from dashboard/) ──
    return env.ASSETS.fetch(request);
  },
};

/* ================================================================== */
/*  Router                                                             */
/* ================================================================== */

async function handleApi(pathname, request, env, corsHeaders, url) {
  if (pathname === '/api/event' && request.method === 'POST') {
    return handleEventIngestion(request, env, corsHeaders);
  }

  if (request.method === 'GET') {
    const params = Object.fromEntries(url.searchParams);
    if (pathname === '/api/summary')  return handleSummary(env, params, corsHeaders);
    if (pathname === '/api/visitors') return handleVisitors(env, params, corsHeaders);
    if (pathname === '/api/voice')    return handleVoice(env, params, corsHeaders);
    if (pathname === '/api/pages')    return handlePages(env, params, corsHeaders);
  }

  return json({ error: 'Not found' }, 404, corsHeaders);
}

/* ================================================================== */
/*  Event ingestion (public)                                           */
/* ================================================================== */

async function handleEventIngestion(request, env, corsHeaders) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (await isRateLimited(ip, 20, env.RATE_LIMITER)) {
    return json({ error: 'Rate limit exceeded' }, 429, corsHeaders);
  }

  const body = await request.json();
  const {
    event_type, slug, session_id, referrer,
    user_agent, is_bot, bot_category, device_type, payload,
  } = body;

  if (!event_type || !slug) {
    return json({ error: 'Missing required fields' }, 400, corsHeaders);
  }
  if (!VALID_EVENTS.includes(event_type)) {
    return json({ error: 'Invalid event_type' }, 400, corsHeaders);
  }

  const country = request.cf?.country || 'unknown';
  const timestamp = Date.now(); // server-side — never trust the client clock
  const payloadStr = payload && typeof payload === 'object' ? JSON.stringify(payload) : null;

  await env.DB.prepare(
    `INSERT INTO events (event_type, slug, session_id, ip_country, referrer, user_agent, is_bot, bot_category, device_type, payload, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    event_type,
    slug,
    session_id || null,
    country,
    referrer || null,
    user_agent || null,
    is_bot ? 1 : 0,
    bot_category || null,
    device_type || null,
    payloadStr,
    timestamp,
  ).run();

  return json({ ok: true }, 200, corsHeaders);
}

/* ================================================================== */
/*  Summary (top cards)                                                */
/* ================================================================== */

async function handleSummary(env, params, corsHeaders) {
  const { start, end } = params;
  const where = timeWhere(start, end);
  const bind = timeBind(start, end);

  const visitors = await scalar(env, `SELECT COUNT(DISTINCT session_id) v FROM events WHERE event_type='page_view' ${where}`, bind);
  const humans   = await scalar(env, `SELECT COUNT(DISTINCT session_id) v FROM events WHERE event_type='page_view' AND is_bot=0 ${where}`, bind);
  const bots     = await scalar(env, `SELECT COUNT(DISTINCT session_id) v FROM events WHERE event_type='page_view' AND is_bot=1 ${where}`, bind);

  const avgTime = await scalar(env, `SELECT AVG(CAST(json_extract(payload,'$.duration_ms') AS REAL)) v FROM events WHERE event_type='session_end' AND is_bot=0 ${where}`, bind);

  const voiceEngaged = await scalar(env, `SELECT COUNT(DISTINCT session_id) v FROM events WHERE event_type='voice_start' AND is_bot=0 ${where}`, bind);

  const botsAi       = await scalar(env, `SELECT COUNT(DISTINCT session_id) v FROM events WHERE event_type='page_view' AND is_bot=1 AND bot_category='ai_agent' ${where}`, bind);
  const botsCrawler  = await scalar(env, `SELECT COUNT(DISTINCT session_id) v FROM events WHERE event_type='page_view' AND is_bot=1 AND bot_category='crawler' ${where}`, bind);
  const botsHeadless = await scalar(env, `SELECT COUNT(DISTINCT session_id) v FROM events WHERE event_type='page_view' AND is_bot=1 AND bot_category='headless_browser' ${where}`, bind);

  return json({
    visitors,
    humans,
    bots,
    avg_time_ms: Math.round(avgTime || 0),
    voice_engaged: voiceEngaged,
    voice_humans: humans,
    voice_rate: humans > 0 ? Math.round((voiceEngaged / humans) * 100) : 0,
    bots_ai: botsAi,
    bots_crawler: botsCrawler,
    bots_headless: botsHeadless,
  }, 200, corsHeaders);
}

/* ================================================================== */
/*  Visitors by day                                                    */
/* ================================================================== */

async function handleVisitors(env, params, corsHeaders) {
  const { start, end } = params;
  const where = timeWhere(start, end);
  const bind = timeBind(start, end);

  const days = await all(env,
    `SELECT DATE(timestamp/1000,'unixepoch') AS day,
            COUNT(DISTINCT CASE WHEN is_bot=0 THEN session_id END) AS humans,
            COUNT(DISTINCT CASE WHEN is_bot=1 THEN session_id END) AS bots
     FROM events
     WHERE event_type='page_view' ${where}
     GROUP BY day ORDER BY day`,
    bind
  );

  return json({ days }, 200, corsHeaders);
}

/* ================================================================== */
/*  Voice usage per site                                               */
/* ================================================================== */

async function handleVoice(env, params, corsHeaders) {
  const { start, end } = params;
  const where = timeWhere(start, end);
  const bind = timeBind(start, end);

  const bySite = await all(env,
    `SELECT site,
            SUM(CASE WHEN event_type='voice_start' THEN 1 ELSE 0 END) AS sessions,
            COUNT(DISTINCT CASE WHEN event_type='voice_start' THEN session_id END) AS users,
            AVG(CASE WHEN event_type='voice_end' THEN CAST(json_extract(payload,'$.duration_ms') AS REAL) END) AS avg_duration_ms
     FROM (SELECT *, ${SITE_SQL} AS site FROM events
           WHERE event_type IN ('voice_start','voice_end') AND is_bot=0 ${where})
     GROUP BY site
     HAVING sessions > 0
     ORDER BY sessions DESC`,
    bind
  );

  for (const r of bySite) r.avg_duration_ms = Math.round(r.avg_duration_ms || 0);

  const micErrors = await scalar(env, `SELECT COUNT(*) v FROM events WHERE event_type='voice_error' AND is_bot=0 ${where}`, bind);

  return json({ by_site: bySite, mic_errors: micErrors }, 200, corsHeaders);
}

/* ================================================================== */
/*  Page visits per site                                               */
/* ================================================================== */

async function handlePages(env, params, corsHeaders) {
  const { start, end } = params;
  const where = timeWhere(start, end);
  const bind = timeBind(start, end);

  const bySite = await all(env,
    `SELECT site,
            COUNT(*) AS views,
            COUNT(DISTINCT session_id) AS visitors
     FROM (SELECT *, ${SITE_SQL} AS site FROM events
           WHERE event_type='page_view' AND is_bot=0 ${where})
     GROUP BY site
     ORDER BY views DESC`,
    bind
  );

  return json({ by_site: bySite }, 200, corsHeaders);
}

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

function json(data, status = 200, corsHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function timeWhere(start, end) {
  if (start && end) return 'AND timestamp >= ? AND timestamp <= ?';
  if (start) return 'AND timestamp >= ?';
  if (end) return 'AND timestamp <= ?';
  return '';
}

function timeBind(start, end) {
  const bind = [];
  if (start) bind.push(parseInt(start, 10));
  if (end) bind.push(parseInt(end, 10));
  return bind;
}

async function scalar(env, sql, bind) {
  const stmt = env.DB.prepare(sql);
  const row = bind.length ? await stmt.bind(...bind).first() : await stmt.first();
  return row?.v ?? 0;
}

async function all(env, sql, bind) {
  const stmt = env.DB.prepare(sql);
  const res = bind.length ? await stmt.bind(...bind).all() : await stmt.all();
  return res?.results ?? [];
}
