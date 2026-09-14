// Default-entry state coverage and usable workflows. Node only, no browser or service.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
function load(cache = new Map()) {
  const context = { window: { setTimeout, localStorage: { getItem: k => cache.get(k) ?? null, setItem: (k, v) => cache.set(k, v) }, location: { hash: '', search: '' } }, URL, URLSearchParams };
  for (const match of read('admin/index.html').matchAll(/<script defer src="..\/assets\/js\/([^"]+)"><\/script>/g)) {
    if (match[1] !== 'shell.js') vm.runInNewContext(read('assets/js/' + match[1]), context, { filename: match[1] });
  }
  return context.window.FrozenApp;
}
const cache = new Map(), a = load(cache);
const sorted = values => [...new Set(values)].sort();
const states = ['approved', 'pending', 'published', 'revision'];
assert.deepEqual(Array.from(a.exampleStateCoverage.errors), []);
for (const store of [a.bulletinStore, a.reportStore]) {
  for (const kind of ['week', 'month']) {
    const rows = store.list().filter(r => r.kind === kind).sort((x, y) => y.updatedAt.localeCompare(x.updatedAt) || y.start.localeCompare(x.start));
    assert.deepEqual(sorted(rows.map(r => r.status)), states);
    assert.deepEqual(sorted(rows.slice(0, 8).map(r => r.status)), states, kind + ' first page must show all four statuses');
    for (const row of rows) {
      const body = row.merchant ? a.reportView.render(row) : a.bulletinView.render(row);
      assert.equal(/NaN|undefined/.test(body), false);
      assert.ok(row.highlights.length >= 2 && row.highlights.length <= 4);
      if (row.merchant) assert.ok(row.adviceSummary.length >= 20 && row.adviceHighlights.length >= 2 && row.adviceHighlights.length <= 4);
      if (['approved', 'published'].includes(row.status)) assert.ok(row.review?.actor && row.review?.opinion && row.review?.time);
      if (row.status === 'published') assert.ok(row.publication?.time && a.publicationPolicy.allowed(row));
      if (row.status === 'revision') assert.ok(row.history.some(h => h.action.includes('退回') && h.opinion));
    }
  }
}
for (const merchant of a.reportData.merchants) for (const kind of ['week', 'month']) {
  const rows = a.reportStore.list().filter(r => r.kind === kind && r.merchant.id === merchant.id);
  assert.ok(rows.some(r => r.status === 'pending') && rows.some(r => r.status === 'published'));
  assert.ok(a.reportStore.publishedFor(merchant.id).every(r => r.merchant.id === merchant.id && r.status === 'published'));
}
assert.equal(a.bulletinStore.published().length, 5);
for (const merchant of a.reportData.merchants) {
  const published = a.reportStore.publishedFor(merchant.id);
  assert.equal(published.length, 4);
  assert.deepEqual(Object.fromEntries(['week', 'month'].map(kind => [kind, published.filter(row => row.kind === kind).length])), { week: 2, month: 2 });
}
assert.deepEqual(sorted(a.priceStore.records.map(r => r.status)), ['pending', 'reviewed', 'revision']);
assert.equal(a.priceStore.records.find(r => r.week.id === '2026-08-31' && r.category.id === 'poultry').status, 'pending');
assert.equal(a.priceStore.records.find(r => r.week.id === '2026-08-31' && r.category.id === 'seafood').status, 'revision');
assert.deepEqual(sorted(a.categoryStore.records.map(r => !!r.categoryId)), [false, true]);
assert.deepEqual(sorted(a.sourceStore.items.map(r => r.status)), ['pending', 'rejected', 'verified']);
assert.deepEqual(sorted(a.sourceStore.items.map(a.sourceStore.publicationState)), ['paused', 'published', 'ready', 'unpublished']);
assert.equal(a.sourceStore.newsPublished().length, 9);
assert.deepEqual(Object.fromEntries(['policy', 'industry', 'market'].map(type => [type, a.sourceStore.newsPublished().filter(row => row.type === type).length])), { policy: 2, industry: 3, market: 4 });
assert.ok(a.sourceStore.newsPublished().every(row => row.summary.length >= 20 && row.highlights.length >= 2 && row.highlights.length <= 4 && row.attention.length >= 20));
const paused = a.sourceStore.items.find(r => a.sourceStore.publicationState(r) === 'paused');
assert.ok(paused.history.some(h => h.after?.publication));
assert.equal(a.sourceStore.newsPublished().some(r => r.id === paused.id), false);
assert.equal(a.systemStore.list('users', { status: 'disabled' }).length, 1);
assert.equal(a.systemStore.list('roles', { status: 'disabled' }).length, 1);
assert.equal(a.systemStore.members('archive-reader').length, 0);
assert.deepEqual(sorted(a.traceData.list().map(r => r.type)), ['anomaly', 'generate', 'import', 'maintain', 'publish', 'review', 'revise', 'seed']);
for (const key of ['week', 'month', 'report-week', 'report-month']) {
  const logs = a.generationStore.records(key.startsWith('report') ? 'reports' : 'bulletins', key);
  for (const status of ['running', 'waiting', 'success', 'failed']) assert.ok(logs.some(r => r.status === status), key + ':' + status);
  if (key.startsWith('report')) {
    const partial = logs.find(r => r.status === 'partial');
    assert.equal(partial.details.filter(d => d.status === 'success').length, 2);
    assert.equal(partial.details.filter(d => d.status === 'waiting').length, 1);
  }
}
const summaries = a.sourceStore.sources.map(s => a.collectionStore.summary(s));
for (const label of ['获取异常', '等待重试', '手动获取', '自动获取已启用', '待确认来源', '待配置规则']) assert.ok(summaries.some(s => s.label === label));
assert.equal(a.sourceStore.sources.filter(s => a.collectionStore.records(s.id).length).length, 4);
// Default complete analysis remains complete; alternative existing selections reveal missing prices/baselines.
const complete = a.analysisStore.query({ end: '2026-08-24', count: 4, category: 'poultry' });
assert.ok(complete.valid && complete.totals.price > 0);
assert.equal(a.analysisStore.weekly('2026-08-31', 'poultry').price, null);

