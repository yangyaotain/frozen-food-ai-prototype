(function () {
  'use strict';
  const app = window.FrozenApp, esc = app.escape;
  // Fictional identity metadata only; operating reports remain in household-specific feeds.
  const profiles = {
    'demo-a': { name: '丰茂冻品商行', code: 'WF-0001', market: '五丰冻品市场', categories: ['poultry', 'chicken', 'duck', 'duck-offal', 'seafood'] },
    'demo-b': { name: '润泽水产商行', code: 'WF-0002', market: '五丰冻品市场', categories: ['seafood', 'prepared'] },
    'demo-c': { name: '锦禾食品商行', code: 'WF-0003', market: '五丰冻品市场', categories: ['pork', 'pork-meat', 'beef', 'beef-offal', 'lamb', 'lamb-offal', 'prepared'] }
  };
  Object.values(profiles).forEach(function (p) { p.categories = p.categories.map(function (id) { return app.categoryCatalog.find(id).name; }); });
  function currentId() { const session = app.merchantAuth.current(); return session ? session.merchantId : null; }
  function get(id) { return Object.hasOwn(profiles, id) ? JSON.parse(JSON.stringify(profiles[id])) : null; }
  function render(id) {
    const profile = get(id);
    if (!profile) return app.merchantUI.empty('未识别当前商户', '请使用本户入口进入；如仍无法识别，请联系管理员核对商户资料。');
    const fields = [['商户编号', profile.code], ['所属市场', profile.market]];
    return '<div class="mini-page"><section class="mini-profile-head"><span class="mini-avatar" aria-hidden="true">' + app.icon('user') + '</span><div><h2>' + esc(profile.name) + '</h2><span class="mini-tag">本户商户</span></div></section><section class="mini-section"><h2>商户资料</h2><dl class="mini-profile-info">' + fields.map(function (field) { return '<div><dt>' + esc(field[0]) + '</dt><dd>' + esc(field[1]) + '</dd></div>'; }).join('') + '<div><dt>经营品类</dt><dd><div class="mini-tags">' + profile.categories.map(function (name) { return '<span class="mini-tag">' + esc(name) + '</span>'; }).join('') + '</div></dd></div></dl></section></div>';
  }
  app.merchantProfile = { currentId: currentId, get: get, render: render };
  app.pages['merchant:profile'] = function (container) {
    if (app.merchantCleanup) app.merchantCleanup();
    const layout = container.closest('.merchant-layout');
    layout.querySelector('[data-mini-back]').hidden = true;
    layout.querySelector('.merchant-header').hidden = true;
    layout.querySelector('.merchant-tabs').hidden = false;
    layout.classList.remove('merchant-layout--detail');
    layout.querySelector('h1').textContent = '我的';
    container.innerHTML = render(currentId()) + '<div class="mini-page"><button type="button" class="button mini-button mini-logout" data-mini-logout>' + app.icon('logout') + '<span>退出登录</span></button></div>';
    container.querySelector('[data-mini-logout]').addEventListener('click', app.merchantLogin.signOut);
    layout.querySelector('.merchant-content').scrollTop = 0;
  };
}());
