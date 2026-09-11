// Controlled-clock data/controller checks. No browser, network, or real background service.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url), read = path => fs.readFileSync(new URL(path, root), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
function setup(cache = new Map()) {
  // Keep the controlled scheduler fixtures; full presentation defaults are covered by check-example-states.mjs.
  const storage = { getItem: key => cache.get(key) ?? null, setItem: (key, value) => cache.set(key, value) };
  const sandbox = { window: { localStorage: storage, location: { hash: '', search: '' } }, URL, URLSearchParams };
  for (const m of read('admin/index.html').matchAll(/<script defer src="..\/assets\/js\/([^"]+)"><\/script>/g)) {
    if (!['shell.js', 'admin-example-states.js'].includes(m[1])) vm.runInNewContext(read('assets/js/' + m[1]), sandbox, { filename: m[1] });
  }
  const app = sandbox.window.FrozenApp;
  let clock = Date.parse('2026-08-17T08:00:00+08:00');
  const schedulerCache = new Map();
  const schedulerStorage = { getItem: k => schedulerCache.get(k) ?? null, setItem: (k, v) => schedulerCache.set(k, v) };
  function scheduler(options = {}) { return app.generationSchedule.create({ now: () => clock, delay: () => Promise.resolve(), storage: schedulerStorage, ...options }); }
  return { app, sandbox, cache, schedulerCache, scheduler, setTime: time => { clock = typeof time === 'number' ? time : Date.parse(time); }, now: () => clock };
}
function save(store, key, values = {}) {
  const s = store.summary(key);
  const result = store.saveMany([{ key, revision: s.revision, config: { ...s.config, ...values } }]);
  assert.equal(result.valid, true, result.message); return result;
}
const f = setup(), a = f.app, api = a.generationSchedule;
const c = { frequency: 'week', weekday: 1, day: 31, time: '09:00' };
const next = (config, time) => api.stamp(api.nextTime(config, Date.parse(time + '+08:00')));
assert.equal(next(c, '2026-09-13T23:59:59'), '2026-09-14 09:00:00');
assert.equal(next(c, '2026-09-14T09:00:00'), '2026-09-21 09:00:00');
assert.equal(next({ ...c, weekday: 0 }, '2026-09-12T23:59:59'), '2026-09-13 09:00:00');
assert.equal(next({ ...c, frequency: 'month' }, '2024-02-01T00:00:00'), '2024-02-29 09:00:00');
assert.equal(next({ ...c, frequency: 'month' }, '2026-02-01T00:00:00'), '2026-02-28 09:00:00');
assert.equal(next({ ...c, frequency: 'month' }, '2026-12-31T09:00:00'), '2027-01-31 09:00:00');
const rangeConfig = { ...c, categories: ['poultry'], count: 4 };
assert.equal(api.inputs('week', rangeConfig, Date.parse('2026-01-01T09:00:00+08:00'))[0].date, '2025-12-22');
assert.equal(api.inputs('month', rangeConfig, Date.parse('2026-01-01T09:00:00+08:00'))[0].date, '2025-12');
const ri = api.inputs('report-week', rangeConfig, Date.parse('2026-09-01T09:00:00+08:00'));
assert.equal(ri.length, 3); assert.equal(ri[0].date, '2026-08-24');
assert.deepEqual(copy(api.period('report-week', ri[0])), { start: '2026-08-24', end: '2026-08-30' });

// First due run uses actual stores; generation never bypasses review/publication or overwrites seeds.
const s = f.scheduler(), original = JSON.stringify(a.bulletinStore.list()), reportOriginal = JSON.stringify(a.reportStore.list());
save(s, 'week', { categories: ['poultry'] }); save(s, 'month', { enabled: false });
await s.tick(); assert.equal(s.records('bulletins').length, 0);
f.setTime('2026-08-17T09:00:00+08:00');
await Promise.all([s.tick(), s.tick()]);
assert.equal(s.summary('week').status, 'success'); assert.equal(s.summary('report-week').status, 'success');
assert.equal(s.records('reports')[0].details.length, 3);
const auto = a.bulletinStore.list().find(r => r.generation);
assert.equal(auto.start, '2026-08-10'); assert.equal(auto.status, 'pending'); assert.equal(auto.publication, null);
assert.equal(auto.history[0].actor, '系统'); assert.equal(auto.generation.scheduledAt, '2026-08-17 09:00:00');
assert.equal(auto.history[0].action, '定期自动生成');
assert.throws(() => a.bulletinStore.publish(auto.id, auto.version), /复核/);
const reports = a.reportStore.list().filter(r => r.generation);
assert.equal(reports.length, 3); assert.equal(new Set(reports.map(r => r.merchant.id)).size, 3);
assert.ok(reports.every(r => r.status === 'pending' && r.publication === null && r.advice && r.history[0].actor === '系统'));
assert.ok(a.traceData.query({ type: 'generate' }).rows.some(r => r.action === '定期自动生成' && r.actor === '系统'));
assert.equal(JSON.stringify(a.bulletinStore.list().filter(r => !r.generation)), original);
assert.equal(JSON.stringify(a.reportStore.list().filter(r => !r.generation)), reportOriginal);
assert.equal(a.bulletinStore.published().length, 1);
await s.tick(); assert.equal(s.records('reports').length, 1);
// Refresh retains both schedule cursors and generated content independently.
const restored = f.scheduler(); await restored.tick(); assert.equal(restored.records('reports').length, 1);
const afterReload = setup(f.cache); assert.equal(afterReload.app.reportStore.list().filter(r => r.generation).length, 3);

