import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
// DOM/event doubles verify positioning, lifecycle and selection; no browser is launched.
function node() {
  const children = new Map(), listeners = new Map();
  return {
    innerHTML: '', value: '', textContent: '', dataset: {}, style: {}, isConnected: true, clientHeight: 240,
    rect: { left: 200, top: 200, right: 500, bottom: 236, width: 300, height: 36 },
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    fire(type, data = {}) { const event = { type, target: this, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...data }; for (const fn of [...listeners.get(type) || []]) fn(event); return event; },
    count(type) { return listeners.get(type)?.size || 0; },
    querySelector(selector) { if (selector === '[aria-pressed="true"]') return null; if (!children.has(selector)) children.set(selector, node()); return children.get(selector); },
    contains(target) { return this === target || [...children.values()].some(child => child.contains(target)); },
    closest() { return null; }, setAttribute(key, value) { this[key] = value; },
    focus() { this.focused = true; }, getBoundingClientRect() { return this.rect; },
    showPopover() { this.visible = true; }, hidePopover() { this.visible = false; }, matches() { return Boolean(this.visible); },
    dispatchEvent(event) { this.fire(event.type, event); }
  };
}
const document = node(), window = node(); document.body = node(); window.FrozenApp = {}; window.innerWidth = 1280; window.innerHeight = 800;
const observers = [];
const context = { window, document, Event: class { constructor(type, options) { this.type = type; Object.assign(this, options); } }, MutationObserver: class { constructor(callback) { this.callback = callback; observers.push(this); } observe() { this.active = true; } disconnect() { this.active = false; } } };
window.localStorage = { getItem() { return null; }, setItem() {} };
for (const file of ['common.js', 'config.js', 'ui.js', 'system-store.js']) vm.runInNewContext(read('assets/js/' + file), context, { filename: file });
const app = window.FrozenApp, nodes = app.systemStore.departments;
const leaves = nodes.flatMap(root => root.children.flatMap(group => group.children));
assert.equal(nodes[0].children.length, 6); assert.equal(leaves.length, 24);
assert.equal(new Set(leaves.map(leaf => leaf.id)).size, 24); assert.equal(new Set(leaves.map(leaf => leaf.name)).size, 24);
for (const name of ['信息技术部', '市场信息部', '运营管理部', '冷链配送部', '冷库管理部', '食品安全部']) assert.ok(leaves.some(leaf => leaf.name === name));
const host = node(), dialog = node(); host.closest = () => dialog;
const picker = app.treeSelect(host, 'department', '部门', nodes, '信息技术部');
assert.equal(host.querySelector('[data-tree-label]').textContent, '杭州五丰 / 综合管理中心 / 信息技术部');
assert.equal(app.systemStore.departmentPath('冷链配送部'), '杭州五丰 / 仓储物流中心 / 冷链配送部');
assert.equal(app.systemStore.departmentPath('旧部门'), '旧部门');
assert.equal(app.systemStore.departmentPath(''), '');
const trigger = host.querySelector('.tree-select-trigger'), panel = host.querySelector('.tree-select-popover'), list = host.querySelector('[data-tree-options]'), search = host.querySelector('input[type="search"]');
assert.match(host.innerHTML, /popover="manual"/); assert.match(host.innerHTML, /24 个部门/);
assert.doesNotMatch(host.innerHTML, /<details class="search-select tree-select"/);
assert.match(list.innerHTML, /data-tree-branch="functional" open/);
assert.match(list.innerHTML, /data-tree-branch="logistics"><summary>/, 'unselected business centers start collapsed');
const before = JSON.stringify(host.style);
trigger.fire('click'); assert.equal(panel.visible, true); assert.equal(trigger['aria-expanded'], 'true'); assert.equal(search.focused, true);
assert.equal(panel.style.top, '242px'); assert.equal(panel.style.width, '360px'); assert.equal(JSON.stringify(host.style), before, 'only the floating panel is positioned');
assert.equal(document.count('pointerdown'), 1); assert.equal(document.count('keydown'), 1); assert.equal(document.count('scroll'), 1); assert.equal(window.count('resize'), 1);
trigger.rect = { left: 1100, top: 710, bottom: 746, width: 260 }; window.fire('resize');
assert.equal(panel.style.top, '304px'); assert.equal(panel.style.left, '908px'); assert.equal(panel.style.height, '400px');
search.value = '冷链'; search.fire('input');
assert.match(list.innerHTML, /杭州五丰/); assert.match(list.innerHTML, /仓储物流中心/); assert.match(list.innerHTML, /冷链配送部/); assert.doesNotMatch(list.innerHTML, /冷库管理部/);
search.value = '不存在'; search.fire('input'); assert.match(list.innerHTML, /没有匹配的部门/); assert.equal(picker.value(), '信息技术部');
assert.equal(search.fire('keydown', { key: 'Enter' }).prevented, true);
let changes = 0; host.querySelector('input[type="hidden"]').addEventListener('change', () => changes++);
list.fire('click', { target: { closest() { return { dataset: { treeValue: '冷链配送部' } }; } } });
assert.equal(picker.value(), '冷链配送部'); assert.equal(panel.visible, false); assert.equal(trigger['aria-expanded'], 'false'); assert.equal(changes, 1);
assert.equal(host.querySelector('[data-tree-label]').textContent, '杭州五丰 / 仓储物流中心 / 冷链配送部');
assert.equal(host.querySelector('[data-tree-selection]').textContent, '已选：杭州五丰 / 仓储物流中心 / 冷链配送部');
assert.equal(document.count('pointerdown'), 0); assert.equal(document.count('scroll'), 0); assert.equal(window.count('resize'), 0); assert.ok(observers.every(observer => !observer.active));
trigger.fire('click'); assert.match(list.innerHTML, /data-tree-branch="logistics" open/);
document.fire('pointerdown', { target: panel }); assert.equal(panel.visible, true);
const escape = document.fire('keydown', { key: 'Escape' }); assert.equal(escape.prevented, true); assert.equal(escape.stopped, true); assert.equal(panel.visible, false); assert.equal(changes, 1);
trigger.fire('click'); document.fire('pointerdown', { target: node() }); assert.equal(panel.visible, false);
trigger.fire('click'); trigger.rect = { left: 200, top: 300, bottom: 336, width: 300 }; document.fire('scroll', { target: document }); assert.equal(panel.style.top, '342px');
const dialogBody = node(); dialogBody.rect = { top: 100, bottom: 600 }; trigger.closest = () => dialogBody;
trigger.rect = { left: 200, top: 610, bottom: 646, width: 300 }; document.fire('scroll', { target: dialogBody }); assert.equal(panel.visible, false, 'close when the trigger scrolls outside the modal body');
trigger.closest = () => null; trigger.rect = { left: 200, top: 200, bottom: 236, width: 300 };
trigger.fire('click'); const cancel = dialog.fire('cancel'); assert.equal(cancel.prevented, true); assert.equal(panel.visible, false);
trigger.fire('click'); dialog.fire('close'); assert.equal(panel.visible, false); assert.equal(document.count('keydown'), 0);
trigger.fire('click'); host.querySelector('[data-tree-clear]').fire('click'); assert.equal(picker.value(), ''); assert.equal(changes, 2);
trigger.fire('click'); host.isConnected = false; observers.at(-1).callback(); assert.equal(panel.visible, false); assert.equal(document.count('pointerdown'), 0); assert.equal(window.count('resize'), 0);
for (const width of [320, 768, 1280]) for (const height of [280, 600, 900]) {
  const placement = app.treeSelectPlacement({ left: width - 100, top: height - 60, bottom: height - 24, width: 260 }, { width, height });
  assert.ok(placement.left >= 12 && placement.top >= 12); assert.ok(placement.left + placement.width <= width - 12); assert.ok(placement.top + placement.height <= height - 12);
}
const css = read('assets/css/common.css');
assert.doesNotMatch(css, /\.tree-select-leaf\[aria-pressed="true"\]\s*\{[^}]*box-shadow/);
assert.match(css, /\.tree-select-trigger \[data-tree-label\]\s*\{[^}]*white-space: normal/);
assert.match(css, /\.tree-select-popover \{[^}]*position: fixed/); assert.match(css, /\.tree-select-popover:popover-open \{ display: flex/); assert.doesNotMatch(css, /\.tree-select \.search-select-panel \{ position: static/);
console.log('PASS: 6 centers/24 departments; top-layer popup positioning/flipping/viewport bounds, filter paths, selection/clear, no host layout writes, outside/Escape/dialog close, resize/scroll listeners and detached-host cleanup. Node doubles/static only; no browser verification.');
