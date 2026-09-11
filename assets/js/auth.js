(function () {
  'use strict';
  const app = window.FrozenApp, prefix = 'frozen-login-v1:';
  function scope() { return new URL(document.body.dataset.app === 'admin' ? '../' : './', window.location.href).href; }
  function valid(value) { return value && value.scope === scope() && value.account === 'admin' && value.userId === 'user-admin'; }
  function fromName() {
    try { return window.name.startsWith(prefix) ? JSON.parse(window.name.slice(prefix.length)) : null; }
    catch (_) { return null; }
  }
  // 同标签页传递演示身份，兼容 file:// 下两个 HTML 的存储不共享；不传递密码。
  function signIn(account, password) {
    if (String(account).trim() !== 'admin' || password !== '123456') return false;
    window.name = prefix + JSON.stringify({ scope: scope(), account: 'admin', userId: 'user-admin' });
    return true;
  }
  function current() {
    const incoming = fromName(), key = prefix + scope();
    if (valid(incoming)) {
      try { window.sessionStorage.setItem(key, JSON.stringify(incoming)); window.name = ''; }
      catch (_) { /* 存储不可用时保留同标签页演示身份。 */ }
      if (app.access) app.access.start();
      return incoming;
    }
    try { const saved = JSON.parse(window.sessionStorage.getItem(key)); return valid(saved) ? saved : null; }
    catch (_) { return null; }
  }
  function requireSession() {
    if (current()) return true;
    if (app.access) app.access.end();
    window.location.replace('../index.html');
    return false;
  }
  function signOut() {
    if (app.generationStore) app.generationStore.stop();
    try { window.sessionStorage.removeItem(prefix + scope()); } catch (_) { /* 无存储时清除窗口身份即可。 */ }
    if (window.name.startsWith(prefix)) window.name = '';
    if (app.access) app.access.end();
    window.location.replace('../index.html');
  }
  app.auth = { signIn: signIn, current: current, requireSession: requireSession, signOut: signOut };
}());
