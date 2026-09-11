(function () {
  'use strict';
  const app = window.FrozenApp;
  const start = '2024-01-01', end = '2026-08-31';
  const round = function (n) { return Math.round(n * 100) / 100; };
  function after(s, days) { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
  const weeks = []; for (let d = start; d <= end; d = after(d, 7)) weeks.push(d);
  function historicalPrices(records, categoryList, weekOf, samplePrice) {
    categoryList.forEach(function (c, ci) { weeks.forEach(function (week, index) {
      if (records.some(function (r) { return r.week.id === week && r.category.id === c.id; })) return;
      const month = Number(week.slice(5, 7));
      const price = samplePrice(c.id, week);
      const r = { id: 'history-' + week + '-' + c.id, week: weekOf(week), category: c, price: price, unit: '元/吨', note: '跨年度周均采价归档', editor: '沈佳宁', status: 'reviewed', updatedAt: after(week, 6) + ' 16:00:00', version: 1, batchId: '', history: [] };
      r.history.push({ action: '初始记录 · 周均采价归档', actor: '沈佳宁', at: r.updatedAt, opinion: '已按品类汇总当周有效报价并完成归档。', before: null, after: JSON.parse(JSON.stringify(r)) }); records.push(r);
    }); });
  }
  function marketFlows(raws) {
    return raws.flatMap(function (raw, ri) {
      let closing = raw.closing;
      return weeks.slice().reverse().map(function (week) {
        const age = Math.round((new Date(end) - new Date(week)) / 604800000);
        const month = Number(week.slice(5, 7));
        const opening = age === 0 ? raw.opening : round(raw.opening * (1 + 0.13 * Math.sin(age / (6 + ri % 3)) + 0.12 * Math.cos(month / 12 * Math.PI * 2 + (ri < 12 ? 0 : ri / 4))));
        const inbound = age === 0 ? raw.inbound : round(raw.inbound * (1 + 0.22 * Math.cos(month / 12 * Math.PI * 2 + (ri < 12 ? 0 : ri / 4)) + (age === 2 && ri < 4 ? 0.5 : 0)));
        const outbound = round(opening + inbound - closing);
        const row = { rawId: raw.id, week: week, opening: opening, inbound: inbound, outbound: outbound, closing: closing, batchId: 'FLOW-' + week, version: 1 };
        closing = opening; return row;
      });
    });
  }
  function merchantFlows(market, merchants, raws) {
    function share(mi, index, rawId) {
      const recent = Math.max(0, index - weeks.length + 9) / 8;
      const raw = raws.find(function (r) { return r.id === rawId; });
      const category = raw.businessCategoryId || raw.categoryId;
      return mi === 0 ? 0.3 + 0.12 * recent : mi === 1 ? 0.12 - 0.05 * recent : category === 'pork' ? 0.07 + 0.06 * recent : 0.012 + (['pork-meat', 'beef', 'lamb'].includes(category) ? 0.003 : -0.003) * recent;
    }
    return merchants.flatMap(function (m, mi) { return market.filter(function (r) { const raw = raws.find(function (v) { return v.id === r.rawId; }); return raw && m.categories.includes(raw.businessCategoryId || raw.categoryId); }).map(function (r) {
      const index = weeks.indexOf(r.week), opening = round(r.opening * share(mi, index - 1, r.rawId)), closing = round(r.closing * share(mi, index, r.rawId));
      const inbound = round(Math.max(r.inbound * [0.085, 0.18, 0.13][mi], closing - opening + r.outbound * 0.03));
      return { merchantId: m.id, rawId: r.rawId, week: r.week, opening: opening, inbound: inbound, outbound: round(opening + inbound - closing), closing: closing, batchId: r.batchId, version: 1 };
    }); });
  }
  app.scenarioData = { start: start, end: end, weeks: weeks, round: round, prices: historicalPrices, marketFlows: marketFlows, merchantFlows: merchantFlows,
    rules: { price: 5, quantity: 20, turnover: 28, minimumMerchants: 5, maximumShare: 0.6 },
    cases: [
      { name: '同比与数量异常', end: '2026-08-24', count: 4, category: 'poultry' },
      { name: '已复核完整行情', end: '2026-08-24', count: 4, category: 'pork' },
      { name: '缺少同比基期', end: '2024-02-05', count: 4, category: 'poultry' },
      { name: '本期数量缺失', end: '2023-12-25', count: 1, category: 'seafood' }
    ] };
}());
