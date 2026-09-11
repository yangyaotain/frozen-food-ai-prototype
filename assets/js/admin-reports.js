(function () {
  'use strict';
  const app = window.FrozenApp, esc = app.presentation ? app.presentation.escape : app.escape, store = app.reportStore, states = app.reportData.states;
  function button(action, icon, label, type) { return '<button type="button" class="button' + (type ? ' button--' + type : '') + '" data-action="' + action + '">' + app.icon(icon) + '<span>' + label + '</span></button>'; }
  function status(row) { return '<span class="status-tag status-tag--' + states[row.status].style + '">' + states[row.status].name + '</span>'; }
  function merchantOptions(all) { return (all ? '<option value="">全部商户</option>' : '') + app.reportData.merchants.map(function (m) { return '<option value="' + m.id + '">' + m.name + '</option>'; }).join(''); }
  function linkSnapshots(surface, host, row) {
    surface.addEventListener('click', function (event) {
      const button = event.target.closest('[data-report-bulletin]'); if (!button) return;
      const snapshot = row.snapshot.bulletins[Number(button.dataset.reportBulletin)];
      if (snapshot) app.openDetailPage(host, '引用的市场简报 · V' + snapshot.version, app.bulletinView.render(snapshot), '', true);
    });
  }
  function detail(host, row) { const dialog = app.openDetailPage(host, '经营报告与建议 · V' + row.version, app.reportView.render(row), '', true); linkSnapshots(dialog, host, row); }
  function history(host, row) {
    const versions = store.versions(row.id);
    function copyText(copy) { return Object.keys(copy).map(function (key) { return ({ title: '标题', summary: '摘要', signals: '分析', advice: '建议' })[key] + '：' + copy[key]; }).join('\n'); }
    const dialog = app.openDetailPage(host, '报告及建议版本记录', '<div class="bulletin-versions">' + versions.map(function (v) {
      return '<section class="bulletin-version"><header><strong>V' + v.version + ' · ' + esc(v.merchant.name) + '</strong>' + status(v) + '<button class="button" type="button" data-version="' + v.version + '">' + app.icon('report') + '<span>查看版本</span></button></header><ol>' + v.history.map(function (h) { return '<li><strong>' + esc(h.action) + '</strong><p class="field-hint">' + esc(h.actor + ' · ' + h.time) + '</p><p>' + esc(h.opinion) + '</p>' + (h.before ? '<details><summary>修改前后</summary><div class="task-compare"><section><h3>修改前</h3><p class="detail-note">' + esc(copyText(h.before)) + '</p></section><section><h3>修改后</h3><p class="detail-note">' + esc(copyText(h.after)) + '</p></section></div></details>' : '') + '</li>'; }).join('') + '</ol></section>';
    }).join('') + '</div>', '', true);
    dialog.addEventListener('click', function (event) { if (event.target.closest('dialog, .task-workspace') !== dialog) return; const target = event.target.closest('[data-version]'); if (target) detail(host, store.get(row.id, target.dataset.version)); });
  }
  function edit(host, row, refresh) {
    const limits = app.reportData.textLimits(row);
    const main = '<h2>报告与建议文字</h2><form id="report-workspace-edit" class="task-workspace-form"><section class="task-workspace-section"><label class="form-field"><span>报告标题</span><input class="form-control" name="title" maxlength="' + limits.title + '" required value="' + esc(row.title) + '"></label><label class="form-field"><span>经营概要</span><textarea class="form-control editor-textarea--summary" name="summary" maxlength="' + limits.summary + '" required>' + esc(row.summary) + '</textarea></label><label class="form-field"><span>异常与经营分析</span><textarea class="form-control editor-textarea--body" name="signals" maxlength="' + limits.signals + '" required>' + esc(row.signals) + '</textarea></label></section><section class="task-workspace-section"><h2>本户经营建议</h2><label class="form-field"><span>建议正文</span><textarea class="form-control editor-textarea--advice" name="advice" maxlength="' + limits.advice + '" required>' + esc(row.advice) + '</textarea><small class="field-hint">参考声明与适用边界仍按当前报告固定展示。</small></label></section><p class="field-error" role="alert"></p></form>';
    const meta = '<dl class="detail-grid"><div><dt>报告商户</dt><dd>' + esc(row.merchant.name) + '</dd></div><div><dt>报告类型</dt><dd>' + esc(app.reportView.periodLabel(row)) + '</dd></div><div><dt>数据期间</dt><dd>' + row.start + ' 至 ' + row.end + '</dd></div><div><dt>当前版本 / 状态</dt><dd>V' + row.version + ' · ' + esc(states[row.status].name) + '</dd></div></dl>';
    const workspace = app.openTaskWorkspace(host, { title: '编辑报告与建议 · V' + row.version, mode: 'edit', description: '本户、期间和数据快照保持不变；修改任一文字后共同重新待复核。', status: status(row), meta: meta, main: main, aside: '<h2>保存前报告与数据依据</h2><div class="task-reading">' + app.reportView.render(row) + '</div>', actions: '<button class="button button--primary" type="submit" form="report-workspace-edit">' + app.icon('check') + '<span>共同保存</span></button>', onClose: function (message) { if (message) refresh(message); } });
    linkSnapshots(workspace.element, host, row);
    workspace.element.querySelector('form').addEventListener('submit', function (event) { event.preventDefault(); try { const saved = store.edit(row.id, row.version, row.revision, Object.fromEntries(new FormData(event.currentTarget))); workspace.complete('保存完成 · ' + states[saved.status].name + '。'); } catch (error) { workspace.element.querySelector('[role="alert"]').textContent = error.message; } });
  }
  function review(host, row, refresh) {
    const body = '<h2>共同复核</h2><form id="report-workspace-review" class="task-review-form"><label class="form-field"><span>共同复核结论</span><select name="decision" class="form-control"><option value="approved">通过</option><option value="revision">退回修改</option></select></label><fieldset class="choice-field"><legend>通过前请逐项确认</legend><div class="check-group"><label class="check-choice"><input type="checkbox" name="report"><span>已核对本户、期间、数据和周转口径</span></label><label class="check-choice"><input type="checkbox" name="advice"><span>已核对建议依据、适用边界和参考声明</span></label></div></fieldset><label class="form-field"><span>复核意见</span><textarea class="form-control editor-textarea--summary" name="opinion" maxlength="500" required></textarea></label><p class="field-error" role="alert"></p><p class="field-hint">报告与建议共同通过后仍需单独发布。</p></form>';
    const meta = '<dl class="detail-grid"><div><dt>报告商户</dt><dd>' + esc(row.merchant.name) + '</dd></div><div><dt>报告类型</dt><dd>' + esc(app.reportView.periodLabel(row)) + '</dd></div><div><dt>数据期间</dt><dd>' + row.start + ' 至 ' + row.end + '</dd></div><div><dt>当前版本</dt><dd>V' + row.version + '</dd></div></dl>';
    const workspace = app.openTaskWorkspace(host, { title: '报告及建议共同复核 · V' + row.version, description: '请完整核对本户数据、周转口径、市场参照、建议依据和适用边界。', status: status(row), meta: meta, main: '<h2>待复核报告与建议全文</h2><div class="task-reading">' + app.reportView.render(row) + '</div>', aside: body, actions: '<button class="button button--primary" type="submit" form="report-workspace-review">' + app.icon('check') + '<span>提交复核</span></button>', onClose: function (message) { if (message) refresh(message); } });
    linkSnapshots(workspace.element, host, row);
    workspace.element.querySelector('form').addEventListener('submit', function (event) {
      event.preventDefault(); const fields = event.currentTarget.elements;
      try { const saved = store.review(row.id, row.version, row.revision, fields.decision.value, fields.opinion.value, { report: fields.report.checked, advice: fields.advice.checked }); workspace.complete('复核已记录 · ' + states[saved.status].name + '。'); }
      catch (error) { workspace.element.querySelector('[role="alert"]').textContent = error.message; }
    });
  }
  function publish(host, row, refresh) {
    const dialog = app.openDialog(host, '发布报告及建议', '<p class="dialog-description">本次发布对象为 ' + esc(row.merchant.name) + '，报告与建议共同发布为 V' + row.version + '；旧版本保留在历史中。发布后商户可查看本户相同版本的报告与建议。</p><dl class="detail-grid"><div><dt>期间</dt><dd>' + row.start + ' 至 ' + row.end + '</dd></div><div><dt>复核人及时间</dt><dd>' + esc(row.review.actor + ' · ' + row.review.time) + '</dd></div><div class="span-full"><dt>共同复核意见</dt><dd>' + esc(row.review.opinion) + '</dd></div></dl><p role="alert" class="field-error"></p>', button('confirm', 'upload', '确认发布', 'primary'));
    dialog.querySelector('[data-action="confirm"]').addEventListener('click', function () { try { store.publish(row.id, row.version, row.revision); dialog.close(); refresh('报告与建议 V' + row.version + ' 已共同发布至 ' + row.merchant.name + '。'); } catch (error) { dialog.querySelector('[role="alert"]').textContent = error.message; } });
  }
  app.reportActions = { detail: detail };
  app.pages['admin:reports'] = function (container) {
    container.innerHTML = '<div class="content-stack">' + app.generationActions.tabs('reports') + '<div class="content-stack" role="tabpanel" id="reports-panel" aria-labelledby="reports-tab-week">' + app.generationActions.markup('reports', 'report-week') + '<p class="action-feedback" role="status" hidden></p><section class="panel"><form class="filter-form" aria-label="经营报告查询"><label class="form-field"><span>商户</span><select class="form-control" name="merchant">' + merchantOptions(true) + '</select></label><label class="form-field"><span>期间起始</span><input class="form-control" type="date" name="from" min="1901-01-01" max="2099-12-31"></label><label class="form-field"><span>期间结束</span><input class="form-control" type="date" name="to" min="1901-01-01" max="2099-12-31"></label><label class="form-field"><span>最新状态</span><select class="form-control" name="status"><option value="">全部状态</option>' + Object.keys(states).map(function (key) { return '<option value="' + key + '">' + states[key].name + '</option>'; }).join('') + '</select></label><label class="form-field form-field--wide"><span>报告标题</span><input class="form-control" type="search" name="keyword" placeholder="输入标题关键词"></label><button class="button button--primary" type="submit">' + app.icon('search') + '<span>查询</span></button>' + button('reset', 'reset', '重置') + '</form><div data-results></div></section></div></div>';
    const form = container.querySelector('form'), output = container.querySelector('[data-results]'); let filters = {}, page = 1, kind = 'week';
    const tabState = { week: { filters: {}, draft: {}, page: 1 }, month: { filters: {}, draft: {}, page: 1 } };
    app.enhanceQueryControls(form);
    function render(message) {
      if (message) { const feedback = container.querySelector('[role="status"]'); feedback.hidden = false; feedback.textContent = message + (store.storageAvailable() ? '' : ' 保存暂不可用，请稍后重试。'); }
      if (filters.from && filters.to && filters.from > filters.to) { output.innerHTML = '<div class="empty-state"><strong>起始日期不能晚于结束日期</strong></div>'; return; }
      const rows = store.list().filter(function (r) { return ((r.kind || 'week') === kind) && (!filters.merchant || r.merchant.id === filters.merchant) && (!filters.status || r.status === filters.status) && (!filters.from || r.end >= filters.from) && (!filters.to || r.start <= filters.to) && (!filters.keyword || (app.presentation ? app.presentation.matches(r.title, filters.keyword) : r.title.toLowerCase().includes(filters.keyword.toLowerCase()))); }).sort(function (a, b) { return b.updatedAt.localeCompare(a.updatedAt) || b.end.localeCompare(a.end) || a.merchant.id.localeCompare(b.merchant.id); });
      const pages = Math.max(1, Math.ceil(rows.length / 8)); page = Math.min(page, pages);
      output.innerHTML = (rows.length ? '<div class="table-scroll"><table class="data-table"><thead><tr><th scope="col">报告商户</th><th scope="col">报告与数据期间</th><th scope="col">共同版本 / 状态</th><th scope="col">更新时间</th><th scope="col">操作</th></tr></thead><tbody>' + rows.slice((page - 1) * 8, page * 8).map(function (r) {
        const live = store.publishedFor(r.merchant.id).find(function (p) { return p.id === r.id; });
        let actions = button('detail', 'report', '详情', 'text') + button('history', 'history', '版本', 'text');
        if (r.status !== 'published') actions += button('edit', 'edit', '编辑', 'text');
        if (r.status === 'pending') actions += button('review', 'check', '复核', 'text');
        if (r.status === 'approved') actions += button('publish', 'upload', '发布', 'text');
        if (r.status === 'published') actions += button('revise', 'edit', '修订文字', 'text');
        return '<tr data-id="' + esc(r.id) + '" data-version="' + r.version + '"><td>' + esc(r.merchant.name) + '<span class="cell-secondary">' + r.merchant.id + '</span></td><td class="wrap-cell"><strong>' + esc(r.title) + '</strong><span class="cell-secondary">' + r.start + ' 至 ' + r.end + ' · ' + app.reportView.periodLabel(r) + '</span></td><td>V' + r.version + ' ' + status(r) + '<span class="cell-secondary">展示状态：' + (app.publicationPolicy ? esc(app.publicationPolicy.visibility(r, live)) : (live ? 'V' + live.version : '无')) + '</span></td><td>' + esc(r.updatedAt) + '</td><td class="table-actions"><div class="row-actions">' + actions + '</div></td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="empty-state">' + app.icon('report') + '<strong>暂无匹配报告</strong><p>调整筛选条件；报告将按生成设置定期生成。</p></div>') + '<div class="pagination"><span>共 ' + rows.length + ' 份 · 每页 8 份</span><div class="pagination-controls"><button type="button" class="button" data-page="-1"' + (page <= 1 ? ' disabled' : '') + '>' + app.icon('previous') + '<span>上一页</span></button><span class="page-position">' + page + ' / ' + pages + '</span><button type="button" class="button" data-page="1"' + (page >= pages ? ' disabled' : '') + '>' + app.icon('next') + '<span>下一页</span></button></div></div>';
    }
    function switchTab(next) {
      if (!['week', 'month'].includes(next) || next === kind) return;
      tabState[kind] = { filters: filters, draft: Object.fromEntries(new FormData(form)), page: page };
      kind = next; filters = tabState[kind].filters; page = tabState[kind].page;
      form.reset();
      Object.entries(tabState[kind].draft).forEach(function (entry) { form.elements.namedItem(entry[0]).value = entry[1]; });
      form.dispatchEvent(new Event('input', { bubbles: true }));
      container.querySelector('[role="status"]').hidden = true;
      app.generationActions.selectTab(container, 'reports', kind);
      render();
    }
    container.addEventListener('keydown', function (event) {
      if (event.target.closest('dialog, .task-workspace') || !event.target.closest('[data-period-tab]') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      switchTab(event.key === 'Home' ? 'week' : event.key === 'End' ? 'month' : kind === 'week' ? 'month' : 'week');
    });
    function query() { filters = Object.fromEntries(new FormData(form)); filters.keyword = filters.keyword.trim(); page = 1; render(); }
    form.addEventListener('submit', function (event) { event.preventDefault(); query(); });
    form.addEventListener('change', function (event) { if (event.target.name !== 'keyword') query(); });
    container.addEventListener('click', function (event) {
      if (event.target.closest('dialog, .task-workspace')) return;
      const tab = event.target.closest('[data-period-tab]'); if (tab) { switchTab(tab.dataset.periodTab); return; }
      const paging = event.target.closest('[data-page]'); if (paging) { page += Number(paging.dataset.page); render(); return; }
      const target = event.target.closest('[data-action]'); if (!target) return;
      const action = target.dataset.action;
      if (action === 'generation-settings') { app.generationActions.edit(container, 'reports', render, target.dataset.generationKey); return; }
      if (action === 'generation-records') { app.generationActions.openRecords(container, target.dataset.generationKey, 'reports'); return; }
      if (action === 'reset') { form.reset(); query(); return; }
      const tr = target.closest('[data-id]'); if (!tr) return;
      const row = store.get(tr.dataset.id, tr.dataset.version);
      if (action === 'detail') detail(container, row);
      if (action === 'history') history(container, row);
      if (action === 'edit') edit(container, row, render);
      if (action === 'review') review(container, row, render);
      if (action === 'publish') publish(container, row, render);
      if (action === 'revise') { try { const next = store.revise(row.id, row.version, row.revision); render('已创建修订版 V' + next.version + '，旧发布版保持不变。'); edit(container, next, render); } catch (error) { render(error.message); } }
    });
    query();
    app.generationActions.bind(container, 'reports', render, function () { return 'report-' + kind; });
  };
}());
