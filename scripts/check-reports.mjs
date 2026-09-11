import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const cache = new Map();
const storage = { getItem: key => cache.get(key) ?? null, setItem: (key, value) => cache.set(key, value) };
const sandbox = { window: { FrozenApp: {}, localStorage: storage }, URL };
for (const name of ['common', 'category-catalog', 'price-store', 'category-store', 'source-store', 'analysis-store', 'market-data', 'bulletin-store', 'bulletin-view', 'report-store', 'report-view']) {
  vm.runInNewContext(fs.readFileSync(new URL('../assets/js/' + name + '.js', import.meta.url), 'utf8'), sandbox);
}
const app = sandbox.window.FrozenApp;
assert.equal(app.reportStore.list().length, 9);
assert.ok(app.reportStore.list().every(r => ['week', 'month'].includes(r.kind)));
// Exercise legacy immutable report operations separately from the new calendar seeds.
cache.delete('frozen-admin-reports-v1');
const store = app.reportData.createStore(app.analysisStore, app.categoryStore, app.sourceStore, app.bulletinStore, { seed: false, storage });
app.reportData.merchants.forEach(m => store.generate({ merchant: m.id, end: '2026-08-24', count: 4 }));
const factory = (options = {}) => app.reportData.createStore(app.analysisStore, app.categoryStore, app.sourceStore, app.bulletinStore, { seed: false, ...options });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
assert.equal(store.list().length, 3);
assert.ok(store.list().every(r => r.status === 'pending'));
assert.equal(store.publishedFor('demo-a').length, 0);
const weeks = [...new Set(app.analysisStore.flows.map(f => f.week))].sort();
const single = factory();
// 验证每个商户每周：原始名称、品类和周汇总一致；单户连续，三户合计仍小于市场总量。
const last = new Map();
for (const week of weeks) {
  const reports = app.reportData.merchants.map(m => single.generate({ merchant: m.id, end: week, count: 1 }));
  for (const row of reports) {
    const s = row.snapshot;
    for (const key of ['opening', 'inbound', 'outbound', 'closing']) {
      near(s.totals[key], s.rows.reduce((n, r) => n + r[key], 0));
      near(s.totals[key], s.categories.reduce((n, c) => n + c.own[key], 0));
      near(s.totals[key], s.series[0][key]);
    }
    near(s.totals.opening + s.totals.inbound - s.totals.outbound, s.totals.closing);
    for (const raw of s.rows) {
      near(raw.opening + raw.inbound - raw.outbound, raw.closing);
      assert.ok(raw.opening >= 0 && raw.closing >= 0);
      const key = row.merchant.id + raw.rawId;
      if (last.has(key)) near(last.get(key), raw.opening);
      last.set(key, raw.closing);
    }
    assert.ok(Math.abs(s.categories.reduce((n, c) => n + c.share, 0) - 100) <= 0.02);
  }
  const market = app.analysisStore.weekly(week, '');
  for (const key of ['inbound', 'outbound', 'closing']) assert.ok(reports.reduce((n, r) => n + r.snapshot.totals[key], 0) < market[key]);
}
const draft = store.list()[0];
assert.equal(draft.start, '2026-08-03');
assert.equal(draft.end, '2026-08-30');
const total = draft.snapshot.totals;
near(total.inbound, draft.snapshot.series.reduce((n, r) => n + r.inbound, 0));
near(total.closing, draft.snapshot.series.at(-1).closing);
near(total.turnover.average, (total.opening + total.closing) / 2);
assert.equal(total.turnover.times, Math.round(total.outbound / ((total.opening + total.closing) / 2) * 100) / 100);
assert.equal(total.turnover.days, Math.round(28 * ((total.opening + total.closing) / 2) / total.outbound * 100) / 100);
assert.equal(app.reportData.turnover(0, 0, 5, 7).times, null);
assert.equal(app.reportData.turnover(10, 10, 0, 7).times, 0);
assert.equal(app.reportData.turnover(10, 10, 0, 7).days, null);
assert.equal(draft.snapshot.bulletins.length, 1);
for (const c of draft.snapshot.categories) {
  const market = app.analysisStore.query({ end: '2026-08-24', count: 4, category: c.id });
  near(c.market.price, market.totals.price);
  assert.equal(c.market.prices.length, 4);
}
const empty = factory();
for (const input of [
  { merchant: 'unknown', end: '2026-08-24', count: 4 },
  { merchant: 'demo-a', end: '2026-08-25', count: 4 },
  { merchant: 'demo-a', end: '2026-08-24', count: 2 },
  { merchant: 'demo-a', end: '2026-09-07', count: 1 }
]) assert.throws(() => empty.generate(input));
assert.equal(empty.list().length, 0);
assert.throws(() => store.generate({ merchant: draft.merchant.id, end: '2026-08-24', count: 4 }), /已有报告/);
const noPrice = empty.generate({ merchant: 'demo-a', end: '2026-08-31', count: 4 });
assert.equal(noPrice.snapshot.categories.find(c => c.id === 'poultry').market.price, null);
assert.equal(noPrice.snapshot.categories.find(c => c.id === 'poultry').market.prices.length, 3);
assert.ok(noPrice.advice.includes('市场价格数据不足'));
assert.equal(noPrice.status, 'pending');

