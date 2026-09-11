(function () {
  'use strict';
  const app = window.FrozenApp;
  app.openDialog = function (host, title, body, footer, wide) {
    const origin = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.className = 'app-dialog' + (wide ? ' app-dialog--wide' : '');
    dialog.setAttribute('aria-label', title);
    dialog.innerHTML = '<div class="dialog-heading"><h2>' + app.escape(title) + '</h2><button class="button" type="button" data-close>' + app.icon('close') + '<span>关闭</span></button></div><div class="dialog-body">' + body + '</div><div class="dialog-footer">' + (footer || '<button class="button" type="button" data-close>' + app.icon('close') + '<span>关闭</span></button>') + '</div>';
    dialog.addEventListener('click', function (event) { if (event.target.closest('[data-close]')) dialog.close(); });
    dialog.addEventListener('close', function () {
      dialog.remove();
      if (origin && origin.isConnected) origin.focus();
      else { const main = host.closest('main') || host; const target = main.querySelector('h1') || (main.matches && main.matches('.page-content[tabindex="-1"]') ? main : null); if (target) target.focus({ preventScroll: true }); }
    }, { once: true });
    host.appendChild(dialog);
    app.enhanceCategorySelects(dialog);
    app.enhanceCategoryChecks(dialog);
    dialog.showModal();
    return dialog;
  };
  // 浮层定位与表单布局分离；常规贴控件下沿，底部空间不足时翻转。
  app.treeSelectPlacement = function (rect, viewport) {
    const margin = 12, gap = 6, width = Math.min(Math.max(rect.width, 360), Math.max(0, viewport.width - margin * 2));
    const below = viewport.height - margin - rect.bottom - gap, above = rect.top - margin - gap;
    const upward = below < 400 && above > below;
    let height = Math.min(400, Math.max(0, upward ? above : below));
    if (height < 160) height = Math.min(400, Math.max(0, viewport.height - margin * 2));
    return { width: width, height: height, left: Math.max(margin, Math.min(rect.left, viewport.width - width - margin)), top: Math.max(margin, Math.min(upward ? rect.top - gap - height : rect.bottom + gap, viewport.height - height - margin)) };
  };
  let treeSelectSerial = 0;
  app.treeSelect = function (host, name, label, nodes, value) {
    const esc = app.escape, panelId = 'tree-select-panel-' + (++treeSelectSerial), expanded = new Set(), leaves = [];
    function collect(items, path) {
      items.forEach(function (item) {
        if (item.children) { if (!path.length) expanded.add(item.id); collect(item.children, path.concat(item)); }
        else leaves.push({ name: item.name, path: path });
      });
    }
    collect(nodes, []);
    function revealSelected() { const selected = leaves.find(function (item) { return item.name === input.value; }); if (selected) selected.path.forEach(function (item) { expanded.add(item.id); }); }
    host.innerHTML = '<input type="hidden" name="' + esc(name) + '"><div class="tree-select"><button type="button" class="form-control tree-select-trigger" aria-haspopup="dialog" aria-expanded="false" aria-controls="' + panelId + '" aria-describedby="system-error-' + esc(name) + '">' + app.icon('organization') + '<span data-tree-label></span><span class="tree-select-arrow">' + app.icon('down') + '</span></button><div class="tree-select-popover" popover="manual" id="' + panelId + '" role="dialog" aria-label="选择' + esc(label) + '"><div class="tree-select-header"><span class="tree-select-heading">' + app.icon('organization') + '<strong>组织结构</strong></span><span class="tree-select-count">' + leaves.length + ' 个部门</span></div><div class="tree-select-search">' + app.icon('search') + '<input type="search" class="form-control" placeholder="搜索组织或部门名称" aria-label="搜索' + esc(label) + '名称"></div><div class="tree-select-options" data-tree-options></div><div class="tree-select-footer"><span class="tree-select-selection" data-tree-selection></span><button class="button button--text" type="button" data-tree-clear>' + app.icon('reset') + '<span>清空选择</span></button></div></div></div>';
    const input = host.querySelector('input[type="hidden"]'), trigger = host.querySelector('.tree-select-trigger'), panel = host.querySelector('.tree-select-popover'), search = host.querySelector('input[type="search"]'), list = host.querySelector('[data-tree-options]');
    const dialog = host.closest('dialog');
    let opened = false, observer;
    input.value = value || ''; revealSelected();
    function branch(items, keyword, parentMatched) {
      return items.map(function (item) {
        const matches = parentMatched || item.name.toLowerCase().includes(keyword);
        if (item.children) {
          const children = branch(item.children, keyword, matches);
          return children ? '<details class="tree-select-branch" data-tree-branch="' + esc(item.id) + '"' + (keyword || expanded.has(item.id) ? ' open' : '') + '><summary><span class="tree-select-chevron">' + app.icon('next') + '</span><span class="tree-select-node-icon">' + app.icon(item.icon || 'organization') + '</span><span>' + esc(item.name) + '</span></summary><div class="tree-select-children">' + children + '</div></details>' : '';
        }
        return matches ? '<button class="select-option tree-select-leaf" type="button" data-tree-value="' + esc(item.name) + '" aria-pressed="' + (input.value === item.name) + '"><span class="tree-select-leaf-icon">' + app.icon('department') + '</span><span>' + esc(item.name) + '</span><span class="tree-select-check">' + app.icon('check') + '</span></button>' : '';
      }).join('');
    }
    function render() {
      const path = app.treePath(nodes, input.value);
      host.querySelector('[data-tree-label]').textContent = path || '请选择' + label;
      trigger.setAttribute('data-has-value', String(Boolean(input.value)));
      trigger.setAttribute('aria-label', label + '：' + (path || '请选择'));
      trigger.title = path || '请选择' + label;
      const selection = host.querySelector('[data-tree-selection]');
      selection.textContent = path ? '已选：' + path : '请选择所属部门'; selection.title = path || '';
      list.innerHTML = branch(nodes, search.value.trim().toLowerCase(), false) || '<div class="tree-select-empty" role="status">' + app.icon('search') + '<strong>没有匹配的' + esc(label) + '</strong><span>请尝试其他组织或部门名称</span></div>';
      host.querySelector('[data-tree-clear]').disabled = !input.value;
    }
    function position() {
      if (!opened) return;
      if (!host.isConnected) { close(false); return; }
      const rect = trigger.getBoundingClientRect();
      const body = trigger.closest('.dialog-body');
      if (body) { const bounds = body.getBoundingClientRect(); if (rect.bottom <= bounds.top || rect.top >= bounds.bottom) { close(false); return; } }
      const placement = app.treeSelectPlacement(rect, { width: window.innerWidth, height: window.innerHeight });
      ['left', 'top', 'width', 'height'].forEach(function (key) { panel.style[key] = placement[key] + 'px'; });
    }
    function outside(event) { if (!host.contains(event.target)) close(false); }
    function keydown(event) {
      if (event.key === 'Escape' && opened) { event.preventDefault(); event.stopPropagation(); close(true); }
    }
    function scroll(event) { if (!panel.contains(event.target)) position(); }
    function focusout(event) { if (event.relatedTarget && !host.contains(event.relatedTarget)) close(false); }
    function close(restoreFocus) {
      if (!opened) return;
      opened = false;
      if (panel.matches(':popover-open')) panel.hidePopover();
      trigger.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', position);
      if (observer) { observer.disconnect(); observer = null; }
      if (restoreFocus && trigger.isConnected) trigger.focus({ preventScroll: true });
    }
    function open() {
      if (opened) { close(true); return; }
      search.value = ''; revealSelected(); render();
      panel.showPopover(); opened = true; trigger.setAttribute('aria-expanded', 'true'); position();
      if (!opened) return;
      document.addEventListener('pointerdown', outside, true);
      document.addEventListener('keydown', keydown, true);
      document.addEventListener('scroll', scroll, true);
      window.addEventListener('resize', position);
      observer = new MutationObserver(function () { if (!host.isConnected) close(false); });
      observer.observe(document.body, { childList: true, subtree: true });
      list.scrollTop = 0;
      const selected = list.querySelector('[aria-pressed="true"]');
      if (selected) list.scrollTop = Math.max(0, selected.getBoundingClientRect().top - list.getBoundingClientRect().top - list.clientHeight / 2);
      search.focus({ preventScroll: true });
    }
    function choose(next) {
      if (next && !leaves.some(function (item) { return item.name === next; })) return;
      input.value = next; search.value = ''; render(); close(true);
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    trigger.addEventListener('click', open);
    list.addEventListener('click', function (event) { const target = event.target.closest('[data-tree-value]'); if (target) choose(target.dataset.treeValue); });
    list.addEventListener('toggle', function (event) {
      if (!search.value.trim() && event.target.dataset.treeBranch) { if (event.target.open) expanded.add(event.target.dataset.treeBranch); else expanded.delete(event.target.dataset.treeBranch); }
    }, true);
    host.querySelector('[data-tree-clear]').addEventListener('click', function () { choose(''); });
    search.addEventListener('input', function () { render(); list.scrollTop = 0; });
    search.addEventListener('keydown', function (event) { if (event.key === 'Enter') event.preventDefault(); });
    host.addEventListener('focusout', focusout);
    panel.addEventListener('toggle', function (event) { if (event.newState === 'closed' && opened) close(false); });
    if (dialog) {
      dialog.addEventListener('close', function () { close(false); }, { once: true });
      dialog.addEventListener('cancel', function (event) { if (opened) { event.preventDefault(); close(true); } });
    }
    render(); return { value: function () { return input.value; }, close: close };
  };
  // 可搜索的周选择器：选项增加后仍支持搜索，不依赖原生 select 的首字匹配。
  app.searchSelect = function (host, name, label, getOptions, settings) {
    settings = settings || {};
    const emptyLabel = settings.emptyLabel || '全部采价周', floating = Boolean(settings.floating);
    host.innerHTML = '<input type="hidden" name="' + app.escape(name) + '"><details class="search-select' + (floating ? ' search-select--floating' : '') + '"><summary class="form-control" aria-label="' + app.escape(label) + '" aria-expanded="false"><span></span>' + app.icon('down') + '</summary><div class="search-select-panel"' + (floating ? ' popover="manual"' : '') + '><input type="search" class="form-control" placeholder="搜索周次或日期" aria-label="搜索' + app.escape(label) + '"><div class="search-select-options"></div></div></details>';
    const input = host.querySelector('input[type="hidden"]');
    const details = host.querySelector('details');
    const summary = host.querySelector('summary');
    const panel = host.querySelector('.search-select-panel');
    const labelNode = host.querySelector('summary span');
    const search = host.querySelector('input[type="search"]');
    search.placeholder = settings.searchPlaceholder || '搜索周次或日期';
    const list = host.querySelector('.search-select-options');
    const dialog = host.closest('dialog');
    let opened = false, observer;
    function refresh() {
      const options = [{ id: '', name: emptyLabel }].concat(getOptions());
      if (input.value && !options.some(function (item) { return item.id === input.value; })) options.splice(1, 0, { id: input.value, name: input.value + '（暂无记录）' });
      const chosen = options.find(function (item) { return item.id === input.value; });
      labelNode.textContent = chosen ? chosen.name : emptyLabel;
      const keyword = search.value.trim();
      const matched = options.filter(function (item) { return !item.id || (item.name + ' ' + (item.group || '') + ' ' + item.id).toLowerCase().includes(keyword.toLowerCase()); });
      list.innerHTML = matched.map(function (item) { return '<button type="button" class="select-option" data-value="' + app.escape(item.id) + '" aria-pressed="' + (input.value === item.id) + '">' + app.icon(input.value === item.id ? 'check' : (settings.icon || 'calendar')) + '<span>' + app.escape(item.name) + '</span></button>'; }).join('') + (matched.length === 1 && keyword ? '<p class="muted">' + app.escape(settings.emptyMessage || '没有匹配的采价周') + '</p>' : '');
    }
    list.addEventListener('click', function (event) {
      const button = event.target.closest('[data-value]');
      if (!button) return;
      input.value = button.dataset.value; details.open = false; search.value = ''; refresh();
      summary.focus();
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    search.addEventListener('input', refresh);
    search.addEventListener('keydown', function (event) { if (event.key === 'Enter') event.preventDefault(); });
    function position() {
      if (!floating || !opened) return;
      if (!host.isConnected) { closeFloating(false); return; }
      const rect = summary.getBoundingClientRect();
      const body = summary.closest('.dialog-body');
      if (body) { const bounds = body.getBoundingClientRect(); if (rect.bottom <= bounds.top || rect.top >= bounds.bottom) { closeFloating(false); return; } }
      panel.style.width = Math.min(Math.max(rect.width, 300), Math.max(0, window.innerWidth - 24)) + 'px';
      panel.style.maxHeight = '360px';
      const height = Math.min(panel.getBoundingClientRect().height || panel.scrollHeight || 320, 360);
      const below = window.innerHeight - 12 - rect.bottom - 6, above = rect.top - 12 - 6;
      const upward = below < height && above > below;
      const available = Math.max(0, upward ? above : below);
      const renderedHeight = Math.min(height, available);
      panel.style.maxHeight = Math.min(360, available) + 'px';
      panel.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - panel.getBoundingClientRect().width - 12)) + 'px';
      panel.style.top = Math.max(12, Math.min(upward ? rect.top - 6 - renderedHeight : rect.bottom + 6, window.innerHeight - renderedHeight - 12)) + 'px';
    }
    function outside(event) { if (!host.contains(event.target)) closeFloating(false); }
    function scroll(event) { if (!panel.contains(event.target)) position(); }
    function closeFloating(restoreFocus) {
      if (!floating) return;
      details.open = false;
      if (opened && panel.matches(':popover-open')) panel.hidePopover();
      opened = false; summary.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', position);
      if (observer) { observer.disconnect(); observer = null; }
      if (restoreFocus && summary.isConnected) summary.focus({ preventScroll: true });
    }
    function openFloating() {
      if (!floating || opened) return;
      panel.style.visibility = 'hidden'; panel.showPopover(); opened = true;
      summary.setAttribute('aria-expanded', 'true'); position(); panel.style.visibility = '';
      document.addEventListener('pointerdown', outside, true);
      document.addEventListener('scroll', scroll, true);
      window.addEventListener('resize', position);
      observer = new MutationObserver(function () { if (!host.isConnected) closeFloating(false); });
      observer.observe(document.body, { childList: true, subtree: true });
    }
    details.addEventListener('toggle', function () {
      summary.setAttribute('aria-expanded', String(details.open));
      if (details.open) { search.value = ''; refresh(); if (floating) openFloating(); search.focus({ preventScroll: floating }); }
      else if (floating) closeFloating(false);
    });
    details.addEventListener('keydown', function (event) { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (floating) closeFloating(true); else { details.open = false; summary.focus(); } } });
    details.addEventListener('focusout', function (event) { if (event.relatedTarget && !details.contains(event.relatedTarget)) { if (floating) closeFloating(false); else details.open = false; } });
    if (floating) {
      panel.addEventListener('toggle', function (event) { if (event.newState === 'closed' && opened) closeFloating(false); });
      if (dialog) {
        dialog.addEventListener('close', function () { closeFloating(false); }, { once: true });
        dialog.addEventListener('cancel', function (event) { if (opened) { event.preventDefault(); event.stopPropagation(); closeFloating(true); } });
      }
    }
    refresh();
    const picker = { element: details, refresh: refresh, setValue: function (value) { input.value = value; refresh(); }, reset: function () { input.value = ''; if (floating) closeFloating(false); else details.open = false; search.value = ''; refresh(); } };
    input.queryPicker = picker;
    return picker;
  };
  // Keep the original select as the form value and event source, including form.reset().
  app.enhanceCategorySelects = function (host) {
    host.querySelectorAll('select[name="category"], select[name="categoryId"]').forEach(function (select) {
      if (select.dataset.searchEnhanced || select.options.length <= 10) return;
      select.dataset.searchEnhanced = 'true';
      const pickerHost = document.createElement('div');
      pickerHost.className = 'category-picker';
      select.insertAdjacentElement('afterend', pickerHost);
      const picker = app.searchSelect(pickerHost, '', '分析品类', function () {
        return app.categoryCatalog.grouped().map(function (c) { return { id: c.id, name: c.group + ' · ' + c.name, group: c.group }; });
      }, { emptyLabel: select.options[0].textContent, searchPlaceholder: '搜索品类名称或分组', emptyMessage: '没有匹配的品类', icon: 'grid', floating: select.dataset.floatingPanel === 'true' });
      picker.setValue(select.value);
      select.queryPicker = picker;
      select.hidden = true; select.tabIndex = -1; select.setAttribute('aria-hidden', 'true');
      select.required = false;
      const summary = pickerHost.querySelector('summary');
      if (select.getAttribute('aria-describedby')) summary.setAttribute('aria-describedby', select.getAttribute('aria-describedby'));
      pickerHost.addEventListener('change', function (event) {
        event.stopPropagation(); select.value = event.target.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      select.addEventListener('change', function () { picker.setValue(select.value); });
      if (select.form) {
        select.form.addEventListener('reset', function () { window.setTimeout(function () { picker.reset(); picker.setValue(select.value); }, 0); });
        select.form.addEventListener('change', function () { picker.setValue(select.value); });
      }
    });
  };
  app.focusControl = function (control) {
    if (!control) return;
    const visible = control.dataset.searchEnhanced ? control.nextElementSibling.querySelector('summary') : control;
    visible.focus();
  };
  // Only page query forms opt in. Editing and picker-panel search fields retain their own behavior.
  app.enhanceQueryControls = function (form) {
    const refreshers = [];
    form.querySelectorAll('input[name], select[name]').forEach(function (control) {
      if (!control.name || control.dataset.queryClear || control.disabled || control.readOnly) return;
      const picker = control.queryPicker;
      if (!picker && control.tagName !== 'SELECT' && !['text', 'search', 'date'].includes(control.type)) return;
      control.dataset.queryClear = 'true';
      const display = picker ? picker.element : control;
      const field = control.closest('.form-field');
      const label = field ? field.firstElementChild.textContent.trim() : control.name;
      const wrapper = document.createElement(picker ? 'div' : 'span');
      const selection = Boolean(picker || control.tagName === 'SELECT' || control.type === 'date');
      wrapper.className = 'query-control' + (picker || control.tagName === 'SELECT' ? ' query-control--select' : control.type === 'date' ? ' query-control--date' : '');
      display.before(wrapper); wrapper.appendChild(display);
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'query-clear';
      button.setAttribute('aria-label', '清空' + label); button.title = '清空' + label;
      button.innerHTML = app.icon('close'); wrapper.appendChild(button);
      function refresh() { button.hidden = !control.value || control.disabled || control.readOnly; }
      button.addEventListener('click', function (event) {
        event.preventDefault(); event.stopPropagation();
        if (control.disabled || control.readOnly || !control.value) return;
        control.value = '';
        if (picker) picker.reset();
        // Move focus before hiding the clear button; do not open the picker or submit the form.
        (picker ? display.querySelector('summary') : control).focus({ preventScroll: true });
        refresh();
        control.dispatchEvent(new Event('input', { bubbles: true }));
        if (selection) control.dispatchEvent(new Event('change', { bubbles: true }));
      });
      refreshers.push(refresh); refresh();
    });
    if (!refreshers.length) return;
    function refreshAll() { refreshers.forEach(function (refresh) { refresh(); }); }
    form.addEventListener('input', refreshAll);
    form.addEventListener('change', refreshAll);
    // Native reset and searchable picker synchronization complete before the affordances update.
    form.addEventListener('reset', function () { window.setTimeout(refreshAll, 0); });
  };
  app.enhanceCategoryChecks = function (host) {
    host.querySelectorAll('.choice-field').forEach(function (field) {
      const inputs = Array.from(field.querySelectorAll('input[type="checkbox"]'));
      if (inputs.length <= 10 || field.dataset.categoryEnhanced || !inputs.every(function (i) { return app.categoryCatalog.find(i.value); })) return;
      field.dataset.categoryEnhanced = 'true';
      const box = field.querySelector('.check-group');
      const search = document.createElement('input'); search.type = 'search'; search.className = 'form-control';
      search.placeholder = '搜索品类名称或分组'; search.setAttribute('aria-label', '搜索可选品类');
      const count = document.createElement('p'); count.className = 'field-hint'; count.setAttribute('role', 'status');
      box.before(search, count);
      const sections = app.categoryCatalog.groups.map(function (group) {
        const section = document.createElement('section'); section.className = 'category-choice-group';
        const title = document.createElement('h3'); title.textContent = group; section.appendChild(title);
        const choices = document.createElement('div'); choices.className = 'check-group'; section.appendChild(choices);
        inputs.filter(function (i) { return app.categoryCatalog.find(i.value).group === group; }).forEach(function (i) { choices.appendChild(i.closest('label')); });
        box.appendChild(section); return section;
      });
      box.classList.add('category-choice-list');
      function refresh() {
        const text = search.value.trim().toLowerCase(); let visible = 0;
        inputs.forEach(function (i) { const c = app.categoryCatalog.find(i.value), hit = (c.name + c.group).toLowerCase().includes(text); i.closest('label').hidden = !hit; if (hit) visible++; });
        sections.forEach(function (section) { section.hidden = !Array.from(section.querySelectorAll('label')).some(function (l) { return !l.hidden; }); });
        count.textContent = '已选 ' + inputs.filter(function (i) { return i.checked; }).length + ' / ' + inputs.length + ' 个品类' + (visible ? '' : ' · 没有匹配的品类');
      }
      search.addEventListener('input', refresh);
      search.addEventListener('keydown', function (e) { if (e.key === 'Enter') e.preventDefault(); });
      field.addEventListener('change', refresh); refresh();
    });
  };
  let taskWorkspaceSerial = 0;
  app.enhanceTextareaCounters = function (host) {
    host.querySelectorAll('textarea[maxlength]').forEach(function (textarea) {
      if (textarea.dataset.counterEnhanced) return;
      textarea.dataset.counterEnhanced = 'true';
      const count = document.createElement('small');
      const id = 'textarea-count-' + (++taskWorkspaceSerial);
      count.id = id; count.className = 'field-counter';
      textarea.setAttribute('aria-describedby', ((textarea.getAttribute('aria-describedby') || '') + ' ' + id).trim());
      textarea.insertAdjacentElement('afterend', count);
      function refresh() { count.textContent = textarea.value.length + ' / ' + textarea.maxLength + ' 字'; }
      textarea.addEventListener('input', refresh); refresh();
    });
  };
  const taskWorkspaceFrames = [];
  function currentWorkspace() { return taskWorkspaceFrames[taskWorkspaceFrames.length - 1]; }
  function confirmWorkspaces(frames) {
    return !frames.some(function (frame) { return frame.isDirty(); }) || window.confirm('当前修改尚未保存，确认放弃并离开？');
  }
  function onWorkspaceHistory() {
    const current = currentWorkspace(); if (!current) return;
    const token = history.state && history.state.frozenTaskWorkspace;
    if (token === current.token) return;
    const index = taskWorkspaceFrames.findIndex(function (frame) { return frame.token === token; });
    const closing = taskWorkspaceFrames.slice(index + 1);
    if (!confirmWorkspaces(closing)) { history.pushState(current.marker, '', current.url); return; }
    closing.slice().reverse().forEach(function (frame) { frame.finish(true); });
  }
  function beforeWorkspaceUnload(event) {
    if (!taskWorkspaceFrames.some(function (frame) { return frame.isDirty(); })) return;
    event.preventDefault(); event.returnValue = '';
  }
  function guardWorkspaceNavigation(event) {
    const anchor = event.target.closest && event.target.closest('a[href]');
    if (!anchor || !taskWorkspaceFrames.length) return;
    const href = anchor.getAttribute('href');
    if (!href || href === '#' || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
    if (!confirmWorkspaces(taskWorkspaceFrames)) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    cleanupWorkspaces();
  }
  function cleanupWorkspaces() {
    const first = taskWorkspaceFrames[0];
    if (first && history.state && history.state.frozenTaskWorkspace) history.replaceState(first.previousState, '');
    taskWorkspaceFrames.slice().reverse().forEach(function (frame) { frame.finish(false); });
  }
  app.isTaskWorkspaceRouteCurrent = function () {
    const current = currentWorkspace();
    return Boolean(current && current.host.isConnected && window.location && current.routeHash === window.location.hash);
  };
  app.openTaskWorkspace = function (host, options) {
    options = options || {};
    let parent = currentWorkspace();
    if (parent && parent.host !== host) { cleanupWorkspaces(); parent = null; }
    const listView = options.listView || (parent ? parent.element : host.firstElementChild);
    const returnFocus = options.returnFocus || document.activeElement;
    const scrollTop = window.scrollY;
    const token = 'task-workspace-' + (++taskWorkspaceSerial);
    const previousState = history.state;
    const marker = Object.assign({}, previousState || {}, { frozenTaskWorkspace: token });
    const titleId = token + '-title';
    const workspace = document.createElement('section');
    const reading = options.mode === 'read';
    workspace.className = 'task-workspace' + (options.mode === 'edit' ? ' task-workspace--editing' : reading ? ' task-workspace--reading' : '') + (!options.aside ? ' task-workspace--single' : '');
    workspace.setAttribute('aria-labelledby', titleId);
    const backLabel = parent ? '返回上一页' : '返回列表';
    const footer = options.footer !== undefined ? options.footer : (reading ? '' : '<button type="button" class="button" data-workspace-back>' + app.icon('close') + '<span>取消</span></button>' + (options.actions || ''));
    workspace.innerHTML = '<header class="task-workspace-header"><div class="task-workspace-heading"><button type="button" class="button button--text" data-workspace-back>' + app.icon('previous') + '<span>' + backLabel + '</span></button><div><h1 id="' + titleId + '" tabindex="-1">' + app.escape(options.title || '详情') + '</h1>' + (options.description ? '<p>' + app.escape(options.description) + '</p>' : '') + '</div></div>' + (options.status || '') + '</header>' + (options.meta ? '<section class="task-workspace-meta" aria-label="当前内容信息">' + options.meta + '</section>' : '') + '<div class="task-workspace-layout"><section class="task-workspace-main">' + (options.main || '') + '</section>' + (options.aside ? '<aside class="task-workspace-aside">' + options.aside + '</aside>' : '') + '</div>' + (footer ? '<footer class="task-workspace-footer">' + footer + '</footer>' : '');
    if (listView) { listView.setAttribute('data-task-workspace-list', ''); listView.hidden = true; }
    host.appendChild(workspace);
    app.enhanceCategorySelects(workspace);
    app.enhanceCategoryChecks(workspace);
    app.enhanceTextareaCounters(workspace);
    let dirty = false, closed = false, message = '', afterClose = null;
    function finish(notify) {
      if (closed) return;
      closed = true;
      const index = taskWorkspaceFrames.indexOf(controller);
      if (index !== -1) taskWorkspaceFrames.splice(index, 1);
      workspace.open = false; workspace.remove();
      if (listView) { listView.hidden = false; listView.removeAttribute('data-task-workspace-list'); }
      if (!taskWorkspaceFrames.length) {
        window.removeEventListener('popstate', onWorkspaceHistory);
        window.removeEventListener('beforeunload', beforeWorkspaceUnload);
        document.removeEventListener('click', guardWorkspaceNavigation, true);
        app.taskWorkspaceCleanup = null;
      }
      workspace.dispatchEvent(new Event('close'));
      if (notify !== false && options.onClose) options.onClose(message);
      const follow = afterClose; afterClose = null;
      if (notify !== false) window.requestAnimationFrame(function () {
        if (listView && listView.isConnected && !listView.hidden && currentWorkspace() === parent) {
          window.scrollTo({ top: scrollTop, behavior: 'auto' });
          if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
        }
        if (follow) follow();
      });
    }
    function confirmDiscard() { return !dirty || window.confirm(options.discardMessage || '当前修改尚未保存，确认放弃并返回？'); }
    function leave(saved, nextMessage, follow) {
      if (closed || currentWorkspace() !== controller) return false;
      if (!saved && !confirmDiscard()) return false;
      dirty = false; message = nextMessage || ''; afterClose = follow || null;
      if (history.state && history.state.frozenTaskWorkspace === token) history.back();
      finish(true);
      return true;
    }
    const controller = {
      host: host, token: token, marker: marker, previousState: previousState, element: workspace, finish: finish,
      url: window.location ? window.location.href : undefined, routeHash: window.location ? window.location.hash : '',
      isDirty: function () { return dirty; },
      setDirty: function (value) { dirty = Boolean(value); },
      complete: function (nextMessage, follow) { return leave(true, nextMessage, follow); },
      discard: function (follow) { return leave(false, '', follow); }
    };
    workspace.open = true;
    workspace.addEventListener('input', function (event) {
      if (!reading && event.target.matches('input:not([type="search"]), textarea, select')) dirty = true;
    });
    workspace.addEventListener('change', function (event) {
      if (!reading && event.target.matches('input, textarea, select')) dirty = true;
    });
    workspace.addEventListener('click', function (event) {
      if (event.target.closest('[data-workspace-back], [data-close]')) { event.stopPropagation(); leave(false); }
    });
    if (!taskWorkspaceFrames.length) {
      window.addEventListener('popstate', onWorkspaceHistory);
      window.addEventListener('beforeunload', beforeWorkspaceUnload);
      document.addEventListener('click', guardWorkspaceNavigation, true);
    }
    taskWorkspaceFrames.push(controller);
    history.pushState(marker, '');
    app.taskWorkspaceCleanup = cleanupWorkspaces;
    window.scrollTo({ top: 0, behavior: 'auto' });
    window.requestAnimationFrame(function () {
      if (currentWorkspace() !== controller) return;
      const title = workspace.querySelector('#' + titleId); if (title) title.focus({ preventScroll: true });
    });
    return controller;
  };
  // Full-width page surface; close/open preserve existing form and subscription lifecycles.
  app.openDetailPage = function (host, title, body, footer, settings) {
    settings = settings && typeof settings === 'object' ? settings : {};
    const controller = app.openTaskWorkspace(host, {
      title: title, mode: settings.editable ? 'form' : 'read', main: body,
      footer: footer || '', description: settings.description || ''
    });
    const page = controller.element;
    page.close = function () { return controller.complete(); };
    page.setDirty = controller.setDirty;
    return page;
  };
}());
