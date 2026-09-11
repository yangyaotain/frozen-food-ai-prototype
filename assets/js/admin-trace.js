(function () {
  'use strict';
  const app = window.FrozenApp, esc = app.presentation ? app.presentation.escape : app.escape, data = app.traceData;
  function button(action, icon, label, extra) { return '<button type="button" class="button" data-trace-action="' + action + '" ' + (extra || '') + '>' + app.icon(icon) + '<span>' + label + '</span></button>'; }
  function pairs(values) { return '<dl class="detail-grid">' + values.map(function (pair) { return '<div><dt>' + esc(pair[0]) + '</dt><dd class="detail-note">' + esc(pair[1]) + '</dd></div>'; }).join('') + '</dl>'; }
  function body(row) {
    return '<div class="content-stack">' + pairs([
      ['关联内容', row.title], ['所属模块', data.modules[row.module]], ['记录编号', row.id], ['关联版本', 'V' + row.version],
      ['操作', row.action], ['操作人 / 时间', row.actor + ' · ' + row.time], ['业务期间 / 资料范围', row.period], ['适用对象', row.merchant || '市场公共资料']
    ]) + '<section><h2>操作意见</h2><p class="detail-note">' + esc(row.opinion) + '</p></section><div class="task-compare">' +
      (row.before.length ? '<section><h2>操作前留存</h2>' + pairs(row.before) + '</section>' : '') +
      (row.after.length ? '<section><h2>操作后留存</h2>' + pairs(row.after) + '</section>' : '<p class="field-hint">本次操作未单独留存前后文字；数据依据按关联版本的生成快照展示。</p>') +
      '</div>' + (row.evidence.length ? '<details class="bulletin-data"><summary>查看来源与关联版本依据（' + row.evidence.length + ' 项）</summary><ul class="bulletin-references">' + row.evidence.map(function (text) { return '<li>' + esc(text) + '</li>'; }).join('') + '</ul></details>' : '') +
      (row.linked ? '<p class="field-hint">“查看关联版本”打开该版本当前留存的完整正文；同版本后续文字修改以各次操作的前后留存为准。</p>' : '') + '</div>';
  }
  app.traceView = { body: body };
  app.pages['admin:trace'] = function (container) {
    let filters = {}, page = 1, visible = [];
    function options(values) { return Object.keys(values).map(function (key) { return '<option value="' + key + '">' + esc(values[key]) + '</option>'; }).join(''); }
    container.innerHTML = '<div class="content-stack"><aside class="notice">' + app.icon('history') + '<p>汇总采价、映射、来源、资讯及报告的已有过程记录。查询日期为操作发生日期，业务期间在详情单独展示。</p></aside><section class="panel"><form class="filter-form" role="search" aria-label="追溯记录查询"><label class="form-field"><span>操作起始日期</span><input class="form-control" type="date" name="from"></label><label class="form-field"><span>操作结束日期</span><input class="form-control" type="date" name="to"></label><label class="form-field"><span>所属模块</span><select class="form-control" name="module"><option value="">全部模块</option>' + options(data.modules) + '</select></label><label class="form-field"><span>操作类型</span><select class="form-control" name="type"><option value="">全部类型</option>' + options(data.types) + '</select></label><label class="form-field form-field--wide"><span>内容 / 编号 / 商户 / 操作人</span><input class="form-control" type="search" name="keyword" maxlength="100" placeholder="输入关键词"></label><button class="button button--primary" type="submit">' + app.icon('search') + '<span>查询</span></button>' + button('reset', 'reset', '重置') + '</form></section><section class="panel"><div class="panel-heading"><h2>操作记录</h2>' + button('refresh', 'reset', '刷新记录') + '</div><div data-results></div></section></div>';
    const form = container.querySelector('form'), results = container.querySelector('[data-results]');
    app.enhanceQueryControls(form);
    function render() {
      const result = data.query(filters), rows = result.rows, pages = Math.max(1, Math.ceil(rows.length / 10));
      page = Math.max(1, Math.min(page, pages)); visible = rows.slice((page - 1) * 10, page * 10);
      if (result.error) { results.innerHTML = '<div class="empty-state" role="alert">' + app.icon('info') + '<strong>' + esc(result.error) + '</strong><p>请调整日期后重新查询。</p></div>'; return; }
      results.innerHTML = (rows.length ? '<div class="table-scroll" tabindex="0" role="region" aria-label="追溯记录表，可横向滚动"><table class="data-table"><thead><tr><th scope="col">操作时间 / 人员</th><th scope="col">模块</th><th scope="col">关联内容 / 版本</th><th scope="col">操作</th><th scope="col" class="table-actions">详情</th></tr></thead><tbody>' + visible.map(function (row) {
        return '<tr><td>' + esc(row.time) + '<span class="cell-secondary">' + esc(row.actor) + '</span></td><td>' + esc(data.modules[row.module]) + '</td><td class="wrap-cell"><strong class="cell-primary">' + esc(row.title) + '</strong><span class="cell-secondary">' + esc(row.objectId) + ' · V' + row.version + (row.merchant ? ' · ' + esc(row.merchant) : '') + '</span></td><td>' + esc(row.action) + '</td><td class="table-actions">' + button('detail', 'history', '过程详情', 'data-trace-id="' + esc(row.id) + '"') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="empty-state">' + app.icon('search') + '<strong>暂无匹配的过程记录</strong><p>请调整查询条件；本页仅汇总已有记录，未发生的操作不会生成记录。</p></div>') + '<div class="pagination"><p class="muted" role="status">共 ' + rows.length + ' 条 · 每页 10 条 · 第 ' + page + ' / ' + pages + ' 页</p><div class="button-group">' + button('previous', 'previous', '上一页', page <= 1 ? 'disabled' : '') + button('next', 'next', '下一页', page >= pages ? 'disabled' : '') + '</div></div>';
    }
    function query() { filters = Object.fromEntries(new FormData(form)); page = 1; render(); }
    function detail(row) {
      const dialog = app.openDetailPage(container, '过程详情 · ' + row.action, body(row), row.linked ? button('version', 'report', '查看关联版本') : '', true);
      dialog.addEventListener('click', function (event) {
        if (event.target.closest('dialog, .task-workspace') !== dialog) return;
        const target = event.target.closest('[data-trace-action]'); if (!target) return;
        if (target.dataset.traceAction === 'version') {
          const linked = data.linked(row);
          if (!linked) { dialog.querySelector('.task-workspace-main').insertAdjacentHTML('beforeend', '<p class="field-error" role="alert">当前没有找到该版本，请返回列表后刷新记录。</p>'); return; }
          if (row.module === 'bulletins') app.bulletinActions.detail(container, linked);
          if (row.module === 'reports') app.reportActions.detail(container, linked);
        }
      });
    }
    form.addEventListener('submit', function (event) { event.preventDefault(); query(); });
    form.addEventListener('change', function (event) { if (event.target.type === 'date' || event.target.tagName === 'SELECT') query(); });
    container.addEventListener('click', function (event) {
      if (event.target.closest('dialog, .task-workspace')) return;
      const target = event.target.closest('[data-trace-action]'); if (!target || target.disabled) return;
      const action = target.dataset.traceAction;
      if (action === 'detail') { const row = visible.find(function (r) { return r.id === target.dataset.traceId; }); if (row) detail(row); }
      if (action === 'reset') { form.reset(); filters = {}; query(); }
      if (action === 'previous') { page--; render(); }
      if (action === 'next') { page++; render(); }
      if (action === 'refresh') render();
    });
    query();
  };
}());
