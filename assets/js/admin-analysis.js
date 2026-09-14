(function () {
  'use strict';
  const app = window.FrozenApp;
  const esc = app.presentation ? app.presentation.escape : app.escape;
  const store = app.analysisStore;
  const categories = app.analysisData.categories;
  const number = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function num(value) { return value == null ? '数据不足' : number.format(value); }
  function percent(item, period) { const reason = item.reason === '缺少基期数据' ? '缺少' + period + '数据' : item.reason === '基期为零' ? period + '数值为零' : item.reason; return item.value == null ? reason : (item.value > 0 ? '+' : '') + item.value.toFixed(2) + '%'; }
  function categoryName(id) { return categories.find(function (category) { return category.id === id; }).name; }
  function chart(id, title, dates, lines, unit, width, periods) {
    const values = lines.flatMap(function (line) { return line.values.filter(function (value) { return value != null; }); });
    if (!values.length) return '<div class="empty-state">' + app.icon('chart') + '<strong>暂无可绘制数据</strong><p>请检查所选期间的数据及采价复核状态。</p></div>';
    const top = Math.max(...values, 1) * 1.15;
    const right = width - 36;
    const x = function (index) { return dates.length === 1 ? (74 + right) / 2 : 74 + index / (dates.length - 1) * (right - 74); };
    const y = function (value) { return 220 - value / top * 180; };
    let axes = '';
    for (let i = 0; i <= 4; i++) {
      const value = top * i / 4;
      axes += '<line x1="74" y1="' + y(value) + '" x2="' + right + '" y2="' + y(value) + '" class="chart-gridline"/><text x="64" y="' + (y(value) + 4) + '" text-anchor="end" class="chart-label">' + Math.round(value).toLocaleString('zh-CN') + '</text>';
    }
    axes += dates.map(function (date, index) { return '<text x="' + x(index) + '" y="250" text-anchor="middle" class="chart-label">' + (periods[index].start || date).slice(5) + '</text>'; }).join('');
    const plots = lines.map(function (line, lineIndex) {
      let path = '', open = false;
      line.values.forEach(function (value, index) {
        if (value == null) { open = false; return; }
        path += (open ? ' L' : ' M') + x(index) + ' ' + y(value); open = true;
      });
      return '<g class="chart-series chart-series--' + lineIndex + '"><path d="' + path + '" fill="none" stroke-width="2.5"/>' + line.values.map(function (value, index) {
        if (value == null) return '';
        const description = (periods[index].start || dates[index]) + ' 至 ' + periods[index].end + '，' + line.name + ' ' + num(value) + ' ' + unit + '，查看明细与依据';
        return '<circle cx="' + x(index) + '" cy="' + y(value) + '" r="5" tabindex="0" role="button" data-week="' + dates[index] + '" aria-label="' + esc(description) + '"><title>' + esc(description) + '</title></circle>';
      }).join('') + '</g>';
    }).join('');
    return '<div class="chart-legend">' + lines.map(function (line, index) { return '<span class="chart-key chart-key--' + index + '">' + esc(line.name) + '</span>'; }).join('') + '<span class="muted">单位：' + unit + '</span></div><div class="chart-scroll"><svg class="analysis-chart" viewBox="0 0 ' + width + ' 275" width="' + width + '" height="275" role="group" aria-labelledby="' + id + '"><title id="' + id + '">' + title + '，横轴为统计片段起始日期；点击数据点查看完整期间及依据</title>' + axes + plots + '</svg></div>';
  }
  function detail(host, result, week) {
    const row = result.series.find(function (item) { return item.week === week; });
    if (!row) return;
    const business = row.rows.map(function (item) { return '<tr><td>' + esc(item.name) + '<span class="cell-secondary">' + esc(item.rawId) + '</span></td><td>' + categoryName(item.categoryId) + '</td><td>' + esc(item.origin) + '</td><td class="numeric">' + num(item.opening) + '</td><td class="numeric">' + num(item.inbound) + '</td><td class="numeric">' + num(item.outbound) + '</td><td class="numeric">' + num(item.closing) + '</td></tr>'; }).join('');
    const prices = row.prices.map(function (price) {
      const state = app.priceData.statuses[price.status];
      return '<tr><td>' + price.category.name + '</td><td class="numeric">' + num(price.price) + '</td><td><span class="status-tag status-tag--' + state.style + '">' + state.name + '</span></td><td>V' + price.version + '</td><td>' + (price.status === 'reviewed' ? '纳入本品类分析' : '未纳入分析') + '</td></tr>';
    }).join('');
    const body = '<div class="content-stack"><p class="dialog-description">统计期间：' + (row.start || row.week) + ' 至 ' + row.end + '；品类：' + (result.categoryId ? categoryName(result.categoryId) : '全部已映射品类') + '。数量单位：吨，价格单位：元/吨。</p>' +
      (result.kind === 'month' ? '<section><h2>本月统计片段</h2><p>覆盖 ' + row.days + ' 天；入库 ' + num(row.inbound) + ' 吨、出库 ' + num(row.outbound) + ' 吨、片段期末库存 ' + num(row.closing) + ' 吨。数量按月内覆盖日累计，价格按片段内日均价计算；采价复核状态沿用所属周。</p><p class="field-hint">以下为 ' + row.week + ' 至 ' + row.originalEnd + ' 的原始整周依据，月度汇总只采用上述统计片段，整周数量不直接等同于本月纳入数量。</p></section>' : '') +
      '<section><h2>业务数量与产地明细</h2>' + (business ? '<div class="table-scroll"><table class="data-table compact-table"><thead><tr><th scope="col">原始名称</th><th scope="col">分析品类</th><th scope="col">产地</th><th scope="col">期初库存</th><th scope="col">入库量</th><th scope="col">出库量</th><th scope="col">期末库存</th></tr></thead><tbody>' + business + '</tbody></table></div>' : '<p class="dialog-description">本周暂无匹配的业务数量数据。</p>') + '</section>' +
      '<section><h2>采价依据与复核状态</h2>' + (prices ? '<div class="table-scroll"><table class="data-table compact-table"><thead><tr><th scope="col">品类</th><th scope="col">周均价格</th><th scope="col">复核状态</th><th scope="col">版本</th><th scope="col">引用情况</th></tr></thead><tbody>' + prices + '</tbody></table></div>' : '<p class="dialog-description">本周暂无采价记录。</p>') + '</section></div>';
    app.openDetailPage(host, '量价分析明细', body, '', true);
  }
  app.pages['admin:analysis'] = function (container) {
    const defaults = { week: '2026-08-24', month: '2026-07' };
    let kind = 'week';
    const tabState = { week: { category: 'poultry' }, month: { category: 'poultry' } };
    container.innerHTML = '<div class="content-stack"><div class="section-tabs" role="tablist" aria-label="量价分析维度">' + ['week', 'month'].map(function (value) {
      return '<button type="button" class="section-tab" role="tab" id="analysis-tab-' + value + '" data-analysis-tab="' + value + '" aria-selected="' + (value === kind) + '" aria-controls="analysis-panel" tabindex="' + (value === kind ? '0' : '-1') + '">' + app.icon(value === 'week' ? 'calendar' : 'report') + '<span>' + (value === 'week' ? '周分析' : '月分析') + '</span></button>';
    }).join('') + '</div><div class="content-stack" role="tabpanel" id="analysis-panel" aria-labelledby="analysis-tab-week"><section class="panel"><form id="analysis-query" class="filter-form analysis-query" aria-label="量价分析条件">' +
      '<div class="form-field form-field--wide" data-period-field="week"><span>分析周</span><div id="analysis-week-picker"></div></div><label class="form-field form-field--wide" data-period-field="month" hidden><span>分析月份</span><input class="form-control" type="month" name="month" min="1901-01" max="2099-12" value="' + defaults.month + '" aria-describedby="analysis-error"></label><label class="form-field"><span>分析品类</span><select class="form-control" name="category"><option value="">全部品类</option>' + categories.map(function (category) { return '<option value="' + category.id + '"' + (category.id === 'poultry' ? ' selected' : '') + '>' + category.name + '</option>'; }).join('') + '</select></label><button class="button" type="button" data-action="reset">' + app.icon('reset') + '<span>重置</span></button></form><p id="analysis-error" class="field-error analysis-error" role="alert"></p></section><div id="analysis-result" class="content-stack"></div></div></div>';
    const form = container.querySelector('form');
    const weekPicker = app.searchSelect(container.querySelector('#analysis-week-picker'), 'week', '分析周', function () {
      return Array.from(new Set(store.flows.map(function (row) { return row.week; }).concat(app.priceStore.records.map(function (row) { return row.week.id; })))).sort().reverse().map(function (week) {
        return { id: week, name: week + ' 至 ' + app.priceData.dateAfter(week, 6) };
      });
    }, { emptyLabel: '请选择分析周', emptyMessage: '没有匹配的分析周', searchPlaceholder: '搜索周起始或结束日期', floating: true });
    weekPicker.setValue(defaults.week);
    app.enhanceCategorySelects(form);
    app.enhanceQueryControls(form);
    const output = container.querySelector('#analysis-result');
    let result;
    function render() {
      const missing = [];
      if (!form.elements.namedItem(kind).value) missing.push(kind === 'week' ? '分析周' : '分析月份');
      if (missing.length) {
        result = { valid: false };
        container.querySelector('#analysis-error').textContent = '';
        output.innerHTML = '<section class="panel empty-state">' + app.icon('calendar') + '<strong>请选择' + missing.join('和') + '</strong><p>补全分析条件后展示结果。</p></section>';
        return;
      }
      result = store.query({ kind: kind, date: form.elements.namedItem(kind).value, category: form.elements.namedItem('category').value });
      container.querySelector('#analysis-error').textContent = result.valid ? '' : result.message;
      if (!result.valid) { output.innerHTML = '<section class="panel empty-state">' + app.icon('calendar') + '<strong>请选择有效分析条件</strong><p>' + esc(result.message) + '</p></section>'; return; }
      const title = result.categoryId ? categoryName(result.categoryId) : '全部已映射品类';
      const description = result.start + ' 至 ' + result.end + ' · ' + title;
      const monthly = kind === 'month', periodName = monthly ? '月' : '周';
      const definitions = [['price', periodName + '均价', '元/吨'], ['inbound', periodName + '入库量', '吨'], ['outbound', periodName + '出库量', '吨'], ['closing', periodName + '末库存', '吨']];
      const kpis = definitions.map(function (metric) {
        const key = metric[0], value = result.totals[key], comparison = result.comparisons[key];
        const unavailable = key === 'price' && !result.categoryId ? '请分品类查看' : (key === 'price' ? '期间采价缺失或未复核' : '所需期间数量数据不足');
        return '<section class="panel metric-card"><p class="muted">' + metric[1] + '</p><p class="metric-value">' + num(value) + ' <span>' + metric[2] + '</span></p>' + (value == null ? '<p class="field-hint">' + unavailable + '</p>' : '') + '<div class="metric-comparisons"><p>环比 <span>' + esc(percent(comparison.previous, '上期')) + '</span></p><p>同比 <span>' + esc(percent(comparison.year, '去年同期')) + '</span></p></div></section>';
      }).join('');
      const overview = result.categoryId ? '' : '<section class="panel"><div class="panel-heading"><h2>分品类量价汇总</h2><span class="muted">共 ' + categories.length + ' 类 · 价格：元/吨 · 数量：吨</span></div><div class="table-scroll"><table class="data-table"><thead><tr><th>分析品类</th><th>期间均价</th><th>价格环比</th><th>价格同比</th><th>期间入库</th><th>期间出库</th><th>期末库存</th><th>操作</th></tr></thead><tbody>' + result.categorySummary.map(function (c) {
        return '<tr><td><span class="cell-primary">' + esc(c.name) + '</span><span class="cell-secondary">' + esc(c.group) + '</span></td><td class="numeric">' + num(c.totals.price) + '</td><td>' + esc(percent(c.priceChange, '上期')) + '</td><td>' + esc(percent(c.priceYear, '去年同期')) + '</td><td class="numeric">' + num(c.totals.inbound) + '</td><td class="numeric">' + num(c.totals.outbound) + '</td><td class="numeric">' + num(c.totals.closing) + '</td><td><button type="button" class="button button--text" data-trend-category="' + c.id + '">' + app.icon('chart') + '<span>查看分析</span></button></td></tr>';
      }).join('') + '</tbody></table></div></section>';
      const dates = result.series.map(function (row) { return row.week; });
      const columns = window.innerWidth > 1500 ? 2 : 1;
      const chartWidth = Math.max(540, (container.clientWidth - (columns - 1) * 24) / columns - 26);
      const quantityLines = [['inbound', '入库量'], ['outbound', '出库量'], ['closing', '期末库存']].map(function (metric) { return { name: metric[1], values: result.series.map(function (row) { return row[metric[0]]; }) }; });
      const rows = result.series.slice().reverse().map(function (row) {
        return '<tr><td>' + (row.start || row.week) + '<span class="cell-secondary">至 ' + row.end + (monthly ? ' · ' + row.days + ' 天' : '') + '</span></td><td class="numeric">' + num(row.price) + (row.price == null ? '<span class="cell-secondary">' + row.priceReason + '</span>' : '') + '</td><td class="numeric">' + num(row.inbound) + '</td><td class="numeric">' + num(row.outbound) + '</td><td class="numeric">' + num(row.closing) + '</td><td><button class="button button--text" data-week="' + row.week + '">' + app.icon('source') + '<span>明细与依据</span></button></td></tr>';
      }).join('');
      const references = result.references.map(function (item) { const source = app.sourceStore.find(item.sourceId); return '<li><strong>' + esc(item.title) + '</strong><p class="muted">' + esc(source.name + ' · 发布于 ' + item.publishedAt) + ' · 来源 V' + source.version + ' / 信息 V' + item.version + '</p><p>' + esc(item.displayContent || item.content) + '</p>' + (app.evidenceView ? app.evidenceView.reference({ id: item.id, sourceId: source.id, sourceUrl: source.url, infoUrl: item.infoUrl, validThrough: item.validThrough, infoVersion: item.version, sourceVersion: source.version, originalContent: item.content, resolution: item.resolution }) : '') + '</li>'; }).join('');
      const gaps = result.series.filter(function (row) { return row.inbound == null || (result.categoryId && row.price == null); }).length;
      const anomaly = result.anomalies.length ? result.anomalies.map(function (item) { return '<p>' + esc(item.week + ' · ' + item.category + '：' + item.text.replace('吨、基期', '吨、上周')) + '</p>'; }).join('') : '<p>可比较的已复核采价中，未触发周环比绝对值 ≥5% 的关注阈值。缺失点不参与判断。</p>';
      const supply = result.findings || (result.totals.inbound == null || result.totals.outbound == null ? '数量数据不足，暂不形成库存变化判断。' : '本期入库 ' + num(result.totals.inbound) + ' 吨、出库 ' + num(result.totals.outbound) + ' 吨，净入库 ' + num(result.totals.inbound - result.totals.outbound) + ' 吨。该差额反映库存流量变化，不能单独推断市场供需或价格方向。');
      const method = monthly ? '自然月按当月1日至月末统计。入出库量按原周数量分配至月内覆盖日后累计，库存取月末。月均价按各周已复核周均价及其月内覆盖天数加权；不是逐日采价。相关周采价缺失或未复核时，不计算月均价。' : '完整周按周一至周日统计。价格取该周已复核周均价，入出库量取周累计，库存取周末；未复核或缺失的采价不纳入价格分析。单周只有一个数据点，不推断期内趋势。';
      const comparisonMethod = monthly ? '上期为上一自然月，去年同期为上年同月；月累计天数可能不同。' : '上期为上一完整周，去年同期为上年对应ISO周，起止日期可能不同。';
      const charts = monthly ? '<div class="' + (result.categoryId ? 'analysis-charts' : 'content-stack') + '">' + (result.categoryId ? '<section class="panel"><div class="panel-heading"><h2>月内片段均价</h2><span class="muted">按月内覆盖日展示，缺失值断开</span></div>' + chart('price-trend', '月内片段均价', dates, result.priceSeries, '元/吨', chartWidth, result.series) + '</section>' : '') + '<section class="panel"><div class="panel-heading"><h2>月内出入库与库存</h2><span class="muted">首尾片段天数可能不同，点击查看期间</span></div>' + chart('quantity-trend', '月内出入库与库存', dates, quantityLines, '吨', result.categoryId ? chartWidth : Math.max(540, container.clientWidth - 26), result.series) + '</section></div>' : '';
      output.innerHTML = '<p class="muted analysis-period" role="status">' + description + '</p><div class="metric-grid">' + kpis + '</div>' +
        '<section class="panel analysis-method"><h2>统计口径</h2><p>' + method + '各品类价格分别统计，不跨品类平均。</p><p>上期：' + result.previousStart + ' 至 ' + result.previousEnd + '；去年同期：' + (result.yearStart ? result.yearStart + ' 至 ' + result.yearEnd : '上年无对应 ISO 周') + '。' + comparisonMethod + '环比＝（本期－上期）÷上期×100%；同比＝（本期－去年同期）÷去年同期×100%。用于比较的数据缺失或为零时，不计算对应变化率。</p><p>数量数据覆盖 2024-01-01 至 2026-09-06，按当前映射对本期、上期与去年同期使用同一口径；未映射原始名称 ' + result.unmapped + ' 个不纳入汇总。' + (gaps ? '当前 ' + gaps + ' 个统计片段存在所选指标数据不足。' : '所选指标数据完整。') + '</p></section>' +
        overview + charts +
        '<section class="panel"><div class="panel-heading"><h2>' + (monthly ? '月内量价明细' : '本周量价明细') + '</h2><span class="muted">价格：元/吨 · 数量：吨</span></div><div class="table-scroll"><table class="data-table"><thead><tr><th scope="col">数据期间</th><th scope="col">' + (monthly ? '片段均价' : '周均价格') + '</th><th scope="col">入库量</th><th scope="col">出库量</th><th scope="col">' + (monthly ? '片段期末库存' : '周末库存') + '</th><th scope="col">操作</th></tr></thead><tbody>' + rows + '</tbody></table></div></section>' +
        '<section class="panel"><div class="panel-heading"><h2>AI 分析参考</h2><span class="status-tag status-tag--warning">待复核 · 未发布</span></div><div class="analysis-body"><p class="field-hint">数据期间：' + description + '；生成时间：' + result.generatedAt + '；分析规则版本 V2；发布版本：无。</p><div class="signal-grid"><section><h2>价格与数据异常</h2>' + (monthly ? '<p class="field-hint">以下异常按相关原始整周与上周比较，跨月周包含月外日期，不作为月度环比；不同天数片段的数量差异不直接代表供需变化。</p>' : '') + anomaly + '<p>' + (gaps ? '所选指标数据不足 ' + gaps + ' 个统计片段，需先核对采价复核状态和数量数据覆盖。' : (result.categoryId ? '所选期间采价已复核，数量数据完整。' : '所选期间数量数据完整，采价采用情况按品类分别核对。')) + '</p></section><section><h2>库存与供需信号</h2><p>' + supply + '</p></section><section><h2>季节性判断</h2><p>' + esc(result.seasonal ? result.seasonal.text : '历史数据不足，暂不能确认季节性规律。') + '</p></section></div><p class="dialog-description">主要依据：每周平均采价、当前品类映射后的市场数量数据、下方已核验外部信息。仅供参考，不作为经营决策依据。</p><h2>本期已核验外部信息</h2><p class="field-hint">符合期间及品类条件 ' + result.references.length + ' 条；因来源或信息核验不满足条件排除 ' + result.excludedReferences + ' 条。</p>' + (references ? '<ul class="analysis-references">' + references + '</ul>' : '<p class="dialog-description">本期暂无匹配的已核验外部信息，不据此编造行业或供需结论。</p>') + '</div></section>';
      if (app.analysisInsights) output.insertAdjacentHTML('beforeend', app.analysisInsights.markup(result));
      if (app.publicationPolicy) output.insertAdjacentHTML('beforeend', app.publicationPolicy.markup(app.publicationPolicy.assess(result.start, result.end)));
    }
    function switchTab(next) {
      if (!['week', 'month'].includes(next) || next === kind) return;
      tabState[kind].category = form.elements.namedItem('category').value;
      weekPicker.element.open = false;
      kind = next;
      form.elements.namedItem('category').value = tabState[kind].category;
      form.querySelectorAll('[data-period-field]').forEach(function (field) { field.hidden = field.dataset.periodField !== kind; });
      container.querySelectorAll('[data-analysis-tab]').forEach(function (tab) {
        const selected = tab.dataset.analysisTab === kind;
        tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
      });
      container.querySelector('#analysis-panel').setAttribute('aria-labelledby', 'analysis-tab-' + kind);
      form.elements.namedItem('category').dispatchEvent(new Event('change', { bubbles: true }));
      container.querySelector('[data-analysis-tab="' + kind + '"]').focus();
    }
    container.addEventListener('click', function (event) {
      if (event.target.closest('dialog, .task-workspace')) return;
      const tab = event.target.closest('[data-analysis-tab]');
      if (tab) switchTab(tab.dataset.analysisTab);
    });
    container.addEventListener('keydown', function (event) {
      if (!event.target.closest('[data-analysis-tab]') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      switchTab(event.key === 'Home' ? 'week' : event.key === 'End' ? 'month' : kind === 'week' ? 'month' : 'week');
    });
    form.addEventListener('change', render);
    form.addEventListener('submit', function (event) { event.preventDefault(); render(); });
    container.querySelector('[data-action="reset"]').addEventListener('click', function () {
      if (kind === 'week') { weekPicker.reset(); weekPicker.setValue(defaults.week); }
      else form.elements.namedItem('month').value = defaults.month;
      form.elements.namedItem('category').value = 'poultry';
      form.elements.namedItem('category').dispatchEvent(new Event('change', { bubbles: true }));
    });
    function openPoint(event) {
      if (event.target.closest('dialog, .task-workspace')) return;
      const target = event.target.closest('[data-week]');
      if (target && result && result.valid) detail(container, result, target.dataset.week);
    }
    output.addEventListener('click', function (event) {
      const target = event.target.closest('[data-trend-category]');
      if (target) { form.elements.namedItem('category').value = target.dataset.trendCategory; form.elements.namedItem('category').dispatchEvent(new Event('change', { bubbles: true })); return; }
      openPoint(event);
    });
    output.addEventListener('keydown', function (event) {
      if (event.target.tagName.toLowerCase() === 'circle' && ['Enter', ' '].includes(event.key)) { event.preventDefault(); openPoint(event); }
    });
    render();
    if (window.ResizeObserver) {
      let width = container.clientWidth;
      const observer = new ResizeObserver(function () {
        if (!container.isConnected) { observer.disconnect(); return; }
        if (Math.abs(container.clientWidth - width) < 1) return;
        width = container.clientWidth; render();
      });
      observer.observe(container);
      window.addEventListener('hashchange', function () { observer.disconnect(); }, { once: true });
    }
  };
}());
