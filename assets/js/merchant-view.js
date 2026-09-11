(function () {
  'use strict';
  const app = window.FrozenApp, esc = app.presentation ? app.presentation.escape : app.escape;
  const num = app.bulletinView.num;
  const pct = function (p) { return p && p.value != null ? (p.value > 0 ? '+' : '') + num(p.value) + '%' : esc(p && p.reason || '数据不足'); };
  const prose = function (text) { return '<p class="mini-prose">' + esc(text) + '</p>'; };
  const note = function (text) { return '<p class="mini-muted">' + esc(text) + '</p>'; };
  function section(title, html) { return '<section class="mini-section"><h2>' + esc(title) + '</h2>' + html + '</section>'; }
  function fold(title, html) { return '<details class="mini-details"><summary><span>' + esc(title) + '</span>' + app.icon('down') + '</summary><div class="mini-details-body">' + html + '</div></details>'; }
  function pairs(items) { return '<dl class="mini-pairs">' + items.map(function (p) { return '<div><dt>' + esc(p[0]) + '</dt><dd>' + esc(p[1]) + '</dd></div>'; }).join('') + '</dl>'; }
  function datum(title, items) { return '<div class="mini-datum"><strong>' + esc(title) + '</strong>' + pairs(items) + '</div>'; }
  function metric(label, value, unit) { return '<div class="mini-metric"><span>' + esc(label) + '</span><strong>' + num(value) + '</strong><span>' + esc(unit) + '</span></div>'; }
  function metrics(items) { return '<div class="mini-metrics">' + items.map(function (i) { return metric(i[0], i[1], i[2]); }).join('') + '</div>'; }
  const disclaimer = '<p class="mini-disclaimer">' + app.icon('info') + '<span>仅供参考，不作为经营决策依据。</span></p>';
  function header(r, title) {
    return '<header><div class="mini-tags"><span class="mini-tag">AI 生成</span><span class="mini-tag">已复核发布 · V' + r.version + '</span></div><h2>' + esc(title || r.title) + '</h2>' + note(r.start + ' 至 ' + r.end) + (r.merchant ? note(r.merchant.name + ' · 本户专属') : '') + '</header>';
  }
  function sources(r) {
    const s = r.snapshot;
    return fold('数据口径、来源与发布版本', prose(s.method) + prose(s.sourceNote) + s.references.map(function (ref) {
      return '<div class="mini-datum"><strong>' + esc(ref.title) + '</strong>' + note(ref.sourceName + ' · ' + ref.publishedAt + ' · 来源 V' + ref.sourceVersion + ' / 信息 V' + ref.infoVersion) + prose(ref.content) + (ref.sourceUrl ? note('来源：' + ref.sourceUrl) : '') + (ref.infoUrl ? note('原文留档地址：' + ref.infoUrl) : '') + (ref.validThrough ? note('有效截止：' + ref.validThrough) : '') + '</div>';
    }).join('') + (!s.references.length ? note('本期没有匹配的已核验外部信息。') : '') + datum('生成与复核发布', [['生成时间', r.generatedAt], ['规则版本', s.ruleVersion], ['复核', r.review.actor + ' · ' + r.review.time], ['发布', r.publication.actor + ' · ' + r.publication.time], ['发布版本', 'V' + r.version]]) + (s.safety ? note('汇总发布检查：' + s.safety.reason + '') : '') + disclaimer);
  }
  function chart(rows, key, title, unit) {
    return '<div class="mini-chart" data-chart="' + esc(JSON.stringify({ rows: rows, key: key, title: title, unit: unit })) + '"><h3>' + esc(title) + '</h3><div data-plot></div><p class="mini-chart-note" data-chart-note role="status">点选趋势节点查看数值；完整期间数据可在下方展开。</p></div>';
  }
  function monthComparison(c) {
    const v = c.monthly; if (!v) return '';
    return fold(c.name + ' · 完整自然月对照', note('上月：' + v.previous.start + ' 至 ' + v.previous.end + '；上年同月：' + v.year.start + ' 至 ' + v.year.end + '。') + ['price', 'inbound', 'outbound', 'closing'].map(function (k) {
      return datum(({ price: '均价（元/吨）', inbound: '入库（吨）', outbound: '出库（吨）', closing: '月末库存（吨）' })[k], [['本月', num(c.totals[k])], ['上月', num(v.previous.totals[k])], ['环比变化量', num(v.changes.previous[k].delta)], ['环比', pct(v.changes.previous[k])], ['上年同月', num(v.year.totals[k])], ['同比变化量', num(v.changes.year[k].delta)], ['同比', pct(v.changes.year[k])]]);
    }).join('') + note('价格按覆盖天数加权，库存取月末；月天数不同，入出库比较月累计。') + ['previous', 'year'].map(function (key) { return v[key].missing.length ? note((key === 'previous' ? '上月' : '上年同月') + '缺失说明：' + v[key].missing.join('；')) : ''; }).join(''));
  }
  function market(r, categoryId) {
    const categories = r.snapshot.categories.filter(function (c) { return !categoryId || c.id === categoryId; });
    return '<article class="mini-document">' + header(r) + section('本期行情摘要', prose(r.summary) + (categoryId ? note('摘要保留整份发布内容；下方数据展示所选品类。') : '')) + categories.map(function (c) {
      const content = section(c.name + ' · 量价概况', metrics([[(r.kind === 'month' ? '估算月均价' : '周均价格'), c.totals.price, '元/吨'], ['期末库存', c.totals.closing, '吨'], ['期间入库', c.totals.inbound, '吨'], ['期间出库', c.totals.outbound, '吨']]) + chart(c.series, 'price', '价格走势', '元/吨') + chart(c.series, 'closing', '库存走势', '吨') + note(c.series.length === 1 ? '单周简报仅有一个数据点，不能据此判断期内趋势。' : '按简报内各周片段展示；片段首尾变化不是月度环比。') + (c.anomalies.length ? prose(c.anomalies.join('\n')) : '')) + fold(c.name + ' · 量价明细', c.series.map(function (p) { return datum(p.start + ' 至 ' + p.end, [['覆盖天数', p.days + ' 天'], ['价格', num(p.price) + ' 元/吨'], ['入库', num(p.inbound) + ' 吨'], ['出库', num(p.outbound) + ' 吨'], ['期末库存', num(p.closing) + ' 吨']]); }).join('')) + monthComparison(c);
      return categories.length > 1 ? fold(c.name + ' · 均价 ' + num(c.totals.price) + ' 元/吨', content) : content;
    }).join('') + fold('异常、季节与供需观察', prose(r.signals)) + sources(r) + disclaimer + '</article>';
  }
  function comparisons(s, kind) {
    const rows = s.categories.filter(function (c) { return c.change; });
    if (!rows.length) return '';
    return fold('本户与上期对照', rows.map(function (c) { const v = c.change; return datum(c.name + ' · 基期 ' + v.start + ' 至 ' + v.end, [['本期出库', num(c.own.outbound) + ' 吨'], ['上期出库', num(v.priorOutbound) + ' 吨'], ['出库环比', pct(v.outbound)], ['本期库存', num(c.own.closing) + ' 吨'], ['上期库存', num(v.priorClosing) + ' 吨'], ['库存环比', pct(v.closing)], ['本期库存占比', num(c.share) + '%'], ['上期库存占比', num(v.priorShare) + '%'], ['占比变化', num(v.shareDelta) + ' 个百分点']]); }).join('') + note((kind === 'month' ? '基期为上一自然月，月天数可能不同；' : '基期为紧邻之前同等周数；') + '仅使用本户数据，缺失或零基期不计算变化率。'));
  }
  function relatedMarket(r) {
    return fold('同期间市场参照与引用简报', r.snapshot.categories.map(function (c) { return datum(c.name, [['市场均价', c.market.price == null ? c.market.priceReason || '采价缺失或未复核' : num(c.market.price) + ' 元/吨'], ['价格环比', pct(c.market.priceChange)], ['市场入库', num(c.market.inbound) + ' 吨'], ['市场出库', num(c.market.outbound) + ' 吨'], ['市场期末库存', num(c.market.closing) + ' 吨']]); }).join('') + note('市场均价不是本户成交价；不同品类不混合计算价格。') + r.snapshot.bulletins.map(function (b, i) {
      return '<div class="mini-datum"><strong>' + esc(b.title) + '</strong>' + note(b.start + ' 至 ' + b.end + ' · V' + b.version) + app.merchantUI.button('reference', 'report', '查看引用简报', ' data-reference="' + i + '"') + '</div>';
    }).join('') + (!r.snapshot.bulletins.length ? note('本报告期间没有匹配的已发布简报，市场参照来自生成时的数据快照。') : ''));
  }
  function adviceContent(r) {
    const lines = r.advice.split(/\n\s*\n/).filter(Boolean);
    return section('本户经营建议', note('依据期间：' + r.start + ' 至 ' + r.end + ' · 与报告共同复核 V' + r.version) + lines.map(function (text) {
      const parts = text.split('\n'), title = parts[0];
      if (title === '资讯背景核对') return fold(title, prose(parts.slice(1).join('\n')));
      if (!r.snapshot.categories.some(function (c) { return c.name === title; })) return '<div class="mini-advice-item">' + prose(text) + '</div>';
      const observation = parts.filter(function (line) { return line.startsWith('观察：'); });
      const evidence = parts.slice(1).filter(function (line) { return !line.startsWith('观察：'); });
      return '<div class="mini-advice-item"><h3>' + esc(title) + '</h3>' + observation.map(prose).join('') + fold('量化依据、市场背景与适用边界', evidence.map(prose).join('')) + '</div>';
    }).join(''));
  }
  function report(r, advice) {
    const s = r.snapshot, t = s.totals;
    let html = header(r, advice ? '本户经营建议 · ' + app.reportView.periodLabel(r) : r.title);
    if (advice) {
      html += adviceContent(r) + fold('关注事项与经营分析', prose(r.signals)) + comparisons(s, r.kind) + relatedMarket(r) + section('适用范围与边界', prose('适用于' + r.merchant.name + '。仅基于本户数量与市场汇总，缺少订单、毛利、批次库龄、保质期等信息，不能据此确定采购、定价或库存处置决策。') + disclaimer);
    } else {
      html += section('经营概况', metrics([['期末库存', t.closing, '吨'], ['期间出库', t.outbound, '吨'], ['期间入库', t.inbound, '吨'], ['期初库存', t.opening, '吨']]) + prose(r.summary));
      html += section('周转表现', metrics([['周转天数', t.turnover.days, '天'], ['周转次数', t.turnover.times, '次 / 本期间']]) + pairs([['平均库存', num(t.turnover.average) + ' 吨'], ['期间天数', app.reportView.periodDays(r) + ' 天']]) + note(t.turnover.reason || '数量周转口径，非财务成本周转；周转关注阈值为28天。'));
      html += section('品类结构', note('按本户期末库存占比') + s.categories.map(function (c) { return '<div class="mini-datum"><strong>' + esc(c.name) + ' · ' + (c.share == null ? '无期末库存占比' : num(c.share) + '%') + '</strong>' + (c.share != null ? '<progress class="mini-structure" max="100" value="' + c.share + '" aria-label="' + esc(c.name + '库存占比') + '"></progress>' : '') + pairs([['期末库存', num(c.own.closing) + ' 吨'], ['期间出库', num(c.own.outbound) + ' 吨'], ['期间入库', num(c.own.inbound) + ' 吨'], ['周转天数', c.own.turnover.days == null ? c.own.turnover.reason || '无法计算' : num(c.own.turnover.days) + ' 天']]) + '</div>'; }).join(''));
      html += section('本户库存走势', chart(s.series, 'closing', r.kind === 'month' ? '片段期末库存' : '周末库存', '吨'));
      html += fold('本户周度出入库明细', s.series.map(function (w) { return datum(w.start + ' 至 ' + w.end, [['期初', num(w.opening) + ' 吨'], ['入库', num(w.inbound) + ' 吨'], ['出库', num(w.outbound) + ' 吨'], ['期末', num(w.closing) + ' 吨']]); }).join(''));
      html += comparisons(s, r.kind) + fold('本户商品名称与产地明细', s.rows.map(function (w) { const c = s.categories.find(function (v) { return v.id === w.categoryId; }); return datum(w.name + ' · ' + w.origin, [['品类', c.name], ['来源编码', w.rawId], ['映射版本', 'V' + w.mappingVersion], ['期初', num(w.opening) + ' 吨'], ['入库', num(w.inbound) + ' 吨'], ['出库', num(w.outbound) + ' 吨'], ['期末', num(w.closing) + ' 吨']]); }).join(''));
      html += fold('异常与经营分析', prose(r.signals)) + relatedMarket(r);
      html += fold('采价依据与版本', s.categories.map(function (c) { return '<div class="mini-datum"><strong>' + esc(c.name) + '</strong>' + c.market.prices.map(function (p) { return datum(p.week, [['价格', num(p.price) + ' 元/吨'], ['采价版本', p.id + ' · V' + p.version]]); }).join('') + '</div>'; }).join(''));
    }
    return '<article class="mini-document">' + html + sources(r) + disclaimer + '</article>';
  }
  function news(r) {
    return '<article class="mini-document"><header><div class="mini-tags"><span class="mini-tag">' + esc(app.newsView.types[r.type]) + '</span><span class="mini-tag">已核验发布</span></div><h2>' + esc(r.title) + '</h2>' + note(r.source.name + ' · ' + r.sourcePublishedAt) + note('适用品类：' + r.categories.map(function (c) { return c.name; }).join('、')) + '</header>' + '<section class="mini-section">' + prose(r.content) + '</section>' + fold('来源、核验与发布信息', pairs([['来源', r.source.name], ['来源地址', r.source.url], ['原文时间', r.sourcePublishedAt], ['核验', r.verification.actor + ' · ' + r.verification.time], ['平台发布', r.publication.actor + ' · ' + r.publication.time], ['来源版本', 'V' + r.source.version], ['信息版本', 'V' + r.version], ['发布版本', 'V' + r.publication.version], ['有效截止', r.validThrough || '旧版本未记录']])) + disclaimer + '</article>';
  }
  function card(r, mode, options) {
    options = options || {};
    const isNews = mode === 'news', isMarket = mode === 'market', advice = mode === 'advice';
    const title = isNews ? r.title : isMarket ? r.title : (advice ? '本户经营建议' : '本户经营报告') + ' · ' + app.reportView.periodLabel(r);
    let briefMetrics = '';
    if (options.feature && !isNews && !advice) {
      if (isMarket) {
        const selected = r.snapshot.categories.find(function (c) { return c.id === options.category; });
        briefMetrics = selected ? metrics([[selected.name + '均价', selected.totals.price, '元/吨'], [selected.name + '期末库存', selected.totals.closing, '吨']]) : '<div class="mini-quotes">' + r.snapshot.categories.slice(0, 6).map(function (c) { return '<div class="mini-quote"><span>' + esc(c.name) + '</span><strong>' + num(c.totals.price) + '<small>元/吨</small></strong></div>'; }).join('') + '</div>' + note('覆盖 ' + r.snapshot.categories.length + ' 个品类，进入详情查看完整行情。');
      }
      else briefMetrics = metrics([['期末库存', r.snapshot.totals.closing, '吨'], ['周转天数', r.snapshot.totals.turnover.days, '天']]);
    }
    return '<article class="mini-card' + (options.feature ? ' mini-feature' : '') + '"><a href="#' + esc(mode) + '" class="mini-card-link" data-open="' + esc(r.id) + '"><div class="mini-tags"><span class="mini-tag">' + esc(isNews ? app.newsView.types[r.type] : isMarket ? r.kind === 'week' ? '行情周报' : '行情月报' : '本户专属') + '</span>' + (!isNews ? '<span class="mini-muted">AI · 已发布 V' + r.version + '</span>' : '') + (options.unread ? '<span class="mini-tag mini-tag--unread">' + esc(options.unread) + '</span>' : '') + '</div><h2>' + esc(title) + '</h2>' + note(isNews ? r.source.name + ' · ' + r.sourcePublishedAt.slice(0, 10) : r.start + ' 至 ' + r.end) + briefMetrics + '<p class="mini-excerpt">' + esc(isNews ? r.content : advice ? r.advice : r.summary) + '</p><div class="mini-card-foot"><span>' + esc(isNews ? r.categories.map(function (c) { return c.name; }).join(' / ') : r.publication.time.slice(0, 10) + ' 发布') + '</span></div></a></article>';
  }
  // Actual CSS width drives chart coordinates. Font remains the shared 12px token.
  function charts(root) {
    const charts = Array.from(root.querySelectorAll('[data-chart]'));
    function draw(node) {
      const spec = JSON.parse(node.dataset.chart), plot = node.querySelector('[data-plot]');
      const rows = spec.rows, values = rows.map(function (r) { return r[spec.key]; }).filter(Number.isFinite);
      if (!values.length) { plot.textContent = '暂无可用趋势数据'; return; }
      const width = Math.max(180, Math.round(node.getBoundingClientRect().width)), left = 64, right = width - 16, low = Math.min(...values), high = Math.max(...values), pad = Math.max((high - low) * 0.2, high * 0.02, 1), min = Math.max(0, low - pad), max = high + pad;
      const x = function (i) { return rows.length === 1 ? (left + right) / 2 : left + i * (right - left) / (rows.length - 1); }, y = function (v) { return 130 - (v - min) / (max - min) * 100; };
      let pen = false;
      const path = rows.map(function (r, i) { if (!Number.isFinite(r[spec.key])) { pen = false; return ''; } const p = (pen ? 'L' : 'M') + x(i) + ',' + y(r[spec.key]); pen = true; return p; }).join(' ');
      const lastIndex = rows.length - 1;
      plot.innerHTML = '<svg width="' + width + '" height="166" role="group" aria-label="' + esc(spec.title + '，单位' + spec.unit) + '"><line x1="' + left + '" y1="130" x2="' + right + '" y2="130" class="bulletin-gridline"/><line x1="' + left + '" y1="30" x2="' + right + '" y2="30" class="bulletin-gridline"/><text x="' + (left - 8) + '" y="34" text-anchor="end">' + Math.round(max) + '</text><text x="' + (left - 8) + '" y="134" text-anchor="end">' + Math.round(min) + '</text><path d="' + path + '" class="bulletin-line"/>' + rows.map(function (r, i) { return Number.isFinite(r[spec.key]) ? '<circle cx="' + x(i) + '" cy="' + y(r[spec.key]) + '" r="20" data-point="' + i + '" tabindex="0" role="button" aria-label="' + esc(r.start + '，' + num(r[spec.key]) + spec.unit) + '"/><circle cx="' + x(i) + '" cy="' + y(r[spec.key]) + '" r="4" class="mini-chart-dot"/>' : ''; }).join('') + '<text x="' + left + '" y="158">' + esc(rows[0].start.slice(5)) + '</text><text x="' + right + '" y="158" text-anchor="end">' + esc(rows[lastIndex].end.slice(5)) + '</text></svg>';
    }
    function select(e) { if (e.type === 'keydown' && !['Enter', ' '].includes(e.key)) return; const point = e.target.closest('[data-point]'); if (!point) return; e.preventDefault(); const node = point.closest('[data-chart]'), s = JSON.parse(node.dataset.chart), r = s.rows[Number(point.dataset.point)]; node.querySelector('[data-chart-note]').textContent = r.start + ' 至 ' + r.end + ' · ' + s.title + ' ' + num(r[s.key]) + ' ' + s.unit; }
    charts.forEach(draw);
    root.addEventListener('click', select); root.addEventListener('keydown', select);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(function (entries) { entries.forEach(function (e) { draw(e.target); }); }) : null;
    if (observer) charts.forEach(function (c) { observer.observe(c); });
    return function () { if (observer) observer.disconnect(); root.removeEventListener('click', select); root.removeEventListener('keydown', select); };
  }
  app.merchantView = { market: market, report: report, news: news, card: card, charts: charts, disclaimer: disclaimer };
}());