// Cache preservation, version linkage and continued operations are checked on the actual default entry.
let edited = a.bulletinStore.list().find(r => r.kind === 'month' && r.status === 'pending');
a.bulletinStore.edit(edited.id, edited.version, { title: '已维护的月报标题', summary: edited.summary, highlights: ['已维护的月报重点一，保留当前数据期间。', '已维护的月报重点二，继续核对量价口径。'], signals: edited.signals });
let changed = a.reportStore.list().find(r => r.kind === 'month' && r.status === 'pending');
changed = a.reportStore.edit(changed.id, changed.version, changed.revision, { ...changed, highlights: ['本户月度经营结论一。', '本户月度经营结论二。'], adviceSummary: '本期建议继续核对库存结构与出库节奏，市场价格只作参照。', adviceHighlights: ['重点核对库存批次与连续出库节奏。', '重点核对出库变化是否受集中交付影响。'] });
a.reportStore.review(changed.id, changed.version, changed.revision, 'revision', '补充本户周转原因');
const before = JSON.stringify([a.bulletinStore.list(), a.reportStore.list()]);
const again = load(cache);
assert.deepEqual(Array.from(again.exampleStateCoverage.errors), []);
assert.equal(JSON.stringify([again.bulletinStore.list(), again.reportStore.list()]), before);
for (const group of ['bulletins', 'reports']) {
  const store = group === 'bulletins' ? again.bulletinStore : again.reportStore;
  const row = store.list().find(r => r.status === 'approved' && r.kind === 'week');
  const published = group === 'bulletins' ? store.publish(row.id, row.version) : store.publish(row.id, row.version, row.revision);
  assert.equal(published.status, 'published');
  const draft = group === 'bulletins' ? store.revise(row.id, row.version) : store.revise(row.id, row.version, published.revision);
  assert.equal(draft.status, 'pending'); assert.equal(draft.version, row.version + 1);
  assert.equal(store.get(row.id, row.version).status, 'published');
}
const disabled = again.systemStore.get('roles', 'archive-reader');
again.systemStore.change('roles', disabled.id, disabled.version, 'status');
assert.equal(again.systemStore.get('roles', disabled.id).status, 'enabled');
const source = again.sourceStore.sources.find(s => again.collectionStore.summary(s).label === '获取异常');
const obtaining = again.collectionStore.run(source.id, 'manual');
assert.equal(again.collectionStore.summary(source).label, '获取中');
assert.equal((await obtaining).success, true);
assert.equal(again.collectionStore.summary(source).config.running, false);
assert.ok(again.collectionStore.records(source.id)[0].collectionBatch.added > 0);
assert.ok(again.sourceStore.items.some(r => r.collectionBatchId && r.sourceId === source.id && r.status === 'pending'));
assert.equal(read('merchant/index.html').includes('admin-example-states.js'), false);
console.log('PASS: default four-tab states/first pages, per-merchant drafts and publications, news/source/collection/system states, linked trace/import/revision evidence, complete analysis, cache preservation and continued publish/revise actions. Node/static only.');
