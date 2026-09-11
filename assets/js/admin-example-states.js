(function () {
  'use strict';
  const app = window.FrozenApp;
  if (app.exampleStateCoverage) return;
  const coverage = app.exampleStateCoverage = { version: 1, errors: [] };
  const clone = value => JSON.parse(JSON.stringify(value));
  const bulletinSeeds = new Set(app.bulletinStore.list().filter(row => row.history.every(history => /初始/.test(history.action))).map(row => row.id));
  const reportSeeds = new Set(app.reportStore.list().filter(row => row.history.every(history => /初始/.test(history.action))).map(row => row.id));
  function attempt(name, action) {
    try { action(); } catch (error) { coverage.errors.push(name + '：' + error.message); }
  }
  function valid(result) { if (!result.valid) throw new Error(result.message || JSON.stringify(result.errors)); return result; }
  // Upgrade only untouched initial drafts. User edits, reviews and every previous version remain intact.
  function untouched(row) { return row.status === 'pending' && row.version === 1 && row.history.every(h => /初始/.test(h.action)); }
  function bulletin(kind, date, state) {
    const store = app.bulletinStore, start = date + (kind === 'month' ? '-01' : '');
    let row = store.list().find(r => r.kind === kind && r.start === start);
    if (row && !untouched(row)) return;
    if (!row) row = store.generate({ kind, date, categories: app.categoryCatalog.ids() });
    bulletinSeeds.add(row.id);
    if (state === 'pending') return;
    if (['published', 'revised'].includes(state)) app.publicationPolicy.requireAllowed(row);
    row = store.review(row.id, row.version, state === 'revision' ? 'revision' : 'approved', state === 'revision' ? '请补充净入库与期末库存变化的区别，核对比较期间后重新提交。' : '已核对完整统计期间、各品类量价、引用依据及经营参考边界。');
    if (['published', 'revised'].includes(state)) {
      row = store.publish(row.id, row.version);
      if (state === 'revised') store.revise(row.id, row.version);
    }
  }
  function report(merchant, kind, date, state) {
    const store = app.reportStore, start = date + (kind === 'month' ? '-01' : '');
    let row = store.list().find(r => r.merchant.id === merchant && r.kind === kind && r.start === start);
    if (row && !untouched(row)) return;
    if (!row) row = store.generate({ merchant, kind, date });
    reportSeeds.add(row.id);
    if (state === 'pending') return;
    if (['published', 'revised'].includes(state)) app.publicationPolicy.requireAllowed(row);
    row = store.review(row.id, row.version, row.revision, state === 'revision' ? 'revision' : 'approved', state === 'revision' ? '请补充本户库存周转变化原因，经营建议应明确适用期间和对应品类。' : '已共同核对本户数据期间、周转计算、建议依据与发布范围。', { report: true, advice: true });
    if (['published', 'revised'].includes(state)) {
      row = store.publish(row.id, row.version, row.revision);
      if (state === 'revised') store.revise(row.id, row.version, row.revision);
    }
  }
  for (const [kind, date, state] of [
    ['week', '2026-08-17', 'revised'], ['week', '2026-08-10', 'revision'], ['week', '2026-08-03', 'approved'],
    ['month', '2026-07', 'pending'], ['month', '2026-06', 'revision'], ['month', '2026-05', 'published'], ['month', '2026-04', 'approved']
  ]) attempt('行情' + date, () => bulletin(kind, date, state));
  for (const merchant of app.reportData.merchants) {
    attempt(merchant.name + '经营周报', () => report(merchant.id, 'week', '2026-08-17', 'published'));
    attempt(merchant.name + '经营月报', () => report(merchant.id, 'month', '2026-05', 'published'));
  }
  for (const [merchant, kind, date, state] of [
    ['demo-a', 'week', '2026-08-24', 'revised'], ['demo-a', 'week', '2026-08-10', 'approved'], ['demo-b', 'week', '2026-08-03', 'revision'],
    ['demo-a', 'month', '2026-04', 'approved'], ['demo-b', 'month', '2026-03', 'revision']
  ]) attempt('经营' + merchant + date, () => report(merchant, kind, date, state));

  // New articles use the existing verification/publication workflow and leave existing source evidence unchanged.
  function news(type, state, index) {
    const store = app.sourceStore, source = store.sources.find(s => s.type === type && s.status === 'confirmed');
    const base = store.items.find(i => i.sourceId === source.id && store.eligible(i));
    const row = clone(base), id = 'info-state-' + state + '-' + type;
    if (store.findItem(id)) return;
    const titles = {
      policy: { published: '冷链交接单据留存要求更新' },
      industry: { published: '餐饮渠道分批备货节奏观察', paused: '冻品渠道交付周期口径调整' },
      market: { published: '第36周水产到货与库存变化', rejected: '水产到货重量摘要待补充单位' }
    };
    const publishedAt = ['2026-09-02 10:20:00', '2026-09-04 14:10:00', '2026-09-06 16:30:00', '2026-09-05 11:40:00', '2026-09-06 09:25:00'][index];
    const validThrough = type === 'policy' ? '2026-12-31' : type === 'market' && state === 'published' ? '2026-09-13' : '2026-09-30';
    const title = titles[type][state];
    Object.assign(row, { id, title, displayTitle: title, infoUrl: source.url + 'articles/' + id + '.html',
      publishedAt, validThrough,
      status: 'pending', version: 1, verifiedSourceVersion: null, publication: null, releaseVersion: 0,
      abnormal: '', issueType: '', resolution: '', history: [], signal: null });
    row.content = row.displayContent = ({
      policy: '本次资料更新适用于2026年9月1日起形成的冷链交接记录。收货、库内移交和出库交付应分别记录批次、商品名称、产地、净重及交接时间；发生补录或重量调整时，同时留存原记录和调整原因。',
      industry: state === 'paused' ? '来源将原“按自然周统计交付周期”调整为“按合同履约周期统计”，历史文章中的周度比较口径不再适用。当前内容暂停展示，待补充新旧口径差异及受影响期间后重新核验。' : '9月初餐饮渠道备货由集中提货转为分批交付，周内交接次数增加，但净重总量未同步增长。观察周转变化时应结合完整周出库和期末库存，不能把交付次数直接解释为需求增加。',
      market: state === 'rejected' ? '来源摘要记录两批水产到货，但只列示“860”和“540”两个数值，未注明单位、毛净重口径及批次对应关系。补齐原始交接记录前，不纳入到货量和库存变化判断。' : '2026年8月31日至9月6日，水产到货保持分批入库，周末库存较前周增加。对比入库、出库与期末库存时统一采用净重和周日截止口径；净入库变化只反映流量关系，不单独推断后续价格。'
    })[type];
    row.context = '按本条完整周期间及来源适用品类核对，不将市场汇总直接用于本户采购决策。';
    delete row.platformFacts;
    row.history.push({ action: '新增资讯', actor: '沈佳宁', at: row.publishedAt, opinion: '已登记原始出处、期间和展示稿，等待逐篇核验。', before: null, after: { ...clone(row), history: undefined } });
    store.items.unshift(row);
    if (state === 'rejected') {
      row.abnormal = '原始材料未注明重量单位，无法核实统计口径。';
      valid(store.verify(id, row.version, 'rejected', row.abnormal));
    } else {
      valid(store.verify(id, row.version, 'verified', '已逐项核对原始出处、统计期间及整理稿。', true));
      valid(store.publish(id, row.version, source.version));
      if (state === 'paused') valid(store.flag(id, row.version, '原始来源修订了统计口径，暂停展示并重新核验。'));
    }
    const offsets = ['10:20:00', '14:10:00', '16:30:00', '09:15:00'];
    row.history.forEach((history, historyIndex) => {
      history.actor = /核验/.test(history.action) ? '周明远' : /发布/.test(history.action) ? '徐悦' : /异常/.test(history.action) ? '沈佳宁' : history.actor;
      if (historyIndex > 0) history.at = app.priceData.dateAfter(row.publishedAt.slice(0, 10), historyIndex > 2 ? 2 : 1) + ' ' + offsets[historyIndex];
    });
    if (row.publication) {
      const verified = row.history.find(history => history.action === '核验通过');
      const published = row.history.find(history => history.action === '资讯发布');
      if (verified) Object.assign(row.publication.verification, { actor: verified.actor, time: verified.at });
      if (published) Object.assign(row.publication.publication, { actor: published.actor, time: published.at });
    }
  }
  [['policy', 'published'], ['industry', 'published'], ['market', 'published'], ['industry', 'paused'], ['market', 'rejected']].forEach(([type, state], i) => attempt('资讯' + type + state, () => news(type, state, i)));

  // Collection history is stored on its source, so the existing record dialog and trace share one history.
  const confirmed = app.sourceStore.sources.filter(s => s.status === 'confirmed');
  ['success', 'retry', 'error', 'manual', 'unconfigured'].forEach((state, i) => attempt('资讯获取' + state, () => {
    const source = confirmed[i], c = app.collectionStore.config(source), before = clone(source);
    delete before.history;
    if (state === 'unconfigured') { Object.assign(c, { rule: '', enabled: false, nextAt: 0, retryAt: 0 }); return; }
    const time = state === 'retry' ? app.sourceCollection.stamp(Date.now()) : ['2026-09-10 09:00:00', '', '2026-09-10 14:30:00', '2026-09-11 08:45:00'][i] || '2026-09-10 09:00:00', ms = Date.parse(time.replace(' ', 'T') + '+08:00');
    const failed = ['retry', 'error'].includes(state), error = state === 'error' ? '栏目地址返回内容格式不符，请核对获取规则后重试。' : '来源响应超时，5分钟后自动重试。';
    Object.assign(c, { status: state === 'manual' ? 'success' : state, enabled: state !== 'manual', running: false,
      lastAt: time, lastSuccessAt: failed ? '' : time, lastResult: failed ? error : '获取成功 · 新增 0，更新 0，重复 2，失败 0',
      attempt: state === 'error' ? 3 : failed ? 1 : 0, retryAt: state === 'retry' ? Date.now() + 5 * 60000 : 0 });
    if (state === 'error' || state === 'manual') c.nextAt = 0;
    const batch = { id: 'GET-state-' + source.id, trigger: '定期获取', sourceVersion: source.version, sourceUrl: source.url,
      configRevision: c.revision, rule: c.rule, from: ms - 86400000, to: ms, added: 0, updated: 0,
      duplicate: failed ? 0 : 2, skipped: 0, failed: failed ? 1 : 0, errors: failed ? [error] : [], attempt: failed ? c.attempt : 1 };
    const after = clone(source); delete after.history;
    source.history.push({ action: failed ? '资讯获取异常' : '完成资讯获取', actor: '系统', at: time, opinion: c.lastResult, before, after, collectionBatch: batch });
  }));
  attempt('品类映射历史', () => {
    const row = app.categoryStore.find('raw-002');
    valid(app.categoryStore.save(row.id, { categoryId: row.categoryId, note: '已按商品名称及净重口径核对，归入鸡副。' }, row.version));
  });
  attempt('采价导入历史', () => {
    const row = app.priceStore.records.find(r => r.week.id === '2026-08-31' && r.category.id === 'poultry');
    if (!row.history.every(h => /初始/.test(h.action))) return;
    row.batchId = 'IMP-state-20260831';
    const after = clone(row); delete after.history;
    row.history = [{ action: '导入采价', actor: '沈佳宁', at: row.updatedAt, opinion: '批次导入本周鸡副采价，价格与单位等待复核。', before: null, after }];
    app.priceStore.batches.push({ id: row.batchId, filename: '2026年8月31日周均采价.csv', at: row.updatedAt, actor: '沈佳宁', items: [{ line: 2, record: after }] });
  });
  bulletinSeeds.forEach(id => {
    const row = app.bulletinStore.versions(id)[0];
    if (row) app.bulletinStore.applyExampleTimeline(id, app.priceData.dateAfter(row.end, 1) + ' 09:00:00');
  });
  reportSeeds.forEach(id => {
    const row = app.reportStore.versions(id)[0];
    if (row) app.reportStore.applyExampleTimeline(id, app.priceData.dateAfter(row.end, 1) + ' 09:05:00');
  });
}());
