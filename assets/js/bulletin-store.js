(function () {
  'use strict';
  const app = window.FrozenApp;
  const actorName = function (fallback) { return app.actor ? app.actor(fallback) : fallback; };
  const after = app.priceData.dateAfter;
  const clone = function (value) { return JSON.parse(JSON.stringify(value)); };
  const now = function () { return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }); };
  const states = { pending: { name: '待复核', style: 'warning' }, revision: { name: '需修改', style: 'danger' },
    approved: { name: '待发布', style: 'success' }, published: { name: '已发布', style: 'success' } };
  function period(input) {
    if (input.kind === 'week' && app.analysisData.validMonday(input.date)) return { start: input.date, end: after(input.date, 6) };
    if (input.kind === 'month' && /^(19\d{2}|20\d{2})-(0[1-9]|1[0-2])$/.test(input.date) && input.date >= '1901-01') {
      const date = new Date(input.date + '-01T00:00:00Z');
      date.setUTCMonth(date.getUTCMonth() + 1);
      return { start: input.date + '-01', end: after(date.toISOString().slice(0, 10), -1) };
    }
    throw new Error('请选择有效的周一或自然月，支持 1901–2099 年。');
  }
  // 数量先换算为 0.01 吨整数，再均分至七天；余数留在周日，保持周合计精确一致。
  function dayPart(total, index) {
    const cents = Math.round(total * 100), base = Math.floor(cents / 7);
    return (index === 6 ? cents - base * 6 : base) / 100;
  }
  const round = function (number) { return Math.round((number + Number.EPSILON) * 100) / 100; };
  function textLimits(row) { const count = row.snapshot.categories.length; return { title: 100, summary: Math.max(3000, count * 400), signals: Math.max(4000, count * 1600) }; }
  function createStore(analysis, prices, mappings, sources, options) {
    options = options || {};
    let records = [];
    let storageAvailable = Boolean(options.storage);
    const storageKey = 'frozen-admin-bulletins-v1';
    function find(id, version) { return records.find(function (row) { return row.id === id && row.version === Number(version); }); }
    function latest(id) { return records.filter(function (row) { return row.id === id; }).sort(function (a, b) { return b.version - a.version; })[0]; }
    function list() { return records.filter(function (row) { return latest(row.id) === row; }).map(clone); }
    function published() {
      const byId = new Map();
      records.filter(function (row) { return row.status === 'published'; }).forEach(function (row) {
        if (!byId.has(row.id) || byId.get(row.id).version < row.version) byId.set(row.id, row);
      });
      return Array.from(byId.values()).map(app.marketData.project).filter(Boolean);
    }
    function persist() {
      if (!options.storage) return;
      try { options.storage.setItem(storageKey, JSON.stringify({ schema: 1, records: records })); storageAvailable = true; }
      catch (_) { storageAvailable = false; }
      if (options.onPublish) options.onPublish(published());
    }
    function event(row, action, opinion, actor) {
      row.updatedAt = now();
      row.history.push({ action: action, opinion: opinion, actor: actor === '系统' ? '系统' : actorName(actor || '管理员'), time: row.updatedAt, version: row.version });
    }
    function snapshot(input, range) {
      const ids = input.categories;
      if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length || ids.some(function (id) { return !app.analysisData.categories.some(function (c) { return c.id === id; }); })) throw new Error('请至少选择一个有效分析品类。');
      const missing = [];
      const usedWeeks = new Set();
      const categories = ids.map(function (id) {
        const category = app.analysisData.categories.find(function (c) { return c.id === id; });
        const groups = new Map();
        for (let day = range.start; day <= range.end; day = after(day, 1)) {
          const index = (new Date(day + 'T00:00:00Z').getUTCDay() + 6) % 7;
          const week = after(day, -index);
          usedWeeks.add(week);
          let group = groups.get(week);
          if (!group) {
            const value = analysis.weekly(week, id);
            group = { start: day, end: day, week: week, price: value.price, inbound: 0, outbound: 0, closing: null, days: 0, value: value };
            groups.set(week, group);
            if (!value.complete || value.price == null) missing.push(category.name + ' · ' + week + '：' + (!value.complete ? '数量数据不足' : value.priceReason));
          }
          group.end = day; group.days++;
          if (!group.value.complete) continue;
          group.inbound += dayPart(group.value.inbound, index);
          group.outbound += dayPart(group.value.outbound, index);
          const opening = group.value.closing - group.value.inbound + group.value.outbound;
          let net = 0;
          for (let i = 0; i <= index; i++) net += dayPart(group.value.inbound, i) - dayPart(group.value.outbound, i);
          group.closing = round(opening + net);
        }
        const series = Array.from(groups.values()).map(function (g) { return { start: g.start, end: g.end, price: g.price, inbound: round(g.inbound), outbound: round(g.outbound), closing: g.closing, days: g.days }; });
        const days = series.reduce(function (n, r) { return n + r.days; }, 0);
        const sum = function (key) { return round(series.reduce(function (n, r) { return n + r[key]; }, 0)); };
        const totals = { price: round(series.reduce(function (n, r) { return n + r.price * r.days; }, 0) / days), inbound: sum('inbound'), outbound: sum('outbound'), closing: series[series.length - 1].closing };
        const anomalies = [];
        groups.forEach(function (g) {
          if (app.analysisInsights) { const base = analysis.weekly(after(g.week, -7), id); ['inbound', 'outbound', 'closing'].forEach(function (k) { const delta = app.analysisData.compare(g.value[k], base[k]); if (delta.value != null && Math.abs(delta.value) >= 20) anomalies.push(g.week + ' ' + ({ inbound: '入库', outbound: '出库', closing: '库存' })[k] + '周环比' + delta.value.toFixed(2) + '%，达到20%关注条件。'); }); }
          const prior = analysis.weekly(after(g.week, -7), id).price;
          if (prior == null || prior === 0 || g.price == null) return;
          const percent = (g.price - prior) / prior * 100;
          if (Math.abs(percent) >= 5) anomalies.push(g.week + ' 周均价较上周' + (percent > 0 ? '上升 ' : '下降 ') + Math.abs(percent).toFixed(2) + '%。');
        });
        return { monthly: app.periodInsights && input.kind === 'month' ? app.periodInsights.month(analysis, range.start.slice(0, 7), id, totals) : null, seasonal: app.analysisInsights ? app.analysisInsights.seasonal(analysis, Array.from(groups.keys()).pop(), id).text : '', id: id, name: category.name, totals: totals, series: series, anomalies: anomalies };
      });
      if (missing.length) throw new Error('数据不足，未生成简报。请补齐数据并复核采价：\n' + missing.join('\n'));
      const references = sources.items.filter(function (item) {
        return sources.eligible(item) && item.publishedAt.slice(0, 10) >= range.start && item.publishedAt.slice(0, 10) <= range.end && item.categories.some(function (id) { return ids.includes(id); });
      }).map(function (item) {
        const source = sources.find(item.sourceId);
        return { id: item.id, categories: item.categories.slice(), context: item.context || '', signal: item.signal || null, sourceId: source.id, sourceUrl: source.url, infoUrl: item.infoUrl || source.url, originalTitle: item.title, originalContent: item.content, resolution: item.resolution || '', validThrough: item.validThrough || '', title: item.displayTitle || item.title, content: item.displayContent || item.content, publishedAt: item.publishedAt, sourceName: source.name, sourceVersion: source.version, infoVersion: item.version };
      });
      return { safety: app.publicationPolicy ? app.publicationPolicy.assessment(range.start, range.end, categories) : null, quality: app.evidenceView ? app.evidenceView.capture(analysis, range.start, range.end, ids) : null, categories: categories, references: references, ruleVersion: app.scenarioData ? 'V2' : 'V1',
        method: input.kind === 'month' ? '自然月统计：数量按周内均分的按日分摊数据累计，尾日分配舍入余数，保持周合计；库存取月末日。价格按周均价覆盖天数加权估算，不作为逐日报价。趋势按自然月内的周片段展示，首尾片段天数可能不同。' : '周一至周日统计：价格为已复核周均价，入出库量为周累计，库存取周末值。单周只有一个数据点，不推断期内趋势。',
        sourceNote: '已复核每周平均采价、按生成时品类映射汇总的市场出入库及库存；未映射名称不纳入。外部信息仅引用期间内已确认且核验通过的内容。',
        provenance: { prices: prices.records.filter(function (r) { return usedWeeks.has(r.week.id) && ids.includes(r.category.id) && r.status === 'reviewed'; }).map(function (r) { return { id: r.id, week: r.week.id, category: r.category.name, version: r.version, price: r.price }; }),
          mappings: mappings.records.filter(function (r) { return ids.includes(r.categoryId); }).map(function (r) { return { id: r.id, name: r.name, categoryId: r.categoryId, version: r.version }; }) } };
    }
    function generate(input, previous, scheduled) {
      const range = period(input);
      const data = snapshot(input, range);
      const signature = [input.kind, range.start, input.categories.slice().sort().join(',')].join('|');
      if (!previous && records.some(function (r) { return r.signature === signature; })) throw new Error('相同期间与品类范围已存在简报，保留已有版本，可编辑或修订文字。');
      const id = 'bulletin-' + range.start + '-' + input.kind + '-' + input.categories.slice().sort().join('-');
      const row = { id: previous ? previous.id : id, signature: signature, version: previous ? previous.version + 1 : 1, kind: input.kind, start: range.start, end: range.end,
        title: (input.kind === 'week' ? range.start + ' 当周' : range.start.slice(0, 7)) + '市场行情' + (input.kind === 'week' ? '周报' : '月报'),
        summary: data.categories.map(function (c) { return c.name + '均价 ' + c.totals.price.toFixed(2) + ' 元/吨，入库 ' + c.totals.inbound.toFixed(2) + ' 吨，出库 ' + c.totals.outbound.toFixed(2) + ' 吨，期末库存 ' + c.totals.closing.toFixed(2) + ' 吨。'; }).join('\n'),
        signals: '净入库反映库存流量变化，不能单独推断市场供需或价格方向。缺少跨年同期数据，暂不能确认季节性规律。' + (data.references.length ? '外部核验信息见来源说明。' : '本期无匹配的已核验外部信息，不生成外部市场结论。'),
        status: 'pending', generatedAt: now(), updatedAt: now(), review: null, publication: null, snapshot: data, history: [] };
      if (app.analysisInsights) {
        row.summary = '本期概况\n' + row.summary + '\n\n重点观察\n' + data.categories.map(function (c) { return c.name + '：净入库' + round(c.totals.inbound - c.totals.outbound).toFixed(2) + '吨；' + (c.anomalies.length ? c.anomalies.join(' ') : '有基期采价未触发价格异常关注条件。') + '具体数值与期间见下方品类明细。'; }).join('\n');
        row.signals = data.categories.map(function (c) { const first = c.series[0], last = c.series[c.series.length - 1]; return c.name + '：' + (c.series.length > 1 ? '期内首尾周片段均价由' + first.price.toFixed(2) + '变为' + last.price.toFixed(2) + '元/吨，库存由' + first.closing.toFixed(2) + '变为' + last.closing.toFixed(2) + '吨；该比较不是月度环比。' : '单周简报仅有一个期内数据点，周环比异常依据见品类说明。') + '\n本期入库' + c.totals.inbound.toFixed(2) + '吨、出库' + c.totals.outbound.toFixed(2) + '吨；净入库只反映库存流量，需结合价格与核验资讯判断。\n季节对照：' + c.seasonal + (input.kind === 'week' ? '\n供需观察：' + analysis.query({ end: range.start, count: 1, category: c.id }).findings : '\n月度观察：同时核对净入库、首尾价格与库存；片段天数不同，不将数量片段差异解释为供需趋势。'); }).join('\n\n') + '\n\n背景依据：本期引用' + data.references.length + '条已核验资讯，具体来源和版本如下。量价变化不证明供需因果，结论由业务复核后发布。仅供参考，不作为经营决策依据。';
      }
      if (data.categories.length > 3) {
        const sum = function (key) { return data.categories.reduce(function (n, c) { return n + c.totals[key]; }, 0).toFixed(2); };
        const watched = data.categories.filter(function (c) { return c.anomalies.length; }).map(function (c) { return c.name; });
        row.summary = '本期覆盖' + data.categories.length + '个品类，期间入库' + sum('inbound') + '吨、出库' + sum('outbound') + '吨，期末库存' + sum('closing') + '吨。各品类价格分别统计，不合成跨品类均价。\n' +
          (watched.length ? '量价波动关注：' + watched.join('、') + '。' : '有基期的量价指标未触发关注条件。') + '各品类量价、比较基期与来源详见分项内容；库存变化需结合连续期间判断。';
      }
      if (app.periodInsights) {
        row.signals += '\n\n资讯与量价核对\n' + data.categories.map(function (c) { const comparison = c.monthly; const base = comparison ? comparison.previous.totals : analysis.query({ end: range.start, count: 1, category: c.id }).previousTotals; return c.name + '：' + app.periodInsights.background(data.references, c.id, c.totals, base, range.start, range.end); }).join('\n');
        if (input.kind === 'month') row.signals += '\n\n完整月度对照\n' + data.categories.map(function (c) { return c.name + '：' + ['price', 'inbound', 'outbound', 'closing'].map(function (k) { const change = c.monthly.changes.previous[k], year = c.monthly.changes.year[k]; return ({price:'均价',inbound:'入库',outbound:'出库',closing:'月末库存'})[k] + '环比' + (change.value == null ? change.reason : change.value.toFixed(2) + '%') + '、同比' + (year.value == null ? year.reason : year.value.toFixed(2) + '%'); }).join('；') + '。完整基期及绝对变化量见对照表；月累计受天数影响，不直接推导需求。'; }).join('\n');
      }
      if (scheduled) row.generation = clone(scheduled);
      event(row, scheduled ? '定期自动生成' : previous ? '按最新数据重新生成' : '生成', scheduled ? '计划时间：' + scheduled.scheduledAt + '；生成配置 V' + scheduled.configRevision + '。按当前已复核数据保存快照，等待人工复核。' : previous ? '从 V' + previous.version + ' 创建同期间新数据版本；旧版完整保留，新版重新复核发布。' : '按当前已复核数据保存快照，等待人工复核。', scheduled ? '系统' : undefined);
      records.push(row); persist(); return clone(row);
    }
    function writable(id, version) {
      const row = find(id, version);
      if (!row || latest(id) !== row) throw new Error('版本已变化，请重新打开最新版本。');
      if (row.status === 'published') throw new Error('已发布版本不可修改，请发起修订。');
      return row;
    }
    function regenerate(id, version) {
      const old = find(id, version);
      if (!old || latest(id) !== old) throw new Error('版本已变化，请重新打开最新版本。');
      return generate({ kind: old.kind, date: old.kind === 'month' ? old.start.slice(0, 7) : old.start, categories: old.snapshot.categories.map(function (c) { return c.id; }) }, old);
    }
    function edit(id, version, input) {
      const row = writable(id, version);
      const fields = Object.entries(textLimits(row));
      fields.forEach(function (field) { if (typeof input[field[0]] !== 'string' || !input[field[0]].trim() || input[field[0]].trim().length > field[1]) throw new Error(({ title: '标题', summary: '摘要', signals: '信号' })[field[0]] + '为必填，最多 ' + field[1] + ' 字。'); });
      if (fields.every(function (field) { return row[field[0]] === input[field[0]].trim(); })) return clone(row);
      const before = { title: row.title, summary: row.summary, signals: row.signals };
      fields.forEach(function (field) { row[field[0]] = input[field[0]].trim(); });
      row.status = 'pending'; row.review = null;
      event(row, '编辑保存', '内容变化后重新待复核；数据快照保持不变。');
      row.history[row.history.length - 1].before = before;
      row.history[row.history.length - 1].after = { title: row.title, summary: row.summary, signals: row.signals };
      persist(); return clone(row);
    }
    function review(id, version, decision, opinion) {
      const row = writable(id, version);
      if (row.status !== 'pending') throw new Error('仅待复核版本可提交复核；退回后请先修改内容。');
      if (!['approved', 'revision'].includes(decision) || typeof opinion !== 'string' || !opinion.trim() || opinion.trim().length > 500) throw new Error('请选择复核结论并填写 1–500 字意见。');
      row.status = decision;
      row.review = decision === 'approved' ? { actor: actorName('复核员'), time: now(), opinion: opinion.trim() } : null;
      event(row, decision === 'approved' ? '复核通过' : '退回修改', opinion.trim(), '复核员');
      persist(); return clone(row);
    }
    function publish(id, version) {
      const row = writable(id, version);
      if (row.status !== 'approved' || !row.review) throw new Error('本版本尚未复核通过，不能发布。');
      if (app.publicationPolicy) app.publicationPolicy.requireAllowed(row);
      row.status = 'published'; row.publication = { actor: actorName('发布员'), time: now() };
      event(row, '发布', '商户可见版本更新为 V' + row.version + '。', '发布员');
      persist(); return clone(row);
    }
    function revise(id, version) {
      const old = find(id, version);
      if (!old || latest(id) !== old || old.status !== 'published') throw new Error('请从最新已发布版修订；已有修订草稿时直接编辑草稿。');
      const row = clone(old);
      row.version++; row.status = 'pending'; row.review = null; row.publication = null; row.history = [];
      event(row, '发起修订', '继承 V' + old.version + ' 内容与生成时数据快照；重新复核发布前商户保留旧版。');
      records.push(row); persist(); return clone(row);
    }
    function applyExampleTimeline(id, generatedAt) {
      const rows = records.filter(function (row) { return row.id === id; }).sort(function (a, b) { return a.version - b.version; });
      if (!rows.length || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(generatedAt)) return false;
      const firstDate = generatedAt.slice(0, 10), nextDate = after(firstDate, 1);
      rows.forEach(function (row) {
        row.generatedAt = generatedAt;
        row.history.forEach(function (history, index) {
          history.time = row.version === 1 ? firstDate + ' ' + ['09:00:00', '13:40:00', '16:20:00'][Math.min(index, 2)] : nextDate + ' ' + ['10:15:00', '14:20:00', '16:40:00'][Math.min(index, 2)];
          history.actor = /复核|退回/.test(history.action) ? '周明远' : /发布/.test(history.action) ? '徐悦' : /编辑|修订/.test(history.action) ? '沈佳宁' : '系统任务';
        });
        const reviewEvent = row.history.find(function (history) { return /复核通过/.test(history.action); });
        const publishEvent = row.history.find(function (history) { return /发布/.test(history.action); });
        if (row.review && reviewEvent) Object.assign(row.review, { actor: reviewEvent.actor, time: reviewEvent.time });
        if (row.publication && publishEvent) Object.assign(row.publication, { actor: publishEvent.actor, time: publishEvent.time });
        row.updatedAt = row.history.length ? row.history[row.history.length - 1].time : generatedAt;
      });
      persist(); return true;
    }
    let restored = false;
    if (options.storage) {
      try {
        const saved = JSON.parse(options.storage.getItem(storageKey));
        if (saved && saved.schema === 1 && Array.isArray(saved.records) && saved.records.length && saved.records.every(function (r) { return r.id && states[r.status] && r.snapshot && r.snapshot.provenance && Array.isArray(r.history) && Number.isInteger(r.version); })) {
          records = saved.records; restored = true;
        }
      } catch (_) { storageAvailable = false; }
    }
    if (!restored && options.seed !== false) {
      const seed = generate({ kind: 'week', date: '2026-08-24', categories: app.categoryCatalog.ids() });
      review(seed.id, 1, 'approved', '已核对数据期间、数值及正文。');
      publish(seed.id, 1);
      const row = find(seed.id, 1);
      row.history.forEach(function (item) { item.action = '初始记录 · ' + item.action; });
    }
    if (options.seed !== false && app.scenarioData) {
      // Backfill complete historical months for both fresh and restored stores; never replace existing versions.
      ['2026-07', '2026-06', '2026-05'].forEach(function (date) {
        if (records.some(function (row) { return row.kind === 'month' && row.start === date + '-01'; })) return;
        try {
          const seed = generate({ kind: 'month', date: date, categories: app.categoryCatalog.ids() });
          find(seed.id, seed.version).history.forEach(function (item) { item.action = '初始记录 · ' + item.action; });
        } catch (_) {
          // Changed or incomplete upstream data must not block restored reports or bypass generation checks.
        }
      });
    }
    persist();
    return { list: list, get: function (id, version) { const row = find(id, version); return row ? clone(row) : null; },
      versions: function (id) { return records.filter(function (r) { return r.id === id; }).sort(function (a, b) { return b.version - a.version; }).map(clone); },
      generate: function (input) { return generate(input); }, generateScheduled: function (input, metadata) { return generate(input, null, metadata); }, regenerate: regenerate, edit: edit, review: review, publish: publish, revise: revise, published: published, applyExampleTimeline: applyExampleTimeline,
      storageAvailable: function () { return storageAvailable; } };
  }
  app.bulletinData = { createStore: createStore, period: period, dayPart: dayPart, states: states, textLimits: textLimits };
  let storage;
  try { storage = window.localStorage; } catch (_) { storage = null; }
  app.bulletinStore = createStore(app.analysisStore, app.priceStore, app.categoryStore, app.sourceStore, { storage: storage, onPublish: app.marketData.write });
}());
