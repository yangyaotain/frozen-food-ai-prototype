(function () {
  'use strict';
  const app = window.FrozenApp;
  const actorName = function (fallback) { return app.actor ? app.actor(fallback) : fallback; };
  const clone = function (value) { return JSON.parse(JSON.stringify(value)); };
  const round = function (value) { return Math.round((value + Number.EPSILON) * 100) / 100; };
  const after = app.priceData.dateAfter;
  const states = app.bulletinData.states;
  const merchants = [{ id: 'demo-a', name: '丰茂冻品商行', categories: ['poultry', 'chicken', 'duck', 'duck-offal', 'seafood'] }, { id: 'demo-b', name: '润泽水产商行', categories: ['seafood', 'prepared'] }, { id: 'demo-c', name: '锦禾食品商行', categories: ['pork', 'pork-meat', 'beef', 'beef-offal', 'lamb', 'lamb-offal', 'prepared'] }];
  const method = '数量单位：吨。按完整周统计，入出库量期间累计，库存取期间边界；平均库存＝（期初库存＋期末库存）÷2；数量周转次数＝出库量÷平均库存；周转天数＝期间天数×平均库存÷出库量。不是财务成本口径，不能代表单批货物实际库龄。平均库存为零时不计算周转；无出库时周转天数不可计算。';
  function period(input) {
    if (input.kind) return app.bulletinData.period(input);
    if (!app.analysisData.validMonday(input.end) || ![1, 4, 8].includes(Number(input.count))) throw new Error('历史报告期间无效。');
    return { start: after(input.end, -7 * (Number(input.count) - 1)), end: after(input.end, 6) };
  }
  function textLimits(row) { const count = row.snapshot.categories.length; return { title: 100, summary: Math.max(3000, count * 500), signals: Math.max(3000, count * 800), advice: Math.max(4000, count * 1500) }; }
  function turnover(opening, closing, outbound, days) {
    const average = (opening + closing) / 2;
    return { average: round(average), times: average > 0 ? round(outbound / average) : null,
      days: average > 0 && outbound > 0 ? round(days * average / outbound) : null,
      reason: average <= 0 ? '平均库存为零' : (outbound <= 0 ? '期间无出库，天数不可计算' : '') };
  }
  function createStore(analysis, mappings, sources, bulletins, options) {
    options = options || {};
    const storageKey = 'frozen-admin-reports-v1';
    let records = [], storageAvailable = Boolean(options.storage);
    // 从市场数量数据分配虚构本户业务量，逐周衔接库存；不把某一整类市场数据当成单户数据。
    const shares = [[0.22, 0.08, 0.16], [0.12, 0.20, 0.07], [0.05, 0.10, 0.18]];
    const flows = app.scenarioData ? app.scenarioData.merchantFlows(analysis.flows, merchants, mappings.records) : merchants.flatMap(function (merchant, mi) {
      return mappings.records.filter(function (raw) { return merchant.categories.includes(raw.businessCategoryId || raw.categoryId); }).flatMap(function (raw, ri) {
        const history = analysis.flows.filter(function (row) { return row.rawId === raw.id; }).slice().sort(function (a, b) { return a.week.localeCompare(b.week); });
        const fraction = shares[mi][Math.min(2, Math.floor(ri / 4))];
        let closing = history.length ? round(history[0].opening * fraction) : 0;
        return history.map(function (row) {
          const opening = closing, inbound = round(row.inbound * fraction), outbound = round(row.outbound * fraction);
          closing = round(opening + inbound - outbound);
          return { merchantId: merchant.id, rawId: raw.id, week: row.week, opening: opening, inbound: inbound, outbound: outbound, closing: closing };
        });
      });
    });
    const stamp = function () { return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }); };
    function latest(id) { return records.filter(function (r) { return r.id === id; }).sort(function (a, b) { return b.version - a.version; })[0]; }
    function find(id, version) { return records.find(function (r) { return r.id === id && r.version === Number(version); }); }
    function save() {
      if (!options.storage) return;
      try { options.storage.setItem(storageKey, JSON.stringify({ schema: 1, records: records })); storageAvailable = true; }
      catch (_) { storageAvailable = false; }
    }
    function event(row, action, opinion, actor) {
      row.updatedAt = stamp(); row.revision++;
      row.history.push({ action: action, opinion: opinion, actor: actor === '系统' ? '系统' : actorName(actor || '管理员'), time: row.updatedAt, version: row.version });
    }
    function snapshot(input) {
      const merchant = merchants.find(function (m) { return m.id === input.merchant; });
      const count = Number(input.count);
      if (!merchant || !app.analysisData.validMonday(input.end) || ![1, 4, 8].includes(count)) throw new Error('请选择有效商户、截至周（周一）及 1/4/8 周期间。');
      const weeks = Array.from({ length: count }, function (_, i) { return after(input.end, -7 * (count - i - 1)); });
      const start = weeks[0], end = after(input.end, 6), days = count * 7;
      const members = mappings.records.filter(function (r) { return r.categoryId && flows.some(function (f) { return f.merchantId === merchant.id && f.rawId === r.id; }); });
      if (!members.length) throw new Error('没有已映射的业务品类，无法生成经营报告。');
      const rows = members.map(function (raw) {
        const series = weeks.map(function (week) { return flows.find(function (f) { return f.merchantId === merchant.id && f.rawId === raw.id && f.week === week; }); });
        if (series.some(function (f) { return !f; })) throw new Error('本户数量数据不足，支持 2024-01-01 至 2026-09-06 的完整周，请调整期间。');
        return { rawId: raw.id, name: raw.name, origin: raw.origin, categoryId: raw.categoryId, mappingVersion: raw.version,
          opening: series[0].opening, inbound: round(series.reduce(function (n, f) { return n + f.inbound; }, 0)),
          outbound: round(series.reduce(function (n, f) { return n + f.outbound; }, 0)), closing: series[series.length - 1].closing };
      });
      function aggregate(items) {
        const result = Object.fromEntries(['opening', 'inbound', 'outbound', 'closing'].map(function (key) { return [key, round(items.reduce(function (n, row) { return n + row[key]; }, 0))]; }));
        result.turnover = turnover(result.opening, result.closing, result.outbound, days); return result;
      }
      const totals = aggregate(rows), references = new Map();
      const categories = app.analysisData.categories.filter(function (c) { return rows.some(function (r) { return r.categoryId === c.id; }); }).map(function (category) {
        const own = aggregate(rows.filter(function (r) { return r.categoryId === category.id; }));
        const market = analysis.query({ end: input.end, count: count, category: category.id });
        market.references.forEach(function (item) {
          const source = sources.find(item.sourceId);
          references.set(item.id, { id: item.id, categories: item.categories.slice(), context: item.context || '', signal: item.signal || null, sourceId: source.id, sourceUrl: source.url, infoUrl: item.infoUrl || source.url, originalTitle: item.title, originalContent: item.content, resolution: item.resolution || '', validThrough: item.validThrough || '', title: item.displayTitle || item.title, content: item.displayContent || item.content, publishedAt: item.publishedAt, sourceName: source.name, sourceVersion: source.version, infoVersion: item.version });
        });
        const priorWeeks = weeks.map(function (w) { return after(w, -7 * count); });
        const rawIds = members.filter(function (r) { return r.categoryId === category.id; }).map(function (r) { return r.id; });
        const priorRows = flows.filter(function (r) { return r.merchantId === merchant.id && priorWeeks.includes(r.week) && rawIds.includes(r.rawId); });
        const completePrior = priorRows.length === rawIds.length * count;
        const priorOutbound = completePrior ? round(priorRows.reduce(function (n, r) { return n + r.outbound; }, 0)) : null;
        const priorClosing = completePrior ? round(priorRows.filter(function (r) { return r.week === priorWeeks[priorWeeks.length - 1]; }).reduce(function (n, r) { return n + r.closing; }, 0)) : null;
        const priorAll = flows.filter(function (r) { return r.merchantId === merchant.id && r.week === priorWeeks[priorWeeks.length - 1] && members.some(function (raw) { return raw.id === r.rawId; }); });
        const allClosing = priorAll.length === members.length ? priorAll.reduce(function (n, r) { return n + r.closing; }, 0) : null;
        const priorShare = priorClosing != null && allClosing > 0 ? round(priorClosing / allClosing * 100) : null;
        const currentShare = totals.closing > 0 ? round(own.closing / totals.closing * 100) : null;
        const change = { priorShare: priorShare, shareDelta: currentShare != null && priorShare != null ? round(currentShare - priorShare) : null, outbound: app.analysisData.compare(own.outbound, priorOutbound), closing: app.analysisData.compare(own.closing, priorClosing), priorOutbound: priorOutbound, priorClosing: priorClosing, start: priorWeeks[0], end: after(priorWeeks[priorWeeks.length - 1], 6) };
        return { id: category.id, name: category.name, own: own, change: change, share: totals.closing > 0 ? round(own.closing / totals.closing * 100) : null,
          market: { price: market.totals.price, inbound: market.totals.inbound, outbound: market.totals.outbound, closing: market.totals.closing,
            priceReason: market.totals.price == null ? '期间采价缺失或未复核，不作为价格建议依据' : '', priceChange: market.comparisons.price.previous,
            anomalies: market.anomalies.map(function (a) { return a.week + '：' + a.text; }),
            prices: market.series.flatMap(function (week) { return week.prices.filter(function (p) { return p.status === 'reviewed'; }).map(function (p) { return { id: p.id, week: p.week.id, price: p.price, version: p.version }; }); }) } };
      });
      const series = weeks.map(function (week) {
        const values = flows.filter(function (f) { return f.merchantId === merchant.id && f.week === week && members.some(function (m) { return m.id === f.rawId; }); });
        const result = aggregate(values); result.start = week; result.end = after(week, 6); delete result.turnover; return result;
      });
      const linked = bulletins.published().filter(function (b) { return b.start >= start && b.end <= end && b.snapshot.categories.some(function (c) { return categories.some(function (own) { return own.id === c.id; }); }); });
      let signals = categories.map(function (c) {
        const net = round(c.own.inbound - c.own.outbound);
        return c.name + '净入库 ' + net.toFixed(2) + ' 吨；' + (c.own.turnover.days == null ? c.own.turnover.reason : '数量周转天数 ' + c.own.turnover.days.toFixed(2) + ' 天') + '。' + (c.own.turnover.days != null && c.own.turnover.days > 28 ? '超过 28 天关注阈值，需结合批次库龄核对。' : '不据此判断经营优劣。') + (c.market.price == null ? '本期市场价格依据不足。' : '市场周均价期间均值 ' + c.market.price.toFixed(2) + ' 元/吨，不代表本户成交价。');
      }).join('\n');
      let advice = categories.map(function (c) {
        const focus = c.own.turnover.days == null ? '先核对出库及库存完整性' : (c.own.turnover.days > 28 ? '关注库存去化，核对批次库龄及近期出库节奏' : '持续观察出库节奏及库存结构');
        return c.name + '：' + focus + '。依据：本期出库 ' + c.own.outbound.toFixed(2) + ' 吨、期末库存 ' + c.own.closing.toFixed(2) + ' 吨；' + (c.market.price == null ? '市场价格数据不足，暂不形成价格方向建议。' : '同期间已复核市场周均价均值 ' + c.market.price.toFixed(2) + ' 元/吨，仅作市场参照，不直接推导补货或调价。');
      }).join('\n');
      if (app.analysisInsights) {
        const pct = function (p) { return p.value == null ? p.reason : p.value.toFixed(2) + '%'; };
        signals = categories.map(function (c) { return c.name + '：本户出库' + c.own.outbound.toFixed(2) + '吨，较' + c.change.start + '至' + c.change.end + '变化' + pct(c.change.outbound) + '；期末库存' + c.own.closing.toFixed(2) + '吨，变化' + pct(c.change.closing) + '。\n数量周转' + (c.own.turnover.days == null ? c.own.turnover.reason : c.own.turnover.days + '天') + '，期末库存占比' + (c.share == null ? '无法计算' : c.share + '%') + '。市场价格环比' + pct(c.market.priceChange) + '；本户数量变化与市场价格不等同，不据此判断利润。'; }).join('\n\n');
        advice = categories.map(function (c) {
          const slow = c.own.turnover.days != null && c.own.turnover.days > 28, improving = c.change.outbound.value != null && c.change.outbound.value > 5;
          const concerns = [];
          if (slow) concerns.push('库存周转超过28天关注条件，优先核对累积品类及出库节奏。');
          if (improving) concerns.push('出库较上期改善，核对是否连续及是否交货集中。');
          if (c.share > 50) concerns.push('库存集中于本品类，占比超过50%关注条件，核对集中原因。');
          if (c.change.closing.value > 20) concerns.push('库存较基期增长超过20%，核对入库增量与出库消化情况。');
          const focus = (concerns.length ? concerns.join('') : '本期未触发所列关注条件，持续观察出库与库存结构。') + '结构对照：本期占比' + (c.share == null ? '无法计算' : c.share + '%') + '、基期占比' + (c.change.priorShare == null ? '数据不足' : c.change.priorShare + '%') + '，变化' + (c.change.shareDelta == null ? '无法计算' : c.change.shareDelta + '个百分点') + '。';
          const marketFocus = c.market.price == null ? '本期市场价格依据不足，优先补齐采价复核，数量观察不延伸为价格建议。' : c.market.priceChange.value == null ? '市场价格基期不足，不作价格变化联动判断。' : c.market.priceChange.value > 0 && c.change.closing.value > 0 ? '市场价格走高而本户库存增加，应分别核对积压批次和价格适用规格，不能将市场上涨等同本户库存升值。' : c.market.priceChange.value < 0 && c.change.outbound.value > 0 ? '市场价格回落而本户出库增长，应核对是否为交货集中或结构变化，不能据数量增长判断利润改善。' : '市场价格与本户数量未形成明确同向证据，建议连续观察，避免据单周表现调整采购。';
          return c.name + '\n观察：' + focus + marketFocus + '\n依据：本户出库' + c.own.outbound.toFixed(2) + '吨、环比' + pct(c.change.outbound) + '，库存' + c.own.closing.toFixed(2) + '吨、环比' + pct(c.change.closing) + '；数据期间' + start + '至' + end + '。\n市场背景：' + (c.market.price == null ? '采价缺失或未复核，不形成价格方向意见。' : '均价' + c.market.price.toFixed(2) + '元/吨、环比' + pct(c.market.priceChange) + '，建议与本户数量变化分别核对；不能替代本户成交价。');
        }).join('\n\n');
        advice += '\n\n共性边界\n当前缺少订单、毛利、批次库龄和保质期，不作采购数量、定价或处置结论。仅供参考，不作为经营决策依据。';
      }
      if (app.periodInsights) advice += '\n\n资讯背景核对\n' + categories.map(function (c) { return c.name + '：' + app.periodInsights.background(Array.from(references.values()), c.id, c.market, null, start, end); }).join('\n');
      return { merchant: clone(merchant), start: start, end: end, count: count, snapshot: { safety: app.publicationPolicy ? app.publicationPolicy.assess(start, end) : null, quality: app.evidenceView ? app.evidenceView.capture(analysis, start, end, categories.map(function (c) { return c.id; }), flows.filter(function (r) { return r.merchantId === merchant.id && r.week >= after(start, -7 * count) && r.week <= end && members.some(function (m) { return m.id === r.rawId; }); }).map(function (r) { const m = members.find(function (raw) { return raw.id === r.rawId; }); return Object.assign({}, r, { name: m.name, origin: m.origin, categoryId: m.categoryId, mappingVersion: m.version, batchId: r.batchId || 'FLOW-' + r.week, version: r.version || 1, usage: r.week < start ? '环比基期' : '本期' }); })) : null, totals: totals, categories: categories, rows: rows, series: series,
        references: Array.from(references.values()), bulletins: clone(linked), unmapped: mappings.records.filter(function (r) { return !r.categoryId && flows.some(function (f) { return f.merchantId === merchant.id && f.rawId === r.id; }); }).length,
        method: method, ruleVersion: app.scenarioData ? 'V2 · 数量分析规则' : 'V1 · 数量分析规则', sourceNote: '本户业务数量 V1；生成时品类映射；本期间已复核周均采价与已核验外部信息。所有数据均为生成时快照，未映射名称排除。市场价格按期间各周等权平均，任一周不足则不计算，品类间不混算。' },
        summary: merchant.name + '本期入库 ' + totals.inbound.toFixed(2) + ' 吨、出库 ' + totals.outbound.toFixed(2) + ' 吨，期末库存 ' + totals.closing.toFixed(2) + ' 吨。' + (totals.turnover.days == null ? totals.turnover.reason + '。' : '数量周转 ' + totals.turnover.times.toFixed(2) + ' 次，估算周转天数 ' + totals.turnover.days.toFixed(2) + ' 天。'),
        signals: signals, advice: advice };
    }
    function monthSnapshot(input) {
      const range = period(input), merchant = merchants.find(m => m.id === input.merchant);
      if (!merchant) throw new Error('请选择有效商户。');
      const days = (Date.parse(range.end) - Date.parse(range.start)) / 86400000 + 1;
      const rawMembers = mappings.records.filter(r => r.categoryId && flows.some(f => f.merchantId === merchant.id && f.rawId === r.id));
      const ownByWeek = new Map(flows.filter(f => f.merchantId === merchant.id).map(f => [f.rawId + '|' + f.week, f]));
      const marketByWeek = new Map();
      const part = app.bulletinData.dayPart;
      const monday = day => after(day, -((new Date(day + 'T00:00:00Z').getUTCDay() + 6) % 7));
      const previousDate = new Date(range.start + 'T00:00:00Z'); previousDate.setUTCMonth(previousDate.getUTCMonth() - 1);
      const previousRange = period({ kind: 'month', date: previousDate.toISOString().slice(0, 7) });
      const aggregate = items => {
        const value = Object.fromEntries(['opening', 'inbound', 'outbound', 'closing'].map(k => [k, round(items.reduce((sum, row) => sum + row[k], 0))]));
        value.turnover = turnover(value.opening, value.closing, value.outbound, days); return value;
      };
      function ownRows(r) {
        return rawMembers.map(raw => {
          let opening = null, closing = null, inbound = 0, outbound = 0;
          for (let day = r.start; day <= r.end; day = after(day, 1)) {
            const week = monday(day), index = (Date.parse(day) - Date.parse(week)) / 86400000;
            const source = ownByWeek.get(raw.id + '|' + week);
            if (!source) throw new Error('本户数量数据不足：' + week);
            let before = source.opening;
            for (let i = 0; i < index; i++) before += part(source.inbound, i) - part(source.outbound, i);
            if (opening == null) opening = round(before);
            inbound += part(source.inbound, index); outbound += part(source.outbound, index);
            closing = round(before + part(source.inbound, index) - part(source.outbound, index));
          }
          return { rawId: raw.id, name: raw.name, origin: raw.origin, categoryId: raw.categoryId, mappingVersion: raw.version, opening, closing, inbound: round(inbound), outbound: round(outbound) };
        });
      }
      function marketPeriod(r, id) {
        let price = 0, inbound = 0, outbound = 0, closing = null, priceOK = true, quantityOK = true, n = 0;
        const prices = new Map();
        for (let day = r.start; day <= r.end; day = after(day, 1)) {
          const week = monday(day), index = (Date.parse(day) - Date.parse(week)) / 86400000, key = id + '|' + week;
          if (!marketByWeek.has(key)) marketByWeek.set(key, analysis.weekly(week, id));
          const value = marketByWeek.get(key); n++;
          if (value.price == null) priceOK = false; else price += value.price;
          value.prices.filter(p => p.status === 'reviewed').forEach(p => prices.set(p.id, { id: p.id, week, price: p.price, version: p.version }));
          if (!value.complete) { quantityOK = false; continue; }
          inbound += part(value.inbound, index); outbound += part(value.outbound, index);
          closing = value.closing - value.inbound + value.outbound;
          for (let i = 0; i <= index; i++) closing += part(value.inbound, i) - part(value.outbound, i);
        }
        return { price: priceOK ? round(price / n) : null, inbound: quantityOK ? round(inbound) : null, outbound: quantityOK ? round(outbound) : null, closing: quantityOK ? round(closing) : null, prices: Array.from(prices.values()) };
      }
      const rows = ownRows(range), totals = aggregate(rows);
      if (!rows.length) throw new Error('没有已映射的业务品类，无法生成经营报告。');
      let priorRows = null; try { priorRows = ownRows(previousRange); } catch (_) { /* Missing prior data remains unavailable. */ }
      const series = [], references = new Map();
      for (let start = range.start; start <= range.end;) {
        const week = monday(start), end = after(week, 6) < range.end ? after(week, 6) : range.end;
        series.push({ start, end, ...aggregate(ownRows({ start, end })) });
        // Existing weekly projection supplies only verified sources; clip to the natural month.
        const one = snapshot({ merchant: merchant.id, end: week, count: 1 });
        one.snapshot.references.filter(r => r.publishedAt.slice(0, 10) >= range.start && r.publishedAt.slice(0, 10) <= range.end).forEach(r => references.set(r.id, r));
        start = after(end, 1);
      }
      const categories = app.analysisData.categories.filter(c => rows.some(r => r.categoryId === c.id)).map(c => {
        const own = aggregate(rows.filter(r => r.categoryId === c.id));
        const prior = priorRows ? aggregate(priorRows.filter(r => r.categoryId === c.id)) : null;
        const priorAll = priorRows ? aggregate(priorRows) : null;
        const share = totals.closing > 0 ? round(own.closing / totals.closing * 100) : null;
        const priorShare = prior && priorAll.closing > 0 ? round(prior.closing / priorAll.closing * 100) : null;
        const currentMarket = marketPeriod(range, c.id), previousMarket = marketPeriod(previousRange, c.id);
        return { id: c.id, name: c.name, own, share,
          change: { start: previousRange.start, end: previousRange.end, priorOutbound: prior ? prior.outbound : null, priorClosing: prior ? prior.closing : null, priorShare, shareDelta: share != null && priorShare != null ? round(share - priorShare) : null,
            outbound: app.analysisData.compare(own.outbound, prior ? prior.outbound : null), closing: app.analysisData.compare(own.closing, prior ? prior.closing : null) },
          market: { ...currentMarket, priceReason: currentMarket.price == null ? '本月采价缺失或未复核，不作为价格建议依据' : '', priceChange: app.analysisData.compare(currentMarket.price, previousMarket.price), anomalies: [] } };
      });
      // The report compares the preceding month, so freeze that market-publication check too.
      const safety = app.publicationPolicy ? app.publicationPolicy.assess(range.start, range.end) : null;
      if (safety && !app.publicationPolicy.assess(previousRange.start, previousRange.end).allowed) { safety.allowed = false; safety.reason = '上月市场汇总不满足发布条件，本报告限制发布。'; }
      const rawEvidence = flows.filter(r => r.merchantId === merchant.id && r.week >= monday(previousRange.start) && r.week <= range.end && rawMembers.some(m => m.id === r.rawId)).map(r => {
        const m = rawMembers.find(m => m.id === r.rawId); return { ...r, name: m.name, origin: m.origin, categoryId: m.categoryId, mappingVersion: m.version, usage: r.week < monday(range.start) ? '环比基期' : '本期', batchId: r.batchId || 'FLOW-' + r.week, version: r.version || 1 };
      });
      const pct = value => value.value == null ? value.reason : value.value.toFixed(2) + '%';
      const ranked = categories.slice().sort((a, b) => {
        const score = c => (c.own.turnover.days != null && c.own.turnover.days > 28 ? 3 : 0) + (Math.abs(c.change.shareDelta || 0) >= 2 ? 2 : 0) + (Math.abs(c.change.outbound.value || 0) >= 20 ? 1 : 0);
        return score(b) - score(a) || b.share - a.share;
      });
      const focusNames = ranked.slice(0, Math.min(2, ranked.length)).map(c => c.name).join('、');
      const monthlyAdvice = categories.map(c => {
        const observations = [];
        if (c.own.turnover.days != null && c.own.turnover.days > 28) observations.push('数量周转' + c.own.turnover.days + '天，优先核对库存批次及连续出库节奏');
        if (c.change.outbound.value != null && Math.abs(c.change.outbound.value) >= 10) observations.push('出库较上月' + (c.change.outbound.value > 0 ? '增加' : '减少') + Math.abs(c.change.outbound.value).toFixed(2) + '%');
        if (c.change.shareDelta != null && Math.abs(c.change.shareDelta) >= 1) observations.push('库存占比较上月' + (c.change.shareDelta > 0 ? '上升' : '下降') + Math.abs(c.change.shareDelta).toFixed(2) + '个百分点');
        if (!observations.length) observations.push('本月出库和库存结构未触发重点关注条件，继续观察连续月份变化');
        return c.name + '：' + observations.join('；') + '。依据：本月出库' + c.own.outbound.toFixed(2) + '吨、月末库存' + c.own.closing.toFixed(2) + '吨，出库环比' + pct(c.change.outbound) + '、库存环比' + pct(c.change.closing) + '。' + (c.market.price == null ? '采价缺失或未复核，暂不形成价格方向意见。' : '市场月均价' + c.market.price.toFixed(2) + '元/吨、环比' + pct(c.market.priceChange) + '，仅作市场参照。');
      }).join('\n\n') + '\n\n本月优先核对\n' + focusNames + '的库存结构、出库节奏及适用规格。\n\n共性边界\n当前缺少订单、毛利、批次库龄和保质期，不作采购数量、定价或处置结论。仅供参考，不作为经营决策依据。';
      return { merchant: clone(merchant), ...range, kind: 'month', days, count: null,
        snapshot: { totals, rows, categories, series, references: Array.from(references.values()), bulletins: clone(bulletins.published().filter(b => b.start >= range.start && b.end <= range.end && b.snapshot.categories.some(c => categories.some(own => own.id === c.id)))),
          unmapped: mappings.records.filter(r => !r.categoryId && flows.some(f => f.merchantId === merchant.id && f.rawId === r.id)).length, safety,
          quality: app.evidenceView ? app.evidenceView.capture(analysis, range.start, range.end, categories.map(c => c.id), rawEvidence) : null,
          method: method.replace('按完整周统计', '按完整自然月统计，期间天数取当月实际天数；周数量按日分配至月边界，0.01吨余数归周日'), ruleVersion: 'V3 · 自然月数量分析规则',
          sourceNote: '本户出入库按自然月累计、库存取月初月末；市场周均采价按月内覆盖天数加权，缺价不以剩余天数代替。环比使用上一自然月，保留原始周数量与采价版本。' },
        summary: merchant.name + '本月入库 ' + totals.inbound.toFixed(2) + ' 吨、出库 ' + totals.outbound.toFixed(2) + ' 吨，月末库存 ' + totals.closing.toFixed(2) + ' 吨；统计期间 ' + range.start + ' 至 ' + range.end + '，共 ' + days + ' 天。',
        signals: categories.map(c => c.name + '：本月出库 ' + c.own.outbound + ' 吨、月末库存 ' + c.own.closing + ' 吨；上月出库 ' + (c.change.priorOutbound == null ? '数据不足' : c.change.priorOutbound + ' 吨') + '，出库环比' + pct(c.change.outbound) + '、库存环比' + pct(c.change.closing) + '、库存占比变化' + (c.change.shareDelta == null ? '数据不足' : c.change.shareDelta + '个百分点') + '。数量周转天数 ' + (c.own.turnover.days == null ? c.own.turnover.reason : c.own.turnover.days + ' 天') + '；' + (c.market.price == null ? '市场价格依据不足。' : '本月市场均价 ' + c.market.price + ' 元/吨，环比' + pct(c.market.priceChange) + '，不代表本户成交价。')).join('\n\n'),
        advice: monthlyAdvice };
    }
    function generate(input, previous, scheduled) {
      const normalized = input.kind === 'week' ? { ...input, end: input.date, count: 1 } : input;
      const data = input.kind === 'month' ? monthSnapshot(input) : snapshot(normalized);
      if (input.kind === 'week') { data.kind = 'week'; data.days = 7; }
      const id = input.kind ? 'report-' + data.merchant.id + '-' + input.kind + '-' + data.start : 'report-' + data.merchant.id + '-' + input.end + '-' + data.count;
      if (!previous && latest(id)) throw new Error('该商户相同期间已有报告，保留已有版本，可编辑或修订文字。');
      const row = Object.assign(data, { id: previous ? previous.id : id, version: previous ? previous.version + 1 : 1, revision: 0, title: data.merchant.name + ' · ' + (input.kind === 'month' ? data.start.slice(0, 7) : data.start) + ' 经营' + (input.kind === 'week' ? '周报' : input.kind === 'month' ? '月报' : '报告'), status: 'pending',
        generatedAt: stamp(), updatedAt: stamp(), review: null, publication: null, history: [] });
      if (scheduled) row.generation = clone(scheduled);
      event(row, scheduled ? '定期自动生成' : previous ? '按最新数据重新生成' : '生成', scheduled ? '计划时间：' + scheduled.scheduledAt + '；生成配置 V' + scheduled.configRevision + '。本户报告及经营建议一并生成，等待共同复核。' : previous ? '从 V' + previous.version + ' 创建同户同期间新数据版本；原版完整保留，报告及建议共同重新复核发布。' : '本户报告及经营建议一并生成，等待复核。', scheduled ? '系统' : undefined); records.push(row); save(); return clone(row);
    }
    function current(id, version, revision) {
      const row = find(id, version);
      if (!row || latest(id) !== row || row.revision !== revision) throw new Error('报告已变化，请重新打开最新版本。');
      return row;
    }
    function editable(id, version, revision) {
      const row = current(id, version, revision);
      if (row.status === 'published') throw new Error('已发布版本不可修改，请发起修订。'); return row;
    }
    function regenerate(id, version, revision) {
      const old = current(id, version, revision);
      return generate(old.kind ? { merchant: old.merchant.id, kind: old.kind, date: old.kind === 'month' ? old.start.slice(0, 7) : old.start } : { merchant: old.merchant.id, end: after(old.end, -6), count: old.count }, old);
    }
    function textOf(row) { return { title: row.title, summary: row.summary, signals: row.signals, advice: row.advice }; }
    function edit(id, version, revision, input) {
      const row = editable(id, version, revision);
      const limits = textLimits(row);
      Object.keys(limits).forEach(function (key) { if (typeof input[key] !== 'string' || !input[key].trim() || input[key].trim().length > limits[key]) throw new Error(({ title: '标题', summary: '摘要', signals: '信号', advice: '建议' })[key] + '为必填，最多 ' + limits[key] + ' 字。'); });
      if (Object.keys(limits).every(function (key) { return row[key] === input[key].trim(); })) return clone(row);
      const before = textOf(row);
      Object.keys(limits).forEach(function (key) { row[key] = input[key].trim(); }); row.status = 'pending'; row.review = null;
      event(row, '编辑报告及建议', '文字变化，报告与建议共同重新待复核。');
      Object.assign(row.history[row.history.length - 1], { before: before, after: textOf(row) }); save(); return clone(row);
    }
    function review(id, version, revision, decision, opinion, checked) {
      const row = editable(id, version, revision);
      if (row.status !== 'pending') throw new Error('仅待复核报告可提交；退回后请先修改内容。');
      if (!['approved', 'revision'].includes(decision) || typeof opinion !== 'string' || !opinion.trim() || opinion.trim().length > 500) throw new Error('请选择有效结论并填写 1–500 字复核意见。');
      if (decision === 'approved' && (!checked || checked.report !== true || checked.advice !== true)) throw new Error('通过前请确认已核对报告数据及经营建议依据与边界。');
      row.status = decision;
      row.review = decision === 'approved' ? { actor: actorName('复核员'), time: stamp(), opinion: opinion.trim(), report: true, advice: true } : null;
      event(row, decision === 'approved' ? '报告及建议复核通过' : '退回修改', opinion.trim(), '复核员'); save(); return clone(row);
    }
    function publish(id, version, revision) {
      const row = editable(id, version, revision);
      if (row.status !== 'approved' || !row.review || !row.review.report || !row.review.advice) throw new Error('报告与建议尚未共同通过复核，不能发布。');
      if (app.publicationPolicy) app.publicationPolicy.requireAllowed(row);
      row.status = 'published'; row.publication = { actor: actorName('发布员'), time: stamp() };
      event(row, '报告及建议发布', '仅发布至 ' + row.merchant.name + '，共同版本 V' + row.version + '。', '发布员'); save(); return clone(row);
    }
    function revise(id, version, revision) {
      const old = current(id, version, revision);
      if (old.status !== 'published') throw new Error('仅最新已发布报告可发起修订。');
      const row = clone(old); row.version++; row.revision = 0; row.status = 'pending'; row.review = null; row.publication = null; row.history = [];
      event(row, '发起修订', '继承 V' + old.version + ' 的数据与建议快照；新版本发布前保留旧已发布版。'); records.push(row); save(); return clone(row);
    }
    function applyExampleTimeline(id, generatedAt) {
      const rows = records.filter(function (row) { return row.id === id; }).sort(function (a, b) { return a.version - b.version; });
      if (!rows.length || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(generatedAt)) return false;
      const firstDate = generatedAt.slice(0, 10), nextDate = after(firstDate, 1);
      rows.forEach(function (row) {
        row.generatedAt = generatedAt;
        row.history.forEach(function (history, index) {
          history.time = row.version === 1 ? firstDate + ' ' + ['09:05:00', '14:10:00', '16:45:00'][Math.min(index, 2)] : nextDate + ' ' + ['10:20:00', '14:30:00', '16:50:00'][Math.min(index, 2)];
          history.actor = /复核|退回/.test(history.action) ? '周明远' : /发布/.test(history.action) ? '徐悦' : /编辑|修订/.test(history.action) ? '沈佳宁' : '系统任务';
        });
        const reviewEvent = row.history.find(function (history) { return /复核通过/.test(history.action); });
        const publishEvent = row.history.find(function (history) { return /发布/.test(history.action); });
        if (row.review && reviewEvent) Object.assign(row.review, { actor: reviewEvent.actor, time: reviewEvent.time });
        if (row.publication && publishEvent) Object.assign(row.publication, { actor: publishEvent.actor, time: publishEvent.time });
        row.updatedAt = row.history.length ? row.history[row.history.length - 1].time : generatedAt;
      });
      save(); return true;
    }
    function publishedFor(merchantId) {
      if (!merchants.some(function (m) { return m.id === merchantId; })) return [];
      const result = new Map();
      records.filter(function (r) { return r.merchant.id === merchantId && r.status === 'published' && (!app.publicationPolicy || app.publicationPolicy.allowed(r)); }).forEach(function (r) { if (!result.has(r.id) || result.get(r.id).version < r.version) result.set(r.id, r); });
      return Array.from(result.values()).map(function (r) {
        return clone({ id: r.id, merchant: r.merchant, version: r.version, title: r.title, status: r.status, start: r.start, end: r.end, count: r.count, kind: r.kind, days: r.days,
          generatedAt: r.generatedAt, summary: r.summary, signals: r.signals, advice: r.advice, snapshot: r.snapshot,
          review: { actor: r.review.actor, time: r.review.time }, publication: r.publication });
      });
    }
    let restored = false;
    if (options.storage) {
      try {
        const saved = JSON.parse(options.storage.getItem(storageKey));
        if (saved && saved.schema === 1 && Array.isArray(saved.records) && saved.records.every(function (r) { return r.id && states[r.status] && r.merchant && merchants.some(function (m) { return m.id === r.merchant.id; }) && r.snapshot && Array.isArray(r.snapshot.rows) && Array.isArray(r.history) && Number.isInteger(r.version) && Number.isInteger(r.revision); })) { records = saved.records; restored = true; }
      } catch (_) { storageAvailable = false; }
    }
    if (options.seed !== false) {
      // Only untouched old seed drafts are replaced; all edits, versions and publications remain.
      records = records.filter(r => !(r.id.endsWith('-2026-08-24-4') && r.version === 1 && r.revision === 1 && r.status === 'pending' && r.history.length === 1 && r.history[0].action === '初始记录 · 生成' && !records.some(v => v.id === r.id && v.version > 1)));
      merchants.forEach(function (merchant) {
        for (const [kind, date] of [['week', '2026-08-24'], ['week', '2026-08-17'], ['month', '2026-08']]) {
          const id = 'report-' + merchant.id + '-' + kind + '-' + date + (kind === 'month' ? '-01' : '');
          if (!latest(id)) {
            try { const row = generate({ merchant: merchant.id, kind, date }); find(row.id, 1).history[0].action = '初始记录 · 生成'; }
            catch (error) { if (!restored) throw error; } // User-maintained missing inputs must not prevent restoring saved reports.
          }
        }
      }); save();
    }
    return { list: function () { return records.filter(function (r) { return latest(r.id) === r; }).map(clone); },
      get: function (id, version) { const row = find(id, version); return row ? clone(row) : null; },
      versions: function (id) { return records.filter(function (r) { return r.id === id; }).sort(function (a, b) { return b.version - a.version; }).map(clone); },
      generate: function (input) { return generate(input); }, generateScheduled: function (input, metadata) { return generate(input, null, metadata); }, regenerate: regenerate, edit: edit, review: review, publish: publish, revise: revise, publishedFor: publishedFor, applyExampleTimeline: applyExampleTimeline,
      storageAvailable: function () { return storageAvailable; } };
  }
  app.reportData = { merchants: merchants, states: states, turnover: turnover, method: method, period, createStore: createStore, textLimits: textLimits };
  let storage;
  try { storage = window.localStorage; } catch (_) { storage = null; }
  app.reportStore = createStore(app.analysisStore, app.categoryStore, app.sourceStore, app.bulletinStore, { storage: storage });
}());