// A second slot for the same business period detects edited drafts before checking current source data.
const edited = a.bulletinStore.edit(auto.id, auto.version, { title: auto.title, summary: auto.summary + '\n人工补充核对。', signals: auto.signals });
save(s, 'week', { weekday: 2 }); f.setTime('2026-08-18T09:00:00+08:00'); await s.tick();
assert.equal(s.records('bulletins')[0].details[0].message, '相同期间已有内容，保留原版本');
assert.equal(JSON.stringify(a.bulletinStore.get(auto.id, auto.version)), JSON.stringify(edited));
assert.equal(a.bulletinStore.versions(auto.id).length, 1);
// Whole settings save is atomic, checks versions and range input, and does not change report contents.
const before = JSON.stringify(s.summary('week')), m = s.summary('month');
assert.equal(s.saveMany([{ key: 'week', revision: s.summary('week').revision, config: { ...s.summary('week').config, enabled: false } },
  { key: 'month', revision: m.revision, config: { ...m.config, time: '24:00' } }]).valid, false);
assert.equal(JSON.stringify(s.summary('week')), before);
assert.equal(s.saveMany([{ key: 'week', revision: 0, config: s.summary('week').config }]).valid, false);
assert.equal(s.saveMany([{ key: 'week', revision: s.summary('week').revision, config: { ...s.summary('week').config, categories: [] } }]).valid, false);
assert.equal(save(s, 'week').unchanged, true);
save(s, 'week', { enabled: false }); assert.equal(s.summary('week').next, '已停用');

// A failed merchant cannot block peers; retry keeps the old slot, input, and config after a date/config change.
const p = setup();
let fail = true;
const underlying = p.app.reportStore;
const wrapped = { list: () => underlying.list(), generateScheduled: (input, metadata) => {
  if (input.merchant === 'demo-b' && fail) throw new Error('本户数量数据不足：2026-08-10');
  return underlying.generateScheduled(input, metadata);
} };
const ps = p.scheduler({ stores: { week: p.app.bulletinStore, month: p.app.bulletinStore, 'report-week': wrapped } });
save(ps, 'week', { enabled: false }); save(ps, 'month', { enabled: false });
p.setTime('2026-08-17T09:00:00+08:00'); await ps.tick();
assert.equal(ps.summary('report-week').status, 'partial'); assert.equal(ps.summary('report-week').pending, 1);
assert.equal(underlying.list().filter(r => r.generation).length, 2);
assert.match(ps.records('reports')[0].details.find(d => d.status === 'waiting').message, /2026-08-10/);
save(ps, 'report-week', { enabled: false, time: '11:30' });
p.setTime('2026-08-18T09:00:00+08:00'); await ps.tick(); assert.equal(ps.records('reports').length, 1);
save(ps, 'report-week', { enabled: true }); fail = false; await ps.tick();
const completed = underlying.list().find(r => r.generation && r.merchant.id === 'demo-b');
assert.equal(completed.count, 1); assert.equal(completed.end, '2026-08-16');
assert.equal(completed.generation.configRevision, 1); assert.equal(ps.summary('report-week').pending, 0);
assert.equal(underlying.list().filter(r => r.generation).length, 3);
assert.equal(ps.records('reports')[0].details[0].attempt, 2);
// Unexpected failures also remain eligible for automatic retry, without manual buttons.
let broken = true;
const failedSetup = setup();
const brokenStore = { list: () => [], generateScheduled: () => { if (broken) throw new Error('计算服务暂不可用'); return { id: 'resolved', version: 1 }; } };
const failed = failedSetup.scheduler({ stores: { week: brokenStore, month: brokenStore, 'report-week': brokenStore } });
save(failed, 'report-week', { enabled: false }); save(failed, 'month', { enabled: false });
failedSetup.setTime('2026-08-17T09:00:00+08:00'); await failed.tick(); assert.equal(failed.summary('week').status, 'failed');
failedSetup.setTime('2026-08-17T09:04:59+08:00'); await failed.tick(); assert.equal(failed.records('bulletins').length, 1);
broken = false; failedSetup.setTime('2026-08-17T09:05:00+08:00'); await failed.tick(); assert.equal(failed.summary('week').status, 'success');

