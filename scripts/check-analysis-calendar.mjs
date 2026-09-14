import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const cache = new Map(), storage = { getItem: k => cache.get(k) ?? null, setItem: (k, v) => cache.set(k, v) };
const context = { window: { localStorage: storage, innerWidth: 1440 }, URL, URLSearchParams };
for (const m of read('admin/index.html').matchAll(/<script defer src="..\/assets\/js\/([^"]+)"><\/script>/g)) if (m[1] !== 'shell.js') vm.runInNewContext(read('assets/js/' + m[1]), context, { filename: m[1] });
const a = context.window.FrozenApp, plain = value => JSON.parse(JSON.stringify(value));
const query = (kind, date, category = 'poultry') => a.analysisStore.query({ kind, date, category });
const near = (x, y) => assert.ok(Math.abs(x - y) < .021, `${x} != ${y}`);
const frozen = JSON.stringify([a.bulletinStore.list(), a.reportStore.list(), [...cache], a.priceStore.records]);
const week = query('week', '2026-08-24');
assert.equal(week.start, '2026-08-24'); assert.equal(week.end, '2026-08-30');
assert.equal(week.previousStart, '2026-08-17'); assert.equal(week.previousEnd, '2026-08-23');
assert.equal(week.series.length, 1);
assert.deepEqual(plain(week.totals), Object.fromEntries(['price', 'inbound', 'outbound', 'closing'].map(k => [k, a.analysisStore.weekly('2026-08-24', 'poultry')[k]])));
assert.equal(query('week', '2020-12-28').yearStart, null, 'ISO week 53 without a prior-year counterpart');
for (const [month, days] of [['2024-02', 29], ['2025-02', 28], ['2026-04', 30], ['2026-07', 31], ['2026-01', 31]]) {
  const result = query('month', month);
  assert.equal(result.valid, true); assert.equal(result.start, month + '-01'); assert.equal(result.end, month + '-' + days);
  assert.equal(result.series.reduce((n, r) => n + r.days, 0), days);
  assert.equal(result.series[0].start, result.start); assert.equal(result.series.at(-1).end, result.end);
  result.series.forEach((r, i) => {
    assert.ok(r.start >= result.start && r.end <= result.end);
    if (i) assert.equal(a.priceData.dateAfter(result.series[i - 1].end, 1), r.start);
    assert.ok(r.week <= r.start && r.originalEnd >= r.end);
  });
  for (const key of ['inbound', 'outbound']) near(result.totals[key], result.series.reduce((n, r) => n + r[key], 0));
  near(result.totals.closing, result.series.at(-1).closing);
  near(result.totals.price, result.series.reduce((n, r) => n + r.price * r.days, 0) / days);
  // Month fragments preserve their reviewed weekly prices and weighted month coverage.
  near(result.totals.price, result.series.reduce((n, r) => n + r.price * r.days, 0) / days);
}
const july = query('month', '2026-07');
assert.equal(july.previousStart, '2026-06-01'); assert.equal(july.previousEnd, '2026-06-30');
assert.equal(july.yearStart, '2025-07-01'); assert.equal(july.yearEnd, '2025-07-31');
assert.equal(query('month', '2026-01').previousStart, '2025-12-01');
for (const key of ['price', 'inbound', 'outbound', 'closing']) {
  assert.ok(Number.isFinite(july.comparisons[key].previous.value));
  assert.ok(Number.isFinite(july.comparisons[key].year.value));
  near(july.comparisons[key].previous.value, (july.totals[key] - july.previousTotals[key]) / july.previousTotals[key] * 100);
}
assert.ok(july.seasonal.rows.every(row => row.monthly.every(Number.isFinite)), 'default monthly historical comparison has complete data');
assert.ok(week.references.every(r => r.publishedAt.slice(0, 10) >= week.start && r.publishedAt.slice(0, 10) <= week.end), 'weekly references stay within the selected week; empty references are not fabricated');
assert.ok(july.references.every(r => r.publishedAt.slice(0, 10) >= july.start && r.publishedAt.slice(0, 10) <= july.end && r.categories.includes('poultry') && a.sourceStore.eligible(r)));
const byCategory = new Map();
for (const category of a.categoryCatalog.ids()) {
  const value = query('month', '2026-07', category);
  byCategory.set(category, value);
  const store = a.bulletinData.createStore(a.analysisStore, a.priceStore, a.categoryStore, a.sourceStore, { seed: false });
  const report = store.generate({ kind: 'month', date: '2026-07', categories: [category] });
  for (const key of ['price', 'inbound', 'outbound', 'closing']) near(value.totals[key], report.snapshot.categories[0].totals[key]);
}
const all = query('month', '2026-07', '');
assert.equal(all.totals.price, null); assert.equal(all.categorySummary.length, 12);
for (const key of ['inbound', 'outbound', 'closing']) near(all.totals[key], all.categorySummary.reduce((n, c) => n + c.totals[key], 0));
for (const row of all.series) {
  for (const key of ['inbound', 'outbound', 'closing']) near(row[key], a.categoryCatalog.ids().reduce((n, id) => n + byCategory.get(id).series.find(r => r.week === row.week)[key], 0));
}
for (const [kind, date, category] of [['month', ''], ['month', '2026-13'], ['month', '1900-01'], ['month', '2100-01'], ['week', '2026-08-25'], ['week', ''], ['month', '2026-07', 'invalid'], ['quarter', '2026-07']]) assert.equal(query(kind, date, category).valid, false);
const pending = query('month', '2026-08');
assert.equal(pending.totals.price, null); assert.ok(pending.quality.some(r => r.text.includes('未复核')));
assert.equal(pending.series.at(-1).price, null);
const missing = query('month', '2026-10');
assert.equal(missing.totals.inbound, null); assert.equal(missing.comparisons.inbound.previous.value, null);
assert.equal(query('month', '2024-02').comparisons.price.year.reason, '缺少基期数据');
assert.equal(JSON.stringify([a.bulletinStore.list(), a.reportStore.list(), [...cache], a.priceStore.records]), frozen, 'analysis never writes source review states, saved reports or cache');
assert.equal(a.analysisStore.query({ end: '2026-08-24', count: 4, category: 'poultry' }).start, '2026-08-03', 'historical rolling queries stay compatible');
for (const result of [week, july, all, pending, missing]) assert.doesNotMatch(a.analysisInsights.markup(result), /undefined|NaN/);
assert.match(a.analysisInsights.markup(july), /月均价/);
a.access.end(); assert.equal(query('month', '2026-07').valid, false); a.access.start();

