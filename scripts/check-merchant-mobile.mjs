import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url), context = { window: { FrozenApp: {} }, URLSearchParams };
const entry = fs.readFileSync(new URL('merchant/index.html', root), 'utf8');
for (const m of entry.matchAll(/<script defer src="..\/assets\/js\/([^"]+)"><\/script>/g)) if (m[1] !== 'shell.js') vm.runInNewContext(fs.readFileSync(new URL('assets/js/' + m[1], root), 'utf8'), context, { filename: m[1] });
const a = context.window.FrozenApp;
const displayEscape = a.presentation ? a.presentation.escape : a.escape;
for (const name of ['public', 'demo-a', 'demo-b', 'demo-c']) vm.runInNewContext(fs.readFileSync(new URL('assets/js/demo/' + name + '.js', root), 'utf8'), context);
const pub = await a.merchantDemo.load('public');
assert.equal(pub.news.length, 3); assert.equal(pub.market.length, 3);
assert.ok(a.marketData.valid(pub.market)); assert.ok(a.newsData.valid(pub.news));
assert.equal(pub.market.filter(r => r.kind === 'month').length, 1);
assert.equal(new Set(pub.news.map(r => r.type)).size, 3);
assert.ok(pub.market.every(r => r.snapshot.categories.length === a.categoryCatalog.ids().length));
function markup(html) {
  assert.equal(/undefined|NaN|<table\b|<script\b/.test(html), false);
  const stack = [];
  for (const tag of html.matchAll(/<\/?([a-z][\w-]*)\b[^>]*>/gi)) {
    if (tag[0].startsWith('</')) assert.equal(stack.pop(), tag[1]);
    else if (!['input', 'br', 'img', 'hr'].includes(tag[1]) && !tag[0].endsWith('/>')) stack.push(tag[1]);
  }
  assert.equal(stack.length, 0);
}
const round = n => Math.round(n * 100) / 100;
const quantities = r => assert.ok(Math.abs(round(r.opening + r.inbound - r.outbound) - r.closing) < 0.02);
const expectedReportCounts = { 'demo-a': 3, 'demo-b': 2, 'demo-c': 2 };
for (const id of ['demo-a', 'demo-b', 'demo-c']) {
  const records = await a.merchantDemo.load(id);
  assert.equal(records.length, expectedReportCounts[id]); assert.ok(a.reportClient.valid(records, id));
  assert.equal(new Set(records.map(r => r.kind)).size, 2);
  for (const other of ['demo-a', 'demo-b', 'demo-c'].filter(v => v !== id)) assert.equal(a.reportClient.valid(records, other), false);
  for (const r of records) {
    quantities(r.snapshot.totals); r.snapshot.rows.forEach(quantities); r.snapshot.series.forEach(quantities);
    assert.equal(r.snapshot.quality, undefined); assert.equal(r.history, undefined);
    const html = a.merchantView.report(r, false), advice = a.merchantView.report(r, true);
    markup(html); markup(advice); markup(a.merchantView.card(r, 'reports', { feature: true })); markup(a.merchantView.card(r, 'advice'));
    for (const line of r.advice.split('\n').filter(Boolean)) assert.ok(advice.includes(displayEscape(line)), r.id + ': ' + line);
    assert.ok(html.includes('本户周度出入库明细')); assert.equal(advice.includes('本户周度出入库明细'), false);
    assert.ok(advice.includes('仅供参考，不作为经营决策依据'));
    assert.ok(advice.includes(displayEscape(r.review.actor))); assert.ok(html.includes(r.publication.time));
    assert.equal(a.merchantView.report({ ...r, advice: '<script>alert(1)</script>' }, true).includes('<script>'), false);
    for (const b of r.snapshot.bulletins) { const p = pub.market.find(v => v.id === b.id); assert.ok(p); assert.equal(p.version, b.version); assert.equal(JSON.stringify(p.snapshot.categories), JSON.stringify(b.snapshot.categories)); }
  }
  const periods = a.merchantUI.months(records);
  for (const [month] of periods.slice(1)) assert.ok(a.merchantPage.match(records, 'reports', { month }).length);
  for (const kind of ['week', 'month']) assert.ok(a.merchantPage.match(records, 'reports', { kind }).length);
}
for (const row of pub.news) { markup(a.merchantView.news(row)); markup(a.merchantView.card(row, 'news')); }
for (const row of pub.market) { markup(a.merchantView.market(row)); markup(a.merchantView.card(row, 'market', { feature: true })); }
for (const category of a.categoryCatalog.ids()) {
  assert.ok(a.merchantPage.match(pub.market, 'market', { category }).length);
}
for (const category of new Set(pub.news.flatMap(row => row.categories.map(item => item.id)))) assert.ok(a.merchantPage.match(pub.news, 'news', { category }).length);
assert.equal(a.merchantPage.match(pub.news, 'news', { keyword: '找不到的资讯' }).length, 0);
assert.equal(a.merchantPage.match(pub.market, 'market', { month: '2099-01' }).length, 0);
assert.equal(a.merchantPage.match(pub.news, 'news', { type: 'policy', keyword: '交接' }).length, 1);
assert.equal(a.merchantPage.match(pub.market, 'market', { kind: 'month' }).length, 1);
for (const module of ['news', 'market', 'reports', 'advice', 'profile']) assert.equal(typeof a.pages['merchant:' + module], 'function');
assert.equal(a.config.merchant.routes.length, 5);
for (const id of ['demo-a', 'demo-b', 'demo-c']) {
  const html = a.merchantProfile.render(id); markup(html);
  assert.ok(html.includes(a.merchantProfile.get(id).name));
  assert.equal(html.includes('本户经营内容') || html.includes('我的经营报告') || html.includes('我的经营建议'), false);
  assert.equal(html.includes('商户名称'), false);
}
assert.equal(a.merchantProfile.get('missing'), null);
assert.equal(a.merchantProfile.get('__proto__'), null);
for (const denied of ['report-store.js', 'source-store.js', 'analysis-store.js', 'demo-a.js', 'demo-b.js', 'demo-c.js']) assert.equal(entry.includes(denied), false);
console.log('PASS: all 5 merchant routes including household profile; strict management-published snapshots; isolated public projection, balanced quantities, same-version references, filters, full mobile content without tables, escaping and markup structure. Node/static only.');
