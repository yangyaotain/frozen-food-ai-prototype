(function () {
  'use strict';
  const app = window.FrozenApp, esc = app.presentation ? app.presentation.escape : app.escape, ui = app.merchantUI, view = app.merchantView;
  const categories = [['', '全部品类（' + app.categoryCatalog.categories.length + '）']].concat(app.categoryCatalog.grouped().map(function (c) { return [c.id, c.name, c.group]; }));
  const states = {}, feeds = {}, stores = {};
  function merchantId() { return app.merchantProfile.currentId(); }
  function reportStore(id, live) {
    const key = (live ? 'live:' : 'demo:') + id;
    if (!stores[key]) {
      let storage = null;
      try { const native = window.localStorage; storage = live ? native : { getItem: function (k) { return native.getItem('mini-demo-v1:' + k); }, setItem: function (k, v) { native.setItem('mini-demo-v1:' + k, v); } }; } catch (_) { /* session-only reading state */ }
      stores[key] = app.reportClient.createStore(id, storage);
      // Embedded previews await this preview's feed, never display an old cache first.
      stores[key].accept([], false);
    }
    return stores[key];
  }
  function sort(rows) { return rows.slice().sort(function (a, b) { return (b.end || b.sourcePublishedAt).localeCompare(a.end || a.sourcePublishedAt) || b.publication.time.localeCompare(a.publication.time) || (a.count || 0) - (b.count || 0); }); }
  function match(rows, mode, filters) {
    if (mode === 'news') {
      const keyword = String(filters.keyword || '').trim().toLowerCase();
      return app.newsData.query(rows, { type: filters.type, category: filters.category }).filter(function (r) {
        const raw = r.title + ' ' + r.source.name, shown = app.presentation ? app.presentation.text(raw) : raw;
        return !keyword || (shown + ' ' + raw).toLowerCase().includes(keyword);
      });
    }
    return sort(rows.filter(function (r) { return (!filters.month || r.start.slice(0, 7) <= filters.month && r.end.slice(0, 7) >= filters.month) && (!filters.category || r.snapshot.categories.some(function (c) { return c.id === filters.category; })) && (!filters.kind || r.kind === filters.kind) && (!filters.count || String(r.count) === filters.count); }));
  }
  // History contains opaque keys only. Published snapshots stay in memory and are revalidated against the current feed.
  const entries = new Map(); let entryId = 0;
  function mount(container, route) {
    if (app.merchantCleanup) app.merchantCleanup();
    const mode = route.id, live = window.parent !== window, own = mode === 'reports' || mode === 'advice', id = merchantId();
    const layout = container.closest('.merchant-layout'), back = layout.querySelector('[data-mini-back]'), heading = layout.querySelector('h1');
    const header = layout.querySelector('.merchant-header'), tabs = layout.querySelector('.merchant-tabs'), scrollArea = layout.querySelector('.merchant-content');
    header.hidden = true; tabs.hidden = false;
    if (!app.reportClient.validMerchant(id)) { container.innerHTML = ui.empty('未识别当前商户', '请使用本户入口进入；如仍无法识别，请联系管理员核对商户资料。'); return; }
    const key = (live ? 'live:' : 'demo:') + (own ? id + ':' : '') + mode;
    const state = states[key] || (states[key] = { filters: { month: '', category: '', kind: '', count: '', type: '', keyword: '' }, limit: 4, scroll: 0, focusId: '' });
    const feedKey = (live ? 'live:' : 'demo:') + (own ? id + ':reports' : mode);
    const feed = feeds[feedKey] || (feeds[feedKey] = { loaded: false, records: [], availability: null });
    const store = own ? reportStore(id, live) : null;
    let opened = null, rendered = null, busy = false, loading = false, error = '', timer = null, loadTimer = null, feedbackTimer = null;
    let disposed = false, chartCleanup = function () {}, generation = 0, scrollControl = null;
    let stack = [];
    function historyState() { return { ...(window.history.state || {}), mini: { key: key, stack: stack.slice() } }; }
    function resetHistory() { stack = []; opened = null; window.history.replaceState(historyState(), ''); }
    function readHistory() {
      const value = window.history.state && window.history.state.mini;
      if (!value || value.key !== key || !Array.isArray(value.stack) || !value.stack.every(function (k) { return entries.has(k); })) resetHistory();
      else { stack = value.stack.slice(); opened = entries.get(stack[stack.length - 1]) || null; }
    }
    readHistory();
    container.innerHTML = '<div class="mini-page"><div class="mini-pull" data-pull role="status"></div><div data-mini-filters></div><p class="mini-status" data-status role="status"></p><div data-update></div><div class="mini-feed" data-output></div><p class="mini-load-status" data-load-status role="status"></p></div>';
    const output = container.querySelector('[data-output]'), filterBox = container.querySelector('[data-mini-filters]'), status = container.querySelector('[data-status]'), update = container.querySelector('[data-update]');
    const pull = container.querySelector('[data-pull]'), loadStatus = container.querySelector('[data-load-status]');
    const all = function () { return own ? store.list() : feed.records; };
    function pickerButton(action, label, selected) { return ui.button(action, 'down', label, ' aria-pressed="' + Boolean(selected) + '" aria-haspopup="dialog"'); }
    function filterMarkup() {
      const f = state.filters;
      if (mode === 'news') return '<div class="mini-filter"><form class="mini-search" role="search"><label><span class="sr-only">搜索资讯标题或来源</span><input type="search" name="keyword" class="form-control" maxlength="100" enterkeyhint="search" placeholder="搜索资讯标题、来源" value="' + esc(f.keyword) + '"></label><button type="submit" class="mini-search-submit" aria-label="搜索资讯">' + app.icon('search') + '<span class="sr-only">搜索</span></button></form>' + ui.chips('type', [['', '全部']].concat(Object.entries(app.newsTypes)), f.type) + '<div class="mini-filter-row">' + pickerButton('category', categories.find(function (c) { return c[0] === f.category; })[1], f.category) + '</div></div>';
      return '<div class="mini-filter"><div class="mini-filter-row">' + (mode === 'market' ? pickerButton('category', categories.find(function (c) { return c[0] === f.category; })[1], f.category) : '') + pickerButton('month', f.month || '全部月份', f.month) + pickerButton('kind', f.kind === 'week' ? '周报' : f.kind === 'month' ? '月报' : '周报 / 月报', f.kind) + '</div></div>';
    }
    function redrawFilters() { filterBox.innerHTML = filterMarkup(); }
    function version(r) { return mode === 'news' ? r.publication.version : r.version; }
    function detail(item) { return item.mode === 'news' ? view.news(item.record) : item.mode === 'market' ? view.market(item.record, item.category) : view.report(item.record, item.mode === 'advice'); }
    function card(r, index) { return view.card(r, mode, { feature: index === 0 && mode !== 'news', category: state.filters.category, unread: own ? store.unread(r, mode) : '' }); }
    function loadMessage() {
      const rows = match(all(), mode, state.filters);
      loadStatus.hidden = Boolean(opened) || !rows.length;
      loadStatus.textContent = loading ? '正在加载…' : state.limit >= rows.length ? '没有更多了' : '';
    }
    function scheduleCheck() { window.requestAnimationFrame(function () { if (!disposed && scrollControl) scrollControl.check(); }); }
    function cancelLoad() { if (loadTimer !== null) window.clearTimeout(loadTimer); loadTimer = null; loading = false; }
    function render() {
      if (disposed) return;
      const records = all(), rows = match(records, mode, state.filters);
      const root = stack.length ? entries.get(stack[0]) : null;
      const current = root && records.find(function (r) { return r.id === root.record.id; });
      if (root && feed.loaded && !current) { stack.forEach(function (k) { entries.delete(k); }); resetHistory(); error = '该内容已暂停展示或不再可用，已返回列表。'; scrollArea.scrollTop = state.scroll; }
      filterBox.hidden = Boolean(opened); back.hidden = !opened; header.hidden = !opened; tabs.hidden = Boolean(opened);
      pull.hidden = Boolean(opened);
      layout.classList.toggle('merchant-layout--detail', Boolean(opened));
      heading.textContent = opened ? opened.mode === 'news' ? '资讯详情' : opened.mode === 'market' ? '行情详情' : opened.mode === 'advice' ? '经营建议' : '经营报告' : route.title;
      status.textContent = error || app.publicationPolicy.message(feed.availability) || '';
      output.setAttribute('aria-busy', String(busy && !feed.loaded)); update.innerHTML = '';
      if (opened && !opened.reference && current && version(current) > version(opened.record)) update.innerHTML = '<div class="mini-update">新版本 V' + version(current) + ' 已发布，当前阅读 V' + version(opened.record) + '。' + ui.button('latest', 'download', '查看最新版本') + '</div>';
      loadMessage();
      if (opened && rendered === opened) return; // Incoming feeds do not reset the reader's folds, charts or scroll.
      chartCleanup(); rendered = opened;
      if (opened) {
        output.innerHTML = detail(opened) + (own && !opened.reference ? '<button type="button" class="mini-related" data-mini="related">' + app.icon(opened.mode === 'advice' ? 'report' : 'bulb') + '<span>' + (opened.mode === 'advice' ? '阅读同版经营报告' : '阅读同版经营建议') + '</span>' + app.icon('next') + '</button>' : '');
        if (own && !opened.reference) store.markRead(opened.record, opened.mode);
        Array.from(output.querySelectorAll('details')).forEach(function (el, i) { el.open = Boolean(opened.folds && opened.folds[i]); });
        chartCleanup = view.charts(output); return;
      }
      if (!rows.length) {
        output.innerHTML = busy && !feed.loaded ? ui.skeleton() : ui.empty(error && !feed.loaded ? '内容暂未加载' : records.length ? '没有匹配内容' : live ? '暂无已发布内容' : '暂无内容', error || (records.length ? '可以切换分类、品类或期间，看看其他内容。' : live ? '当前没有可展示的发布版本。' : '下拉页面重新加载。'));
      } else output.innerHTML = rows.slice(0, state.limit).map(card).join('');
    }
    function remember() {
      if (opened) { opened.scroll = scrollArea.scrollTop; opened.folds = Array.from(output.querySelectorAll('details')).map(function (el) { return el.open; }); }
      else state.scroll = scrollArea.scrollTop;
    }
    function restore() {
      render();
      window.requestAnimationFrame(function () {
        if (disposed) return;
        scrollArea.scrollTo({ top: opened ? opened.scroll || 0 : state.scroll, behavior: 'instant' });
        if (opened) heading.focus({ preventScroll: true });
        else { const item = Array.from(output.querySelectorAll('[data-open]')).find(function (el) { return el.dataset.open === state.focusId; }); if (item) item.focus({ preventScroll: true }); }
      });
    }
    function push(item) {
      remember(); cancelLoad(); ui.closeSheet();
      const token = ++entryId; entries.set(token, item); stack.push(token); opened = item;
      window.history.pushState(historyState(), ''); restore();
    }
    function pop() {
      const routeId = window.location.hash.slice(1) || app.config.merchant.routes[0].id;
      if (routeId !== mode || disposed) return;
      remember(); cancelLoad(); ui.closeSheet(); readHistory(); restore();
    }
    function currentKeyword() { const input = filterBox.querySelector('[name="keyword"]'); if (input) state.filters.keyword = input.value.trim(); }
    function query() { currentKeyword(); cancelLoad(); state.limit = 4; state.scroll = 0; redrawFilters(); render(); scrollArea.scrollTop = 0; scheduleCheck(); }
    function feedback(text) {
      if (feedbackTimer !== null) window.clearTimeout(feedbackTimer);
      pull.style.height = text ? '36px' : '0px'; pull.textContent = text;
      if (text && !busy) feedbackTimer = window.setTimeout(function () { feedbackTimer = null; pull.style.height = '0px'; pull.textContent = ''; }, 1200);
    }
    function done() { if (timer !== null) window.clearTimeout(timer); timer = null; busy = false; }
    function accept(records, availability) {
      let accepted = false;
      try {
        if (own) accepted = store.accept(records, true);
        else if (mode === 'market' && app.marketData.valid(records)) { feed.records = records.map(app.marketData.project).filter(Boolean); accepted = true; }
        else if (mode === 'news' && app.newsData.valid(records)) { feed.records = records.map(app.newsData.project); accepted = true; }
      } catch (_) { accepted = false; }
      if (!accepted) return false;
      const wasRefreshing = busy && feed.loaded; cancelLoad(); feed.loaded = true; feed.availability = availability; done(); error = '';
      render(); if (wasRefreshing && !opened) feedback('已更新'); else feedback(''); scheduleCheck(); return true;
    }
    async function refresh() {
      if (busy || loading || disposed) return;
      const requestId = ++generation; busy = true; error = '';
      if (feed.loaded && !opened) feedback('正在刷新…'); else render();
      if (live) {
        window.parent.postMessage({ type: own ? 'frozen-reports-request' : mode === 'market' ? 'frozen-market-request' : 'frozen-news-request', ...(own ? { merchantId: id } : {}) }, '*');
        timer = window.setTimeout(function () { if (disposed) return; done(); error = '暂未同步，请稍后下拉重试。'; feedback('同步失败'); render(); }, 2500);
      } else {
        try {
          const bundle = await app.merchantDemo.load(own ? id : 'public');
          if (disposed || requestId !== generation) return;
          if (!accept(own ? bundle : bundle[mode], null)) throw new Error('内容校验失败，请下拉重试');
        } catch (e) { if (!disposed && requestId === generation) { done(); error = e.message; feedback('加载失败'); render(); } }
      }
    }
    function more() {
      const rows = match(all(), mode, state.filters);
      if (disposed || opened || busy || loading || state.limit >= rows.length) return;
      loading = true; loadMessage();
      loadTimer = window.setTimeout(function () {
        loadTimer = null; if (disposed || opened) { loading = false; return; }
        const prior = state.limit; state.limit = Math.min(rows.length, prior + 4);
        output.insertAdjacentHTML('beforeend', rows.slice(prior, state.limit).map(function (r, i) { return card(r, prior + i); }).join(''));
        loading = false; loadMessage(); scheduleCheck();
      }, 180);
    }
    function receive(e) {
      if (!live || e.source !== window.parent || !e.data || e.data.type !== (own ? 'frozen-reports-published' : mode === 'market' ? 'frozen-market-published' : 'frozen-news-published') || own && e.data.merchantId !== id) return;
      if (!accept(e.data.records, e.data.availability)) { done(); error = '发布内容校验失败，当前内容未被替换。可下拉重新同步。'; feedback('同步失败'); render(); }
    }
    function pick(key, title, options) { currentKeyword(); ui.picker(title, options, state.filters[key], function (value) { if (disposed) return; state.filters[key] = value; query(); }); }
    function click(e) {
      if (e.target.closest('dialog')) return;
      const item = e.target.closest('[data-open]');
      if (item) { e.preventDefault(); const record = all().find(function (r) { return r.id === item.dataset.open; }); if (record) { state.focusId = item.dataset.open; push({ mode: mode, record: record, category: state.filters.category }); } return; }
      const chip = e.target.closest('[data-filter]');
      if (chip) { state.filters[chip.dataset.filter] = chip.dataset.value; query(); return; }
      const target = e.target.closest('[data-mini]'); if (!target || target.disabled) return;
      const action = target.dataset.mini;
      if (action === 'month') pick('month', '报告月份', ui.months(all()));
      if (action === 'category') pick('category', '适用品类', categories);
      if (action === 'kind') pick('kind', own ? '报告类型' : '简报类型', [['', '全部类型'], ['week', '周报'], ['month', '月报']]);
      if (action === 'latest' && opened && !opened.reference) {
        const record = all().find(function (r) { return r.id === opened.record.id; });
        if (record) { opened = { mode: opened.mode, record: record, category: opened.category }; entries.set(stack[stack.length - 1], opened); restore(); }
      }
      if (action === 'related' && opened && own && !opened.reference) push({ mode: opened.mode === 'advice' ? 'reports' : 'advice', record: opened.record });
      if (action === 'reference' && opened && own && !opened.reference) {
        const bulletin = opened.record.snapshot.bulletins[Number(target.dataset.reference)];
        if (bulletin) push({ mode: 'market', record: bulletin, reference: true });
      }
    }
    back.onclick = function () { remember(); window.history.back(); };
    filterBox.addEventListener('submit', function (e) { e.preventDefault(); query(); });
    container.addEventListener('click', click); window.addEventListener('message', receive); window.addEventListener('popstate', pop);
    scrollControl = app.merchantScroll(scrollArea, {
      enabled: function () { return !opened && !ui.isSheetOpen(); }, busy: function () { return busy || loading; }, refresh: refresh, more: more,
      pull: function (height, ready) { if (!busy) { pull.style.height = height + 'px'; pull.textContent = height ? ready ? '松开刷新' : '下拉刷新' : ''; } }
    });
    app.merchantCleanup = function () {
      remember(); disposed = true; generation++; done(); cancelLoad();
      if (feedbackTimer !== null) window.clearTimeout(feedbackTimer);
      scrollControl.destroy(); chartCleanup(); ui.closeSheet();
      window.removeEventListener('message', receive); window.removeEventListener('popstate', pop); container.removeEventListener('click', click); back.onclick = null; app.merchantCleanup = null;
    };
    redrawFilters(); restore(); refresh();
  }
  function clearSession() {
    if (app.merchantCleanup) app.merchantCleanup();
    [states, feeds, stores].forEach(function (cache) { Object.keys(cache).forEach(function (key) { delete cache[key]; }); });
    entries.clear(); // Keep keys monotonic so pre-login browser history cannot resolve to a new detail.
    ui.closeSheet();
  }
  app.merchantPage = { mount: mount, match: match, clearSession: clearSession };
}());
