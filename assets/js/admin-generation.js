(function () {
  'use strict';
  const app = window.FrozenApp, store = app.generationStore, data = app.generationSchedule;
  const esc = app.presentation ? app.presentation.escape : app.escape;
  const weekNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const keys = group => group === 'reports' ? ['report-week', 'report-month'] : ['week', 'month'];
  const reportKey = key => key.startsWith('report');
  const monthly = key => key.endsWith('month');
  const cycle = c => (c.frequency === 'week' ? '每' + weekNames[c.weekday] : '每月' + c.day + '日') + ' ' + c.time;
  const periodText = key => (monthly(key) ? '上一自然月' : '上一完整周') + (reportKey(key) ? ' · 按商户分别生成' : '');
  function tone(label) { return label === '成功' ? 'success' : ['失败', '部分成功'].includes(label) ? 'danger' : 'warning'; }
  function recent(key) {
    const log = store.records(reportKey(key) ? 'reports' : 'bulletins', key)[0];
    return log ? { label: log.status === 'running' ? '执行中' : data.labels[log.status], time: log.time, result: log.result, log } : { label: '尚未执行', time: '', result: '暂无生成记录' };
  }
  function recentPeriod(key, log) {
    const periods = Array.from(new Set((log ? log.details : []).filter(d => d.start && d.end).map(d => d.start + '～' + d.end)));
    if (!periods.length) return { text: '暂无数据期间', full: '暂无数据期间' };
    const full = periods.join('；');
    if (periods.length > 1) return { text: periods.length + '个数据期间', full };
    const [start, end] = periods[0].split('～');
    const monthEnd = new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)), 0)).toISOString().slice(0, 10);
    return { text: monthly(key) && start.endsWith('-01') && end === monthEnd ? start.slice(0, 4) + '年' + Number(start.slice(5, 7)) + '月' : start + '～' + (start.slice(0, 4) === end.slice(0, 4) ? end.slice(5) : end), full };
  }
  function recentRows(group, selected) {
    return keys(group).filter(key => !selected || key === selected).map(key => {
      const last = recent(key), current = store.summary(key), config = current.config, period = recentPeriod(key, last.log);
      const label = !config.enabled ? '已停用' : current.status === 'running' ? '执行中' : last.log ? last.label : current.label;
      const next = config.enabled ? [current.next, current.retry].filter(Boolean).sort()[0] : '';
      const fullResult = [last.result, ...(last.log ? last.log.details.map(d => d.message) : [])].filter(Boolean).join('；');
      return '<div class="generation-recent-row" data-recent-key="' + key + '"><strong>' + (monthly(key) ? '月报' : '周报') + '</strong>' +
        '<span class="generation-recent-field"><span class="generation-recent-label">执行周期：</span><span title="北京时间">' + esc(cycle(config)) + '</span></span>' +
        '<span class="generation-recent-field generation-recent-time" title="按定期计划与待补任务中较早的时间执行（北京时间）"><span class="generation-recent-label">下次执行：</span>' + (next ? '<time datetime="' + esc(next.replace(' ', 'T') + '+08:00') + '">' + esc(next.slice(0, 16)) + '</time>' : '<span>已停用</span>') + '</span>' +
        '<span class="generation-recent-field" title="' + esc(fullResult) + '"><span class="generation-recent-label">状态：</span><span class="status-tag status-tag--' + tone(label) + '">' + esc(label) + '</span></span>' +
        '<span class="generation-recent-field" title="最近执行的数据范围：' + esc(period.full) + '"><span class="generation-recent-label">数据范围：</span><span>' + esc(period.text) + '</span></span>' +
        '<span class="generation-compact-actions" role="group" aria-label="' + (monthly(key) ? '月报' : '周报') + '管理">' +
        '<button type="button" class="button button--text" data-action="generation-settings" data-generation-key="' + key + '">' + app.icon('calendar') + '<span>' + (monthly(key) ? '月报设置' : '周报设置') + '</span></button>' +
        '<button type="button" class="button button--text" data-action="generation-records" data-generation-key="' + key + '">' + app.icon('history') + '<span>生成记录</span></button></span></div>';
    }).join('');
  }
  function summary(group, selected) {
    return keys(group).filter(key => !selected || key === selected).map(key => {
      const s = store.summary(key), last = recent(key);
      s.label = !s.config.enabled ? '已停用' : s.status === 'running' ? '执行中' : last.label;
      s.lastAt = last.time; s.result = last.result;
      return '<div class="generation-summary-row"><div><strong>' + esc(s.name) + '</strong><span class="cell-secondary">' + esc(cycle(s.config) + '（北京时间） · ' + periodText(key, s.config)) + '</span></div><div><span class="status-tag status-tag--' + tone(s.label) + '">' + esc(s.label) + '</span><span class="cell-secondary">下次生成：' + esc(s.next) + '</span></div><div><span>最近生成：' + esc(s.lastAt || '尚未执行') + '</span><span class="cell-secondary">' + esc(s.result) + '</span>' + (s.pending ? '<span class="cell-secondary">待补生成 ' + s.pending + ' 份' + (s.retry ? ' · 下次检查：' + esc(s.retry) : ' · 启用后继续检查') + '</span>' : '') + '</div></div>';
    }).join('');
  }
  function markup(group, selected) {
    return '<section class="panel generation-recent-panel" aria-label="' + (group === 'reports' ? '商户经营报告' : '行情简报') + '生成情况"><div data-generation-summary aria-live="polite">' + recentRows(group, selected) + '</div></section>';
  }
  function tabs(group) {
    return '<div class="section-tabs" role="tablist" aria-label="' + (group === 'reports' ? '商户经营报告' : '市场行情简报') + '">' + ['week', 'month'].map(kind =>
      '<button type="button" class="section-tab" role="tab" id="' + group + '-tab-' + kind + '" data-period-tab="' + kind + '" aria-selected="' + (kind === 'week') + '" aria-controls="' + group + '-panel" tabindex="' + (kind === 'week' ? '0' : '-1') + '">' + app.icon(kind === 'week' ? 'calendar' : 'report') + '<span>' + (kind === 'week' ? '周报' : '月报') + '</span></button>').join('') + '</div>';
  }
  function selectTab(host, group, kind) {
    host.querySelectorAll('[data-period-tab]').forEach(tab => {
      const selected = tab.dataset.periodTab === kind;
      tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
    });
    host.querySelector('#' + group + '-panel').setAttribute('aria-labelledby', group + '-tab-' + kind);
    host.querySelector('[data-generation-summary]').innerHTML = recentRows(group, group === 'reports' ? 'report-' + kind : kind);
    host.querySelector('[data-period-tab="' + kind + '"]').focus();
  }
  function records(group, selected) {
    const logs = store.records(group, selected);
    if (!logs.length) return '<div class="empty-state"><strong>暂无执行记录</strong><p>到达设定时间后，系统自动生成并记录处理结果。</p></div>';
    return '<ol class="history-list">' + logs.map(log => '<li><div class="history-heading"><strong>' + esc(data.names[log.key] + ' · ' + (log.status === 'running' ? '执行中' : data.labels[log.status])) + '</strong><span class="muted">' + esc(log.time) + '</span></div>' + ('<p class="field-hint">数据期间：' + esc(Array.from(new Set(log.details.map(d => d.start + ' 至 ' + d.end))).join('；')) + '</p>') + '<p>' + esc(log.result) + '</p><details data-record-key="' + esc(log.id) + '"><summary>查看执行明细</summary>' + log.details.map(d => '<dl class="detail-grid generation-log"><div class="span-full"><dt>生成对象</dt><dd>' + esc(d.target) + '</dd></div><div><dt>数据期间</dt><dd>' + esc(d.start + ' 至 ' + d.end) + '</dd></div><div><dt>计划时间 / 配置版本</dt><dd>' + esc(d.scheduledAt + ' / V' + d.configRevision) + '</dd></div><div><dt>执行次数</dt><dd>第 ' + d.attempt + ' 次</dd></div><div><dt>执行人</dt><dd>系统</dd></div><div class="span-full"><dt>' + esc(d.status === 'running' ? '执行中' : data.labels[d.status]) + '</dt><dd>' + esc(d.message) + '</dd></div></dl>').join('') + '</details></li>').join('') + '</ol>';
  }
  function fields(key, s) {
    const c = s.config, report = reportKey(key);
    const options = (values, selected) => values.map(([id, label]) => '<option value="' + id + '"' + (String(selected) === String(id) ? ' selected' : '') + '>' + label + '</option>').join('');
    const categoryText = c.categories.length === app.categoryCatalog.ids().length ? '全部品类' : '已选 ' + c.categories.length + ' 个品类';
    const weekday = '<label class="form-field" data-weekday' + (c.frequency !== 'week' ? ' hidden' : '') + '><span>每周执行日</span><select class="form-control" name="weekday">' + options([1, 2, 3, 4, 5, 6, 0].map(i => [i, weekNames[i]]), c.weekday) + '</select></label>';
    const monthday = '<label class="form-field" data-monthday' + (c.frequency !== 'month' ? ' hidden' : '') + '><span>每月执行日</span><input class="form-control" name="day" type="number" min="1" max="31" step="1" value="' + c.day + '" required></label>';
    return '<section class="generation-config" data-generation-key="' + key + '"><div class="edit-grid">' +
      '<div class="form-field span-full"><span>启用状态</span><label class="generation-switch"><input type="checkbox" role="switch" aria-label="启用自动生成" name="enabled"' + (c.enabled ? ' checked' : '') + '><span class="generation-switch-track" aria-hidden="true"></span><span data-enabled-label>' + (c.enabled ? '已启用' : '已停用') + '</span></label></div>' +
      '<div class="form-field span-full"><span>执行周期</span><div class="generation-setting-value">' + (monthly(key) ? '每月' : '每周') + '</div></div>' +
      (monthly(key) ? monthday : weekday) +
      '<label class="form-field"><span>执行时间（北京时间）</span><input class="form-control" name="time" type="time" value="' + c.time + '" required></label>' +
      (monthly(key) ? '<p class="field-hint span-full generation-setting-hint">当月无所选日期时，在当月最后一天执行。</p>' : '') +
      '<div class="form-field span-full"><span>数据范围</span><div class="generation-setting-value">' + (monthly(key) ? '上一自然月（1日至月末）' : '上一完整周（周一至周日）') + '</div></div>' +
      (report ? '<div class="form-field span-full"><span>生成对象</span><div class="generation-setting-value">全部商户，按本户经营品类分别生成报告与建议</div></div>' : '<details class="generation-category span-full"><summary>' + app.icon('grid') + '<span>分析品类</span><strong data-category-count>' + esc(categoryText) + '</strong>' + app.icon('down') + '</summary><fieldset class="choice-field"><legend hidden>分析品类（至少一项）</legend><div class="check-group">' + app.categoryCatalog.grouped().map(item => '<label class="check-choice"><input type="checkbox" name="category" value="' + item.id + '"' + (c.categories.includes(item.id) ? ' checked' : '') + '><span>' + esc(item.name) + '</span></label>').join('') + '</div></fieldset></details>') + '</div></section>';
  }
  function configureForm(dialog, saved, refresh) {
    const form = dialog.querySelector('form');
    form.addEventListener('change', event => {
      if (event.target.name === 'enabled') event.target.closest('[data-generation-key]').querySelector('[data-enabled-label]').textContent = event.target.checked ? '已启用' : '已停用';
      if (event.target.name === 'category') {
        const section = event.target.closest('[data-generation-key]'), count = section.querySelectorAll('[name="category"]:checked').length;
        section.querySelector('[data-category-count]').textContent = count === app.categoryCatalog.ids().length ? '全部品类' : '已选 ' + count + ' 个品类';
      }
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      const changes = saved.map(s => {
        const section = form.querySelector('[data-generation-key="' + s.key + '"]');
        const val = name => section.querySelector('[name="' + name + '"]').value;
        const frequency = s.config.frequency;
        return { key: s.key, revision: s.revision, config: { ...s.config,
          enabled: section.querySelector('[name="enabled"]').checked, frequency, weekday: frequency === 'week' ? Number(val('weekday')) : s.config.weekday, day: frequency === 'month' ? Number(val('day')) : s.config.day, time: val('time'),
          categories: reportKey(s.key) ? s.config.categories : Array.from(section.querySelectorAll('[name="category"]:checked')).map(n => n.value) } };
      });
      const result = store.saveMany(changes);
      if (!result.valid) { form.querySelector('[role="alert"]').textContent = result.message; return; }
      dialog.close(); refresh((result.unchanged ? '生成设置未变化。' : '生成设置已保存。') + (result.storageAvailable ? '' : ' 设置保存暂不可用，请稍后重试。'));
    });
  }
  function edit(host, group, refresh, selected) {
    selected = keys(group).includes(selected) ? selected : keys(group)[0];
    const saved = [store.summary(selected)];
    const body = '<div class="content-stack"><form id="generation-settings-form">' + fields(selected, saved[0]) + '<p class="field-hint">生成后进入待复核，复核通过后仍需人工发布。</p><p class="field-error" role="alert"></p></form></div>';
    const dialog = app.openDialog(host, monthly(selected) ? '月报设置' : '周报设置', body, '<button type="button" class="button" data-close>' + app.icon('close') + '<span>取消</span></button><button class="button button--primary" type="submit" form="generation-settings-form">' + app.icon('check') + '<span>保存设置</span></button>', false);
    configureForm(dialog, saved, refresh);
  }
  function recordTabs(selected, group) {
    return '<div class="section-tabs" role="tablist" aria-label="' + (group === 'reports' ? '商户报告' : '简报') + '生成记录">' + keys(group).map(key => [key, monthly(key) ? '月报' : '周报']).map(tab =>
      '<button type="button" class="section-tab" role="tab" data-generation-tab="' + tab[0] + '" aria-selected="' + (selected === tab[0]) + '" tabindex="' + (selected === tab[0] ? '0' : '-1') + '">' + app.icon(tab[0] === 'week' ? 'calendar' : 'report') + '<span>' + tab[1] + '</span></button>').join('') + '</div>';
  }
  function openRecords(host, initialKey, group = 'bulletins') {
    const types = keys(group);
    let selected = types.includes(initialKey) ? initialKey : types[0];
    const dialog = app.openDetailPage(host, '生成记录', '<div class="content-stack">' + recordTabs(selected, group) + '<section data-record-status>' + summary(group, selected) + '</section><section data-record-list>' + records(group, selected) + '</section></div>', '', true);
    function render() {
      const expanded = new Set(Array.from(dialog.querySelectorAll('details[data-record-key][open]')).map(node => node.dataset.recordKey));
      dialog.querySelector('.section-tabs').outerHTML = recordTabs(selected, group);
      dialog.querySelector('[data-record-status]').innerHTML = summary(group, selected);
      dialog.querySelector('[data-record-list]').innerHTML = records(group, selected);
      dialog.querySelectorAll('details[data-record-key]').forEach(node => { node.open = expanded.has(node.dataset.recordKey); });
    }
    dialog.addEventListener('click', event => {
      const tab = event.target.closest('[data-generation-tab]');
      if (!tab) return;
      selected = tab.dataset.generationTab; render();
    });
    dialog.addEventListener('keydown', event => {
      const tab = event.target.closest('[data-generation-tab]');
      if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      selected = event.key === 'Home' ? types[0] : event.key === 'End' ? types[1] : selected === types[0] ? types[1] : types[0];
      render(); dialog.querySelector('[data-generation-tab="' + selected + '"]').focus();
    });
    const unsubscribe = store.subscribe(() => { if (dialog.isConnected) render(); else unsubscribe(); });
    dialog.addEventListener('close', unsubscribe, { once: true });
    const previousCleanup = app.generationPageCleanup;
    app.generationPageCleanup = () => { unsubscribe(); if (previousCleanup) previousCleanup(); };
  }
  function bind(host, group, refresh, selected) {
    const unsubscribe = store.subscribe(() => {
      if (!host.isConnected) { unsubscribe(); return; }
      const output = host.querySelector('[data-generation-summary]');
      if (output) output.innerHTML = recentRows(group, selected ? selected() : undefined);
      refresh();
    });
    app.generationPageCleanup = unsubscribe;
  }
  app.generationActions = { markup, tabs, selectTab, edit, openRecords, bind, records };
}());
