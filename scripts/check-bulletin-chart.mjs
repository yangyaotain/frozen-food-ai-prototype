import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const handlers = {}, windowHandlers = {}, observers = [];
const app = {};
const sandbox = {
  window: {
    FrozenApp: app,
    addEventListener: (key, fn) => windowHandlers[key] = fn,
    removeEventListener: key => delete windowHandlers[key]
  },
  ResizeObserver: class {
    constructor(fn) { this.fn = fn; observers.push(this); }
    observe(node) { this.node = node; }
    disconnect() { this.disconnected = true; }
  }
};

for (const file of ['common', 'bulletin-view']) {
  vm.runInNewContext(fs.readFileSync(new URL('../assets/js/' + file + '.js', import.meta.url), 'utf8'), sandbox);
}

const monthRows = [
  ['2026-06-01', '2026-06-07', 11890],
  ['2026-06-08', '2026-06-14', 11880],
  ['2026-06-15', '2026-06-21', 11910],
  ['2026-06-22', '2026-06-28', 11970],
  ['2026-06-29', '2026-06-30', 12040]
].map(([start, end, price]) => ({ start, end, price }));
const spec = { rows: monthRows, key: 'price', title: '价格趋势', unit: '元/吨' };
let width = 0, points = [];
const tip = { hidden: true, style: {} }, note = {};
const plot = {
  dataset: {},
  set innerHTML(value) {
    this.html = value;
    points = [...value.matchAll(/<rect[^>]+data-bulletin-point="(\d+)" data-x="([\d.]+)" data-y="([\d.]+)"[^>]+aria-label="([^"]+)"/g)].map(([, index, x, y, label]) => ({
      dataset: { bulletinPoint: index, x, y },
      attrs: { 'aria-label': label },
      closest: selector => selector === '[data-bulletin-chart]' ? node : selector === '[data-bulletin-point]' ? points[+index] : null,
      getAttribute(key) { return this.attrs[key]; },
      setAttribute(key, value) { this.attrs[key] = value; },
      classList: { toggle() {} },
      focus() { this.focused = true; }
    }));
  }
};
const node = {
  dataset: { bulletinChart: JSON.stringify(spec) },
  querySelector: selector => ({
    '[data-bulletin-plot]': plot,
    '[data-chart-tooltip]': tip,
    '[data-point-note]': note,
    '.bulletin-plot': { getBoundingClientRect: () => ({ width }) }
  })[selector],
  querySelectorAll: () => points,
  contains: target => points.includes(target),
  closest: () => node
};
const root = {
  querySelectorAll: () => [node],
  contains: target => points.includes(target),
  addEventListener: (key, fn) => handlers[key] = fn,
  removeEventListener: key => delete handlers[key]
};

const weeklyCategory = {
  name: '鸡副',
  series: [{ start: '2026-08-03', end: '2026-08-09', price: 12400, closing: 119.42 }]
};
const weeklyPrice = app.bulletinView.chart(weeklyCategory, 'price', '本周平均价格', '元/吨');
assert.ok(weeklyPrice.includes('bulletin-chart--single'));
assert.ok(weeklyPrice.includes('12,400.00'));
assert.ok(weeklyPrice.includes('本周已复核平均采价'));
assert.ok(!weeklyPrice.includes('data-bulletin-chart='), 'a one-week bulletin must not draw a one-point trend');
const weeklyStock = app.bulletinView.chart(weeklyCategory, 'closing', '周末库存', '吨');
assert.ok(weeklyStock.includes('119.42'));
assert.ok(weeklyStock.includes('本周末库存'));

const cleanup = app.bulletinView.mount(root);
assert.equal(points.length, 0, 'collapsed charts wait for visible width');
width = 860;
handlers.toggle();
assert.equal(points.length, 5);
assert.ok(plot.html.includes('width="860"'));
handlers.pointerover({ type: 'pointerover', target: points[2] });
assert.ok(note.textContent.includes('2026-06-15 至 2026-06-21'));
assert.ok(note.textContent.includes('11,910.00'));
assert.equal(tip.hidden, false);
assert.equal(points[2].attrs.tabindex, '0');
handlers.keydown({ type: 'keydown', target: points[2], key: 'End', preventDefault() {} });
assert.ok(note.textContent.includes('2026-06-29 至 2026-06-30'));
assert.equal(points[4].focused, true);
handlers.keydown({ type: 'keydown', target: points[4], key: 'ArrowLeft', preventDefault() {} });
assert.ok(note.textContent.includes('2026-06-22 至 2026-06-28'));
handlers.keydown({ type: 'keydown', target: points[3], key: 'Escape' });
assert.equal(tip.hidden, true);
handlers.click({ type: 'click', target: points[0] });
assert.equal(tip.hidden, false);
handlers.pointerout({ target: points[0], relatedTarget: null });
assert.equal(tip.hidden, true);
width = 280;
observers[0].fn([{ target: node }]);
assert.ok(plot.html.includes('width="280"'));
assert.equal(points.length, 5, 'narrow monthly plots keep every weekly fragment');
cleanup();
assert.equal(observers[0].disconnected, true);
assert.deepEqual(Object.keys(handlers), []);
console.log('PASS: weekly bulletin value cards, monthly weekly-fragment chart mount, resize, pointer/click details, keyboard navigation, tooltip dismissal and cleanup. DOM doubles only; no browser/rendering verification.');
