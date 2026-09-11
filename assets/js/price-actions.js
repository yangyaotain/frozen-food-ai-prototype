(function () {
  'use strict';
  const app = window.FrozenApp;
  const esc = app.presentation ? app.presentation.escape : app.escape;
  const data = app.priceData;
  const store = app.priceStore;
  const money = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function button(action, icon, text, primary) {
    return '<button type="button" class="button' + (primary ? ' button--primary' : '') + '" data-action="' + action + '">' + app.icon(icon) + '<span>' + text + '</span></button>';
  }
  function statusTag(status) { return '<span class="status-tag status-tag--' + data.statuses[status].style + '">' + data.statuses[status].name + '</span>'; }
  function field(name, title, control, hint) {
    return '<label class="form-field"><span>' + title + '</span>' + control + (hint ? '<small class="field-hint">' + hint + '</small>' : '') + '<small class="field-error" id="error-' + name + '" data-error="' + name + '"></small></label>';
  }
  function input(name, type, value, extra) {
    return '<input class="form-control" name="' + name + '" type="' + type + '" value="' + esc(value) + '" aria-describedby="error-' + name + '" ' + (extra || '') + '>';
  }
  function showErrors(form, errors) {
    form.querySelectorAll('[data-error]').forEach(function (node) { node.textContent = errors[node.dataset.error] || ''; });
    ['start', 'category', 'price', 'unit', 'note'].forEach(function (name) {
      const element = form.elements.namedItem(name);
      if (element) element.setAttribute('aria-invalid', errors[name] ? 'true' : 'false');
    });
    const first = form.querySelector('[aria-invalid="true"]');
    if (first) app.focusControl(first);
  }
  function values(form) {
    return Object.fromEntries(['start', 'category', 'price', 'unit', 'note'].map(function (name) { return [name, form.elements.namedItem(name).value]; }));
  }
  function edit(host, id, changed) {
    const record = store.records.find(function (item) { return item.id === id; });
    const categoryOptions = '<option value="">请选择分析品类</option>' + data.categories.map(function (category) { return '<option value="' + category.id + '"' + (record && record.category.id === category.id ? ' selected' : '') + '>' + category.name + '</option>'; }).join('');
    const body = '<p class="dialog-description">保存后进入待复核。同一采价周、同一品类只保留一条当前记录，修改历史会保留。</p>' +
      '<form id="price-edit" class="edit-grid" novalidate>' +
      field('start', '采价周起始日期 *', input('start', 'date', record ? record.week.id : '', 'required'), '请选择周一，采价期间为该周周一至周日。') +
      field('category', '分析品类 *', '<select class="form-control" name="category" aria-describedby="error-category" data-floating-panel="true" required>' + categoryOptions + '</select>') +
      field('price', '周均价格 *', input('price', 'text', record ? record.price : '', 'inputmode="decimal" maxlength="12" placeholder="例如 12800.00" required'), '大于 0，最多 9 位整数、2 位小数。') +
      field('unit', '单位', input('unit', 'text', '元/吨', 'readonly'), '人民币，价格单位为元/吨。') +
      '<div class="span-full">' + field('note', '备注', '<textarea class="form-control" name="note" maxlength="200" aria-describedby="error-note" placeholder="填写本次维护说明，最多 200 字">' + esc(record ? record.note : '') + '</textarea>') + '</div></form>';
    const dialog = app.openDialog(host, record ? '编辑周均采价' : '新增周均采价', body,
      '<button type="button" class="button" data-close>' + app.icon('close') + '<span>取消</span></button><button class="button button--primary" type="submit" form="price-edit">' + app.icon('check') + '<span>保存</span></button>');
    const form = dialog.querySelector('form');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      const result = store.save(values(form), record ? record.id : null);
      if (!result.valid) { showErrors(form, result.errors); return; }
      dialog.close();
      changed(result.unchanged ? '内容未变化，未新增版本。' : '已保存，当前状态为待复核。', result.record);
    });
  }
  function summary(record) {
    return '<dl class="detail-grid"><div><dt>采价期间</dt><dd>' + esc(record.week.id + ' — ' + record.week.end) + '</dd></div><div><dt>分析品类</dt><dd>' + esc(record.category.name) + '</dd></div><div><dt>周均价格</dt><dd>' + esc(money.format(record.price)) + ' 元/吨</dd></div><div><dt>状态 / 数据版本</dt><dd>' + statusTag(record.status) + ' <span class="muted">V' + record.version + '</span></dd></div></dl>';
  }
  function review(host, id, changed) {
    const record = store.records.find(function (item) { return item.id === id; });
    if (!record || record.status !== 'pending') return;
    const dialog = app.openDialog(host, '复核周均采价', summary(record) +
      '<p class="dialog-description">当前复核人：复核员。复核通过后标记为已复核；退回后由采价员修改并重新提交。</p>' +
      '<form id="price-review" class="edit-grid"><label class="form-field span-full"><span>复核结论 *</span><select name="decision" class="form-control"><option value="reviewed">复核通过</option><option value="revision">退回修改</option></select></label><label class="form-field span-full"><span>复核意见 *</span><textarea class="form-control" name="opinion" maxlength="200" placeholder="填写复核依据或需要修改的内容" aria-describedby="review-error"></textarea></label><p class="field-error span-full" id="review-error" role="alert"></p></form>',
      '<button type="button" class="button" data-close>' + app.icon('close') + '<span>取消</span></button><button class="button button--primary" type="submit" form="price-review">' + app.icon('check') + '<span>确认复核</span></button>');
    const form = dialog.querySelector('form');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      const result = store.review(id, form.elements.namedItem('decision').value, form.elements.namedItem('opinion').value);
      if (!result.valid) {
        dialog.querySelector('#review-error').textContent = result.message;
        form.elements.namedItem('opinion').setAttribute('aria-invalid', 'true');
        form.elements.namedItem('opinion').focus(); return;
      }
      dialog.close(); changed('复核结果已保存：' + data.statuses[result.record.status].name + '。', result.record);
    });
  }
  function history(host, id) {
    const record = store.records.find(function (item) { return item.id === id; });
    if (!record) return;
    const related = store.records.filter(function (item) { return item.category.id === record.category.id; }).sort(function (a, b) { return b.week.id.localeCompare(a.week.id); });
    const rows = related.map(function (item) { return '<tr><td>' + esc(item.week.id + ' — ' + item.week.end) + '</td><td class="numeric">' + esc(money.format(item.price)) + '</td><td>' + statusTag(item.status) + '</td><td>V' + item.version + '</td></tr>'; }).join('');
    function snapshotText(value) {
      return value ? value.week.id + ' / ' + value.category.name + ' / ' + money.format(value.price) + ' 元/吨 / ' + data.statuses[value.status].name + ' / V' + value.version + '；备注：' + (value.note || '无') : '无原记录';
    }
    const logs = record.history.slice().reverse().map(function (log) {
      return '<li><div class="history-heading"><strong>' + esc(log.action) + '</strong><span class="muted">' + esc(log.actor + ' · ' + log.at) + '</span></div><p>' + esc(log.opinion) + '</p>' +
        (log.before ? '<p class="history-change"><span>操作前</span>' + esc(snapshotText(log.before)) + '</p>' : '') +
        '<p class="history-change"><span>操作后</span>' + esc(snapshotText(log.after)) + '</p></li>';
    }).join('');
    const body = '<div class="content-stack">' + summary(record) + '<p class="detail-note">备注：' + esc(record.note || '无') + '</p>' +
      '<div class="button-group"><span class="muted">来源：' + esc(record.batchId ? '批量导入 · ' + record.batchId : (record.history[0].action === '初始记录' ? '初始采价记录' : '手工新增')) + '</span>' + (record.batchId ? button('batch', 'source', '查看导入批次') : '') + '</div>' +
      '<section><h2>本条维护与复核记录</h2><ol class="history-list">' + logs + '</ol></section>' +
      '<section><h2>' + esc(record.category.name) + '历史周均价格</h2><p class="field-hint">以下为该品类各周当前记录，单位：元/吨。</p><div class="table-scroll"><table class="data-table compact-table"><thead><tr><th scope="col">采价期间</th><th scope="col" class="numeric">周均价格</th><th scope="col">复核状态</th><th scope="col">数据版本</th></tr></thead><tbody>' + rows + '</tbody></table></div></section></div>';
    const dialog = app.openDetailPage(host, '采价详情与历史', body, '', true);
    const batchButton = dialog.querySelector('[data-action="batch"]');
    if (batchButton) batchButton.addEventListener('click', function () { batchDetail(host, record.batchId); });
  }
  function batchDetail(host, id) {
    const batch = store.batches.find(function (item) { return item.id === id; });
    if (!batch) return;
    const rows = batch.items.map(function (item) {
      const record = item.record;
      return '<tr><td>' + item.line + '</td><td>' + esc(record.week.id) + '</td><td>' + esc(record.category.name) + '</td><td class="numeric">' + esc(money.format(record.price)) + '</td><td>' + statusTag(record.status) + '</td><td class="wrap-cell">' + esc(record.note || '—') + '</td></tr>';
    }).join('');
    app.openDetailPage(host, '导入批次详情', '<div class="content-stack"><dl class="detail-grid"><div><dt>批次编号</dt><dd>' + esc(batch.id) + '</dd></div><div><dt>文件名称</dt><dd>' + esc(batch.filename) + '</dd></div><div><dt>导入人 / 时间</dt><dd>' + esc(batch.actor + ' / ' + batch.at) + '</dd></div><div><dt>导入结果</dt><dd>成功 ' + batch.items.length + ' 条，失败 0 条</dd></div></dl><p class="dialog-description">以下为导入时的原始记录快照，后续修改与复核不会覆盖本批次记录。</p><div class="table-scroll import-preview"><table class="data-table compact-table"><thead><tr><th scope="col">文件行号</th><th scope="col">采价周起始</th><th scope="col">品类</th><th scope="col" class="numeric">周均价格（元/吨）</th><th scope="col">导入时状态</th><th scope="col">备注</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>', '', true);
  }
  function batches(host) {
    const rows = store.batches.map(function (batch) { return '<tr><td>' + esc(batch.id) + '</td><td class="wrap-cell">' + esc(batch.filename) + '</td><td>' + batch.items.length + '</td><td>' + esc(batch.at) + '</td><td><button class="button button--text" data-batch="' + esc(batch.id) + '">' + app.icon('source') + '<span>详情</span></button></td></tr>'; }).join('');
    const body = rows ? '<div class="table-scroll"><table class="data-table compact-table"><thead><tr><th scope="col">批次编号</th><th scope="col">文件名称</th><th scope="col">成功条数</th><th scope="col">导入时间</th><th scope="col">操作</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="empty-state">' + app.icon('upload') + '<strong>暂无导入批次</strong><p>完成批量导入后，可在这里查看批次与原始记录。</p></div>';
    const dialog = app.openDetailPage(host, '导入批次', body, '', true);
    dialog.addEventListener('click', function (event) { const target = event.target.closest('[data-batch]'); if (target) batchDetail(host, target.dataset.batch); });
  }
  function downloadTemplate() {
    const starts = store.records.map(function (record) { return record.week.id; }).sort();
    const start = data.dateAfter(starts[starts.length - 1], 7);
    const csv = '\uFEFF' + data.headers.join(',') + '\r\n' + data.categories.map(function (category, index) { return [start, category.name, [12800, 24600, 18200][index], '元/吨', '周均采价'].join(','); }).join('\r\n') + '\r\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = '每周平均采价导入模板.csv'; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function importFile(host, changed) {
    const body = '<div class="content-stack"><ol class="step-list"><li>选择文件</li><li>校验与预览</li><li>确认导入</li></ol>' +
      '<p class="dialog-description">支持 UTF-8 CSV，最多 500 条、2 MB。按模板填写周一日期、品类、周均价格、单位及备注。任何一行有误，整批不导入；重复记录请通过编辑维护。</p>' +
      '<div class="button-group">' + button('template', 'download', '下载模板') + '<span class="field-hint">请按模板填写采价记录后导入。</span></div>' +
      '<div class="button-group"><label class="button file-picker">' + app.icon('upload') + '<span>选择 CSV 文件</span><input class="file-picker-input" type="file" accept=".csv,text/csv" id="price-csv" aria-label="选择 CSV 文件"></label><span class="selected-filename muted" id="csv-file-name">未选择文件</span></div>' +
      '<p id="import-message" role="status" aria-live="polite" class="dialog-description">尚未选择文件。</p><div id="import-preview"></div></div>';
    const dialog = app.openDetailPage(host, '批量导入周均采价', body,
      '<button class="button" type="button" data-close>' + app.icon('close') + '<span>取消</span></button>' + button('confirm-import', 'upload', '确认导入', true), { editable: true });
    const confirm = dialog.querySelector('[data-action="confirm-import"]');
    const message = dialog.querySelector('#import-message');
    const preview = dialog.querySelector('#import-preview');
    let pending = [], filename = '', loadVersion = 0;
    dialog.addEventListener('close', function () { loadVersion++; pending = []; }, { once: true });
    confirm.disabled = true;
    function renderPreview(checked) {
      const invalid = checked.filter(function (row) { return !row.valid; }).length;
      message.className = invalid ? 'field-error' : 'dialog-description';
      message.textContent = '共 ' + checked.length + ' 条，可导入 ' + (checked.length - invalid) + ' 条，错误 ' + invalid + ' 条。' + (invalid ? '请修正错误后重新选择文件，本批次尚未写入。' : '校验通过，请确认下方内容。');
      const rows = checked.map(function (row) {
        const raw = row.raw || [];
        return '<tr><td>' + row.line + '</td>' + [0, 1, 2, 3].map(function (index) { return '<td class="wrap-cell">' + esc(raw[index] || '') + '</td>'; }).join('') +
          '<td class="wrap-cell">' + esc(raw[4] || '—') + '</td><td class="wrap-cell ' + (row.valid ? '' : 'field-error') + '">' + esc(row.valid ? '通过' : Object.values(row.errors).join(' ')) + '</td></tr>';
      }).join('');
      preview.innerHTML = '<div class="table-scroll import-preview"><table class="data-table compact-table"><thead><tr><th scope="col">文件行号</th><th scope="col">采价周起始</th><th scope="col">品类</th><th scope="col">周均价格</th><th scope="col">单位</th><th scope="col">备注</th><th scope="col">校验结果</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
      confirm.disabled = invalid > 0 || !checked.length;
    }
    dialog.querySelector('[data-action="template"]').addEventListener('click', downloadTemplate);
    dialog.querySelector('#price-csv').addEventListener('change', async function (event) {
      const version = ++loadVersion;
      const file = event.target.files[0];
      dialog.querySelector('#csv-file-name').textContent = file ? file.name : '未选择文件';
      pending = []; filename = ''; confirm.disabled = true; preview.innerHTML = ''; message.className = 'dialog-description';
      if (!file) { message.textContent = '尚未选择文件。'; return; }
      message.textContent = '正在读取并校验文件…';
      try {
        if (!/\.csv$/i.test(file.name)) throw new Error('请选择 .csv 文件，暂不支持 XLSX。');
        if (file.size > 2 * 1024 * 1024) throw new Error('文件超过 2 MB，请拆分后导入。');
        const bytes = await file.arrayBuffer();
        if (version !== loadVersion || !dialog.open || !dialog.isConnected) return;
        let text;
        try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (_) { throw new Error('文件不是有效 UTF-8 编码，请另存为 CSV UTF-8 后重试。'); }
        pending = data.parseCSV(text); filename = file.name; renderPreview(store.validateRows(pending));
      } catch (error) {
        if (version !== loadVersion || !dialog.open || !dialog.isConnected) return;
        message.className = 'field-error'; message.textContent = error.message; confirm.disabled = true;
      }
    });
    confirm.addEventListener('click', function () {
      if (confirm.disabled || !pending.length) return;
      confirm.disabled = true;
      const result = store.importRows(pending, filename);
      if (!result.valid) { renderPreview(result.rows); return; }
      pending = []; dialog.setDirty(false);
      changed('导入成功，共 ' + result.batch.items.length + ' 条，均为待复核。批次：' + result.batch.id + '。');
      dialog.querySelector('.task-workspace-main').innerHTML = '<div class="empty-state">' + app.icon('check') + '<strong>导入成功</strong><p>' + esc(result.batch.filename) + '</p><p>成功 ' + result.batch.items.length + ' 条，失败 0 条；均已进入待复核。</p><p>批次编号：' + esc(result.batch.id) + '</p></div>';
      dialog.querySelector('.task-workspace-footer').innerHTML = button('batch-result', 'source', '查看批次详情') + '<button class="button button--primary" data-close>' + app.icon('check') + '<span>完成</span></button>';
      dialog.querySelector('[data-action="batch-result"]').addEventListener('click', function () { batchDetail(host, result.batch.id); });
      dialog.querySelector('.task-workspace-footer [data-close]').focus();
    });
  }
  app.priceActions = { edit: edit, review: review, history: history, batches: batches, importFile: importFile };
}());
