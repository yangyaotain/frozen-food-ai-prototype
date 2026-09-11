(function () {
  'use strict';
  const app = window.FrozenApp, key = 'frozen-system-management-v1';
  const clone = function (value) { return JSON.parse(JSON.stringify(value)); };
  const departments = [{ id: 'wufeng', name: '杭州五丰', icon: 'building', children: [
    { id: 'functional', name: '综合管理中心', icon: 'organization', children: [
      { id: 'administration', name: '行政管理部' }, { id: 'hr', name: '人力资源部' },
      { id: 'it', name: '信息技术部' }, { id: 'compliance', name: '法务合规部' }
    ] },
    { id: 'finance', name: '财务结算中心', icon: 'organization', children: [
      { id: 'accounting', name: '财务核算部' }, { id: 'settlement', name: '交易结算部' },
      { id: 'funds', name: '资金管理部' }, { id: 'budget', name: '预算管理部' }
    ] },
    { id: 'business', name: '市场运营中心', icon: 'organization', children: [
      { id: 'market', name: '市场信息部' }, { id: 'operations', name: '运营管理部' },
      { id: 'merchant-service', name: '商户服务部' }, { id: 'leasing', name: '招商管理部' }
    ] },
    { id: 'trade', name: '采购贸易中心', icon: 'organization', children: [
      { id: 'livestock', name: '畜禽冻品采购部' }, { id: 'seafood', name: '水产采购部' },
      { id: 'imports', name: '进口贸易部' }, { id: 'suppliers', name: '供应商管理部' }
    ] },
    { id: 'logistics', name: '仓储物流中心', icon: 'warehouse', children: [
      { id: 'cold-storage', name: '冷库管理部' }, { id: 'warehouse-ops', name: '仓储作业部' },
      { id: 'delivery', name: '冷链配送部' }, { id: 'facilities', name: '设备工程部' }
    ] },
    { id: 'quality', name: '质量安全中心', icon: 'shield', children: [
      { id: 'food-safety', name: '食品安全部' }, { id: 'inspection', name: '质量检验部' },
      { id: 'traceability', name: '商品追溯部' }, { id: 'production-safety', name: '安全管理部' }
    ] }
  ] }];
  function departmentNames(nodes) { return nodes.flatMap(function (node) { return node.children ? departmentNames(node.children) : [node.name]; }); }
  const stamp = function () { return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }); };
  const actions = {
    prices: [['view', '查看'], ['maintain', '维护采价与导入'], ['review', '复核采价']],
    categories: [['view', '查看'], ['maintain', '维护映射']],
    sources: [['view', '查看'], ['maintain', '维护来源与整理资讯'], ['review', '确认来源与核验资讯'], ['publish', '发布资讯']],
    analysis: [['view', '查看分析'], ['maintain', '使用分析查询']],
    bulletins: [['view', '查看简报'], ['maintain', '生成设置、编辑与修订'], ['review', '复核简报'], ['publish', '发布简报']],
    reports: [['view', '查看报告及建议'], ['maintain', '生成设置、编辑与修订'], ['review', '复核报告及建议'], ['publish', '发布报告及建议']],
    trace: [['view', '查看记录与关联版本']],
    users: [['view', '查看'], ['maintain', '维护用户'], ['status', '启用与停用'], ['delete', '删除用户']],
    roles: [['view', '查看'], ['maintain', '维护角色'], ['status', '启用与停用'], ['delete', '删除角色']]
  };
  const catalog = app.config.admin.routes.map(function (route) {
    return { id: route.id, name: route.title, group: route.group, permissions: (actions[route.id] || [['view', '查看']]).map(function (action) { return { id: route.id + ':' + action[0], name: action[1] }; }) };
  });
  const allPermissions = catalog.flatMap(function (page) { return page.permissions.map(function (p) { return p.id; }); });
  function presetRole(id, name, description, permissions) { return { id: id, code: id, name: name, description: description, permissions: permissions, status: 'enabled', version: 1, createdAt: '2026-09-10 09:00:00', updatedAt: '2026-09-10 09:00:00' }; }
  function byAction(action) { return allPermissions.filter(function (p) { return !/^(users|roles):/.test(p) && (p.endsWith(':view') || p.endsWith(':' + action)); }); }
  let roles = [presetRole('administrator', '系统管理员', '管理全部业务功能、用户与角色。', allPermissions.slice()), presetRole('maintainer', '数据维护员', '维护采价、品类映射、来源及报告草稿。', byAction('maintain')), presetRole('reviewer', '复核员', '核对采价、来源、资讯及报告内容。', byAction('review')), presetRole('publisher', '发布员', '发布已完成复核的资讯、简报和经营报告。', byAction('publish'))];
  let users = [
    { id: 'user-admin', account: 'admin', name: '系统管理员', phone: '13800000001', roleIds: ['administrator'], status: 'enabled' },
    { id: 'user-price', account: 'price.editor', name: '采价管理员甲', phone: '13800000002', roleIds: ['maintainer'], status: 'enabled' },
    { id: 'user-review', account: 'content.reviewer', name: '内容复核员乙', phone: '13800000003', roleIds: ['reviewer'], status: 'enabled' },
    { id: 'user-release', account: 'report.publisher', name: '报告发布员丙', phone: '13800000004', roleIds: ['publisher'], status: 'enabled' },
    { id: 'user-combined', account: 'market.operator', name: '市场运营员丁', phone: '13800000005', roleIds: ['maintainer', 'reviewer'], status: 'disabled' }
  ].map(function (u) { return Object.assign(u, { version: 1, createdAt: '2026-09-10 09:00:00', updatedAt: '2026-09-10 09:00:00' }); });
  const profileDefaults = [
    ['user-admin', 'admin', '系统管理员', '陈建华', 'jianhua.chen@example.com', '信息技术部'],
    ['user-price', 'price.editor', '采价管理员甲', '沈佳宁', 'jianing.shen@example.com', '市场信息部'],
    ['user-review', 'content.reviewer', '内容复核员乙', '周明远', 'mingyuan.zhou@example.com', '市场信息部'],
    ['user-release', 'report.publisher', '报告发布员丙', '徐悦', 'yue.xu@example.com', '运营管理部'],
    ['user-combined', 'market.operator', '市场运营员丁', '陆文博', 'wenbo.lu@example.com', '运营管理部']
  ];
  function upgradeProfiles(rows) {
    let changed = false;
    rows.forEach(function (u) {
      const preset = profileDefaults.find(function (p) { return p[0] === u.id && p[1] === u.account; });
      // 仅替换仍为原始职务称呼的预置姓名，已维护资料与关联不重置。
      if (preset && u.name === preset[2]) { u.name = preset[3]; changed = true; }
      ['email', 'department'].forEach(function (field, index) {
        if (u[field] === undefined) { u[field] = preset ? preset[index + 4] : ''; changed = true; }
      });
    });
    return changed;
  }
  const validEmail = function (value) { return typeof value === 'string' && value.length <= 120 && (!value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)); };
  upgradeProfiles(users);
  let storageState = 'ready', serial = 0, exampleVersion = 0;
  const unique = function (values) { return Array.from(new Set(values)); };
  function validCache(data) {
    if (!data || data.schema !== 2 || !Array.isArray(data.users) || !Array.isArray(data.roles) || !data.users.length || !data.roles.length) return false;
    const text = function (s, max) { return typeof s === 'string' && s.trim().length > 0 && s.length <= max; };
    const base = function (r) { return r && text(r.id, 100) && text(r.name, 40) && ['enabled', 'disabled'].includes(r.status) && Number.isInteger(r.version) && r.version > 0 && text(r.createdAt, 30) && text(r.updatedAt, 30); };
    if (!data.roles.every(function (r) { return base(r) && typeof r.code === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{1,39}$/.test(r.code) && typeof r.description === 'string' && r.description.length <= 200 && Array.isArray(r.permissions) && r.permissions.length && r.permissions.every(function (p) { return allPermissions.includes(p) && r.permissions.includes(p.split(':')[0] + ':view'); }); })) return false;
    if (!data.users.every(function (u) { return base(u) && typeof u.account === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{2,39}$/.test(u.account) && typeof u.phone === 'string' && /^1\d{10}$/.test(u.phone) && Array.isArray(u.roleIds) && u.roleIds.length && u.roleIds.every(function (id) { return data.roles.some(function (r) { return r.id === id; }); }); })) return false;
    if (!data.users.every(function (u) { return (u.email === undefined || validEmail(u.email)) && (u.department === undefined || (typeof u.department === 'string' && u.department.length <= 40)); })) return false;
    if (unique(data.roles.map(function (r) { return r.id; })).length !== data.roles.length || unique(data.roles.map(function (r) { return r.code.toLowerCase(); })).length !== data.roles.length || unique(data.roles.map(function (r) { return r.name; })).length !== data.roles.length || unique(data.users.map(function (u) { return u.id; })).length !== data.users.length || unique(data.users.map(function (u) { return u.account.toLowerCase(); })).length !== data.users.length) return false;
    const admin = data.users.find(function (u) { return u.id === 'user-admin'; }), role = data.roles.find(function (r) { return r.id === 'administrator'; });
    return admin && admin.account === 'admin' && admin.status === 'enabled' && admin.roleIds.length === 1 && admin.roleIds[0] === 'administrator' && role && role.status === 'enabled' && role.code === 'administrator' && role.name === '系统管理员' && unique(role.permissions).length === allPermissions.length;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      const data = JSON.parse(raw), legacy = data && data.schema === 1;
      // 旧入口权限并入维护权限；只调整权限标识，不重置用户、角色关联或资料版本。
      if (legacy && Array.isArray(data.roles)) {
        data.roles.forEach(function (role) { if (role && Array.isArray(role.permissions)) role.permissions = unique(role.permissions.map(function (permission) { return permission === 'users:assign' ? 'users:maintain' : permission === 'roles:assign' ? 'roles:maintain' : permission; })).sort(); });
        data.schema = 2;
      }
      if (validCache(data)) { const profilesChanged = upgradeProfiles(data.users); users = data.users; roles = data.roles; exampleVersion = Number(data.exampleVersion) || 0; if (legacy || profilesChanged) persist(); }
      else storageState = 'invalid';
    }
  } catch (error) { storageState = error instanceof SyntaxError ? 'invalid' : 'unavailable'; }
  function persist() { try { window.localStorage.setItem(key, JSON.stringify({ schema: 2, users: users, roles: roles, exampleVersion: exampleVersion })); storageState = 'ready'; } catch (_) { storageState = 'unavailable'; } }
  if (exampleVersion < 1) {
    if (!roles.some(r => r.code === 'archive-reader')) roles.push(Object.assign(presetRole('archive-reader', '历史资料查阅员', '原历史资料查阅角色，职责调整后已停用。', byAction('view')), { status: 'disabled' }));
    exampleVersion = 1; if (storageState === 'ready') persist();
  }
  function allowed() { if (app.access && !app.access.can('maintain')) throw new Error('当前会话已退出，请从登录页重新进入管理端。'); }
  function collection(type) { if (!['users', 'roles'].includes(type)) throw new Error('未知管理对象。'); return type === 'users' ? users : roles; }
  function find(type, id) { return collection(type).find(function (r) { return r.id === id; }); }
  function latest(type, id, version) { const row = find(type, id); if (!row || row.version !== version) throw new Error('记录已变化，请关闭弹窗并刷新后重试。'); return row; }
  function roleNames(ids) { return ids.map(function (id) { const r = find('roles', id); return r ? r.name + (r.status === 'disabled' ? '（已停用）' : '') : '角色已移除'; }).join('、'); }
  function effective(user) { if (user.status !== 'enabled') return []; return unique(roles.filter(function (r) { return r.status === 'enabled' && user.roleIds.includes(r.id); }).flatMap(function (r) { return r.permissions; })); }
  function save(type, input, id, version) {
    allowed(); collection(type); const old = id ? latest(type, id, version) : null;
    if (type === 'roles' && id === 'administrator') throw new Error('内置系统管理员角色不可修改。');
    const value = { name: String(input.name || '').trim(), status: input.status }, errors = {};
    if (!value.name || value.name.length > 40) errors.name = '请输入1–40字名称。';
    if (!['enabled', 'disabled'].includes(value.status)) errors.status = '请选择启用状态。';
    if (old && value.status !== old.status) errors.status = '启用或停用请通过列表操作，编辑只维护资料。';
    if (type === 'users') {
      value.account = String(input.account || '').trim(); value.phone = String(input.phone || '').trim(); value.roleIds = unique(Array.isArray(input.roleIds) ? input.roleIds : []).sort();
      value.email = String(input.email === undefined && old ? old.email : input.email || '').trim();
      value.department = String(input.department === undefined && old ? old.department : input.department || '').trim();
      if (!validEmail(value.email)) errors.email = '请输入有效邮箱地址，最多120字。';
      if (value.department.length > 40) errors.department = '部门名称最多40字。';
      else if (value.department && !departmentNames(departments).includes(value.department) && !(old && old.department === value.department)) errors.department = '请从组织结构中选择部门。';
      if (!/^[A-Za-z][A-Za-z0-9_.-]{2,39}$/.test(value.account)) errors.account = '账号需3–40位，以字母开头，可含数字、点、下划线及短横线。';
      if (users.some(function (u) { return u.id !== id && u.account.toLowerCase() === value.account.toLowerCase(); })) errors.account = '该账号已存在。';
      if (old && value.account !== old.account) errors.account = '创建后账号不可修改。';
      if (!/^1\d{10}$/.test(value.phone)) errors.phone = '请输入11位手机号码。';
      if (!value.roleIds.length || value.roleIds.some(function (roleId) { const r = find('roles', roleId); return !r || (r.status === 'disabled' && !(old && old.roleIds.includes(roleId))); })) errors.roleIds = '请至少选择一个可分配角色；停用角色不能新增分配。';
      if (id === 'user-admin' && (value.status !== 'enabled' || value.roleIds.length !== 1 || value.roleIds[0] !== 'administrator')) errors.roleIds = '当前管理员必须保留启用状态及系统管理员角色。';
    } else {
      value.code = String(input.code || '').trim(); value.description = String(input.description || '').trim(); value.permissions = unique(Array.isArray(input.permissions) ? input.permissions : []).sort();
      if (!/^[A-Za-z][A-Za-z0-9_.-]{1,39}$/.test(value.code)) errors.code = '编码需2–40位，以字母开头，可含数字、点、下划线及短横线。';
      if (roles.some(function (r) { return r.id !== id && r.code.toLowerCase() === value.code.toLowerCase(); })) errors.code = '该角色编码已存在。';
      if (roles.some(function (r) { return r.id !== id && r.name === value.name; })) errors.name = '该角色名称已存在。';
      if (old && value.code !== old.code) errors.code = '创建后角色编码不可修改。';
      if (value.description.length > 200) errors.description = '角色说明最多200字。';
      if (!value.permissions.length || value.permissions.some(function (p) { return !allPermissions.includes(p); })) errors.permissions = '请至少选择一项有效权限。';
      value.permissions = unique(value.permissions.concat(value.permissions.filter(function (p) { return allPermissions.includes(p); }).map(function (p) { return p.split(':')[0] + ':view'; }))).sort();
    }
    if (Object.keys(errors).length) return { valid: false, errors: errors };
    if (old && Object.keys(value).every(function (k) { return JSON.stringify(Array.isArray(old[k]) ? old[k].slice().sort() : old[k]) === JSON.stringify(value[k]); })) return { valid: true, unchanged: true, row: clone(old) };
    const row = Object.assign({}, old || { id: type.slice(0, -1) + '-' + Date.now() + '-' + (++serial), createdAt: stamp(), version: 0 }, value, { version: old ? old.version + 1 : 1, updatedAt: stamp() });
    if (old) collection(type).splice(collection(type).indexOf(old), 1, row); else collection(type).unshift(row);
    persist(); return { valid: true, row: clone(row) };
  }
  function change(type, id, version, action) {
    allowed(); const row = latest(type, id, version);
    if ((type === 'users' && id === 'user-admin') || (type === 'roles' && id === 'administrator')) throw new Error('当前管理员及内置系统管理员角色不可停用或删除。');
    if (action === 'delete') {
      if (type === 'roles' && users.some(function (u) { return u.roleIds.includes(id); })) throw new Error('该角色仍有关联用户，请先解除全部用户关联，再删除。');
      collection(type).splice(collection(type).indexOf(row), 1);
    } else if (action === 'status') { row.status = row.status === 'enabled' ? 'disabled' : 'enabled'; row.version++; row.updatedAt = stamp(); }
    else throw new Error('未知操作。');
    persist(); return true;
  }
  app.systemStore = {
    departments: clone(departments),
    departmentPath: function (value) { return app.treePath(departments, value); },
    key: key, catalog: clone(catalog), allPermissions: allPermissions.slice(),
    list: function (type, filter) { const f = filter || {}, keyword = String(f.keyword || '').trim().toLowerCase(); return clone(collection(type).filter(function (r) { return (!f.status || r.status === f.status) && (!f.role || (r.roleIds || []).includes(f.role)) && (!keyword || [r.account, r.code, r.name, r.phone, r.description].join(' ').toLowerCase().includes(keyword)); })); },
    get: function (type, id) { const r = find(type, id); return r ? clone(r) : null; }, save: save, change: change,
    current: function () { return clone(find('users', 'user-admin')); },
    saveProfile: function (input, version) {
      const current = clone(find('users', 'user-admin'));
      return save('users', Object.assign(current, { name: input.name, phone: input.phone, email: input.email, department: input.department }), current.id, version);
    }, roleNames: roleNames, effective: effective,
    members: function (id) { return clone(users.filter(function (u) { return u.roleIds.includes(id); })); },
    storageState: function () { return storageState; }
  };
}());
