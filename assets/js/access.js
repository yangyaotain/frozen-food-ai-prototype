(function () {
  'use strict';
  const app = window.FrozenApp;
  const sessionKey = 'frozen-admin-session-v1';
  let active = true;
  try { active = window.sessionStorage.getItem(sessionKey) !== 'ended'; } catch (_) { /* 文件直开时降级为本页会话。 */ }
  function can() { return active; }
  function start() { active = true; try { window.sessionStorage.setItem(sessionKey, 'active'); } catch (_) { /* 本页有效。 */ } }
  function end() { active = false; try { window.sessionStorage.setItem(sessionKey, 'ended'); } catch (_) { /* 本页有效。 */ } }
  // 每个变更入口统一校验，不能只隐藏按钮。保留各模块既有错误返回协议。
  function guard(store, method, action, throwing) {
    if (!store || typeof store[method] !== 'function') return;
    const original = store[method];
    store[method] = function () {
      if (!can(action)) {
        const message = '当前会话已退出，无权操作，请从登录页重新进入管理端。';
        if (throwing) throw new Error(message);
        return { valid: false, message: message, rows: [], errors: { name: message, price: message, categoryId: message, note: message, file: message } };
      }
      return original.apply(store, arguments);
    };
  }
  function install() {
    [[app.priceStore, ['save', 'importRows'], ['review']], [app.categoryStore, ['save'], []], [app.sourceStore, ['save', 'flag', 'editDisplay'], ['confirm', 'verify']]].forEach(function (spec) {
      spec[1].forEach(function (key) { guard(spec[0], key, 'maintain', false); }); spec[2].forEach(function (key) { guard(spec[0], key, 'review', false); });
    });
    guard(app.sourceStore, 'publish', 'publish', false);
    guard(app.analysisStore, 'setScenario', 'maintain', false);
    [app.bulletinStore, app.reportStore].forEach(function (store) { ['generate', 'generateScheduled', 'regenerate', 'edit', 'revise'].forEach(function (key) { guard(store, key, 'maintain', true); }); guard(store, 'review', 'review', true); guard(store, 'publish', 'publish', true); });
    [[app.sourceStore, ['querySources', 'queryItems', 'newsPublished'], ['find', 'findItem']], [app.categoryStore, ['query'], ['find', 'related']], [app.bulletinStore, ['list', 'versions', 'published'], ['get']], [app.reportStore, ['list', 'versions', 'publishedFor'], ['get']], [app.traceData, ['list'], ['linked']]].forEach(function (spec) {
      spec[1].concat(spec[2]).forEach(function (key) { const original = spec[0][key]; if (typeof original !== 'function') return; spec[0][key] = function () { return can('read') ? original.apply(spec[0], arguments) : (spec[1].includes(key) ? [] : null); }; });
    });
    [app.analysisStore, app.traceData].forEach(function (store) { const original = store.query; store.query = function () { return can('read') ? original.apply(store, arguments) : { valid: false, rows: [], message: '当前会话已退出。', error: '当前会话已退出。' }; }; });
  }
  app.access = { can: can, start: start, end: end, current: function () { return { userId: 'user-admin', role: 'administrator', active: active }; } };
  install();
}());
