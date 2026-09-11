import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
function load(side, cache = new Map()) {
  // Keep baseline category fixtures; check-example-states.mjs validates the full default status bootstrap.
  const context = { window: { localStorage: { getItem: k => cache.get(k) ?? null, setItem: (k, v) => cache.set(k, v) }, location: { search: '', hash: '' } }, URL, URLSearchParams };
  const html = fs.readFileSync(new URL(side + '/index.html', root), 'utf8');
  for (const match of html.matchAll(/<script defer src="\.\.\/assets\/js\/([^"]+)"><\/script>/g)) if (!['shell.js', 'admin-example-states.js'].includes(match[1])) vm.runInNewContext(fs.readFileSync(new URL('assets/js/' + match[1], root), 'utf8'), context, { filename: match[1] });
  return context.window.FrozenApp;
}
const cache = new Map(), a = load('admin', cache), m = load('merchant');
const ids = a.categoryCatalog.ids(), plain = v => JSON.parse(JSON.stringify(v));
const monthlySeeds = a.bulletinStore.list().filter(r => r.kind === 'month');
assert.deepEqual(plain(monthlySeeds.map(r => r.start)), ['2026-07-01', '2026-06-01', '2026-05-01']);
for (const row of monthlySeeds) {
  assert.equal(row.status, 'pending'); assert.equal(row.review, null); assert.equal(row.publication, null);
  assert.equal(row.snapshot.categories.length, 12);
  assert.ok(row.history.every(h => h.action.startsWith('初始记录')));
  assert.equal(/NaN|undefined/.test(a.bulletinView.render(row)), false);
  const days = (Date.parse(row.end) - Date.parse(row.start)) / 86400000 + 1;
  assert.ok(row.snapshot.categories.every(c => c.series.reduce((n, s) => n + s.days, 0) === days));
}
// Existing caches with only a weekly report receive missing monthly rows once, without resetting user content.
const legacyWeek = plain(a.bulletinStore.list().find(r => r.kind === 'week'));
legacyWeek.title = '已保存的行情周报标题';
let legacyValue = JSON.stringify({ schema: 1, records: [legacyWeek] });
const pricesBefore = JSON.stringify(a.priceStore.records);
const restoreLegacy = options => a.bulletinData.createStore(a.analysisStore, a.priceStore, a.categoryStore, a.sourceStore, {
  storage: { getItem: () => legacyValue, setItem: (key, value) => { legacyValue = value; } }, ...options
});
const migrated = restoreLegacy();
assert.equal(migrated.list().filter(r => r.kind === 'month').length, 3);
assert.equal(JSON.stringify(migrated.get(legacyWeek.id, legacyWeek.version)), JSON.stringify(legacyWeek));
const savedMonth = migrated.list().find(r => r.kind === 'month');
migrated.edit(savedMonth.id, 1, { title: savedMonth.title + '（已校对）', summary: savedMonth.summary, signals: savedMonth.signals });
migrated.review(savedMonth.id, 1, 'approved', '已核对月度数据与文字');
const savedRecords = legacyValue;
assert.equal(restoreLegacy().list().length, 4);
assert.equal(legacyValue, savedRecords, '再次打开不能重复添加或覆盖已编辑、已复核月报');
assert.equal(JSON.stringify(a.priceStore.records), pricesBefore, '补充历史月报不能改变采价复核状态');
assert.equal(a.bulletinData.createStore(a.analysisStore, a.priceStore, a.categoryStore, a.sourceStore, { seed: false }).list().length, 0);
assert.equal(ids.length, 12); assert.equal(new Set(ids).size, 12);
assert.deepEqual(plain(ids), plain(m.categoryCatalog.ids()));
assert.equal(a.priceData.categories, a.categoryData.categories);
assert.equal(a.sourceData.categories, a.analysisData.categories);
assert.equal(a.priceStore.records.length, 1680);
assert.equal(new Set(a.priceStore.records.map(r => r.id)).size, 1680);
assert.ok(a.priceStore.records.every(r => Number.isFinite(r.price) && r.price > 0 && a.priceData.statuses[r.status]));
for (const id of ids) {
  assert.equal(a.priceStore.records.filter(r => r.category.id === id).length, 140);
  assert.equal(a.categoryStore.records.filter(r => r.categoryId === id).length, 3);
  const result = a.analysisStore.query({ end: '2026-08-24', count: 4, category: id });
  assert.ok(result.valid && Number.isFinite(result.comparisons.price.year.value));
  assert.ok(result.totals.price > 0 && result.totals.inbound > 0 && result.totals.closing > 0);
  const infos = a.sourceStore.items.filter(r => r.categories.includes(id));
  assert.ok(infos.length > 0, id + ' must have source content');
  if (!['poultry', 'seafood', 'pork'].includes(id)) assert.ok(infos.some(r => a.sourceStore.eligible(r)));
}
const all = a.analysisStore.query({ end: '2026-08-24', count: 4, category: '' });
assert.equal(all.totals.price, null); assert.equal(all.categorySummary.length, 12);
for (const key of ['inbound', 'outbound', 'closing']) assert.ok(Math.abs(all.categorySummary.reduce((n, c) => n + c.totals[key], 0) - all.totals[key]) < 0.001);
const independent = a.priceData.createStore();
const csv = a.priceData.headers.join(',') + '\n' + a.categoryCatalog.categories.map(c => '2026-09-07,' + c.name + ',18000,元/吨,统一采价记录').join('\n');
const parsed = a.priceData.parseCSV(csv), imported = independent.importRows(parsed, '全品类.csv');
assert.equal(imported.valid, true); assert.equal(parsed.length, 12);
assert.equal(new Set(independent.records.map(r => r.id)).size, independent.records.length);
const reports = a.reportStore.list(), coverage = new Set();
for (const r of reports) {
  const expected = a.reportData.merchants.find(v => v.id === r.merchant.id).categories;
  assert.deepEqual([...r.snapshot.categories.map(c => c.id)].sort(), [...expected].sort());
  assert.deepEqual([...r.snapshot.categories.map(c => c.name)].sort(), [...m.merchantProfile.get(r.merchant.id).categories].sort());
  r.snapshot.categories.forEach(c => coverage.add(c.id));
  const limits = a.reportData.textLimits(r);
  for (const key of ['summary', 'signals', 'advice']) assert.ok(r[key].length <= limits[key]);
  const edited = a.reportStore.edit(r.id, r.version, r.revision, { title: r.title, summary: r.summary, signals: r.signals, advice: r.advice + '\n请按本户经营期间核对。' });
  assert.equal(edited.status, 'pending');
}
assert.equal(new Set(reports.map(r => r.snapshot.categories.length)).size, 3); assert.equal(coverage.size, 12);
const old = a.bulletinStore.generate({ kind: 'week', date: '2026-08-24', categories: ['poultry', 'seafood', 'pork'] });
a.bulletinStore.review(old.id, 1, 'approved', '核对原范围'); a.bulletinStore.publish(old.id, 1);
const frozen = JSON.stringify(a.bulletinStore.get(old.id, 1));
const month = a.bulletinStore.list().find(r => r.kind === 'month' && r.start === '2026-07-01');
const limits = a.bulletinData.textLimits(month);
for (const key of ['summary', 'signals']) assert.ok(month[key].length <= limits[key]);
assert.ok(month.summary.length < 600);
const edited = a.bulletinStore.edit(month.id, 1, { title: month.title, summary: month.summary, signals: month.signals + '\n请复核全部品类。' });
assert.equal(edited.status, 'pending');
assert.equal(JSON.stringify(a.bulletinStore.get(old.id, 1)), frozen);
const restored = load('admin', cache);
assert.equal(JSON.stringify(restored.bulletinStore.get(old.id, 1)), frozen);
assert.equal(restored.bulletinStore.get(old.id, 1).snapshot.categories.length, 3);
assert.ok(m.marketData.valid(a.bulletinStore.published()));
for (const r of a.bulletinStore.published()) assert.equal(/NaN|undefined/.test(m.merchantView.market(r)), false);
const bad = plain(a.bulletinStore.published()[0]); bad.snapshot.categories[0].id = 'unknown';
assert.equal(m.marketData.valid([bad]), false);
for (const name of ['public', 'demo-a', 'demo-b', 'demo-c']) {
  const context = { window: { FrozenApp: m } };
  vm.runInNewContext(fs.readFileSync(new URL('assets/js/demo/' + name + '.js', root), 'utf8'), context);
}
const feed = await m.merchantDemo.load('public');
for (const id of ids) {
  assert.ok(m.merchantPage.match(feed.market, 'market', { category: id }).length);
}
for (const id of new Set(feed.news.flatMap(row => row.categories.map(category => category.id)))) assert.ok(m.merchantPage.match(feed.news, 'news', { category: id }).length);
assert.equal(feed.news.length, 3);
assert.ok(feed.market.every(r => r.snapshot.categories.length === 12));
for (const r of reports) {
  const feed = await m.merchantDemo.load(r.merchant.id);
  assert.ok(feed.every(p => JSON.stringify(p.snapshot.categories.map(c => c.id)) === JSON.stringify(r.snapshot.categories.map(c => c.id))));
}
console.log('PASS U03: shared 12-category directory, 1680 prices, 39 mappings, 5460 market flows, all-category aggregates, CSV imports, 5/2/7 household scopes, editable multi-category content, preserved legacy snapshots and complete isolated merchant feeds. Node/static only.');
