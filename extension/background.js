/**
 * background.js — Service Worker for Badge Updates, Tab Change Notifications,
 *                 and Session / Activity Tracking
 *
 * Badge color coding:
 *   Green  (#3d7a4a) — 1–10 tabs (focused)
 *   Amber  (#b8892e) — 11–25 tabs (getting busy)
 *   Red    (#b35a5a) — 26+ tabs (time to clean up!)
 */

const INTERNAL_PREFIXES = ['chrome://', 'chrome-extension://', 'about:', 'edge://', 'brave://'];

// ─── Session storage (replaces server /api/sessions) ─────────────────────────

async function recordSession({ domain, duration_s, date_key }) {
  if (!domain || !duration_s || duration_s < 2) return;
  const key = `stats_${date_key}`;
  const data = await chrome.storage.local.get(key);
  const stats = data[key] || { domains: {}, sessionCount: 0 };

  if (!stats.domains[domain]) {
    stats.domains[domain] = { totalTime: 0, sessionCount: 0 };
  }
  stats.domains[domain].totalTime    += duration_s;
  stats.domains[domain].sessionCount += 1;
  stats.sessionCount += 1;

  await chrome.storage.local.set({ [key]: stats });

  // Prune stats older than 30 days (run occasionally, not every session)
  if (Math.random() < 0.02) {
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const all = await chrome.storage.local.get(null);
    const toRemove = Object.keys(all).filter(k => k.startsWith('stats_') && k.slice(6) < cutoff);
    if (toRemove.length > 0) await chrome.storage.local.remove(toRemove);
  }
}

// ─── Badge ───────────────────────────────────────────────────────────────────

async function updateBadge() {
  try {
    const tabs = await chrome.tabs.query({});
    const count = tabs.filter(t => {
      const url = t.url || '';
      return !INTERNAL_PREFIXES.some(p => url.startsWith(p));
    }).length;

    if (count === 0) {
      chrome.action.setBadgeText({ text: '' });
      return;
    }

    chrome.action.setBadgeText({ text: String(count) });

    let badgeColor;
    if (count <= 10)      badgeColor = '#3d7a4a';
    else if (count <= 25) badgeColor = '#b8892e';
    else                  badgeColor = '#b35a5a';

    chrome.action.setBadgeBackgroundColor({ color: badgeColor });
  } catch {
    chrome.action.setBadgeText({ text: '' });
  }
}

// ─── Notify dashboard ────────────────────────────────────────────────────────

let notifyTimer = null;

function notifySwooshPages() {
  if (notifyTimer) return;
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    chrome.runtime.sendMessage({ type: 'tabsChanged' }).catch(() => {});
  }, 500);
}

function onTabChange() {
  updateBadge();
  notifySwooshPages();
}

// ─── Session tracking ────────────────────────────────────────────────────────
// lastActivated is persisted to chrome.storage.session so idle timers survive
// MV3 service worker restarts (workers unload after ~30s idle). Without this,
// tabs could never accumulate enough idle time for stale thresholds > a few min.

let activeSession = null;   // { tabId, url, domain, activatedAt }
const lastActivated = {};   // tabId → timestamp (ms)
const LAST_ACTIVATED_KEY = 'lastActivatedMap';

let saveTimer = null;
function persistLastActivated() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    chrome.storage.session.set({ [LAST_ACTIVATED_KEY]: lastActivated }).catch(() => {});
  }, 500);
}

function touchTab(tabId, ts = Date.now()) {
  lastActivated[tabId] = ts;
  persistLastActivated();
}

function domainFrom(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

function isTrackable(url) {
  if (!url) return false;
  return !INTERNAL_PREFIXES.some(p => url.startsWith(p));
}

function flushSession() {
  if (!activeSession) return;
  const now = Date.now();
  const durationS = Math.round((now - activeSession.activatedAt) / 1000);
  if (durationS >= 2 && activeSession.domain) {
    const dateKey = new Date(now).toISOString().slice(0, 10);
    recordSession({ domain: activeSession.domain, duration_s: durationS, date_key: dateKey });
  }
  activeSession = null;
}

async function startSession(tabId) {
  flushSession();
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !isTrackable(tab.url)) return;
    const domain = domainFrom(tab.url);
    activeSession = { tabId, url: tab.url, domain, activatedAt: Date.now() };
    touchTab(tabId);
  } catch { /* tab may have closed */ }
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  touchTab(tabId);
  startSession(tabId);
  onTabChange();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeSession && activeSession.tabId === tabId) flushSession();
  delete lastActivated[tabId];
  persistLastActivated();
  onTabChange();
});

chrome.tabs.onCreated.addListener((tab) => {
  touchTab(tab.id);
  onTabChange();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.title) {
    if (activeSession && activeSession.tabId === tabId && changeInfo.url) {
      flushSession();
      startSession(tabId);
    }
    if (changeInfo.url) touchTab(tabId);
    onTabChange();
  }
});

// Periodic flush every 60s so we don't lose the active session on crash/close
setInterval(flushSession, 60_000);

// ─── Daily Dev Digest ─────────────────────────────────────────────────────────

