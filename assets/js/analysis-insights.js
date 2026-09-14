(function () {
  'use strict';
  const app = window.FrozenApp;
  const num = function (n) { return n == null ? '无法计算' : Number(n).toFixed(2); };
  function quality(rows, prices, unmapped) {
    const issues = [], seen = new Set();
    rows.forEach(function (r) {
      const key = r.rawId + ':' + r.week;
      if (seen.has(key)) issues.push({ level: 'block', text: key + '：数量重复，停止采用本周汇总。' }); seen.add(key);
      if (['opening', 'inbound', 'outbound', 'closing'].some(function (k) { return !Number.isFinite(r[k]) || r[k] < 0; }) || Math.abs(r.opening + r.inbound - r.outbound - r.closing) > 0.02) issues.push({ level: 'block', text: key + '：库存勾稽或数量格式异常。' });
    });
    prices.filter(function (p) { return p.status !== 'reviewed'; }).forEach(function (p) { issues.push({ level: 'exclude', text: p.id + '：采价未复核，排除价格依据。' }); });
    if (unmapped) issues.push({ level: 'exclude', text: '未映射名称 ' + unmapped + ' 项，排除分类汇总。' });
    return issues;
  }
  function seasonal(store, end, category, naturalMonth) {
    const year = Number(end.slice(0, 4));
    if (!category) return { text: '请按单品类查看季节对照，避免跨品类合成价格。', rows: [] };
    const rows = [year - 2, year - 1].map(function (y) {
      const monthly = Array.from({ length: 12 }, function (_, i) {
        const month = String(i + 1).padStart(2, '0'), first = y + '-' + month + '-01';
        if (naturalMonth) {
          const value = app.periodInsights.collect(store, app.periodInsights.range(first.slice(0, 7), 0), category);
          return value.totals.inbound == null ? null : value.totals.price;
        }
        let d = first; while (new Date(d + 'T00:00:00Z').getUTCDay() !== 1) d = app.priceData.dateAfter(d, 1);
        const points = []; for (; d.slice(0, 7) === first.slice(0, 7); d = app.priceData.dateAfter(d, 7)) points.push(store.weekly(d, category));
        return points.length && points.every(function (p) { return p.price != null && p.complete; }) ? points.reduce(function (s, p) { return s + p.price; }, 0) / points.length : null;
      }); return { year: y, monthly: monthly };
    });
    if (rows.some(function (r) { return r.monthly.some(function (n) { return n == null; }); })) return { text: '前两个完整年度采价或数量不完整，暂不能形成季节判断。', rows: rows };
    const swings = rows.map(function (r) { const mean = r.monthly.reduce(function (a, b) { return a + b; }, 0) / 12; return mean > 0 ? (Math.max(...r.monthly) - Math.min(...r.monthly)) / mean * 100 : 0; });
    if (swings.some(function (n) { return n < 5; })) return { rows: rows, text: '至少一个年度的月度高低差不足年均价的5%，价格平稳或波动较小，不判断重复季节波动。' };
    const peaks = rows.map(function (r) { const max = Math.max(...r.monthly); return r.monthly.flatMap(function (n, i) { return Math.abs(n - max) < 0.000001 ? [i + 1] : []; }); });
    if (peaks.some(function (p) { return p.length !== 1; })) return { rows: rows, text: '存在多个并列高位月份，尚不能确定唯一高位时段，不判断季节规律。' };
    const months = peaks.map(function (p) { return p[0]; }), gap = Math.abs(months[0] - months[1]);
    return { rows: rows, text: Math.min(gap, 12 - gap) <= 1 ? '两个历史年度高位月份接近（' + months.join('月、') + '月，按跨年循环比较），历史数据呈现重复波动特征；仅作观察线索，不能解释为季节因果或预测。' : '两个年度价格高位月份分别为' + months.join('月、') + '月，未形成一致重复特征，不作季节规律判断。' };
  }
  function findings(result) {
    if (!result.categoryId) return '本期已映射品类合计入库' + num(result.totals.inbound) + '吨、出库' + num(result.totals.outbound) + '吨，期末库存' + num(result.totals.closing) + '吨。不同品类的量价变化可能方向不同，市场合计不直接代表单一品类供需。请在分品类汇总中选择具体品类，结合价格、出库与库存对照判断。仅供参考，不作为经营决策依据。';
    const p = result.comparisons.price.previous.value, o = result.comparisons.outbound.previous.value, c = result.comparisons.closing.previous.value;
    const values = '本期入库 ' + num(result.totals.inbound) + ' 吨，出库 ' + num(result.totals.outbound) + ' 吨；价格环比 ' + num(p) + (p == null ? '' : '%') + '，出库环比 ' + num(o) + (o == null ? '' : '%') + '，库存环比 ' + num(c) + (c == null ? '' : '%') + '。';
    let assessment = '本期或上期的相关数据不足，暂不判断供需方向。';
    if ([p, o, c].every(function (n) { return n != null; })) assessment = p > 0 && o > 0 && c < 0 ? '价格与出库上升、库存下降，出现去库与价格走强的同向线索；需结合来源信息核对。' : p < 0 && o < 0 && c > 0 ? '价格与出库下降、库存增加，出现去库放缓线索；需核对供给变化。' : '量价与库存方向不完全一致，属于混合信号；不能据单个指标推断供需。';
    return assessment + '\n依据期间：' + result.start + ' 至 ' + result.end + '。' + values + '\n已核验资讯 ' + result.references.length + ' 条；资讯只提供背景佐证，不自动证明因果。仅供参考，不作为经营决策依据。';
  }
  function markup(result) {
    const esc = app.escape;
    if (!result.categoryId) return '<section class="panel analysis-method"><h2>市场数量：本期、上期与去年同期对比</h2><div class="table-scroll"><table class="data-table compact-table"><thead><tr><th>指标（吨）</th><th>本期</th><th>上期</th><th>去年同期</th></tr></thead><tbody>' + [['inbound', '入库量'], ['outbound', '出库量'], ['closing', '期末库存']].map(function (f) { return '<tr><td>' + f[1] + '</td><td>' + num(result.totals[f[0]]) + '</td><td>' + num(result.previousTotals[f[0]]) + '</td><td>' + num(result.yearTotals[f[0]]) + '</td></tr>'; }).join('') + '</tbody></table></div><p>各品类价格同比、环比见分品类汇总；选择具体品类查看季节对照。</p><h2>数据采用与排除</h2><ul>' + (result.quality.length ? result.quality.map(function (i) { return '<li>' + esc(i.text) + '</li>'; }).join('') : '<li>所选数量格式与库存勾稽检查通过。</li>') + '</ul></section>';
    let html = '<section class="panel analysis-method"><h2>本期、上期与去年同期对比</h2><div class="table-scroll"><table class="data-table compact-table"><thead><tr><th>指标</th><th>本期</th><th>上期</th><th>去年同期</th><th>环比变化量</th><th>同比变化量</th></tr></thead><tbody>';
    [['price', (result.kind === 'month' ? '月均价' : result.kind === 'week' ? '周均价' : '周均价均值') + '（元/吨）'], ['inbound', '入库量（吨）'], ['outbound', '出库量（吨）'], ['closing', '期末库存（吨）']].forEach(function (f) { const current = result.totals[f[0]], previous = result.previousTotals[f[0]], year = result.yearTotals[f[0]]; html += '<tr><td>' + f[1] + '</td><td>' + num(current) + '</td><td>' + num(previous) + '</td><td>' + num(year) + '</td><td>' + num(current == null || previous == null ? null : current - previous) + '</td><td>' + num(current == null || year == null ? null : current - year) + '</td></tr>'; });
    html += '</tbody></table></div><p>上期：' + result.previousStart + ' 至 ' + result.previousEnd + '；去年同期：' + (result.yearStart ? result.yearStart + ' 至 ' + result.yearEnd : '上年无对应ISO周') + '。上期数值为零不计算环比；去年同期数值为零不计算同比。</p><h2>历史季节对照</h2><p>' + esc(result.seasonal.text) + '</p><div class="table-scroll"><table class="data-table compact-table"><thead><tr><th>年度</th>' + Array.from({ length: 12 }, function (_, i) { return '<th>' + (i + 1) + '月</th>'; }).join('') + '</tr></thead><tbody>' + result.seasonal.rows.map(function (r) { return '<tr><td>' + r.year + '</td>' + r.monthly.map(function (n) { return '<td>' + num(n) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div><p class="field-hint">' + (result.kind === 'month' ? '单位元/吨；完整自然月按各周已复核周均价的覆盖天数加权，历史数据不足时不判断季节规律。' : '单位元/吨；按周起始月份分组，月内已复核周价等权比较，用于历史特征观察，不等同自然月报价格。') + '</p><h2>数据采用与排除</h2><ul>' + (result.quality.length ? result.quality.map(function (i) { return '<li>' + esc(i.text) + '</li>'; }).join('') : '<li>所选数量格式与库存勾稽检查通过。</li>') + '</ul><p>数量批次：' + result.series.map(function (r) { return 'FLOW-' + r.week + ' / V' + Math.max(1, ...r.rows.map(function (raw) { return raw.version || 1; })); }).join('、') + '；完整性、重复与库存勾稽异常时停止采用对应周。</p></section>';
    return html;
  }
  app.analysisInsights = { quality: quality, seasonal: seasonal, findings: findings, markup: markup };
}());
