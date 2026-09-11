// Node behavior checks with controlled time/feed; no browser or external requests.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const base = new URL('../', import.meta.url);
function setup(options = {}) {
  const sandbox = { window: { FrozenApp: {} }, URL };
  for (const name of ['common', 'config', 'category-catalog', 'scenario-data', 'price-store', 'category-store', 'news-data', 'source-store', 'source-collection']) {
    vm.runInNewContext(fs.readFileSync(new URL('assets/js/' + name + '.js', base), 'utf8'), sandbox);
  }
  const app = sandbox.window.FrozenApp, source = app.sourceData.createStore();
  let clock = Date.parse('2026-09-10T10:00:00+08:00');
  const collection = app.sourceCollection.create(source, { now: () => clock, delay: () => Promise.resolve(), ...options });
  app.sourceStore = source; app.collectionStore = collection;
  return { app, source, collection, sandbox, setTime: value => { clock = typeof value === 'string' ? Date.parse(value) : value; }, now: () => clock };
}
const fixture = setup();
const { app, source, collection } = fixture;
const s = source.find('src-1');
const schedule = (id, date) => app.sourceCollection.stamp(app.sourceCollection.nextTime(id, Date.parse(date + '+08:00')));
assert.equal(schedule('twice', '2026-09-10T08:59:59'), '2026-09-10 09:00:00');
assert.equal(schedule('twice', '2026-09-10T09:00:00'), '2026-09-10 16:00:00');
assert.equal(schedule('frequent', '2026-09-10T20:00:00'), '2026-09-11 08:00:00');
assert.equal(schedule('daily', '2026-12-31T09:00:00'), '2027-01-01 09:00:00');
assert.equal(collection.config(source.find('src-2')).schedule, 'daily');
assert.equal(collection.config(source.find('src-3')).schedule, 'frequent');
assert.equal(source.items.length, 21); // Loading configuration does not fabricate a completed fetch.
assert.equal(collection.records(s.id).length, 0);
assert.equal((await collection.run('src-5')).valid, false);
const first = await collection.run(s.id);
assert.equal(first.success, true); assert.equal(first.batch.added, 1);
assert.equal(first.batch.from, fixture.now() - 30 * 86400000);
const acquired = source.items[0];
assert.equal(acquired.status, 'pending'); assert.equal(acquired.publication, null);
assert.equal(acquired.type, s.type); assert.ok(acquired.infoUrl); assert.ok(acquired.obtainedAt);
assert.equal(source.publish(acquired.id, acquired.version, s.version).valid, false);
assert.equal(source.verify(acquired.id, acquired.version, 'verified', '原文与来源范围已核对。', true).valid, true);
assert.equal(source.newsPublished().length, 0);
assert.equal(source.publish(acquired.id, acquired.version, s.version).valid, true);
const published = JSON.stringify(acquired.publication);
const repeat = await collection.run(s.id);
assert.equal(repeat.batch.duplicate, 1); assert.equal(repeat.batch.added, 0);
assert.equal(JSON.stringify(acquired.publication), published);
const version = s.version, articleVersion = acquired.version, c = collection.config(s);
assert.equal(collection.save(s.id, c.revision, { rule: c.rule, schedule: 'daily', enabled: false }).valid, true);
assert.equal(s.version, version); assert.equal(acquired.version, articleVersion);
assert.equal(JSON.stringify(acquired.publication), published); assert.equal(c.nextAt, 0);
assert.equal(collection.save(s.id, c.revision - 1, { rule: 'column', schedule: 'daily', enabled: true }).valid, false);
assert.equal(collection.save(s.id, c.revision, { rule: 'column', schedule: 'hour', enabled: true }).valid, false);
assert.equal(collection.save(s.id, c.revision, { rule: '', schedule: 'daily', enabled: true }).valid, false);
assert.equal(collection.save(s.id, c.revision, { rule: 'column', schedule: 'daily', enabled: false }).unchanged, true);
fixture.setTime('2026-09-11T16:00:00+08:00'); collection.tick();
assert.equal(c.running, false);
assert.equal((await collection.run(s.id)).success, true); // Manual remains available while automatic is off.
assert.equal(source.save({ ...s, name: s.name + '资料' }, s.id, s.version).valid, true);
assert.equal(s.status, 'pending'); assert.equal(acquired.publication, null);
assert.equal(collection.summary(s).available, false); assert.equal(c.nextAt, 0);
assert.equal((await collection.run(s.id)).valid, false);
assert.equal(source.confirm(s.id, s.version, '重新确认资料。').valid, true);
assert.equal(collection.summary(s).available, true);
assert.equal(source.save({ ...s, url: 'https://new-source.example.com/' }, s.id, s.version).valid, true);
assert.equal(c.rule, ''); assert.equal(c.enabled, false);
source.confirm(s.id, s.version, '新栏目资料确认。');
assert.equal(collection.summary(s).available, false);
assert.equal(collection.save(s.id, c.revision, { rule: 'api', schedule: 'twice', enabled: true }).valid, true);
assert.equal(collection.summary(s).available, true);
const addedSource = source.save({ name: '冻品流转观察', type: 'industry', categories: ['poultry'], scope: '冻品周度流转资料', url: 'https://flow.example.com/' });
assert.equal(addedSource.valid, true);
assert.equal(collection.config(addedSource.source).rule, '');
assert.equal((await collection.run(addedSource.source.id)).valid, false);

