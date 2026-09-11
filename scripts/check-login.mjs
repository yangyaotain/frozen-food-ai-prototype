import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const source = read('assets/js/auth.js');
function storage(disabled = false) {
  const data = new Map();
  return {
    data,
    getItem(key) { if (disabled) throw Error('Unavailable'); return data.get(key) ?? null; },
    setItem(key, value) { if (disabled) throw Error('Unavailable'); data.set(key, value); },
    removeItem(key) { if (disabled) throw Error('Unavailable'); data.delete(key); }
  };
}
function page(href, store, name = '', admin = false) {
  let active = true;
  const window = { name, sessionStorage: store, FrozenApp: {}, location: { href, replace(url) { this.destination = url; } } };
  if (admin) window.FrozenApp.access = { start() { active = true; }, end() { active = false; }, can() { return active; } };
  const context = { window, document: { body: { dataset: { app: admin ? 'admin' : undefined } } }, URL };
  vm.runInNewContext(source, context);
  return { window, auth: window.FrozenApp.auth };
}
for (const base of ['file:///E:/Cursor/frozen-food-ai-prototype/', 'https://prototype.example/demo/']) {
  for (const unavailable of [false, true]) {
    const adminStore = storage(unavailable), login = page(base + 'index.html', storage(unavailable));
    const direct = page(base + 'admin/index.html?session=start#prices', adminStore, '', true);
    assert.equal(direct.auth.requireSession(), false, '旧入口参数不可跳过登录');
    assert.equal(direct.window.location.destination, '../index.html');
    assert.equal(login.auth.signIn('admin', 'wrong'), false);
    assert.equal(login.auth.signIn('unknown', '123456'), false);
    assert.equal(login.window.name, '');
    assert.equal(login.auth.signIn(' admin ', '123456'), true);
    assert.ok(!login.window.name.includes('123456'), '不传递演示密码');
    const denied = page(base + 'other/admin/index.html', storage(), login.window.name, true);
    assert.equal(denied.auth.requireSession(), false, '不同项目路径不复用会话');
    const admin = page(base + 'admin/index.html#prices', adminStore, login.window.name, true);
    assert.equal(admin.auth.requireSession(), true, '跨文件、独立存储可接收登录身份');
    const refreshed = page(base + 'admin/index.html#reports', adminStore, admin.window.name, true);
    assert.equal(refreshed.auth.requireSession(), true, '刷新保留登录');
    refreshed.auth.signOut();
    assert.equal(refreshed.window.location.destination, '../index.html');
    assert.equal(refreshed.auth.requireSession(), false, '退出后无法通过页面恢复重新进入');
    assert.equal(refreshed.window.FrozenApp.access.can(), false);
    assert.equal(login.auth.signIn('admin', '123456'), true);
    const again = page(base + 'admin/index.html', adminStore, login.window.name, true);
    again.window.FrozenApp.access.end();
    assert.equal(again.auth.requireSession(), true);
    assert.equal(again.window.FrozenApp.access.can(), true, '再次登录激活既有操作门禁');
  }
}

// 模拟表单事件与计时，验证必填、错误恢复、重复提交及离页取消；不是浏览器测试。
function node(name) {
  return { name, value: '', textContent: '', disabled: false, listeners: {}, attrs: {},
    addEventListener(type, handler) { this.listeners[type] = handler; },
    setAttribute(key, value) { this.attrs[key] = value; }, focus() { this.focused = true; } };
}
const account = node('account'), password = node('password'), button = node();
account.defaultValue = 'admin'; password.defaultValue = '123456';
const nodes = Object.fromEntries(['account-error', 'password-error', 'login-error', 'login-status', 'login-label'].map(id => [id, node()]));
const form = node(); form.elements = { account, password }; form.querySelector = () => button;
nodes['login-form'] = form;
let pending, accepted = false, loginCalls = 0;
const events = {}, location = { assign(value) { this.destination = value; } };
vm.runInNewContext(read('assets/js/login.js'), {
  document: { getElementById: id => nodes[id], querySelectorAll: () => [] },
  window: { FrozenApp: { auth: { signIn(a, p) { loginCalls++; accepted = a === 'admin' && p === '123456'; return accepted; } } },
    location, addEventListener(type, handler) { events[type] = handler; },
    setTimeout(handler) { pending = handler; return 1; }, clearTimeout() { pending = null; } }
});
const submit = () => form.listeners.submit({ preventDefault() {} });
submit(); assert.equal(nodes['account-error'].textContent, '请输入账号'); assert.equal(nodes['password-error'].textContent, '请输入密码');
account.value = 'admin'; password.value = 'wrong'; submit();
assert.equal(button.disabled, true); submit(); assert.equal(loginCalls, 0);
pending(); assert.equal(button.disabled, false); assert.ok(nodes['login-error'].textContent.includes('不正确'));
password.listeners.input(); assert.equal(nodes['login-error'].textContent, '');
password.value = '123456'; submit(); pending();
assert.equal(location.destination, 'admin/index.html#prices'); assert.equal(password.value, ''); assert.equal(accepted, true);
events.pageshow(); assert.equal(button.disabled, false);
assert.equal(account.value, 'admin'); assert.equal(password.value, '123456');
password.value = '123456'; submit(); events.pagehide(); assert.equal(pending, null); assert.equal(password.value, '');
const index = read('index.html'), admin = read('admin/index.html'), merchant = read('merchant/index.html'), shell = read('assets/js/shell.js');
assert.ok(index.includes('href="merchant/index.html"'));
assert.ok(!index.includes('entry-card'));
assert.ok(index.includes('type="submit"'), 'Enter与按钮使用原生表单提交');
assert.ok(admin.indexOf('auth.js') < admin.indexOf('shell.js'));
assert.ok(!merchant.includes('src="../assets/js/auth.js"'), '商户端不要求管理端登录');
assert.ok(merchant.includes('src="../assets/js/merchant-auth.js"'), '商户使用独立手机号登录');
assert.ok(shell.includes('app.auth.requireSession()') && shell.includes("'pageshow'"));
assert.ok(!shell.includes("get('session') === 'start'"));
console.log('PASS: 登录验证、表单状态、重复提交、离页取消、双协议/独立存储/存储禁用会话、刷新、退出与再次登录、商户入口及脚本接入检查通过。仅 Node 模拟与静态检查，非浏览器验收。');
