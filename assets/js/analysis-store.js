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
    return { flows: flows, weekly: weekly, query: query, setScenario: setScenario };
  }
  app.analysisData = { categories: categories, anchor: anchor, validMonday: validMonday, compare: compare, createStore: createStore };
  app.analysisStore = createStore(app.priceStore, app.categoryStore, app.sourceStore);
}());
