(function () {
  'use strict';
  const app = window.FrozenApp = window.FrozenApp || {};
  const icons = {
    building: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h1m4 0h1M9 11h1m4 0h1M10 21v-6h4v6M3 21h18"/>',
    organization: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/>',
    department: '<path d="M4 21V7h10v14M14 11h6v10M2 21h20M8 11h2M8 15h2M8 19h2M17 15h1M17 18h1"/>',
    warehouse: '<path d="m3 9 9-6 9 6v12H3zM7 21V11h10v10M7 15h10M7 18h10"/>',
    login: '<path d="M15 4h5v16h-5M3 12h12m-4-4 4 4-4 4"/>',
    phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
    logout: '<path d="M9 4H4v16h5M10 12h11m-4-4 4 4-4 4"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14z"/>',
    upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',
    download: '<path d="M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    reset: '<path d="M3 10a9 9 0 1 1 2 8M3 3v7h7"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/>',
    previous: '<path d="m14 6-6 6 6 6"/>',
    next: '<path d="m10 6 6 6-6 6"/>',
    price: '<path d="M4 4h9l7 7-9 9-7-7z"/><circle cx="8" cy="8" r="1"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    source: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h4"/>',
    chart: '<path d="M4 3v17h17M8 15l4-5 4 2 5-7"/>',
    report: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5"/>',
    history: '<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2"/>',
    bulb: '<path d="M9 18h6M10 21h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2z"/>',
    home: '<path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7"/>'
  };
  app.escape = function (value) {
    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(value).replace(/[&<>"']/g, function (char) { return entities[char]; });
  };
  app.actor = function (fallback) { return app.systemStore ? app.systemStore.current().name : fallback; };
  app.treePath = function (nodes, value) {
    function find(items, parents) {
      for (const item of items) {
        const path = parents.concat(item.name);
        if (!item.children && item.name === value) return path.join(' / ');
        if (item.children) { const match = find(item.children, path); if (match) return match; }
      }
      return '';
    }
    return value ? find(nodes, []) || value : '';
  };
  app.icon = function (name) {
    return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (icons[name] || icons.grid) + '</svg>';
  };
}());
