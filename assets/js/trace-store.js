(function () {
  'use strict';
  const app = window.FrozenApp;
  const modules = { prices: '每周平均采价', categories: '品类映射', sources: '行业资讯 · 来源管理', news: '行业资讯 · 资讯管理', bulletins: '市场行情简报', reports: '经营报告与建议' };
  const types = { seed: '初始记录', generate: '生成', review: '确认与复核', publish: '发布', revise: '发起修订', maintain: '新增与维护', import: '批量导入', anomaly: '异常与重新核验' };
  const clone = function (value) { return JSON.parse(JSON.stringify(value)); };
  function typeOf(action) {
    if (/预置|初始/.test(action)) return 'seed';
    if (action.includes('重新核验') || action.includes('异常')) return 'anomaly';
    if (action.includes('生成')) return 'generate';
    if (action.includes('修订')) return 'revise';
    if (action.includes('发布')) return 'publish';
    if (/核验|复核|确认|退回/.test(action)) return 'review';
    if (action.includes('导入')) return 'import';
    return 'maintain';
  }
  function category(id) { const found = app.priceData.categories.find(function (c) { return c.id === id; }); return found ? found.name : (id || '未映射'); }
  function fields(module, value) {
    if (!value) return [];
    const out = [], add = function (label, text) { if (text !== undefined && text !== null) out.push([label, text === '' ? '未填写' : String(text)]); };
    const states = module === 'prices' ? app.priceData.statuses : module === 'sources' ? app.sourceData.sourceStates : module === 'news' ? app.sourceData.itemStates : null;
    add('记录版本', value.version ? 'V' + value.version : undefined);
    add('标题', value.title); add('名称', value.name);
    if (value.week) add('采价期间', value.week.id + ' 至 ' + value.week.end);
    if (value.category) add('分析品类', value.category.name);
    if (Object.prototype.hasOwnProperty.call(value, 'categoryId')) add('分析品类', category(value.categoryId));
    if (value.categories) add('适用品类', value.categories.map(category).join('、'));
    if (value.price !== undefined) add('周均价格', Number(value.price).toFixed(2) + ' ' + value.unit);
    add('备注', value.note); add('来源地址', value.url); add('信息范围', value.scope);
    if (value.collection && app.sourceCollection) {
      add('自动获取', value.collection.enabled ? '已启用' : '已关闭');
      add('获取规则', app.sourceCollection.rules[value.collection.rule] || '未配置');
      add('获取周期', app.sourceCollection.schedules[value.collection.schedule]);
      add('最近获取时间', value.collection.lastAt); add('获取结果', value.collection.lastResult);
    }
    add('获取时间', value.obtainedAt); add('获取批次', value.collectionBatchId);
    if (value.type) add(module === 'news' ? '资讯分类' : '默认资讯分类', app.sourceData.types[value.type]);
    if (states && value.status) add('状态', states[value.status].name);
    add('原文发布时间', value.publishedAt); add('内容', value.content); add('异常标识', value.abnormal || (module === 'news' ? '无' : undefined));
    add('处理方式', ({ updated: '更新为现行信息', corrected: '统一口径或核实来源', unresolved: '尚未解决' })[value.treatment]); add('展示标题', value.displayTitle); add('展示正文', value.displayContent); add('有效截止', value.validThrough); add('问题处理依据', value.resolution); add('摘要', value.summary); add('分析与信号', value.signals); add('经营建议', value.advice);
    if (value.batchId) add('导入批次', value.batchId);
    if (module === 'news') {
      add('核验依据来源版本', value.verifiedSourceVersion ? 'V' + value.verifiedSourceVersion : '本次无通过结论');
      add('资讯发布状态', value.publication ? '已发布 V' + value.publication.publication.version : '本次未发布或已暂停');
      if (value.publication) add('平台发布', value.publication.publication.actor + ' · ' + value.publication.publication.time);
    }
    return out;
  }
  function evidence(module, row, log) {
    const out = [];
    if (log.collectionBatch) {
      const batch = log.collectionBatch;
      out.push('获取批次：' + batch.id + ' · ' + batch.trigger + ' · 第 ' + batch.attempt + ' 次尝试');
      out.push('执行来源：V' + batch.sourceVersion + ' · ' + batch.sourceUrl + ' · 获取配置 V' + batch.configRevision);
    }
    if (row.snapshot) {
      const data = row.snapshot;
      if (data.quality) { out.push('质量报告：' + data.quality.id + ' · ' + data.quality.rule); data.quality.batches.forEach(function (b) { out.push('数量批次：' + b.id + ' / V' + b.version); }); data.quality.checks.forEach(function (c) { out.push('数据排除：' + c.text); }); }
      if (data.safety) out.push('汇总发布检查：' + data.safety.reason);
      out.push(data.sourceNote, '规则版本：' + data.ruleVersion, '原始生成时间：' + row.generatedAt);
      const prices = module === 'bulletins' ? data.provenance.prices : data.categories.flatMap(function (c) { return c.market.prices.map(function (p) { return Object.assign({ category: c.name }, p); }); });
      prices.forEach(function (p) { out.push('采价 ' + p.id + ' / V' + p.version + ' · ' + p.week + ' · ' + p.category + ' · ' + p.price.toFixed(2) + ' 元/吨'); });
      const mappings = module === 'bulletins' ? data.provenance.mappings : data.rows.map(function (r) { return { id: r.rawId, version: r.mappingVersion, name: r.name, categoryId: r.categoryId }; });
      mappings.forEach(function (m) { out.push('映射 ' + m.id + ' / V' + m.version + ' · ' + m.name + ' → ' + category(m.categoryId)); });
      data.references.forEach(function (r) { out.push('外部信息：' + (r.id || '旧版本未记录编码') + ' / ' + (r.sourceId || '旧来源') + ' · ' + (r.sourceUrl || '旧版本未记录地址') + ' · ' + r.title + ' · 信息 V' + r.infoVersion + ' · ' + r.sourceName + ' / V' + r.sourceVersion + ' · 原文发布 ' + r.publishedAt); });
      if (!data.references.length) out.push('本期未引用匹配的已核验外部信息。');
      if (data.bulletins) data.bulletins.forEach(function (b) { out.push('引用简报：' + b.title + ' / V' + b.version + ' · ' + b.start + ' 至 ' + b.end); });
    } else if (module === 'news') {
      const value = log.after, original = value.sourceSnapshot;
      out.push('原文来源留档：' + original.name + ' / V' + original.version + ' · ' + original.url);
      if (log.sourceVersion) {
        const source = app.sourceStore.find(row.sourceId);
        const saved = source.history.slice().reverse().find(function (h) { return h.after.version === log.sourceVersion; });
        out.push('本次核验/发布依据：来源 V' + log.sourceVersion + (saved ? ' · ' + saved.after.name + ' · ' + saved.after.url : '（来源详细留档不可用）'));
      }
    } else if (module === 'prices') {
      const batchId = log.after.batchId, batch = app.priceStore.batches.find(function (b) { return b.id === batchId; });
      if (batch) { const item = batch.items.find(function (i) { return i.record.id === row.id; }); out.push('导入文件：' + batch.filename + ' · 批次 ' + batch.id + (item ? ' · 文件第 ' + item.line + ' 行' : '')); }
    }
    return out.filter(Boolean);
  }
  function list() {
    const rows = [];
    function collect(module, record) {
      record.history.forEach(function (log, index) {
        const value = log.after || record, version = value.version || log.version || record.version;
        const title = value.title || record.title || record.name || (value.category.name + '每周平均采价');
        const period = module === 'prices' ? value.week.id + ' 至 ' + value.week.end : record.start ? record.start + ' 至 ' + record.end : module === 'news' ? '原文发布于 ' + value.publishedAt : '来源或映射资料，不按业务期间统计';
        rows.push({ id: module + ':' + record.id + ':' + (record.start ? record.version : 'record') + ':' + index,
          module: module, objectId: record.id, title: title, version: version, order: index, type: typeOf(log.action), action: log.action,
          actor: log.actor, time: log.time || log.at, period: period, merchant: record.merchant ? record.merchant.name : '',
          opinion: log.opinion || (log.after && log.after.note) || '本次未填写操作说明。',
          before: fields(module, log.before), after: fields(module, log.after), evidence: evidence(module, record, log),
          linked: module === 'bulletins' || module === 'reports' });
      });
    }
    app.priceStore.records.forEach(function (r) { collect('prices', r); });
    app.categoryStore.records.forEach(function (r) { collect('categories', r); });
    app.sourceStore.sources.forEach(function (r) { collect('sources', r); });
    app.sourceStore.items.forEach(function (r) { collect('news', r); });
    ['bulletins', 'reports'].forEach(function (module) {
      const store = module === 'bulletins' ? app.bulletinStore : app.reportStore;
      store.list().forEach(function (r) { store.versions(r.id).forEach(function (v) { collect(module, v); }); });
    });
    return clone(rows.sort(function (a, b) { return b.time.localeCompare(a.time) || (a.module === b.module && a.objectId === b.objectId ? b.version - a.version || b.order - a.order : a.id.localeCompare(b.id)); }));
  }
  function dateValid(value) { const date = new Date(value + 'T00:00:00Z'); return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; }
  function query(filters) {
    if ((filters.from && !dateValid(filters.from)) || (filters.to && !dateValid(filters.to))) return { rows: [], error: '请输入有效的操作日期。' };
    if (filters.from && filters.to && filters.from > filters.to) return { rows: [], error: '操作起始日期不能晚于结束日期。' };
    const keyword = String(filters.keyword || '').trim().toLowerCase();
    return { error: '', rows: list().filter(function (r) {
      return (!filters.from || r.time.slice(0, 10) >= filters.from) && (!filters.to || r.time.slice(0, 10) <= filters.to) &&
        (!filters.module || r.module === filters.module) && (!filters.type || r.type === filters.type) &&
        (!keyword || (app.presentation ? app.presentation.matches([r.title, r.objectId, r.merchant, r.actor].join(' '), keyword) : [r.title, r.objectId, r.merchant, r.actor].join(' ').toLowerCase().includes(keyword)));
    }) };
  }
  function linked(row) { const store = row.module === 'bulletins' ? app.bulletinStore : row.module === 'reports' ? app.reportStore : null; return store ? store.get(row.objectId, row.version) : null; }
  app.traceData = { modules: modules, types: types, list: list, query: query, linked: linked };
}());