// Original updates retain old snapshots and article classifications, suspend publication, and require re-review.
let body = '冻品交接按同一批次记录净重，统一截止日期后比较数量。';
const updated = setup({ read: source => [{ articleId: 'stable-1', url: source.url + 'article/1#top', title: '冻品批次交接记录', content: body, publishedAt: '2026-09-10 09:00:00', categories: ['poultry'] }] });
await updated.collection.run('src-1');
const item = updated.source.items[0], original = item.content;
updated.source.verify(item.id, item.version, 'verified', '核对通过。', true);
updated.source.publish(item.id, item.version, 1);
const frozenPublication = JSON.stringify(item.publication);
item.type = 'industry'; body += '补充跨周调整记录。';
updated.setTime('2026-09-13T10:00:00+08:00');
const updateResult = await updated.collection.run('src-1');
assert.equal(updateResult.batch.updated, 1); assert.equal(item.type, 'industry');
assert.equal(item.publication, null); assert.equal(item.status, 'pending');
assert.equal(item.history.at(-1).before.content, original);
assert.equal(JSON.stringify(item.history.find(log => log.action === '资讯发布').after.publication), frozenPublication);
updated.source.verify(item.id, item.version, 'verified', '更新原文已核对。', true);
assert.equal(item.publication, null);
updated.source.publish(item.id, item.version, 1); assert.equal(item.releaseVersion, 2);

// Failures keep the successful cursor and already published content; bounded retries use 5/15 minute backoff.
let fails = true;
const failed = setup({ read: () => { if (fails) throw new Error('来源连接超时'); return []; } });
const fsSource = failed.source.find('src-1'), fc = failed.collection.config(fsSource), oldItem = failed.source.findItem('info-1');
failed.source.publish(oldItem.id, oldItem.version, 1);
const existing = JSON.stringify(oldItem.publication);
await failed.collection.run('src-1', 'automatic');
assert.equal(fc.status, 'retry'); assert.equal(fc.retryAt, failed.now() + 5 * 60000);
assert.equal(fc.cursor, 0); assert.equal(JSON.stringify(oldItem.publication), existing);
failed.setTime(fc.retryAt); failed.collection.tick(); await new Promise(resolve => setImmediate(resolve));
assert.equal(fc.attempt, 2); assert.equal(fc.retryAt, failed.now() + 15 * 60000);
failed.setTime(fc.retryAt); failed.collection.tick(); await new Promise(resolve => setImmediate(resolve));
assert.equal(fc.status, 'error'); assert.equal(fc.retryAt, 0); assert.equal(fc.nextAt, 0);
assert.equal(failed.collection.records('src-1').length, 3);
failed.setTime(failed.now() + 86400000); failed.collection.tick();
assert.equal(failed.collection.records('src-1').length, 3);
fails = false; assert.equal((await failed.collection.run('src-1')).success, true);
assert.ok(fc.cursor); assert.ok(fc.nextAt); assert.equal(fc.attempt, 0);

