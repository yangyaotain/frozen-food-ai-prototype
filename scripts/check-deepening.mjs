import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
function load(mode, cache = new Map()) {
  const context = { window: { localStorage: { getItem: k => cache.get(k) ?? null, setItem: (k, v) => cache.set(k, v) }, location: { search: '', hash: '' } }, URL, URLSearchParams };
  const html = fs.readFileSync(new URL('../' + mode + '/index.html', import.meta.url), 'utf8');
  for (const m of html.matchAll(/<script defer src="\.\.\/assets\/js\/([^"]+)"><\/script>/g)) if (m[1] !== 'shell.js') vm.runInNewContext(fs.readFileSync(new URL('../assets/js/' + m[1], import.meta.url), 'utf8'), context, { filename: m[1] });
  return context.window.FrozenApp;
}
const app = load('admin'), merchant = load('merchant');
assert.equal(app.scenarioData.weeks.length, 140);
assert.equal(app.priceStore.records.length, 140 * app.categoryCatalog.categories.length);
assert.equal(app.analysisStore.flows.length, 140 * app.categoryStore.records.length);
const round = n => Math.round(n * 100) / 100;
for (const raw of app.categoryStore.records) {
  const rows = app.analysisStore.flows.filter(r => r.rawId === raw.id).sort((a,b) => a.week.localeCompare(b.week));
  rows.forEach((r,i) => { assert.ok(['opening','inbound','outbound','closing'].every(k => r[k] >= 0)); assert.equal(round(r.opening + r.inbound - r.outbound), r.closing); if (i) assert.equal(r.opening, rows[i-1].closing); });
}
const ownFlows = app.scenarioData.merchantFlows(app.analysisStore.flows, app.reportData.merchants, app.categoryStore.records);
for (const r of ownFlows) assert.ok(['opening','inbound','outbound','closing'].every(k => r[k] >= 0), JSON.stringify(r));
for (const m of app.reportData.merchants) for (const raw of app.categoryStore.records) {
  const rows = ownFlows.filter(r => r.merchantId === m.id && r.rawId === raw.id).sort((a,b) => a.week.localeCompare(b.week));
  rows.forEach((r,i) => { assert.equal(round(r.opening+r.inbound-r.outbound),r.closing); if (i) assert.equal(r.opening,rows[i-1].closing); });
}
for (const r of app.analysisStore.flows) {
  const own = ownFlows.filter(o => o.rawId === r.rawId && o.week === r.week);
  for (const k of ['opening','inbound','outbound','closing']) assert.ok(own.reduce((s,o) => s+o[k],0) <= r[k] + 0.02, r.week + '/' + r.rawId + '/' + k);
}
const q = f => app.analysisStore.query({ end: '2026-08-24', count: 4, category: 'pork', ...f });
assert.ok(q().comparisons.price.year.value !== null);
assert.ok(q().seasonal.rows.every(y => y.monthly.length === 12 && y.monthly.every(p => Number.isFinite(p))));
assert.ok(q().anomalies.some(a => a.text.includes('5%')));
assert.ok(q({ category: 'poultry' }).anomalies.some(a => a.text.includes('20%')));
assert.equal(q({end:'2024-02-05'}).comparisons.price.year.value, null);
assert.ok(q({end:'2024-02-05'}).seasonal.text.includes('不完整'));
assert.ok(q({end:'2026-08-31'}).totals.price === null || q({end:'2026-08-31',category:'poultry'}).totals.price === null);
const reports = app.reportStore.list();
assert.equal(new Set(reports.map(r => r.snapshot.totals.turnover.days)).size, 3);
assert.ok(reports[0].advice.includes('超过28天'));
for (const r of reports) {
  assert.ok(r.snapshot.references.length > 0);
  assert.ok(r.snapshot.categories.every(c => c.change.priorOutbound !== null));
  const from = r.snapshot.categories[0].change.start, to = r.snapshot.categories[0].change.end;
  const rawIds = r.snapshot.rows.filter(o => o.categoryId === r.snapshot.categories[0].id).map(o => o.rawId);
  const prior = ownFlows.filter(o => o.merchantId === r.merchant.id && o.week >= from && o.week <= to && rawIds.includes(o.rawId));
  assert.equal(round(prior.reduce((s,o) => s+o.outbound,0)), r.snapshot.categories[0].change.priorOutbound);
}
const seed = app.bulletinStore.list()[0];
assert.ok(seed.snapshot.references[0].id && seed.snapshot.references[0].sourceId && seed.snapshot.references[0].sourceUrl);
assert.ok(seed.snapshot.quality.batches.length);
const originalEvidence = JSON.stringify(seed.snapshot.references);
const item = app.sourceStore.findItem('info-2'), original = item.content;
assert.equal(app.sourceStore.verify(item.id, item.version, 'verified', '直接核验').valid, false);
assert.equal(app.sourceStore.editDisplay(item.id, item.version, { title: '已核对冷链周转信息', content: '虚构样例：核对更新后的冷链周转信息，适用于鸡副仓储观察。', until: '2026-09-30', resolution: '对比两版材料，采用一致期间口径，更新有效日期。' }).valid, true);
assert.equal(item.content, original);
assert.equal(app.sourceStore.publish(item.id, item.version, 1).valid, false);
assert.equal(app.sourceStore.verify(item.id, item.version, 'verified', '对照原文与整理稿核对通过', true).valid, true);
assert.equal(app.sourceStore.publish(item.id, item.version, 1).valid, true);
assert.equal(app.sourceStore.newsPublished().find(r => r.id === item.id).title, '已核对冷链周转信息');
assert.equal(app.sourceStore.editDisplay(item.id, item.version, { title: '新的整理稿', content: '正文修改后须重新核验。', until: '2026-09-30', resolution: '依据版本变更核对。' }).valid, true);
assert.equal(item.publication, null);
assert.equal(JSON.stringify(app.bulletinStore.get(seed.id,1).snapshot.references), originalEvidence);
for (const id of ['info-4','info-6']) { const i = app.sourceStore.findItem(id); assert.equal(app.sourceStore.verify(id,i.version,'verified','未处理问题').valid,false); assert.equal(app.sourceStore.verify(id,i.version,'rejected','无法消除来源冲突或无法验证，拒绝采用').valid,true); }
for (const date of ['2026-06-01','2026-06-08']) {
  for (const categories of [['seafood'],['poultry','seafood','pork']]) {
    let b = app.bulletinStore.generate({ kind:'week', date, categories });
    b = app.bulletinStore.review(b.id,1,'approved','数据核对完成，仍需检查发布范围');
    assert.throws(() => app.bulletinStore.publish(b.id,1), /限制发布/);
    assert.equal(app.marketData.project({...b,status:'published',publication:{actor:'a',time:'b'}}),null);
  }
  let r = app.reportStore.generate({merchant:'demo-a',end:date,count:1});
  r = app.reportStore.review(r.id,1,r.revision,'approved','共同核对',{report:true,advice:true});
  assert.throws(() => app.reportStore.publish(r.id,1,r.revision), /限制发布/);
}
let pub = app.reportStore.review(reports[0].id,1,reports[0].revision,'approved','共同核对',{report:true,advice:true});
pub = app.reportStore.publish(pub.id,1,pub.revision);
const feed = app.reportStore.publishedFor('demo-a');
assert.ok(merchant.reportClient.valid(feed,'demo-a'));
assert.equal(merchant.reportClient.valid(feed,'demo-b'), false);
assert.equal(merchant.reportClient.valid(feed,'missing'), false);
const publicReport = merchant.reportClient.project(feed[0]);
assert.equal(publicReport.snapshot.quality, undefined);
assert.equal(publicReport.snapshot.references[0].originalContent, undefined);
assert.equal(publicReport.snapshot.categories[0].change.priorOutbound, feed[0].snapshot.categories[0].change.priorOutbound);
const old = JSON.parse(JSON.stringify(seed)); delete old.snapshot.safety;
assert.equal(app.marketData.project(old),null);
assert.equal(app.access.can('maintain'),true);
assert.equal(app.access.can('review'),true);
assert.equal(app.access.can('publish'),true);
app.access.end();
assert.equal(app.sourceStore.editDisplay('info-1',1,{}).valid,false);
assert.throws(() => app.reportStore.generate({merchant:'demo-a',end:'2026-07-06',count:1}), /无权/);
assert.equal(app.priceStore.review(app.priceStore.records[0].id,'reviewed','核对').valid,false);
assert.equal(app.access.can('read'),false);
assert.equal(app.reportStore.list().length,0);
assert.equal(app.traceData.query({}).rows.length,0);
assert.equal(app.sourceStore.findItem('info-1'),null);
assert.throws(() => app.bulletinStore.generate({kind:'week',date:'2026-07-06',categories:['pork']}), /无权/);
app.access.start();
const beforeTrace = app.traceData.list().length;
for (const name of ['missing','duplicate','balance']) {
  app.analysisStore.setScenario(name);
  const result = q({end:'2026-06-22',count:1,category:'poultry'});
  assert.equal(result.totals.inbound,null);
  assert.ok(result.quality.some(c => c.level === 'block'));
  assert.throws(() => app.bulletinStore.generate({kind:'week',date:'2026-06-22',categories:['poultry']}), /数据不足/);
  assert.throws(() => app.reportStore.generate({merchant:'demo-a',end:'2026-06-22',count:1}), /数据质量检查未通过/);
}
app.analysisStore.setScenario('zero');
assert.equal(q({end:'2026-06-22',count:1,category:'poultry'}).comparisons.outbound.previous.reason,'基期为零');
app.analysisStore.setScenario('normal');
assert.equal(app.traceData.list().length,beforeTrace);
assert.equal(JSON.stringify(app.bulletinStore.get(seed.id,1).snapshot.references),originalEvidence);
for (const r of [...reports, pub]) assert.equal(/undefined|NaN/.test(app.reportView.render(r)),false);
assert.equal(/undefined|NaN/.test(app.bulletinView.render(seed)),false);
assert.equal(/undefined|NaN/.test(app.analysisInsights.markup(q())),false);
for (const html of [app.bulletinView.render(seed), app.reportView.render(pub), app.reportView.render(publicReport,'advice'), app.analysisInsights.markup(q())]) {
  const stack=[];
  for (const tag of html.matchAll(/<\/?([a-z][\w-]*)\b[^>]*>/gi)) {
    if (tag[0].startsWith('</')) assert.equal(stack.pop(),tag[1]);
    else if (!['input','br','hr','img'].includes(tag[1]) && !tag[0].endsWith('/>')) stack.push(tag[1]);
  }
  assert.equal(stack.length,0);
}
console.log('PASS D00–D06: 140 weeks, 1680 prices, 5460 market rows; balanced independent merchants; YoY/seasonal/anomalies; draft re-review; publication privacy gates; role guards; cross-household rejection; quality scenario blocking and frozen evidence. Node/static only.');
