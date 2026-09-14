(function () {
  'use strict';
  const app = window.FrozenApp, esc = app.presentation ? app.presentation.escape : app.escape;
  const types = app.newsTypes;
  function names(row) { return row.categories.map(function (c) { return c.name; }).join('、'); }
  function highlights(row) { return '<ul class="news-highlights">' + (row.highlights || []).map(function (point) { return '<li>' + esc(point) + '</li>'; }).join('') + '</ul>'; }
  function article(text) {
    return '<div class="source-article">' + String(text || '').split(/\n\s*\n/).filter(Boolean).map(function (part) {
      const lines = part.split('\n');
      return lines.length > 1 && lines[0].length < 32 ? '<section><h3>' + esc(lines.shift()) + '</h3><p class="detail-note">' + esc(lines.join('\n')) + '</p></section>' : '<p class="detail-note">' + esc(part) + '</p>';
    }).join('') + '</div>';
  }
  function card(row) {
    return '<article class="panel market-card"><div class="market-card-body"><div class="bulletin-labels"><span class="badge">' + esc(types[row.type]) + '</span></div><h2>' + esc(row.title) + '</h2><p class="field-hint">' + esc(row.source.name) + ' · 原文发布 ' + esc(row.sourcePublishedAt) + '</p><p class="market-card-summary report-card-excerpt">' + esc(row.summary || row.content) + '</p><p class="field-hint">适用品类：' + esc(names(row)) + '</p></div><div class="market-card-footer"><span class="field-hint">信息 V' + row.version + '</span><button class="button button--text" type="button" data-news-id="' + esc(row.id) + '">' + app.icon('source') + '<span>查看资讯</span></button></div></article>';
  }
  function detail(row) {
    const lead = String(row.summary || '').trim(), original = String(row.content || '').trim();
    const content = lead && original.startsWith(lead) ? original.slice(lead.length).replace(/^\s+/, '') : original;
    return '<article class="panel bulletin-document"><header class="bulletin-document-head"><div class="bulletin-labels"><span class="badge">' + esc(types[row.type]) + '</span></div><h2>' + esc(row.title) + '</h2><p class="field-hint">原文发布时间：' + esc(row.sourcePublishedAt) + '</p><p class="field-hint">适用品类：' + esc(names(row)) + '</p></header><section class="bulletin-section"><h2>资讯摘要</h2><p class="bulletin-prose">' + esc(lead || row.content) + '</p></section>' + ((row.highlights || []).length ? '<section class="bulletin-section"><h2>核心要点</h2>' + highlights(row) + '</section>' : '') + '<section class="bulletin-section"><h2>资讯正文</h2>' + article(content || original) + '</section>' + (row.attention ? '<section class="bulletin-section"><h2>关注事项</h2><aside class="news-attention"><p>' + esc(row.attention) + '</p></aside></section>' : '') + '<section class="bulletin-section"><h2>来源与核验信息</h2><p>来源：' + esc(row.source.name) + '</p><p class="field-hint">来源地址：' + esc(row.source.url) + '</p><p class="field-hint">来源 V' + row.source.version + ' · 信息 V' + row.version + '</p><p class="field-hint">核验：' + esc(row.verification.actor + ' · ' + row.verification.time) + '</p>' + (row.publication ? '<p class="field-hint">平台发布：' + esc(row.publication.actor + ' · ' + row.publication.time + ' · 发布 V' + row.publication.version) + '</p>' : '') + '<p class="field-hint">有效截止：' + esc(row.validThrough || '旧版本未记录') + '</p></section></article>';
  }
  app.newsView = { types: types, card: card, detail: detail };
}());
