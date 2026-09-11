import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
const forbidden = /演示|虚构|样例|静态原型|规则模拟|未调用真实\s*AI|本次打开期间|刷新恢复/;
const visible = html => html.replace(/<[^>]*>/g, '');
function check(html, label) {
  const match = visible(html).match(forbidden);
  assert.equal(match, null, label + ': ' + (match ? visible(html).slice(Math.max(0, match.index - 30), match.index + 70) : ''));
}
function load(mode) {
  const context = { window: { FrozenApp: {}, location: { search: '', hash: '' } }, URL, URLSearchParams };
  for (const m of read(mode + '/index.html').matchAll(/<script defer src="..\/assets\/js\/([^"]+)"><\/script>/g)) {
    if (m[1] !== 'shell.js') vm.runInNewContext(read('assets/js/' + m[1]), context, { filename: m[1] });
  }
  return context;
}
const admin = load('admin'), a = admin.window.FrozenApp;
check(read('index.html'), '登录页');
assert.ok(read('index.html').includes('value="admin"') && read('index.html').includes('value="123456"'));
assert.ok(read('index.html').includes('target="_blank"'));
for (const row of a.bulletinStore.list()) check(a.bulletinView.render(row), '管理端简报');
for (const row of a.reportStore.list()) { check(a.reportView.render(row), '经营报告'); check(a.reportView.render(row, 'advice'), '经营建议'); }
for (const row of a.traceData.list()) check(a.traceView.body(row), '追溯详情');
const row = a.bulletinStore.list()[0];
const legacy = JSON.parse(JSON.stringify(row));
legacy.title = '演示商户甲 · 行情简报'; legacy.review.actor = '演示复核员';
legacy.snapshot.ruleVersion = 'V2（规则模拟，无真实 AI）';
legacy.snapshot.sourceNote = '虚构的已复核每周平均采价、市场数量样例。';
legacy.snapshot.method = '数量按周内均分的演示日数据累计，价格按覆盖天数加权估算。';
legacy.signals = '达到20%演示关注条件。';
legacy.snapshot.references.push({ title: '政策信息样例库', sourceName: '政策信息样例库', content: '本虚构政策样例关注冻品交接记录。', publishedAt: '2026-09-01', sourceVersion: 1, infoVersion: 1 });
const frozen = JSON.stringify(legacy);
check(a.bulletinView.render(legacy), '旧版简报');
assert.equal(JSON.stringify(legacy), frozen, '显示调整不得写回快照');
assert.equal(a.publicationPolicy.allowed(legacy), a.publicationPolicy.allowed(row), '保持旧发布规则兼容');
assert.ok(a.bulletinView.render(legacy).includes('AI 生成'));
assert.equal(a.presentation.escape('<script>演示商户甲</script>').includes('<script>'), false);
assert.equal(a.presentation.text('demo-a'), 'demo-a', '不改动商户内部ID');
assert.equal(a.presentation.text('2026-09-06 / V2 / 12800元/吨'), '2026-09-06 / V2 / 12800元/吨');
const merchant = load('merchant'), m = merchant.window.FrozenApp;
for (const name of ['public', 'demo-a', 'demo-b', 'demo-c']) vm.runInNewContext(read('assets/js/demo/' + name + '.js'), merchant);
const pub = await m.merchantDemo.load('public');
const oldNews = JSON.parse(JSON.stringify(pub.news[0])); oldNews.source.name = '政策信息样例库';
assert.equal(m.newsData.query([oldNews], { keyword: '冷链政策与标准信息库' }).length, 1, '旧名称缓存可按当前展示名称查询');
for (const r of pub.market) { check(m.merchantView.market(r), '小程序行情详情'); check(m.merchantView.card(r, 'market'), '小程序行情卡片'); }
for (const r of pub.news) { check(m.merchantView.news(r), '小程序资讯详情'); check(m.newsView.detail(r), '资讯公共详情'); check(m.newsView.card(r), '资讯公共卡片'); }
for (const id of ['demo-a', 'demo-b', 'demo-c']) for (const r of await m.merchantDemo.load(id)) {
  check(m.merchantView.report(r, false), '小程序经营报告'); check(m.merchantView.report(r, true), '小程序经营建议');
}
assert.ok(read('assets/js/admin-sources.js').includes('原始异常标识'), '保留来源异常业务提示');
assert.ok(read('assets/js/report-view.js').includes('仅供参考，不作为经营决策依据'));
console.log('PASS: 登录、报告、简报、资讯、追溯及小程序内容不展示原型说明；旧快照只读展示、发布兼容、业务标识及输出转义检查通过。仅静态/Node检查。');
