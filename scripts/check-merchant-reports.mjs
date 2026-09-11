import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read = name => fs.readFileSync(new URL('../assets/js/' + name + '.js', import.meta.url), 'utf8');
const admin = { window: { FrozenApp: {} }, URL };
for (const name of ['common', 'category-catalog', 'price-store', 'category-store', 'source-store', 'analysis-store', 'market-data', 'bulletin-store', 'bulletin-view', 'report-store']) vm.runInNewContext(read(name), admin);
const a = admin.window.FrozenApp, reports = a.reportStore;
const get = id => reports.list().find(r => r.id === id);
function reviewAndPublish(row) {
  const reviewed = reports.review(row.id, row.version, row.revision, 'approved', '核对本户报告与建议', { report: true, advice: true });
  return reports.publish(reviewed.id, reviewed.version, reviewed.revision);
}
const rowA = reports.list().find(r => r.merchant.id === 'demo-a');
const rowB = reports.list().find(r => r.merchant.id === 'demo-b');
const adminPrivateKey = 'frozen-admin-reports-v1';
const cache = new Map([[adminPrivateKey, 'must-not-read-admin-cache']]);
const reads = [];
const storage = { getItem(key) { reads.push(key); return cache.get(key) ?? null; }, setItem(key, value) { cache.set(key, value); } };
const merchant = { window: { FrozenApp: {}, localStorage: storage }, URL };
for (const name of ['common', 'category-catalog', 'market-data', 'bulletin-view', 'report-client', 'report-view']) vm.runInNewContext(read(name), merchant);
const m = merchant.window.FrozenApp;
assert.equal(m.reportStore, undefined);
assert.equal(m.reportData, undefined);
const client = m.reportClient.createStore('demo-a', storage);
assert.equal(client.list().length, 0);
assert.equal(client.accept([rowA]), false);
assert.equal(client.accept([null]), false);
assert.equal(client.accept({}), false);
reviewAndPublish(rowA); reviewAndPublish(rowB);
let live = reports.publishedFor('demo-a')[0];
const other = reports.publishedFor('demo-b')[0];
assert.equal(client.accept([other]), false);
assert.equal(client.accept([live, other]), false);
assert.equal(client.list().length, 0);
assert.equal(client.accept([live]), true);
assert.equal(client.unread(live, 'reports'), '未读');
assert.equal(client.unread(live, 'advice'), '未读');
client.markRead(live, 'reports');
assert.equal(client.unread(live, 'reports'), '');
assert.equal(client.unread(live, 'advice'), '未读');
assert.equal(client.markRead(other, 'reports'), false);
assert.equal(client.markRead(live, 'unknown'), false);
const persisted = m.reportClient.createStore('demo-a', storage);
assert.equal(persisted.unread(live, 'reports'), '');
assert.equal(persisted.unread(live, 'advice'), '未读');
assert.equal(m.reportClient.createStore('demo-b', storage).list().length, 0);
assert.equal(reads.includes(adminPrivateKey), false);

// 修订草稿不替换发布版；阅读旧版不能消除新版更新提示。
const v1 = client.get(live.id), immutable = JSON.stringify(v1);
const base = get(rowA.id);
const draft = reports.revise(base.id, base.version, base.revision);
assert.equal(client.accept([draft]), false);
assert.equal(client.accept(reports.publishedFor('demo-a')), true);
assert.equal(client.get(rowA.id).version, 1);
const changed = reports.edit(draft.id, draft.version, draft.revision, { title: draft.title, summary: draft.summary, signals: draft.signals, advice: draft.advice + '\n新增复核后的建议说明。' });
reviewAndPublish(changed);
live = reports.publishedFor('demo-a')[0];
assert.equal(client.accept([live, v1]), true);
assert.equal(client.list().length, 1);
assert.equal(client.get(live.id).version, 2);
assert.equal(client.unread(live, 'reports'), '有更新 · V2');
client.markRead(v1, 'reports');
assert.equal(client.unread(live, 'reports'), '有更新 · V2');
assert.equal(JSON.stringify(v1), immutable);
client.markRead(live, 'reports');
client.markRead(live, 'advice');
assert.equal(client.unread(live, 'reports'), '');
assert.equal(client.unread(live, 'advice'), '');

// 白名单丢弃内部字段；坏数据不能覆盖当前本户内容。
const injected = JSON.parse(JSON.stringify(live));
injected.history = ['private']; injected.review.opinion = 'private';
injected.snapshot.otherMerchants = [other];
injected.snapshot.rows[0].otherMerchant = 'must-not-cross';
assert.equal(client.accept([injected]), true);
const clean = JSON.stringify(client.list());
for (const marker of ['otherMerchants', 'otherMerchant', 'history', 'opinion', 'must-not-cross', 'demo-b']) assert.equal(clean.includes(marker), false);
const bad = JSON.parse(JSON.stringify(live)); bad.snapshot.categories = [null];
assert.equal(client.accept([bad]), false);
assert.equal(JSON.stringify(client.list()), clean);
assert.equal(m.reportClient.createStore('unknown', storage).accept([live]), false);
const denied = m.reportClient.createStore('demo-a', { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } });
assert.equal(denied.accept([live]), true);
denied.markRead(live, 'reports');
assert.equal(denied.unread(live, 'reports'), '');
assert.equal(denied.storageAvailable(), false);

// 同一份数据在没有管理端脚本的上下文渲染报告和建议，版本、文字及转义保持一致。
const record = client.get(live.id);
const reportHTML = m.reportView.render(record, 'report');
const adviceHTML = m.reportView.render(record, 'advice');
for (const html of [reportHTML, adviceHTML]) {
  assert.ok(html.includes('报告与建议 V2'));
  assert.ok(html.includes(m.escape(record.advice)));
  assert.ok(html.includes('仅供参考，不作为经营决策依据'));
  assert.ok(html.includes('查看引用简报快照'));
  const stack = [];
  for (const match of html.matchAll(/<\/?([a-z][\w-]*)\b[^>]*>/gi)) {
    if (match[0].startsWith('</')) assert.equal(stack.pop(), match[1]);
    else if (!['br', 'input', 'img', 'hr'].includes(match[1]) && !match[0].endsWith('/>')) stack.push(match[1]);
  }
  assert.equal(stack.length, 0);
}
assert.ok(reportHTML.includes('本户周度出入库'));
assert.equal(adviceHTML.includes('本户周度出入库'), false);
assert.ok(adviceHTML.includes('经营建议</h2>'));
assert.equal(m.reportView.render({ ...record, advice: '<script>bad()</script>' }, 'advice').includes('<script>'), false);
const entry = fs.readFileSync(new URL('../merchant/index.html', import.meta.url), 'utf8');
for (const forbidden of ['report-store.js', 'analysis-store.js', 'category-store.js', 'source-store.js', 'admin-reports.js']) assert.equal(entry.includes(forbidden), false);
assert.equal(client.accept([]), true);
assert.equal(client.list().length, 0);
console.log('PASS: merchant-specific feeds/cache, unpublished and mixed-merchant rejection, version updates, independent reading state, storage fallback, public projection, same-version report/advice rendering and static HTML checks. No browser verification.');
