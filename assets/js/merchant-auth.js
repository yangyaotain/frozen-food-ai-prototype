(function () {
  'use strict';
  const app = window.FrozenApp;
  // Frontend-only fixtures. No device number access, SMS delivery or real authentication.
  const accounts = { '13900000001': 'demo-a', '13900000002': 'demo-b', '13900000003': 'demo-c' };
  const localPhone = '13900000001';
  function pause(ms, signal) {
    return new Promise(function (resolve, reject) {
      function abort() { window.clearTimeout(timer); reject(new Error('操作已取消')); }
      const timer = window.setTimeout(function () { if (signal) signal.removeEventListener('abort', abort); resolve(); }, ms);
      if (signal) { if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true }); }
    });
  }
  function create(options) {
    const now = options.now || Date.now, key = 'frozen-mini-login-v2:' + options.scope;
    let storage = options.storage;
    const provider = options.provider || {
      previewPhoneNumber: function () { return localPhone; },
      getPhoneNumber: async function (signal) { await pause(650, signal); return localPhone; },
      sendCode: async function (_, signal) { await pause(450, signal); }
    };
    let memory = null, challenges = {}, busy = false, epoch = 0;
    function read(name, fallback) { try { return storage ? JSON.parse(storage.getItem(name)) : fallback; } catch (_) { return fallback; } }
    function write(name, value) { try { if (storage) { if (value === null) storage.removeItem(name); else storage.setItem(name, JSON.stringify(value)); } } catch (_) { storage = null; /* Keep only this page's fallback state. */ } }
    challenges = read(key + ':codes', {}) || {};
    if (typeof challenges !== 'object' || Array.isArray(challenges)) challenges = {};
    challenges = Object.assign(Object.create(null), challenges);
    function phone(value) { return String(value || '').trim(); }
    function validPhone(value) { return /^1[3-9]\d{9}$/.test(phone(value)); }
    function requirePhone(value) { const p = phone(value); if (!p) throw new Error('请输入手机号'); return p; }
    function household(value) { return Object.hasOwn(accounts, value) ? accounts[value] : 'demo-a'; }
    function mask(value) { const p = phone(value); return validPhone(p) ? p.slice(0, 3) + '****' + p.slice(-4) : ''; }
    function maskedPhone() {
      try { return provider.previewPhoneNumber ? mask(provider.previewPhoneNumber()) : ''; }
      catch (_) { return ''; }
    }
    function current() {
      const value = read(key, memory);
      return value && value.scope === options.scope && typeof value.phone === 'string' && value.phone.trim() && household(value.phone) === value.merchantId &&
        value.persistent === true ? { ...value } : null;
    }
    function save(p, method) {
      const value = { scope: options.scope, phone: p, merchantId: household(p), method: method, persistent: true };
      memory = value; write(key, value); return { ...value };
    }
    function remaining(value) {
      const item = challenges[phone(value)];
      return item && Number.isFinite(item.sentAt) ? Math.max(0, Math.ceil((item.sentAt + 60000 - now()) / 1000)) : 0;
    }
    function checkActive(signal, start) { if (start !== epoch || signal && signal.aborted) throw new Error('操作已取消'); }
    async function sendCode(value, signal) {
      const p = requirePhone(value);
      if (busy) throw new Error('正在处理，请稍候');
      if (remaining(p)) throw new Error('请在倒计时结束后重新获取验证码');
      const start = epoch; busy = true;
      try {
        await provider.sendCode(p, signal); checkActive(signal, start);
        const time = now();
        Object.keys(challenges).forEach(function (number) { if (!challenges[number] || challenges[number].sentAt + 60000 <= time) delete challenges[number]; });
        challenges[p] = { sentAt: time }; // Only the resend countdown is simulated; there is no code verification.
        write(key + ':codes', challenges);
      } finally { busy = false; }
    }
    function smsLogin(value, code) {
      const p = requirePhone(value);
      if (busy) throw new Error('正在处理，请稍候');
      if (!String(code || '').trim()) throw new Error('请输入验证码');
      return save(p, 'sms');
    }
    async function quickLogin(consent, signal, displayedNumber) {
      if (!consent) throw new Error('请先授权获取本机手机号');
      if (busy) throw new Error('正在处理，请稍候');
      const start = epoch; busy = true;
      try {
        const p = await provider.getPhoneNumber(signal); checkActive(signal, start);
        if (displayedNumber && mask(p) !== displayedNumber) throw new Error('本机号码已变化，请重新登录');
        return save(requirePhone(p), 'quick');
      } finally { busy = false; }
    }
    function signOut() { epoch++; memory = null; challenges = Object.create(null); write(key, null); write(key + ':codes', null); }
    function storageChanged(event) {
      if (event.key !== null && event.key !== key) return false;
      if (event.storageArea && storage && event.storageArea !== storage) return false;
      epoch++; memory = null; // Invalidate outstanding login requests in another open tab.
      challenges = Object.assign(Object.create(null), read(key + ':codes', {}) || {});
      return true;
    }
    return { current: current, maskedPhone: maskedPhone, validPhone: validPhone, remaining: remaining, sendCode: sendCode, smsLogin: smsLogin, quickLogin: quickLogin, signOut: signOut, storageChanged: storageChanged };
  }
  let instance = null;
  function service() {
    if (!instance) {
      let storage = null;
      try { storage = window.localStorage; } catch (_) { /* Session remains in this page when storage is unavailable. */ }
      instance = create({ storage: storage, scope: new URL('./', window.location.href).href });
    }
    return instance;
  }
  app.merchantAuth = { create: create };
  ['current', 'maskedPhone', 'validPhone', 'remaining', 'sendCode', 'smsLogin', 'quickLogin', 'signOut', 'storageChanged'].forEach(function (name) {
    app.merchantAuth[name] = function () { return service()[name].apply(null, arguments); };
  });
}());
