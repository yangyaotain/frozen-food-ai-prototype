// Article classifications, independent source defaults and frozen publication history.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const cache = new Map();
const sandbox = { window: { FrozenApp: {}, localStorage: { getItem: k => cache.get(k) ?? null, setItem: (k, v) => cache.set(k, v) } }, URL };
for (const name of ['common', 'config', 'category-catalog', 'scenario-data', 'price-store', 'category-store', 'news-data', 'source-store', 'news-view', 'admin-news']) {
  vm.runInNewContext(fs.readFileSync(new URL('../assets/js/' + name + '.js', import.meta.url), 'utf8'), sandbox);
}
const app = sandbox.window.FrozenApp, store = app.sourceStore;
assert.equal(app.config.admin.routes.find(r => r.id === 'sources').title, '行业资讯');
assert.equal(app.sourceData.types, app.newsView.types);
assert.equal(Object.keys(app.newsTypes).join(','), 'policy,industry,market');
for (const row of store.items) {
  assert.equal(row.type, store.find(row.sourceId).type);
  assert.equal(row.history[0].after.type, row.type);
}
const item = store.findItem('info-3'), sibling = store.findItem('info-4'), source = store.find(item.sourceId);
const original = { title: item.title, content: item.content };
assert.equal(store.publish(item.id, item.version, source.version).valid, true);
const first = JSON.stringify(item.publication);
const originalVersion = item.version;
const draft = { title: item.displayTitle, content: item.displayContent, until: item.validThrough, resolution: '本条归入供需行情，已核对文章内容与分类。', type: 'market' };
const before = JSON.stringify(item);
assert.equal(store.editDisplay(item.id, item.version, { ...draft, type: 'unknown' }).valid, false);
assert.equal(store.editDisplay(item.id, item.version, { ...draft, type: '' }).valid, false);
assert.equal(JSON.stringify(item), before);
assert.equal(store.editDisplay(item.id, item.version, draft).valid, true);
assert.equal(item.type, 'market');
assert.equal(source.type, 'industry');
assert.equal(sibling.type, 'industry');
assert.equal(item.status, 'pending');
assert.equal(item.publication, null);
assert.equal(store.publicationState(item), 'paused');
assert.equal(store.queryItems({ type: 'market', publication: 'paused', keyword: item.title }).length, 1);
assert.equal(store.newsPublished().length, 0);
assert.equal(app.newsData.read().length, 0);
assert.equal(store.publish(item.id, item.version, source.version).valid, false);
assert.equal(store.editDisplay(item.id, originalVersion, draft).valid, false);
assert.equal(item.title, original.title);
assert.equal(item.content, original.content);
assert.equal(JSON.stringify(item.history.find(h => h.action === '资讯发布').after.publication), first);
const changed = item.history.at(-1);
assert.equal(changed.before.type, 'industry');
assert.equal(changed.after.type, 'market');
assert.equal(store.editDisplay(item.id, item.version, draft).unchanged, true);
assert.equal(store.verify(item.id, item.version, 'verified', '已逐篇核对资讯分类、正文和来源。', true).valid, true);
assert.equal(store.publicationState(item), 'ready');
assert.equal(store.newsPublished().length, 0);
assert.equal(store.publish(item.id, item.version, source.version).valid, true);
assert.equal(item.publication.type, 'market');
assert.equal(item.publication.publication.version, 2);
assert.equal(app.newsData.query(app.newsData.read(), { type: 'market' }).length, 1);
assert.equal(app.newsData.query(app.newsData.read(), { type: 'industry' }).length, 0);
assert.ok(app.newsView.detail(item.publication).includes('供需行情'));
assert.equal(store.editDisplay(item.id, item.version, draft).unchanged, true);
assert.equal(store.publicationState(item), 'published');
const second = JSON.stringify(item.publication);
// Editing a source default retains each existing article's independent classification.
assert.equal(store.save({ ...source, type: 'policy' }, source.id, source.version).valid, true);
assert.equal(item.type, 'market');
assert.equal(sibling.type, 'industry');
assert.equal(item.publication, null);
assert.equal(store.confirm(source.id, source.version, '已确认来源资料与默认资讯分类。').valid, true);
assert.equal(store.verify(item.id, item.version, 'verified', '已核对新来源版本及文章分类。', true).valid, true);
assert.equal(store.publish(item.id, item.version, source.version).valid, true);
assert.equal(item.publication.type, 'market');
assert.equal(JSON.stringify(item.history.filter(h => h.action === '资讯发布')[1].after.publication), second);
assert.equal(JSON.parse(first).type, 'industry');
// Only type differs from the approved display draft; it must invalidate publication.
const copyBefore = [item.displayTitle, item.displayContent, item.resolution, item.validThrough].join('|');
assert.equal(store.editDisplay(item.id, item.version, { ...draft, type: 'policy' }).valid, true);
assert.equal(item.type, 'policy');
assert.equal(item.status, 'pending');
assert.equal(item.publication, null);
assert.equal([item.displayTitle, item.displayContent, item.resolution, item.validThrough].join('|'), copyBefore);
let opened;
app.openTaskWorkspace = (host, options) => {
  opened = { title: options.title, body: [options.meta, options.main, options.aside, options.actions].join(''), querySelector: () => ({ addEventListener() {} }) };
  return { element: opened, complete() {} };
};
app.openDialog = (host, title, body) => {
  opened = { title, body, querySelector: () => ({ addEventListener() {} }) };
  return opened;
};
app.newsActions.edit({}, item.id, () => {});
assert.ok(opened.body.includes('name="type" required'));
assert.ok(opened.body.includes('value="policy" selected'));
assert.equal(store.verify(item.id, item.version, 'verified', '已再次核对分类及正文。', true).valid, true);
app.newsActions.publish({}, item.id, () => {});
assert.ok(opened.body.includes('小程序 → 行业资讯 → 政策信息'));
assert.ok(opened.body.includes('适用品类'));
console.log('PASS: shared classifications, combined filters, category-only re-review, manual republication, source-default independence and immutable original/publication snapshots.');