// Missing real prices fail honestly; monthly and weekly schedules coexist and keep separate periods.
const multi = setup(), ms = multi.scheduler();
save(ms, 'report-week', { enabled: false });
multi.setTime('2026-09-01T09:00:00+08:00'); await ms.tick();
assert.equal(ms.summary('month').status, 'waiting');
assert.ok(ms.records('bulletins').some(log => log.key === 'month' && log.details[0].start === '2026-08-01' && log.details[0].end === '2026-08-31'));
assert.ok(ms.records('bulletins').some(log => log.key === 'week'));
assert.ok(ms.records('bulletins').some(log => log.details.some(d => d.message.includes('2026-08-31'))));

// In-flight settings cannot invalidate the captured run, and session exit cancels pending writes.
const q = setup(); let resume;
const qs = q.scheduler({ delay: () => new Promise(resolve => { resume = resolve; }) });
save(qs, 'month', { enabled: false }); save(qs, 'report-week', { enabled: false });
q.setTime('2026-08-17T09:00:00+08:00'); const run = qs.tick();
assert.equal(qs.summary('week').status, 'running');
assert.equal(qs.saveMany([{ key: 'week', revision: qs.summary('week').revision, config: qs.summary('week').config }]).valid, false);
q.app.access.end(); qs.stop(); resume(); await run;
assert.equal(q.app.bulletinStore.list().length, 0); q.app.access.start();
assert.equal(q.app.bulletinStore.list().length, 4);
q.app.access.end();
assert.throws(() => q.app.reportStore.generateScheduled({ merchant: 'demo-a', end: '2026-08-10', count: 1 }, {}), /退出/);
assert.equal(qs.saveMany([{ key: 'week', revision: 1, config: qs.summary('week').config }]).valid, false);
// Storage denied/corrupt is recoverable and does not load draft/public content into the wrong store.
const fallback = f.scheduler({ storage: { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } } });
assert.equal(fallback.storageAvailable(), false); assert.equal(save(fallback, 'week', { time: '11:00' }).valid, true);
const invalid = f.scheduler({ storage: { getItem: () => '{invalid', setItem() {} } });
assert.equal(invalid.summary('week').config.time, '09:00');

// Display history is read-only, enriches existing caches, and never becomes executable work or report content.
const savedSchedule = f.schedulerCache.get('frozen-generation-schedule-v1');
const businessBefore = JSON.stringify([a.bulletinStore.list(), a.reportStore.list()]);
const withHistory = f.scheduler({ seedHistory: true });
assert.equal(f.schedulerCache.get('frozen-generation-schedule-v1'), savedSchedule);
assert.equal(JSON.stringify(withHistory.summary('report-week')), JSON.stringify(s.summary('report-week')));
const storedTimes = new Set(JSON.parse(savedSchedule).logs.map(r => r.key + '|' + r.time));
assert.equal(withHistory.records('bulletins', 'week').filter(r => r.origin === 'preset-history').length,
  a.generationHistory.records().filter(r => r.key === 'week' && !storedTimes.has(r.key + '|' + r.time)).length);
