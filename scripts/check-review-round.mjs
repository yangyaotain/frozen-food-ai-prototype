import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const clone = x => JSON.parse(JSON.stringify(x));
function load(cache = new Map(), mode = 'admin') {
  const context = { window: { localStorage: { getItem:k=>cache.get(k)??null,setItem:(k,v)=>cache.set(k,v) }, location:{ search:'',hash:'' } }, URL, URLSearchParams };
  for (const m of fs.readFileSync(new URL('../'+mode+'/index.html',import.meta.url),'utf8').matchAll(/<script defer src="..\/assets\/js\/([^"]+)"><\/script>/g)) if(m[1]!=='shell.js') vm.runInNewContext(fs.readFileSync(new URL('../assets/js/'+m[1],import.meta.url),'utf8'),context,{filename:m[1]});
  return context.window.FrozenApp;
}
const a=load(), seed=a.bulletinStore.list()[0], original=JSON.stringify(seed);
// E01: same-period fresh data version; review gates, old publication, stale request and atomic failure.
const price=a.priceStore.records.find(r=>r.week.id===seed.start&&r.category.id==='pork'), changedPrice=price.price+100;
assert.equal(a.priceStore.save({start:price.week.id,category:price.category.id,price:String(changedPrice),unit:price.unit,note:'纠正后重新生成'},price.id).valid,true);
assert.equal(a.priceStore.review(price.id,'reviewed','核对修正价格').valid,true);
const b=a.bulletinStore.regenerate(seed.id,1);
assert.equal(b.snapshot.categories.find(c=>c.id==='pork').totals.price,changedPrice);
assert.equal(b.version,2); assert.equal(b.start,seed.start); assert.equal(b.status,'pending');
assert.equal(JSON.stringify(a.bulletinStore.get(seed.id,1)),original);
assert.equal(a.bulletinStore.published().find(r=>r.id===seed.id).version,1);
assert.throws(()=>a.bulletinStore.publish(b.id,2),/尚未复核/);
assert.throws(()=>a.bulletinStore.regenerate(seed.id,1),/版本已变化/);
a.bulletinStore.review(b.id,2,'approved','重新核对本期新快照');a.bulletinStore.publish(b.id,2);
assert.equal(a.bulletinStore.published().find(r=>r.id===seed.id).version,2);
const old=clone(seed);delete old.snapshot.safety;
const migrated=load(new Map([['frozen-admin-bulletins-v1',JSON.stringify({schema:1,records:[old]})]]));
assert.equal(migrated.bulletinStore.published().length,0);
const replacement=migrated.bulletinStore.regenerate(old.id,1);
assert.ok(replacement.snapshot.safety && replacement.snapshot.quality.details.length);
migrated.bulletinStore.review(old.id,2,'approved','旧版本同期间重新核对');migrated.bulletinStore.publish(old.id,2);
assert.equal(migrated.bulletinStore.published()[0].version,2);
let report=a.reportStore.list()[0]; const originalReport=JSON.stringify(report);
const nextReport=a.reportStore.regenerate(report.id,1,report.revision);
assert.equal(nextReport.version,2); assert.equal(nextReport.status,'pending');
assert.equal(JSON.stringify(a.reportStore.get(report.id,1)),originalReport);
assert.throws(()=>a.reportStore.regenerate(report.id,1,report.revision),/报告已变化/);
const faulty=a.reportStore.generate({merchant:'demo-a',end:'2026-06-22',count:1});
a.analysisStore.setScenario('duplicate'); const historyLength=a.reportStore.versions(faulty.id).length;
assert.throws(()=>a.reportStore.regenerate(faulty.id,1,faulty.revision),/质量/);
assert.equal(a.reportStore.versions(faulty.id).length,historyLength);a.analysisStore.setScenario('normal');
a.access.end();assert.throws(()=>a.bulletinStore.regenerate(b.id,2),/无权/);a.access.start();
// E02/E03: stale body cannot be released by only extending date; unchanged saves are truly inert.
const s=a.sourceStore,i=s.findItem('info-2');
let input={title:i.displayTitle,content:i.displayContent,resolution:'补充当前依据',until:'2026-09-30',treatment:'updated'};
assert.equal(s.editDisplay(i.id,i.version,input).valid,true);
assert.equal(s.verify(i.id,i.version,'verified','核对',true).valid,false);
input={...input,title:'当前水产交接记录观察',content:'虚构样例：经核对，当前水产交接记录关注名称、产地和重量，原阶段性安排已停止适用，本稿仅说明当前资料核对范围。'};
assert.equal(s.editDisplay(i.id,i.version,input).valid,true);
assert.equal(s.verify(i.id,i.version,'verified','核对').valid,false);
assert.equal(s.verify(i.id,i.version,'verified','核对当前有效依据与展示稿',true).valid,true);
assert.equal(s.publish(i.id,i.version,s.find(i.sourceId).version).valid,true);
const frozenItem=JSON.stringify(i);
assert.equal(s.editDisplay(i.id,i.version,input).unchanged,true);assert.equal(JSON.stringify(i),frozenItem);
input={...input,content:input.content+' 对比补充记录。'};
assert.equal(s.editDisplay(i.id,i.version,input).valid,true);assert.equal(i.publication,null);assert.equal(i.status,'pending');
for(const id of ['info-4','info-6']) { const item=s.findItem(id); assert.equal(s.editDisplay(id,item.version,{title:item.title,content:item.content,resolution:'已核对',until:'2026-09-30',treatment:'corrected'}).valid,true); assert.equal(s.verify(id,item.version,'verified','核对',true).valid,false); }
const normal=s.findItem('info-1');s.publish(normal.id,normal.version,s.find(normal.sourceId).version);
const normalBefore=JSON.stringify(normal);assert.equal(s.editDisplay(normal.id,normal.version,{title:normal.displayTitle,content:normal.displayContent,resolution:'',until:normal.validThrough}).unchanged,true);assert.equal(JSON.stringify(normal),normalBefore);
// E04: cyclic months, flat/weak/tied values and missing data.
const seasonal=fn=>a.analysisInsights.seasonal({weekly:w=>({price:fn(w),complete:true})},'2026-08-24','pork').text;
assert.match(seasonal(w=>Number(w.slice(5,7))===(w.startsWith('2024')?12:1)?200:100),/高位月份接近/);
assert.match(seasonal(()=>100),/价格平稳/);
assert.match(seasonal(w=>Number(w.slice(5,7))===1?101:100),/波动较小/);
assert.match(seasonal(w=>[1,2].includes(Number(w.slice(5,7)))?200:100),/并列/);
assert.match(seasonal(w=>Number(w.slice(5,7))===(w.startsWith('2024')?1:7)?200:100),/未形成一致/);
assert.match(seasonal(()=>null),/不完整/);
// E05: multiple concerns and structure baselines survive merchant projection.
// Keep the original four-week concern scenario explicit; default reports now use calendar periods.
let c=a.reportStore.generate({merchant:'demo-c',end:'2026-08-24',count:4});const pork=c.snapshot.categories.find(c=>c.id==='pork');
assert.ok(pork.share>50 && pork.change.outbound.value>5);assert.match(c.advice,/出库较上期改善/);assert.match(c.advice,/库存集中/);assert.match(c.advice,/个百分点/);
c=a.reportStore.review(c.id,c.version,c.revision,'approved','共同核对',{report:true,advice:true});c=a.reportStore.publish(c.id,c.version,c.revision);
const client=load(new Map(),'merchant'), pub=client.reportClient.project(a.reportStore.publishedFor(c.merchant.id).find(r=>r.id===c.id));
assert.equal(pub.snapshot.categories.find(c=>c.id==='pork').change.priorShare,pork.change.priorShare);
assert.equal(pub.snapshot.quality,undefined);
// E06/E08: original-week facts reconstruct applied quantities; month math has independent calendar checks.
const m=a.bulletinStore.generate({kind:'month',date:'2026-08',categories:['pork']});
const cat=m.snapshot.categories[0], round=n=>Math.round(n*100)/100;
assert.equal(round(m.snapshot.quality.applied.reduce((sum,r)=>sum+r.inbound,0)),cat.totals.inbound);
assert.equal(round(m.snapshot.quality.applied.reduce((sum,r)=>sum+r.outbound,0)),cat.totals.outbound);
assert.equal(m.snapshot.quality.applied.at(-1).closing,cat.totals.closing);
for (const week of m.snapshot.quality.batches) {
  const source=m.snapshot.quality.details.filter(r=>r.week===week.week);
  const actual=a.analysisStore.weekly(week.week,'pork');
  assert.equal(round(source.reduce((n,r)=>n+r.inbound,0)),round(actual.inbound));
}
assert.equal(nextReport.snapshot.quality.ownDetails.filter(r=>r.usage==='本期').length,nextReport.snapshot.rows.length * nextReport.count);
const frozenQuality=JSON.stringify(m.snapshot.quality);a.analysisStore.setScenario('zero');assert.equal(JSON.stringify(a.bulletinStore.get(m.id,1).snapshot.quality),frozenQuality);a.analysisStore.setScenario('normal');
assert.equal(cat.monthly.previous.start,'2026-07-01');assert.equal(cat.monthly.previous.end,'2026-07-31');assert.equal(cat.monthly.year.start,'2025-08-01');
assert.equal(a.periodInsights.range('2024-03',-1).end,'2024-02-29');assert.equal(a.periodInsights.range('2026-01',-1).start,'2025-12-01');
const fake={weekly:()=>({price:100,complete:true,inbound:7,outbound:0,closing:107,rows:[],prices:[]})};
const feb=a.periodInsights.collect(fake,{start:'2024-02-01',end:'2024-02-29'},'pork');assert.equal(feb.days,29);assert.equal(feb.totals.inbound,29);assert.equal(feb.totals.price,100);
const missing=a.periodInsights.collect({weekly:()=>({price:null,complete:false,rows:[],prices:[]})},{start:'2026-02-01',end:'2026-02-28'},'pork');assert.equal(missing.totals.inbound,null);assert.ok(missing.missing.length);
let july=a.bulletinStore.generate({kind:'month',date:'2026-07',categories:['pork']});assert.equal(july.snapshot.safety.allowed,false);
july=a.bulletinStore.review(july.id,1,'approved','核对');assert.throws(()=>a.bulletinStore.publish(july.id,1),/对照期间/);
let mp=a.bulletinStore.review(m.id,1,'approved','月度口径核对');mp=a.bulletinStore.publish(m.id,1);
const projected=a.marketData.project(mp);assert.equal(projected.snapshot.categories[0].monthly.previous.evidence,undefined);assert.equal(projected.snapshot.quality,undefined);
assert.equal(projected.snapshot.categories[0].monthly.previous.totals.inbound,cat.monthly.previous.totals.inbound);
const reference={id:'info-test',title:'方向核对样例',categories:['pork'],context:'核对出库方向。',signal:{start:'2026-08-24',end:'2026-08-30',metric:'outbound',direction:'up'}};
assert.match(a.periodInsights.background([reference],'pork',{outbound:20},{outbound:10},'2026-08-24','2026-08-30'),/数据一致/);
assert.match(a.periodInsights.background([reference],'pork',{outbound:5},{outbound:10},'2026-08-24','2026-08-30'),/不一致/);
assert.match(a.periodInsights.background([reference],'pork',{outbound:5},{outbound:10},'2026-08-01','2026-08-31'),/没有可直接比较/);
assert.match(a.periodInsights.background([],'pork',{},null,'2026-08-01','2026-08-31'),/依据不足/);
// E07: admin restriction labels and minimal public availability do not contain hidden content.
assert.equal(a.publicationPolicy.visibility(old,null),'旧版待重新检查');assert.equal(a.publicationPolicy.visibility(july,null),'限制展示');assert.match(a.publicationPolicy.visibility(b,seed),/V1/);
const availability=a.publicationPolicy.availability([old,july,b]);assert.equal(availability.legacy,true);assert.equal(availability.restricted,true);assert.deepEqual(Object.keys(availability).sort(),['legacy','restricted','unpublished']);
const oldPublic=clone(projected);delete oldPublic.snapshot.safety;
const cached=load(new Map([['frozen-market-published-v1',JSON.stringify([oldPublic,projected])]]),'merchant');assert.equal(cached.marketData.readInfo().state,'legacy');assert.equal(cached.marketData.readInfo().records.length,1);
// Static markup is still not a browser test.
for(const html of [a.bulletinView.render(mp),client.bulletinView.render(projected),a.reportView.render(c),client.reportView.render(pub,'advice')]) {
  assert.equal(/undefined|NaN/.test(html),false);const stack=[];
  for(const t of html.matchAll(/<\/?([a-z][\w-]*)\b[^>]*>/gi)) { if(t[0].startsWith('</'))assert.equal(stack.pop(),t[1]);else if(!['input','br','hr','img'].includes(t[1])&&!t[0].endsWith('/>'))stack.push(t[1]); }
  assert.equal(stack.length,0);
}
assert.ok(a.traceData.query({type:'generate'}).rows.some(r=>r.action.includes('重新生成')));
console.log('PASS E01-E08: regeneration/legacy migration, no-op and resolved-info review, seasonal boundaries, simultaneous merchant concerns, immutable quantity evidence, month comparisons and privacy bases, source alignment, availability/cache states and public whitelist. Node/static only.');
