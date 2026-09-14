(function () {
  'use strict';
  const app = window.FrozenApp, store = app.sourceStore, esc = app.presentation ? app.presentation.escape : app.escape;
  function state(item) { const value = store.publicationState(item); return value === 'published' ? '已发布 V' + item.releaseVersion : value === 'ready' ? '待发布' : value === 'paused' ? '暂停展示 · 待重新核验' : '未发布'; }
  function summary(item) { return item.displaySummary || (item.displayContent || item.content).split(/\n\s*\n/)[0]; }
  function highlights(item) { return Array.isArray(item.displayHighlights) ? item.displayHighlights.filter(Boolean) : []; }
  function article(text) {
    return '<div class="source-article">' + String(text || '').split(/\n\s*\n/).filter(Boolean).map(function (part) {
      const lines = part.split('\n');
      return lines.length > 1 && lines[0].length < 32 ? '<section><h3>' + esc(lines.shift()) + '</h3><p class="detail-note">' + esc(lines.join('\n')) + '</p></section>' : '<p class="detail-note">' + esc(part) + '</p>';
    }).join('') + '</div>';
  }
  function structured(item, options) {
    options = options || {};
    const lead = summary(item), points = highlights(item), original = String(item.displayContent || item.content || '').trim();
    const content = lead && original.startsWith(lead) ? original.slice(lead.length).replace(/^\s+/, '') : original;
    const body = options.body === false ? '' : '<section><h3>发布正文</h3>' + article(content || original) + '</section>';
    return '<div class="news-structured"><section><h3>内容摘要</h3><p class="news-summary">' + esc(lead) + '</p></section><section><h3>核心要点</h3>' + (points.length ? '<ul class="news-highlights">' + points.map(function (point) { return '<li>' + esc(point) + '</li>'; }).join('') + '</ul>' : '<p class="field-hint">尚未整理</p>') + '</section>' + body + '<aside class="news-attention"><strong>关注事项</strong><p>' + esc(item.displayAttention || '尚未整理') + '</p></aside></div>';
  }
  function publish(host, id, changed) {
    const item = store.findItem(id); if (!item) return;
    const version = item.version, source = store.find(item.sourceId), sourceVersion = source.version;
    const dialog = app.openDialog(host, '发布行业资讯', '<p class="dialog-description">逐篇核验通过后，将当前资讯发布到商户端。来源变更或重新标记异常会暂停展示，重新核验后需再次发布。</p><h2>' + esc(item.displayTitle || item.title) + '</h2>' + structured(item, { body: false }) + '<dl class="detail-grid"><div class="span-full"><dt>发布位置</dt><dd>小程序 → 行业资讯 → ' + esc(app.sourceData.types[item.type]) + '</dd></div><div><dt>适用品类</dt><dd>' + esc(item.categories.map(function (id) { return app.categoryCatalog.find(id).name; }).join('、')) + '</dd></div><div><dt>来源</dt><dd>' + esc(source.name) + ' · V' + sourceVersion + '</dd></div><div><dt>信息版本</dt><dd>V' + version + '</dd></div></dl><p class="field-error" role="alert"></p>', '<button class="button" type="button" data-close>' + app.icon('close') + '<span>取消</span></button><button class="button button--primary" type="button" data-news-publish>' + app.icon('upload') + '<span>确认发布</span></button>');
    dialog.querySelector('[data-news-publish]').addEventListener('click', function () {
      const result = store.publish(id, version, sourceVersion);
      if (!result.valid) { dialog.querySelector('[role="alert"]').textContent = result.message; return; }
      dialog.close(); changed('资讯已发布，发布版本及正文已留存。');
    });
  }
  function edit(host, id, changed) {
    const item = store.findItem(id); if (!item) return;
    const version = item.version, source = store.find(item.sourceId);
    const main = '<h2>展示稿编辑</h2><form id="news-workspace-edit" class="task-workspace-form"><div class="edit-grid"><label class="form-field"><span>资讯分类 *</span><select class="form-control" name="type" required>' + Object.keys(app.sourceData.types).map(function (type) { return '<option value="' + type + '"' + (item.type === type ? ' selected' : '') + '>' + app.sourceData.types[type] + '</option>'; }).join('') + '</select></label><label class="form-field"><span>展示有效截止日期</span><input class="form-control" name="until" type="date" value="' + esc(item.validThrough || '2026-09-30') + '"></label></div><label class="form-field"><span>发布标题 *</span><input class="form-control" name="title" maxlength="100" value="' + esc(item.displayTitle || item.title) + '"></label><label class="form-field"><span>内容摘要 *</span><textarea class="form-control editor-textarea--summary" name="summary" minlength="20" maxlength="200">' + esc(summary(item)) + '</textarea><small class="field-hint">20–200字，用于小程序列表和详情导语。</small></label><label class="form-field"><span>核心要点 *</span><textarea class="form-control editor-textarea--summary" name="highlights" maxlength="403">' + esc(highlights(item).join('\n')) + '</textarea><small class="field-hint">填写2–4条，每行一条、每条不超过100字。</small></label><label class="form-field"><span>发布正文 *</span><textarea class="form-control editor-textarea--article" name="content" maxlength="3000">' + esc(item.displayContent || item.content) + '</textarea><small class="field-hint">正文可用短标题与空行分节，详情页按原顺序连续展示。</small></label><label class="form-field"><span>关注事项 *</span><textarea class="form-control editor-textarea--summary" name="attention" minlength="20" maxlength="300">' + esc(item.displayAttention || '') + '</textarea><small class="field-hint">说明适用边界、需要持续核对的事项或不能直接推导的结论。</small></label><div class="edit-grid"><label class="form-field"><span>问题处理方式</span><select class="form-control" name="treatment">' + [['unresolved', '尚未解决，不作为有效资讯发布'], ['updated', '已取得新依据，更新为现行信息'], ['corrected', '已统一口径或核实来源，修正展示稿']].map(function (v) { return '<option value="' + v[0] + '"' + ((item.treatment || (item.issueType ? 'unresolved' : 'corrected')) === v[0] ? ' selected' : '') + '>' + v[1] + '</option>'; }).join('') + '</select></label></div><label class="form-field"><span>核验处理依据 *</span><textarea class="form-control editor-textarea--summary" name="resolution" maxlength="500">' + esc(item.resolution || '') + '</textarea><small class="field-hint">说明过期、冲突或无法验证的问题如何处理。过期条目不能只修改日期。</small></label><p class="field-error" role="alert"></p></form>';
    const aside = '<h2>原文留档</h2><dl class="detail-grid"><div class="span-full"><dt>原文标题</dt><dd>' + esc(item.title) + '</dd></div><div><dt>来源</dt><dd>' + esc(source.name) + '</dd></div><div><dt>原文发布时间</dt><dd>' + esc(item.publishedAt) + '</dd></div><div class="span-full"><dt>原文地址</dt><dd class="source-address">' + esc(item.infoUrl || item.sourceSnapshot.url) + '</dd></div></dl><div class="source-article"><p class="detail-note">' + esc(item.content) + '</p></div>';
    const meta = '<dl class="detail-grid"><div><dt>当前版本</dt><dd>V' + version + '</dd></div><div><dt>核验状态</dt><dd>' + esc(app.sourceData.itemStates[item.status].name) + '</dd></div><div><dt>发布状态</dt><dd>' + esc(state(item)) + '</dd></div><div><dt>适用品类</dt><dd>' + esc(item.categories.map(function (categoryId) { return app.categoryCatalog.find(categoryId).name; }).join('、')) + '</dd></div></dl>';
    const workspace = app.openTaskWorkspace(host, { title: '整理资讯展示稿', mode: 'edit', description: '原文保持不变；修改展示稿后进入待核验，原发布内容暂停展示。', status: '<span class="status-tag status-tag--warning">编辑中</span>', meta: meta, main: main, aside: aside, actions: '<button type="submit" form="news-workspace-edit" class="button button--primary">' + app.icon('check') + '<span>保存并进入待核验</span></button>', onClose: function (message) { if (message) changed(message); } });
    workspace.element.querySelector('form').addEventListener('submit', function (event) {
      event.preventDefault(); const result = store.editDisplay(id, version, Object.fromEntries(new FormData(event.currentTarget)));
      if (!result.valid) { workspace.element.querySelector('[role="alert"]').textContent = result.message; return; }
      workspace.complete(result.unchanged ? '内容未变化，保留原版本、核验和发布状态。' : '展示稿已保存，原文未改变；请重新核验后单独发布。');
    });
  }
  app.newsActions = { state: state, summary: summary, highlights: highlights, structured: structured, publish: publish, edit: edit };
}());
