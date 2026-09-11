import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const sandbox = { window: { FrozenApp: {} }, URL };
for (const name of ['category-catalog', 'price-store', 'category-store', 'source-store', 'analysis-store']) vm.runInNewContext(fs.readFileSync(new URL('../assets/js/' + name + '.js', import.meta.url), 'utf8'), sandbox);
const app = sandbox.window.FrozenApp;
const prices = app.priceData.createStore();
const categories = app.categoryData.createStore(prices);
const sources = app.sourceData.createStore();
const analysis = app.analysisData.createStore(prices, categories, sources);
const query = (extra = {}) => analysis.query({ end: '2026-08-31', count: 4, category: 'pork', ...extra });
assert.equal(analysis.flows.length, categories.records.length * 8);
for (const raw of categories.records) {
  const rows = analysis.flows.filter(row => row.rawId === raw.id).sort((a, b) => a.week.localeCompare(b.week));
  for (let i = 0; i < rows.length; i++) {
    assert.equal(rows[i].opening + rows[i].inbound - rows[i].outbound, rows[i].closing);
    assert.ok(rows[i].opening >= 0 && rows[i].closing >= 0);
    if (i) assert.equal(rows[i].opening, rows[i - 1].closing);
  }
  assert.equal(rows[7].closing, raw.closing);
  assert.equal(rows[7].inbound, raw.inbound);
}
const result = query();
assert.equal(result.valid, true);
assert.equal(result.start, '2026-08-10');
assert.equal(result.end, '2026-09-06');
assert.equal(result.previousStart, '2026-07-13');
assert.equal(result.previousEnd, '2026-08-09');
assert.equal(result.totals.price, (17800 + 18000 + 18300 + 18200) / 4);
assert.equal(result.totals.closing, categories.related('raw-009').totals.closing);
assert.equal(result.totals.inbound, result.series.reduce((sum, row) => sum + row.inbound, 0));
assert.notEqual(result.totals.closing, result.series.reduce((sum, row) => sum + row.closing, 0));
assert.equal(result.comparisons.price.year.value, null);
assert.equal(result.comparisons.price.year.reason, '缺少基期数据');
assert.ok(Number.isFinite(result.comparisons.price.previous.value));
assert.equal(query({ count: 8 }).comparisons.inbound.previous.value, null);
assert.equal(query({ category: 'poultry' }).totals.price, null);
assert.equal(query({ category: '' }).totals.price, null);
assert.equal(query({ category: '' }).priceSeries.length, app.categoryCatalog.categories.length);
assert.equal(query({ end: '2026-09-07' }).totals.closing, null);
assert.equal(query({ end: '' }).valid, false);
assert.equal(query({ end: '2026-09-08' }).valid, false);
assert.equal(query({ end: '2026-02-30' }).valid, false);
assert.equal(query({ count: 2 }).valid, false);
assert.equal(query({ count: '' }).valid, false, 'clearing the required range cannot produce an analysis');
assert.equal(app.analysisData.compare(10, 0).reason, '基期为零');
assert.equal(app.analysisData.compare(0, 10).value, -100);
assert.equal(query({ end: '2020-12-28' }).yearStart, null);

// 使用当前映射，未映射名称不汇总；建立映射后本期与比较期同时更新。
const allBefore = query({ category: '' }).totals.closing;
const unmapped = categories.find('raw-012');
categories.save(unmapped.id, { categoryId: 'pork', note: '' }, unmapped.version);
assert.equal(query({ category: '' }).totals.closing, allBefore + unmapped.closing);
assert.equal(query().totals.closing, result.totals.closing + unmapped.closing);
assert.equal(query().unmapped, 2);
// 复核生效；改价后重新待复核，不能沿用旧价生成趋势。
const pending = prices.records.find(row => row.week.id === '2026-08-31' && row.category.id === 'poultry');
prices.review(pending.id, 'reviewed', '核对完成');
assert.ok(query({ category: 'poultry' }).totals.price > 0);
prices.save({ start: pending.week.id, category: 'poultry', price: '15000', unit: '元/吨', note: '调整' }, pending.id);
assert.equal(query({ category: 'poultry' }).totals.price, null);
prices.review(pending.id, 'reviewed', '核对完成');
assert.ok(query({ category: 'poultry' }).anomalies.length > 0);
// 来源核验与时间范围同时约束参考信息。
const refResult = query({ category: 'poultry' });
assert.ok(refResult.references.length > 0);
assert.equal(query({ category: 'poultry', end: '2026-08-24' }).references.length, 0);
const ref = refResult.references[0];
sources.flag(ref.id, ref.version, '需重新核验');
assert.equal(query({ category: 'poultry' }).references.some(item => item.id === ref.id), false);
console.log('PASS: weekly stock continuity, period aggregation, comparison windows, missing/zero data, mappings, approved price changes and verified reference filtering. Node data checks only; no browser verification.');
