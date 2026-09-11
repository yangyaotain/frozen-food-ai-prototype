import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const cache = new Map();
const storage = { getItem: key => cache.get(key) ?? null, setItem: (key, value) => cache.set(key, value) };
function loadEntry(mode, context) {
  // Base history fixtures for read-only aggregation; full seeded event coverage is checked separately.
  const html = fs.readFileSync(new URL('../' + mode + '/index.html', import.meta.url), 'utf8');
  for (const match of html.matchAll(/<script defer src="\.\.\/assets\/js\/([^"]+)"><\/script>/g)) {
    if (!['shell.js', 'admin-example-states.js'].includes(match[1])) vm.runInNewContext(fs.readFileSync(new URL('../assets/js/' + match[1], import.meta.url), 'utf8'), context, { filename: match[1] });
  }
}
const sandbox = { window: { localStorage: storage, location: { search: '', hash: '' } }, URL, URLSearchParams };
loadEntry('admin', sandbox);
const app = sandbox.window.FrozenApp, trace = app.traceData;
const tracePage = fs.readFileSync(new URL('../assets/js/admin-trace.js', import.meta.url), 'utf8');
assert.doesNotMatch(tracePage, /同一内容记录|data-scope|filters\.objectId|clear-scope/);
assert.match(tracePage, /查看关联版本/);
for (const route of app.config.admin.routes) assert.equal(typeof app.pages['admin:' + route.id], 'function', route.id);
const merchant = { window: { localStorage: storage, location: { search: '', hash: '' } }, URL, URLSearchParams };
loadEntry('merchant', merchant);
for (const route of merchant.window.FrozenApp.config.merchant.routes) assert.equal(typeof merchant.window.FrozenApp.pages['merchant:' + route.id], 'function', route.id);
assert.equal(merchant.window.FrozenApp.traceData, undefined);
assert.equal(merchant.window.FrozenApp.sourceStore, undefined);
assert.equal(merchant.window.FrozenApp.reportStore, undefined);
const initial = trace.list();
assert.equal(initial.length, app.priceStore.records.length + app.sourceStore.sources.length + app.sourceStore.items.length + 6 + 9); // Weekly generation/review/publication, three monthly drafts and nine report seeds; no invented mapping logs.
assert.ok(initial.every(row => row.type === 'seed'));
assert.equal(new Set(initial.map(r => r.id)).size, initial.length);
assert.equal(trace.query({ module: 'categories' }).rows.length, 0);
assert.equal(trace.query({ module: 'prices', from: '2026-09-06', to: '2026-09-06' }).rows.length, 12);
assert.equal(trace.query({ from: '2026-09-07', to: '2026-09-06' }).rows.length, 0);
assert.ok(trace.query({ from: '2026-09-07', to: '2026-09-06' }).error);
assert.ok(trace.query({ from: '2026-02-30' }).error);
assert.equal(trace.query({ keyword: 'missing-content' }).rows.length, 0);
const beforeRead = JSON.stringify([...cache]);
trace.list(); trace.query({ type: 'seed' });
assert.equal(JSON.stringify([...cache]), beforeRead);
initial[0].opinion = 'mutated returned copy';
assert.notEqual(trace.list()[0].opinion, initial[0].opinion);

const price = app.priceStore.records[0];
assert.equal(app.priceStore.review(price.id, 'reviewed', '逐项核对采价').valid, true);
assert.equal(trace.query({ module: 'prices', type: 'review', keyword: price.id }).rows.length, 1);
const pricing = app.priceStore.importRows([{ line: 2, input: { start: '2026-09-07', category: 'poultry', price: '13000', unit: '元/吨', note: '导入演示' } }], '采价演示.csv');
assert.equal(pricing.valid, true);
const imported = trace.query({ type: 'import' }).rows[0];
assert.ok(imported.evidence[0].includes('IMP-0001'));
assert.ok(imported.evidence[0].includes('第 2 行'));
assert.ok(imported.after.some(pair => pair[0] === '周均价格' && pair[1] === '13000.00 元/吨'));
assert.equal(app.categoryStore.save('raw-004', { categoryId: 'poultry', note: '按同义名称归并' }, 1).valid, true);
const mapping = trace.query({ module: 'categories' }).rows[0];
assert.equal(mapping.type, 'maintain');
assert.ok(mapping.before.some(pair => pair[1] === '未映射'));
assert.ok(mapping.after.some(pair => pair[1] === '鸡副'));

const item = app.sourceStore.findItem('info-1'), source = app.sourceStore.find(item.sourceId);
assert.equal(app.sourceStore.publish(item.id, item.version, source.version).valid, true);
const publishedNews = trace.query({ module: 'news', type: 'publish' }).rows[0];
assert.ok(publishedNews.after.some(pair => pair[1] === '已发布 V1'));
const preservedNews = JSON.stringify(publishedNews);
assert.equal(app.sourceStore.save({ ...source, name: '修改后政策来源' }, source.id, source.version).valid, true);
assert.equal(JSON.stringify(trace.query({ module: 'news', type: 'publish' }).rows[0]), preservedNews);
assert.ok(trace.query({ module: 'news', type: 'anomaly' }).rows.length > 0);
assert.equal(app.sourceStore.newsPublished().length, 0);

