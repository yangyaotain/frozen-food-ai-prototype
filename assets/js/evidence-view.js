(function () {
  'use strict';
  const app = window.FrozenApp, esc = app.presentation ? app.presentation.escape : app.escape;
  function capture(analysis, start, end, ids, ownRows) {
    const checks = [], batches = [], details = [], applied = [];
    let week = start; while (new Date(week + 'T00:00:00Z').getUTCDay() !== 1) week = app.priceData.dateAfter(week, -1);
    for (; week <= end; week = app.priceData.dateAfter(week, 7)) {
      batches.push({ id: 'FLOW-' + week, version: Math.max(1, ...analysis.flows.filter(function (r) { return r.week === week; }).map(function (r) { return r.version || 1; })), week: week });
      ids.forEach(function (id) {
        const row = analysis.weekly(week, id); checks.push.apply(checks, row.issues || []); if (!row.complete) checks.push({ level: 'block', text: week + ' / ' + id + ' 数量缺失或异常' }); if (row.price == null) checks.push({ level: 'exclude', text: week + ' / ' + id + ' 采价缺失或未复核' });
        row.rows.forEach(function (r) { const mapping = app.categoryStore.find(r.rawId); details.push({ rawId: r.rawId, name: r.name, origin: r.origin, categoryId: id, mappingVersion: mapping.version, week: week, batchId: r.batchId || 'FLOW-' + week, version: r.version || 1, opening: r.opening, inbound: r.inbound, outbound: r.outbound, closing: r.closing }); });
        if (row.complete) {
          const first = start > week ? start : week, last = end < row.end ? end : row.end;
          const part = function (total, i) { const cents = Math.round(total * 100), base = Math.floor(cents / 7); return (i === 6 ? cents - base * 6 : base) / 100; };
          let inbound = 0, outbound = 0, closing = row.closing - row.inbound + row.outbound;
          for (let i = 0; i < 7; i++) { const date = app.priceData.dateAfter(week, i); if (date > last) break; const inc = part(row.inbound, i), out = part(row.outbound, i); closing += inc - out; if (date >= first) { inbound += inc; outbound += out; } }
          const round = function (n) { return Math.round(n * 100) / 100; };
          applied.push({ categoryId: id, week: week, start: first, end: last, inbound: round(inbound), outbound: round(outbound), closing: round(closing) });
        }
      });
    }
    if (checks.some(function (c) { return c.level === 'block'; })) throw new Error('数据质量检查未通过，停止生成：' + checks.filter(function (c) { return c.level === 'block'; }).map(function (c) { return c.text; }).join('；'));
    const unmapped = app.categoryStore.records.filter(function (r) { return !r.categoryId; });
    if (unmapped.length) checks.push({ level: 'exclude', text: '未映射记录排除：' + unmapped.map(function (r) { return r.id; }).join('、') });
    return { id: 'DQ-' + start + '-' + end + '-' + ids.join('-'), at: new Date().toISOString(), batches: batches, checks: checks, details: details, applied: applied, ownDetails: ownRows ? JSON.parse(JSON.stringify(ownRows)) : [], rule: 'Q3 · 完整性、重复、非负数量、库存勾稽；未复核采价/未映射名称排除；冻结原周明细及期间采用量' };
  }
  function reference(ref) {
    return '<details class="bulletin-data"><summary>查看来源留档与引用版本</summary><dl class="detail-grid"><div><dt>信息 / 来源编码</dt><dd>' + esc(ref.id || '旧版本未记录') + ' / ' + esc(ref.sourceId || '旧版本未记录') + '</dd></div><div><dt>信息原文地址留档</dt><dd class="detail-note">' + esc(ref.infoUrl || ref.sourceUrl || '旧版本未记录') + '</dd></div><div><dt>引用版本</dt><dd>来源 V' + ref.sourceVersion + ' / 信息 V' + ref.infoVersion + '</dd></div><div><dt>有效截止</dt><dd>' + esc(ref.validThrough || '旧版本未记录') + '</dd></div></dl>' + (ref.originalContent ? '<h3>原文留档</h3><p class="detail-note">' + esc(ref.originalContent) + '</p><p class="detail-note">处理依据：' + esc(ref.resolution || '初始核验记录') + '</p>' : '') + '<p class="field-hint">显示引用时快照，不随当前来源修改。</p></details>';
  }
  function quality(q) {
    if (!q) return '';
    function table(rows, own) { return '<div class="table-scroll"><table class="data-table compact-table"><thead><tr><th>原始名称 / 品类</th><th>周 / 批次版本</th><th>期初（吨）</th><th>入库（吨）</th><th>出库（吨）</th><th>期末（吨）</th></tr></thead><tbody>' + rows.map(function (r) { return '<tr><td>' + esc(r.name + ' / ' + r.categoryId) + '<span class="cell-secondary">' + esc(r.rawId + ' · ' + r.origin + ' · 映射V' + r.mappingVersion) + '</span></td><td>' + esc(r.week) + '<span class="cell-secondary">' + esc((own ? r.merchantId + ' · ' + r.usage + ' · ' : '') + r.batchId + ' / V' + r.version) + '</span></td>' + ['opening', 'inbound', 'outbound', 'closing'].map(function (k) { return '<td>' + Number(r[k]).toFixed(2) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>'; }
    const raw = q.details ? '<h3>市场原周数量留档</h3>' + table(q.details, false) + '<h3>按品类实际采用的期间数量</h3><p class="field-hint">自然月先按品类汇总原周数量，再按周内均分并将舍入余数分配至周日；跨月周只采用下列日期。入出库累加，库存取最后日期。</p><div class="table-scroll"><table class="data-table compact-table"><thead><tr><th>品类 / 采用期间</th><th>入库（吨）</th><th>出库（吨）</th><th>期末（吨）</th></tr></thead><tbody>' + q.applied.map(function (r) { return '<tr><td>' + esc(r.categoryId + ' / ' + r.start + ' 至 ' + r.end) + '</td>' + ['inbound', 'outbound', 'closing'].map(function (k) { return '<td>' + r[k].toFixed(2) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' : '<p>旧版本未保存数量明细，保留原始留档；后续周期内容记录完整依据，原版不回填。</p>';
    return '<section class="bulletin-section"><details class="bulletin-data"><summary>查看生成时数据质量报告及数量批次</summary><p>' + esc(q.id + ' · ' + q.at) + '</p><p>' + esc(q.rule) + '</p><ul>' + q.checks.map(function (c) { return '<li>' + esc(c.level + ' · ' + c.text) + '</li>'; }).join('') + '</ul><p class="detail-note">' + q.batches.map(function (b) { return esc(b.id + ' / V' + b.version + ' · ' + b.week); }).join('；') + '</p>' + raw + (q.ownDetails && q.ownDetails.length ? '<h3>本户本期及环比基期原周明细</h3>' + table(q.ownDetails, true) : '') + '<p>检查与数量在生成时冻结，不回读当前上游；普通查询不新增过程日志。内部明细不传递商户端。</p></details></section>';
  }
  app.evidenceView = { capture: capture, reference: reference, quality: quality };
}());
