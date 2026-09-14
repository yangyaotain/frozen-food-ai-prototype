// Minimal DOM doubles exercise actual controller events, not browser layout.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const source = name => fs.readFileSync(new URL('assets/js/' + name, root), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
class Node {
  constructor() { this.html = ''; this.listeners = {}; this.hidden = false; this.disabled = false; this.textContent = ''; this.dataset = {}; this.isConnected = true; this.scrollTop = 0; this.scrollHeight = 1500; this.clientHeight = 700; this.style = {}; this.classList = { toggle() {}, remove() {} }; }
  set innerHTML(value) { this.html = value; const match = value.match(/name="keyword"[^>]*value="([^"]*)"/); this.input = match ? { value: match[1] } : null; }
  get innerHTML() { return this.html; }
  insertAdjacentHTML(position, html) { assert.equal(position, 'beforeend'); this.html += html; }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  removeEventListener(type, fn) { if (this.listeners[type] === fn) delete this.listeners[type]; }
  setAttribute() {}
  focus() { this.focused = true; }
  scrollTo({ top }) { this.scrollTop = top; }
  querySelector(selector) { if (selector === 'input' || selector === '[name="keyword"]') return this.input; return null; }
  querySelectorAll(selector) { return selector === '[data-open]' ? Array.from(this.html.matchAll(/data-open="([^"]+)"/g), m => Object.assign(new Node(), { dataset: { open: m[1] } })) : []; }
}
function runtime(live = false, search = '') {
  const listeners = {}, timers = new Map(), cache = new Map(), requests = []; let timerId = 0;
  const w = { FrozenApp: {}, location: { search, hash: '' }, scrollY: 0, requestAnimationFrame: fn => fn(), scrollTo: ({ top }) => { w.scrollY = top; },
    localStorage: { getItem: k => cache.get(k) ?? null, setItem: (k, v) => cache.set(k, v) },
    addEventListener: (type, fn) => { listeners[type] = fn; }, removeEventListener: (type, fn) => { if (listeners[type] === fn) delete listeners[type]; },
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id) };
  const historyEntries = [null]; let historyIndex = 0;
  w.history = { get state() { return historyEntries[historyIndex]; },
    replaceState(value) { historyEntries[historyIndex] = clone(value); },
    pushState(value) { historyEntries.splice(++historyIndex); historyEntries.push(clone(value)); },
    back() { if (historyIndex > 0) { historyIndex--; listeners.popstate?.({}); } },
    forward() { if (historyIndex + 1 < historyEntries.length) { historyIndex++; listeners.popstate?.({}); } } };
  w.parent = live ? { postMessage: msg => requests.push(msg) } : w;
  const context = { window: w, URLSearchParams, URL };
  const entry = fs.readFileSync(new URL('merchant/index.html', root), 'utf8');
  for (const m of entry.matchAll(/<script defer src="..\/assets\/js\/([^"]+)"><\/script>/g)) if (m[1] !== 'shell.js') vm.runInNewContext(source(m[1]), context);
  for (const name of ['public', 'demo-a', 'demo-b']) vm.runInNewContext(source('demo/' + name + '.js'), context);
  const a = w.FrozenApp;
  // Business-controller fixtures now receive a signed-in identity. Auth is checked separately.
  const signedId = new URLSearchParams(search).get('merchant') || 'demo-a';
  a.merchantAuth.current = () => ({ merchantId: signedId });
  // Layout APIs are deliberately not simulated; markup has separate structural checks.
  a.merchantView.charts = () => () => {};
  let picker;
  a.merchantUI.picker = (title, options, selected, choose) => { picker = { title, options, selected, choose }; };
  function mount(mode) {
    const nodes = Object.fromEntries(['filters', 'status', 'update', 'output', 'back', 'heading', 'scroll', 'header', 'tabs', 'pull', 'loadStatus', 'logout'].map(k => [k, new Node()]));
    const container = new Node(), layout = new Node();
    layout.querySelector = s => s === 'h1' ? nodes.heading : s === '[data-mini-back]' ? nodes.back : s === '.merchant-content' ? nodes.scroll : s === '.merchant-header' ? nodes.header : s === '.merchant-tabs' ? nodes.tabs : null;
    container.closest = () => layout;
    container.querySelector = s => ({ '[data-mini-filters]': nodes.filters, '[data-status]': nodes.status, '[data-update]': nodes.update, '[data-output]': nodes.output, '[data-pull]': nodes.pull, '[data-load-status]': nodes.loadStatus, '[data-mini-logout]': nodes.logout })[s];
    w.location.hash = '#' + mode;
    a.pages['merchant:' + mode](container, a.config.merchant.routes.find(r => r.id === mode));
    const click = (kind, data) => {
      const target = { dataset: data || {}, disabled: false };
      container.listeners.click({ target: { closest: s => s === kind ? target : null }, preventDefault() {} });
    };
    return { ...nodes, container, click, choose: value => picker.choose(value), picker: () => picker, query: () => nodes.filters.listeners.submit({ preventDefault() {} }), ids: () => Array.from(nodes.output.html.matchAll(/data-open="([^"]+)"/g), m => m[1]) };
  }
  function flush() { for (const [id, fn] of Array.from(timers)) { timers.delete(id); fn(); } }
  return { a, w, mount, cache, requests, timers, listeners, flush, receive: data => listeners.message({ source: w.parent, data }), foreign: data => listeners.message({ source: {}, data }) };
}
const standalone = runtime(), a = standalone.a;
const publicData = await a.merchantDemo.load('public'), own = await a.merchantDemo.load('demo-a'), other = await a.merchantDemo.load('demo-b');
const copyAs = (row, suffix, changes) => Object.assign(clone(row), { id: row.id + '-flow-' + suffix }, changes || {});
const expandedPublic = {
  market: publicData.market.concat([copyAs(publicData.market.find(row => row.kind === 'week'), 'market-1'), copyAs(publicData.market.findLast(row => row.kind === 'week'), 'market-2')]),
  news: publicData.news.concat([
    copyAs(publicData.news.find(row => row.type === 'industry'), 'news-1'),
    copyAs(publicData.news.find(row => row.type === 'market'), 'news-2'),
    copyAs(publicData.news.find(row => row.type === 'industry'), 'news-3'),
    copyAs(publicData.news.find(row => row.type === 'market'), 'news-4'),
    copyAs(publicData.news.find(row => row.type === 'industry'), 'news-prepared', { categories: [{ id: 'prepared', name: '速冻调理品' }] })
  ])
};
a.merchantDemo.register('public', expandedPublic);
let page = standalone.mount('market'); await tick();
function scrollMore(page, runtime) { page.scroll.scrollTop = 850; page.scroll.listeners.scroll(); runtime.flush(); }
assert.equal(page.ids().length, 4);
assert.equal(page.header.hidden, true); assert.equal(page.tabs.hidden, false);
assert.equal(/data-mini="(?:refresh|more|reset)"/.test(page.container.html + page.filters.html + page.output.html), false);
const firstCards = page.output.html;
scrollMore(page, standalone); assert.equal(page.ids().length, 7); assert.ok(page.output.html.startsWith(firstCards)); // Appended without replacing existing cards.
assert.equal(page.loadStatus.textContent, '没有更多了');
page.scroll.scrollTop = 400; standalone.w.scrollY = 19; page.click('[data-open]', { open: page.ids()[0] });
assert.equal(page.back.hidden, false); assert.equal(page.filters.hidden, true); assert.equal(page.scroll.scrollTop, 0);
assert.equal(page.header.hidden, false); assert.equal(page.tabs.hidden, true);
page.back.onclick(); assert.equal(page.scroll.scrollTop, 400); assert.equal(page.ids().length, 7); assert.equal(standalone.w.scrollY, 19);
standalone.w.history.forward(); assert.equal(page.filters.hidden, true); page.back.onclick();
page.click('[data-mini]', { mini: 'kind' }); page.choose('month'); assert.equal(page.ids().length, 2);
page.click('[data-mini]', { mini: 'kind' }); page.choose(''); assert.equal(page.ids().length, 4);
page.click('[data-mini]', { mini: 'category' });
assert.equal(page.picker().options.length, a.categoryCatalog.ids().length + 1);
assert.equal(new Set(page.picker().options.slice(1).map(o => o[2])).size, 5);
for (const id of a.categoryCatalog.ids()) { page.choose(id); assert.equal(page.ids().length, 4); }
page.choose('');
page = standalone.mount('news'); await tick(); assert.equal(page.ids().length, 4);
scrollMore(page, standalone); assert.equal(page.ids().length, 8);
  page.click('[data-mini]', { mini: 'category' }); page.choose('prepared'); assert.equal(page.ids().length, 2);
page.choose(''); scrollMore(page, standalone);
page.filters.input.value = '交接'; assert.equal(page.ids().length, 8); // Typing is not querying.
  page.click('[data-filter]', { filter: 'type', value: 'policy' }); assert.equal(page.ids().length, 2); // Selection includes current text.
page.click('[data-filter]', { filter: 'type', value: '' }); page.filters.input.value = '交接'; page.query();
assert.equal(page.ids().length, 4);
if (a.presentation) { page.filters.input.value = a.presentation.text(publicData.news.find(r => r.type === 'policy').source.name); page.query(); assert.equal(page.ids().length, 2); }
page = standalone.mount('reports'); await tick(); assert.equal(page.ids().length, own.length);
const reportId = page.ids()[0];
page.scroll.scrollTop = 300; page.click('[data-open]', { open: reportId });
page.scroll.scrollTop = 500; page.click('[data-mini]', { mini: 'related' });
assert.equal(standalone.w.location.hash, '#reports'); assert.ok(page.output.html.includes('本户经营建议'));
assert.equal(page.heading.textContent, '经营建议'); assert.equal(page.scroll.scrollTop, 0);
page.back.onclick(); assert.equal(page.heading.textContent, '经营报告'); assert.equal(page.scroll.scrollTop, 500);
page.click('[data-mini]', { mini: 'reference', reference: '0' });
assert.equal(page.heading.textContent, '行情详情'); assert.equal(page.tabs.hidden, true);
page.back.onclick(); assert.equal(page.heading.textContent, '经营报告'); assert.equal(page.scroll.scrollTop, 500);
page.back.onclick(); assert.equal(page.scroll.scrollTop, 300); assert.equal(page.tabs.hidden, false);
const standaloneSeen = JSON.parse(standalone.cache.get('mini-demo-v1:frozen-merchant-reports-v1:demo-a:seen'));
assert.equal(standaloneSeen['reports:' + reportId], 1); assert.equal(standaloneSeen['advice:' + reportId], 1);
assert.ok([...standalone.cache.keys()].every(k => k.startsWith('mini-demo-v1:')));
page = standalone.mount('profile');
assert.equal(page.heading.textContent, '我的'); assert.equal(page.back.hidden, true);
assert.equal(page.header.hidden, true); assert.equal(page.tabs.hidden, false);
assert.equal(page.scroll.scrollTop, 0); assert.ok(page.container.html.includes('丰茂冻品商行'));
assert.equal(page.container.html.includes('href="#reports"') || page.container.html.includes('href="#advice"'), false);
assert.equal(page.container.html.includes('润泽水产商行'), false);
const householdB = runtime(false, '?merchant=demo-b').mount('profile');
assert.ok(householdB.container.html.includes('润泽水产商行')); assert.equal(householdB.container.html.includes('丰茂冻品商行'), false);
// Embedded previews never load fixtures, even for no publication or timeout.
const live = runtime(true); let loads = 0; live.a.merchantDemo.load = () => { loads++; throw Error('must not load samples in preview'); };
page = live.mount('reports'); assert.equal(page.ids().length, 0); assert.equal(live.requests.at(-1).merchantId, 'demo-a');
live.foreign({ type: 'frozen-reports-published', merchantId: 'demo-a', records: own }); assert.equal(page.ids().length, 0);
live.receive({ type: 'frozen-reports-published', merchantId: 'demo-b', records: other }); assert.equal(page.ids().length, 0);
live.receive({ type: 'frozen-reports-published', merchantId: 'demo-a', records: [...own, other[0]] }); assert.equal(page.ids().length, 0);
live.receive({ type: 'frozen-reports-published', merchantId: 'demo-a', records: own }); assert.equal(page.ids().length, Math.min(4, own.length));
const selected = page.ids()[0]; page.click('[data-open]', { open: selected });
page.scroll.scrollTop = 410; const unchangedDetail = page.output.html;
const latest = clone(own); latest.find(r => r.id === selected).version = 2;
live.receive({ type: 'frozen-reports-published', merchantId: 'demo-a', records: latest });
assert.equal(page.scroll.scrollTop, 410); assert.equal(page.output.html, unchangedDetail);
assert.ok(page.update.html.includes('新版本 V2')); assert.ok(page.output.html.includes('已复核发布 · V1'));
page.click('[data-mini]', { mini: 'latest' }); assert.ok(page.output.html.includes('已复核发布 · V2')); assert.equal(page.update.html, '');
const seen = JSON.parse(live.cache.get('frozen-merchant-reports-v1:demo-a:seen'));
assert.equal(seen['reports:' + selected], 2); assert.equal(seen['advice:' + selected], undefined);
live.receive({ type: 'frozen-reports-published', merchantId: 'demo-a', records: [] }); assert.equal(page.back.hidden, true); assert.equal(page.ids().length, 0);
page = live.mount('news'); live.receive({ type: 'frozen-news-published', records: publicData.news });
page.click('[data-open]', { open: page.ids()[0] }); live.receive({ type: 'frozen-news-published', records: [] }); assert.equal(page.back.hidden, true); assert.equal(page.ids().length, 0);
page = live.mount('market'); assert.ok(live.timers.size); live.flush();
assert.ok(page.status.textContent.includes('暂未同步')); assert.equal(loads, 0); assert.equal(page.ids().length, 0);
live.a.merchantCleanup(); assert.equal(live.timers.size, 0);
assert.equal(live.listeners.popstate, undefined); assert.equal(live.listeners.mousemove, undefined);
// Pull gestures use the actual shared controller, with touch cancellation/direction and a mouse demo path.
{
  const r = runtime(true), p = r.mount('news');
  r.receive({ type: 'frozen-news-published', records: expandedPublic.news });
  const target = { closest: () => null };
  const touch = (x, y) => ({ touches: [{ clientX: x, clientY: y }], target, cancelable: true, preventDefault() { this.prevented = true; } });
  const start = (x, y) => p.scroll.listeners.touchstart(touch(x, y));
  const move = (x, y) => { const e = touch(x, y); p.scroll.listeners.touchmove(e); return e; };
  const end = () => p.scroll.listeners.touchend();
  const requests = r.requests.length;
  start(0, 0); move(0, 90); end(); assert.equal(r.requests.length, requests); // Under threshold.
  start(0, 0); assert.equal(move(100, 20).prevented, undefined); end(); assert.equal(r.requests.length, requests);
  p.scroll.scrollTop = 100; start(0, 0); move(0, 180); end(); assert.equal(r.requests.length, requests);
  p.scroll.scrollTop = 0; start(0, 0); move(0, 180); p.scroll.listeners.touchcancel(); assert.equal(r.requests.length, requests);
  start(0, 0); assert.equal(move(0, 140).prevented, true); assert.equal(p.pull.textContent, '松开刷新'); end();
  assert.equal(r.requests.length, requests + 1); assert.equal(p.ids().length, 4);
  start(0, 0); move(0, 180); end(); assert.equal(r.requests.length, requests + 1); // Busy guard.
  r.receive({ type: 'frozen-news-published', records: expandedPublic.news }); assert.equal(p.pull.textContent, '已更新');
  p.scroll.listeners.mousedown({ button: 0, clientX: 0, clientY: 0, target });
  r.listeners.mousemove({ buttons: 1, clientX: 0, clientY: 160, cancelable: true, preventDefault() {} });
  r.listeners.mouseup(); assert.equal(r.requests.length, requests + 2);
  let blockedClick = false; p.scroll.listeners.click({ preventDefault() { blockedClick = true; }, stopImmediatePropagation() {} });
  assert.equal(blockedClick, true);
  r.receive({ type: 'frozen-news-published', records: expandedPublic.news });
  p.scroll.scrollTop = 900; p.scroll.listeners.scroll(); p.scroll.listeners.scroll();
  assert.equal(p.loadStatus.textContent, '正在加载…'); r.flush(); assert.equal(p.ids().length, 8); // One batch, no duplicates.
  assert.equal(new Set(p.ids()).size, 8);
  p.scroll.scrollTop = 0; start(0, 0); move(0, 160); end();
  r.receive({ type: 'frozen-news-published', records: [{ bad: true }] });
  assert.equal(p.ids().length, 8); assert.ok(p.status.textContent.includes('未被替换'));
  p.click('[data-open]', { open: p.ids()[0] });
  const requestCount = r.requests.length; start(0, 0); move(0, 180); end(); assert.equal(r.requests.length, requestCount);
  r.a.merchantCleanup(); assert.equal(r.timers.size, 0);
}
const unknown = runtime(false, '?merchant=not-a-household'); page = unknown.mount('reports'); assert.equal(page.ids().length, 0);
const unknownProfile = unknown.mount('profile'); assert.ok(unknownProfile.container.html.includes('未识别当前商户')); assert.equal(unknownProfile.container.html.includes('WF-0001'), false);
// Modal geometry follows the bordered frame; closing/replacing restores only its scroller.
{
  const resizeHandlers = new Set(), queuedClose = [], scroller = { style: { overflow: 'auto' } };
  const frame = { clientLeft: 1, clientTop: 1, clientWidth: 428, clientHeight: 766,
    getBoundingClientRect: () => ({ left: 200, bottom: 784 }), appendChild() {}, querySelector: () => scroller };
  const trigger = new Node();
  class Dialog extends Node {
    constructor() { super(); this.style = {}; }
    showModal() { this.open = true; }
    close() { this.open = false; queuedClose.push(() => this.listeners.close()); }
    remove() { this.isConnected = false; }
  }
  const c = { window: { FrozenApp: {}, innerHeight: 800,
    addEventListener: (type, fn) => resizeHandlers.add(fn), removeEventListener: (type, fn) => resizeHandlers.delete(fn) },
    document: { activeElement: trigger, createElement: () => new Dialog(), querySelector: () => frame } };
  vm.runInNewContext(source('common.js'), c); vm.runInNewContext(source('merchant-ui.js'), c);
  const ui = c.window.FrozenApp.merchantUI, first = ui.sheet('月份', '<p>月份列表</p>');
  assert.equal(first.style.top, 'auto'); assert.equal(first.style.right, 'auto');
  assert.equal(first.style.left, '201px'); assert.equal(first.style.bottom, '17px'); assert.equal(first.style.width, '428px');
  assert.equal(scroller.style.overflow, 'hidden');
  frame.clientWidth = 358; for (const fn of resizeHandlers) fn(); assert.equal(first.style.width, '358px');
  const second = ui.sheet('引用行情', '<p>正文</p>', null, true);
  assert.equal(second.style.height, Math.floor(766 * 0.94) + 'px');
  queuedClose.shift()(); assert.equal(scroller.style.overflow, 'hidden');
  ui.closeSheet(); assert.equal(scroller.style.overflow, 'auto'); assert.equal(resizeHandlers.size, 0);
  queuedClose.shift()(); assert.equal(scroller.style.overflow, 'auto');
}
console.log('PASS: actual merchant controllers in Node DOM doubles: standalone feeds, filter selection/current text, query, pull refresh, automatic append, return position, same-version navigation, independent reading versions, trusted-window/household validation, update choice, empty publication/invalidation and timeout without demo fallback. No browser/layout test.');