let bulletin = app.bulletinStore.list()[0];
const originalBulletin = app.bulletinStore.get(bulletin.id, 1);
const seedPublish = trace.query({ module: 'bulletins' }).rows.find(r => r.action.includes('发布'));
app.bulletinStore.revise(bulletin.id, 1);
bulletin = app.bulletinStore.get(bulletin.id, 2);
app.bulletinStore.edit(bulletin.id, 2, { ...bulletin, title: '修订后的行情周报' });
app.bulletinStore.review(bulletin.id, 2, 'approved', '逐项核对新标题及原数据快照');
app.bulletinStore.publish(bulletin.id, 2);
assert.equal(trace.linked(seedPublish).version, 1);
assert.equal(JSON.stringify(trace.linked(seedPublish)), JSON.stringify(originalBulletin));
assert.equal(trace.query({ module: 'bulletins', type: 'revise' }).rows.length, 1);
const edit = trace.query({ module: 'bulletins', type: 'maintain' }).rows[0];
assert.ok(edit.before.some(pair => pair[1] === originalBulletin.title));
assert.ok(edit.after.some(pair => pair[1] === '修订后的行情周报'));
assert.ok(edit.evidence.some(text => text.includes('采价 ') && text.includes('元/吨')));
assert.equal(app.bulletinStore.published()[0].version, 2);
const raw = app.categoryStore.records[0];
const oldEvidence = JSON.stringify(edit.evidence);
app.categoryStore.save(raw.id, { categoryId: 'pork', note: '模拟后续映射变更' }, raw.version);
assert.equal(JSON.stringify(trace.query({ module: 'bulletins', type: 'maintain' }).rows[0].evidence), oldEvidence);

let report = app.reportStore.list()[0];
report = app.reportStore.edit(report.id, 1, report.revision, { ...report, advice: report.advice + '\n追加演示建议。' });
report = app.reportStore.review(report.id, 1, report.revision, 'approved', '共同核对报告和建议', { report: true, advice: true });
report = app.reportStore.publish(report.id, 1, report.revision);
const reportPublish = trace.query({ module: 'reports', type: 'publish', keyword: report.merchant.name }).rows[0];
assert.equal(reportPublish.objectId, report.id);
assert.equal(trace.linked(reportPublish).advice, report.advice);
assert.ok(reportPublish.evidence.some(text => text.includes('映射 ') && text.includes('/ V1')));
const revised = app.reportStore.revise(report.id, 1, report.revision);
assert.equal(revised.version, 2);
assert.equal(app.reportStore.publishedFor(report.merchant.id)[0].version, 1);
assert.equal(trace.linked(reportPublish).version, 1);
assert.equal(trace.linked(imported), null);
assert.equal(trace.linked({ module: 'reports', objectId: 'missing', version: 1 }), null);

const all = trace.list();
assert.equal(new Set(all.map(r => r.id)).size, all.length);
for (let i = 1; i < all.length; i++) assert.ok(all[i - 1].time >= all[i].time);
for (const row of all) {
  const html = app.traceView.body(row), stack = [];
  assert.equal(html.includes('undefined'), false);
  assert.equal(html.includes('NaN'), false);
  for (const match of html.matchAll(/<\/?([a-z][\w-]*)\b[^>]*>/gi)) {
    if (match[0].startsWith('</')) assert.equal(stack.pop(), match[1]);
    else if (!['input', 'br', 'img', 'hr'].includes(match[1]) && !match[0].endsWith('/>')) stack.push(match[1]);
  }
  assert.equal(stack.length, 0);
}
assert.equal(app.traceView.body({ ...all[0], opinion: '<script>bad()</script>', title: '<b>bad</b>' }).includes('<script>'), false);
assert.ok(app.traceView.body(seedPublish).includes('初始记录'));
assert.equal(app.traceView.body(seedPublish).includes('预置演示记录'), false);
// Version actions reuse the existing full-detail functions and the exact requested version.
let opened;
Object.defineProperty(app, 'openDetailPage', { get: () => app.openDialog, configurable: true });
app.openDialog = (host, title, body) => { opened = { title, body }; return { addEventListener() {} }; };
app.bulletinActions.detail({}, trace.linked(seedPublish));
assert.ok(opened.title.includes('V1')); assert.ok(opened.body.includes(originalBulletin.title));
app.reportActions.detail({}, trace.linked(reportPublish));
assert.ok(opened.title.includes('V1')); assert.ok(opened.body.includes('仅供参考，不作为经营决策依据'));
console.log('PASS: both entry script chains and all implemented routes; trace aggregation without writes or invented logs, dates/types/objects, imports, mapping and source evidence, old-version links, public version boundaries, HTML structure and escaping. Node/static checks only; no browser verification.');
