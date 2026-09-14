import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');

// DOM/event doubles exercise the production clear controller without launching a browser.
class Node {
  constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.listeners = {}; this.value = ''; this.type = ''; this.name = ''; this.hidden = false; this.disabled = false; this.readOnly = false; }
  appendChild(child) { if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1); this.children.push(child); child.parent = this; return child; }
  before(node) { const parent = this.parent; parent.children.splice(parent.children.indexOf(this), 0, node); node.parent = parent; }
  get firstElementChild() { return this.children[0]; }
  setAttribute(name, value) { this[name] = value; }
  focus() { focused = this; }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  dispatchEvent(event) {
    if (!event.target) event.target = this;
    for (const listener of this.listeners[event.type] || []) listener(event);
    if (event.bubbles && !event.stopped && this.parent) this.parent.dispatchEvent(event);
  }
  closest(selector) { if (selector === '.form-field' && this.className === 'form-field') return this; return this.parent?.closest(selector) || null; }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [
      ...(selector === 'input[name], select[name]' && ['INPUT', 'SELECT'].includes(child.tagName) && child.hasName ? [child] : []),
      ...child.querySelectorAll(selector)
    ]);
  }
  querySelector(selector) { return this.children.find(child => child.tagName === selector.toUpperCase()) || this.children.map(child => child.querySelector(selector)).find(Boolean) || null; }
}
class Event {
  constructor(type, options = {}) { this.type = type; Object.assign(this, options); }
  preventDefault() { this.prevented = true; }
  stopPropagation() { this.stopped = true; }
}
let focused;
const timers = [];
const context = { window: { FrozenApp: { icon: () => '<svg></svg>' }, setTimeout: fn => timers.push(fn) }, document: { createElement: tag => new Node(tag) }, Event };
vm.runInNewContext(read('assets/js/ui.js'), context);
const app = context.window.FrozenApp;
const form = new Node('form');
function control(name, type, value, label = name) {
  const field = form.appendChild(new Node()); field.className = 'form-field';
  field.appendChild(new Node('span')).textContent = label;
  const node = field.appendChild(new Node(type === 'select' ? 'select' : 'input'));
  Object.assign(node, { name, type, value, hasName: true }); return node;
}
const keyword = control('keyword', 'search', '鸡副', '品类关键词');
const status = control('status', 'select', 'pending', '复核状态');
const from = control('from', 'date', '2026-08-01', '期间起始');
const to = control('to', 'date', '2026-08-31', '期间结束');
const month = control('month', 'month', '2026-07', '分析月份');
const week = control('week', 'hidden', '2026-08-24', '采价周');
const category = control('category', 'select', 'poultry', '分析品类');
const empty = control('empty', 'select', '');
const disabled = control('disabled', 'search', '保留'); disabled.disabled = true;
const readonly = control('readonly', 'text', '保留'); readonly.readOnly = true;
const internal = control('', 'search', '面板搜索');
function pickerFor(node) {
  const details = node.parent.appendChild(new Node('details'));
  const summary = details.appendChild(new Node('summary'));
  const picker = { element: details, keyword: '日期', selected: node.value, reset() { this.selected = ''; this.keyword = ''; details.open = false; summary.textContent = '全部'; } };
  node.queryPicker = picker; return picker;
}
const weekPicker = pickerFor(week), categoryPicker = pickerFor(category);
app.enhanceQueryControls(form);
function clearButton(node) { return (node.queryPicker ? node.queryPicker.element.parent : node.parent).children.find(child => child.className === 'query-clear'); }
function clear(node) { const event = new Event('click', { bubbles: true }); clearButton(node).dispatchEvent(event); assert.ok(event.prevented && event.stopped); }
const changes = [], inputs = [];
form.addEventListener('change', event => changes.push({ name: event.target.name, keyword: keyword.value }));
form.addEventListener('input', event => inputs.push(event.target.name));
assert.equal(clearButton(keyword)['aria-label'], '清空品类关键词');
assert.equal(clearButton(empty).hidden, true);
assert.equal(clearButton(disabled), undefined); assert.equal(clearButton(readonly), undefined); assert.equal(clearButton(internal), undefined);
const originalButton = clearButton(status); app.enhanceQueryControls(form); assert.equal(clearButton(status), originalButton, 'enhancing twice must not add buttons/listeners');
clear(status);
assert.equal(status.value, ''); assert.equal(keyword.value, '鸡副'); assert.equal(clearButton(status).hidden, true);
assert.deepEqual(changes, [{ name: 'status', keyword: '鸡副' }], 'selection clear emits one query change with current text');
clear(keyword);
assert.equal(keyword.value, ''); assert.equal(changes.length, 1, 'text clear waits for query or Enter');
assert.equal(focused, keyword); assert.equal(clearButton(keyword).hidden, true);
keyword.value = '鸭副'; keyword.dispatchEvent(new Event('input', { bubbles: true }));
assert.equal(clearButton(keyword).hidden, false); assert.equal(changes.length, 1, 'typing must not query');
clear(from); assert.equal(from.value, ''); assert.equal(to.value, '2026-08-31', 'date endpoints clear independently');
weekPicker.element.open = true; clear(week);
assert.equal(week.value, ''); assert.equal(weekPicker.keyword, ''); assert.equal(weekPicker.element.open, false);
assert.equal(focused, weekPicker.element.querySelector('summary'));
clear(category); assert.equal(category.value, ''); assert.equal(categoryPicker.selected, '');
assert.deepEqual(changes.map(row => row.name), ['status', 'from', 'week', 'category'], 'picker clear uses original form control as the event source');
clear(month); assert.equal(month.value, ''); assert.equal(changes.at(-1).name, 'month', 'month clear immediately queries');
assert.equal(clearButton(month)['aria-label'], '清空分析月份');
assert.deepEqual(inputs.slice(0, 2), ['status', 'keyword']);
form.dispatchEvent(new Event('reset')); status.value = 'pending'; keyword.value = ''; category.value = 'poultry';
timers.splice(0).forEach(fn => fn());
assert.equal(clearButton(status).hidden, false); assert.equal(clearButton(category).hidden, false); assert.equal(clearButton(keyword).hidden, true);
assert.equal(changes.length, 5, 'affordance synchronization must not add queries on reset');

for (const module of ['prices', 'categories', 'sources', 'analysis', 'bulletins', 'reports', 'trace', 'system']) assert.match(read('assets/js/admin-' + module + '.js'), /app\.enhanceQueryControls\(form\)/);
assert.doesNotMatch(read('assets/js/ui.js').split('app.openDialog =')[1].split('// 可搜索')[0], /enhanceQueryControls/);
for (const module of ['news', 'market', 'reports', 'profile']) assert.doesNotMatch(read('assets/js/merchant-' + module + '.js'), /enhanceQueryControls/);
const analysis = read('assets/js/admin-analysis.js');
assert.match(analysis, /missing\.push\(kind === 'week' \? '分析周' : '分析月份'\)/);
assert.match(analysis, /result = \{ valid: false \}/); assert.match(analysis, /2026-08-24/); assert.match(analysis, /2026-07/);
assert.doesNotMatch(analysis, /name="count"|name="end"|近 4 周|近 8 周/);
const css = read('assets/css/common.css');
assert.match(css, /query-control:focus-within/); assert.match(css, /query-clear\[hidden\]/); assert.match(css, /webkit-search-cancel-button/);
console.log('PASS: query clear events, text deferral, picker state/focus, independent dates, empty/disabled controls, reset synchronization, idempotence and admin-only integration. Node doubles/static only; no browser or visual verification.');
