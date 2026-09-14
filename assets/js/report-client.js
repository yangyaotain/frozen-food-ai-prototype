(function () {
  'use strict';
  const app = window.FrozenApp;
  const clone = function (value) { return JSON.parse(JSON.stringify(value)); };
  function validMerchant(id) { return ['demo-a', 'demo-b', 'demo-c'].includes(id); }
  function valid(records, merchantId) {
    try {
    if (!validMerchant(merchantId) || !Array.isArray(records)) return false;
    return records.every(function (r) {
      const s = r && r.snapshot;
      return r && r.merchant && r.merchant.id === merchantId && typeof r.merchant.name === 'string' && r.status === 'published' && (!app.publicationPolicy || app.publicationPolicy.allowed(r)) &&
        typeof r.id === 'string' && Number.isInteger(r.version) && r.version > 0 && (r.kind === 'month' ? r.start.endsWith('-01') && new Date(Date.parse(r.end) + 86400000).toISOString().slice(8, 10) === '01' && r.start.slice(0, 7) === r.end.slice(0, 7) && r.days === (Date.parse(r.end) - Date.parse(r.start)) / 86400000 + 1 : r.kind === 'week' ? r.count === 1 && r.days === 7 && (Date.parse(r.end) - Date.parse(r.start)) / 86400000 === 6 && new Date(r.start).getUTCDay() === 1 : [1, 4, 8].includes(r.count)) &&
        ['title', 'summary', 'signals', 'adviceSummary', 'advice', 'generatedAt', 'start', 'end'].every(function (key) { return typeof r[key] === 'string'; }) &&
        ['highlights', 'adviceHighlights'].every(function (key) { return Array.isArray(r[key]) && r[key].length >= 2 && r[key].length <= 4 && r[key].every(function (item) { return typeof item === 'string' && item.length > 0; }); }) &&
        /^\d{4}-\d{2}-\d{2}$/.test(r.start) && /^\d{4}-\d{2}-\d{2}$/.test(r.end) && r.review && r.publication &&
        typeof r.review.actor === 'string' && typeof r.review.time === 'string' && typeof r.publication.actor === 'string' && typeof r.publication.time === 'string' &&
        s && s.totals && s.totals.turnover && ['opening', 'inbound', 'outbound', 'closing'].every(function (k) { return Number.isFinite(s.totals[k]); }) &&
        ['rows', 'categories', 'series', 'references', 'bulletins'].every(function (key) { return Array.isArray(s[key]); }) &&
        s.categories.length > 0 && s.categories.every(function (c) { return c.own && c.own.turnover && c.market && c.market.priceChange && Array.isArray(c.market.prices); }) &&
        s.rows.every(function (raw) { return s.categories.some(function (c) { return c.id === raw.categoryId; }); }) && app.marketData.valid(s.bulletins);
    });
    } catch (_) { return false; }
  }
  function project(r) {
    const pick = function (source, keys) { return Object.fromEntries(keys.map(function (key) { return [key, source[key]]; })); };
    const quantities = function (source) { const value = pick(source, ['opening', 'inbound', 'outbound', 'closing']); value.turnover = pick(source.turnover, ['average', 'times', 'days', 'reason']); return value; };
    const s = r.snapshot;
    const snapshot = Object.assign(pick(s, ['method', 'ruleVersion', 'sourceNote', 'unmapped', 'safety']), {
      totals: quantities(s.totals),
      rows: s.rows.map(function (raw) { return pick(raw, ['rawId', 'name', 'origin', 'categoryId', 'mappingVersion', 'opening', 'inbound', 'outbound', 'closing']); }),
      series: s.series.map(function (row) { return pick(row, ['start', 'end', 'opening', 'inbound', 'outbound', 'closing']); }),
      categories: s.categories.map(function (c) { return { id: c.id, name: c.name, share: c.share, change: c.change ? { outbound: pick(c.change.outbound, ['value', 'reason']), closing: pick(c.change.closing, ['value', 'reason']), priorShare: c.change.priorShare, shareDelta: c.change.shareDelta, priorOutbound: c.change.priorOutbound, priorClosing: c.change.priorClosing, start: c.change.start, end: c.change.end } : null, own: quantities(c.own), market: Object.assign(pick(c.market, ['price', 'inbound', 'outbound', 'closing', 'priceReason']), {
        priceChange: pick(c.market.priceChange, ['value', 'reason']), prices: c.market.prices.map(function (p) { return pick(p, ['id', 'week', 'price', 'version']); }) }) }; }),
      references: s.references.map(function (ref) { return pick(ref, ['id', 'sourceId', 'sourceUrl', 'infoUrl', 'validThrough', 'title', 'content', 'publishedAt', 'sourceName', 'sourceVersion', 'infoVersion']); }),
      bulletins: s.bulletins.map(app.marketData.project)
    });
    return clone({ id: r.id, merchant: { id: r.merchant.id, name: r.merchant.name }, version: r.version, status: 'published',
      title: r.title, summary: r.summary, highlights: r.highlights, signals: r.signals, adviceSummary: r.adviceSummary, adviceHighlights: r.adviceHighlights, advice: r.advice, start: r.start, end: r.end, count: r.count, kind: r.kind, days: r.days,
      generatedAt: r.generatedAt, snapshot: snapshot, review: { actor: r.review.actor, time: r.review.time }, publication: { actor: r.publication.actor, time: r.publication.time } });
  }
  function createStore(merchantId, storage) {
    const key = 'frozen-merchant-reports-v1:' + merchantId, seenKey = key + ':seen';
    let records = [], seen = {}, saved = Boolean(storage), cacheState = storage ? 'empty' : 'unavailable';
    function accept(input, persist) {
      if (!valid(input, merchantId)) return false;
      const latest = new Map();
      try { input.forEach(function (r) { if (!latest.has(r.id) || latest.get(r.id).version < r.version) latest.set(r.id, project(r)); }); }
      catch (_) { return false; }
      records = Array.from(latest.values());
      cacheState = 'ready';
      if (persist !== false && storage) {
        try { storage.setItem(key, JSON.stringify(records)); saved = true; } catch (_) { saved = false; }
      }
      return true;
    }
    function reload() {
      if (!storage) return false;
      try { const input = JSON.parse(storage.getItem(key)); if (input === null) { records = []; cacheState = 'empty'; return false; } if (accept(input, false)) return true; cacheState = app.publicationPolicy && Array.isArray(input) && input.every(function (r) { return r && r.merchant && r.merchant.id === merchantId; }) && input.some(function (r) { return r.snapshot && !r.snapshot.safety; }) ? 'legacy' : 'invalid'; records = []; return false; } catch (_) { records = []; cacheState = 'unavailable'; return false; }
    }
    function seenVersion(id, mode) { const value = seen[mode + ':' + id]; return Number.isInteger(value) && value > 0 ? value : 0; }
    function unread(row, mode) { const version = seenVersion(row.id, mode); return row.version > version ? (version ? '有更新 · V' + row.version : '未读') : ''; }
    function markRead(row, mode) {
      if (!['reports', 'advice'].includes(mode) || !valid([row], merchantId)) return false;
      seen[mode + ':' + row.id] = Math.max(seenVersion(row.id, mode), row.version);
      if (storage) { try { storage.setItem(seenKey, JSON.stringify(seen)); } catch (_) { saved = false; } }
      return true;
    }
    if (storage) {
      try { const input = JSON.parse(storage.getItem(seenKey)); if (input && typeof input === 'object' && !Array.isArray(input)) seen = input; } catch (_) { saved = false; }
    }
    reload();
    return { merchantId: merchantId, key: key, accept: accept, reload: reload, list: function () { return clone(records); },
      get: function (id) { const row = records.find(function (r) { return r.id === id; }); return row ? clone(row) : null; },
      unread: unread, markRead: markRead, seenVersion: seenVersion, cacheState: function () { return cacheState; }, storageAvailable: function () { return saved; } };
  }
  app.reportClient = { createStore: createStore, valid: valid, project: project, validMerchant: validMerchant };
}());
