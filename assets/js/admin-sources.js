(function () {
  'use strict';
  const app = window.FrozenApp;
  const esc = app.presentation ? app.presentation.escape : app.escape;
  const data = app.sourceData;
  const store = app.sourceStore;
  function tag(state, item) {
    const meta = (item ? data.itemStates : data.sourceStates)[state];
    return '<span class="status-tag status-tag--' + meta.style + '">' + meta.name + '</span>';
  }
  function names(ids) { return ids.map(function (id) { return data.categories.find(function (category) { return category.id === id; }).name; }).join('、'); }
  function btn(action, icon, text, primary, extra, compact) { return '<button type="button" class="button' + (primary ? ' button--primary' : '') + (compact ? ' button--text' : '') + '" data-action="' + action + '" ' + (extra || '') + '>' + app.icon(icon) + '<span>' + text + '</span></button>'; }
  function field(name, title, control, full) { return '<label class="form-field' + (full ? ' span-full' : '') + '"><span>' + title + '</span>' + control + '<small class="field-error" id="source-error-' + name + '" data-error="' + name + '"></small></label>'; }
  function input(name, value, limit, type) { return '<input class="form-control" name="' + name + '" type="' + (type || 'text') + '" value="' + esc(value || '') + '" maxlength="' + limit + '" aria-describedby="source-error-' + name + '">'; }
  function itemHistoryType(log) {
    const before = log.before, after = log.after;
    if (!after.sourceId) return '';
    const classification = after.type || (after.publication && after.publication.type);
    return (before && before.type && before.type !== classification ? '资讯分类：' + data.types[before.type] + ' → ' : '资讯分类：') + (data.types[classification] || '原记录未记录') + (after.publication ? '；平台发布：' + after.publication.publication.time + ' · V' + after.publication.publication.version : '');
  }
  function history(logs) {
    return '<ol class="history-list">' + logs.slice().reverse().map(function (log) {
      return '<li><div class="history-heading"><strong>' + esc(log.action) + '</strong><span class="muted">' + esc(log.actor + ' · ' + log.at) + '</span></div><p>' + esc(log.opinion) + '</p><p class="history-change">' +
        (log.sourceVersion ? '核验依据来源版本：V' + log.sourceVersion + '；' : '') + '记录版本：V' + log.after.version + (itemHistoryType(log) ? '；' + esc(itemHistoryType(log)) : '') + '</p></li>';
    }).join('') + '</ol>';
  }
  function sourceSummary(source) {
    return '<dl class="detail-grid"><div><dt>来源名称</dt><dd>' + esc(source.name) + '</dd></div><div><dt>默认资讯分类</dt><dd>' + data.types[source.type] + '</dd></div><div><dt>来源地址</dt><dd>' + esc(source.url) + '</dd></div><div><dt>适用品类</dt><dd>' + esc(names(source.categories)) + '</dd></div><div><dt>信息范围</dt><dd>' + esc(source.scope) + '</dd></div><div><dt>确认状态 / 版本</dt><dd>' + tag(source.status) + ' V' + source.version + '</dd></div></dl>';
  }
  function edit(host, id, changed) {
    const source = id ? store.find(id) : null;
    const version = source ? source.version : null;
    const typeOptions = Object.keys(data.types).map(function (type) { return '<option value="' + type + '"' + (source && source.type === type ? ' selected' : '') + '>' + data.types[type] + '</option>'; }).join('');
    const choices = data.categories.map(function (category) { return '<label class="check-choice"><input type="checkbox" name="categories" value="' + category.id + '"' + (source && source.categories.includes(category.id) ? ' checked' : '') + '><span>' + category.name + '</span></label>'; }).join('');
    const body = '<form id="source-edit" class="edit-grid" novalidate autocomplete="off">' +
      field('name', '来源名称 *', input('name', source && source.name, 60)) + field('type', '默认资讯分类 *', '<select class="form-control" name="type" aria-describedby="source-error-type">' + typeOptions + '</select>') +
      field('url', '来源地址 *', '<input class="form-control" type="url" id="external-source-address" name="sourceAddress" autocomplete="off" spellcheck="false" maxlength="300" placeholder="请输入来源网站或栏目地址，以 https:// 开头" aria-describedby="source-error-url" value="' + esc(source ? source.url : '') + '">', true) +
      '<fieldset class="choice-field span-full" aria-describedby="source-error-categories"><legend>适用品类 *</legend><div class="check-group">' + choices + '</div><small class="field-error" id="source-error-categories" data-error="categories"></small></fieldset>' +
      field('scope', '信息范围 *', '<textarea class="form-control" name="scope" maxlength="200" aria-describedby="source-error-scope" placeholder="描述信息涵盖的内容范围，最多 200 字">' + esc(source ? source.scope : '') + '</textarea>', true) + '</form>';
    const dialog = app.openDialog(host, source ? '编辑资讯来源' : '新增资讯来源', body,
      '<button class="button" type="button" data-close>' + app.icon('close') + '<span>取消</span></button><button type="submit" class="button button--primary" form="source-edit">' + app.icon('check') + '<span>保存来源</span></button>');
    const form = dialog.querySelector('form');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      const value = Object.fromEntries(['name', 'type', 'scope'].map(function (name) { return [name, form.elements.namedItem(name).value]; }));
      value.url = form.elements.namedItem('sourceAddress').value;
      const associated = id ? store.items.filter(function (i) { return i.sourceId === id; }) : [];
      const publishedCount = associated.filter(function (i) { return i.publication; }).length;
      value.categories = Array.from(form.querySelectorAll('[name="categories"]:checked')).map(function (element) { return element.value; });
      const result = store.save(value, id, version);
      if (!result.valid) {
        form.querySelectorAll('[data-error]').forEach(function (node) { node.textContent = result.errors[node.dataset.error] || ''; });
        form.querySelectorAll('input, select, textarea').forEach(function (node) { node.setAttribute('aria-invalid', result.errors[node.name === 'sourceAddress' ? 'url' : node.name] ? 'true' : 'false'); });
        form.querySelector('[aria-invalid="true"]').focus(); return;
      }
      dialog.close(); changed(result.unchanged ? '来源资料未变化。' : !id ? '来源已保存，待确认来源。' : '来源已更新，待重新确认。' + (associated.length ? '关联 ' + associated.length + ' 条信息需重新核验。' : '') + (publishedCount ? '其中 ' + publishedCount + ' 条已发布资讯暂停展示。' : ''), result.source.id);
    });
  }
  function sourceDetail(host, id, changed) {
    const source = store.find(id);
    if (!source) return;
    const version = source.version;
    const form = source.status === 'pending' ? '<form id="source-confirm"><label class="form-field"><span>来源确认依据 *</span><textarea class="form-control" name="opinion" maxlength="200" placeholder="填写对来源及适用范围的确认依据" aria-describedby="confirm-error"></textarea></label><p id="confirm-error" class="field-error" role="alert"></p></form>' : '';
    const dialog = app.openDetailPage(host, '来源详情与确认', '<div class="content-stack">' + sourceSummary(source) +
      '<p class="dialog-description">来源确认仅针对当前来源资料与范围，关联信息仍需各自核验。</p>' + form + '<section><h2>来源维护与确认记录</h2>' + history(source.history) + '</section></div>',
      '<button class="button" type="button" data-close>' + app.icon('close') + '<span>关闭</span></button>' + (form ? '<button class="button button--primary" type="submit" form="source-confirm">' + app.icon('check') + '<span>确认来源</span></button>' : ''), { editable: Boolean(form) });
    if (form) dialog.querySelector('form').addEventListener('submit', function (event) {
      event.preventDefault();
      const result = store.confirm(id, version, dialog.querySelector('textarea').value);
      if (!result.valid) { dialog.querySelector('#confirm-error').textContent = result.message; dialog.querySelector('textarea').focus(); return; }
      dialog.close(); changed('来源已确认，关联信息的核验状态保持独立。', id);
    });
  }
  function markAbnormal(host, id, changed) {
    const item = store.findItem(id);
    const version = item.version;
    const dialog = app.openDialog(host, '标记异常信息', '<p class="dialog-description">' + esc(item.title) + '</p><form id="source-flag"><label class="form-field"><span>异常原因 *</span><textarea class="form-control" name="reason" maxlength="200" placeholder="描述需要人工核对的问题" aria-describedby="flag-error"></textarea></label><p id="flag-error" class="field-error" role="alert"></p></form>',
      '<button class="button" type="button" data-close>' + app.icon('close') + '<span>取消</span></button><button class="button button--primary" type="submit" form="source-flag">' + app.icon('check') + '<span>转人工核验</span></button>');
    dialog.querySelector('form').addEventListener('submit', function (event) {
      event.preventDefault();
      const result = store.flag(id, version, dialog.querySelector('textarea').value);
      if (!result.valid) { dialog.querySelector('#flag-error').textContent = result.message; dialog.querySelector('textarea').focus(); return; }
      dialog.close(); changed('已标记异常，信息进入待核验；原已发布资讯暂停商户展示。');
    });
  }
  function article(text) {
    return '<div class="source-article">' + String(text || '').split(/\n\s*\n/).filter(Boolean).map(function (part) {
      const lines = part.split('\n');
      return lines.length > 1 && lines[0].length < 32 ? '<section><h3>' + esc(lines.shift()) + '</h3><p class="detail-note">' + esc(lines.join('\n')) + '</p></section>' : '<p class="detail-note">' + esc(part) + '</p>';
    }).join('') + '</div>';
  }
  function itemDetail(host, id, changed) {
    const item = store.findItem(id);
    if (!item) return;
    const source = store.find(item.sourceId);
    const version = item.version;
    const eligible = store.eligible(item);
    const copyLabel = item.publication ? '已发布正文' : item.status === 'verified' ? '已核验展示稿' : item.status === 'rejected' ? '未通过核验的展示稿' : '待核验展示稿';
    const form = item.status === 'pending' ? '<form id="info-verify" class="task-review-form"><label class="form-field"><span>核验结论</span><select class="form-control" name="decision"><option value="verified">核验通过</option><option value="rejected">核验不通过</option></select></label><p class="field-hint">核验通过要求来源已确认，且信息品类在来源范围内。未确认来源的信息可记录不通过结论。</p><label class="form-field"><span>核验意见 *</span><textarea class="form-control editor-textarea--summary" name="opinion" maxlength="200" placeholder="填写核验依据，或说明不通过原因" aria-describedby="verify-error"></textarea></label><label class="check-choice"><input type="checkbox" name="displayChecked"><span>通过前确认：资讯分类、处理方式、有效依据与实际展示稿一致；未将过期或未解决内容作为现行信息。</span></label><p class="field-error" id="verify-error" role="alert"></p></form>' : '';
    const body = '<div class="content-stack"><h2>' + esc(item.displayTitle || item.title) + '</h2><dl class="detail-grid"><div><dt>当前来源</dt><dd>' + esc(source.name) + ' / V' + source.version + ' ' + tag(source.status) + '</dd></div><div><dt>信息来源留档</dt><dd>' + esc(item.sourceSnapshot.name) + ' / V' + item.sourceSnapshot.version + '<span class="cell-secondary">' + esc(item.sourceSnapshot.url) + '</span></dd></div><div><dt>原文发布时间 / 适用品类</dt><dd>' + esc(item.publishedAt) + ' / ' + esc(names(item.categories)) + '</dd></div><div><dt>资讯分类</dt><dd>' + esc(data.types[item.type]) + '</dd></div><div><dt>发布位置</dt><dd>小程序 → 行业资讯 → ' + esc(data.types[item.type]) + '</dd></div><div><dt>核验状态</dt><dd>' + tag(item.status, true) + '</dd></div></dl>' +
      (item.obtainedAt ? '<dl class="detail-grid"><div><dt>获取时间</dt><dd>' + esc(item.obtainedAt) + '</dd></div><div><dt>获取批次</dt><dd>' + esc(item.collectionBatchId) + '</dd></div></dl>' : '') +
      (item.abnormal ? '<aside class="notice">' + app.icon('info') + '<p><strong>原始异常标识</strong>：' + esc(item.abnormal) + '。核验后保留此标识，处理结果以核验记录为准。</p></aside>' : '') +
      '<div class="task-compare"><section class="source-original"><h2>原文留档</h2><p class="field-hint">' + esc(item.infoUrl || item.sourceSnapshot.url) + '</p>' + article(item.content) + '</section><section><h2>' + copyLabel + '</h2><h3>' + esc(item.displayTitle || item.title) + '</h3>' + article(item.displayContent || item.content) + '<p>有效截止：' + esc(item.validThrough || '原版本未记录') + '；核验问题：' + esc(({ expired: '过期', conflict: '来源冲突', unverifiable: '无法验证', period: '期间不一致', source: '来源未确认' })[item.issueType] || item.issueType || '无异常') + '</p><p class="detail-note">处理方式：' + esc(({ updated: '更新为现行信息', corrected: '统一口径或核实来源', unresolved: '尚未解决' })[item.treatment] || (item.issueType ? '尚未整理' : '无异常')) + '\n处理依据：' + esc(item.resolution || '尚未填写') + '</p></section></div><p class="dialog-description">' + (eligible ? '当前来源及信息核验通过，可供后续分析参考。核验通过不代表已发布。' : '当前信息暂不作为已核验分析依据。请查看来源状态、适用范围及核验记录。') + '</p>' + form +
      '<p class="field-hint">资讯发布状态：' + esc(app.newsActions.state(item)) + '</p><section><h2>核验及发布过程记录</h2>' + history(item.history) + '</section></div>';
    if (form) {
      const meta = '<dl class="detail-grid"><div><dt>当前来源</dt><dd>' + esc(source.name) + ' / V' + source.version + ' · ' + esc(data.sourceStates[source.status].name) + '</dd></div><div><dt>原文发布时间</dt><dd>' + esc(item.publishedAt) + '</dd></div><div><dt>资讯分类</dt><dd>' + esc(data.types[item.type]) + '</dd></div><div><dt>适用品类</dt><dd>' + esc(names(item.categories)) + '</dd></div></dl>';
      const compare = '<h2>' + esc(item.displayTitle || item.title) + '</h2>' + (item.abnormal ? '<aside class="notice">' + app.icon('info') + '<p><strong>原始异常标识</strong>：' + esc(item.abnormal) + '。核验后保留此标识，处理结果以核验记录为准。</p></aside>' : '') + '<div class="task-compare"><section><h2>原文留档</h2><p class="field-hint source-address">' + esc(item.infoUrl || item.sourceSnapshot.url) + '</p>' + article(item.content) + '</section><section><h2>待核验展示稿</h2><h3>' + esc(item.displayTitle || item.title) + '</h3>' + article(item.displayContent || item.content) + '<p class="detail-note">有效截止：' + esc(item.validThrough || '原版本未记录') + '\n处理方式：' + esc(({ updated: '更新为现行信息', corrected: '统一口径或核实来源', unresolved: '尚未解决' })[item.treatment] || (item.issueType ? '尚未整理' : '无异常')) + '\n处理依据：' + esc(item.resolution || '尚未填写') + '</p></section></div>';
      const aside = '<h2>核验处理</h2>' + form + '<details class="bulletin-data"><summary>核验及发布过程记录</summary>' + history(item.history) + '</details>';
      const workspace = app.openTaskWorkspace(host, { title: '信息详情与核验', description: '请对照原文、展示稿、资讯分类和处理依据后记录核验结论。', status: tag(item.status, true), meta: meta, main: compare, aside: aside, actions: '<button class="button" type="button" data-workspace-flag>' + app.icon('info') + '<span>标记异常</span></button><button class="button button--primary" type="submit" form="info-verify">' + app.icon('check') + '<span>保存核验结果</span></button>', onClose: function (message) { if (message) changed(message); } });
      workspace.element.querySelector('[data-workspace-flag]').addEventListener('click', function () { workspace.discard(function () { markAbnormal(host, id, changed); }); });
      workspace.element.querySelector('form').addEventListener('submit', function (event) {
        event.preventDefault(); const controls = event.target.elements;
        const result = store.verify(id, version, controls.namedItem('decision').value, controls.namedItem('opinion').value, controls.namedItem('displayChecked').checked);
        if (!result.valid) { workspace.element.querySelector('#verify-error').textContent = result.message; controls.namedItem('opinion').focus(); return; }
        workspace.complete('核验结果已保存：' + data.itemStates[result.item.status].name + '。');
      });
      return;
    }
    const dialog = app.openDetailPage(host, '资讯详情与记录', body,
      '<button class="button" type="button" data-close>' + app.icon('close') + '<span>关闭</span></button>' + btn('flag-info', 'info', '标记异常') + (form ? '<button class="button button--primary" type="submit" form="info-verify">' + app.icon('check') + '<span>保存核验结果</span></button>' : ''), true);
    dialog.querySelector('[data-action="flag-info"]').addEventListener('click', function () {
      dialog.addEventListener('close', function () { markAbnormal(host, id, changed); }, { once: true }); dialog.close();
    });

  }
  app.pages['admin:sources'] = function (container) {
    let view = 'items';
    const state = { sources: { applied: {}, page: 1 }, items: { applied: {}, page: 1 } };
    let activeSource = '';
    let pageSize = 10;
    let feedback = '';
    function screen() {
      const isItems = view === 'items';
      const states = isItems ? data.itemStates : data.sourceStates;
      container.innerHTML = '<div class="content-stack"><div class="section-tabs" role="tablist" aria-label="行业资讯">' +
        [['items', 'check', '资讯管理'], ['sources', 'source', '来源管理']].map(function (tab) { return '<button type="button" class="section-tab" role="tab" id="sources-tab-' + tab[0] + '" data-source-tab="' + tab[0] + '" aria-selected="' + (view === tab[0]) + '" aria-controls="sources-panel" tabindex="' + (view === tab[0] ? '0' : '-1') + '">' + app.icon(tab[1]) + '<span>' + tab[2] + '</span></button>'; }).join('') + '</div><div class="content-stack" role="tabpanel" id="sources-panel" aria-labelledby="sources-tab-' + view + '">' +
        '<p id="sources-feedback" class="action-feedback" role="status" aria-live="polite"' + (feedback ? '' : ' hidden') + '>' + esc(feedback) + '</p>' +
        (isItems && activeSource ? '<div class="button-group"><span>当前来源：' + esc(store.find(activeSource).name) + '</span>' + btn('clear-source', 'close', '查看全部来源信息') + '</div>' : '') +
        '<section class="panel"><form class="filter-form" id="sources-query" role="search" aria-label="行业资讯查询">' + (isItems ? '<label class="form-field"><span>资讯分类</span><select class="form-control" name="type"><option value="">全部分类</option>' + Object.keys(data.types).map(function (type) { return '<option value="' + type + '">' + data.types[type] + '</option>'; }).join('') + '</select></label>' : '') + '<label class="form-field"><span>适用品类</span><select class="form-control" name="category"><option value="">全部品类</option>' + data.categories.map(function (category) { return '<option value="' + category.id + '">' + category.name + '</option>'; }).join('') + '</select></label><label class="form-field"><span>' + (isItems ? '核验状态' : '确认状态') + '</span><select name="status" class="form-control"><option value="">全部状态</option>' + Object.keys(states).map(function (id) { return '<option value="' + id + '">' + states[id].name + '</option>'; }).join('') + '</select></label>' +
        (isItems ? '<label class="form-field"><span>发布状态</span><select class="form-control" name="publication"><option value="">全部状态</option><option value="unpublished">未发布</option><option value="ready">待发布</option><option value="published">已发布</option><option value="paused">暂停展示</option></select></label><label class="form-field"><span>异常标识</span><select class="form-control" name="abnormal"><option value="">全部信息</option><option value="yes">含异常标识</option></select></label>' : '') +
        '<label class="form-field form-field--wide"><span>' + (isItems ? '信息标题 / 来源' : '来源名称 / 地址') + '</span><span class="input-with-icon">' + app.icon('search') + '<input class="form-control" type="search" name="keyword" maxlength="100" placeholder="输入关键词" autocomplete="off"></span></label><div class="button-group"><button class="button button--primary" type="submit">' + app.icon('search') + '<span>查询</span></button>' + btn('reset', 'reset', '重置') + '</div></form></section>' +
        '<section class="panel"><div class="panel-heading"><h2>' + (isItems ? '资讯列表' : '资讯来源列表') + '</h2>' + (isItems ? '<span class="muted">来源确认与信息核验分别记录</span>' : btn('create', 'plus', '新增来源', true)) + '</div><div class="table-scroll" tabindex="0" role="region" aria-label="' + (isItems ? '资讯表' : '资讯来源表') + '，可横向滚动"><table class="data-table"><thead><tr>' +
        (isItems ? '<th scope="col">信息标题 / 来源</th><th scope="col">适用品类</th><th scope="col">原文发布时间</th><th scope="col">核验状态</th><th scope="col">发布状态</th><th scope="col">异常标识</th>' : '<th scope="col">来源名称 / 默认分类</th><th scope="col">适用品类 / 信息范围</th><th scope="col">确认状态</th><th scope="col">关联信息</th><th scope="col">获取配置 / 下次获取</th><th scope="col">最近获取</th>') +
        '<th scope="col" class="table-actions">操作</th></tr></thead><tbody id="sources-rows"></tbody></table></div><div class="pagination"><p id="sources-count" class="muted" role="status" aria-live="polite"></p><div class="pagination-controls"><label class="page-size">每页<select class="form-control" id="sources-size" aria-label="每页记录数"><option value="10">10</option><option value="20">20</option><option value="50">50</option></select>条</label><div class="button-group">' + btn('previous', 'previous', '上一页') + '<span class="page-position" id="sources-position"></span>' + btn('next', 'next', '下一页') + '</div></div></div></section></div></div>';
      const form = container.querySelector('form');
      for (const key of ['category', 'status', 'keyword', 'abnormal', 'type', 'publication']) { const control = form.elements.namedItem(key); if (control) control.value = state[view].applied[key] || ''; }
      app.enhanceCategorySelects(form);
      app.enhanceQueryControls(form);
      container.querySelector('#sources-size').value = pageSize;
      form.addEventListener('submit', function (event) { event.preventDefault(); query(); });
      form.addEventListener('change', function (event) { if (event.target.tagName === 'SELECT') query(); });
      container.querySelector('#sources-size').addEventListener('change', function (event) { pageSize = Number(event.target.value); query(); });
      render();
    }
    function query() {
      const form = container.querySelector('form');
      const applied = {};
      for (const key of ['category', 'status', 'keyword', 'abnormal', 'type', 'publication']) { const control = form.elements.namedItem(key); if (control) applied[key] = control.value; }
      state[view].applied = applied; state[view].page = 1; render();
    }
    function filtered() { return view === 'items' ? store.queryItems(Object.assign({}, state.items.applied, { sourceId: activeSource })) : store.querySources(state.sources.applied); }
    function render() {
      const list = filtered(); const current = state[view];
      const pages = Math.max(1, Math.ceil(list.length / pageSize)); current.page = Math.max(1, Math.min(current.page, pages));
      const start = (current.page - 1) * pageSize; const visible = list.slice(start, start + pageSize);
      container.querySelector('#sources-rows').innerHTML = visible.length ? visible.map(function (record) {
        if (view === 'items') return '<tr><td class="wrap-cell"><span class="cell-primary">' + esc(record.displayTitle || record.title) + '</span><span class="badge">' + esc(data.types[record.type]) + '</span><span class="cell-secondary">' + esc(store.find(record.sourceId).name) + '</span><p class="source-excerpt">' + esc((record.displayContent || record.content).split('\n')[0]) + '</p></td><td class="wrap-cell">' + esc(names(record.categories)) + '</td><td>' + esc(record.publishedAt) + '</td><td>' + tag(record.status, true) + '</td><td>' + esc(app.newsActions.state(record)) + '</td><td class="wrap-cell">' + esc(record.abnormal || '无') + '</td><td class="table-actions"><div class="row-actions">' + btn('item-detail', 'check', record.status === 'pending' ? '详情与核验' : '详情与记录', false, 'data-record="' + record.id + '"', true) + btn('edit-news', 'edit', '整理展示稿', false, 'data-record=' + String.fromCharCode(34) + record.id + String.fromCharCode(34), true) + (store.eligible(record) && !record.publication ? btn('publish-news', 'upload', '发布资讯', false, 'data-record="' + record.id + '"', true) : '') + '</div></td></tr>';
        const linked = store.items.filter(function (item) { return item.sourceId === record.id; });
        const acquisition = app.collectionStore ? app.collectionStore.summary(record) : null;
        const c = acquisition && acquisition.config;
        return '<tr><td class="wrap-cell"><span class="cell-primary">' + esc(record.name) + '</span><span class="cell-secondary">' + data.types[record.type] + '</span><span class="cell-secondary source-address">' + esc(record.url) + '</span></td><td class="wrap-cell">' + esc(names(record.categories)) + '<span class="cell-secondary">' + esc(record.scope) + '</span></td><td>' + tag(record.status) + '</td><td>' + linked.length + ' 条<span class="cell-secondary">待核验 ' + linked.filter(function (item) { return item.status === 'pending'; }).length + ' 条</span></td><td class="wrap-cell">' + (c ? '<span class="status-tag status-tag--' + (c.status === 'error' ? 'danger' : c.enabled && acquisition.available ? 'success' : 'warning') + '">' + esc(acquisition.label) + '</span><span class="cell-secondary">' + esc(c.enabled ? app.sourceCollection.schedules[c.schedule] : '按需手动获取') + '</span><span class="cell-secondary">' + esc(acquisition.next) + '</span>' : '尚未配置') + '</td><td class="wrap-cell">' + esc(c && c.lastAt || '尚未获取') + '<span class="cell-secondary">' + esc(c && c.lastResult || '尚未执行获取任务') + '</span></td><td class="table-actions"><div class="row-actions source-row-actions">' +
          btn('source-detail', 'check', record.status === 'pending' ? '确认' : '详情', false, 'data-record="' + record.id + '"', true) + btn('edit', 'edit', '编辑', false, 'data-record="' + record.id + '"', true) + btn('linked', 'source', '关联信息', false, 'data-record="' + record.id + '"', true) +
          (c ? btn('collection-config', 'calendar', '获取设置', false, 'data-record="' + record.id + '"', true) + btn('collection-records', 'history', '获取记录', false, 'data-record="' + record.id + '"', true) + btn('collect', 'download', c.running ? '获取中' : '立即获取', false, 'data-record="' + record.id + '"' + (!acquisition.available || c.running ? ' disabled' : ''), true) : '') + '</div></td></tr>';
      }).join('') : '<tr><td colspan="7" class="empty-cell"><div class="empty-state">' + app.icon('search') + '<strong>暂无符合条件的记录</strong><p>请调整查询条件。新增来源暂无关联信息。</p></div></td></tr>';
      container.querySelector('#sources-count').textContent = list.length ? '共 ' + list.length + ' 条 · 当前显示第 ' + (start + 1) + '–' + (start + visible.length) + ' 条' : '共 0 条 · 暂无匹配记录';
      container.querySelector('#sources-position').textContent = list.length ? '第 ' + current.page + ' / ' + pages + ' 页' : '暂无分页';
      container.querySelector('[data-action="previous"]').disabled = current.page <= 1;
      container.querySelector('[data-action="next"]').disabled = current.page >= pages;
    }
    function changed(message, sourceId) {
      render(); feedback = message;
      if (sourceId && view === 'sources' && !filtered().some(function (source) { return source.id === sourceId; })) feedback += ' 当前筛选未包含该来源，可调整条件查看。';
      const node = container.querySelector('#sources-feedback'); node.hidden = false; node.textContent = feedback;
    }
    container.addEventListener('click', function (event) {
      if (event.target.closest('dialog, .task-workspace')) return;
      const tab = event.target.closest('[data-source-tab]');
      if (tab) { switchTab(tab.dataset.sourceTab); return; }
      const target = event.target.closest('[data-action]'); if (!target || target.disabled) return;
      const action = target.dataset.action; const id = target.dataset.record;
      if (action === 'reset') { container.querySelector('form').reset(); query(); }
      if (action === 'previous') { state[view].page--; render(); }
      if (action === 'next') { state[view].page++; render(); }
      if (action === 'create' || action === 'edit') edit(container, id, changed);
      if (action === 'source-detail') sourceDetail(container, id, changed);
      if (action === 'collection-records') app.collectionActions.openRecords(container, id);
      if (action === 'collection-config') app.collectionActions.edit(container, id, changed);
      if (action === 'collect') app.collectionStore.run(id, 'manual').then(function (result) { if (container.isConnected) changed(result.message, id); });
      if (action === 'item-detail') itemDetail(container, id, changed);
      if (action === 'edit-news') app.newsActions.edit(container, id, changed);
      if (action === 'publish-news') app.newsActions.publish(container, id, changed);
      if (action === 'linked') { view = 'items'; activeSource = id; state.items = { applied: {}, page: 1 }; screen(); }
      if (action === 'clear-source') { activeSource = ''; state.items.page = 1; query(); screen(); }
    });
    function switchTab(next) {
      if (!['sources', 'items'].includes(next)) return;
      if (next !== view) { view = next; feedback = ''; screen(); }
      container.querySelector('[data-source-tab="' + next + '"]').focus();
    }
    container.addEventListener('keydown', function (event) {
      const tab = event.target.closest('[data-source-tab]');
      if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      switchTab(event.key === 'Home' ? 'items' : event.key === 'End' ? 'sources' : view === 'sources' ? 'items' : 'sources');
    });
    screen();
    if (app.collectionStore) {
      const unsubscribe = app.collectionStore.subscribe(function () { if (container.isConnected) render(); else unsubscribe(); });
      app.sourcePageCleanup = unsubscribe;
    }
  };
}());
