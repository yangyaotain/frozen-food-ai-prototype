(function () {
  'use strict';
  const app = window.FrozenApp, ui = app.merchantUI, auth = app.merchantAuth;
  function button(action, icon, label, primary) {
    return '<button type="button" class="button mini-button' + (primary ? ' button--primary' : '') + '" data-auth="' + action + '">' + app.icon(icon) + '<span>' + label + '</span></button>';
  }
  function navigate(hash) {
    const url = new URL('./index.html', window.location.href); url.hash = hash;
    window.history.replaceState(null, '', url.href);
    window.dispatchEvent(new Event('merchant-session-change'));
  }
  function render(root) {
    let disposed = false, busy = false, controller = null, interval = null, mode = 'quick';
    const maskedPhone = auth.maskedPhone();
    const numberMarkup = '<div class="mini-login-number"><strong>' + app.escape(maskedPhone || '暂未获取本机号码') + '</strong><span class="mini-muted">' + (maskedPhone ? '本机号码' : '请使用短信验证码登录') + '</span></div>';
    root.innerHTML = '<div class="merchant-layout merchant-layout--login"><main class="merchant-content mini-login-content"><div class="mini-login mini-page"><header class="mini-login-brand"><span class="brand-mark" aria-hidden="true">丰</span><h1>冻品 AI 行情研判</h1><p class="mini-muted">行业资讯 · 市场行情 · 经营参考</p></header><section class="mini-login-card"><h2 tabindex="-1">欢迎登录</h2><p class="mini-muted">登录后查看市场行情与本户经营信息</p><div data-quick class="mini-login-actions">' + numberMarkup + button('quick', 'phone', '本机号码一键登录', true) + button('sms', 'shield', '短信验证码登录') + '</div><form data-sms class="mini-login-form" hidden novalidate><label class="form-field" for="mini-login-phone"><span>手机号</span><input id="mini-login-phone" class="form-control" name="phone" type="text" autocomplete="tel-national" placeholder="请输入手机号" aria-describedby="mini-phone-error"><small id="mini-phone-error" class="field-error"></small></label><label class="form-field" for="mini-login-code"><span>验证码</span><span class="mini-code-row"><input id="mini-login-code" class="form-control" name="code" type="text" autocomplete="one-time-code" placeholder="请输入验证码" aria-describedby="mini-code-error">' + button('send', 'shield', '获取验证码') + '</span><small id="mini-code-error" class="field-error"></small></label><button type="submit" class="button mini-button button--primary">' + app.icon('login') + '<span>登录</span></button>' + button('back', 'previous', '返回一键登录') + '</form><p class="field-error" data-error role="alert"></p><p class="mini-status" data-status role="status" aria-live="polite"></p></section><p class="mini-login-note mini-muted">手机号仅用于登录验证与关联本户商户资料。获取本机号码前，将征求您的授权。</p></div></main></div>';
    const form = root.querySelector('form'), phone = form.elements.phone, code = form.elements.code;
    const error = root.querySelector('[data-error]'), status = root.querySelector('[data-status]');
    const phoneError = root.querySelector('#mini-phone-error'), codeError = root.querySelector('#mini-code-error');
    function clearErrors() { error.textContent = ''; phoneError.textContent = ''; codeError.textContent = ''; phone.removeAttribute('aria-invalid'); code.removeAttribute('aria-invalid'); }
    function update() {
      if (disposed) return;
      root.querySelectorAll('[data-auth], [type="submit"]').forEach(function (b) { b.disabled = busy; });
      root.querySelector('[data-auth="quick"]').disabled = busy || !maskedPhone;
      phone.disabled = busy; code.disabled = busy;
      const send = root.querySelector('[data-auth="send"]'), seconds = auth.remaining(phone.value);
      send.disabled = busy || seconds > 0;
      send.querySelector('span').textContent = seconds ? seconds + '秒后重新获取' : '获取验证码';
      form.setAttribute('aria-busy', String(busy));
    }
    function switchMode(next) {
      mode = next; clearErrors(); status.textContent = '';
      root.querySelector('[data-quick]').hidden = mode !== 'quick'; form.hidden = mode !== 'sms';
      root.querySelector('.mini-login-card h2').textContent = mode === 'sms' ? '短信验证码登录' : '欢迎登录';
      (mode === 'sms' ? phone : root.querySelector('[data-auth="quick"]')).focus(); update();
    }
    function checkPhone() {
      if (phone.value.trim()) return true;
      phoneError.textContent = '请输入手机号'; phone.setAttribute('aria-invalid', 'true'); phone.focus(); return false;
    }
    function finish() { status.textContent = '登录成功'; navigate('news'); }
    async function send() {
      clearErrors(); if (!checkPhone()) return;
      busy = true; status.textContent = '正在发送验证码…'; controller = new AbortController(); update();
      try {
        await auth.sendCode(phone.value, controller.signal);
        if (!disposed) { status.textContent = '验证码已发送'; }
      } catch (_) { if (!disposed) { error.textContent = '验证码发送失败，请稍后重试'; status.textContent = ''; } }
      finally { if (!disposed) { busy = false; controller = null; update(); code.focus(); } }
    }
    function quick() {
      if (!maskedPhone) { switchMode('sms'); return; }
      clearErrors(); status.textContent = '';
      const dialog = ui.sheet('手机号授权', '<div class="mini-auth-consent">' + app.icon('shield') + '<h3>授权获取本机手机号</h3>' + numberMarkup + '<p>用于验证登录身份并关联您的商户资料。</p><p class="mini-status" data-quick-status role="status" aria-live="polite"></p><p class="field-error" data-quick-error role="alert"></p><div class="mini-login-actions">' + button('allow', 'phone', '同意并一键登录', true) + button('decline', 'close', '取消') + '</div></div>', function (sheet) {
        let cancelled = false, completed = false;
        function cancel() { cancelled = true; if (controller) controller.abort(); }
        sheet.addEventListener('cancel', cancel);
        sheet.addEventListener('close', function () {
          cancel();
          if (!disposed && !completed) { busy = false; controller = null; status.textContent = '已取消手机号授权，可使用短信验证码登录'; update(); }
        });
        sheet.addEventListener('click', async function (event) {
          const target = event.target.closest('[data-auth]'); if (!target) return;
          if (target.dataset.auth === 'decline') { cancel(); sheet.close(); return; }
          if (target.dataset.auth !== 'allow' || busy) return;
          busy = true; update(); controller = new AbortController();
          target.disabled = true;
          sheet.querySelector('[data-quick-error]').textContent = '';
          sheet.querySelector('[data-quick-status]').textContent = '正在获取号码并登录…';
          try {
            await auth.quickLogin(true, controller.signal, maskedPhone);
            if (!disposed && !cancelled) { completed = true; sheet.close(); finish(); }
          } catch (e) {
            if (!disposed && !cancelled) {
              sheet.querySelector('[data-quick-status]').textContent = '';
              sheet.querySelector('[data-quick-error]').textContent = '获取本机号码失败，请重试或使用短信验证码登录';
              sheet.querySelector('[data-auth="decline"] span').textContent = '短信验证码登录';
              sheet.querySelector('[data-auth="decline"]').onclick = function () { sheet.close(); switchMode('sms'); };
            }
          } finally { if (!disposed && !cancelled) { busy = false; controller = null; target.disabled = false; update(); } }
        });
      });
      dialog.querySelector('[data-auth="allow"]').focus();
    }
    root.querySelector('.mini-login').addEventListener('click', function (e) {
      const target = e.target.closest('[data-auth]'); if (!target || busy) return;
      if (target.dataset.auth === 'sms') switchMode('sms');
      if (target.dataset.auth === 'back') switchMode('quick');
      if (target.dataset.auth === 'send') send();
      if (target.dataset.auth === 'quick') quick();
    });
    phone.addEventListener('input', function () { code.value = ''; clearErrors(); status.textContent = ''; update(); });
    code.addEventListener('input', clearErrors);
    form.addEventListener('submit', function (e) {
      e.preventDefault(); if (busy) return; clearErrors(); status.textContent = ''; if (!checkPhone()) return;
      if (!code.value.trim()) { codeError.textContent = '请输入验证码'; code.setAttribute('aria-invalid', 'true'); code.focus(); return; }
      busy = true; update();
      try { auth.smsLogin(phone.value, code.value); finish(); }
      catch (failure) { error.textContent = failure.message; code.setAttribute('aria-invalid', 'true'); }
      finally { if (!disposed) { busy = false; update(); } }
    });
    interval = window.setInterval(update, 1000); update();
    app.merchantLoginCleanup = function () {
      disposed = true; if (controller) controller.abort(); window.clearInterval(interval); ui.closeSheet(); app.merchantLoginCleanup = null;
    };
  }
  function signOut() {
    ui.sheet('退出登录', '<p>退出后需重新登录才能使用。</p><div class="mini-login-actions">' + button('confirm-out', 'logout', '退出登录', true) + button('cancel-out', 'close', '取消') + '</div>', function (dialog) {
      dialog.addEventListener('click', function (e) {
        const target = e.target.closest('[data-auth]'); if (!target) return;
        if (target.dataset.auth === 'cancel-out') dialog.close();
        if (target.dataset.auth === 'confirm-out') { dialog.close(); auth.signOut(); navigate('login'); }
      });
    });
  }
  app.merchantLogin = { render: render, signOut: signOut };
}());
