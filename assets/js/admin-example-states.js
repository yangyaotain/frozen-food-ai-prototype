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
    ['week', '2026-07-27', 'published'],
    ['month', '2026-07', 'pending'], ['month', '2026-06', 'revision'], ['month', '2026-05', 'published'], ['month', '2026-04', 'approved'], ['month', '2026-03', 'published']
  ]) attempt('行情' + date, () => bulletin(kind, date, state));
  for (const merchant of app.reportData.merchants) {
    attempt(merchant.name + '经营周报', () => report(merchant.id, 'week', '2026-08-17', 'published'));
    attempt(merchant.name + '经营月报', () => report(merchant.id, 'month', '2026-05', 'published'));
  }
  for (const [merchant, kind, date, state] of [
    ['demo-a', 'week', '2026-08-24', 'revised'], ['demo-a', 'week', '2026-08-10', 'approved'], ['demo-b', 'week', '2026-08-03', 'revision'],
    ['demo-a', 'month', '2026-04', 'approved'], ['demo-b', 'month', '2026-03', 'revision'],
    ['demo-a', 'month', '2026-02', 'published'],
    ['demo-b', 'week', '2026-07-27', 'published'], ['demo-b', 'month', '2026-02', 'published'],
    ['demo-c', 'week', '2026-07-27', 'published'], ['demo-c', 'month', '2026-02', 'published']
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
    const copies = {
      policy: {
        summary: '本次资料更新明确了冷链交接记录的留存范围，收货、库内移交和出库交付均需按批次记录商品、产地、净重与交接时间。',
        highlights: ['2026年9月1日起形成的交接记录按本次资料范围整理。', '补录或重量调整需同时保留原记录、调整内容和原因。', '商品原始名称与分析品类分别留存，不用简称覆盖产地信息。'],
        content: '主要要求\n收货环节记录到货批次、原始商品名称、国产或进口属性、净重和交接时间；库内移交与出库交付沿用同一批次标识，确保前后记录可以对应。\n\n适用范围\n本次整理适用于2026年9月1日起形成的鸡副冷链交接资料。历史记录继续按原留档版本保存，新增补录不得覆盖原始重量和交接时间。\n\n执行提示\n发生退货、补录或重量调整时，应注明调整人、调整时间与原因。同一批次多次流转按实际环节留痕，不重复计为新增到货。',
        attention: '本文是对来源资料的业务整理，具体商品和批次仍需结合现行监管要求及企业制度核对，不替代正式政策文件。'
      },
      industry: state === 'paused' ? {
        summary: '来源将交付周期从自然周口径调整为合同履约周期，既有周度比较已不再适用，当前内容暂停展示并等待重新核验。',
        highlights: ['新口径按合同约定的履约起止时间统计。', '历史自然周数据不能直接与新口径形成趋势比较。'],
        content: '口径变化\n原资料以周一至周日归集交付记录，新版本改为按合同履约周期统计。同一自然周可能同时包含多个合同周期，周内次数与履约完成量不再一一对应。\n\n口径核对范围\n需要补充新旧口径的生效日期、受影响文章和可比期间，并重新整理展示稿。完成来源核对前，历史结论仅保留在版本记录中。',
        attention: '当前资料尚未完成新旧口径衔接，不用于解释渠道需求、履约效率或库存变化，也不向小程序继续展示。'
      } : {
        summary: '9月初餐饮渠道备货由集中提货转为分批交付，周内交接次数增加，但净重总量没有同步增长。',
        highlights: ['交接次数增加主要来自提货批次拆分，不等于采购需求扩大。', '判断周转变化需同时核对完整周出库和周末库存。', '市场渠道节奏与单户订单结构应分别观察。'],
        content: '事件概况\n餐饮渠道在9月初将部分集中提货拆分为多次交付，周内交接节点增加。来源记录显示，批次拆分后交付总净重保持平稳，变化主要体现在时间分布。\n\n行业影响\n分批提货可能提高短期库内操作频次，也会改变周内库存曲线。比较渠道备货时应统一周一至周日范围，并区分交接次数、交付净重和实际出库量。\n\n观察范围\n本条聚焦鸡副餐饮渠道的交接节奏，不包含客户数量、订单金额和履约成本，不据此判断整体需求增长。',
        attention: '渠道节奏只作为市场背景，商户仍需结合本户订单、库存和交付安排判断，不能把交接次数直接作为采购依据。'
      },
      market: state === 'rejected' ? {
        summary: '来源摘要列出两批水产到货数值，但没有标明重量单位、毛净重口径和批次对应关系，当前无法形成有效供需结论。',
        highlights: ['“860”和“540”两个数值缺少单位。', '批次、日期与毛净重范围均未完成对应。'],
        content: '缺失信息\n现有摘要没有说明数值单位，也未提供包装规格、交接单或实际入库日期。两个数值可能来自不同批次或不同统计范围，不能直接相加。\n\n处理要求\n需要补充原始交接记录，统一净重口径并确认统计截止日。依据补齐前，本条保留为核验不通过记录。',
        attention: '当前信息不纳入水产到货量、库存变化和价格判断，也不会进入小程序已发布资讯。'
      } : {
        summary: '2026年8月31日至9月6日，水产保持分批入库，周末库存较前周增加；流量和库存变化需按统一净重与周日截止口径阅读。',
        highlights: ['到货延续分批入库，周内没有出现单日集中入库。', '期末库存较前周增加，需结合同期出库变化判断。', '净入库反映流量关系，不单独代表后续价格方向。'],
        content: '统计范围\n本期覆盖2026年8月31日至9月6日，按已建立映射的水产商品名称归并，国产与进口属性分别留存。入库和出库采用整周累计净重，库存取9月6日周日余额。\n\n供需变化\n到货继续以分批方式进入市场，周内入库节奏相对均衡；期末库存较前周增加。库存变化同时受到本期入库、出库和盘点调整影响，不能只依据到货批次判断。\n\n口径说明\n来源观察与平台汇总分别留存。平台周均采价不是任一商户的成交价格，市场库存也不用于反推单户库存。',
        attention: '后续应继续观察连续周出库能否消化新增库存，并结合相同品类采价核对；本条不作价格预测。'
      }
    };
    const copyText = copies[type];
    row.content = copyText.summary + '\n\n' + copyText.content;
    row.displaySummary = copyText.summary;
    row.displayHighlights = copyText.highlights;
    row.displayContent = copyText.content;
    row.displayAttention = copyText.attention;
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

  // Expand the merchant feed with reviewed articles that already exist in the management workflow.
  function publishReadyNews(id, index) {
    const store = app.sourceStore, row = store.findItem(id);
    if (!row || row.publication || !store.eligible(row)) return;
    const source = store.find(row.sourceId), date = ['2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29', '2026-08-31', '2026-09-01'][index];
    const state = clone(row); delete state.history;
    row.history.push({ action: '核验通过', actor: '周明远', at: date + ' 14:10:00', opinion: '已核对来源地址、统计期间、内容摘要、核心要点、展示正文和适用品类。', sourceVersion: source.version, before: state, after: clone(state) });
    valid(store.publish(id, row.version, source.version));
    const event = row.history.slice().reverse().find(history => history.action === '资讯发布');
    Object.assign(row.publication.verification, { actor: '周明远', time: date + ' 14:10:00' });
    Object.assign(row.publication.publication, { actor: '徐悦', time: date + ' 16:30:00' });
    if (event) {
      event.actor = '徐悦'; event.at = row.publication.publication.time;
      if (event.after && event.after.publication) {
        Object.assign(event.after.publication.verification, row.publication.verification);
        Object.assign(event.after.publication.publication, row.publication.publication);
      }
    }
  }
  ['info-1', 'info-3', 'info-5', 'info-cat-prepared', 'info-cat-beef', 'info-7'].forEach((id, i) => attempt('发布补充资讯' + id, () => publishReadyNews(id, i)));

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
