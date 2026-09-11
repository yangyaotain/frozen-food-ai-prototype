(function () {
  'use strict';
  const app = window.FrozenApp;
  const policy = 'P2 · 虚构市场汇总发布规则';
  function assess(start, end) {
    // 全市场虚构参与群体，非三个演示账号数。跨越受限周的所有品类/总计同时限制，避免差分披露。
    const cases = [{ start: '2026-06-01', end: '2026-06-07', count: 4, share: 0.4, reason: '水产品类参与商户不足5户' },
      { start: '2026-06-08', end: '2026-06-14', count: 12, share: 0.67, reason: '猪副品类最大单户贡献超过60%' }];
    const hit = cases.find(function (c) { return start <= c.end && end >= c.start; });
    return { policy: policy, scope: 'demo-market-a', start: start, end: end, allowed: !hit,
      count: hit ? hit.count : 18, maximumShare: hit ? hit.share : 0.48,
      reason: hit ? hit.reason + '；该期间全部市场汇总及引用该汇总的经营报告限制发布，包含总计、单品类、文字与图表。' : '样本不少于5户、最大单户贡献不超过60%；全部品类及总计同步检查通过。' };
  }
  function allowed(row) {
    const s = row && row.snapshot && row.snapshot.safety;
    return Boolean(s && s.policy === policy && s.scope === 'demo-market-a' && s.start === row.start && s.end === row.end && s.allowed === true && s.count >= 5 && s.maximumShare <= 0.6 && assessment(row.start, row.end, row.snapshot.categories).allowed);
  }
  function assessment(start, end, categories) {
    const main = assess(start, end); if (!main.allowed) return main;
    for (const c of categories || []) if (c.monthly) for (const key of ['previous', 'year']) { const base = c.monthly[key], result = assess(base.start, base.end); if (!result.allowed) return Object.assign({}, main, { allowed: false, reason: '月度对照期间' + base.start + '至' + base.end + '受限：' + result.reason }); }
    return main;
  }
  function visibility(row, live) {
    if (live) return '商户可见 V' + live.version + (row.version > live.version ? '；新版' + (row.status === 'approved' ? '待发布' : '待复核') : '');
    if (!row.snapshot.safety) return '旧版待重新检查';
    if (!allowed(row)) return '限制展示';
    return row.status === 'approved' ? '已复核，尚未发布' : '尚未发布';
  }
  function availability(rows) { return { unpublished: rows.some(function (r) { return r.status !== 'published'; }), legacy: rows.some(function (r) { return !r.snapshot.safety; }), restricted: rows.some(function (r) { return r.snapshot.safety && !allowed(r); }) }; }
  function message(value) { if (!value) return ''; return [value.legacy === true ? '部分历史版本待重新检查，暂不展示。' : '', value.restricted === true ? '部分内容因汇总展示规则暂不可见。' : '', value.unpublished === true ? '部分内容尚未完成审核发布。' : ''].filter(Boolean).join(''); }
  function requireAllowed(row) {
    if (allowed(row)) return;
    const current = assessment(row.start, row.end, row.snapshot.categories);
    const reason = !row.snapshot.safety ? '旧快照缺少汇总发布检查，仅保留历史留档，不可发布；后续周期内容生成后需重新复核。' : !current.allowed ? current.reason : row.snapshot.safety.reason;
    throw new Error('限制发布：' + reason);
  }
  function markup(s) { return '<aside class="notice">' + app.icon('info') + '<p><strong>市场汇总发布检查</strong> · ' + app.escape(s ? s.reason : '旧版本缺少发布检查，保留留档，暂不向商户同步。') + '</p></aside>'; }
  app.publicationPolicy = { assess: assess, assessment: assessment, allowed: allowed, requireAllowed: requireAllowed, markup: markup, visibility: visibility, availability: availability, message: message };
}());
