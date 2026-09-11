(function () {
  'use strict';
  const app = window.FrozenApp, esc = app.presentation ? app.presentation.escape : app.escape;
  const registry = {}, pending = {};
  app.merchantDemo = {
    register: function (key, data) { registry[key] = data; },
    load: function (key) {
      if (!['public', 'demo-a', 'demo-b', 'demo-c'].includes(key)) return Promise.reject(new Error('未知商户'));
      if (registry[key]) return Promise.resolve(registry[key]);
      if (!pending[key]) pending[key] = new Promise(function (resolve, reject) {
        const script = document.createElement('script');
        script.src = '../assets/js/demo/' + key + '.js';
        script.onload = function () { if (registry[key]) resolve(registry[key]); else { delete pending[key]; reject(new Error('数据不完整')); } script.remove(); };
        script.onerror = function () { delete pending[key]; script.remove(); reject(new Error('内容加载失败，请重试')); };
        document.head.appendChild(script);
      });
      return pending[key];
    }
  };
  function button(action, icon, text, extra) { return '<button type="button" class="button mini-button" data-mini="' + esc(action) + '"' + (extra || '') + '>' + app.icon(icon) + '<span>' + esc(text) + '</span></button>'; }
  function empty(title, text, busy) { return '<section class="mini-empty" role="status">' + app.icon(busy ? 'history' : 'source') + '<h2>' + esc(title) + '</h2><p>' + esc(text) + '</p></section>'; }
  function chips(name, options, value) { return '<div class="mini-chips" role="group" aria-label="' + esc(name) + '">' + options.map(function (o) { return '<button type="button" data-filter="' + esc(name) + '" data-value="' + esc(o[0]) + '" aria-pressed="' + (value === o[0]) + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>'; }
  let activeSheet = null, activeDispose = null;
  function closeSheet() { if (activeSheet) { activeSheet.close(); if (activeDispose) activeDispose(); } }
  function sheet(title, html, setup, full) {
    closeSheet();
    const trigger = document.activeElement, dialog = document.createElement('dialog');
    dialog.className = 'mini-sheet' + (full ? ' mini-sheet--full' : '');
    dialog.setAttribute('aria-label', title);
    dialog.innerHTML = '<header><h2>' + esc(title) + '</h2>' + button('close-sheet', 'close', '关闭') + '</header><div class="mini-sheet-body">' + html + '</div>';
    const frame = document.querySelector('.merchant-layout'), scrollArea = frame.querySelector('.merchant-content');
    frame.appendChild(dialog);
    activeSheet = dialog;
    const previousOverflow = scrollArea.style.overflow;
    scrollArea.style.overflow = 'hidden';
    let disposed = false;
    function position() {
      const rect = frame.getBoundingClientRect();
      dialog.style.position = 'fixed'; dialog.style.margin = '0';
      dialog.style.top = 'auto'; dialog.style.right = 'auto';
      dialog.style.left = (rect.left + frame.clientLeft) + 'px';
      dialog.style.bottom = Math.max(0, window.innerHeight - rect.bottom + frame.clientTop) + 'px';
      dialog.style.width = frame.clientWidth + 'px';
      dialog.style.maxHeight = Math.floor(frame.clientHeight * 0.94) + 'px';
      if (full) dialog.style.height = dialog.style.maxHeight;
    }
    function dispose() {
      if (disposed) return; disposed = true;
      scrollArea.style.overflow = previousOverflow;
      window.removeEventListener('resize', position);
      if (activeSheet === dialog) { activeSheet = null; activeDispose = null; }
      dialog.remove(); if (trigger && trigger.isConnected) trigger.focus({ preventScroll: true });
    }
    activeDispose = dispose;
    dialog.addEventListener('close', dispose);
    window.addEventListener('resize', position);
    dialog.addEventListener('click', function (e) {
      if (e.target.closest('[data-mini="close-sheet"]')) dialog.close();
      if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); }
    });
    position();
    dialog.showModal();
    if (setup) setup(dialog);
    return dialog;
  }
  function picker(title, options, selected, choose) {
    const searchable = options.length > 10;
    sheet(title, (searchable ? '<label class="mini-search-label">搜索' + esc(title) + '<input type="search" class="form-control" data-option-search placeholder="输入关键词" autocomplete="off"></label>' : '') + '<div class="mini-options"></div>', function (dialog) {
      const list = dialog.querySelector('.mini-options');
      function draw(text) {
        const rows = options.filter(function (o) { return (o[1] + ' ' + (o[2] || '')).toLowerCase().includes(text.trim().toLowerCase()); });
        list.innerHTML = rows.length ? rows.map(function (o, index) { return (o[2] && (!index || rows[index - 1][2] !== o[2]) ? '<h3 class="mini-option-group">' + esc(o[2]) + '</h3>' : '') + '<button type="button" class="mini-option" data-option="' + esc(o[0]) + '" aria-pressed="' + (selected === o[0]) + '"><span>' + esc(o[1]) + '</span>' + (selected === o[0] ? app.icon('check') : '') + '</button>'; }).join('') : '<p class="mini-empty">没有匹配选项</p>';
      }
      draw('');
      if (searchable) dialog.querySelector('input').addEventListener('input', function (e) { draw(e.target.value); });
      list.addEventListener('click', function (e) { const item = e.target.closest('[data-option]'); if (item) { const value = item.dataset.option; dialog.close(); choose(value); } });
    });
  }
  function months(rows) {
    const values = new Set();
    rows.forEach(function (r) {
      let month = r.start.slice(0, 7); const last = r.end.slice(0, 7);
      while (month <= last) { values.add(month); const d = new Date(month + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); month = d.toISOString().slice(0, 7); }
    });
    return [['', '全部月份']].concat(Array.from(values).sort().reverse().map(function (m) { return [m, m.slice(0, 4) + '年' + Number(m.slice(5)) + '月']; }));
  }
  function skeleton() { return '<div class="mini-skeleton" role="status" aria-label="正在加载内容">' + [1, 2, 3].map(function () { return '<div><i></i><i></i><i></i></div>'; }).join('') + '<span class="sr-only">正在加载内容</span></div>'; }
  app.merchantUI = { skeleton: skeleton, isSheetOpen: function () { return Boolean(activeSheet); }, button: button, empty: empty, chips: chips, sheet: sheet, picker: picker, closeSheet: closeSheet, months: months };
}());
