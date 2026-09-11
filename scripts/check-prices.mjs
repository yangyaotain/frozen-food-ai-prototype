import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const sandbox = { window: { FrozenApp: {} } };
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
vm.runInNewContext(fs.readFileSync(new URL('../assets/js/category-catalog.js', import.meta.url), 'utf8'), sandbox);
vm.runInNewContext(fs.readFileSync(new URL('../assets/js/price-store.js', import.meta.url), 'utf8'), sandbox);
const data = sandbox.window.FrozenApp.priceData;
const store = data.createStore();
const csv = data.headers.join(',') + '\r\n';
const input = { start: '2026-09-07', category: 'poultry', price: '12900.50', unit: '元/吨', note: '维护样例' };
assert.equal(store.records.length, data.categories.length * 8);
assert.equal(data.weekOf('2025-12-29').label, '2026 年第 1 周');
assert.equal(data.weekOf('2020-12-28').label, '2020 年第 53 周');

// 无效日期、非周一、空值/零/非数值/超精度不能写入。
for (const override of [
  { start: '2026-02-30' }, { start: '2026-09-08' }, { start: '' },
  { price: '' }, { price: '0' }, { price: '-1' }, { price: '1e3' }, { price: '1.001' }, { price: '1000000000' },
  { category: 'unknown' }, { unit: '元/公斤' }, { note: '字'.repeat(201) }
]) assert.equal(store.save({ ...input, ...override }).valid, false);
assert.equal(store.records.length, data.categories.length * 8);
assert.equal(store.save({ ...input, start: '2026-08-31' }).valid, false);

// 保存、重复提交、复核、修改的完整链；快照不随当前记录变化。
const added = store.save(input);
assert.equal(added.valid, true);
const id = added.record.id;
assert.equal(added.record.status, 'pending');
assert.equal(store.save(input).valid, false);
assert.equal(store.review(id, 'reviewed', '   ').valid, false);
assert.equal(store.review(id, 'reviewed', '已核对周均价').valid, true);
assert.equal(store.review(id, 'revision', '不应再次复核').valid, false);
assert.equal(store.save(input, id).unchanged, true);
assert.equal(added.record.status, 'reviewed');
const edited = store.save({ ...input, price: '13000' }, id);
assert.equal(edited.record.version, 2);
assert.equal(edited.record.status, 'pending');
assert.equal(edited.record.history[1].after.price, 12900.5);
assert.equal(edited.record.history[1].after.status, 'reviewed');
assert.equal(edited.record.history[2].before.status, 'reviewed');
assert.equal(store.review(id, 'revision', '请补充核价依据').valid, true);
assert.equal(store.save({ ...input, price: '13000', note: '已补充核价依据' }, id).record.status, 'pending');

// CSV 解析：BOM、CRLF、引号内逗号/换行/转义、物理行号、空白行。
const parsed = data.parseCSV('\uFEFF' + csv + '2026-09-14,鸡副,12800,元/吨,"第一行,说明\r\n第二行""备注"""\r\n\r\n2026-09-14,水产,24000,元/吨,\r\n');
assert.equal(parsed.length, 2);
assert.equal(parsed[0].line, 2);
assert.equal(parsed[1].line, 5);
assert.equal(parsed[0].input.note, '第一行,说明\r\n第二行"备注"');
assert.throws(() => data.parseCSV(csv + '2026-09-14,鸡副,1,元/吨,"未闭合'));
assert.throws(() => data.parseCSV(csv + '2026-09-14,鸡副,1,元/吨,"备注"额外字符'));
assert.throws(() => data.parseCSV('错误表头\n1,2,3'));
assert.throws(() => data.parseCSV(csv));
assert.throws(() => data.parseCSV(csv + '2026-09-14,鸡副,1,元/吨,\n'.repeat(501)));

// 整批拒绝：文件内部重复、已存在记录、未知品类、缺列、错误数值。
const before = JSON.stringify(store.records);
for (const rows of [
  '2026-09-14,鸡副,1,元/吨,\n2026-09-14,鸡副,2,元/吨,',
  '2026-09-14,鸡副,1,元/吨,\n2026-08-31,鸡副,2,元/吨,',
  '2026-09-14,鸡副,1,元/吨,\n2026-09-14,未知,2,元/吨,',
  '2026-09-14,鸡副,1,元/吨',
  '2026-09-14,鸡副,1,元/吨,\n2026-09-14,水产,=1+1,元/吨,'
]) {
  assert.equal(store.importRows(data.parseCSV(csv + rows), '错误样例.csv').valid, false);
  assert.equal(JSON.stringify(store.records), before);
  assert.equal(store.batches.length, 0);
}
const previewRows = data.parseCSV(csv + '2026-09-21,鸡副,1,元/吨,');
assert.equal(store.validateRows(previewRows)[0].valid, true);
store.save({ ...input, start: '2026-09-21' });
assert.equal(store.importRows(previewRows, '过期预览.csv').valid, false);

// 成功导入生成批次和操作记录，后续编辑不覆盖批次原始快照。
const imported = store.importRows(parsed, '正常样例.csv');
assert.equal(imported.valid, true);
assert.equal(imported.batch.items.length, 2);
assert.equal(imported.batch.items[0].record.status, 'pending');
const first = imported.batch.items[0].record;
assert.equal(store.records.find(record => record.id === first.id).history[0].action, '批量导入');
assert.equal(store.save({ ...input, start: '2026-09-14', price: '14000' }, first.id).valid, true);
assert.equal(imported.batch.items[0].record.price, 12800);
assert.equal(store.importRows(parsed, '再次导入.csv').valid, false);
assert.equal(store.batches.length, 1);
assert.equal(new Set(store.records.map(record => record.id)).size, store.records.length);
assert.equal(new Set(store.records.map(record => record.week.id + ':' + record.category.id)).size, store.records.length);
// 采价新增/编辑的多品类选择器使用顶层浮层，不参与弹窗表单布局。
const priceActions = read('assets/js/price-actions.js'), ui = read('assets/js/ui.js'), css = read('assets/css/common.css');
assert.match(priceActions, /name="category"[^>]*data-floating-panel="true"/);
assert.match(ui, /search-select-panel"' \+ \(floating \? ' popover="manual"'/);
assert.match(ui, /floating:\s*select\.dataset\.floatingPanel === 'true'/);
assert.match(css, /\.search-select--floating > \.search-select-panel\s*\{[^}]*position: fixed/);
assert.match(css, /\.search-select--floating > \.search-select-panel:popover-open\s*\{[^}]*display: flex/);
assert.doesNotMatch(css, /\.app-dialog \.category-picker \.search-select\[open\] \.search-select-panel\s*\{[^}]*position: static/);
console.log('PASS: price validation, review/version transitions, CSV parsing, atomic import, stale preview and immutable batch snapshots. Node data-logic checks only; no browser or visual verification.');
