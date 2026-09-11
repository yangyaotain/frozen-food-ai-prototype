import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const files = new Map();
const storage = { getItem: key => files.get(key) ?? null, setItem: (key, value) => files.set(key, value) };
const sandbox = { window: { FrozenApp: {}, localStorage: storage }, URL };
for (const name of ['common', 'category-catalog', 'price-store', 'category-store', 'source-store', 'analysis-store', 'market-data', 'bulletin-store', 'bulletin-view']) {
  vm.runInNewContext(fs.readFileSync(new URL('../assets/js/' + name + '.js', import.meta.url), 'utf8'), sandbox);
}
const app = sandbox.window.FrozenApp;
const store = app.bulletinStore;
const makeStore = options => app.bulletinData.createStore(app.analysisStore, app.priceStore, app.categoryStore, app.sourceStore, options);
const fresh = makeStore({ seed: false });
const week = { kind: 'week', date: '2026-08-17', categories: ['pork'] };
assert.equal(store.published().length, 1);
assert.equal(store.published()[0].version, 1);
assert.ok(store.get(store.list()[0].id, 1).history.every(event => event.action.startsWith('初始记录')));
assert.equal(app.marketData.read().length, 1);
assert.equal(fresh.published().length, 0);
assert.equal(fresh.storageAvailable(), false);

// 期间、品类及数据充分性在写入前验证，失败不遗留半份草稿。
for (const invalid of [
  { ...week, date: '2026-08-18' }, { ...week, date: '2026-02-30' },
  { ...week, categories: [] }, { ...week, categories: ['pork', 'pork'] },
  { ...week, categories: ['unknown'] }, { ...week, date: '2026-09-07' },
  { ...week, date: '2026-08-31', categories: ['poultry'] },
  { kind: 'month', date: '2026-08', categories: ['seafood'] },
  { kind: 'month', date: '2026-13', categories: ['pork'] }
]) assert.throws(() => fresh.generate(invalid));
assert.equal(fresh.list().length, 0);
const draft = fresh.generate(week);
assert.throws(() => fresh.generate(week), /已存在/);
assert.equal(fresh.list().length, 1);
assert.equal(draft.status, 'pending');
assert.throws(() => fresh.publish(draft.id, 1), /尚未复核/);
assert.equal(fresh.published().length, 0);
assert.equal(app.marketData.project(draft), null);
assert.throws(() => fresh.review(draft.id, 1, 'approved', ' '));
fresh.review(draft.id, 1, 'revision', '补充说明');
assert.throws(() => fresh.publish(draft.id, 1));
const copy = { title: draft.title, summary: draft.summary + '\n补充：全部为虚构演示数据。', signals: draft.signals };
fresh.edit(draft.id, 1, copy);
assert.equal(fresh.get(draft.id, 1).status, 'pending');
fresh.review(draft.id, 1, 'approved', '数值与数据期间一致');
fresh.edit(draft.id, 1, { ...copy, title: copy.title + '（复核稿）' });
assert.equal(fresh.get(draft.id, 1).review, null);
assert.throws(() => fresh.publish(draft.id, 1));
fresh.review(draft.id, 1, 'approved', '重新核对文字与数据完成');
fresh.publish(draft.id, 1);
assert.throws(() => fresh.publish(draft.id, 1));
assert.throws(() => fresh.edit(draft.id, 1, copy));
const oldPublished = JSON.stringify(fresh.published()[0]);
const revision = fresh.revise(draft.id, 1);
assert.equal(revision.version, 2);
assert.equal(revision.publication, null);
assert.equal(revision.review, null);
assert.equal(JSON.stringify(fresh.published()[0]), oldPublished);
assert.throws(() => fresh.revise(draft.id, 1));
fresh.edit(draft.id, 2, { ...copy, summary: '修订摘要：仍仅为模拟数据。' });
fresh.review(draft.id, 2, 'approved', '修订说明已核对');
assert.equal(fresh.published()[0].version, 1);
fresh.publish(draft.id, 2);
assert.equal(fresh.published().length, 1);
assert.equal(fresh.published()[0].version, 2);
assert.equal(JSON.stringify(app.marketData.project(fresh.get(draft.id, 1))), oldPublished);
assert.equal(fresh.versions(draft.id).length, 2);

// 返回值及源数据变化不能修改已生成或已发布快照。
const frozen = JSON.stringify(fresh.get(draft.id, 1).snapshot);
draft.snapshot.categories[0].totals.price = 1;
const price = app.priceStore.records.find(p => p.week.id === week.date && p.category.id === 'pork');
app.priceStore.save({ start: price.week.id, category: 'pork', price: '21000', unit: '元/吨', note: '测试改价' }, price.id);
const mapping = app.categoryStore.find('raw-012');
app.categoryStore.save(mapping.id, { categoryId: 'pork', note: '测试映射' }, mapping.version);
assert.equal(JSON.stringify(fresh.get(draft.id, 1).snapshot), frozen);
const isolated = makeStore({ seed: false });
assert.throws(() => isolated.generate(week), /数据不足/);
app.priceStore.review(price.id, 'reviewed', '检查通过');
assert.equal(isolated.generate(week).snapshot.categories[0].totals.price, 21000);

