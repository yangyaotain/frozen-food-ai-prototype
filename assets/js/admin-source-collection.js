(function () {
  'use strict';
  const app = window.FrozenApp, store = app.collectionStore, data = app.sourceCollection;
  const esc = app.presentation ? app.presentation.escape : app.escape;
  function records(id) {
    const rows = store.records(id);
    if (!rows.length) return '<div class="empty-state"><strong>暂无获取记录</strong><p>执行获取后，可在这里查看新增、重复和失败数量。</p></div>';
    return '<ol class="history-list">' + rows.map(log => {
      const batch = log.collectionBatch;
      return '<li><div class="history-heading"><strong>' + esc(batch.trigger) + ' · 第 ' + batch.attempt + ' 次尝试</strong><span class="muted">' + esc(log.at) + '</span></div><p>' + esc(log.opinion) + '</p><details data-record-key="' + esc(batch.id) + '"><summary>查看获取明细</summary><dl class="detail-grid"><div class="span-full"><dt>获取批次</dt><dd>' + esc(batch.id) + '</dd></div><div><dt>检查期间（北京时间）</dt><dd>' + esc(data.stamp(batch.from)) + ' 至 ' + esc(data.stamp(batch.to)) + '</dd></div><div><dt>期间外跳过</dt><dd>' + batch.skipped + ' 条</dd></div><div><dt>执行人</dt><dd>' + esc(log.actor) + '</dd></div><div><dt>执行来源 / 获取配置版本</dt><dd>V' + batch.sourceVersion + ' / V' + batch.configRevision + '</dd></div><div class="span-full"><dt>执行时来源地址</dt><dd class="source-address">' + esc(batch.sourceUrl) + '</dd></div></dl></details></li>';
    }).join('') + '</ol>';
  }
  function edit(host, id, changed) {
    const source = app.sourceStore.find(id), state = store.summary(source), c = state.config, revision = c.revision;
    const option = (values, selected) => Object.keys(values).map(key => '<option value="' + key + '"' + (key === selected ? ' selected' : '') + '>' + esc(values[key]) + '</option>').join('');
    const dialog = app.openDialog(host, '资讯获取设置', '<div class="content-stack"><dl class="detail-grid"><div><dt>来源名称</dt><dd>' + esc(source.name) + '</dd></div><div><dt>确认状态</dt><dd>' + esc(app.sourceData.sourceStates[source.status].name) + '</dd></div><div class="span-full"><dt>获取地址</dt><dd class="source-address">' + esc(source.url) + '</dd></div></dl><form id="collection-config" class="edit-grid"><label class="form-field"><span>获取规则</span><select class="form-control" name="rule"><option value="">未配置</option>' + option(data.rules, c.rule) + '</select></label><label class="form-field"><span>获取周期（北京时间）</span><select class="form-control" name="schedule">' + option(data.schedules, c.schedule) + '</select></label><label class="check-choice span-full"><input type="checkbox" name="enabled"' + (c.enabled ? ' checked' : '') + '><span>启用自动获取</span></label><p class="field-hint span-full">来源已确认且获取规则有效时，可启用自动获取；关闭后可手动获取。首次检查近30天，后续检查新增与更新内容并去重。获取成功后仍需逐篇核验、人工发布。</p><p class="field-error span-full" role="alert"></p></form></div>',
      '<button class="button" type="button" data-close>' + app.icon('close') + '<span>关闭</span></button><button class="button button--primary" type="submit" form="collection-config">' + app.icon('check') + '<span>保存获取设置</span></button>', true);
    dialog.querySelector('form').addEventListener('submit', function (event) {
      event.preventDefault(); const fields = event.target.elements;
      const result = store.save(id, revision, { rule: fields.namedItem('rule').value, schedule: fields.namedItem('schedule').value, enabled: fields.namedItem('enabled').checked });
      if (!result.valid) { dialog.querySelector('[role="alert"]').textContent = result.message; return; }
      dialog.close(); changed(result.unchanged ? '获取配置未变化。' : '获取设置已保存。', id);
    });

  }

  function openRecords(host, id) {
    const source = app.sourceStore.find(id);
    if (!source) return;
    function content() {
      const state = store.summary(source), c = state.config;
      return '<div class="content-stack"><dl class="detail-grid"><div><dt>来源名称</dt><dd>' + esc(source.name) + '</dd></div><div><dt>获取规则</dt><dd>' + esc(data.rules[c.rule] || '未配置') + '</dd></div><div><dt>获取周期</dt><dd>' + esc(data.schedules[c.schedule] || '按需手动获取') + '</dd></div></dl><section><h2>最近执行情况</h2><dl class="detail-grid"><div><dt>获取状态</dt><dd id="collection-state">' + esc(state.label) + '</dd></div><div><dt>下次获取时间</dt><dd id="collection-next">' + esc(state.next) + '</dd></div><div><dt>最近获取时间</dt><dd id="collection-last">' + esc(c.lastAt || '尚未获取') + '</dd></div><div><dt>最近成功时间</dt><dd id="collection-success">' + esc(c.lastSuccessAt || '尚未成功获取') + '</dd></div><div class="span-full"><dt>最近获取结果</dt><dd id="collection-result">' + esc(c.lastResult || '尚未执行') + '</dd></div></dl><p class="field-hint">自动获取失败后，分别在5分钟、15分钟后重试，最多重试2次；仍失败时等待人工处理。关闭自动获取后不安排自动重试。</p></section><section><h2>获取记录</h2><div id="collection-records">' + records(id) + '</div></section></div>';
    }
    const page = app.openDetailPage(host, '资讯获取记录', content());
    const unsubscribe = store.subscribe(function () {
      if (!page.isConnected) { unsubscribe(); return; }
      const expanded = new Set(Array.from(page.querySelectorAll('details[data-record-key][open]')).map(node => node.dataset.recordKey));
      page.querySelector('.task-workspace-main').innerHTML = content();
      page.querySelectorAll('details[data-record-key]').forEach(node => { node.open = expanded.has(node.dataset.recordKey); });
    });
    page.addEventListener('close', unsubscribe, { once: true });
  }
  app.collectionActions = { edit, records, openRecords };
}());