assert.equal(withHistory.records('bulletins', 'month').filter(r => r.origin === 'preset-history').length, 7);
assert.ok(withHistory.records('bulletins').every((row, index, rows) => index === 0 || rows[index - 1].time >= row.time));
assert.ok(withHistory.records('reports').some(r => r.origin === 'preset-history'));
const detached = withHistory.records('bulletins', 'month'); detached[0].details[0].message = 'modified copy';
assert.notEqual(withHistory.records('bulletins', 'month')[0].details[0].message, 'modified copy');
assert.equal(JSON.stringify([a.bulletinStore.list(), a.reportStore.list()]), businessBefore);
assert.equal(f.schedulerCache.get('frozen-generation-schedule-v1'), savedSchedule);
const historyAgain = f.scheduler({ seedHistory: true });
assert.equal(JSON.stringify(historyAgain.records('bulletins')), JSON.stringify(withHistory.records('bulletins')));
// Filter before limiting: frequent weekly executions must not hide all monthly history.
const crowded = JSON.parse(savedSchedule), exemplar = a.generationHistory.records()[0];
crowded.logs = Array.from({ length: 25 }, (_, i) => ({ ...copy(exemplar), origin: undefined, time: '2026-09-08 09:' + String(i).padStart(2, '0') + ':00' }));
crowded.logs.push({ ...copy(exemplar), origin: undefined, result: '本次执行结果优先', time: exemplar.time });
const crowdedState = f.scheduler({ seedHistory: true, storage: { getItem: () => JSON.stringify(crowded), setItem() {} } });
assert.equal(crowdedState.records('bulletins', 'month').length, 7);
assert.equal(crowdedState.records('bulletins', 'week').length, 20);
const overlapping = { ...crowded, logs: [crowded.logs.at(-1)] };
const overlapState = f.scheduler({ seedHistory: true, storage: { getItem: () => JSON.stringify(overlapping), setItem() {} } });
assert.equal(overlapState.records('bulletins', 'week')[0].result, '本次执行结果优先');
assert.equal(overlapState.records('bulletins', 'week').length, 9);

