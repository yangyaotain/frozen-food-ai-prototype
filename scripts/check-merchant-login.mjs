// Node-only service and DOM/event doubles. This is not browser or visual verification.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const source = name => read('assets/js/' + name);
const context = { window: { FrozenApp: {} } };
vm.runInNewContext(source('merchant-auth.js'), context);
const create = context.window.FrozenApp.merchantAuth.create;
const scope = 'file:///E:/Cursor/frozen-food-ai-prototype/merchant/';
function storage() {
  const data = new Map();
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
let now = 100000, selectedPhone = '13900000001', sends = 0;
const store = storage(); store.setItem('frozen-login-v1:admin', 'admin session'); store.setItem('business-reports', 'untouched');
const provider = { previewPhoneNumber: () => selectedPhone, getPhoneNumber: async () => selectedPhone, sendCode: async () => { sends++; } };
const options = { scope, storage: store, provider, now: () => now };
let auth = create(options);
assert.equal(auth.current(), null);
assert.equal(auth.maskedPhone(), '139****0001');
selectedPhone = '15812340987'; assert.equal(auth.maskedPhone(), '158****0987');
selectedPhone = 'invalid'; assert.equal(auth.maskedPhone(), '');
selectedPhone = '13900000001';
await assert.rejects(auth.quickLogin(true, undefined, '139****0002'), /号码已变化/);
await assert.rejects(auth.quickLogin(false), /授权/);
assert.equal(auth.current(), null);
assert.equal((await auth.quickLogin(true)).merchantId, 'demo-a');
assert.equal(create(options).current().merchantId, 'demo-a', 'refresh restores session');
assert.equal(create({ ...options, scope: scope + 'other/' }).current(), null, 'project scopes are separate');
now += 365 * 24 * 60 * 60 * 1000;
assert.equal(create(options).current().merchantId, 'demo-a', 'reopening after a year does not expire login');
assert.equal(auth.current().expiresAt, undefined);
const otherTab = create(options);
auth.signOut();
assert.equal(otherTab.current(), null, 'logout is shared across open tabs');
assert.equal(create(options).current(), null, 'reopening after logout requires login');
assert.equal(otherTab.storageChanged({ key: 'unrelated', storageArea: store }), false);
assert.equal(otherTab.storageChanged({ key: 'frozen-mini-login-v2:' + scope, storageArea: store }), true);
for (const [number, id] of [['13900000001', 'demo-a'], ['13900000002', 'demo-b'], ['13900000003', 'demo-c']]) {
  // Any nonempty value works without requesting a code first.
  for (const code of ['1', 'abc', '任意内容', '12345678901234567890', '000000']) assert.equal(auth.smsLogin(number, code).merchantId, id);
  await auth.sendCode(number); assert.equal(auth.remaining(number), 60);
  await assert.rejects(auth.sendCode(number), /倒计时/);
  assert.equal(auth.smsLogin(number, 'anything').merchantId, id, 'countdown does not prevent login');
  auth.signOut(); assert.equal(auth.current(), null);
}
assert.equal(store.getItem('frozen-login-v1:admin'), 'admin session');
assert.equal(store.getItem('business-reports'), 'untouched');
assert.throws(() => auth.smsLogin('13900000001', '   '), /请输入验证码/);
await assert.rejects(auth.sendCode(''), /请输入手机号/);
await auth.sendCode('138');
await auth.sendCode('13900000001');
assert.equal(auth.smsLogin('13900000002', 'x').merchantId, 'demo-b', 'typed phone still determines household');
now += 1500; auth = create(options); assert.equal(auth.remaining('13900000001'), 59, 'refresh does not reset cooldown');
for (let i = 0; i < 6; i++) assert.equal(auth.smsLogin('13900000001', 'x').merchantId, 'demo-a');
now += 60000; await auth.sendCode('13900000001');
now += 300000; assert.equal(auth.smsLogin('13900000001', 'x').merchantId, 'demo-a', 'no code expiry verification');
auth.signOut();
selectedPhone = '13900000999'; assert.equal((await auth.quickLogin(true)).merchantId, 'demo-a');
for (const value of ['13900000999', '1', '任意填写', '__proto__', 'constructor', '12345678901234567890']) {
  assert.equal(auth.smsLogin(value, 'x').merchantId, 'demo-a');
  assert.equal(create(options).current().merchantId, 'demo-a', 'arbitrary input session survives refresh');
  await auth.sendCode(value);
}
auth.signOut();
assert.equal(auth.current(), null);
for (const broken of [null, { getItem() { throw Error(); }, setItem() { throw Error(); }, removeItem() { throw Error(); } }, { getItem() { return null; }, setItem() { throw Error(); } }]) {
  const fallback = create({ ...options, storage: broken }); selectedPhone = '13900000001';
  await fallback.quickLogin(true); assert.equal(fallback.current().merchantId, 'demo-a');
  fallback.signOut(); assert.equal(fallback.current(), null);
}
const failure = create({ scope, provider: { getPhoneNumber: async () => { throw Error('network'); }, sendCode: async () => { throw Error('network'); } } });
assert.equal(failure.maskedPhone(), '');
await assert.rejects(failure.quickLogin(true), /network/);
await assert.rejects(failure.sendCode('13900000001'), /network/); assert.equal(failure.remaining('13900000001'), 0);
assert.equal(failure.smsLogin('13900000001', 'x').merchantId, 'demo-a', 'send failure does not prevent demonstration login');
let release;
const delayed = create({ scope, provider: { getPhoneNumber: () => new Promise(resolve => { release = resolve; }), sendCode: provider.sendCode } });
const abort = new AbortController(), pending = delayed.quickLogin(true, abort.signal);
await assert.rejects(delayed.quickLogin(true), /正在处理/);
abort.abort(); release('13900000001'); await assert.rejects(pending, /取消/); assert.equal(delayed.current(), null);
const revoked = delayed.quickLogin(true); delayed.signOut(); release('13900000001'); await assert.rejects(revoked, /取消/);
assert.equal(delayed.current(), null, 'late response cannot restore signed-out session');
const externalLogout = delayed.quickLogin(true);
delayed.storageChanged({ key: 'frozen-mini-login-v2:' + scope });
release('13900000001'); await assert.rejects(externalLogout, /取消/);
// New contexts represent a new tab or browser restart: the default service must use local storage only.
const persistentStore = storage();
function reopen() {
  const c = { window: { FrozenApp: {}, localStorage: persistentStore, sessionStorage: storage(), location: { href: scope + 'index.html' } }, URL };
  vm.runInNewContext(source('merchant-auth.js'), c);
  return c.window.FrozenApp.merchantAuth;
}
assert.equal(reopen().current(), null);
reopen().smsLogin('随便输入', 'x');
assert.equal(reopen().current().merchantId, 'demo-a');
reopen().signOut(); assert.equal(reopen().current(), null);

// UI event doubles exercise actual login, SMS submission, cancellation and logout handlers.
class Element {
  constructor() { this.listeners = {}; this.attrs = {}; this.textContent = ''; this.value = ''; this.disabled = false; this.hidden = false; this.dataset = {}; this.span = null; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  emit(type, event = {}) { return Promise.all((this.listeners[type] || []).map(fn => fn(event))); }
  setAttribute(key, value) { this.attrs[key] = value; }
  removeAttribute(key) { delete this.attrs[key]; }
  querySelector(selector) { return selector === 'span' ? (this.span ||= new Element()) : this.nodes?.[selector]; }
  querySelectorAll() { return this.buttons || []; }
  focus() { this.focused = true; }
}
function event(action) { const target = { dataset: { auth: action } }; return { target: { closest: () => target }, preventDefault() {} }; }
const loginRoot = new Element(), forms = new Element(), phone = new Element(), code = new Element();
forms.elements = { phone, code };
loginRoot.nodes = Object.fromEntries(['[data-error]', '[data-status]', '#mini-phone-error', '#mini-code-error', '[data-quick]', '.mini-login-card h2', '.mini-login', ...['quick', 'sms', 'back', 'send'].map(x => '[data-auth="' + x + '"]')].map(s => [s, new Element()]));
loginRoot.nodes.form = forms; loginRoot.buttons = Object.values(loginRoot.nodes).filter(x => x !== forms);
const timers = new Map(), events = {}, history = { replaceState(_, __, href) { this.href = href; } };
let timerId = 0, sheet, closeCalls = 0, smsSends = 0, uiNumber = '13900000001', pendingGrant;
const uiAuth = create({ scope, provider: { previewPhoneNumber: () => uiNumber, getPhoneNumber: () => new Promise(resolve => { pendingGrant = resolve; }), sendCode: async () => { smsSends++; } } });
const window = { FrozenApp: {}, location: { href: scope + 'index.html?merchant=demo-c#reports' }, history,
  setInterval: fn => { timers.set(++timerId, fn); return timerId; }, clearInterval: id => timers.delete(id),
  dispatchEvent(e) { events[e.type] = (events[e.type] || 0) + 1; this.FrozenApp.merchantLoginCleanup?.(); } };
const uiContext = { window, URL, Event, AbortController };
vm.runInNewContext(source('common.js'), uiContext);
const app = window.FrozenApp;
app.merchantAuth = uiAuth;
app.merchantUI = {
  closeSheet() { sheet?.close(); },
  sheet(title, html, setup) {
    sheet = new Element(); sheet.innerHTML = html; sheet.open = true; sheet.title = title;
    sheet.nodes = Object.fromEntries(['[data-quick-status]', '[data-quick-error]', '[data-auth="allow"]', '[data-auth="decline"]'].map(s => [s, new Element()]));
    sheet.close = () => { if (sheet.open) { sheet.open = false; closeCalls++; sheet.emit('close'); } };
    setup?.(sheet); return sheet;
  }
};
vm.runInNewContext(source('merchant-login.js'), uiContext);
function mountLogin() { app.merchantLogin.render(loginRoot); return action => loginRoot.nodes['.mini-login'].emit('click', event(action)); }
let click = mountLogin();
assert.equal(loginRoot.innerHTML.includes('merchant-tabs'), false);
assert.ok(loginRoot.innerHTML.includes('139****0001'));
assert.equal(loginRoot.innerHTML.includes('13900000001'), false, 'only masked local number is displayed');
assert.match(loginRoot.innerHTML, /name="code" type="text" autocomplete="one-time-code" placeholder="请输入验证码"/);
assert.doesNotMatch(loginRoot.innerHTML.replace(/<[^>]*>/g, ''), /演示|虚构|静态原型|缓存/);
const stack = [];
for (const tag of loginRoot.innerHTML.matchAll(/<\/?([a-z][\w-]*)\b[^>]*>/gi)) {
  if (tag[0].startsWith('</')) assert.equal(stack.pop(), tag[1]);
  else if (!['input', 'br'].includes(tag[1]) && !tag[0].endsWith('/>')) stack.push(tag[1]);
}
assert.equal(stack.length, 0, 'login markup balanced');
await click('sms'); assert.equal(forms.hidden, false); assert.equal(phone.focused, true);
await forms.emit('submit', event()); assert.match(loginRoot.nodes['#mini-phone-error'].textContent, /请输入手机号/);
phone.value = uiNumber; await click('send'); await new Promise(setImmediate);
assert.equal(smsSends, 1); assert.match(loginRoot.nodes['[data-status]'].textContent, /已发送/);
code.value = '123456'; phone.value = '13900000002'; await phone.emit('input'); assert.equal(code.value, '');
await forms.emit('submit', event()); assert.match(loginRoot.nodes['#mini-code-error'].textContent, /请输入验证码/);
phone.value = '任意填写'; code.value = '随便输入'; await forms.emit('submit', event());
assert.equal(uiAuth.current().merchantId, 'demo-a'); assert.equal(history.href, scope + 'index.html#news'); assert.equal(timers.size, 0);
app.merchantLogin.signOut(); await sheet.emit('click', event('cancel-out')); assert.equal(uiAuth.current().merchantId, 'demo-a');
app.merchantLogin.signOut(); await sheet.emit('click', event('confirm-out')); assert.equal(uiAuth.current(), null); assert.equal(history.href, scope + 'index.html#login');
click = mountLogin(); await click('quick');
assert.ok(sheet.innerHTML.includes('139****0001')); assert.equal(sheet.innerHTML.includes('13900000001'), false);
const grant = sheet.emit('click', event('allow')); await sheet.emit('click', event('decline')); pendingGrant(uiNumber); await grant;
assert.equal(uiAuth.current(), null); assert.match(loginRoot.nodes['[data-status]'].textContent, /已取消/);
await click('quick'); const accepted = sheet.emit('click', event('allow')); pendingGrant(uiNumber); await accepted;
assert.equal(uiAuth.current().merchantId, 'demo-a'); assert.equal(timers.size, 0);
// Identity ignores URL parameters after login and returns no default household when logged out.
app.pages = {}; app.categoryCatalog = { find: id => ({ name: id }) };
vm.runInNewContext(source('merchant-profile.js'), uiContext);
assert.equal(app.merchantProfile.currentId(), 'demo-a'); uiAuth.signOut(); assert.equal(app.merchantProfile.currentId(), null);
click = mountLogin(); await click('sms'); phone.value = '13900000002'; code.value = 'x';
const priorSends = smsSends; await forms.emit('submit', event());
assert.equal(smsSends, priorSends); assert.equal(uiAuth.current().merchantId, 'demo-b', 'UI login does not require send');

// Run the actual shell gate; an unauthenticated route must never mount a business page.
const root = new Element(), shellEvents = {}, documentEvents = {}, timeouts = new Map();
let session = null, mounts = 0, clears = 0, loginMounts = 0;
const shellWindow = { FrozenApp: {}, location: { href: scope + 'index.html?merchant=demo-c#reports', hash: '#reports' }, history: { replaceState(_, __, href) { shellWindow.location.href = href; } },
  addEventListener(type, fn) { (shellEvents[type] ||= []).push(fn); }, setTimeout(fn) { timeouts.set(++timerId, fn); return timerId; }, clearTimeout(id) { timeouts.delete(id); } };
const shellDocument = { body: { dataset: { app: 'merchant' } }, getElementById: id => id === 'app' ? root : new Element(), addEventListener(type, fn) { documentEvents[type] = fn; } };
const shellContext = { window: shellWindow, document: shellDocument, URL };
vm.runInNewContext(source('common.js'), shellContext); vm.runInNewContext(source('config.js'), shellContext);
Object.assign(shellWindow.FrozenApp, { merchantAuth: { current: () => session, storageChanged: e => e.key === 'login' }, merchantPage: { clearSession() { clears++; } },
  merchantLogin: { render() { loginMounts++; root.login = true; } }, pages: Object.fromEntries(['news', 'market', 'reports', 'advice', 'profile'].map(id => ['merchant:' + id, () => { mounts++; root.login = false; }])) });
root.querySelector = selector => selector === '.merchant-layout--login' && root.login ? new Element() : null;
vm.runInNewContext(source('shell.js'), shellContext);
assert.equal(mounts, 0); assert.equal(loginMounts, 1); assert.equal(shellWindow.location.href, scope + 'index.html#login');
session = { merchantId: 'demo-b', persistent: true }; shellEvents['merchant-session-change'][0](); assert.equal(mounts, 1);
assert.equal(timeouts.size, 0, 'no automatic logout timer');
session = null; let blocked = false;
await root.emit('click', { cancelable: true, preventDefault() { blocked = true; }, stopImmediatePropagation() {} });
assert.equal(blocked, true); assert.equal(mounts, 1); assert.equal(loginMounts, 2);
root.login = false; shellEvents.popstate[0]({ stopImmediatePropagation() {} }); assert.equal(loginMounts, 3);
session = { merchantId: 'demo-c', persistent: true }; shellEvents['merchant-session-change'][0]();
session = null; shellEvents.storage[0]({ key: 'login' }); assert.equal(loginMounts, 4);
shellEvents.pageshow[0]({ persisted: true }); assert.equal(mounts, 2); assert.equal(loginMounts, 5);
assert.ok(clears >= 4);
console.log('PASS: masked local number and matching login; arbitrary nonempty SMS code without send, format, expiry or attempt checks; resend countdown and household binding; failure/cancel/late callbacks; storage fallback, refresh and login/logout/history gates. Node doubles/static only; no browser or real phone/SMS service.');