// 周数量均分到日：周合计不变，月边界裁切，月底库存不能取下一周周末。
for (const quantity of [0, 1, 18.25, 64, 139.99]) {
  const sum = Array.from({ length: 7 }, (_, day) => app.bulletinData.dayPart(quantity, day)).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - quantity) < 1e-9);
}
const month = isolated.generate({ kind: 'month', date: '2026-08', categories: ['pork'] });
assert.equal(month.start, '2026-08-01');
assert.equal(month.end, '2026-08-31');
const category = month.snapshot.categories[0];
assert.equal(category.series.length, 6);
assert.equal(category.series[0].days, 2);
assert.equal(category.series[5].days, 1);
assert.equal(category.series.reduce((n, row) => n + row.days, 0), 31);
assert.equal(category.series[0].start, '2026-08-01');
assert.equal(category.series[5].end, '2026-08-31');
const lastWeek = app.analysisStore.weekly('2026-08-31', 'pork');
const expectedStock = lastWeek.closing - lastWeek.inbound + lastWeek.outbound + app.bulletinData.dayPart(lastWeek.inbound, 0) - app.bulletinData.dayPart(lastWeek.outbound, 0);
assert.ok(Math.abs(category.totals.closing - expectedStock) < 1e-9);
assert.notEqual(category.totals.closing, lastWeek.closing);
assert.equal(category.totals.price, Math.round((17600 * 2 + 17900 * 7 + 17800 * 7 + 21000 * 7 + 18300 * 7 + 18200) / 31 * 100) / 100);
assert.ok(Math.abs(category.totals.inbound - category.series.reduce((n, row) => n + row.inbound, 0)) < 1e-9);
assert.equal(app.bulletinData.period({ kind: 'month', date: '2024-02' }).end, '2024-02-29');
assert.equal(app.bulletinData.period({ kind: 'month', date: '2026-02' }).end, '2026-02-28');

// 来源核验失效仅影响新快照；旧快照保留当时引用的内容和版本。
const referencePrice = app.priceStore.records.find(p => p.week.id === '2026-08-31' && p.category.id === 'poultry');
app.priceStore.review(referencePrice.id, 'reviewed', '完成测试采价复核');
const refDraft = isolated.generate({ kind: 'week', date: '2026-08-31', categories: ['poultry'] });
const refJSON = JSON.stringify(refDraft.snapshot.references);
const eligible = app.sourceStore.items.filter(item => app.sourceStore.eligible(item) && item.categories.includes('poultry') && item.publishedAt.startsWith('2026-09-06'));
assert.ok(eligible.length > 0);
for (const item of eligible) app.sourceStore.flag(item.id, item.version, '核验状态变化测试');
assert.equal(JSON.stringify(isolated.get(refDraft.id, 1).snapshot.references), refJSON);
assert.equal(makeStore({ seed: false }).generate({ kind: 'week', date: '2026-08-31', categories: ['poultry'] }).snapshot.references.length, 0);

// 公开投影仅含已发布汇总；不包含原始映射、采价行、复核意见或管理历史。
const live = fresh.get(draft.id, 2);
live.snapshot.categories[0].rawRows = [{ merchant: 'must-not-cross' }];
live.snapshot.categories[0].series[0].rawId = 'raw-secret';
const publicRow = app.marketData.project(live);
const publicJSON = JSON.stringify(publicRow);
for (const marker of ['provenance', 'mappings', 'history', 'opinion', 'rawRows', 'raw-secret', 'must-not-cross']) assert.equal(publicJSON.includes(marker), false);
assert.equal(app.marketData.valid([publicRow]), true);
assert.equal(app.marketData.valid([draft]), false);
assert.equal(app.marketData.write([publicRow]), true);
assert.equal(JSON.stringify(app.marketData.read()[0]), publicJSON);
const restored = makeStore({ storage, onPublish: app.marketData.write });
assert.equal(restored.list().length, store.list().length);
assert.equal(JSON.stringify(restored.published()), JSON.stringify(store.published()));
const brokenStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
const memoryOnly = makeStore({ storage: brokenStorage, seed: false });
assert.equal(memoryOnly.storageAvailable(), false);
memoryOnly.generate({ kind: 'week', date: '2026-08-10', categories: ['pork'] });
assert.equal(memoryOnly.list().length, 1);
assert.equal(memoryOnly.storageAvailable(), false);

// 共用正文的转义与静态接线；不代表浏览器渲染或点击验证。
const unsafe = { ...publicRow, title: '<img src=x onerror=alert(1)>', summary: '<script>alert(1)</script>' };
const markup = app.bulletinView.render(unsafe);
assert.ok(markup.includes('&lt;img'));
assert.equal(markup.includes('<script>'), false);
assert.ok(markup.includes('仅供参考，不作为经营决策依据'));
const merchant = fs.readFileSync(new URL('../merchant/index.html', import.meta.url), 'utf8');
for (const privateModule of [ 'price-store', 'source-store', 'category-store', 'analysis-store', 'bulletin-store', 'admin-bulletins']) assert.equal(merchant.includes(privateModule), false);
const css = fs.readFileSync(new URL('../assets/css/bulletins.css', import.meta.url), 'utf8');
const tokens = fs.readFileSync(new URL('../assets/css/tokens.css', import.meta.url), 'utf8');
const defined = new Set([...tokens.matchAll(/(--[a-z-\d]+)\s*:/g)].map(match => match[1]));
for (const match of css.matchAll(/var\((--[a-z-\d]+)\)/g)) assert.ok(defined.has(match[1]), 'Unknown design token: ' + match[1]);
console.log('PASS: generation validation, publication gates, revision visibility, immutable snapshots, calendar-month allocation, verified sources, public projection, persistence, escaping and stylesheet token references. Node data/static checks only; no browser verification.');
