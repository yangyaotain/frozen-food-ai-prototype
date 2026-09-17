(function () {
  'use strict';
  const app = window.FrozenApp;
  const root = document.getElementById('app');
  const mode = document.body.dataset.app;
  const config = app.config[mode];
  if (!root || !config) return;
  const esc = app.escape;
  let sessionIdentity = null;

  function navigation(route, active, mobile) {
    return '<a class="' + (mobile ? 'merchant-tab' : 'nav-item') + '" href="#' + esc(route.id) + '"' + (route.id === active ? ' aria-current="page"' : '') + '>' + app.icon(route.icon) + '<span>' + esc(route.title) + '</span></a>';
  }

  function render() {
    if (mode === 'admin' && app.taskWorkspaceCleanup) app.taskWorkspaceCleanup();
    if (mode === 'merchant') {
      if (app.merchantLoginCleanup) app.merchantLoginCleanup();
      const session = app.merchantAuth.current();
      if (!session || sessionIdentity !== session.merchantId) {
        app.merchantPage.clearSession(); sessionIdentity = session ? session.merchantId : null;
      }
      if (!session) {
        document.title = '登录 · 商户端 · 冻品 AI 行情研判';
        const url = new URL('./index.html#login', window.location.href);
        window.history.replaceState(null, '', url.href);
        app.merchantLogin.render(root); return;
      }
    }
    if (mode === 'admin' && app.generationPageCleanup) { app.generationPageCleanup(); app.generationPageCleanup = null; }
    if (mode === 'admin' && app.sourcePageCleanup) { app.sourcePageCleanup(); app.sourcePageCleanup = null; }
    if (mode === 'merchant' && app.merchantCleanup) app.merchantCleanup();
    if (mode === 'admin' && !app.auth.requireSession()) { root.innerHTML = ''; return; }
    if (mode === 'admin' && app.access && !app.access.can('read')) {
      document.title = '会话已退出 · 冻品 AI 行情研判';
      root.innerHTML = ''; app.auth.signOut(); return;
    }
    const requested = window.location.hash.slice(1);
    const route = config.routes.find(function (item) { return item.id === requested; }) || config.routes[0];
    document.title = route.title + ' · ' + config.label + ' · 冻品 AI 行情研判';
    const content = '<main class="page-content" tabindex="-1" aria-label="' + esc(route.title) + '"><div id="page-body"></div></main>';

    if (mode === 'admin') {
      const groups = Array.from(new Set(config.routes.map(function (item) { return item.group; })));
      const menu = groups.map(function (group) {
        return '<div class="nav-group"><p class="nav-group-title">' + esc(group) + '</p><div class="nav-group-items">' + config.routes.filter(function (item) { return item.group === group; }).map(function (item) { return navigation(item, route.id, false); }).join('') + '</div></div>';
      }).join('');
      root.innerHTML = '<div class="admin-layout"><aside class="sidebar"><div class="brand"><span class="brand-mark" aria-hidden="true">丰</span><div><strong>冻品 AI 行情研判</strong><small>杭州五丰 · 市场管理端</small></div></div><nav aria-label="市场管理导航">' + menu + '</nav></aside><div class="workspace"><header class="topbar"><span class="topbar-label">' + esc(route.group) + ' / ' + esc(route.title) + '</span><div class="topbar-actions"><a class="button topbar-requirements" href="./requirements.html" target="_blank" rel="noopener">' + app.icon('report') + '<span>需求说明</span></a>' + (app.account ? app.account.markup() : '') + '</div></header>' + content + '</div></div>';
    } else {
      root.innerHTML = '<div class="merchant-layout"><header class="merchant-header" hidden><button type="button" class="button" data-mini-back hidden>' + app.icon('previous') + '<span>返回</span></button><div><h1 tabindex="-1">' + esc(route.title) + '</h1></div>' + '</header><main class="merchant-content"><div id="page-body"></div></main><nav class="merchant-tabs" aria-label="商户导航">' + config.routes.map(function (item) { return navigation(item, route.id, true); }).join('') + '</nav></div>';
    }

    if (mode === 'admin' && app.account) app.account.bind(root);
    const container = document.getElementById('page-body');
    if (mode === 'admin' && app.collectionStore) app.collectionStore.start();
    if (mode === 'admin' && app.generationStore) app.generationStore.start();
    const page = app.pages[mode + ':' + route.id];
    if (typeof page === 'function') {
      page(container, route);
    } else {
      container.innerHTML = '<section class="placeholder"><span class="placeholder-icon">' + app.icon(route.icon) + '</span><h2>页面待设计</h2><p>此处已预留“' + esc(route.title) + '”页面位置，具体内容与交互将在后续设计中补充。</p></section>';
    }
  }

  window.addEventListener('hashchange', function () {
    if (mode === 'admin' && app.isTaskWorkspaceRouteCurrent && app.isTaskWorkspaceRouteCurrent()) return;
    render();
    const target = root.querySelector(mode === 'admin' ? '.page-content' : 'h1');
    const header = root.querySelector('.merchant-header');
    if (target && (mode !== 'merchant' || header && !header.hidden)) target.focus({ preventScroll: true });
  });
  if (mode === 'merchant') {
    window.addEventListener('merchant-session-change', render);
    window.addEventListener('storage', function (event) { if (app.merchantAuth.storageChanged(event)) render(); });
    window.addEventListener('pagehide', function () {
      if (app.merchantLoginCleanup) app.merchantLoginCleanup();
      if (app.merchantCleanup) app.merchantCleanup();
    });
    function guard(event) {
      const session = app.merchantAuth.current(), atLogin = Boolean(root.querySelector('.merchant-layout--login'));
      if (!session && !atLogin || session && (atLogin || sessionIdentity !== session.merchantId)) {
        if (event && event.cancelable) event.preventDefault();
        if (event) event.stopImmediatePropagation();
        render();
      }
    }
    window.addEventListener('popstate', guard, true);
    root.addEventListener('click', guard, true);
    root.addEventListener('submit', guard, true);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) guard(); });
  }
  window.addEventListener('pageshow', function (event) { if (event.persisted) render(); });
  render();
}());