// Page/event doubles validate navigation state and generated HTML; no browser is started.
class Element {
  constructor() { this.value = ''; this.listeners = {}; this.dataset = {}; this.innerHTML = ''; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  dispatchEvent(event) { event.target ||= this; for (const fn of this.listeners[event.type] || []) fn(event); if (event.bubbles && this.parent) this.parent.dispatchEvent(event); }
  setAttribute(name, value) { this[name] = value; }
  focus() { this.focused = true; }
  insertAdjacentHTML(_, html) { this.innerHTML += html; }
}
class Event { constructor(type, options = {}) { this.type = type; Object.assign(this, options); } preventDefault() { this.prevented = true; } }
context.Event = Event;
const host = new Element(), form = new Element(), output = new Element(), error = new Element(), reset = new Element(), panel = new Element(), pickerHost = new Element();
host.clientWidth = 1100;
const controls = Object.fromEntries(['week', 'month', 'category'].map(k => { const control = new Element(); control.name = k; control.parent = form; return [k, control]; }));
controls.month.value = '2026-07'; controls.category.value = 'poultry';
form.elements = { namedItem: key => controls[key] };
const tabs = ['week', 'month'].map(kind => { const tab = new Element(); tab.dataset.analysisTab = kind; tab.closest = selector => selector === '[data-analysis-tab]' ? tab : null; return tab; });
const fields = ['week', 'month'].map(kind => { const field = new Element(); field.dataset.periodField = kind; return field; });
form.querySelectorAll = () => fields;
host.querySelectorAll = () => tabs;
host.querySelector = selector => ({ form, '#analysis-result': output, '#analysis-error': error, '#analysis-panel': panel, '#analysis-week-picker': pickerHost, '[data-action="reset"]': reset }[selector] || tabs.find(tab => selector === '[data-analysis-tab="' + tab.dataset.analysisTab + '"]'));
let picker;
a.searchSelect = (_host, name, _label, getOptions, settings) => {
  const options = getOptions(); assert.ok(options.length > 10); assert.ok(options.every(row => row.name.includes(' 至 ')));
  assert.equal(settings.floating, true);
  picker = { element: {}, setValue: value => { controls[name].value = value; }, reset: () => { controls[name].value = ''; } }; return picker;
};
a.enhanceCategorySelects = () => {}; a.enhanceQueryControls = () => {};
const queries = [], originalQuery = a.analysisStore.query;
a.analysisStore.query = filters => { queries.push({ ...filters }); return filters.kind === 'week' ? week : filters.category ? july : all; };
a.pages['admin:analysis'](host);
assert.equal(queries.at(-1).kind, 'week'); assert.equal(queries.at(-1).date, '2026-08-24');
assert.doesNotMatch(host.innerHTML, /name="count"|近 4 周|近 8 周/);
assert.match(output.innerHTML, /本周量价明细/); assert.doesNotMatch(output.innerHTML, /<svg class="analysis-chart"/);
controls.week.value = '2026-08-17'; controls.category.value = 'pork';
form.dispatchEvent(new Event('change'));
const clickTab = index => host.dispatchEvent({ type: 'click', target: tabs[index] });
clickTab(1);
assert.equal(queries.at(-1).kind, 'month'); assert.equal(queries.at(-1).category, 'poultry');
assert.ok(fields[0].hidden && !fields[1].hidden); assert.equal(panel['aria-labelledby'], 'analysis-tab-month');
assert.equal(tabs[1]['aria-selected'], 'true'); assert.equal(tabs[1].tabIndex, 0);
assert.match(output.innerHTML, /月内量价明细/); assert.match(output.innerHTML, /月内片段均价/);
assert.match(output.innerHTML, /2026-07-01/); assert.doesNotMatch(output.innerHTML, /周均价均值|undefined|NaN/);
const monthMarkup = output.innerHTML;
controls.month.value = '2026-05'; controls.category.value = '';
form.dispatchEvent(new Event('change'));
clickTab(0);
assert.equal(queries.at(-1).date, '2026-08-17'); assert.equal(queries.at(-1).category, 'pork');
reset.dispatchEvent(new Event('click'));
assert.equal(queries.at(-1).date, '2026-08-24'); assert.equal(queries.at(-1).category, 'poultry');
clickTab(1); assert.equal(queries.at(-1).date, '2026-05'); assert.equal(queries.at(-1).category, '');
controls.month.value = ''; const count = queries.length; form.dispatchEvent(new Event('change'));
assert.equal(queries.length, count); assert.match(output.innerHTML, /请选择分析月份/);
reset.dispatchEvent(new Event('click')); assert.equal(queries.at(-1).date, '2026-07');
host.dispatchEvent(new Event('keydown', { target: tabs[1], key: 'Home' })); assert.equal(queries.at(-1).kind, 'week');
host.dispatchEvent(new Event('keydown', { target: tabs[0], key: 'ArrowRight' })); assert.equal(queries.at(-1).kind, 'month');
const beforeResize = queries.length; // No ResizeObserver exists in these doubles.
assert.ok(beforeResize > count);
for (const html of [host.innerHTML, output.innerHTML, monthMarkup]) {
  const stack = [];
  for (const match of html.matchAll(/<\/?([a-z][\w-]*)\b[^>]*>/gi)) {
    const tag = match[1]; if (match[0].startsWith('</')) assert.equal(stack.pop(), tag);
    else if (!['input', 'br', 'hr', 'img', 'meta', 'link'].includes(tag) && !match[0].endsWith('/>')) stack.push(tag);
  }
  assert.equal(stack.length, 0);
}
a.analysisStore.query = originalQuery;
console.log('PASS: calendar weeks/months, leap years, weekly-fragment allocation and bulletin parity, category sums, comparisons, missing data, reference periods, session guard and frozen records. Node only.');
console.log('PASS: generated page markup, tab/keyboard selection, independent period/category state, per-tab reset and missing-period empty state. DOM doubles only; no browser rendering.');