// 共同复核与版本保护：建议单独变化同样清除通过结论，旧窗口不可覆盖新状态。
const id = draft.id;
let current = () => store.get(id, store.list().find(r => r.id === id).version);
const call = (name, ...args) => { const r = current(); return store[name](r.id, r.version, r.revision, ...args); };
assert.throws(() => call('publish'));
assert.throws(() => call('review', 'approved', '核对完成', { report: true, advice: false }));
assert.throws(() => call('review', 'approved', ' ', { report: true, advice: true }));
call('review', 'revision', '请补充建议边界');
const text = r => ({ title: r.title, summary: r.summary, signals: r.signals, advice: r.advice });
call('edit', { ...text(current()), advice: current().advice + '\n需核对近期订单。' });
call('review', 'approved', '报告及建议均已核对', { report: true, advice: true });
const approved = current();
call('edit', { ...text(current()), advice: current().advice + '\n继续观察实际出库。' });
assert.equal(current().review, null);
assert.equal(current().status, 'pending');
assert.throws(() => store.publish(id, approved.version, approved.revision), /已变化/);
call('review', 'approved', '重新核对完成', { report: true, advice: true });
call('publish');
const old = JSON.stringify(store.publishedFor(draft.merchant.id)[0]);
assert.throws(() => call('edit', text(current())));
call('revise');
assert.equal(current().version, 2);
assert.equal(JSON.stringify(store.publishedFor(draft.merchant.id)[0]), old);
call('edit', { ...text(current()), summary: current().summary + ' 修订说明。' });
call('review', 'approved', '修订版共同核对完成', { report: true, advice: true });
assert.equal(store.publishedFor(draft.merchant.id)[0].version, 1);
call('publish');
assert.equal(store.publishedFor(draft.merchant.id)[0].version, 2);
assert.equal(store.get(id, 1).status, 'published');
assert.equal(store.publishedFor('demo-b').length, 0);
assert.equal(store.publishedFor('').length, 0);
assert.equal(store.publishedFor('unknown').length, 0);
assert.equal('history' in store.publishedFor(draft.merchant.id)[0], false);
assert.equal('opinion' in store.publishedFor(draft.merchant.id)[0].review, false);

// 上游变化只影响新生成报告，已发布正文、简报引用和本户快照不变。
const frozen = JSON.stringify(store.get(id, 1));
const ownClone = store.get(id, 1); ownClone.snapshot.totals.closing = 0;
const unmapped = app.categoryStore.find('raw-004');
app.categoryStore.save(unmapped.id, { categoryId: 'poultry', note: '测试映射' }, unmapped.version);
const price = app.priceStore.records.find(p => p.category.id === 'poultry' && p.week.id === '2026-08-24');
app.priceStore.save({ start: price.week.id, category: 'poultry', price: '20000', unit: '元/吨', note: '变更测试' }, price.id);
assert.equal(JSON.stringify(store.get(id, 1)), frozen);
const newRow = factory().generate({ merchant: draft.merchant.id, end: '2026-08-24', count: 4 });
assert.equal(newRow.snapshot.unmapped, draft.snapshot.unmapped - 1);
assert.ok(newRow.snapshot.totals.closing > draft.snapshot.totals.closing);
assert.equal(newRow.snapshot.categories.find(c => c.id === 'poultry').market.price, null);
const restored = factory({ storage });
assert.equal(JSON.stringify(restored.get(id, 1)), frozen);
assert.equal(restored.publishedFor(draft.merchant.id)[0].version, 2);
const blocked = factory({ storage: { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } } });
blocked.generate({ merchant: 'demo-c', end: '2026-08-17', count: 1 });
assert.equal(blocked.storageAvailable(), false);
assert.equal(blocked.list().length, 1);

// 输出转义、HTML 标签配对和端侧依赖检查（静态，不模拟浏览器）。
const html = app.reportView.render({ ...store.get(id, 1), advice: '<img src=x onerror=alert(1)>' });
assert.ok(html.includes('&lt;img'));
assert.ok(html.includes('仅供参考，不作为经营决策依据'));
const stack = [], voids = new Set(['input', 'br', 'hr', 'img', 'meta', 'link']);
for (const match of html.matchAll(/<\/?([a-z][\w-]*)\b[^>]*>/gi)) {
  const tag = match[1];
  if (match[0].startsWith('</')) assert.equal(stack.pop(), tag, 'Unbalanced rendered HTML');
  else if (!voids.has(tag) && !match[0].endsWith('/>')) stack.push(tag);
}
assert.equal(stack.length, 0);
const merchantHTML = fs.readFileSync(new URL('../merchant/index.html', import.meta.url), 'utf8');
assert.equal(merchantHTML.includes('report-store.js'), false);
assert.equal(merchantHTML.includes('admin-reports.js'), false);
assert.equal(app.marketData.read().some(r => r.merchant), false);
console.log('PASS: merchant/market aggregation, stock continuity, turnover boundaries, missing prices, common review/publish gates, stale revisions, immutable snapshots, merchant-scoped published data, persistence and rendered HTML static checks. No browser verification.');
