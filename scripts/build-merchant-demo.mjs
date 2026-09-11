// Build isolated merchant snapshots from the management default state's actual
// published projections. Drafts and independently promoted content never enter
// the standalone merchant feed.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createMerchantDemoProjection } from './merchant-demo-source.mjs';

const root = new URL('../', import.meta.url);
const projection = createMerchantDemoProjection();
const app = projection.app;
const dir = new URL('assets/js/demo/', root);
fs.mkdirSync(dir, { recursive: true });

function save(name, value) {
  fs.writeFileSync(new URL(name + '.js', dir), '/* 虚构演示快照；由 scripts/build-merchant-demo.mjs 生成，不写入管理端。 */\nwindow.FrozenApp.merchantDemo.register(' + JSON.stringify(name) + ', ' + JSON.stringify(value) + ');\n', 'utf8');
}

assert.ok(app.marketData.valid(projection.public.market));
assert.ok(app.newsData.valid(projection.public.news));
save('public', projection.public);

for (const [merchantId, records] of Object.entries(projection.reports)) {
  assert.ok(app.reportClient.valid(records, merchantId));
  save(merchantId, records);
  console.log(merchantId + ': ' + records.length + ' published report/advice snapshots');
}

console.log('Public snapshots: ' + projection.public.market.length + ' bulletins; ' + projection.public.news.length + ' articles. Strict published projection only.');