// Exercise the actual page handlers/settings submit using DOM doubles; this is not rendered UI QA.
class Node {
  constructor() { this.listeners = {}; this.value = ''; this.isConnected = true; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  querySelectorAll() { return []; }
  setAttribute(name, value) { this[name] = value; }
  focus() { this.focused = true; }
  dispatchEvent(event) { this.listeners[event.type]?.(event); }
}
class Host extends Node {
  constructor() {
    super(); this.nodes = new Map(); this.form = new Node(); this.form.fields = { keyword: '' };
    this.form.reset = () => { this.form.fields = { keyword: '', from: '', to: '', status: '', merchant: '' }; };
    const form = this.form;
    this.form.elements = { namedItem: name => ({ get value() { return form.fields[name]; }, set value(value) { form.fields[name] = value; } }) };
  }
  querySelector(selector) {
    if (selector === 'form') return this.form;
    if (!this.nodes.has(selector)) {
      const node = new Node(), period = selector.match(/^\[data-period-tab="(week|month)"\]$/);
      if (period) node.dataset = { periodTab: period[1] };
      this.nodes.set(selector, node);
    }
    return this.nodes.get(selector);
  }
  querySelectorAll(selector) { return selector === '[data-period-tab]' ? ['week', 'month'].map(kind => this.querySelector('[data-period-tab="' + kind + '"]')) : []; }
}
const ui = setup(), ua = ui.app;
ui.sandbox.Event = class { constructor(type) { this.type = type; } };
ui.sandbox.FormData = class { constructor(form) { this.form = form; } [Symbol.iterator]() { return Object.entries(this.form.fields)[Symbol.iterator](); } };
let dialog;
Object.defineProperty(ua, 'openDetailPage', { get: () => ua.openDialog, configurable: true });
ua.openDialog = (host, title, body, footer) => {
  dialog = new Host(); dialog.body = body; dialog.footer = footer; dialog.sections = new Map();
  for (const match of body.matchAll(/data-generation-key="([^"]+)"/g)) {
    const key = match[1], c = ua.generationStore.summary(key).config, section = new Host();
    for (const [name, value] of Object.entries(c)) { const control = section.querySelector('[name="' + name + '"]'); control.value = String(value); control.checked = value === true; }
    section.querySelectorAll = () => c.categories.map(value => ({ value }));
    dialog.sections.set(key, section);
  }
  dialog.form.querySelector = selector => selector === '[role="alert"]' ? dialog.querySelector(selector) : dialog.sections.get(selector.match(/="([^"]+)"/)[1]);
  dialog.close = () => { dialog.closed = true; dialog.isConnected = false; dialog.listeners.close?.(); };
  return dialog;
};
const clickAction = (host, action, generationKey) => host.listeners.click({ target: { closest: selector => selector === '[data-action]' ? { dataset: { action, generationKey } } : null } });
const clickTab = (host, kind) => host.listeners.click({ target: { closest: selector => selector === '[data-period-tab]' ? { dataset: { periodTab: kind } } : null } });
const bulletinHost = new Host(); ua.pages['admin:bulletins'](bulletinHost);
assert.ok(bulletinHost.innerHTML.includes('周报设置') && !bulletinHost.innerHTML.includes('月报设置') && bulletinHost.innerHTML.includes('生成记录'));
assert.equal((bulletinHost.innerHTML.match(/data-period-tab=/g) || []).length, 2);
assert.equal(bulletinHost.innerHTML.includes('name="kind"'), false, '类型仅通过页签选择');
assert.equal(bulletinHost.innerHTML.includes('自动生成安排'), false);
assert.equal(bulletinHost.innerHTML.includes('下次生成'), false);
assert.ok(bulletinHost.innerHTML.includes('panel generation-recent-panel'));
assert.equal((bulletinHost.innerHTML.match(/data-recent-key=/g) || []).length, 1);
assert.equal(ua.generationStore.records('bulletins', 'week').length, 9);
assert.equal(ua.generationStore.records('bulletins', 'month').length, 7);
for (const key of ['week', 'month']) {
  clickTab(bulletinHost, key);
  const header = key === 'week' ? bulletinHost.innerHTML : bulletinHost.querySelector('[data-generation-summary]').innerHTML;
  const latest = ua.generationStore.records('bulletins', key)[0];
  const next = ua.generationStore.summary(key).next;
  assert.ok(header.includes('>' + next.slice(0, 16) + '</time>'));
  assert.ok(header.includes(latest.result));
  if (key === 'month') {
    assert.ok(bulletinHost.querySelector('[data-results]').innerHTML.includes('共 3 份'), '基础固定数据中月报页签有三份正文记录；完整展示样例另行检查');
    assert.ok(bulletinHost.querySelector('[data-results]').innerHTML.includes('2026-07市场行情月报'));
    assert.ok(header.includes('每月1日 09:00') && header.includes('2026年8月') && header.includes('>等待数据</span>'));
    assert.equal(header.includes('data-recent-key="week"'), false);
  }
}
clickTab(bulletinHost, 'week');
assert.ok(bulletinHost.innerHTML.includes('下次执行：') && bulletinHost.innerHTML.includes('数据范围：'));
assert.equal(bulletinHost.innerHTML.includes('>最近执行<'), false);
assert.ok(bulletinHost.innerHTML.includes('每周一 09:00'));
assert.ok(bulletinHost.innerHTML.includes('2026-08-31～09-06'));
const defaultRows = bulletinHost.innerHTML.split('data-recent-key=');
assert.ok(defaultRows[1].includes('>执行中</span>'), '默认周报展示执行中');
assert.equal(/data-action="(?:generate|regenerate|preview)"/.test(bulletinHost.innerHTML + bulletinHost.querySelector('[data-results]').innerHTML), false);
const monthBefore = JSON.stringify(ua.generationStore.summary('month'));
clickAction(bulletinHost, 'generation-settings', 'week');
assert.ok(dialog.body.includes('data-generation-key="week"') && dialog.body.includes('generation-category'));
assert.ok(dialog.body.includes('每周执行日') && dialog.body.includes('上一完整周（周一至周日）'));
assert.equal(/name="(?:day|frequency)"/.test(dialog.body), false, '周报不渲染月日期或周期切换字段');
assert.equal(dialog.body.includes('data-generation-key="month"'), false);
assert.equal(/执行情况|最近执行记录|下次生成/.test(dialog.body), false);
assert.ok(dialog.footer.includes('保存设置'));
assert.equal(/本户预览|商户端预览|开始生成|重新生成/.test(dialog.body), false);
{
  const key = 'week';
  const section = dialog.sections.get(key);
  const query = section.querySelector.bind(section);
  section.querySelector = selector => { assert.equal(/name="(?:day|frequency)"/.test(selector), false); return query(selector); };
  section.querySelector('[name="time"]').value = '26:00';
  dialog.form.listeners.submit({ preventDefault() {} }); assert.equal(dialog.closed, undefined);
  assert.ok(dialog.querySelector('[role="alert"]').textContent);
  section.querySelector('[name="time"]').value = '10:30';
  dialog.form.listeners.submit({ preventDefault() {} }); assert.equal(dialog.closed, true);
  assert.equal(ua.generationStore.summary(key).config.time, '10:30');
}
assert.equal(JSON.stringify(ua.generationStore.summary('month')), monthBefore, '保存周报设置不得改变月报');
const updatedRows = bulletinHost.querySelector('[data-generation-summary]').innerHTML;
assert.ok(updatedRows.includes('每周一 10:30') && !updatedRows.includes('每月1日 09:00'));
assert.ok(updatedRows.includes('2026-08-31～09-06'), '新配置不能改写最近执行的数据期间');
assert.ok(updatedRows.includes('>' + ua.generationStore.summary('week').next.slice(0, 16) + '</time>'), '保存周期后同步下次执行时间');
clickAction(bulletinHost, 'generation-settings', 'month');
assert.ok(dialog.body.includes('data-generation-key="month"'));
assert.equal(dialog.body.includes('data-generation-key="week"'), false);
assert.equal(/执行情况|最近执行记录|下次生成/.test(dialog.body), false);
assert.ok(dialog.body.includes('每月执行日') && dialog.body.includes('上一自然月（1日至月末）'));
assert.equal(/name="(?:weekday|frequency)"/.test(dialog.body), false, '月报不渲染周几或周期切换字段');
{
  const weekBefore = JSON.stringify(ua.generationStore.summary('week'));
  const section = dialog.sections.get('month'), query = section.querySelector.bind(section);
  section.querySelector = selector => { assert.equal(/name="(?:weekday|frequency)"/.test(selector), false); return query(selector); };
  section.querySelector('[name="day"]').value = '31';
  section.querySelector('[name="time"]').value = '11:00';
  dialog.form.listeners.submit({ preventDefault() {} });
  assert.equal(dialog.closed, true);
  assert.equal(ua.generationStore.summary('month').config.day, 31);
  assert.equal(ua.generationStore.summary('month').config.time, '11:00');
  assert.equal(JSON.stringify(ua.generationStore.summary('week')), weekBefore, '月报保存不影响周报');
}
clickAction(bulletinHost, 'generation-records');
assert.ok(dialog.body.includes('简报生成记录') && dialog.body.includes('data-generation-tab="week"') && dialog.body.includes('data-generation-tab="month"'));
assert.ok(dialog.body.includes('下次生成'));
assert.equal(dialog.footer.includes('保存设置'), false);
assert.equal((dialog.body.match(/<li>/g) || []).length, 9);
const recentWeek = ua.generationStore.records('bulletins', 'week')[0];
assert.ok(dialog.body.includes(recentWeek.time) && dialog.body.includes(recentWeek.result));
dialog.listeners.click({ target: { closest: query => query === '[data-generation-tab]' ? { dataset: { generationTab: 'month' } } : null } });
assert.equal((dialog.querySelector('[data-record-list]').innerHTML.match(/<li>/g) || []).length, 7);
assert.ok(dialog.querySelector('[data-record-status]').innerHTML.includes(ua.generationStore.records('bulletins', 'month')[0].result));
dialog.close();
clickAction(bulletinHost, 'generation-records', 'month');
assert.ok(dialog.body.includes('data-generation-tab="month" aria-selected="true"'));
assert.equal((dialog.body.match(/<li>/g) || []).length, 7, '月报行直接打开月报记录');
dialog.close();
ua.generationPageCleanup();

