(function () {
  'use strict';
  const app = window.FrozenApp;
  const metrics = ['price', 'inbound', 'outbound', 'closing'];
  function range(month, shift) {
    const start = new Date(month + '-01T00:00:00Z'); start.setUTCMonth(start.getUTCMonth() + shift);
    const next = new Date(start); next.setUTCMonth(next.getUTCMonth() + 1);
    return { start: start.toISOString().slice(0, 10), end: app.priceData.dateAfter(next.toISOString().slice(0, 10), -1) };
  }
  function collect(analysis, period, id) {
    const rows = new Map(), missing = new Set(); let price = 0, inbound = 0, outbound = 0, closing = null, days = 0, priceOK = true, quantityOK = true;
    const after = app.priceData.dateAfter, part = app.bulletinData.dayPart;
    for (let day = period.start; day <= period.end; day = after(day, 1)) {
      const index = (new Date(day + 'T00:00:00Z').getUTCDay() + 6) % 7, week = after(day, -index);
      if (!rows.has(week)) rows.set(week, analysis.weekly(week, id));
      const row = rows.get(week); days++;
      if (row.price == null) { priceOK = false; missing.add(week + '采价缺失或未复核'); } else price += row.price;
      if (!row.complete) { quantityOK = false; missing.add(week + '数量不足或异常'); continue; }
      inbound += part(row.inbound, index); outbound += part(row.outbound, index);
      closing = row.closing - row.inbound + row.outbound;
      for (let i = 0; i <= index; i++) closing += part(row.inbound, i) - part(row.outbound, i);
    }
    const round = function (v) { return Math.round((v + Number.EPSILON) * 100) / 100; };
    return { start: period.start, end: period.end, days: days, totals: { price: priceOK ? round(price / days) : null, inbound: quantityOK ? round(inbound) : null, outbound: quantityOK ? round(outbound) : null, closing: quantityOK ? round(closing) : null }, missing: Array.from(missing),
      evidence: Array.from(rows.values()).map(function (r) { return { week: r.week, complete: r.complete, rows: JSON.parse(JSON.stringify(r.rows)), prices: r.prices.map(function (p) { return { id: p.id, version: p.version, price: p.price, status: p.status }; }) }; }) };
  }
  function month(analysis, value, id, totals) {
    const current = range(value, 0), previous = collect(analysis, range(value, -1), id), year = collect(analysis, range(value, -12), id);
    const comparison = function (base) { return Object.fromEntries(metrics.map(function (k) { return [k, Object.assign(app.analysisData.compare(totals[k], base.totals[k]), { delta: totals[k] == null || base.totals[k] == null ? null : Math.round((totals[k] - base.totals[k]) * 100) / 100 })]; })); };
    return { current: current, previous: previous, year: year, changes: { previous: comparison(previous), year: comparison(year) } };
  }
  function publicComparison(value) {
    if (!value) return undefined;
    const base = function (r) { return { start: r.start, end: r.end, days: r.days, totals: Object.fromEntries(metrics.map(function (k) { return [k, r.totals[k]]; })), missing: r.missing.slice() }; };
    const changes = Object.fromEntries(['previous', 'year'].map(function (key) { return [key, Object.fromEntries(metrics.map(function (m) { const c = value.changes[key][m]; return [m, { value: c.value, reason: c.reason, delta: c.delta }]; }))]; }));
    return { current: { start: value.current.start, end: value.current.end }, previous: base(value.previous), year: base(value.year), changes: changes };
  }
  function markup(c) {
    const v = c.monthly; if (!v) return '';
    const esc = app.presentation ? app.presentation.escape : app.escape, num = function (n) { return n == null ? '数据不足' : n.toFixed(2); }, pct = function (x) { return x.value == null ? esc(x.reason) : num(x.value) + '%'; };
    let html = '<section class="bulletin-section"><h3>完整自然月对照</h3><p class="field-hint">上月：' + v.previous.start + ' 至 ' + v.previous.end + '；上年同月：' + v.year.start + ' 至 ' + v.year.end + '。入出库比较月累计，月天数不同；价格按周均价覆盖天数加权，库存取月末。</p><div class="table-scroll"><table class="data-table compact-table"><thead><tr><th>指标</th><th>本月</th><th>上月</th><th>环比变化量 / 率</th><th>上年同月</th><th>同比变化量 / 率</th></tr></thead><tbody>';
    metrics.forEach(function (k) { html += '<tr><td>' + ({ price: '均价（元/吨）', inbound: '入库（吨）', outbound: '出库（吨）', closing: '月末库存（吨）' })[k] + '</td><td>' + num(c.totals[k]) + '</td><td>' + num(v.previous.totals[k]) + '</td><td>' + num(v.changes.previous[k].delta) + ' / ' + pct(v.changes.previous[k]) + '</td><td>' + num(v.year.totals[k]) + '</td><td>' + num(v.changes.year[k].delta) + ' / ' + pct(v.changes.year[k]) + '</td></tr>'; });
    html += '</tbody></table></div>';
    for (const key of ['previous', 'year']) if (v[key].missing.length) html += '<p class="field-hint">' + (key === 'previous' ? '上月' : '上年同月') + '未参与计算的原因：' + esc(v[key].missing.join('；')) + '</p>';
    for (const key of ['previous', 'year']) if (v[key].evidence) html += '<details class="bulletin-data"><summary>管理端：查看' + (key === 'previous' ? '上月' : '上年同月') + '原周数量和采价依据</summary><p class="field-hint">以下完整周为原始留档；计算只采用该基期自然月覆盖日，按同一按日分配规则折算。原始数量不传递商户端。</p><div class="table-scroll"><table class="data-table compact-table"><thead><tr><th>周 / 原始名称</th><th>来源 / 版本</th><th>期初（吨）</th><th>入库（吨）</th><th>出库（吨）</th><th>期末（吨）</th></tr></thead><tbody>' + v[key].evidence.flatMap(function (w) { return w.rows.map(function (r) { return '<tr><td>' + esc(w.week + ' / ' + r.name) + '</td><td>' + esc(r.rawId + ' / ' + (r.batchId || 'FLOW-' + w.week) + ' / V' + (r.version || 1)) + '</td>' + ['opening', 'inbound', 'outbound', 'closing'].map(function (k) { return '<td>' + num(r[k]) + '</td>'; }).join('') + '</tr>'; }); }).join('') + '</tbody></table></div><p class="detail-note">采价：' + v[key].evidence.flatMap(function (w) { return w.prices.map(function (p) { return esc(w.week + ' / ' + p.id + ' / V' + p.version + ' / ' + p.price + '元/吨 / ' + (p.status === 'reviewed' ? '采用' : '未复核，排除')); }); }).join('；') + '</p></details>';
    return html + '</section>';
  }
  function background(refs, categoryId, current, previous, start, end) {
    const relevant = refs.filter(function (r) { return r.categories && r.categories.includes(categoryId); });
    if (!relevant.length) return '本品类没有匹配的已核验资讯，外部依据不足；仅描述量价数据，不作外部供需推断。';
    return relevant.map(function (r) {
      const signal = r.signal, value = signal && current[signal.metric], base = signal && previous && previous[signal.metric];
      let relation = '背景材料；资讯与当前指标没有可直接比较的同期间方向，不判断一致性。';
      if (signal && signal.start === start && signal.end === end && value != null && base != null && base > 0) { const direction = value > base ? 'up' : value < base ? 'down' : 'flat'; relation = direction === signal.direction ? '资讯描述方向与同期间数据一致，只作交叉核对，不证明因果。' : '资讯描述方向与同期间数据不一致，应核对范围、规格和口径，暂不形成一致结论。'; }
      return '【' + r.id + '】' + r.title + '：' + (r.context || '关注该资讯的适用品类及统计范围。') + ' ' + relation;
    }).join('\n');
  }
  app.periodInsights = { range: range, collect: collect, month: month, publicComparison: publicComparison, markup: markup, background: background };
}());