// Dedup within batches, malformed rows, date boundaries, successful cursor only advances on full success.
const partial = setup({ read: source => {
  const valid = { url: source.url + 'a', title: '冻品周转观察', content: '统计时明确期间与单位。', publishedAt: '2026-09-10 09:00:00', categories: ['poultry'] };
  return [valid, valid, { ...valid, url: source.url + 'old', publishedAt: '2026-07-01 09:00:00' }, { ...valid, url: source.url + 'future', publishedAt: '2026-09-11 09:00:00' }, { ...valid, url: source.url + 'bad', categories: ['unknown'] }];
} });
const part = await partial.collection.run('src-1');
assert.equal(part.batch.added, 1); assert.equal(part.batch.duplicate, 1); assert.equal(part.batch.skipped, 2); assert.equal(part.batch.failed, 1);
assert.equal(part.success, false); assert.equal(partial.collection.config(partial.source.find('src-1')).cursor, 0);

// Concurrent duplicate runs and stale source edits cannot write an in-flight result.
let release;
const concurrent = setup({ delay: () => new Promise(resolve => { release = resolve; }) });
const inflight = concurrent.collection.run('src-1');
assert.equal((await concurrent.collection.run('src-1')).valid, false);
const cs = concurrent.source.find('src-1'), cc = concurrent.collection.config(cs);
assert.equal(concurrent.collection.save(cs.id, cc.revision, { rule: 'api', schedule: 'daily', enabled: true }).valid, false);
concurrent.source.save({ ...cs, scope: cs.scope + '补充栏目。' }, cs.id, cs.version);
release(); const discarded = await inflight;
assert.equal(discarded.success, false); assert.equal(discarded.batch.added, 0); assert.equal(concurrent.source.items.length, 21);

// Automatic due-time dispatch runs once, and successful empty feeds are legitimate.
const automatic = setup({ read: () => [] });
const ac = automatic.collection.config(automatic.source.find('src-1'));
automatic.setTime(ac.nextAt); automatic.collection.tick(); automatic.collection.tick();
await new Promise(resolve => setImmediate(resolve));
assert.equal(automatic.collection.records('src-1').length, 1);
assert.equal(ac.status, 'success'); assert.equal(ac.lastResult.includes('新增 0'), true);
assert.ok(ac.nextAt > automatic.now());
// Ending a session while a fetch is in flight prevents any new article or publication writes.
let resume;
const logout = setup({ delay: () => new Promise(resolve => { resume = resolve; }) });
const cancelled = logout.collection.run('src-1');
logout.app.access = { can: () => false }; resume();
assert.equal((await cancelled).valid, false); assert.equal(logout.source.items.length, 21);
assert.equal((await logout.collection.run('src-1')).valid, false);
assert.equal(logout.collection.save('src-1', 1, { rule: 'column', schedule: 'daily', enabled: false }).valid, false);

