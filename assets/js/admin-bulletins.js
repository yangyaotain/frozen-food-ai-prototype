(function () {
  'use strict';
  const app = window.FrozenApp, esc = app.presentation ? app.presentation.escape : app.escape, store = app.bulletinStore;
  function button(action, icon, label, primary) { return '<button type="button" class="button' + (primary ? ' button--primary' : '') + '" data-action="' + action + '">' + app.icon(icon) + '<span>' + label + '</span></button>'; }
  function status(row) { const item = app.bulletinData.states[row.status]; return '<span class="status-tag status-tag--' + item.style + '">' + item.name + '</span>'; }
  function detail(host, row) {
    const provenance = row.snapshot.provenance;
    const body = app.bulletinView.render(row) + '<details class="bulletin-data"><summary>管理端生成依据快照（不传递商户端）</summary><div class="bulletin-section"><h2>引用采价版本</h2><ul>' + provenance.prices.map(function (p) { return '<li>' + esc(p.week + ' · ' + p.category + ' · ' + p.id + ' / V' + p.version) + ' · ' + app.bulletinView.num(p.price) + ' 元/吨</li>'; }).join('') + '</ul><h2>生成时品类映射</h2><ul>' + provenance.mappings.map(function (m) { return '<li>' + esc(m.name + ' · ' + m.id + ' / V' + m.version + ' → ' + app.analysisData.categories.find(function (c) { return c.id === m.categoryId; }).name) + '</li>'; }).join('') + '</ul></div></details>';
    app.openDetailPage(host, '简报详情 · V' + row.version, body, '', true);
  }
  function history(host, row) {
    const versions = store.versions(row.id);
    const body = '<p class="dialog-description">已发布版本保持不变。文字编辑记录保留前后内容，数据快照以各版本详情为准。</p><div class="bulletin-versions">' + versions.map(function (version) {
      return '<section class="bulletin-version"><header><strong>V' + version.version + ' · ' + esc(version.title) + '</strong>' + status(version) + '<button type="button" class="button" data-version="' + version.version + '">' + app.icon('report') + '<span>查看版本</span></button></header><ol>' + version.history.map(function (item) {
        return '<li><strong>' + esc(item.action) + '</strong><p class="field-hint">' + esc(item.actor + ' · ' + item.time) + '</p><p>' + esc(item.opinion) + '</p>' + (item.before ? '<details><summary>文字修改前后</summary><div class="task-compare"><section><h3>修改前</h3><p class="detail-note">' + esc(item.before.title + '\n' + item.before.summary + '\n' + item.before.signals) + '</p></section><section><h3>修改后</h3><p class="detail-note">' + esc(item.after.title + '\n' + item.after.summary + '\n' + item.after.signals) + '</p></section></div></details>' : '') + '</li>';
      }).join('') + '</ol></section>';
    }).join('') + '</div>';
    const dialog = app.openDetailPage(host, '版本与过程记录', body, '', true);
    dialog.addEventListener('click', function (event) { const target = event.target.closest('[data-version]'); if (target) detail(host, store.get(row.id, target.dataset.version)); });
  }
  function edit(host, row, refresh) {
    const limits = app.bulletinData.textLimits(row);
    const body = '<h2>简报文字</h2><form id="bulletin-workspace-edit" class="task-workspace-form"><label class="form-field"><span>简报标题</span><input class="form-control" name="title" maxlength="100" required value="' + esc(row.title) + '"></label><label class="form-field"><span>市场摘要</span><textarea class="form-control editor-textarea--summary" name="summary" maxlength="' + limits.summary + '" required>' + esc(row.summary) + '</textarea></label><label class="form-field"><span>异常与供需信号</span><textarea class="form-control editor-textarea--body" name="signals" maxlength="' + limits.signals + '" required>' + esc(row.signals) + '</textarea></label><p class="field-error" role="alert"></p></form>';
    const meta = '<dl class="detail-grid"><div><dt>简报类型</dt><dd>' + (row.kind === 'month' ? '月报' : '周报') + '</dd></div><div><dt>数据期间</dt><dd>' + row.start + ' 至 ' + row.end + '</dd></div><div><dt>当前版本 / 状态</dt><dd>V' + row.version + ' · ' + esc(app.bulletinData.states[row.status].name) + '</dd></div><div><dt>品类范围</dt><dd>' + esc(row.snapshot.categories.map(function (category) { return category.name; }).join('、')) + '</dd></div></dl>';
    const workspace = app.openTaskWorkspace(host, { title: '编辑简报 · V' + row.version, mode: 'edit', description: '数据快照、期间与品类保持生成时口径；文字改变后重新待复核。', status: status(row), meta: meta, main: body, aside: '<h2>保存前内容与数据依据</h2><div class="task-reading">' + app.bulletinView.render(row) + '</div>', actions: '<button class="button button--primary" type="submit" form="bulletin-workspace-edit">' + app.icon('check') + '<span>保存</span></button>', onClose: function (message) { if (message) refresh(message); } });
    workspace.element.querySelector('form').addEventListener('submit', function (event) {
      event.preventDefault(); const form = event.currentTarget;
      try { const result = store.edit(row.id, row.version, { title: form.elements.title.value, summary: form.elements.summary.value, signals: form.elements.signals.value }); workspace.complete('保存完成 · ' + app.bulletinData.states[result.status].name + '。'); }
      catch (error) { form.querySelector('[role="alert"]').textContent = error.message; }
    });
  }
  function review(host, row, refresh) {
    const formBody = '<h2>复核结论</h2><form id="bulletin-workspace-review" class="task-review-form"><label class="form-field"><span>复核结论</span><select name="decision" class="form-control"><option value="approved">复核通过</option><option value="revision">退回修改</option></select></label><label class="form-field"><span>复核意见</span><textarea class="form-control editor-textarea--summary" name="opinion" maxlength="500" required placeholder="填写核对依据或修改要求"></textarea></label><p role="alert" class="field-error"></p><p class="field-hint">复核通过后仍需单独发布。</p></form>';
    const meta = '<dl class="detail-grid"><div><dt>简报类型</dt><dd>' + (row.kind === 'month' ? '月报' : '周报') + '</dd></div><div><dt>数据期间</dt><dd>' + row.start + ' 至 ' + row.end + '</dd></div><div><dt>当前版本</dt><dd>V' + row.version + '</dd></div><div><dt>品类范围</dt><dd>' + esc(row.snapshot.categories.map(function (category) { return category.name; }).join('、')) + '</dd></div></dl>';
    const workspace = app.openTaskWorkspace(host, { title: '复核简报 · V' + row.version, description: '请完整核对本版本的文字、数值、来源和数据口径。', status: status(row), meta: meta, main: '<h2>待复核简报全文</h2><div class="task-reading">' + app.bulletinView.render(row) + '</div>', aside: formBody, actions: '<button class="button button--primary" type="submit" form="bulletin-workspace-review">' + app.icon('check') + '<span>提交复核</span></button>', onClose: function (message) { if (message) refresh(message); } });
    workspace.element.querySelector('form').addEventListener('submit', function (event) {
      event.preventDefault(); const form = event.currentTarget;
      try { const result = store.review(row.id, row.version, form.elements.decision.value, form.elements.opinion.value); workspace.complete('复核已记录 · ' + app.bulletinData.states[result.status].name + '。'); }
      catch (error) { form.querySelector('[role="alert"]').textContent = error.message; }
    });
  }
  function publish(host, row, refresh) {
    const dialog = app.openDialog(host, '发布简报 · V' + row.version, '<p class="dialog-description">发布“' + esc(row.title) + '”后，商户将看到本版本的已复核市场汇总。已有已发布版会保留在历史中。</p><dl class="detail-grid"><div><dt>数据期间</dt><dd>' + row.start + ' 至 ' + row.end + '</dd></div><div><dt>复核人</dt><dd>' + esc(row.review.actor) + '</dd></div><div><dt>复核意见</dt><dd>' + esc(row.review.opinion) + '</dd></div></dl><p class="field-error" role="alert"></p>', button('publish', 'upload', '确认发布', true));
    dialog.querySelector('[data-action="publish"]').addEventListener('click', function () {
      try { store.publish(row.id, row.version); dialog.close(); refresh('V' + row.version + ' 已发布，商户可查看已复核的市场行情。'); }
      catch (error) { dialog.querySelector('[role="alert"]').textContent = error.message; }
    });
  }
  app.bulletinActions = { detail: detail };
  app.pages['admin:bulletins'] = function (container) {
    container.innerHTML = '<div class="content-stack">' + app.generationActions.tabs('bulletins') + '<div class="content-stack" role="tabpanel" id="bulletins-panel" aria-labelledby="bulletins-tab-week">' + app.generationActions.markup('bulletins', 'week') + '<p class="action-feedback bulletin-feedback" role="status" hidden></p><section class="panel"><form class="filter-form" aria-label="简报查询"><label class="form-field"><span>期间起始</span><input class="form-control" type="date" name="from" min="1901-01-01" max="2099-12-31"></label><label class="form-field"><span>期间结束</span><input class="form-control" type="date" name="to" min="1901-01-01" max="2099-12-31"></label><label class="form-field"><span>最新版本状态</span><select class="form-control" name="status"><option value="">全部状态</option>' + Object.keys(app.bulletinData.states).map(function (key) { return '<option value="' + key + '">' + app.bulletinData.states[key].name + '</option>'; }).join('') + '</select></label><label class="form-field form-field--wide"><span>简报标题</span><input class="form-control" type="search" name="keyword" placeholder="输入标题关键词"></label><button class="button button--primary" type="submit">' + app.icon('search') + '<span>查询</span></button>' + button('reset', 'reset', '重置') + '</form><div data-results></div></section></div></div>';
    const form = container.querySelector('form'), results = container.querySelector('[data-results]');
    app.enhanceQueryControls(form);
    let filters = {}, page = 1, kind = 'week';
    const tabState = { week: { filters: {}, draft: {}, page: 1 }, month: { filters: {}, draft: {}, page: 1 } };
    function render(message) {
      if (message) { const output = container.querySelector('[role="status"]'); output.hidden = false; output.textContent = message + (store.storageAvailable() ? '' : ' 保存暂不可用，请稍后重试。'); }
      if (filters.from && filters.to && filters.from > filters.to) { results.innerHTML = '<div class="empty-state"><strong>起始日期不能晚于结束日期</strong><p>请调整查询期间。</p></div>'; return; }
      const rows = store.list().filter(function (row) { return (!filters.from || row.end >= filters.from) && (!filters.to || row.start <= filters.to) && (row.kind === kind) && (!filters.status || row.status === filters.status) && (!filters.keyword || (app.presentation ? app.presentation.matches(row.title, filters.keyword) : row.title.toLowerCase().includes(filters.keyword.toLowerCase()))); }).sort(function (a, b) { return b.updatedAt.localeCompare(a.updatedAt) || b.start.localeCompare(a.start); });
      const pages = Math.max(1, Math.ceil(rows.length / 8)); page = Math.min(page, pages);
      const published = store.published();
      results.innerHTML = (rows.length ? '<div class="table-scroll"><table class="data-table"><thead><tr><th scope="col">简报与期间</th><th scope="col">品类范围</th><th scope="col">版本与状态</th><th scope="col">更新时间</th><th scope="col">操作</th></tr></thead><tbody>' + rows.slice((page - 1) * 8, page * 8).map(function (row) {
        const live = published.find(function (p) { return p.id === row.id; });
        let actions = button('detail', 'report', '详情') + button('history', 'history', '版本');
        if (row.status !== 'published') actions += button('edit', 'edit', '编辑');
        if (row.status === 'pending') actions += button('review', 'check', '复核');
        if (row.status === 'approved') actions += button('publish', 'upload', '发布');
        if (row.status === 'published') actions += button('revise', 'edit', '修订文字');
        return '<tr data-id="' + esc(row.id) + '" data-version="' + row.version + '"><td><strong class="cell-primary">' + esc(row.title) + '</strong><span class="cell-secondary">' + row.start + ' 至 ' + row.end + ' · ' + (row.kind === 'week' ? '周报' : '月报') + '</span></td><td class="wrap-cell">' + row.snapshot.categories.map(function (c) { return esc(c.name); }).join('、') + '</td><td>V' + row.version + ' ' + status(row) + '<span class="cell-secondary">展示状态：' + (app.publicationPolicy ? esc(app.publicationPolicy.visibility(row, live)) : (live ? 'V' + live.version : '未发布')) + '</span></td><td>' + esc(row.updatedAt) + '</td><td><div class="bulletin-toolbar">' + actions + '</div></td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="empty-state">' + app.icon('report') + '<strong>暂无匹配简报</strong><p>调整查询条件；简报将按生成设置定期生成。</p></div>') + '<div class="pagination"><span>共 ' + rows.length + ' 份 · 每页 8 份</span><div class="pagination-controls"><button class="button" type="button" data-page="-1"' + (page <= 1 ? ' disabled' : '') + '>' + app.icon('previous') + '<span>上一页</span></button><span class="page-position">' + page + ' / ' + pages + '</span><button class="button" type="button" data-page="1"' + (page >= pages ? ' disabled' : '') + '>' + app.icon('next') + '<span>下一页</span></button></div></div>';
    }
    function switchTab(next) {
      if (!['week', 'month'].includes(next) || next === kind) return;
      tabState[kind] = { filters: filters, draft: Object.fromEntries(new FormData(form)), page: page };
      kind = next; filters = tabState[kind].filters; page = tabState[kind].page;
      form.reset();
      Object.entries(tabState[kind].draft).forEach(function (entry) { form.elements.namedItem(entry[0]).value = entry[1]; });
      form.dispatchEvent(new Event('input', { bubbles: true }));
      container.querySelector('[role="status"]').hidden = true;
      app.generationActions.selectTab(container, 'bulletins', kind);
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
      if (action === 'reset') { form.reset(); query(); return; }
      if (action === 'generation-settings') { app.generationActions.edit(container, 'bulletins', render, target.dataset.generationKey); return; }
      if (action === 'generation-records') { app.generationActions.openRecords(container, target.dataset.generationKey); return; }
      const tr = target.closest('[data-id]'); if (!tr) return;
      const row = store.get(tr.dataset.id, tr.dataset.version);
      if (action === 'detail') detail(container, row);
      if (action === 'history') history(container, row);
      if (action === 'edit') edit(container, row, render);
      if (action === 'review') review(container, row, render);
      if (action === 'publish') publish(container, row, render);
      if (action === 'revise') {
        try { const revision = store.revise(row.id, row.version); render('已创建修订版 V' + revision.version + '，商户仍展示 V' + row.version + '。'); edit(container, revision, render); }
        catch (error) { render(error.message); }
      }
    });
    query();
    app.generationActions.bind(container, 'bulletins', render, function () { return kind; });
  };
}());
