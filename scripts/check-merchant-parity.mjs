import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createMerchantDemoProjection, normalizedSnapshot } from './merchant-demo-source.mjs';

const root = new URL('../', import.meta.url);
const expected = createMerchantDemoProjection();
const context = { window: { FrozenApp: { merchantDemo: { register(key, value) { this[key] = value; } } } } };

for (const name of ['public', 'demo-a', 'demo-b', 'demo-c']) {
  vm.runInNewContext(fs.readFileSync(new URL('assets/js/demo/' + name + '.js', root), 'utf8'), context, { filename: name });
}

const actual = context.window.FrozenApp.merchantDemo;
assert.deepEqual(normalizedSnapshot(actual.public), normalizedSnapshot(expected.public), '公共行情或资讯快照未与管理端已发布投影同步');

for (const merchantId of ['demo-a', 'demo-b', 'demo-c']) {
  assert.deepEqual(normalizedSnapshot(actual[merchantId]), normalizedSnapshot(expected.reports[merchantId]), merchantId + '报告快照未与管理端已发布投影同步');
  assert.ok(actual[merchantId].every(record => record.status === 'published' && record.merchant.id === merchantId));
}

assert.ok(actual.public.market.every(record => record.status === 'published'));
assert.ok(actual.public.news.every(record => record.status === 'published'));
assert.ok(actual.public.market.every(record => !record.summary.includes('价格波动关注')));
assert.ok(actual.public.news.every(record => record.verification.actor === '周明远' && record.publication.actor === '徐悦'));
assert.ok(Object.values(actual).flatMap(value => Array.isArray(value) ? value : []).filter(record => record.review).every(record => record.review.actor !== '复核员' && record.publication.actor !== '发布员'));

console.log('PASS merchant parity: standalone feeds exactly match management default published projections; current names, origins, prices, sources, report text, actors and versions are synchronized; drafts are excluded. Node/static only.');