// Exercise the actual list and settings controllers with DOM doubles, including settings error/success.
class Node {
  constructor() { this.listeners = {}; this.value = ''; this.dataset = {}; this.isConnected = true; }
  addEventListener(event, handler) { this.listeners[event] = handler; }
  focus() {}
}
class Form extends Node {
  constructor(fields) { super(); this.controls = Object.fromEntries(fields.map(name => [name, new Node()])); this.elements = { namedItem: name => this.controls[name] }; }
}
class Host extends Node {
  set innerHTML(value) { this.html = value; this.form = new Form(['category', 'status', 'keyword', ...(value.includes('name="abnormal"') ? ['abnormal', 'type', 'publication'] : [])]); this.nodes = new Map(); }
  get innerHTML() { return this.html; }
  querySelector(selector) { if (selector === 'form') return this.form; if (!this.nodes.has(selector)) this.nodes.set(selector, new Node()); return this.nodes.get(selector); }
}
const ui = setup(), uiApp = ui.app;
uiApp.pages = {}; uiApp.enhanceCategorySelects = () => {}; uiApp.enhanceQueryControls = () => {};
for (const name of ['admin-news', 'admin-source-collection', 'admin-sources']) vm.runInNewContext(fs.readFileSync(new URL('assets/js/' + name + '.js', base), 'utf8'), ui.sandbox);
const host = new Host(); uiApp.pages['admin:sources'](host);
const click = (selector, dataset) => host.listeners.click({ target: { closest: query => query === selector ? { dataset } : null } });
click('[data-source-tab]', { sourceTab: 'sources' });
assert.ok(host.html.includes('获取配置 / 下次获取'));
assert.ok(host.querySelector('#sources-rows').innerHTML.includes('获取设置'));
assert.ok(host.querySelector('#sources-rows').innerHTML.includes('data-record="src-5" disabled'));
let dialog;
Object.defineProperty(uiApp, 'openDetailPage', { get: () => uiApp.openDialog, configurable: true });
uiApp.openDialog = (container, title, body) => {
  dialog = new Node(); dialog.body = body; dialog.form = new Form(['rule', 'schedule', 'enabled']); dialog.error = new Node(); dialog.nodes = new Map();
  dialog.querySelectorAll = () => [];
  dialog.querySelector = selector => { if (selector === 'form') return dialog.form; if (selector === '[role="alert"]') return dialog.error; if (!dialog.nodes.has(selector)) dialog.nodes.set(selector, new Node()); return dialog.nodes.get(selector); };
  dialog.close = () => { dialog.closed = true; dialog.isConnected = false; if (dialog.listeners.close) dialog.listeners.close(); };
  return dialog;
};
click('[data-action]', { action: 'collection-config', record: 'src-1' });
assert.ok(dialog.body.includes('近30天')); assert.equal(dialog.body.includes('获取记录'), false); assert.equal(dialog.body.includes('最近执行情况'), false);
dialog.form.controls.rule.value = ''; dialog.form.controls.schedule.value = 'daily'; dialog.form.controls.enabled.checked = true;
const submit = () => dialog.form.listeners.submit({ preventDefault() {}, target: dialog.form });
submit(); assert.ok(dialog.error.textContent.includes('配置获取规则')); assert.equal(dialog.closed, undefined);
dialog.form.controls.rule.value = 'api'; submit(); assert.equal(dialog.closed, true);
assert.equal(ui.collection.config(ui.source.find('src-1')).schedule, 'daily');
assert.equal(host.querySelector('#sources-feedback').textContent, '获取设置已保存。');
await ui.collection.run('src-1');
assert.ok(host.querySelector('#sources-rows').innerHTML.includes('新增 1'));
assert.ok(uiApp.collectionActions.records('src-1').includes('查看获取明细'));
click('[data-action]', { action: 'collection-records', record: 'src-1' });
assert.ok(dialog.body.includes('获取记录')); assert.ok(dialog.body.includes('5分钟')); assert.ok(dialog.body.includes('最近执行情况'));
await ui.collection.run('src-1');
assert.ok(dialog.querySelector('.task-workspace-main').innerHTML.includes('最近执行情况'), 'open records refresh after collection events');
dialog.close();
uiApp.sourcePageCleanup();
const html = fs.readFileSync(new URL('admin/index.html', base), 'utf8');
assert.ok(html.indexOf('source-store.js') < html.indexOf('source-collection.js'));
assert.ok(html.indexOf('source-collection.js') < html.indexOf('admin-sources.js'));
assert.equal(fs.readFileSync(new URL('merchant/index.html', base), 'utf8').includes('source-collection.js'), false);
console.log('PASS: source collection schedule, configuration gates, first/incremental fetch, dedup, original updates, audit/publication snapshots, failures/retries, concurrency, automatic dispatch and script boundaries. Node only; no browser or live fetching.');