const DIGEST_FEEDS = [
  { name: "Simon Willison",  url: "https://simonwillison.net/atom/everything/",                        weight: 10, type: "atom" },
  { name: "Claude Blog",     url: "https://cdn.jsdelivr.net/gh/Olshansk/rss-feeds@main/feeds/feed_claude.xml", weight: 10, type: "rss"  },
  { name: "Latent Space",    url: "https://www.latent.space/feed",                                     weight: 10, type: "rss"  },
  { name: "Hugging Face",    url: "https://huggingface.co/blog/feed.xml",                              weight: 9,  type: "rss"  },
  { name: "Google AI",       url: "https://blog.google/technology/ai/rss/",                            weight: 9,  type: "rss"  },
  { name: "Ars Technica AI", url: "https://arstechnica.com/ai/feed/",                                 weight: 8,  type: "rss"  },
  { name: "Hacker News",     url: "https://hnrss.org/frontpage?points=150",                            weight: 8,  type: "rss"  },
  { name: "GitHub Trending", url: "https://mshibanami.github.io/GitHubTrendingRSS/daily/all.xml",      weight: 7,  type: "rss"  },
  { name: "Verge AI",        url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", weight: 5,  type: "rss"  },
  { name: "TechCrunch AI",   url: "https://techcrunch.com/category/artificial-intelligence/feed/",     weight: 5,  type: "rss"  },
];

const DIGEST_ALARM = "digest-daily-refresh";

function _extractTag(block, tag) {
  const cdataRe = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i');
  const plainRe  = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const cm = cdataRe.exec(block);
  if (cm) return cm[1].trim();
  const pm = plainRe.exec(block);
  return pm ? pm[1].trim() : '';
}

function _extractAttrHref(block, tag) {
  const re = new RegExp(`<${tag}[^>]*\\shref="([^"]*)"`, 'i');
  const m = re.exec(block);
  return m ? m[1] : '';
}

function _stripHtml(s) {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .trim();
}

function _parseDate(str) {
  if (!str) return Date.now();
  const t = Date.parse(str);
  return isNaN(t) ? Date.now() : t;
}

function _parseFeed(xml, feed) {
  const isAtom = feed.type === 'atom';
  const tag = isAtom ? 'entry' : 'item';
  const re = new RegExp(`<${tag}[\\s>]([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const items = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    const title = _stripHtml(_extractTag(block, 'title'));
    if (!title) continue;

    let link = isAtom
      ? (_extractAttrHref(block, 'link') || _extractTag(block, 'link'))
      : (_extractTag(block, 'link').trim() || _extractAttrHref(block, 'link'));

    const pubStr = isAtom
      ? (_extractTag(block, 'published') || _extractTag(block, 'updated'))
      : _extractTag(block, 'pubDate');

    const description = _stripHtml(
      _extractTag(block, 'description') || _extractTag(block, 'summary') || _extractTag(block, 'content')
    ).slice(0, 200);

    items.push({ title, link, publishedAt: _parseDate(pubStr), source: feed.name, weight: feed.weight, description });
  }
  return items;
}

const _SIGNAL_HIGH = /\b(claude|mcp|agent|claude code|codex|anthropic)\b/i;
const _SIGNAL_MED  = /\b(release|launch|ga|v\d|open[\s-]?source|sdk|api)\b/i;

function _scoreItem(it) {
  const hoursOld = (Date.now() - it.publishedAt) / 3.6e6;
  return it.weight + 5 * Math.exp(-hoursOld / 48) +
    (_SIGNAL_HIGH.test(it.title) ? 5 : 0) +
    (_SIGNAL_MED.test(it.title) ? 3 : 0);
}

function _tokenize(s) {
  return new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3));
}

function _jaccard(a, b) {
  const inter = [...a].filter(x => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

function _rankItems(items, pinnedSources) {
  pinnedSources = pinnedSources || new Set();
  const now = Date.now();
  const CUTOFF_7D    = now - 168 * 3.6e6;
  const CUTOFF_14D   = now - 336 * 3.6e6;
  const MAX_PER_SOURCE   = 3;
  const MAX_PER_PINNED   = 5;
  const PRIORITY_WEIGHT  = 9;   // sources weight ≥ this get reserved slots
  const TOTAL_CAP        = 25;

  const out = [];
  const perSource = {};
  const seenLinks = new Set();

  const capFor = (src) => pinnedSources.has(src) ? MAX_PER_PINNED : MAX_PER_SOURCE;

  // Pass 1 — priority sources get guaranteed slots.
  // Anthropic + Simon Willison + Latent Space + Hugging Face + Google AI
  // are always surfaced (up to MAX_PER_SOURCE freshest articles each)
  // even if other sources have higher individual scores. Window is
  // extended to 14 days so we don't drop articles right after launch week.
  // Pinned sources get a higher cap (MAX_PER_PINNED) in both passes.
  const bySource = {};
  for (const it of items) {
    (bySource[it.source] ||= []).push(it);
  }
  for (const source of Object.keys(bySource)) {
    const sourceItems = bySource[source]
      .filter(i => i.publishedAt >= CUTOFF_14D)
      .sort((a, b) => b.publishedAt - a.publishedAt);
    if (sourceItems.length === 0) continue;
    const isPinned = pinnedSources.has(source);
    if (!isPinned && (sourceItems[0].weight || 0) < PRIORITY_WEIGHT) continue;

    // Within a single source, skip Jaccard dedup — different articles from
    // the same publisher about related topics are not duplicates.
    const limit = capFor(source);
    for (const it of sourceItems.slice(0, limit)) {
      if (seenLinks.has(it.link)) continue;
      out.push(it);
      seenLinks.add(it.link);
      perSource[source] = (perSource[source] || 0) + 1;
    }
  }

  // Pass 2 — fill remaining slots by score, with cross-source dedup.
  const fresh = items.filter(i => i.publishedAt >= CUTOFF_7D);
  const scored = fresh
    .map(it => ({ ...it, score: _scoreItem(it) }))
    .sort((a, b) => b.score - a.score);

  for (const it of scored) {
    if (out.length >= TOTAL_CAP) break;
    if (seenLinks.has(it.link)) continue;
    if ((perSource[it.source] || 0) >= capFor(it.source)) continue;

    const tok = _tokenize(it.title);
    const collides = out.some(kept =>
      kept.source !== it.source && _jaccard(tok, _tokenize(kept.title)) > 0.6
    );
    if (collides) continue;

    out.push(it);
    seenLinks.add(it.link);
    perSource[it.source] = (perSource[it.source] || 0) + 1;
  }

  return out;
}

async function _refreshDigest() {
  const results = await Promise.allSettled(
    DIGEST_FEEDS.map(async (f) => {
      try {
        const res = await fetch(f.url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const xml = await res.text();
        const parsed = _parseFeed(xml, f);
        console.log(`[digest] ${f.name}: ${parsed.length} items`);
        return parsed;
      } catch (err) {
        console.warn(`[digest] ${f.name} FAILED:`, err.message);
        throw err;
      }
    })
  );
  const items = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  const stored = await chrome.storage.local.get('pinned_sources');
  const pinnedSources = new Set(stored.pinned_sources || []);
  const ranked = _rankItems(items, pinnedSources).slice(0, 25);
  const bySource = ranked.reduce((a, it) => { a[it.source] = (a[it.source] || 0) + 1; return a; }, {});
  console.log('[digest] ranked output:', bySource);
  await chrome.storage.local.set({ digest: { items: ranked, generatedAt: Date.now() } });
  return ranked;
}

function _nextEightAm() {
  const d = new Date();
  d.setHours(8, 0, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d.getTime();
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === DIGEST_ALARM) _refreshDigest().catch(console.warn);
});

// ─── Message handler ─────────────────────────────────────────────────────────

async function buildTabActivity() {
  const stored = await chrome.storage.session.get(LAST_ACTIVATED_KEY);
  const merged = { ...(stored[LAST_ACTIVATED_KEY] || {}), ...lastActivated };

  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.active) {
        merged[tab.id] = Date.now();
      } else if (merged[tab.id] == null) {
        // Prefer chrome's native lastAccessed (Chrome 121+) so tabs the worker
        // hasn't yet seen since wake-up don't get fabricated fresh timestamps.
        merged[tab.id] = typeof tab.lastAccessed === 'number' ? tab.lastAccessed : Date.now();
      }
    }
    const openIds = new Set(tabs.map(t => t.id));
    for (const idStr of Object.keys(merged)) {
      if (!openIds.has(Number(idStr))) delete merged[idStr];
    }
  } catch {}

  return merged;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'getTabActivity') {
    buildTabActivity().then(map => sendResponse({ lastActivated: map }));
    return true;
  }
  if (msg && msg.type === 'REFRESH_DIGEST') {
    _refreshDigest()
      .then(items => sendResponse({ ok: true, count: items.length }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
});

// ─── Init ────────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  updateBadge();
  chrome.alarms.create(DIGEST_ALARM, { when: _nextEightAm(), periodInMinutes: 1440 });
  _refreshDigest().catch(console.warn);
});
chrome.runtime.onStartup.addListener(() => updateBadge());

async function initActivity() {
  const stored = await chrome.storage.session.get(LAST_ACTIVATED_KEY);
  const prior = stored[LAST_ACTIVATED_KEY] || {};

  const tabs = await chrome.tabs.query({});
  const now = Date.now();
  const openIds = new Set(tabs.map(t => t.id));

  for (const tab of tabs) {
    if (tab.active) {
      lastActivated[tab.id] = now;
    } else if (prior[tab.id] != null) {
      lastActivated[tab.id] = prior[tab.id];
    } else if (typeof tab.lastAccessed === 'number') {
      lastActivated[tab.id] = tab.lastAccessed;
    } else {
      lastActivated[tab.id] = now;
    }
  }
  for (const idStr of Object.keys(prior)) {
    if (!openIds.has(Number(idStr))) delete lastActivated[idStr];
  }
  persistLastActivated();

  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (activeTab) startSession(activeTab.id);
}

updateBadge();
initActivity();
