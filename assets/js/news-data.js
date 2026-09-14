(function () {
  'use strict';
  const app = window.FrozenApp;
  const key = 'frozen-published-news-v1';
  function summary(content) {
    const first = String(content || '').split(/\n\s*\n/).find(function (part) { return part.trim(); }) || '';
    const lines = first.split('\n').filter(Boolean), text = (lines.length > 1 && lines[0].length < 32 ? lines.slice(1).join(' ') : first).trim();
    return text.length <= 180 ? text : text.slice(0, 179).replace(/[，、；：\s]+$/, '') + '…';
  }
  function highlights(value) { return Array.isArray(value) ? value.map(function (row) { return String(row || '').trim(); }).filter(Boolean).slice(0, 4) : []; }
  function valid(records) {
    try { return Array.isArray(records) && records.every(function (r) {
      return r && r.status === 'published' && Object.prototype.hasOwnProperty.call(app.newsTypes, r.type) &&
        ['id', 'title', 'content', 'sourcePublishedAt'].every(function (k) { return typeof r[k] === 'string'; }) &&
        Number.isInteger(r.version) && r.version > 0 && r.source && typeof r.source.name === 'string' && typeof r.source.url === 'string' && Number.isInteger(r.source.version) &&
        (r.summary === undefined || typeof r.summary === 'string') && (r.highlights === undefined || Array.isArray(r.highlights) && r.highlights.every(function (row) { return typeof row === 'string'; })) && (r.attention === undefined || typeof r.attention === 'string') &&
        r.publication && Number.isInteger(r.publication.version) && r.publication.version > 0 && typeof r.publication.actor === 'string' && typeof r.publication.time === 'string' &&
        r.verification && typeof r.verification.actor === 'string' && typeof r.verification.time === 'string' &&
        Array.isArray(r.categories) && r.categories.length > 0 && r.categories.every(function (c) { return Boolean(app.categoryCatalog.find(c.id)) && typeof c.name === 'string'; });
    }); } catch (_) { return false; }
  }
  function project(r) {
    return { id: r.id, status: 'published', title: r.title, summary: String(r.summary || summary(r.content)), highlights: highlights(r.highlights), content: r.content, attention: String(r.attention || ''), type: r.type, validThrough: r.validThrough, sourcePublishedAt: r.sourcePublishedAt, version: r.version,
      categories: r.categories.map(function (c) { return { id: c.id, name: c.name }; }),
      source: { name: r.source.name, url: r.source.url, version: r.source.version },
      verification: { actor: r.verification.actor, time: r.verification.time },
      publication: { actor: r.publication.actor, time: r.publication.time, version: r.publication.version } };
  }
  function read() { try { const records = JSON.parse(window.localStorage.getItem(key)); return valid(records) ? records.map(project) : []; } catch (_) { return []; } }
  function write(records) { if (!valid(records)) return false; try { window.localStorage.setItem(key, JSON.stringify(records.map(project))); return true; } catch (_) { return false; } }
  function query(records, filters) {
    const keyword = String(filters.keyword || '').trim().toLowerCase();
    return records.filter(function (r) {
      const searchable = r.title + ' ' + r.source.name + ' ' + (r.summary || '') + ' ' + highlights(r.highlights).join(' ');
      return (!r.validThrough || r.validThrough >= '2026-09-06') && (!filters.type || r.type === filters.type) && (!filters.category || r.categories.some(function (c) { return c.id === filters.category; })) &&
        (!keyword || (app.presentation ? app.presentation.matches(searchable, keyword) : searchable.toLowerCase().includes(keyword)));
    }).sort(function (a, b) { return b.publication.time.localeCompare(a.publication.time) || b.sourcePublishedAt.localeCompare(a.sourcePublishedAt) || a.id.localeCompare(b.id); });
  }
  app.newsData = { key: key, valid: valid, project: project, read: read, write: write, query: query };
}());