const reportHost = new Host(); ua.pages['admin:reports'](reportHost);
assert.equal((reportHost.innerHTML.match(/data-recent-key=/g) || []).length, 1);
assert.ok(reportHost.innerHTML.includes('周报设置') && !reportHost.innerHTML.includes('月报设置'));
assert.equal((reportHost.innerHTML.match(/data-period-tab=/g) || []).length, 2);
assert.equal(reportHost.innerHTML.includes('自动生成安排'), false);
for (const key of ['report-week', 'report-month']) {
  clickTab(reportHost, key.endsWith('month') ? 'month' : 'week');
  const other = key === 'report-week' ? 'report-month' : 'report-week';
  const beforeOther = JSON.stringify(ua.generationStore.summary(other));
  clickAction(reportHost, 'generation-settings', key);
  assert.equal(/执行情况|最近执行记录|name="count"|name="frequency"/.test(dialog.body), false);
  assert.ok(dialog.body.includes('role="switch"') && dialog.body.includes('数据范围'));
  const section = dialog.sections.get(key), control = section.querySelector('[name="enabled"]');
  const previousEnabled = ua.generationStore.summary(key).config.enabled;
  control.checked = false;
  dialog.form.listeners.change({ target: { name: 'enabled', checked: false, closest: () => section } });
  assert.equal(section.querySelector('[data-enabled-label]').textContent, '已停用');
  assert.equal(ua.generationStore.summary(key).config.enabled, previousEnabled, '开关修改在保存前不生效');
  control.checked = true;
  dialog.form.listeners.change({ target: { name: 'enabled', checked: true, closest: () => section } });
  assert.equal(section.querySelector('[data-enabled-label]').textContent, '已启用');
  section.querySelector('[name="time"]').value = '10:30';
  dialog.form.listeners.submit({ preventDefault() {} });
  assert.equal(dialog.closed, true);
  assert.equal(ua.generationStore.summary(key).config.time, '10:30');
  assert.equal(JSON.stringify(ua.generationStore.summary(other)), beforeOther);
  clickAction(reportHost, 'generation-records', key);
  assert.ok(dialog.body.includes('data-generation-tab="' + key + '" aria-selected="true"'));
  assert.equal((dialog.body.match(/<li>/g) || []).length, key === 'report-week' ? 6 : 7);
  dialog.close();
}
ua.generationPageCleanup();

