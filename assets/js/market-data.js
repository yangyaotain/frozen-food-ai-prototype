(function () {
  'use strict';
  const app = window.FrozenApp;
  const key = 'frozen-market-published-v1';
  const clone = function (value) { return JSON.parse(JSON.stringify(value)); };
  // 显式白名单：商户只接收已发布市场汇总，不传递管理端过程和原始业务行。
  function project(record) {
    if (record.status !== 'published' || !record.review || !record.publication || (app.publicationPolicy && !app.publicationPolicy.allowed(record))) return null;
    const snapshot = record.snapshot;
    return clone({ id: record.id, version: record.version, status: 'published', title: record.title,
      summary: record.summary, signals: record.signals, kind: record.kind, start: record.start, end: record.end,
      generatedAt: record.generatedAt, review: { actor: record.review.actor, time: record.review.time },
      publication: { actor: record.publication.actor, time: record.publication.time },
      snapshot: { safety: snapshot.safety, method: snapshot.method, categories: snapshot.categories.map(function (category) {
        return { monthly: app.periodInsights ? app.periodInsights.publicComparison(category.monthly) : undefined, id: category.id, name: category.name, totals: { price: category.totals.price, inbound: category.totals.inbound, outbound: category.totals.outbound, closing: category.totals.closing },
          anomalies: category.anomalies.slice(), series: category.series.map(function (row) { return { start: row.start, end: row.end, price: row.price, inbound: row.inbound, outbound: row.outbound, closing: row.closing, days: row.days }; }) };
      }), references: snapshot.references.map(function (ref) { return { id: ref.id, sourceId: ref.sourceId, sourceUrl: ref.sourceUrl, infoUrl: ref.infoUrl, validThrough: ref.validThrough, title: ref.title, content: ref.content, publishedAt: ref.publishedAt, sourceName: ref.sourceName, sourceVersion: ref.sourceVersion, infoVersion: ref.infoVersion }; }),
        sourceNote: snapshot.sourceNote, ruleVersion: snapshot.ruleVersion } });
  }
  function valid(records) {
    return Array.isArray(records) && records.every(function (row) {
      return row && typeof row.id === 'string' && Number.isInteger(row.version) && row.version > 0 &&
        row.status === 'published' && row.review && row.publication && row.snapshot && (!app.publicationPolicy || app.publicationPolicy.allowed(row)) &&
        ['week', 'month'].includes(row.kind) && typeof row.title === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(row.start) && /^\d{4}-\d{2}-\d{2}$/.test(row.end) &&
        Array.isArray(row.snapshot.references) && Array.isArray(row.snapshot.categories) && row.snapshot.categories.length > 0 &&
        row.snapshot.categories.every(function (category) {
          return Boolean(app.categoryCatalog.find(category.id)) && category.totals &&
            ['price', 'inbound', 'outbound', 'closing'].every(function (metric) { return Number.isFinite(category.totals[metric]); }) &&
            Array.isArray(category.anomalies) && Array.isArray(category.series) && category.series.length > 0 && category.series.every(function (point) {
              return point && ['price', 'inbound', 'outbound', 'closing', 'days'].every(function (metric) { return Number.isFinite(point[metric]); });
            });
        });
    });
  }
  function readInfo() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(key));
      if (saved == null) return { records: [], state: 'empty' };
      if (!Array.isArray(saved)) return { records: [], state: 'invalid' };
      const legacy = Boolean(app.publicationPolicy && saved.some(function (r) { return r && r.snapshot && !r.snapshot.safety; }));
      const records = saved.filter(function (r) { return valid([r]); }).map(project).filter(Boolean);
      return { records: records, state: legacy ? 'legacy' : records.length !== saved.length ? 'invalid' : 'ready' };
    } catch (_) { return { records: [], state: 'unavailable' }; }
  }
  function read() { return readInfo().records; }
  function write(records) {
    if (!valid(records)) return false;
    try { window.localStorage.setItem(key, JSON.stringify(records.map(project).filter(Boolean))); return true; }
    catch (_) { return false; }
  }
  app.marketData = { key: key, project: project, valid: valid, read: read, readInfo: readInfo, write: write };
}());
