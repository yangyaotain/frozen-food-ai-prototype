import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const ui = read('assets/js/ui.js');
const shell = read('assets/js/shell.js');
const css = read('assets/css/common.css');
const news = read('assets/js/admin-news.js');
const sources = read('assets/js/admin-sources.js');
const bulletins = read('assets/js/admin-bulletins.js');
const reports = read('assets/js/admin-reports.js');

assert.match(ui, /app\.openTaskWorkspace\s*=\s*function/);
assert.match(ui, /history\.pushState\(marker/);
assert.match(ui, /addEventListener\('popstate'/);
assert.match(ui, /addEventListener\('beforeunload'/);
assert.match(ui, /confirmDiscard/);
assert.match(ui, /app\.enhanceTextareaCounters/);
assert.match(shell, /app\.taskWorkspaceCleanup/);

for (const token of ['.task-workspace-layout', '.task-workspace-header', '.task-workspace-footer', '.task-workspace-aside', '.editor-textarea--article', '.editor-textarea--advice', '.task-compare']) assert.ok(css.includes(token), 'missing workspace style ' + token);
assert.match(css, /task-workspace-layout\s*\{[^}]*grid-template-columns:/);
assert.match(css, /task-workspace-footer\s*\{[^}]*position:\s*sticky/);
assert.match(css, /task-workspace-aside\s*\{[^}]*overflow:\s*auto/);
assert.match(css, /\[data-task-workspace-list\]\[hidden\]\s*\{[^}]*display:\s*none\s*!important/);

assert.match(news, /openTaskWorkspace\(host, \{ title: '整理资讯展示稿'/);
assert.match(news, /editor-textarea--article/);
assert.match(news, /保存并进入待核验/);
assert.match(news, /<h2>原文留档<\/h2>/);

assert.match(bulletins, /openTaskWorkspace\(host, \{ title: '编辑简报/);
assert.match(bulletins, /openTaskWorkspace\(host, \{ title: '复核简报/);
assert.match(bulletins, /待复核简报全文/);
assert.doesNotMatch(bulletins, /function edit\([\s\S]*?function review[\s\S]*?openDialog\(host, '编辑简报/);

assert.match(reports, /openTaskWorkspace\(host, \{ title: '编辑报告与建议/);
assert.match(reports, /openTaskWorkspace\(host, \{ title: '报告及建议共同复核/);
assert.match(reports, /editor-textarea--advice/);
assert.match(reports, /共同保存/);

assert.match(sources, /openTaskWorkspace\(host, \{ title: '信息详情与核验'/);
assert.match(sources, /task-compare/);
assert.match(sources, /data-workspace-flag/);
assert.match(sources, /workspace\.complete\('核验结果已保存/);

for (const file of [news, sources, bulletins, reports]) {
  assert.match(file, /openDialog\(/, 'short confirmations or read-only dialogs must remain available');
}

class TestNode {
  constructor() { this.children = []; this.listeners = {}; this.hidden = false; this.isConnected = true; this.dataset = {}; }
  get firstElementChild() { return this.children[0] || null; }
  appendChild(child) { this.children.push(child); child.parent = this; return child; }
  addEventListener(type, fn) { (this.listeners[type] ||= new Set()).add(fn); }
  removeEventListener(type, fn) { this.listeners[type]?.delete(fn); }
  dispatchEvent(event) { for (const fn of this.listeners[event.type] || []) fn(event); return true; }
  setAttribute(name, value) { this[name] = value; }
  removeAttribute(name) { delete this[name]; }
  querySelectorAll() { return []; }
  querySelector() { return null; }
  contains(node) { return node === this || this.children.includes(node); }
  remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.isConnected = false; }
  focus() { this.focused = true; }
}
const testWindow = new TestNode(), testDocument = new TestNode();
testWindow.location = { href: 'https://prototype.test/admin/index.html#reports', hash: '#reports' };
testWindow.FrozenApp = { escape: value => String(value), icon: () => '<svg></svg>' };
testWindow.scrollY = 180; testWindow.scrollTo = value => { testWindow.lastScroll = value; testWindow.scrollY = value.top; };
testWindow.requestAnimationFrame = fn => fn(); testWindow.confirm = () => false;
testDocument.createElement = () => new TestNode(); testDocument.activeElement = new TestNode();
const states = [null]; let stateIndex = 0;
const testHistory = {
  get state() { return states[stateIndex]; },
  pushState(state, unused, url) { states.splice(stateIndex + 1); states.push(state); stateIndex++; if (url) { testWindow.location.href = url; testWindow.location.hash = new URL(url).hash; } },
  replaceState(state) { states[stateIndex] = state; },
  go(delta) { stateIndex = Math.max(0, stateIndex + delta); for (const fn of testWindow.listeners.popstate || []) fn({ state: states[stateIndex] }); },
  back() { if (stateIndex) stateIndex--; for (const fn of testWindow.listeners.popstate || []) fn({ state: states[stateIndex] }); }
};
vm.runInNewContext(ui, { window: testWindow, document: testDocument, history: testHistory, MutationObserver: class {}, Event: class { constructor(type) { this.type = type; } } });
const testApp = testWindow.FrozenApp, host = new TestNode(), list = host.appendChild(new TestNode());
let closeMessage = '';
const controller = testApp.openTaskWorkspace(host, { title: '编辑测试', main: '<form></form>', onClose: message => { closeMessage = message; } });
assert.equal(list.hidden, true); assert.equal(list['data-task-workspace-list'], ''); assert.equal(host.children.length, 2); assert.ok(testHistory.state.frozenTaskWorkspace);
controller.setDirty(true); assert.equal(controller.discard(), false, 'dirty workspace stays open when discard is rejected');
assert.equal(list.hidden, true);
testWindow.confirm = () => true; assert.equal(controller.discard(), true);
assert.equal(list.hidden, false); assert.equal(list['data-task-workspace-list'], undefined); assert.equal(host.children.length, 1); assert.equal(testDocument.activeElement.focused, true);
const saved = testApp.openTaskWorkspace(host, { title: '保存测试', onClose: message => { closeMessage = message; } });
saved.setDirty(true); saved.complete('保存完成');
assert.equal(closeMessage, '保存完成'); assert.equal(list.hidden, false); assert.equal(testWindow.lastScroll.top, 180); assert.equal(testWindow.lastScroll.behavior, 'auto');

const editing = testApp.openTaskWorkspace(host, { title: '编辑报告', mode: 'edit' });
editing.setDirty(true); editing.element.draft = '尚未保存的经营建议'; editing.element.scrollTop = 90;
testWindow.scrollY = 240;
let closeEvents = 0;
const reference = testApp.openDetailPage(host, '引用简报', '<p>原版本正文</p>');
reference.addEventListener('close', () => closeEvents++);
assert.equal(editing.element.hidden, true);
assert.equal(list.hidden, true);
assert.match(reference.innerHTML, /返回上一页/);
assert.doesNotMatch(reference.innerHTML, /task-workspace-footer/);
testWindow.confirm = () => { throw new Error('Returning from a read-only child must not discard the parent draft'); };
testHistory.back();
assert.equal(closeEvents, 1);
assert.equal(editing.element.hidden, false);
assert.equal(editing.element.draft, '尚未保存的经营建议');
assert.equal(editing.element.scrollTop, 90);
assert.equal(editing.isDirty(), true);
assert.equal(testWindow.scrollY, 240);

const version = testApp.openDetailPage(host, '历史版本', 'V1');
const nested = testApp.openDetailPage(host, '来源依据', '来源快照');
testWindow.confirm = () => false;
testWindow.location.href = 'https://prototype.test/admin/index.html#prices'; testWindow.location.hash = '#prices';
testHistory.go(-3);
assert.equal(nested.isConnected, true, 'multi-level back must keep the full stack when a dirty ancestor is not discarded');
assert.equal(testWindow.location.hash, '#reports', 'cancelled cross-route back restores the original URL');
assert.equal(testApp.isTaskWorkspaceRouteCurrent(), true, 'the shell must not rebuild a retained dirty page after a cancelled route change');
testWindow.confirm = () => true;
testHistory.go(-1);
assert.equal(list.hidden, false);
assert.equal(version.isConnected, false);
assert.equal(nested.isConnected, false);
assert.equal(host.children.length, 1);

const recordsPage = testApp.openDetailPage(host, '生成记录', '记录列表');
const detailPage = testApp.openDetailPage(host, '记录详情', '详细内容');
let unsubscribed = 0;
recordsPage.addEventListener('close', () => unsubscribed++);
detailPage.addEventListener('close', () => unsubscribed++);
testApp.taskWorkspaceCleanup();
assert.equal(unsubscribed, 2, 'route cleanup must release every page subscription');
assert.equal(list.hidden, false);
assert.equal(testApp.taskWorkspaceCleanup, null);
assert.equal(testWindow.listeners.popstate.size, 0);
assert.equal(testDocument.listeners.click.size, 0);

console.log('PASS: shared workspaces and detail pages; nested history, read-only return, parent draft/scroll preservation, multi-level discard guard and subscription cleanup. Static/Node checks only; no browser verification.');