// Exercise type isolation, independent applied/draft filters and pagination with enough rows for two pages.
for (const group of ['bulletins', 'reports']) {
  const store = group === 'reports' ? ua.reportStore : ua.bulletinStore;
  const originalList = store.list, sample = copy(originalList()[0]);
  const rows = ['week', 'month'].flatMap(kind => Array.from({ length: kind === 'week' ? 12 : 10 }, (_, i) => ({
    ...copy(sample), id: 'tab-' + kind + '-' + i, kind, status: 'pending',
    title: (kind === 'week' ? '周报条件' : '月报条件') + i
  })));
  store.list = () => rows;
  const host = new Host(); ua.pages['admin:' + group](host);
  const output = () => host.querySelector('[data-results]').innerHTML;
  const header = () => host.querySelector('[data-generation-summary]').innerHTML;
  const submit = () => host.form.listeners.submit({ preventDefault() {} });
  const nextPage = () => host.listeners.click({ target: { closest: selector => selector === '[data-page]' ? { dataset: { page: '1' } } : null } });
  const count = n => assert.ok(output().includes('共 ' + n + ' 份'), group + ': expected ' + n + ' rows');
  count(12); assert.equal(output().includes('data-id="tab-month-'), false);
  host.form.fields.keyword = '周报条件'; submit(); nextPage();
  assert.ok(output().includes('>2 / 2</span>'));
  host.form.fields.keyword = '尚未提交的文字';
  clickTab(host, 'month'); count(10);
  assert.equal(host.form.fields.keyword, '');
  assert.equal(output().includes('data-id="tab-week-'), false);
  assert.equal(host.querySelector('[data-period-tab="month"]').getAttribute?.('aria-selected') ?? host.querySelector('[data-period-tab="month"]')['aria-selected'], 'true');
  assert.equal(host.querySelector('[data-period-tab="week"]').tabIndex, -1);
  assert.equal(host.querySelector('#' + group + '-panel')['aria-labelledby'], group + '-tab-month');
  assert.equal((header().match(/data-recent-key=/g) || []).length, 1);
  const monthKey = group === 'reports' ? 'report-month' : 'month';
  assert.ok(header().includes('data-generation-key="' + monthKey + '"'));
  host.form.fields.keyword = '月报条件'; host.form.fields.status = 'pending';
  host.form.listeners.change({ target: { name: 'status' } }); nextPage();
  clickTab(host, 'week'); count(12);
  assert.equal(host.form.fields.keyword, '尚未提交的文字');
  assert.ok(output().includes('>2 / 2</span>'), '未提交文字不在切换页签时触发查询');
  host.form.fields.from = '2026-01-01'; host.form.listeners.change({ target: { name: 'from' } }); count(0);
  clickAction(host, 'reset'); count(12);
  clickTab(host, 'month'); count(10);
  assert.equal(host.form.fields.status, 'pending'); assert.equal(host.form.fields.keyword, '月报条件');
  assert.ok(output().includes('>2 / 2</span>'), '重置周报不改变月报查询及分页');
  save(ua.generationStore, group === 'reports' ? 'report-week' : 'week', { time: '12:00' });
  assert.ok(header().includes('data-recent-key="' + monthKey + '"'));
  assert.equal((header().match(/data-recent-key=/g) || []).length, 1, '调度通知只刷新当前类型');
  count(10); assert.ok(output().includes('>2 / 2</span>'));
  clickAction(host, 'generation-records', monthKey);
  assert.ok(dialog.body.includes('data-generation-tab="' + monthKey + '" aria-selected="true"')); dialog.close();
  clickAction(host, 'reset'); count(10); assert.ok(output().includes('>1 / 2</span>'));
  const keyEvent = key => ({ key, preventDefault() {}, target: { closest: selector => selector === '[data-period-tab]' ? {} : null } });
  host.listeners.keydown(keyEvent('ArrowLeft')); count(12);
  assert.equal(host.querySelector('[data-period-tab="week"]').focused, true);
  host.listeners.keydown(keyEvent('End')); count(10);
  host.listeners.keydown(keyEvent('Home')); count(12);
  host.listeners.keydown(keyEvent('ArrowRight')); count(10);
  if (group === 'reports') {
    host.form.fields.merchant = 'unmatched-merchant'; host.form.listeners.change({ target: { name: 'merchant' } }); count(0);
    clickTab(host, 'week'); count(12); assert.equal(host.form.fields.merchant, '');
    // Old week-count snapshots keep their original period label and remain manageable under weekly reports.
    rows.push({ ...copy(sample), id: 'legacy-four-weeks', kind: undefined, count: 4 });
    clickAction(host, 'reset'); count(13); nextPage();
    assert.ok(output().includes('4周（历史期间）'));
    clickTab(host, 'month'); count(0); clickAction(host, 'reset'); count(10);
  }
  ua.generationPageCleanup(); store.list = originalList;
}

