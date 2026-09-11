(function () {
  'use strict';
  const app = window.FrozenApp, esc = app.presentation ? app.presentation.escape : app.escape, store = app.systemStore;
  const button = function (action, icon, label, id, disabled) { return '<button class="button button--text" type="button" data-system-action="' + action + '"' + (id ? ' data-id="' + esc(id) + '"' : '') + (disabled ? ' disabled' : '') + '>' + app.icon(icon) + '<span>' + label + '</span></button>'; };
  function tag(status) { return '<span class="status-tag status-tag--' + (status === 'enabled' ? 'success' : 'warning') + '">' + (status === 'enabled' ? '启用' : '停用') + '</span>'; }
  function pair(name, value) { return '<div><dt>' + name + '</dt><dd>' + esc(value) + '</dd></div>'; }
  function userBasics(row) {
    return '<dl class="detail-grid">' + pair('账号', row.account) + pair('姓名', row.name) + pair('手机号', row.phone) + pair('邮箱', row.email || '未填写') + pair('部门', store.departmentPath(row.department) || '未填写') + pair('所属角色', store.roleNames(row.roleIds)) + pair('账号状态', row.status === 'enabled' ? '启用' : '停用') + pair('创建时间', row.createdAt) + '</dl>';
  }
  function permissionSummary(ids) {
    const rows = store.catalog.map(function (page) { const names = page.permissions.filter(function (p) { return ids.includes(p.id); }).map(function (p) { return p.name; }); return names.length ? '<div><strong>' + esc(page.group + ' / ' + page.name) + '</strong><p>' + esc(names.join('、')) + '</p></div>' : ''; }).join('');
    return '<div class="system-permission-summary">' + (rows || '<p class="muted">当前没有生效权限。</p>') + '</div>';
  }
  function userDetail(host, id) {
    const row = store.get('users', id); if (!row) return;
    const body = '<div class="content-stack">' + userBasics(row) + '<section><h2>合并后的生效权限</h2><p class="dialog-description">启用角色的权限取并集；停用账号没有生效权限，停用角色不参与合并。</p>' + permissionSummary(store.effective(row)) + '</section></div>';
    app.openDetailPage(host, id === 'user-admin' ? '当前用户信息' : '用户详情', body, '', true);
  }
  function roleDetail(host, id) {
    const row = store.get('roles', id); if (!row) return;
    const members = store.members(id);
    app.openDetailPage(host, '角色详情', '<div class="content-stack"><dl class="detail-grid">' + pair('角色名称', row.name) + pair('角色编码', row.code) + pair('状态', row.status === 'enabled' ? '启用' : '停用') + pair('关联用户数', members.length + ' 人') + pair('角色说明', row.description || '未填写角色说明') + pair('更新时间', row.updatedAt) + '</dl><section><h2>已配置权限</h2><p class="dialog-description">' + (row.status === 'enabled' ? '启用用户可以获得本角色权限。' : '角色已停用，以下配置保留但不参与用户生效权限。') + '</p>' + permissionSummary(row.permissions) + '</section><section><h2>关联用户</h2>' + (members.length ? '<div class="table-scroll"><table class="data-table compact-table"><thead><tr><th>账号</th><th>姓名</th><th>状态</th></tr></thead><tbody>' + members.map(function (u) { return '<tr><td>' + esc(u.account) + '</td><td>' + esc(u.name) + '</td><td>' + tag(u.status) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="muted">暂无关联用户。</p>') + '</section></div>', '', true);
  }
  function permissionPicker(host, values) {
    const selected = new Set(values), catalog = store.catalog;
    host.innerHTML = '<div class="permission-toolbar"><input class="form-control" type="search" aria-label="搜索模块、页面或操作权限" placeholder="搜索模块、页面或操作">' + button('all-permissions', 'check', '全选') + button('clear-permissions', 'reset', '清空') + '</div><p class="field-hint">选择操作会自动包含页面查看权限；取消查看会取消本页操作。分组勾选作用于全部子权限，搜索不会改变选择范围。</p><p class="field-hint" data-permission-count role="status"></p><div class="permission-tree"></div>';
    const tree = host.querySelector('.permission-tree'), search = host.querySelector('input[type="search"]');
    function subset(node) { return catalog.filter(function (page) { return node.dataset.permissionPage ? page.id === node.dataset.permissionPage : page.group === node.dataset.permissionGroup; }).flatMap(function (page) { return page.permissions.map(function (p) { return p.id; }); }); }
    function render() {
      const keyword = search.value.trim().toLowerCase();
      const pages = catalog.filter(function (page) { return [page.group, page.name].concat(page.permissions.map(function (p) { return p.name; })).join(' ').toLowerCase().includes(keyword); });
      tree.innerHTML = Array.from(new Set(pages.map(function (page) { return page.group; }))).map(function (group) {
        return '<section class="permission-group"><label><input type="checkbox" data-permission-group="' + esc(group) + '">' + esc(group) + '</label>' + pages.filter(function (page) { return page.group === group; }).map(function (page) { return '<div class="permission-page"><label><input type="checkbox" data-permission-page="' + page.id + '">' + esc(page.name) + '</label><div class="permission-leaves">' + page.permissions.map(function (p) { return '<label><input type="checkbox" data-permission="' + p.id + '"' + (selected.has(p.id) ? ' checked' : '') + '>' + esc(p.name) + '</label>'; }).join('') + '</div></div>'; }).join('') + '</section>';
      }).join('') || '<p class="dialog-description">没有匹配的模块、页面或操作权限，请调整关键词。</p>';
      tree.querySelectorAll('[data-permission-group], [data-permission-page]').forEach(function (node) { const ids = subset(node), count = ids.filter(function (id) { return selected.has(id); }).length; node.checked = count === ids.length; node.indeterminate = count > 0 && count < ids.length; });
      host.querySelector('[data-permission-count]').textContent = '已选择 ' + selected.size + ' / ' + store.allPermissions.length + ' 项权限';
    }
    function select(id, checked) {
      const page = id.split(':')[0];
      if (checked) { selected.add(id); selected.add(page + ':view'); }
      else if (id.endsWith(':view')) { Array.from(selected).filter(function (p) { return p.startsWith(page + ':'); }).forEach(function (p) { selected.delete(p); }); }
      else selected.delete(id);
    }
    tree.addEventListener('change', function (event) { const node = event.target; if (node.dataset.permission) select(node.dataset.permission, node.checked); else subset(node).forEach(function (id) { select(id, node.checked); }); const identifier = node.dataset.permission ? '[data-permission="' + node.dataset.permission + '"]' : node.dataset.permissionPage ? '[data-permission-page="' + node.dataset.permissionPage + '"]' : '[data-permission-group="' + node.dataset.permissionGroup + '"]'; render(); const next = tree.querySelector(identifier); if (next) next.focus({ preventScroll: true }); });
    host.addEventListener('click', function (event) { const target = event.target.closest('[data-system-action]'); if (!target) return; if (target.dataset.systemAction === 'all-permissions') store.allPermissions.forEach(function (id) { selected.add(id); }); if (target.dataset.systemAction === 'clear-permissions') selected.clear(); render(); });
    search.addEventListener('input', render); search.addEventListener('keydown', function (event) { if (event.key === 'Enter') event.preventDefault(); }); render();
    return { value: function () { return Array.from(selected); } };
  }
  function rolePicker(host, ids, locked) {
    const selected = new Set(ids), original = new Set(ids), roles = store.list('roles');
    host.innerHTML = '<p class="field-hint">可选择多个角色。停用角色不能新增分配；已有停用角色可取消关联。</p><p class="field-hint" role="status" data-role-count></p><div class="role-options"></div>';
    const list = host.querySelector('.role-options');
    function render() { list.innerHTML = roles.map(function (r) { return '<label><input type="checkbox" value="' + esc(r.id) + '"' + (selected.has(r.id) ? ' checked' : '') + (locked || (r.status === 'disabled' && !original.has(r.id)) ? ' disabled' : '') + '><span>' + esc(r.name) + ' <span class="muted">' + esc(r.code) + (r.status === 'disabled' ? ' · 已停用' : '') + '</span></span></label>'; }).join('') || '<p class="muted">暂无可分配角色。</p>'; host.querySelector('[data-role-count]').textContent = '已选择 ' + selected.size + ' 个角色'; }
    list.addEventListener('change', function (event) { if (event.target.checked) selected.add(event.target.value); else selected.delete(event.target.value); host.querySelector('[data-role-count]').textContent = '已选择 ' + selected.size + ' 个角色'; });
    render(); return { value: function () { return Array.from(selected); } };
  }
  function field(name, label, value, max, disabled, type, optional) { return '<label class="form-field"><span>' + label + (optional ? '' : ' *') + '</span><input class="form-control" name="' + name + '" type="' + (type || 'text') + '" maxlength="' + max + '" value="' + esc(value || '') + '"' + (disabled ? ' readonly' : '') + ' aria-describedby="system-error-' + name + '"><small class="field-error" id="system-error-' + name + '" data-error="' + name + '"></small></label>'; }
  function profileFields(row) {
    return field('name', '姓名', row.name, 40, false) + field('phone', '手机号', row.phone, 11, false, 'tel') + field('email', '邮箱', row.email, 120, false, 'email', true) + '<div class="form-field"><span>部门</span><div data-department-picker><input type="hidden" name="department" value="' + esc(row.department || '') + '"></div><small class="field-error" id="system-error-department" data-error="department"></small></div>';
  }
  function profile(host, editing, message) {
    const row = store.current();
    const body = editing ? '<form id="profile-edit" class="edit-grid" novalidate><div class="span-full">' + '<dl class="detail-grid">' + pair('账号', row.account) + pair('所属角色', store.roleNames(row.roleIds)) + pair('账号状态', row.status === 'enabled' ? '启用' : '停用') + pair('创建时间', row.createdAt) + '</dl></div>' + profileFields(row) + '<p class="field-error span-full" data-form-error role="alert"></p></form>' : '<div class="content-stack">' + (message ? '<p class="action-feedback" role="status">' + esc(message) + '</p>' : '') + userBasics(row) + '</div>';
    const footer = '<button class="button" type="button" ' + (editing ? 'data-profile-cancel' : 'data-close') + '>' + app.icon('close') + '<span>' + (editing ? '取消' : '关闭') + '</span></button>' + (editing ? '<button class="button button--primary" type="submit" form="profile-edit">' + app.icon('check') + '<span>保存</span></button>' : '<button class="button button--primary" type="button" data-profile-edit>' + app.icon('edit') + '<span>编辑资料</span></button>');
    const dialog = app.openDialog(host, editing ? '编辑个人资料' : '用户信息', body, footer);
    dialog.setAttribute('data-profile-dialog', '');
    if (!editing) { dialog.querySelector('[data-profile-edit]').addEventListener('click', function () { dialog.close(); profile(host, true); }); return; }
    app.treeSelect(dialog.querySelector('[data-department-picker]'), 'department', '部门', store.departments, row.department);
    dialog.querySelector('[data-profile-cancel]').addEventListener('click', function () { dialog.close(); profile(host); });
    const form = dialog.querySelector('form');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      form.querySelectorAll('[data-error]').forEach(function (node) { node.textContent = ''; });
      form.querySelectorAll('[aria-invalid]').forEach(function (node) { node.removeAttribute('aria-invalid'); });
      const input = {}; ['name', 'phone', 'email', 'department'].forEach(function (key) { input[key] = form.elements.namedItem(key).value; });
      try {
        const result = store.saveProfile(input, row.version);
        if (!result.valid) {
          Object.keys(result.errors).forEach(function (key) { const error = form.querySelector('[data-error="' + key + '"]'), control = form.elements.namedItem(key); if (error) error.textContent = result.errors[key]; if (control) control.setAttribute('aria-invalid', 'true'); });
          form.querySelector('[data-form-error]').textContent = '保存未完成，请检查标注的字段。';
          const invalid = form.querySelector('[aria-invalid="true"]'); if (invalid) invalid.focus(); return;
        }
        dialog.close(); app.account.refresh(); host.dispatchEvent(new Event('system-user-updated'));
        profile(host, false, result.unchanged ? '资料未变化。' : '个人资料已保存。');
      } catch (error) { form.querySelector('[data-form-error]').textContent = error.message; }
    });
  }
  function edit(host, type, id, changed) {
    const userMode = type === 'users', old = id ? store.get(type, id) : null;
    const row = old || { name: '', account: '', phone: '', code: '', description: '', roleIds: [], permissions: [], status: 'enabled' };
    const protectedUser = id === 'user-admin';
    const title = (old ? '编辑' : '新增') + (userMode ? '用户' : '角色');
    let body = '<form id="system-edit" class="edit-grid" novalidate><h2 class="span-full">基本信息</h2>' + field(userMode ? 'account' : 'code', userMode ? '账号' : '角色编码', userMode ? row.account : row.code, 40, Boolean(old)) + (userMode ? profileFields(row) : field('name', '角色名称', row.name, 40, false));
    body += '<div class="form-field"><span>' + (old ? '当前状态' : '初始状态') + '</span><div>' + tag(row.status) + '</div><small class="field-hint">' + (protectedUser ? '当前管理员保持启用。' : old ? '启用或停用请在列表中操作。' : '创建后默认启用，可在列表中停用。') + '</small><small class="field-error" data-error="status"></small></div>';
    if (!userMode) body += '<label class="form-field span-full"><span>角色说明</span><textarea class="form-control" name="description" maxlength="200">' + esc(row.description) + '</textarea><small class="field-error" data-error="description"></small></label>';
    body += '<div class="span-full"><h2>' + (userMode ? '所属角色' : '功能权限') + '</h2><div class="' + (userMode ? 'role-picker' : 'permission-picker') + '" data-picker></div><small class="field-error" data-error="' + (userMode ? 'roleIds' : 'permissions') + '"></small></div><p class="field-error span-full" role="alert" data-form-error></p></form>';
    const dialog = (userMode ? app.openDialog : app.openDetailPage)(host, title, body, '<button type="button" class="button" data-close>' + app.icon('close') + '<span>取消</span></button><button class="button button--primary" type="submit" form="system-edit">' + app.icon('check') + '<span>保存</span></button>', userMode ? true : { editable: true });
    const form = dialog.querySelector('form'), picker = userMode ? rolePicker(dialog.querySelector('[data-picker]'), row.roleIds, protectedUser) : permissionPicker(dialog.querySelector('[data-picker]'), row.permissions);
    if (!userMode) dialog.querySelector('[data-picker]').addEventListener('click', function (event) {
      if (event.target.closest('[data-system-action="all-permissions"], [data-system-action="clear-permissions"]')) dialog.setDirty(true);
    });
    if (userMode) app.treeSelect(dialog.querySelector('[data-department-picker]'), 'department', '部门', store.departments, row.department);
    form.addEventListener('submit', function (event) {
      event.preventDefault(); dialog.querySelectorAll('[data-error]').forEach(function (node) { node.textContent = ''; }); form.querySelectorAll('[aria-invalid]').forEach(function (node) { node.removeAttribute('aria-invalid'); });
      const input = { name: form.elements.namedItem('name').value, status: row.status };
      if (userMode) Object.assign(input, { account: form.elements.namedItem('account').value, phone: form.elements.namedItem('phone').value, email: form.elements.namedItem('email').value, department: form.elements.namedItem('department').value, roleIds: picker.value() });
      else Object.assign(input, { code: form.elements.namedItem('code').value, description: form.elements.namedItem('description').value, permissions: picker.value() });
      try {
        const result = store.save(type, input, id, old && old.version);
        if (!result.valid) { Object.keys(result.errors).forEach(function (key) { dialog.querySelector('[data-error="' + key + '"]').textContent = result.errors[key]; const control = form.elements.namedItem(key); if (control) control.setAttribute('aria-invalid', 'true'); }); dialog.querySelector('[data-form-error]').textContent = '保存未完成，请检查标注的字段。'; const invalid = form.querySelector('[aria-invalid="true"]'); if (invalid) invalid.focus(); return; }
        dialog.close(); if (app.account) app.account.refresh(); changed(result.unchanged ? '资料未变化。' : title + '已保存。');
      } catch (error) { dialog.querySelector('[data-form-error]').textContent = error.message; }
    });
  }
  function confirmAction(host, type, id, action, changed) {
    const row = store.get(type, id); if (!row) return;
    const label = action === 'delete' ? '删除' : row.status === 'enabled' ? '停用' : '启用';
    let description = '确认' + label + '“' + row.name + '”？';
    if (type === 'roles') description += '当前关联 ' + store.members(id).length + ' 位用户。' + (action === 'delete' ? '有关联用户时需先解除关联。' : row.status === 'enabled' ? '停用后保留关联和配置，本角色权限不再参与用户权限合并。' : '启用后，本角色权限重新参与启用用户的权限合并。');
    else if (action === 'delete') description += '删除后该账号资料和角色关联将移除，已有业务历史记录保留。';
    else description += row.status === 'enabled' ? '停用后保留资料和角色关联，账号权限暂停生效。' : '启用后按启用角色恢复生效权限。';
    const dialog = app.openDialog(host, label + (type === 'users' ? '用户' : '角色'), '<p class="dialog-description">' + esc(description) + '</p><p class="field-error" role="alert"></p>', '<button type="button" class="button" data-close>' + app.icon('close') + '<span>取消</span></button><button type="button" class="button button--primary" data-confirm>' + app.icon(action === 'delete' ? 'trash' : 'check') + '<span>确认' + label + '</span></button>');
    dialog.querySelector('[data-confirm]').addEventListener('click', function () { try { store.change(type, id, row.version, action); dialog.close(); changed(label + '成功。'); } catch (error) { dialog.querySelector('[role="alert"]').textContent = error.message; } });
  }
  function page(host, route) {
    const type = route.id, userMode = type === 'users', noun = userMode ? '用户' : '角色';
    host.innerHTML = '<div class="content-stack"><p class="action-feedback" data-feedback role="status" hidden></p><section class="panel"><form class="filter-form" role="search"><label class="form-field form-field--wide"><span>' + (userMode ? '账号 / 姓名 / 手机号' : '角色名称 / 编码') + '</span><input type="search" class="form-control" name="keyword" maxlength="80" placeholder="输入关键词"></label>' + (userMode ? '<label class="form-field"><span>所属角色</span><select class="form-control" name="role" data-role-filter></select></label>' : '') + '<label class="form-field"><span>状态</span><select name="status" class="form-control"><option value="">全部状态</option><option value="enabled">启用</option><option value="disabled">停用</option></select></label><div class="button-group"><button class="button button--primary" type="submit">' + app.icon('search') + '<span>查询</span></button>' + button('reset', 'reset', '重置') + '</div></form></section><section class="panel"><div class="panel-heading"><h2>' + noun + '列表</h2><button type="button" class="button button--primary" data-system-action="create">' + app.icon('plus') + '<span>新增' + noun + '</span></button></div><div class="table-scroll" tabindex="0" role="region" aria-label="' + noun + '列表，可横向滚动"><table class="data-table system-table' + (userMode ? ' system-table--users' : '') + '"><thead><tr>' + (userMode ? '<th>账号</th><th>姓名</th><th>手机号</th><th>邮箱</th><th>部门</th><th>所属角色</th><th>状态</th><th>创建时间</th>' : '<th>角色名称 / 编码</th><th>角色说明</th><th>关联用户</th><th>状态</th><th>更新时间</th>') + '<th class="table-actions">操作</th></tr></thead><tbody data-rows></tbody></table></div><div class="pagination"><p class="muted" data-count role="status"></p><div class="pagination-controls"><label class="page-size">每页<select class="form-control" data-page-size><option value="10">10</option><option value="20">20</option><option value="50">50</option></select>条</label>' + button('previous', 'previous', '上一页') + '<span class="page-position" data-page></span>' + button('next', 'next', '下一页') + '</div></div></section></div>';
    const form = host.querySelector('form'); let pageIndex = 1, pageSize = 10, applied = { keyword: '', status: '', role: '' };
    if (userMode) form.querySelector('[data-role-filter]').innerHTML = '<option value="">全部角色</option>' + store.list('roles').map(function (r) { return '<option value="' + esc(r.id) + '">' + esc(r.name + (r.status === 'disabled' ? '（已停用）' : '')) + '</option>'; }).join('');
    app.enhanceQueryControls(form);
    function render() {
      const rows = store.list(type, applied), pages = Math.max(1, Math.ceil(rows.length / pageSize)); pageIndex = Math.min(Math.max(1, pageIndex), pages);
      host.querySelector('[data-rows]').innerHTML = rows.slice((pageIndex - 1) * pageSize, pageIndex * pageSize).map(function (r) {
        const locked = userMode ? r.id === 'user-admin' : r.id === 'administrator';
        const main = userMode ? '<span class="cell-primary">' + esc(r.account) + '</span>' : '<span class="cell-primary">' + esc(r.name) + '</span><span class="cell-secondary">' + esc(r.code) + '</span>';
        return '<tr><td>' + main + (locked ? '<span class="system-protected">' + (userMode ? '当前管理员' : '内置角色') + '</span>' : '') + '</td>' + (userMode ? '<td>' + esc(r.name) + '</td>' : '') + '<td>' + esc(userMode ? r.phone : r.description || '未填写角色说明') + '</td>' + (userMode ? '<td>' + esc(r.email || '未填写') + '</td><td>' + esc(store.departmentPath(r.department) || '未填写') + '</td>' : '') + '<td>' + esc(userMode ? store.roleNames(r.roleIds) : store.members(r.id).length + ' 人') + '</td><td>' + tag(r.status) + '</td><td>' + esc(userMode ? r.createdAt : r.updatedAt) + '</td><td class="table-actions"><div class="row-actions">' + button('detail', 'source', '详情', r.id) + button('edit', 'edit', '编辑', r.id, locked && !userMode) + button('status', r.status === 'enabled' ? 'close' : 'check', r.status === 'enabled' ? '停用' : '启用', r.id, locked) + button('delete', 'trash', '删除', r.id, locked) + '</div></td></tr>';
      }).join('') || '<tr><td colspan="' + (userMode ? 9 : 6) + '" class="empty-cell"><div class="empty-state">' + app.icon('search') + '<strong>没有匹配的' + noun + '</strong><p>请调整条件或重置查询。</p></div></td></tr>';
      host.querySelector('[data-count]').textContent = '共 ' + rows.length + ' 条'; host.querySelector('[data-page]').textContent = '第 ' + pageIndex + ' / ' + pages + ' 页';
      host.querySelector('[data-system-action="previous"]').disabled = pageIndex <= 1; host.querySelector('[data-system-action="next"]').disabled = pageIndex >= pages;
    }
    function query() { applied = { keyword: form.elements.namedItem('keyword').value, status: form.elements.namedItem('status').value, role: userMode ? form.elements.namedItem('role').value : '' }; pageIndex = 1; render(); }
    host.addEventListener('system-user-updated', function () { if (userMode) render(); });
    function changed(message) { render(); const feedback = host.querySelector('[data-feedback]'); feedback.hidden = false; feedback.textContent = message + ' 列表保留当前筛选条件。'; }
    form.addEventListener('submit', function (event) { event.preventDefault(); query(); });
    form.addEventListener('change', function (event) { if (event.target.name === 'status' || event.target.name === 'role') query(); });
    host.querySelector('[data-page-size]').addEventListener('change', function (event) { pageSize = Number(event.target.value); pageIndex = 1; render(); });
    host.addEventListener('click', function (event) {
      if (event.target.closest('dialog, .task-workspace')) return; const target = event.target.closest('[data-system-action]'); if (!target || target.disabled) return;
      const action = target.dataset.systemAction, id = target.dataset.id;
      if (action === 'reset') { form.reset(); query(); }
      if (action === 'previous') { pageIndex--; render(); } if (action === 'next') { pageIndex++; render(); }
      if (action === 'create' || action === 'edit') edit(host, type, id, changed);
      if (action === 'detail') (userMode ? userDetail : roleDetail)(host, id);
      if (action === 'status' || action === 'delete') confirmAction(host, type, id, action, changed);
    }); render();
  }
  app.systemUI = { profile: profile, userDetail: userDetail, roleDetail: roleDetail, permissionSummary: permissionSummary, permissionPicker: permissionPicker };
  app.pages['admin:users'] = page; app.pages['admin:roles'] = page;
}());
