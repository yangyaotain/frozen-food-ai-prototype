// Actual source controller with small DOM doubles; no browser/layout verification.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const cache = new Map();
const sandbox = { window: { FrozenApp: { pages: {} }, localStorage: { getItem: k => cache.get(k) ?? null, setItem: (k, v) => cache.set(k, v) } }, URL };
for (const name of ['common', 'category-catalog', 'scenario-data', 'price-store', 'category-store', 'news-data', 'source-store', 'admin-news', 'admin-sources', 'analysis-store']) vm.runInNewContext(fs.readFileSync(new URL('../assets/js/' + name + '.js', import.meta.url), 'utf8'), sandbox);
const app = sandbox.window.FrozenApp, store = app.sourceStore;
assert.equal(store.items.length, 21);
assert.equal(store.sources.length, 9);
for (const item of store.items) {
  assert.ok(item.content.split('\n\n').length >= 3, item.id);
  assert.equal(item.history[0].after.content, item.content);
  if (!item.platformFacts) continue;
  const f = item.platformFacts;
  const actual = app.analysisStore.query({ end: f.week, count: 1, category: f.categoryId });
  assert.equal(actual.valid, true);
  for (const key of ['price', 'inbound', 'outbound', 'closing']) assert.equal(f[key], Number(actual.totals[key].toFixed(2)), item.id + ':' + key);
  assert.ok(item.publishedAt.slice(0, 10) > actual.end, item.id + ': complete reference week before publication');
}
assert.equal(app.newsActions.preview, undefined);
class Node {
  constructor() { this.listeners = {}; this.value = ''; this.dataset = {}; }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  focus() { this.focused = true; }
  setAttribute(name, value) { this[name] = value; }
}
class Form extends Node {
  constructor(fields) { super(); this.controls = Object.fromEntries(fields.map(k => [k, Object.assign(new Node(), { name: k })])); this.elements = { namedItem: name => this.controls[name] || null }; }
  reset() { Object.values(this.controls).forEach(n => { n.value = ''; }); }
}
class Container extends Node {
  set innerHTML(value) {
    this.html = value;
    this.form = new Form(['category', 'status', 'keyword', ...(value.includes('name="abnormal"') ? ['abnormal', 'type', 'publication'] : [])]);
    this.nodes = new Map();
  }
  get innerHTML() { return this.html; }
  querySelector(selector) { if (selector === 'form') return this.form; if (!this.nodes.has(selector)) this.nodes.set(selector, new Node()); return this.nodes.get(selector); }
}
app.enhanceCategorySelects = () => {};
app.enhanceQueryControls = () => {};
const host = new Container(); app.pages['admin:sources'](host);
const dispatch = (event, selector, dataset, key) => host.listeners[event]({ target: { closest: s => s === selector ? { dataset } : null }, key, preventDefault() {} });
const click = (action, record) => dispatch('click', '[data-action]', { action, record });
const tab = value => dispatch('click', '[data-source-tab]', { sourceTab: value });
const query = () => host.form.listeners.submit({ preventDefault() {} });
assert.ok(host.html.includes('role="tablist"'));
assert.ok(host.html.includes('id="sources-panel"'));
assert.equal(host.html.includes('商户资讯预览'), false);
assert.ok(host.html.includes('aria-labelledby="sources-tab-items"'));
assert.ok(host.html.includes('资讯分类'));
assert.ok(host.html.includes('原文发布时间'));
host.form.controls.type.value = 'policy';
host.form.listeners.change({ target: { tagName: 'SELECT' } });
assert.ok(host.querySelector('#sources-count').textContent.startsWith('共 2 条'));
host.form.controls.publication.value = 'ready';
host.form.listeners.change({ target: { tagName: 'SELECT' } });
assert.ok(host.querySelector('#sources-count').textContent.startsWith('共 1 条'));
assert.ok(host.querySelector('#sources-rows').innerHTML.includes('政策信息'));
click('reset');
tab('sources');
host.form.controls.keyword.value = '禽肉'; query();
assert.ok(host.querySelector('#sources-count').textContent.startsWith('共 1 条'));
tab('items'); assert.ok(host.html.includes('aria-labelledby="sources-tab-items"'));
assert.ok(host.html.includes('发布状态'));
host.form.controls.keyword.value = 'no-such-content';
host.form.controls.status.value = 'pending'; host.form.listeners.change({ target: { tagName: 'SELECT' } });
assert.ok(host.querySelector('#sources-rows').innerHTML.includes('colspan="7"'));
dispatch('keydown', '[data-source-tab]', { sourceTab: 'items' }, 'End');
assert.equal(host.form.controls.keyword.value, '禽肉');
assert.equal(host.querySelector('[data-source-tab="sources"]').focused, true);
dispatch('keydown', '[data-source-tab]', { sourceTab: 'sources' }, 'ArrowRight');
assert.equal(host.form.controls.keyword.value, 'no-such-content');
click('linked', 'src-1');
assert.ok(host.querySelector('#sources-count').textContent.startsWith('共 2 条'));
click('clear-source'); assert.ok(host.querySelector('#sources-count').textContent.startsWith('共 21 条'));
tab('sources'); click('reset');
let opened;
Object.defineProperty(app, 'openDetailPage', { get: () => app.openDialog, configurable: true });
app.openDialog = (container, title, body) => {
  const form = new Form(['name', 'type', 'scope', 'sourceAddress']);
  form.checked = []; form.errors = ['name', 'type', 'scope', 'url', 'categories'].map(error => Object.assign(new Node(), { dataset: { error } }));
  form.querySelectorAll = s => s === '[name="categories"]:checked' ? form.checked : s === '[data-error]' ? form.errors : Object.values(form.controls);
  form.querySelector = () => Object.values(form.controls).find(n => n['aria-invalid'] === 'true');
  const dialog = { form, title, body, close() { this.closed = true; }, querySelector: () => form };
  opened = dialog; return dialog;
};
function fill(source) {
  for (const k of ['name', 'type', 'scope']) opened.form.controls[k].value = source[k];
  opened.form.controls.sourceAddress.value = source.url;
  opened.form.checked = source.categories.map(value => ({ value }));
}
const save = () => opened.form.listeners.submit({ preventDefault() {} });
click('create');
assert.ok(opened.body.includes('autocomplete="off"'));
assert.ok(opened.body.includes('type="url"'));
assert.equal(opened.body.includes('jdbc:'), false);
const fresh = { name: '冻品周转资料中心', type: 'industry', scope: '冷冻商品周度流转记录与批次观察', categories: ['poultry'], url: 'jdbc:nebula://invalid' };
fill(fresh); save(); assert.equal(opened.closed, undefined);
assert.equal(opened.form.controls.sourceAddress['aria-invalid'], 'true');
assert.equal(opened.form.controls.sourceAddress.focused, true);
opened.form.controls.sourceAddress.value = 'https://turnover.example.com/'; save();
assert.equal(opened.closed, true);
assert.equal(host.querySelector('#sources-feedback').textContent, '来源已保存，待确认来源。');
const item = store.findItem('info-1'), source = store.find(item.sourceId);
assert.equal(store.publish(item.id, item.version, source.version).valid, true);
const published = JSON.stringify(item.publication), raw = item.content;
click('edit', source.id); fill(source); save();
assert.equal(host.querySelector('#sources-feedback').textContent, '来源资料未变化。');
assert.equal(JSON.stringify(item.publication), published);
click('edit', source.id); fill({ ...source, scope: source.scope + '补充批次归档范围。' }); save();
assert.ok(host.querySelector('#sources-feedback').textContent.includes('关联 2 条信息需重新核验'));
assert.ok(host.querySelector('#sources-feedback').textContent.includes('1 条已发布资讯暂停展示'));
assert.equal(item.content, raw);
assert.equal(store.newsPublished().length, 0);
assert.ok(item.history.some(h => h.action === '资讯发布' && JSON.stringify(h.after.publication) === published));
assert.equal(store.confirm(source.id, source.version, '已核对新的信息范围').valid, true);
assert.equal(store.verify(item.id, item.version, 'verified', '已核对原文与展示稿').valid, true);
assert.equal(store.newsPublished().length, 0);
assert.equal(store.publish(item.id, item.version, source.version).valid, true);
assert.equal(item.publication.publication.version, 2);
console.log('PASS: source tabs, query retention, keyboard switching, URL validation, accurate save feedback, frozen reference data and publication suspension/history. Node DOM/data checks only; no browser verification.');