// New automatic results update the active period summary and the currently open records dialog.
let currentTime = Date.parse('2026-09-10T08:00:00+08:00');
ua.generationStore = ua.generationSchedule.create({ now: () => currentTime, delay: () => Promise.resolve(), seedHistory: true });
vm.runInNewContext(read('assets/js/admin-generation.js'), ui.sandbox);
const liveHost = new Host(); ua.pages['admin:bulletins'](liveHost);
clickAction(liveHost, 'generation-records');
let sawRunning = false;
const stopObserving = ua.generationStore.subscribe(() => { sawRunning ||= liveHost.querySelector('[data-generation-summary]').innerHTML.includes('>执行中</span>'); });
currentTime = Date.parse('2026-09-14T09:00:00+08:00'); await ua.generationStore.tick();
stopObserving(); assert.ok(sawRunning, '执行期间同步显示执行中');
const newest = ua.generationStore.records('bulletins', 'week')[0];
assert.equal(newest.time, '2026-09-14 09:00:00');
assert.ok(liveHost.querySelector('[data-generation-summary]').innerHTML.includes('>2026-09-14 09:05</time>'), '待补时间早于下个定期计划时展示待补时间');
assert.ok(liveHost.querySelector('[data-generation-summary]').innerHTML.includes(newest.result));
assert.equal(liveHost.querySelector('[data-generation-summary]').innerHTML.includes('>执行中</span>'), false, '新执行结果覆盖默认执行中状态');
assert.ok(dialog.querySelector('[data-record-status]').innerHTML.includes(newest.time));
assert.ok(dialog.querySelector('[data-record-list]').innerHTML.includes(newest.result));
const beforeStop = ua.generationStore.records('bulletins', 'week')[0];
save(ua.generationStore, 'week', { enabled: false });
assert.equal(JSON.stringify(ua.generationStore.records('bulletins', 'week')[0]), JSON.stringify(beforeStop));
assert.ok(liveHost.querySelector('[data-generation-summary]').innerHTML.includes(newest.result));
assert.ok(liveHost.querySelector('[data-generation-summary]').innerHTML.includes('已停用'));
assert.ok(liveHost.querySelector('[data-generation-summary]').innerHTML.includes('每周一 09:00'));
assert.equal(liveHost.querySelector('[data-generation-summary]').innerHTML.includes('>2026-09-14 09:05</time>'), false, '停用后不展示仍将执行的时间');
ua.generationPageCleanup(); dialog.close();
assert.equal(read('merchant/index.html').includes('generation-schedule.js'), false);
assert.equal(read('merchant/index.html').includes('generation-history.js'), false);
for (const page of ['admin-bulletins', 'admin-reports']) {
  assert.equal(/function (?:generate|preview)\(|button\('(?:generate|regenerate|preview)'/.test(read('assets/js/' + page + '.js')), false);
}
assert.ok(read('assets/js/shell.js').includes('app.generationStore.start()'));
assert.ok(read('assets/js/auth.js').includes('app.generationStore.stop()'));
assert.ok(read('assets/js/ui.js').includes('app.enhanceCategoryChecks(dialog)'));
console.log('PASS: automatic generation calendar/period boundaries, persistence, duplicate drafts, per-merchant isolation, pending review/publication, missing data/retries, atomic config, stale/session guards, page/settings handlers and preview removal. Node/static only.');
