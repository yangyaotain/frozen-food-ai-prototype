(function () {
  'use strict';
  const app = window.FrozenApp;
  const esc = app.presentation ? app.presentation.escape : app.escape;
  const store = app.priceStore;
  const categories = app.priceData.categories;
  const statuses = app.priceData.statuses;
  const records = store.records;
  const money = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function options(items) {
    return items.map(function (item) { return '<option value="' + esc(item.id) + '">' + esc(item.name) + '</option>'; }).join('');
  }

  app.pages['admin:prices'] = function (container) {
    container.innerHTML = `
      <div class="content-stack">
        <p class="action-feedback" id="price-feedback" role="status" aria-live="polite" hidden></p>
        <section class="panel" aria-label="采价查询">
          <form class="filter-form" id="price-query" role="search" aria-label="查询每周平均采价">
            <div class="form-field form-field--wide"><span>采价周</span><div id="price-week-picker"></div></div>
            <label class="form-field"><span>分析品类</span>
              <select class="form-control" name="category"><option value="">全部品类</option>${options(categories)}</select>
            </label>
            <label class="form-field"><span>复核状态</span>
              <select class="form-control" name="status"><option value="">全部状态</option>${options(Object.keys(statuses).map(function (id) { return { id: id, name: statuses[id].name }; }))}</select>
            </label>
            <label class="form-field form-field--wide"><span>品类关键词</span>
              <span class="input-with-icon">${app.icon('search')}<input class="form-control" type="search" name="keyword" placeholder="输入品类名称" autocomplete="off" maxlength="80"></span>
            </label>
            <div class="button-group">
              <button class="button button--primary" type="submit">${app.icon('search')}<span>查询</span></button>
              <button class="button" type="button" data-action="reset">${app.icon('reset')}<span>重置</span></button>
            </div>
          </form>
        </section>
        <section class="panel" aria-labelledby="price-table-title">
          <div class="panel-heading"><h2 id="price-table-title">周均采价记录</h2><div class="button-group">
            <button class="button" type="button" data-action="batches">${app.icon('history')}<span>导入批次</span></button>
            <button class="button" type="button" data-action="import">${app.icon('upload')}<span>批量导入</span></button>
            <button class="button button--primary" type="button" data-action="create">${app.icon('plus')}<span>新增采价</span></button>
          </div></div>
          <div class="table-scroll" role="region" aria-label="周均采价记录表，可横向滚动" tabindex="0">
            <table class="data-table" aria-labelledby="price-table-title">
              <thead><tr><th scope="col">采价周</th><th scope="col">分析品类</th><th scope="col" class="numeric">周均价格</th><th scope="col">单位</th><th scope="col">复核状态</th><th scope="col">维护人</th><th scope="col">更新时间</th><th scope="col" class="table-actions">操作</th></tr></thead>
              <tbody id="price-rows"></tbody>
            </table>
          </div>
          <div class="pagination">
            <p class="muted" id="price-result-count" role="status" aria-live="polite" aria-atomic="true"></p>
            <div class="pagination-controls">
              <label class="page-size">每页<select class="form-control" id="price-page-size" aria-label="每页记录数"><option value="10">10</option><option value="20">20</option><option value="50">50</option></select>条</label>
              <div class="button-group" role="group" aria-label="采价记录翻页">
                <button class="button" type="button" data-action="previous" aria-controls="price-rows">${app.icon('previous')}<span>上一页</span></button>
                <span class="page-position" id="price-page-position"></span>
                <button class="button" type="button" data-action="next" aria-controls="price-rows"><span>下一页</span>${app.icon('next')}</button>
              </div>
            </div>
          </div>
        </section>
      </div>`;

    const form = container.querySelector('#price-query');
    app.enhanceCategorySelects(form);
    const body = container.querySelector('#price-rows');
    const resultCount = container.querySelector('#price-result-count');
    const position = container.querySelector('#price-page-position');
    const previous = container.querySelector('[data-action="previous"]');
    const next = container.querySelector('[data-action="next"]');
    const weekPicker = app.searchSelect(container.querySelector('#price-week-picker'), 'week', '采价周', function () {
      return Array.from(new Map(records.map(function (record) { return [record.week.id, record.week]; })).values())
        .sort(function (a, b) { return b.id.localeCompare(a.id); })
        .map(function (week) { return { id: week.id, name: week.label + '（' + week.id + '）' }; });
    });
    app.enhanceQueryControls(form);
    let matched = records.slice();
    let page = 1;
    let pageSize = 10;
    let applied = { week: '', category: '', status: '', keyword: '' };

    function renderResults() {
      const pages = Math.max(1, Math.ceil(matched.length / pageSize));
      page = Math.min(Math.max(1, page), pages);
      const start = (page - 1) * pageSize;
      const visible = matched.slice(start, start + pageSize);
      body.innerHTML = visible.length ? visible.map(function (record) {
        const status = statuses[record.status];
        return '<tr><td><span class="cell-primary">' + esc(record.week.label) + '</span><span class="cell-secondary">' + esc(record.week.id + ' — ' + record.week.end) + '</span></td>' +
          '<td class="cell-primary">' + esc(record.category.name) + '</td><td class="numeric cell-primary">' + esc(money.format(record.price)) + '</td><td class="muted">元/吨</td>' +
          '<td><span class="status-tag status-tag--' + status.style + '">' + esc(status.name) + '</span></td><td>' + esc(record.editor) + '</td><td class="muted">' + esc(record.updatedAt) + '</td>' +
          '<td class="table-actions"><div class="row-actions"><button class="button button--text" data-record="' + esc(record.id) + '" data-action="history">' + app.icon('history') + '<span>详情</span></button><button class="button button--text" data-record="' + esc(record.id) + '" data-action="edit">' + app.icon('edit') + '<span>编辑</span></button>' +
          (record.status === 'pending' ? '<button class="button button--text" data-record="' + esc(record.id) + '" data-action="review">' + app.icon('check') + '<span>复核</span></button>' : '') + '</div></td></tr>';
      }).join('') : '<tr><td colspan="8" class="empty-cell"><div class="empty-state">' + app.icon('search') + '<strong>未找到符合条件的采价记录</strong><p>请调整采价周、品类或复核状态，或重置查询条件。</p></div></td></tr>';
      resultCount.textContent = matched.length ? '共 ' + matched.length + ' 条 · 当前显示第 ' + (start + 1) + '–' + (start + visible.length) + ' 条' : '共 0 条 · 暂无匹配记录';
      position.textContent = matched.length ? '第 ' + page + ' / ' + pages + ' 页' : '暂无分页';
      previous.disabled = page <= 1;
      next.disabled = page >= pages;
    }

    function refreshResults() {
      matched = records.filter(function (record) {
        return (!applied.week || record.week.id === applied.week) && (!applied.category || record.category.id === applied.category) &&
          (!applied.status || record.status === applied.status) && (!applied.keyword || record.category.name.toLocaleLowerCase('zh-CN').includes(applied.keyword));
      }).sort(function (a, b) { return b.week.id.localeCompare(a.week.id) || categories.indexOf(a.category) - categories.indexOf(b.category); });
      renderResults();
    }
    function query() {
      applied = {
        week: form.elements.namedItem('week').value, category: form.elements.namedItem('category').value,
        status: form.elements.namedItem('status').value, keyword: form.elements.namedItem('keyword').value.trim().toLocaleLowerCase('zh-CN')
      };
      page = 1;
      refreshResults();
    }
    function changed(message, record) {
      weekPicker.refresh(); refreshResults();
      const feedback = container.querySelector('#price-feedback');
      feedback.hidden = false;
      const index = record ? matched.findIndex(function (item) { return item.id === record.id; }) : -1;
      feedback.textContent = message + (record ? (index < 0 ? ' 当前筛选未包含该记录，可调整条件查看。' : ' 记录位于当前查询第 ' + (Math.floor(index / pageSize) + 1) + ' 页。') : ' 已保留当前查询条件。');
    }
    // 翻页使用已执行的查询结果；输入中的文本仅在提交或选择型条件变化后生效。
    form.addEventListener('submit', function (event) { event.preventDefault(); query(); });
    form.addEventListener('change', function (event) { if (event.target.tagName === 'SELECT' || event.target.name === 'week') query(); });
    container.querySelector('[data-action="reset"]').addEventListener('click', function () { form.reset(); weekPicker.reset(); query(); });
    container.querySelector('#price-page-size').addEventListener('change', function (event) {
      pageSize = Number(event.target.value);
      query();
    });
    previous.addEventListener('click', function () { page--; renderResults(); });
    next.addEventListener('click', function () { page++; renderResults(); });
    container.addEventListener('click', function (event) {
      if (event.target.closest('dialog, .task-workspace')) return;
      const target = event.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      if (action === 'create' || action === 'edit') app.priceActions.edit(container, target.dataset.record, changed);
      if (action === 'review') app.priceActions.review(container, target.dataset.record, changed);
      if (action === 'history') app.priceActions.history(container, target.dataset.record);
      if (action === 'import') app.priceActions.importFile(container, changed);
      if (action === 'batches') app.priceActions.batches(container);
    });
    refreshResults();
  };
}());
