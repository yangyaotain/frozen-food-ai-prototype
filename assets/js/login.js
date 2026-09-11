(function () {
  'use strict';
  const app = window.FrozenApp, form = document.getElementById('login-form');
  document.querySelectorAll('[data-icon]').forEach(function (node) { node.outerHTML = app.icon(node.dataset.icon); });
  const account = form.elements.account, password = form.elements.password;
  const button = form.querySelector('button[type="submit"]'), label = document.getElementById('login-label');
  const error = document.getElementById('login-error'), status = document.getElementById('login-status');
  let timer = null;
  function fieldError(input, message) {
    document.getElementById(input.name + '-error').textContent = message;
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }
  function resetBusy() {
    window.clearTimeout(timer); timer = null;
    button.disabled = false; account.readOnly = false; password.readOnly = false;
    form.setAttribute('aria-busy', 'false'); label.textContent = '登录'; status.textContent = '';
  }
  [account, password].forEach(function (input) {
    input.addEventListener('input', function () { fieldError(input, ''); error.textContent = ''; });
  });
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (button.disabled) return;
    error.textContent = ''; status.textContent = '';
    fieldError(account, account.value.trim() ? '' : '请输入账号');
    fieldError(password, password.value ? '' : '请输入密码');
    if (!account.value.trim() || !password.value) { (!account.value.trim() ? account : password).focus(); return; }
    button.disabled = true; account.readOnly = true; password.readOnly = true;
    form.setAttribute('aria-busy', 'true'); label.textContent = '登录中…'; status.textContent = '正在验证账号';
    timer = window.setTimeout(function () {
      if (!app.auth.signIn(account.value, password.value)) {
        resetBusy(); error.textContent = '账号或密码不正确，请重新输入。'; password.focus(); return;
      }
      password.value = ''; status.textContent = '登录成功，正在进入管理端';
      window.location.assign('admin/index.html#prices');
    }, 450);
  });
  window.addEventListener('pagehide', function () { resetBusy(); password.value = ''; });
  window.addEventListener('pageshow', function () {
    resetBusy(); account.value = account.defaultValue; password.value = password.defaultValue;
    fieldError(account, ''); fieldError(password, ''); error.textContent = '';
  });
}());
