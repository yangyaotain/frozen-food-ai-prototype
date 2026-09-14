(function () {
  'use strict';
  const app = window.FrozenApp, esc = app.presentation ? app.presentation.escape : app.escape;
  const number = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function num(value) { return value == null ? '无法计算' : number.format(value); }
  function highlights(items) { return '<ul class="bulletin-highlights">' + items.map(function (item) { return '<li>' + esc(item) + '</li>'; }).join('') + '</ul>'; }
  function chart(category, metric, title, unit) {
    const rows = category.series, spec = { rows: rows, key: metric, title: category.name + ' · ' + title, unit: unit };
    if (rows.length === 1) {
      const row = rows[0];
      return '<section class="bulletin-chart bulletin-chart--single"><h3>' + esc(title) + '<span class="field-hint">' + esc(unit) + '</span></h3><div class="bulletin-single-period"><strong>' + num(row[metric]) + '<small>' + esc(unit) + '</small></strong><span>' + esc(row.start + ' 至 ' + row.end) + '</span><p>' + (metric === 'price' ? '本周已复核平均采价' : '本周末库存') + '</p></div></section>';
    }
    return '<section class="bulletin-chart" data-bulletin-chart="' + esc(JSON.stringify(spec)) + '"><h3>' + esc(title) + '<span class="field-hint">' + esc(unit) + '</span></h3><div class="bulletin-plot"><div data-bulletin-plot>' + chartSvg(spec, 640) + '</div><div class="bulletin-chart-tooltip" data-chart-tooltip hidden></div></div><p class="field-hint bulletin-chart-note" data-point-note role="status">悬停或点选节点查看周片段与数值，方向键可逐周查看。</p></section>';
  }
  function chartSvg(spec, width) {
    const rows = spec.rows, values = rows.map(function (row) { return row[spec.key]; }).filter(Number.isFinite);
    if (!values.length) return '<p class="field-hint">暂无可用趋势数据</p>';
    width = Math.max(240, Math.round(width));
    const low = Math.min(...values), high = Math.max(...values), span = Math.max(high - low, Math.abs(high) * 0.02, 0.04);
    const target = span * 1.4 / 4, power = Math.pow(10, Math.floor(Math.log10(target)));
    const step = [1, 2, 2.5, 5, 10].map(function (n) { return n * power; }).find(function (n) { return n >= target; });
    const bottom = Math.max(0, Math.floor((low - span * 0.2) / step) * step), top = Math.ceil((high + span * 0.2) / step) * step;
    const decimals = Math.max(0, Math.min(2, -Math.floor(Math.log10(step)) + (step / power === 2.5 ? 1 : 0)));
    const format = function (n) { return n.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }); };
    const left = Math.max(58, format(top).length * 7 + 14), right = width - 22;
    const x = function (i) { return rows.length === 1 ? (left + right) / 2 : left + i / (rows.length - 1) * (right - left); };
    const y = function (value) { return 186 - (value - bottom) / (top - bottom) * 146; };
    let axes = '', path = '', connected = false;
    for (let value = bottom; value <= top + step / 10; value += step) axes += '<line x1="' + left + '" x2="' + right + '" y1="' + y(value) + '" y2="' + y(value) + '" class="bulletin-gridline"/><text x="' + (left - 10) + '" y="' + (y(value) + 4) + '" text-anchor="end">' + format(value) + '</text>';
    const stride = Math.max(1, Math.ceil((rows.length - 1) / Math.max(1, Math.floor((right - left) / 62))));
    rows.forEach(function (row, i) {
      if (i % stride === 0 && (i === 0 || i < rows.length - 1 - stride / 2) || i === rows.length - 1) axes += '<text x="' + x(i) + '" y="211" text-anchor="' + (i === 0 ? 'start' : i === rows.length - 1 ? 'end' : 'middle') + '">' + esc(row.start.slice(5)) + '</text>';
      if (!Number.isFinite(row[spec.key])) { connected = false; return; }
      path += (connected ? ' L' : ' M') + x(i) + ' ' + y(row[spec.key]); connected = true;
    });
    const dots = rows.map(function (row, i) {
      if (!Number.isFinite(row[spec.key])) return '';
      const start = i ? (x(i - 1) + x(i)) / 2 : left - 10, end = i < rows.length - 1 ? (x(i) + x(i + 1)) / 2 : right + 10;
      const label = (row.start === row.end ? row.start : row.start + ' 至 ' + row.end) + ' · ' + num(row[spec.key]) + ' ' + spec.unit;
      return '<circle cx="' + x(i) + '" cy="' + y(row[spec.key]) + '" r="' + (rows.length > 15 ? 2.5 : 3.5) + '" class="bulletin-point"/><rect x="' + start + '" y="28" width="' + (end - start) + '" height="166" class="bulletin-chart-hit" data-bulletin-point="' + i + '" data-x="' + x(i) + '" data-y="' + y(row[spec.key]) + '" tabindex="' + (i === 0 ? '0' : '-1') + '" role="button" aria-label="' + esc(label) + '"/>';
    }).join('');
    const last = rows.length - 1, label = Number.isFinite(rows[last][spec.key]) ? '<text x="' + right + '" y="22" text-anchor="end" class="bulletin-chart-last">' + esc(rows[last].start.slice(5) + ' · ' + num(rows[last][spec.key])) + '</text>' : '';
    return '<svg width="' + width + '" height="230" role="group" aria-label="' + esc(spec.title + '，单位' + spec.unit) + '">' + axes + '<path d="' + path + '" class="bulletin-line"/>' + dots + label + '</svg>';
  }
  function mount(root) {
    const nodes = Array.from(root.querySelectorAll('[data-bulletin-chart]'));
    if (!nodes.length) return function () {};
    const draw = function (node) {
      const width = node.querySelector('.bulletin-plot').getBoundingClientRect().width;
      if (!width) return;
      const plot = node.querySelector('[data-bulletin-plot]');
      if (plot.dataset.width === String(Math.round(width))) return;
      plot.dataset.width = String(Math.round(width));
      plot.innerHTML = chartSvg(JSON.parse(node.dataset.bulletinChart), width);
      node.querySelector('[data-chart-tooltip]').hidden = true;
    };
    function select(event) {
      let point = event.target.closest('[data-bulletin-point]');
      if (!point || !root.contains(point)) return;
      const node = point.closest('[data-bulletin-chart]');
      if (event.type === 'keydown') {
        if (event.key === 'Escape') { node.querySelector('[data-chart-tooltip]').hidden = true; return; }
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        const points = Array.from(node.querySelectorAll('[data-bulletin-point]')), i = points.indexOf(point);
        point = points[event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 : Math.max(0, Math.min(points.length - 1, i + (event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0)))];
        point.focus();
      }
      node.querySelectorAll('[data-bulletin-point]').forEach(function (p) { p.setAttribute('tabindex', p === point ? '0' : '-1'); p.classList.toggle('is-selected', p === point); });
      const text = point.getAttribute('aria-label'), tip = node.querySelector('[data-chart-tooltip]');
      tip.textContent = text; tip.hidden = false;
      tip.style.left = Math.max(0, Math.min(node.querySelector('.bulletin-plot').getBoundingClientRect().width - 220, Number(point.dataset.x) - 110)) + 'px';
      tip.style.top = Math.max(0, Number(point.dataset.y) - 60) + 'px';
      node.querySelector('[data-point-note]').textContent = text;
    }
    const redraw = function () { nodes.forEach(draw); };
    const hide = function (event) { const node = event.target.closest('[data-bulletin-chart]'); if (node && (!event.relatedTarget || !node.contains(event.relatedTarget))) node.querySelector('[data-chart-tooltip]').hidden = true; };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(function (entries) { entries.forEach(function (entry) { draw(entry.target); }); }) : null;
    nodes.forEach(function (node) { draw(node); if (observer) observer.observe(node); });
    const events = ['pointerover', 'click', 'focusin', 'keydown'];
    events.forEach(function (name) { root.addEventListener(name, select); });
    root.addEventListener('toggle', redraw, true);
    root.addEventListener('pointerout', hide);
    root.addEventListener('focusout', hide);
    if (!observer) window.addEventListener('resize', redraw);
    return function () { if (observer) observer.disconnect(); else window.removeEventListener('resize', redraw); events.forEach(function (name) { root.removeEventListener(name, select); }); root.removeEventListener('toggle', redraw, true); root.removeEventListener('pointerout', hide); root.removeEventListener('focusout', hide); };
  }
  function categoryView(category, kind) {
    const definitions = [['price', kind === 'month' ? '估算月均价' : '周均价格', '元/吨'], ['inbound', '入库量', '吨'], ['outbound', '出库量', '吨'], ['closing', '期末库存', '吨']];
    const priceTitle = kind === 'week' ? '本周平均价格' : '价格趋势';
    const stockTitle = kind === 'week' ? '周末库存' : '库存趋势';
    const chartNote = kind === 'week' ? '本周价格为已复核周均价，库存取周末值；单周不绘制期内趋势。' : '价格节点为月内各周的周均价，库存节点为对应周片段期末库存；首尾片段可能不足7天。';
    return '<section class="bulletin-category"><h2>' + esc(category.name) + '<span class="badge">重点品类</span></h2><div class="bulletin-metrics">' + definitions.map(function (metric) { return '<div><span class="muted">' + metric[1] + '</span><strong>' + num(category.totals[metric[0]]) + '</strong><span class="field-hint">' + metric[2] + '</span></div>'; }).join('') + '</div><div class="bulletin-charts">' + chart(category, 'price', priceTitle, '元/吨') + chart(category, 'closing', stockTitle, '吨') + '</div><p class="field-hint">' + chartNote + '</p><details class="bulletin-data"><summary>查看周度量价明细（价格：元/吨；数量：吨）</summary><div class="table-scroll"><table class="data-table compact-table"><thead><tr><th scope="col">期间</th><th scope="col">周均价</th><th scope="col">入库</th><th scope="col">出库</th><th scope="col">期末库存</th></tr></thead><tbody>' + category.series.map(function (row) { return '<tr><td>' + row.start + '<span class="cell-secondary">至 ' + row.end + ' · ' + row.days + ' 天</span></td><td class="numeric">' + num(row.price) + '</td><td class="numeric">' + num(row.inbound) + '</td><td class="numeric">' + num(row.outbound) + '</td><td class="numeric">' + num(row.closing) + '</td></tr>'; }).join('') + '</tbody></table></div></details><p class="bulletin-signal">' + app.icon('info') + '<span>净入库 ' + num(category.totals.inbound - category.totals.outbound) + ' 吨。' + (category.anomalies.length ? esc(category.anomalies.join(' ')) : '有基期的已复核周均价未触发周环比绝对值 ≥5% 的关注阈值；缺失基期不参与判断。') + '</span></p></section>';
  }
  function render(row, categoryId) {
    const snapshot = row.snapshot;
    const categories = snapshot.categories.filter(function (c) { return !categoryId || c.id === categoryId; });
    return '<article class="bulletin-document">' + (app.publicationPolicy ? app.publicationPolicy.markup(snapshot.safety) : '') + (app.evidenceView ? app.evidenceView.quality(snapshot.quality) : '') + '<header class="bulletin-document-head"><div class="bulletin-labels"><span class="badge">AI 生成</span><span class="badge">' + (row.kind === 'week' ? '周报' : '月报') + ' · V' + row.version + '</span><span class="status-tag status-tag--' + (row.status === 'published' ? 'success' : 'warning') + '">' + (row.status === 'published' ? '已复核发布' : '管理端预览 · 未发布') + '</span></div><h2>' + esc(row.title) + '</h2><p class="muted">数据期间：' + row.start + ' 至 ' + row.end + '</p><p class="field-hint">生成时间：' + esc(row.generatedAt) + ' · 规则版本：' + esc(snapshot.ruleVersion) + '</p></header><section class="bulletin-section"><h2>市场摘要</h2><p class="bulletin-prose">' + esc(row.summary) + '</p>' + (categoryId ? '<p class="field-hint">摘要保留整份已发布内容；以下指标与趋势仅展示所选品类。</p>' : '') + '</section><section class="bulletin-section"><h2>本期重点</h2>' + highlights(row.highlights) + '</section>' + categories.map(function (c) { const content = categoryView(c, row.kind) + (app.periodInsights ? app.periodInsights.markup(c) : ''); return categories.length > 1 ? '<details class="bulletin-data category-fold"><summary>' + esc(c.name) + ' · ' + num(c.totals.price) + ' 元/吨 · 期末库存 ' + num(c.totals.closing) + ' 吨</summary>' + content + '</details>' : content; }).join('') + '<section class="bulletin-section"><h2>异常与供需信号</h2><p class="bulletin-prose">' + esc(row.signals) + '</p></section><section class="bulletin-section"><h2>数据口径与主要来源</h2><p>' + esc(snapshot.method) + '</p><p>' + esc(snapshot.sourceNote) + '</p>' + (snapshot.references.length ? '<ul class="bulletin-references">' + snapshot.references.map(function (ref) { return '<li><strong>' + esc(ref.title) + '</strong><p class="field-hint">' + esc(ref.sourceName) + ' · ' + esc(ref.publishedAt) + ' · 来源 V' + ref.sourceVersion + ' / 信息 V' + ref.infoVersion + '</p><p>' + esc(ref.content) + '</p>' + (app.evidenceView ? app.evidenceView.reference(ref) : '') + '</li>'; }).join('') + '</ul>' : '<p class="field-hint">本期无匹配的已核验外部信息。</p>') + '</section><footer class="bulletin-section bulletin-audit"><p>复核：' + (row.review ? esc(row.review.actor + ' · ' + row.review.time) : '尚未通过') + '</p><p>发布：' + (row.publication ? esc(row.publication.actor + ' · ' + row.publication.time) + ' · 发布版本 V' + row.version : '未发布') + '</p><p>仅供参考，不作为经营决策依据。</p></footer></article>';
  }
  app.bulletinView = { render: render, num: num, chart: chart, chartSvg: chartSvg, mount: mount };
}());
