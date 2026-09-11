(function () {
  'use strict';
  const app = window.FrozenApp;
  const actorName = function (fallback) { return app.actor ? app.actor(fallback) : fallback; };
  // 与采价模块使用同一分析品类目录，不维护第二份名称与 ID。
  const categories = app.priceData.categories;
  const period = { start: '2026-08-31', end: '2026-09-06' };
  const seeds = [
    ['鸡爪', 'poultry', '国产', 48, 22, 18], ['鸡胗', 'poultry', '国产', 32, 16, 14],
    ['冻鸡心', 'poultry', '进口', 40, 18, 20], ['鸡杂拼盘', '', '国产', 20, 12, 8],
    ['冻带鱼段', 'seafood', '国产', 60, 30, 26], ['巴沙鱼柳', 'seafood', '进口', 45, 20, 24],
    ['南美白虾仁', 'seafood', '进口', 55, 28, 22], ['冻鱿鱼筒', '', '进口', 25, 14, 10],
    ['猪肚', 'pork', '国产', 52, 24, 20], ['猪肝', 'pork', '国产', 36, 16, 18],
    ['冻猪心', 'pork', '进口', 44, 20, 16], ['猪杂拼盘', '', '国产', 22, 10, 8]
  ];
  [
    ['鸡胸肉', 'chicken', '国产'], ['琵琶腿', 'chicken', '国产'], ['冻鸡翅根', 'chicken', '进口'],
    ['半片鸭', 'duck', '国产'], ['鸭腿', 'duck', '国产'], ['冻鸭胸', 'duck', '进口'],
    ['鸭掌', 'duck-offal', '国产'], ['鸭胗', 'duck-offal', '国产'], ['冻鸭心', 'duck-offal', '进口'],
    ['猪前腿肉', 'pork-meat', '国产'], ['五花肉', 'pork-meat', '国产'], ['冻猪六分体', 'pork-meat', '进口'],
    ['牛腩', 'beef', '进口'], ['牛腱', 'beef', '国产'], ['冻牛肋条', 'beef', '进口'],
    ['牛肚', 'beef-offal', '国产'], ['牛百叶', 'beef-offal', '国产'], ['冻牛心', 'beef-offal', '进口'],
    ['羊腿', 'lamb', '进口'], ['羊排', 'lamb', '国产'], ['冻羊肉卷', 'lamb', '进口'],
    ['羊肚', 'lamb-offal', '国产'], ['羊肝', 'lamb-offal', '国产'], ['冻羊心', 'lamb-offal', '进口'],
    ['速冻鸡排', 'prepared', '国产'], ['牛肉丸', 'prepared', '国产'], ['调理鸡柳', 'prepared', '国产']
  ].forEach(function (seed, index) {
    const group = Math.floor(index / 3), item = index % 3;
    const opening = [42, 38, 28, 64, 46, 35, 40, 26, 58][group];
    const inbound = [25, 20, 16, 30, 18, 19, 22, 14, 36][group];
    const scale = [1, 0.7, 0.5][item], op = Math.round(opening * scale), inc = Math.round(inbound * scale);
    seeds.push(seed.concat([op, inc, inc + (group % 3 - 1) * 2]));
  });
  function createStore(priceStore) {
    const records = seeds.map(function (seed, index) {
      return {
        id: 'raw-' + String(index + 1).padStart(3, '0'), name: seed[0], categoryId: seed[1], origin: seed[2],
        businessCategoryId: seed[1] || ['poultry', 'seafood', 'pork'][Math.floor(index / 4)],
        opening: seed[3], inbound: seed[4], outbound: seed[5], closing: seed[3] + seed[4] - seed[5],
        note: seed[1] ? '按商品名称、规格属性及净重口径归并' : '', version: 1, history: [],
        editor: seed[1] ? '沈佳宁' : '', updatedAt: seed[1] ? '2026-09-07 09:30:00' : ''
      };
    });
    function find(id) { return records.find(function (record) { return record.id === id; }); }
    function query(filters) {
      const keyword = String(filters.keyword || '').trim().toLocaleLowerCase('zh-CN');
      return records.filter(function (record) {
        const mapped = Boolean(record.categoryId);
        return (!filters.category || record.categoryId === filters.category) &&
          (!filters.status || (filters.status === 'mapped' ? mapped : !mapped)) &&
          (!keyword || (record.name + ' ' + record.id).toLocaleLowerCase('zh-CN').includes(keyword));
      });
    }
    function save(id, input, expectedVersion) {
      const record = find(id);
      const errors = {};
      const categoryId = String(input.categoryId || '').trim();
      const note = String(input.note || '').trim();
      if (!record) errors.categoryId = '原始品类不存在，请重新打开列表。';
      else if (record.version !== expectedVersion) errors.categoryId = '该映射已被修改，请关闭后重新打开。';
      if (!categories.some(function (category) { return category.id === categoryId; })) errors.categoryId = '请选择有效的分析品类。';
      if (note.length > 200) errors.note = '映射说明不能超过 200 字。';
      if (Object.keys(errors).length) return { valid: false, errors: errors };
      if (record.categoryId === categoryId && record.note === note) return { valid: true, unchanged: true, record: record };
      const before = { categoryId: record.categoryId, note: record.note, version: record.version };
      record.categoryId = categoryId;
      record.note = note;
      record.version++;
      record.editor = actorName('沈佳宁');
      record.updatedAt = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' });
      record.history.push({ action: before.categoryId ? '调整映射' : '建立映射', actor: record.editor, at: record.updatedAt,
        before: before, after: { categoryId: categoryId, note: note, version: record.version } });
      return { valid: true, record: record };
    }
    function related(id) {
      const record = find(id);
      if (!record) return null;
      const category = categories.find(function (item) { return item.id === record.categoryId; }) || null;
      // 未映射项只查看自身来源信息，不将多个未映射名称误归成一个品类。
      const members = category ? records.filter(function (item) { return item.categoryId === category.id; }) : [record];
      const totals = members.reduce(function (sum, item) {
        sum.inbound += item.inbound; sum.outbound += item.outbound; sum.closing += item.closing;
        return sum;
      }, { inbound: 0, outbound: 0, closing: 0 });
      const prices = category ? priceStore.records.filter(function (item) { return item.category.id === category.id; })
        .sort(function (a, b) { return b.week.id.localeCompare(a.week.id); }) : [];
      return { record: record, category: category, members: members, totals: totals, prices: prices, period: period };
    }
    return { records: records, find: find, query: query, save: save, related: related };
  }
  app.categoryData = { categories: categories, period: period, createStore: createStore };
  app.categoryStore = createStore(app.priceStore);
}());
