(function () {
  'use strict';
  const app = window.FrozenApp;
  const esc = app.presentation ? app.presentation.escape : app.escape;
  const store = app.categoryStore;
  const categories = app.categoryData.categories;
  const quantity = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function categoryName(id) {
    const category = categories.find(function (item) { return item.id === id; });
    return category ? category.name : '未映射';
  }
  function tag(mapped) {
    return '<span class="status-tag status-tag--' + (mapped ? 'success' : 'warning') + '">' + (mapped ? '已映射' : '未映射') + '</span>';
  }
  function categoryOptions(selected, placeholder) {
    return '<option value="">' + placeholder + '</option>' + categories.map(function (category) {
      return '<option value="' + esc(category.id) + '"' + (category.id === selected ? ' selected' : '') + '>' + esc(category.name) + '</option>';
    }).join('');
  }
  function edit(host, id, changed) {
    const record = store.find(id);
    if (!record) return;
    const version = record.version;
    const body = '<p class="dialog-description">原始名称来自市场业务数据。同一原始名称只能对应一个分析品类，多个同义名称可归入同一分析品类。</p>' +
      '<dl class="detail-grid"><div><dt>原始品类名称</dt><dd>' + esc(record.name) + '</dd></div><div><dt>来源编码</dt><dd>' + esc(record.id) + '</dd></div><div><dt>当前分析品类</dt><dd>' + esc(categoryName(record.categoryId)) + '</dd></div><div><dt>当前映射状态</dt><dd>' + tag(record.categoryId) + '</dd></div></dl>' +
      '<form id="category-edit" class="edit-grid" novalidate><label class="form-field span-full"><span>分析品类 *</span><select class="form-control" name="categoryId" aria-describedby="mapping-category-error" required>' + categoryOptions(record.categoryId, '请选择分析品类') + '</select><small class="field-error" id="mapping-category-error"></small></label>' +
      '<p class="field-hint span-full" id="mapping-impact"></p>' +
      '<label class="form-field span-full"><span>映射说明</span><textarea class="form-control" name="note" maxlength="200" placeholder="填写名称归并依据或调整原因，最多 200 字" aria-describedby="mapping-note-error">' + esc(record.note) + '</textarea><small class="field-error" id="mapping-note-error"></small></label></form>';
    const dialog = app.openDialog(host, record.categoryId ? '调整品类映射' : '建立品类映射', body,
      '<button class="button" type="button" data-close>' + app.icon('close') + '<span>取消</span></button><button class="button button--primary" type="submit" form="category-edit">' + app.icon('check') + '<span>保存映射</span></button>');
    const form = dialog.querySelector('form');
    const target = form.elements.namedItem('categoryId');
    function impact() {
      const peers = store.records.filter(function (item) { return item.id !== id && item.categoryId && item.categoryId === target.value; });
      dialog.querySelector('#mapping-impact').textContent = target.value ? '保存后，“' + record.name + '”关联的出入库及库存数据归入“' + categoryName(target.value) + '”。该品类另有 ' + peers.length + ' 个原始名称，历史周均采价仍按分析品类关联。' : '请选择与原始名称业务含义相符的分析品类。';
    }
    target.addEventListener('change', impact);
    impact();
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      const result = store.save(id, { categoryId: target.value, note: form.elements.namedItem('note').value }, version);
      if (!result.valid) {
        dialog.querySelector('#mapping-category-error').textContent = result.errors.categoryId || '';
        dialog.querySelector('#mapping-note-error').textContent = result.errors.note || '';
        target.setAttribute('aria-invalid', result.errors.categoryId ? 'true' : 'false');
        form.elements.namedItem('note').setAttribute('aria-invalid', result.errors.note ? 'true' : 'false');
        app.focusControl(form.querySelector('[aria-invalid="true"]'));
        return;
      }
      dialog.close();
      changed(result.unchanged ? '映射内容未变化。' : '映射已保存：“' + record.name + '”归入“' + categoryName(record.categoryId) + '”。', record);
    });
  }
  function details(host, id) {
    const related = store.related(id);
    if (!related) return;
    const record = related.record;
    const category = related.category;
    const members = related.members;
    const memberRows = members.map(function (item) {
      return '<tr><td><span class="cell-primary">' + esc(item.name) + '</span><span class="cell-secondary">' + esc(item.id) + (item.id === id ? ' · 当前记录' : '') + '</span></td><td>' + esc(item.origin) + '</td><td class="numeric">' + quantity.format(item.inbound) + '</td><td class="numeric">' + quantity.format(item.outbound) + '</td><td class="numeric">' + quantity.format(item.closing) + '</td></tr>';
    }).join('');
    const priceRows = related.prices.map(function (price) {
      const status = app.priceData.statuses[price.status];
      return '<tr><td>' + esc(price.week.id + ' — ' + price.week.end) + '</td><td class="numeric">' + quantity.format(price.price) + '</td><td><span class="status-tag status-tag--' + status.style + '">' + status.name + '</span></td><td>V' + price.version + '</td></tr>';
    }).join('');
    const priceContent = priceRows ? '<div class="table-scroll"><table class="data-table compact-table"><thead><tr><th scope="col">采价期间</th><th scope="col" class="numeric">周均价格（元/吨）</th><th scope="col">复核状态</th><th scope="col">数据版本</th></tr></thead><tbody>' + priceRows + '</tbody></table></div>' : '<p class="dialog-description">' + (category ? '该分析品类暂无采价记录。' : '当前名称尚未映射，暂不关联分析品类的历史价格。') + '</p>';
    const totals = related.totals;
    const body = '<div class="content-stack"><dl class="detail-grid"><div><dt>原始名称 / 来源编码</dt><dd>' + esc(record.name + ' / ' + record.id) + '</dd></div><div><dt>分析品类</dt><dd>' + esc(categoryName(record.categoryId)) + ' ' + tag(category) + '</dd></div><div><dt>数据来源</dt><dd>市场业务系统</dd></div><div><dt>映射说明</dt><dd>' + esc(record.note || '暂无') + '</dd></div></dl>' +
      '<section><h2>' + (category ? esc(category.name) + '名称归并与业务关联' : '原始名称业务关联') + '</h2><p class="dialog-description">' + (category ? '当前共有 ' + members.length + ' 个原始名称归入该分析品类。' : '未映射数据仅展示自身信息，暂不计入任何分析品类。') + ' 数据期间：' + related.period.start + ' 至 ' + related.period.end + '；数量单位：吨；库存为期末库存，产地为业务来源记录。</p>' +
      '<div class="table-scroll"><table class="data-table compact-table"><thead><tr><th scope="col">原始品类名称</th><th scope="col">产地</th><th scope="col" class="numeric">入库量</th><th scope="col" class="numeric">出库量</th><th scope="col" class="numeric">期末库存</th></tr></thead><tbody>' + memberRows + '<tr><td class="cell-primary">' + (category ? '本品类合计' : '本条合计') + '</td><td>—</td><td class="numeric cell-primary">' + quantity.format(totals.inbound) + '</td><td class="numeric cell-primary">' + quantity.format(totals.outbound) + '</td><td class="numeric cell-primary">' + quantity.format(totals.closing) + '</td></tr></tbody></table></div></section>' +
      '<section><h2>关联历史周均价格</h2><p class="dialog-description">按分析品类关联采价记录，显示当前价格、复核状态及版本；不会将多个原始名称的价格重复累加。</p>' + priceContent + '</section></div>';
    app.openDetailPage(host, '品类映射关联详情', body, '', true);
  }
  app.pages['admin:categories'] = function (container) {
    container.innerHTML = '<div class="content-stack"><p class="action-feedback" id="mapping-feedback" role="status" aria-live="polite" hidden></p>' +
      '<section class="panel" aria-label="映射查询"><form id="mapping-query" class="filter-form" role="search" aria-label="查询品类映射">' +
      '<label class="form-field"><span>分析品类</span><select class="form-control" name="category">' + categoryOptions('', '全部品类') + '</select></label>' +
      '<label class="form-field"><span>映射状态</span><select class="form-control" name="status"><option value="">全部状态</option><option value="mapped">已映射</option><option value="unmapped">未映射</option></select></label>' +
      '<label class="form-field form-field--wide"><span>原始名称 / 编码</span><span class="input-with-icon">' + app.icon('search') + '<input class="form-control" name="keyword" type="search" maxlength="80" autocomplete="off" placeholder="输入名称或来源编码"></span></label>' +
      '<div class="button-group"><button class="button button--primary" type="submit">' + app.icon('search') + '<span>查询</span></button><button class="button" type="button" data-action="reset">' + app.icon('reset') + '<span>重置</span></button></div></form></section>' +
      '<section class="panel" aria-labelledby="mapping-title"><div class="panel-heading"><h2 id="mapping-title">原始品类映射</h2><span class="muted">原始名称来自业务数据，在行内建立或调整映射</span></div>' +
      '<div class="table-scroll" role="region" tabindex="0" aria-label="原始品类映射表，可横向滚动"><table class="data-table"><thead><tr><th scope="col">原始品类名称</th><th scope="col">分析品类</th><th scope="col">映射状态</th><th scope="col">维护人</th><th scope="col">更新时间</th><th scope="col" class="table-actions">操作</th></tr></thead><tbody id="mapping-rows"></tbody></table></div>' +
      '<div class="pagination"><p class="muted" id="mapping-count" role="status" aria-live="polite"></p><div class="pagination-controls"><label class="page-size">每页<select id="mapping-size" class="form-control" aria-label="每页映射记录数"><option value="10">10</option><option value="20">20</option><option value="50">50</option></select>条</label><div class="button-group" role="group" aria-label="映射列表分页"><button class="button" data-action="previous" type="button">' + app.icon('previous') + '<span>上一页</span></button><span class="page-position" id="mapping-position"></span><button class="button" data-action="next" type="button"><span>下一页</span>' + app.icon('next') + '</button></div></div></div></section></div>';
    const form = container.querySelector('#mapping-query');
    app.enhanceCategorySelects(form);
    app.enhanceQueryControls(form);
    const rows = container.querySelector('#mapping-rows');
    const previous = container.querySelector('[data-action="previous"]');
    const next = container.querySelector('[data-action="next"]');
    let applied = { category: '', status: '', keyword: '' };
    let page = 1, pageSize = 10, matched = [];
    function render() {
      matched = store.query(applied);
      const pages = Math.max(1, Math.ceil(matched.length / pageSize));
      page = Math.max(1, Math.min(page, pages));
      const start = (page - 1) * pageSize;
      const visible = matched.slice(start, start + pageSize);
      rows.innerHTML = visible.length ? visible.map(function (record) {
        return '<tr><td><span class="cell-primary">' + esc(record.name) + '</span><span class="cell-secondary">' + esc(record.id) + '</span></td><td>' + esc(categoryName(record.categoryId)) + '</td><td>' + tag(record.categoryId) + '</td><td>' + esc(record.editor || '—') + '</td><td class="muted">' + esc(record.updatedAt || '—') + '</td><td class="table-actions"><div class="row-actions"><button class="button button--text" data-action="details" data-record="' + record.id + '">' + app.icon('source') + '<span>关联详情</span></button><button class="button button--text" data-action="edit" data-record="' + record.id + '">' + app.icon(record.categoryId ? 'edit' : 'plus') + '<span>' + (record.categoryId ? '调整映射' : '建立映射') + '</span></button></div></td></tr>';
      }).join('') : '<tr><td colspan="6" class="empty-cell"><div class="empty-state">' + app.icon('search') + '<strong>未找到符合条件的映射记录</strong><p>请调整名称、分析品类或映射状态，也可重置查询条件。</p></div></td></tr>';
      container.querySelector('#mapping-count').textContent = matched.length ? '共 ' + matched.length + ' 条 · 当前显示第 ' + (start + 1) + '–' + (start + visible.length) + ' 条' : '共 0 条 · 暂无匹配记录';
      container.querySelector('#mapping-position').textContent = matched.length ? '第 ' + page + ' / ' + pages + ' 页' : '暂无分页';
      previous.disabled = page <= 1; next.disabled = page >= pages;
    }
    function query() {
      applied = { category: form.elements.namedItem('category').value, status: form.elements.namedItem('status').value, keyword: form.elements.namedItem('keyword').value };
      page = 1; render();
    }
    function changed(message, record) {
      render();
      const feedback = container.querySelector('#mapping-feedback');
      feedback.hidden = false;
      const index = matched.findIndex(function (item) { return item.id === record.id; });
      feedback.textContent = message + (index < 0 ? ' 当前筛选未包含该记录，可调整条件查看。' : ' 记录位于当前查询第 ' + (Math.floor(index / pageSize) + 1) + ' 页。');
    }
    form.addEventListener('submit', function (event) { event.preventDefault(); query(); });
    form.addEventListener('change', function (event) { if (event.target.tagName === 'SELECT') query(); });
    container.querySelector('#mapping-size').addEventListener('change', function (event) { pageSize = Number(event.target.value); query(); });
    container.addEventListener('click', function (event) {
      if (event.target.closest('dialog, .task-workspace')) return;
      const target = event.target.closest('[data-action]');
      if (!target || target.disabled) return;
      const action = target.dataset.action;
      if (action === 'reset') { form.reset(); query(); }
      if (action === 'previous') { page--; render(); }
      if (action === 'next') { page++; render(); }
      if (action === 'edit') edit(container, target.dataset.record, changed);
      if (action === 'details') details(container, target.dataset.record);
    });
    render();
  };
}());
