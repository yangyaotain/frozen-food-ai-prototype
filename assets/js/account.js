(function () {
  'use strict';
  const app = window.FrozenApp, esc = app.escape;
  function markup() {
    const user = app.systemStore.current();
    return '<details class="account-menu"><summary class="button" aria-label="当前用户：' + esc(user.name) + '"><span class="account-avatar">' + app.icon('user') + '</span><span class="account-name" data-current-name>' + esc(user.name) + '</span>' + app.icon('down') + '</summary><div class="account-panel"><p><strong data-current-name>' + esc(user.name) + '</strong></p><p class="muted">账号：' + esc(user.account) + '</p><p class="muted">角色：系统管理员</p><button class="button button--text" type="button" data-account="profile">' + app.icon('user') + '<span>用户信息</span></button><button class="button button--text" type="button" data-account="logout">' + app.icon('logout') + '<span>退出系统</span></button></div></details>';
  }
  function bind(root) {
    const menu = root.querySelector('.account-menu'); if (!menu) return;
    menu.addEventListener('keydown', function (event) { if (event.key === 'Escape') { menu.open = false; menu.querySelector('summary').focus(); } });
    menu.addEventListener('focusout', function (event) { if (!menu.contains(event.relatedTarget)) menu.open = false; });
    menu.addEventListener('click', function (event) {
      const button = event.target.closest('[data-account]'); if (!button) return;
      menu.open = false; const host = root.querySelector('#page-body');
      if (button.dataset.account === 'profile') app.systemUI.profile(host);
      if (button.dataset.account === 'logout') {
        const dialog = app.openDialog(host, '退出登录', '<p class="dialog-description">确认退出当前管理员会话？退出后返回登录页，已保存的业务记录不会被清空。尚未保存的编辑及仅保留在当前页面的临时数据将在离开后结束。</p>', '<button class="button" type="button" data-close>' + app.icon('close') + '<span>取消</span></button><button class="button button--primary" type="button" data-exit>' + app.icon('logout') + '<span>确认退出</span></button>');
        dialog.querySelector('[data-exit]').addEventListener('click', function () { dialog.close(); root.innerHTML = ''; app.auth.signOut(); });
      }
    });
    root.onclick = function (event) { if (!menu.contains(event.target)) menu.open = false; };
  }
  app.account = { markup: markup, bind: bind, refresh: function () { document.querySelectorAll('[data-current-name]').forEach(function (node) { node.textContent = app.systemStore.current().name; }); const summary = document.querySelector('.account-menu > summary'); if (summary) summary.setAttribute('aria-label', '当前用户：' + app.systemStore.current().name); } };
}());
