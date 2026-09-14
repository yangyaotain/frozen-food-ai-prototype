(function () {
  'use strict';
  const app = window.FrozenApp;
  const categories = app.priceData.categories;
  const after = app.priceData.dateAfter;
  const anchor = app.categoryData.period.start;
  const metrics = ['price', 'inbound', 'outbound', 'closing'];
  function validMonday(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1901-01-01' || value > '2099-12-31') return false;
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getUTCDay() === 1;
  }
  function priorYear(start) {
    const thursday = new Date(after(start, 3) + 'T00:00:00Z');
    const year = thursday.getUTCFullYear();
    const week = Math.ceil(((thursday - new Date(year + '-01-01T00:00:00Z')) / 86400000 + 1) / 7);
    const jan4 = new Date((year - 1) + '-01-04T00:00:00Z');
    const monday = after(jan4.toISOString().slice(0, 10), -((jan4.getUTCDay() + 6) % 7));
    const candidate = after(monday, (week - 1) * 7);
    return new Date(after(candidate, 3) + 'T00:00:00Z').getUTCFullYear() === year - 1 ? candidate : null;
  }
  function compare(current, base) {
    if (current == null) return { value: null, reason: '本期数据不足' };
    if (base == null) return { value: null, reason: '缺少基期数据' };
    if (base === 0) return { value: null, reason: '基期为零' };
    return { value: (current - base) / base * 100, reason: '' };
  }
  function createStore(priceStore, categoryStore, sourceStore) {
    // 8 周虚构数量数据；最新周直接使用 T03 数据，历史库存逐周反推衔接。
    const flows = app.scenarioData ? app.scenarioData.marketFlows(categoryStore.records) : categoryStore.records.flatMap(function (record, ri) {
      const rows = [{ rawId: record.id, week: anchor, opening: record.opening, inbound: record.inbound, outbound: record.outbound, closing: record.closing }];
      let closing = record.opening;
      for (let index = 1; index < 8; index++) {
        const inbound = Math.max(1, Math.round(record.inbound * [1, 0.9, 1.05, 0.85, 1, 0.8, 0.95, 0.9][index]));
        const outbound = inbound - [0, 1, -1, 2, 0, 1, -2, 1][(index + ri) % 8];
        const opening = closing - inbound + outbound;
        rows.push({ rawId: record.id, week: after(anchor, -7 * index), opening: opening, inbound: inbound, outbound: outbound, closing: closing });
        closing = opening;
      }
      return rows;
    });
    const originalFlows = JSON.parse(JSON.stringify(flows));
    function setScenario(name) {
      if (!['normal', 'missing', 'duplicate', 'balance', 'zero'].includes(name)) return;
      flows.splice(0, flows.length, ...JSON.parse(JSON.stringify(originalFlows)));
      const index = flows.findIndex(function (r) { return r.week === '2026-06-22' && r.rawId === 'raw-001'; });
      if (index < 0) return;
      if (name === 'missing') flows.splice(index, 1);
      if (name === 'duplicate') flows.push(Object.assign({}, flows[index]));
      if (name === 'balance') flows[index].closing += 10;
      if (name === 'zero') {
        categoryStore.records.filter(function (r) { return r.categoryId === 'poultry'; }).forEach(function (raw) {
          const history = flows.filter(function (r) { return r.rawId === raw.id; }).sort(function (a, b) { return a.week.localeCompare(b.week); });
          const baseIndex = history.findIndex(function (r) { return r.week === '2026-06-15'; });
          history[baseIndex].outbound = 0;
          for (let i = baseIndex; i < history.length; i++) { history[i].opening = history[i - 1].closing; history[i].closing = Math.round((history[i].opening + history[i].inbound - history[i].outbound) * 100) / 100; }
        });
      }
      if (name !== 'normal') flows.forEach(function (r) { if (r.week >= '2026-06-15') r.version = 2; });
    }
    function weeks(end, count) { return Array.from({ length: count }, function (_, index) { return after(end, -7 * (count - index - 1)); }); }
    function weekly(week, categoryId) {
      const members = categoryStore.records.filter(function (record) { return record.categoryId && (!categoryId || record.categoryId === categoryId); });
      const rows = members.map(function (record) {
        const flow = flows.find(function (item) { return item.rawId === record.id && item.week === week; });
        return flow ? Object.assign({}, flow, { name: record.name, origin: record.origin, categoryId: record.categoryId }) : null;
      }).filter(Boolean);
      const candidates = flows.filter(function (r) { return r.week === week && members.some(function (m) { return m.id === r.rawId; }); });
      const issues = app.analysisInsights ? app.analysisInsights.quality(candidates, [], 0) : [];
      const complete = members.length > 0 && rows.length === members.length && !issues.some(function (i) { return i.level === 'block'; });
      const prices = priceStore.records.filter(function (record) { return record.week.id === week && (!categoryId || record.category.id === categoryId); });
      const approved = prices.find(function (record) { return record.category.id === categoryId && record.status === 'reviewed'; });
      const sum = function (key) { return complete ? rows.reduce(function (value, row) { return value + row[key]; }, 0) : null; };
      return { week: week, end: after(week, 6), price: approved ? approved.price : null,
        inbound: sum('inbound'), outbound: sum('outbound'), closing: sum('closing'), rows: rows, prices: prices,
        issues: issues, priceReason: categoryId ? (prices.length ? '采价未复核' : '缺少采价') : '请分品类查看', complete: complete };
    }
    function summarize(list, categoryId) {
      const sum = function (key) { return list.every(function (row) { return row[key] != null; }) ? list.reduce(function (total, row) { return total + row[key]; }, 0) : null; };
      const priceTotal = sum('price');
      return { price: categoryId && priceTotal != null ? priceTotal / list.length : null, inbound: sum('inbound'), outbound: sum('outbound'), closing: list[list.length - 1].closing };
    }
    function query(filters) {
      // Calendar queries are for the analysis page; legacy rolling periods remain for saved reports.
      if (filters.kind === 'month') return monthly(filters);
      if (filters.kind === 'week') {
        const result = query({ end: filters.date, count: 1, category: filters.category });
        if (result.valid) result.kind = 'week';
        else result.message = '请选择有效的分析周和品类，支持 1901–2099 年。';
        return result;
      }
      if (filters.kind) return { valid: false, message: '请选择周分析或月分析。' };
      const count = Number(filters.count);
      const categoryId = filters.category || '';
      if (!validMonday(filters.end) || ![1, 4, 8].includes(count) || (categoryId && !categories.some(function (item) { return item.id === categoryId; }))) return { valid: false, message: '请选择有效的截至周（周一）、分析范围和品类。支持 1901–2099 年。' };
      const dates = weeks(filters.end, count);
      const series = dates.map(function (date) { return weekly(date, categoryId); });
      const previous = weeks(after(filters.end, -count * 7), count).map(function (date) { return weekly(date, categoryId); });
      const yearEnd = priorYear(filters.end);
      const year = yearEnd ? weeks(yearEnd, count).map(function (date) { return weekly(date, categoryId); }) : null;
      const totals = summarize(series, categoryId);
      const previousTotals = summarize(previous, categoryId);
      const yearTotals = year ? summarize(year, categoryId) : {};
      const comparisons = Object.fromEntries(metrics.map(function (key) { return [key, { previous: compare(totals[key], previousTotals[key]), year: compare(totals[key], yearTotals[key]) }]; }));
      const sourceItems = sourceStore.items.filter(function (item) {
        const published = item.publishedAt.slice(0, 10);
        return published >= dates[0] && published <= after(filters.end, 6) && (!categoryId || item.categories.includes(categoryId));
      });
      const references = sourceItems.filter(function (item) { return sourceStore.eligible(item); });
      const priceSeries = (categoryId ? categories.filter(function (item) { return item.id === categoryId; }) : categories).map(function (category) {
        return { id: category.id, name: category.name, values: dates.map(function (week) { return weekly(week, category.id).price; }) };
      });
      const anomalies = [];
      priceSeries.forEach(function (line) {
        line.values.forEach(function (value, index) {
          const previousValue = weekly(after(dates[index], -7), line.id).price;
          const change = compare(value, previousValue);
          if (change.value != null && Math.abs(change.value) >= 5) anomalies.push({ week: dates[index], category: line.name, text: '周均价较上周' + (change.value >= 0 ? '上升 ' : '下降 ') + Math.abs(change.value).toFixed(2) + '%，达到 5% 关注阈值。' });
        });
      });
      if (app.analysisInsights) series.forEach(function (r) { const base = weekly(after(r.week, -7), categoryId); ['inbound', 'outbound', 'closing'].forEach(function (k) { const change = compare(r[k], base[k]); if (change.value != null && Math.abs(change.value) >= 20) anomalies.push({ week: r.week, category: categoryId || '全部品类', text: ({ inbound: '入库量', outbound: '出库量', closing: '库存量' })[k] + '周环比' + change.value.toFixed(2) + '%，达到20%关注条件；本期' + r[k].toFixed(2) + '吨、基期' + base[k].toFixed(2) + '吨。' }); }); });
      const result = { valid: true, start: dates[0], end: after(filters.end, 6), endWeek: filters.end, count: count, categoryId: categoryId,
        series: series, priceSeries: priceSeries, totals: totals, comparisons: comparisons, previousStart: previous[0].week, previousEnd: previous[previous.length - 1].end,
        yearStart: year ? year[0].week : null, yearEnd: year ? year[year.length - 1].end : null,
        references: references, excludedReferences: sourceItems.length - references.length, anomalies: anomalies,
        unmapped: categoryStore.records.filter(function (item) { return !item.categoryId; }).length,
        previousTotals: previousTotals, yearTotals: yearTotals, generatedAt: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }) };
      if (!categoryId) result.categorySummary = categories.map(function (c) {
        const current = summarize(dates.map(function (w) { return weekly(w, c.id); }), c.id);
        const prior = summarize(previous.map(function (r) { return weekly(r.week, c.id); }), c.id);
        const lastYear = year ? summarize(year.map(function (r) { return weekly(r.week, c.id); }), c.id) : null;
        return { id: c.id, name: c.name, group: c.group, totals: current,
          priceChange: compare(current.price, prior.price), priceYear: compare(current.price, lastYear && lastYear.price) };
      });
      if (app.analysisInsights) {
        result.quality = series.flatMap(function (r) { return r.issues.concat(r.complete ? [] : [{ level: 'block', text: r.week + '：数量缺失或异常，不采用该周数量。' }]); }).concat(app.analysisInsights.quality([], series.flatMap(function (r) { return r.prices; }), result.unmapped));
        result.seasonal = categoryId ? app.analysisInsights.seasonal({ weekly: weekly }, filters.end, categoryId) : { rows: [], text: '不同品类分别判断季节变化，请选择具体品类查看历史年度对照。' };
        result.findings = app.analysisInsights.findings(result);
      }
      return result;
    }
    function monthly(filters) {
      const categoryId = filters.category || '', month = filters.date;
      if (!/^(19\d{2}|20\d{2})-(0[1-9]|1[0-2])$/.test(month) || month < '1901-01' || (categoryId && !categories.some(function (c) { return c.id === categoryId; }))) return { valid: false, message: '请选择有效的分析月份和品类，支持 1901–2099 年。' };
      const periods = app.periodInsights, range = periods.range(month, 0), cache = new Map();
      const analysis = { weekly: function (week, id) {
        const key = week + ':' + id;
        if (!cache.has(key)) cache.set(key, weekly(week, id));
        return cache.get(key);
      } };
      const selected = categoryId ? categories.filter(function (c) { return c.id === categoryId; }) : categories;
      function collect(period) {
        const value = periods.collect(analysis, period, categoryId);
        if (categoryId) return value;
          // Sum category-level month fragments; do not synthesize a separate market allocation.
        const parts = selected.map(function (c) { return { category: c, data: periods.collect(analysis, period, c.id) }; });
        metrics.forEach(function (key) {
          value.totals[key] = key === 'price' || parts.some(function (p) { return p.data.totals[key] == null; }) ? null : Math.round(parts.reduce(function (sum, p) { return sum + p.data.totals[key]; }, 0) * 100) / 100;
        });
        value.missing = parts.flatMap(function (p) { return p.data.missing.filter(function (text) { return !text.includes('采价'); }).map(function (text) { return p.category.name + '：' + text; }); });
        return value;
      }
      const current = collect(range);
      const comparison = { previous: collect(periods.range(month, -1)), year: collect(periods.range(month, -12)) };
      comparison.changes = Object.fromEntries(['previous', 'year'].map(function (key) {
        return [key, Object.fromEntries(metrics.map(function (metric) { return [metric, compare(current.totals[metric], comparison[key].totals[metric])]; }))];
      }));
      const series = current.evidence.map(function (evidence) {
        const original = analysis.weekly(evidence.week, categoryId);
        const start = evidence.week < range.start ? range.start : evidence.week;
        const end = original.end > range.end ? range.end : original.end;
        const part = collect({ start: start, end: end });
        return Object.assign({}, original, part.totals, { start: start, end: end, days: part.days, originalEnd: original.end });
      });
      const sourceItems = sourceStore.items.filter(function (item) {
        const date = item.publishedAt.slice(0, 10);
        return date >= range.start && date <= range.end && (!categoryId || item.categories.includes(categoryId));
      });
      const result = { valid: true, kind: 'month', start: range.start, end: range.end, categoryId: categoryId,
        totals: current.totals, previousTotals: comparison.previous.totals, yearTotals: comparison.year.totals,
        previousStart: comparison.previous.start, previousEnd: comparison.previous.end, yearStart: comparison.year.start, yearEnd: comparison.year.end,
        comparisons: Object.fromEntries(metrics.map(function (key) { return [key, { previous: comparison.changes.previous[key], year: comparison.changes.year[key] }]; })),
        series: series, priceSeries: selected.map(function (c) { return { id: c.id, name: c.name, values: series.map(function (row) { return periods.collect(analysis, { start: row.start, end: row.end }, c.id).totals.price; }) }; }),
        references: sourceItems.filter(function (item) { return sourceStore.eligible(item); }),
        unmapped: categoryStore.records.filter(function (item) { return !item.categoryId; }).length,
        anomalies: [], quality: [], generatedAt: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }) };
      result.excludedReferences = sourceItems.length - result.references.length;
      if (!categoryId) result.categorySummary = selected.map(function (c) {
        const value = periods.collect(analysis, range, c.id), changes = periods.month(analysis, month, c.id, value.totals);
        return { id: c.id, name: c.name, group: c.group, totals: value.totals, priceChange: changes.changes.previous.price, priceYear: changes.changes.year.price };
      });
      // Weekly anomaly thresholds still apply to complete source weeks, not unequal month fragments.
      series.forEach(function (row) {
        selected.forEach(function (c) {
          const value = analysis.weekly(row.week, c.id), prior = analysis.weekly(after(row.week, -7), c.id);
          const change = compare(value.price, prior.price);
          if (change.value != null && Math.abs(change.value) >= 5) result.anomalies.push({ week: row.week, category: c.name, text: '周均价较上周' + (change.value >= 0 ? '上升 ' : '下降 ') + Math.abs(change.value).toFixed(2) + '%，达到 5% 关注阈值。' });
        });
        if (app.analysisInsights) {
          const original = analysis.weekly(row.week, categoryId), base = analysis.weekly(after(row.week, -7), categoryId);
          ['inbound', 'outbound', 'closing'].forEach(function (key) {
            const change = compare(original[key], base[key]);
            if (change.value != null && Math.abs(change.value) >= 20) result.anomalies.push({ week: row.week, category: categoryId ? selected[0].name : '全部品类', text: ({ inbound: '入库量', outbound: '出库量', closing: '库存量' })[key] + '周环比' + change.value.toFixed(2) + '%，达到20%关注条件；本期' + original[key].toFixed(2) + '吨、上周' + base[key].toFixed(2) + '吨。' });
          });
          result.quality.push(...original.issues, ...app.analysisInsights.quality([], original.prices, result.unmapped));
        }
      });
      [current, comparison.previous, comparison.year].forEach(function (value, index) {
        value.missing.filter(function (message) { return categoryId || !message.includes('采价'); }).forEach(function (message) {
          result.quality.push({ level: index ? 'exclude' : 'block', text: ['本月', '上月', '上年同月'][index] + '：' + message });
        });
      });
      result.quality = result.quality.filter(function (item, index, list) { return list.findIndex(function (other) { return other.text === item.text; }) === index; });
      if (app.analysisInsights) {
        result.seasonal = app.analysisInsights.seasonal(analysis, range.end, categoryId, true);
        result.findings = app.analysisInsights.findings(result) + '\n月累计受自然月天数影响，不将数量差异单独解释为需求变化。';
      }
      return result;
    }
    return { flows: flows, weekly: weekly, query: query, setScenario: setScenario };
  }
  app.analysisData = { categories: categories, anchor: anchor, validMonday: validMonday, compare: compare, createStore: createStore };
  app.analysisStore = createStore(app.priceStore, app.categoryStore, app.sourceStore);
}());
